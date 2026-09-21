# Batch 25 — Generated document repairs

Adam reviewed the five proposed fixes and said: **“Go. Approve all”**. This authorizes implementation and local verification; acceptance and publication remain separate and deferred.

## Approved scope and objective ledger — 8 of 8 requirements

1. Word exhibit rows stay inside actual tables, including total rows; intentional draft blanks/choices remain.
2. Word signature indent controls become formatting; no literal `[[indent]]` prints.
3. Manual table headers stay with their first data row and repeat on continued pages; complete rows remain readable.
4. Accepted bracketed client names and signer text print literally in amendments and Statements; real unfilled slots still fail.
5. Complete signature units remain together, including wrapped names and entity signer details; preserve tight spacing and avoid unconditional extra pages.
6. Preserve legal master wording, facts, prior owner rulings and all earlier checks; no new legal conclusions or unrelated repairs.
7. Measure baseline and run identical red/green checks; render and inspect affected outputs; state actual coverage and limits.
8. Separate checkout and verified return point; ordinary hooked local commit and exact-commit review; no installs, integration, push, Dropbox publication or test-data cleanup.

## Governing source quotations

The approved proposal said: “Correct the Word generator so those rows stay inside their tables.” “Make the generator indent those lines properly and remove the visible instruction.” “Keep the headings with at least the first information row. Repeat column headings when a table continues onto another page.” “Make the generators distinguish client-entered text from actual drafting blanks.” “Keep each complete signature block together.”

`docs/README.md`: **“The markdown in this repository is the master. Word files are output.”**

Existing PDF-renderer owner decision: “a line of underscores is a signature line, and the name beneath it and the \"Date:\" line beneath that sit tight, with no paragraph gap between them; the gap goes before the signature line instead”. The correction preserves that spacing while reserving space for the complete block.

The original frozen findings below supply exact current-source quotations and prior reproductions; their historical not-approved labels do not override Adam's approval above.

## WORD-EXHIBIT-TABLE-ROWS

Keep all editable Word agreement exhibit data and total rows within their tables, preserving drafting choices and text.

Tracked Word agreement → Exhibit A, rendered Manager-Managed S Corporation p25 — `docs/md-to-docx.py:399`
Reads: while i < len(lines) and lines[i].strip().startswith("|"):
Claims: All Exhibit A rows are emitted as Word table cells.
True: The converter strips HTML control comments at339 but leaves their standalone lines empty. The table loop stops at the blank left by repeat:member before the first data row (templates-oa-s.md441); the remaining data/total lines fall through as ordinary paragraphs. The tracked Word render p25 shows four header-only grids and raw |...| data rows for members, assets, series allocation and TOD. These are editable Word drafting outputs per docs/README.md1–40; ordinary unfilled placeholders are intentional but the lost table structure is not. This is not a claim about generated client PDFs. Compared ledger original descriptions:261 concerned inventory,265 manager placeholder; no existing prior describes this Word table conversion defect.
Proposed replacement (not approved): Keep intended blank-form data/total rows within their Word tables when removing template-control comment lines, and verify all agreement exhibits by rendering existing outputs. Preserve visible drafting choices and avoid silently selecting a client variant.
Rechecked by codex-coordinator: Reopened converter table loop and paragraph fallthrough; visually inspected retained Word Manager S pages24,25,26. Page25 confirms four header-only grids and literal pipe rows; pages24/26 confirm visible [[indent]] labels. These are editable Word outputs, not a claim of PDF defects. Compared prior261/265 and full prior descriptions.

## WORD-INDENT-CONTROL-LEAK

Interpret indent formatting controls in Word signature blocks without printing control tokens; preserve intended signature layout.

Tracked Word legal forms → entity signature blocks, e.g. Manager-Managed S Corporation pp24,26 — `docs/md-to-docx.py:471`
Reads: stripped,
Claims: The ordinary paragraph contains only document text after template formatting controls are interpreted.
True: The converter recognizes pagebreak/left/contents controls but has no indent control handling; literal [[indent]] is passed into paragraph output. ManagerS pp24/26 visibly print six tokens before printed-name/title fields. OOXML comparisons show literal indent text in all10 legal Word outputs (4or6 in agreements/amendment,2 in Statement); Instructions/Manual unaffected. This is separate from expected company/name blanks and does not assert client PDF leakage. Original ledger descriptions searched for Word/docx/indent/table/control issues; no matching prior found.
Proposed replacement (not approved): Consume [[indent]] as paragraph formatting in Word generation so signature labels are indented and the control token does not print; render all affected signature blocks to verify.
Rechecked by codex-coordinator: Reopened converter table loop and paragraph fallthrough; visually inspected retained Word Manager S pages24,25,26. Page25 confirms four header-only grids and literal pipe rows; pages24/26 confirm visible [[indent]] labels. These are editable Word outputs, not a claim of PDF defects. Compared prior261/265 and full prior descriptions.

## B5-MANUAL-TABLE-HEADER-PAGINATION

Keep Owner's Manual table headers with first data row and repeat headers on continuation pages, preserving rows and content.

Site-generated Owner's Manual tables, physical pages8–9 and15–16 (printed6–7 and13–14) — `webapp/server/manual-pdf.ts:335`
Reads: need(rowH);
Claims: Table column headings remain with at least the first data row.
True: Actual renderManualPdf of the frozen docs/owners-manual.md produces37pages. Physical page8 ends with only the OA-choice table column headings, with all choices onpage9; page15 ends with only Step/What to do headings, rows onpage16. Both next pages lack repeated headers. The renderer measures and reserves each table row independently at330–335. Enlarged individual pages8/15 confirm the four-up observation. All text remains readable; the issue is pagination and association of headers with data, not missing substantive text.
Proposed replacement (not approved): Before placing a new table, reserve its measured header plus first data row together. Repeat headers on continuation pages when a table spans pages, preserving row integrity. Re-render the actual manual and inspect all pages to ensure no new stranded headings or near-empty pages.
Rechecked by codex-coordinator: Reopened actual frozen renderer source and inspected native pages independently: consent1/2 shows first signature rule separated from Casey name/date; manual8/9 and15/16 show stranded headers and headerless continuation. These are reproduced layout issues, not legal invalidity. Compared original ledger findings including230 and earlier heading/tail fixes; no same defect found. Corrected consent source line to372.

## B7-CLIENT-TEXT-AS-SLOT

Protect accepted client text during amendment and Statement assembly so bracketed phrases print literally; preserve genuine missing-slot rejection and typed amendment paragraphs.

Client portal amendment generation and office Statement of Authorized Representative generation for a company name containing an uppercase bracketed phrase — `webapp/server/oa-amendment.ts:141`
Reads: const leftover = (s.match(/\[[A-Z][A-Z ()/.']*\]/g) ?? []).filter((x) => !(am.mode === "typed" && x === "[AMENDMENT TEXT]"));
Claims: Any uppercase bracketed phrase remaining at this point is an unfilled template slot.
True: The company name is already inserted raw at oa-amendment.ts:98–99, and statement.ts:50 inserts it raw before its same-pattern guard at65–66. Actual orderFormSchema accepts the name [ALPHA] with a matching [ALPHA], LLC, PS A series and englishTextError returns null. Actual assembleOa succeeds for [ALPHA], LLC, but the actual amendment and statement assemblers independently throw unfilled slot(s): [ALPHA]. Amendment route1761 catches this as500 GENERATION_FAILED; issueStatement routes-admin427–434 passes the stored order name directly. These documents can fail for input the application accepts. This is pure-assembler/input-schema reproduction with statically verified route reachability, not observed production failure or a claim that this example name is available at Sunbiz.
Proposed replacement (not approved): Protect all client data before interpolation in the amendment and statement assemblers, validate only template markers, and enable corresponding renderer decoding so original client text prints literally. Preserve typed-amendment paragraph behavior. Verify company and signer values with bracketed phrases in both documents, and verify a genuinely unresolved template slot still fails. Do not ban otherwise accepted punctuation merely to avoid the guard.
Rechecked by codex-reader-5: Independently reopened both full assembler files, document-text.ts, validation schema ranges, source call sites, prior263 andN2.21, and executed actual orderFormSchema/englishTextError/assembleOa/assembleAmendment/assembleStatement. Source and reproduction agree; see evidence/b5-bracket-independent-probe.json.

## B5-CONSENT-SIGNATURE-PAGINATION

Keep measured signature line, wrapped printed name, title and optional date together; retain approved tight spacing and avoid blank signature pages.

Generated new-series consent, member signature block, pages1–2 — `webapp/server/pdf-render.ts:372`
Reads: need(lineH);
Claims: A member signature rule, printed name and date form a usable signature block on one page.
True: Actual assembleNewSeries/renderMarkdownPdf with retained ordinary two-member/two-manager inputs produces four pages. Casey Audit signature rule is at page1 bottom; Casey name and Date line start page2. Renderer recognizes signature line at356 but reserves only one line at373, so it can break before the name. new-series.ts87–101 emits rule/name/date separately. All pages were visually inspected and pages1/2 enlarged. This is a layout/usability defect, not a claim that an executed consent is legally invalid.
Proposed replacement (not approved): Reserve the full measured signature unit before drawing its first rule, including wrapped name and optional date and entity By/name/title variants. Break before the unit if it will not fit. Preserve owner-approved tight signature spacing. Verify this exact normal fixture plus long-name and entity blocks; do not add an unconditional blank signature page.
Rechecked by codex-coordinator: Reopened actual frozen renderer source and inspected native pages independently: consent1/2 shows first signature rule separated from Casey name/date; manual8/9 and15/16 show stranded headers and headerless continuation. These are reproduced layout issues, not legal invalidity. Compared original ledger findings including230 and earlier heading/tail fixes; no same defect found. Corrected consent source line to372.

## USER WALK — office using editable Word forms
1. Opens a regenerated operating agreement and its exhibits.
2. Reads and edits member, contribution and beneficiary entries inside table cells.
3. Reviews entity signature name/title lines without visible programming controls.
Expects: complete editable tables and intended signature indentation, with existing legal wording and draft choices retained.

## USER WALK — client reading the Manual and signing a series consent
1. Opens the generated Manual and reaches a table at a page boundary.
2. Reads headings with their data, including headings repeated on continuation pages.
3. Opens a new-series consent and signs a line whose name/title/date appear together.
Expects: complete readable tables and usable signature units without unnecessary blank pages.

## USER WALK — client or office generating documents with bracketed names
1. Uses company and signer text that the application accepts.
2. Generates an operating-agreement amendment or Statement of Authorized Representative.
3. Opens the PDF and reads the original text literally, while genuine missing template fields continue to cause an error.
Expects: accepted punctuation does not prevent generation or become document instructions.

## Verification and limits

Code-file edits are reviewed by complete diff. Regenerate through the existing staging/format gates; do not weaken them. Freeze this work order before edits. Keep identical baseline and repaired tests, failing for the intended defects rather than setup errors, and inspect complete rendered outputs with counts. Final mandatory review tests the local exact commit. This batch does not re-audit every statute or change any legal prose.
