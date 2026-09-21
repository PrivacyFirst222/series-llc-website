# Batch 21 verification evidence

The red logs run against the unchanged 4a344e2 baseline; green logs run the corrected code. These are offline test fixtures, not real customer actions or owner decisions.

- ruling-scope: the same 26-case harness; baseline misses nine cases, fixed harness passes all 26.
- inventory: baseline omits custom input/textarea and new widgets. Current harness also refuses missing/invalid policy and includes Python audit checks; all 16 pass. Historical manifest hash remains identical and the completed run still validates 279/279 files, 58,245/58,245 lines, 352/352 prior parts. The initial red harness had 13 cases; the three additional coverage/policy positive controls are not claimed as baseline reproductions.
- document-checks: same 12 tests; baseline misses five ordering/placement cases; corrected checker passes 12/12 including 8 masters. The two description-only repairs preserve executable ASTs. Existing ResourceWarning messages about unclosed reads are retained in logs.
- isolation: final harness passes 28/28; the same harness on the baseline has 21 intended defect failures and seven passing controls. Earlier 24/27-probe logs remain as intermediate evidence. The final malformed-owned-server probe records only the environment-summary GET and zero health initialization. Real command probes use disposable local sinks. A recorded attempted write is captured and the process stopped; no real external service is contacted. Complete red/green logs are retained.
- ledger-preservation.json: all 334 prior items, prior rulings and prior batch records unchanged; 31 new records imported, only 7 implemented and 24 still open.
- return-point-verification.txt: rollback bundle actually restored into a clean temporary checkout.

The final review package reruns mandatory checks from the committed tree. No package acceptance or publication decision is manufactured here.
