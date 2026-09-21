/** Batch22 B3-02/B3-03/B3-05: exercise the actual portal components in Chromium.
 * All API responses are supplied by an ephemeral loopback fixture; real route,
 * storage and PDF boundary checks are independently in server/batch22-check.ts.
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { mkdirSync, readFileSync } from 'node:fs';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import tailwindConfig from '../tailwind.config';
import { isolateBrowser } from './browser-isolation';

const sourceFlag = process.argv.indexOf('--source');
if (sourceFlag >= 0 && !process.argv[sourceFlag + 1]) throw new Error('--source requires a repository path');
const root = sourceFlag >= 0 ? resolve(process.argv[sourceFlag + 1], 'webapp') : resolve(import.meta.dir, '..');
const rows: { label: string; ok: boolean; detail?: unknown }[] = [];
const check = (label: string, ok: boolean, detail?: unknown) => { rows.push({ label, ok, detail }); console.log(JSON.stringify(rows.at(-1))); };
const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {OrdersInProgress} from './src/pages/portal/OrdersInProgress';
import {AccountCard} from './src/pages/portal/AccountCard';
import OAQuestionnaire from './src/pages/portal/OAQuestionnaire';
const mode=new URLSearchParams(location.search).get('view');
const query=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false},mutations:{retry:false}}});
createRoot(document.getElementById('root')).render(<QueryClientProvider client={query}><MemoryRouter initialEntries={['/portal/oa?company=fixture']}>
{mode==='ein'?<OrdersInProgress external={null} onExternalHandled={()=>{}}/>:mode==='account'?<AccountCard email="old@example.test" pendingEmail={null}/>:<OAQuestionnaire/>}
</MemoryRouter></QueryClientProvider>);`;
const bundled = await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, format: 'esm', platform: 'browser', jsx: 'automatic', alias: { '@': resolve(root, 'src') }, define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' });
// Keep the product CSS; only remote font fetching is omitted in this offline fixture.
const css = (await postcss([tailwindcss({ ...tailwindConfig, content: [resolve(root, 'src/**/*.{ts,tsx}')] })]).process(readFileSync(resolve(root, 'src/index.css'), 'utf8').replace(/^@import url\([^\n]+\);\n/m, ''), { from: resolve(root, 'src/index.css') })).css;
const evidenceDir = process.env.BATCH22_EVIDENCE_DIR;
if (evidenceDir) mkdirSync(evidenceDir, { recursive: true });
let mailMode = 'failure';
let ownerCount = 99;
let blankLast = false;
const saves: Record<string, unknown>[] = [];
const generations: Record<string, unknown>[] = [];
let emailRequests = 0;
const members = () => Array.from({ length: ownerCount }, (_, i) => ({ id: `owner-${i}`, name: blankLast && i === ownerCount - 1 ? '' : `Owner ${i + 1} Person`, address: blankLast && i === ownerCount - 1 ? '' : '100 Main Street, Orlando, FL 32801', percentage: 100 / ownerCount }));
const json = (data: unknown, status = 200) => Response.json({ data }, { status });
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
  const url = new URL(req.url);
  if (url.pathname === '/app.css') return new Response(css, { headers: { 'content-type': 'text/css' } });
  if (url.pathname === '/app.js') return new Response(bundled.outputFiles[0].contents, { headers: { 'content-type': 'text/javascript' } });
  if (!url.pathname.startsWith('/api/')) return new Response('<!doctype html><html lang="en"><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>', { headers: { 'content-type': 'text/html' } });
  if (url.pathname === '/api/auth/me') return json({ email: 'old@example.test', name: 'Fixture Owner' });
  if (url.pathname === '/api/portal/services') return json({ llcName: 'Company A', dev: false, members: [], pricing: {}, sElection: { reason: 'ok' }, llcFormed: true, todayEastern: '2026-09-20', orders: ['A', 'B'].map(id => ({ id, type: 'ein', status: 'awaiting_info', llc_name: `Company ${id}`, details: { target: 'company' }, amount_cents: 9900 })) });
  if (url.pathname === '/api/portal/account/email') { emailRequests++; return mailMode === 'failure' ? Response.json({ error: { code: 'EMAIL_SEND_FAILED', message: 'We could not send the confirmation link. Please try again.' } }, { status: 503 }) : json({ ok: true, pendingEmail: 'new@example.test', oldAddressNoticeSent: mailMode === 'success' }); }
  if (url.pathname === '/api/portal/oa') { const m = members(); return json({ seed: { llcName: 'Owners Fixture LLC', filingPath: 'new', managementStructure: 'member', managerNames: [], principalAddress: '100 Main Street', members: m, suggestedOwners: [{ name: 'Suggested Person', address: '100 Main Street, Orlando, FL 32801' }], series: [] }, version: 'member-multi', multiOwner: true, memberManaged: true, todayEastern: '2026-09-20', templateVersion: 'fixture', rev: 0, generations: [], answers: { members: m, multiOwner: true, firstOrAmended: 'first', authorized: true, sElection: false, competition: 'A', includeCapitalCalls: false, includeShotgun: false, borrowingThreshold: 1000, assets: [{ id: 'asset-one', description: 'Fixture cash', kind: 'cash', value: 100, contributedBy: { mode: 'shares', shares: m.map(() => 100 / ownerCount), unitIds: m.map(m => m.id) } }] } }); }
  if (url.pathname === '/api/portal/oa/answers') { saves.push(await req.json()); return json({ rev: Number(url.searchParams.get('rev')) }); }
  if (url.pathname === '/api/portal/oa/generate') { generations.push(await req.json()); return json({ documentId: 'fixture-document', title: 'Fixture agreement' }); }
  if (url.pathname === '/api/address/verify') return json({ status: 'unverified', normalized: null });
  if (url.pathname === '/api/address/suggest') return json({ suggestions: [] });
  return Response.json({ error: { message: `Unexpected fixture endpoint: ${url.pathname}` } }, { status: 404 });
} });
const browser = await chromium.launch();
const { blocked } = isolateBrowser(browser);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(5000);
const browserErrors: string[] = [];
page.on('pageerror', e => browserErrors.push(String(e)));
const origin = `http://127.0.0.1:${server.port}`;
async function shot(name: string) {
  if (!evidenceDir) return;
  await page.screenshot({ path: resolve(evidenceDir, name + '.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 375, height: 812 });
  if (name === 'owner100-limit') await page.getByRole('button', { name: 'Add owner', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(evidenceDir, name + '-narrow.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1280, height: 900 });
}
async function scenario(name: string, fn: () => Promise<void>) { try { await fn(); } catch (error) { check(`${name}: setup/runtime completed`, false, String(error)); } }
try {
  await scenario('B3-02 certification', async () => {
    await page.goto(`${origin}/?view=ein`);
    const openButtons = page.getByRole('button', { name: 'Provide details securely' });
    await openButtons.nth(0).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="responsibleFirst"]').fill('Alice');
    await dialog.getByRole('checkbox').check();
    check('B3-02 first application can be certified', await dialog.getByRole('checkbox').isChecked());
    await page.keyboard.press('Escape');
    await openButtons.nth(0).click();
    check('B3-02 reopening same application clears certification', !await dialog.getByRole('checkbox').isChecked());
    check('B3-02 reopening preserves nonsensitive answers', await dialog.locator('input[name="responsibleFirst"]').inputValue() === 'Alice');
    await dialog.getByRole('checkbox').check();
    await page.keyboard.press('Escape');
    await openButtons.nth(1).click();
    check('B3-02 different application is not certified', !await dialog.getByRole('checkbox').isChecked());
    check('B3-02 different application cannot submit before certification', await dialog.getByRole('button', { name: 'Certify and submit securely' }).isDisabled());
    check('B3-02 different application does not receive prior answers', await dialog.locator('input[name="responsibleFirst"]').inputValue() === '');
    await page.keyboard.press('Escape');
  });
  await scenario('B3-03 email feedback', async () => {
    await page.goto(`${origin}/?view=account`);
    await page.getByRole('button', { name: 'Change email', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name="newEmail"]').fill('new@example.test');
    await dialog.locator('input[name="currentPassword"]').fill('fixture-password');
    await dialog.getByRole('button', { name: 'Send confirmation link' }).click();
    await page.getByText('We could not send the confirmation link. Please try again.', { exact: true }).waitFor();
    await shot('email-confirmation-failure');
    check('B3-03 failure leaves same dialog and email for retry', await dialog.isVisible() && await dialog.locator('input[name="newEmail"]').inputValue() === 'new@example.test');
    check('B3-03 failure does not promise inbox delivery', await page.getByText(/Check new@example.test for a confirmation link/).count() === 0);
    mailMode = 'old-failure';
    await dialog.getByRole('button', { name: 'Send confirmation link' }).click();
    await page.getByText(/Check new@example.test for a confirmation link/).waitFor();
    check('B3-03 same request can retry immediately', emailRequests === 2);
    check('B3-03 old-address notice failure is disclosed separately', await page.getByText(/could not send the security notice to your current address/).count() === 1);
    await dialog.waitFor({ state: 'hidden' });
    await shot('email-old-notice-warning');
    check('B3-03 sign-in email remains unchanged before confirmation', await page.getByText('old@example.test', { exact: true }).count() === 1);
    mailMode = 'success';
    await page.getByRole('button', { name: 'Change email', exact: true }).click();
    await dialog.locator('input[name="newEmail"]').fill('new@example.test');
    await dialog.locator('input[name="currentPassword"]').fill('fixture-password');
    await dialog.getByRole('button', { name: 'Send confirmation link' }).click();
    await page.getByText(/Check new@example.test for a confirmation link/).waitFor();
    check('B3-03 successful retry clears previous warning', await page.getByText(/could not send the security notice to your current address/).count() === 0);
  });
  await scenario('B3-05 owner limit', async () => {
    await page.goto(`${origin}/?view=oa`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const add = page.getByRole('button', { name: 'Add owner', exact: true });
    check('B3-05 ninety-nine owners still permits owner100', await add.isEnabled());
    await add.click();
    check('B3-05 owner100 is editable', await page.getByRole('textbox', { name: 'Full legal name of owner 100', exact: true }).count() === 1);
    await add.scrollIntoViewIfNeeded();
    await shot('owner100-limit');
    check('B3-05 blank Add owner cannot create101', await add.isDisabled());
    check('B3-05 owner capacity explained before entry', await page.getByText('You can list up to 100 owners in this questionnaire.', { exact: true }).count() === 1);
    await page.getByRole('button', { name: 'Add Suggested Person', exact: true }).click();
    check('B3-05 suggestion fills existing blank100', await page.getByRole('textbox', { name: 'Full legal name of owner 100', exact: true }).inputValue() === 'Suggested Person');
    await page.waitForTimeout(600);
    check('B3-05 save includes all100 owners', (saves.at(-1)?.members as unknown[] | undefined)?.length === 100);
    ownerCount = 100; blankLast = false;
    await page.goto(`${origin}/?view=oa`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const suggestion = page.getByRole('button', { name: 'Add Suggested Person', exact: true });
    check('B3-05 suggestion cannot append101 when all rows filled', await suggestion.count() === 0 || await suggestion.isDisabled());
    check('B3-05 full100 owner contribution allocations all render', await page.getByRole('textbox', { name: /^Share of asset 1 contributed by Owner/ }).count() === 100);
    await page.getByRole('textbox', { name: 'Share of asset 1 contributed by Owner 100 Person', exact: true }).fill('1.0');
    await page.waitForTimeout(600);
    const saved = saves.at(-1) as { members?: unknown[]; assets?: { contributedBy?: { shares?: number[]; unitIds?: string[] } }[] };
    check('B3-05 full100 allocations survive save payload', saved.members?.length === 100 && saved.assets?.[0]?.contributedBy?.shares?.length === 100 && saved.assets[0].contributedBy.unitIds?.length === 100);
    await page.getByRole('button', { name: 'Generate Operating Agreement (PDF)', exact: true }).click();
    await page.waitForTimeout(200);
    const generated = generations.at(-1) as typeof saved;
    check('B3-05 generation submits all100 owners and allocations', generated?.members?.length === 100 && generated.assets?.[0]?.contributedBy?.shares?.length === 100);
  });
  check('B3-02/B3-03/B3-05 no browser runtime errors', browserErrors.length === 0, browserErrors);
  check('B3-02/B3-03/B3-05 all requests remain local', blocked.size === 0, [...blocked]);
} finally { await browser.close(); server.stop(true); }
const passed = rows.filter(r => r.ok).length;
console.log(`Batch22 portal: ${passed}/${rows.length} checks passed`);
if (passed !== rows.length) process.exitCode = 1;
