Since the edit gate isn't open, I'll stick to read-only commands and the project's check scripts for this review, and I'll clearly flag any reproductions I couldn't run.

I'll now gather the evidence file contents, rerun the guard/release gate on real commits, typecheck the control files, probe the ledger rules, check the hook's long-ruling behavior, and rerun the repair's regression suites fresh.

**NOT WRITTEN TO DISK:** your edit gate is closed (this message did not begin with "Go"), so the Write tool and every file-creating shell command were refused. I did the review with read-only commands, the repair's own check scripts (which write only to the OS temp folder and to disposable owner folders I named), and in-memory probes. Nothing in either repository, the handoff package, or your real `~/.fpsllc` was touched. The report is below in full; say "Go" if you want it saved under `claude-review/` as well.

# Review of corrective batch 0-repair, revision 1 (commit a68979d, package 0c9dc34aef72)

## READY FOR ADAM'S REVIEW

No material blocker. All ten defects are corrected in the code and reproduce as fixed. Two new material-but-non-blocking findings (N1, N2) and four optional items follow.

## 1. Verdict table

| # | Defect | Verdict |
|---|---|---|
| 1 | Externally accepted fix could lose its assertions while still "implemented" | **corrected** |
| 2 | Migration approval permitted values other than the file declared | **corrected** |
| 3 | A substring of a ruling authenticated a different rulings.md line | **corrected** |
| 4 | Chat hook truncated and reformatted long rulings | **corrected** |
| 5 | Permitted local request could redirect to a forbidden destination | **corrected** (HTTP routing only, as disclosed) |
| 6 | Empty or incomplete site packages passed validation | **corrected** |
| 7 | accept.ts ignored package-integrity errors other than PARTIAL | **corrected** |
| 8 | CI failed solely because it could not read local decision records | **corrected** |
| 9 | Full demonstration failed from a clean committed tree | **corrected** (M1–M9 ran at a68979d; not rerun by me, see §4) |
| 10 | Historical red demonstrations failed for unrelated reasons | **corrected** |

## 2. Evidence per verdict

All line numbers are in the repair clone at a68979d.

**1.** `docs/audit/ledger-lib.ts:427–437` refuses any change to a part's `fix` or `batch` unless the owning batch's own history shows an authenticated rejection (`rejected r<n>` event with the batch's id and revision, batch status reaching `rejected` by the transition table) or a release (fix.commit set to the batch's release commit); `:453–478` requires every non-open part's state to match its owning batch's state, its assertions and model to equal the retained work order `revisions/r<n>.json`, and each transition to carry its batch event. My in-memory probes (14 variants: erased fix + "reopened" event; assertions swapped or emptied; doneBy changed; fix.commit set early; part released or accepted while batch implemented; batch released with part left implemented; release with a different commit; release with assertions changed; reject event on the part only; batch rejected with part unchanged) — all REFUSED with the printed reasons; legitimate release and legitimate rejection PASS with external evidence skipped; the same legitimate rejection is REFUSED by the local gate when no rejection record exists. Fresh rerun of `repair-check.ts`: 35/35 at a68979d; `--against fffd656`: 14/35 with rows 1 failing as they should on the old code.

**2.** `ledger-lib.ts:314–350` builds the exact projection of the approved file (`migrationProjection`) and `:389–404` compares every item's structure (parts, scopes, waits, links, retired parts, related) to it, plus new parts' initial state and creation history. My variants: declared link on 95:eyebrow but item 96 also changed → REFUSED; declared split but a sibling scope edited → REFUSED; new part with an undeclared wait → REFUSED; new part pre-assigned to a nonexistent batch → REFUSED; retire without replacement → REFUSED; retired part of 65 dropped under an unrelated migration → REFUSED; hash mismatch → REFUSED; exact link and exact split → PASS; strict mode without owner record → REFUSED. Migration 001 itself unchanged; `guard.ts --against d0e3689..fffd656` and `..a68979d` both exit 0.

**3.** `release-check.ts:91–99`: prior content must be an unchanged prefix, and each added line must equal `rulingLine(record)` exactly (`ledger-lib.ts:783`: `- Ruling <item>[, part <key>]: <JSON text>`). `batch.ts:40–42` appends that same line. My checks: exact line MATCH; wrong item, added part, trailing text, trailing space → NO. A multiline ruling renders as one physical line with JSON escapes. Regression rows 3 pass fresh; old code fails them.

**4.** `.claude/hooks/accept-prompt.sh:49–51, 70–71, 76`: the text is base64-transported, only end-whitespace is stripped, no length cap; `accept.ts:55` no longer slices the rejection reason. I drove the real hook with a disposable `FPSLLC_HOME`: a 5,157-character ruling with blank lines, three consecutive spaces, a tab, `$`, `\`, quotes and a final "ONLY IF…" sentence was stored byte-identical; "Ruling 27, part retention: keep\nline two" stored with item, part and the newline; "Reject A, revision 2: …\nsecond line…" stored complete; "Reject A: 2" → batch A, no revision, reason "2"; no-colon, empty, unknown migration and acceptance-without-package messages recorded nothing (0 records added).

**5.** `webapp/scripts/browser-isolation.ts:40–50, 55–70, 73–105`: every routed request is forwarded once by native fetch with `redirect: "manual"`; any 3xx with Location is aborted before a second request; `continue`/`fallback` URL overrides are checked; `fulfill` with a 3xx Location is refused; `route.fetch` is unsupported; the walk's own API calls use `localFetch` (`behavioral.ts:20`). Shipped probe (18 observations, all ok) reran fresh inside my `repair-check` rerun. My additional probe against the repaired helper: meta-refresh to outside, `<img>`/`fetch()` to outside, 302 without Location, `localhost.` and `0.0.0.0` spellings — all blocked (sink saw nothing); `continue({url: local})` and `continue({headers})` still work; `localFetch(Request)` works; `localFetch(outside)` throws. Note: a legitimate local→local 302 is also refused (page shows nothing) — by design and stated in README/batch.md ("the current walkthrough needs none"); the 1,096-check walk passed under it. `2130706433` (decimal loopback) is treated as local — correct, not an escape.

**6/7.** `ledger-lib.ts:741–769`: `partial === null` required; nonempty manifest; path/hash validation; duplicate and `..` paths refused; `index.html` required; symlinks refused; exact file-set comparison. `accept.ts:46–47` refuses on any problem. Fresh rerun: all 20 acceptance/release rows pass; on fffd656, 16 of them fail as expected. The real package `0c9dc34aef72` returns `packageProblems: []`.

**8.** `ledger-lib.ts:516, 524`: with external evidence skipped, no refusal is emitted; `guard.ts` (unchanged) prints the limitation note in `--against` mode. Observed: `guard --against d0e3689..fffd656` → "guard: ok" with the note; a nonexistent baseline → REFUSED "not available"; local gate still refuses a rejection with no record (my probe and regression row "8: local rejection still requires owner evidence").

**9.** `demo.ts:525` commits only when `git diff --cached --quiet` fails; evidence dir follows `--batch`. Handoff demo.md: 98 of 98 with the Z row inside the total; M3–M9 lines name a68979d; `demo-M-review.log` shows the review checked out a68979d and passed all 12 checks; the final package is that run's (same id, runId `0-repair-r1-1789743771443`, createdAt 15:12:10, acceptance record at 15:12 after it).

**10.** `demo.ts:473, 480, 483, 487, 494`: `resetRemote(A, …)` before each measured H push. `repair-check.ts:343–390`: each historical push starts from a reset baseline and is counted a real update only when the remote was at the baseline and the output is not "Everything up-to-date"; the r2 adapter executes r2's actual inline `newPage` wrapper from `behavioral.ts` source (printed in the record) with raw `page.route`; legacy package directory naming used when `resolvePackage` is absent. My rerun `--historical-only --against d0e3689`: 3/11 (valid push, direct request, harness completion pass; partial/added/changed/regenerated pushes wrongly allowed; context/popup/API-handler requests reach the sink) — matching the claim and the saved `red-r2-causal.json` (before = d0e3689, pushing = a14230a, outputs "release gate: ok").

## 3. New findings

**N1 (material, not blocking): the new mandatory check depends on today's ledger state.** `repair-check.ts:120–124` authorizes a fixture batch on real item 17 (`amend-title`), and cases 2–3 use items 95 and 28. Item 17 is open and unlinked today; the moment it is assigned to a real batch, `batch.ts authorize repair-probe` refuses ("cannot be claimed twice"), the harness records "harness setup/runtime … FAIL", and because `ledger-controls` is now in `MANDATORY_CHECKS` (`ledger-lib.ts:161`) and in `check.yml:85`, every review is NOT READY and CI is red until the harness itself is changed — a control change needing its own batch. Consequence: a false refusal of legitimate future work. Correction: build the fixture from a part chosen at run time (first open part with no waits, no link, no batch) or inject a synthetic item into the disposable clone's baseline commit before `baseline` is taken; same for the item-95 migration probe.

**N2 (material, not blocking): a released fix can never change again.** The new rule at `ledger-lib.ts:434–437` fires before the older supersedes path (`:440–443`), so a released part's assertions cannot be amended even under a ruling that names what it supersedes, and a released part cannot be re-claimed by a later batch (`batch.ts:65` requires open). Codex's correction asked to freeze assertions "during the real interval between external acceptance and release bookkeeping", not permanently; the approved design kept supersession under a ruling. My probe: released fix + supersedes ruling + changed assertions → REFUSED. Consequence: the first time a released sentence must be corrected again, no authenticated path exists. Correction (narrow): in the non-strict path, permit assertion changes on a released part only when a new `supersedes` ruling for that item/part has Adam's ruling record (`hasRulingRecord`), and let `batch.ts authorize` claim a released part under such a ruling; keep strict mode refusing.

Optional cleanup, not material:
- `audit-review.ts:82`: a permanent `codex/` branch exception (with `FPSLLC_BATCH`) was added to accommodate the repair's branch name; remove after integration or replace with an explicit `--branch-ok` flag.
- README discloses WebSocket as outside the controls but not Playwright's `page.request`/`context.request` (Node-side requests, not browser requests). My probe could not reach the sink through them (Node DNS, not the guard), so this is a disclosure gap, not a demonstrated escape.
- The committed `batches/0-repair/evidence/demo.md` is the preliminary 76-row run; the 98-row run exists only in the handoff. A records-only commit could carry it into the repository.
- `historicalPackages` counts "browser harness completed" as PASS on r2 although the probe exits 1; it is labeled as harness completion, so no misstatement, but the row inflates "3/11".

## 4. Claims not verified

- **Full 98-row demonstration from a clean clone — not verified by rerun.** Creating a disposable clone is blocked by the edit gate; `demo.ts` also writes into its repository's evidence folder. Verified instead: the code path (`demo.ts:525`), the handoff report's M rows naming a68979d, and the package those rows produced.
- **"Independent read-only browser reviewer" and "independent ledger reviewer" (batch.md:67–70) — not verified**; no artifacts identify them.
- **CI on GitHub — not verified**; nothing was pushed. The workflow step order was read (`check.yml:63, 85, 88, 99`).
- **The package's `ledger-controls` timing (7 s)** is odd but the retained log holds all 35 rows at a68979d; my fresh rerun produced the same 35/35.

## 5. Preservation and package integrity

- Original checkout: HEAD fffd656, working tree clean. `~/.fpsllc/acceptances.jsonl` SHA-256 `5bcad190…` equals the checkpoint copy. Repair clone: clean at a68979d, no remote.
- Ledger fffd656 → a68979d: all 334 items byte-identical; the one ruling identical; the three prior batch records identical; one batch record added (0-repair r1, authorized then implemented). `frozenFileProblems`: none; `linkProblems`: none; `revisions/r1.json` and `batch.json` both hash to the recorded `d93c768c…`.
- No product path changed (diff filtered to webapp/src, server, api, index.html, docs/word, docs/source, agreements, manual: empty).
- Package `0c9dc34aef72`: `partial: null`; `packageProblems: []`; diffSha equals the live `git diff 82abf54..a68979d`; 12/12 Word documents match the commit's bytes; 9/9 site files match a recomputed manifest; 664 server and 1,096 walk result lines all `ok: true` with the package's commit and run id; 12 required checks, all exit 0, none skipped; retained logs present in `checks/` (the recorded temp paths are gone, as disclosed; `dropbox-unchanged` evidence is the package's `dropbox-after.json`); no acceptance in the isolated home. The `assertions` check replayed 0 recorded fixes (none accepted yet); the separate 3-assertion smoke log shows 3 replayed, 0 failed — supplementary, not coverage.
- Typecheck of the control files with explicit flags: no diagnostics. `guard.ts`, `.githooks/`, `ledger-print.ts`, `publish-docs.ts`, `ledger-build.ts`, `audit-assert.ts`, `isolated-stack.ts`, `eslint.config.js`: unchanged by the repair.

## 6. Smallest remaining work

Nothing blocks your review. If you accept: fix N1 (fixture independence) and decide N2 (supersession path) in the next control batch; bring a68979d into the original repository (the bundle or a fetch from the clone) and the package into `~/.fpsllc/reviews` before an acceptance can name it; and decide batch 0 revision 3's fate yourself — it stays "implemented", and under the new mandatory list its old package can no longer release it ("Reject 0, revision 3: superseded by 0-repair" would close it; that is your decision, not inferred here).

Passing this review is not acceptance and authorizes no integration or publication.