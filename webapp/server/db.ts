import { env } from "./env";

export interface Db {
  /** Parameterized query returning rows. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

let db: Db | null = null;
let migrated = false;

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

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL DEFAULT '',
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
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
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
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
);
-- For databases created before payload existed. ALTERs FOLLOW their CREATE (P46).
ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS payload text;
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  storage_key text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/pdf',
  size_bytes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_events (
  event_id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ra_cancellation_requested_at timestamptz;
-- A webhook event is only "handled" once its work SUCCEEDED. Recording the id
-- up front and treating every later delivery as a duplicate meant a transient
-- failure permanently swallowed a paid order (audited 26 Aug 2026).
ALTER TABLE webhook_events ADD COLUMN IF NOT EXISTS processed_at timestamptz;
UPDATE webhook_events SET processed_at = received_at WHERE processed_at IS NULL;
-- Email changes are verified before they take effect: the requested address
-- parks here until the client clicks the link sent to it.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pending_email text;
-- High-water mark for operating agreement numbering. A number printed on a PDF
-- is never reused, even if the client deletes that agreement afterwards.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS oa_generation_seq integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS oa_profiles (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Autosave ordering: every keystroke fires its own request, so responses can
  -- land out of order. The client stamps a monotonic revision and the server
  -- refuses to move backwards (audited 26 Aug 2026).
  rev integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- For databases created before rev existed. An ALTER must always FOLLOW its
-- table's CREATE: this one sat above it until 28 Aug 2026, so no fresh
-- database could initialize at all (P46, found by the third Codex audit).
ALTER TABLE oa_profiles ADD COLUMN IF NOT EXISTS rev integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS oa_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id),
  template_version text NOT NULL,
  amended_restated boolean NOT NULL DEFAULT false,
  inputs jsonb NOT NULL,
  generation_number integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE oa_generations ADD COLUMN IF NOT EXISTS generation_number integer;
-- Backfill agreements generated before the number was stored. Idempotent: it
-- only touches NULL rows, and starts above any number already assigned.
UPDATE oa_generations g
   SET generation_number = r.n + COALESCE(
         (SELECT MAX(x.generation_number) FROM oa_generations x WHERE x.client_id = g.client_id), 0)
  FROM (SELECT id, row_number() OVER (PARTITION BY client_id ORDER BY created_at) AS n
          FROM oa_generations WHERE generation_number IS NULL) r
 WHERE g.id = r.id AND g.generation_number IS NULL;
UPDATE clients c SET oa_generation_seq = sub.n
  FROM (SELECT client_id, MAX(generation_number) AS n FROM oa_generations GROUP BY client_id) sub
 WHERE c.id = sub.client_id AND c.oa_generation_seq < sub.n;
CREATE TABLE IF NOT EXISTS library_documents (
  key text PRIMARY KEY,
  title text NOT NULL,
  edition text NOT NULL DEFAULT '',
  storage_key text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/pdf',
  size_bytes int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
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
);

-- Formation pipeline. status runs pending_payment -> paid -> filed -> formed:
-- "paid" is a new order, "filed" is sent to the Division, "formed" is set by the
-- upload that puts the Articles and the Protected Series Designations into the
-- client's portal. formed is never a button on its own — the endpoint that sets
-- it is the same one that writes the documents, in one transaction, so the board
-- cannot say an order is complete while the client's portal is empty.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS filed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS formed_at timestamptz;
-- Which fields have been copied into the state's form, so an interrupted filing
-- resumes where it left off — on any machine, which is why this is here and not
-- in the browser.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS copied_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
-- One Protected Series Designation document may cover several series, so the
-- coverage is recorded per document rather than assumed one-to-one.
ALTER TABLE documents ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES orders(id);

-- Mirror of the Division of Corporations' public data downloads, kept to the
-- columns the name-availability check needs. norm_key is the name reduced by
-- Florida's distinguishability rules (nameSimilarity.normalizeEntityName);
-- two names conflict when their keys match. Loaded from the quarterly
-- baseline, topped up nightly from the daily files (server/sunbiz.ts).
ALTER TABLE library_documents ADD COLUMN IF NOT EXISTS meta jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS mirrored_at timestamptz;

CREATE TABLE IF NOT EXISTS fl_entities (
  doc_number text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL,
  filing_type text NOT NULL DEFAULT '',
  file_date date,
  last_txn_date date,
  norm_key text NOT NULL
);
CREATE INDEX IF NOT EXISTS fl_entities_norm_key_idx ON fl_entities (norm_key);
CREATE TABLE IF NOT EXISTS fl_sync_state (
  id int PRIMARY KEY,
  baseline_label text,
  last_daily date,
  updated_at timestamptz
);
`;

export async function getDb(): Promise<Db> {
  if (!db) db = await createDb();
  if (!migrated) {
    for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
      await db.query(stmt);
    }
    migrated = true;
  }
  return db;
}
