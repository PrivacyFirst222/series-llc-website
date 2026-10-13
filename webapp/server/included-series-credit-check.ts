/* eslint-disable @typescript-eslint/no-explicit-any */
// Checks for the included third series (Adam, 11–12 Oct 2026). Offline and
// in-process: its own throwaway database, no network, no real payment or email.
//   bun run check:included-series-credit
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "included-series-check-"));
Object.assign(process.env, {
  E2E_OFFLINE: "1", VERCEL: "", ADMIN_PASSWORD: "fixture",
  DEV_PG_DIR: join(dir, "db"), DEV_STORAGE_DIR: join(dir, "files"), DEV_MIRROR_DIR: join(dir, "mirror"),
  PUBLIC_BASE_URL: "http://localhost:8000",
});
const { app } = await import("./app");
const { getDb } = await import("./db");
const { newToken } = await import("./crypto");
const { INCLUDED_SERIES_MIGRATION } = await import("./included-series-migration");
const { priceOrder } = await import("./pricing");
const { defaultFormData } = await import("../src/components/forms/florida-llc/defaults");

const db = await getDb();
let failed = 0;
let total = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  total++;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : " " + JSON.stringify(detail)}`);
}

const admin = newToken();
await db.query("INSERT INTO sessions(token_hash,is_admin,expires_at) VALUES($1,true,now()+interval '1 day')", [admin.tokenHash]);
let ipCounter = 1;
async function call(path: string, method = "GET", body?: unknown, cookie = `fpsllc_admin=${admin.token}`, ip?: string) {
  await db.query("DELETE FROM rate_limits");
  const res = await app.request("/api" + path, {
    method, headers: { "Content-Type": "application/json", "X-Forwarded-For": ip ?? `10.1.1.${ipCounter++ % 250}`, Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as any };
}
// Calls that must overlap in time: no clearing between them.
const overlap = (path: string, body: unknown, cookie: string, ip: string) =>
  Promise.resolve(app.request("/api" + path, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip, Cookie: cookie }, body: JSON.stringify(body) }))
    .then(async (r) => ({ status: r.status, body: (await r.json().catch(() => null)) as any }));

function order(email: string, name: string, series: number) {
  return {
    ...structuredClone(defaultFormData), filingPath: "NEW", isFloridaDomesticEntityOnly: true, notLegalAdvice: true, publicRecordNotice: true,
    desiredLlcName: name, llcDesignator: "LLC", exactNameOnly: true, nameSearchAcknowledgment: true, governmentAffiliationAcknowledgment: true, lawfulPurposeNameAcknowledgment: true,
    principalAddress: { address1: "100 Ocean Drive", address2: "", city: "Miami", state: "FL", zip: "33139", country: "United States" },
    registeredAgentChoice: "SELF", registeredAgentType: "INDIVIDUAL", registeredAgentFirstName: "Casey", registeredAgentLastName: "Member",
    registeredAgentStreetAddress1: "100 Ocean Drive", registeredAgentCity: "Miami", registeredAgentState: "FL", registeredAgentZip: "33139",
    registeredAgentNotSameAsLlc: true, registeredAgentPhysicalAddressAcknowledgment: true, registeredAgentResidencyAcknowledgment: true,
    registeredAgentExistingRecordAcknowledgment: true, registeredAgentSeriesAgreementAcknowledgment: true, registeredAgentAcceptanceCheckbox: true,
    registeredAgentAcceptanceName: "Casey Member", registeredAgentAcceptanceCapacity: "INDIVIDUAL_AGENT", registeredAgentElectronicSignature: "Casey Member",
    registeredAgentSignatureAuthorizationCheckbox: true, managementStructure: "MEMBER_MANAGED",
    members: [{ ...structuredClone(defaultFormData.members[0]), firstName: "Casey", lastName: "Member", address1: "100 Ocean Drive", city: "Miami", state: "FL", zip: "33139" }],
    purposeType: "GENERAL", effectiveDateOption: "FILED_BY_DIVISION", clientFirstName: "Casey", clientLastName: "Member",
    clientAddress: { address1: "100 Ocean Drive", address2: "", city: "Miami", state: "FL", zip: "33139", country: "United States" },
    clientEmail: email, confirmClientEmail: email, correspondentName: "Casey Member", correspondentEmail: email, confirmCorrespondentEmail: email,
    series: Array.from({ length: series }, (_, i) => ({ id: `s${i}`, name: `${name}, LLC, PS ${i + 1}` })),
    seriesOwnershipAcknowledgment: true, authorizedRepresentativeName: "Casey Member", authorizedRepresentativeSignature: "Casey Member",
    authorizedRepresentativeSignatureCheckbox: true, atLeastOneMemberAcknowledgment: true, accuracyAcknowledgment: true, addressAccuracyAcknowledgment: true,
    termsOfServiceAcknowledgment: true, orderEin: false, orderSElection: false, publicRecordAcknowledgment: true, legalAdviceAcknowledgment: true,
  };
}
async function paidFormed(email: string, name: string, series: number) {
  const o = await call("/orders", "POST", order(email, name, series));
  if (o.status !== 200) throw new Error("order failed: " + JSON.stringify(o.body));
  const orderId = o.body.data.orderId as string;
  await call("/dev/simulate-payment", "POST", { orderId });
  const clientId = (await db.query<{ client_id: string }>("SELECT client_id FROM orders WHERE id=$1", [orderId]))[0].client_id;
  return { orderId, clientId, total: o.body.data.totalCents as number };
}
const formed = (orderId: string) => db.query("UPDATE orders SET status='formed', formed_at=COALESCE(formed_at,now()) WHERE id=$1", [orderId]);
async function portal(clientId: string) {
  const t = newToken();
  await db.query("INSERT INTO sessions(token_hash,client_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [t.tokenHash, clientId]);
  return `fpsllc_session=${t.token}`;
}
const credits = () => db.query<{ order_id: string; service_order_id: string | null; used_at: unknown }>("SELECT order_id, service_order_id, used_at FROM included_series_credits");

try {
  // ---------------------------------------------------------------- grant
  const one = await call("/orders", "POST", order("solo@example.test", "Solo Demo", 1));
  check("an order with one series is refused with the approved message", one.status === 400 && JSON.stringify(one.body).includes("Add at least two series to continue."), one.body);
  const two = await paidFormed("two@example.test", "Two Demo", 2);
  const three = await paidFormed("three@example.test", "Three Demo", 3);
  check("a two-series order totals $624 and a three-series order $624", two.total === 62400 && three.total === 62400, [two.total, three.total]);
  await formed(two.orderId); await formed(three.orderId);
  await formed(two.orderId); // completion repeated
  let rows = await credits();
  check("exactly one credit: for the two-series package only, once, however often completion repeats",
    rows.length === 1 && rows[0].order_id === two.orderId && rows[0].service_order_id === null && rows[0].used_at === null, rows);

  // An order whose series list is not a list (found by the full run, 12 Oct): marking it formed must not fail.
  for (const [label, value] of [["null", "null"], ["a text value", '"x"'], ["an object", "{}"], ["missing", null]] as const) {
    const odd = await paidFormed(`odd-${label.replace(/ /g, "")}@example.test`, `Odd ${label} Demo`, 2);
    await db.query(value === null ? "UPDATE orders SET payload = payload - 'series' WHERE id=$1" : "UPDATE orders SET payload = jsonb_set(payload,'{series}',$2::jsonb) WHERE id=$1", value === null ? [odd.orderId] : [odd.orderId, value]);
    let failedToForm = false;
    try { await formed(odd.orderId); } catch { failedToForm = true; }
    check(`an order whose series list is ${label} can still be marked formed, and gets no credit`,
      !failedToForm && (await credits()).every((r) => r.order_id !== odd.orderId), { failedToForm });
    // Back to a valid shape: the board's own query expects a list, and real orders always have one.
    await db.query("UPDATE orders SET payload = jsonb_set(payload,'{series}','[]'::jsonb) WHERE id=$1", [odd.orderId]);
  }
  const trainee = await paidFormed("practice@example.test", "Practice Demo", 2);
  await db.query("UPDATE clients SET is_training=true WHERE id=$1", [trainee.clientId]);
  await formed(trainee.orderId);
  rows = await credits();
  check("a practice (training) client's two-series order gets no credit", rows.every((r) => r.order_id !== trainee.orderId), rows);

  // ---------------------------------------------------------- the free request
  const cookie = await portal(two.clientId);
  const q = `?company=${two.orderId}`;
  const svc = await call(`/portal/services${q}`, "GET", undefined, cookie);
  check("the portal shows the included series and a $0 price", svc.body?.data?.includedSeriesRemaining === true && svc.body?.data?.pricing?.seriesCents === 0, svc.body?.data?.pricing);
  const [s1, s2] = await Promise.all([ // two IDENTICAL submissions at once
    overlap(`/portal/services/series${q}`, { suffix: "PS 3", expectedCents: 0 }, cookie, "10.4.4.1"),
    overlap(`/portal/services/series${q}`, { suffix: "PS 3", expectedCents: 0 }, cookie, "10.4.4.2"),
  ]);
  check("two identical submissions at once: both succeed with the SAME request, at $0, with no checkout",
    s1.status === 200 && s2.status === 200 && s1.body.data.serviceOrderId === s2.body.data.serviceOrderId && s1.body.data.totalCents === 0 && s1.body.data.checkoutUrl === null, [s1, s2]);
  const svcRows = await db.query<{ id: string; amount_cents: number; paid_at: unknown; status: string; credit_authorized_at: unknown }>(
    "SELECT id, amount_cents, paid_at, status, credit_authorized_at FROM service_orders WHERE formation_order_id=$1 AND type='series'", [two.orderId]);
  check("one request exists: $0, no payment recorded, in progress, credit-authorized",
    svcRows.length === 1 && svcRows[0].amount_cents === 0 && svcRows[0].paid_at === null && svcRows[0].status === "in_progress" && svcRows[0].credit_authorized_at !== null, svcRows);
  const retry = await call(`/portal/services/series${q}`, "POST", { suffix: "PS 3", expectedCents: 0 }, cookie);
  check("an identical retry returns the same request, not an error", retry.status === 200 && retry.body.data.serviceOrderId === svcRows[0].id, retry);
  check("the portal line is gone once the credit is reserved", (await call(`/portal/services${q}`, "GET", undefined, cookie)).body?.data?.includedSeriesRemaining === false);
  const other = await call(`/portal/services/series${q}`, "POST", { suffix: "PS 4", expectedCents: 0 }, cookie);
  check("a DIFFERENT series after that gets 'price changed' and no checkout", other.status === 409 && !JSON.stringify(other.body).includes("checkoutUrl\":\"http"), other);
  check("still exactly one series request", (await db.query("SELECT 1 FROM service_orders WHERE formation_order_id=$1 AND type='series'", [two.orderId])).length === 1);

  // two DIFFERENT series at once, for a second paying company
  const racer = await paidFormed("racer@example.test", "Racer Demo", 2);
  await formed(racer.orderId);
  const rc = await portal(racer.clientId);
  const rq = `?company=${racer.orderId}`;
  const [r1, r2] = await Promise.all([
    overlap(`/portal/services/series${rq}`, { suffix: "PS 3", expectedCents: 0 }, rc, "10.5.5.1"),
    overlap(`/portal/services/series${rq}`, { suffix: "PS 4", expectedCents: 0 }, rc, "10.5.5.2"),
  ]);
  check("two different series at once: exactly one gets $0, the other 'price changed' with no checkout",
    [r1, r2].filter((r) => r.status === 200 && r.body.data.totalCents === 0).length === 1 && [r1, r2].filter((r) => r.status === 409).length === 1, [r1, r2]);

  // ---------------------------------------------------------------- misuse
  const ordinary = await portal(three.clientId);
  const tq = `?company=${three.orderId}`;
  const claim0 = await call(`/portal/services/series${tq}`, "POST", { suffix: "PS 9", expectedCents: 0 }, ordinary);
  check("a company with no credit that asks for $0 is refused", claim0.status === 409, claim0);
  const paid50 = await call(`/portal/services/series${tq}`, "POST", { suffix: "PS 9", expectedCents: 5000 }, ordinary);
  check("a company with no credit pays the ordinary $50 through the normal checkout", paid50.status === 200 && paid50.body.data.totalCents === 5000 && !!paid50.body.data.checkoutUrl, paid50);
  const stranger = await call(`/portal/services/series${q}`, "POST", { suffix: "PS 5", expectedCents: 0 }, ordinary);
  check("another client cannot use this company's credit", stranger.status >= 400 && !JSON.stringify(stranger.body).includes("serviceOrderId"), stranger);

  // ------------------------------------------------- the office: three doors
  const sid = svcRows[0].id;
  const detail = await call(`/admin/services/${sid}`);
  check("door 1: the office can open the credit-backed request", detail.status === 200, detail);
  const list = await call(`/admin/services`);
  check("door 2: the office service list includes it", JSON.stringify(list.body).includes(sid), list.status);
  const board = await call(`/admin/orders?view=active`);
  const twoCard = (board.body?.data?.orders ?? []).find((o: any) => o.llc_name === "Two Demo, LLC");
  check("the order board shows the company with the credit request owed (new work)", board.status === 200 && twoCard?.services_owed === true && twoCard?.work_stage === "new", { status: board.status, card: twoCard, names: (board.body?.data?.orders ?? []).map((o: any) => o.llc_name) });

  // --------------------------------------------- the office files it (real route)
  const before = (await credits()).find((c) => c.order_id === two.orderId)!;
  check("before filing: the credit is reserved on that request and not used", before.service_order_id === sid && before.used_at === null, before);
  const fulfil = await call(`/admin/services/${sid}/fulfill`, "POST", { notify: false });
  const after = (await credits()).find((c) => c.order_id === two.orderId)!;
  const status = (await db.query<{ status: string }>("SELECT status FROM service_orders WHERE id=$1", [sid]))[0].status;
  check("the office fulfills the request; the credit is then used", fulfil.status === 200 && status === "fulfilled" && after.used_at !== null, { fulfil, status, after });
  const again = await call(`/admin/services/${sid}/fulfill`, "POST", { notify: false });
  const afterAgain = (await credits()).find((c) => c.order_id === two.orderId)!;
  check("fulfilling again changes nothing: the credit stays used and never returns to available",
    JSON.stringify(afterAgain) === JSON.stringify(after), { again: again.status, afterAgain });
  await db.query("UPDATE service_orders SET status='in_progress' WHERE id=$1", [sid]);
  await db.query("UPDATE service_orders SET status='fulfilled', fulfilled_at=now() WHERE id=$1", [sid]); // a replaced filing
  const replaced = (await credits()).find((c) => c.order_id === two.orderId)!;
  check("a corrected or replaced filing never makes the credit available again", replaced.service_order_id === sid && replaced.used_at !== null, replaced);
  const gone = await call(`/portal/services/series${q}`, "POST", { suffix: "PS 7", expectedCents: 0 }, cookie);
  check("once used, a request for $0 is refused", gone.status === 409, gone);

  // ------------------------------------------------------- ordinary prices
  const base = { isConversion: false, seriesCount: 2, certificateOfStatus: false, certifiedCopy: false, ein: false, sElection: false, registeredAgentChange: false };
  check("new LLC, two series: $499 + $125 = $624", priceOrder(base).totalCents === 62400);
  check("new LLC, three series: $624", priceOrder({ ...base, seriesCount: 3 }).totalCents === 62400);
  check("a fourth initial series: +$50", priceOrder({ ...base, seriesCount: 4 }).totalCents === 67400);
  check("conversion keeping its agent: $499", priceOrder({ ...base, isConversion: true }).totalCents === 49900);
  check("conversion switching to our agent: +$25", priceOrder({ ...base, isConversion: true, registeredAgentChange: true }).totalCents === 52400);
  const ordinaryPrices = (await call(`/portal/services${tq}`, "GET", undefined, ordinary)).body?.data?.pricing;
  check("portal prices without a credit: series $50, EIN $50, S-election $95, status $15, copy $40",
    ordinaryPrices?.seriesCents === 5000 && ordinaryPrices?.einCents === 5000 && ordinaryPrices?.sElectionCents === 9500 && ordinaryPrices?.certStatusCents === 1500 && ordinaryPrices?.certifiedCopyCents === 4000, ordinaryPrices);

  // ------------------------------------------------ migration repeatability
  const snap = async () => JSON.stringify({
    cols: await db.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_name IN ('service_orders','included_series_credits') ORDER BY 1,2"),
    trig: await db.query("SELECT tgname FROM pg_trigger WHERE tgname LIKE '%included_series_credit' ORDER BY 1"),
    fn: await db.query("SELECT proname FROM pg_proc WHERE proname LIKE '%included_series%' ORDER BY 1"),
    credits: await credits(),
  });
  const first = await snap();
  for (const stmt of INCLUDED_SERIES_MIGRATION) await db.query(stmt);
  check("migration 30 run a second time changes nothing (no duplicate tables, triggers or credits)", first === await snap());

  // --------------------------------------- backup and restore, three credit states
  const { runDbBackup } = await import("./backup");
  const { restoreBackup } = await import("./restore");
  const { readObject } = await import("./storage");
  // available: a fresh two-series package; reserved: racer; used: two
  const spare = await paidFormed("spare@example.test", "Spare Demo", 2);
  await formed(spare.orderId);
  const stateOf = async () => JSON.stringify((await credits()).map((c) => ({ o: c.order_id, s: c.service_order_id, u: c.used_at !== null })).sort((a, b) => a.o.localeCompare(b.o)));
  const expectedStates = await stateOf();
  const mine = (await credits()).filter((c) => c.order_id !== trainee.orderId);
  check("setup: one credit each available, reserved and used",
    mine.some((c) => c.service_order_id === null && c.used_at === null) && mine.some((c) => c.service_order_id !== null && c.used_at === null) && mine.some((c) => c.used_at !== null), mine);
  const result = await runDbBackup();
  const dumpBytes = result.key ? await readObject("backups/" + result.key) : null;
  const dump = dumpBytes ? JSON.parse((await import("node:zlib")).gunzipSync(dumpBytes).toString()) : null;
  check("the backup completes and includes the credit table", !!dump && Array.isArray(dump.tables.included_series_credits) && dump.tables.included_series_credits.length === mine.length, { key: result.key, complete: (result as any).complete });
  if (dump) {
    const { BACKUP_TABLES } = await import("./backup");
    const wipe = async () => { for (const t of [...BACKUP_TABLES].reverse()) if (t !== "launch_policy") await db.query(`DELETE FROM ${t}`); };
    await wipe();
    await restoreBackup(db, dump, { firstNoticeCutoff: "2026-01-01T00:00:00Z" });
    check("restore: the credits come back in exactly the same three states", (await stateOf()) === expectedStates, await stateOf());
    const rq2 = (await db.query<{ id: string }>("SELECT service_order_id AS id FROM included_series_credits WHERE service_order_id IS NOT NULL"));
    const restoredRows = await db.query<{ credit_authorized_at: unknown }>("SELECT credit_authorized_at FROM service_orders WHERE id = ANY($1::uuid[])", [rq2.map((r) => r.id)]);
    check("restore: credit-authorized requests keep their authorization", restoredRows.length > 0 && restoredRows.every((r) => r.credit_authorized_at !== null), restoredRows);
    // an older backup, made before this table existed
    const older = structuredClone(dump);
    delete older.tables.included_series_credits;
    await wipe();
    await restoreBackup(db, older, { firstNoticeCutoff: "2026-01-01T00:00:00Z" });
    check("an older backup with no credit table restores, with an empty credit table and no credit given to any order", (await credits()).length === 0 && (await db.query("SELECT 1 FROM orders")).length > 0, await credits());
  }
} catch (e) {
  failed++;
  console.log("FAIL the check itself stopped: " + String(e) + "\n" + ((e as Error).stack ?? ""));
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`[included series credit] ${total} checks, ${failed} failures.`);
process.exit(failed === 0 ? 0 : 1);
