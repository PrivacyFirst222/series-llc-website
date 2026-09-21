# Batch 25 legal document generation and signature layout

Implemented only B7-CLIENT-TEXT-AS-SLOT and B5-CONSENT-SIGNATURE-PAGINATION in the assigned files. No legal master text changed. No publication, provider calls, installation, commit or ledger mutation by this agent.

## Sources read before authoring

Read whole: baseline oa-amendment.ts150/150, statement.ts69/69, document-text.ts29/29, pdf-render.ts681/681, new-series.ts131/131; amendment master74/74, Statement master40/40, consent master67/67. Total1,241/1,241 lines. Read the existing amendment and Statement unit suites whole; inspected the two production route call sites and shared encoding/signer helper definitions. Root and webapp instructions and PDF skill read. This is a rendering/data-handling repair, not a new legal audit.

Governing owner-approved text: “Make the generators distinguish client-entered text from actual drafting blanks.” “Keep each complete signature block together.” Existing renderer decision: “a line of underscores is a signature line, and the name beneath it and the \"Date:\" line beneath that sit tight, with no paragraph gap between them; the gap goes before the signature line instead”.

## Implementation

Both assemblers encode every supplied client string before interpolation using the shared documentInputs mechanism. They retain real master-slot validation, return encodedClientText:true, and decode display titles. Both actual route call sites forward that flag. Required raw whitespace validation runs before encoding. Typed amendment text keeps each entered paragraph while rendering Markdown-looking text literally.

The renderer keeps sourceText alongside decoded display segments, so literal client [[pagebreak]], [[indent]], and other control-like words cannot become renderer commands. Underscores are protected by the shared encoder to distinguish typed underscores from signature rules.

The renderer measures complete person or entity signature units, including wrapped printed names, titles and date lines, before drawing. It preserves 11pt body text,14.2pt line spacing,10pt pre-rule gap,6pt after-unit gap and252pt rules. Long unbroken names wrap by glyph. A unit taller than the printable page is explicitly refused before drawing, avoiding loops and clipped output.

## Reproductions and checks

Identical final43-check harness: baseline2559e18 **19/43**, repaired **43/43**. Final baseline contains24 intended failures and no setup errors. Positive controls pass before and after. Eight failed dependent bracket-output assertions in the baseline report their actual assembler refusal; those are not eight distinct defects.

- Real amendment and Statement generated PDFs preserve bracketed company, entity, manager and signer names.
- Seven marker fixtures preserve exact slot-looking words, [[indent]], [[pagebreak]], Form document, literal numeric-entity spelling and By/underscore text; typed headings and bars remain literal.
- Raw space/newline/tab required values remain rejected.
- Fault-injected real masters containing UNFILLED SLOT are refused. Fault injection uses Bun.build's in-memory text loader and external bundled modules only; it never changes a real master file.
- Exact ordinary Casey/Blair consent fixture from the frozen audit is reproduced. Its split signature is corrected and total pages drop4→3; no unconditional signature page added.
- Long person/entity signatures and near-boundary names/titles/dates fit;250-character unbroken name wraps; oversized unit refuses.
- Existing amendment **39/39**, Statement **10/10**, shared PDF renderer **150/150** (including16 agreement variants) pass. App TypeScript and scoped ESLint pass.
- Parent separately exercised actual offline routes and retained its evidence; this report's own call-site checks are static in addition to actual assembler→renderer PDF tests.

## Rendered inspection

Final 24 PDFs contain **44/44 pages rendered and individually visually inspected at readable full-page size**. After this agent’s 11-sheet overview and enlarged ordinary-consent page 1, batch25_manual individually inspected the first 22 page PNGs in lexical order (amendment-attached-1 through literal-amendment-_SIGNER_NAME_-1), and parent /root individually inspected the last 22 (literal-amendment-_SIGNER_NAME_-2 through statement-brackets-1). These full-page checks supersede the contact-sheet-only coverage. Manual reviewer used 1100px full-page views; parent used the original PNG paths at readable full-page size. No claim of per-pixel native-resolution inspection is made. The exact file hashes and reviewer assignments are in visual-review.json; the first reviewer’s own record is visual-review-first22.md/json. All affected signature blocks and literal text are readable, within visible-ink margins, and stay with their date/printed information. Long-name stress consent legitimately puts the second complete block on the next page. The entity-consent MEMBERS heading remains at the end of page 1, with its complete entity signature on page 2; no signature unit is split. Intentional master page breaks and blank-space notices are preserved.

An unchanged ordinary fixture supplies a purpose ending with a period, and the master adds another period; this existing fixture punctuation is outside these approved findings. No claim that this rendering review re-audited every legal sentence.

## Evidence / setup limitations

Final evidence: red-final.log, green-final.log, red-final and green-final PDFs/Markdown/geometry JSON, unit and lint/typecheck logs, source-hashes.json, visual-review.json. Baseline extracted from2559e18 into the disposable baseline folder, with the identical final harness copied in; it uses the existing node_modules via symlink.

Early harness mistakes were corrected before final reproduction: one bracket syntax error, a Python helper named inspect.py that shadowed Python's standard library, and a margin check initially counted an unchanged trailing whitespace glyph. Retained early logs are labeled setup/intermediate, not evidence of product defects. Final geometry checks count visible ink. The former exact4-page assertion was corrected to disallow added blank pages while allowing the fixed ordinary consent to use3.

The PDF skill artifact-operation marker ran successfully before first PDF generation. All generated files are isolated review evidence; no Dropbox or production package was modified.

## Full-review harness follow-up

The exact-commit review at 1dc6c72 exposed a fresh-temp-directory module-resolution failure in this check script, after the amendment fault probe. Only the harness was corrected to write both fault bundles before either dynamic import. Three fresh default-mode runs and one explicit-evidence run now pass43/43; the identical updated baseline harness still reports19/43 with the same labels and verdicts. All24 PDF readback/geometry records and all product-source hashes are unchanged. See temp-import-repair/REPORT.md, verification.json and source-hashes-followup.json; the failed run and earlier evidence remain retained.
