/**
 * The Order Summary (Adam, 10 Sep 2026): one PDF per order, written when the
 * order is placed and again when it is paid, holding the order, the items,
 * every price line as priced at that moment, the whole questionnaire as
 * typed, the acknowledgments in the words agreed to, the typed signature,
 * the submitter's address and browser, the name-availability result the
 * client saw, and the estimate shown beside the amount charged. For the
 * office only; it never appears in the client's portal.
 */
import { getDb } from "./db";
import { renderMarkdownPdf } from "./pdf-render";
import { putFile } from "./storage";
import type { SubmissionPayload } from "../src/components/forms/florida-llc/types";

/** Every acknowledgment box, in the words the client saw. The unit test
 *  checks each wording against the form's own source, so a change to a box
 *  on the form fails the check until this table follows it. */
export const ACKNOWLEDGMENTS: { field: string; text: string | ((p: SubmissionPayload) => string); when?: (p: SubmissionPayload) => boolean }[] = [
  { field: "isFloridaDomesticEntityOnly", text: (p) => p.filingPath === "CONVERT"
      ? "I understand this form is for an existing Florida LLC that is already on file with the Division of Corporations, and that it adds protected series to that company."
      : "I understand this form is for forming a new domestic Florida series LLC only." },
  { field: "notLegalAdvice", text: "I understand that this service does not provide legal, tax, or accounting advice." },
  { field: "publicRecordNotice", text: "I understand that information submitted to the Florida Division of Corporations may become part of the public record." },
  { field: "nameSearchAcknowledgment", text: "I understand that availability is not guaranteed until accepted by the Florida Division of Corporations." },
  { field: "governmentAffiliationAcknowledgment", text: "I confirm the name does not imply affiliation with a state or federal government agency." },
  { field: "lawfulPurposeNameAcknowledgment", text: "I confirm the name does not imply a purpose unauthorized for this LLC." },
  { field: "exactNameOnly", text: "I only want this exact name — if it is unavailable, contact me before doing anything else." },
  { field: "seriesOwnershipAcknowledged", text: "I understand that every protected series will be owned by my LLC, and that no series will have its own separate owners." },
  { field: "registeredAgentNotSameAsLlc", text: "I understand that the LLC itself cannot serve as its own registered agent — I am accepting this role personally." },
  { field: "registeredAgentPhysicalAddressAcknowledgment", text: "I confirm this is my physical street address in Florida and not a P.O. Box." },
  { field: "registeredAgentAcceptanceCheckbox", text: "I accept the appointment and acknowledge the obligations of serving as registered agent for this Florida LLC." },
  { field: "registeredAgentSignatureAuthorizationCheckbox", text: "I certify that I am signing for myself as the registered agent." },
  { field: "articlesSignerAppointed", text: "I appoint MyFloridaSeriesLLC as my authorized representative to sign and file my Articles of Organization, and I certify that the information I have provided is true, accurate, and complete." },
  { field: "authorizedRepresentativeSignatureCheckbox", text: "I certify that I am authorized to sign and submit information for this LLC." },
  { field: "atLeastOneMemberAcknowledged", text: "I affirm that the LLC has or will have at least one member when the Articles of Organization become effective." },
  { field: "conversionAuthorityAcknowledged", text: (p) => `I am authorized to act for ${(p.existingLlcName ?? "").trim() || "the company"}, its members have consented to establishing the protected series on this order, and I authorize MyFloridaSeriesLLC to prepare and file the Protected Series Designations with the Florida Division of Corporations.` },
  { field: "accuracyAcknowledged", text: "I certify that the information provided is true and accurate to the best of my knowledge." },
  { field: "addressAccuracyAcknowledgment", text: "I am solely responsible for the accuracy of all addresses I have provided. I understand that state filings, legal notices, and official correspondence will be directed to these addresses exactly as entered, and that MyFloridaSeriesLLC does not verify the accuracy or deliverability of any address. Any address-suggestion or address-checking feature in this form is a convenience only and is not a verification, warranty, or guarantee of any kind." },
  { field: "termsOfServiceAcknowledgment", text: "I agree to all terms and conditions set forth in the Terms of Service, including its binding individual arbitration provision and class action waiver." },
  { field: "publicRecordAcknowledged", text: "I understand that filed information may become part of the public record." },
  { field: "notLegalAdviceAcknowledged", text: "I understand this service does not provide legal, tax, or accounting advice." },
];

export interface SummaryOrderRow {
  id: string;
  llc_name: string;
  package: string;
  contact_name: string;
  contact_email: string;
  payload: unknown;
  service_fee_cents: number;
  state_fees_cents: number;
  total_cents: number;
  status: string;
  square_order_id: string | null;
  square_payment_id: string | null;
  created_at: string;
  paid_at: string | null;
  line_items: unknown;
  submitted_ip: string | null;
  submitted_user_agent: string | null;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "long", timeStyle: "short" }) + " ET" : "";
const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "/").replace(/\s+/g, " ").trim();
const line = (label: string, value: unknown): string => {
  const v = cell(value);
  return v ? `**${label}:** ${v}` : `**${label}:** —`;
};
type Addr = { address1?: string; address2?: string; city?: string; state?: string; zip?: string; country?: string } | null | undefined;
const addr = (a: Addr) =>
  a && a.address1 ? [a.address1, a.address2, `${a.city ?? ""}, ${a.state ?? ""} ${a.zip ?? ""}`.trim(), a.country].filter((s) => s && s.trim()).join(", ") : "";

function ticked(p: SubmissionPayload): { text: string; field: string }[] {
  const flags: Record<string, boolean> = {
    ...(p.acknowledgments ?? {}),
    seriesOwnershipAcknowledged: p.certifications?.seriesOwnershipAcknowledged === true,
    articlesSignerAppointed: p.certifications?.articlesSignerAppointed === true,
    atLeastOneMemberAcknowledged: p.certifications?.atLeastOneMemberAcknowledged === true,
    conversionAuthorityAcknowledged: p.certifications?.conversionAuthorityAcknowledged === true,
    accuracyAcknowledged: p.certifications?.accuracyAcknowledged === true,
    publicRecordAcknowledged: p.certifications?.publicRecordAcknowledged === true,
    notLegalAdviceAcknowledged: p.certifications?.notLegalAdviceAcknowledged === true,
  };
  return ACKNOWLEDGMENTS.filter((a) => flags[a.field] === true).map((a) => ({ field: a.field, text: typeof a.text === "function" ? a.text(p) : a.text }));
}

/** The summary as markdown, from the stored order row. */
export function summaryMarkdown(o: SummaryOrderRow): string {
  const p = (typeof o.payload === "string" ? JSON.parse(o.payload) : o.payload) as SubmissionPayload;
  const items = (typeof o.line_items === "string" ? JSON.parse(o.line_items) : o.line_items) as { name: string; amountCents: number }[] | null;
  const conversion = p.filingPath === "CONVERT";
  const out: string[] = [];
  out.push(`# Order Summary`);
  out.push(`## ${o.llc_name}`);
  // A plain sentence ends the renderer's centered title block.
  out.push(`This summary records the order as it was placed and, once received, as it was paid. It is kept for the office and does not appear in the client's portal.`);
  out.push(`## The order`);
  out.push(line("Company", o.llc_name));
  out.push(line("Filing", conversion ? `Conversion of an existing Florida LLC (document ${p.sunbizDocumentNumber || "not given"})` : "New Florida LLC"));
  out.push(line("Client", `${o.contact_name} <${o.contact_email}>`));
  out.push(line("Placed", when(o.created_at)));
  out.push(line("Paid", o.paid_at ? when(o.paid_at) : "not yet received at the time of this summary"));
  out.push(line("Square payment", o.square_payment_id ?? "—"));
  out.push(line("Square checkout", o.square_order_id ?? "—"));
  out.push(line("Order", o.id));
  out.push(``);
  out.push(`## Items ordered`);
  out.push(line("Package", conversion ? "Protected Series Designations for an existing Florida LLC" : "New Protected Series LLC formation"));
  out.push(line("Formation type", p.formationType === "PLLC" ? "Professional LLC" : "LLC"));
  out.push(line("Protected series", (p.series ?? []).map((s) => s.name).join("; ")));
  out.push(line("Registered agent", p.registeredAgent?.choice === "SERVICE" ? "Our registered agent service" : "Client's own agent"));
  out.push(line("Certificate of Status", p.optionalDocuments?.certificateOfStatus ? "Yes" : "No"));
  out.push(line("Certified Copy", p.optionalDocuments?.certifiedCopy ? "Yes" : "No"));
  out.push(line("Federal EIN service", p.optionalDocuments?.ein ? "Yes" : "No"));
  out.push(line("S election package", p.optionalDocuments?.sElection ? "Yes" : "No"));
  out.push(``);
  out.push(`## Price`);
  out.push([
    `| Item | Amount |`,
    `|---|---|`,
    ...(items ?? []).map((it) => `| ${cell(it.name)} | ${dollars(it.amountCents)} |`),
    `| Service subtotal | ${dollars(o.service_fee_cents)} |`,
    `| State fees subtotal | ${dollars(o.state_fees_cents)} |`,
    `| **Total charged** | **${dollars(o.total_cents)}** |`,
  ].join("\n"));
  const shown = p.estimatedStateFees?.estimatedTotal;
  out.push(line("State fees shown to the client on the review step", typeof shown === "number" ? `$${shown.toFixed(2)}` : "—"));
  out.push(line("State fees charged", dollars(o.state_fees_cents)));
  out.push(``);
  out.push(`## The questionnaire, as typed`);
  out.push(`### Your information`);
  out.push(line("Name", p.client?.name));
  out.push(line("Email", p.client?.email));
  out.push(line("Phone", p.client?.phone));
  out.push(line("Address", addr(p.client?.address)));
  out.push(conversion ? `### Your existing LLC` : `### LLC name`);
  if (conversion) {
    out.push(line("Existing LLC name", p.existingLlcName));
    out.push(line("Sunbiz document number", p.sunbizDocumentNumber));
  } else {
    out.push(line("Desired name", p.llcName?.desiredName));
    out.push(line("Designator", p.llcName?.designator));
    out.push(line("Final name", p.llcName?.finalName));
    out.push(line("Alternate names", (p.llcName?.alternateNames ?? []).join("; ")));
    out.push(line("Exact name only", p.llcName?.exactNameOnly ? "Yes" : "No"));
    if (p.nameCheck) {
      out.push(line("Availability check the client saw", p.nameCheck.available
        ? `${p.nameCheck.results.map((r) => `${r.input}: ${r.verdict}`).join("; ")} (state data as of ${p.nameCheck.asOf ?? "unknown"})`
        : "the automatic check was unavailable"));
    } else {
      out.push(line("Availability check the client saw", "none recorded"));
    }
  }
  out.push(`### Principal address`);
  out.push(line("Address", addr(p.principalOfficeAddress)));
  out.push(`### Mailing address`);
  out.push(line("Address", addr(p.mailingAddress)));
  out.push(`### Series`);
  (p.series ?? []).forEach((s, i) => out.push(line(`Series ${i + 1}`, s.name)));
  out.push(`### Registered agent`);
  const ra = p.registeredAgent;
  out.push(line("Choice", ra?.choice === "SERVICE" ? "Our registered agent service" : "Client's own agent"));
  if (ra?.choice !== "SERVICE") {
    out.push(line("Type", ra?.type));
    out.push(line("Name", ra?.businessEntityName || ra?.name));
    out.push(line("Address", addr(ra?.address)));
    out.push(line("Email", ra?.email));
    out.push(line("Phone", ra?.phone));
    out.push(`### Agent acceptance`);
    out.push(line("Accepted by", ra?.acceptance?.acceptanceName));
    out.push(line("Capacity", ra?.acceptance?.capacity));
    out.push(line("Electronic signature", ra?.acceptance?.electronicSignature));
  }
  out.push(`### Management`);
  out.push(line("Structure", p.management?.structure === "MANAGER_MANAGED" ? "Manager-managed" : p.management?.structure === "MEMBER_MANAGED" ? "Member-managed" : p.management?.structure));
  if (!conversion) out.push(line("Statement in the Articles", p.management?.includeManagementStatementInArticles ? "Yes" : "No"));
  const managers = p.management?.managersOrAuthorizedRepresentatives ?? [];
  if (managers.length > 0) {
    out.push(`### Managers`);
    managers.forEach((m, i) => {
      const mm = m as unknown as { firstName?: string; lastName?: string; suffix?: string; businessEntityName?: string; entityName?: string; streetAddress1?: string; address1?: string; city?: string; state?: string; zip?: string };
      const name = mm.businessEntityName || mm.entityName || [mm.firstName, mm.lastName, mm.suffix].filter(Boolean).join(" ");
      out.push(line(`Manager ${i + 1}`, `${name}; ${addr({ address1: mm.streetAddress1 ?? mm.address1, city: mm.city, state: mm.state, zip: mm.zip })}`));
    });
  }
  const members = p.members?.memberList ?? [];
  if (members.length > 0) {
    out.push(`### Initial members`);
    members.forEach((m, i) => {
      const mm = m as unknown as { firstName?: string; lastName?: string; suffix?: string; entityName?: string; memberType?: string; address1?: string; city?: string; state?: string; zip?: string; ownershipPercentage?: number | string };
      const name = mm.memberType === "ENTITY" ? mm.entityName ?? "" : [mm.firstName, mm.lastName, mm.suffix].filter(Boolean).join(" ");
      const pct = mm.ownershipPercentage !== undefined && mm.ownershipPercentage !== "" ? `; ${mm.ownershipPercentage}%` : "";
      out.push(line(`Member ${i + 1}`, `${name}; ${addr({ address1: mm.address1, city: mm.city, state: mm.state, zip: mm.zip })}${pct}`));
    });
  }
  if (!conversion) {
    out.push(`### Purpose`);
    out.push(line("Purpose type", p.purpose?.purposeType));
    out.push(line("Specific purpose", p.purpose?.businessPurposeText));
    out.push(`### Effective date`);
    out.push(line("Option", p.effectiveDate?.option === "SPECIFIC" ? `Specific date: ${p.effectiveDate?.requestedEffectiveDate ?? ""}` : "Date filed by the Division"));
  }
  out.push(`### Correspondence`);
  out.push(line("Name", p.correspondence?.name));
  out.push(line("Company", p.correspondence?.company));
  out.push(line("Email", p.correspondence?.email));
  out.push(line("Phone", p.correspondence?.phone));
  out.push(line("Mailing address", addr(p.correspondence?.address as Addr)));
  out.push(`### Optional documents`);
  out.push(line("Certificate of Status", p.optionalDocuments?.certificateOfStatus ? "Yes" : "No"));
  out.push(line("Certified Copy", p.optionalDocuments?.certifiedCopy ? "Yes" : "No"));
  out.push(line("Federal EIN", p.optionalDocuments?.ein ? "Yes" : "No"));
  out.push(line("S election package", p.optionalDocuments?.sElection ? "Yes" : "No"));
  out.push(`### Certification`);
  const c = p.certifications;
  if (!conversion) {
    out.push(line("Articles signed by", c?.articlesSignedBy === "SERVICE" ? "MyFloridaSeriesLLC, as appointed authorized representative" : "The client"));
    out.push(line("Authorized representative", c?.authorizedRepresentativeName));
    out.push(line("Title", c?.authorizedRepresentativeTitle));
  }
  out.push(line("Electronic signature typed", c?.authorizedRepresentativeSignature));
  out.push(line("Signed at", when(p.metadata?.submittedAt ?? o.created_at)));
  out.push(``);
  out.push(`## Acknowledgments ticked`);
  out.push(`Each box below was ticked by the client, in these words, at ${when(p.metadata?.submittedAt ?? o.created_at)}.`);
  for (const t of ticked(p)) out.push(`- ${t.text}`);
  out.push(``);
  out.push(`## Submission record`);
  out.push(line("Submitted at", when(p.metadata?.submittedAt ?? o.created_at)));
  out.push(line("From IP address", o.submitted_ip || p.metadata?.ipAddress || "not recorded"));
  out.push(line("Browser", o.submitted_user_agent || p.metadata?.userAgent || "not recorded"));
  out.push(line("Form version", p.metadata?.formVersion));
  return out.join("\n\n");
}

export async function loadSummaryRow(orderId: string): Promise<SummaryOrderRow | null> {
  const db = await getDb();
  const rows = await db.query<SummaryOrderRow>(
    `SELECT id, llc_name, package, contact_name, contact_email, payload, service_fee_cents, state_fees_cents, total_cents,
            status, square_order_id, square_payment_id, created_at, paid_at, line_items, submitted_ip, submitted_user_agent
       FROM orders WHERE id = $1`,
    [orderId],
  );
  return rows[0] ?? null;
}

/** Write (or rewrite) the order's summary PDF and keep its markdown. */
export async function writeOrderSummary(orderId: string): Promise<void> {
  const o = await loadSummaryRow(orderId);
  if (!o) return;
  const markdown = summaryMarkdown(o);
  const pdf = await renderMarkdownPdf({ markdown, watermark: null, title: `Order Summary — ${o.llc_name}` });
  const stored = await putFile(`order-summary-${o.id}.pdf`, pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer, "application/pdf");
  const db = await getDb();
  await db.query("UPDATE orders SET summary_storage_key = $1, summary_markdown = $2 WHERE id = $3", [stored.storageKey, markdown, o.id]);
}
