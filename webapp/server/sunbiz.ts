/**
 * Florida Division of Corporations data pipeline.
 *
 * Source of record: "Corporate File Definitions"
 * (https://dos.sunbiz.org/data-definitions/cor.html, read 22 Aug 2026):
 *   "Record Length: 1440 characters."
 *   Field 1  "Corporation Number ... Start 1,   Length 12"
 *   Field 2  "Corporation Name ...   Start 13,  Length 192"
 *   Field 3  "Status ...             Start 205, Length 1  — 'A' (active), 'I' (inactive)"
 *   Field 4  "Filing Type ...        Start 206, Length 15 — e.g. 'FLAL' - Florida Limited Liability Co."
 *   Field 17 "File Date ...          Start 473, Length 8"
 *   Field 20 "Last Transaction Date  Start 496, Length 8"
 * Dates are MMDDYYYY (verified against three daily files). The guide's
 * troubleshooting note says to "validate that each row is the expected
 * length"; real files arrive with the trailing 4-character filler trimmed
 * (1,436 chars), so rows are right-padded to 1440 before slicing.
 *
 * Files (https://dos.fl.gov/sunbiz/other-services/data-downloads/, read
 * 22 Aug 2026): "Daily files are generated on work days and contain the
 * filings added to our record that day. Quarterly files are generated
 * quarterly in January, April, July, and October and contain all active
 * data at the time the file is generated." SFTP host sftp.floridados.gov,
 * user Public — credentials published on that page. Dailies live in
 * doc/cor/YYYYMMDDc.txt; the quarterly baseline is doc/Quarterly/Cor/cordata.zip.
 *
 * Because dailies carry new filings only (verified: three dailies, 100%
 * status 'A'), a dissolution reaches us only with the next quarterly
 * baseline. That staleness errs in the safe direction: we may call a
 * recently freed name taken, never a taken name clear.
 */
import { getDb } from "./db";
import { normalizeEntityName } from "../src/components/forms/florida-llc/nameSimilarity";

export interface FlEntity {
  docNumber: string;
  name: string;
  status: "A" | "I";
  filingType: string;
  fileDate: string | null; // ISO yyyy-mm-dd
  lastTxnDate: string | null;
  normKey: string;
}

function mmddyyyyToIso(s: string): string | null {
  const t = s.trim();
  if (!/^\d{8}$/.test(t)) return null;
  const mm = t.slice(0, 2), dd = t.slice(2, 4), yyyy = t.slice(4);
  if (mm === "00" || dd === "00" || yyyy === "0000") return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Parse one fixed-width record. Returns null for rows that are not usable
 *  (wrong shape, blank name, or a name that normalizes to nothing). */
export function parseCorRecord(line: string): FlEntity | null {
  const l = line.replace(/[\r\n]+$/, "");
  if (!l.trim()) return null;
  // The guide says 1440; files arrive with trailing filler trimmed. A row far
  // off the expected length is one of the guide's warned-about broken rows.
  if (l.length < 500 || l.length > 1440) return null;
  const r = l.padEnd(1440);
  const status = r[204];
  if (status !== "A" && status !== "I") return null;
  const name = r.slice(12, 204).trim();
  if (!name) return null;
  const docNumber = r.slice(0, 12).trim();
  if (!docNumber) return null;
  return {
    docNumber,
    name,
    status,
    filingType: r.slice(205, 220).trim(),
    fileDate: mmddyyyyToIso(r.slice(472, 480)),
    lastTxnDate: mmddyyyyToIso(r.slice(495, 503)),
    normKey: normalizeEntityName(name),
  };
}

export function parseCorFile(text: string): { entities: FlEntity[]; skipped: number } {
  const entities: FlEntity[] = [];
  let skipped = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const e = parseCorRecord(line);
    if (e) entities.push(e);
    else skipped++;
  }
  return { entities, skipped };
}

function sqlLit(s: string | null): string {
  return s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`;
}

/** Upsert a batch. Values are inlined (data is uppercase ASCII from the state;
 *  quotes escaped) so a 5,000-row batch is one round trip to Neon. */
export async function upsertEntities(entities: FlEntity[], batchSize = 5000): Promise<number> {
  const db = await getDb();
  // The guide: "Some files may contain multiple rows for the same document
  // number." ON CONFLICT DO UPDATE rejects a duplicate inside one statement,
  // so keep only the last occurrence of each doc number per call.
  const byDoc = new Map<string, FlEntity>();
  for (const e of entities) byDoc.set(e.docNumber, e);
  const deduped = Array.from(byDoc.values());
  let written = 0;
  for (let i = 0; i < deduped.length; i += batchSize) {
    const batch = deduped.slice(i, i + batchSize);
    const values = batch
      .map(
        (e) =>
          `(${sqlLit(e.docNumber)},${sqlLit(e.name)},${sqlLit(e.status)},${sqlLit(e.filingType)},${sqlLit(e.fileDate)},${sqlLit(e.lastTxnDate)},${sqlLit(e.normKey)})`,
      )
      .join(",");
    await db.query(
      `INSERT INTO fl_entities (doc_number, name, status, filing_type, file_date, last_txn_date, norm_key)
       VALUES ${values}
       ON CONFLICT (doc_number) DO UPDATE SET
         name = EXCLUDED.name, status = EXCLUDED.status, filing_type = EXCLUDED.filing_type,
         file_date = EXCLUDED.file_date, last_txn_date = EXCLUDED.last_txn_date, norm_key = EXCLUDED.norm_key`,
    );
    written += batch.length;
  }
  return written;
}

export interface SyncState {
  baselineLabel: string | null;
  lastDaily: string | null; // ISO date of the newest ingested daily file
  updatedAt: string | null;
}

export async function getSyncState(): Promise<SyncState> {
  const db = await getDb();
  const rows = await db.query<{ baseline_label: string | null; last_daily: string | null; updated_at: string | null }>(
    "SELECT baseline_label, last_daily::text, updated_at::text FROM fl_sync_state WHERE id = 1",
  );
  const r = rows[0];
  return {
    baselineLabel: r?.baseline_label ?? null,
    lastDaily: r?.last_daily ?? null,
    updatedAt: r?.updated_at ?? null,
  };
}

export async function setSyncState(patch: { baselineLabel?: string; lastDaily?: string }): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO fl_sync_state (id, baseline_label, last_daily, updated_at)
     VALUES (1, $1, $2, now())
     ON CONFLICT (id) DO UPDATE SET
       baseline_label = COALESCE($1, fl_sync_state.baseline_label),
       last_daily = COALESCE($2::date, fl_sync_state.last_daily),
       updated_at = now()`,
    [patch.baselineLabel ?? null, patch.lastDaily ?? null],
  );
}

/* ------------------------------- name check ------------------------------- */

/** s. 605.0715(5)-(6), Fla. Stat.: after administrative dissolution the
 *  dissolved company's name is unavailable to others until one year has
 *  passed (120 days after a voluntary dissolution). The data file does not
 *  say which kind a dissolution was, so the longer window is applied to
 *  every inactive record — erring toward warning the client. */
const HOLD_DAYS = 366;

export interface NameConflict {
  name: string;
  docNumber: string;
  status: "Active" | "Inactive";
  reason: string;
  detailUrl: string;
}

export interface NameVerdict {
  input: string;
  verdict: "taken" | "held" | "clear";
  conflicts: NameConflict[];
}

function conflictReason(input: string, existing: string): string {
  const a = input.trim().toUpperCase().replace(/\s+/g, " ");
  const b = existing.trim().toUpperCase().replace(/\s+/g, " ");
  if (a === b) return "Identical name";
  return "Not distinguishable under Florida's rules — a different ending (Inc., LLC), \"the\", \"&\" vs \"and\", plurals, or punctuation do not make a name different";
}

function detailUrl(existing: string): string {
  return (
    "https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?InquiryType=EntityName&SearchTerm=" +
    encodeURIComponent(existing)
  );
}

export async function checkName(input: string): Promise<NameVerdict> {
  const key = normalizeEntityName(input);
  if (!key) return { input, verdict: "clear", conflicts: [] };
  const db = await getDb();
  const rows = await db.query<{
    doc_number: string;
    name: string;
    status: string;
    last_txn_date: string | null;
    file_date: string | null;
  }>(
    `SELECT doc_number, name, status, last_txn_date::text, file_date::text
     FROM fl_entities WHERE norm_key = $1
     ORDER BY (status = 'A') DESC, last_txn_date DESC NULLS LAST
     LIMIT 25`,
    [key],
  );
  const now = Date.now();
  const conflicts: NameConflict[] = [];
  let verdict: NameVerdict["verdict"] = "clear";
  for (const r of rows) {
    const active = r.status === "A";
    const refDate = r.last_txn_date ?? r.file_date;
    const withinHold =
      !active && refDate !== null && now - new Date(refDate).getTime() < HOLD_DAYS * 86_400_000;
    if (active || withinHold) {
      conflicts.push({
        name: r.name,
        docNumber: r.doc_number,
        status: active ? "Active" : "Inactive",
        reason: active
          ? conflictReason(input, r.name)
          : `${conflictReason(input, r.name)}; recently dissolved — the name may still be protected (s. 605.0715, Fla. Stat.)`,
        detailUrl: detailUrl(r.name),
      });
      if (active) verdict = "taken";
      else if (verdict === "clear") verdict = "held";
    }
  }
  return { input, verdict, conflicts };
}

/* ------------------------------- nightly sync ------------------------------ */

/** SFTP endpoint and credentials as published on the Division's Data
 *  Downloads page (intentionally public). */
const SFTP_HOST = "sftp.floridados.gov";
const SFTP_USER = "Public";
const SFTP_PASSWORD = "PubAccess1845!";
const DAILY_DIR = "/Public/doc/cor";

export interface SyncReport {
  filesIngested: string[];
  written: number;
  skipped: number;
  lastDaily: string | null;
}

/** Fetch and ingest every daily file newer than the last one we took.
 *  Bounded per run so a long gap cannot blow the serverless time limit —
 *  the next night's run continues where this one stopped. */
export async function syncDailies(maxFiles = 15): Promise<SyncReport> {
  const state = await getSyncState();
  // No baseline, nothing to top up: without it the mirror answers nothing
  // (the /name-check staleness gate), and starting from 1970 would crawl
  // years of dailies to no purpose.
  if (!state.baselineLabel) {
    return { filesIngested: [], written: 0, skipped: 0, lastDaily: state.lastDaily };
  }
  const lastCompact = (state.lastDaily ?? "1970-01-01").replace(/-/g, "");
  const { default: SftpClient } = await import("ssh2-sftp-client");
  const sftp = new SftpClient();
  await sftp.connect({ host: SFTP_HOST, username: SFTP_USER, password: SFTP_PASSWORD });
  try {
    const listing = await sftp.list(DAILY_DIR);
    const targets = listing
      .map((f) => f.name)
      .filter((n) => /^\d{8}c\.txt$/.test(n) && n.slice(0, 8) > lastCompact)
      .sort()
      .slice(0, maxFiles);
    const report: SyncReport = { filesIngested: [], written: 0, skipped: 0, lastDaily: state.lastDaily };
    for (const name of targets) {
      const buf = (await sftp.get(`${DAILY_DIR}/${name}`)) as Buffer;
      const { entities, skipped } = parseCorFile(buf.toString("latin1"));
      report.written += await upsertEntities(entities);
      report.skipped += skipped;
      const iso = `${name.slice(0, 4)}-${name.slice(4, 6)}-${name.slice(6, 8)}`;
      await setSyncState({ lastDaily: iso });
      report.filesIngested.push(name);
      report.lastDaily = iso;
    }
    return report;
  } finally {
    await sftp.end();
  }
}
