import { chromium, type Browser } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assembleOa, type OaInputs } from '../server/oa';
import { taxationLabel as clientTax } from '../src/lib/datetime';
import { taxationLabel as serverTax } from '../server/datetime';
import { guardedRoute, isolateBrowser } from './browser-isolation';
import { startIsolatedStack } from './isolated-stack';

type Check = (ok: boolean, label: string, detail?: unknown) => void;
// Expected form descriptions are independent of the production label table.
const forms: [OaInputs['version'], string, string][] = [
  ['single', 'Manager-Managed Single-Member (Disregarded Entity)', 'Disregarded entity'],
  ['single-s', 'Manager-Managed Single-Member (S Corporation)', 'S Corporation'],
  ['member-single', 'Member-Managed Single-Member (Disregarded Entity)', 'Disregarded entity'],
  ['member-single-s', 'Member-Managed Single-Member (S Corporation)', 'S Corporation'],
  ['multi', 'Manager-Managed Multi-Member (Partnership)', 'Partnership'],
  ['s', 'Manager-Managed Multi-Member (S Corporation)', 'S Corporation'],
  ['member', 'Member-Managed Multi-Member (Partnership)', 'Partnership'],
  ['member-s', 'Member-Managed Multi-Member (S Corporation)', 'S Corporation'],
];
const company = 'Twelve Holdings LLC';
const help = 'Reported through its owner for federal income-tax purposes.';
export async function batch12Walk(browser: Browser, web: string, check: Check) {
  const results: { version: string; tax: boolean; title: boolean; details: unknown }[] = [];
  for (const [index, [version, form, tax]] of forms.entries()) {
    const number = index + 3; // Numbers are stored, not positions in the list.
    const title = `Amended and Restated Operating Agreement — ${form} (No. ${number}) — ${company}`;
    const input: OaInputs = {
      version, companyName: company, principalAddress: '123 Main Street, Orlando, FL 32801',
      managerNames: ['Twelve Manager'], effectiveDate: 'September 19, 2026',
      amendedRestated: true, priorAgreementDate: 'August 1, 2026', generationNumber: number,
      borrowingThreshold: 5000, competition: 'B', includeCapitalCalls: false, includeShotgun: false,
      members: [{ name: 'Twelve Owner', address: '123 Main Street', percentage: 100, contribution: '$100', todBeneficiary: '' }],
      series: [{ name: `${company} - PS 1`, purpose: 'Holding property', contribution: '$100' }],
    };
    const amended = assembleOa(input), first = assembleOa({ ...input, amendedRestated: false });
    if (process.env.BATCH12_ASSEMBLY_DIR) {
      mkdirSync(process.env.BATCH12_ASSEMBLY_DIR, { recursive: true });
      writeFileSync(join(process.env.BATCH12_ASSEMBLY_DIR, `${version}-amended.md`), amended.markdown);
      writeFileSync(join(process.env.BATCH12_ASSEMBLY_DIR, `${version}-first.md`), first.markdown);
    }
    const page = await browser.newPage({ viewport: { width: index % 2 ? 390 : 1440, height: 1000 } });
    page.setDefaultTimeout(6000);
    try {
      await guardedRoute(page, '**/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const send = (data: unknown) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) });
        if (path === '/api/auth/me') return send({ name: 'Twelve Owner', email: 'twelve@example.test', raService: false });
        if (path === '/api/portal/companies') return send([{ orderId: 'co12', llcName: company, formed: true, registeredAgentChoice: 'SELF' }]);
        if (path === '/api/portal/oa') return send({
          version, multiOwner: !version.includes('single'), memberManaged: version.startsWith('member'), rev: 0, blocked: false,
          todayEastern: '2026-09-19', templateVersion: 'First Edition — August 2026', answers: {},
          seed: { llcName: company, filingPath: 'NEW', members: [{ name: 'Twelve Owner', address: '123 Main Street' }], series: [], principalAddress: '123 Main Street', managerNames: ['Twelve Manager'], managementStructure: version.startsWith('member') ? 'MEMBER_MANAGED' : 'MANAGER_MANAGED' },
          generations: [{ id: 'g12', document_id: 'd12', version, amended_restated: true, generation_number: number, created_at: '2026-09-19T16:00:00Z', template_version: 'First Edition — August 2026' }],
        });
        if (path === '/api/portal/documents') return send([{ id: 'd12', kind: 'package', title: 'Legacy Operating Agreement', order_id: 'co12', company_name: company, created_at: '2026-09-19T16:00:00Z', size_bytes: 200 }]);
        if (path === '/api/portal/services') return send({ llcName: company, dev: true, llcFormed: true, members: [], series: [], orders: [], sElection: { eligible: false, reason: 'window_closed' }, pricing: {} });
        if (path === '/api/portal/oa/answers') return send({ ok: true, rev: 1 });
        return send([]);
      });
      await page.goto(web + '/portal/agreement?company=co12');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const history = page.getByRole('heading', { name: 'Your agreements', exact: true }).locator('..').locator('..');
      await history.waitFor();
      const historyText = await history.innerText();
      if (process.env.SHOT_DIR) { mkdirSync(process.env.SHOT_DIR, { recursive: true }); await history.screenshot({ path: join(process.env.SHOT_DIR, `history-${version}.png`) }); }
      await page.goto(web + '/portal?company=co12');
      const row = page.getByTestId('document-row').filter({ has: page.locator('a[href="/api/portal/documents/d12/download"]') });
      await row.waitFor();
      // Wait for the independent OA metadata query as well as the document query.
      await row.getByText('Most recently generated', { exact: true }).waitFor();
      const documentText = await row.innerText();
      if (process.env.SHOT_DIR) await row.screenshot({ path: join(process.env.SHOT_DIR, `document-${version}.png`) });
      const taxOk = clientTax(version) === tax && serverTax(version) === tax && historyText.includes(tax) && documentText.includes(tax)
        && (tax !== 'Disregarded entity' || (historyText.includes(help) && documentText.includes(help)));
      const titleOk = amended.title === title && first.title === title.replace('Amended and Restated ', '') && historyText.includes(title) && documentText.includes(title);
      results.push({ version, tax: taxOk, title: titleOk, details: { historyText, documentText, assembled: amended.title, expected: title } });
    } catch (error) { results.push({ version, tax: false, title: false, details: String(error) }); }
    finally { await page.close(); }
  }
  check(results.length === 8 && results.every(r => r.tax) && clientTax('unknown') === '' && serverTax('unknown') === '', 'batch12 33: all eight tax labels and disregarded help render consistently', results);
  check(results.length === 8 && results.every(r => r.title), 'batch12 127: all eight forms share full titles across assembly and both portal lists', results);
  const page = await browser.newPage();
  try {
    await page.goto(web + '/faq');
    await page.getByRole('button', { name: /What's the federal tax treatment/ }).click();
    const text = await page.locator('main').innerText();
    check(text.includes('For new LLCs we form, our $95 S-election package prepares Form 2553 for you to sign and file. Order it within 65 days of paying for your formation.'), 'batch12 39: FAQ states the new formation service window', text);
    if (process.env.SHOT_DIR) await page.screenshot({ path: join(process.env.SHOT_DIR, 'faq-service.png'), fullPage: true });
  } finally { await page.close(); }
  const preserved: [string, string][] = [
    ['src/pages/WhatIs.tsx', 'one EIN-friendly'],
    ['src/pages/Benefits.tsx', '{ label: "Tax filings", oldVal: "10 returns", newVal: "1 return" }'],
    ['src/lib/form2553Timing.ts', 'only U.S. residents can be S corporation shareholders'],
    ['src/components/home/MothershipDiagram.tsx', 'a single tax filing and'],
    ['src/content/oaLearnMore.tsx', 'your personal tax return; with multiple owners, it is taxed as a partnership.'],
    ['../docs/owners-manual.md', '**Three things will end an election faster than any drafting error:**'],
    ['../docs/owners-manual.md', 'Paying one owner more than their percentage — even briefly, even as a "loan" nobody papers — is the most common way small S corporations get into trouble.'],
  ];
  check(preserved.every(([path, text]) => readFileSync(join(process.cwd(), path), 'utf8').includes(text)), 'batch12 scope: all six rejected corrections remain unchanged');
}
if (import.meta.main) {
  const stack = await startIsolatedStack({ cwd: process.cwd() });
  const browser = await chromium.launch({ headless: true });
  await isolateBrowser(browser);
  let failures = 0;
  try { await batch12Walk(browser, stack.web, (ok, label, detail) => { console.log(JSON.stringify({ ok, label, detail })); if (!ok) failures++; }); }
  finally { await browser.close(); stack.stop(); }
  process.exit(failures ? 1 : 0);
}
