# Batch 09 — existing companies and the filing flow

Adam approved all 18 review units, including optional 81 and 206, with “Go. - approve all”. This authorizes implementation and necessary tests, not acceptance, integration or publication. Source/return point: c22d47592edf06826e0bfbad69f42e349dda44f7; ../return-point.bundle verified. Original repository and Batch 08 untouched.

## Governing sources read before editing

- StepIntro currently says “Formation type” and “Choose 'Professional LLC'”; actual option is “Domestic Florida PLLC”. routes-portal.ts retains `formationType: p.formationType ?? ""`, uses `professional: seed.formationType === "PLLC"`, and constructs the agreement's principal address from principalOfficeAddress. order-summary.ts retains both office addresses. Keep both questions; explain their uses and that entering them here does not update Sunbiz.
- StepIntro has `ack-legal` and `ack-public`; StepCertification already requires “I understand this service does not provide legal, tax, or accounting advice.” and “I understand that filed information may become part of the public record.” Keep those final checkboxes and early plain notices. Old order records keep their actual consents; new payloads must not claim removed boxes were ticked.
- server/validation.ts compares alternate names unconditionally. An existing-company order is not renaming it; apply this check only to NEW, keeping the NEW refusal.
- server/pricing.ts receipt already reads “Protected series service fee”; apply that label to existing-company estimates, retaining included series and all amounts.
- StepFilingPath reads “Converting skips the $125 filing fee for the Articles and Registered Agent (if you keep your existing Registered Agent).” Replace with “No Articles filing fee. If you appoint us as your registered agent, a separate $25 state change-of-agent fee applies.” Adding series has no new Articles fee whether or not its agent changes. Internal CONVERT/path=convert remain compatible.
- llcFormedEmail combines awaiting_info and in_progress as “that's our next step.” routes-admin currently selects only type. Carry status through; ask only awaiting_info customers for details; confirm received details for in_progress without claiming active work has started.
- 2026 Online Sunshine s.605.0213(2): “For filing original articles of organization or articles of revocation of dissolution, $100.” (5): “For filing an annual report, $50.” (7): “For filing a certificate designating a registered agent or changing a registered agent, $25.” Opened https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/0605.html after the individual-section URL failed. Scope: s.605.0213, not a new full-Chapter legal audit.
- 2026 s.607.193(1): “an annual supplemental corporate fee of $88.75”; (2)(b) adds $400 after May 1, except a failure-to-file dissolution/revocation followed by reinstatement with the applicable fee paid. Opened complete section at https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0607/Sections/0607.193.html. Internal note: $50 + $88.75 = $138.75, ordinary late total $538.75; preserve exception and historical August instruction, mark obsolete warnings resolved.

## Exact approved wording and outcomes

1. Principal address: “We use this address in your operating agreement. Entering it here does not update the address on Sunbiz.” Mailing: “We keep this mailing address in your office order records. Entering it here does not update the address on Sunbiz.” Existing-company path only.
2. “Existing company type”; ask its current organization, retain agreement seed.
3. Ignore hidden abandoned alternate names only for existing companies.
4. “Protected series service fee (includes up to 3 series)” for existing companies.
5. “Optional documents and services”; intro includes Florida documents and IRS-related services.
6. Early notices; legal/public-record consent once, at Certification; no fabricated legacy consent.
7. “Continue to payment” / “Taking you to payment…”.
8. Helper uses “Domestic Florida PLLC”; existing-company wording asks its actual type.
9. “No Articles filing fee. If you appoint us as your registered agent, a separate $25 state change-of-agent fee applies.”
10. “Adding protected series to an existing Florida LLC” and equivalent grammatical forms throughout the live order/service flow. Preserve genuine statutory conversions and internal identifiers.
11. “Add protected series to your existing Florida LLC” title; new-company title unchanged; reflects direct links, saved drafts and in-form choice.
12. Shared welcome, Your information and sign-in wording uses “your documents”; existing-company banner names Protected Series Designations.
13. Awaiting details: direct customer to Orders in progress / Provide details securely for the named service. Received: “We have received your details and will prepare your …”. Keep the separate S deadline sentence unchanged for the later tax batch.
14. “No further action is needed from you. We'll post the document to your portal when the work is complete.”
15. Office sheet: no Articles filing fee; separate $25 Statement of Change when appointing our agent.
16–18. Internal fee notes resolved with current pricing code and statutory components; no customer price change.

USER WALK — an owner adding protected series to an existing Florida LLC:
1. Opens the existing-company card or selects that path; sees the existing-company title and identifies the company on Sunbiz.
2. Supplies its current type and addresses with explanations, selects optional services, and sees the correct fee labels.
3. Gives the legal/public-record acknowledgments once at Certification and continues to payment.
Expects: no new-company promise, no abandoned new-name error, retained agreement answers, and unchanged prices.

USER WALK — the client receiving their documents:
1. Signs into the portal described as the home for their documents.
2. Receives the filing-completion email, listing the correct company's outstanding services and whether details are still needed.
3. Supplies missing details or waits for preparation when already supplied.
Expects: no duplicate request for already-submitted details; no unsupported claim that work has begun.

USER WALK — the office and future maintainer:
1. Opens the existing-company filing sheet and saved order summary.
2. Sees Protected Series Designations and the separate agent-change fee only when applicable, with actual consent history.
3. Reads the internal fee notes and preserved historical instruction beside the resolved status and current statutory sources.
Expects: the same service and state-fee facts across form, receipt, filing sheet and notes.

## Verification

18 durable named regression assertions across 21 active parts and 20 source records; all must fail for the intended defect on the base and pass after. Positive controls preserve new formations, retained answers and current prices. Full mandatory review, all previous assertions, real route/outbox checks, rendered page/email inspection and package verification. Necessary selector/check updates are declared up front. No publication or acceptance inferred.
