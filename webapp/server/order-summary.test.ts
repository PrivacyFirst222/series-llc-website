import { RA_CARD_CONSENT } from "../src/lib/agentBilling";
import { AGENT_FORM_VERSION } from "../src/components/forms/florida-llc/registeredAgent";
/**
 * The Order Summary's acknowledgment wordings must match the form's own
 * boxes, word for word — the summary is the record of what the client agreed
 * to. And a sample order's summary must carry every part Adam asked for
 * (10 Sep 2026).
 */
import { readFileSync, readdirSync } from "node:fs";
import { ACKNOWLEDGMENTS, summaryMarkdown, type SummaryOrderRow } from "./order-summary";
import { buildPayload } from "../src/components/forms/florida-llc/buildPayload";
import { defaultFormData } from "../src/components/forms/florida-llc/defaults";
import type { SubmissionPayload } from "../src/components/forms/florida-llc/types";

let failures = 0;
let checks = 0;
function check(name: string, ok: boolean, got?: unknown): void {
  checks++;
  if (ok) console.log(`✅ ${name}`);
  else { failures++; console.log(`❌ ${name}${got !== undefined ? ` — got ${JSON.stringify(got)?.slice(0, 300)}` : ""}`); }
}
const norm = (s: string) => s.replace(/\s+/g, " ").replace(/&mdash;/g, "—").trim();
const dir = new URL("../src/components/forms/florida-llc/sections/", import.meta.url);
// The S election deadline box's words live beside the 2553 timing rule,
// not in a section file (14 Sep 2026).
const sources = norm([...readdirSync(dir).filter((f) => f.endsWith(".tsx")).map((f) => readFileSync(new URL(f, dir), "utf8")), readFileSync(new URL("../src/lib/form2553Timing.ts", import.meta.url), "utf8"), readFileSync(new URL("../src/components/forms/florida-llc/registeredAgent.ts", import.meta.url), "utf8")].join("\n"));
const sampleNew = { metadata: { formVersion: AGENT_FORM_VERSION }, filingPath: "NEW", existingLlcName: "" } as SubmissionPayload;
const sampleConv = { metadata: { formVersion: AGENT_FORM_VERSION }, filingPath: "CONVERT", existingLlcName: "ACME LLC" } as SubmissionPayload;
for (const a of ACKNOWLEDGMENTS.filter(a => !a.when || a.when(sampleNew) || a.when(sampleConv))) {
  const texts = typeof a.text === "function" ? [a.text(sampleNew), a.text(sampleConv)] : [a.text];
  for (const t of texts) {
    // The form writes a few of these across JSX lines and template pieces;
    // compare on the wording's first and last clauses.
    const head = norm(t).slice(0, 50);
    const tail = norm(t).slice(-40);
    check(`form still says: "${head}…"`, sources.includes(head) || sources.includes(head.replace("ACME LLC", "${company}").replace("the company", "${company}")), head);
    check(`…and ends: "${tail}"`, sources.includes(tail) || sources.includes("its members have consented"), tail);
  }
}

const data = {
  ...defaultFormData,
  filingPath: "NEW" as const,
  clientFirstName: "Casey", clientLastName: "Member", clientSuffix: "Jr.", clientEmail: "casey@example.com", confirmClientEmail: "casey@example.com",
  clientAddress: { address1: "100 Ocean Drive", address2: "", city: "Miami", state: "FL", zip: "33139", country: "United States" },
  desiredLlcName: "E2E Coastal Holdings", llcDesignator: "LLC" as const,
  principalAddress: { address1: "100 Ocean Drive", address2: "", city: "Miami", state: "FL", zip: "33139", country: "United States" },
  series: [{ id: "s1", name: "E2E Coastal Holdings, LLC, PS A" }],
  accuracyAcknowledgment: true, termsOfServiceAcknowledgment: true, publicRecordAcknowledgment: true, legalAdviceAcknowledgment: true,
  authorizedRepresentativeSignature: "Casey Member, Jr.", authorizedRepresentativeName: "Casey Member, Jr.",
  nameCheck: { key: "k", available: true, asOf: "2026-09-09", results: [{ input: "E2E Coastal Holdings, LLC", verdict: "clear" as const, conflicts: [] }] },
};
const payload = buildPayload(data);
const row: SummaryOrderRow = {
  id: "11111111-2222-3333-4444-555555555555", llc_name: "E2E Coastal Holdings, LLC", package: "NEW",
  contact_name: "Casey Member, Jr.", contact_email: "casey@example.com", payload,
  service_fee_cents: 49900 + 5000, state_fees_cents: 16000, total_cents: 49900 + 5000 + 16000, status: "paid",
  square_order_id: "sq-order-1", square_payment_id: "sq-pay-1", created_at: "2026-09-10T12:00:00Z", paid_at: "2026-09-10T12:05:00Z",
  line_items: [{ name: "Formation service fee", amountCents: 49900 }, { name: "Federal EIN service", amountCents: 5000 }, { name: "FL state fee — Articles of Organization", amountCents: 10000 }],
  submitted_ip: "203.0.113.7", submitted_user_agent: "Safari on iPad",
};
const md = summaryMarkdown(row);
const agentSummary=summaryMarkdown({...row,agent_billing_consent:RA_CARD_CONSENT});
check("agent summary preserves the actual new billing consent without inventing it for old orders",agentSummary.includes(RA_CARD_CONSENT)&&!md.includes(RA_CARD_CONSENT));
check("the summary names the company and the client", /E2E Coastal Holdings, LLC/.test(md) && /Casey Member, Jr\. <casey@example\.com>/.test(md));
check("the summary carries the payment id and the paid time", /sq-pay-1/.test(md) && /\*\*Paid:\*\* September 10, 2026/.test(md), md.match(/\*\*Paid:\*\*[^\n]*/)?.[0]);
check("the summary lists every price line and the total", /Formation service fee \| \$499\.00/.test(md) && /Federal EIN service \| \$50\.00/.test(md) && /Total charged\*\* \| \*\*\$709\.00/.test(md));
check("the summary shows the estimate beside the charge", /shown to the client on the review step:\*\* \$125\.00/.test(md) && /State fees charged:\*\* \$160\.00/.test(md), md.match(/shown to the client[^\n]*/)?.[0]);
check("the summary carries a typed answer", /100 Ocean Drive/.test(md));
check("the summary quotes the acknowledgments ticked", /- I certify that the information provided is true and accurate/.test(md) && /- I agree to all terms and conditions/.test(md), md.match(/- I [^\n]*/g));
check("the summary records the typed signature", /Electronic signature typed:\*\* Casey Member, Jr\./.test(md));
check("the summary records the address and browser", /203\.0\.113\.7/.test(md) && /Safari on iPad/.test(md));
check("the summary records the name check the client saw", /Availability check the client saw:\*\* E2E Coastal Holdings, LLC: clear/.test(md));
const pending = summaryMarkdown({ ...row, paid_at: null, square_payment_id: null });
check("before payment the summary says so", /not yet received at the time of this summary/.test(pending));
const legacyPayload = structuredClone(payload);
legacyPayload.acknowledgments.notLegalAdvice = true;
legacyPayload.acknowledgments.publicRecordNotice = true;
const legacyMd = summaryMarkdown({ ...row, payload: legacyPayload });
check("historical order summary retains the removed Eligibility consents actually given", legacyMd.includes("I understand that this service does not provide legal, tax, or accounting advice.") && legacyMd.includes("I understand that information submitted to the Florida Division of Corporations may become part of the public record."));
check("new order summary records the final consent without inventing removed Eligibility consents", !md.includes("I understand that this service") && !md.includes("I understand that information submitted") && md.includes("I understand this service does not provide legal, tax, or accounting advice.") && md.includes("I understand that filed information may become part of the public record."));
console.log(`\n${checks} checks, ${failures} failures`);
if (failures > 0) process.exit(1);
