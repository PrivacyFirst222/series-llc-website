# Batch 02 — approved implementation work order

Authorization: Adam: “Go - approve all”. He defined this as “proceed with fixing all errors as proposed” without a second confirmation. Twelve of twelve proposed items approved. Acceptance and publication remain separate.

Source of correctness: Adam approved “make legal-mail uploads identify the company just as formation-package uploads already do” and correcting/removing unassigned test records without a permanent Unassigned section. Existing upload copy: “The document shows under this company's tab in the client's portal.” Existing office EIN heading: “EIN for:”. The exact company or series named by the client's order is authoritative for names, addresses, series, services and mail; the account's newest company is not a substitute.

All changes use the reviewed scope: company-specific S-election copies; agreement series; EIN duplicates and tax instructions; office and client EIN applicant names; legal mail association and mirror; formed email; abandoned conversion names; selected person/entity names. Item 123 is wording-only: current summaryOf already chooses the correct entity. Approved replacement: “We use this information to complete the IRS EIN application for [company or series name].” For a series with no recorded intended tax treatment, the office instruction asks confirmation before applying rather than borrowing its parent's classification. Existing company defaults are not a new legal determination.

Base is Batch 01's implemented commit; its records and protections are preserved. No acceptance of Batch 01 is inferred. The normal review package compares to remote main and therefore also shows the still-unpublished Batch 01 changes; an additional batch-only diff is provided. Assignment stays local until acceptance/publication, as in Batch 01. Original repository and both earlier review packages remain unchanged.

Legacy service orders with an exact unique matching company name may be associated to that company; ambiguous orders are never treated as belonging to every company. Unassigned legal-mail test records are assigned where there is only one paid company and otherwise removed in a one-time migration. This migration is built/tested locally; original/live data is not modified during implementation. No new permanent Unassigned section.

## User walks

USER WALK — client with two companies:
1. Opens the selected company's portal tab and its operating agreement questionnaire.
2. Reviews its series and orders an EIN or completes its S-election details.
3. Downloads the resulting document and reads the formation notification.
Expects: this company's names, address, series and services; another company's order cannot block it.

USER WALK — office handling legal mail and an EIN:
1. Opens the client's Upload dialog and selects Legal mail.
2. Chooses the company when there is more than one, enters the received date and uploads the PDF.
3. Opens the series EIN order and follows the applicant-specific instructions.
Expects: mail identified on the right company tab and copied to its folder; the series name in the EIN answer list, with no inherited parent-company tax election.

USER WALK — client changing order-form choices:
1. Types a proposed company name, then switches to an existing-company order.
2. Supplies the actual existing company name; changes a manager/member between Individual and Entity.
3. Reviews the order and later opens the operating agreement.
Expects: abandoned hidden names cannot appear in filing instructions or documents.

## Retained findings and replacement caveats

### N1.04

S-election package, company address on Form2553 and its record copy — `webapp/server/routes-portal.ts:828`
Reads: const seed = await oaSeed(so.client_id);
Claims: The address used for this company's tax package belongs to this company.
True: oaSeed without an order argument selects the newest paid company at routes-portal.ts:78–90. postSElectionPackage uses that unscoped seed at:828,837 although :879 retrieves the actual formation_order_id. The same mistake occurs during redaction at:569–574 and office draft at routes-admin.ts:1238–1241. An older company's form can carry the newer company's address.
Replace with: Resolve the service order's formation_order_id before building the package and call oaSeed(clientId, formationOrderId) for the original, office draft, corrections and redacted copy. Refuse an unresolved association rather than selecting another company.

### N1.05

Operating agreement questionnaire and generated Series Exhibit, list of this company's series — `webapp/server/routes-portal.ts:150`
Reads: "SELECT details FROM service_orders WHERE client_id = $1 AND type = 'series' AND status IN ('in_progress','fulfilled')",
Claims: Purchased extra series appended to the agreement belong to the selected company.
True: oaSeed first selects a company at:72–85 but its added-series query at:149–151 filters only client_id. It appends all paid in-progress/fulfilled series for the account to the selected intake series at:153–158. These seed series are used for generated agreements at:1460. A two-company account receives another company's protected series in its agreement.
Replace with: SELECT details FROM service_orders WHERE client_id = $1 AND formation_order_id = $2 AND type = 'series' AND status IN ('in_progress','fulfilled') [Bind the selected orders[0].id as $2; explicitly resolve any legacy unscoped orders.]

### N1.06

Client portal, buying an EIN for a second company — `webapp/server/routes-portal.ts:2118`
Reads: Your LLC's EIN is already ordered — see your orders below.
Claims: The selected LLC already has an EIN order.
True: The purchase resolves purchaseCompanyId at:2090, but :2102–2112 searches every non-pending EIN order on the client account and treats any company-target EIN as a duplicate. CompanyA's EIN therefore blocks the first EIN purchase for companyB.
Replace with: Scope the duplicate query to formation_order_id = purchaseCompanyId as well as client_id, then compare the target within that company. Keep the existing error only when that company already has the order.

### N1.07

Office, EIN application instructions, Tax classification row — `webapp/server/routes-admin.ts:1136`
Reads: "SELECT id FROM service_orders WHERE client_id = (SELECT client_id FROM service_orders WHERE id = $1) AND type = 's-election' AND status NOT IN ('pending_payment', 'cancelled') LIMIT 1",
Claims: A paid S-election order on this client account proves the entity in the current EIN application should be described as an S corporation.
True: ServiceOrdersSection.tsx:326 uses sElectionPaid directly for the IRS Tax classification instruction. This query does not match formation_order_id or the EIN details.target. CompanyA's S package can label companyB's EIN as S corporation; a series-target EIN also inherits the account-wide flag.
Replace with: Derive tax classification from the EIN target entity and its actual intended tax treatment. For a company target, match any supporting S-election order by formation_order_id; do not infer the classification of a series from a package purchased for the parent or another company.

### N3.05

Office → service order → Federal EIN for a protected series → IRS assistant answer list — `webapp/src/pages/admin/ServiceOrdersSection.tsx:333`
Reads: ["Legal name", viewing.llc_name],
Claims: The listed legal name belongs to the entity for which this EIN was ordered.
True: At :291-292 the same dialog correctly says EIN for details.seriesName when target is series. The assistant’s legal-name row at :333 nevertheless always supplies the parent LLC name, although the office is told at :309-310 to type these answers straight down. This can submit the parent name on an application intended for the separately named series.
Replace with: ["Legal name", viewing.details.target === "series" ? viewing.details.seriesName ?? "" : viewing.llc_name],

### 123

EIN details dialog: "…application for Federal EIN — Acme, LLC." Replace: the company or series name.

Earlier audit assessment: {"status": "confirmed", "evidence": "The EIN dialog title incorporates the service label and its company name instead of selecting the EIN target, while the form already knows whether the target is company or series.", "replacementOk": true, "replacementNote": "Correct as written."}

### 146

Client portal with two or more companies, the Legal mail card under each company tab — `webapp/src/pages/portal/PortalDashboard.tsx:660`
Reads: const legalMail = docs.filter((d) => d.kind === "legal_mail");
Claims: The Legal mail card under a company's tab lists that company's legal mail.
True: Legal mail is never tied to a company: the office's upload dialog sends an orderId only for kind 'package' (AdminDashboard.tsx:254 `if (kind === "package" && orderId)`), so every company's tab shows every piece of legal mail, and nothing on the row names the LLC it was served on (the row shows title, received date and download, :98-129). Package documents on the same screen are scoped per tab (:654-658). A client with two LLCs cannot tell which company a summons was served on unless the office typed it into the title.
Replace with: Ask 'Company' on a legal-mail upload as the package upload does (AdminDashboard.tsx:329-346), store it as order_id, and filter legal mail by tab the way packageDocs is: `docs.filter((d) => d.kind === "legal_mail" && (!multiCompany || d.order_id === company))`; print the company name on the row.

Earlier audit assessment: {"status": "confirmed", "evidence": "PortalDashboard.tsx:660 lists all account legal mail under every company. AdminDashboard.tsx:254 sends orderId only for package uploads; rows identify no company.", "replacementOk": false, "replacementNote": "The new company selection and attribution are right, but simply filtering existing mail by order_id hides all unassigned mail. Provide an explicit unassigned-mail section or assign existing records before applying the company filter."}

### 225

Nightly Dropbox mirror — which folder legal mail lands in for a client with two companies — `webapp/server/dropbox.ts:132`
Reads: COALESCE((SELECT o.llc_name FROM orders o WHERE o.id = d.order_id), (SELECT o.llc_name FROM orders o WHERE o.client_id = d.client_id AND o.paid_at IS NOT NULL ORDER BY o.paid_at DESC LIMIT 1)) AS llc_name
Claims: A document with no company is filed under the client's newest paid company.
True: Legal mail carries no order_id by design (routes-admin.ts:1565 'Legal mail stays one shared section and carries no company'), so every piece of legal mail for a two-company client is mirrored into the newer company's folder whichever company it was served on.
Replace with: For kind = 'legal_mail' use the client's email as the folder (`safePathPart(doc.email)`), or add a per-piece company when the office uploads it.

Earlier audit assessment: {"status": "confirmed", "evidence": "dropbox.ts:132 places unscoped legal mail under the newest paid LLC, although routes-admin.ts:1565 intentionally leaves that mail without a company association. The wrong company folder is visible to the office.", "replacementOk": true, "replacementNote": "Use a clearly shared client-level legal-mail folder or collect the actual target company; do not infer newest equals recipient."}

### 209

Formed email — the 'Your Federal EIN order / S election package order is in your portal as well' line, for a client with two companies — `webapp/server/routes-admin.ts:879`
Reads: SELECT type FROM service_orders WHERE client_id = $1 AND type IN ('ein', 's-election') AND status IN ('awaiting_info', 'in_progress')
Claims: Lists the EIN and S election orders bought for the company being formed.
True: The query is by client, not by formation order: a client forming a second company whose first company still has an open EIN order is told, in the second company's formed email, that 'Your Federal EIN order is in your portal as well' (email.ts:466-473, :492-495). service_orders carries formation_order_id for both intake and portal purchases (routes-payments.ts:93-104; routes-portal.ts:1934, :1989, :2057, :2143).
Replace with: …WHERE client_id = $1 AND (formation_order_id = $2 OR formation_order_id IS NULL) AND type IN ('ein', 's-election') AND status IN ('awaiting_info', 'in_progress') with o.id as $2.

Earlier audit assessment: {"status": "confirmed", "evidence": "routes-admin.ts:879 selects pending EIN/S-election work by client_id alone. The formed email for companyB can announce work ordered for companyA.", "replacementOk": false, "replacementNote": "Require the matching formation_order_id. Resolve legacy NULL associations to a specific order before inclusion; OR formation_order_id IS NULL otherwise repeats the ambiguity for every company."}

### 101

Order form, the payload built at submit (conversion branch) — `webapp/src/components/forms/florida-llc/buildPayload.ts:29`
Reads: ? { desiredName: "", designator: "", finalName, alternateNames: [], exactNameOnly: false }
Claims: Per the comment at :26-27, that on a conversion 'whatever was typed on the new-formation path before switching stays off the record'.
True: finalName is computed at :16-19 from data.desiredLlcName and data.llcDesignator and sent regardless, so an abandoned typed name still reaches llcName.finalName; filing.ts:365 and order-summary.ts:151 print that value. The order's own name is safe only because routes-payments.ts:363-365 prefers existingLlcName on a conversion.
Replace with: ? { desiredName: "", designator: "", finalName: "", alternateNames: [], exactNameOnly: false }

Earlier audit assessment: {"status": "confirmed", "evidence": "buildPayload.ts:29 preserves abandoned finalName on conversion despite its comment. routes-portal.ts:162 prefers that name to orders.llc_name when seeding agreements, so this has reader-visible impact beyond housekeeping.", "replacementOk": true, "replacementNote": "Set finalName empty on conversion and always source the existing company identity for downstream documents; proposed field fix is correct."}

### 155

Client portal, the operating agreement, consent and S election for a converted company — the company name the seed prefers — `webapp/server/routes-portal.ts:162`
Reads: llcName: p.llcName?.finalName || orders[0].llc_name,
Claims: The stored payload's finalName is the company's name, and the order's llc_name is only a fallback.
True: On a conversion buildPayload.ts:16-19 and :28-29 still fill finalName from desiredLlcName and llcDesignator — whatever the client typed on the new-formation path before switching (the form never clears it: StepFilingPath.tsx:68 patches filingPath only) — while the order itself is named from existingLlcName (routes-payments.ts:363-365). A client who typed "Acme" + LLC, then chose the conversion path for "Sunshine Holdings, LLC", gets an operating agreement, consent and Exhibit headed "Acme, LLC" (OaInputs.companyName at :1463 comes from seed.llcName), and the consent route refuses their real series name because it "must begin with \"Acme, LLC\"" (:1591-1595).
Replace with: llcName: (p.filingPath === "CONVERT" ? "" : p.llcName?.finalName) || orders[0].llc_name,  — and, in buildPayload.ts:28-29, finalName: "" on the conversion branch.

Earlier audit assessment: {"status": "confirmed", "evidence": "routes-portal.ts:162 prefers payload.llcName.finalName even for CONVERT; buildPayload.ts retains the old desired-name-derived finalName while routes-payments.ts names conversion orders from existingLlcName. The proposed branch uses the actual conversion company.", "replacementOk": true, "replacementNote": "Correct as written."}

### N4.01

Order form, Managers and Initial members: changing a row between a person and a business, then opening its agreement — `webapp/src/components/forms/florida-llc/RepeatablePartyFields.tsx:81`
Reads: update(entry.id, { personOrEntity: v as PartyKind })
Claims: The selected Person/Business Entity type identifies the legal party used in the review, state filing, and operating agreement.
True: RepeatablePartyFields.tsx:81–83 and RepeatableMemberFields.tsx:75–78 change only the discriminator and retain hidden names. buildPayload.ts:86,97 preserves both. ReviewStep.tsx:198,221 uses the discriminator, but routes-portal.ts:94–99,108–114,127–132 chooses any retained personal name before entityName/businessEntityName and infers isEntity from name absence. Enter John Smith, switch to Entity and enter Acme LLC: review identifies Acme LLC, while the OA seed identifies John Smith as an individual. In the reverse manager switch, filing.ts:512–523 instead prefers the retained businessEntityName. This is a reproducible deterministic data-path mismatch, not evidence of an actual customer document.
Replace with: When the row type changes, clear fields belonging to the other type. In the review, filing sheet, and agreement seed, choose the name and entity-signature treatment from memberType or personOrEntity; never infer the selected type from whichever hidden name remains populated.

## Checks

Each item has a named regression, run on the base and changed commit. Browser probes exercise the real built screens with controlled fixtures; server probes exercise actual routes and delivered output in the offline throwaway database. Existing mandatory checks and prior assertions remain active. The obsolete assertion “legal mail needs no company” is explicitly replaced because Adam approved requiring company association. No release gate is weakened.

## Implementation evidence

The targeted server probes exercise real Hono requests and generated PDF text in a separate process with E2E_OFFLINE=1 and a throwaway database. They also test a restart with the migration marker removed in that disposable fixture, so the actual migration runs on legacy mail rows. The browser probes use built screens with deterministic API fixtures. All 12 named checks fail on 3465320 for their intended defects and pass after the changes; supplemental probes cover the generated Series Exhibit, existing-company consent, company tabs, legal-mail upload payload, explicit party type, and legacy mail cleanup. Logs are in evidence/. The full mandatory suite and before-fix rerun belong to the external, commit-bound review package.

Migration 12 changes existing sample database rows once at startup: sole-company mail is associated with that company, while ambiguous unassigned legal-mail rows are removed. It does not delete historical storage blobs or Dropbox backup files. No original or live database has been changed during implementation.

Item 123 is a wording repair: the existing dialog already selected the right company or series; it included the service label in the application sentence. No incorrect applicant-selection claim is made for this item.

This branch is stacked on the unaccepted Batch 01 commit. The package comparison to main therefore includes both batches. This work does not accept or release either batch. The 322 records outside Batch 02, including all 10 Batch 01 fixes, and all earlier batch records are unchanged.

The final PDF probes read the actual standard-font text operators from generated PDF streams using the already installed PDF library, including encrypted agreement streams and flattened IRS appearances. The controlled fixtures contain ASCII company names/addresses. This avoids adding an undeclared dependency on the Mac-only pdftotext executable to CI. All 13 targeted server probes pass on the implementation and fail on the base with this extractor; portable-api-{green,red}.log retain the results. Poppler was additionally used for the manual rendered-page review.
