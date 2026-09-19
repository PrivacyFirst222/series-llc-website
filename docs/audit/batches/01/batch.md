# Batch 01 — implementation work order

Authorization: Adam: “Apply the proposed fixes to all items”. This refers to the ten fixes explained immediately beforehand. Implementation only; no acceptance, publication or other batch fixes.

Location: items 1–9 are Client portal → Operating agreement questionnaire; item 10 is Client portal → S-election details → owner address.

Source of correctness: the existing questionnaire promises “Your answers save automatically — you can return anytime, and regenerate whenever anything changes.” Initial contributions instructs: “Give each asset an agreed value, say who contributed it, and say where the company allocates it.” The user has approved preserving those answers and identities, exact dollar/fraction values, appropriate entity-name validation, accurate help and address labels.

## Scope and governing records

### N3.01

Client portal → Operating agreement questionnaire → returning to Initial contributions — `webapp/src/pages/portal/OAQuestionnaire.tsx:383`
Reads: Your answers save automatically — you can return anytime, and regenerate whenever anything changes.
Claims: A returning client recovers the contributions already entered and saved.
True: OAQuestionnaire.tsx:105-138 reconstructs the saved answers but never copies saved.assets. Its Initial contributions card at :713 receives a.assets ?? [], and any later edit saves this reconstructed object at :145/168-174. routes-portal.ts:1174-1185 replaces the complete answers object; :1449 computes the exhibits from a.assets. oa-capital.ts:46 treats missing assets as an empty list, :130 gives zero contributions, and :133-136 prints None. Thus reopening loses the visible asset list, and generating from it can silently replace actual contributions with zero/None.
Replace with: Preserve the sentence only after restoring the actual saved assets. Add to the saved-answer initializer: assets: saved.assets ?? [],




### N3.02

Client portal → Operating agreement questionnaire → saving edits after leaving and returning — `webapp/src/pages/portal/OAQuestionnaire.tsx:83`
Reads: const revRef = useRef(0);
Claims: A newly opened editor can continue saving an existing draft with monotonically increasing revisions.
True: Each mount starts revision0; edits increment it at :171. The GET response routes-portal.ts:1110/1135-1144 returns answers but no revision. The PUT writes only if oa_profiles.rev < the supplied revision at :1174-1176, otherwise returns HTTP200 with stale:true at :1180. The client’s :146 onSuccess clears its error without inspecting stale. A draft at revision20 silently discards the next20 edits after reopening, despite the automatic-save promise at :383-384.
Replace with: Return and initialize from the stored revision, reject stale writes visibly, and distinguish a rejected save from success. Conflict message: “Your latest changes were not saved because this draft changed elsewhere. Reload the draft before continuing.”




### N3.03

Client portal → Operating agreement questionnaire → removing an owner after allocating contributions by share — `webapp/src/pages/portal/OAQuestionnaire.tsx:218`
Reads: patch({ members, couples: nextCouples });
Claims: Removing an owner preserves which remaining owner contributed each asset.
True: removeOwner at :213-218 remaps couples but leaves every asset.contributedBy.shares array unchanged; units at :230-250 then renumber. OaAssetsCard.tsx:59/113-123 binds shares by the new unit index. For owners A/B/C and contributed shares [0,100,0], deleting A leaves B/C receiving [0,100], a valid100 total now attributed to C. oa-capital.ts:69-81 uses the same positions to print contributions and contributor names.
Replace with: Bind contributor shares to stable owner/unit IDs. When deleting, pairing or unpairing owners, preserve the surviving identities and require confirmation of any changed allocation: “The owner list changed. Confirm who contributed each asset before generating the agreement.”




### N3.04

Client portal → Operating agreement questionnaire → dollar amounts for contributions, capital calls and borrowing — `webapp/src/pages/portal/OaAssetsCard.tsx:16`
Reads: const digits = typed.replace(/[^\d]/g, "");
Claims: A typed dollar amount is represented as that amount, rather than changing its magnitude.
True: The parser strips a decimal point and minus sign instead of validating them: pasting100.50 produces10050, and -100 produces100. The same parser is used for agreed value at :93 and cash allocations at :152; OAQuestionnaire.tsx:65-67 repeats the defect for capital-call caps and borrowing limits. oa-capital.ts:37-38/61 accepts and prints monetary values with up to two decimals, so the inflation is introduced by the UI parser.
Replace with: Parse a nonnegative dollar amount without deleting its decimal point or sign; reject invalid input rather than changing the number. Validation text: “Enter a nonnegative dollar amount with no more than two decimal places.”




### N1.08

Operating agreement questionnaire, equal ownership fractions — `webapp/src/lib/ownership.ts:50`
Reads: num = num * d + n * den;
    den = den * d;
  }
  return num === den;
Claims: Fraction ownership totals are tested exactly.
True: This multiplies denominators without reduction in JavaScript Number. A pure in-memory import of the existing helper returned false for equalShares('fraction',17) and for19, although17×1/17 and19×1/19 each equal1. The20-owner questionnaire limit permits both cases. Valid equal ownership therefore blocks validation.
Replace with: Accumulate numerator and denominator with BigInt, reducing by greatest common divisor on every addition, and compare the exact reduced numerator and denominator. Preserve the existing positive-integer validation.

Reproduced: 17 and 19 equal owners fail the exact-total check.


### N3.13

Client portal → Operating agreement questionnaire → full legal name of an entity owner — `webapp/src/pages/portal/OAQuestionnaire.tsx:330`
Reads: const incompleteOwner = owners.some((o) => !hasFirstAndLast(o.name) || !(o.address ?? "").trim());
Claims: Every owner’s legal name must consist of a human first and last name, including owners identified as companies or trusts.
True: OaOwnersSections.tsx:134-143 explicitly permits a company or trust and :126 asks its full legal name. OAQuestionnaire.tsx:330 nevertheless applies hasFirstAndLast to all owners, including isEntity:true; routes-portal.ts:1215-1217 repeats the restriction. An entity’s one-word legal name therefore blocks generation even with its separate human signer’s full name and title supplied at :335. The form conflates the entity’s legal name with the signer’s personal name.
Replace with: Require a nonblank full legal entity name for isEntity owners and apply first/last-name validation only to individual owners and human signers. Entity label: “Full legal name of the company or trust”.




### 141

Client portal, questionnaire, Owners card, the note under the heading (manager-managed companies) — `webapp/src/pages/portal/OaOwnersSections.tsx:99`
Reads: They start from what you gave us when the company was formed — change them if ownership has changed since.
Claims: The owner rows were seeded from owners the client named on the order.
True: A manager-managed order collects no members at all (stepValidation.ts:287-289: "Hidden entirely for manager-managed companies — ownership is collected in the operating agreement questionnaire, not here"); such a client sees one blank row and "From your order:" suggestion chips built from the client and managers (OAQuestionnaire.tsx:207-209), not owners they gave.
Replace with: They start from the people named on your order — add, remove, or change them so the list is the owners as they are today.

A manager-managed client is pre-filled as the first owner (no blank row). The replacement wording stands: 'They start from the people named on your order'.
The proposed “people named on your order” is a useful, accurate refinement: the contact or manager is not automatically an owner. Do not support it with the false blank-row claim.

### 166

Client portal, questionnaire Ownership card, the Equal ownership button — `webapp/src/pages/portal/OwnershipEditor.tsx:82`
Reads: const ok = window.confirm(`${rows.length} owners can't split 100% evenly — 33.33 three times is 99.99. Use fractions instead (1/${rows.length} each)?`);
Claims: A browser confirm box is the prompt.
True: webapp/CLAUDE.md: "Use Dialog/AlertDialog from shadcn/ui, not window.alert() or window.confirm()." Every other question in the portal is a Dialog; this one is the browser's unstyled box, which the Vibecode webview may suppress.
Replace with: An AlertDialog with the same sentence and two buttons, "Use fractions" and "Keep percentages".


Correct as written.

### 134

Help "Effective Date": "We've pre-filled today's date" true only the first time. Replace: say the saved date is kept.


Correct as written.

### N3.06

Client portal → S election details → owner mailing address — `webapp/src/pages/portal/SElectionDetailsForm.tsx:533`
Reads: Verified address
Claims: The displayed address has been selected and verified through the address lookup.
True: The live lookup sets verified:true at :525-527, but reopening any stored shareholder sets verified:true and verified2:true unconditionally at :119-134. Selecting an owner also sets verified:Boolean(m.address) at :486, regardless of address provenance. A manually entered nonempty address therefore gains the verification label after save/reopen or selection without lookup verification.
Replace with: Show “Address on file” for imported or previously saved addresses unless lookup verification was actually recorded. Reserve “Verified address” for a successful lookup result.




## User walks

USER WALK — returning client completing an operating agreement:
1. Opens Client portal → Operating agreement questionnaire and sees saved owners, assets and the saved date.
2. Edits a dollar amount, adds/removes or pairs owners, and confirms any affected contribution allocation.
3. Saves and generates the agreement; if another tab changed the draft, sees a conflict instead of silent success.
Expects: exact amounts, correct contributors and no discarded changes.

USER WALK — client entering ownership and reviewing an S election:
1. Opens the operating agreement questionnaire and confirms the suggested owner list.
2. Enters a company or trust owner with its separate human signer; chooses equal fractions through the portal dialog.
3. Opens Client portal → S-election details and sees Address on file for a saved/imported address, or Verified address only after lookup.
Expects: entities are not treated as human names; valid fractions are accepted; labels describe actual verification.

## Verification and scope limits

All ten regression labels are named in batch.json. New behavioral checks run against both the base and changed commit. Existing mandatory checks and hooks remain active. Code-level scope is left to complete-diff review. No master agreement, legal clause, public price or live data is changed. A local clone and before-batch-01.bundle preserve the return point. Assignment remains local until acceptance/publication; no preview deployment is created.

Client wording: owner note identifies order suggestions and asks confirmation of the current owners; effective-date help distinguishes initial default from saved date; the ownership dialog offers Use fractions / Keep percentages; saved S-election addresses say Address on file. Invalid money and allocation changes explain what the client must correct.
