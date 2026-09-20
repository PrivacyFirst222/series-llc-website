

I froze revision 1 before tracing every shared-component consumer. That was a verification-order error.

- Review item 8 / finding 104 is not unused: `webapp/src/pages/portal/OaOwnersSections.tsx:200` passes `onBlur={() => void checkAddress(i)}`. It triggers the owner-address check in the operating-agreement questionnaire. The address component is restored byte-for-byte; exclude 104 from the next work order.
- Review item 5 / finding 100: member email/phone support `StepMembers.tsx` client-prefill and `StepManagers.tsx` person reuse. Keep those fields and their schema/defaults. Remove only the unused formation percentages/contributions and review suffix, plus the redundant route check. Portal ownership/contributions remain intact.
- Deleting the unreachable screen requires removing its one obsolete `where` reference in `docs/facts.md`. The exact proposed file is `facts.md.proposed`; it changes no factual value and leaves the other deliverables locations enforced.
- Correct one whitespace typo in the comment-location assertion for finding 113. No additional product change.

The frozen r1 work order and snapshot remain untouched. `batch-19-revision-2.proposed.json` is outside the repository, ready to copy only after Adam's actual rejection. It covers 14 review units, 16 parts, 15 source records. The installed system requires an owner rejection before a new revision can be authorized; none has been invented.

