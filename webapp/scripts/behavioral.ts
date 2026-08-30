/**
 * The behavioral gate: a real browser buys what the site sells.
 *
 *   bun run scripts/behavioral.ts
 *
 * Exists because of P52: fifteen audits called the site production-ready
 * while conversion and manager-managed orders could not be submitted at all,
 * and every API-level fixture — written from the schema by the same author
 * as the validation — carried exactly the fields the schema wanted, so the
 * suite could never disagree with itself. Here the baseline is the product:
 * Chromium drives the wizard through every entity variation a customer can
 * buy, clicks what a customer clicks, types what a customer types, and the
 * gate passes only when the STORED order (read back through the admin API)
 * contains field-for-field what was chosen on screen.
 *
 * Success signals from the UI are never trusted: a run passes on ground
 * truth, not on toasts.
 */
import { chromium, type Page } from "playwright";
import { spawn, type Subprocess } from "bun";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API_PORT = 3300 + Math.floor(Math.random() * 500);
const WEB_PORT = 3900 + Math.floor(Math.random() * 500);
const API = `http://localhost:${API_PORT}`;

type RunConfig = {
  key: string;
  label: string;
  path: "new" | "convert";
  formationType: "DOMESTIC_LLC" | "PLLC";
  management: "MEMBER_MANAGED" | "MANAGER_MANAGED";
  ra: "SERVICE" | "SELF";
  llcName: string;
  designator: string;
  memberEntity?: boolean;
  managerEntity?: boolean;
  addons?: { ein?: boolean; sElection?: boolean; certificate?: boolean; certifiedCopy?: boolean };
  exactNameOnly?: boolean;
  requestedEffectiveDate?: string;
  extraSeries?: number; // beyond the first
  separateMailing?: boolean;
  weSign?: boolean;
};

const RUNS: RunConfig[] = [
  { key: "A", label: "new LLC, member-managed, our RA", path: "new", formationType: "DOMESTIC_LLC", management: "MEMBER_MANAGED", ra: "SERVICE", llcName: "Gate Run Alpha", designator: "LLC" },
  { key: "B", label: "new LLC, manager-managed, self RA, entity member", path: "new", formationType: "DOMESTIC_LLC", management: "MANAGER_MANAGED", ra: "SELF", llcName: "Gate Run Bravo", designator: "L.L.C.", memberEntity: true },
  { key: "C", label: "new PLLC, member-managed, self RA", path: "new", formationType: "PLLC", management: "MEMBER_MANAGED", ra: "SELF", llcName: "Gate Run Charlie", designator: "P.L.L.C." },
  { key: "D", label: "new PLLC, manager-managed, our RA, EIN + S election", path: "new", formationType: "PLLC", management: "MANAGER_MANAGED", ra: "SERVICE", llcName: "Gate Run Delta", designator: "PLLC", addons: { ein: true, sElection: true } },
  { key: "E", label: "conversion, member-managed, our RA", path: "convert", formationType: "DOMESTIC_LLC", management: "MEMBER_MANAGED", ra: "SERVICE", llcName: "Gate Run Echo, LLC", designator: "" },
  { key: "F", label: "conversion, manager-managed, self RA", path: "convert", formationType: "DOMESTIC_LLC", management: "MANAGER_MANAGED", ra: "SELF", llcName: "Gate Run Foxtrot, LLC", designator: "" },
  { key: "G", label: "new LLC, exact name only, dated, certificates, 4 series", path: "new", formationType: "DOMESTIC_LLC", management: "MEMBER_MANAGED", ra: "SERVICE", llcName: "Gate Run Golf", designator: "Limited Liability Company", exactNameOnly: true, requestedEffectiveDate: "2026-10-01", addons: { certificate: true, certifiedCopy: true }, extraSeries: 3 },
  { key: "H", label: "new LLC, entity manager, separate mailing, we sign", path: "new", formationType: "DOMESTIC_LLC", management: "MANAGER_MANAGED", ra: "SERVICE", llcName: "Gate Run Hotel", designator: "LLC", managerEntity: true, separateMailing: true, weSign: true },
];

const failures: string[] = [];
let checks = 0;
function expect(cond: unknown, what: string, got?: unknown): void {
  checks++;
  if (!cond) {
    failures.push(`${what}${got !== undefined ? ` — got ${JSON.stringify(got)?.slice(0, 200)}` : ""}`);
    console.log(`  ❌ ${what}`);
  }
}

/** Advance past the current step; the wizard debounces (name check) so a
 *  refused click is retried before we conclude the step is stuck. */
async function advance(page: Page, buttonText = "Continue"): Promise<void> {
  const before = await stepHeading(page);
  console.log(`    · ${before}`);
  for (let attempt = 0; attempt < 6; attempt++) {
    // Anchored: hasText is case-insensitive substring matching, so a bare
    // "Continue" also matches "Save & continue later" — which is exactly the
    // button this clicked for the first hour of its life.
    const btn = page.locator("main button").filter({ hasText: new RegExp(`^${buttonText}`) }).first();
    await btn.click();
    try {
      await page.waitForFunction(
        (prev) => document.querySelector("main h2")?.textContent?.trim() !== prev,
        before,
        { timeout: 2500 },
      );
      return;
    } catch {
      /* still on the step — settle and retry */
      await page.waitForTimeout(1200);
    }
  }
  const errs = await page.locator('main [role="alert"], main .text-destructive').allTextContents();
  throw new Error(`stuck on "${before}": ${errs.filter(Boolean).slice(0, 4).join(" | ")}`);
}

async function stepHeading(page: Page): Promise<string> {
  return (await page.locator("main h2").first().textContent())?.trim() ?? "";
}

async function fill(page: Page, label: string, value: string): Promise<void> {
  await page.getByLabel(label, { exact: false }).first().fill(value);
}

/** Our Radix select: open the trigger, click the option, VERIFY the trigger
 *  now shows it — a click racing the step transition can silently miss. */
async function choose(page: Page, triggerSelector: string, optionText: string): Promise<void> {
  const trigger = page.locator(triggerSelector).first();
  for (let attempt = 0; attempt < 4; attempt++) {
    await trigger.click();
    const opt = page.getByRole("option", { name: optionText, exact: false }).first();
    try {
      await opt.click({ timeout: 3000 });
    } catch {
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(400);
      continue;
    }
    await page.waitForTimeout(150);
    const shown = (await trigger.textContent()) ?? "";
    if (shown.trim().length > 0 && optionText.includes(shown.trim().split("\n")[0].slice(0, 4))) return;
    if (shown.includes(optionText.slice(0, 6))) return;
    await page.waitForTimeout(300);
  }
  throw new Error(`select ${triggerSelector} refused option ${optionText}`);
}

/** Choice cards are labels wrapping hidden radios; some are buttons. */
async function clickCard(page: Page, text: string | RegExp): Promise<void> {
  await page.locator("main label, main button").filter({ hasText: text }).first().click();
}

async function checkAllBoxes(page: Page, excludeIds: string[] = []): Promise<void> {
  const boxes = page.locator('main input[type="checkbox"]');
  const n = await boxes.count();
  for (let i = 0; i < n; i++) {
    const box = boxes.nth(i);
    if ((await box.isVisible().catch(() => false)) && !excludeIds.includes((await box.getAttribute("id")) ?? "")) {
      if (!(await box.isChecked())) {
        // The name step re-renders as its availability check answers, which
        // can destabilize a mid-click element — fall back to a DOM click.
        await box.check({ force: true, timeout: 3000 }).catch(() => box.dispatchEvent("click"));
        await page.waitForTimeout(100);
      }
    }
  }
}

async function driveRun(page: Page, run: RunConfig): Promise<{ orderId: string; totalCents: number }> {
  let captured: { orderId: string; totalCents: number } | null = null;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const target = `${API}${url.pathname}${url.search}`;
    const resp = await fetch(target, {
      method: route.request().method(),
      headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.88.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` },
      body: route.request().postData() ?? undefined,
    });
    const body = await resp.text();
    if (url.pathname === "/api/orders" && route.request().method() === "POST" && resp.status !== 200) {
      console.log(`    ✗ /api/orders ${resp.status}: ${body.slice(0, 400)}`);
    }
    if (url.pathname === "/api/orders" && route.request().method() === "POST" && resp.status === 200) {
      const parsed = JSON.parse(body) as { data?: { orderId?: string; totalCents?: number } };
      if (parsed.data?.orderId) captured = { orderId: parsed.data.orderId, totalCents: parsed.data.totalCents ?? 0 };
    }
    await route.fulfill({ status: resp.status, contentType: resp.headers.get("content-type") ?? "application/json", body });
  });

  await page.goto(`http://localhost:${WEB_PORT}/form-llc?path=${run.path}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:${WEB_PORT}/form-llc?path=${run.path}`);
  await page.waitForSelector("main h2");

  // Eligibility: formation type card + acknowledgments.
  expect((await stepHeading(page)).includes("Eligibility"), `${run.key}: starts on Eligibility (path preset skipped step 1)`, await stepHeading(page));
  await clickCard(page, run.formationType === "PLLC" ? "Domestic Florida PLLC" : "Domestic Florida LLC");
  await checkAllBoxes(page);
  await advance(page);

  // Your information.
  await fill(page, "First name", "Casey");
  await fill(page, "Last name", "Gatecheck");
  await fill(page, "Email", "gate@e2e.test");
  await fill(page, "Confirm email", "gate@e2e.test");
  await fill(page, "Street address", "100 Ocean Drive");
  await fill(page, "City", "Miami");
  await choose(page, "#client-state, [id$='-state']", "FL — Florida");
  await fill(page, "ZIP", "33139");
  await advance(page);

  // Name step: new formations choose a name; conversions identify the company.
  if (run.path === "new") {
    await fill(page, "Desired LLC name", run.llcName);
    await choose(page, "#llc-designator", run.designator);
    if (run.exactNameOnly) {
      await page.locator('label[for="exact-name-only"], #exact-name-only').last().click();
      await page.waitForFunction(() => (document.getElementById("exact-name-only") as HTMLInputElement | null)?.checked === true, undefined, { timeout: 3000 });
    } else {
      await fill(page, "Alternate name #1", `${run.llcName} Backup`);
    }
    await checkAllBoxes(page, ["exact-name-only"]);
    await advance(page);
  } else {
    await fill(page, "Existing LLC name", run.llcName);
    await fill(page, "Sunbiz document number", "L24000123456");
    await advance(page);
  }

  // Principal address.
  await fill(page, "Street address", "200 Biscayne Blvd");
  await fill(page, "City", "Miami");
  await choose(page, "[id$='-state']", "FL — Florida");
  await fill(page, "ZIP", "33131");
  await advance(page);

  // Mailing address: a radio pair, not a checkbox.
  if (run.separateMailing) {
    await clickCard(page, /different mailing address/i);
    await page.waitForTimeout(300);
    await fill(page, "Street address", "PO Box 4477");
    await fill(page, "City", "Orlando");
    await choose(page, "[id$='-state']", "FL — Florida");
    await fill(page, "ZIP", "32802");
  }
  await advance(page);

  // Series: its ownership acknowledgment, then one identifier per row.
  await checkAllBoxes(page);
  const seriesCount = 1 + (run.extraSeries ?? 0);
  const rows = page.getByLabel("Series identifier", { exact: false });
  for (let i = 0; i < seriesCount; i++) {
    if ((await rows.count()) <= i) {
      // Anchored ^Add — /add/i also matches the sidebar's "Principal ADDress".
      await page.locator("main button").filter({ hasText: /^Add\b/ }).first().click();
      await page.waitForTimeout(300);
    }
    await rows.nth(i).fill(`PS ${["Alpha", "Beta", "Gamma", "Delta"][i]}`);
    await rows.nth(i).blur();
  }
  await advance(page);

  // Registered agent.
  if (run.ra === "SERVICE") {
    await clickCard(page, /first year included/i);
  } else {
    await clickCard(page, /serve as my own/i);
    await page.waitForTimeout(300);
    // By id: the choice card's own label CONTAINS phrases like "Florida
    // street address", so label lookup finds the card's hidden radio.
    await page.locator("#ra-first-name").fill("Casey");
    await page.locator("#ra-last-name").fill("Gatecheck");
    await page.locator("#ra-street").fill("200 Biscayne Blvd");
    await page.locator("#ra-city").fill("Miami");
    await page.locator("#ra-zip").fill("33131");
    await checkAllBoxes(page);
  }
  await advance(page);

  // Acceptance appears ONLY for a self agent (P-series: choosing our service
  // must skip it — asserted by heading, not assumed).
  if (run.ra === "SELF") {
    expect((await stepHeading(page)).toLowerCase().includes("acceptance"), `${run.key}: self agent sees the acceptance step`, await stepHeading(page));
    await page.locator("#ra-accept-name").fill("Casey Gatecheck");
    await page.locator("#ra-accept-signature").fill("Casey Gatecheck");
    await checkAllBoxes(page);
    await advance(page);
  } else {
    expect(!(await stepHeading(page)).toLowerCase().includes("acceptance"), `${run.key}: our service skips the acceptance step`, await stepHeading(page));
  }

  // Management structure.
  await clickCard(page, run.management === "MEMBER_MANAGED" ? /^member-managed|member-managed —|members run/i : /manager-managed/i);
  await advance(page);

  // Managers or members — whichever the structure shows.
  const peopleHeading = await stepHeading(page);
  if (run.management === "MANAGER_MANAGED") {
    expect(/manager/i.test(peopleHeading), `${run.key}: manager-managed collects managers`, peopleHeading);
    if ((await page.locator("main input").count()) === 0) {
      await page.locator("main button", { hasText: /add manager/i }).first().click();
      await page.waitForTimeout(300);
    }
    if (run.managerEntity) {
      await choose(page, "[id$='-type']", "Business Entity");
      await fill(page, "Business entity name", "Gate Managers of Florida, Inc.");
    } else {
      await fill(page, "First name", "Morgan");
      await fill(page, "Last name", "Manager");
    }
    await fill(page, "Street address", "300 Brickell Ave");
    await fill(page, "City", "Miami");
    await choose(page, "[id$='-state']", "FL — Florida");
    await fill(page, "ZIP", "33131");
  } else {
    expect(/member/i.test(peopleHeading), `${run.key}: member-managed collects members`, peopleHeading);
    if (run.memberEntity) {
      await choose(page, "[id$='-type']", "Entity");
      await fill(page, "Entity name", "Gate Member Holdings, Inc.");
    } else {
      await fill(page, "First name", "Casey");
      await fill(page, "Last name", "Gatecheck");
    }
    await fill(page, "Street address", "100 Ocean Drive");
    await fill(page, "City", "Miami");
    await choose(page, "[id$='-state']", "FL — Florida");
    await fill(page, "ZIP", "33139");
    const pct = page.getByLabel(/ownership/i).first();
    if (await pct.isVisible().catch(() => false)) await pct.fill("100");
  }
  await advance(page);

  // Purpose. A PLLC must state its professional purpose.
  if (run.formationType === "PLLC") {
    await page.locator("main textarea").first().fill("The practice of law");
  }
  await advance(page);

  // Effective date.
  if (run.requestedEffectiveDate) {
    await page.locator("main label", { hasText: /specific|requested|choose/i }).first().click();
    await page.locator('main input[type="date"]').first().fill(run.requestedEffectiveDate);
  }
  await advance(page);

  // Correspondence.
  await fill(page, "Contact name", "Casey Gatecheck");
  await fill(page, "Email", "gate@e2e.test");
  await fill(page, "Confirm email", "gate@e2e.test");
  await advance(page);

  // Optional docs and add-ons.
  const wants: Array<[RegExp, boolean]> = [
    [/certificate of status/i, !!run.addons?.certificate],
    [/certified copy/i, !!run.addons?.certifiedCopy],
    [/ein/i, !!run.addons?.ein],
    [/s corporation|s election/i, !!run.addons?.sElection],
  ];
  for (const [pattern, want] of wants) {
    const box = page.locator("main label", { hasText: pattern }).locator('input[type="checkbox"]').first();
    if (await box.isVisible().catch(() => false)) {
      const checked = await box.isChecked();
      if (want && !checked) await box.check({ force: true });
      if (!want && checked) await box.uncheck({ force: true });
    } else if (want) {
      expect(false, `${run.key}: add-on control ${pattern} not found on optional docs`);
    }
  }
  await advance(page);

  // Review → certify.
  await advance(page, "Continue");

  // Certify & sign.
  if (run.weSign) {
    await clickCard(page, /signs for me/i);
  } else {
    await clickCard(page, /I will sign/i);
    await page.waitForTimeout(200);
    const rep = page.getByLabel(/representative name/i).first();
    if (await rep.isVisible().catch(() => false)) await rep.fill("Casey Gatecheck");
    const sig2 = page.getByLabel(/electronic signature/i).first();
    if (await sig2.isVisible().catch(() => false)) await sig2.fill("Casey Gatecheck");
  }
  await checkAllBoxes(page);

  // Submit navigates to the (fake) checkout, so the page leaves the SPA —
  // success is the CAPTURED accepted POST, not any heading. A submit that
  // instead bounces to an earlier step is a real finding: dump its errors.
  await page.locator("main button").filter({ hasText: /^Submit intake/ }).first().click();
  for (let i = 0; i < 40 && !captured; i++) await page.waitForTimeout(500);
  if (!captured) {
    const where = await stepHeading(page).catch(() => "(page navigated)");
    const errs = await page.locator('main [role="alert"], main .text-destructive').allTextContents().catch(() => []);
    const toast = await page.locator("li").allTextContents().catch(() => []);
    throw new Error(`${run.key}: submit did not produce an accepted order — landed on "${where}"; errors: ${errs.filter(Boolean).slice(0, 5).join(" | ")}; toast: ${toast.join(" ").slice(0, 200)}`);
  }
  await page.unroute("**/api/**");
  return captured;
}

async function main(): Promise<void> {
  // 1) Fresh, hermetic backend: empty database, offline integrations.
  const freshDir = mkdtempSync(join(tmpdir(), "behavioral-pg-"));
  const api: Subprocess = spawn(["bun", "server/dev.ts"], {
    env: { ...process.env, DEV_PG_DIR: freshDir, PORT: String(API_PORT), E2E_OFFLINE: "1" },
    stdout: "ignore",
    stderr: "pipe",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${API}/api/health`);
      if (r.status === 200) break;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
    if (i === 59) throw new Error("API never became healthy");
  }

  // 2) The PRODUCTION frontend build, served statically with SPA fallback —
  //    the gate tests what ships, not the dev server.
  // `bun run behavioral` builds first; a bare script run reuses an existing
  // dist only if one exists, and says so.
  if (!existsSync("dist/index.html")) {
    const build = spawn(["bunx", "vite", "build"], { stdout: "ignore", stderr: "inherit" });
    if ((await build.exited) !== 0) throw new Error("vite build failed");
  } else {
    console.log("(using existing dist/ — run `bun run behavioral` to rebuild first)");
  }
  const web = Bun.serve({
    port: WEB_PORT,
    async fetch(req) {
      const path = new URL(req.url).pathname;
      const file = Bun.file(join("dist", path === "/" ? "index.html" : path));
      if (await file.exists()) return new Response(file);
      return new Response(Bun.file("dist/index.html"));
    },
  });

  const browser = await chromium.launch();
  const adminLogin = await fetch(`${API}/api/admin/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: "dev-admin" }) });
  const adminCookie = (adminLogin.headers.get("set-cookie") ?? "").split(";")[0];

  const only = process.env.RUN?.split(",");
  for (const run of RUNS.filter((r) => !only || only.includes(r.key))) {
    console.log(`\n▶ Run ${run.key}: ${run.label}`);
    const page = await browser.newPage();
    try {
      const { orderId, totalCents } = await driveRun(page, run);

      // Ground truth: the stored order, read through the admin API.
      await fetch(`${API}/api/dev/simulate-payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      const full = await fetch(`${API}/api/admin/orders/${orderId}`, { headers: { Cookie: adminCookie } }).then((r) => r.json()) as { data?: Record<string, unknown> };
      const order = full.data as { status?: string; payload?: unknown; llcName?: string; totalCents?: number } | undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload = (typeof order?.payload === "string" ? JSON.parse(order.payload) : order?.payload) as Record<string, any>;
      expect(payload, `${run.key}: stored order has a payload`);
      if (!payload) continue;

      expect(payload.filingPath === (run.path === "new" ? "NEW" : "CONVERT"), `${run.key}: stored filingPath matches the pricing card used`, payload.filingPath);
      expect(payload.formationType === run.formationType, `${run.key}: stored formationType matches the card clicked`, payload.formationType);
      expect(payload.management?.structure === run.management, `${run.key}: stored management structure matches`, payload.management?.structure);
      expect(payload.registeredAgent?.choice === run.ra, `${run.key}: stored agent choice matches`, payload.registeredAgent?.choice);
      if (run.ra === "SERVICE") {
        expect(/FLORIDA PROTECTED SERIES/i.test(String(payload.registeredAgent?.businessEntityName ?? payload.registeredAgent?.name ?? "")), `${run.key}: service agent stored with OUR canonical identity, not the customer's typing`, payload.registeredAgent);
      } else {
        expect(String(payload.registeredAgent?.name ?? "").includes("Gatecheck"), `${run.key}: self agent stored with the customer's own name`, payload.registeredAgent?.name);
      }
      if (run.path === "new") {
        const finalName = String(payload.llcName?.finalName ?? "");
        expect(finalName.startsWith(run.llcName), `${run.key}: stored name starts with what was typed`, finalName);
        expect(finalName.includes(run.designator), `${run.key}: stored name carries the designator chosen in the dropdown`, finalName);
        expect(payload.llcName?.exactNameOnly === !!run.exactNameOnly, `${run.key}: exact-name-only stored as chosen`, payload.llcName?.exactNameOnly);
      } else {
        expect(payload.existingLlcName === run.llcName, `${run.key}: stored existing-LLC name matches`, payload.existingLlcName);
        expect(order?.llcName === run.llcName, `${run.key}: conversion order is NAMED by the converted company`, order?.llcName);
      }
      if (run.management === "MANAGER_MANAGED") {
        const members = payload.members?.memberList ?? [];
        expect(members.length === 0, `${run.key}: no scaffold member leaked from the hidden members step`, members.length);
        const mgrs = (payload.management?.managersOrAuthorizedRepresentatives ?? []).filter((m: { role?: string }) => (m.role ?? "MGR") === "MGR");
        expect(mgrs.length >= 1, `${run.key}: the manager typed on screen is stored`, payload.management);
        if (run.managerEntity) expect(JSON.stringify(mgrs).includes("Gate Managers of Florida"), `${run.key}: entity manager stored by its entity name`, mgrs[0]);
      } else {
        const members = payload.members?.memberList ?? [];
        expect(members.length >= 1, `${run.key}: the member typed on screen is stored`, members.length);
        if (run.memberEntity) expect(JSON.stringify(members).includes("Gate Member Holdings"), `${run.key}: entity member stored by its entity name`, members[0]);
      }
      const storedSeries = payload.series ?? [];
      expect(storedSeries.length === 1 + (run.extraSeries ?? 0), `${run.key}: stored series count matches rows added on screen`, storedSeries.length);
      expect(!!payload.optionalDocuments?.ein === !!run.addons?.ein, `${run.key}: EIN add-on stored as chosen`, payload.optionalDocuments);
      expect(!!payload.optionalDocuments?.sElection === !!run.addons?.sElection, `${run.key}: S-election stored as chosen`, payload.optionalDocuments);
      expect(!!payload.optionalDocuments?.certificateOfStatus === !!run.addons?.certificate, `${run.key}: certificate of status stored as chosen`, payload.optionalDocuments);
      expect(!!payload.optionalDocuments?.certifiedCopy === !!run.addons?.certifiedCopy, `${run.key}: certified copy stored as chosen`, payload.optionalDocuments);
      if (run.requestedEffectiveDate) {
        expect(JSON.stringify(payload).includes(run.requestedEffectiveDate), `${run.key}: requested effective date stored`, payload.effectiveDate ?? payload.effectiveDateOption);
      }
      if (run.separateMailing) {
        expect(String(payload.mailingAddress?.address1 ?? "").includes("PO Box 4477"), `${run.key}: separate mailing address stored, not the principal's`, payload.mailingAddress);
      }
      expect(order?.status === "paid" || order?.status === "filed", `${run.key}: order is paid after simulated payment`, order?.status);
      expect(totalCents > 0, `${run.key}: a real total was charged`, totalCents);
      console.log(`  ✓ ${run.key} stored payload matches every on-screen choice (total $${(totalCents / 100).toFixed(2)})`);
    } catch (e) {
      expect(false, `${run.key}: ${String(e).slice(0, 300)}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();
  web.stop();
  api.kill();
  rmSync(freshDir, { recursive: true, force: true });

  console.log(`\nBehavioral gate: ${checks} checks, ${failures.length} failures.`);
  if (failures.length > 0) {
    console.log(failures.map((f) => ` - ${f}`).join("\n"));
    process.exit(1);
  }
}

await main();
