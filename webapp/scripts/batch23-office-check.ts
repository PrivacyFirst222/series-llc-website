/** Batch23 B4-EMAIL-ERROR-EMPTY / B4-EIN-ERROR-MISSING.
 * Actual office components in Chromium, isolated loopback responses only.
 * --source runs the identical assertions against an unchanged baseline.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config';
import { isolateBrowser } from './browser-isolation';
const flag = process.argv.indexOf('--source');
if (flag >= 0 && !process.argv[flag + 1]) throw new Error('--source needs a repository path');
const root = flag >= 0 ? resolve(process.argv[flag + 1], 'webapp') : resolve(import.meta.dir, '..');
const rows: { label: string; ok: boolean; detail?: unknown }[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { rows.push({ label, ok, detail }); console.log(JSON.stringify(rows.at(-1))); };
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import AdminDashboard from './src/pages/admin/AdminDashboard';
import {ServiceFulfillDialog} from './src/pages/admin/ServiceOrdersSection';
import {OrdersInProgress} from './src/pages/portal/OrdersInProgress';
const query=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false},mutations:{retry:false}}});
window.fixtureRefresh=(key)=>query.invalidateQueries({queryKey:[key]});
const order={id:'ein-one',type:'ein',status:'in_progress',llc_name:'Fixture Company LLC',details:{target:'company',responsibleName:'Saved Name'},amount_cents:9900,client_id:'client-one',formation_order_id:'company-one',created_at:'2026-09-20T12:00:00Z',paid_at:'2026-09-20T12:00:00Z',fulfilled_at:null,has_secret:true,ein_pending:false,client_email:'fixture@example.test',client_name:'Fixture Client'};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><MemoryRouter>
{new URLSearchParams(location.search).get('view')==='ein'?<ServiceFulfillDialog viewing={order} onClose={()=>{}}/>:new URLSearchParams(location.search).get('view')==='recovery'?<OrdersInProgress external={null} onExternalHandled={()=>{}}/>:<AdminDashboard/>}
</MemoryRouter></QueryClientProvider>);`;
const bundled = await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', alias: { '@': resolve(root, 'src') }, define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
const css = (await postcss([tailwindcss({ ...tailwindConfig, content: [resolve(root, 'src/**/*.{ts,tsx}')] })]).process(readFileSync(resolve(root, 'src/index.css'), 'utf8').replace(/^@import url\([^\n]+\);\n/m, ''), { from: resolve(root, 'src/index.css') })).css;
const evidence = process.env.BATCH23_OFFICE_EVIDENCE_DIR;
if (evidence) mkdirSync(evidence, { recursive: true });
let historyMode = 'error', bodyMode = 'error', einMode = 'error';
let delay = 0;
const requests = { history: 0, body: 0, ein: 0 };
const unexpected: string[] = [];
const json = (data: unknown) => Response.json({ data });
const failure = () => Response.json({ error: { message: 'Fixture retrieval failure' } }, { status: 503 });
const mail = { id: 'mail-one', to_address: 'fixture@example.test', subject: 'Formation complete', sent_at: '2026-09-20T12:00:00Z', ok: true, provider_id: 'fixture-provider', error: null, html: '<p>Fixture email body</p>' };
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
  const p = new URL(req.url).pathname;
  if (p === '/app.css') return new Response(css, { headers: { 'content-type': 'text/css' } });
  if (p === '/app.js') return new Response(bundled.outputFiles[0].contents, { headers: { 'content-type': 'text/javascript' } });
  if (!p.startsWith('/api/')) return new Response('<!doctype html><html lang="en"><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>', { headers: { 'content-type': 'text/html' } });
  if (p === '/api/auth/me') return json({ name: 'Alice Smith' });
  if (p === '/api/portal/services') return json({ llcName: 'Fixture Company LLC', llcFormed: true, dev: false, sElection: {reason: 'already_ordered'}, members: [{ name: 'Alice Smith', address: '100 Main Street, Orlando, FL 32801' }], todayEastern: '2026-09-20', einCompanyOrdered: true, orders: [{ id: 'sel-recovery', type: 's-election', status: 'awaiting_info', llc_name: 'Fixture Company LLC', amount_cents: 14900, details: { taxpayerNumbersRequired: true, einPending: true, dateIncorporated: '2026-09-20', officerName: 'Alice Smith', officerTitle: 'Manager', phone: '4075551234', shareholders: [{ name: 'Alice Smith', name2: 'Bob Smith', joint: 'tbe', address: '100 Main Street, Orlando, FL 32801', percentage: 100, dateAcquired: '', ssnLast4: '', ssnLast4Second: '' }] } }] });
  if (p === '/api/address/verify') return json({ status: 'unverified', normalized: null });
  if (p === '/api/address/suggest') return json({ suggestions: [] });
  if (p === '/api/admin/me') return json({ ok: true });
  if (p === '/api/admin/clients') return json([{ id: 'client-one', email: 'fixture@example.test', name: 'Fixture Client', created_at: '2026-09-20T12:00:00Z', ra_cancellation_requested_at: null, has_password: true, document_count: 0, ra_llcs: [], companies: [] }]);
  if (p === '/api/admin/orders') return json({ orders: [], total: 0, shown: 0 });
  if (p === '/api/admin/services') return json([]);
  if (p === '/api/admin/emails') { requests.history++; if (delay) await Bun.sleep(delay); return historyMode === 'error' ? failure() : json(historyMode === 'empty' ? [] : [mail]); }
  if (p === '/api/admin/emails/mail-one') { requests.body++; if (delay) await Bun.sleep(delay); return bodyMode === 'error' ? failure() : json(mail); }
  if (p === '/api/admin/services/ein-one') { requests.ein++; if (delay) await Bun.sleep(delay); return einMode === 'error' ? failure() : json({ id: 'ein-one', type: 'ein', status: 'in_progress', llc_name: 'Fixture Company LLC', tin: einMode === 'missing' ? null : '123-45-6789', details: { responsibleName: 'Fixture Responsible Person', memberCount: 2, county: 'Orange', activity: 'Real estate' }, ssns: null }); }
  unexpected.push(`${req.method} ${p}`); return failure();
} });
const browser = await chromium.launch();
const { blocked } = isolateBrowser(browser);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(4000);
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.stack ?? String(e)));
const origin = `http://127.0.0.1:${server.port}`;
const dialog = page.getByRole('dialog');
const retry = () => dialog.getByRole('button', { name: 'Retry', exact: true });
async function settle() { await page.waitForTimeout(120); }
async function openEmails() {
  await page.goto(origin);
  await page.getByRole('tab', { name: 'Clients', exact: true }).click();
  await page.getByTestId('client-emails').click();
  await settle();
}
async function screenshot(name: string) {
  if (!evidence) return;
  await page.screenshot({ path: resolve(evidence, `${name}.png`), animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: resolve(evidence, `${name}-narrow.png`), animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 900 });
}
async function scenario(name: string, run: () => Promise<void>) { try { await run(); } catch (e) { check(`${name}: setup/runtime completed`, false, String(e)); } }
try {
  await scenario('email history failure and retry', async () => {
    await openEmails();
    check('B4-EMAIL-ERROR-EMPTY failed history names retrieval error', await dialog.getByText('We couldn’t load the email history. Please try again.', { exact: true }).count() === 1);
    check('B4-EMAIL-ERROR-EMPTY failed history never claims no mail sent', await dialog.getByTestId('emails-empty').count() === 0);
    check('B4-EMAIL-ERROR-EMPTY history Retry is available', await retry().count() === 1);
    await screenshot('history-error');
    const before = requests.history;
    let duplicateRetryBlocked = false;
    if (await retry().count()) {
      historyMode = 'success'; delay = 350;
      await retry().click(); await page.waitForTimeout(50);
      duplicateRetryBlocked = await retry().count() === 0 || await retry().isDisabled();
      await dialog.getByTestId('emails-list').waitFor(); delay = 0;
    }
    check('B4-EMAIL-ERROR-EMPTY history retry prevents duplicate clicks', duplicateRetryBlocked);
    check('B4-EMAIL-ERROR-EMPTY retry performs one lookup and restores history', requests.history === before + 1 && await dialog.getByTestId('emails-list').count() === 1);
  });
  await scenario('email body failure and retry', async () => {
    historyMode = 'success'; delay = 0; await openEmails();
    await dialog.getByRole('button', { name: /Formation complete/ }).click(); await settle();
    check('B4-EMAIL-ERROR-EMPTY body failure names retrieval error', await dialog.getByText('We couldn’t load this email. Please try again.', { exact: true }).count() === 1);
    check('B4-EMAIL-ERROR-EMPTY body failure is not endless loading', await dialog.getByText('Loading…', { exact: true }).count() === 0);
    check('B4-EMAIL-ERROR-EMPTY body Retry is available', await retry().count() === 1);
    await screenshot('body-error');
    const before = requests.body;
    if (await retry().count()) { bodyMode = 'success'; await retry().click(); await dialog.getByTestId('email-body').waitFor(); }
    check('B4-EMAIL-ERROR-EMPTY body retry restores actual email', requests.body === before + 1 && await dialog.getByTestId('email-body').count() === 1);
    if (!await dialog.getByTestId('email-body').count()) { bodyMode = 'success'; await openEmails(); await dialog.getByRole('button', { name: /Formation complete/ }).click(); await dialog.getByTestId('email-body').waitFor(); }
    check('B4-EMAIL-ERROR-EMPTY successful body remains sandboxed', await dialog.getByTestId('email-body').getAttribute('sandbox') === '' && await page.frameLocator('[data-testid="email-body"]').getByText('Fixture email body').count() === 1);
    await dialog.getByRole('button', { name: '← Back to the list', exact: true }).click();
    check('B4-EMAIL-ERROR-EMPTY body failure does not trap office in detail', await dialog.getByTestId('emails-list').count() === 1);
  });
  await scenario('successful empty history', async () => {
    historyMode = 'empty'; await openEmails();
    check('B4-EMAIL-ERROR-EMPTY successful empty lookup keeps correct empty message', await dialog.getByTestId('emails-empty').count() === 1);
    check('B4-EMAIL-ERROR-EMPTY successful empty lookup has no error or Retry', await dialog.getByRole('alert').count() === 0 && await retry().count() === 0);
    historyMode = 'error';
    await page.evaluate(() => (window as unknown as { fixtureRefresh(key: string): Promise<void> }).fixtureRefresh('admin-emails')); await settle();
    check('B4-EMAIL-ERROR-EMPTY cached empty history does not mask failed refresh', await dialog.getByTestId('emails-empty').count() === 0 && await dialog.getByRole('alert').count() === 1);
  });
  await scenario('EIN detail failure and retry', async () => {
    einMode = 'error'; await page.goto(`${origin}/?view=ein`); await settle();
    check('B4-EIN-ERROR-MISSING failed detail names retrieval error', await dialog.getByText('We couldn’t load the EIN application details. Please try again.', { exact: true }).count() === 1);
    check('B4-EIN-ERROR-MISSING failed detail never claims TIN not provided', !(await dialog.innerText()).includes('not yet provided'));
    check('B4-EIN-ERROR-MISSING assistant hidden until successful retrieval', await dialog.getByTestId('assistant-order').count() === 0);
    check('B4-EIN-ERROR-MISSING detail Retry is available', await retry().count() === 1);
    await screenshot('ein-error');
    const before = requests.ein;
    if (await retry().count()) { einMode = 'success'; await retry().click(); await dialog.getByTestId('assistant-order').waitFor(); }
    check('B4-EIN-ERROR-MISSING retry loads supplied TIN and actual assistant', requests.ein === before + 1 && (await dialog.innerText()).includes('123-45-6789') && await dialog.getByTestId('assistant-order').count() === 1);
  });
  await scenario('EIN loaded and cached-detail refresh failure', async () => {
    einMode = 'success'; await page.goto(`${origin}/?view=ein`); await dialog.getByTestId('assistant-order').waitFor();
    check('B4-EIN-ERROR-MISSING successful lookup has real responsible party', (await dialog.innerText()).includes('Fixture Responsible Person'));
    check('B4-EIN-ERROR-MISSING successful assistant preserves all21 answer rows', await dialog.getByTestId('assistant-order').locator('li').count() === 21);
    await dialog.getByRole('checkbox', { name: 'Entered: Number of members', exact: true }).check();
    einMode = 'error'; await page.evaluate(() => (window as unknown as { fixtureRefresh(key: string): Promise<void> }).fixtureRefresh('admin-service-detail')); await settle();
    check('B4-EIN-ERROR-MISSING failed refresh hides cached assistant and TIN', await dialog.getByTestId('assistant-order').count() === 0 && !(await dialog.innerText()).includes('123-45-6789'));
    check('B4-EIN-ERROR-MISSING failed refresh exposes Retry', await retry().count() === 1);
    if (await retry().count()) { einMode = 'success'; await retry().click(); await dialog.getByTestId('assistant-order').waitFor(); }
    check('B4-EIN-ERROR-MISSING assistant progress survives retry', await dialog.getByRole('checkbox', { name: 'Entered: Number of members', exact: true }).isChecked());
  });
  await scenario('EIN genuinely missing and loading', async () => {
    einMode = 'missing'; await page.goto(`${origin}/?view=ein`); await dialog.getByTestId('assistant-order').waitFor();
    check('B4-EIN-ERROR-MISSING successful lookup of absent TIN says not yet provided', (await dialog.innerText()).includes('not yet provided'));
    check('B4-EIN-ERROR-MISSING absent TIN is not a transport error', await retry().count() === 0);
    delay = 700; einMode = 'success'; await page.goto(`${origin}/?view=ein`); await dialog.waitFor();
    check('B4-EIN-ERROR-MISSING loading does not claim missing TIN', !(await dialog.innerText()).includes('not yet provided'));
    check('B4-EIN-ERROR-MISSING assistant hidden while initial load pending', await dialog.getByTestId('assistant-order').count() === 0);
    await dialog.getByTestId('assistant-order').waitFor(); delay = 0;
  });
  await scenario('restored S-election recovery entry', async () => {
    // Simulate a browser whose pre-restore nonsensitive draft still says
    // both taxpayer numbers are on file, while the restored server has none.
    await page.addInitScript(() => {
      if (new URLSearchParams(location.search).get('view') !== 'recovery') return;
      localStorage.setItem('fpsllc-draft:sel:sel-recovery', JSON.stringify({ ein: '', einPending: true, effectiveDate: '', officerName: 'Alice Smith', officerOther: false, officerTitle: 'Manager', phone: '4075551234', certified: false, timingAcknowledged: false, eligibilityAcknowledged: false, formationDateTyped: '09/20/2026', rows: [{ name: 'Alice Smith', name2: 'Bob Smith', joint: 'tbe', address: '100 Main Street, Orlando, FL 32801', address2: '', sameAddress: true, percentage: '100', dateAcquired: '', atFormation: true, ssn: '', ssn2: '', ssnLast4: '6789', ssnLast4Second: '4321' }] }));
    });
    await page.goto(`${origin}/?view=recovery`);
    await page.getByTestId('orders-in-progress').waitFor();
    check('B4-RESTORE-S-ELECTION-SECRET-STATE recovery status names the missing numbers', await page.getByText('Action needed — re-enter taxpayer numbers', { exact: true }).count() === 1);
    const recover = page.getByRole('button', { name: 'Re-enter taxpayer numbers', exact: true });
    check('B4-RESTORE-S-ELECTION-SECRET-STATE recovery button available', await recover.count() === 1);
    // Baseline uses the generic entry; continue through it so stale hints
    // are tested as well, rather than only detecting the new label.
    await (await recover.count() ? recover : page.getByRole('button', { name: 'Provide details securely', exact: true })).click();
    await dialog.waitFor();
    check('B4-RESTORE-S-ELECTION-SECRET-STATE stale on-file hints removed for both joint owners', await dialog.getByPlaceholder(/^SSN on file/).count() === 0 && await dialog.locator('[title="Leave blank to keep the number already on file"]').count() === 0);
    const needed = dialog.getByTestId('still-needed');
    check('B4-RESTORE-S-ELECTION-SECRET-STATE both joint-owner numbers explicitly required', (await needed.innerText()).includes('enter the SSN for Alice Smith') && (await needed.innerText()).includes('enter the SSN for Bob Smith'));
    check('B4-RESTORE-S-ELECTION-SECRET-STATE saved nonsensitive details remain', await dialog.getByRole('textbox', { name: 'Date the Division filed your Articles', exact: true }).inputValue() === '09/20/2026' && (await dialog.innerText()).includes('Alice Smith') && await dialog.getByRole('textbox', { name: "Co-owner's full legal name", exact: true }).inputValue() === 'Bob Smith');
    await dialog.getByRole('textbox', { name: 'SSN — Alice Smith', exact: true }).scrollIntoViewIfNeeded();
    await screenshot('s-election-recovery');
    await dialog.getByRole('textbox', { name: 'SSN — Alice Smith', exact: true }).fill('123456789');
    await dialog.getByRole('textbox', { name: 'SSN — Bob Smith', exact: true }).fill('234567890');
    await settle();
    check('B4-RESTORE-S-ELECTION-SECRET-STATE entered numbers clear their required warnings', !(await needed.innerText()).includes('enter the SSN for'));
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fpsllc-draft:sel:sel-recovery') ?? '{}'));
    check('B4-RESTORE-S-ELECTION-SECRET-STATE freshly typed numbers never written to localStorage', stored.rows?.[0]?.ssn === '' && stored.rows?.[0]?.ssn2 === '');
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await (await recover.count() ? recover : page.getByRole('button', { name: 'Provide details securely', exact: true })).click();
    check('B4-RESTORE-S-ELECTION-SECRET-STATE close and reopen preserves newly typed numbers in memory', (await dialog.getByRole('textbox', { name: 'SSN — Alice Smith', exact: true }).inputValue()).replace(/\D/g, '') === '123456789' && (await dialog.getByRole('textbox', { name: 'SSN — Bob Smith', exact: true }).inputValue()).replace(/\D/g, '') === '234567890');
  });
  // Playwright's serviceWorkers:block init script probes navigator.serviceWorker
  // even in the product's sandbox="" email iframe. The empty scripted fixture
  // cannot cause it; retain this exact instrumentation error separately, without
  // weakening either the iframe sandbox or browser isolation.
  const sandboxError = "SecurityError: Failed to read the 'serviceWorker' property from 'Navigator': Service worker is disabled because the context is sandboxed and lacks the 'allow-same-origin' flag.\n    at <anonymous>:3:15\n    at <anonymous>:5:7";
  const instrumentationErrors = errors.filter(error => error === sandboxError);
  const productErrors = errors.filter(error => error !== sandboxError);
  check('B4 office no product browser runtime errors', productErrors.length === 0, productErrors);
  check('B4 office only known sandbox instrumentation exception, if body loaded', instrumentationErrors.length <= 1, instrumentationErrors);
  check('B4 office no unexpected API calls', unexpected.length === 0, unexpected);
  check('B4 office requests remained local', blocked.size === 0, [...blocked]);
} finally { await browser.close(); server.stop(true); }
const passed = rows.filter(r => r.ok).length;
console.log(`Batch23 office: ${passed}/${rows.length} checks passed`);
if (passed !== rows.length) process.exitCode = 1;
