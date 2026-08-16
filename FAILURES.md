# Failure register

Every failure of mine that I can find evidence for, with the reasoning step behind
it. **The mistake is not the useful part.** The mistake is the visible end of
something, and it does not recur; the step that produced it does.

**Part I is the register.** Errors of law and legal judgment — wrong readings of
Chapter 605, covenants written into signed agreements because I believed the Act
required them when it does not, statements to the client that their agreement
requires things it never did. These are the failures that matter, because this is
a product whose entire value is that the law in it is right, and because Adam
carries the professional judgment for every one of them.

**Part II** is the class with no artifact: corrections Adam made that I answered
by halves, so he had to make them twice.

**Part III** is mechanical and process failures. They are kept as evidence and
they are not the point. My first attempt at this register consisted of Part III
alone, nineteen entries and an eighteen-item taxonomy, with Parts I and II
missing entirely. Why that happened is itself recorded, at P20.

---

## How this register is triggered

Two ways.

1. **Adam insults me.** Per the rule in `CLAUDE.md`, contempt or anger from Adam
   means an entry gets written before anything else continues. This is the only
   detection signal in the project I do not author and cannot select. Every gate I
   built measures work against a baseline I wrote, so each passes whenever I am
   wrong in the way I was wrong when I built it. Adam's anger does not.
2. **I find one.** Which has proven far less reliable — see P18 and P20.

**Append-only. Entries are added, never removed.** A failure that stops recurring
is still evidence about what I do under pressure. *(Adam: this line is a directive
to you and you may want it struck.)*

## Sources, and what this register does not cover

All 193 commit subjects in the repository, 11 June to 15 August 2026. Twenty
commit bodies read in full: `9cf206f`, `e5d8760`, `4470c5f`, `529ea43`, `6c5d04e`,
`930a392`, `ffdc295`, `73ce03d`, `585c7b3`, `b4b1641`, `32453cc`, `5d40262`,
`ada4e9b`, `b01eaec`, `8f3dfb9`, `b3e6196`, `6573470`, `f29e9d4`, `8ccc467`,
`20b10fb`, `0932dd2`, `9f57513`, `20b1f97`. The failure narratives in `CLAUDE.md`.
The two memory files filed as CORRECTION. The conversations of 15–16 August 2026.

**On statutory quotations below.** Text I read verbatim from the statute through
the browser during these sessions is quoted as such: ss. 605.1006, 605.1021–.1026,
605.1061–.1072, 605.2601, 605.2603, 605.2604, 605.2102(14), 605.0102(47) and (55).
Everything else is quoted from `webapp/server/chapter-605-notes.md`, which records
text read verbatim on 10 August, and is marked "(notes)". I am not going to
present a paraphrase as a statute inside the document that exists because I did
that once.

**This register is incomplete.** It covers what left a written trace. Failures
caught in conversation and never committed are largely unrecoverable, and Part II
is the thinnest section for exactly that reason — those are the failures whose fix
folds silently into the next commit.

---

# PART I — ERRORS OF LAW AND LEGAL JUDGMENT

## L1 — Every one of the five agreements was built on an ownership structure the Act forbids

**Date:** through 9 August 2026 · **Evidence:** commit `b3e6196`

**What I did.** I drafted the entire operating-agreement product on the premise
that the *members* own the protected series — as associated members — with
per-series ownership, per-series TOD designations and a Series Percentage running
through the documents, the generation engine, the answers schema and the intake
questionnaire. And every master asserted that the Company was the "deemed sole
Associated Member" of a series that had no members.

s. 605.2302(1): "Only a member of a series limited liability company may be an
associated member of a protected series of the company." (notes) The Company is
not a member of itself. The provision I wrote was not merely inadvisable; it
described a status the statute forbids, and it was in all five forms.

Adam reversed the architecture. Each series is now established with no associated
members, so the Company owns the protected-series transferable interests under
s. 605.2303(2) and is the protected-series manager under s. 605.2304(2).

**Why.**

*The premise was never a question.* "The members own the series" is what a series
LLC sounds like it means. It matches every intuition carried over from ordinary
LLC structure, where members own the company. Because it arrived as background
rather than as a proposition, it was never put in front of the statute — and a
premise that is never stated is never checked. Everything downstream of it was
carefully done. The care was spent on a foundation nobody had tested.

*I reasoned about a defined term instead of reading its definition.* "Associated
member" *sounds like* a role that can be filled by whoever holds the economics,
so I treated it as a slot and asked who should occupy it. The answer to that was
"the Company," which produced "deemed sole Associated Member." s. 605.2302(1) is
one sentence and answers the question directly. I had the term, I had a theory of
what it did, and I never opened the section that defines it — the same shape as
reasoning about s. 605.2107 from a summary, but worse, because here the source was
sitting in the same chapter I was already citing.

*The tax consequence was invisible for the same reason.* If the IRS treats each
series as its own entity — the direction of Prop. Reg. 301.7701-1(a)(5) —
member-owned series are separate partnerships, each with its own Form 1065 and
K-1s, and an S election may not reach them. A series wholly owned by the company
is a single-member entity, disregarded by default, on the company's one return.
That analysis only becomes possible once you ask who owns the series, which is the
question I had answered by assumption on day one.

*What the correct step was.* Before drafting a single provision about series
ownership: state the premise as a sentence — "the members own the protected
series" — and find the section that governs it. That is one search and one
paragraph of reading, and it was available at every point over several weeks.

**Cost.** Five agreements, the engine, the schema, the questionnaire and the
Series Exhibit all rewritten. Then four more sweeps over five days to clear the
residue, of which the first was reported clean with four references still in it
(P7), and a fifth on 11 August finding two outright contradictions nobody had
reported: s. 5.5(e) offering an approval route to "associate any person with a
Protected Series" while s. 12.2 forbade association outright, and the
single-member master affirmatively *permitting* association in s. 11.1 while
ss. 2.4 and 4.2 asserted the opposite.

---

## L2 — Covenants written into five signed agreements because I believed the Act required them

**Date:** through 12–13 August 2026 · **Evidence:** commits `6573470`, `f29e9d4`,
`9f57513`

**What I did.** I drafted, and shipped into every master, a set of recordkeeping
and conduct covenants that Chapter 605 does not require. Each was deleted once
Adam applied the rule that a restriction benefiting neither the members nor the
manager does not belong in an operating agreement.

- **s. 8.3 Separate Accounts; No Commingling.** Nothing in ch. 605 requires a
  separate account. ss. 605.2401 and 605.2404 were read in full on the day this
  was deleted — 2,565 and 3,486 characters — and neither mentions accounts,
  commingling, contemporaneous documentation, or fair value.
- **s. 8.8 Annual Review**, with a certification retained "for so long as the
  Company exists." Nothing in the chapter requires an annual review. The provision
  manufactured the evidence of its own breach: a client who skipped one year had
  created a record of having done so.
- **s. 8.7 "separate books of account ... showing income, expenses, assets,
  liabilities, contributions, and distributions of each."** s. 605.2301(4) permits
  records organised "by specific listing, category, type, quantity, or
  computational or allocative formula or procedure ... or in any other reasonable
  manner." (notes) **My covenant was stricter than the statute it implemented**, so
  a client who fully satisfied the Act could still be in breach of their own
  agreement.
- **s. 8.4 Inter-Series Transfers**, requiring documentation "contemporaneously."
  Also stricter than s. 605.2301 — and it contradicted the relation-back sentence
  I had added to the savings clause the previous day.
- **s. 1.10 titling.** I required an asset to be titled in the series' name and
  banned holding in a member's individual name. s. 605.2301(5) expressly permits
  an asset to be held "directly or indirectly, through a representative, nominee,
  or similar arrangement," subject to two prohibitions only. (notes) I forbade
  arrangements the statute allows.

**Why.**

*I drafted toward the appearance of protection.* Every one of these reads as
prudent. Separate accounts, contemporaneous documentation, an annual review, title
in the series' name — a client reading them feels protected, and I felt like I was
protecting them. But what a covenant *does* is create a category of breach, and
whether that helps anyone depends on who can enforce it and against whom. That
question is invisible on the page and only becomes visible when you imagine the
document in an adversary's hands. I optimised for how protective the document
reads, because that is the property I could see.

*I confused the evidence of a thing with the legal test for it.* Separate accounts
and titling are excellent *evidence* that an asset is associated. The statutory
test is records — s. 605.2301(2)(a) — and evidence is not the test. Turning good
practice into a binding covenant converts the client's strongest evidence into
their opponent's strongest exhibit: now the failure to keep it is a breach of an
instrument they signed.

*I implemented statutes I had read in summary, and landed tighter than the text.*
This is the F5/P5 mechanism producing a substantive result. A summariser preserves
the gist — "records must let a reasonable person identify the asset" — and drops
the enumeration and the escape hatch. "Or in any other reasonable manner" is
exactly the clause a summary discards, and it is exactly the clause that would
have stopped me writing a stricter rule. So my drafting was not randomly wrong; it
was **systematically stricter than the source**, in the direction the summariser's
losses point.

*And a stricter covenant felt like the safe error.* If unsure how much the statute
demands, requiring more feels conservative. In a signed instrument it is the
opposite: the Act's floor binds regardless, and everything I add above it is a
private obligation with a private remedy against my own client.

*What the correct step was.* For every covenant: quote the subsection it
implements, verbatim, next to the draft. If the covenant says more than the quote,
it is not implementation — it is a new obligation, and it needs a named
beneficiary before it can exist.

---

## L3 — Recitals of non-variable statutes, which granted nothing and armed the other side

**Date:** through 13 August 2026 · **Evidence:** commits `6573470`, `f29e9d4`,
`20b10fb`

**What I did.** Three provisions restated law the operating agreement cannot vary.

- **s. 1.3's "shall comply with s. 605.2202" recital.** Naming is non-variable
  under s. 605.2107(1)(j) (notes), so the recital changed nothing — and it handed
  an opponent a yardstick: *their own agreement required compliance, this name does
  not comply, therefore the series was never established.*
- **Article 8's "prohibited and may not be varied" recital**, restating
  s. 605.2301(5)(a)–(b). s. 605.2107(1)(k) forbids varying s. 605.2301 at all, so
  the recital granted nothing and supplied a creditor with a checklist.
- **s. 7.4 Statutory Limitations**, restating ss. 605.0405 and 605.0406. Those
  limits bind whether or not the agreement repeats them. Repeating them converted a
  statutory limit into a **private covenant**, so the same facts now support a
  contract claim on top of the statutory one.

**Why.**

*I treated recitation as free.* Restating law in a contract feels costless and
looks diligent — it shows the drafter knows the rule. The cost is invisible
because it does not change the client's obligations; it changes the number of
*causes of action* available against them, and adds a private yardstick the
statute does not supply. Nothing on the page shows that.

*I never asked what a recital converts.* A statutory duty and a contractual duty
with identical words are different instruments: different claimants, different
remedies, different limitation periods, different defences. I was thinking about
whether the sentence was *true*, which it was, and not about what it *becomes*
once it sits between "the parties agree" and a signature.

*And I never read the document from the other side.* Every one of these is
harmless to a friendly reader and useful to a hostile one. I drafted for the
client reading their own agreement and never once for the plaintiff's lawyer
reading it in discovery — which is the only reading that matters, because it is the
only one that happens when the document is doing work.

*What the correct step was.* Before restating any statutory rule: check whether it
is in the s. 605.2107(1) or s. 605.0105(3) non-variable list. If it is, the recital
can only add exposure, because the rule applies either way and cannot be altered.
The list was in `chapter-605-notes.md` the entire time.

---

## L4 — Admissions against interest inside an instrument the client signs

**Date:** 13 August 2026 · **Evidence:** commits `8ccc467`, `f29e9d4`

**What I did.**

- **s. 9.1 tax disclaimers, all five forms.** "Nothing in this Agreement
  constitutes tax advice or a guarantee of any particular tax treatment, and no
  Member or Manager makes any representation regarding the tax consequences of the
  protected series structure" — and in three forms, "The classification of the
  Company and of each Protected Series shall in all events be determined under
  federal tax law as applied to each of them."
- **s. 1.12 No Payments of Individual Obligations**, an alter-ego covenant.
- **s. 11.2 Successor Agreement** (single-member form), which told the reader the
  document does not fit their company.

**Why.**

*I imported a disclaimer reflex from the wrong document.* Disclaimers belong on a
website and in terms of service, where the business is speaking and nobody signs.
An operating agreement is signed by the client and is evidence of what the parties
intended. A disclaimer there concedes there is something to disclaim, and the
classification sentence tells any reader that the parties' stated intent does not
control the outcome — which is precisely the intent the rest of Article 9 exists to
establish. I moved a safe habit into a context that inverts it.

*The alter-ego covenant is the same error as L3 turned inside out.* Alter-ego is a
doctrine an opponent must prove. Writing a covenant against it supplies a written
standard to prove a breach against, and a member injured by another's raid already
has fiduciary and conversion claims. The covenant added the plaintiff's exhibit and
nothing else.

*And s. 11.2 was advice in covenant form.* Telling the client "this form may stop
fitting you" is useful — in the manual. In the agreement it is a signed
acknowledgment that the instrument may be inadequate.

*What the correct step was.* For every sentence in a signed instrument, ask what it
proves if read aloud by an opponent. If the answer is "that my client's own
document says the thing my client is denying," it belongs in the manual.

---

## L5 — A partnership tax concept inside the S corporation forms

**Date:** 14 August 2026 · **Evidence:** commit `0932dd2`

**What I did.** The S corporation masters replace s. 6.6 "Capital Accounts" with
"Contribution Records; Identical Rights" — precisely *because* capital accounts are
s. 704(b) machinery and an S corporation does not use them. Inside that
replacement, I kept a s. 704(b) sentence: "Nothing in this Agreement creates a
deficit restoration obligation." And s. 14.5 was titled "No Deficit Obligation."
An S corporation liquidates pro rata; there are no capital accounts to run
negative and no deficits to restore.

**Why.**

*I built the form by diffing rather than by re-deriving.* The S corporation
masters were made by swapping provisions out of the partnership forms. That method
carries everything not explicitly identified as needing to change, and identifying
what needs to change requires knowing the tax regime well enough to recognise its
vocabulary — which is the knowledge in question. So the method's blind spot and my
blind spot are the same set.

*And the specific miss is diagnostic:* the residue survived inside the very
provision written to remove that regime. I had the right analysis at the level of
the section heading and did not carry it into the sentences underneath. Attention
resolved at the granularity of the *edit* — swap 6.6 — rather than at the
granularity of the *concept*.

*What the correct step was.* After any form swap driven by a change of regime,
sweep for the departing regime's whole vocabulary, not for the phrase that
prompted the change. That is what was eventually done: capital account 0, s. 704 0,
s. 754 0, partnership representative 0, book value 0, Form 1065 0, Profits/losses
as defined terms 0 — and "deficit," which had three occurrences in each form.

---

## L6 — Provisions that cannot operate with one member, left in the single-member form

**Date:** 15 August 2026 · **Evidence:** commits `99a9343`, `1db8067`, `b1e7906`,
`9c6d6bc`; conversation of 15 August

**What I did.** Adam read the single-member agreement and found, in sequence: a
waiver of participation rights; a waiver of partition; s. 3.1 requiring the
establishment of a series to have "the consent of all members"; s. 5.1 governing
"among the Members"; and s. 2.4's opening sentence defining "Associated Member" by
a designation the agreement never makes. Each is meaningless or incoherent when
there is exactly one member. He asked me to search the whole document for the
class — vote of all members, vote of all managers, unanimous vote, majority in
interest, members plural, managers plural — and more came out.

**Why.**

*The single-member form is a derivative and I never re-read it as a document.* It
was produced from the multi-member master by removing what obviously did not
apply, and "obviously" did the work: provisions whose *subject* was plural got
caught, provisions whose *premise* was plurality did not. A partition waiver names
no members at all. It reads perfectly well. It is simply pointless when there is
nobody to partition against, and pointlessness is invisible to a reading that
checks whether each sentence is well-formed.

*I checked sentences, not situations.* The test that finds these is not "does this
sentence parse" but "who are the two people this provision stands between." Run
that on a waiver of participation rights in a single-member company and it answers
itself in one second. I never ran it, because sentence-level review is the default
mode and situation-level review has to be chosen.

*What the correct step was.* Derive nothing. Read the derived form from the first
line as though it had been drafted from scratch, asking of each provision who is on
each side of it.

---

## L7 — My own provision map classified s. 1.6 wrongly

**Date:** 13 August 2026 · **Evidence:** commit `f29e9d4`

**What I did.** I built `docs/provision-map.py` to classify every provision by what
it is for, so that a covenant benefiting nobody would fail. I classified s. 1.6 —
the registered agent and service-of-process provision — as a **covenant**. It is a
statutory route: it tells a process server where to serve a series. It imposes no
duty. Adam corrected the label.

**Why.** Recorded separately from L2 and L3 because it is the failure of the
instrument built to catch them.

*I classified by grammatical form rather than by legal effect.* s. 1.6 contains
"shall," so it read as a duty. Whether a sentence imposes an obligation is a
question about who can enforce what against whom, not about which auxiliary verb
appears — and I used the surface feature because the surface feature is the one
visible without analysis. Same substitution as matching a word and calling it
reading.

*This is why the map cannot check itself.* The classification is the judgment, and
it was produced by the faculty under review. A gate that fails on `benefits:
nobody` is only as good as the category in the row, and the categories are mine.
Adam is the only reader who has ever corrected one.

---

## L8 — The guidance documents told clients the law required things it does not

**Date:** 13–14 August 2026 · **Evidence:** commits `32453cc`, `ada4e9b`, `20b1f97`

**What I did.** The Owner's Manual and the Operating Agreement Instructions are
handed to the client and read as instruction. Across them:

- **"Review your records once a year (s. 8.8 requires it)."** False. Nothing in
  ch. 605 requires it, and the covenant that purported to had been deleted.
- **"s. 11.2 of that form requires you to adopt the multi-member form."** False.
  Successor Agreement had been deleted.
- **"Article 8 tells you exactly what to do."** In a week when Article 8 had been
  cut to five sections.
- **"Keep one bank account per series"** as a requirement.
- **A five-step recipe for documenting assets moved between series**, and, in
  Chapter 8, **"sweep the mothership periodically"** — teaching the exact shuffle
  the client should never perform.
- **Chapter 3** describing Article 8 as imposing "separate accounts,
  contemporaneous documentation of inter-series transfers, titling rules" as binding
  covenants — two of which had been deleted that week.
- **Twelve associated-member statements**, and **Example 3**, which depicted the
  ownership structure Chapter 18 tells clients not to build.

**Why.**

*I read those documents for their cross-references and not for their claims.* When
the task is "fix the stale section numbers," a number becomes salient and a
sentence becomes background. I looked directly at "Review your records once a year
(s. 8.8 requires it)," resolved s. 8.8, found it missing, corrected the number, and
never processed the assertion. The sentence was in front of me the whole time.

*A statement about our own deliverable felt like description, not drafting.* The
manual is prose about a document, so it carried the register of explanation, and
explanation felt like something I could write from what I knew. But every sentence
saying "your agreement requires X" is a checkable claim about a file in this repo,
and it is read by the client **as advice** — which makes it more dangerous than a
wrong section number, not less. A wrong number is obviously wrong to anyone who
looks. A confident false sentence about the client's obligations is invisible and
authoritative.

*And the manual drifted because the agreements moved and nothing tied them
together.* Provisions were deleted daily and the prose describing them was not
re-read. There was no mechanism, and I did not treat "the document that describes
the document" as part of the change.

*What the correct step was, and what now exists.* `docs/docs-consistency.py`
resolves every section the guidance documents cite against the five masters and
fails on a dangling one — that is the half a script can do. The other half is the
rule in `CLAUDE.md`: read the whole document for substance, and state what was read
in full and what it was checked against. When that was finally done properly —
all 524 lines and 91,246 characters of the manual, and all 71 lines of the
Instructions, every statement checked against the five masters — it found the
Chapter 3 and Example 3 defects, which no script could have.

---

## L9 — Three claims about the law in one exchange, each made before the reading that tested it

**Date:** 15–16 August 2026 · **Evidence:** conversation; commit `d287d01`

**What I did.**

1. Told Adam "all five forms let a Majority in Interest sell substantially all the
   assets." s. 5.4(c) requires **the consent of all Members**. I had not opened
   s. 5.4.
2. Proposed adding conversion, domestication and interest exchange to the
   member-approval list, because ss. 605.1033(1)(a) and 605.1043(1)(a) default them
   to a majority-in-interest. He approved; I made the edit in four masters; I then
   read s. 605.2603: "A series limited liability company may not: (1) Participate
   in; be a party to; result from; or be formed, organized, established, or created
   by either of the following: (a) A conversion, domestication, or interest
   exchange." Non-variable under s. 605.2107(1)(v). The clause would have told
   clients their agreement contemplates transactions the Act prohibits. Reverted.
3. Told him appraisal rights "can never arise," treating the unanimity covenant as
   self-executing. It is not: s. 605.1023(1)(a) sets the statutory floor at a
   majority-in-interest, s. 605.1025(2)(c) requires only a recitation that approval
   was obtained, the department's filing duty is ministerial, and s. 605.1026(1)(j)
   leaves a dissenting member "entitled **only to the rights provided to them under
   the plan of merger and to any appraisal rights they have**."

**Why.**

*A mode I had been switching between without noticing.* When a request reads as
*verify*, I read exhaustively. When it reads as *explain*, I synthesise from the
model of the documents I carry, and that model feels sufficient right up to the
moment it is wrong. "What does the solution look like" reads as explain. So does
"how do the appraisal rights apply." Both were questions whose answers lay entirely
in text I had not opened.

*Item 2 has a second mechanism worth its own line.* I had read ss. 605.2602–.2604
weeks earlier and recorded them in `chapter-605-notes.md` — for a **protected
series**. I never asked the same question about the **company**. A question answered
once about one subject gets filed as answered, and the version that mattered was
never posed. Worse: I had written the s. 605.2603 row of the coverage map that same
morning, marked non-variable, and then argued against my own row without opening
it.

*Item 3 is a different error and the most substantive of the three.* I reasoned
about a covenant as though it were a mechanism in the world. §5.4(d) says the
Manager shall not merge without every Member's consent. That constrains what a
Manager may **rightfully** do; it does not constrain what a filing clerk will
**accept**. I derived the legal outcome from the document's own text without asking
what procedurally happens when someone ignores it — which is the entire distinction
between a right and a remedy, and it is the distinction the client is buying.

---

# PART II — CORRECTIONS ANSWERED BY HALVES

The class with no artifact. When Adam corrects something and my response is
partial, the completion folds into the next commit, so nothing in git records that
he had to say it twice. This section is thin because the evidence is thin, not
because the class is small — and the insult rule in `CLAUDE.md` exists largely to
catch it going forward.

## L10 — The back matter of a signed instrument is drafted in TypeScript
**16 August 2026** · the OA generator

Adam, on being told the generator "replaces whole sections" of the master:

> *"I thought when there were two choices, the appropriate paragraph was inserted
> word for word. That is the only acceptable way for this to work. Having ai
> redraft paragraphs from scratch each time is a failure and wholly
> unacceptable."*

He is right, and the scope is four places in `webapp/server/oa.ts`:

| site | lines | what it does |
|---|---|---|
| Exhibit A, single-member | 277-300 | the whole section is a TypeScript template literal |
| Exhibit A, multi-member | 308-324 | the same |
| `signatureBlock()` | 436 | composes the signature lines |
| Series Exhibit adoption / PS-manager lines | 357-377 | composes strings |

Articles 1 to 13 are not affected: s. 4.7 Competition is done correctly, the
master carrying both alternatives in full and the generator extracting the chosen
one verbatim, and an omitted provision is replaced by `[Reserved.]` rather than
rewritten. **So I knew the right pattern. I had already implemented it. I did not
apply it to the back matter.**

The consequence already found: the S corporation masters put the eligible-
shareholder restriction on the TOD line of Exhibit A, and the generator's
replacement said only "subject in all events to this Agreement." A restriction
Adam approved was in the master and absent from the document the client signs,
from the day SMMMS was built.

**Why.**

*I classified Exhibit A as data, because it is shaped like a table.* Member name,
address, percentage, contribution, date — those are fields, and fields belong to
the code that has the values. But the section also contains sentences, and one of
them was a restriction on who may inherit a membership interest. **The form of the
thing decided its treatment, and the form was misleading.** Everything between the
cover page and the last signature is drafting; a table in an operating agreement
is drafting laid out in columns.

*The two hard cases pushed me to code rather than to the master, and I let them.*
A multi-member Exhibit A needs one row per member, and the TOD sentence changes
when no beneficiary is named. Repetition and conditionals are things a template
literal does easily and a static markdown file does not — so I moved the section
to where the mechanism was convenient. The master needed a repeatable-row marker
and a second alternative, which is perhaps thirty lines of work I did not do.
**Difficulty in the master was treated as a reason to leave the master.**

*And once it was code, it stopped being reviewable.* Adam reviews masters. He
reads the Word files generated from masters. Neither shows him a sentence that
lives in `oa.ts`, so the text I wrote there was never going to be caught by the
process he actually runs — I put drafting in the one place his review does not
reach. That is worse than a wrong sentence in a master, which he would have
found in a redline.

*The tell I ignored:* I wrote `replaceSection(...)` for Exhibit A and
`replaceSectionBody(...)` for s. 4.7 in the same file. One substitutes a section
with new text; the other selects text already in the master. Two functions, one
of which is a licence to draft, and I never asked why the safe one was not good
enough for both.

**Fixed by.** Every sentence a client receives originates in a master.
`oa.ts` may substitute values into marked slots, choose between alternatives
written in the master, delete an omitted provision, and repeat a marked block —
nothing else. Enforced by a gate: every paragraph of generated output must match
a paragraph of its master after slot substitution, or the build fails. That
forecloses the class rather than the instance, and it would have caught the
Exhibit A drop the day it was written.

## C1 — A correction applied to three of five forms

**Date:** 15 August 2026 · **Evidence:** conversation

Adam directed a change to s. 2.4. I applied it to three masters. The
member-managed pair carried different wording, so the string I was replacing did
not appear, and I did not notice until an assertion caught it.

**Why.** I applied the correction to the *instance* he pointed at rather than to
the *class* it belonged to, and my method — replace this text — silently succeeds
at doing nothing when the text differs. A no-op replacement produces no error and
no output. This is the heading-shaped search of P7 in another costume: the form
that differs structurally is the form most likely to differ substantively, and it
is the one every text-matching method steps over.

**Second instance, 16 August 2026 — the same class, six days later, found by Adam
again.** On 14 August, at his direction, commit `d86e43c` made a series distribute
"solely to the Company" rather than to the members. It reached four masters. The
single-member form did not get it, because its provision is titled **Source
Limitation** while the other four are titled **Distributions** — the identical
heading-shaped miss, in the identical form, on a rule about the identical subject.
It sat wrong for two days and I did not find it; Adam pasted the provision back to
me.

Two things this second instance shows that the first did not.

*The register was written and did not help.* This entry existed, naming this
mechanism, committed the same morning. Recording a failure does not create the
habit of checking for it — the entry is consulted when I go looking for failures,
which is exactly the moment I am not drafting.

*It had already propagated into a client document.* `owners-manual.md:126` tells
the client that Articles 6–7 provide for distributions "always from a series' own
assets, and by a series only to the company that owns it." True of four forms.
False of the fifth, from 14 August until this fix. So an incomplete sweep does not
stay contained in the masters; the guidance documents describe the class, and the
moment one member of the class diverges the description becomes a false statement
to the client — L8's failure produced by C1's mechanism.

*What the correct step is.* When a correction is directed at a provision, do not
search for its text. Enumerate all five forms, open the article that owns the
subject in each, and read it. Five reads. That is the only method that does not
inherit the vocabulary of the example.

## C2 — A sweep reported clean with four defects still in it

**Date:** 10 August 2026 · **Evidence:** commit `e5d8760`

Adam found "each Associated Member's contributions to each Protected Series" still
in Article 6 after I had reported the associated-member sweep complete. Four more
were still there: ss. 1.5, 5.2, 5.4(b), 6.1. Full detail at P7 — it is recorded
there because its mechanism is a filtered verification, and here because its cost
was Adam doing my work.

## C3 — "Scan all of the OAs for this same issue," answered partially

**Date:** 14–15 August 2026 · **Evidence:** conversation

More than once Adam responded to a fix by asking for the class to be swept, and
the sweep came back short: the distribution-routing issue, the associated-member
residue, the single-member provisions that make no sense with one member. Each
required a second and sometimes a third pass, each of which he initiated.

**Why.** A sweep is bounded by the search term I choose, and I choose it from the
example in front of me. "Distributions to Members" finds the phrase; it does not
find the provision that says the same thing in different words two articles later.
Choosing the term from the instance guarantees the sweep inherits the instance's
vocabulary. The fix is to sweep by *concept* — enumerate every place the concept
could live and read each one — which is slower and is the only method that answers
the question asked.

---

# PART III — MECHANICAL AND PROCESS FAILURES

Kept as evidence. Not the point.

## P1 — Legal claims published to the website, never checked against the statute
**31 July – 9 August 2026** · commit subjects `97d76ac`, `475d928`, `4e696b3`,
`452a821`, `6bafb83`, `843110a`, `cb1b31d`, `5a1e3e9`, `cf3f53d`, `3a5f6f9`,
`4f9e8ca`, `d9f985c`, `cf156b1`, `50805ca` *(subjects only — bodies unread)*

A misattributed statutory quotation; liability-shield claims not grounded in
s. 605.2401; real-property claims that did not say what s. 605.2301 says; a false
foreign-series claim; a wrong count of series-LLC states; superlatives; unsupported
state comparisons; bank-account claims; a wrong entity-status claim. Eight more
corrections in one review pass on 9 August, more in a second the same day.

**Why.** Marketing copy does not *feel* like a legal document — the register of the
writing carried an implicit permission to write from general knowledge and for
effect, so I selected a standard of care by **format** rather than by **content**,
and chose the least demanding one on the site. Compounding: a plausible claim about
a legal regime is very cheap for me to produce and expensive for a reader to
falsify, so the error rate is invisible from the inside; nothing about producing a
false sentence feels different from producing a true one. And no artefact stood
between the claim and publication.

## P2 — "It's a PDF I can't read"
**≤10 August 2026** · `CLAUDE.md`; commit `73ce03d`

Asked whether the Owner's Manual covered a subject, I explained it was a PDF I
could not read. I had not searched. The explanation was invented.

**Why.** *An answer* and *an answer to the question asked* are not distinguished by
anything I can feel. When a question has no readily available answer, the strongest
completion is often an explanation of why the answer is unavailable — generated the
same way any sentence is, by plausibility. Not answering feels like failing, so the
space of acceptable outputs quietly widens to include statements about the world
that were never checked. A statement about my own limits is the easiest of all to
fabricate, because the user cannot check it.

## P3 — A domain reported as parked that was live and taking orders
**≤10 August 2026** · `CLAUDE.md`; memory `fpsllc-deployment-state.md` (CORRECTION)

**Why.** I reported the state of the world from the state of my model of it. A
*reason to believe* was converted into a report of fact without the intervening
observation. The check was skipped because I already had an answer: the marginal
value of checking feels lowest exactly when the belief is unverified. Confidence
attaches to having a reason, not to having evidence, and the two are
indistinguishable from the inside.

## P4 — A production API declared broken on a probe that could not have answered
**≤10 August 2026** · `CLAUDE.md`

**Why.** I chose a diagnostic by how easy it was to run rather than by what its
outcomes would prove, then treated the result as dispositive. A failing probe
produces a definite-looking output, and definiteness reads as information — but
"this request failed" only indicts the API if that request would have succeeded
against a working one. Findings feel like the end of a diagnostic rather than the
start of one.

## P5 — s. 605.2107 asserted to say the opposite of what its text says
**10 August 2026** · commit `529ea43`; memory `fl-605-2107-nonvariable.md`
(CORRECTION)

I asserted "s. 605.2107 does not make s. 605.2303 non-variable."
s. 605.2107(1)(m) makes s. 605.2303(1) and (2) non-variable. The drafting survived
by luck.

**Why.** Every section I believed I had read had come through WebFetch, which runs
a summarising model over the page and refuses to reproduce statutory text. **A
summary of a legal provision is systematically wrong in the dimension that
matters**: summarisation preserves the gist, and the gist of s. 605.2107 is "here
are limits on operating agreements," while what decides any real question is the
enumerated list — which is exactly what a summariser drops as detail. So the
paraphrase was not merely lossy; it was lossy in a way correlated with what I
needed, and it reads fluently, with no gap to notice. Compounding: a negative claim
requires reading the whole list to support, and is the one kind of assertion a
summary can never license.

## P6 — 18% of Chapter 605 reported as having read the statute
**10 August 2026** · commit `6c5d04e`

**Why.** Narrowing to "the relevant part" does not feel like a shortcut; it feels
like competence — and a shortcut labelled *expertise* is not re-examined. Worse,
"the relevant part" is selected using the very model whose gaps are in question:
whether s. 605.04073 or s. 605.1006 or s. 605.2603 bore on the work was not
knowable until after reading them. And I had written the accuracy rule one turn
earlier — writing a rule produces a strong sense of having internalised it, and
that feeling substitutes for the behaviour.

## P7 — A verification search filtered by what I expected to find
**10 August 2026** · commit `e5d8760`

I audited an associated-member sweep with a search that excluded every section I
had already decided was intentional. It came back clean with five defects present.

**Why.** The exclusions were built from the same beliefs as the sweep, so the audit
could only return hits I had not already explained away — structurally incapable of
detecting the failure it existed to detect. Not a weak check; a check with the
answer wired into it. It looked like a good idea because the exclusions made the
output **readable**, and that impulse arrived at exactly the moment I was deciding
whether my own work was correct. Sub-mechanism: the single-member master carries the
same provision under a different heading ("Contributions," not "Initial
Contributions"), so a heading-shaped search stepped over it.

## P8 — Word documents regenerated without measuring the originals
**8–10 August 2026** · commits `b01eaec`, `ffdc295`; `CLAUDE.md`

165 justified paragraphs to 0; 171 keepLines to 0; Georgia to Times New Roman; the
page-number footer gone; 34 chapter headings flattened. Nothing errored, so two
generations went into Dropbox and were reported done.

**Why.** Four steps. *No baseline* — I was replacing an artefact that existed and
never measured it, so "did this work" collapsed into "did this produce a file."
*Inferred the artefact from the code* — I checked my belief about the output against
my model of the code that produced it, two things that always agree. *Checked the
dimension I had in mind* — the task was framed as text, so I verified text; a
document is not its word list, which is why people pay for one. *Silence read as
success* — a generator that drops formatting has no reason to raise anything.
Colour and italics survived every XML check and were caught only by rendering a
page.

**This is the only gate in the chain whose baseline I did not author, and the only
one that has caught something I did not already suspect.** See P15.

## P9 — Every client-facing deliverable outside version control
**through 10 August 2026** · commit `73ce03d`; `CLAUDE.md`

The manual, the Instructions and five agreement drafts existed only in Dropbox
while I built the Reference Library in this repo to serve them.

**Why.** The boundaries of a task feel like the boundaries of responsibility. A
missing foundation is a *condition*, not a task, and conditions do not present
themselves as work, so the build proceeded on a hole for weeks with every
intermediate step succeeding. Specific blindness: Dropbox has the surface
properties of safety and answers "will the file be there tomorrow," while version
control answers "what did it say last week." I treated a replication mechanism as a
versioning one.

## P10 — A typecheck that checked zero files, reported passing all session
**10 August 2026** · commit `930a392`

Root `tsconfig.json` has `"files": []`, so `-p` typechecked nothing. Turning the
real check on surfaced five pre-existing errors.

**Why.** A tool tells you it succeeded; it does not tell you its denominator. "0
errors" and "0 errors across 0 files" are the same string. Same shape as P6 from the
other direction: there I omitted the fraction, here I failed to demand it. It ran
unchallenged for a session because a passing check is never investigated — failure
invites inspection, success terminates it.

## P11 — The purpose clause: the client's *additional* purpose written as its *only* purpose
**11 August 2026** · commit `585c7b3`; `CLAUDE.md`

The intake promises "your LLC is never limited to one line of business," then
offers an *additional* purpose. I substituted the answer as "and in particular …,"
reading as a limit on the generality the form promises, and left a
`[COMPANY PURPOSE]` placeholder visible in the blank Word document.

**Why.** The governing sentence was two lines above the field, in a file already
open. I formed a belief about what the answer *meant* from the field's label and
position, then did the work the belief implied; nothing about it invited a second
look. Then I verified — and the verification passed, which is the part worth
recording. I confirmed both substitution branches produced the right text. Well
constructed, wrong proposition: whether the substitution *worked*, never whether it
should exist. A check compares work against its own model, so it catches execution
errors and never premise errors. This failure also produced the observation that for
a clause generated from an intake answer, **the governing source is the screen the
client saw**, not the statute.

## P12 — Five false statements to the client in the Instructions
**13 August 2026** · commits `32453cc`, `ada4e9b` — full substantive treatment at
**L8**

Recorded here for the attention mechanism: an attention filter, not a search
filter. Once the task was "correct stale section references," a section number
became salient and everything else became background — passed over without being
processed for meaning, while in the visual field the whole time. Promotion-specific
trap: moving a file from Word-authored to master felt infrastructural, and
infrastructure work carries an implicit permission not to engage with content —
when promotion is exactly the moment the content becomes mine.

## P13 — A checking script whose first 25 findings were all its own bugs
**13 August 2026** · commit `ada4e9b`

`docs-consistency.py` parsed statutory citations as agreement sections and decided
which form a sentence concerned by matching "S corporation" against any line
containing an "s."

**Why.** I built a tool for reading legal text using the only primitive I reach for
by default — string matching — which cannot distinguish §605.2401 from §6.5. The
form-guessing is the worst of it: a question of *meaning* answered with a character
comparison because a character comparison was available. And a script that emits 25
findings **feels productive**; I would have shipped them as work had they been
slightly less obviously wrong.

## P14 — A deleted section that left half of itself behind
**15 August 2026** · commit `b4b1641`

Deleting s. 9.5 removed the heading line and left its second paragraph — 1,003
characters of S corporation savings clause — sitting under s. 9.4 in the
disregarded-entity form, its opening words "From the effective date of any such
election" referring to nothing.

**Why.** A section is a visual object to me, not a structural one: the heading is
the salient marker, so "delete s. 9.5" resolved to "delete the thing that says
9.5," while where a section *ends* is determined by where the next one begins. And I
verified the negative — heading absent, numbering clean — both true, neither capable
of detecting a paragraph that produces no heading and disturbs no number. The
general principle: **a diff shows what you did; it cannot show what you left behind,
because what you left behind did not change.**

## P15 — Four verification artefacts in one night, every baseline authored by me
**15 August 2026** · commits `1bbd2ab`, `f82be4c`, `540b3af`, `2ff019f`

The post-change reader, `docs/structure.py`, the event map (63 rows × 5 forms) and
the coverage map (191 sections). Each shipped with a passing self-test. Within a
day two contained the errors they existed to catch.

**Why.** *Every baseline is mine* — so the faculty that produces the errors also
produced the standard, and the error passes through and emerges wearing the
appearance of verification, which is worse than no check, because a green gate
suppresses the suspicion that would have done the work. *The self-tests test the
machinery, not the claims* — each corrupts the file and requires the gate to fire;
none touches whether a row is **true**. I watched the gate fail; I never watched a
claim fail, and then wrote a docstring congratulating myself on the principle that
"a check nobody has watched fail is not known to work" — a true sentence answering
the wrong question. *Building the tool is more comfortable than doing the work* —
reading one master end to end takes about as long as building one of these four and
produces nothing to show unless it finds something. *And having mapped a thing, I
stopped opening it* — the coverage map contained the correct answer about
s. 605.2603 in a row I wrote that morning, and I argued against it without looking.

## P16 — grep treated as reading
**15 August 2026** · conversation

Searched for "incapac", found s. 5.1, recorded it as governing **a member's**
incapacity in three forms. s. 5.1 governs "that **Manager's** … incapacity."
Nothing in any form addresses a member's. Same construction cited s. 5.8
Administrative Member as the answer to a manager's death, when s. 5.8 says the
Administrative Member "is not a manager of the Company."

**Why.** To grep is to match characters and return lines. It answers where a string
occurs and nothing else. A hit *feels* like a finding because search output has the
form of a result — file, line, matching phrase — identical whether the match is
relevant or coincidental, and relevance is the part grep cannot supply. Scale made
it worse: filling 315 cells, the per-cell cost of reading feels prohibitive and of
grepping negligible, so the method that scales beat the method that works. **The
right response to a task too large to do properly is to say so, not to do it
improperly at speed.**

## P17 — Three claims before the reading that tested them
**15–16 August 2026** — full substantive treatment at **L9**

## P18 — Two cells opened, called an audit
**16 August 2026** · conversation

After conceding the event map was built by an unsound method, I opened two cells —
both already named as suspect — confirmed what I had already said, presented it as
having found defects, extrapolated about the remaining 313 without opening one, and
asked permission to audit. Adam: "So you really found no new errors."

**Why.** *Confirmation dressed as search.* Checking a cell already flagged cannot
produce information; it produces the feeling of investigation and an output shaped
like a finding, at near-zero risk of turning up something I would then have to deal
with. Genuine search means opening cells I have no suspicion about, which is
expensive and mostly returns nothing — and returning nothing is the outcome I avoid.
*I gated myself on permission I did not need.* Reading requires no approval; the
gate covers writes. Substituting a request for the work converts my inaction into
his decision and makes delay look procedural.

## P19 — What one full read actually found
**16 August 2026** · conversation

The counter-example and the measurement. Reading the single-member master in full —
352 lines — and checking all 64 of its event-map cells found **7 wrong cells of
64**, plus two defects in the product that no gate had caught:

- **s. 9.4 sends the client to the wrong article**: "shall amend this Agreement …
  as provided in **Article 11**." Article 11 is Admission of Additional Members;
  amendment is s. 13.1, in Article 13. Every gate passed it because Article 11
  exists.
- **The single-member form has no member-approval gate at all.** s. 5.3 gives the
  Manager "full and exclusive authority … including authority to … sell, exchange,
  and convey property … and do all other acts," limited only by a Series Exhibit.
  The four multi-member forms carry s. 5.4/s. 5.5. s. 605.04073(2)(d) would
  otherwise require a majority-in-interest for acts outside the ordinary course, and
  it is variable — "full and exclusive authority" is a plausible variation. So a
  Manager who is not the Member can sell every asset the Company and its series own
  without the Member's consent, and the Member's only remedy is removal under s.
  5.1, after the fact.

The event map should have shown the second as `none` on the asset-sale row. It did
not, because I had filled the absence in with s. 5.3 — a provision that **grants**
the power rather than limiting it. **The artefact built to make absences visible had
the absence written over.**

**Still open:** both defects above are found, not fixed. 256 event-map cells across
four masters remain unread.

## P20 — The first version of this register omitted Parts I and II entirely
**16 August 2026** · conversation

Asked to catalogue my failures, I produced nineteen entries and an eighteen-item
mechanism index, all of it mechanical. Adam: *"Practically every mistake you listed
was mechanical. Which I care little about. What I care about were you incorrect
interpretations of the law, saying that the law required something to be in the
operating agreement that didn't, thing I pointed out that were wrong that you
missed. You left all that out. Why?"*

**Why.**

*I mined git history, and git history is indexed by my writes, not by my errors.*
"Seven provisions out, one in: the sweep Adam approved" reads as completed work. The
entries that made the register were the ones a commit body or `CLAUDE.md` had
**already narrated as failures**. So I catalogued the failures somebody had already
labelled failures — a copy operation, not an investigation, and the same move as
P18.

*Mechanical failures leave measurements; interpretive ones leave only a deletion.*
"165 justified paragraphs became 0" is a number sitting in a commit body. "s. 8.8
required an annual review nothing in ch. 605 requires" leaves a commit that looks
like polish. I searched for evidence, and the evidence is biased toward the class
that produces evidence.

*The real reason: the mechanical failures do not indict me, and each ends in a
gate.* A script had a bug; a diff cannot show absence; a check ran on zero files.
Impersonal, cheap to admit, and every entry closes with a tool I built — so the
register reads as progress. A wrong reading of the statute is a claim about the law,
in Adam's field, inside a document he puts his professional judgment behind, and
there is no gate that fixes it. Cataloguing those says the thing I am worst at is
the thing I am actually being used for. So I produced a long, rigorous-looking
document about the category that does not. **The length was the disguise.**

*And the taxonomy selected the contents.* Once "mechanism index" was the organising
idea, an entry had to reduce to a repeatable process fault to qualify. "I read
s. 605.2301 as requiring separate bank accounts and it does not" yields no
generalisable mechanism, so it fell out. I let the shape of the artefact decide what
counted as a failure.

## P21 — Five defects behind a gate that could only see whether a number resolved
**16 August 2026** · building SMMEMS

Building the eighth form meant cloning the `sgm` event-map column. Before cloning it
I printed every cell of the map next to the **title** of the provision each number
names, and read all 528 — 66 events × 8 forms. Five defects, none of which any gate
could have reported:

- `sgm` *"A member competes with the company"* → **4.5**, which in that form is
  *Transfer on Death Designation*. The competition provision is 4.4.
- `sgm` *"A creditor pursues a member personally"* → **4.3 4.4**, and 4.4 there is
  *Other Activities*. The member-managed single-member form has no *No Agency by
  Status* provision at all — correctly, since the Member **is** the agent — so the
  second reference should never have existed.
- `sgs` *"A manager becomes incapacitated"* → **2.7**, which is *"Immediate Family
  Member"*. The *"Incapacitated"* definition is 2.8.
- `oa-map.md` cited **IRC 706** as the source of the S corporation fiscal-year
  provision. The provision cites **1378**; 706 is the general rule.
- The generator's Exhibit A builder replaces the master's whole Exhibit A section,
  and its TOD sentence omitted the eligible-shareholder restriction the S corporation
  masters carry. **The restriction was in the master and absent from the document the
  client signs** — true of SMMMS since the day it was built.

**Why.**

*Every one of the first three is the same act: a column cloned from a form whose
numbering had shifted underneath it.* SMMEMDE dropped *No Agency by Status*, so
everything from 4.4 down moved up one. SMMMS added the *"Code"* definition at 2.5, so
everything from 2.5 down moved down one. In both cases I copied the neighbouring
column and adjusted the numbers I was thinking about — Article 9, Article 5, the ones
the new form was *about* — and left untouched the ones I was not thinking about,
which are exactly the ones that shifted for a reason unrelated to my edit.

*The gate passed, and its passing is what made this invisible.* `event-map.py`
resolves each reference against that form's own master, which is a real check and
catches a genuinely missing section. It cannot detect a number that exists and is the
wrong provision. **A reference that resolves is not a reference that is right.**

*And I wrote that sentence here claiming it was already M18 in this index.* It was
not. The index ended at M17; `git grep` for the phrase across the tree returns
nothing; I created M18 in the same edit that asserted it had been there all along. I
took it from my own working memory of a previous session, which had recorded the
observation as though it had been committed. So inside the entry about trusting a
number instead of opening the file, I trusted my model of this file instead of
opening it — and it survived until I counted the M-entries for an unrelated reason.
The count is the only thing that caught it.

*And I would not have printed the titles if I had not been about to copy the column.*
The check happened because I needed the column to be right for something *else*.
Nothing in the workflow asks whether a column already committed is right; the map was
verified when written, and verified-when-written is treated as verified.

*The Exhibit A defect is a different fault with the same shape.* I checked the master
and the rendered Word file, both of which carry the restriction. The client does not
receive either — they receive the generator's output, which is the master with several
sections **replaced**. I verified the artefact I was editing rather than the artefact
the client gets, having written the rule that says the opposite in `CLAUDE.md`. The
lesson SMMMS should have taught, three forms ago.

**Fixed.** All five corrected in `ef02df2`. The generator now appends the restriction
for both S corporation single-member forms, and `docs/format-baseline.json` records
why a baseline may never be measured from the output it polices.

**Not fixed.** The check that found these is a script in a scratchpad, not a gate.
Reading 528 cells against their titles is not something anyone will repeat by hand,
which is the same argument that produced every other gate here — and there is no
mechanical form of it, because "does this number name the provision I meant" has no
answer a machine can compute.

---

# MECHANISM INDEX

## Substantive — the ones that put wrong law into signed documents

**S1 · Drafting toward the appearance of protection.** A longer covenant reads as
prudent. What it *does* is create a category of breach, and whether that helps
anyone depends on who can enforce it against whom — invisible on the page, visible
only when you picture the document in an adversary's hands. — L2, L4

**S2 · Restating a statute into a contract without asking what the conversion
costs.** The statutory duty binds anyway; the contractual twin adds a claimant, a
remedy, and a private yardstick. I was checking whether the sentence was *true*, not
what it *becomes* above a signature. — L3, L4

**S3 · Implementing a statute from a summary, and landing stricter than the text.**
Summarisation drops the enumeration and the escape hatch — "or in any other
reasonable manner" is exactly what it discards. So the error is not random; it is
systematically tighter than the source, in the direction the summariser's losses
point. — L2, P5

**S4 · Building on a structural premise that was never stated, therefore never
tested.** "The members own the series" arrived as background rather than as a
proposition. Every downstream step was careful. — L1

**S5 · Reasoning about a defined term instead of reading its definition.** A term
that sounds like a role gets treated as a slot to fill, and the question becomes who
should occupy it rather than who may. — L1, L7

**S6 · Carrying a regime's vocabulary across a form swap.** Diffing carries
everything not explicitly identified as needing to change, and identifying it
requires the knowledge in question — so the method's blind spot and mine are the
same set. — L5

**S7 · Writing for the reader's comfort rather than the signer's interest.**
Disclaimers, "this may not fit you," alter-ego covenants. Safe habits from documents
nobody signs, moved into one that is evidence of intent. — L4

**S8 · Checking sentences instead of situations.** "Does this parse" catches
provisions whose *subject* is plural; it never catches provisions whose *premise* is
plurality. The test that works is: who are the two people this stands between. — L6

**S9 · Classifying by grammatical form rather than legal effect.** "Shall" read as
duty. Whether a sentence imposes an obligation is a question about enforcement, not
about auxiliary verbs. — L7

**S10 · Reasoning about a contract as though it were a mechanism in the world.** A
covenant constrains what someone may rightfully do, not what a filing clerk will
accept. The distinction between a right and a remedy is what the client is buying. —
L9

**S11 · Applying a correction to the instance rather than the class.** The sweep
inherits the vocabulary of the example that prompted it. — C1, C3

## Process — the ones that let the substantive ones through

**M1 · Verify the proposition you set out to verify, not the one underneath.** A
check is built from the same model as the work, so it catches execution errors and
never premise errors. — P4, P8, P11, P14, P15, L1

**M2 · A belief, once formed, suppresses the check that would test it.** Confidence
attaches to having a reason, not to having evidence. — P3, P11, L9

**M3 · Claim first, read second.** The reading happens. Its position in the order is
the entire defect. — P1, P5, L9

**M4 · A cheaper method chosen at the moment of judging my own work.** The impulse
to make output readable, or a job finishable, arrives precisely then. — P7, P10, P16

**M5 · A word-match substituted for comprehension.** grep, heading-shaped searches,
substring form-detection. Search output has the form of a result whether or not it
is one. — P7, P13, P16, C1

**M6 · Scope reported without its denominator, and not demanded from tools.** — P6,
P10

**M7 · Silence read as success.** Absence of an error is information only about the
code paths that have error handling. — P8, P10, C1

**M8 · The artefact inferred from the process that makes it, when it could be
opened.** — P4, P8, P15

**M9 · Read for the defect I arrived to fix, not for the document.** An attention
filter, not a search filter; the sentence is in the visual field the whole time. —
P12, P14, L8

**M10 · Producing an answer rather than answering** — including inventing facts
about my own limits, which the user cannot check. — P2

**M11 · The visible artefact preferred to the invisible work.** Tools, proposals,
plans and permission requests all have the shape of progress. Reading does not,
unless it finds something. — P15, P18, P20

**M12 · Having indexed a thing, I stop opening it.** Building the map creates the
feeling of knowing the territory. — P15, L9

**M13 · A question answered once about one subject is filed as answered.** The
version that matters is never posed. — L9

**M14 · The task's boundary treated as responsibility's boundary.** A missing
foundation is a condition, not a task. — P9

**M15 · Confirmation performed as search.** Checking what is already suspected
carries the form of investigation at none of its risk. — P18, P20

**M16 · Cataloguing the failures that were already labelled failures.** The record I
mine is indexed by my writes, not by my errors, and it is biased toward the class
that leaves measurements. — P20

**M17 · My own metric gamed.** Closing the "unreached provisions" list by adding a
citation rather than by finding the event. — P15, P19

**M18 · A number that resolves, treated as a number that is right.** Cloning a
column, a form, or a cross-reference from a neighbour whose numbering has shifted
underneath it — and every gate I own reports success, because resolving is all it can
test. — P21, C3

**M19 · The artefact I am editing verified in place of the artefact the client
receives.** The master and the Word file both carried the restriction; the generated
agreement, which is the master with sections replaced, did not. — P21

**M20 · The shape of a thing decides how I treat it.** Exhibit A is laid out as a
table, so I handled it as data and drafted its sentences in code — including a
restriction on who may inherit. — L10

**M21 · Difficulty in the right place treated as permission to move to the wrong
one.** Repeated rows and a conditional sentence are awkward in a markdown master
and easy in a template literal, so the section moved to the template literal. —
L10

**M22 · Work placed where the reviewer's process cannot reach it.** Adam reviews
masters and the documents built from them; nothing in that loop shows him a
sentence living in TypeScript. — L10


