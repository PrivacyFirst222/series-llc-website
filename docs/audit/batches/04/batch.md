# Batch 04 — approved implementation scope

Adam's authorization: “Go - Approve all”, following the complete 18-fix proposal. Item 30 (conditional SMS wording) remains unchanged, exactly as recommended in the approved proposal. This authorizes implementation and a review package; acceptance and publication remain separate.

## Governing sources and approved outcomes

The current implementation is the behavioral baseline; these are existing business rules, not new eligibility policy. No legal document, price, or Terms text changes.

Source quotes opened before editing:
- routes-portal.ts: “AND paid_at IS NOT NULL” is the agreement eligibility check; it does not require formed_at.
- routes-portal.ts: S-election purchase requires “paid_at IS NOT NULL AND package = 'NEW'”; details still use the formed-company gate.
- routes-payments.ts: contactSchema requires “message: z.string().trim().min(1).max(5000)”.
- email.ts: “If this was not you, sign in and change your password immediately, then email support@myfloridaseriesllc.com.” The approved fix must actually cancel pending email-change links on both password-change paths.
- PortalDashboard.tsx: “Nothing here — that's good news.” is currently displayed when the document request failed; it must only be displayed after a successful empty response.
- webapp/CLAUDE.md: “Use Dialog/AlertDialog from shadcn/ui, not window.alert() or window.confirm().”

## Approved words and behavior — 18 of 18 review units

1. Contact: “Message *”; “Please add your name, email, and a message so we can reply.”
2. Confirmation sign-in only for a password-ready account. Resend remains eligible after paid/filed/formed, based on payment and account facts; a neutral refusal does not assert a password exists.
3. Failed resend: “Could not send the email. Please try again.” Keep the action.
4. Confirmation: “We're preparing your filing.” / “Your filing has been submitted.” / “Your LLC has been formed.” Existing-company completion: “Your protected series have been established.”
5. Reset: “Enter the email address you currently use to sign in, and we'll send a link to choose a new password.”
6. Client sign-in: incorrect credentials only on authentication refusal; distinguish invalid input, rate limit, server failure and connection failure.
7. Invalid login input: “Enter a valid email address and your password.”
8. Office sign-in: distinguish incorrect password, rate limit, server failure and connection failure.
9. Changing OR resetting a password clears the pending email change and invalidates its links before promising cancellation. Existing session invalidation remains.
10. Reset request failure: “We could not request a reset link. Check your connection and try again.” Successful requests retain neutral account-existence wording. No account-existence disclosure is added.
11. Documents/legal mail distinguish loading, empty success, failure and failed refresh of cached content, with retry.
12. Agreement questionnaire/amendment NO_LLC: “We couldn't find a paid order for this company.” S-election purchase: “The S election package is available only with a paid new-LLC formation order through us.” Eligibility itself unchanged.
13. Agreement card: specific NO_LLC only gets paid-order explanation; other failures: “We couldn't check your agreement just now.” Retry and expired-sign-in handling apply to card, operating-agreement questionnaire and amendment page.
14. Empty documents: “Your documents will appear here as they are prepared or uploaded.”
15. Duplicate orders: “See Orders in progress.”
16. Operating-agreement deletion errors visible, retry possible; missing agreement explained and list refreshed.
17. Operating-agreement deletion uses named portal confirmation with “Keep it” / “Delete”. Batch 03 tax-document deletion remains separate.
18. Welcome/password-change emails and expired-link instructions all use “Forgot your password?”.

## User walks

USER WALK — visitor or client signing in and receiving mail:
1. Opens Contact, confirmation, sign-in or password reset and sees the fields and appropriate account action.
2. Submits valid or incomplete input, or encounters a service/connection failure.
3. Reads the actual outcome and retries where appropriate.
Expects: no false sent, wrong-password, unpaid or no-mail claim; existing-account privacy preserved.

USER WALK — client protecting their account:
1. Receives an unexpected email-change notice at the current address.
2. Changes their password in Account or uses the reset link.
3. The pending email-change confirmation link is tried afterwards.
Expects: the old link cannot change the sign-in email; pending change cleared; prior session-revocation behavior preserved.

USER WALK — client using agreement tools and documents:
1. Opens the chosen company's Operating agreement questionnaire, amendment or documents card.
2. Encounters a missing paid order, expired sign-in, service failure or a successfully empty list.
3. Retries a failure, or selects a generated agreement, reads its named deletion dialog, and cancels or confirms.
Expects: accurate reason, correct company, visible deletion failure, other documents unchanged.

USER WALK — office signing in:
1. Opens Office sign-in.
2. Enters a wrong password, or submits while the service is unavailable.
3. Reads the reason and retries after recovery.
Expects: a service failure does not accuse the office of using a wrong password.

## Verification and return point

Use offline isolated servers, disposable databases, and mocked email/network failures. Every claimed part has a named regression that must fail on the unchanged Batch 03 baseline and pass after the fix. Run all existing required checks; retain logs, rendered screenshots and complete diff. No data cleanup, live credentials, publication, or control-system edits. Prior batch snapshots, item text, rulings and assertions remain unchanged.


### 24: contact requires a message

Contact page, the 'Message' box and the Send button — `webapp/src/pages/Contact.tsx:119`
Reads: <Label htmlFor="message">Message</Label>
Claims: That a message is optional (no asterisk; the pre-check at :35 tests only name and email: 'if (!form.name || !form.email)').
True: The server refuses a blank message: routes-payments.ts:638 'message: z.string().trim().min(1).max(5000)' and :647 returns 'Please provide your name, a valid email, and a message.' A visitor who leaves it blank is refused after Send with a message about three boxes.
Replace with: Label 'Message *'; pre-check 'if (!form.name || !form.email || !form.message.trim())' with the toast 'Please add your name, email, and a message so we can reply.'

Prior assessment: {"status": "confirmed", "evidence": "Contact.tsx:119 lacks the required marker and its precheck ignores message; routes-payments.ts:638 requires a nonblank trimmed message.", "replacementOk": true, "replacementNote": "Add the marker and include trimmed message in the precheck."}

### 64: welcome resend follows paid account state

Order confirmed: "Sign in to your portal" button for a first-time client; resend answers "already has a password" for a filed or formed order. Replace: button only for a returning client; treat filed/formed as paid.

Prior assessment: {"status": "confirmed", "evidence": "OrderConfirmed.tsx:139–141 always offers login even without hasPassword; routes-payments.ts:603 rejects resend unless status exactly paid although filed/formed are paid states.", "replacementOk": true, "replacementNote": "Condition login on account readiness and base resend eligibility on payment/client/password facts, including filed and formed."}

### N4.06: failed welcome email remains retryable

Payment confirmation, Resend the email: failure is reported as sent — `webapp/src/pages/OrderConfirmed.tsx:26`
Reads: Sent — check your inbox.
Claims: The requested welcome/password-setting email has been successfully sent.
True: routes-payments.ts:618–621 catches a rejected sendMail call, logs it, and unconditionally returns sent:true. OrderConfirmed.tsx:23–26 trusts that flag. If the mail provider fails, the client sees Sent and loses the resend button despite no accepted delivery. Unlike prior64, this occurs for an otherwise eligible paid order and does not concern filed/formed eligibility. Correct behavior requires returning an API error on failed sendMail, preserving the resend control, and using the existing success sentence only after sendMail succeeds.
Replace with: Could not send the email. Please try again.

Prior assessment: {}

### N4.10: confirmation matches filing stage

Payment confirmation reopened after filing or formation: the status message still says preparation has just begun — `webapp/src/pages/OrderConfirmed.tsx:101`
Reads: We're preparing your filing now — you'll get an email when your LLC is formed.
Claims: The current order is still awaiting filing and formation.
True: OrderConfirmed.tsx:58,63 deliberately treats paid, filed, and formed as paid, but :101–103 renders this same future-tense message for all three. A formed order can therefore show both an already-completed server state and a claim that its filing is being prepared. The conversion branch has the parallel stale claim about series being established. This is independent of prior64’s login/resend mismatch.
Replace with: Paid: “We’re preparing your filing.” Filed: “Your filing has been submitted.” Formed: “Your LLC has been formed.” For an existing LLC’s series order, use “Your protected series have been established” at completion. Render the message for the actual order status.

Prior assessment: {}

### 147: reset asks for current sign-in email

Client portal, Reset your password page — `webapp/src/pages/portal/PortalForgot.tsx:40`
Reads: Enter the email address you used when you signed up, and we'll send a link to choose a new password.
Claims: The client signed up.
True: There is no sign-up: the account is created by the payment (routes-payments.ts:78-83 `INSERT INTO clients (email, name)` at fulfilment) from the order's contact email; the client's first visit is the welcome link. The one-hour claim at :35 is right (routes-portal.ts:982, 3600_000 ms).
Replace with: Enter the email address on your order, and we'll send a link to choose a new password.

Prior assessment: {"status": "disputed", "evidence": "PortalForgot.tsx:40 uses the loose phrase “signed up”, but the proposed “email address on your order” is wrong after the account email is changed using AccountCard. The reset route queries current clients.email at routes-portal.ts:975, not historical order contact_email.", "replacementOk": false, "replacementNote": "Use “Enter the email address you currently use to sign in, and we’ll send a link to choose a new password.”"}

### 148: client login separates failures

Client portal, Sign in page, the error line — `webapp/src/pages/portal/PortalLogin.tsx:26`
Reads: setError(status === 429 ? "Too many attempts. Try again in a few minutes." : status ? "Incorrect email or password." : "We could not reach the server. Check your connection and try again.");
Claims: Any response other than a lockout or a lost connection means the credentials were wrong.
True: The route answers 401 for bad credentials (routes-portal.ts:925), 400 'Email and password are required.' (:919), and app.ts:19-22 turns any thrown error into a 500 'Something went wrong on our end.' — a database fault is reported to the client as their own mistake. Twin of A79 on the admin page.
Replace with: status === 429 ? "Too many attempts. Try again in a few minutes." : status === 401 ? "Incorrect email or password." : status ? "Something went wrong on our end. Please try again." : "We could not reach the server. Check your connection and try again."

Prior assessment: {"status": "confirmed", "evidence": "PortalLogin.tsx:26 maps every status except429 to Incorrect email or password; routes-portal.ts:925 uses401 for bad credentials and app.ts:19-22 can produce500 for a server fault.", "replacementOk": true, "replacementNote": "Correct as written."}

### 160: malformed login explains valid input

Client portal sign-in — the refusal for a malformed email — `webapp/server/routes-portal.ts:919`
Reads: if (!body.success) return c.json(err("Email and password are required.", "INVALID_INPUT"), 400);
Claims: A box was left empty.
True: loginSchema at :37 is `z.object({ email: z.string().email(), password: z.string().min(1) })`, so a typed but malformed address ("adam@") is answered "required". The sign-in page maps any 4xx other than 429 to "Incorrect email or password." (PortalLogin.tsx:26), so this text reaches no reader today; it is wrong for the day the page starts showing it.
Replace with: if (!body.success) return c.json(err("Enter your email address and password.", "INVALID_INPUT"), 400);

Prior assessment: {"status": "housekeeping-only", "evidence": "routes-portal.ts:919 returns required for malformed email, but PortalLogin.tsx:26 replaces that response text. Changing this response alone changes no currently displayed text.", "replacementOk": true, "replacementNote": "Correct as written."}

### 182: office login separates failures

Admin sign-in "Incorrect password." for any server error. Replace: only for a 401.

Prior assessment: {"status": "confirmed", "evidence": "AdminLogin.tsx treats every HTTP error except429 as Incorrect password, including500. Restrict that sentence to401 and show a server/connection error for other failures.", "replacementOk": true, "replacementNote": "Correct as written."}

### 200: password changes cancel pending email changes

The 'A change to your portal email was requested' notice sent to the old address — `webapp/server/email.ts:222`
Reads: If this was not you, sign in and change your password immediately, then email support@myfloridaseriesllc.com. This address remains on the account until the new one is confirmed.
Claims: That changing the password is the way to stop the change.
True: Changing the password (routes-portal.ts:2420-2455) deletes other sessions but leaves pending_email set and the verify_email token valid for its hour; pending_email is cleared only when a link is confirmed (routes-portal.ts:2541, :2545) or by the office (routes-admin.ts:1076), and no portal control withdraws a pending change (AccountCard.tsx:65-67 only displays it). Someone holding the new inbox can still confirm the change after the password is changed. Requesting a new change to the old address does cancel the earlier link (routes-portal.ts:2478-2482 marks older tokens used) but the email does not say so.
Replace with: Code: on a password change, `UPDATE clients SET pending_email = NULL` and mark outstanding verify_email tokens used. Email: 'If this was not you, sign in and change your password immediately — that also cancels this request — then email support@myfloridaseriesllc.com.'

Prior assessment: {"status": "confirmed", "evidence": "email.ts:222 directs password change after an unauthorized email-change request, but routes-portal.ts:2420–2455 does not consume verify_email tokens or clear pending_email. The attacker can still confirm the pending change.", "replacementOk": true, "replacementNote": "Invalidate pending email changes when changing the password before promising cancellation in the email. Correction to old evidence: requesting the unchanged old address does NOT cancel the earlier link; :2478 rejects it before token invalidation."}

### N3.07: failed reset stays retryable

Client portal → Reset your password → response after a failed request — `webapp/src/pages/portal/PortalForgot.tsx:34`
Reads: If an account exists for that email address, a reset link is on its way.
Claims: A reset request reached the service and initiated mail whenever that account exists.
True: The catch at :19-20 swallows every failure and finally at :22 sets sent=true, including a lost connection or500 before the reset route runs. routes-portal.ts:972-987 already gives the same successful response for existing/nonexisting accounts, so avoiding account enumeration does not require turning transport/server failure into success.
Replace with: On a failed request show: “We could not request a reset link. Check your connection and try again.” Show the existing neutral success message only after a successful response.

Prior assessment: {}

### N3.09: failed mail loading is not empty mail

Client portal → Legal mail → failed document-list request — `webapp/src/pages/portal/PortalDashboard.tsx:742`
Reads: Nothing here — that's good news. Anything we receive for you as registered agent will be posted here, and you'll get an email the moment it is.
Claims: No legal mail exists for the account.
True: docsQuery fetches at :471-475, but :645 treats unavailable data as [] and :660 filters that empty array. DocList at :740-742 therefore shows the reassuring empty state after a failed request, including while served documents may exist. No docsQuery.isError branch distinguishes unavailable mail from no mail.
Replace with: On a document-list failure show: “We could not load your documents or legal mail. Try again.” Show the no-mail sentence only after a successful empty response.

Prior assessment: {}

### 115: agreement tools explain paid-order eligibility

Questionnaire and amendment error "We couldn't find a formed LLC on your account yet" where the check is for a paid order. Replace: "a paid order".

Prior assessment: {"status": "confirmed", "evidence": "OAQuestionnaire.tsx and AmendAgreement.tsx show the formed-LLC refusal; routes-portal.ts:75-83 and 1107-1108 require a paid order, not formed_at.", "replacementOk": false, "replacementNote": "Use “a paid order” for NO_LLC only; distinguish network/server errors rather than replacing every failed request with this explanation."}

### 161: S election purchase describes paid formation order

Client portal, Services card — the S election package refused for a conversion or an unpaid company — `webapp/server/routes-portal.ts:1924`
Reads: : "The S election package is available only for new LLCs we formed.";
Claims: The company must already be formed by us.
True: sElectionEligibility (:478-489) asks for a paid order with package = 'NEW' — formed or not; the package is sold from the day the formation is paid (:490-491). The formed gate is applied later, on the details (:2269-2271).
Replace with: : "The S election package is available only for new LLCs formed through us.";

Prior assessment: {"status": "confirmed", "evidence": "routes-portal.ts:1924 says LLCs “we formed”, while sElectionEligibility at :478-489 only requires a paid NEW order. “Formed through us” still implies formation is completed.", "replacementOk": false, "replacementNote": "Use “The S election package is available only for new LLCs ordered through us.” Keep the separate later gate on completing the details."}

### 143: agreement card separates eligibility and failure

Client portal, the Operating agreement card when the status request fails — `webapp/src/pages/portal/PortalDashboard.tsx:199`
Reads: Your agreement questionnaire unlocks once your order is paid.
Claims: The order is unpaid.
True: The sentence is shown for any error from /api/portal/oa (`oaQuery.isError`, :197), including a dropped request. The route's only refusal is routes-portal.ts:1108 'No formed LLC found on your account.' (a 400); a 500 or a lost connection also lands here and tells a paid client they have not paid. The same file already distinguishes a 401 from other failures for the portal itself (:624-636).
Replace with: Show 'Your agreement questionnaire unlocks once your order is paid.' only when the error is a 400 (ApiError status 400); otherwise 'We couldn't check your agreement just now.' with a Try again button, as at lines 630-633.

Prior assessment: {"status": "confirmed", "evidence": "PortalDashboard.tsx:197-199 shows the payment explanation for every oaQuery.isError, including 500/network errors, which do not establish nonpayment.", "replacementOk": false, "replacementNote": "Use the specific NO_LLC API error, not every400; distinguish401 (sign in again), transport failure and server failure. The suggested retry message is correct for the latter failures."}

### 145: documents explain preparation and upload

Client portal, Your documents card, empty state — `webapp/src/pages/portal/PortalDashboard.tsx:720`
Reads: Your documents will appear here once your formation is prepared.
Claims: Documents appear when the formation is 'prepared'.
True: The first document a new-formation client sees is the filed Articles, uploaded when the Division returns them (routes-admin.ts:544-560); a converting client has no formation at all — their first document is a filed Designation (routes-admin.ts:656-712). Nothing appears at 'preparation'. Twin of A24 ('formation documents' to a converting client).
Replace with: Your filed documents will appear here as the Division returns them.

Prior assessment: {"status": "disputed", "evidence": "Actual empty state says “Your documents will appear here once your formation is prepared.” It is unsuitable for conversions, but the finding incorrectly says the first possible document is always returned Articles: routes-portal.ts:1107-1108 permits questionnaire access after payment and generated agreements appear before state filing. The replacement restricts the explanation to Division-returned documents.", "replacementOk": false, "replacementNote": "Use “Your documents will appear here as they are prepared or uploaded.” This covers self-generated agreements and conversion filings as well as state-returned documents."}

### 157: duplicate orders name their section

Client portal, Services card — the S election, certificate and EIN refusals point the reader "below" — `webapp/server/routes-portal.ts:1921`
Reads: "You already have an S election order — see your orders below."
Claims: The client's orders are listed beneath the Services card.
True: The refusal is rendered inside the Services card (ServicesCard.tsx:252, 363, 416, 505), and the dashboard places Orders in progress above that card: PortalDashboard.tsx:747 `<OrdersInProgress …/>`, then :761 `<ServicesCard …/>`. The same wrong direction is at routes-portal.ts:2049 ("is already on order — see your orders below."), :2119-2120 and :2134 ("already ordered — see your orders below.").
Replace with: "You already have an S election order — see Orders in progress above." (and "— see Orders in progress above." at 2049, 2119, 2120, 2134)

Prior assessment: {"status": "confirmed", "evidence": "routes-portal.ts:1921 and sibling duplicate-order refusals say below; PortalDashboard.tsx:747 puts Orders in progress above ServicesCard at :761.", "replacementOk": true, "replacementNote": "Correct as written."}

### 163: agreement deletion reports failure

Client portal, Your documents — deleting one of your agreements when the server refuses — `webapp/server/routes-portal.ts:1704`
Reads: return c.json(err("Not found", "NOT_FOUND"), 404);
Claims: The client is told the agreement could not be found.
True: The screen has no line for it: PortalDashboard.tsx:488-494 `deleteGeneration = useMutation({ mutationFn: (id) => api.delete(`/api/portal/oa/generations/${id}`), onSuccess: … })` has no onError, and nothing renders deleteGeneration.isError — a refused delete (or a lost connection) leaves the row in place with no message.
Replace with: In PortalDashboard.tsx add `onError: (e) => setDeleteError(e instanceof ApiError ? e.message : "We could not delete that agreement. Try again.")` and render it under the agreements list; and make the refusal say what it means: err("That agreement is no longer on your account.", "NOT_FOUND").

Prior assessment: {"status": "confirmed", "evidence": "PortalDashboard.tsx:488-494 defines deleteGeneration without error handling and the document list renders no deletion error, so the refused request leaves the row silently unchanged.", "replacementOk": true, "replacementNote": "Correct as written."}

### 169: agreement deletion uses portal confirmation

Client portal, deleting a self-generated agreement — code only — `webapp/src/pages/portal/PortalDashboard.tsx:725`
Reads: const ok = window.confirm(
Claims: —
True: webapp/CLAUDE.md (ux): 'Use Dialog/AlertDialog from shadcn/ui, not window.alert() or window.confirm().' The same file uses AlertDialog for the cancellation at :386-423.
Replace with: An AlertDialog with the two sentences at :727-728 and the actions 'Keep it' / 'Delete'.

Prior assessment: {"status": "confirmed", "evidence": "PortalDashboard.tsx:725 actually calls window.confirm for deletion. Replacing a native confirmation with AlertDialog changes visible UI, despite the finding calling it code-only.", "replacementOk": true, "replacementNote": "Correct as written."}

### 205: reset instructions match the visible link

Welcome email, the note under the Set your password button — `webapp/server/email.ts:89`
Reads: This link expires in 7 days. If it expires, use "Forgot password" on the portal sign-in page with this email address.
Claims: The sign-in page has a link called 'Forgot password'.
True: The sign-in page link reads 'Forgot your password?' (PortalLogin.tsx:71) and the password-changed email at email.ts:193 says 'Forgot your password' — two wordings for one link. (The 7 days is true: routes-payments.ts:112 and :614.)
Replace with: This link expires in 7 days. If it expires, use "Forgot your password?" on the portal sign-in page with this email address.

Prior assessment: {"status": "confirmed", "evidence": "email.ts:89 names Forgot password; PortalLogin.tsx:71 names the link Forgot your password?. The7-day expiration agrees with routes-payments.ts:112 and614.", "replacementOk": true, "replacementNote": "Use the exact visible link label."}
