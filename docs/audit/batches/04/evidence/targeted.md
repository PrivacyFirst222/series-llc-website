# Targeted verification before full review

All 12 server assertions and all 24 browser assertions passed in disposable offline environments (see complete logs). The 19 named defect assertions cover 18 approved review units; 115/161 are linked sightings. Screenshots inspected: client sign-in network failure, failed document/legal-mail load, and the named agreement deletion confirmation. The browser deletion test initially failed on a transient duplicate text match during dialog exit; it now waits for the dialog to finish closing before reading the persistent missing-document notice. No product logic was changed for that test correction.

The existing conversion-page assertion keeps its original label and company-type distinction, and now compares the message with the real status response rather than requiring the obsolete preparation sentence. No check was removed.

Password cancellation tests include ordinary change, reset, an in-flight confirmation paused before its write, wrong-password refusal, another client's unchanged pending request, and a new authorized email change after recovery.

Full before-fix reproductions and the complete mandatory checks are produced by the exact-commit review command after this commit. Targeted results alone do not constitute acceptance or publication.
