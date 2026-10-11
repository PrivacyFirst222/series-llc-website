import { PURCHASE_MIGRATION } from './purchase-migration';
import { SERIES_IDENTITY_MIGRATION } from './series-identity-migration';
import { SERIES_OWNER_MIGRATION } from './series-owner-migration';
import { SERIES_FORMAT_MIGRATION } from './series-format-migration';
import { createHash } from "node:crypto";
import { env } from "./env";
import {activeDeadline,checkDeadline,ioSignal} from './operation-deadline';

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
        checkDeadline();
        const rows = await sql.query(text, params,Number.isFinite(activeDeadline())?{fetchOptions:{signal:ioSignal()}}:undefined);
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
      checkDeadline();
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

/** Documents written without their company (S election packages and record
 *  copies, series consents, hand uploads) showed under every tab of a
 *  two-company account (Adam, 7 Sep 2026: "Why is this here"). The company
 *  is recovered from the service order that produced the document, then from
 *  a title naming exactly one of the client's companies. Idempotent. */
export const DOCUMENT_COMPANY_BACKFILL_STATEMENTS: string[] = [
  `UPDATE documents d SET order_id = so.formation_order_id
     FROM service_orders so
    WHERE d.order_id IS NULL AND d.kind = 'package'
      AND so.client_id = d.client_id AND so.formation_order_id IS NOT NULL
      AND so.details->>'documentId' = d.id::text`,
  `UPDATE documents d SET order_id = m.id
     FROM (
       SELECT d2.id AS doc_id, MIN(o.id::text)::uuid AS id, COUNT(DISTINCT o.id) AS n
         FROM documents d2
         JOIN orders o ON o.client_id = d2.client_id AND o.paid_at IS NOT NULL
        WHERE d2.order_id IS NULL AND d2.kind = 'package'
          AND o.llc_name <> '' AND position(o.llc_name IN d2.title) > 0
        GROUP BY d2.id
     ) m
    WHERE d.id = m.doc_id AND m.n = 1`,
];
const MIGRATION_005_STATEMENTS: string[] = DOCUMENT_COMPANY_BACKFILL_STATEMENTS;

// An admin's view of a client's portal (Adam, 9 Sep 2026): a client session
// started from the admin, marked so the portal can say so and offer Exit.
// (Its first version was pasted into migration 1, which changed that
// migration's checksum and stopped production's database cold — P76.)
const MIGRATION_006_STATEMENTS: string[] = [
  `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS viewing_as_admin boolean NOT NULL DEFAULT false`,
];

// The Order Summary (Adam, 10 Sep 2026): a PDF written when the order is
// placed and again when it is paid, its markdown kept for the checks, the
// price lines as priced at that moment, and the submitter's address and
// browser.
const MIGRATION_007_STATEMENTS: string[] = [
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS summary_storage_key text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS summary_markdown text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS line_items jsonb`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS submitted_ip text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS submitted_user_agent text`,
];

// The email record (Adam, 10 Sep 2026: "if they ever claim that we didn't
// send them something"): every send, from every place, with its body and
// the provider's answer.
const MIGRATION_008_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  provider_id text,
  error text
)`,
  `CREATE INDEX IF NOT EXISTS email_log_to_idx ON email_log (to_address, sent_at DESC)`,
];

// 9 (14 Sep 2026): the office's "Division rejected the filing" leaves a dated
// record, and adds storage for the registered-agent renewal date shown in the
// portal and cancellation email. Current renewals are based on the recorded agent appointment date.
const MIGRATION_009_STATEMENTS: string[] = [
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS rejected_at timestamptz`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_renewal_date date`,
];

// A cancellation of registered agent service belongs to the company it
// concerns (15 Sep 2026): a client with two companies cancels one of them.
const MIGRATION_010_STATEMENTS: string[] = [
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_cancellation_requested_at timestamptz`,
];

// 11 (16 Sep 2026): the card kept with Square for the registered agent
// renewal, and one row per renewal — the notice, the charge, its result.
const MIGRATION_011_STATEMENTS: string[] = [
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS square_customer_id text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS square_card_id text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_last4 text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_brand text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_status text`,
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS card_note text`,
  `CREATE TABLE IF NOT EXISTS ra_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  renewal_date date NOT NULL,
  amount_cents integer NOT NULL,
  status text NOT NULL,
  charge_due date,
  notice_sent_at timestamptz,
  charged_at timestamptz,
  square_payment_id text,
  square_order_id text,
  link_url text,
  decline_code text,
  retry_after date,
  retries integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, renewal_date)
)`,
  `CREATE INDEX IF NOT EXISTS ra_renewals_square_order_idx ON ra_renewals (square_order_id)`,
];

const MIGRATIONS: { id: number; name: string; statements: string[] }[] = [
  { id: 1, name: "initial-schema", statements: MIGRATION_001_STATEMENTS },
  { id: 2, name: "contact-messages", statements: MIGRATION_002_STATEMENTS },
  { id: 3, name: "series-filed-at", statements: MIGRATION_003_STATEMENTS },
  { id: 4, name: "oa-per-company", statements: MIGRATION_004_STATEMENTS },
  { id: 5, name: "documents-carry-company", statements: MIGRATION_005_STATEMENTS },
  { id: 6, name: "sessions-viewing-as-admin", statements: MIGRATION_006_STATEMENTS },
  { id: 7, name: "order-summary", statements: MIGRATION_007_STATEMENTS },
  { id: 8, name: "email-log", statements: MIGRATION_008_STATEMENTS },
  { id: 9, name: "rejection-and-ra-renewal", statements: MIGRATION_009_STATEMENTS },
  { id: 10, name: "ra-cancellation-per-company", statements: MIGRATION_010_STATEMENTS },
  { id: 11, name: "ra-renewal-cards", statements: MIGRATION_011_STATEMENTS },
  // Batch 02: Adam confirmed all existing customer records are test data and
  // approved correcting/removing unassigned mail instead of adding a permanent section.
  { id: 12, name: "legal-mail-recipient-company", statements: [
    `UPDATE documents d SET order_id = o.id, mirrored_at = NULL FROM orders o
      WHERE d.kind = 'legal_mail' AND d.order_id IS NULL AND o.client_id = d.client_id
        AND o.paid_at IS NOT NULL AND (SELECT count(*) FROM orders x WHERE x.client_id = d.client_id AND x.paid_at IS NOT NULL) = 1`,
    `DELETE FROM documents WHERE kind = 'legal_mail' AND order_id IS NULL`,
  ] },
  { id: 13, name: "document-retention-and-backup-progress", statements: [
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS mirror_path text`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS mirror_hash text`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS mirror_error text`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS mirror_attempted_at timestamptz`,
    `CREATE TABLE IF NOT EXISTS document_deletions (storage_key text PRIMARY KEY, document_id uuid, mirror_path text, requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, error text)`,
    `CREATE TABLE IF NOT EXISTS backup_progress (id text PRIMARY KEY, started_at timestamptz, completed_at timestamptz, lease_until timestamptz, cursor text, error text)`,
  ] },
  { id: 14, name: "resumable-formation-setup", statements: [
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS fulfillment_completed_at timestamptz`,
  ] },
  { id: 15, name: "agent-billing-and-checkout", statements: [
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_cancellation_note text`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS agent_billing_consent text`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_appointment_date date`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_replaced_at date`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_proof_received_at timestamptz`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_proof_note text`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_resignation_due date`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_resignation_submitted date`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_resignation_filed date`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_resignation_mailed date`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_resignation_emailed_at timestamptz`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_resignation_document uuid`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_ended_date date`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS checkout_token text`,
    `ALTER TABLE ra_renewals ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'renewal'`,
    `ALTER TABLE ra_renewals ADD COLUMN IF NOT EXISTS billing_hold boolean NOT NULL DEFAULT false`,
    `ALTER TABLE ra_renewals ADD COLUMN IF NOT EXISTS notice_error text`,
    `ALTER TABLE ra_renewals ADD COLUMN IF NOT EXISTS lock_until timestamptz`,
    `ALTER TABLE ra_renewals ADD COLUMN IF NOT EXISTS checkout_token text`,
    `CREATE TABLE IF NOT EXISTS ra_payment_attempts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_id uuid NOT NULL, kind text NOT NULL,
      automatic boolean NOT NULL DEFAULT false, source_token text NOT NULL, status text NOT NULL DEFAULT 'pending', square_payment_id text,
      failure_code text, created_at timestamptz NOT NULL DEFAULT now(), lock_until timestamptz,
      UNIQUE(target_id, id))`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ra_payment_one_active ON ra_payment_attempts(target_id) WHERE status IN ('pending','approved','completed')`,
  ]},
  { id: 16, name: "notice-recovery-and-renewal-card-updates", statements: [
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS notice_status text`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS notice_error text`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS notice_sent_at timestamptz`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS notice_recipient text`,
    `ALTER TABLE documents ADD COLUMN IF NOT EXISTS notice_lock_until timestamptz`,
    `ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS notice_status text`,
    `ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS notice_error text`,
    `ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS notice_sent_at timestamptz`,
    `ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS notice_lock_until timestamptz`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_resignation_reason text`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_resignation_note text`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_cancellation_renewal_date date`,
    `ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS questionnaire_updated_at timestamptz`,
    `CREATE TABLE IF NOT EXISTS renewal_card_attempts (id uuid PRIMARY KEY, order_id uuid NOT NULL, source_token text NOT NULL, consent text NOT NULL, status text NOT NULL DEFAULT 'pending', card jsonb, error text, lock_until timestamptz, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE UNIQUE INDEX IF NOT EXISTS renewal_card_one_active ON renewal_card_attempts(order_id) WHERE status='pending'`,
    `CREATE TABLE IF NOT EXISTS staged_documents (id uuid PRIMARY KEY, service_order_id uuid NOT NULL, storage_path text NOT NULL, storage_key text, prior_document_id uuid, state text NOT NULL DEFAULT 'staged', created_at timestamptz NOT NULL DEFAULT now(), error text)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS staged_document_one_active ON staged_documents(service_order_id) WHERE state='staged'`,
    `ALTER TABLE ra_renewals DROP CONSTRAINT IF EXISTS ra_renewals_order_id_renewal_date_key`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ra_renewal_date_purpose ON ra_renewals(order_id,renewal_date,purpose)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ra_one_resignation ON ra_renewals(order_id) WHERE purpose='resignation'`,
  ]},
  { id: 17, name: "agent-obligations-and-durable-correspondence", statements: [
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_payment_target uuid`,
    `ALTER TABLE ra_renewals ADD COLUMN IF NOT EXISTS correspondence jsonb NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE ra_renewals ADD COLUMN IF NOT EXISTS correspondence_lock_until timestamptz`,
  ]},
  { id: 18, name: "payment-reservation-fencing-and-first-notice-cutoff", statements: [
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_payment_generation uuid`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_payment_attempt_id uuid`,
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS ra_payment_protocol int NOT NULL DEFAULT 0`,
    `ALTER TABLE ra_payment_attempts ADD COLUMN IF NOT EXISTS reservation_generation uuid`,
    `ALTER TABLE ra_renewals ADD COLUMN IF NOT EXISTS notice_suppression_reason text`,
    `CREATE TABLE IF NOT EXISTS launch_policy (id text PRIMARY KEY, first_notice_cutoff timestamptz NOT NULL)`,
    `INSERT INTO launch_policy(id,first_notice_cutoff) VALUES('initial-launch',now()) ON CONFLICT(id) DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS payment_reconciliation_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, target_id uuid NOT NULL, actor text NOT NULL, disposition text NOT NULL, evidence jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
    `CREATE TABLE IF NOT EXISTS recovery_holds (id uuid PRIMARY KEY, service_id uuid NOT NULL, client_id uuid NOT NULL, record jsonb NOT NULL, reason text NOT NULL, status text NOT NULL DEFAULT 'held', acknowledged_at timestamptz, acknowledged_by text, evidence jsonb, created_at timestamptz NOT NULL DEFAULT now())`,
    `ALTER TABLE staged_documents ADD COLUMN IF NOT EXISTS cleanup_checked_at timestamptz`,
  ]},
  { id: 19, name: "restore-activation-and-notice-leases", statements: [
    `CREATE TABLE IF NOT EXISTS recovery_activation (id text PRIMARY KEY CHECK (id='restore'), restore_id uuid NOT NULL, restored_at timestamptz NOT NULL DEFAULT now(), activated_at timestamptz, production_origin text, operator text)`,
    `ALTER TABLE service_orders ADD COLUMN IF NOT EXISTS recovery_notice_lock_until timestamptz`,
  ]},
  { id: 20, name: "password-link-account-revision", statements: [
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS auth_version bigint NOT NULL DEFAULT 0`,
    `ALTER TABLE auth_tokens ADD COLUMN IF NOT EXISTS account_version bigint NOT NULL DEFAULT 0`,
  ]},
  { id: 21, name: "password-session-revision", statements: [
    `ALTER TABLE clients ADD COLUMN IF NOT EXISTS password_version bigint NOT NULL DEFAULT 0`,
    `ALTER TABLE sessions ADD COLUMN IF NOT EXISTS password_version bigint NOT NULL DEFAULT 0`,
  ]},
  { id: 22, name: "purchase-identity-and-payment-recovery", statements: PURCHASE_MIGRATION },
  { id: 23, name: "company-scoped-series-identity", statements: SERIES_IDENTITY_MIGRATION },
  { id: 24, name: "series-owner-punctuation-identity", statements: SERIES_OWNER_MIGRATION },
  { id: 25, name: "series-boundary-format-identity", statements: SERIES_FORMAT_MIGRATION },
  { id: 26, name: "recoverable-office-delivery", statements: [
    `ALTER TABLE orders ADD COLUMN IF NOT EXISTS office_upload_id uuid`,
    `CREATE TABLE IF NOT EXISTS office_operations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL,target_id uuid NOT NULL,input_hash text NOT NULL,payload jsonb NOT NULL,files jsonb NOT NULL DEFAULT '{}'::jsonb,phase text NOT NULL DEFAULT 'open',result jsonb NOT NULL DEFAULT '{}'::jsonb,lease uuid,lease_until timestamptz,error text,notice_started_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(kind,target_id))`,
  ]},
  { id: 27, name: "encrypted-office-upload-staging", statements: [
    `CREATE TABLE IF NOT EXISTS office_upload_stages (
      id uuid PRIMARY KEY, session_hash text NOT NULL, route text NOT NULL,
      fields jsonb NOT NULL, files jsonb NOT NULL, state text NOT NULL DEFAULT 'issued',
      lease uuid, lease_until timestamptz, token_expires_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL, result_status integer, result_body text,
      cleanup_pending boolean NOT NULL DEFAULT false, cleanup_checked_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE INDEX IF NOT EXISTS office_upload_stages_cleanup ON office_upload_stages (cleanup_checked_at,expires_at)`,
  ]},
  // F-S4-01: normalize only the owning company, never the series identifier.
  { id: 28, name: "series-company-alias-identity", statements: [
    `CREATE OR REPLACE FUNCTION purchase_company_identity(value text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(string_agg(CASE WHEN length(token)>3 AND right(token,1)='s'
    THEN left(token,length(token)-1) ELSE token END, '' ORDER BY position),'')
  FROM regexp_split_to_table(
    regexp_replace(replace(replace(replace(
      regexp_replace(purchase_name(value),
        '(professional[[:space:]]+)?limited[[:space:]]+liability[[:space:]]+company', 'llc', 'g'),
      '&',' and '),'''',''),'’',''), '[^[:alnum:][:space:]]','','g'),
    '[[:space:]]+') WITH ORDINALITY AS words(token,position)
  WHERE token<>'' AND token NOT IN
    ('the','a','an','and','llc','pllc','inc','incorporated','corp','corporation',
     'co','company','ltd','limited','lp','llp','lllp','pa','pl','pc','chartered')
$$`,
    `CREATE OR REPLACE FUNCTION purchase_series_owner_end(value text, company_name text) RETURNS integer
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE name text := purchase_series_unwrap(value);
  owner_key text := regexp_replace(purchase_name(company_name),'[^[:alnum:]]','','g');
  prefix_key text := ''; ch text; suffix text; i integer; alias_key text; prefix text;
BEGIN
  -- Preserve the established literal/punctuation match and its exact boundary.
  IF owner_key<>'' THEN
    FOR i IN 1..length(name) LOOP
      ch := substr(name,i,1);
      IF ch ~ '[[:alnum:]]' THEN prefix_key := prefix_key || ch; END IF;
      IF left(owner_key,length(prefix_key))<>prefix_key THEN EXIT; END IF;
      IF prefix_key=owner_key THEN
        suffix := substr(name,i+1);
        IF suffix ~ '^[^[:alnum:]]' AND suffix ~ '[[:alnum:]]' THEN RETURN i; END IF;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  alias_key := purchase_company_identity(company_name);
  IF alias_key='' THEN RETURN 0; END IF;
  -- Only complete company endings qualify. Never fold words in the series label.
  FOR i IN 1..length(name) LOOP
    IF substr(name,i,1) !~ '[[:alnum:]]' THEN CONTINUE; END IF;
    suffix := substr(name,i+1);
    IF suffix !~ '^[^[:alnum:]]' OR suffix !~ '[[:alnum:]]' THEN CONTINUE; END IF;
    prefix := left(name,i);
    IF prefix ~ '(^|[^[:alnum:]])(p[.]?l[.]?l[.]?c|l[.]?l[.]?c|(professional[[:space:]]+)?limited[[:space:]]+liability[[:space:]]+company)$'
       AND purchase_company_identity(prefix)=alias_key THEN RETURN i; END IF;
  END LOOP;
  RETURN 0;
END $$`,
  ]},
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
