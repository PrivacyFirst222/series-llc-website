# Batch 08 — approved formation-order repairs

Owner authorization: after the complete 15-item Batch 08 proposal, Adam said “I approve the rest”, with the specific corrections quoted below. This authorizes implementation only. Acceptance, integration and publication remain separate. Base/return point: 32eb7738d86ac9fc2eb26f82eadefd3533dabac4. An isolated clone and ../return-point.bundle preserve that point; the original and Batch 07 remain untouched.

## Owner instructions, quoted before editing

- Item 2: “You are reading the explanation wrong. To have a manager managed LLC, you must state so in the articles or the operating agreement. We just add it to the articles because it’s best practice”. Preserve the deliberate Articles statement. No change claimed for item 50.
- Item 5: “The only one required to provide an email is the user”. Optional manager emails remain optional and are checked only if supplied. Remove unused signer email/phone fields. An omitted separate correspondence email uses the user's email; another correspondence email and its confirmation remain optional to choose, with matching confirmation required only when that alternative is supplied.
- Item 7: “I reject the change. Leave as is”. Management recommendation, preselection and explanatory text remain unchanged; item 83 is excluded.
- Item 9: “If this is an easy fix, make it. Otherwise skip it. We will have very few foreign customers”. Deferred: AddressFields restricts State to US_STATES, while filing.ts address types/formatters omit country. A correct end-to-end repair is more than changing one box. Item 86 is not assigned or marked fixed.
- Items 14/15: “The articles are entered manually and will contain that language. Do nothing”. Do not edit filing.ts, general-purpose wording or its clause. N4.04 and 98 remain unassigned with the owner's decision recorded.
- Remaining items: “I approve the rest”. Implement original review items 1, 3, 4, 5 as corrected, 6, 8, 10, 11, 12 and 13 (ten ledger parts).

## Governing product sources

- ReviewStep currently prints `includeMembersInArticles ? "Yes" : "No"`; server/validation explicitly sets `includeMembersInArticles: d.managementStructure === "MEMBER_MANAGED"`. The repair follows the existing filing policy, without claiming all members must legally be listed.
- schema.ts currently requires `country: z.string().min(1, "Country is required")`; the corresponding step checks and error props omit it for client/manager/member addresses.
- The step accepts any nonempty ZIP while schema.ts requires three characters. Both will use the same US ZIP or ZIP+4 check; existing foreign-country minimum handling is preserved, not advertised as foreign-address support.
- StepCertification offers “Email (optional)” / “Phone (optional)” but buildPayload saves no signer email/phone. Remove those unused questions and their validation.
- StepCorrespondence says “Add a mailing address for paper correspondence”; its additional company/phone/address are approved for removal. Keep the LLC mailing address. Stale draft extras must not block submission or populate new orders; retained historical orders are not rewritten.
- buildPayload already excludes managers for MEMBER_MANAGED and members for MANAGER_MANAGED. Apply the same rule before server validation and in submission, retaining draft answers for a switch back.
- StepPurpose says “Also list a specific purpose in the Articles”; after switching from PLLC to ordinary, its checkbox is unchecked while PROFESSIONAL data survives. Clear the incompatible purpose when changing company type, handle stale drafts on the purpose step, and refuse the inconsistent combination at the server. The displayed general-purpose clause remains unchanged.

## Exact visible wording and behavior

1 Review: new member-managed “Yes — listed as authorized members (AMBR)”; existing-company review has no In Articles row.
3 All still-present required country boxes display “Country required.” before advancing.
4 US ZIP error: “Enter a 5-digit ZIP code or ZIP+4.”; non-US pre-existing minimum: “Enter a complete postal code.” No forced US-only eligibility rule.
5 Manager email blank is valid; malformed supplied email shows “Enter a valid email.” next to the box. Only user email is required. Unused signer email/phone removed.
6 Correspondence keeps contact name and optional alternative email with conditional confirmation. Explain “Leave the email blank to use your email from Your information.” Remove company/phone/extra postal address and related review rows.
8 “Manager type” / “Member type”; choices “Individual” / “Business entity”.
10 New member-managed empty list: “At least one member is required. We list these members in the Articles of Organization.” Existing company: “At least one member is required for your operating agreement.”
11 Review shows “Exact name only” Yes/No; omit missing self-agent contact rows, show real supplied values, and never show hidden managers as current answers.
12 A partial abandoned manager cannot stop a member-managed submission. Neither direction leaks hidden role entries into the filing; draft answers remain available when switching back.
13 Switching PLLC to ordinary clears PROFESSIONAL type/text; user may explicitly add a new specific purpose. Server refuses incompatible ordinary/professional combinations.

USER WALK — client ordering formation or adding series:
1. Enters user and party details; only the user must supply an email; missing country, incomplete ZIP and malformed optional email are marked on their own steps.
2. Changes management or professional-company choices; hidden abandoned answers neither block submission nor leak into the filing.
3. Reviews exact-name instructions, public-member disclosure and correspondence destination before submitting.
Expects: saved answers match the visible choices, no additional email required, original management recommendation remains.

USER WALK — office reviewing the order:
1. Opens the submitted order and its saved payload.
2. Compares names, management choice, purpose and correspondence email with the client's visible review.
3. Uses the existing manual Articles-filing workflow and existing management/general-purpose practices.
Expects: correct applicable answers and no rewritten filing instructions or legal clauses.

## Verification

Ten durable named assertions must fail on the unmodified base for the intended defects and pass on the implementation. Include real browser interactions, server parsing, actual submission/readback, new/existing and member/manager-managed paths. Preserve all earlier fix assertions. Replace only the three obsolete correspondence-phone/address check sites expressly named in batch.json; the corresponding required behavior is removed by approval.

No product fix or external owner decision is fabricated for excluded items. No live server, payment, email or publication is needed for this review.
