# Default temporary-directory harness repair

The full exact-commit review at 1dc6c72 failed in the document check after the amendment fault probe, before importing statement-fault.mjs. This was a harness failure; the earlier persistent-output run had not exercised that fresh-directory behavior. default-before-1.log retains the local reproduction. Parent retains the failed review package.

Bun 1.3.14 minimal probe independently reproduced the same resolution failure without PDF generation, build plugins or templates: write/import one.mjs, write two.mjs, verify two.mjs exists, import two.mjs fails. Preparing both files before either import passed in three fresh Bun processes. Evidence supports a directory-resolution/cache interaction; runtime internals were not inspected, so a specific cache implementation is not asserted.

Only webapp/scripts/batch25-documents-check.ts changed: materialize both genuine fault bundles before the first import, then run the unchanged guard assertions. No product code, assertion condition, label, expected result or real template changed.

Verification:
- Three separate default-mode processes, each creating its own fresh temporary directory: 43/43 each.
- Explicit evidence-output mode: 43/43.
- Identical revised harness against disposable 2559e18 baseline: 19/43, the same 24 intended failures.
- All 43 labels and verdicts match the prior green and red evidence respectively.
- All 24 generated PDF text/geometry readbacks match prior green evidence exactly; product-source hashes remain unchanged. The completed rendered visual inspection remains applicable.
- Scoped ESLint passed.

Files: minimal-before.log, minimal-prewritten.log, default-before-1.log, default-after-1/2/3.log, explicit-after.log, default-baseline-after.log, lint-after.log, verification.json. Existing evidence was retained. One baseline invocation had an incorrect log redirection path and failed before executing; corrected invocation is the reported baseline run.
