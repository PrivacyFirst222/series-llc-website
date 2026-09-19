# Batch 04 follow-up — Account card notice

Adam authorized this correction with his whole message: “Go. Make the last fix”. This follows the report identifying the stale pending-email notice and AccountCard.tsx missing from the frozen Batch 04 scope.

The only product change is to call the existing refresh() after a successful password change. A failed password change must retain the pending-email notice; a later legitimate email-change request must still display its new pending address.

Scope is a separately frozen follow-up, not an edit to Batch 04 revision 1. Checked migration 002 adds item 200’s pending-email-notice part; its existing all part, assertions, history and original work order remain unchanged. The migration is included in this product review and still requires acceptance of the resulting commit/package before publication. No owner rejection or acceptance is manufactured.

The browser regression uses the real Account card with a mocked API. Batch 04’s existing server checks separately prove actual cancellation and token invalidation. The new check must fail on 80d4c55 because the successful password change leaves the old notice visible, then pass without any reload after the fix. Failed-password and new-email positive controls run too. The complete mandatory review suite is required.

Return point: 80d4c558ce2c5295ae7610f323e4a30cc12a514a and the original package 47ac74aca838 remain intact. No integration or publication is authorized by this implementation.
