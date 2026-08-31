import { createHash } from "node:crypto";
import { env } from "./env";

export interface Db {
  /** Parameterized query returning rows. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

/** Single-flight: twenty concurrent cold requests must share ONE
 *  initialization, not run twenty (Codex DB-INIT-001 measured the stampede
 *  at 14.5s for what one caller does in 0.7s — and migration 2 would have
 *  raced its own DDL). The PROMISE is cached, so every caller after the
 *  first awaits the same work. */
let ready: Promise<Db> | null = null;

async function createDb(): Promise<Db> {
  if (env.DATABASE_URL) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(env.DATABASE_URL);
    return {
      async query<T>(text: string, params: unknown[] = []) {
        const rows = await sql.query(text, params);
        return rows as T[];
      },
    };
  }
  if (env.isProd) {
    throw new Error("DATABASE_URL is not set — the database is required in production.");
  }
  // Local development: embedded Postgres, no account needed.
  //
  // Self-healing: --watch restarts kill the process without closing PGlite,
  // and a kill mid-write can corrupt the data directory — the next boot then
  // aborts its WASM engine on the FIRST query and every request 500s until
  // someone deletes .dev-data/pg by hand (which happened three times on
  // 24-25 Aug 2026). Dev data is disposable by definition, so on a failed
  // first query the directory is recreated fresh instead.
  const { PGlite } = await import("@electric-sql/pglite");
  const { fileURLToPath } = await import("node:url");
  const { mkdirSync, rmSync } = await import("node:fs");
  // DEV_PG_DIR override exists for one consumer: the e2e fresh-database boot
  // check, which must point a server at a directory no schema has ever
  // touched (P46 — the init script only ever ran against databases that
  // already had every table, so a broken fresh init was invisible).
  const dir = process.env.DEV_PG_DIR || fileURLToPath(new URL("../.dev-data/pg", import.meta.url));
  const open = async () => {
    mkdirSync(dir, { recursive: true });
    const inst = new PGlite(dir);
    await inst.query("SELECT 1");
    return inst;
  };
  let pg: InstanceType<typeof PGlite>;
  try {
    pg = await open();
  } catch (e) {
    console.error(`[db] local PGlite data was unreadable (${(e as Error).message}) — recreating .dev-data/pg fresh; dev data is disposable`);
    rmSync(dir, { recursive: true, force: true });
    pg = await open();
  }
  return {
    async query<T>(text: string, params: unknown[] = []) {
      const res = await pg.query<T>(text, params);
      return res.rows;
    },
  };
}

/**
 * Ordered, recorded migrations — the title-chain model.
 *
 * Each migration is an explicit ARRAY of complete SQL statements. There is no
 * splitter and no comment-stripper: every statement is handed to the database
 * whole, so quoted semicolons, quoted comment markers, dollar-quoted bodies,
 * and anything else SQL allows are simply fine (the tenth audit found the
 * previous string-splitting approach would truncate a statement containing
 * a quoted "--" — MIG-010; the fix is to have nothing to parse).
 *
 * Each migration runs once per database, in id order, and is recorded in
 * schema_migrations when it completes. Rules for adding one:
 *  - NEVER edit an existing entry — append a new one with the next id.
 *  - Keep statements idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS):
 *    the Neon HTTP driver cannot wrap a migration in a transaction, so a
 *    failure mid-migration leaves it unrecorded and it will re-run whole.
 *  - An ALTER must FOLLOW its table's CREATE (P46).
 *  - SQL comments live INSIDE the statement string they document.
 * The fresh-database boot check in the e2e suite proves every migration
 * path from an empty database on every run — and in CI, on every push.
 */
const MIGRATION_001_STATEMENTS: string[] = [
    `
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
    `
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id),
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  package text NOT NULL,
  llc_name text NOT NULL,
  payload jsonb NOT NULL,
  service_fee_cents int NOT NULL,
  state_fees_cents int NOT NULL,
  total_cents int NOT NULL,
  status text NOT NULL DEFAULT 'pending_payment',
  square_order_id text,
  square_payment_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
)`,
    `
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
)`,
    `
CREATE TABLE IF NOT EXISTS auth_tokens (
  token_hash text PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  -- What the token authorizes, bound at issue time. A verify_email token
  -- carries the exact address its link was sent to: proving control of inbox
  -- A must never confirm address B requested later (Codex AUTH-EMAIL-001).
  payload text
)`,
    `
-- For databases created before payload existed. ALTERs FOLLOW their CREATE (P46).
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS payload text`,
    `
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  storage_key text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/pdf',
  size_bytes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
    `
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
)`,
    `
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ra_cancellation_requested_at timestamptz`,
    `
-- A webhook event is only "handled" once its work SUCCEEDED. Recording the id
-- up front and treating every later delivery as a duplicate meant a transient
-- failure permanently swallowed a paid order (audited 26 Aug 2026).
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processed_at timestamptz`,
    `
UPDATE webhook_events SET processed_at = received_at WHERE processed_at IS NULL`,
    `
-- Email changes are verified before they take effect: the requested address
-- parks here until the client clicks the link sent to it.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pending_email text`,
    `
-- High-water mark for operating agreement numbering. A number printed on a PDF
-- is never reused, even if the client deletes that agreement afterwards.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS oa_generation_seq integer NOT NULL DEFAULT 0`,
    `
CREATE TABLE IF NOT EXISTS oa_profiles (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Autosave ordering: every keystroke fires its own request, so responses can
  -- land out of order. The client stamps a monotonic revision and the server
  -- refuses to move backwards (audited 26 Aug 2026).
  rev integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
)`,
    `
-- For databases created before rev existed. An ALTER must always FOLLOW its
-- table's CREATE: this one sat above it until 28 Aug 2026, so no fresh
-- database could initialize at all (P46, found by the third Codex audit).
ALTER TABLE oa_profiles ADD COLUMN IF NOT EXISTS rev integer NOT NULL DEFAULT 0`,
    `
CREATE TABLE IF NOT EXISTS oa_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id),
  template_version text NOT NULL,
  amended_restated boolean NOT NULL DEFAULT false,
  inputs jsonb NOT NULL,
  generation_number integer,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
    `
ALTER TABLE oa_generations ADD COLUMN IF NOT EXISTS generation_number integer`,
    `
-- Backfill agreements generated before the number was stored. Idempotent: it
-- only touches NULL rows, and starts above any number already assigned.
UPDATE oa_generations g
   SET generation_number = r.n + COALESCE(
         (SELECT MAX(x.generation_number) FROM oa_generations x WHERE x.client_id = g.client_id), 0)
  FROM (SELECT id, row_number() OVER (PARTITION BY client_id ORDER BY created_at) AS n
          FROM oa_generations WHERE generation_number IS NULL) r
 WHERE g.id = r.id AND g.generation_number IS NULL`,
    `
UPDATE clients c SET oa_generation_seq = sub.n
  FROM (SELECT client_id, MAX(generation_number) AS n FROM oa_generations GROUP BY client_id) sub
 WHERE c.id = sub.client_id AND c.oa_generation_seq < sub.n`,
    `
CREATE TABLE IF NOT EXISTS library_documents (
  key text PRIMARY KEY,
  title text NOT NULL,
  edition text NOT NULL DEFAULT '',
  storage_key text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/pdf',
  size_bytes int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
)`,
    `
CREATE TABLE IF NOT EXISTS service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending_payment',
  llc_name text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ein_secret text,
  amount_cents int NOT NULL,
  square_order_id text,
  square_payment_id text,
  formation_order_id uuid REFERENCES orders(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  fulfilled_at timestamptz
)`,
    `
-- Formation pipeline. status runs pending_payment -> paid -> filed -> formed:
-- "paid" is a new order, "filed" is sent to the Division, "formed" is set by the
-- upload that puts the Articles and the Protected Series Designations into the
-- client's portal. formed is never a button on its own — the endpoint that sets
-- it is the same one that writes the documents, in one transaction, so the board
-- cannot say an order is complete while the client's portal is empty.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS filed_at timestamptz`,
    `
ALTER TABLE orders ADD COLUMN IF NOT EXISTS formed_at timestamptz`,
    `
-- Which fields have been copied into the state's form, so an interrupted filing
-- resumes where it left off — on any machine, which is why this is here and not
-- in the browser.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS copied_fields jsonb NOT NULL DEFAULT '{}'::jsonb`,
    `
-- Serializes formation-package replacement per order. Two concurrent
-- replacements both succeeded and left a doubled package with doubled
-- completion emails (Codex FORM-002). The claim is one atomic UPDATE and a
-- stale claim self-releases after ten minutes so a crashed attempt cannot
-- wedge the order.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS replacing_at timestamptz`,
    `
-- One Protected Series Designation document may cover several series, so the
-- coverage is recorded per document rather than assumed one-to-one.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb`,
    `
ALTER TABLE documents ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id)`,
    `
-- Mirror of the Division of Corporations' public data downloads, kept to the
-- columns the name-availability check needs. norm_key is the name reduced by
-- Florida's distinguishability rules (nameSimilarity.normalizeEntityName);
-- two names conflict when their keys match. Loaded from the quarterly
-- baseline, topped up nightly from the daily files (server/sunbiz.ts).
ALTER TABLE library_documents ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb`,
    `
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mirrored_at timestamptz`,
    `
CREATE TABLE IF NOT EXISTS fl_entities (
  doc_number text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL,
  filing_type text NOT NULL DEFAULT '',
  file_date date,
  last_txn_date date,
  norm_key text NOT NULL
)`,
    `
CREATE INDEX IF NOT EXISTS fl_entities_norm_key_idx ON fl_entities (norm_key)`,
    `
-- Fixed-window rate limiting. In-memory counters reset on every serverless
-- recycle and are per-instance, so distributed attempts sailed past them
-- (Codex AUTH-002).
CREATE TABLE IF NOT EXISTS rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count integer NOT NULL
)`,
    `
CREATE TABLE IF NOT EXISTS fl_sync_state (
  id int PRIMARY KEY,
  baseline_label text,
  last_daily date,
  updated_at timestamptz
)`,
];

const MIGRATION_002_STATEMENTS: string[] = [
  // Messages from the public contact form. Until 30 Aug 2026 the form sent
  // nothing anywhere while telling the visitor a specialist would reply
  // (P51) — every message now lands here AND in Adam's inbox.
  `CREATE TABLE IF NOT EXISTS contact_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
];

const MIGRATION_003_STATEMENTS: string[] = [
  // Series designations are filed with the Division only AFTER the base LLC
  // is formed. This timestamp is Adam's second check-off (30 Aug 2026): the
  // base filing is marked sent, then — later — the designations marked filed.
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS series_filed_at TIMESTAMPTZ`,
];

const MIGRATION_004_STATEMENTS: string[] = [
  // One portal account can hold several companies (Adam, 31 Aug 2026), so
  // operating-agreement answers and generations key on the FORMATION, not the
  // client. Existing single-company rows are re-keyed to the client's latest
  // paid order — exactly the order the old code always used.
  `ALTER TABLE oa_profiles ADD COLUMN IF NOT EXISTS order_id UUID`,
  `UPDATE oa_profiles SET order_id = (
     SELECT o.id FROM orders o
      WHERE o.client_id = oa_profiles.client_id AND o.paid_at IS NOT NULL
      ORDER BY o.paid_at DESC NULLS LAST LIMIT 1
   ) WHERE order_id IS NULL`,
  // A profile with no paid order was unreachable through every code path.
  `DELETE FROM oa_profiles WHERE order_id IS NULL`,
  `DO $$ BEGIN
     IF EXISTS (
       SELECT 1 FROM pg_constraint c JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'oa_profiles' AND c.contype = 'p'
          AND (SELECT count(*) FROM unnest(c.conkey)) = 1
     ) THEN
       ALTER TABLE oa_profiles DROP CONSTRAINT oa_profiles_pkey;
       ALTER TABLE oa_profiles ADD PRIMARY KEY (client_id, order_id);
     END IF;
   END $$`,
  `ALTER TABLE oa_generations ADD COLUMN IF NOT EXISTS order_id UUID`,
  `UPDATE oa_generations SET order_id = (
     SELECT o.id FROM orders o
      WHERE o.client_id = oa_generations.client_id AND o.paid_at IS NOT NULL
      ORDER BY o.paid_at DESC NULLS LAST LIMIT 1
   ) WHERE order_id IS NULL`,
];

const MIGRATIONS: { id: number; name: string; statements: string[] }[] = [
  { id: 1, name: "initial-schema", statements: MIGRATION_001_STATEMENTS },
  { id: 2, name: "contact-messages", statements: MIGRATION_002_STATEMENTS },
  { id: 3, name: "series-filed-at", statements: MIGRATION_003_STATEMENTS },
  { id: 4, name: "oa-per-company", statements: MIGRATION_004_STATEMENTS },
  // Append future migrations here with the next id. Never edit an entry.
];


/** Deterministic content hash of a migration's statements. Recorded in the
 *  ledger and verified on every later boot: "never edit an applied
 *  migration" was documentation before — an edited one silently diverged
 *  fresh databases from existing ones (Codex MIG-IMM-001). Now it refuses
 *  to boot instead. */
function migrationChecksum(statements: string[]): string {
  return createHash("sha256").update(statements.join("\n;;\n")).digest("hex");
}

async function initialize(): Promise<Db> {
  const database = await createDb();
  await database.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id int PRIMARY KEY,
       name text NOT NULL,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  await database.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text");
  const recorded = new Map(
    (await database.query<{ id: number; checksum: string | null }>(
      "SELECT id, checksum FROM schema_migrations",
    )).map((r) => [Number(r.id), r.checksum] as const),
  );
  for (const m of [...MIGRATIONS].sort((a, b) => a.id - b.id)) {
    const sum = migrationChecksum(m.statements);
    if (recorded.has(m.id)) {
      const prior = recorded.get(m.id);
      if (prior && prior !== sum) {
        throw new Error(
          `migration ${m.id} (${m.name}) has been EDITED after being applied: ` +
            `recorded checksum ${prior}, current ${sum}. Applied migrations are ` +
            `immutable — add a new migration instead.`,
        );
      }
      if (!prior) {
        // A ledger row from before checksums existed: adopt the current
        // content as the recorded truth, once.
        await database.query(
          "UPDATE schema_migrations SET checksum = $2 WHERE id = $1 AND checksum IS NULL",
          [m.id, sum],
        );
      }
      continue;
    }
    for (const stmt of m.statements) {
      await database.query(stmt);
    }
    // Recorded only after every statement succeeded; a mid-migration failure
    // leaves it unrecorded and the whole migration re-runs, which idempotent
    // statements make safe.
    await database.query(
      "INSERT INTO schema_migrations (id, name, checksum) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING",
      [m.id, m.name, sum],
    );
  }
  return database;
}

export async function getDb(): Promise<Db> {
  if (!ready) {
    ready = initialize().catch((e) => {
      // A failed initialization must not be cached as success — the next
      // caller retries from scratch.
      ready = null;
      throw e;
    });
  }
  return ready;
}
