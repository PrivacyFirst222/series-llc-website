# Batch 13 — owner-approved scope

Go: Adam approved item 7 and said Go after approving the rest with his modifications. This is implementation permission, not package acceptance or publication. Separate checkout from committed Batch 10; pending Batch 11 and 12 are not incorporated or edited.

## Governing decisions (verbatim)
- 1: "I would simplify it and say it runs from the date the LLC is formally formed with the Division". Accepted clarification: later effective date on Articles controls over earlier filing date.
- 2: "I reject that ... You need an EIN on the 2553. Leave as is". Preserve issued-EIN requirement.
- 4: "The real change should be to let them complete the EIN questionnaire if the LLC is already formed".
- 5: "If the client is hiring us to obtain the EIN, then they can check that box that says we’re getting it for them. If they already have an EIN or apply for it themselves, then they need to fill it in".
- 7: "Ok. I approve 7. Go". Neutral EIN upload instruction; conditional matching-company S-package update notice.
- 10: "Never tell them to enter Applied for ... We don’t need to explain what happens if they don’t". Save pending questionnaire encrypted, no filing PDF until issued EIN; automatic generation after office entry.
- 11: "If you are talking about Form 2553, leave as is. I reject your change". Keep invalid-SSN warning verbatim.
- "I approve the rest": fax/mail consistency, optional package-location wording, invalid SSN groups, neutral record-copy deadline tense, consistent office PDF EIN label.

Item 9 cleanup is limited to correcting deadline tense in the dormant record-copy branch: removing the branch would remove the warning Adam retained under item 11. No production caller requests a record copy; encrypted retained documents remain unchanged.

## User walks
USER WALK — existing LLC client:
1. Opens Orders in progress for their company while series filings are pending.
2. Opens Provide details securely on its EIN order.
3. Completes and submits the EIN application questionnaire.
Expects: existing company recognized, form accessible and server accepts; another unformed company does not inherit that status.

USER WALK — client preparing S election:
1. Opens S-election details and reads the formation deadline.
2. Enters an issued EIN, or selects our obtaining-EIN checkbox only if a paid company EIN order exists.
3. Submits valid owner details.
Expects: issued EIN creates encrypted downloadable package; pending EIN saves encrypted answers with clear waiting status, no downloadable incomplete filing form. Office entering issued EIN completes package automatically. Invalid SSN groups show immediate field errors and are rejected by server too.

USER WALK — office:
1. Opens an EIN order and uploads IRS letter.
2. Enters the issued EIN under neutral instruction.
3. Completes order.
Expects: matching company S-election details are completed with that EIN; series EIN/no matching S election carries no misleading promise.

## Checks and boundaries
16 source parts, 10 approved review units. 2 rejected items (122, N2.18) preserved by rulings, not claimed fixed. 334 source records unchanged. Test-only probes run on base then after. Required complete review, rendered form/PDF inspection, issued/pending/self-applied/other-company scenarios. Existing full-suite expectations for Applied For PDFs must be updated to assert saved/no-document then issued-EIN generation, preserving checks of encryption, company isolation and prior retention. No customer/test-backup cleanup, no publishing.
