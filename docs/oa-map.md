# Provision map — the model of the five operating agreement masters

Generated and gated by `docs/provision-map.py`. **Do not hand-edit the
`masters`, `section`, `heading` or `hash` columns** — they are read from the
masters. Do edit `category`, `binds`, `benefits`, `attack` and `source`: those
are the judgment, and they are what Adam vetoes.

A row exists for every numbered provision. Identical text across forms shares
one row. Change a provision and its hash changes, so the row must be
re-annotated before the change can be committed — you cannot reword a covenant
without restating who it is for.

`benefits: nobody` on a `covenant` is a failure, not a note: a restriction that
benefits neither the members nor the manager does not belong in the agreement.
Teaching that cannot be breached goes in the Owner's Manual instead.

Forms: `sgl` single-member · `mul` multi-member · `scp` S corporation ·
`mbr` member-managed · `mbs` member-managed S corporation ·
`sgs` single-member S corporation.

| masters | section | heading | hash | category | binds | benefits | attack | source |
|---|---|---|---|---|---|---|---|---|
| mbr mbs mul scp sgl sgm sgms sgs | 1.1 | Definitions | ae42c9cb | definition | — | members manager | — | drafting convention |
| mbr mbs mul scp sgl sgm sgms sgs | 1.2 | Formation; Status as Protected Series LLC | 4e8d1156 | statutory-route | company | members | — | s. 605.2201 |
| mul scp sgl sgs | 1.3 | Name; Names of Protected Series | f145a65b | covenant | manager | members | The company changed its name and never conformed the series names, so the series were not maintained. | s. 605.2202; the compliance recital was cut 2026-08-13 — non-variable under s. 605.2107(1)(j), so restating it only supplied a yardstick |
| mbr mbs | 1.3 | Name; Names of Protected Series | 4b9d47d5 | covenant | manager | members | The company changed its name and never conformed the series names, so the series were not maintained. | s. 605.2202; the compliance recital was cut 2026-08-13 — non-variable under s. 605.2107(1)(j), so restating it only supplied a yardstick |
| sgm sgms | 1.3 | Name; Names of Protected Series | c5e32e13 | covenant | manager | members | The company changed its name and never conformed the series names, so the series were not maintained. | s. 605.2202; the compliance recital was cut 2026-08-13 — non-variable under s. 605.2107(1)(j), so restating it only supplied a yardstick |
| mbr mbs mul scp sgl sgm sgms sgs | 1.4 | Purposes and Powers | 493808f8 | benefit | company | members | — | s. 605.0108 |
| mul scp sgl sgs | 1.5 | Principal Office | c4203c65 | mechanic | company | members | — | s. 605.0113 |
| mbr mbs | 1.5 | Principal Office | de02adc7 | mechanic | company | members | — | s. 605.0113 |
| sgm sgms | 1.5 | Principal Office | 61889faf | mechanic | company | members | — | s. 605.0113 |
| mbr mbs mul scp sgl sgm sgms sgs | 1.6 | Registered Agent and Registered Office | e86e55ec | statutory-route | — | members third-party | — | s. 605.0113(6); kept by Adam 2026-08-13 — it tells a process server where to serve a series |
| mbr mbs mul scp sgl sgm sgms sgs | 1.7 | Term | 4ed8bc66 | mechanic | company | members | — | s. 605.0108(3) |
| mul scp sgl sgs | 1.8 | Location of Records | 34bea4c4 | covenant | manager | members | The records were not kept where the agreement says, so they were not maintained. | s. 605.0410(1) |
| mbr mbs | 1.8 | Location of Records | 79554fa8 | covenant | manager | members | The records were not kept where the agreement says, so they were not maintained. | s. 605.0410(1) |
| sgm sgms | 1.8 | Location of Records | fdec2ea1 | covenant | manager | members | The records were not kept where the agreement says, so they were not maintained. | s. 605.0410(1) |
| mul scp sgl sgs | 1.9 | Filings | 14414961 | covenant | manager | members | The manager did not file what the agreement required, so the series lacks the standing it claims. | s. 605.2201 |
| mbr mbs | 1.9 | Filings | d789508c | covenant | manager | members | The manager did not file what the agreement required, so the series lacks the standing it claims. | s. 605.2201 |
| sgm sgms | 1.9 | Filings | b50bf394 | covenant | manager | members | The manager did not file what the agreement required, so the series lacks the standing it claims. | s. 605.2201 |
| mbr mbs mul scp sgl sgm sgms sgs | 1.10 | How Assets Are Associated | de49f23e | statutory-route | — | members | — | s. 605.2301 |
| sgl sgm sgms sgs | 1.11 | Membership Interest | 3adc00c1 | definition | — | members | — | s. 605.0102(41) |
| mbr mbs mul scp | 1.11 | Waiver of Partition Rights | e24cf863 | benefit | members | company members | — | common law |
| mbr mbs mul scp sgl sgm sgms sgs | 2.1 | "Act" | 1f5154e3 | definition | — | members manager | — | ch. 605 |
| mul scp sgl sgm sgms sgs | 2.2 | "Associated Asset" | 6bc88113 | definition | — | members | — | s. 605.2102(2) |
| mbr mbs | 2.2 | "Administrative Member" | 45b7580e | definition | — | members | — | drafting convention |
| mul scp sgl sgm sgms sgs | 2.3 | "Associated Liability" | c6835881 | definition | — | members | — | no statutory definition; ours |
| mbr mbs | 2.3 | "Associated Asset" | 6bc88113 | definition | — | members | — | s. 605.2102(2) |
| mul scp sgl sgm sgms sgs | 2.4 | "Associated Member" | 84872358 | definition | — | members | — | s. 605.2302 |
| mbr mbs | 2.4 | "Associated Liability" | c6835881 | definition | — | members | — | no statutory definition; ours |
| mul scp sgl sgm | 2.5 | "Company" | 3e7a84d5 | definition | — | members manager | — | drafting convention |
| mbr mbs | 2.5 | "Associated Member" | 84872358 | definition | — | members | — | s. 605.2302 |
| sgms sgs | 2.5 | "Code" | a52078b8 | definition | — | member | — | IRC 1361, 1362, 1378 |
| sgl sgm | 2.6 | "Immediate Family Member" | e9425924 | definition | — | members | — | drafting convention |
| mul scp | 2.6 | "Immediate Family Member" | c9ea8021 | definition | — | members | — | drafting convention |
| mbr mbs sgms sgs | 2.6 | "Company" | 3e7a84d5 | definition | — | members manager | — | drafting convention |
| mul scp sgl sgm | 2.7 | "Incapacitated" | 7f0e40b4 | definition | — | members manager | — | ch. 744, Fla. Stat.; standard durable-power-of-attorney practice |
| mbr mbs | 2.7 | "Immediate Family Member" | c9ea8021 | definition | — | members | — | drafting convention |
| sgms sgs | 2.7 | "Immediate Family Member" | e9425924 | definition | — | members | — | drafting convention |
| sgl | 2.8 | "Manager" | bcaedf26 | definition | — | members manager | — | s. 605.0102(31) |
| mul scp | 2.8 | "Involuntary Transfer" | 9b2fd4b9 | definition | — | members | — | drafting convention |
| mbr mbs sgms sgs | 2.8 | "Incapacitated" | 7f0e40b4 | definition | — | members manager | — | ch. 744, Fla. Stat.; standard durable-power-of-attorney practice |
| sgm | 2.8 | "Member" | 9d0067b8 | definition | — | members | — | s. 605.0102(40) |
| sgl sgms | 2.9 | "Member" | 9d0067b8 | definition | — | members | — | s. 605.0102(40) |
| mul scp | 2.9 | "Majority in Interest" | 310dbe0d | definition | — | members | — | s. 605.04073(1)(c) |
| mbr mbs | 2.9 | "Involuntary Transfer" | 9b2fd4b9 | definition | — | members | — | drafting convention |
| sgs | 2.9 | "Manager" | bcaedf26 | definition | — | members manager | — | s. 605.0102(31) |
| sgm | 2.9 | "Membership Interest" | 4c485ee0 | definition | — | members | — | s. 605.0102(41) |
| sgl sgms | 2.10 | "Membership Interest" | 4c485ee0 | definition | — | members | — | s. 605.0102(41) |
| mul scp | 2.10 | "Manager" | bcaedf26 | definition | — | members manager | — | s. 605.0102(31) |
| mbr mbs | 2.10 | "Majority in Interest" | 310dbe0d | definition | — | members | — | s. 605.04073(1)(c) |
| sgs | 2.10 | "Member" | 9d0067b8 | definition | — | members | — | s. 605.0102(40) |
| sgm | 2.10 | "Protected Series" | d9412d95 | definition | — | members | — | s. 605.2102(8) |
| sgl sgms | 2.11 | "Protected Series" | d9412d95 | definition | — | members | — | s. 605.2102(8) |
| mbr mbs mul scp | 2.11 | "Member" | b5f3896b | definition | — | members | — | s. 605.0102(40) |
| sgs | 2.11 | "Membership Interest" | 4c485ee0 | definition | — | members | — | s. 605.0102(41) |
| sgm | 2.11 | "Protected Series Designation" | f35c80e6 | definition | — | members | — | s. 605.2201 |
| sgl sgms | 2.12 | "Protected Series Designation" | f35c80e6 | definition | — | members | — | s. 605.2201 |
| mbr mbs mul scp | 2.12 | "Membership Interest" | 44cba7a2 | definition | — | members | — | s. 605.0102(41) |
| sgs | 2.12 | "Protected Series" | d9412d95 | definition | — | members | — | s. 605.2102(8) |
| sgm | 2.12 | "Series Exhibit" | 7ef43e0c | definition | — | members | — | drafting convention |
| sgl | 2.13 | "Protected Series Manager" | 356e1117 | definition | — | members manager | — | s. 605.2102(9) |
| mbr mbs mul scp | 2.13 | "Percentage Interest" | be447c4c | definition | — | members | — | s. 605.04073(1)(b) |
| sgs | 2.13 | "Protected Series Designation" | f35c80e6 | definition | — | members | — | s. 605.2201 |
| sgm | 2.13 | "Transfer" | a5129002 | definition | — | members | — | drafting convention |
| sgms | 2.13 | "Series Exhibit" | 7ef43e0c | definition | — | member | — | drafting convention |
| sgl | 2.14 | "Series Exhibit" | 7ef43e0c | definition | — | members | — | drafting convention |
| mbr mbs mul scp | 2.14 | "Protected Series" | d9412d95 | definition | — | members | — | s. 605.2102(8) |
| sgs | 2.14 | "Protected Series Manager" | 356e1117 | definition | — | members manager | — | s. 605.2102(9) |
| sgms | 2.14 | "Transfer" | a5129002 | definition | — | member | — | drafting convention |
| sgl | 2.15 | "Transfer" | a5129002 | definition | — | members | — | drafting convention |
| mbr mbs mul scp | 2.15 | "Protected Series Designation" | f35c80e6 | definition | — | members | — | s. 605.2201 |
| sgs | 2.15 | "Series Exhibit" | 7ef43e0c | definition | — | members | — | drafting convention |
| mul scp | 2.16 | "Protected Series Manager" | 356e1117 | definition | — | members manager | — | s. 605.2102(9) |
| mbr mbs | 2.16 | "Series Exhibit" | 7998e3b3 | definition | — | members | — | drafting convention |
| sgs | 2.16 | "Transfer" | a5129002 | definition | — | members | — | drafting convention |
| mul scp | 2.17 | "Series Exhibit" | 7998e3b3 | definition | — | members | — | drafting convention |
| mbr mbs | 2.17 | "Transfer" | a5129002 | definition | — | members | — | drafting convention |
| mul scp | 2.18 | "Transfer" | a5129002 | definition | — | members | — | drafting convention |
| sgl sgs | 3.1 | Establishment | 37edb48e | authority | company members | members | — | s. 605.2201 |
| mul scp | 3.1 | Establishment | 6411b254 | authority | company members | members | — | s. 605.2201 |
| mbr mbs | 3.1 | Establishment | 8c9018bb | authority | company members | members | — | s. 605.2201 |
| sgm sgms | 3.1 | Establishment | 19ce69b6 | authority | company members | members | — | s. 605.2201 |
| sgl sgs | 3.2 | Status of Each Protected Series | 46e12a62 | statutory-route | — | members series | — | ss. 605.2104, 605.2201 |
| mul scp | 3.2 | Status of Each Protected Series | a2fc6c48 | statutory-route | — | members series | — | ss. 605.2104, 605.2201 |
| mbr mbs | 3.2 | Status of Each Protected Series | 87e0ec17 | statutory-route | — | members series | — | ss. 605.2104, 605.2201 |
| sgm sgms | 3.2 | Status of Each Protected Series | a9b565eb | statutory-route | — | members series | — | ss. 605.2104, 605.2201 |
| sgl sgs | 3.3 | Limitation of Liability Among Series (Statutory Shields) | eadcbd5b | statutory-route | — | members series company | — | s. 605.2401 |
| mul scp | 3.3 | Limitation of Liability Among Series (Statutory Shields) | d197829d | statutory-route | — | members series company | — | s. 605.2401 |
| mbr mbs | 3.3 | Limitation of Liability Among Series (Statutory Shields) | 762530e8 | statutory-route | — | members series company | — | s. 605.2401 |
| sgm sgms | 3.3 | Limitation of Liability Among Series (Statutory Shields) | b41afb07 | benefit | — | member series company | — | s. 605.2401; the Member now holds the protected-series manager office, so the shield names that capacity |
| mbr mbs mul scp sgl sgm sgms sgs | 3.4 | Dissolution of a Protected Series Distinguished | ab68ccd0 | statutory-route | — | members | — | s. 605.2501 |
| mul scp sgl | 3.5 | Series Exhibits Control Series Terms | 70d3c7b8 | mechanic | company | members | — | drafting convention |
| mbr mbs sgm | 3.5 | Series Exhibits Control Series Terms | a3eb038e | mechanic | company | members | — | drafting convention |
| sgs | 3.5 | Series Exhibits Control Series Terms | bd0bfd2d | mechanic | company | members | — | drafting convention |
| sgms | 3.5 | Series Exhibits Control Series Terms | 3e179bb7 | mechanic | company | member | — | drafting convention; the Article 9 carve-out stops a Series Exhibit from varying the S corporation terms |
| mbr mbs mul scp sgl sgm sgms sgs | 3.6 | Company as Owner | a566e682 | statutory-route | — | members company | — | s. 605.2303(1)-(3) |
| sgl | 4.1 | Sole Member | 86821bf1 | mechanic | — | member | — | drafting convention |
| mul scp | 4.1 | Members; Percentage Interests | 65ad85a1 | mechanic | — | members | — | s. 605.04073(1)(b) |
| mbr mbs | 4.1 | Members; Percentage Interests | eaf1d35a | mechanic | — | members | — | s. 605.04073(1)(b) |
| sgs | 4.1 | Sole Member | 149ef929 | mechanic | — | member | — | drafting convention |
| sgm | 4.1 | Sole Member | baf17f0f | mechanic | — | member | — | drafting convention |
| sgms | 4.1 | Sole Member | c304d44d | mechanic | — | member | — | drafting convention; the single class of ownership is IRC 1361(b)(1)(D) |
| sgl sgm sgms sgs | 4.2 | No Series-Level Ownership | d1845c86 | statutory-route | — | members | — | ss. 605.2302(1), 605.2303 |
| mbr mbs mul scp | 4.2 | No Series-Level Ownership | df25fdbf | statutory-route | — | members | — | ss. 605.2302(1), 605.2303 |
| sgl sgm sgms sgs | 4.3 | Limited Liability | 3b4531b8 | benefit | — | member | — | s. 605.0304 |
| mbr mbs mul scp | 4.3 | Voting | 3126c1e9 | authority | members | members | — | s. 605.04073; the spousal sentence now reads "tenants by the entirety" — Adam, 16 August: "It is typically not plural. I prefer the plural never be used." Only the plural changed; the consensus-of-both-spouses rule is unaltered |
| sgl sgs | 4.4 | No Agency by Status | b494e85e | benefit | — | member | — | s. 605.04074(2)(a) |
| mul scp | 4.4 | Meetings; Written Consents | 896b1845 | mechanic | members | members | — | s. 605.04073(4), (6) |
| mbr mbs | 4.4 | Meetings; Written Consents | ef89ac7e | mechanic | members | members | — | s. 605.04073(4), (6) |
| sgm sgms | 4.4 | Other Activities | 3bd43f35 | benefit | — | member manager | — | s. 605.04091(5) |
| sgl sgs | 4.5 | Other Activities | 42b7c7de | benefit | — | member manager | — | s. 605.04091(5) |
| mbr mbs mul scp | 4.5 | Limited Liability; No Agency | e2f32855 | benefit | — | members | — | ss. 605.0304, 605.04074(2)(a) |
| sgm | 4.5 | Transfer on Death Designation | 14e9e0c9 | benefit | company | member third-party | — | ss. 711.50-711.512, Fla. Stat.; only an individual member may register in beneficiary form (s. 711.502) |
| sgms | 4.5 | Transfer on Death Designation | 8e8dcb55 | benefit | company | member third-party | — | ss. 711.50-711.512, Fla. Stat.; only an individual member may register in beneficiary form (s. 711.502); the beneficiary must be an eligible shareholder under IRC 1361 |
| sgl | 4.6 | Transfer on Death Designation | 22e8ac30 | benefit | company | member third-party | — | ss. 711.50-711.512, Fla. Stat.; only an individual member may register in beneficiary form (s. 711.502) |
| mul scp | 4.6 | Duty to Participate in Governance | 3cfedf2d | covenant | members | members | A member who missed votes breached the agreement, so the company was not run as the document describes. | none; ours, to support the personal-service position in Art. 11 |
| mbr mbs | 4.6 | Duty to Participate in Governance | dfa66454 | covenant | members | members | A member who missed votes breached the agreement, so the company was not run as the document describes. | none; ours, to support the personal-service position in Art. 11 |
| sgs | 4.6 | Transfer on Death Designation | f0ed25d5 | benefit | company | member third-party | — | ss. 711.50-711.512, Fla. Stat.; only an individual member may register in beneficiary form (s. 711.502) |
| sgm sgms | 4.6 | Incapacity of the Member | ee8046af | benefit | company manager | member | — | ch. 744, Fla. Stat.; s. 605.0602(6) |
| sgl sgs | 4.7 | Incapacity of the Member | 0f9e940d | benefit | company manager | member | — | ch. 744, Fla. Stat.; s. 605.0602(6) |
| mbr mbs mul scp | 4.7 | Competition. [SELECT ONE ALTERNATIVE — see Instructions] | f33c9018 | covenant | members | members | The member competed in breach of the agreement — a claim among the members, not against the company. | s. 605.04091(2)(c) as varied under s. 605.0105(3) |
| mbr mbs mul scp | 4.8 | Confidentiality | 769fb729 | covenant | members | members company | The member disclosed confidential information in breach of the agreement. | s. 605.04091(2) |
| mbr mbs mul scp | 4.9 | Non-Disparagement; No Interference | 88367cf9 | covenant | members | members company | The member interfered in breach of the agreement. | none; ours |
| mbr mbs mul scp | 4.10 | Information Rights | b897a44b | benefit | company | members | — | ss. 605.0410, 605.2305 |
| mul scp | 4.11 | Transfer on Death Designation | 9876b403 | benefit | company | members third-party | — | ss. 711.50-711.512, Fla. Stat.; only an individual member may register in beneficiary form, and not joint holders as tenants in common (s. 711.502) |
| mbr mbs | 4.11 | Transfer on Death Designation | bf0fa033 | benefit | company | members third-party | — | ss. 711.50-711.512, Fla. Stat.; only an individual member may register in beneficiary form, and not joint holders as tenants in common (s. 711.502) |
| mul scp | 4.12 | Incapacity of a Member | afdee6cc | benefit | company manager members | members | — | ch. 744, Fla. Stat.; s. 605.0602(6) |
| mbr mbs | 4.12 | Incapacity of a Member | 09d33983 | benefit | company members | members | — | ch. 744, Fla. Stat.; s. 605.0602(6) |
| sgl sgs | 5.1 | Manager-Managed; the Manager | 0af0229e | authority | manager member | member manager | — | ss. 605.04072, 605.04073(2), 605.04074(2)(b); the appointment sentence moved from oa.ts into the master on 17 August as a singular/plural pair — same operative terms, no substantive change |
| mul scp | 5.1 | Manager-Managed; the Manager | 6e7136b6 | authority | manager members | members manager | — | ss. 605.04072, 605.04073(2), 605.04074(2)(b); the appointment sentence moved from oa.ts into the master on 17 August as a singular/plural pair — same operative terms, no substantive change |
| mbr mbs | 5.1 | Member-Managed | b9f7026e | authority | members | members | — | ss. 605.0407(1), 605.04073(1) |
| sgm sgms | 5.1 | Member-Managed | c3a381a5 | authority | members | members | — | ss. 605.0407(1), 605.04073(1) |
| sgl sgs | 5.2 | Management of Each Protected Series | 9391162b | authority | manager | member series | — | ss. 605.2304(2), 605.2107(1)(n) |
| mul scp | 5.2 | Management of Each Protected Series | 00750ec0 | authority | manager | members series | — | ss. 605.2304(2), 605.2107(1)(n) |
| mbr mbs | 5.2 | Management of Each Protected Series | 8d99d6e7 | authority | members | members series | The Company was the protected-series manager, so a management-conduct judgment against the Company exposed its ownership of every series — each a single-owner interest a company creditor could take outright rather than charge. | ss. 605.2304(2), 605.2107(1)(n); varied per Adam 2026-08-18: management authority carries liability, and the one holder it must never rest on is the entity that owns all the series interests (s. 605.2303) |
| sgm sgms | 5.2 | Management of Each Protected Series | 21315c82 | authority | member | member series | — | ss. 605.2304(1)-(2), 605.2107(1)(n) |
| mul scp sgl sgs | 5.3 | Authority of the Manager | e6c44bc9 | authority | manager | members manager | — | s. 605.04073(2) |
| mbr mbs | 5.3 | Voting; Decisions | 0b631d8f | authority | members | members | — | s. 605.04073 |
| sgm sgms | 5.3 | Authority to Act | 088acca7 | authority | member | member third-party | — | ss. 605.04074(1), 605.0301 |
| sgl | 5.4 | Actions Requiring Member Approval | 40922d7a | authority | manager | members | the Manager moved the building into another series without the members' consent | ss. 605.04073(2)(d), 605.0302, 605.2301 |
| mul scp | 5.4 | Actions Requiring Member Approval | dcfcd3e4 | authority | manager | members | the Manager moved the building into another series without the members' consent | ss. 605.04073(2)(d), 605.0302, 605.2301 |
| mbr mbs | 5.4 | Authority to Act; Limits on Authority | be68b5c7 | authority | members | members | — | s. 605.04074(1) |
| sgs | 5.4 | Actions Requiring Member Approval | a36d5790 | authority | manager | members | the Manager moved the building into another series without the members' consent | ss. 605.04073(2)(d), 605.0302, 605.2301 |
| sgm sgms | 5.4 | Standard of Conduct; Exculpation | 048c8e4a | benefit | manager member | manager member | — | ss. 605.04091, 605.0105(3) |
| sgl sgs | 5.5 | Standard of Conduct; Exculpation | cce8e03a | benefit | manager member | manager member | — | ss. 605.04091, 605.0105(3) |
| mul scp | 5.5 | Standard of Conduct; Exculpation | db5f385a | benefit | manager members | manager members | — | ss. 605.04091, 605.0105(3) |
| mbr mbs | 5.5 | Actions Requiring Member Approval | f455ec6e | authority | members | members | the Member moved the building into another series without the other members' consent | ss. 605.04073(1)(c), 605.0302, 605.2301 |
| sgm sgms | 5.5 | Indemnification | 789d7df9 | benefit | company series | member | — | s. 605.0408 |
| mul scp sgl sgs | 5.6 | Indemnification | 88f2b141 | benefit | company series | manager members | — | s. 605.0408 |
| mbr mbs | 5.6 | Standard of Conduct; Exculpation | dfa8cbf5 | benefit | manager members | manager members | — | ss. 605.04091, 605.0105(3) |
| sgm sgms | 5.6 | Reimbursement; Shared Expenses | 1892460b | benefit | company | member | — | s. 605.04091(1); the shared-expense allocation is the record Article 8 relies on |
| sgl sgs | 5.7 | Compensation; Reimbursement; Shared Expenses | a0c4af21 | benefit | company | manager member | — | s. 605.04091(1) |
| mul scp | 5.7 | Compensation; Reimbursement; Shared Expenses | 95dfa725 | benefit | company | manager members | — | s. 605.04091(1) |
| mbr mbs | 5.7 | Indemnification | b6c395f8 | benefit | company series | manager members | — | s. 605.0408 |
| sgm sgms | 5.7 | Statement of Authority | c16a3718 | authority | company | members manager third-party | — | s. 605.0302 |
| sgl sgs | 5.8 | Statement of Authority | 05628a3d | authority | company | members manager third-party | — | s. 605.0302 |
| mul scp | 5.8 | Statement of Authority | df63a96d | authority | company | members manager third-party | — | s. 605.0302 |
| mbr mbs | 5.8 | Administrative Member | 8a779b5a | authority | members | members | — | drafting convention |
| mul scp | 5.9 | Competition; Other Activities of the Manager. [SELECT THE SAME ALTERNATIVE AS SECTION 4.7] | b206cf04 | covenant | members | members | The member competed in breach of the agreement — a claim among the members, not against the company. | s. 605.04091(2)(c) as varied under s. 605.0105(3) |
| mbr mbs | 5.9 | Statement of Authority | 0cce8cea | authority | company | members manager third-party | — | s. 605.0302 |
| mbr mbs | 5.10 | Compensation; Reimbursement; Shared Expenses | 5d683322 | benefit | company | manager members | — | s. 605.04091(1) |
| sgl sgm sgms sgs | 6.1 | Contributions | 2d7ae1b4 | mechanic | — | members | — | s. 605.0402 |
| mbr mbs mul scp | 6.1 | Initial Contributions | 1b58f807 | mechanic | — | members | — | s. 605.0402 |
| sgl sgm sgms sgs | 6.2 | No Obligation; No Interest | 0b816109 | benefit | — | member | — | s. 605.0403 |
| mbr mbs mul scp | 6.2 | Additional Capital Contributions. [OPTIONAL PROVISION — include or omit; see Instructions] | a81f665c | covenant | members | members | The member did not fund a call properly made — a claim among the members. | s. 605.0403(1) |
| sgl sgm sgms sgs | 6.3 | Separate Accounting | bb65e291 | covenant | company | members | The company did not keep the separate accounting its own agreement requires, so the silos were not respected. | none; ours |
| mbr mbs mul scp | 6.3 | Failure to Contribute | c6b59ea6 | mechanic | members | members | — | s. 605.0403 |
| sgl sgm | 6.4 | Member Loans | 9dadf32f | mechanic | members | members | — | s. 605.0110(3) |
| mbr mbs mul scp | 6.4 | No Interest; No Withdrawal | 346896e8 | benefit | members | company members | — | s. 605.0404 |
| sgms sgs | 6.4 | Member Loans | 82dc23b3 | mechanic | members | members | — | s. 605.0110(3) |
| sgl sgm sgms sgs | 6.5 | No Right to Specific Property | f3efef85 | benefit | members | company members | — | s. 605.0110(1) |
| mbr mbs mul scp | 6.5 | Member Loans | 99d1121e | mechanic | members | members | — | s. 605.0110(3) |
| mbr mul | 6.6 | Capital Accounts | 9932dfcc | mechanic | company | members | — | Treas. Reg. 1.704-1(b)(2)(iv) |
| mbs scp | 6.6 | Contribution Records; Identical Rights | 31a89541 | mechanic | company | members | — | IRC 1361(b)(1)(D) |
| mbr mbs mul scp | 6.7 | No Right to Specific Property | 3e1803bb | benefit | members | company members | — | s. 605.0110(1) |
| sgl sgs | 7.1 | Distributions | 0c3c8347 | authority | manager | member | — | s. 605.0404 |
| mul | 7.1 | Allocations | b3e8d7e5 | mechanic | company | members | — | IRC 704(b); 1361(b)(1)(D) for the S forms |
| mbs scp | 7.1 | Allocations | 5ee5aa81 | mechanic | company | members | — | IRC 704(b); 1361(b)(1)(D) for the S forms |
| mbr | 7.1 | Allocations | 1ab53dac | mechanic | company | members | — | IRC 704(b); 1361(b)(1)(D) for the S forms |
| sgm sgms | 7.1 | Distributions | 50a4e16f | authority | manager | member | — | s. 605.0404 |
| sgl sgm sgms sgs | 7.2 | Source Limitation | 40e0cd75 | benefit | manager | series | the series paid its owner's owner directly, so nobody was respecting the silos | ss. 605.2303(2), 605.2401(2) |
| mul | 7.2 | Distributions | 17034e98 | authority | manager members | members | — | s. 605.0404 |
| scp | 7.2 | Distributions | 14ee142f | authority | manager members | members | — | s. 605.0404 |
| mbr | 7.2 | Distributions | e8cfc8f9 | authority | manager members | members | — | s. 605.0404 |
| mbs | 7.2 | Distributions | 7d29af44 | authority | manager members | members | — | s. 605.0404 |
| mul | 7.3 | Tax Distributions | 1c52aaa7 | authority | manager members | members | — | s. 605.0404 |
| scp | 7.3 | Tax Distributions | 7ecf5184 | authority | manager members | members | — | s. 605.0404 |
| mbr | 7.3 | Tax Distributions | 4f27ae8e | authority | manager members | members | — | s. 605.0404 |
| mbs | 7.3 | Tax Distributions | c1c945cc | authority | manager members | members | — | s. 605.0404 |
| sgl sgs | 8.1 | Records | 22a1d870 | covenant | manager | member | The records were not maintained by the person the agreement names, and I was never shown the series records. | ss. 605.2301(2)(a), 605.0410, 605.2305 |
| mul scp | 8.1 | Records | 495681ad | covenant | manager | members | The records were not maintained by the person the agreement names. | s. 605.2301(2)(a) |
| mbr mbs | 8.1 | Records | 17f045db | covenant | manager | members | The records were not maintained by the person the agreement names. | s. 605.2301(2)(a) |
| sgm sgms | 8.1 | Records | ec83e036 | covenant | manager | member | The records were not maintained by the person the agreement names, and I was never shown the series records. | ss. 605.2301(2)(a), 605.0410, 605.2305 |
| mul scp sgl sgs | 8.2 | Asset Association Records | 61ff2bee | covenant | manager | members | The records do not meet the standard the agreement itself sets, so the assets were never associated. | s. 605.2301(2)(a), (4) |
| mbr mbs | 8.2 | Asset Association Records | 43a3675a | covenant | manager | members | The records do not meet the standard the agreement itself sets, so the assets were never associated. | s. 605.2301(2)(a), (4) |
| sgm sgms | 8.2 | Asset Association Records | 60a617c5 | covenant | manager | members | The records do not meet the standard the agreement itself sets, so the assets were never associated. | s. 605.2301(2)(a), (4) |
| mbr mbs mul scp sgl sgm sgms sgs | 8.3 | Real Property | 77263b30 | statutory-route | — | members series | — | s. 605.2301(2)(b), (3)(b) |
| sgl sgs | 8.4 | Holding Associated Assets | 5fbf2f0d | benefit | company series | members | — | s. 605.2301(5) |
| mul scp | 8.4 | Holding Associated Assets | cf35798b | benefit | company series | members | — | s. 605.2301(5) |
| mbr mbs | 8.4 | Holding Associated Assets | 3b8d0f0b | benefit | company series | members | — | s. 605.2301(5) |
| sgm sgms | 8.4 | Holding Associated Assets | 0cdcdff1 | benefit | company series | members | — | s. 605.2301(5) |
| mul scp sgl sgs | 8.5 | Standing Association Rules; Savings Provisions | af447ece | benefit | — | members series company | — | s. 605.2301(2)(a), (4); s. 605.2404(4) burden of proof |
| mbr mbs | 8.5 | Standing Association Rules; Savings Provisions | d49d603a | benefit | — | members series company | — | s. 605.2301(2)(a), (4); s. 605.2404(4) burden of proof |
| sgm sgms | 8.5 | Standing Association Rules; Savings Provisions | 88edee94 | benefit | — | members series company | — | s. 605.2301(2)(a), (4); s. 605.2404(4) burden of proof |
| mbr mbs mul scp sgl sgm sgms sgs | 8.6 | Movement of an Asset Between Protected Series | e77a53b4 | mechanic | company series | members series company | — | ss. 605.2301(2)(a)3, 605.0404, 605.0405 |
| sgl sgm | 9.1 | Intended Classification | 10663e90 | benefit | member | member | — | Treas. Reg. 301.7701-3 |
| mbr mul | 9.1 | Intended Classification | 6c18356d | benefit | members | members | — | Treas. Reg. 301.7701-3 |
| mbs scp | 9.1 | S Corporation Status | 86c3eddc | benefit | members | members | — | IRC 1362 |
| sgs | 9.1 | S Corporation Status | b0a7f370 | benefit | member | member | — | IRC 1362; the single-member form of the election |
| sgms | 9.1 | S Corporation Status | 3ab29999 | benefit | member | member | — | IRC 1362; the member-managed single-member form of the election |
| sgl | 9.2 | Tax Filings and Elections | 33370c47 | authority | manager | members | — | IRC 6031 |
| mul | 9.2 | Tax Returns; Information | c3466478 | covenant | manager | members | The manager did not deliver the tax information the agreement requires — a claim among the members. | IRC 6031(b) |
| scp | 9.2 | Returns; Information | 90b2b500 | covenant | manager | members | The manager did not deliver the tax information the agreement requires — a claim among the members. | IRC 6037 |
| mbr | 9.2 | Tax Returns; Information | a115b23e | covenant | manager | members | The manager did not deliver the tax information the agreement requires — a claim among the members. | IRC 6031(b) |
| mbs | 9.2 | Returns; Information | 1186ce7a | covenant | manager | members | The manager did not deliver the tax information the agreement requires — a claim among the members. | IRC 6037 |
| sgs | 9.2 | Returns; Information | 37eb8070 | covenant | manager | member | The Manager never filed the 1120-S and never gave me the K-1. | IRC 6037 |
| sgm | 9.2 | Tax Filings and Elections | fd6dca13 | authority | manager | members | — | IRC 6031 |
| sgms | 9.2 | Returns | 1f75edfe | authority | member | member | — | IRC 6037 |
| sgl | 9.3 | Fiscal Year | cc0c6c19 | mechanic | company | member | — | IRC 706 |
| mul | 9.3 | Partnership Representative | e7d81c29 | authority | manager | members | — | IRC 6223 |
| mbs scp | 9.3 | Protecting the Election | 2a033950 | covenant | members | members | The transfer breached the agreement's S corporation restrictions — a claim among the members. | IRC 1361(b) |
| mbr | 9.3 | Partnership Representative | d4a24a46 | authority | manager | members | — | IRC 6223 |
| sgs | 9.3 | Protecting the Election | 3edcb689 | covenant | member manager | member | A transfer or admission blew the election and the Company was taxed as a C corporation from that day. | IRC 1361, 1362 |
| sgm | 9.3 | Fiscal Year | 1b397ee7 | mechanic | company | member | — | IRC 706 |
| sgms | 9.3 | Protecting the Election | a5da6cde | covenant | member | member | A transfer, TOD designation, or admission blew the election and the Company was taxed as a C corporation from that day. | IRC 1361, 1362 |
| mul | 9.4 | Tax Elections | 4ca8f78f | authority | manager members | members | — | IRC 754 |
| scp | 9.4 | S Corporation Status; Intent; Savings Clause | 9ae38848 | benefit | members | members | — | IRC 1361, 1362 |
| mbr | 9.4 | Tax Elections | 157b3294 | authority | manager members | members | — | IRC 754 |
| mbs | 9.4 | S Corporation Status; Intent; Savings Clause | 5f4827e9 | benefit | members | members | — | IRC 1361, 1362 |
| sgs | 9.4 | Intent; Savings Clause | 1ecf2164 | benefit | — | member | — | IRC 1361, 1362(f) |
| sgms | 9.4 | Intent; Savings Clause | 39ee4012 | benefit | — | member | — | IRC 1361, 1362(f) |
| mul | 9.5 | Fiscal Year | 19362c64 | mechanic | company | members | — | IRC 706; 1378 for the S forms |
| scp | 9.5 | Other Elections | 2da32cea | authority | manager members | members | — | IRC 1362 |
| mbr | 9.5 | Fiscal Year | 5c940732 | mechanic | company | members | — | IRC 706; 1378 for the S forms |
| mbs | 9.5 | Other Elections | 8869aa20 | authority | manager members | members | — | IRC 1362 |
| sgs | 9.5 | Other Elections | 0e08a85e | authority | manager | member | — | IRC 1362 |
| sgms | 9.5 | Other Elections | afecf99a | authority | member | member | — | IRC 1362 |
| scp | 9.6 | Fiscal Year | 98ee3c50 | mechanic | company | members | — | IRC 706; 1378 for the S forms |
| mbs | 9.6 | Fiscal Year | 30cd60ee | mechanic | company | members | — | IRC 706; 1378 for the S forms |
| sgs | 9.6 | Fiscal Year | 83c6bc46 | mechanic | company | member | — | IRC 1378, the required year for an S corporation |
| sgms | 9.6 | Fiscal Year | 3d397f14 | mechanic | company | member | — | IRC 1378, the required year for an S corporation |
| sgl sgm | 10.1 | Admission | 2b14cbb5 | authority | member | member | — | s. 605.0401(3) |
| mul scp | 10.1 | Restriction on Transfer | 3ca8ae94 | covenant | members | members | The member transferred in breach of the agreement — a claim among the members, and the transferee takes as a transferee only. | ss. 605.0502, 605.0602 |
| mbr mbs | 10.1 | Restriction on Transfer | 8f158066 | covenant | members | members | The member transferred in breach of the agreement — a claim among the members, and the transferee takes as a transferee only. | ss. 605.0502, 605.0602 |
| sgms sgs | 10.1 | Admission | ded766f0 | authority | member | member | — | s. 605.0401(3) |
| sgl sgm sgms sgs | 10.2 | No Association with a Protected Series | aa036b65 | covenant | company members | members | The company associated a member with a series in breach of its own agreement. | s. 605.2302; preserves the disregarded/partnership design |
| mbr mbs mul scp | 10.2 | Permitted Family Transfers | 384fae5f | benefit | members | members | — | s. 605.0502 |
| sgl sgm sgms sgs | 10.3 | Continuation on Termination of Last Member | ea924089 | benefit | — | members company | — | s. 605.0701(3) |
| mbr mbs mul scp | 10.3 | Rights of Transferees | 81b80fe4 | benefit | — | members company | — | s. 605.0502(3) |
| mul scp | 10.4 | Involuntary Transfers; Option to Acquire | c5cfced5 | benefit | members | members company | — | ss. 605.0502, 605.0503 |
| mbr mbs | 10.4 | Involuntary Transfers; Option to Acquire | dbd8051f | benefit | members | members company | — | ss. 605.0502, 605.0503 |
| mbr mbs mul scp | 10.5 | No Dissociation by Transfer Alone | 578ce2db | benefit | — | members | — | s. 605.0602(5) |
| mbr mbs mul scp | 10.6 | Charging Order — Exclusive Remedy | 7cb3504e | statutory-route | — | members | — | ss. 605.0503, 605.0503(7) |
| sgl sgm sgms sgs | 11.1 | Dissolution of a Protected Series | baccbda5 | mechanic | — | members series | — | s. 605.2501 |
| mbr mbs mul scp | 11.1 | Executory Contract | 050e6248 | benefit | members | members company | — | 11 U.S.C. 365; In re Soderstrom |
| sgl sgs | 11.2 | Winding Up a Protected Series | 90fe7e4e | mechanic | manager members | members series | — | s. 605.2502 |
| mul scp | 11.2 | Personal Service Agreement; No Assumption or Assignment | 439e9643 | benefit | members | members company | — | 11 U.S.C. 365(c); In re Soderstrom |
| mbr mbs | 11.2 | Personal Service Agreement; No Assumption or Assignment | 3d769064 | benefit | members | members company | — | 11 U.S.C. 365(c); In re Soderstrom |
| sgm sgms | 11.2 | Winding Up a Protected Series | d91e5962 | mechanic | manager members | members series | — | s. 605.2502 |
| sgl sgm sgms sgs | 11.3 | Dissolution of the Company | 922d7938 | mechanic | — | member | — | s. 605.0701 |
| mbr mbs mul scp | 11.3 | Compliance upon Assumption or Rejection | 5c8f9b13 | benefit | members | members company | — | 11 U.S.C. 365 |
| sgl sgs | 11.4 | Winding Up the Company | 697fd05e | mechanic | manager member | member | — | ss. 605.0709, 605.0710 |
| sgm sgms | 11.4 | Winding Up the Company | dfb0f7ba | mechanic | manager member | member | — | ss. 605.0709, 605.0710 |
| sgl sgm sgms sgs | 11.5 | Recourse Limited | a5f259ef | benefit | — | member | — | s. 605.0405; the single-member form carries no capital accounts, so deficit-restoration language was removed 2026-08-16, as it was from the S corporation forms on 2026-08-14 |
| sgl sgs | 12.1 | Amendments | 95c1e577 | authority | member | member | — | s. 605.04073(1)(d), (2)(e) |
| mbr mbs mul scp | 12.1 | Admission of Members | fc6d8b94 | authority | members | members | — | s. 605.0401(3) |
| sgm sgms | 12.1 | Amendments | cdcc7c0d | authority | member | member | — | s. 605.04073(1)(d), (2)(e) |
| sgl sgm sgms sgs | 12.2 | Action by Written Consent | 57614354 | mechanic | members | members | — | s. 605.04073(4) |
| mbr mbs mul scp | 12.2 | No Association with a Protected Series | aa036b65 | covenant | company members | members | The company associated a member with a series in breach of its own agreement. | s. 605.2302; preserves the disregarded/partnership design |
| mbr mbs mul scp | 12.3 | Continuation on Termination of Last Member | 0415885d | benefit | — | members company | — | s. 605.0701(3) |
| sgl sgs | 13.1 | Governing Law; Internal Affairs | 053b67a8 | mechanic | — | members manager | — | s. 605.0104 |
| mbr mbs mul scp | 13.1 | No Voluntary Withdrawal | bd50185a | covenant | members | members company | The member withdrew in breach of the agreement — a claim among the members. | s. 605.0601 |
| sgm sgms | 13.1 | Governing Law; Internal Affairs | 7fe1013c | mechanic | — | members manager | — | s. 605.0104 |
| sgl sgm sgms sgs | 13.2 | Venue | 8966bedb | mechanic | members | members company | — | drafting convention |
| mbr mbs mul scp | 13.2 | Deadlock; Buy-Sell Election. [OPTIONAL PROVISION — see Instructions; to omit, replace the text of this Section with "[Reserved.]" — do not renumber] | 7cbd82d7 | mechanic | members | members | — | s. 605.0702(2) |
| sgl sgm sgms sgs | 13.3 | Severability | f3e788ce | benefit | — | members manager company | — | drafting convention |
| sgl sgm sgms sgs | 13.4 | Entire Agreement | ee3bd681 | mechanic | — | members manager | — | drafting convention |
| sgl sgs | 13.5 | Binding Effect | 43d6e2af | mechanic | — | members manager | — | s. 605.0106 |
| sgm sgms | 13.5 | Binding Effect | 1ad919d8 | mechanic | — | members manager | — | s. 605.0106 |
| sgl sgm sgms sgs | 13.6 | Counterparts; Electronic Signatures | a8dc325e | mechanic | — | members manager | — | ch. 668, Fla. Stat. |
| sgl sgm sgms sgs | 13.7 | Notices | 2c077363 | mechanic | — | members manager | — | drafting convention |
| sgl sgm sgms sgs | 13.8 | No Third-Party Beneficiaries | 4d830aa4 | benefit | — | members manager company | — | drafting convention |
| sgl sgm sgms sgs | 13.9 | Interpretation | 88791917 | mechanic | — | members manager | — | drafting convention |
| sgl sgm sgms sgs | 13.10 | Unregistered Interests | 5909e292 | mechanic | — | members company | — | 15 U.S.C. 77e; ch. 517, Fla. Stat. |
| mbr mbs mul scp | 14.1 | Dissolution of a Protected Series | 4b25dea8 | mechanic | — | members series | — | s. 605.2501 |
| mul | 14.2 | Winding Up a Protected Series | 48e94158 | mechanic | manager members | members series | — | s. 605.2502 |
| scp | 14.2 | Winding Up a Protected Series | 600b1603 | mechanic | manager members | members series | — | s. 605.2502 |
| mbr | 14.2 | Winding Up a Protected Series | 0c1bc8b3 | mechanic | manager members | members series | — | s. 605.2502 |
| mbs | 14.2 | Winding Up a Protected Series | 5f431084 | mechanic | manager members | members series | — | s. 605.2502 |
| mbr mbs mul scp | 14.3 | Dissolution of the Company | 92dba41b | mechanic | — | members | — | s. 605.0701 |
| mul | 14.4 | Winding Up the Company | f234c2e9 | mechanic | manager members | members | — | ss. 605.0709, 605.0710 |
| scp | 14.4 | Winding Up the Company | aedb6377 | mechanic | manager members | members | — | ss. 605.0709, 605.0710 |
| mbr | 14.4 | Winding Up the Company | 2698c4e6 | mechanic | manager members | members | — | ss. 605.0709, 605.0710 |
| mbs | 14.4 | Winding Up the Company | 7f3dbab2 | mechanic | manager members | members | — | ss. 605.0709, 605.0710 |
| mbr mul | 14.5 | No Deficit Obligation; Recourse Limited | a80b2aad | benefit | — | members | — | s. 605.0405 |
| mbs scp | 14.5 | No Obligation to Contribute; Recourse Limited | 758ff4ef | benefit | — | members | — | s. 605.0405; the S corporation forms carry no capital accounts, so deficit-restoration language was removed 2026-08-14 |
| mul scp | 15.1 | Amendments | fa5b242d | authority | members | members | — | s. 605.04073(1)(d), (2)(e) |
| mbr mbs | 15.1 | Amendments | a9428a3a | authority | members | members | — | s. 605.04073(1)(d), (2)(e) |
| mbr mbs mul scp | 15.2 | Action by Written Consent | b25652f8 | mechanic | members | members | — | s. 605.04073(4) |
| mul scp | 16.1 | Governing Law; Internal Affairs | b6174e72 | mechanic | — | members manager | — | s. 605.0104 |
| mbr mbs | 16.1 | Governing Law; Internal Affairs | 6d41bc2b | mechanic | — | members manager | — | s. 605.0104 |
| mbr mbs mul scp | 16.2 | Venue | 8966bedb | mechanic | members | members company | — | drafting convention |
| mbr mbs mul scp | 16.3 | Severability | f3e788ce | benefit | — | members manager company | — | drafting convention |
| mbr mbs mul scp | 16.4 | Entire Agreement | ee3bd681 | mechanic | — | members manager | — | drafting convention |
| mul scp | 16.5 | Binding Effect | 8519cf1c | mechanic | — | members manager | — | s. 605.0106 |
| mbr mbs | 16.5 | Binding Effect | d6f60dad | mechanic | — | members manager | — | s. 605.0106 |
| mbr mbs mul scp | 16.6 | Counterparts; Electronic Signatures | a8dc325e | mechanic | — | members manager | — | ch. 668, Fla. Stat. |
| mbr mbs mul scp | 16.7 | Notices | 2c077363 | mechanic | — | members manager | — | drafting convention |
| mbr mbs mul scp | 16.8 | No Third-Party Beneficiaries | 4d830aa4 | benefit | — | members manager company | — | drafting convention |
| mbr mbs mul scp | 16.9 | Interpretation | 88791917 | mechanic | — | members manager | — | drafting convention |
| mbr mbs mul scp | 16.10 | Unregistered Interests | 0d19e3e9 | mechanic | — | members company | — | 15 U.S.C. 77e; ch. 517, Fla. Stat. |
