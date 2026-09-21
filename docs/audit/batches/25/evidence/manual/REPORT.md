# Batch 25: Owner's Manual table pagination

Implemented B5-MANUAL-TABLE-HEADER-PAGINATION in `webapp/server/manual-pdf.ts`; added the real-output regression runner `webapp/scripts/batch25-manual-check.ts`. No master text, ledger, owner record, external provider, publication destination or Git state was changed by this agent.

The approved requirement was: “Keep the headings with at least the first information row. Repeat column headings when a table continues onto another page.” Read the complete baseline renderer (414/414 lines) and Manual master (535/535 lines). This is a layout/content-preservation verification, not a fresh legal audit of the Manual's ruled wording.

## Changes

- Measure all table rows before drawing; reserve the initial header and first complete data row together.
- Repeat the header when an intact row moves to a continuation page.
- Split only a row too tall to fit under a header on a fresh page, advancing by a positive number of wrapped lines each time. Preserve each cell's content once; do not repeat data as if it were a new row.
- Refuse an impossibly tall header explicitly instead of clipping or looping.
- Include table line counts in the existing pagination-accounting result. Previously a page containing only a table reported zero lines even when visibly full.
- Increment renderer version from 2 to 3, ensuring the existing manual cache recognizes the layout change.

## Final identical red/green runner

Baseline renderer and its local dependencies were exported read-only from commit `2559e18`; the final runner was copied byte-for-byte into that fixture. `red-final.log`: **4/14 passed**, 10 intended failures. Current renderer, `green.log`: **14/14 passed**. All 14 labels are identical and occur in the same order. The positive controls pass on both versions. No outside service or database is needed.

Coverage:

- The actual Manual: 9/9 tables, 53/53 source data rows exactly once; initial headers and every continuation header checked.
- All 416/416 narrative blocks appear in source order after removing only running headers/footers from extraction.
- A 90-row table: every row and value once, original order, headings on all four body pages.
- An overheight 850-token cell: all tokens once and in order, four body pages, repeated headings; all 853 targeted words inside the body bounds. Its chapter heading remains with the first fragment.
- Explicit impossible-header refusal and a supported header-only table.
- Layout-version and table-line-accounting checks.

The first isolated fixture rerun omitted `englishText.ts`, causing a module-resolution error. `red-fixture-setup-error.log` and `red-fixture-initial-path-error.log` retain that setup failure; it is **not** counted as a reproduced defect. Adding the unchanged dependency made the identical final runner execute all 14 checks. Earlier `red.log` is the initial 12-check development run, superseded by `red-final.log`.

The initial actual-first-row assertion searched only the first cell, which could find an earlier mention such as Article 1 or a checkbox. Before editing the renderer, it was corrected to compare the complete first row; the final baseline accurately identifies the two stranded initial headers, tables 2 and 4. No broad claim rests on the initial assertion.

## Rendered inspection

Both actual Manuals have **37 pages** (cover, contents, 35 body pages). Rendered all 37 pages of both PDFs using Poppler. Inspected **37/37 final full-page PNGs**, plus baseline physical pages 8, 9, 15 and 16. The operating-agreement selection header now starts physical page 9 with its data; the Statement of Authority procedure header now starts physical page 16 with its data. Continued vocabulary, article-map and records-checklist tables carry their headings.

`visual-delta.json` records 25/37 pages pixel-identical to baseline and the 12 changed pages, including the updated contents. The actual Manual gained no page. No new clipped text, overlapping table cells or near-empty body page was observed. The inherited subheading “If you need different owners in different series” at the bottom of physical page 22 is pixel-identical to baseline; it was not introduced or changed by this table repair. A table's introductory prose can remain on the preceding page; the approved column-header/data requirement is enforced.

Also inspected all four body pages of the 90-row stress table, all four final body pages of the overheight-row fixture, and the header-only table body page. The renderer's reserved cover/contents pages in these synthetic fixtures are not meaningful deliverables. Initial overheight inspection exposed an avoidable heading-only page: the first oversized row was reserving a full page. Corrected the reserve to one fragment and added the regression; `intermediate-overheight/` retains the earlier PNGs, while `green/tall-final-*.png` are the final render. The actual Manual was unaffected by that refinement.

Scoped ESLint, app TypeScript and `git diff --check` passed; their logs are retained. Full system verification, commit and final review package are the parent agent's responsibility.

## Reproduce

From the current checkout's `webapp`:

```sh
BATCH25_MANUAL_EVIDENCE=../../evidence-manual/green bun run scripts/batch25-manual-check.ts
bunx --no-install eslint server/manual-pdf.ts scripts/batch25-manual-check.ts
bunx --no-install tsc --noEmit -p tsconfig.app.json
```

The baseline fixture is under `baseline/`; recreate its `webapp/node_modules` symlink to the already installed dependencies, then run the same command there with `BATCH25_MANUAL_EVIDENCE=../../red`. The dependency symlink was removed after the run so evidence copying cannot accidentally copy installed dependencies. Source and output hashes are retained in `sha256.json`.
