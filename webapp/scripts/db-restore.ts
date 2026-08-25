/**
 * Restore a nightly backup dump into a Postgres database.
 *
 *   bun run scripts/db-restore.ts <dump.json.gz> --dry-run
 *   DATABASE_URL=postgres://... bun run scripts/db-restore.ts <dump.json.gz>
 *
 * The dump is the gzipped JSON written by server/backup.ts (downloaded from
 * the admin panel's Backups card). Tables are restored in dependency order;
 * the target database must already have the schema (start the server once
 * against the empty database — migrations create it). Refuses to write into
 * a database that already has clients unless --force is passed: a restore
 * over live data is a decision, not a default.
 *
 * --dry-run parses the dump and prints per-table row counts without touching
 * any database. Full walkthrough: docs/db-restore.md.
 */
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");
if (!file) {
  console.error("Usage: bun run scripts/db-restore.ts <dump.json.gz> [--dry-run] [--force]");
  process.exit(1);
}

const dump = JSON.parse(gunzipSync(readFileSync(file)).toString()) as {
  version: number;
  dumpedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
};
if (dump.version !== 1) {
  console.error(`Unknown dump version ${dump.version}`);
  process.exit(1);
}

// Parents before children (foreign keys).
const ORDER = [
  "clients",
  "orders",
  "service_orders",
  "documents",
  "oa_profiles",
  "oa_generations",
  "library_documents",
  "webhook_events",
  "fl_sync_state",
];
const tableNames = ORDER.filter((t) => t in dump.tables);

console.log(`Dump of ${dump.dumpedAt} (version ${dump.version})`);
for (const t of tableNames) console.log(`  ${t}: ${dump.tables[t].length} rows`);

if (dryRun) {
  console.log("--dry-run: nothing written.");
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to the RESTORE TARGET (a fresh Neon database).");
  process.exit(1);
}

const { neon } = await import("@neondatabase/serverless");
const sql = neon(url);

const existing = (await sql.query("SELECT count(*) AS c FROM clients", [])) as { c: string }[];
if (Number(existing[0].c) > 0 && !force) {
  console.error(
    `Target already has ${existing[0].c} clients. Restoring over live data needs --force.`,
  );
  process.exit(1);
}

for (const t of tableNames) {
  const rows = dump.tables[t];
  for (const row of rows) {
    const cols = Object.keys(row);
    const params = cols.map((_, i) => `$${i + 1}`).join(", ");
    const values = cols.map((k) => {
      const v = row[k];
      return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
    });
    await sql.query(
      `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${params}) ON CONFLICT DO NOTHING`,
      values,
    );
  }
  console.log(`restored ${t}: ${rows.length} rows`);
}
console.log("Done. Point the app's DATABASE_URL at this database.");
