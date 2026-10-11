import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { getDb } from './db';
import { getSession, getAdminSession } from './auth';

// Per-request, never a process-global switch: concurrent real clients retain
// their normal payment and email behavior.
const context = new AsyncLocalStorage<boolean>();
export const inTraining = () => context.getStore() === true;
export const withTraining = <T>(work: () => T): T => context.run(true, work);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function trainingRefusal(): never {
  throw new HTTPException(409, { res: Response.json({ error: {
    code: 'TRAINING_ONLY', message: 'Training account: real payments, card storage and account credentials are disabled. You can practice changes and document uploads. Emails are suppressed.',
  } }, { status: 409 }) });
}

export async function trainingRecipient(email?: string): Promise<boolean> {
  if (!email) return false;
  const db = await getDb();
  return (await db.query('SELECT id FROM clients WHERE is_training AND lower(email)=lower($1)', [email])).length > 0;
}

/** Resolve persisted ownership, including background retries without a session. */
export async function trainingTarget(id?: string): Promise<boolean> {
  if (!id || !uuid.test(id)) return false;
  const db = await getDb();
  const rows = await db.query(`WITH owned AS (
    SELECT id AS target, id AS client_id FROM clients
    UNION ALL SELECT id,client_id FROM orders
    UNION ALL SELECT id,client_id FROM service_orders
    UNION ALL SELECT id,client_id FROM documents
    UNION ALL SELECT r.id,o.client_id FROM ra_renewals r JOIN orders o ON o.id=r.order_id
  ), targets AS (
    SELECT client_id FROM owned WHERE target=$1::uuid
    UNION ALL SELECT x.client_id FROM office_operations op JOIN owned x ON x.target=op.target_id WHERE op.id=$1::uuid
  ) SELECT 1 FROM targets JOIN clients c ON c.id=targets.client_id WHERE c.is_training LIMIT 1`, [id]);
  return rows.length > 0;
}

export async function blockTrainingPayment(id?: string, email?: string, providerId?: string): Promise<void> {
  if (inTraining() || await trainingTarget(id) || await trainingRecipient(email)) trainingRefusal();
  if (providerId) {
    const db = await getDb();
    const rows = await db.query(`SELECT 1 FROM orders o JOIN clients c ON c.id=o.client_id
      WHERE c.is_training AND (o.square_card_id=$1 OR o.square_payment_id=$1)
      UNION ALL SELECT 1 FROM ra_payment_attempts a JOIN orders o ON o.id=a.target_id
        JOIN clients c ON c.id=o.client_id WHERE c.is_training AND a.square_payment_id=$1
      UNION ALL SELECT 1 FROM ra_payment_attempts a JOIN ra_renewals r ON r.id=a.target_id
        JOIN orders o ON o.id=r.order_id JOIN clients c ON c.id=o.client_id
        WHERE c.is_training AND a.square_payment_id=$1 LIMIT 1`, [providerId]);
    if (rows.length) trainingRefusal();
  }
}

export const trainingMiddleware: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;
  let training = false;
  if (path.startsWith('/api/admin/')) {
    if (await getAdminSession(c)) {
      const match = path.match(/^\/api\/admin\/(?:orders|services|clients|documents|office-operations)\/([0-9a-f-]{36})(?:\/|$)/i);
      if (match) training = await trainingTarget(match[1]);
      if (path === '/api/admin/documents' && c.req.method === 'POST') {
        const upload = c.req.header('x-office-upload');
        if (upload && uuid.test(upload)) {
          const [stage] = await (await getDb()).query<{ fields: [string, string][] }>('SELECT fields FROM office_upload_stages WHERE id=$1', [upload]);
          training = await trainingTarget(stage?.fields.find(([key]) => key === 'clientId')?.[1]);
        } else if (c.req.header('content-type')?.includes('multipart/form-data')) {
          const body = await c.req.parseBody();
          training = typeof body.clientId === 'string' && await trainingTarget(body.clientId);
        }
      }
    }
  } else if (path.startsWith('/api/portal/') || path.startsWith('/api/auth/') || path.startsWith('/api/orders') || path === '/api/contact') {
    const session = await getSession(c);
    training = await trainingTarget(session?.clientId ?? undefined);
  }
  const capability = path.match(/^\/api\/(?:agent-checkout\/(?:order|renewal)|orders)\/([0-9a-f-]{36})(?:\/|$)/i);
  if (capability) training ||= await trainingTarget(capability[1]);
  if (!training) return next();
  c.header('X-Training-Account', 'true');
  // Refuse before a purchase row, card attempt, or credential token is created.
  if (path === '/api/contact' || path.endsWith('/resend-welcome') || path.includes('/renewal-card') || path.startsWith('/api/agent-checkout/') ||
      path.startsWith('/api/portal/account/') || /\/admin\/clients\/[^/]+\/email$/.test(path) ||
      (c.req.method === 'POST' && (path === '/api/orders' || /^\/api\/portal\/services\/(ein|s-election|series|certificate)$/.test(path)))) trainingRefusal();
  return withTraining(next);
};
