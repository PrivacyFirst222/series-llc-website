/** Actual portal presentation with synthetic HTTP responses, not backend/access qualification.
 * All traffic is loopback-only; unrelated interactive child cards are omitted.
 * Run: bun run scripts/chunk1-legal-mail-check.ts /absolute/evidence/directory
 */
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { guardedContextRoute, isolateBrowser } from './browser-isolation';

const root = resolve(import.meta.dir, '..');
const out = process.argv[2] || mkdtempSync(join(tmpdir(), 'chunk1-legal-mail-'));
if (!out?.startsWith('/')) throw new Error('An absolute evidence directory is required');
mkdirSync(out, { recursive: true });
const mutation = process.argv.includes('--mutation=drop-company-dependency');
const baselinePath = process.argv.find(arg => arg.startsWith('--baseline-portal='))?.slice('--baseline-portal='.length);
if (mutation && baselinePath) throw new Error('Choose a baseline or a mutation, not both');
const baselineSource = baselinePath ? readFileSync(baselinePath, 'utf8') : undefined;
const rows: { id: string; result: string; failure_code?: string; detail?: unknown }[] = [];
const requests: string[] = [], unexpected: string[] = [], errors: string[] = [];
const omitted = ['ServicesCard', 'OrdersInProgress', 'AccountCard', 'ViewingAsBanner', 'UpdateRenewalCard'];
let mode = 'normal';
let releasePending: (() => void) | undefined;
function releasePendingRequest() { releasePending?.(); }
const companies = [
  { orderId: 'company-a', llcName: 'Company A', raService: false },
  { orderId: 'company-b', llcName: 'Company B', raService: false },
];
const docs = ['a', 'b'].flatMap(company => ['legal_mail', 'package'].map(kind => ({
  id: `${kind}-${company}`, kind, title: `${kind === 'legal_mail' ? 'Mail' : 'Package'} ${company.toUpperCase()}`,
  order_id: `company-${company}`, created_at: '2026-09-25T12:00:00Z', size_bytes: 100,
})));
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {MemoryRouter} from 'react-router-dom';
import Portal from './src/pages/portal/PortalDashboard';
// Keep the application's default retry count; shorten only retry delay.
const q=new QueryClient({defaultOptions:{queries:{retryDelay:20,refetchOnWindowFocus:false}}});window.fixtureQuery=q;
createRoot(document.getElementById('root')).render(<QueryClientProvider client={q}><MemoryRouter initialEntries={['/portal'+location.search]}><Portal/></MemoryRouter></QueryClientProvider>);`;
let mutationApplied = false;
const bundle = await build({ stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true,
  write: false, platform: 'browser', format: 'esm', jsx: 'automatic', alias: { '@': root + '/src' },
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'isolated-presentation', setup(b) {
    b.onResolve({ filter: /^\.\// }, args => {
      const name = args.path.split('/').at(-1)!;
      return omitted.includes(name) ? { path: name, namespace: 'omitted' } : undefined;
    });
    b.onLoad({ filter: /.*/, namespace: 'omitted' }, args => ({ contents: `export const ${args.path}=()=>null;`, loader: 'js' }));
    if (baselineSource !== undefined) b.onLoad({ filter: /PortalDashboard\.tsx$/ }, () => ({ contents: baselineSource, loader: 'tsx' }));
    if (mutation) b.onLoad({ filter: /PortalDashboard\.tsx$/ }, args => {
      const original = readFileSync(args.path, 'utf8');
      const changed = original.replace('companiesQuery.isPending || docsQuery.isPending', 'docsQuery.isPending')
        .replace('companiesQuery.isError || docsQuery.isError', 'docsQuery.isError');
      if (changed === original || !original.includes('companiesQuery.isPending || docsQuery.isPending') || !original.includes('companiesQuery.isError || docsQuery.isError')) throw new Error('Mutation anchors absent');
      mutationApplied = true;
      writeFileSync(out + '/mutated-PortalDashboard.tsx', changed);
      return { contents: changed, loader: 'tsx' };
    });
  } }],
});
const js = bundle.outputFiles[0].text;
writeFileSync(out + '/tested-browser.js', js);
// Load the real stylesheet, using the same Tailwind configuration as the website.
const { default: config } = await import(root + '/tailwind.config.ts');
const { default: postcss } = await import('postcss');
const { default: tailwindcss } = await import('tailwindcss');
const css = (await postcss([tailwindcss({ ...config, content: [root + '/src/**/*.{tsx,ts}'] })]).process(
  readFileSync(root + '/src/index.css', 'utf8').replace(/^@import url\([^\n]+\);\n/m, ''), { from: root + '/src/index.css' })).css;
const json = (data: unknown) => Response.json({ data });
const failure = () => Response.json({ error: { code: 'FIXTURE_UNAVAILABLE', message: 'Fixture unavailable' } }, { status: 503 });
const server = Bun.serve({ hostname: '127.0.0.1', port: 0, async fetch(req) {
  const p = new URL(req.url).pathname;
  if (p === '/app.js') return new Response(js, { headers: { 'content-type': 'text/javascript' } });
  if (p === '/app.css') return new Response(css, { headers: { 'content-type': 'text/css' } });
  if (!p.startsWith('/api/')) return new Response('<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script>window.fixtureFalseEmpty=false;const allowEmpty=' + JSON.stringify(['empty-a', 'empty-account'].includes(mode)) + ';new MutationObserver(()=>{if(!allowEmpty&&document.getElementById("root").textContent.includes("Nothing here — that\'s good news"))window.fixtureFalseEmpty=true;}).observe(document.getElementById("root"),{subtree:true,childList:true,characterData:true});</script><script type="module" src="/app.js"></script></body></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  requests.push(`${mode} ${req.method} ${p}${new URL(req.url).search}`);
  if (req.method !== 'GET') { unexpected.push(req.method + ' ' + p); return failure(); }
  if (p === '/api/auth/me') return json({ name: 'Fixture Client', email: 'fixture@example.test' });
  if (p === '/api/portal/companies') {
    if (mode === 'companies-pending') await new Promise<void>(resolve => { releasePending = resolve; });
    if (mode === 'companies-error' || mode === 'both-error') return failure();
    return json(mode === 'empty-account' ? [] : mode === 'single' ? companies.slice(0, 1) : companies);
  }
  if (p === '/api/portal/documents') {
    if (mode === 'documents-pending') await new Promise<void>(resolve => { releasePending = resolve; });
    if (mode === 'documents-error' || mode === 'both-error') return failure();
    return json(mode === 'empty-account' ? [] : mode === 'empty-a' ? docs.filter(d => d.order_id === 'company-b') : mode === 'single' ? [...docs.filter(d => d.order_id === 'company-a'), { ...docs[1], id: 'legacy', title: 'Legacy package', order_id: null }] : docs);
  }
  if (p === '/api/portal/services') return json({ orders: [], members: [], series: [], llcFormed: true });
  if (p === '/api/portal/oa') return json({ seed: { llcName: 'Company A' }, generations: [], memberManaged: true });
  if (p === '/api/portal/library') return json([]);
  unexpected.push(p); return failure();
} });
const browser = await chromium.launch();
const isolation = isolateBrowser(browser);
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await guardedContextRoute(context, '**/*', route => {
  const u = new URL(route.request().url());
  if (u.origin !== `http://127.0.0.1:${server.port}`) { unexpected.push(u.origin); return route.abort(); }
  if (mode === 'companies-network' && u.pathname === '/api/portal/companies') { requests.push('companies-network aborted'); return route.abort(); }
  return route.continue();
});
const page = await context.newPage();
page.setDefaultTimeout(5000);
page.on('pageerror', error => errors.push(String(error)));
const mail = () => page.locator('div.overflow-hidden').filter({ has: page.getByRole('heading', { name: 'Legal mail', exact: true }) }).first();
const packages = () => page.locator('div.overflow-hidden').filter({ has: page.getByRole('heading', { name: 'Your documents', exact: true }) }).first();
const settled = () => page.waitForFunction(() => (window as unknown as { fixtureQuery: { isFetching(): number } }).fixtureQuery?.isFetching() === 0);
async function go(next: string, query = '') { mode = next; await page.goto(`http://127.0.0.1:${server.port}/${query}`); await settled(); }
async function check(id: string, test: () => Promise<boolean>) {
  let row;
  try {
    // Query idleness can precede React's commit. Wait for the asserted DOM
    // state, not a guessed delay or a rerun of the whole case. The observer
    // latches any false-empty render, so eventual success cannot conceal it.
    const deadline = Date.now() + 5000;
    let passed = false;
    do {
      if (await page.evaluate(() => (window as unknown as { fixtureFalseEmpty: boolean }).fixtureFalseEmpty)) break;
      passed = await test();
      if (passed) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    } while (Date.now() < deadline);
    const falseEmpty = await page.evaluate(() => (window as unknown as { fixtureFalseEmpty: boolean }).fixtureFalseEmpty);
    row = { id, result: passed && !falseEmpty ? 'pass' : 'fail', detail: { text: await mail().innerText(), falseEmpty } };
  }
  catch (e) { row = { id, result: 'fail', failure_code: 'HARNESS_ERROR', detail: String(e) }; }
  if (row.result === 'fail' && !('failure_code' in row)) Object.assign(row, { failure_code: 'COMPANY_DOCUMENT_STATE' });
  rows.push(row);
  writeFileSync(`${out}/${id}.txt`, await page.locator('body').innerText());
  await page.screenshot({ path: `${out}/${id}.png`, fullPage: true });
  console.log(JSON.stringify(row));
}
const noFalseEmpty = async () => !(await mail().innerText()).includes("Nothing here — that's good news");
const hasMailA = async () => (await mail().innerText()).includes('Mail A') && !(await mail().innerText()).includes('Mail B');
try {
  await go('normal');
  // Exercise the observer itself, including its latch after the text disappears.
  const observerWorks = await page.evaluate(async () => {
    const probe = document.createElement('p'); probe.textContent = "Nothing here — that's good news";
    document.getElementById('root')!.append(probe);
    await new Promise(resolve => requestAnimationFrame(resolve)); probe.remove();
    return (window as unknown as { fixtureFalseEmpty: boolean }).fixtureFalseEmpty;
  });
  rows.push({ id: 'false-empty-observer-selfcheck', result: observerWorks ? 'pass' : 'fail' });
  await go('normal');
  await check('normal-default-company', async () => await hasMailA() && (await packages().innerText()).includes('Package A') && !(await packages().innerText()).includes('Package B'));
  await page.getByRole('tab', { name: 'Company B', exact: true }).click(); await settled();
  await check('switch-company', async () => (await mail().innerText()).includes('Mail B') && !(await mail().innerText()).includes('Mail A') && (await packages().innerText()).includes('Package B') && !(await packages().innerText()).includes('Package A'));
  for (const pending of ['companies-pending', 'documents-pending']) {
    mode = pending; releasePending = undefined;
    await page.goto(`http://127.0.0.1:${server.port}/`);
    const other = pending === 'companies-pending' ? 'portal-documents' : 'portal-companies';
    await page.waitForFunction(key => (window as unknown as { fixtureQuery: { getQueryState(k: string[]): { status: string } } }).fixtureQuery?.getQueryState([key])?.status === 'success', other);
    await check(pending, async () => await noFalseEmpty() && (await mail().innerText()).includes('Loading') && !(await packages().innerText()).includes('Package B'));
    releasePendingRequest(); await settled();
    await check(pending + '-resolved', hasMailA);
  }
  for (const error of ['companies-error', 'companies-network', 'documents-error', 'both-error']) {
    await go(error);
    await check(error, async () => await noFalseEmpty() && await mail().getByRole('alert').count() === 1 && !(await packages().innerText()).includes('Package B'));
    if (await mail().getByRole('button', { name: 'Retry', exact: true }).count()) {
      mode = 'normal'; await mail().getByRole('button', { name: 'Retry', exact: true }).click(); await settled();
      await check(error + '-retry', hasMailA);
    } else {
      rows.push({ id: error + '-retry', result: 'fail', failure_code: 'RETRY_MISSING' });
    }
  }
  const hasOnlyB = async () => (await mail().innerText()).includes('Mail B') && !(await mail().innerText()).includes('Mail A') && (await packages().innerText()).includes('Package B') && !(await packages().innerText()).includes('Package A');
  for (const error of ['companies-error', 'documents-error', 'both-error']) {
    await go(error, '?company=company-b');
    await check('explicit-' + error, async () => await noFalseEmpty() && await mail().getByRole('alert').count() === 1);
    if (await mail().getByRole('button', { name: 'Retry', exact: true }).count()) {
      mode = 'normal'; await mail().getByRole('button', { name: 'Retry', exact: true }).click(); await settled();
      await check('explicit-' + error + '-retry', hasOnlyB);
    } else rows.push({ id: 'explicit-' + error + '-retry', result: 'fail', failure_code: 'RETRY_MISSING' });
  }
  for (const pending of ['companies-pending', 'documents-pending']) {
    mode = pending; releasePending = undefined;
    const pendingStart = requests.length;
    await page.goto(`http://127.0.0.1:${server.port}/?company=company-b`);
    const other = pending === 'companies-pending' ? 'portal-documents' : 'portal-companies';
    await page.waitForFunction(key => (window as unknown as { fixtureQuery: { getQueryState(k: string[]): { status: string } } }).fixtureQuery?.getQueryState([key])?.status === 'success', other);
    await page.waitForFunction(() => (window as unknown as { fixtureQuery: { getQueriesData(o: { queryKey: string[] }): unknown[][] } }).fixtureQuery.getQueriesData({ queryKey: ['portal-services'] }).some(([, data]) => data !== undefined));
    await check('explicit-' + pending, async () => await noFalseEmpty() && (await mail().innerText()).includes('Loading') && !(await packages().innerText()).includes('Package A') && requests.slice(pendingStart).filter(r => r.includes(' GET /api/portal/services')).every(r => r.endsWith('?company=company-b')));
    releasePendingRequest(); await settled();
    await check('explicit-' + pending + '-resolved', hasOnlyB);
  }
  for (const account of ['normal', 'single']) {
    await go(account, '?company=missing');
    await check('stale-selection-' + account, async () => await hasMailA() && (await packages().innerText()).includes('Package A') && !(await packages().innerText()).includes('Package B'));
  }
  await go('empty-a');
  await check('successful-empty-selected-company', async () => (await mail().innerText()).includes("Nothing here — that's good news") && !(await mail().innerText()).includes('Mail B'));
  await go('empty-account');
  await check('successful-empty-account', async () => (await mail().innerText()).includes("Nothing here — that's good news"));
  await go('single');
  await check('single-company-legacy-package', async () => await hasMailA() && (await packages().innerText()).includes('Legacy package'));
  await go('normal'); mode = 'companies-error';
  await page.evaluate(() => (window as unknown as { fixtureQuery: { refetchQueries(o: { queryKey: string[] }): Promise<void> } }).fixtureQuery.refetchQueries({ queryKey: ['portal-companies'] })); await settled();
  await check('cached-company-refetch-error', async () => await noFalseEmpty() && await mail().getByRole('alert').count() === 1);
  if (await mail().getByRole('button', { name: 'Retry', exact: true }).count()) {
    mode = 'normal'; await mail().getByRole('button', { name: 'Retry', exact: true }).click(); await settled();
    await check('cached-company-refetch-retry', hasMailA);
  } else rows.push({ id: 'cached-company-refetch-retry', result: 'fail', failure_code: 'RETRY_MISSING' });
  rows.push({ id: 'fixture-isolation', result: !unexpected.length && !errors.length && !isolation.blocked.size ? 'pass' : 'fail', detail: { unexpected, errors, blocked: [...isolation.blocked] } });
} finally {
  releasePendingRequest(); await browser.close(); server.stop(true);
  writeFileSync(out + '/results.json', JSON.stringify({ scope: 'Actual portal DOM; fake HTTP; no backend/auth/access/provider execution', baselinePath, baselineSha256: baselineSource === undefined ? undefined : createHash('sha256').update(baselineSource).digest('hex'), mutation, mutationApplied, browserBundleSha256: createHash('sha256').update(js).digest('hex'), rows, requests, unexpected, errors, blocked: [...isolation.blocked] }, null, 2) + '\n');
  console.log('REVIEW_ASSERTIONS:' + JSON.stringify({ assertions: rows }));
}
if (rows.some(row => row.result !== 'pass')) process.exitCode = 1;
