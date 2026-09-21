# Batch22 — order form and client portal, revision1

Adam approved the nine-item proposal with: **“Go. Approve all”**. Publication remains deferred. In particular he approved the proposed capacity of100 owners in the operating-agreement questionnaire.

## Governing sources and approved changes

### 1. B1-N02

Approved scope: Correct only the registered-agent payment page browser title.

Original finding and source quotations (the historical proposal label below is preserved verbatim):

Registered-agent payment page, browser tab title (/agent-checkout). — `webapp/src/components/layout/Layout.tsx:41`
Reads: document.title = PAGE_TITLES[pathname] ?? `Page Not Found \u2014 ${SITE}`;
Claims: The fallback classifies every unlisted path as Page Not Found, including the real registered-agent payment page.
True: App.tsx:56 registers /agent-checkout under Layout; AgentCheckout.tsx:24 renders a payment heading. PAGE_TITLES:11–35 lacks that path, so every visit to this valid payment route receives the Page Not Found title. Prior17:amend-title concerns /portal/amend, which is already present; this new payment route is a separate missing entry.
Proposed replacement (not approved): Add the title-map entry: "/agent-checkout": `Registered Agent Payment — ${SITE}`,
Rechecked by codex-reader-5: Read Layout full and App44–63: valid /agent-checkout route has no title key; fallback is Page Not Found. Prior17 covers /portal/amend, already present. Specific proposed entry is accurate.

### 2. B1-N03

Approved scope: Cancel and ignore stale address suggestions after edits, selection, and unmount.

Original finding and source quotations (the historical proposal label below is preserved verbatim):

Formation order form, any street-address suggestion box after the client clears or shortens the street. — `webapp/src/components/forms/florida-llc/AddressAutocomplete.tsx:54`
Reads: if (!SMARTY_KEY || text.trim().length < 4) {
Claims: Clearing/shortening the query closes and clears the suggestions, but leaves the earlier request scheduled.
True: The early return at54–57 runs before clearTimeout at59; pending fetch results at99–100 repopulate/open suggestions without checking current input. Offline execution of the exact extracted query body: type100main, clear input, resolve the pending mock fetch; current value is empty but old100MAINST suggestions reopen. This is distinct from prior69 state coercion and104 unused onBlur.
Proposed replacement (not approved): Cancel the pending debounce timer and abort the active request at the start of every query, before the short-query return. Apply results only if that request is still current and not aborted. Cancel pending work on selection and component unmount as well.
Rechecked by codex-reader-5: Read actual AddressAutocomplete45–129: short-query return precedes timeout cancellation, and completion has no request-current guard. Choosing also leaves scheduled work. Proposed cancellation/current-request protection addresses demonstrated mechanism. Priors69/104 concern state coercion and unused blur prop, not stale results. Severity may be wording/usability rather than substantive data loss.

### 3. B2-01

Approved scope: Use the active filing path company in the protected-series name preview.

Original finding and source quotations (the historical proposal label below is preserved verbatim):

Order form, Create your protected series, full-name preview after changing to an existing LLC — webapp/src/components/forms/florida-llc/sections/StepSeries.tsx:31 — `webapp/src/components/forms/florida-llc/sections/StepSeries.tsx:31`
Reads:     buildFinalLlcName(data.desiredLlcName, data.llcDesignator) ||
Claims: The full-name preview identifies the company the client is currently adding series to.
True: StepFilingPath.tsx:67 changes filingPath without clearing a previous desiredLlcName. StepSeries.tsx:30–34 prioritizes that abandoned new-company name before existingLlcName. The preview at190 therefore shows Old Name, LLC for a client now adding series to Existing Holdings, LLC. buildPayload.ts:30–31 already clears the new-name payload; prior101/155 cover payload/seed, not this surviving preview. Pure expression reproduction is retained; rendered recheck pending.
Proposed replacement (not approved): const llcName = (data.filingPath === "CONVERT" ? (data.existingLlcName ?? "").trim() : buildFinalLlcName(data.desiredLlcName, data.llcDesignator)) || "[Your LLC Name]";
Rechecked by codex-reader-5: Read StepSeries30–34, StepFilingPath67 and payload separation: abandoned desired name precedes selected existing name in preview. Replacement branches first and is correct. Related to prior101/155 abandoned-name family, but those exact payload/server fixes do not repair this independent preview expression; report crosslink, not regression of their fixed locations.

### 4. B2-02

Approved scope: Validate and submit only active selected branch fields; preserve English business-text rules and visible editable errors.

Original finding and source quotations (the historical proposal label below is preserved verbatim):

Order form, Your existing LLC, continuing after abandoning a new-company name — webapp/src/components/forms/florida-llc/stepValidation.ts:425 — `webapp/src/components/forms/florida-llc/stepValidation.ts:425`
Reads:   for (const [field, message] of Object.entries(englishTextProblems(data))) {
Claims: Only the fields relevant to the selected form path can prevent proceeding on that step.
True: The newly added English-text scan validates every stored string, including hidden abandoned NEW name fields. With CONVERT, a valid existingLlcName and document number, and abandoned desiredLlcName Café, validateStep("name") returns a desiredLlcName error. ConversionName (StepName.tsx:78–131) displays only errors.existingLlcName/errors.sunbizDocumentNumber and no desired-name editor, so the client cannot see or correct the rejected field on this screen. The owner’s English-only rule remains; the defect is validation of discarded fields. Prior58 concerns a different server alternate-name equality check, which is fixed.
Proposed replacement (not approved): Before checking English characters, normalize the data to the active filing path and selected party/management types. Ignore discarded new-company fields when adding series to an existing LLC; continue checking every displayed or submitted business-text field. Show each remaining error beside a field the client can edit.
Rechecked by codex-reader-5: Read stepValidation425–428 and ConversionName30–132. English scan sees hidden desiredLlcName mapped to name step; conversion branch displays no desired-name editor or error. Custom Input permits onChange while marking invalid, so abandoned invalid text/legacy drafts can survive path switch. Preserve owner English-only rule while ignoring discarded fields. Prior58 is alternate-name equality; N2.20 is lossy PDF text handling, not hiddenfield deadend.

### 5. B2-03

Approved scope: Ignore superseded existing-company lookup results, failures and loading completions.

Original finding and source quotations (the historical proposal label below is preserved verbatim):

Order form, Your existing LLC, lookup results while editing the company name — webapp/src/components/forms/florida-llc/sections/StepName.tsx:53 — `webapp/src/components/forms/florida-llc/sections/StepName.tsx:53`
Reads:         setLookup({ forName: typed, available: r.available, matches: r.matches });
Claims: Lookup results stay associated with the current name and remain available after its request completes.
True: The effect at46–63 clears only its 700ms timer, not an already-started request. If request A starts, then B starts and completes, then A completes last, line53 overwrites the stored B result. current at64 becomes null because forName is A while typed is B, and the [typed]-only effect does not run again. Thus the current company choices disappear until the client edits again. This is a deterministic source race; no network timing was measured by this reader.
Proposed replacement (not approved): Ignore both success and failure completions from superseded lookup requests. Update looking only for the current request. Keep the current name’s matching response visible until that name changes.
Rechecked by codex-reader-5: Read full ConversionName effect46–64: cleanup cancels only timer; success/failure always set state for captured typed; stale A after B hides B through current-name comparison, with no rerun triggered by lookup change. Cancellation/current request guard handles both looking and result. No existing lookup race prior found; not address-state prior69.

### 6. B3-02

Approved scope: Reset EIN certification on application change and close, preserving draft answers.

Original finding and source quotations (the historical proposal label below is preserved verbatim):

Client portal, EIN application details, certification checkbox after closing one order and opening another. — `webapp/src/pages/portal/OrdersInProgress.tsx:707`
Reads:                 checked={einCertified}
Claims: Certification requires an affirmative action for the EIN application currently displayed.
True: einCertified is component-wide state at53, reset only on successful submission at125. Opening another order restores other values at64–74 but not certification. Closing433 snapshots and clears detailsFor only. Checking order A, closing it and opening B therefore leaves B checked; submitDetails121 always transmits certified:true. Source trace confirmed; no browser reproduction claimed.
Proposed replacement (not approved): Reset the EIN certification to unchecked whenever the application order changes or the dialog closes; require a new affirmative check for the currently displayed application.
Rechecked by codex-reader-5: Read OrdersInProgress state/effect53–74, mutation121–126, close433, checkbox707 andbutton717. setEinCertified(false) occurs only successfulsubmit, so certification carries from A to B without fresh action. Reset on app identity/open/close correct. Priors59/74/75/76/106/N4.07 concern formation certifications/labels or agentagreement, different facts.

### 7. B3-03

Approved scope: Await confirmation-email acceptance; truthful failure and retry; separately disclose failure of the old-address notice; change login only on confirmation.

Original finding and source quotations (the historical proposal label below is preserved verbatim):

Client portal, Your account, changing the sign-in email address, success notice. — `webapp/src/pages/portal/AccountCard.tsx:47`
Reads:       setDone(`Check ${res.pendingEmail} for a confirmation link. Your address changes only after you confirm it.`);
Claims: The new-address confirmation link was sent; the dialog also promises notice to the old address.
True: routes-portal.ts:2505–2509 starts both sends without awaiting them and catches failures only in logs;2510 returns success regardless. AccountCard.tsx:45–47 displays success when either send fails. Unlike fixed reset/resend flows, no response is tied to mail acceptance. Source-confirmed failure path; injected failure remains pending coordinator probe.
Proposed replacement (not approved): Await confirmation-email acceptance before displaying success. If it fails, preserve retry and show: “We could not send the confirmation link. Please try again.” Report old-address notification failure separately rather than asserting it was sent.
Rechecked by codex-reader-5: Read AccountCard43–51 and routes-portal2495–2511: both sends are fire-and-forget with logging-only catches while API returns success. Await confirmation acceptance and expose retry truthful. Prior200 concerns invalidating pending changes on passwordreset; N4.06 welcome delivery failure is a different endpoint, so not same fixed location. No injected mail failure performed here.

### 8. B3-05

Approved scope: Support up to100 operating-agreement owners consistently in UI/API/contribution allocations/generation; prevent owner101 visibly; preserve suggested-owner blank-row filling.

Original finding and source quotations (the historical proposal label below is preserved verbatim):

Client portal, operating-agreement questionnaire, Owners, adding the twenty-first owner. — `webapp/src/pages/portal/OaOwnersSections.tsx:230`
Reads:                   Add owner
Claims: The owner editor permits another owner and will save the resulting questionnaire.
True: OaOwnersSections.tsx:227–231 imposes no Add owner limit; OAQuestionnaire.tsx:244 always appends. routes-portal.ts:198–221 caps members at20; contributor arrays also cap at20 at245. A twenty-first owner therefore fails server validation although UI permits it. No inference is made that the formation-form ruling necessarily governs the OA; the direct mismatch is the finding. Runtime save pending.
Proposed replacement (not approved): Choose and apply one supported owner limit throughout the operating-agreement editor, API and contribution allocations. If the approved limit is100, support100 in all three; show the limit before adding an unsupported row instead of rejecting autosave afterward.
Rechecked by codex-reader-5: Read OaOwnersSections227–231 and OAQuestionnaire244 unlimited append against routes-portal198–221 max20 and245 contributor max20. Direct editor/API mismatch confirmed. Do not infer applicable OA ceiling100 from a differently scoped ruling; proposal correctly requires one approved capacity and UI prevention. No prior member-count/20-owner finding found.

### 9. B6-01

Approved scope: Refuse explicitly invalid or nonowned company selections before fallback or records writes across every scoped portal route; preserve omission default.

Original finding and source quotations (the historical proposal label below is preserved verbatim):

Client portal company selection: operating-agreement generation, consent, amendment and service purchases — `webapp/server/routes-portal.ts:1174`
Reads:   const genCompanyId = await resolveCompanyOrder(session.clientId, c.req.query("company"));
  const seed = await oaSeed(session.clientId, genCompanyId);
  if (!seed) return c.json(err("We couldn't find a paid order for this company.", "NO_LLC"), 400);
Claims: A request scoped to a company operates on that company, or refuses an invalid or inaccessible selection.
True: resolveCompanyOrder at390-402 returns null when an explicitly requested UUID is nonexistent or belongs to another client. oaSeed at81-93 interprets null as latest paid company, so generate1174-1176 silently generates against another company in the account. GET1058-1060, consent1572-1574 and amendment1729-1731 repeat the fallback; purchase routes1897,1956,2023,2080 pass null into clientLlcName and then insert an unassociated service order. PUT answers1132-1133 and cancellation2574-2582 already reject failed resolution, showing the inconsistency. This is a statically established wrong-company path, not observed production access to another client data. Independently exercised actual offline HTTP routes: two paid formations under one account returned their own company seeds for valid IDs, but GET /api/portal/oa?company=11111111-1111-4111-8111-111111111111 returned200 and Root Scope Beta, LLC's seed. See root-company-route-proof.
Proposed replacement (not approved): Distinguish omitted company from explicitly supplied invalid/nonowned company. Return400/404 for failed explicit resolution before calling seed/name/profile helpers or writing records. Use a resolved owned company ID for every generated document and purchased service; preserve intended default selection only when no company was supplied. Exercise nonexistent and another-client UUIDs against all company-scoped routes.
Rechecked by codex-reader-5: routes-portal.ts:390–402 resolves explicit nonexistent/nonowned UUID to null. oaSeed81–93 and clientLlcName374–385 interpret null as latest owned paid order. GET1058, generation1174, consent1572, amendment1729 and purchases1897/1956/2023/2080 pass this null onward; PUT1133 refuses. Actual source confirms latent wrong-company fallback WITHIN signed-in account, not access to another client data. PriorN1.04 is service association for tax package addresses; N1.05 extra series scoping; N1.06 company-specific duplicate check. None addresses invalid requested-company fallback. No live route mutation performed.

## Instructions carried forward — 8 of8 addressed

1. Implement these nine approved findings only; leave the other15 new findings open.
2. Preserve the English/Roman alphabet rule; discard irrelevant hidden answers instead of weakening it.
3. Support100 operating-agreement owners, with consistent saving, contributions and output.
4. Do not change sign-in email before confirmation; report sending failures honestly.
5. Preserve existing owner decisions, ledger history, earlier fixes and mandatory checks.
6. Use isolated offline fixtures and retain failure-before/pass-after evidence.
7. Commit locally through normal hooks; no acceptance, integration or publication.
8. Retain the clean53327cf return point and complete diff.

## USER WALK — client ordering a company or adding series to an existing one
1. Opens the order form, enters a name/address, and changes the selected filing path.
2. Sees only current lookup suggestions and the currently selected company's series name.
3. Continues after completing the visible fields; opens the agent-payment page with its correct tab title.
Expects: no old hidden answer blocks the order and no stale result replaces a current result.

## USER WALK — client managing companies in the portal
1. Opens an EIN application, enters answers, closes it and opens another application.
2. Sees saved answers where appropriate but must freshly certify the displayed application; requests a sign-in email change and gets a truthful result with retry on failure.
3. Completes an operating agreement with up to100 owners and their contributions; selects the company for documents/services.
Expects: owners can save and appear in generated output, owner101 is prevented before entry, and an invalid company selection cannot silently act on another company.

## Verification contract

Use real component and route tests with local controlled asynchronous responses; verify old-name/address responses completing late, discarded versus active English-text fields, certification order changes, email transport failure/retry and separate old-address failure, owner20/21/100/101 saving and rendering, and invalid/nonowned company reads/writes with unchanged records on refusal. Run the same new harness on the unchanged baseline before product repairs and retain both outcomes. All three focused harnesses become part of the mandatory browser-walk command (after Chromium is installed in CI); the ledger guards their identities and wiring. Run the existing full review on the exact committed tree.
