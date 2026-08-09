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
  const { PGlite } = await import("@electric-sql/pglite");
  const { fileURLToPath } = await import("node:url");
  const { mkdirSync } = await import("node:fs");
  const dir = fileURLToPath(new URL("../.dev-data/pg", import.meta.url));
  mkdirSync(dir, { recursive: true });
  const pg = new PGlite(dir);
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
  used_at timestamptz
);
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
-- Email changes are verified before they take effect: the requested address
-- parks here until the client clicks the link sent to it.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS pending_email text;
CREATE TABLE IF NOT EXISTS oa_profiles (
  client_id uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oa_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id),
  template_version text NOT NULL,
  amended_restated boolean NOT NULL DEFAULT false,
  inputs jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
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
