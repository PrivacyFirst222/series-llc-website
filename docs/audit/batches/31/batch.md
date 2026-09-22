# Batch 31 — seven approved changes and three retained wordings

Adam: “1, 2, & 4. Reject. Leave as is / Approve the rest”, followed by “Go”. Items 1, 2 and 4 are retained, not repaired. Exact sources and replacements below were read before applying edits.

## Reader walks
A portal client reads the consent name instruction and sees the Florida Division of Corporations identified. An owner reads the Instructions and sees the records qualification and the existing S-election exception. An owner reads the Manual and sees where single-owner transfer restrictions appear and how dissolution leads to winding up. Members read the four multi-owner agreements and can identify fractional interests; each of the eight agreement forms identifies the property-owning entity in its Statement of Authority clause. The existing consent requirements and limitations remain.

No runtime behavior change, adoption inference, new filing service, acceptance, integration or publication is authorized.

## Review item 1 — RETAIN
Tracking: AUD-claude-reconciled-batch31-reader-1-benefits-deed-unconditional

webapp/src/components/home/BenefitsGrid.tsx
body: "Real estate can be deeded to and held by a protected series in its own name. Under §605.2301, the recorded deed stands as the record that the property belongs to that series.",

webapp/src/pages/FAQ.tsx
a: "Yes. The deed goes in the series' own full name — something like \"Sunshine Holdings, LLC - PS A.\" Not the LLC's name, and not another series' name. Recording that deed does two jobs at once: it puts the property in the series, and it becomes your record that the property belongs to that series and not to the LLC or to a different one. One honest caveat — we can't promise how any particular clerk's office or title company will handle a given closing. (§605.2301)",

## Review item 2 — RETAIN
Tracking: AUD-claude-reconciled-batch31-reader-2-series-established-on-effect-not-filing

webapp/src/components/forms/florida-llc/sections/StepCertification.tsx
Florida establishes a protected series when the company files a
          Protected Series Designation with the Division of Corporations, with
          the consent of all of its members (&sect;605.2201).

## Review item 3 — APPROVED
Tracking: AUD-claude-reconciled-batch31-reader-3-consent-department-wording

webapp/src/pages/portal/OrdersInProgress.tsx
Before:
Exactly as filed with the Department.
After:
Exactly as filed with the Florida Division of Corporations.

## Review item 4 — RETAIN
Tracking: AUD-claude-reconciled-batch31-reader-1-faq-0905-generalized

webapp/src/pages/FAQ.tsx
a: "A Florida Protected Series LLC works well for Floridians and for Florida businesses and assets. There is no way to guarantee how the courts of another state — particularly one with no series LLC legislation of its own — will interpret it. There is also a registration question that runs in both directions: under §605.0905(3), owning income-producing real property or tangible personal property in a state is itself transacting business there, which means a company formed elsewhere that owns Florida rental property has to qualify here — and a Florida company that buys rental property in another state should expect that state to take the same position. The consequences of skipping it are real: §605.0904 bars a company transacting business in Florida without a certificate of authority from maintaining an action here, and §605.0904(7) adds liability for all back fees plus a civil penalty of at least $500 and not more than $1,000 for each year or part of a year. If you are not a Floridian, or you plan to hold out-of-state property in a Florida Protected Series LLC, you should seek advice from an attorney licensed to practice in the relevant state.",

## Review item 5 — APPROVED
Tracking: N2.07

docs/oa-instructions.md
Before:
Under §8.5(b) of your agreement, any asset you fail to associate with a series defaults to the company, where it is exposed to the company's creditors.
After:
Under §8.5(b) of your agreement, any asset you fail to associate with a series defaults to the company, where it is exposed to the company's creditors. Missing records can leave an asset non-associated; the default rule does not replace the identifying, acquisition, and transfer information the statute requires.

## Review item 6 — APPROVED
Tracking: AUD-claude-reconciled-batch31-compare-A-instructions-handle-taxes-differently

docs/oa-instructions.md
Before:
If you start with the single-member form and later add an owner, adopt the multi-member form at that time — the two forms handle taxes, voting, and creditor protection differently, and the single-member form is not built for two owners.
After:
If you start with the single-member form and later add an owner, adopt the multi-member form at that time. The forms handle voting and creditor protection differently, and the single-member form is not built for two owners. A disregarded company ordinarily becomes a partnership for federal income-tax purposes when a second owner is admitted. An existing S election does not end merely because a second eligible owner joins.

## Review item 7 — APPROVED
Tracking: AUD-claude-reconciled-batch31-compare-A-manual-nothing-left-to-add

docs/owners-manual.md
Before:
**In the single-owner forms:** admission of an additional member. Those forms have no transfer article, because Chapter 605 already makes a transfer permissible, gives a transferee distributions and nothing else, and binds a transferee who never signs — there was nothing left for the agreement to add
After:
**In the single-owner forms:** Article 10 addresses admission of an additional member. Transfer provisions also appear elsewhere in the agreement, including Section 9.3’s shareholder-eligibility restrictions in the S corporation forms and Section 1.4’s ownership requirements for professional companies.

## Review item 8 — APPROVED
Tracking: AUD-claude-reconciled-batch31-render-oa-4-1-percentages-vs-fractions

webapp/server/templates-oa-multi.md
Before:
**4.1 Members; Percentage Interests.** The Members and their Percentage Interests are set forth on Exhibit A. Membership interests are of a single class and are expressed as percentages; no certificates shall be issued unless the Manager determines otherwise. Each Member's interest in the Company is personal property for all purposes.
After:
**4.1 Members; Percentage Interests.** The Members and their Percentage Interests are set forth on Exhibit A. Membership interests are of a single class and are expressed as percentages or fractions of the whole, as set forth on Exhibit A; no certificates shall be issued unless the Manager determines otherwise. Each Member's interest in the Company is personal property for all purposes.

webapp/server/templates-oa-s.md
Before:
**4.1 Members; Percentage Interests.** The Members and their Percentage Interests are set forth on Exhibit A. Membership interests are of a single class and are expressed as percentages; no certificates shall be issued unless the Manager determines otherwise. Each Member's interest in the Company is personal property for all purposes.
After:
**4.1 Members; Percentage Interests.** The Members and their Percentage Interests are set forth on Exhibit A. Membership interests are of a single class and are expressed as percentages or fractions of the whole, as set forth on Exhibit A; no certificates shall be issued unless the Manager determines otherwise. Each Member's interest in the Company is personal property for all purposes.

webapp/server/templates-oa-member.md
Before:
**4.1 Members; Percentage Interests.** The Members and their Percentage Interests are set forth on Exhibit A. Membership interests are of a single class and are expressed as percentages; no certificates shall be issued unless a Majority in Interest determines otherwise. Each Member's interest in the Company is personal property for all purposes.
After:
**4.1 Members; Percentage Interests.** The Members and their Percentage Interests are set forth on Exhibit A. Membership interests are of a single class and are expressed as percentages or fractions of the whole, as set forth on Exhibit A; no certificates shall be issued unless a Majority in Interest determines otherwise. Each Member's interest in the Company is personal property for all purposes.

webapp/server/templates-oa-member-s.md
Before:
**4.1 Members; Percentage Interests.** The Members and their Percentage Interests are set forth on Exhibit A. Membership interests are of a single class and are expressed as percentages; no certificates shall be issued unless a Majority in Interest determines otherwise. Each Member's interest in the Company is personal property for all purposes.
After:
**4.1 Members; Percentage Interests.** The Members and their Percentage Interests are set forth on Exhibit A. Membership interests are of a single class and are expressed as percentages or fractions of the whole, as set forth on Exhibit A; no certificates shall be issued unless a Majority in Interest determines otherwise. Each Member's interest in the Company is personal property for all purposes.

## Review item 9 — APPROVED
Tracking: AUD-claude-reconciled-batch31-statutes-0302-series-property

webapp/server/templates-oa-single.md
Before:
**5.8 Statement of Authority.** With the consent of the Member required by Section 5.4(b), the Manager may cause the Company to file with the Department a statement of authority under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Manager, of any Protected Series Manager, or of any person holding a specified position, to transfer or encumber real property held in the name of the Company or of a Protected Series, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4 apply to the Manager whether or not a statement of authority is filed or recorded.
After:
**5.8 Statement of Authority.** With the consent of the Member required by Section 5.4(b), the Manager may cause a statement of authority to be filed with the Department for the Company or the relevant Protected Series under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Manager, of any Protected Series Manager, or of any person holding a specified position, to transfer or encumber real property held in the name of the entity identified in the statement, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement concerning real property held in the name of the Company shall identify the Company as the entity whose authority is stated. A statement concerning real property held in the name of a Protected Series shall be filed for and identify that Protected Series as the entity whose authority is stated. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4 apply to the Manager whether or not a statement of authority is filed or recorded.

webapp/server/templates-oa-multi.md
Before:
**5.8 Statement of Authority.** With the consent of all Members required by Section 5.4(i), the Manager may cause the Company to file with the Department a statement of authority under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Manager, of any Protected Series Manager, or of any person holding a specified position, to transfer or encumber real property held in the name of the Company or of a Protected Series, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4 apply to the Manager whether or not a statement of authority is filed or recorded.
After:
**5.8 Statement of Authority.** With the consent of all Members required by Section 5.4(i), the Manager may cause a statement of authority to be filed with the Department for the Company or the relevant Protected Series under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Manager, of any Protected Series Manager, or of any person holding a specified position, to transfer or encumber real property held in the name of the entity identified in the statement, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement concerning real property held in the name of the Company shall identify the Company as the entity whose authority is stated. A statement concerning real property held in the name of a Protected Series shall be filed for and identify that Protected Series as the entity whose authority is stated. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4 apply to the Manager whether or not a statement of authority is filed or recorded.

webapp/server/templates-oa-s.md
Before:
**5.8 Statement of Authority.** With the consent of all Members required by Section 5.4(i), the Manager may cause the Company to file with the Department a statement of authority under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Manager, of any Protected Series Manager, or of any person holding a specified position, to transfer or encumber real property held in the name of the Company or of a Protected Series, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4 apply to the Manager whether or not a statement of authority is filed or recorded.
After:
**5.8 Statement of Authority.** With the consent of all Members required by Section 5.4(i), the Manager may cause a statement of authority to be filed with the Department for the Company or the relevant Protected Series under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Manager, of any Protected Series Manager, or of any person holding a specified position, to transfer or encumber real property held in the name of the entity identified in the statement, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement concerning real property held in the name of the Company shall identify the Company as the entity whose authority is stated. A statement concerning real property held in the name of a Protected Series shall be filed for and identify that Protected Series as the entity whose authority is stated. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4 apply to the Manager whether or not a statement of authority is filed or recorded.

webapp/server/templates-oa-member.md
Before:
**5.9 Statement of Authority.** With the consent of all Members required by Section 5.5(i), the Members may cause the Company to file with the Department a statement of authority under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of Members to transfer or encumber real property held in the name of the Company or of a Protected Series, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement so filed shall be consistent with this Agreement, and the Members shall cause it to be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4(b) apply among the Members whether or not a statement of authority is filed or recorded.
After:
**5.9 Statement of Authority.** With the consent of all Members required by Section 5.5(i), the Members may cause a statement of authority to be filed with the Department for the Company or the relevant Protected Series under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of Members to transfer or encumber real property held in the name of the entity identified in the statement, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement concerning real property held in the name of the Company shall identify the Company as the entity whose authority is stated. A statement concerning real property held in the name of a Protected Series shall be filed for and identify that Protected Series as the entity whose authority is stated. A statement so filed shall be consistent with this Agreement, and the Members shall cause it to be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4(b) apply among the Members whether or not a statement of authority is filed or recorded.

webapp/server/templates-oa-member-s.md
Before:
**5.9 Statement of Authority.** With the consent of all Members required by Section 5.5(i), the Members may cause the Company to file with the Department a statement of authority under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of Members to transfer or encumber real property held in the name of the Company or of a Protected Series, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement so filed shall be consistent with this Agreement, and the Members shall cause it to be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4(b) apply among the Members whether or not a statement of authority is filed or recorded.
After:
**5.9 Statement of Authority.** With the consent of all Members required by Section 5.5(i), the Members may cause a statement of authority to be filed with the Department for the Company or the relevant Protected Series under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of Members to transfer or encumber real property held in the name of the entity identified in the statement, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement concerning real property held in the name of the Company shall identify the Company as the entity whose authority is stated. A statement concerning real property held in the name of a Protected Series shall be filed for and identify that Protected Series as the entity whose authority is stated. A statement so filed shall be consistent with this Agreement, and the Members shall cause it to be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4(b) apply among the Members whether or not a statement of authority is filed or recorded.

webapp/server/templates-oa-single-s.md
Before:
**5.8 Statement of Authority.** With the consent of the Member required by Section 5.4(b), the Manager may cause the Company to file with the Department a statement of authority under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Manager, of any Protected Series Manager, or of any person holding a specified position, to transfer or encumber real property held in the name of the Company or of a Protected Series, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4 apply to the Manager whether or not a statement of authority is filed or recorded.
After:
**5.8 Statement of Authority.** With the consent of the Member required by Section 5.4(b), the Manager may cause a statement of authority to be filed with the Department for the Company or the relevant Protected Series under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Manager, of any Protected Series Manager, or of any person holding a specified position, to transfer or encumber real property held in the name of the entity identified in the statement, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement concerning real property held in the name of the Company shall identify the Company as the entity whose authority is stated. A statement concerning real property held in the name of a Protected Series shall be filed for and identify that Protected Series as the entity whose authority is stated. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate. The limitations in Section 5.4 apply to the Manager whether or not a statement of authority is filed or recorded.

webapp/server/templates-oa-member-single.md
Before:
**5.7 Statement of Authority.** The Member may cause the Company to file with the Department a statement of authority under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Member or of any person holding a specified position, to transfer or encumber real property held in the name of the Company or of a Protected Series, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate.
After:
**5.7 Statement of Authority.** The Member may cause a statement of authority to be filed with the Department for the Company or the relevant Protected Series under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Member or of any person holding a specified position, to transfer or encumber real property held in the name of the entity identified in the statement, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement concerning real property held in the name of the Company shall identify the Company as the entity whose authority is stated. A statement concerning real property held in the name of a Protected Series shall be filed for and identify that Protected Series as the entity whose authority is stated. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate.

webapp/server/templates-oa-member-single-s.md
Before:
**5.7 Statement of Authority.** The Member may cause the Company to file with the Department a statement of authority under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Member or of any person holding a specified position, to transfer or encumber real property held in the name of the Company or of a Protected Series, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate.
After:
**5.7 Statement of Authority.** The Member may cause a statement of authority to be filed with the Department for the Company or the relevant Protected Series under s. 605.0302, Florida Statutes, stating the authority, or the limitations on the authority, of the Member or of any person holding a specified position, to transfer or encumber real property held in the name of the entity identified in the statement, and may cause a certified copy of that statement to be recorded in the official records of any county in which the real property is located. A statement concerning real property held in the name of the Company shall identify the Company as the entity whose authority is stated. A statement concerning real property held in the name of a Protected Series shall be filed for and identify that Protected Series as the entity whose authority is stated. A statement so filed shall be consistent with this Agreement, and shall be amended or cancelled as necessary to keep it accurate.

## Review item 10 — APPROVED
Tracking: N2.09

docs/owners-manual.md
Before:
**Administrative dissolution** — the state's termination of an LLC for ignoring filing duties; kills every series with the company.
After:
**Administrative dissolution** — dissolution by the state for failing to meet statutory requirements. The company continues to exist for winding up, and its protected series must also wind up. Dissolution is not immediate termination; reinstatement can allow the company and its series to resume operations.

docs/owners-manual.md
Before:
Ignore it long enough and the company is administratively dissolved — which, in a series LLC, drags **every protected series** down with it (a series cannot outlive its mothership).
After:
Ignore it long enough and the company is administratively dissolved. Administrative dissolution also dissolves the company’s protected series and requires them to wind up; it does not immediately terminate their existence.


Revision 2 corrects only two Markdown-source assertion strings to include the existing bold delimiters. Revision 1 remains recorded as rejected under Adam’s standing authorization for necessary revision advances.

Revision 3 updates the existing API check’s obsolete “cause the Company to file” expectation to the approved entity-specific wording. It retains the label and required consent reference, Section 5.4(b). The r2 API run had this sole failure; its full log remains in package f15806fef98e. The interrupted r2 browser run is not claimed as passing.
