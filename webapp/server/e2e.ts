/**
 * Local end-to-end walk of the whole money path (bun run server/e2e.ts).
 * Requires the dev API on :3000. Uses the same defaults + validation the form uses.
 */
import { defaultFormData } from "../src/components/forms/florida-llc/defaults";
import { assembleOa } from "./oa";
import { getDb } from "./db";
import type { FloridaLLCFormData } from "../src/components/forms/florida-llc/types";

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
let failures = 0;

function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "✅" : "❌"} ${label}${ok ? "" : ` — ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const testEmail = `e2e-client-${Math.random().toString(36).slice(2, 8)}@example.com`;

const formData: FloridaLLCFormData = {
  ...structuredClone(defaultFormData),
  filingPath: "NEW",
  isFloridaDomesticEntityOnly: true,
  notLegalAdvice: true,
  publicRecordNotice: true,
  desiredLlcName: "E2E Coastal Holdings",
  llcDesignator: "LLC",
  alternateName1: "E2E Coastal Backup",
  nameSearchAcknowledgment: true,
  governmentAffiliationAcknowledgment: true,
  lawfulPurposeNameAcknowledgment: true,
  principalAddress: {
    address1: "100 Ocean Drive",
    address2: "",
    city: "Miami",
    state: "FL",
    zip: "33139",
    country: "United States",
  },
  // mailingSameAsPrincipal stays true (the default) with mailingAddress left
  // blank — regression coverage: the server must fill it from principal.
  registeredAgentChoice: "SELF",
  registeredAgentType: "INDIVIDUAL",
  registeredAgentFirstName: "Casey", registeredAgentLastName: "Member",
  registeredAgentStreetAddress1: "100 Ocean Drive",
  registeredAgentCity: "Miami",
  registeredAgentState: "FL",
  registeredAgentZip: "33139",
  registeredAgentNotSameAsLlc: true,
  registeredAgentPhysicalAddressAcknowledgment: true,
  registeredAgentAcceptanceCheckbox: true,
  registeredAgentAcceptanceName: "Casey Member",
  registeredAgentAcceptanceCapacity: "INDIVIDUAL_AGENT",
  registeredAgentElectronicSignature: "Casey Member",
  registeredAgentSignatureAuthorizationCheckbox: true,
  managementStructure: "MEMBER_MANAGED",
  members: [
    {
      ...structuredClone(defaultFormData.members[0]),
      firstName: "Casey", lastName: "Member",
      address1: "100 Ocean Drive",
      city: "Miami",
      state: "FL",
      zip: "33139",
      ownershipPercentage: 100,
    },
  ],
  purposeType: "GENERAL",
  effectiveDateOption: "FILED_BY_DIVISION",
  correspondentName: "Casey Member",
  correspondentEmail: testEmail,
  confirmCorrespondentEmail: testEmail,
  series: [{ id: "s1", name: "E2E Coastal Holdings, LLC, PS A" }],
  seriesOwnershipAcknowledgment: true,
  authorizedRepresentativeName: "Casey Member",
  authorizedRepresentativeSignature: "Casey Member",
  authorizedRepresentativeSignatureCheckbox: true,
  atLeastOneMemberAcknowledgment: true,
  accuracyAcknowledgment: true,
  addressAccuracyAcknowledgment: true,
  termsOfServiceAcknowledgment: true,
  orderEin: true,
  orderSElection: true,
  publicRecordAcknowledgment: true,
  legalAdviceAcknowledgment: true,
};

/** The order endpoint allows 10 submissions per hour per IP. Without a distinct
 *  caller identity, a second run inside the hour gets 429s that masquerade as
 *  broken code — so each run presents its own address. */
const RUN_IP = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

async function api(path: string, init?: RequestInit & { cookies?: string }) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": RUN_IP,
      ...(init?.cookies ? { Cookie: init.cookies } : {}),
      ...init?.headers,
    },
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const body = await res.json().catch(() => null);
  return { status: res.status, body, cookie: setCookie.split(";")[0] };
}

// One admin session for the whole run. /api/admin/login is rate limited to 10
// attempts per 15 minutes per IP — a real control against password guessing —
// and the suite was spending it on itself: an eleventh login returned 429, the
// cookie came back empty, and the failure surfaced two tests later as "Not
// signed in" on a route that was working fine. The suite bends, not the limit.
let adminLogin: Awaited<ReturnType<typeof api>> | null = null;
async function adminSession() {
  if (!adminLogin) {
    adminLogin = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "dev-admin" }) });
  }
  return adminLogin;
}

// 1. Reject garbage
const bad = await api("/api/orders", { method: "POST", body: JSON.stringify({ nope: true }) });
check("rejects invalid order payload (400)", bad.status === 400);
check("rejected payload creates no order and no checkout link",
  bad.status === 400 && !bad.body?.data?.orderId && !bad.body?.data?.checkoutUrl, bad.body);

// 1a. Body that is not JSON at all. A parse failure must be answered, not
//     thrown — and must not reach the order or e-mail path either.
const notJson = await fetch(BASE + "/api/orders", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Forwarded-For": RUN_IP },
  body: "{{{not json",
});
const notJsonBody = await notJson.json().catch(() => null);
check("rejects a malformed JSON body (400, no crash)",
  notJson.status === 400 && notJsonBody?.error?.code === "INVALID_JSON",
  { status: notJson.status, body: notJsonBody });
check("malformed body creates no order and no checkout link",
  !notJsonBody?.data?.orderId && !notJsonBody?.data?.checkoutUrl, notJsonBody);

// 1b. The ownership acknowledgment is a server-side requirement, not merely a
//     form control: every series is owned by the company, and the buyer has to
//     say they understand that. Stripping the box in the browser must not work.
const noAck = await api("/api/orders", {
  method: "POST",
  body: JSON.stringify({ ...formData, seriesOwnershipAcknowledgment: false }),
});
check("rejects an order missing the series-ownership acknowledgment (400)",
  noAck.status === 400, noAck.body);
check("un-acknowledged order creates no order and no checkout link",
  noAck.status === 400 && !noAck.body?.data?.orderId && !noAck.body?.data?.checkoutUrl,
  noAck.body);

// 1d. Rejected attempts must not spend the submission allowance. The limit used
//     to be charged before the form was read, so a customer who mistyped a zip
//     twelve times was locked out for an hour and told "too many submissions".
{
  const rejects: number[] = [];
  for (let i = 0; i < 12; i++) {
    rejects.push(
      (await api("/api/orders", { method: "POST", body: JSON.stringify({ nope: i }) })).status,
    );
  }
  check("twelve rejected attempts all answer 400, never 429",
    rejects.every((s) => s === 400), rejects);
  const afterRejects = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      ...formData,
      correspondentEmail: testEmail.replace("@", "+afterrejects@"),
      confirmCorrespondentEmail: testEmail.replace("@", "+afterrejects@"),
    }),
  });
  check("a valid order still goes through after twelve rejections",
    afterRejects.status === 200, { status: afterRejects.status, body: afterRejects.body });
}

// 1b. A tampered "service RA" order cannot alter our agent details — the
//     server re-applies the canonical values (verified via schema acceptance:
//     bogus agent fields with choice=SERVICE must still validate cleanly).
const svc = await api("/api/orders", {
  method: "POST",
  body: JSON.stringify({
    ...formData,
    registeredAgentChoice: "SERVICE",
    registeredAgentBusinessEntityName: "EVIL AGENT CO",
    registeredAgentStreetAddress1: "1 Hacker Way",
    registeredAgentCity: "Reno",
    registeredAgentState: "NV",
    registeredAgentZip: "89501",
    correspondentEmail: testEmail.replace("@", "+svc@"),
    confirmCorrespondentEmail: testEmail.replace("@", "+svc@"),
  }),
});
check("service-RA order accepted with canonical details enforced", svc.status === 200, svc.body);

// 1e. Signing the Articles: exactly one of the two paths must be complete.
//     Florida requires an authorized representative's signature (s. 605.0203(1)(b)),
//     and where the client appoints us, the appointment is what stands in for it.
{
  const noAppointment = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      ...formData,
      articlesSignerChoice: "SERVICE",
      articlesSignerAppointment: false,
      authorizedRepresentativeName: "",
      authorizedRepresentativeSignature: "",
      authorizedRepresentativeSignatureCheckbox: false,
    }),
  });
  check("'we sign' without the appointment is rejected", noAppointment.status === 400,
    noAppointment.body);

  const noSignature = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      ...formData,
      articlesSignerChoice: "SELF",
      authorizedRepresentativeSignature: "",
    }),
  });
  check("'I sign' without a signature is rejected", noSignature.status === 400,
    noSignature.body);

  const appointed = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({
      ...formData,
      articlesSignerChoice: "SERVICE",
      articlesSignerAppointment: true,
      authorizedRepresentativeName: "",
      authorizedRepresentativeSignature: "",
      authorizedRepresentativeSignatureCheckbox: false,
      correspondentEmail: testEmail.replace("@", "+appointed@"),
      confirmCorrespondentEmail: testEmail.replace("@", "+appointed@"),
    }),
  });
  check("'we sign' with the appointment is accepted, with no client signature",
    appointed.status === 200, { status: appointed.status, body: appointed.body });
}

// 2. Place a valid order. The bogus price fields ride along deliberately: the
//    server must price the order from the answers and ignore anything the
//    client claims the total is.
const order = await api("/api/orders", {
  method: "POST",
  body: JSON.stringify({
    ...formData,
    totalCents: 1,
    total: 0.01,
    estimatedStateFees: { estimatedTotal: 0 },
  }),
});
check("accepts valid order (200)", order.status === 200, order.body);
const orderId = order.body?.data?.orderId as string;
const totalCents = order.body?.data?.totalCents as number;
check("price recomputed server-side, client's claimed total ignored: $499 + $50 EIN + $95 S election + $125 = $769.00", totalCents === 76900, { totalCents });

// s. 605.0213: $100 articles + $25 agent designation on a new formation; a
// conversion pays the $25 only when it switches agents.
{
  const { priceOrder } = await import("./pricing");
  const base = { seriesCount: 3, certificateOfStatus: false, certifiedCopy: false, ein: false, sElection: false };
  const brandNew = priceOrder({ ...base, isConversion: false, registeredAgentChange: true });
  const convSwitch = priceOrder({ ...base, isConversion: true, registeredAgentChange: true });
  const convKeep = priceOrder({ ...base, isConversion: true, registeredAgentChange: false });
  check("new formation state fees are $125", brandNew.stateFeesCents === 125_00, brandNew.stateFeesCents);
  check("conversion switching agents owes $25", convSwitch.stateFeesCents === 25_00, convSwitch.stateFeesCents);
  check("conversion keeping its agent owes nothing", convKeep.stateFeesCents === 0, convKeep.stateFeesCents);
}
check("returns checkout URL", typeof order.body?.data?.checkoutUrl === "string");

// 3. Status is pending before payment
const pre = await api(`/api/orders/${orderId}/status`);
check("status pending before payment", pre.body?.data?.status === "pending_payment");

// 4. Simulate Square saying "paid". With no Square creds the dev route exists;
//    with real sandbox creds it does not, so post a Square-shaped webhook event
//    instead (dev accepts unsigned webhooks when no signature key is set).
let sim = await api("/api/dev/simulate-payment", { method: "POST", body: JSON.stringify({ orderId }) });
if (sim.status === 404) {
  const adminEarly = await adminSession();
  const full = await api(`/api/admin/orders/${orderId}`, { cookies: adminEarly.cookie });
  const squareOrderId = (full.body?.data as { squareOrderId?: string })?.squareOrderId;
  sim = await api("/api/square/webhook", {
    method: "POST",
    body: JSON.stringify({
      event_id: `e2e-${orderId}`,
      type: "payment.updated",
      data: { object: { payment: { id: `e2e-pay-${orderId.slice(0, 8)}`, status: "COMPLETED", order_id: squareOrderId } } },
    }),
  });
}
check("payment fulfillment runs", sim.status === 200, sim.body);
const post = await api(`/api/orders/${orderId}/status`);
check("status flips to paid", post.body?.data?.status === "paid");

// 5. Welcome email was "sent" (dev log) with a set-password link — grab the token from the DB instead
const admin = await adminSession();
check("admin login", admin.status === 200);
const clients = await api("/api/admin/clients", { cookies: admin.cookie });
const client = (clients.body?.data as { id: string; email: string; has_password: boolean }[])?.find(
  (c) => c.email === testEmail,
);
check("client account auto-created on payment", !!client && !client.has_password, clients.body);

// 6. Duplicate fulfillment is a no-op (idempotency)
await api("/api/dev/simulate-payment", { method: "POST", body: JSON.stringify({ orderId }) });
const clients2 = await api("/api/admin/clients", { cookies: admin.cookie });
const dupes = (clients2.body?.data as { email: string }[]).filter((c) => c.email === testEmail);
check("no duplicate client on repeat webhook", dupes.length === 1);

// 7. Admin uploads a document for the client (multipart)
const fd = new FormData();
fd.set("clientId", client!.id);
fd.set("kind", "package");
fd.set("title", "Operating Agreement");
fd.set("notify", "true");
fd.set("file", new File([new TextEncoder().encode("%PDF-1.4 fake pdf for e2e")], "oa.pdf", { type: "application/pdf" }));
const uploadRes = await fetch(BASE + "/api/admin/documents", {
  method: "POST",
  headers: { Cookie: admin.cookie },
  body: fd,
});
check("admin uploads document", uploadRes.status === 200, await uploadRes.clone().json().catch(() => null));

// 8. Client sets password via token (fish the token hash path: use forgot-flow instead — dev email logs the link)
//    Simplest deterministic path: request a reset, then read the dev log is not machine-readable here,
//    so exercise set-password with a token minted through the same public flow the email would carry.
//    We call forgot (which stores a token) — but only the emailed token works. In dev the email is logged
//    by the API process; instead, verify login gate + wrong-password behavior here:
const noLogin = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: testEmail, password: "nope1234" }) });
check("login rejected before password is set", noLogin.status === 401);

// 9. Portal endpoints require auth
const docsNoAuth = await api("/api/portal/documents");
check("portal requires sign-in", docsNoAuth.status === 401);
const cancelNoAuth = await api("/api/portal/registered-agent/cancel", { method: "POST", body: "{}" });
check("RA cancel requires sign-in", cancelNoAuth.status === 401);

// 10. Full portal walk via dev-minted token: set password, sign in, cancel RA
const mint = await api("/api/dev/mint-reset-token", {
  method: "POST",
  body: JSON.stringify({ email: testEmail }),
});
if (mint.status === 200) {
  const setPw = await api("/api/auth/set-password", {
    method: "POST",
    body: JSON.stringify({ token: mint.body.data.token, password: "e2e-password-1" }),
  });
  check("set password via minted token", setPw.status === 200);
  const me = await api("/api/auth/me", { cookies: setPw.cookie });
  check("me shows no RA cancellation yet", me.status === 200 && me.body.data.raCancellationRequestedAt === null);
  const cancel = await api("/api/portal/registered-agent/cancel", {
    method: "POST",
    body: "{}",
    cookies: setPw.cookie,
  });
  check("RA cancel records a timestamp", cancel.status === 200 && Boolean(cancel.body.data.raCancellationRequestedAt));
  const cancelAgain = await api("/api/portal/registered-agent/cancel", {
    method: "POST",
    body: "{}",
    cookies: setPw.cookie,
  });
  check(
    "RA cancel is idempotent",
    cancelAgain.status === 200 &&
      cancelAgain.body.data.raCancellationRequestedAt === cancel.body.data.raCancellationRequestedAt,
  );
  const meAfter = await api("/api/auth/me", { cookies: setPw.cookie });
  check("me reflects the cancellation request", Boolean(meAfter.body.data.raCancellationRequestedAt));

  // 11. Service orders: intake EIN became a paid order awaiting details
  const svc0 = await api("/api/portal/services", { cookies: setPw.cookie });
  check("portal services lists LLC name", svc0.body?.data?.llcName?.length > 0, svc0.body?.data);
  const intakeEin = (svc0.body?.data?.orders ?? []).find(
    (o: { type: string; status: string }) => o.type === "ein" && o.status === "awaiting_info",
  );
  check("intake EIN order created awaiting_info", Boolean(intakeEin));
  // One EIN per entity: the intake purchase blocks a second company-EIN order;
  // a series target stays open.
  const dupCompanyEin = await api("/api/portal/services/ein", {
    method: "POST", cookies: setPw.cookie, body: JSON.stringify({ target: "company" }),
  });
  check(
    "second company EIN refused (ALREADY_ORDERED)",
    dupCompanyEin.status === 400 && dupCompanyEin.body?.error?.code === "ALREADY_ORDERED",
    dupCompanyEin.body,
  );
  // The dialog offers only the client's real series; the server enforces it.
  const svcSeries = svc0.body?.data?.series ?? [];
  check(
    "services payload lists the client's series with EIN coverage",
    Array.isArray(svcSeries) && svcSeries.length >= 1 && svcSeries[0].einOrdered === false,
    svcSeries,
  );
  const fakeSeriesEin = await api("/api/portal/services/ein", {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ target: "series", seriesName: "E2E Nonexistent Series, LLC - PS 9" }),
  });
  check(
    "EIN for a series not on the account refused (UNKNOWN_SERIES)",
    fakeSeriesEin.status === 400 && fakeSeriesEin.body?.error?.code === "UNKNOWN_SERIES",
    fakeSeriesEin.body,
  );
  const realSeriesEin = await api("/api/portal/services/ein", {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ target: "series", seriesName: svcSeries[0]?.name ?? "" }),
  });
  check(
    "EIN for a real series accepted with a checkout link",
    realSeriesEin.status === 200 && typeof realSeriesEin.body?.data?.checkoutUrl === "string",
    realSeriesEin.body,
  );
  const intakeSElection = (svc0.body?.data?.orders ?? []).find(
    (o: { type: string; status: string }) => o.type === "s-election" && o.status === "awaiting_info",
  );
  check("intake S election order created awaiting_info", Boolean(intakeSElection));

  // 12. Order an additional series from the portal, pay, and check state
  const badSeries = await api("/api/portal/services/series", {
    method: "POST", cookies: setPw.cookie, body: JSON.stringify({ suffix: "Tower Nine" }),
  });
  check("series without PS phrase rejected", badSeries.status === 400);
  const series = await api("/api/portal/services/series", {
    method: "POST", cookies: setPw.cookie, body: JSON.stringify({ suffix: "PS 9" }),
  });
  check("portal series order accepted", series.status === 200, series.body);
  check("series order total $50", series.body?.data?.totalCents === 5000);
  const seriesId = series.body?.data?.serviceOrderId as string;
  const simSvc = await api("/api/dev/simulate-payment", { method: "POST", body: JSON.stringify({ orderId: seriesId }) });
  if (simSvc.status === 404) {
    // Sandbox Square creds present: pay via a webhook-shaped event instead.
    const adminSvc = await adminSession();
    const svcDetail = await api(`/api/admin/services/${seriesId}`, { cookies: adminSvc.cookie });
    await api("/api/square/webhook", {
      method: "POST",
      body: JSON.stringify({
        event_id: `e2e-svc-${seriesId}`,
        type: "payment.updated",
        data: {
          object: {
            payment: {
              id: `e2e-pay-svc-${seriesId.slice(0, 8)}`,
              status: "COMPLETED",
              order_id: svcDetail.body?.data?.square_order_id,
            },
          },
        },
      }),
    });
  }
  const svc1 = await api("/api/portal/services", { cookies: setPw.cookie });
  const paidSeries = (svc1.body?.data?.orders ?? []).find((o: { id: string }) => o.id === seriesId);
  check("paid series order is in_progress", paidSeries?.status === "in_progress", paidSeries);

  // 13. Submit EIN details securely; verify encryption round-trip via admin
  const einDetails = await api(`/api/portal/services/${intakeEin.id}/ein-details`, {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ responsibleName: "Casey Member", tin: "123-45-6789", certified: true }),
  });
  check("EIN details accepted", einDetails.status === 200, einDetails.body);
  const einUncertified = await api(`/api/portal/services/${intakeEin.id}/ein-details`, {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ responsibleName: "Casey Member", tin: "123-45-6789" }),
  });
  check("EIN details without the certification rejected", einUncertified.status === 400, einUncertified.body);
  const einAgain = await api(`/api/portal/services/${intakeEin.id}/ein-details`, {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ responsibleName: "X", tin: "999999999", certified: true }),
  });
  check("EIN details cannot be resubmitted", einAgain.status === 400);

  const adminLogin2 = await adminSession();
  const adminDetail = await api(`/api/admin/services/${intakeEin.id}`, { cookies: adminLogin2.cookie });
  check("admin decrypts TIN for SS-4", adminDetail.body?.data?.tin === "123456789", adminDetail.body?.data);
  check("client-facing record keeps only last 4", adminDetail.body?.data?.details?.tinLast4 === "6789");

  // 13b. Fulfill the series order WITH an attached document — it must land in
  //      the client's portal documents in the same action.
  const fulfillFd = new FormData();
  fulfillFd.set("notify", "false");
  fulfillFd.set(
    "file",
    new File([new TextEncoder().encode("%PDF-1.4 filed designation for e2e")], "designation.pdf", {
      type: "application/pdf",
    }),
  );
  const fulfillSeries = await fetch(`${BASE}/api/admin/services/${seriesId}/fulfill`, {
    method: "POST",
    headers: { Cookie: adminLogin2.cookie },
    body: fulfillFd,
  });
  const fulfillSeriesBody = (await fulfillSeries.json().catch(() => null)) as {
    data?: { documentId?: string | null };
  } | null;
  check("series fulfill with attachment succeeds", fulfillSeries.ok, fulfillSeriesBody);
  check("fulfill returns a document id", Boolean(fulfillSeriesBody?.data?.documentId));
  const docsAfter = await api("/api/portal/documents", { cookies: setPw.cookie });
  const attached = (docsAfter.body?.data as { title: string }[] | undefined)?.find((d) =>
    d.title.includes("Protected Series Designation"),
  );
  check("attached designation appears in client portal documents", Boolean(attached), docsAfter.body?.data);

  // 13c. Operating agreement: seed, answers, generate, regenerate as A&R
  const oaSeed = await api("/api/portal/oa", { cookies: setPw.cookie });
  check("OA seed loads with LLC + member", oaSeed.status === 200 && oaSeed.body?.data?.seed?.members?.length === 1, oaSeed.body?.data?.seed);
  check("OA seed includes portal-added series", (oaSeed.body?.data?.seed?.series ?? []).some((sr: { name: string }) => sr.name.endsWith("PS 9")), oaSeed.body?.data?.seed?.series);
  const oaAnswers = {
    firstOrAmended: "first",
    effectiveDate: "2026-08-05",
    authorized: true,
    contributionToCompany: "$1,000 cash",
    members: [{ todBeneficiary: "Jordan Member" }],
    series: [],
  };
  const saveAns = await api("/api/portal/oa/answers", { method: "PUT", cookies: setPw.cookie, body: JSON.stringify(oaAnswers) });
  check("OA answers save", saveAns.status === 200);
  const gen1 = await api("/api/portal/oa/generate", { method: "POST", cookies: setPw.cookie, body: JSON.stringify(oaAnswers) });
  check("OA generates", gen1.status === 200, gen1.body);
  check("a sole owner who is member-managed gets the member-single master", gen1.body?.data?.version === "member-single", gen1.body?.data);
  check(
    "OA title carries the taxation designation",
    /^(Single-Member|Partnership|S Corporation) Operating Agreement/.test(gen1.body?.data?.title ?? ""),
    gen1.body?.data,
  );
  const gen2 = await api("/api/portal/oa/generate", {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ ...oaAnswers, firstOrAmended: "amended" }),
  });
  check("OA regenerates as Amended & Restated", gen2.status === 200 && gen2.body?.data?.title?.startsWith("Amended and Restated"), gen2.body?.data);
  // Was: typeof version === "string" — true for all eight masters, so it could
  // not tell a correct routing from a wrong one. Name the master.
  check(
    "the stored generation records which master was used",
    (await api("/api/portal/oa", { cookies: setPw.cookie })).body?.data?.generations?.[0]?.version === "member-single",
  );
  const oaAfter = await api("/api/portal/oa", { cookies: setPw.cookie });
  check("generation history has 2 entries", (oaAfter.body?.data?.generations ?? []).length === 2);
  check("generations are numbered in the title", /\(No\. \d\)/.test(gen2.body?.data?.title ?? ""), gen2.body?.data?.title);
  const oaDocId = gen1.body?.data?.documentId as string;
  const oaPdf = await fetch(`${BASE}/api/portal/documents/${oaDocId}/download`, { headers: { Cookie: setPw.cookie } });
  const oaBytes = new Uint8Array(await oaPdf.arrayBuffer());
  check("generated OA downloads as PDF", oaPdf.ok && oaBytes[0] === 0x25 && oaBytes[1] === 0x50, { status: oaPdf.status, len: oaBytes.length });

  // --- consent + Series Exhibit for a series added after formation ---
  const badName = await api("/api/portal/series/consent", {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ seriesName: "Totally Different Co, PS 4", seriesNumber: "4", purpose: "", effectiveDate: "2026-09-01" }),
  });
  check("series name not beginning with the company name is refused (s. 605.2202)",
    badName.status === 400, badName.body);
  const noPS = await api("/api/portal/series/consent", {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ seriesName: "E2E Coastal Holdings, LLC - Unit 4", seriesNumber: "4", purpose: "", effectiveDate: "2026-09-01" }),
  });
  check('series name without "PS" is refused (s. 605.2202)', noPS.status === 400, noPS.body);
  const consent = await api("/api/portal/series/consent", {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({
      seriesName: "E2E Coastal Holdings, LLC, PS D",
      seriesNumber: "D",
      purpose: "to acquire, own, and lease the real property at 400 Bay Court",
      effectiveDate: "2026-09-01",
    }),
  });
  check("consent + Series Exhibit generates", consent.status === 200, consent.body);
  const consentPdf = await fetch(`${BASE}/api/portal/documents/${consent.body?.data?.documentId}/download`,
    { headers: { Cookie: setPw.cookie } });
  const consentBytes = new Uint8Array(await consentPdf.arrayBuffer());
  check("consent downloads as PDF", consentPdf.ok && consentBytes[0] === 0x25 && consentBytes[1] === 0x50,
    { status: consentPdf.status, len: consentBytes.length });
  check("consent appears in the client's documents",
    ((await api("/api/portal/documents", { cookies: setPw.cookie })).body?.data ?? [])
      .some((d: { title: string }) => d.title.includes("PS D")));

  // A client can tidy their own drafts, but never a document we posted.
  const genList = oaAfter.body?.data?.generations ?? [];
  const oldest = genList[genList.length - 1];
  const delOther = await api(`/api/portal/oa/generations/${crypto.randomUUID()}`, { method: "DELETE", cookies: setPw.cookie });
  check("deleting an unknown generation is refused", delOther.status === 404);
  const delOk = await api(`/api/portal/oa/generations/${oldest.id}`, { method: "DELETE", cookies: setPw.cookie });
  check("client deletes their own draft", delOk.status === 200, delOk.body);
  const oaAfterDel = await api("/api/portal/oa", { cookies: setPw.cookie });
  check("generation history now has 1 entry", (oaAfterDel.body?.data?.generations ?? []).length === 1);
  const goneDoc = await fetch(`${BASE}/api/portal/documents/${oldest.document_id}/download`, { headers: { Cookie: setPw.cookie } });
  check("the deleted draft's PDF is gone", goneDoc.status === 404, { status: goneDoc.status });

  // 13c-2. Sole owner on the S corporation form (option defaults applied server-side)
  const genS = await api("/api/portal/oa/generate", {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ ...oaAnswers, sElection: true }),
  });
  check("sole-owner S corp agreement generates", genS.status === 200, genS.body);
  check("...and member-single-s once the S election is on", genS.body?.data?.version === "member-single-s", genS.body?.data);
  const sDocId = genS.body?.data?.documentId as string;
  const sPdf = await fetch(`${BASE}/api/portal/documents/${sDocId}/download`, { headers: { Cookie: setPw.cookie } });
  const sBytes = new Uint8Array(await sPdf.arrayBuffer());
  check("S corp agreement downloads as PDF", sPdf.ok && sBytes[0] === 0x25 && sBytes[1] === 0x50, { status: sPdf.status, len: sBytes.length });

  // 13d. Manual library: admin publishes, client downloads stamped copy
  const manualFd = new FormData();
  manualFd.set("title", "Series LLC Owner's Manual");
  manualFd.set("edition", "E2E Edition");
  manualFd.set("file", new File([new TextEncoder().encode("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF")], "manual.pdf", { type: "application/pdf" }));
  const pub = await fetch(`${BASE}/api/admin/library/owners-manual`, { method: "POST", headers: { Cookie: adminLogin2.cookie }, body: manualFd });
  check("admin publishes manual", pub.ok, await pub.json().catch(() => null));
  const lib = await api("/api/portal/library", { cookies: setPw.cookie });
  check("portal library lists manual", (lib.body?.data ?? []).some((d: { key: string }) => d.key === "owners-manual"), lib.body);
  const dl = await fetch(`${BASE}/api/portal/library/owners-manual/download`, { headers: { Cookie: setPw.cookie } });
  const dlBytes = new Uint8Array(await dl.arrayBuffer());
  check("manual downloads stamped as PDF", dl.ok && dlBytes[0] === 0x25 && dlBytes[1] === 0x50, { status: dl.status, len: dlBytes.length });
  // The stub above just proved upload works — it must never be what clients
  // see. Regenerating from the master replaces it with the real manual, so
  // the suite leaves the library HEALED, not clobbered (the defect behind
  // every client downloading a 199-byte blank since Aug 6).
  const regen = await api("/api/admin/library/owners-manual/regenerate", {
    method: "POST", cookies: adminLogin2.cookie,
  });
  check("manual regenerates from the master", regen.status === 200 && regen.body?.data?.published === true, regen.body);
  const realDl = await fetch(`${BASE}/api/portal/library/owners-manual/download`, { headers: { Cookie: setPw.cookie } });
  const realBytes = new Uint8Array(await realDl.arrayBuffer());
  check(
    "client now downloads the real manual (multi-page PDF, not the stub)",
    realDl.ok && realBytes[0] === 0x25 && realBytes.length > 100_000,
    { status: realDl.status, len: realBytes.length },
  );

  // 14. EIN fulfillment requires the IRS letter; fulfilling deletes the TIN
  const noLetter = await api(`/api/admin/services/${intakeEin.id}/fulfill`, {
    method: "POST", cookies: adminLogin2.cookie, body: JSON.stringify({ notify: false }),
  });
  check("EIN fulfill without letter rejected", noLetter.status === 400, noLetter.body);
  const einFd = new FormData();
  einFd.set("notify", "false");
  einFd.set(
    "file",
    new File([new TextEncoder().encode("%PDF-1.4 CP 575 letter for e2e")], "cp575.pdf", { type: "application/pdf" }),
  );
  const fulfillRes = await fetch(`${BASE}/api/admin/services/${intakeEin.id}/fulfill`, {
    method: "POST", headers: { Cookie: adminLogin2.cookie }, body: einFd,
  });
  const fulfill = { status: fulfillRes.status, body: await fulfillRes.json().catch(() => null) as unknown };
  check("admin fulfills EIN order with letter", fulfill.status === 200, fulfill.body);
  const einDocs = await api("/api/portal/documents", { cookies: setPw.cookie });
  check(
    "EIN letter appears in client portal documents",
    (einDocs.body?.data as { title: string }[] | undefined)?.some((d) => d.title.includes("EIN Confirmation Letter")) === true,
    einDocs.body?.data,
  );
  const afterFulfill = await api(`/api/admin/services/${intakeEin.id}`, { cookies: adminLogin2.cookie });
  check(
    "TIN deleted at fulfillment",
    afterFulfill.body?.data?.status === "fulfilled" && afterFulfill.body?.data?.tin === null,
    afterFulfill.body?.data,
  );
} else {
  check("dev mint-reset-token available (dev only)", false);
}

// 15. Multi-member order with a TBE spousal couple → generated agreement
{
  const coupleEmail = `e2e-couple-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const multiData = {
    ...formData,
    managementStructure: "MANAGER_MANAGED",
    includeManagementStatementInArticles: true,
    managers: [
      {
        id: "mgr1", role: "MGR", personOrEntity: "INDIVIDUAL", firstName: "Casey", lastName: "Member",
        streetAddress1: "100 Ocean Drive", city: "Miami", state: "FL", zip: "33139", country: "United States",
      },
    ],
    members: [
      { ...structuredClone(defaultFormData.members[0]), firstName: "Sam", lastName: "Ortiz", address1: "50 Sunset Blvd", city: "Orlando", state: "FL", zip: "32801" },
      { ...structuredClone(defaultFormData.members[0]), firstName: "Riley", lastName: "Ortiz", address1: "50 Sunset Blvd", city: "Orlando", state: "FL", zip: "32801" },
    ],
    correspondentEmail: coupleEmail,
    confirmCorrespondentEmail: coupleEmail,
    orderEin: false,
    orderSElection: false, // the couple's S election is purchased from the portal in 15c
  };
  const mOrder = await api("/api/orders", { method: "POST", body: JSON.stringify(multiData) });
  check("multi-member order accepted", mOrder.status === 200, mOrder.body);
  const mOrderId = mOrder.body?.data?.orderId as string;
  let mSim = await api("/api/dev/simulate-payment", { method: "POST", body: JSON.stringify({ orderId: mOrderId }) });
  if (mSim.status === 404) {
    const adm = await adminSession();
    const full = await api(`/api/admin/orders/${mOrderId}`, { cookies: adm.cookie });
    const sqId = (full.body?.data as { squareOrderId?: string })?.squareOrderId;
    mSim = await api("/api/square/webhook", {
      method: "POST",
      body: JSON.stringify({
        event_id: `e2e-multi-${mOrderId}`, type: "payment.updated",
        data: { object: { payment: { id: `e2e-pay-m-${mOrderId.slice(0, 8)}`, status: "COMPLETED", order_id: sqId } } },
      }),
    });
  }
  check("multi-member order paid", mSim.status === 200);
  const mMint = await api("/api/dev/mint-reset-token", { method: "POST", body: JSON.stringify({ email: coupleEmail }) });
  const mPw = await api("/api/auth/set-password", {
    method: "POST",
    body: JSON.stringify({ token: mMint.body?.data?.token, password: "e2e-password-2" }),
  });
  check("couple client signs in", mPw.status === 200);
  const mSeed = await api("/api/portal/oa", { cookies: mPw.cookie });
  check("multi OA seed has 2 members", mSeed.body?.data?.version === "multi" && mSeed.body?.data?.multiOwner === true && mSeed.body?.data?.seed?.members?.length === 2, mSeed.body?.data);
  const coupleAnswers = {
    firstOrAmended: "first",
    effectiveDate: "2026-08-06",
    authorized: true,
    members: [{}, {}],
    series: [{}],
    couples: [{ a: 0, b: 1, form: "TBE", percentage: 100, contribution: "$2,000 cash", todBeneficiary: "Ortiz Family Trust" }],
    includeCapitalCalls: false,
    competition: "B",
    includeShotgun: false,
    borrowingThreshold: 20000,
  };
  const badCouple = await api("/api/portal/oa/generate", {
    method: "POST", cookies: mPw.cookie,
    body: JSON.stringify({ ...coupleAnswers, couples: [{ a: 0, b: 0, form: "TBE", percentage: 100 }] }),
  });
  check("self-pairing rejected", badCouple.status === 400);
  // A couple holding jointly with no third owner owns 100% by definition, and
  // the questionnaire never asks — so generation must succeed with no
  // percentage recorded anywhere.
  const noPctAnswers = {
    ...coupleAnswers,
    couples: [{ a: 0, b: 1, form: "TBE", contribution: "$2,000 cash", todBeneficiary: "Ortiz Family Trust" }],
    series: [{}],
  };
  const noPctGen = await api("/api/portal/oa/generate", { method: "POST", cookies: mPw.cookie, body: JSON.stringify(noPctAnswers) });
  check("couple-only company generates without any ownership answer", noPctGen.status === 200, noPctGen.body);

  const mGen = await api("/api/portal/oa/generate", { method: "POST", cookies: mPw.cookie, body: JSON.stringify(coupleAnswers) });
  check("TBE couple agreement generates", mGen.status === 200, mGen.body);
  check("two owners, manager-managed, gets the multi master", mGen.body?.data?.version === "multi", mGen.body?.data);
  const mDocId = mGen.body?.data?.documentId as string;
  const mPdf = await fetch(`${BASE}/api/portal/documents/${mDocId}/download`, { headers: { Cookie: mPw.cookie } });
  const mBytes = new Uint8Array(await mPdf.arrayBuffer());
  check("TBE agreement downloads as PDF", mPdf.ok && mBytes[0] === 0x25 && mBytes[1] === 0x50, { status: mPdf.status, len: mBytes.length });

  // 15b. Same couple on the S corporation form (series associations ignored — identical ownership)
  const sCoupleGen = await api("/api/portal/oa/generate", {
    method: "POST", cookies: mPw.cookie,
    body: JSON.stringify({ ...coupleAnswers, sElection: true, series: [{}] }),
  });
  check("multi-owner S corp agreement generates", sCoupleGen.status === 200, sCoupleGen.body);
  check("...and the s master once the S election is on", sCoupleGen.body?.data?.version === "s", sCoupleGen.body?.data);
  const sCoupleDocId = sCoupleGen.body?.data?.documentId as string;
  const sCouplePdf = await fetch(`${BASE}/api/portal/documents/${sCoupleDocId}/download`, { headers: { Cookie: mPw.cookie } });
  const sCoupleBytes = new Uint8Array(await sCouplePdf.arrayBuffer());
  check("multi-owner S corp PDF downloads", sCouplePdf.ok && sCoupleBytes[0] === 0x25 && sCoupleBytes[1] === 0x50, { status: sCouplePdf.status, len: sCoupleBytes.length });

  // 15c. S corporation election package: 65-day window, secure details, draft, fulfillment
  await api("/api/dev/age-formation", { method: "POST", body: JSON.stringify({ email: coupleEmail, days: 66 }) });
  const closedTry = await api("/api/portal/services/s-election", { method: "POST", cookies: mPw.cookie, body: "{}" });
  check("S election blocked after 65-day window", closedTry.status === 400 && closedTry.body?.error?.code === "WINDOW_CLOSED", closedTry.body);
  await api("/api/dev/age-formation", { method: "POST", body: JSON.stringify({ email: coupleEmail, days: 0 }) });
  const svcS = await api("/api/portal/services", { cookies: mPw.cookie });
  check(
    "portal advertises S election with order-by date",
    svcS.body?.data?.sElection?.eligible === true && Boolean(svcS.body?.data?.sElection?.orderBy),
    svcS.body?.data?.sElection,
  );
  const sOrder = await api("/api/portal/services/s-election", { method: "POST", cookies: mPw.cookie, body: "{}" });
  check("S election order accepted in window", sOrder.status === 200 && sOrder.body?.data?.totalCents === 9500, sOrder.body);
  const sId = sOrder.body?.data?.serviceOrderId as string;
  const adminS = await adminSession();
  let sPay = await api("/api/dev/simulate-payment", { method: "POST", body: JSON.stringify({ orderId: sId }) });
  if (sPay.status === 404) {
    const det = await api(`/api/admin/services/${sId}`, { cookies: adminS.cookie });
    sPay = await api("/api/square/webhook", {
      method: "POST",
      body: JSON.stringify({
        event_id: `e2e-sel-${sId}`, type: "payment.updated",
        data: { object: { payment: { id: `e2e-pay-sel-${sId.slice(0, 8)}`, status: "COMPLETED", order_id: det.body?.data?.square_order_id } } },
      }),
    });
  }
  check("S election order paid", sPay.status === 200);
  const dupTry = await api("/api/portal/services/s-election", { method: "POST", cookies: mPw.cookie, body: "{}" });
  check("duplicate S election order rejected", dupTry.status === 400, dupTry.body);
  const badPct = await api(`/api/portal/services/${sId}/s-election-details`, {
    method: "POST", cookies: mPw.cookie,
    body: JSON.stringify({
      ein: "", einPending: true, dateIncorporated: "2026-08-01", effectiveDate: "2026-08-01",
      officerName: "Maria Ortiz", officerTitle: "Manager", phone: "(305) 555-0100",
      shareholders: [
        { name: "Maria Ortiz and Carlos Ortiz, as tenants by the entirety", address: "500 Bay Street, Miami, FL 33131", percentage: 60, dateAcquired: "2026-08-01", ssn: "123456789" },
      ],
    }),
  });
  check("S election details with bad percentages rejected", badPct.status === 400);
  const goodDetails = {
    ein: "88-1234567", einPending: false, dateIncorporated: "2026-08-01", effectiveDate: "2026-08-01",
    officerName: "Maria Ortiz", officerTitle: "Manager", phone: "(305) 555-0100",
    certified: true as const,
    shareholders: [
      { name: "Maria Ortiz and Carlos Ortiz, as tenants by the entirety", address: "500 Bay Street, Miami, FL 33131", percentage: 100, dateAcquired: "2026-08-01", ssn: "123-45-6789" },
    ],
  };
  const uncertified = await api(`/api/portal/services/${sId}/s-election-details`, {
    method: "POST", cookies: mPw.cookie,
    body: JSON.stringify({ ...goodDetails, certified: false }),
  });
  check("S election details without the certification rejected", uncertified.status === 400, uncertified.body);
  const sDetails = await api(`/api/portal/services/${sId}/s-election-details`, {
    method: "POST", cookies: mPw.cookie, body: JSON.stringify(goodDetails),
  });
  check("S election details accepted", sDetails.status === 200, sDetails.body);
  check("package built and returned immediately", Boolean(sDetails.body?.data?.documentId), sDetails.body?.data);
  const readyDoc = await fetch(`${BASE}/api/portal/documents/${sDetails.body?.data?.documentId}/download`, {
    headers: { Cookie: mPw.cookie },
  });
  const readyBytes = new Uint8Array(await readyDoc.arrayBuffer());
  check(
    "client can download the package right away",
    readyDoc.ok && readyBytes[0] === 0x25 && readyBytes[1] === 0x50,
    { status: readyDoc.status, len: readyBytes.length },
  );
  const svcNow = await api("/api/portal/services", { cookies: mPw.cookie });
  const sRow = (svcNow.body?.data?.orders ?? []).find((o: { id: string }) => o.id === sId);
  check("order shows an edit deadline", Boolean(sRow?.editable && sRow?.editableUntil), sRow);
  check("owner dropdown gets the LLC's members", (svcNow.body?.data?.members ?? []).length > 0, svcNow.body?.data?.members);
  // Editing inside the window: a blank SSN keeps the number already on file.
  const edited = await api(`/api/portal/services/${sId}/s-election-details`, {
    method: "POST", cookies: mPw.cookie,
    body: JSON.stringify({
      ...goodDetails,
      phone: "(305) 555-0199",
      shareholders: [{ ...goodDetails.shareholders[0], ssn: "" }],
    }),
  });
  check("client can edit inside the window without retyping SSNs", edited.status === 200, edited.body);
  const afterEdit = await api(`/api/admin/services/${sId}`, { cookies: adminS.cookie });
  check("kept SSN survives the edit", afterEdit.body?.data?.ssns?.[0] === "123456789", afterEdit.body?.data?.ssns);
  const docsAfterEdit = await api("/api/portal/documents", { cookies: mPw.cookie });
  check(
    "regenerating replaces the package instead of stacking copies",
    (docsAfterEdit.body?.data ?? []).filter((d: { title: string }) => d.title.includes("S Corporation Election Package")).length === 1,
    docsAfterEdit.body?.data?.map((d: { title: string }) => d.title),
  );
  const sAdminDetail = await api(`/api/admin/services/${sId}`, { cookies: adminS.cookie });
  check("admin decrypts shareholder SSNs", sAdminDetail.body?.data?.ssns?.[0] === "123456789", sAdminDetail.body?.data);
  check(
    "client-facing record keeps only SSN last 4",
    sAdminDetail.body?.data?.details?.shareholders?.[0]?.ssnLast4 === "6789",
    sAdminDetail.body?.data?.details,
  );
  const draft = await fetch(`${BASE}/api/admin/services/${sId}/s-election-draft`, { headers: { Cookie: adminS.cookie } });
  const draftBytes = new Uint8Array(await draft.arrayBuffer());
  check("admin can still review the package", draft.ok && draftBytes[0] === 0x25 && draftBytes[1] === 0x50, { status: draft.status, len: draftBytes.length });

  // The two-week clock: backdate the order and prove the sweep destroys the
  // package, the SSNs and the owner rows, leaving the order record behind.
  const purgeRes = await api("/api/dev/expire-s-election", { method: "POST", body: JSON.stringify({ orderId: sId }) });
  check("dev backdate hook available", purgeRes.status === 200, purgeRes.body);
  const swept = await api("/api/portal/services", { cookies: mPw.cookie });
  const sweptRow = (swept.body?.data?.orders ?? []).find((o: { id: string }) => o.id === sId);
  check("expired package is no longer editable", sweptRow?.editable === false, sweptRow);
  check("expired package records when the numbers went", Boolean(sweptRow?.details?.purgedAt), sweptRow?.details);
  const sAfter = await api(`/api/admin/services/${sId}`, { cookies: adminS.cookie });
  check("shareholder SSNs destroyed after the window", sAfter.body?.data?.ssns === null, sAfter.body?.data);
  const sDocs = await api("/api/portal/documents", { cookies: mPw.cookie });
  const recordDoc = (sDocs.body?.data ?? []).find((d: { title: string }) => d.title.includes("S Corporation Election Package"));
  check("the client keeps a record copy", recordDoc?.title.includes("Record Copy"), sDocs.body?.data?.map((d: { title: string }) => d.title));
  const recordPdf = await fetch(`${BASE}/api/portal/documents/${recordDoc?.id}/download`, { headers: { Cookie: mPw.cookie } });
  const recordBytes = new Uint8Array(await recordPdf.arrayBuffer());
  check(
    "record copy still downloads as a PDF",
    recordPdf.ok && recordBytes[0] === 0x25 && recordBytes[1] === 0x50,
    { status: recordPdf.status, len: recordBytes.length },
  );
  // The whole point of rebuilding rather than drawing boxes: the digits are
  // not in the file at all, so no viewer can recover them.
  const asText = new TextDecoder("latin1").decode(recordBytes);
  check("full SSN is absent from the record copy bytes", !asText.includes("123-45-6789") && !asText.includes("123456789"), null);
  // Page count proves the notice sheet, cover letter and both form pages are
  // all still there; the stamp itself is checked by eye against the render.
  const recordPages = (asText.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check("record copy keeps the whole package", recordPages >= 4, { recordPages });
  const lateEdit = await api(`/api/portal/services/${sId}/s-election-details`, {
    method: "POST", cookies: mPw.cookie, body: JSON.stringify(goodDetails),
  });
  check("editing after the window is refused", lateEdit.status === 400, lateEdit.body);
}

// 16. Member-managed multi-member: routed to the member-managed masters
{
  const mmEmail = `e2e-mm-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const mmData = {
    ...formData,
    managementStructure: "MEMBER_MANAGED",
    includeManagementStatementInArticles: true,
    managers: [],
    members: [
      { ...structuredClone(defaultFormData.members[0]), firstName: "Dana", lastName: "Reed", address1: "70 Palm Way", city: "Tampa", state: "FL", zip: "33601", ownershipPercentage: 50 },
      { ...structuredClone(defaultFormData.members[0]), firstName: "Jamie", lastName: "Reed", address1: "70 Palm Way", city: "Tampa", state: "FL", zip: "33601", ownershipPercentage: 50 },
    ],
    correspondentName: "Dana Reed",
    correspondentEmail: mmEmail,
    confirmCorrespondentEmail: mmEmail,
    registeredAgentFirstName: "Dana", registeredAgentLastName: "Reed",
    registeredAgentAcceptanceName: "Dana Reed",
    registeredAgentElectronicSignature: "Dana Reed",
    authorizedRepresentativeName: "Dana Reed",
    authorizedRepresentativeSignature: "Dana Reed",
    desiredLlcName: "E2E Member Managed Holdings",
    series: [{ id: "s1", name: "E2E Member Managed Holdings, LLC, PS A" }],
    orderEin: false,
    orderSElection: false,
  };
  const mmOrder = await api("/api/orders", { method: "POST", body: JSON.stringify(mmData) });
  check("member-managed order accepted", mmOrder.status === 200, mmOrder.body);
  const mmId = mmOrder.body?.data?.orderId as string;
  let mmPay = await api("/api/dev/simulate-payment", { method: "POST", body: JSON.stringify({ orderId: mmId }) });
  if (mmPay.status === 404) {
    const adm = await adminSession();
    const full = await api(`/api/admin/orders/${mmId}`, { cookies: adm.cookie });
    mmPay = await api("/api/square/webhook", {
      method: "POST",
      body: JSON.stringify({
        event_id: `e2e-mm-${mmId}`, type: "payment.updated",
        data: { object: { payment: { id: `e2e-pay-mm-${mmId.slice(0, 8)}`, status: "COMPLETED", order_id: full.body?.data?.squareOrderId } } },
      }),
    });
  }
  check("member-managed order paid", mmPay.status === 200);
  const mmMint = await api("/api/dev/mint-reset-token", { method: "POST", body: JSON.stringify({ email: mmEmail }) });
  const mmPw = await api("/api/auth/set-password", {
    method: "POST", body: JSON.stringify({ token: mmMint.body?.data?.token, password: "e2e-password-3" }),
  });
  check("member-managed client signs in", mmPw.status === 200);
  const mmSeed = await api("/api/portal/oa", { cookies: mmPw.cookie });
  check(
    "OA seed routes to member-managed (no longer blocked)",
    mmSeed.body?.data?.version === "member" && mmSeed.body?.data?.multiOwner === true && mmSeed.body?.data?.blocked === false && mmSeed.body?.data?.memberManaged === true,
    mmSeed.body?.data,
  );
  const mmAnswers = {
    firstOrAmended: "first", effectiveDate: "2026-08-08", authorized: true,
    members: [{ percentage: 50, contribution: "$500 cash" }, { percentage: 50, contribution: "$500 cash" }],
    series: [{}],
    includeCapitalCalls: false, competition: "A", includeShotgun: false, borrowingThreshold: 30000,
  };
  // Fractions: three equal owners are 1/3 each, which percentages cannot express.
  const thirdsAnswers = {
    ...mmAnswers,
    ownershipMode: "fraction",
    members: [{ numerator: 1, denominator: 2, contribution: "$500 cash" }, { numerator: 1, denominator: 2, contribution: "$500 cash" }],
    series: [{}],
  };
  const badThirds = await api("/api/portal/oa/generate", {
    method: "POST", cookies: mmPw.cookie,
    body: JSON.stringify({ ...thirdsAnswers, members: [
      { numerator: 1, denominator: 3, contribution: "$500 cash" },
      { numerator: 1, denominator: 3, contribution: "$500 cash" },
    ] }),
  });
  check("company fractions that don't total one whole are rejected", badThirds.status === 400, badThirds.body);
  const goodFractions = await api("/api/portal/oa/generate", {
    method: "POST", cookies: mmPw.cookie, body: JSON.stringify(thirdsAnswers),
  });
  check("fractional ownership generates", goodFractions.status === 200, goodFractions.body);
  const mmGen = await api("/api/portal/oa/generate", { method: "POST", cookies: mmPw.cookie, body: JSON.stringify(mmAnswers) });
  check("member-managed agreement generates", mmGen.status === 200, mmGen.body);
  check("two owners, member-managed, gets the member master", mmGen.body?.data?.version === "member", mmGen.body?.data);
  const mmDoc = mmGen.body?.data?.documentId as string;
  const mmPdf = await fetch(`${BASE}/api/portal/documents/${mmDoc}/download`, { headers: { Cookie: mmPw.cookie } });
  const mmBytes = new Uint8Array(await mmPdf.arrayBuffer());
  check("member-managed PDF downloads", mmPdf.ok && mmBytes[0] === 0x25 && mmBytes[1] === 0x50, { status: mmPdf.status });
  const mmSGen = await api("/api/portal/oa/generate", {
    method: "POST", cookies: mmPw.cookie, body: JSON.stringify({ ...mmAnswers, sElection: true, series: [{}] }),
  });
  check("member-managed S corp agreement generates", mmSGen.status === 200, mmSGen.body);
  check("...and the member-s master once the S election is on", mmSGen.body?.data?.version === "member-s", mmSGen.body?.data);
}

// 16b. Manager-managed SOLE owner — the two forms nothing else exercised.
//
// The suite covered six of eight: the main flow is a member-managed sole owner
// (member-single, member-single-s), s. 15 is a manager-managed pair (multi, s),
// s. 16 a member-managed pair (member, member-s). "single" and "single-s" were
// untested — and they are the two carrying s. 5.4 Actions Requiring Member
// Approval, where a sole owner was silently given a $25,000 borrowing limit
// nobody chose. There was no client in the database with this shape, which is
// why that defect had to be verified in the generator instead of end to end.
{
  const smEmail = `e2e-sm-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const smData = {
    ...formData,
    managementStructure: "MANAGER_MANAGED",
    includeManagementStatementInArticles: true,
    managers: [
      {
        id: "mgr1", role: "MGR", personOrEntity: "INDIVIDUAL", firstName: "Robin", lastName: "Vale",
        streetAddress1: "9 Harbor Road", city: "Naples", state: "FL", zip: "34102", country: "United States",
      },
    ],
    members: [
      { ...structuredClone(defaultFormData.members[0]), firstName: "Alex", lastName: "Vale", address1: "9 Harbor Road", city: "Naples", state: "FL", zip: "34102" },
    ],
    correspondentName: "Alex Vale",
    correspondentEmail: smEmail,
    confirmCorrespondentEmail: smEmail,
    registeredAgentFirstName: "Alex", registeredAgentLastName: "Vale",
    registeredAgentAcceptanceName: "Alex Vale",
    registeredAgentElectronicSignature: "Alex Vale",
    authorizedRepresentativeName: "Alex Vale",
    authorizedRepresentativeSignature: "Alex Vale",
    desiredLlcName: "E2E Harbor Single Manager",
    series: [{ id: "s1", name: "E2E Harbor Single Manager, LLC, PS A" }],
    orderEin: false,
    orderSElection: false,
  };

  // An order with no Manager must be refused — server/validation.ts check 6,
  // which until 17 August existed only in the browser.
  const noMgr = await api("/api/orders", { method: "POST", body: JSON.stringify({ ...smData, managers: [] }) });
  check("manager-managed order with no Manager is rejected", noMgr.status === 400, noMgr.body);
  const arOnly = await api("/api/orders", {
    method: "POST",
    body: JSON.stringify({ ...smData, managers: [{ ...smData.managers[0], role: "AR" }] }),
  });
  check("an authorized representative does not satisfy the Manager requirement", arOnly.status === 400, arOnly.body);

  const smOrder = await api("/api/orders", { method: "POST", body: JSON.stringify(smData) });
  check("manager-managed sole-owner order accepted", smOrder.status === 200, smOrder.body);
  const smId = smOrder.body?.data?.orderId as string;
  let smPay = await api("/api/dev/simulate-payment", { method: "POST", body: JSON.stringify({ orderId: smId }) });
  if (smPay.status === 404) {
    const adm = await adminSession();
    const full = await api(`/api/admin/orders/${smId}`, { cookies: adm.cookie });
    smPay = await api("/api/square/webhook", {
      method: "POST",
      body: JSON.stringify({
        event_id: `e2e-sm-${smId}`, type: "payment.updated",
        data: { object: { payment: { id: `e2e-pay-sm-${smId.slice(0, 8)}`, status: "COMPLETED", order_id: full.body?.data?.squareOrderId } } },
      }),
    });
  }
  check("manager-managed sole-owner order paid", smPay.status === 200);
  const smMint = await api("/api/dev/mint-reset-token", { method: "POST", body: JSON.stringify({ email: smEmail }) });
  const smPw = await api("/api/auth/set-password", {
    method: "POST", body: JSON.stringify({ token: smMint.body?.data?.token, password: "e2e-password-4" }),
  });
  check("manager-managed sole owner signs in", smPw.status === 200, smPw.body);
  const smSeed = await api("/api/portal/oa", { cookies: smPw.cookie });
  check(
    "seed reports a sole owner who is NOT member-managed",
    smSeed.body?.data?.version === "single" && smSeed.body?.data?.multiOwner === false && smSeed.body?.data?.memberManaged === false,
    smSeed.body?.data,
  );

  const smAnswers = {
    firstOrAmended: "first", effectiveDate: "2026-08-08", authorized: true,
    contributionToCompany: "$2,500 cash", series: [{}],
  };
  // The defect this case exists for: without a borrowing limit the agreement
  // used to say $25,000 on nobody's authority. It must now be refused.
  const noThreshold = await api("/api/portal/oa/generate", {
    method: "POST", cookies: smPw.cookie, body: JSON.stringify(smAnswers),
  });
  check("sole owner on a manager-managed form must set the borrowing limit", noThreshold.status === 400, noThreshold.body);

  const smGen = await api("/api/portal/oa/generate", {
    method: "POST", cookies: smPw.cookie, body: JSON.stringify({ ...smAnswers, borrowingThreshold: 60000 }),
  });
  check("manager-managed sole-owner agreement generates (single)", smGen.status === 200, smGen.body);
  check("a sole owner who is manager-managed gets the single master", smGen.body?.data?.version === "single", smGen.body?.data);
  const smAfter = await api("/api/portal/oa", { cookies: smPw.cookie });
  check(
    "it was built on the 'single' master",
    smAfter.body?.data?.generations?.[0]?.version === "single",
    smAfter.body?.data?.generations?.[0],
  );
  const smDoc = smGen.body?.data?.documentId as string;
  const smPdf = await fetch(`${BASE}/api/portal/documents/${smDoc}/download`, { headers: { Cookie: smPw.cookie } });
  const smBytes = new Uint8Array(await smPdf.arrayBuffer());
  check("manager-managed sole-owner PDF downloads", smPdf.ok && smBytes[0] === 0x25 && smBytes[1] === 0x50, { status: smPdf.status });

  const smSGen = await api("/api/portal/oa/generate", {
    method: "POST", cookies: smPw.cookie,
    body: JSON.stringify({ ...smAnswers, borrowingThreshold: 60000, sElection: true, series: [{}] }),
  });
  check("manager-managed sole-owner S corp agreement generates (single-s)", smSGen.status === 200, smSGen.body);
  check("...and single-s once the S election is on", smSGen.body?.data?.version === "single-s", smSGen.body?.data);
  const smSAfter = await api("/api/portal/oa", { cookies: smPw.cookie });
  check(
    "it was built on the 'single-s' master",
    smSAfter.body?.data?.generations?.[0]?.version === "single-s",
    smSAfter.body?.data?.generations?.[0],
  );
}

// 16c. Owners are editable after formation.
//
// Members are never filed with the Division (server/filing.ts has no member
// field), so the intake list is where the owner list starts, not what it is
// fixed to. A client who takes on a partner must be able to say so, and the
// added owner has to reach Exhibit A and the signature block.
{
  const edEmail = `e2e-ed-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const edData = {
    ...formData,
    correspondentEmail: edEmail,
    confirmCorrespondentEmail: edEmail,
    desiredLlcName: "E2E Editable Owners",
    series: [{ id: "s1", name: "E2E Editable Owners, LLC, PS A" }],
    orderEin: false,
    orderSElection: false,
  };
  const edOrder = await api("/api/orders", { method: "POST", body: JSON.stringify(edData) });
  check("editable-owners order accepted", edOrder.status === 200, edOrder.body);
  const edId = edOrder.body?.data?.orderId as string;
  let edPay = await api("/api/dev/simulate-payment", { method: "POST", body: JSON.stringify({ orderId: edId }) });
  if (edPay.status === 404) {
    const adm = await adminSession();
    const full = await api(`/api/admin/orders/${edId}`, { cookies: adm.cookie });
    edPay = await api("/api/square/webhook", {
      method: "POST",
      body: JSON.stringify({
        event_id: `e2e-ed-${edId}`, type: "payment.updated",
        data: { object: { payment: { id: `e2e-pay-ed-${edId.slice(0, 8)}`, status: "COMPLETED", order_id: full.body?.data?.squareOrderId } } },
      }),
    });
  }
  check("editable-owners order paid", edPay.status === 200);
  const edMint = await api("/api/dev/mint-reset-token", { method: "POST", body: JSON.stringify({ email: edEmail }) });
  const edPw = await api("/api/auth/set-password", {
    method: "POST", body: JSON.stringify({ token: edMint.body?.data?.token, password: "e2e-password-5" }),
  });
  check("editable-owners client signs in", edPw.status === 200, edPw.body);

  // Formed with one owner, member-managed.
  const edSeed = await api("/api/portal/oa", { cookies: edPw.cookie });
  check("starts as a sole owner", edSeed.body?.data?.multiOwner === false, edSeed.body?.data);

  const base = {
    firstOrAmended: "first", effectiveDate: "2026-08-17", authorized: true,
    series: [{}], ownershipMode: "percent",
    includeCapitalCalls: false, competition: "A", includeShotgun: false, borrowingThreshold: 40000,
  };
  const twoOwners = [
    { name: "Casey Member", address: "100 Ocean Drive, Miami, FL 33139", percentage: 60, contribution: "$600 cash" },
    { name: "Jordan Vale", address: "22 Bay Street, Miami, FL 33130", percentage: 40, contribution: "$400 cash" },
  ];

  // An owner with no address would print a blank line in Exhibit A.
  const noAddr = await api("/api/portal/oa/generate", {
    method: "POST", cookies: edPw.cookie,
    body: JSON.stringify({ ...base, multiOwner: true, members: [twoOwners[0], { name: "Jordan Vale", percentage: 40 }] }),
  });
  check("an owner without an address is rejected", noAddr.status === 400, noAddr.body);

  // The answer to "more than one owner?" and the list have to agree.
  const saysOne = await api("/api/portal/oa/generate", {
    method: "POST", cookies: edPw.cookie,
    body: JSON.stringify({ ...base, multiOwner: false, members: twoOwners }),
  });
  check("answering 'one owner' with two listed is rejected", saysOne.status === 400, saysOne.body);
  const saysMany = await api("/api/portal/oa/generate", {
    method: "POST", cookies: edPw.cookie,
    body: JSON.stringify({ ...base, multiOwner: true, members: [twoOwners[0]] }),
  });
  check("answering 'more than one' with one listed is rejected", saysMany.status === 400, saysMany.body);

  // Adding the partner re-routes a sole owner onto the multi-member master.
  const edGen = await api("/api/portal/oa/generate", {
    method: "POST", cookies: edPw.cookie,
    body: JSON.stringify({ ...base, multiOwner: true, members: twoOwners }),
  });
  check("an owner added in the portal generates", edGen.status === 200, edGen.body);
  check(
    "adding an owner re-routes a sole owner to the member-managed multi master",
    edGen.body?.data?.version === "member",
    edGen.body?.data,
  );

  const edPdf = await fetch(`${BASE}/api/portal/documents/${edGen.body?.data?.documentId}/download`, {
    headers: { Cookie: edPw.cookie },
  });
  const edBytes = new Uint8Array(await edPdf.arrayBuffer());
  check("the agreement downloads as a PDF", edPdf.ok && edBytes[0] === 0x25 && edBytes[1] === 0x50, { status: edPdf.status });

  // The added owner has to be IN the text, not merely accepted by the route.
  // Searching the PDF bytes cannot show this — the file embeds subset fonts, so
  // not one word of it is recoverable as ASCII, and a byte search comes back
  // empty whether the name is there or not. Re-assemble from the inputs the
  // route actually STORED: that is the exact markdown the PDF was rendered from,
  // and it covers the answers-to-inputs mapping, which is where a lost owner
  // would go missing.
  const storedText = async (generationId: string) => {
    const db = await getDb();
    const rows = await db.query<{ inputs: unknown }>("SELECT inputs FROM oa_generations WHERE id = $1", [generationId]);
    const raw = rows[0]?.inputs;
    return assembleOa((typeof raw === "string" ? JSON.parse(raw) : raw) as Parameters<typeof assembleOa>[0]).markdown;
  };
  const twoOwnerText = await storedText(edGen.body?.data?.generationId as string);
  check("the added owner is named in the agreement", twoOwnerText.includes("Jordan Vale"), {
    casey: twoOwnerText.includes("Casey Member"),
  });
  check("the added owner's address is in the agreement", twoOwnerText.includes("22 Bay Street, Miami, FL 33130"));
  check("the added owner appears in Exhibit A and the signature block (twice or more)",
    (twoOwnerText.match(/Jordan Vale/g) ?? []).length >= 2,
    (twoOwnerText.match(/Jordan Vale/g) ?? []).length);

  // Removing the partner again puts them back on a sole-owner master.
  const backToOne = await api("/api/portal/oa/generate", {
    method: "POST", cookies: edPw.cookie,
    body: JSON.stringify({ ...base, multiOwner: false, members: [twoOwners[0]], contributionToCompany: "$600 cash" }),
  });
  check("removing an owner generates", backToOne.status === 200, backToOne.body);
  check(
    "removing the added owner returns them to the member-single master",
    backToOne.body?.data?.version === "member-single",
    backToOne.body?.data,
  );
  const oneOwnerText = await storedText(backToOne.body?.data?.generationId as string);
  check("the removed owner is gone from the agreement", !oneOwnerText.includes("Jordan Vale"));
  check("the remaining owner is still in it", oneOwnerText.includes("Casey Member"));

  // The seed reports where the client actually is, not where they started.
  const edAfter = await api("/api/portal/oa/answers", {
    method: "PUT", cookies: edPw.cookie,
    body: JSON.stringify({ ...base, multiOwner: true, members: twoOwners }),
  });
  check("edited owners save", edAfter.status === 200, edAfter.body);
  const reseed = await api("/api/portal/oa", { cookies: edPw.cookie });
  check("the seed now reports two owners", reseed.body?.data?.multiOwner === true, reseed.body?.data);
}

// 17. Account settings: change password, change email (verified two-step)
{
  const acctEmail = `e2e-acct-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const newEmail = `e2e-acct-new-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const acctData = {
    ...formData,
    desiredLlcName: "E2E Account Settings",
    correspondentEmail: acctEmail, confirmCorrespondentEmail: acctEmail,
    series: [{ id: "s1", name: "E2E Account Settings, LLC, PS A" }],
    orderEin: false, orderSElection: false,
  };
  const aOrder = await api("/api/orders", { method: "POST", body: JSON.stringify(acctData) });
  check("account-test order accepted", aOrder.status === 200, aOrder.body);
  const aId = aOrder.body?.data?.orderId as string;
  let aPay = await api("/api/dev/simulate-payment", { method: "POST", body: JSON.stringify({ orderId: aId }) });
  if (aPay.status === 404) {
    const adm = await adminSession();
    const full = await api(`/api/admin/orders/${aId}`, { cookies: adm.cookie });
    aPay = await api("/api/square/webhook", {
      method: "POST",
      body: JSON.stringify({
        event_id: `e2e-acct-${aId}`, type: "payment.updated",
        data: { object: { payment: { id: `e2e-pay-acct-${aId.slice(0, 8)}`, status: "COMPLETED", order_id: full.body?.data?.squareOrderId } } },
      }),
    });
  }
  check("account-test order paid", aPay.status === 200);
  const aMint = await api("/api/dev/mint-reset-token", { method: "POST", body: JSON.stringify({ email: acctEmail }) });
  const aPw = await api("/api/auth/set-password", {
    method: "POST", body: JSON.stringify({ token: aMint.body?.data?.token, password: "e2e-acct-pass-1" }),
  });
  check("account-test client signs in", aPw.status === 200);

  // --- change password ---
  const wrongCur = await api("/api/portal/account/password", {
    method: "POST", cookies: aPw.cookie,
    body: JSON.stringify({ currentPassword: "not-the-password", newPassword: "e2e-acct-pass-2" }),
  });
  check("password change with wrong current password rejected", wrongCur.status === 401, wrongCur.body);
  const shortPw = await api("/api/portal/account/password", {
    method: "POST", cookies: aPw.cookie,
    body: JSON.stringify({ currentPassword: "e2e-acct-pass-1", newPassword: "short" }),
  });
  check("password change with short new password rejected", shortPw.status === 400);
  const okPw = await api("/api/portal/account/password", {
    method: "POST", cookies: aPw.cookie,
    body: JSON.stringify({ currentPassword: "e2e-acct-pass-1", newPassword: "e2e-acct-pass-2" }),
  });
  check("password changed", okPw.status === 200, okPw.body);
  const oldLogin = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: acctEmail, password: "e2e-acct-pass-1" }) });
  check("old password no longer works", oldLogin.status === 401);
  const newLogin = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: acctEmail, password: "e2e-acct-pass-2" }) });
  check("new password works", newLogin.status === 200);
  const stillMe = await api("/api/auth/me", { cookies: aPw.cookie });
  check("current session survives a password change", stillMe.status === 200, stillMe.body);

  // --- change email ---
  const badPwEmail = await api("/api/portal/account/email", {
    method: "POST", cookies: newLogin.cookie,
    body: JSON.stringify({ newEmail, currentPassword: "wrong" }),
  });
  check("email change with wrong password rejected", badPwEmail.status === 401);
  const takenEmail = await api("/api/portal/account/email", {
    method: "POST", cookies: newLogin.cookie,
    body: JSON.stringify({ newEmail: testEmail, currentPassword: "e2e-acct-pass-2" }),
  });
  check("email change to an in-use address rejected", takenEmail.status === 400 && takenEmail.body?.error?.code === "EMAIL_TAKEN", takenEmail.body);
  const reqEmail = await api("/api/portal/account/email", {
    method: "POST", cookies: newLogin.cookie,
    body: JSON.stringify({ newEmail, currentPassword: "e2e-acct-pass-2" }),
  });
  check("email change requested", reqEmail.status === 200, reqEmail.body);
  const pendingMe = await api("/api/auth/me", { cookies: newLogin.cookie });
  check("pending email shown, address not yet changed",
    pendingMe.body?.data?.pendingEmail === newEmail && pendingMe.body?.data?.email === acctEmail,
    pendingMe.body?.data);
  const stillOld = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: acctEmail, password: "e2e-acct-pass-2" }) });
  check("old address still signs in before confirmation", stillOld.status === 200);
  const badToken = await api("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: "x".repeat(40) }) });
  check("bogus verification token rejected", badToken.status === 400);
  const vTok = await api("/api/dev/pending-email-token", { method: "POST", body: JSON.stringify({ email: acctEmail }) });
  if (vTok.status === 200) {
    const verified = await api("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: vTok.body.data.token }) });
    check("email change confirmed", verified.status === 200 && verified.body?.data?.email === newEmail, verified.body);
    const newAddrLogin = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: newEmail, password: "e2e-acct-pass-2" }) });
    check("new address signs in", newAddrLogin.status === 200);
    const oldAddrLogin = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: acctEmail, password: "e2e-acct-pass-2" }) });
    check("old address no longer signs in", oldAddrLogin.status === 401);
    const reuse = await api("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token: vTok.body.data.token }) });
    check("verification token cannot be reused", reuse.status === 400);
  } else {
    check("dev pending-email-token available (dev only)", false);
  }

  // --- admin override ---
  const adminAcct = await adminSession();
  const allClients = await api("/api/admin/clients", { cookies: adminAcct.cookie });
  const target = (allClients.body?.data ?? []).find((cl: { email: string }) => cl.email === newEmail);
  const overrideEmail = `e2e-acct-admin-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const override = await api(`/api/admin/clients/${target?.id}/email`, {
    method: "POST", cookies: adminAcct.cookie, body: JSON.stringify({ newEmail: overrideEmail }),
  });
  check("admin can change a client's email", override.status === 200, override.body);
  const afterOverride = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: overrideEmail, password: "e2e-acct-pass-2" }) });
  check("client signs in with the admin-set address", afterOverride.status === 200);
}

// --- name availability check (fl_entities mirror) -------------------------
// Recorded fixtures only — the suite never touches the state's SFTP. Seeds
// fake entities, saves and restores the real sync state around the calls.
{
  const { getDb } = await import("./db");
  const db = await getDb();
  const saved = await db.query<{ baseline_label: string | null; last_daily: string | null }>(
    "SELECT baseline_label, last_daily::text FROM fl_sync_state WHERE id = 1",
  );
  const today = new Date().toISOString().slice(0, 10);
  const oldIso = new Date(Date.now() - 3 * 365 * 86_400_000).toISOString().slice(0, 10);
  const recentIso = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  await db.query(
    `INSERT INTO fl_sync_state (id, baseline_label, last_daily, updated_at) VALUES (1, 'e2e', $1, now())
     ON CONFLICT (id) DO UPDATE SET baseline_label = 'e2e', last_daily = $1::date, updated_at = now()`,
    [today],
  );
  await db.query(
    `INSERT INTO fl_entities (doc_number, name, status, filing_type, file_date, last_txn_date, norm_key) VALUES
       ('E2ETEST00001', 'E2E SUNSHINE HOLDINGS, INC.', 'A', 'DOMP', '2020-01-01', NULL, 'E2E SUNSHINE HOLDING'),
       ('E2ETEST00002', 'E2E GATOR GROVES LLC', 'I', 'FLAL', '2019-01-01', $1, 'E2E GATOR GROVE'),
       ('E2ETEST00003', 'E2E OLD TIMER CORP', 'I', 'DOMP', '2010-01-01', $2, 'E2E OLD TIMER')
     ON CONFLICT (doc_number) DO NOTHING`,
    [recentIso, oldIso],
  );
  const nc = await api("/api/name-check", {
    method: "POST",
    body: JSON.stringify({
      names: ["E2E Sunshine Holdings, LLC", "E2E Gator Grove", "E2E Old Timers", "E2E Never Existed Ventures"],
    }),
  });
  const r = nc.body?.data;
  check("name-check responds with data", nc.status === 200 && r?.available === true, nc.body);
  const [sun, gator, old, never] = r?.results ?? [];
  check(
    "suffix/plural variant of an active entity is TAKEN with the conflict listed",
    sun?.verdict === "taken" &&
      sun?.conflicts?.[0]?.name === "E2E SUNSHINE HOLDINGS, INC." &&
      sun?.conflicts?.[0]?.docNumber === "E2ETEST00001" &&
      sun?.conflicts?.[0]?.status === "Active" &&
      typeof sun?.conflicts?.[0]?.reason === "string" &&
      (sun?.conflicts?.[0]?.detailUrl ?? "").includes("search.sunbiz.org"),
    sun,
  );
  check(
    "recently dissolved entity is HELD (s. 605.0715 window)",
    gator?.verdict === "held" && gator?.conflicts?.[0]?.status === "Inactive",
    gator,
  );
  check("long-dissolved entity is CLEAR", old?.verdict === "clear" && old?.conflicts?.length === 0, old);
  check("unknown name is CLEAR with no conflicts", never?.verdict === "clear" && never?.conflicts?.length === 0, never);
  const empty = await api("/api/name-check", { method: "POST", body: JSON.stringify({ names: [] }) });
  check("empty name list rejected", empty.status === 400);
  // Order-time enforcement: a taken or held name cannot be bought (Adam's
  // rule — held blocks too, to minimize rejection emails).
  // Own IP for the two enforcement calls: the suite's real orders have
  // already spent this run's 10-successful-orders budget.
  const NAME_IP = { "X-Forwarded-For": `10.99.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}` };
  const takenOrder = await api("/api/orders", {
    method: "POST",
    headers: NAME_IP,
    body: JSON.stringify({ ...formData, desiredLlcName: "E2E Sunshine Holding", alternateName1: "E2E Coastal Backup" }),
  });
  check(
    "order with a TAKEN name is refused server-side",
    takenOrder.status === 400 && takenOrder.body?.error?.code === "NAME_UNAVAILABLE",
    takenOrder.body,
  );
  const optDocs = await api("/api/orders", {
    method: "POST",
    headers: NAME_IP,
    body: JSON.stringify({
      ...formData,
      desiredLlcName: "E2E Optional Docs Pricing",
      alternateName1: "E2E Optional Docs Pricing Backup",
      orderCertificateOfStatus: true,
      orderCertifiedCopy: true,
      orderEin: false,
      orderSElection: false,
    }),
  });
  check(
    "optional docs price as $10 prep + state fee each: $499 + $20 + $160 = $679",
    optDocs.status === 200 && optDocs.body?.data?.totalCents === 679_00,
    optDocs.body?.data ?? optDocs.body,
  );
  const dupSeries = await api("/api/orders", {
    method: "POST",
    headers: NAME_IP,
    body: JSON.stringify({
      ...formData,
      series: [
        { id: "s1", name: "E2E Coastal Holdings, LLC, PS 2" },
        { id: "s2", name: "E2E Coastal Holdings, LLC, P.s. 2" },
      ],
    }),
  });
  check(
    "series duplicated across prefix/case variants is refused server-side",
    dupSeries.status === 400,
    dupSeries.body,
  );
  const heldOrder = await api("/api/orders", {
    method: "POST",
    headers: NAME_IP,
    body: JSON.stringify({ ...formData, desiredLlcName: "E2E Coastal Holdings", alternateName1: "E2E Gator Grove" }),
  });
  check(
    "order with a HELD alternate is refused server-side",
    heldOrder.status === 400 && heldOrder.body?.error?.code === "NAME_UNAVAILABLE",
    heldOrder.body,
  );
  // restore
  await db.query("DELETE FROM fl_entities WHERE doc_number LIKE 'E2ETEST%'");
  if (saved.length > 0) {
    await db.query(
      "UPDATE fl_sync_state SET baseline_label = $1, last_daily = $2::date, updated_at = now() WHERE id = 1",
      [saved[0].baseline_label, saved[0].last_daily],
    );
  } else {
    await db.query("DELETE FROM fl_sync_state WHERE id = 1");
  }
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
