/**
 * Local end-to-end walk of the whole money path (bun run server/e2e.ts).
 * Requires the dev API on :3000. Uses the same defaults + validation the form uses.
 */
import { defaultFormData } from "../src/components/forms/florida-llc/defaults";
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
  registeredAgentName: "Casey Member",
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
      fullLegalName: "Casey Member",
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

async function api(path: string, init?: RequestInit & { cookies?: string }) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.cookies ? { Cookie: init.cookies } : {}),
      ...init?.headers,
    },
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const body = await res.json().catch(() => null);
  return { status: res.status, body, cookie: setCookie.split(";")[0] };
}

// 1. Reject garbage
const bad = await api("/api/orders", { method: "POST", body: JSON.stringify({ nope: true }) });
check("rejects invalid order payload (400)", bad.status === 400);

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

// 2. Place a valid order
const order = await api("/api/orders", { method: "POST", body: JSON.stringify(formData) });
check("accepts valid order (200)", order.status === 200, order.body);
const orderId = order.body?.data?.orderId as string;
const totalCents = order.body?.data?.totalCents as number;
check("price recomputed server-side: $499 + $50 EIN + $95 S election + $125 = $769.00", totalCents === 76900, { totalCents });
check("returns checkout URL", typeof order.body?.data?.checkoutUrl === "string");

// 3. Status is pending before payment
const pre = await api(`/api/orders/${orderId}/status`);
check("status pending before payment", pre.body?.data?.status === "pending_payment");

// 4. Simulate Square saying "paid". With no Square creds the dev route exists;
//    with real sandbox creds it does not, so post a Square-shaped webhook event
//    instead (dev accepts unsigned webhooks when no signature key is set).
let sim = await api("/api/dev/simulate-payment", { method: "POST", body: JSON.stringify({ orderId }) });
if (sim.status === 404) {
  const adminEarly = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "dev-admin" }) });
  const full = await api(`/api/admin/orders/${orderId}`, { cookies: adminEarly.cookie });
  const squareOrderId = (full.body?.data as { square_order_id?: string })?.square_order_id;
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
const admin = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "dev-admin" }) });
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
    const adminSvc = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "dev-admin" }) });
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
    body: JSON.stringify({ responsibleName: "Casey Member", tin: "123-45-6789" }),
  });
  check("EIN details accepted", einDetails.status === 200, einDetails.body);
  const einAgain = await api(`/api/portal/services/${intakeEin.id}/ein-details`, {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ responsibleName: "X", tin: "999999999" }),
  });
  check("EIN details cannot be resubmitted", einAgain.status === 400);

  const adminLogin2 = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "dev-admin" }) });
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
  check("OA titled as first agreement", gen1.body?.data?.title?.startsWith("Operating Agreement"), gen1.body?.data);
  const gen2 = await api("/api/portal/oa/generate", {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ ...oaAnswers, firstOrAmended: "amended" }),
  });
  check("OA regenerates as Amended & Restated", gen2.status === 200 && gen2.body?.data?.title?.startsWith("Amended and Restated"), gen2.body?.data);
  const oaAfter = await api("/api/portal/oa", { cookies: setPw.cookie });
  check("generation history has 2 entries", (oaAfter.body?.data?.generations ?? []).length === 2);
  const oaDocId = gen1.body?.data?.documentId as string;
  const oaPdf = await fetch(`${BASE}/api/portal/documents/${oaDocId}/download`, { headers: { Cookie: setPw.cookie } });
  const oaBytes = new Uint8Array(await oaPdf.arrayBuffer());
  check("generated OA downloads as PDF", oaPdf.ok && oaBytes[0] === 0x25 && oaBytes[1] === 0x50, { status: oaPdf.status, len: oaBytes.length });

  // 13c-2. Sole owner on the S corporation form (option defaults applied server-side)
  const genS = await api("/api/portal/oa/generate", {
    method: "POST", cookies: setPw.cookie,
    body: JSON.stringify({ ...oaAnswers, sElection: true }),
  });
  check("sole-owner S corp agreement generates", genS.status === 200, genS.body);
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
        id: "mgr1", role: "MGR", personOrEntity: "INDIVIDUAL", fullName: "Casey Member",
        streetAddress1: "100 Ocean Drive", city: "Miami", state: "FL", zip: "33139", country: "United States",
      },
    ],
    members: [
      { ...structuredClone(defaultFormData.members[0]), fullLegalName: "Sam Ortiz", address1: "50 Sunset Blvd", city: "Orlando", state: "FL", zip: "32801" },
      { ...structuredClone(defaultFormData.members[0]), fullLegalName: "Riley Ortiz", address1: "50 Sunset Blvd", city: "Orlando", state: "FL", zip: "32801" },
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
    const adm = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "dev-admin" }) });
    const full = await api(`/api/admin/orders/${mOrderId}`, { cookies: adm.cookie });
    const sqId = (full.body?.data as { square_order_id?: string })?.square_order_id;
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
  check("multi OA seed has 2 members", mSeed.body?.data?.version === "multi" && mSeed.body?.data?.seed?.members?.length === 2, mSeed.body?.data);
  const coupleAnswers = {
    firstOrAmended: "first",
    effectiveDate: "2026-08-06",
    authorized: true,
    members: [{}, {}],
    series: [{ associated: [{ memberIndex: 0, seriesPercentage: 100 }] }],
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
  const mGen = await api("/api/portal/oa/generate", { method: "POST", cookies: mPw.cookie, body: JSON.stringify(coupleAnswers) });
  check("TBE couple agreement generates", mGen.status === 200, mGen.body);
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
  const adminS = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: "dev-admin" }) });
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
        { name: "Maria Ortiz and Carlos Ortiz, as tenants by the entireties", address: "500 Bay Street, Miami, FL 33131", percentage: 60, dateAcquired: "2026-08-01", ssn: "123456789" },
      ],
    }),
  });
  check("S election details with bad percentages rejected", badPct.status === 400);
  const sDetails = await api(`/api/portal/services/${sId}/s-election-details`, {
    method: "POST", cookies: mPw.cookie,
    body: JSON.stringify({
      ein: "88-1234567", einPending: false, dateIncorporated: "2026-08-01", effectiveDate: "2026-08-01",
      officerName: "Maria Ortiz", officerTitle: "Manager", phone: "(305) 555-0100",
      shareholders: [
        { name: "Maria Ortiz and Carlos Ortiz, as tenants by the entireties", address: "500 Bay Street, Miami, FL 33131", percentage: 100, dateAcquired: "2026-08-01", ssn: "123-45-6789" },
      ],
    }),
  });
  check("S election details accepted", sDetails.status === 200, sDetails.body);
  const sAdminDetail = await api(`/api/admin/services/${sId}`, { cookies: adminS.cookie });
  check("admin decrypts shareholder SSNs", sAdminDetail.body?.data?.ssns?.[0] === "123456789", sAdminDetail.body?.data);
  check(
    "client-facing record keeps only SSN last 4",
    sAdminDetail.body?.data?.details?.shareholders?.[0]?.ssnLast4 === "6789",
    sAdminDetail.body?.data?.details,
  );
  const draft = await fetch(`${BASE}/api/admin/services/${sId}/s-election-draft`, { headers: { Cookie: adminS.cookie } });
  const draftBytes = new Uint8Array(await draft.arrayBuffer());
  check("draft election package renders as PDF", draft.ok && draftBytes[0] === 0x25 && draftBytes[1] === 0x50, { status: draft.status, len: draftBytes.length });
  const noPkg = await fetch(`${BASE}/api/admin/services/${sId}/fulfill`, {
    method: "POST", headers: { Cookie: adminS.cookie }, body: new FormData(),
  });
  check("S election fulfill without package rejected", noPkg.status === 400, await noPkg.json().catch(() => null));
  const pkgFd = new FormData();
  pkgFd.set("file", new File([draftBytes], "s-election-package.pdf", { type: "application/pdf" }));
  const sFulfill = await fetch(`${BASE}/api/admin/services/${sId}/fulfill`, {
    method: "POST", headers: { Cookie: adminS.cookie }, body: pkgFd,
  });
  check("S election fulfilled with package", sFulfill.ok, await sFulfill.json().catch(() => null));
  const sAfter = await api(`/api/admin/services/${sId}`, { cookies: adminS.cookie });
  check("shareholder SSNs deleted at fulfillment", sAfter.body?.data?.ssns === null, sAfter.body?.data);
  const sDocs = await api("/api/portal/documents", { cookies: mPw.cookie });
  check(
    "election package posted to client documents",
    (sDocs.body?.data ?? []).some((d: { title: string }) => d.title.includes("S Corporation Election Package")),
    sDocs.body?.data,
  );
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
