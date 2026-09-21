# Batch22 form repairs handoff

Five approved findings implemented in six product files; one persistent regression runner added.

Sources: all 1,403 of 1,403 original lines in six edited product files read before editing and retained verbatim in sources-before.md alongside approved proposals. Also read full payload defaults/types, party identity, API/English validation, registered-agent service source, steps, and purpose UI for branch decisions.

Validation: same final 72-case harness on baseline 53327cf: 42 pass, 30 intended defect failures. Fixed candidate: 72/72 pass. Real React components rendered in Chromium; deliberately delayed/out-of-order fetch promises cannot reach any external host. Unknown title, new-company preview, active English restriction, source draft preservation, service permission preservation, current-company selection all positive controls.

Implementation:
- B1-N02: registered-agent checkout browser title added; unknown routes retain not-found.
- B1-N03: queued and in-flight address searches cancelled on every edit, selection, controlled replacement, and unmount. Generation check also defeats late responses that ignore abort.
- B2-01: series preview chooses existing or new company by current path, including empty-existing-name placeholder.
- B2-02: validation and payload share selectedFormData. Only discarded text is removed from copied answers; original draft remains intact. English restriction still blocks active text. Service text is re-applied from established raServicePatch but no consent booleans are copied.
- B2-03: effect cleanup aborts old entity searches and ignores old success/failure/finally callbacks. Short queries clear obsolete loading. Selection fills actual match name and document number.

Existing formation validation suite passes (complete output in validation-unit.log). Targeted ESLint passes with zero warnings (lint.log empty). Full typecheck initially caught another agent's new-test typing error; parent/author notified, mandatory full review handles final integrated result.

React best-practices skill checked: cleaned async effects, primitive effect dependency, refs for generation identity, no new subscriptions/global handlers, existing input labels/keyboard controls preserved. No new visual design or unrelated components.

Evidence history: red.log initial test contained one incorrect expected missing comma for the already-correct NEW preview. Corrected expectation rerun BEFORE product edits as red-corrected-expectation.log. Initial 50-case suite green.log, then expanded branch/consent tests; authoritative final pair red-final.log and green-final.log. Initial wrong expectation is not counted as a product defect.

No ledger/workorder changes, commits, acceptance, or publication by this agent.
