/** P105 regressions using synthetic accounts and disposable offline storage. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Check = (label: string, ok: boolean, detail?: unknown) => void;
export async function p105Checks(check: Check) {
  const dir = mkdtempSync(join(tmpdir(), 'p105-regression-'));
  try {
    const child = Bun.spawn([process.execPath, import.meta.filename, '--child'], {
      cwd: join(import.meta.dir, '..'),
      // No ambient .env/provider credentials, real database, storage or mail.
      env: { PATH: process.env.PATH ?? '', TMPDIR: tmpdir(), E2E_OFFLINE: '1', VERCEL: '',
        DEV_PG_DIR: join(dir, 'db'), DEV_STORAGE_DIR: join(dir, 'storage'),
        ADMIN_PASSWORD: 'p105-fixture-only', PUBLIC_BASE_URL: 'http://localhost:8000' },
      stdout: 'pipe', stderr: 'pipe',
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
    ]);
    const rows = stdout.split('\n').filter(line => line.startsWith('P105_ASSERTION:'))
      .map(line => JSON.parse(line.slice('P105_ASSERTION:'.length)) as { label: string; ok: boolean; detail?: unknown });
    for (const row of rows) check(row.label, row.ok, row.detail);
    if (code || rows.length < 20) throw new Error(`P105 fixture did not finish: exit=${code}, assertions=${rows.length}\n${stderr}\n${stdout}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function fixture() {
  if (process.env.E2E_OFFLINE !== '1' || !process.env.DEV_PG_DIR?.startsWith(tmpdir()) || process.env.VERCEL) throw new Error('Isolated offline child required');
  globalThis.fetch = Object.assign(async () => { throw new Error('P105 fixture refuses all external fetches'); },
    { preconnect: () => { throw new Error('P105 fixture refuses preconnect'); } });
  const { app } = await import('./app');
  const { getDb } = await import('./db');
  const { newToken, hashToken, hashPassword } = await import('./crypto');
  const { devOutbox } = await import('./email');
  const { env } = await import('./env');
  if (env.DATABASE_URL || env.RESEND_API_KEY || env.BLOB_READ_WRITE_TOKEN || !env.OFFLINE) throw new Error('External integrations enabled');
  const db = await getDb();
  let failures = 0, ip = 0;
  const check: Check = (label, ok, detail) => {
    if (!ok) failures++;
    console.log('P105_ASSERTION:' + JSON.stringify({ label: 'P105: ' + label, ok, detail }));
  };
  const request = async (path: string, body: unknown, cookie = '') => {
    const response = await app.request('/api' + path, { method: 'POST', headers: {
      'content-type': 'application/json', cookie, 'x-forwarded-for': `192.0.2.${++ip}`,
    }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  async function client() {
    const id = crypto.randomUUID(), email = `${id}@example.test`, session = newToken();
    await db.query('INSERT INTO clients(id,email,name,password_hash) VALUES($1,$2,$3,$4)', [id, email, 'P105 fixture', await hashPassword('Fixture-old-password-123')]);
    await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [session.tokenHash, id]);
    return { id, email, cookie: `fpsllc_session=${session.token}` };
  }
  async function state(id: string) {
    const [row] = await db.query<{ email: string; password_hash: string; auth_version: string }>('SELECT email,password_hash,auth_version FROM clients WHERE id=$1', [id]);
    return row;
  }
  async function mint(email: string, purpose: string) {
    const r = await request('/dev/mint-reset-token', { email, purpose });
    if (r.status !== 200 || !r.body.data?.token) throw new Error('Test issuer failed');
    return r.body.data as { token: string; accountVersion: string };
  }
  const setPassword = (token: string) => request('/auth/set-password', { token, password: 'Fixture-new-password-123' });
  const admin = newToken();
  await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')", [admin.tokenHash]);
  const other = await client(), otherLink = await mint(other.email, 'reset_password'), otherBefore = await state(other.id);
  // Eight independent fixtures. Each old token was valid before a real route
  // performs the change; a fresh production-issued reset is the control after it.
  for (const action of ['portal-email', 'office-email', 'password-change', 'another-link'] as const) {
    for (const purpose of ['set_password', 'reset_password']) {
      const label = `${action}/${purpose}`;
      try {
        const c = await client(), old = await mint(c.email, purpose), before = await state(c.id);
        const [tokenBefore] = await db.query<{ purpose: string; used_at: unknown; account_version: string; live: boolean }>(
          'SELECT purpose,used_at,account_version,expires_at>now() AS live FROM auth_tokens WHERE token_hash=$1', [hashToken(old.token)]);
        check(label + ' valid starting authority', tokenBefore.live && tokenBefore.used_at === null && tokenBefore.purpose === purpose && String(tokenBefore.account_version) === String(before.auth_version));
        let change;
        const nextEmail = `changed-${c.email}`;
        if (action === 'office-email') {
          change = await request(`/admin/clients/${c.id}/email`, { newEmail: nextEmail }, `fpsllc_admin=${admin.token}`);
        } else if (action === 'portal-email') {
          const start = await request('/portal/account/email', { newEmail: nextEmail, currentPassword: 'Fixture-old-password-123' }, c.cookie);
          if (start.status !== 200) throw new Error('Email request failed');
          const pending = await request('/dev/pending-email-token', { email: c.email });
          if (pending.status !== 200 || !pending.body.data?.token) throw new Error('Pending email token unavailable');
          change = await request('/auth/verify-email', { token: pending.body.data.token });
        } else if (action === 'password-change') {
          change = await request('/portal/account/password', { currentPassword: 'Fixture-old-password-123', newPassword: 'Fixture-changed-password-123' }, c.cookie);
        } else {
          const fresh = await mint(c.email, 'reset_password');
          change = await setPassword(fresh.token);
        }
        const changed = await state(c.id);
        check(label + ' change succeeded', change.status === 200 && BigInt(changed.auth_version) > BigInt(before.auth_version) &&
          changed.email === (action.endsWith('email') ? nextEmail : c.email), change);
        const denied = await setPassword(old.token), afterDenied = await state(c.id);
        check(label + ' obsolete link refused without write', denied.status === 400 && denied.body.error?.code === 'BAD_TOKEN' &&
          afterDenied.password_hash === changed.password_hash && String(afterDenied.auth_version) === String(changed.auth_version), denied);
        // Exercise the production forgot issuer, not only the repaired test helper.
        const outboxStart = devOutbox.length;
        const forgot = await request('/auth/forgot', { email: changed.email });
        const sent = devOutbox.slice(outboxStart).find(m => m.to === changed.email && m.subject === 'Reset your portal password');
        const href = sent?.html.match(/href="([^"]+\/portal\/set-password\?token=[^"]+)"/)?.[1];
        if (forgot.status !== 200 || !href) throw new Error('Fresh production reset fixture was not issued');
        const reset = new URL(href).searchParams.get('token')!;
        const freshResult = await setPassword(reset), usedResult = await setPassword(reset);
        check(label + ' fresh link succeeds once', freshResult.status === 200 && usedResult.status === 400 && usedResult.body.error?.code === 'BAD_TOKEN');
      } catch (error) { check(label + ' fixture finished', false, String(error)); }
    }
  }
  // Distinguish a wrong purpose from a stale revision. Each has its own
  // otherwise-valid fixture and a positive reset control at that revision.
  try {
    const c = await client();
    await db.query('UPDATE clients SET auth_version=7 WHERE id=$1', [c.id]);
    const wrong = await mint(c.email, 'verify_email');
    check('wrong-purpose fixture is current', wrong.accountVersion === '7');
    const denied = await setPassword(wrong.token);
    const [remaining] = await db.query<{ used_at: unknown }>('SELECT used_at FROM auth_tokens WHERE token_hash=$1', [hashToken(wrong.token)]);
    check('current wrong-purpose link refused and unconsumed', denied.status === 400 && denied.body.error?.code === 'BAD_TOKEN' && remaining.used_at === null);
    const stale = await mint(c.email, 'reset_password');
    await db.query('UPDATE clients SET auth_version=auth_version+1 WHERE id=$1', [c.id]);
    const staleDenied = await setPassword(stale.token);
    check('unconsumed correct-purpose stale revision refused', staleDenied.status === 400 && staleDenied.body.error?.code === 'BAD_TOKEN');
    const fresh = await mint(c.email, 'set_password');
    check('fresh welcome-purpose link works at nonzero revision', fresh.accountVersion === '8' && (await setPassword(fresh.token)).status === 200);
  } catch (error) { check('independent purpose/revision fixtures finished', false, String(error)); }
  const otherAfter = await state(other.id);
  const [otherToken] = await db.query<{ used_at: unknown }>('SELECT used_at FROM auth_tokens WHERE token_hash=$1', [hashToken(otherLink.token)]);
  check('unrelated account and link untouched', otherAfter.password_hash === otherBefore.password_hash && String(otherAfter.auth_version) === String(otherBefore.auth_version) && otherToken.used_at === null);
  if (failures) process.exitCode = 1;
}

if (import.meta.main) {
  if (process.argv.includes('--child')) await fixture();
  else {
    const assertions: { id: string; result: string; detail?: unknown }[] = [];
    try { await p105Checks((id, ok, detail) => assertions.push({ id, result: ok ? 'pass' : 'fail', detail })); }
    catch (error) { assertions.push({ id: 'P105 fixture completion', result: 'fail', detail: String(error) }); }
    console.log('REVIEW_ASSERTIONS:' + JSON.stringify({ assertions }));
    if (assertions.some(a => a.result !== 'pass')) process.exitCode = 1;
  }
}
