/** Fault injection against real routes, database statements and private files.
 * Everything lives in a disposable offline child process. */
import { mkdtempSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from '@cantoo/pdf-lib';
type Check = (label: string, ok: boolean, detail?: unknown) => void;
export async function batch05Checks(check: Check) {
  const dir = mkdtempSync(join(tmpdir(), 'batch05-'));
  try {
    const child = Bun.spawn(['bun', import.meta.filename, '--child'], { cwd: process.cwd(), env: { ...process.env, E2E_OFFLINE: '1', VERCEL: '', DEV_PG_DIR: join(dir, 'db'), DEV_STORAGE_DIR: join(dir, 'files'), ADMIN_PASSWORD: 'dev-admin' }, stdout: 'pipe', stderr: 'pipe' });
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    const rows = out.split('\n').filter(x => x.startsWith('BATCH05:')).map(x => JSON.parse(x.slice(8)));
    for (const r of rows) check(r.label, r.ok, r.detail);
    if (code || rows.length < 5) throw new Error(`Batch05 fixture failed ${code}: ${err}\n${out}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
async function child() {
  const { app } = await import('./app'), { getDb } = await import('./db'), { newToken } = await import('./crypto');
  const { fulfillPaidOrder } = await import('./routes-payments'), { refreshOwnersManual } = await import('./routes-admin');
  const { postSElectionPackage } = await import('./routes-portal'), { testHooks } = await import('./shared');
  const { defaultFormData } = await import('../src/components/forms/florida-llc/defaults'), { buildPayload } = await import('../src/components/forms/florida-llc/buildPayload');
  const { env } = await import('./env'), storage = await import('./storage');
  const db = await getDb(); const query = db.query.bind(db);
  const check: Check = (label, ok, detail) => console.log('BATCH05:' + JSON.stringify({ label, ok, detail: ok ? undefined : detail }));
  const attempt = async (label: string, f: () => Promise<void>) => { try { await f(); } catch (e) { check(label, false, String(e)); } finally { db.query = query; testHooks.failFormationPutAfter = -1; } };
  const proof = await (await app.request('/api/dev/env-summary')).json();
  if (!proof.data?.offline || Object.values(proof.data.externals).some(Boolean)) throw new Error('Isolation unproven');
  env.RESEND_API_KEY = 'synthetic-fixture';
  const mails: { html: string; to: string[] }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) !== 'https://api.resend.com/emails') throw new Error('External request refused');
    mails.push(JSON.parse(String(init?.body))); return new Response('{"id":"fixture"}', { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const client = crypto.randomUUID(), admin = newToken(), session = newToken();
  await db.query("INSERT INTO clients(id,email,name) VALUES($1,'five@example.test','Five Client')", [client]);
  for (const [t, c, a] of [[admin, null, true], [session, client, false]] as const) await db.query("INSERT INTO sessions(token_hash,client_id,is_admin,expires_at) VALUES($1,$2,$3,now()+interval '1 day')", [t.tokenHash, c, a]);
  const req = (path: string, body?: FormData | object, asClient = false) => app.request('/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Cookie: asClient ? `fpsllc_session=${session.token}` : `fpsllc_admin=${admin.token}`, ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  const data = structuredClone(defaultFormData); data.desiredLlcName = 'Five Company'; data.llcDesignator = 'LLC'; data.clientFirstName = 'Five'; data.clientLastName = 'Client'; data.clientEmail = 'five@example.test'; data.managementStructure = 'MEMBER_MANAGED'; data.members = [{ ...data.members[0], firstName: 'Five', lastName: 'Client' }]; data.principalAddress = { address1: '111 Example Avenue', address2: '', city: 'Miami', state: 'FL', zip: '33139', country: 'United States' };
  const payload = { ...buildPayload(data), certifications: { articlesSignedBy: 'SERVICE' }, series: [{ name: 'Five Company, LLC, PS A' }], optionalDocuments: { ein: true, sElection: true, certificateOfStatus: true } };
  const order = async (status = 'pending_payment', email = `${crypto.randomUUID()}@example.test`) => { const id = crypto.randomUUID(); await db.query("INSERT INTO orders(id,client_id,contact_name,contact_email,package,llc_name,payload,service_fee_cents,state_fees_cents,total_cents,status,paid_at) VALUES($1,$2,'Five Client',$3,'NEW','Five Company, LLC',$4,0,0,0,$5,$6)", [id, status === 'pending_payment' ? null : client, email, JSON.stringify(payload), status, status === 'pending_payment' ? null : new Date().toISOString()]); return id; };
  const pdfDoc = await PDFDocument.create(); pdfDoc.addPage().drawText('Batch five synthetic file'); const pdf = await pdfDoc.save();
  const file = () => new File([new Uint8Array(pdf)], 'fixture.pdf', { type: 'application/pdf' });
  const read = async (key: string) => Buffer.from(await storage.readFileStream(key));
  // A real SQL trigger fails AFTER the earlier setup actions would have run.
  await attempt('batch05 N1.13: paid setup resumes without duplicate services', async () => {
    const id = await order();
    await db.query("CREATE FUNCTION batch05_fail_service() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.type='s-election' THEN RAISE EXCEPTION 'batch05 planned setup fault'; END IF; RETURN NEW; END $$");
    await db.query('CREATE TRIGGER batch05_fault BEFORE INSERT ON service_orders FOR EACH ROW EXECUTE FUNCTION batch05_fail_service()');
    let failed = false; try { await fulfillPaidOrder(id, 'payment-fixture'); } catch (e) { failed = String(e).includes('batch05 planned setup fault'); } finally { await db.query('DROP TRIGGER batch05_fault ON service_orders'); }
    await fulfillPaidOrder(id, 'payment-fixture'); await Promise.all([fulfillPaidOrder(id, 'payment-fixture'), fulfillPaidOrder(id, 'payment-fixture')]);
    const [o] = await db.query<{ client_id: string; status: string; square_payment_id: string }>('SELECT client_id,status,square_payment_id FROM orders WHERE id=$1', [id]);
    const services = await db.query<{ type: string; client_id: string }>('SELECT type,client_id FROM service_orders WHERE formation_order_id=$1 ORDER BY type', [id]);
    check('batch05 N1.13: paid setup resumes without duplicate services', failed && !!o.client_id && o.status === 'paid' && o.square_payment_id === 'payment-fixture' && services.length === 2 && services.every(s => s.client_id === o.client_id) && services.map(s => s.type).join(',') === 'ein,s-election', { failed, o, services });
    const id2 = await order(); await Promise.all([fulfillPaidOrder(id2, 'same-payment'), fulfillPaidOrder(id2, 'same-payment')]);
    const rows = await db.query('SELECT id FROM service_orders WHERE formation_order_id=$1', [id2]); check('batch05 simultaneous first delivery creates each purchase once', rows.length === 2, rows);
  });
  await attempt('batch05 setup retries account and welcome-link failures atomically', async () => {
    const cases: {table: string; failed: boolean; services: number; linked: boolean; tokens: number}[] = [];
    for (const table of ['clients', 'auth_tokens']) {
      const id = await order();
      await db.query("CREATE OR REPLACE FUNCTION batch05_fail_setup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'batch05 planned setup stage'; END $$");
      await db.query(`CREATE TRIGGER batch05_setup BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION batch05_fail_setup()`);
      let failed = false; try { await fulfillPaidOrder(id, 'stage-payment'); } catch (e) { failed = String(e).includes('batch05 planned setup stage'); } finally { await db.query(`DROP TRIGGER batch05_setup ON ${table}`); }
      await fulfillPaidOrder(id, 'stage-payment');
      const [o] = await query<{client_id: string}>('SELECT client_id FROM orders WHERE id=$1', [id]);
      const services = await query('SELECT id FROM service_orders WHERE formation_order_id=$1', [id]);
      const tokens = await query('SELECT token_hash FROM auth_tokens WHERE client_id=$1', [o.client_id]);
      cases.push({table,failed,services:services.length,linked:!!o.client_id,tokens:tokens.length});
    }
    check('batch05 setup retries account and welcome-link failures atomically', cases.every(c=>c.failed&&c.services===2&&c.linked&&c.tokens===1), cases);
    const id=await order('formed','old-address@example.test'); await fulfillPaidOrder(id,'late-confirmation');
    const [o]=await query<{client_id:string;status:string}>('SELECT client_id,status FROM orders WHERE id=$1',[id]);
    check('batch05 resumed setup preserves the associated client and filing stage',o.client_id===client&&o.status==='formed',o);
  });
  await attempt('batch05 N1.14: failed replacement preserves the prior Statement', async () => {
    const id = await order('formed'); const original: { id: string; kind: string; key: string }[] = [];
    for (const kind of ['articles', 'statement', 'psd']) { const stored = await storage.putFile(`${kind}.pdf`, pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer, 'application/pdf'); const [r] = await db.query<{ id: string }>("INSERT INTO documents(client_id,order_id,kind,title,storage_key,content_type,size_bytes) VALUES($1,$2,$3,$3,$4,'application/pdf',$5) RETURNING id", [client, id, kind, stored.storageKey, stored.sizeBytes]); original.push({ id: r.id, kind, key: stored.storageKey }); }
    const form = () => { const f = new FormData(); f.set('articles', file()); f.set('documentNumber', 'L26000000001'); f.set('certStatus', file()); f.append('psd', file()); f.append('psdSeries', JSON.stringify(['Five Company, LLC, PS A'])); return f; };
    testHooks.failFormationPutAfter = 2; const failed = await req(`/admin/orders/${id}/formation-documents`, form()); const body = await failed.json();
    const remaining = await db.query<{ id: string }>('SELECT id FROM documents WHERE order_id=$1', [id]);
    let readable = true; for (const d of original) try { readable &&= (await read(d.key)).equals(Buffer.from(pdf)); } catch { readable = false; }
    check('batch05 N1.14: failed replacement preserves the prior Statement', failed.status === 500 && remaining.length === 3 && original.every(d => remaining.some(r => r.id === d.id)) && readable, { status: failed.status, body, remaining, readable });
    const retry = await req(`/admin/orders/${id}/formation-documents`, form()); const fresh = await db.query<{ kind: string }>('SELECT kind FROM documents WHERE order_id=$1', [id]);
    check('batch05 formation retry converges to one complete package', retry.status === 200 && ['articles', 'statement', 'psd', 'certificate-of-status'].every(k => fresh.filter(d => d.kind === k).length === 1), { status: retry.status, fresh, body: await retry.json() });
  });
  await attempt('batch05 175: filing refusals describe status accurately', async () => {
    const id = await order('formed'); const messages: {status: number; body: {error: {message: string}}}[] = [];
    for (const action of ['filed', 'unfiled']) { const r = await req(`/admin/orders/${id}/${action}`, {}); messages.push({ status: r.status, body: await r.json() }); }
    check('batch05 175: filing refusals describe status accurately', messages.every(r => r.status === 400 && !r.body.error.message.includes('Complete')) && messages[0].body.error.message.includes('formed') && messages[1].body.error.message.includes('other work is owed'), messages);
  });
  await attempt('batch05 219: default manual exists before welcome and portal use', async () => {
    await db.query("DELETE FROM library_documents WHERE key='owners-manual'"); mails.length = 0;
    let manualBeforeSend = false; const fetchMail = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => { if (String(init?.body).includes('Your MyFloridaSeriesLLC client portal')) manualBeforeSend = (await query("SELECT key FROM library_documents WHERE key='owners-manual'")).length === 1; return fetchMail(input, init); }) as typeof fetch;
    await fulfillPaidOrder(await order(), 'welcome-fixture'); globalThis.fetch = fetchMail;
    const welcome = mails.find(m => m.html.includes('Set your password'));
    await db.query("DELETE FROM library_documents WHERE key='owners-manual'");
    const visit = await req('/portal/library', undefined, true); const list = await visit.json(); const download = await req('/portal/library/owners-manual/download', undefined, true);
    const bytes = Buffer.from(await download.arrayBuffer());
    check('batch05 219: default manual exists before welcome and portal use', manualBeforeSend && !!welcome?.html.includes('already in your portal') && list.data?.length === 1 && download.status === 200 && bytes.toString('ascii', 0, 4) === '%PDF', { manualBeforeSend, welcome: !!welcome?.html.includes('already in your portal'), list, download: download.status });
  });
  await attempt('batch05 manual replacement is pinned and failures retain a downloadable copy', async () => {
    const f = new FormData(); f.set('file', file()); f.set('title', 'Uploaded backup'); f.set('edition', '  ');
    const blank = await req('/admin/library/owners-manual', f); check('batch05 server refuses a blank manual edition', blank.status === 400 && (await blank.json()).error?.code === 'EDITION_REQUIRED', { status: blank.status });
    f.set('edition', 'Test edition'); const upload = await req('/admin/library/owners-manual', f);
    const [before] = await query<{ storage_key: string }>("SELECT storage_key FROM library_documents WHERE key='owners-manual'");
    await refreshOwnersManual(); await req('/admin/library'); await req('/portal/library', undefined, true);
    const [pinned] = await query<{ storage_key: string }>("SELECT storage_key FROM library_documents WHERE key='owners-manual'");
    db.query = async <T>(sql: string, params?: unknown[]) => { if (/UPDATE library_documents SET/.test(sql) || /INSERT INTO library_documents/.test(sql)) throw new Error('batch05 planned manual publication fault'); return query<T>(sql, params); };
    let failed = false; try { await refreshOwnersManual(true); } catch (e) { failed = String(e).includes('batch05 planned manual publication fault'); } finally { db.query = query; }
    const [after] = await query<{ storage_key: string }>("SELECT storage_key FROM library_documents WHERE key='owners-manual'");
    const download = await req('/portal/library/owners-manual/download', undefined, true);
    check('batch05 manual replacement is pinned and failures retain a downloadable copy', upload.status === 200 && before.storage_key === pinned.storage_key && pinned.storage_key === after.storage_key && failed && download.status === 200 && (await read(after.storage_key)).equals(Buffer.from(pdf)), { upload: upload.status, failed, before, pinned, after, download: download.status });
    const regen = await req('/admin/library/owners-manual/regenerate', {}); const [generated] = await query<{ storage_key: string; meta: { pinned?: boolean } }>("SELECT storage_key,meta FROM library_documents WHERE key='owners-manual'");
    check('batch05 explicit regeneration replaces the uploaded manual', regen.status === 200 && generated.storage_key !== after.storage_key && !generated.meta.pinned, await regen.json());
  });
  await attempt('batch05 a concurrent upload wins over manual rendering', async () => {
    let raced = false; const f = new FormData(); f.set('file', file()); f.set('title', 'Concurrent upload'); f.set('edition', 'Concurrent edition');
    db.query = async <T>(sql: string, params?: unknown[]) => { if (!raced && (/UPDATE library_documents SET/.test(sql) || /INSERT INTO library_documents/.test(sql))) { raced = true; await req('/admin/library/owners-manual', f); } return query<T>(sql, params); };
    try { await refreshOwnersManual(true); } catch { /* A changed copy must be refused. */ } finally { db.query = query; }
    const [r] = await query<{ edition: string; storage_key: string }>("SELECT edition,storage_key FROM library_documents WHERE key='owners-manual'");
    check('batch05 a concurrent upload wins over manual rendering', raced && r.edition === 'Concurrent edition' && (await read(r.storage_key)).equals(Buffer.from(pdf)), r);
  });
  await attempt('batch05 missing-manual failure preserves account access and remains retryable', async () => {
    await db.query("DELETE FROM library_documents WHERE key='owners-manual'"); mails.length = 0;
    db.query = async <T>(sql: string, params?: unknown[]) => { if (/INSERT INTO library_documents/.test(sql)) throw new Error('batch05 planned first publication fault'); return query<T>(sql, params); };
    await fulfillPaidOrder(await order(), 'failure-welcome'); const visit = await req('/admin/library'); db.query = query;
    const welcome = mails.find(m => m.html.includes('Set your password')); const retry = await req('/admin/library');
    check('batch05 missing-manual failure preserves account access and remains retryable', !!welcome && !welcome.html.includes('already in your portal') && visit.status === 500 && retry.status === 200 && (await retry.json()).data?.length === 1, { welcome: welcome?.html, visit: visit.status, retry: retry.status });
  });
  await attempt('batch05 N1.15: S package replacement failures preserve the retained copy', async () => {
    const company = await order('formed'), id = crypto.randomUUID();
    await db.query("INSERT INTO service_orders(id,client_id,type,status,llc_name,details,amount_cents,formation_order_id,paid_at) VALUES($1,$2,'s-election','awaiting_info','Five Company, LLC','{}',0,$3,now())", [id, client, company]);
    const date = new Date().toISOString().slice(0, 10);
    const merged = { ein: '881234567', dateIncorporated: date, effectiveDate: date, officerName: 'Five Client', officerTitle: 'Member', phone: '3055550100', shareholders: [{ name: 'Five Client', address: '111 Example Avenue, Miami FL 33139', percentage: 100, dateAcquired: date, ssnLast4: '6789' }] };
    const so = { id, client_id: client, llc_name: 'Five Company, LLC' };
    const built = await postSElectionPackage({ so, merged: structuredClone(merged), ssns: ['123456789'] }); if (!built.ok) throw new Error('Initial S package failed');
    const [prior] = await query<{ storage_key: string }>('SELECT storage_key FROM documents WHERE id=$1', [built.documentId]); const original = await read(prior.storage_key);
    const cases: {point: string; failed: boolean; remains: boolean; linked: boolean; same: boolean}[] = [];
    for (const point of ['storage', 'document', 'service']) {
      const root = process.env.DEV_STORAGE_DIR!;
      if (point === 'storage') { renameSync(root, root + '.held'); await Bun.write(root, 'not a directory'); }
      else db.query = async <T>(sql: string, params?: unknown[]) => { if (point === 'document' ? /INSERT INTO documents/.test(sql) : /UPDATE service_orders\s+SET details/.test(sql)) throw new Error('batch05 planned S replacement fault'); return query<T>(sql, params); };
      let failed = false; try { await postSElectionPackage({ so, merged: structuredClone(merged), ssns: ['123456789'], priorDocumentId: built.documentId }); } catch { failed = true; } finally { db.query = query; if (point === 'storage') { rmSync(root); renameSync(root + '.held', root); } }
      const remains = await query('SELECT id FROM documents WHERE id=$1', [built.documentId]); const [service] = await query<{ details: { documentId: string } }>('SELECT details FROM service_orders WHERE id=$1', [id]);
      cases.push({ point, failed, remains: remains.length === 1, linked: service.details.documentId === built.documentId, same: (await read(prior.storage_key)).equals(original) });
    }
    check('batch05 N1.15: S package replacement failures preserve the retained copy', prior.storage_key.endsWith('.encrypted') && cases.every(c => c.failed && c.remains && c.linked && c.same), cases);
  });
}
if (import.meta.main) { if (process.argv.includes('--child')) { await child(); process.exit(0); } let failed = 0; await batch05Checks((label, ok, detail) => { console.log(JSON.stringify({ label, ok, detail })); if (!ok) failed++; }); process.exit(failed ? 1 : 0); }
