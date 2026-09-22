# Batch 30 implementation verification

Owner approved all three repairs, with protected-series EIN classification limited to disregarded entity. Revision 2 adds the joint-signature pagination support and declares replacement of a draft-based consent test; advanced under the standing instruction without another approval request.

## Targeted evidence

- `evidence/red/runtime.json`: all three named repair checks fail on base 835aff4 for the original defects. The baseline returns Draft Stranger on the amendment, Unfinished Edit on the consent, accepts invalid selections, and lacks the picker and approved series helper. Child process completes normally; browser failures identify absent selection UI.
- `evidence/green/runtime.json`: real authenticated Hono routes, actual downloaded PDFs, and React browser interactions pass. Foreign-client, foreign-company, unassigned legacy, missing and deleted selections are refused. Incomplete stored entity signers are refused; incomplete questionnaire edits do not alter selected parties.
- Separate joint-owner signature lines, entity signers and manager signers are retained in both management forms. The joint ownership heading and signatures stay on the same page. All 10 pages of the three generated PDFs were rendered and visually inspected; no overlap, clipping or leaked control marker observed.
- Series helper passes with and without a parent S-election package. Selection changes require fresh consent confirmation. A source-list failure blocks initial amendment generation.
- Broad `bun run check` passed before the pagination refinement; renderer unit tests (150) and targeted checks passed after it. The exact-commit review will run the complete mandatory suite again and retain its own results outside the repository.

## Scope of the replaced assertion

The former assertion “consent: a company or trust owner with no signer is refused, naming the owner” blanked a signer in the editable questionnaire, not the selected agreement. It is replaced by “consent: incomplete questionnaire edits do not replace selected agreement parties”. C02 independently refuses an incomplete signer in the stored selected agreement, preserving that protection.

## Limits

Tests use isolated offline databases and mock external services. This is implementation evidence, not legal adoption of an agreement, live-service verification, acceptance or publication. Existing masters are unchanged. Explicit agreement selection does not support an outside agreement or an unassigned legacy copy.
