/** Actual account routes, disposable database, no external providers. */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import type { Db } from './db';
if (process.env.E2E_OFFLINE !== '1' || process.env.VERCEL) throw Error('Offline only');
const root = process.env.C1_TEST_ROOT || resolve(import.meta.dir, '..');
const out = process.env.C1_TEST_OUT || mkdtempSync(tmpdir() + '/c1-password-results-');
mkdirSync(out, { recursive: true });
process.env.DEV_PG_DIR = mkdtempSync(tmpdir() + '/c1-password-db-');
process.env.DEV_STORAGE_DIR = mkdtempSync(tmpdir() + '/c1-password-files-');
globalThis.fetch = Object.assign(async () => { throw Error('No external requests'); }, { preconnect: () => { throw Error('No external requests'); } });
const { app } = await import(root + '/server/app.ts');
const { getDb } = await import(root + '/server/db.ts');
const { hashPassword, verifyPassword, newToken } = await import(root + '/server/crypto.ts');
const { env } = await import(root + '/server/env.ts');
if (env.DATABASE_URL || env.RESEND_API_KEY || env.BLOB_READ_WRITE_TOKEN || !env.OFFLINE) throw Error('External configuration enabled');
const db: Db = await getDb(), raw = db.query.bind(db);
const old = 'Original-fixture-password-123', fresh = 'Replacement-fixture-password-456';
let ip = 0;
const rows: { id: string; ok: boolean; detail?: unknown }[] = [];
function check(id: string, ok: boolean, detail?: unknown) {
  rows.push({ id, ok, detail }); console.log('PASSWORD_ASSERTION:' + JSON.stringify(rows.at(-1)));
  writeFileSync(out + '/results.json', JSON.stringify(rows, null, 2));
}
async function request(path: string, body?: unknown, cookie = '') {
  const r = await app.request('/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { cookie, 'content-type': 'application/json', 'x-forwarded-for': `198.18.${Math.floor(++ip / 250)}.${ip % 250 + 1}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] || '', body: await r.text() };
}
async function fixture() {
  const id = crypto.randomUUID(), email = id + '@example.test', a = newToken(), b = newToken();
  await raw('INSERT INTO clients(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [id, email, 'Fixture', await hashPassword(old)]);
  for (const s of [a, b]) await raw("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [s.tokenHash, id]);
  const tokens: Record<string, string> = {};
  for (const purpose of ['reset_password', 'set_password', 'verify_email']) {
    const t = newToken(); tokens[purpose] = t.token;
    await raw("INSERT INTO auth_tokens(token_hash,client_id,purpose,expires_at,account_version) SELECT $1,id,$3,now()+interval '1 day',auth_version FROM clients WHERE id=$2", [t.tokenHash, id, purpose]);
  }
  return { id, email, cookie: 'fpsllc_session=' + a.token, other: 'fpsllc_session=' + b.token, tokens };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const access = async (cookie: string) => (await request('/auth/me', undefined, cookie)).status;
const change = (c: Fixture, cookie = c.cookie, password = fresh) => request('/portal/account/password', { currentPassword: old, newPassword: password }, cookie);
const reset = (c: Fixture) => request('/auth/set-password', { token: c.tokens.reset_password, password: fresh });
async function snapshot(c: Fixture) {
  return JSON.stringify({ clients: await raw('SELECT * FROM clients WHERE id=$1', [c.id]), sessions: await raw('SELECT * FROM sessions WHERE client_id=$1 ORDER BY token_hash', [c.id]), tokens: await raw('SELECT * FROM auth_tokens WHERE client_id=$1 ORDER BY token_hash', [c.id]) });
}
async function winningPassword(c: Fixture) { const [r] = await raw<{ password_hash: string }>('SELECT password_hash FROM clients WHERE id=$1', [c.id]); return verifyPassword(fresh, r.password_hash); }
async function barrier(sql: string, value: string) {
  let signal!: () => void, release!: () => void, used = false;
  const reached = new Promise<void>(r => { signal = r; }), gate = new Promise<void>(r => { release = r; });
  db.query = async <T>(s: string, p: unknown[] = []) => { const result = await raw<T>(s, p); if (!used && s === sql && p[0] === value) { used = true; signal(); await gate; } return result; };
  return { wait: async () => { let timer: ReturnType<typeof setTimeout>; try { await Promise.race([reached, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('barrier not reached')), 5000); })]); } finally { clearTimeout(timer!); } }, release };
}
async function test(id: string, fn: () => Promise<void>) { try { await fn(); } catch (e) { check(id, false, String(e)); } finally { db.query = raw; } }
for (let repeat = 1; repeat <= 3; repeat++) {
  for (const op of ['change', 'reset']) await test(`login-${op}-${repeat}`, async () => {
    const c = await fixture(), b = await barrier('SELECT id, password_hash FROM clients WHERE email = $1', c.email);
    const pending = request('/auth/login', { email: c.email, password: old }); let winner;
    try { await b.wait(); winner = await (op === 'change' ? change(c) : reset(c)); } finally { b.release(); }
    const late = await pending; db.query = raw;
    check(`login-${op}-${repeat}`, winner.status === 200 && late.status !== 200 && await access(late.cookie) === 401, { winner: winner.status, late: late.status });
  });
  for (const same of [false, true]) await test(`competing-change-${same}-${repeat}`, async () => {
    const c = await fixture(), b = await barrier('SELECT email, password_hash FROM clients WHERE id = $1', c.id);
    const pending = change(c, c.cookie, 'Stale-request-password-789'); let winner;
    try { await b.wait(); winner = await change(c, same ? c.cookie : c.other); } finally { b.release(); }
    const late = await pending; db.query = raw;
    check(`competing-change-${same}-${repeat}`, winner.status === 200 && late.status !== 200 && await winningPassword(c), { winner: winner.status, late: late.status });
  });
}
for (const op of ['logout', 'reset']) await test('change-overlap-' + op, async () => {
  const c = await fixture(), b = await barrier('SELECT email, password_hash FROM clients WHERE id = $1', c.id);
  const pending = change(c, c.cookie, 'Stale-request-password-789'); let winner;
  try { await b.wait(); winner = await (op === 'reset' ? reset(c) : request('/auth/logout', {}, c.cookie)); } finally { b.release(); }
  const late = await pending; db.query = raw;
  check('change-overlap-' + op, winner.status === 200 && late.status !== 200 && (op !== 'reset' || await winningPassword(c)), { winner: winner.status, late: late.status });
});
for (const op of ['change', 'reset']) for (const [table, event] of [['clients', 'UPDATE'], ['auth_tokens', 'UPDATE'], ['sessions', 'DELETE'], ['sessions', op === 'reset' ? 'INSERT' : 'UPDATE']]) {
  const id = `rollback-${op}-${table}-${event}`;
  await test(id, async () => {
    const c = await fixture(), before = await snapshot(c);
    // Fault inside PostgreSQL, after entering the real statement, not before it.
    await raw(`CREATE OR REPLACE FUNCTION c1_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'C1_DATABASE_FAULT'; END $$`);
    await raw(`CREATE TRIGGER c1_fault BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION c1_fault()`);
    let failed;
    try { failed = await (op === 'change' ? change(c) : reset(c)); }
    finally { await raw(`DROP TRIGGER c1_fault ON ${table}`); }
    const after = await snapshot(c), retry = await (op === 'change' ? change(c) : reset(c));
    check(id, failed.status === 500 && before === after && retry.status === 200 && await winningPassword(c) && await access(c.other) === 401, { failed: failed.status, fullyRolledBack: before === after, retry: retry.status });
    check(id + '-current-device', await access(op === 'change' ? c.cookie : retry.cookie) === 200);
  });
}
for (const op of ['change', 'reset']) await test('lost-response-' + op, async () => {
  const c = await fixture(); let injected = false;
  db.query = async <T>(s: string, p: unknown[] = []) => { const result = await raw<T>(s, p); if (!injected && /WITH (changed|authorized) AS/.test(s) && s.includes('UPDATE clients')) { injected = true; throw Error('Response lost after commit'); } return result; };
  const lost = await (op === 'change' ? change(c) : reset(c)); db.query = raw;
  const login = await request('/auth/login', { email: c.email, password: fresh });
  check('lost-response-' + op, injected && lost.status === 500 && await winningPassword(c) && await access(c.other) === 401 && login.status === 200 && await access(login.cookie) === 200, { injected, response: lost.status, newPasswordLogin: login.status });
  if (op === 'reset') check('lost-response-reset-link-consumed', (await reset(c)).status === 400);
});
await test('normal-and-policy', async () => {
  const c = await fixture(), other = await fixture(), r = await change(c);
  check('normal-current-device', r.status === 200 && await access(c.cookie) === 200);
  check('normal-other-device', await access(c.other) === 401);
  check('normal-other-account', await access(other.cookie) === 200);
  const [{ n }] = await raw<{ n: number }>('SELECT count(*)::int AS n FROM auth_tokens WHERE client_id=$1 AND used_at IS NULL', [c.id]);
  check('normal-invalidates-links', n === 0, n);
  const admin = newToken(); await raw("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 hour')", [admin.tokenHash]);
  const corrected = await request('/admin/clients/' + c.id + '/email', { newEmail: 'corrected-' + c.email }, 'fpsllc_admin=' + admin.token);
  check('email-only-session-preserved', corrected.status === 200 && await access(c.cookie) === 200);
  const view = await request('/admin/clients/' + c.id + '/view-as', {}, 'fpsllc_admin=' + admin.token);
  check('office-view-current-password-revision', view.status === 200 && await access(view.cookie) === 200);
  const stale = newToken(); await raw("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [stale.tokenHash, c.id]);
  check('late-old-revision-row-refused', await access('fpsllc_session=' + stale.token) === 401);
});
await test('reset-normal-and-overlap', async () => {
  const c = await fixture(), other = await fixture();
  const r = await Promise.all([reset(c), request('/auth/set-password', { token: c.tokens.set_password, password: 'Competing-reset-password-789' })]);
  const winner = r.find(r => r.status === 200);
  check('only-one-reset-wins', r.filter(r => r.status === 200).length === 1, r.map(r => r.status));
  check('reset-current-device', !!winner && await access(winner.cookie) === 200);
  check('reset-all-prior-devices', await access(c.cookie) === 401 && await access(c.other) === 401);
  check('reset-other-account', await access(other.cookie) === 200);
});
await test('migration-21', async () => { const migrations = await raw<{ id: number }>('SELECT id FROM schema_migrations ORDER BY id'); check('fresh-migration-21', migrations.some(m => m.id === 21)); });
writeFileSync(out + '/isolation.json', JSON.stringify({ root, db: process.env.DEV_PG_DIR, storage: process.env.DEV_STORAGE_DIR, offline: env.OFFLINE, externalProviders: false }, null, 2));
console.log('PASSWORD_DONE:' + JSON.stringify({ assertions: rows.length, failed: rows.filter(r => !r.ok).length }));
if (rows.some(r => !r.ok)) process.exitCode = 1;
