import { chromium, type Browser } from 'playwright';
import { guardedRoute, isolateBrowser } from './browser-isolation';
import { startIsolatedStack } from './isolated-stack';
import { mkdirSync } from 'node:fs';
type Check = (ok: boolean, label: string, detail?: unknown) => void;
export async function batch05Walk(browser: Browser, web: string, check: Check) {
  const page = await browser.newPage(); page.setDefaultTimeout(6000);
  const yesterday = new Date(Date.now() - 86400000 - 60000).toISOString();
  let boardStatus = 'formed', servicesStatus = 200, holdServices: Promise<void> | undefined, releaseServices: (() => void) | undefined;
  let certStatus = 503, articlesCalls = 0, uploadCalls = 0, uploadBody = '', date = '2026-09-01';
  const baseOrder = { id: 'co5', client_id: 'client5', llc_name: 'Five Company LLC', contact_name: 'Five Client', contact_email: 'five@example.test', total_cents: 0, created_at: yesterday, paid_at: yesterday, filed_at: yesterday, formed_at: yesterday, series_count: 1 };
  const baseService = { client_id: 'client5', formation_order_id: 'co5', board_order_id: 'co5', llc_name: 'Five Company LLC', amount_cents: 9500, created_at: yesterday, paid_at: yesterday, fulfilled_at: null, has_secret: true, client_email: 'five@example.test', client_name: 'Five Client' };
  const service = (id: string, type: string, status = 'in_progress') => ({ ...baseService, id, type, status, details: { target: 'company', seriesName: 'Five Company LLC - PS A', responsibleName: 'Five Client', memberCount: 1, dateIncorporated: date, effectiveDate: date, officerName: 'Five Client', shareholders: [] } });
  let services = [service('ein5', 'ein'), service('sel5', 's-election'), service('series5', 'series'), service('ein6', 'ein', 'awaiting_info')];
  await guardedRoute(page, '**/api/**', async route => {
    const u = new URL(route.request().url()), p = u.pathname;
    const data = (value: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: value }) });
    const fail = (message: string) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'FIXTURE', message } }) });
    if (p === '/api/admin/me') return data({ ok: true });
    if (p === '/api/admin/orders') {
      const work_stage = boardStatus === 'filed' ? 'state' : boardStatus === 'paid' ? 'new' : services.length ? 'post-filing' : 'completed';
      const completed = u.searchParams.get('view') === 'completed';
      const orders = [
        ...((work_stage === 'completed') === completed ? [{ ...baseOrder, status: boardStatus, work_stage }] : []),
        ...(!completed ? [{ ...baseOrder, id: 'pending5', llc_name: 'Pending Company LLC', status: 'pending_payment', work_stage: 'pending', paid_at: null }] : []),
      ];
      return data({ orders, total: completed ? orders.length : 210, shown: orders.length, page: 1, pageSize: 50 });
    }
    if (p === '/api/admin/services') { if (holdServices) await holdServices; return servicesStatus === 200 ? data(services) : fail('Services temporarily unavailable'); }
    if (p === '/api/admin/orders/co5') return data({ id: 'co5', clientId: 'client5', filingPath: 'NEW', llcName: 'Five Company LLC', status: boardStatus, contactName: 'Five Client', contactEmail: 'five@example.test', createdAt: yesterday, filedAt: yesterday, formedAt: boardStatus === 'formed' ? yesterday : null, groups: [], series: [{ name: 'Five Company LLC - PS A', covered: false }], copiedFields: {}, documents: [], services: [], alternateNames: [], hasArticles: false, articlesSignedByUs: false, certStatusPurchased: true, certifiedCopyPurchased: false, hasCertStatus: false, hasCertifiedCopy: false, documentNumber: '' });
    if (p.endsWith('/certificates')) return certStatus === 200 ? data({ notified: true }) : fail('Certificate storage unavailable — try again.');
    if (p.endsWith('/articles') && route.request().method() === 'POST') { articlesCalls++; return data({ ok: true }); }
    if (p.endsWith('/s-election-formation-date')) { date = route.request().postDataJSON().date; return data({ documentId: 'rebuilt' }); }
    if (p.startsWith('/api/admin/services/')) { const id = p.split('/').pop()!; const s = services.find(s => s.id === id); return data({ ...s, details: { ...s?.details, dateIncorporated: date, effectiveDate: date }, tin: '123456789', sElectionPaid: false }); }
    if (p === '/api/admin/clients') return data([{ id: 'client5', name: 'Five Client', email: 'five@example.test', created_at: yesterday, has_password: false, orders: [], companies: [{ id: 'co5', llc_name: 'Five Company LLC' }], documents: [], ra_llcs: [] }]);
    const email = { id: 'mail5', to_address: 'five@example.test', subject: 'Fixture welcome', sent_at: yesterday, ok: true, provider_id: 'provider-accepted', html: '<p>Example email body</p>' };
    if (p === '/api/admin/emails') return data([email]);
    if (p === '/api/admin/emails/mail5') return data(email);
    if (p === '/api/admin/library') return data([{ key: 'owners-manual', title: "Series LLC Owner's Manual", edition: 'Uploaded edition', size_bytes: 400, updated_at: yesterday }]);
    if (p === '/api/admin/library/owners-manual') { uploadCalls++; uploadBody = route.request().postDataBuffer()?.toString() ?? ''; return data({ ok: true }); }
    if (p === '/api/admin/library/owners-manual/regenerate') return data({ published: true, pages: 52, edition: 'Generated edition' });
    return data([]);
  });
  const go = async () => { await page.goto(web + '/admin'); await page.getByRole('heading', { name: 'Post-Filing Items', exact: true }).waitFor(); };
  const shot = async (name: string) => { if (process.env.SHOT_DIR) { mkdirSync(process.env.SHOT_DIR, { recursive: true }); await page.screenshot({ path: `${process.env.SHOT_DIR}/batch05-${name}.png`, fullPage: true, animations: 'disabled' }); } };
  const attempt = async (label: string, run: () => Promise<void>) => { try { await run(); } catch (e) { check(false, label, String(e)); } };
  const column = (name: string) => page.getByRole('heading', { name, exact: true }).locator('..').locator('..').locator('..');
  const pdf = { name: 'fixture.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 fixture\n%%EOF') };
  await attempt('batch05 N3.08: completion waits for service information', async () => {
    services = [];
    holdServices = new Promise<void>(r => { releaseServices = r; }); await go();
    await page.getByRole('tab', { name: 'Completed Orders', exact: true }).click();
    await page.getByTestId('service-load-status').waitFor();
    const loading = (await page.getByRole('button', { name: /Five Company LLC Five Client/ }).count()) === 0 && (await page.locator('body').innerText()).includes('Checking remaining service orders');
    servicesStatus = 503; releaseServices!(); holdServices = undefined;
    await page.getByTestId('service-load-status').getByRole('button', { name: 'Try again' }).waitFor({ timeout: 15000 });
    const failed = (await page.getByRole('button', { name: /Five Company LLC Five Client/ }).count()) === 0 && (await page.locator('body').innerText()).includes('We could not check the remaining service orders');
    check(loading && failed, 'batch05 N3.08: completion waits for service information', { loading, failed, screen: await page.locator('main').innerText() }); await shot('service-load-failure');
    servicesStatus = 200;
    await page.getByTestId('service-load-status').getByRole('button', { name: 'Try again' }).click();
    await page.getByRole('button', { name: /Five Company LLC Five Client/ }).waitFor();
    check((await column('Completed Orders').innerText()).includes('Five Company LLC'), 'batch05 completion is shown after a successful empty service list');
    services = [service('ein5', 'ein'), service('sel5', 's-election'), service('series5', 'series'), service('ein6', 'ein', 'awaiting_info')];
  });
  await attempt('batch05 176: certificate errors appear beside certificates', async () => {
    boardStatus = 'filed'; await go(); await page.getByRole('button', { name: /Five Company LLC Five Client/ }).click(); await page.getByLabel(/Upload a Certificate of Status/).setInputFiles(pdf); await page.getByTestId('upload-certificates').click(); await page.waitForTimeout(250);
    const box = await page.getByTestId('certificates-owed').innerText(); const articles = await page.getByTestId('articles-upload-error').allTextContents();
    check(box.includes('Certificate storage unavailable') && !articles.join('').includes('Certificate storage unavailable'), 'batch05 176: certificate errors appear beside certificates', { box, articles }); await shot('certificate-error');
    certStatus = 200; await page.getByTestId('upload-certificates').click(); await page.getByTestId('certificate-upload-result').waitFor(); check(!(await page.getByTestId('certificate-upload-error').isVisible()), 'batch05 certificate retry clears the correct error');
  });
  await attempt('batch05 177: Articles number validation matches the server', async () => {
    boardStatus = 'filed'; await go(); await page.getByRole('button', { name: /Five Company LLC Five Client/ }).click(); await page.getByLabel(/Filed Articles of Organization/).setInputFiles(pdf); await page.getByLabel(/Florida document number \(from/).fill('L26OOOOOOOOO'); await page.getByRole('button', { name: 'Upload Articles', exact: true }).click(); await page.waitForTimeout(250);
    const error = await page.getByTestId('articles-upload-error').allTextContents(); check(articlesCalls === 0 && error.join('').includes('letter L followed by eleven digits'), 'batch05 177: Articles number validation matches the server', { articlesCalls, error });
    await page.getByLabel(/Florida document number \(from/).fill('L26000000001'); await page.getByRole('button', { name: 'Upload Articles', exact: true }).click(); await page.waitForTimeout(250); check(articlesCalls === 1, 'batch05 valid optional Articles number submits');
  });
  await attempt('batch05 178:s-election-date-row: corrected dates have neutral labels', async () => {
    await go(); await page.getByRole('button', { name: /S Election/ }).click(); const dialog = page.getByRole('dialog'); await page.getByLabel('Corrected date filed by the Division').fill('2026-09-03'); await page.getByRole('button', { name: 'Correct date & rebuild' }).click(); await page.waitForTimeout(350); const text = await dialog.innerText();
    check(text.includes('Articles filing date / Election effective date:') && text.includes('2026-09-03 / 2026-09-03') && !text.includes('entered by client'), 'batch05 178:s-election-date-row: corrected dates have neutral labels', text); await shot('corrected-election-date');
  });
  await attempt('batch05 178:series-uploaded-text: series instructions describe this upload', async () => {
    await go(); await page.getByRole('button', { name: /PS A/ }).click(); const text = await page.getByRole('dialog').innerText(); check(text.includes('Upload the filed Protected Series Designation here, then mark the order fulfilled.'), 'batch05 178:series-uploaded-text: series instructions describe this upload', text);
  });
  await attempt('batch05 178:typed-ein-survives: abandoned EIN drafts are cleared', async () => {
    await go(); const button = page.getByRole('button', { name: /^EIN/ }).first(); await button.click(); await page.getByLabel('EIN as issued', { exact: true }).fill('881234567'); await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click(); await button.click(); const value = await page.getByLabel('EIN as issued', { exact: true }).inputValue();
    check(value === '', 'batch05 178:typed-ein-survives: abandoned EIN drafts are cleared', { value });
  });
  await attempt('batch05 181: board wording matches counts search and status', async () => {
    await go(); await page.getByLabel('Search by LLC name, client name, or email').fill('Five'); await page.waitForTimeout(350); const board = await page.locator('main').innerText(); const nextEnabled = !(await page.getByRole('button', { name: 'Next', exact: true }).isDisabled()); await page.getByRole('button', { name: /^EIN.*Waiting/ }).click(); const detail = await page.getByRole('dialog').innerText();
    check(board.includes('oldest 1 day —') && board.includes('Showing 1–2 of 210 active orders') && nextEnabled && board.includes('Waiting for client details') && detail.includes('Waiting for client details'), 'batch05 181: board wording matches counts search and status', { board, detail });
  });
  await attempt('batch05 180: regeneration explains uploaded-manual replacement', async () => {
    await go(); await page.getByRole('tab', { name: 'Reference Library' }).click(); const text = await page.locator('main').innerText();
    check(text.includes('Regenerating replaces the currently published manual, including any PDF you uploaded by hand, with a new PDF from the master.'), 'batch05 180: regeneration explains uploaded-manual replacement', text); await shot('manual-options');
  });
  await attempt('batch05 185: manual upload requires an edition', async () => {
    await go(); await page.getByRole('tab', { name: 'Reference Library' }).click(); await page.getByLabel('Replacement PDF for the manual').setInputFiles(pdf); const button = page.getByRole('button', { name: 'Replace edition', exact: true }); const empty = await button.isDisabled(); await page.getByLabel('Edition label').fill('   '); const whitespace = await button.isDisabled();
    check(empty && whitespace && uploadCalls === 0, 'batch05 185: manual upload requires an edition', { empty, whitespace, uploadCalls });
    await page.getByLabel('Edition label').fill('  First reviewed edition  '); await button.click(); await page.getByText("Published — every client's next download is this edition.").waitFor(); check(uploadCalls === 1 && /name="edition"\r\n\r\nFirst reviewed edition\r\n/.test(uploadBody), 'batch05 manual upload sends the trimmed explicit edition', uploadBody);
  });
  await attempt('batch05 173: account label reflects password state', async () => {
    await go(); await page.getByRole('tab', { name: 'Clients', exact: true }).click(); const text = await page.locator('main').innerText(); check(text.includes('No password yet') && !text.includes('Invite sent'), 'batch05 173: account label reflects password state', text);
  });
  await attempt('batch05 174: email history describes provider acceptance and limit', async () => {
    await go(); await page.getByRole('tab', { name: 'Clients', exact: true }).click(); await page.getByTestId('client-emails').click(); await page.getByTestId('emails-list').waitFor(); const list = await page.getByRole('dialog').innerText(); await page.getByRole('button', { name: /Fixture welcome/ }).click(); await page.getByTestId('email-body').waitFor(); const detail = await page.getByRole('dialog').innerText();
    check(list.includes('latest 500 recorded emails') && list.includes('Accepted by email provider') && detail.includes('Accepted by email provider (id provider-accepted)') && !detail.includes('delivered (id'), 'batch05 174: email history describes provider acceptance and limit', { list, detail }); await shot('email-history');
  });
  releaseServices?.(); await page.close();
}
if (import.meta.main) { const stack = await startIsolatedStack({ cwd: process.cwd() }); const browser = await chromium.launch({ headless: true }); await isolateBrowser(browser); let failed = 0; try { await batch05Walk(browser, stack.web, (ok, label, detail) => { console.log(JSON.stringify({ label, ok, detail: ok ? undefined : detail })); if (!ok) failed++; }); } finally { await browser.close(); stack.stop(); } process.exit(failed ? 1 : 0); }
