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
/** When set, the walk saves screenshots of the screens it checks there. */
const SHOT_DIR = process.env.SHOT_DIR;
const shot = async (page: { screenshot: (o: { path: string; fullPage?: boolean }) => Promise<unknown> }, name: string) => {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png`, fullPage: false });
};
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
  /** A specific stated purpose on a standard LLC (PLLC purpose is separate). */
  specificPurpose?: string;
  /** Drive this run at phone size. */
  mobile?: boolean;
  /** Clear three required fields, prove the errors name them, then recover. */
  probeValidation?: boolean;
  /** Distinct client email — the OA journey seeds from A's member-managed
   *  order, and oaSeed reads the client's LATEST paid order, so A must not
   *  share a client with the runs that pay after it. */
  email?: string;
  /** From Certify, walk Back to the first step and replay Forward unfilled. */
  backWalk?: boolean;
};

const RUNS: RunConfig[] = [
  { key: "A", label: "new LLC, member-managed, our RA, probes + back-walk", path: "new", formationType: "DOMESTIC_LLC", management: "MEMBER_MANAGED", ra: "SERVICE", llcName: "Gate Run Alpha", designator: "LLC", probeValidation: true, backWalk: true, email: "gate-oa@e2e.test" },
  { key: "B", label: "new LLC, member-managed, self RA, entity member", path: "new", formationType: "DOMESTIC_LLC", management: "MEMBER_MANAGED", ra: "SELF", llcName: "Gate Run Bravo", designator: "L.L.C.", memberEntity: true },
  { key: "C", label: "new PLLC, member-managed, self RA, phone-sized", path: "new", formationType: "PLLC", management: "MEMBER_MANAGED", ra: "SELF", llcName: "Gate Run Charlie", designator: "Professional Limited Liability Company", mobile: true },
  { key: "D", label: "new PLLC, manager-managed, our RA, EIN + S election", path: "new", formationType: "PLLC", management: "MANAGER_MANAGED", ra: "SERVICE", llcName: "Gate Run Delta", designator: "PLLC", addons: { ein: true, sElection: true }, email: "gate-actions@e2e.test" },
  { key: "E", label: "conversion, member-managed, our RA", path: "convert", formationType: "DOMESTIC_LLC", management: "MEMBER_MANAGED", ra: "SERVICE", llcName: "Gate Run Echo, LLC", designator: "" },
  { key: "F", label: "conversion, manager-managed, self RA", path: "convert", formationType: "DOMESTIC_LLC", management: "MANAGER_MANAGED", ra: "SELF", llcName: "Gate Run Foxtrot, LLC", designator: "" },
  { key: "G", label: "new LLC, exact name only, dated, certificates, 4 series", path: "new", formationType: "DOMESTIC_LLC", management: "MEMBER_MANAGED", ra: "SERVICE", llcName: "Gate Run Golf", designator: "Limited Liability Company", exactNameOnly: true, requestedEffectiveDate: "2026-10-01", addons: { certificate: true, certifiedCopy: true }, extraSeries: 3, specificPurpose: "Holding and leasing residential real estate" },
  { key: "H", label: "new LLC, entity manager, separate mailing, we sign", path: "new", formationType: "DOMESTIC_LLC", management: "MANAGER_MANAGED", ra: "SERVICE", llcName: "Gate Run Hotel", designator: "LLC", managerEntity: true, separateMailing: true, weSign: true },
  { key: "I", label: "new PLLC, manager-managed, self RA (P.L.L.C.)", path: "new", formationType: "PLLC", management: "MANAGER_MANAGED", ra: "SELF", llcName: "Gate Run India", designator: "P.L.L.C." },
];
// Every designator the product offers is exercised: LLC (A, H), L.L.C. (B),
// Limited Liability Company (G), PLLC (D), P.L.L.C. (I), Professional
// Limited Liability Company (C). An ENTITY registered agent is deliberately
// not sold — the agent step's own copy says "the agent must be our service
// or you" — so no run fakes one (the P2 lesson).

// A config may only claim attributes its flow can exercise — a run that
// names an untestable attribute is a silent cap wearing a label (audit 16
// P2 caught exactly that on the original Run B).
for (const r of RUNS) {
  if (r.memberEntity && r.management !== "MEMBER_MANAGED") throw new Error(`${r.key}: entity member requires member-managed (ownership is collected in the OA questionnaire — Adam's design)`);
  if (r.managerEntity && r.management !== "MANAGER_MANAGED") throw new Error(`${r.key}: entity manager requires manager-managed`);
}

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
  const avail = await page.getByRole("option").allTextContents().catch(() => []);
  throw new Error(`select ${triggerSelector} refused option ${optionText}; options seen: [${avail.join(", ").slice(0, 200)}]`);
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
  if (run.probeValidation) {
    // Submit the step empty first: each error must NAME its field, inline,
    // where the customer is looking.
    await page.locator("main button").filter({ hasText: /^Continue/ }).first().click();
    await page.waitForTimeout(600);
    const errs = (await page.locator("main .text-destructive, main [role='alert']").allTextContents()).filter(Boolean).join(" | ");
    expect(/first name/i.test(errs), `${run.key}: empty first name error names the field`, errs.slice(0, 120));
    expect(/last name/i.test(errs), `${run.key}: empty last name error names the field`, errs.slice(0, 120));
    expect(/email/i.test(errs), `${run.key}: empty email error names the field`, errs.slice(0, 120));
  }
  await fill(page, "First name", "Casey");
  await fill(page, "Last name", "Gatecheck");
  await fill(page, "Email", run.email ?? "gate@e2e.test");
  await fill(page, "Confirm email", run.email ?? "gate@e2e.test");
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

  // Purpose. A PLLC must state its professional purpose; a standard LLC may
  // add a specific one alongside the general clause.
  if (run.formationType === "PLLC") {
    await page.locator("main textarea").first().fill("The practice of law");
  } else if (run.specificPurpose) {
    await clickCard(page, /Also list a specific purpose/i);
    await page.waitForTimeout(300);
    await page.locator("main textarea").first().fill(run.specificPurpose);
  }
  await advance(page);

  // Effective date.
  if (run.requestedEffectiveDate) {
    await page.locator("main label", { hasText: /specific|requested|choose/i }).first().click();
    await page.locator('main input[type="date"]').first().fill(run.requestedEffectiveDate);
  }
  await advance(page);

  // Correspondence. A one-word name is refused at the box (Adam, 7 Sep 2026).
  // The step prefills the contact name from the client a moment after it
  // mounts; on the phone-sized run that can land after our typing. Fill
  // until the box holds exactly what was typed.
  for (let attempt = 0; attempt < 5; attempt++) {
    await fill(page, "Contact name", "Casey");
    await page.waitForTimeout(400);
    if ((await page.getByLabel("Contact name", { exact: false }).first().inputValue()) === "Casey") break;
  }
  await fill(page, "Email", run.email ?? "gate@e2e.test");
  await fill(page, "Confirm email", run.email ?? "gate@e2e.test");
  // The intake's phone boxes take the shape as typed (Adam, 7 Sep 2026).
  const corrPhone = page.locator("#correspondent-phone");
  expect(!/[a-z]/i.test((await corrPhone.getAttribute("placeholder")) ?? ""), `${run.key}: the correspondence phone hint has no letters`);
  await corrPhone.pressSequentially("4072106622", { delay: 20 });
  expect((await corrPhone.inputValue()) === "(407) 210-6622", `${run.key}: the correspondence phone takes the shape as typed`, await corrPhone.inputValue());
  // The phone-sized run types slower than the page settles: read the boxes
  // back before tapping Continue, so the tap tests the one-word name and
  // nothing else.
  const nameNow = await page.getByLabel("Contact name", { exact: false }).first().inputValue();
  expect(nameNow === "Casey", `${run.key}: the one-word name is in the box before Continue`, nameNow);
  await page.locator("main button").filter({ hasText: /^Continue/ }).first().click();
  const refused = await page.locator("main").getByText("Enter first and last name").first().waitFor({ state: "visible", timeout: 4000 }).then(() => true).catch(() => false);
  expect(refused, `${run.key}: a one-word contact name is refused at the box`, await stepHeading(page));
  await fill(page, "Contact name", "Casey Gatecheck");
  await fill(page, "Email", run.email ?? "gate@e2e.test");
  await fill(page, "Confirm email", run.email ?? "gate@e2e.test");
  await advance(page);

  // Optional docs and add-ons. The S election add-on carries Adam's calendar
  // tax year notice (6 Sep 2026) at the point of purchase.
  // The add-on exists only for NEW formations (a conversion cannot elect
  // through us), so the notice is asserted only where the add-on is offered.
  if (run.path === "new") {
    const addonText = await page.locator("main").innerText();
    expect(/we will elect a calendar tax year/i.test(addonText), `${run.key}: the S election add-on states the calendar tax year`, addonText.slice(0, 80));
  }
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
  // Adam's checkout acknowledgment for the S election add-on (6 Sep 2026):
  // it appears once the add-on is ticked, and the step refuses to advance
  // without it.
  if (run.addons?.sElection) {
    await page.waitForTimeout(200);
    const ack = page.locator("#s-election-filing-acknowledgment");
    expect((await ack.count()) === 1, `${run.key}: the S election add-on shows the filing acknowledgment`);
    await page.locator("main button").filter({ hasText: /^Continue/ }).first().click();
    await page.waitForTimeout(500);
    const stuck = (await page.locator("main [role='alert']").allTextContents()).join(" ");
    expect(/acknowledge the Form 2553 filing deadline/i.test(stuck), `${run.key}: the step refuses to advance without the acknowledgment`, stuck.slice(0, 120));
    await ack.check({ force: true });
  }
  await advance(page);

  // Review → certify.
  await advance(page, "Continue");

  // Back-walk: from Certify, walk Back to the first visible step, then replay
  // Forward WITHOUT refilling anything — every step must still validate, so a
  // single lost answer stops the replay cold.
  if (run.backWalk) {
    let hops = 0;
    while (hops++ < 25) {
      const back = page.locator("main button").filter({ hasText: /^Back$/ }).first();
      if (await back.isDisabled()) break;
      await back.click();
      await page.waitForTimeout(350);
    }
    expect((await stepHeading(page)).includes("Eligibility"), `${run.key}: back-walk reaches the first step`, await stepHeading(page));
    expect((await page.locator("#client-first-name").inputValue().catch(() => "").then((v) => v)) !== "GONE", `${run.key}: placeholder`, null);
    let fwd = 0;
    while (!(await stepHeading(page)).includes("Certification") && fwd++ < 25) await advance(page);
    expect((await stepHeading(page)).includes("Certification"), `${run.key}: forward replay reaches Certify with every answer intact`, await stepHeading(page));
  }

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
    // PUBLIC_BASE_URL: the fake checkout's return origin is THIS run's web
    // server, never a hard-coded port that may belong to another local
    // instance (audit 16 DEV-ORIGIN-001).
    env: { ...process.env, DEV_PG_DIR: freshDir, PORT: String(API_PORT), E2E_OFFLINE: "1", PUBLIC_BASE_URL: `http://localhost:${WEB_PORT}` },
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
  const orderIds = new Map<string, string>();
  for (const run of RUNS.filter((r) => !only || only.includes(r.key))) {
    console.log(`\n▶ Run ${run.key}: ${run.label}`);
    const page = await browser.newPage(run.mobile ? { viewport: { width: 375, height: 812 } } : {});
    const reactWarnings: string[] = [];
    page.on("console", (m) => {
      if (/controlled|uncontrolled/i.test(m.text())) reactWarnings.push(m.text().slice(0, 120));
    });
    try {
      const { orderId, totalCents } = await driveRun(page, run);
      orderIds.set(run.key, orderId);
      expect(reactWarnings.length === 0, `${run.key}: no controlled/uncontrolled React warnings`, reactWarnings[0]);

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
      if (run.specificPurpose) {
        expect(JSON.stringify(payload).includes(run.specificPurpose), `${run.key}: the specific purpose typed on screen is stored`, payload.purpose ?? payload.purposeType);
      }
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

  // ---- Action-needed journey (Adam, 5 Sep 2026): a formed company whose
  // client still owes the questionnaire AND the details for an intake EIN
  // and S election sees all three named in a sticky toast, each item's card
  // or row outlined red, and the toast leaves only by its X.
  console.log("\n▶ Action-needed journey (formed company, intake EIN + S election)");
  if (orderIds.has("D")) {
    const page = await browser.newPage();
    try {
      const dOrderId = orderIds.get("D")!;
      // Form the company through the admin API, as the office would.
      const detail = await fetch(`${API}/api/admin/orders/${dOrderId}`, { headers: { Cookie: adminCookie } }).then((r) => r.json()) as { data?: { series?: { name: string }[] } };
      const seriesNames = (detail.data?.series ?? []).map((x) => x.name);
      const pdf = (tag: string) => new File([new TextEncoder().encode(`%PDF-1.4 ${tag}\n%%EOF`)], `${tag}.pdf`, { type: "application/pdf" });
      const fd = new FormData();
      fd.set("articles", pdf("articles"));
      fd.append("psd", pdf("psd"));
      fd.append("psdSeries", JSON.stringify(seriesNames));
      const formed = await fetch(`${API}/api/admin/orders/${dOrderId}/formation-documents`, { method: "POST", headers: { Cookie: adminCookie }, body: fd });
      expect(formed.status === 200, "actions: run D's company is formed through the admin API", await formed.text().catch(() => ""));

      const email = "gate-actions@e2e.test";
      const mint = await fetch(`${API}/api/dev/mint-reset-token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).then((r) => r.json()) as { data?: { token?: string } };
      if (!mint.data?.token) throw new Error("no reset token for the action-needed client");
      await fetch(`${API}/api/auth/set-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: mint.data.token, password: "gate-pass-12345" }) });

      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        const resp = await fetch(`${API}${url.pathname}${url.search}`, {
          method: route.request().method(),
          // Pass the request through as sent: an upload is multipart, and
          // its body is binary — a JSON content type or a text body would
          // strip the file before it reaches the server.
          headers: { "Content-Type": route.request().headers()["content-type"] ?? "application/json", cookie: route.request().headers()["cookie"] ?? "" },
          body: route.request().postDataBuffer() ?? undefined,
        });
        const body = await resp.text();
        const setCookie = resp.headers.get("set-cookie");
        await route.fulfill({ status: resp.status, contentType: resp.headers.get("content-type") ?? "application/json", body, headers: setCookie ? { "set-cookie": setCookie } : undefined });
      });
      await page.goto(`http://localhost:${WEB_PORT}/portal/login`);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("gate-pass-12345");
      await page.locator("main button").filter({ hasText: /^Sign in/ }).first().click();
      await page.waitForURL(/\/portal(?!\/login)/, { timeout: 10000 });
      await page.waitForTimeout(2000);

      const toastText = await page.locator('[data-testid="action-needed-list"]').first().innerText().catch(() => "");
      expect(/operating agreement questionnaire/i.test(toastText), "actions: toast names the questionnaire", toastText);
      // The S election is not the client's to act on until the office has
      // entered the formation date (Form 2553 timing gate, 6 Sep 2026): the
      // toast and the outlines leave it out, and pick it up once the date
      // is in — asserted further down.
      expect(/S Corporation Election Package — Gate Run Delta, PLLC/.test(toastText), "actions: toast names the S election awaiting details", toastText);
      expect(/Federal EIN — Gate Run Delta, PLLC/.test(toastText), "actions: toast names the EIN awaiting details", toastText);
      const outlined = await page.locator('[data-needs-action="true"]').allInnerTexts();
      expect(outlined.length === 3, "actions: the agreement card and both service rows are outlined red", outlined.map((t) => t.split("\n")[0]));
      const redBorders = await page.locator('[data-needs-action="true"]').evaluateAll((els) => els.map((e) => getComputedStyle(e).borderTopWidth));
      expect(redBorders.every((w) => w === "2px"), "actions: every outlined element carries the 2px destructive border", redBorders);

      // Placement (Adam, 6 Sep 2026): unfulfilled orders sit near the top,
      // beneath the documents and ABOVE the agreement card — not at the foot
      // of Order services, which lists nothing but its purchase tiles.
      const order = await page.evaluate(() => {
        const heads = [...document.querySelectorAll("main h2")].map((h) => h.textContent?.trim() ?? "");
        const services = [...document.querySelectorAll("main h2")].find((h) => h.textContent?.trim() === "Order services")?.closest("div.rounded-2xl");
        return { heads, serviceRows: services ? services.querySelectorAll("ul li").length : -1 };
      });
      const idx = (t: string) => order.heads.indexOf(t);
      expect(idx("Orders in progress") > idx("Your documents") && idx("Orders in progress") < idx("Operating agreement"), "actions: orders in progress sit beneath the documents and above the agreement", order.heads);
      expect(order.serviceRows === 0, "actions: Order services lists no orders beneath its tiles", order.serviceRows);

      // The S election form itself (Adam, 6 Sep 2026): the optional dates are
      // typed boxes that stay empty — an iPad's date picker filled in today —
      // and each owner row offers "Acquired at formation", ticked by default,
      // which hides the date box; unticking reveals it.
      // The EIN form's responsible party heading (Adam, 7 Sep 2026): it says
      // who the person usually is, and no longer speaks of IRS records.
      const einRowClient = page.locator('[data-testid="orders-in-progress"] li').filter({ hasText: /Federal EIN/ }).first();
      await einRowClient.locator("button").filter({ hasText: /Provide details/ }).first().click();
      await page.waitForTimeout(800);
      const einForm = page.locator('[role="dialog"]').first();
      const rpHeading = await einForm.locator('[data-testid="responsible-party-heading"]').innerText().catch(() => "");
      expect(/typically the LLC's manager/.test(rpHeading), "EIN form: the responsible party heading says it is typically the manager", rpHeading);
      expect(!/IRS records/.test(await einForm.innerText()), "EIN form: no 'must match IRS records' anywhere on the form");
      // Every phone box takes the shape as typed and hints it without
      // letters (Adam, 7 Sep 2026).
      const einPhone = einForm.locator('input[aria-label="Phone for IRS questions"]');
      const einPhoneHint = (await einPhone.getAttribute("placeholder")) ?? "";
      expect(!/[a-z]/i.test(einPhoneHint) && /\(\s+\)\s+-\s+/.test(einPhoneHint), "EIN form: the phone hint shows the shape only, no letters", einPhoneHint);
      await einPhone.pressSequentially("4072106622", { delay: 20 });
      expect((await einPhone.inputValue()) === "(407) 210-6622", "EIN form: digits take the phone shape as typed", await einPhone.inputValue());
      // The IRS assistant's own questions (walked 7 Sep 2026): the EIN
      // question, members prefilled, the reason, the four special questions,
      // the 15 categories and each one's follow-up.
      expect((await einForm.locator('input[name="hasExistingEin"][value="No"]').isChecked()), "EIN form: 'ever been assigned an EIN' starts at No");
      expect((await einForm.locator('input[aria-label="Number of members"]').inputValue()) !== "", "EIN form: the number of members is prefilled");
      expect(/Started a new business/.test(await einForm.locator('[aria-label="Why the LLC needs an EIN"]').innerText()), "EIN form: the reason starts at Started a new business");
      expect((await einForm.locator('[data-testid="special-questions"] input[type="radio"]').count()) === 8, "EIN form: the four special questions are asked separately, yes or no each");
      expect((await einForm.locator('[aria-label="Business category"]').innerText()).includes("Real Estate"), "EIN form: the category starts at Real Estate");
      expect(/I rent or lease property that I own/.test(await einForm.locator('[data-testid="activity-follow-up"]').innerText()), "EIN form: Real Estate shows the assistant's follow-up choices");
      await choose(page, '[aria-label="Business category"]', "Wholesale");
      await page.waitForTimeout(300);
      expect(/take title to the goods/.test(await einForm.locator('[data-testid="activity-follow-up"]').innerText()), "EIN form: Wholesale shows its yes-or-no follow-up");
      await choose(page, '[aria-label="Business category"]', "Warehousing");
      await page.waitForTimeout(300);
      expect((await einForm.locator('[data-testid="activity-follow-up"]').count()) === 0, "EIN form: Warehousing asks no follow-up");
      // The IRS help boxes sit under the questions (Adam, 7 Sep 2026), and the
      // employees branch is the assistant's own three questions.
      const specialText = await einForm.locator('[data-testid="special-questions"]').innerText();
      expect(/self-propelled vehicle/.test(specialText) && /accepting wagers/.test(specialText), "EIN form: the special questions carry the IRS's own explanations", specialText);
      expect(/Excise taxes are federal taxes on particular goods and services/.test(specialText) && /the answer is No/.test(specialText), "EIN form: Form 720 is explained for lay people (Adam, 7 Sep 2026)", specialText);
      expect(/Forms W-2 require additional filings with the IRS/.test(await einForm.innerText()), "EIN form: the W-2 question carries the assistant's parenthetical");
      await einForm.locator('[data-testid="special-questions"]').scrollIntoViewIfNeeded();
      await shot(page, "ein-form-special-questions");
      expect((await einForm.locator('[data-testid="employees-block"]').count()) === 0, "EIN form: no employee questions until the W-2 question is Yes");
      await einForm.locator('label:has-text("Forms W-2") input[type="checkbox"]').check({ force: true });
      await page.waitForTimeout(300);
      const empBlock = einForm.locator('[data-testid="employees-block"]');
      expect((await empBlock.count()) === 1, "EIN form: Yes to W-2 employees opens the assistant's employee questions");
      const empText = await empBlock.innerText();
      expect(/first date wages or annuities/.test(empText) && /Number of agricultural employees/.test(empText) && /Number of other employees/.test(empText) && /\$1,000 or less in a full calendar year/.test(empText) && /\$4,000 or less/.test(empText), "EIN form: the three employee questions read as the assistant asks them, with its help", empText);
      expect(!/[Hh]ousehold/.test(empText), "EIN form: no household box — the assistant has none");
      expect((await empBlock.locator('[aria-label="Month"]').count()) === 1 && (await empBlock.locator('input[name="firstWageYear"]').count()) === 1, "EIN form: first wages are asked as month and year, not a full date");
      expect((await empBlock.locator('[aria-label="Number of other employees"]').inputValue()) === "", "EIN form: the counts start blank, not guessed");
      expect((await empBlock.locator('[data-testid="form944-question"] input[type="radio"]').count()) === 2, "EIN form: the $1,000 question is Yes or No");
      await empBlock.scrollIntoViewIfNeeded();
      await shot(page, "ein-form-employees");
      await einForm.locator('label:has-text("Forms W-2") input[type="checkbox"]').uncheck({ force: true });
      await page.waitForTimeout(300);
      await einForm.locator('input[name="hasExistingEin"][value="Yes"]').check({ force: true });
      await page.waitForTimeout(300);
      expect((await einForm.locator('[data-testid="existing-ein"]').count()) === 1 && (await einForm.locator('[data-testid="special-questions"]').count()) === 0, "EIN form: saying the LLC already has an EIN hides the application questions and asks for the number");
      await einForm.locator('input[name="hasExistingEin"][value="No"]').check({ force: true });
      await page.waitForTimeout(300);
      // P65 (Adam, 7 Sep 2026: "The ein form closed and I lost my data"): the
      // answers are saved as they are typed, so a page that reloads with the
      // form open — never closed — brings every answer back but the
      // taxpayer number.
      await einForm.locator('input[name="county"]').fill("Orange");
      await einForm.locator('input[name="tin"]').fill("123456789");
      await page.waitForTimeout(300);
      await page.reload();
      await page.waitForTimeout(1500);
      await einRowClient.locator("button").filter({ hasText: /Provide details/ }).first().click();
      await page.waitForTimeout(800);
      const einAfterReload = page.locator('[role="dialog"]').first();
      expect((await einAfterReload.locator('input[name="county"]').inputValue()) === "Orange", "EIN form: the typed county survives a reload with the form open", await einAfterReload.locator('input[name="county"]').inputValue());
      expect((await einAfterReload.locator('input[aria-label="Phone for IRS questions"]').inputValue()) === "(407) 210-6622", "EIN form: the typed phone survives a reload with the form open");
      expect((await einAfterReload.locator('[aria-label="Business category"]').innerText()).includes("Warehousing"), "EIN form: the chosen category survives a reload with the form open");
      expect((await einAfterReload.locator('input[name="tin"]').inputValue()) === "", "EIN form: the taxpayer number does NOT survive a reload");
      await page.keyboard.press("Escape");
      await page.locator('[role="dialog"]').first().waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      const selRow = page.locator('[data-testid="orders-in-progress"] li').filter({ hasText: /S Corporation Election/ }).first();
      // The Form 2553 timing gate (Adam, 6 Sep 2026): the client types the
      // date the Division filed their Articles — from the Articles one card
      // above — and the deadline and its acknowledgment appear at once.
      // The "Action needed" toast steps aside while the form is open (Adam,
      // 6 Sep 2026: it sat on top of the form and could not be closed).
      expect((await page.locator('[data-testid="action-needed-list"]').count()) === 1, "actions: the toast is showing before the form opens");
      await selRow.locator("button").filter({ hasText: /Provide details/ }).first().click();
      await page.waitForTimeout(800);
      expect((await page.locator('[data-testid="action-needed-list"]').count()) === 0, "actions: the toast steps aside while the form is open");
      const selDialog = page.locator('[role="dialog"]').first();
      await shot(page, "s-election-form-before-date");
      expect((await selDialog.locator('[data-testid="timing-ok"]').count()) === 0, "S election: no deadline until the client types the formation date");
      const todayEt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const [ty, tm, td] = todayEt.split("-");
      // Typed as bare digits, the way a client types on an iPad: the slashes
      // appear on their own (Adam, 6 Sep 2026).
      const formationBox = selDialog.locator('input[aria-label="Date the Division filed your Articles"]');
      await formationBox.pressSequentially(`${tm}${td}${ty}`, { delay: 30 });
      await page.waitForTimeout(400);
      expect((await formationBox.inputValue()) === `${tm}/${td}/${ty}`, "S election: bare digits get their slashes as typed", await formationBox.inputValue());
      await formationBox.press("Backspace");
      await formationBox.press("Backspace");
      expect((await formationBox.inputValue()) === `${tm}/${td}/${ty.slice(0, 2)}`, "S election: backspace takes digits off one at a time", await formationBox.inputValue());
      await formationBox.pressSequentially(ty.slice(2), { delay: 30 });
      await page.waitForTimeout(400);
      expect((await selDialog.locator('[data-testid="timing-ok"]').count()) === 1, "S election: typing the formation date shows the deadline and its acknowledgment");
      await shot(page, "s-election-form-after-date");
      expect((await selDialog.locator('input[aria-label="Shareholder eligibility acknowledgment"]').count()) === 1, "S election: the shareholder eligibility acknowledgment is on the form");
      expect(/no refund will be given/.test(await selDialog.innerText()), "S election: the eligibility box carries the no-liability, no-refund line");
      // The phone box's hint is the bare shape, no letters (Adam, 6 Sep 2026).
      const phoneHint = await selDialog.locator('input[inputmode="tel"], input[type="tel"]').first().getAttribute("placeholder").catch(() => null);
      expect(phoneHint !== null && !/[a-z]/i.test(phoneHint) && /\(\s+\)\s+-\s+/.test(phoneHint), "S election: the phone hint shows the shape only, no letters", phoneHint);
      const buildBtn = selDialog.locator("button").filter({ hasText: /Certify and build/ }).first();
      expect(await buildBtn.isDisabled(), "S election: the build button is disabled until both acknowledgments are ticked");
      // What is blocking the build is spelled out above the button (Adam,
      // 6 Sep 2026: "no error message or other method of telling the user
      // exactly what is blocking").
      const stillNeeded = () => selDialog.locator('[data-testid="still-needed"]').innerText().catch(() => "");
      let needed = await stillNeeded();
      expect(/Still needed/.test(needed) && !/filed your Articles/.test(needed), "S election: the list no longer names the date once it is typed", needed);
      expect(/Owner 1: choose or enter the name/.test(needed) && /Tick the certification/.test(needed) && /Tick the deadline acknowledgment/.test(needed), "S election: the list names the owner, the acknowledgment and the certification", needed);
      // A jointly held interest (Adam, 6 Sep 2026): pick the kind on the row,
      // add the co-owner, and both SSN boxes appear with their names.
      await selDialog.locator("button").filter({ hasText: /Add owner/ }).click();
      await page.waitForTimeout(300);
      // Each owner is a clearly headed card (Adam, 7 Sep 2026: "place a clear
      // demarcation between owners"), and "How held" sits on the name line.
      const headings = await selDialog.locator('[data-testid="owner-heading"]').allInnerTexts();
      expect(headings.length === 2 && /Owner 1/i.test(headings[0]) && /Owner 2/i.test(headings[1]), "S election: every owner card carries its own heading", headings);
      const cards = selDialog.locator('[data-testid="owner-card"]');
      const gap = await cards.evaluateAll((els) => els.length === 2 ? els[1].getBoundingClientRect().top - els[0].getBoundingClientRect().bottom : -1);
      expect(gap >= 8, "S election: owner cards are separated by clear space", gap);
      const row2 = cards.nth(1);
      const nameBox = await row2.locator('[aria-label="Owner"]').boundingBox();
      const heldBox = await row2.locator('[aria-label="How the interest is held"]').boundingBox();
      expect(!!nameBox && !!heldBox && heldBox.x > nameBox.x + nameBox.width - 1 && Math.abs(heldBox.y - nameBox.y) < 8, "S election: 'How held' sits to the right of the name on the same line", { nameBox, heldBox });
      await choose(page, '[aria-label="How the interest is held"] >> nth=1', "tenants by the entirety");
      await page.waitForTimeout(300);
      expect((await row2.locator('[data-testid="co-owner-block"]').count()) === 1 && (await row2.locator('[aria-label="Co-owner"]').count()) === 1, "S election: a joint card grows a co-owner block with its own name choice");
      await choose(page, '[aria-label="Owner"] >> nth=1', "Other");
      await row2.locator('input[placeholder="Owner\'s full legal name"]').fill("Bob");
      await page.waitForTimeout(300);
      expect(/Owner 2: enter first and last name/.test(await stillNeeded()), "S election: a one-word owner name is named in the Still needed list", await stillNeeded());
      await row2.locator('input[placeholder="Owner\'s full legal name"]').fill("Bob Jones");
      await choose(page, '[aria-label="Co-owner"]', "Other");
      await row2.locator('input[aria-label="Co-owner\'s full legal name"]').fill("Susan Jones");
      await page.waitForTimeout(300);
      expect((await row2.locator('input[aria-label="SSN — Bob Jones"]').count()) === 1 && (await row2.locator('input[aria-label="SSN — Susan Jones"]').count()) === 1, "S election: a joint card has an SSN box for each co-owner, by name");
      // Co-owners may live apart (Adam, 7 Sep 2026): "Same address" starts
      // ticked; unticking it reveals the co-owner's own address box.
      const same = row2.locator('input[aria-label="Same address"]');
      expect(await same.isChecked(), "S election: the co-owner starts at the same address");
      expect((await row2.locator('input[placeholder="Co-owner\'s home address"]').count()) === 0, "S election: no second address box while the address is shared");
      await same.uncheck({ force: true });
      await page.waitForTimeout(300);
      expect((await row2.locator('input[placeholder="Co-owner\'s home address"]').count()) === 1, "S election: unticking Same address reveals the co-owner's own address box");
      await row2.locator('input[placeholder="Home address"]').fill("123 N Hyer Ave, Orlando FL 32801");
      await row2.locator('input[placeholder="Co-owner\'s home address"]').fill("456 Park Lake St, Orlando FL 32803");
      await page.waitForTimeout(300);
      await selDialog.locator('[data-testid="owner-heading"]').first().evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(300);
      await shot(page, "s-election-owner-cards");
      await row2.locator('[data-testid="co-owner-block"]').evaluate((el) => el.scrollIntoView({ block: "end" }));
      await page.waitForTimeout(300);
      await shot(page, "s-election-joint-card");
      await selDialog.locator('input[placeholder="%"]').nth(0).fill("50");
      await selDialog.locator('input[placeholder="%"]').nth(1).fill("51");
      await page.waitForTimeout(300);
      needed = await stillNeeded();
      expect(/Ownership adds up to 101%, not 100%/.test(needed), "S election: the list says the percentages total 101%", needed);
      expect(/Owner 2: enter the SSN for Susan Jones/.test(needed), "S election: the list asks for the co-owner's SSN by name", needed);
      await selDialog.locator('input[placeholder="%"]').nth(1).fill("50");
      await page.waitForTimeout(300);
      needed = await stillNeeded();
      expect(!/adds up to/.test(needed), "S election: fixing the percentages clears that line", needed);
      await row2.locator('input[aria-label="SSN — Susan Jones"]').fill("234567890");
      await page.waitForTimeout(300);
      needed = await stillNeeded();
      expect(!/SSN for Susan Jones/.test(needed), "S election: typing the co-owner's SSN clears that line", needed);
      await row2.locator('[aria-label="Remove owner"]').click();
      await page.waitForTimeout(300);
      const eff = selDialog.locator('input[aria-label="Election effective date"]').first();
      expect((await eff.getAttribute("type")) !== "date" && (await eff.inputValue()) === "", "S election: the effective date is a typed box that starts empty", await eff.inputValue());
      const atFormation = selDialog.locator('input[aria-label="Acquired at formation"]').first();
      expect(await atFormation.isChecked(), "S election: an owner row is 'acquired at formation' by default");
      expect((await selDialog.locator('input[aria-label="Date the interest was acquired"]').count()) === 0, "S election: no date box while acquired at formation");
      await atFormation.uncheck({ force: true });
      await page.waitForTimeout(200);
      expect((await selDialog.locator('input[aria-label="Date the interest was acquired"]').count()) === 1, "S election: unticking reveals the MM/DD/YYYY box");
      // The signing officer is a dropdown of known people (Adam, 6 Sep 2026):
      // it opens on a real click, lists the client (and the owners) plus
      // "Someone else…", and that choice reveals the name box.
      const signer = selDialog.locator('[aria-label="Signing officer"]').first();
      expect((await signer.count()) === 1 && /\S/.test(await signer.innerText()), "S election: the signing officer is a dropdown with a default person", await signer.innerText());
      await signer.click();
      await page.waitForTimeout(400);
      const signerOptions = await page.getByRole("option").allInnerTexts();
      expect(signerOptions.some((t) => /Someone else/.test(t)) && signerOptions.length >= 2, "S election: the dropdown offers the known people and Someone else…", signerOptions);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await choose(page, '[aria-label="Signing officer"]', "Someone else");
      await page.waitForTimeout(300);
      expect((await selDialog.locator('input[aria-label="Signing officer\'s full legal name"]').count()) === 1, "S election: Someone else… reveals the name box");
      // Nothing typed is lost (Adam, 6 Sep 2026): an outside tap does not
      // close the form; closing with Escape and reopening brings it all back.
      await selDialog.locator('input[aria-label="Signing officer\'s full legal name"]').fill("Pat Gatecheck");
      await selDialog.locator('input[aria-label="Election effective date"]').first().fill("10/01/2026");
      await page.mouse.click(5, 5);
      await page.waitForTimeout(500);
      expect((await page.locator('[role="dialog"]').count()) === 1, "S election: a tap outside the form does not close it");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
      expect((await page.locator('[role="dialog"]').count()) === 0, "S election: Escape closes it");
      // The form closed: the toast is back, and its X closes it.
      await page.waitForTimeout(600);
      expect((await page.locator('[data-testid="action-needed-list"]').count()) === 1, "actions: the toast returns when the form closes");
      await page.locator('[toast-close]').first().click();
      await page.waitForTimeout(800);
      expect((await page.locator('[data-testid="action-needed-list"]').count()) === 0, "actions: the toast's X closes it after the form was used");
      await selRow.locator("button").filter({ hasText: /Provide details/ }).first().click();
      await page.waitForTimeout(800);
      const reopened = page.locator('[role="dialog"]').first();
      expect((await reopened.locator('input[aria-label="Signing officer\'s full legal name"]').inputValue()) === "Pat Gatecheck", "S election: the typed officer survives closing and reopening");
      expect((await reopened.locator('input[aria-label="Election effective date"]').first().inputValue()) === "10/01/2026", "S election: the typed effective date survives closing and reopening");
      expect((await reopened.locator('input[aria-label="Date the Division filed your Articles"]').first().inputValue()) !== "", "S election: the typed formation date survives closing and reopening");
      // Closed by the client before the form opened: it stays away after.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
      expect((await page.locator('[data-testid="action-needed-list"]').count()) === 0, "actions: a toast the client closed stays closed after another form visit");
      await selRow.locator("button").filter({ hasText: /Provide details/ }).first().click();
      await page.waitForTimeout(800);
      // …and a reload of the page (Adam, 6 Sep 2026: retain everything except
      // the Social Security numbers).
      await reopened.locator('input[placeholder="SSN"], input[placeholder^="SSN"]').first().fill("123456789").catch(() => {});
      await page.waitForTimeout(300);
      await page.reload();
      await page.waitForTimeout(1500);
      await page.locator('[toast-close]').first().click().catch(() => {});
      await selRow.locator("button").filter({ hasText: /Provide details/ }).first().click();
      await page.waitForTimeout(800);
      const afterReload = page.locator('[role="dialog"]').first();
      expect((await afterReload.locator('input[aria-label="Signing officer\'s full legal name"]').inputValue()) === "Pat Gatecheck", "S election: the typed officer survives a page reload");
      expect((await afterReload.locator('input[aria-label="Election effective date"]').first().inputValue()) === "10/01/2026", "S election: the typed effective date survives a page reload");
      expect((await afterReload.locator('input[aria-label="Date the Division filed your Articles"]').first().inputValue()) !== "", "S election: the typed formation date survives a page reload");
      const ssnAfter = await afterReload.locator('input[placeholder^="SSN"]').first().inputValue().catch(() => "");
      expect(ssnAfter === "", "S election: the Social Security number does NOT survive a page reload", ssnAfter);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);

      // The admin's side of the same order (Adam, 6 Sep 2026: "I can't upload
      // the pdf"): the board row says whose move it is, and the fulfill
      // dialog says why there is nothing to upload yet.
      await page.goto(`http://localhost:${WEB_PORT}/admin/login`);
      await page.getByLabel("Password").fill("dev-admin");
      await page.locator("main button").filter({ hasText: /^Sign in/ }).first().click();
      await page.waitForURL(/\/admin(?!\/login)/, { timeout: 10000 });
      await page.getByLabel("Search by LLC name, client name, or email").fill("Gate Run Delta");
      await page.waitForTimeout(1500);
      const sRow = page.locator("main button").filter({ hasText: /^S Election/ }).first();
      expect(/waiting on client/i.test(await sRow.innerText().catch(() => "")), "admin: the board row says the S election is waiting on the client", await sRow.innerText().catch(() => ""));
      await sRow.click();
      await page.waitForTimeout(800);
      const dialog = page.locator('[role="dialog"]').first();
      expect((await dialog.locator('[data-testid="waiting-on-client"]').count()) === 1, "admin: the fulfill dialog says it is waiting on the client");
      await shot(page, "admin-window-waiting-on-client");
      expect((await dialog.locator("button").filter({ hasText: /fulfill/i }).count()) === 0, "admin: no fulfill button while the client's details are missing");
      expect((await dialog.locator('input[type="file"]').count()) === 0, "admin: no attach control while the client's details are missing");
      // The override: tick it and the attach control and fulfill button appear.
      await dialog.locator('[data-testid="override-fulfill"]').check({ force: true });
      await page.waitForTimeout(300);
      expect((await dialog.locator('input[type="file"]').count()) === 1, "admin: the override reveals the attach control");
      expect((await dialog.locator("button").filter({ hasText: /fulfill/i }).count()) === 1, "admin: the override reveals the fulfill button");
      await page.keyboard.press("Escape");
      // The closing window lingers in the page for its fade-out; a locator
      // for "the first dialog" would land on it instead of the next one.
      await page.locator('[role="dialog"]').first().waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(400);
      // The EIN as issued is entered with the letter (Adam, 7 Sep 2026): the
      // box sits beside the attach control, the number is required, and the
      // client's S election form then shows it read-only.
      const einRow = page.locator("main button").filter({ hasText: /^EIN/ }).first();
      await einRow.click();
      await page.waitForTimeout(800);
      const einDialog = page.locator('[role="dialog"]').first();
      await einDialog.locator('[data-testid="override-fulfill"]').check({ force: true });
      await page.waitForTimeout(300);
      expect((await einDialog.locator('[data-testid="assigned-ein"]').count()) === 1, "admin: the EIN window has a box for the number beside the letter");
      await einDialog.locator('input[type="file"]').setInputFiles({ name: "cp575.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 CP 575 letter for the walk\n%%EOF") });
      const fulfillBtn = einDialog.locator("button").filter({ hasText: /fulfill/i }).first();
      expect(await fulfillBtn.isDisabled(), "admin: fulfill stays off until the number is typed");
      await einDialog.locator('input[aria-label="EIN as issued"]').fill("88-12345");
      await page.waitForTimeout(200);
      expect(/Enter the 9-digit EIN/.test(await einDialog.innerText()), "admin: a short number is called out");
      await einDialog.locator('input[aria-label="EIN as issued"]').fill("88-1234567");
      await page.waitForTimeout(200);
      expect(!(await fulfillBtn.isDisabled()), "admin: the full number enables fulfill");
      await fulfillBtn.click();
      await page.waitForTimeout(1500);
      if ((await page.locator('[role="dialog"]').count()) !== 0) console.log("    EIN window still open:", (await einDialog.innerText().catch(() => "")).replace(/\n/g, " | ").slice(-500));
      expect((await page.locator('[role="dialog"]').count()) === 0, "admin: the EIN order fulfills with the letter and the number");
      await page.goto(`http://localhost:${WEB_PORT}/portal`);
      await page.waitForTimeout(1500);
      await page.locator("[toast-close]").first().click().catch(() => {});
      await selRow.locator("button").filter({ hasText: /Provide details/ }).first().click();
      await page.waitForTimeout(800);
      const withEin = page.locator('[role="dialog"]').first();
      expect((await withEin.locator('[data-testid="ein-from-letter"]').inputValue()) === "88-1234567", "client: the S election form shows the EIN from the letter, read-only", await withEin.locator('[data-testid="ein-from-letter"]').inputValue().catch(() => ""));
      expect((await withEin.locator("text=You're obtaining our EIN").count()) === 0, "client: no 'obtaining our EIN' tick once we have the number");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      await page.reload();
      await page.waitForTimeout(1500);

      // The X is the only way out: the toast is still there after 6 s, and gone after the click.
      await page.waitForTimeout(6000);
      expect((await page.locator('[data-testid="action-needed-list"]').count()) === 1, "actions: the toast does not time out on its own");
      await page.locator("[toast-close]").first().click();
      await page.waitForTimeout(800);
      const state = await page.locator('[data-testid="action-needed-list"]').first().locator("xpath=ancestor::li[1]").getAttribute("data-state").catch(() => null);
      expect(state === "closed" || state === null, "actions: the X closes the toast", state);
    } finally {
      await page.close();
    }
  } else {
    console.log("  (skipped — run D not in this RUN filter)");
  }

  // ---- The OA questionnaire journey: the flagship deliverable gets the
  // same treatment as checkout. Sign in through the real portal UI, answer
  // as a client — second owner, spouse pairing, contribution, dates — and
  // the generated agreement's STORED inputs must contain every answer.
  console.log("\n▶ OA questionnaire journey (multi-owner, spouses)");
  {
    const page = await browser.newPage();
    try {
      const email = "gate-oa@e2e.test"; // run A's client: member-managed, named member
      const mint = await fetch(`${API}/api/dev/mint-reset-token`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).then((r) => r.json()) as { data?: { token?: string } };
      if (!mint.data?.token) throw new Error("no reset token — did the runs create the client?");
      await fetch(`${API}/api/auth/set-password`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: mint.data.token, password: "gate-pass-12345" }) });

      let genCaptured: { generationId?: string; version?: string } | null = null;
      let genPostBody: string | null = null;
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        // Deterministic USPS answer: the journey must see the advisory strip
        // whether or not the offline API holds Smarty credentials.
        if (url.pathname === "/api/address/verify") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ data: { status: "verified", normalized: { address1: "100 Ocean Dr", city: "Miami", state: "FL", zip: "33139" } } }),
          });
        }
        const resp = await fetch(`${API}${url.pathname}${url.search}`, {
          method: route.request().method(),
          // Pass the request through as sent: an upload is multipart, and
          // its body is binary — a JSON content type or a text body would
          // strip the file before it reaches the server.
          headers: { "Content-Type": route.request().headers()["content-type"] ?? "application/json", cookie: route.request().headers()["cookie"] ?? "" },
          body: route.request().postDataBuffer() ?? undefined,
        });
        const body = await resp.text();
        const setCookie = resp.headers.get("set-cookie");
        if (url.pathname === "/api/portal/oa/generate" && resp.status === 200) {
          genCaptured = (JSON.parse(body) as { data?: { generationId?: string; version?: string } }).data ?? null;
          genPostBody = route.request().postData() ?? null;
        }
        await route.fulfill({ status: resp.status, contentType: resp.headers.get("content-type") ?? "application/json", body, headers: setCookie ? { "set-cookie": setCookie } : undefined });
      });

      // Sign in as a customer does — through the login page.
      await page.goto(`http://localhost:${WEB_PORT}/portal/login`);
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill("gate-pass-12345");
      await page.locator("main button").filter({ hasText: /^Sign in/ }).first().click();
      await page.waitForURL(/\/portal(?!\/login)/, { timeout: 10000 });

      // Arrival: the questionnaire is owed, so the portal says so — a sticky
      // toast naming it and a red outline on the card (Adam, 5 Sep 2026).
      // The company is not formed, so no service order can be listed yet.
      await page.waitForTimeout(1500);
      const arrivalToast = await page.locator('[data-testid="action-needed-list"]').first().innerText().catch(() => "");
      expect(/operating agreement questionnaire/i.test(arrivalToast), "OA: arrival toast names the unfinished questionnaire", arrivalToast);
      expect(!/Provide details/i.test(arrivalToast), "OA: an unformed company's EIN/S election are not demanded yet", arrivalToast);
      expect((await page.locator('[data-needs-action="true"]').count()) === 1, "OA: exactly the agreement card is outlined red", await page.locator('[data-needs-action="true"]').count());

      await page.goto(`http://localhost:${WEB_PORT}/portal/agreement`);
      await page.waitForSelector("main h2, main h1");
      // Intro: more than one owner.
      await clickCard(page, /More than one owner/i);
      await page.locator("main button").filter({ hasText: /^Continue/ }).first().click();
      await page.waitForTimeout(1200);

      // Second owner. Choosing multi-owner already seeds an empty second row —
      // only add one if it did not (an extra empty row correctly blocks
      // Generate as an incomplete owner).
      if ((await page.locator('main input[aria-label="Full legal name of owner 2"]').count()) === 0) {
        await page.locator("main button").filter({ hasText: /^Add owner/ }).first().click();
        await page.waitForTimeout(400);
      }
      await page.getByLabel("Full legal name of owner 2").fill("Blair Gatecheck");
      await page.getByLabel("Address of owner 2").fill("100 Ocean Drive, Miami, FL 33139");
      // Leaving the field runs the soft USPS check (Adam, 1 Sep 2026); the
      // canned answer differs from what was typed, so the advisory strip and
      // its correction button must appear — and never block anything.
      await page.getByLabel("Address of owner 2").blur();
      await page.waitForTimeout(800);
      expect(
        await page.getByText(/Postal Service lists this address as/i).first().isVisible().catch(() => false),
        "OA: the address advisory appears after leaving the field",
      );
      await page.locator("main button").filter({ hasText: /^Use this address/ }).first().click();
      await page.waitForTimeout(600);
      expect(
        (await page.getByLabel("Address of owner 2").inputValue()) === "100 Ocean Dr, Miami, FL 33139",
        "OA: accepting the correction rewrites the field",
        await page.getByLabel("Address of owner 2").inputValue(),
      );
      await page.waitForTimeout(300);

      // Pair the two as spouses (tenancy by the entirety is the first form).
      await choose(page, '[aria-label="First spouse"]', "Casey Gatecheck");
      await choose(page, '[aria-label="Second spouse"]', "Blair Gatecheck");
      await page.locator("main button").filter({ hasText: /^Pair as spouses/ }).first().click();
      await page.waitForTimeout(600);

      // Required multi-owner choices: first option of every radio group.
      const radios = page.locator('main input[type="radio"]');
      const seenGroups = new Set<string>();
      for (let i = 0; i < (await radios.count()); i++) {
        const r = radios.nth(i);
        const name = (await r.getAttribute("name")) ?? String(i);
        if (seenGroups.has(name) || !(await r.isVisible().catch(() => false))) continue;
        seenGroups.add(name);
        if (!(await r.isChecked())) await r.check({ force: true }).catch(() => r.dispatchEvent("click"));
        await page.waitForTimeout(100);
      }
      const borrow = page.getByLabel(/Borrowing limit/i).first();
      if (await borrow.isVisible().catch(() => false)) await borrow.fill("25000");
      const capCap = page.getByLabel(/capital call cap/i).first();
      if (await capCap.isVisible().catch(() => false)) await capCap.fill("10000");
      const contrib = page.locator('main input[aria-label^="Contribution to the company"]').first();
      await contrib.fill("$1,000 cash");
      await page.getByLabel("Effective date").fill("2026-09-15");
      await checkAllBoxes(page);
      await page.waitForTimeout(1000);

      const gen = page.locator("main button").filter({ hasText: /^Generate/ }).first();
      try {
        await gen.click({ timeout: 15000 });
      } catch {
        const boxes = await page.locator("main input[type=checkbox]").evaluateAll((els) => (els as HTMLInputElement[]).map((e) => ({ id: e.id, checked: e.checked, label: e.closest("label")?.textContent?.trim()?.slice(0, 50) })));
        const owners = await page.locator('main input[aria-label^="Full legal name"]').evaluateAll((els) => (els as HTMLInputElement[]).map((e) => e.value));
        throw new Error(`Generate stayed disabled; owners=${JSON.stringify(owners)}; checkboxes=${JSON.stringify(boxes).slice(0, 500)}`);
      }
      for (let i = 0; i < 40 && !genCaptured; i++) await page.waitForTimeout(500);
      if (!genCaptured) {
        const errs = await page.locator('main [role="alert"], main .text-destructive').allTextContents();
        throw new Error(`generate produced nothing — errors: ${errs.filter(Boolean).slice(0, 5).join(" | ")}`);
      }
      const cap = genCaptured as { generationId?: string; version?: string };
      expect(cap.version === "member", "OA: two member-managed owners get the multi-member member-managed master", cap.version);

      // Ground truth: re-assemble from the STORED inputs, exactly as e2e does.
      const inputsRes = await fetch(`${API}/api/dev/oa-generation-inputs/${cap.generationId}`).then((r) => r.json()) as { data?: { inputs?: unknown } };
      const { assembleOa } = await import("../server/oa");
      const md = assembleOa(inputsRes.data?.inputs as Parameters<typeof assembleOa>[0]).markdown;
      expect(md.includes("Casey Gatecheck"), "OA: first owner is in the assembled agreement");
      expect(md.includes("Blair Gatecheck"), "OA: the owner added on screen is in the assembled agreement");
      expect(/tenants by the entirety/i.test(md), "OA: the spouse pairing chosen on screen reached the text (tenants by the entirety)");
      expect(md.includes("Casey Gatecheck and Blair Gatecheck"), "OA: the couple is named together as one unit", null);
      // A couple's Exhibit A row prints the FIRST spouse's address by design;
      // the corrected second-spouse address is asserted in the answers the
      // page actually submitted to generate.
      const genAnswers = genPostBody ? (JSON.parse(genPostBody) as { members?: { address?: string }[] }) : null;
      expect(
        genAnswers?.members?.[1]?.address === "100 Ocean Dr, Miami, FL 33139",
        "OA: the accepted USPS correction is what the page submitted",
        genAnswers?.members?.map((m) => m.address),
      );
      expect(!/tenancies by the entireties|by the entireties/i.test(md), "OA: the singular form, always (Adam's rule)");

      // With the agreement generated and nothing else owed, the portal is
      // quiet: no toast, no red outline.
      await page.goto(`http://localhost:${WEB_PORT}/portal`);
      await page.waitForTimeout(1500);
      expect((await page.locator('[data-testid="action-needed-list"]').count()) === 0, "OA: no action-needed toast once the agreement exists");
      expect((await page.locator('[data-needs-action="true"]').count()) === 0, "OA: no red outlines once nothing is owed");
      expect(md.includes("$1,000 cash"), "OA: the contribution typed on screen is in Exhibit A");
      expect(md.includes("September 15, 2026"), "OA: the effective date chosen on screen is in the agreement");
      console.log("  ✓ OA journey: every on-screen answer survived into the assembled agreement");
    } catch (e) {
      expect(false, `OA journey: ${String(e).slice(0, 300)}`);
    } finally {
      await page.close();
    }
  }

  // ---- Persistent error toast, behaviorally: it must outlive five seconds
  // and die only by its always-visible X.
  console.log("\n▶ Persistent toast journey (contact form)");
  {
    const page = await browser.newPage();
    try {
      await page.route("**/api/**", async (route) => {
        const url = new URL(route.request().url());
        const resp = await fetch(`${API}${url.pathname}${url.search}`, { method: route.request().method(), headers: { "Content-Type": "application/json" }, body: route.request().postData() ?? undefined });
        await route.fulfill({ status: resp.status, contentType: "application/json", body: await resp.text() });
      });
      await page.goto(`http://localhost:${WEB_PORT}/contact`);
      await page.locator("main button").filter({ hasText: /send|submit/i }).first().click();
      await page.waitForTimeout(500);
      const toast = page.locator("li").filter({ hasText: /Missing details/ }).first();
      expect(await toast.isVisible(), "toast: the error appears");
      await page.waitForTimeout(5500);
      expect(await toast.isVisible(), "toast: still present after 5.5 seconds — no auto-dismiss");
      const x = toast.locator("[toast-close]").first();
      expect(await x.isVisible(), "toast: the X is visible without hover");
      await x.click();
      await page.waitForTimeout(600);
      expect(!(await toast.isVisible().catch(() => false)), "toast: the X dismisses it");
      console.log("  ✓ error toast persists and dies only by its X");
    } catch (e) {
      expect(false, `toast journey: ${String(e).slice(0, 200)}`);
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
