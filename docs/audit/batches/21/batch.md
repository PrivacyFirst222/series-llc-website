# Batch 21 — audit repair group 1, revision 1

Authorization: Adam: **“Go. Approve all”** after the seven-item control group. This authorizes these repairs, not publication.

## Governing evidence and approved scope

### B1-N05
Respect exact part and canonical-target scope of owner rulings; unrelated sibling and cross-item waits stay blocked.

Fix ledger, authorizing work after an owner decision limited to one part of an item. — `docs/audit/ledger-lib.ts:664`
Reads: return all.filter((w) => (w.startsWith("ruling:") ? !l.rulings.some((r) => rulingKind(r) === "ruling" && r.item === w.slice(7)) : !(l.items.find((i) => i.id === w)?.parts.every((p) => p.status === "released") ?? false)));
Claims: Any ruling whose item number matches satisfies the wait, even when Adam expressly limited that ruling to a different part.
True: accept.ts supports --part and batch.ts:38–40 copies a ruling with its part intact, but unmetWaits:664 never reads r.part. batch.ts:77 uses unmetWaits to allow authorization. A pure in-memory fixture with independent partsa/b both awaiting ruling:example clears both waits after recording “Only part a approved” with part:a. This is a synthetic resolver reproduction, not evidence of an actual unapproved release.
Proposed replacement (not approved): Resolve a ruling against the specific waiting item and part, including canonical target scope. An item-wide ruling may satisfy its covered parts; a part-scoped ruling must satisfy only that part and its exact linked sightings. Preserve unrelated waits in authorization and the rulings queue.
Rechecked by codex-reader-5: Read ledger-lib canonical resolver/mainOf627–648 and unmetWaits657–664 plus batch ruling copy/authorize path. Independent probe adds canonical sightings of both parts: part-a-only decision clears unrelated main-b and alias-b waits as well; item-wide ruling properly clears all. This is a wait-resolution scope defect, not proof of actual unauthorized acceptance/release. Rule strings currently name item only, so repair must define explicit scope for cross-item dependencies instead of assuming identically named parts cover them. Real ledger currently has no demonstrated effected unrelated part; source/probe establish latent flaw.

### B2-04
Include customized UI widgets in future inventories; preserve historical manifest bytes. Exclude only verified unchanged stock, otherwise include.

Audit inventory, deciding which live product controls must be read — docs/audit/audit-session.ts:35 — `docs/audit/audit-session.ts:35`
Reads:   const exclusions=[[/^webapp\/src\/components\/ui\//,"stock UI widgets"],[/\.test\.tsx?$/,"test file"],[/^webapp\/server\/e2e\.ts$/,"check suite"],[/^docs\/(coverage-605|event-map|event-map-text-review|oa-map|dependency-audit|db-restore)\.md$/,"gate output or operations note"]] as const;
Claims: Everything under the ui directory is stock and can be excluded from the whole-product audit.
True: input.tsx:3–13,31–38 and textarea.tsx:3–13,30–36 contain custom English-business-text checks, setCustomValidity and reader-visible warnings added for Batch18. Both were independently read whole as supporting files (45 and42 lines), but neither enters the manifest because of this unconditional exclusion. inventory.ts:28 repeats it. The coverage gate can pass without assigning these live business validation controls.
Proposed replacement (not approved): Include customized UI components, at minimum webapp/src/components/ui/input.tsx and webapp/src/components/ui/textarea.tsx, in both audit inventories. Exclude only verified unchanged stock widgets; changes that add product wording or behavior must enter the next frozen manifest.
Rechecked by codex-reader-5: Read both customized UI input/textarea files and audit-session inventory35 plus supplement42–45; ui exclusion is unconditional and supplement does not add these files. inventory28 repeats exclusion. Their business English checks, validity messages and alerts are plainly product behavior. Proposed inclusion correct; existing generated manifest must remain immutable and report additional read coverage separately.

### B2-05
Use an owned live child with an isolated database and verified offline proof before the browser walk can mutate.

Behavioral review, starting the supposedly isolated test backend — webapp/scripts/behavioral.ts:780 — `webapp/scripts/behavioral.ts:780`
Reads:       if (r.status === 200) break;
Claims: HTTP200 proves the endpoint is this run’s fresh offline backend.
True: API_PORT is selected from500 local ports at44. After spawning the offline child at769–776, the health loop accepts any status200 without inspecting the offline signal or checking whether that child exited. A pre-existing server on the chosen port can answer while the new child fails to bind; subsequent requests are then sent to the pre-existing server. The health contract and collision reproduction require independent root verification before treating this as a tested exploit. No live server was contacted by this reader.
Proposed replacement (not approved): Require the spawned child to remain running and the health response to affirm offline mode and the expected isolated run/database identity before any mutation. Refuse startup on a port collision or an unverified health response.
Rechecked by codex-reader-5: Read behavioral44/769–785 and real health route routes-payments260–269. Random chosen port can collide; poll accepts any200. Health only returns ordering/database/ok and exposes neither offline mode nor runidentity. Root must retain that distinction: the proposed identity signal does not exist yet and requires adding one. No actual collision/network effects reproduced by this reviewer; static race credible and remedy correct.

### B5-E2E-ISOLATION-FAILOPEN
Refuse unavailable, unsuccessful, incomplete, malformed or live isolation proof before default API tests mutate; preserve explicit integration override.

E2E external-service isolation preflight — `webapp/server/e2e.ts:180`
Reads: const externals = (summary?.data?.externals ?? {}) as Record<string, boolean>;
Claims: Unknown or failed environment summary stops a test run before external integrations can be touched.
True: JSON/network errors become null and missing externals becomes {}; active is empty and execution continues. Pure extracted-guard probe confirms null/data={} summaries CONTINUED while a live flag REFUSED. Subsequent checks accumulate failures rather than stopping before mutations. Does not establish an actual external write during this audit. Full prior ledger searched for env-summary/isolation; no same mechanism found.
Proposed replacement (not approved): Require successful response and a complete recognized externals schema before proceeding in default mode; abort on unavailable/malformed summary. Keep explicitly authorized integration-test override separate. Add refusal cases for missing/failed/malformed summary.
Rechecked by codex-root-independent: Root independently reopened e2e.ts170–215 and extracted-guard evidence. Null/missing schema gives empty active list and proceeds to state mutations. Later check() failures do not stop preflight. Independent from behavioral random-port collision; preserve separate explicitly authorized integration mode.

### B3-04
Correct checker description to pooled section existence and mandatory manual form-specific review; no new resolver.

Document consistency checker, explanation of what its reference check verifies. — `docs/docs-consistency.py:18`
Reads: ("§4.6 in the single-member form"). Where a reference names a form, that form is
checked specifically.
Claims: The checker selects the named agreement form when guidance names a form.
True: docs/docs-consistency.py:108–113 deliberately resolves against every master and accepts any match; the whole file has no form-specific selector. This establishes an inaccurate check-coverage claim, not a current bad document reference.
Proposed replacement (not approved): Form-specific references are not resolved against the named form by this script. It accepts a section found in any master; a reviewer must check that it exists in the particular form named by the guidance.
Rechecked by codex-reader-5: Read docs-consistency docstring and reference loop99–118. It always builds pool=list(by_form), with no text-to-specific-form resolver, contrary to stated claim. Documentation replacement accurately limits the checker; no bad reference is inferred.

### B6-02
Reject reordered articles/sections and sections under the wrong article while preserving valid suffix formats.

Agreement structural audit gate, article and section sequence — `docs/structure.py:112`
Reads:     by_article = defaultdict(set)
    for s in sections:
        by_article[major(s)].add(minor(s))
Claims: The gate verifies that articles and sections run from1 throughN in order, as its docstring promises.
True: The implementation groups minor section numbers into sets and article numbers into a sorted set, so it proves existence/uniqueness, not document order or ownership under the current heading. An offline probe swapped complete7.1 and7.2 provisions in the multi-member source, keeping contents and cross-references intact; check() returned[] just as for the unchanged baseline. The promised out-of-order defect is missed.
Proposed replacement (not approved): Inspect article headings and numbered provisions in original source order. Enforce consecutive article/section sequence and require every provision to belong to the immediately governing article, preserving explicitly supported letter suffixes. Add a mutation probe swapping complete adjacent sections and another swapping article blocks, and require the gate to reject them.
Rechecked by codex-reader-5: structure.py:103 sorts article set;112–121 groups section minors by set and asks only whether article number occurs anywhere. Source order and governing heading are not enforced. Independently loaded actual check and swapped complete7.1/7.2 in a separate copy; baseline[] and swapped[] both passed, mutationChanged true (evidence/b5-review-b46-probes.json). Searched all prior finding texts for structure.py/order gate and found no duplicate.

### B6-03
Correct event-map description to actual failing exit behavior; preserve enforcement.

Event-map audit command documentation — `docs/event-map.py:22`
Reads: Then two reports, which do not fail:

  gaps          every `none` cell and every note marked GAP, listed in full
  unreached     every numbered provision in each form that no event names,
                as a raw count over the total. A provision no event reaches is
                either boilerplate or something nobody needs; the map cannot
                tell which, and neither can a count that has been filtered.
Claims: The unreached-provision report does not cause failure.
True: main at181-186 emits orphaned provisions and immediately returns1 whenever any exists. The current command therefore fails on unreached substantive provisions, contrary to the file-level usage description. This is documentation drift, not an argument to weaken the gate.
Proposed replacement (not approved): Update the docstring to say unreached provisions outside the documented definition exclusions fail the gate and must be mapped or removed; describe any raw coverage/gaps output separately as informational. Preserve current enforcement.
Rechecked by codex-reader-5: event-map.py:22–28 states the two reports do not fail, while main181–186 returns1 for any orphaned provision. Independent call to actual main with controlled check result returned1. Usage-doc drift only; preserve stronger enforcement. No duplicate event-map.py finding in all prior finding texts.

## Instructions carried forward
1. Seven approved findings only; other findings remain open and unassigned.
2. Isolated checkout and verified rollback bundle at 4a344e2.
3. Preserve all 334 prior records and retained audit evidence.
4. Import all 31 verified findings through the checked intake, which grants no repair approval.
5. Demonstrate failure before correction and run regression checks afterwards.
6. Do not publish, integrate, accept a package, or merge missing earlier batches.
7. No legal/document/product text changes.
8. Preserve existing checks and explicit integration-test controls.

## USER WALK — Adam reviewing these repairs:
1. Opens this batch and sees the seven approved findings and original evidence.
2. Opens the retained red/green logs and the complete committed diff.
3. Reviews a package for that exact commit; other findings remain open.
Expects: only his approved seven are implemented and nothing is published.

## USER WALK — the next auditor running the controls:
1. Starts a new audit and receives an inventory that includes customized inputs.
2. Runs tests; an unknown or live server is refused before mutation.
3. Applies a part ruling or checks agreement structure and gets a correct scoped result.
Expects: sibling waits remain blocked, reversed sections fail, and checker descriptions state their limitations.

## Verification objective ledger
- Part scope: own part, sibling, canonical sightings, unrelated cross-item waits and current ledger.
- Inventory: input/textarea included; changed/new widgets included; historical manifest unchanged.
- Runtime isolation: complete proof, occupied port, child exit, malformed/unavailable/live proof; no mutations on refusal.
- Structure: eight masters, section/article reversal, wrong article, valid suffix sequence.
- Comments: describe actual commands without behavioral expansion.
- Tracking: 334 prior items identical; 31 imported; exactly seven assigned/implemented.

Publication remains deferred.

## Implementation and focused verification

All seven approved controls are implemented. The API suite's secondary fresh-database/restart server now uses the same ownership-first proof as the browser/review server. This closes another entry path of the approved isolation repair; it preserves the same-database restart and rate-limit assertions. Ownership and complete offline proof are checked before health requests because health initializes the database.

Focused results: 26/26 ruling tests, 16/16 inventory tests, 12/12 document tests (all eight masters), and 28/28 isolation probes. All baseline failures and positive controls are retained under evidence/. Two documentation-only changes retain identical executable ASTs. The existing audit mechanism passes 69/69 cases; the completed audit still validates its original coverage.

The future inventory includes all 18 UI widget files (1,056 lines), because no current widget exclusion has independent evidence that it is unchanged stock. Existing historical audit files are unchanged. No client-facing source, agreement, generated Word document, price, email or live server route was edited.

The 31 verified new findings were imported through audit-import.ts. Exactly seven are implemented and 24 remain open. All 334 prior items, their rulings and prior batch records are unchanged. The previously identified unincorporated batches remain outside this repair; publication is deferred.

Rollback: the bundle ../return-point-4a344e2.bundle restores the complete baseline history. A clean temporary restore was tested. This repair clone has no origin remote; it cannot accidentally publish using an inherited production remote.

Final package checks run after the normal guarded commit. No acceptance is recorded by this batch.
