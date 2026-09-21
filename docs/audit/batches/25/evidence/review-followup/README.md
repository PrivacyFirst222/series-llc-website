# Exact-commit review caught a fresh-directory test failure

The first full package, commit1dc6c72 / package2e97a3a8f44c, is retained and NOT READY:11/12 required checks passed; walk failed in the new fault-injection harness after all744API,1303browser and the Word52/52 plus Manual14/14checks passed. The second temporary bundled fault module could not be imported. This is not represented as a successful review.

The coordinator independently reproduced this in default temporary-output mode. A minimal Bun1.3.14 probe creates a.mjs, imports it, creates b.mjs, confirms b exists, then fails to import b. Creating both files before either import passes. A directory-resolution cache is an inference; the actual file/import observations are demonstrated and retained.

The correction prepares both fault-injected modules before the first import. It changes only the test setup in the already-declared batch25-documents-check.ts. No assertion, product code, master, generated document or ledger record changes. All43check labels remain. Repeated fresh-directory checks and baseline red/green results are retained with the document report. Earlier persistent evidence output had masked this fresh-folder behavior; that gap is now specifically exercised.

The first failed package is immutable and is not overwritten. A new hooked local commit and complete review follow; this record does not claim that future review has passed. The existing rendered inspection remains applicable because no product or document artifact changed.

A broad git diff whitespace check also reported blank EOF lines/whitespace in raw logs and some PDF bytes. Those raw evidence artifacts were preserved unchanged; the source-only diff whitespace check passes. This was not a hook bypass.
