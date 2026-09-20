# Batch 17 — asset records and statutory explanations

Adam approved review items 1–5 and 10–17, rejected 6–9, then approved the displayed replacement for item 5 and said Go. This is implementation authority only. No acceptance, integration, push, deployment or Dropbox publication. Publication is deferred until all batches are finished.

13 approved review units, 15 source records, 16 item parts. Rejected units remain unchanged: 6 (31, state count), 7 (N1.10, public liability explanation), 8 (N1.11, owner immunity example), 9 (N2.04, creditor/recourse clauses). The eight agreement masters are unchanged.

This sibling checkout starts at Batch 15 revision 2, 2d36183. Batch 16 remains separately pending and is neither rejected nor incorporated by this work. It must be integrated and reviewed separately before eventual publication. A full-history return-point bundle is retained outside this checkout.

## Sources checked before edits

2026 Online Sunshine sections opened during this review: 605.2101 (Uniform Protected Series Provisions); 605.2301(2)–(3) (identification, acquisition and transfer records; recorded-instrument exception); 605.0304(1) (liability protection applies regardless of dissolution); 605.0714(5) (administratively dissolved company continues for winding up); 605.2602–605.2607 (company versus protected-series reorganizations). Individual sections and the full chapter were used; the full chapter supplied the merger provisions where the individual page did not render.

- https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&Search_String=&URL=0600-0699/0605/Sections/0605.2301.html
- https://www.leg.state.fl.us/Statutes/index.cfm?App_mode=Display_Statute&URL=0600-0699/0605/0605.html
- Florida Department of Revenue: https://floridarevenue.com/taxes/taxesfees/Pages/doc_stamp.aspx — 70 cents outside Miami-Dade; Miami-Dade 60 cents plus 45-cent surtax except an instrument transferring only a single-family dwelling; taxable consideration, not automatically every mortgage balance.
- Sunbiz: https://dos.fl.gov/sunbiz/manage-business/efile/reinstatement/ — existing reinstatement charge preserved.
- Agreement §8.4 permits documented nominee arrangements; §8.5 contains standing association rules and §8.6 follows it. Member-loan provisions and compensation/reimbursement provisions refute the Manual's two-transfer-only description.

The statute's qualifying words matter: s.605.2301(2)(b) protects an instrument in favor of a person who gives value without knowledge of the lack of authority. The approved page text below preserves those conditions. Section 605.0304 says the protection applies regardless of dissolution. Neither change rewrites the agreement creditor clauses Adam retained.

## Verification and user walks

Before freezing: every exact before string occurs once at the base; all retired strings are absent from the projected product; prior fix assertions pass against the projection. All nine wording files must equal only their declared replacements. The fact ledger records the approved shared facts.

Visitor: opens Home, Benefits, Asset Protection, FAQ and The Statute; reads the corrected labels and expands the affected FAQ answers. Expects one annual report distinguished from fees, the correct filing office, and the general asset-record rule distinguished from the recorded-instrument exception.

Member: opens the regenerated Owner's Manual; reads the cover, Article 8 guide, recordkeeping, real-estate tax example, money transfers and dissolution guidance. Expects the approved explanations and existing document styling. The rejected liability claims and all agreement masters remain unchanged.

Developer: reads chapter-605-notes.md. Expects company mergers distinguished from the effects on existing or newly established protected series.

Mandatory review includes all installed checks, runtime page/document assertions, offline API/browser suites and package integrity. Focused FAQ clicks and rendered Manual inspection supplement those checks. No check is removed or weakened.

## Exact approved replacements

### Item 10:all

webapp/src/pages/AssetProtection.tsx

Before:
```text
They cannot seize his interest, vote his shares, or reach the property.
```
After:
```text
They cannot seize his interest, exercise his voting rights, or reach the property.
```

webapp/src/pages/AssetProtection.tsx

Before:
```text
A Florida Protected Series LLC addresses all of them simultaneously,
```
After:
```text
A Florida Protected Series LLC addresses both simultaneously,
```

### Item 11:all

webapp/src/pages/FAQ.tsx

Before:
```text
You get the asset segregation of multiple LLCs and only pay one annual fee.
```
After:
```text
You get the asset segregation of multiple LLCs and file one Florida annual report covering the company and its protected series.
```

webapp/src/pages/FAQ.tsx

Before:
```text
the processing time belongs to the Florida Secretary of State,
```
After:
```text
the processing time belongs to the Florida Division of Corporations,
```

webapp/src/pages/FAQ.tsx

Before:
```text
(3) an S corporation, or (4) C corporation,
```
After:
```text
(3) an S corporation, or (4) a C corporation,
```

webapp/src/pages/FAQ.tsx

Before:
```text
It is also possible for different series to be taxed differently, however, that raises some very complex income tax issues.
```
After:
```text
It is also possible for different series to be taxed differently; however, that raises some very complex income tax issues.
```

### Item 12:all

webapp/src/components/home/HomeHero.tsx

Before:
```text
>Protected Series LLC Act</span>
```
After:
```text
>protected series statute</span>
```

webapp/src/components/home/WeAreOne.tsx

Before:
```text
                Florida's Protected Series Act.
```
After:
```text
                Florida's protected series statute.
```

webapp/src/components/home/WhyOnlyUs.tsx

Before:
```text
            Any filing service can send Articles to Tallahassee. But Florida's Protected Series Act
```
After:
```text
            Any filing service can send Articles to Tallahassee. But Florida's protected series statute
```

### Item 248:all

docs/owners-manual.md

Before:
```text
10|Written for the Florida Uniform Protected Series Act
```
After:
```text
10|Written for Florida's Uniform Protected Series Provisions
```

### Item 13:all

webapp/src/components/home/BenefitsGrid.tsx

Before:
```text
One master OA + lightweight Series Designations. Easier to amend, easier for lenders to underwrite, easier to explain to partners.
```
After:
```text
One master operating agreement, with a short Series Exhibit for each series. Each series also requires a Protected Series Designation filed with Florida.
```

### Item 14:all

webapp/src/pages/TheStatute.tsx

Before:
```text
                    "What makes an asset a series' own is your records, not the name on the title: they must let a disinterested, reasonable person identify the asset, determine when and from whom it was acquired, and — if it came from the company or another series — the consideration, payor, and payee (§605.2301(2)).",
```
After:
```text
                    "An asset’s association with a protected series generally depends on its records. Those records must identify the series and the asset, distinguish the asset from other assets, and show when and from whom it was acquired or how it became the series’ asset. For transfers from the company or another series, they must also identify the consideration, payor and payee. Recorded real-property instruments have the special rule described below (§605.2301(2)).",
```

webapp/src/pages/TheStatute.tsx

Before:
```text
                    "Titling real property in the series' name is what earns you the safe harbor: a recorded instrument naming the series is conclusive of the signer's authority and is itself a record of association (§605.2301(2)(b)).",
```
After:
```text
                    "A recorded deed or other instrument transferring or affecting a protected series’ interest in real property can itself establish the required association record. To the extent the instrument favors someone who gives value without knowing that the signer lacked authority, it conclusively establishes the signer’s authority and records the interest as an associated asset or liability of that series, as applicable (§605.2301(2)(b)).",
```

### Item N2.07:all

docs/owners-manual.md

Before:
```text
Your operating agreement fights this battle for you in two ways. Article 8 puts the records in a named person's hands and sets the standard they must meet. And the standing association rules at the end of Article 8 — a provision you will not find in other companies' forms — makes the agreement *itself* part of your records: assets titled in a series' name, bought with a series' funds, or held in a series' accounts are associated with that series by standing rule, income and proceeds follow the asset that produced them, and anything left over is associated with the mothership so that **no asset of yours is ever "non-associated."** They are a safety net, not a substitute: it works alongside real ledgers and real bank accounts, not instead of them.
```
After:
```text
Your operating agreement fights this battle for you in two ways. Article 8 puts the records in a named person's hands and sets the standard they must meet. The standing association rules in Section 8.5 make the agreement *itself* part of your records and help determine where assets belong. They work alongside real ledgers and real bank accounts, not instead of them. Missing records can leave an asset non-associated; the default rule does not replace the identifying, acquisition, and transfer information the statute requires.
```

docs/owners-manual.md

Before:
```text
**Second, your agreement's standing association rules make the mothership the default bucket.** Any asset you fail to associate with a series lands, by standing rule, in the company's silo. That is deliberately protective — it means a sloppy record never creates a *non-associated* free-for-all asset — but it also means **sloppiness collects in the mothership**. If the mothership is asset-light, a record you missed exposes little.
```
After:
```text
**Second, your agreement's standing association rules make the mothership the default bucket.** The standing association rules help determine where assets belong, but they do not replace the required records. Missing records can leave an asset non-associated. Keep the mothership asset-light and document every asset.
```

### Item N2.09:all

docs/owners-manual.md

Before:
```text
- **Reinstatement, if you let it lapse:** $100 plus every missed year's annual report fee — on top of losing the shields in the interim.
```
After:
```text
- **Reinstatement, if you let it lapse:** $100 plus every missed year's annual report fee. Administrative dissolution restricts the company to winding up; it does not automatically remove its liability protections. Keep the required records and resolve the lapse promptly.
```

### Item N2.10:all

docs/owners-manual.md

Before:
```text
2. **Documentary stamp tax.** Florida taxes deed transfers (70 cents per $100 of consideration). Transferring *mortgaged* property to your own entity is generally taxed on the mortgage balance, even with no money changing hands. Price this before you transfer — on a $300,000 mortgage that is $2,100. An unencumbered property transferred for no consideration is a different analysis. Confirm the stamp treatment with your closing agent or CPA before recording; do not guess.
```
After:
```text
2. **Documentary stamp tax.** Outside Miami-Dade County, the rate is 70 cents per $100 or fraction of taxable consideration. Miami-Dade charges 60 cents per $100 or fraction, plus a 45-cent surtax unless the document transfers only a single-family dwelling. Transferring *mortgaged* property to your own entity can produce taxable consideration even when no cash changes hands. At the 70-cent rate outside Miami-Dade, $300,000 of taxable consideration produces $2,100 in tax. An unencumbered property transferred for no consideration is a different analysis. Confirm the consideration, rate, and any exemption with your closing agent or CPA before recording; do not guess.
```

### Item N2.11:all

docs/owners-manual.md

Before:
```text
- Your personal money touches the structure in exactly two ways: documented contributions in, documented distributions out. The company debit card buys nothing personal, ever.
```
After:
```text
- Document every transfer between you and the company or a series: contributions, distributions, loans, repayments, and legitimate expense reimbursements. Identify the parties and purpose, and use the correct account. The company debit card buys nothing personal, ever.
```

### Item N2.15:all

docs/owners-manual.md

Before:
```text
The conduct that loses these fights, ranked by frequency:
```
After:
```text
Conduct that can undermine the shields:
```

### Item 244:all

docs/owners-manual.md

Before:
```text
and the titling rule (§8.4): every asset is held in the name of the silo that owns it, never your personal name
```
After:
```text
and the holding rule (§8.4): hold assets in the owning company's or series' name, or through a properly documented nominee arrangement under Section 8.4 — not simply in your personal name
```

### Item 256:nominee

### Item 245:all

docs/owners-manual.md

Before:
```text
and the standing association rules that close the Article
```
After:
```text
and the standing association rules in Section 8.5
```

docs/owners-manual.md

Before:
```text
1. **Sign it, and sign every Series Exhibit.** An unsigned operating agreement is a rumor. Your agreement also makes itself part of the association records (the standing association rules at the end of Article 8) — it only earns that status executed.
```
After:
```text
1. **Sign it, and sign every Series Exhibit.** An unsigned operating agreement is a rumor. Your agreement also makes itself part of the association records (the standing association rules in Section 8.5) — it only earns that status executed.
```

### Item 256:article8-location

### Item 213:all

webapp/server/chapter-605-notes.md

Before:
```text
- **s. 605.2602–605.2604** — a protected series may not convert, domesticate, or
  participate in an interest exchange, and may merge only through the single
  channel in s. 605.2604 (every other party an LLC; surviving company not
  created in the merger).
```
After:
```text
- **ss. 605.2602–605.2607** — distinguish the company from its protected
  series. Section 605.2603 bars the series LLC itself from conversion,
  domestication, and interest exchange. Its merger must satisfy s. 605.2604:
  every other party is an LLC, and the surviving company is not created in
  the merger. Section 605.2602 restricts protected-series transactions,
  subject to ss. 605.2605(2), 605.2606(2), and 605.2607(1). In the company's
  merger, existing series may continue, relocate, or be dissolved, wound up,
  and terminated; a new series may be established through the merger filings
  as ss. 605.2605–605.2607 provide.
```
