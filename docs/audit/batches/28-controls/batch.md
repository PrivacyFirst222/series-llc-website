# Batch 28-controls

Governing source: Adam answered **“Yes”** to the complete CONTROL-REPAIR-PROPOSAL.md, authorizing the narrow tracking correction before continuing Batch28. The proposal is retained under evidence/.

## USER WALK — Adam replacing an unpublished repair
1. Reviews a new work order naming the exact prior implemented fix and replacement assertions.
2. Approves that work order; the next implementation retains the old fix, state and history.
3. Reviews the resulting commit/package before publication; rejecting the successor restores the prior implemented state.
Expects: no fictitious release, no lost prior fix, no unapproved assertion changes and no publication without acceptance.

Scope: support implemented as well as released predecessors; preserve precise approval and immutable archive. Refuse attempts to mutate a superseded predecessor. Tests cover both predecessor states and unchanged existing lifecycle. No product files are modified in this control batch.
