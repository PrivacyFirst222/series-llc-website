import { chromium, type Browser } from 'playwright';
import { mkdirSync } from 'node:fs';
import { guardedRoute, isolateBrowser } from './browser-isolation';
import { startIsolatedStack } from './isolated-stack';

/** Real Account card, deterministic API responses; server cancellation is
 * independently covered by batch04-check.ts against the routes/database. */
export async function batch04AccountWalk(browser: Browser, web: string,
  check: (ok: boolean, label: string, detail?: unknown) => void) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  let pending: string | null = 'cancelled@example.test';
  let passwordStatus = 401, passwordCalls = 0, meReads = 0, navigations = 0;
  page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
  await guardedRoute(page, '**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const data = (value: unknown) => route.fulfill({contentType: 'application/json', body: JSON.stringify({data: value})});
    if (path === '/api/auth/me') { meReads++; return data({name: 'Client', email: 'current@example.test', pendingEmail: pending}); }
    if (path === '/api/portal/account/password') {
      passwordCalls++;
      if (passwordStatus !== 200) return route.fulfill({status: passwordStatus, contentType: 'application/json', body: JSON.stringify({error: {code: 'BAD_PASSWORD', message: 'Current password is incorrect.'}})});
      pending = null; return data({ok: true});
    }
    if (path === '/api/portal/account/email') {
      pending = (route.request().postDataJSON() as {newEmail: string}).newEmail;
      return data({pendingEmail: pending});
    }
    if (path === '/api/portal/companies') return data([{orderId: 'co', llcName: 'Example LLC', formed: true, registeredAgentChoice: 'SELF'}]);
    if (path === '/api/portal/services') return data({orders: [], members: [], series: [], llcFormed: true, llcName: 'Example LLC', sElection: {eligible: false}, pricing: {seriesCents: 5000, einCents: 9500, sElectionCents: 9500, certStatusCents: 500, certifiedCopyCents: 3000}});
    if (path === '/api/portal/oa') return data({generations: [], memberManaged: true});
    return data([]);
  });
  const label = 'batch04 follow-up: cancelled email notice clears without reload';
  try {
    await page.goto(web + '/portal?company=co');
    await page.waitForLoadState('networkidle');
    const notice = page.getByText(/Pending change to cancelled@example.test/);
    await notice.waitFor();
    const navigationBefore = navigations;
    await page.getByRole('button', {name: 'Change password', exact: true}).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[name=currentPassword]').fill('Wrong-password-123');
    await dialog.locator('input[name=newPassword]').fill('New-password-123');
    await dialog.locator('input[name=confirmPassword]').fill('New-password-123');
    await dialog.getByRole('button', {name: 'Change password', exact: true}).click();
    await dialog.getByText('Current password is incorrect.', {exact: true}).waitFor();
    check(passwordCalls === 1 && pending === 'cancelled@example.test' && await notice.isVisible(),
      'batch04 follow-up: failed password change keeps pending email', {passwordCalls, pending});

    passwordStatus = 200;
    const readsBefore = meReads;
    await dialog.locator('input[name=currentPassword]').fill('Current-password-123');
    await dialog.getByRole('button', {name: 'Change password', exact: true}).click();
    await dialog.waitFor({state: 'hidden'});
    await page.getByText('Your password was changed. Any other signed-in device was signed out.', {exact: true}).waitFor();
    await notice.waitFor({state: 'hidden', timeout: 2500}).catch(() => {});
    const visible = await notice.isVisible();
    check(passwordCalls === 2 && pending === null && !visible && meReads > readsBefore && navigations === navigationBefore,
      label, {passwordCalls, pending, noticeVisible: visible, meReads, readsBefore, navigations, navigationBefore});
    if (process.env.SHOT_DIR) {
      mkdirSync(process.env.SHOT_DIR, {recursive: true});
      await page.screenshot({path: `${process.env.SHOT_DIR}/account-after-password-change.png`, fullPage: true, animations: 'disabled'});
    }

    await page.getByRole('button', {name: 'Change email', exact: true}).click();
    await dialog.locator('input[name=newEmail]').fill('next@example.test');
    await dialog.locator('input[name=currentPassword]').fill('New-password-123');
    await dialog.getByRole('button', {name: 'Send confirmation link', exact: true}).click();
    await dialog.waitFor({state: 'hidden'});
    await page.getByText(/Pending change to next@example.test/).waitFor();
    check(pending === 'next@example.test' && navigations === navigationBefore &&
      await page.getByText('Check next@example.test for a confirmation link. Your address changes only after you confirm it.', {exact: true}).isVisible(),
      'batch04 follow-up: later email change shows its new pending address', {pending, navigations, navigationBefore});
  } catch (e) { check(false, label, String(e)); }
  finally { await page.close(); }
}

if (import.meta.main) {
  const stack = await startIsolatedStack({cwd: process.cwd()});
  const browser = await chromium.launch({headless: true});
  await isolateBrowser(browser);
  let failures = 0, checks = 0;
  try { await batch04AccountWalk(browser, stack.web, (ok, label, detail) => {
    checks++; if (!ok) failures++;
    console.log(JSON.stringify({ok, label, detail}));
  }); } finally { await browser.close(); stack.stop(); }
  console.log(`Account follow-up: ${checks} checks, ${failures} failures.`);
  process.exitCode = failures ? 1 : 0;
}
