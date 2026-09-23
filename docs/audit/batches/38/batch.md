# Batch 38 — approved Group B verification repairs

Adam approved all ten Group B proposals (items 15–24). This authorizes implementation and verification, not acceptance or publication. Product wording and business rules stay unchanged.

## 15. Word regression checks: detect words glued to drafting labels

The test can pass the exact spacing defect it was intended to prevent because it deletes whitespace before comparing text.

Approved correction: Compare paragraph-aware text with whitespace collapsed, not erased, and add boundary assertions for drafting labels. Evaluate Claude’s supplied checker rather than adopting it unchecked. Preserve both existing content checks and all legal alternatives.

Prior decision: Batch 32 approved separation of alternatives; this strengthens proof of that existing requirement.

Verification: Deliberately reintroduce the glued-label defect and require failure for that reason; the unchanged correct masters must pass.

Source docs/batch32-word-check.py:11
>  return ''.join(t.text or '' for r in root.iter(W+'r') if r.find(W+'rPr/'+W+'rStyle') is None or r.find(W+'rPr/'+W+'rStyle').get(W+'val')!=LABEL_STYLE for t in r.iter(W+'t'))

## 16. Document provenance test: use the contribution wording clients receive

The test fixture still uses the retired equally wording rather than the current fractions and joint-owner wording.

Approved correction: Generate representative contributed-by cells through the real capital formatter, with tightly scoped normalization for those cells. Avoid a broad expression that could hide unrelated text changes.

Prior decision: Batch 32 already approved exact fractions and explicitly identified joint ownership.

Verification: Cover single, separate equal owners, unequal percentages and spouses holding jointly. Mutate a real contribution cell and verify the check rejects it.

Source webapp/server/provenance.ts:106
>       { description: S.asset1, value: "$1,000", by: single ? S.m1 : `${S.m1} and ${S.m2}, equally`, to: S.ser1 },

## 17. Browser checks: test a fresh site build

Running the browser script directly can use an old dist folder while testing a current server.

Approved correction: Build the site before the standalone walk. Any reuse optimization must validate a complete build identity, not file modification times. Preserve the review runner’s exact build under test.

Prior decision: Tests must describe the candidate being reviewed; this introduces no customer behavior.

Verification: Change a source behavior while leaving dist stale and show the standalone walk tests the new build and catches the intended failure.

Source webapp/scripts/behavioral.ts:781
>   if (!existsSync("dist/index.html")) await buildSite(process.cwd(), resolve("dist"), false);

## 18. Restore tests: prove incomplete deletion records stop a restore

The restore refuses an independent deletion journal missing a decision in the backup, but Claude found that removing this refusal did not fail the old test.

Approved correction: Add a case where the journal exists but omits one recorded deletion; assert refusal before restored files or database rows are written. The current Batch 28 and 35 sources were checked: the latter tests the newly backed-up workflow tables, not this incomplete-journal case.

Prior decision: Preserves Adam’s rule that restoring a backup must not bring deleted documents back.

Verification: Show the correct code refuses the incomplete journal and a mutation removing the guard makes the new assertion fail.

Source webapp/server/restore.ts:17
>  for(const key of [...(dump.deletionCheckpoint||[]),...dump.tables.document_deletions.map(d=>String(d.storage_key))])if(!deleted.has(key))throw new Error('Independent deletion journal is missing a recorded decision');

## 19. Repair tests: fail if a required current module is missing

A failed import can silently switch a current-candidate check to a weaker old-code branch.

Approved correction: Permit baseline compatibility only through an explicit baseline mode, bound to the intended baseline. Normal candidate runs must fail on missing modules or exports.

Prior decision: Old-code reproduction remains supported, but cannot silently reduce current checks.

Verification: Remove or break the module in a disposable copy: normal verification must fail. Explicit old-baseline probes remain correctly labeled.

Source webapp/server/batch28-check.ts:90
>  const baseRows=await query('SELECT id FROM documents');let storageModule:typeof import('./s-election-package-storage')|null=null;try{storageModule=await import('./s-election-package-storage');}catch{/* Baseline predates the new atomic helper. */}

## 20. Portal renewal test: distinguish appointment date from formation date

The fixture uses coincident dates, and the assertion checks only next year. The wrong anniversary rule could still pass.

Approved correction: Use distinct recorded appointment and formation dates and assert the exact displayed renewal date, including a separate leap-day case.

Prior decision: Adam already directed that the service year starts when the agent appointment takes effect. No policy decision is reopened.

Verification: A mutation using formation date must fail the portal assertion, while the appointment-date result passes.

Source webapp/scripts/behavioral.ts:1016
>         expect(new RegExp(`renews on [A-Z][a-z]+ \\d{1,2}, ${nextYear}`).test(dash) && !/renews annually/.test(dash), "renewal: the portal's agent card names the renewal date a year from the recorded appointment", dash.match(/registered agent service is active[^.]*\./)?.[0]);

## 21. Before-and-after evidence: retain the test source as well as its output

An early fixture correction was described but its original text was not retained, so the historical edit cannot now be independently reconstructed from that record.

Approved correction: For future red/green evidence, retain and hash the exact check source and any changes to it. Keep the historical limitation explicitly stated; do not invent or relabel a missing old file.

Prior decision: This repairs future evidence handling, not the historical record.

Verification: A demonstration retains both check versions and logs; a missing or mismatched check-source hash is rejected.

Source webapp/scripts/batch34-check.ts:24
>   check(!!close&&close.includes('Transfer on Death designations')&&close.includes('Designating Member')&&close.includes(input.members.at(-1)!.name),`Exhibit A closing section stays together: ${key}`,close);

## 22. Before-and-after logs: identify the code actually tested

The retained exploratory pagination logs say local instead of identifying their source commit and run.

Approved correction: Reproduce the targeted comparison with explicit baseline/candidate identities, distinct run IDs and check-source hashes. Preserve the original logs as historical artifacts.

Prior decision: The normal packaged run already uses identities; this closes the separate reproduction evidence gap.

Verification: Validate source identities for both runs and retain the intended six baseline failures rather than counting setup errors.

Source webapp/scripts/batch34-check.ts:13
> const check=(ok:boolean,label:string,detail?:unknown)=>{total++;if(!ok)failed++;console.log('CHECK_RESULT '+JSON.stringify({suite:'batch34',label,ok,commit:process.env.CHECK_COMMIT??'local',run:process.env.CHECK_RUN_ID??'local',...(!ok?{detail}:{})}));};

## 23. Document checks: state and close the two formatting coverage gaps

The Amendment and Statement forms have pagination checks but no original-source typography baseline.

Approved correction: Confirm which originals exist; document any absence. Add explicit typography/layout checks for these authored forms and submit representative renders with the package. Do not silently treat the current output as an independent original baseline.

Prior decision: This is a verification design choice, not a new legal drafting choice. Any new visual baseline will be labeled as an approved product baseline.

Verification: Change font, body size or spacing in a disposable generated form and require a failure; retain page images for review.

Source docs/format-check.py:191
>             # No baseline is not a reason to check nothing. Stranding and a

## 24. Internal test label: use the already-approved inactive-name wording

One test label still says recently dissolved and cites the old section; customer-facing wording has already been corrected.

Approved correction: Change the label to describe the conservative recently-inactive name hold, without making a broader statutory claim. Keep the predicate.

Prior decision: Batches 29/33 already approved the conservative hold and accurate labels.

Verification: Review the small diff and run the existing assertion; no new behavior test is needed.

Source webapp/server/e2e.ts:3072
>     "recently dissolved entity is HELD (s. 605.0715 window)",

## USER WALK — reviewer
1. Runs the review from the candidate.
2. Sees the exact tested source and distinct run identities.
3. Opens representative forms and mutation logs.
Expects: correct output passes, each deliberately broken protection fails for its stated reason; historical missing evidence is not invented.

## Revision 2
The broader mandatory suite exposed two fixture-copy lists missing the new evidence module and an isolation fixture that assumed dist could be reused. Add the dependency to both copy lists and give the isolation fixture a real local build (source HTML, package and existing dependency link). Preserve all original offline-proof and stranger-process refusal assertions. Revision 1 is retained as rejected under Adam's standing authorization for necessary revisions; no product decision changed.
