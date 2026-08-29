/**
 * Learn More screens for the operating agreement questionnaire.
 * Copy approved by Adam in chat 2026-08-05 — do not edit without re-approval.
 * Format: explanation, then "If you choose X… / If you choose Y…".
 */
import type { ReactNode } from "react";
import { P, Choice } from "./oaLearnMoreParts";

export interface LearnMoreScreen {
  title: string;
  body: ReactNode;
}


export const LEARN_MORE: Record<string, LearnMoreScreen> = {
  sElection: {
    title: "S Corporation Status",
    body: (
      <div className="space-y-3">
        <P>
          An S election is a federal tax status made with the IRS (Form 2553, with every owner's
          consent) — often used to reduce self-employment taxes on an active business. It comes
          with strict rules: one class of ownership, strictly pro-rata distributions, and only
          eligible shareholders (generally individuals and certain trusts — no entities or
          nonresident aliens, and no more than 100).
        </P>
        <Choice label={'If you choose "Yes":'}>
          Your agreement is built on our dedicated S corporation form. It has no partnership tax
          machinery, every distribution is strictly pro rata, and every owner shares in the
          company and in every protected series identically — per-series ownership cannot vary,
          because the current state of the law is uncertain if different series have different
          members, which could cause you to lose your S corporation status. And that can be
          extremely expensive. The agreement also restricts transfers and transfer-on-death
          designations to eligible shareholders, and includes a savings clause that keeps the
          election valid and requires everyone to cooperate in fixing an inadvertent termination.
        </Choice>
        <Choice label={'If you choose "No":'}>
          Your agreement uses our standard form — with one owner, the company is simply part of
          your personal tax return; with multiple owners, it is taxed as a partnership — and
          different owners can share in different protected series in different percentages.
        </Choice>
        <P>
          <strong className="text-foreground">Worth knowing:</strong> this questionnaire does not
          make the election — that happens with the IRS. Choose Yes only if you have made, or
          your tax professional is making, the election. You can switch forms later by generating
          an amended and restated agreement.
        </P>
      </div>
    ),
  },
  firstOrAmended: {
    title: "First Agreement, or Amending and Restating?",
    body: (
      <div className="space-y-3">
        <P>
          An operating agreement can be brand new, or it can replace one the company already
          has. This choice sets which kind of document we prepare — the terms inside are the
          same either way; what changes is how the document treats anything that came before it.
        </P>
        <Choice label={'If you choose "This is the company\'s first operating agreement":'}>
          The document is titled simply "Operating Agreement" and takes effect as the company's
          original governing agreement. Choose this if the company has never had a written or
          oral operating agreement — typical for a newly formed company.
        </Choice>
        <Choice label={'If you choose "I\'m amending and restating an existing agreement":'}>
          The document is titled "Amended and Restated Operating Agreement" and includes language
          stating that it replaces the prior agreement in its entirety. From its effective date,
          the old agreement — whatever it said — no longer governs, and only the new document
          controls. Choose this if the company already has an operating agreement of any kind:
          one we generated before, one prepared elsewhere, or even an informal oral arrangement
          among the owners. If you converted an existing LLC, your company almost certainly has a
          prior agreement, which is why we've pre-selected this option for you.
        </Choice>
        <P>
          <strong className="text-foreground">Worth knowing:</strong> keeping two operating
          agreements "alive" at once creates exactly the kind of ambiguity that hurts in a
          dispute. If a prior agreement exists, amending and restating — and then storing the old
          document as a historical record, clearly marked superseded — keeps the company's
          governance clean. In a multi-member company, the amended and restated agreement should
          be signed by all current members, just like the original.
        </P>
      </div>
    ),
  },
  capitalCalls: {
    title: "Additional Capital Calls",
    body: (
      <div className="space-y-3">
        <P>
          Sometimes a company needs more money than it has — a roof fails, a tenant stops paying,
          an opportunity appears. This provision decides whether the owners can be{" "}
          <em>required</em> to contribute more money after formation.
        </P>
        <Choice label="If you choose Include:">
          A majority of the owners can approve a "capital call." Every owner must then contribute
          their share (proportional to ownership) within 30 days, up to the annual per-owner cap
          you set below. An owner who fails to pay can face enforcement, and the other owners may
          cover the shortfall and receive a larger ownership percentage in exchange. This gives
          the company a built-in funding mechanism and creates an ongoing obligation that
          strengthens the agreement's bankruptcy protections.
        </Choice>
        <Choice label="If you choose Omit:">
          No owner can ever be forced to put in more money than their initial contribution. A
          cash-strapped company must instead borrow, find new investors, or dissolve. This is
          friendlier to passive investors — but it removes one of the ongoing obligations that
          support the agreement's protections if an owner ever files bankruptcy, and the company
          has no way to compel funding in an emergency.
        </Choice>
        <P>
          <strong className="text-foreground">The annual cap:</strong> if you include capital
          calls, you set a maximum any owner can be required to contribute per calendar year. A
          common approach is a figure tied to about a year of expected expenses for the assets
          involved. The cap can only be exceeded if <em>every</em> owner agrees.
        </P>
      </div>
    ),
  },
  competition: {
    title: "Competition Between Owners and the Company",
    body: (
      <div className="space-y-3">
        <P>
          Your owners may have other businesses and investments. This choice decides whether
          owners are allowed to compete with the company or its series while they're members.
        </P>
        <Choice label="If you choose Alternative A (no competition):">
          While a member of the company, no owner may compete with the company or with any series
          that owner is associated with. An owner who starts or joins a competing venture
          breaches the agreement. The restriction ends when the company dissolves and imposes
          nothing after an owner exits. This suits active business partners who expect each
          other's full loyalty.
        </Choice>
        <Choice label="If you choose Alternative B (competition permitted):">
          Every owner may freely engage in other ventures — including ones that compete with the
          company or its series — without breaching any duty, and no owner has to offer business
          opportunities to the company first. This suits passive co-investors, family
          arrangements, and investors with multiple holdings: for example, real estate investors
          who own other rental properties individually usually need Alternative B, because under
          Alternative A merely owning those other rentals could be a breach.
        </Choice>
      </div>
    ),
  },
  shotgun: {
    title: 'Deadlock "Buy-Sell" Provision',
    body: (
      <div className="space-y-3">
        <P>
          If ownership can split evenly — two 50/50 owners, or two equal factions — the company
          can deadlock: no majority, no decision, no way forward. Without a plan, the only exit
          is asking a court to dissolve the company. This provision builds in an exit.
        </P>
        <Choice label="If you choose Include:">
          After a deadlock lasts 60 days, any owner holding at least 25% may name a single
          all-cash value for the entire company. The <em>other</em> side then chooses: buy the
          offering owner out at that value, or sell their own interest at it. Because the person
          naming the price doesn't know whether they'll end up the buyer or the seller, they have
          every reason to name a fair number — it works like one person cutting the cake and the
          other choosing the slice. Be aware: the mechanism favors the side with more cash, since
          the other side may be forced to sell even at a fair price.
        </Choice>
        <Choice label="If you choose Omit:">
          There is no built-in deadlock exit. A deadlocked company continues under the last
          decisions actually made, and an owner's remedy is negotiation or a court proceeding.
          Owners with unequal percentages rarely need this provision — a majority can simply
          outvote a deadlock.
        </Choice>
      </div>
    ),
  },
  threshold: {
    title: "Manager's Borrowing Limit",
    body: (
      <div className="space-y-3">
        <P>
          Your manager runs day-to-day operations without needing a vote for every decision. This
          number sets the ceiling: debt above it requires the consent of every owner.
        </P>
        <Choice label="If you set a lower amount:">
          Owners keep tighter control — the manager must come back to everyone before borrowing
          anything significant, and any one owner can say no. More protection, more friction.
        </Choice>
        <Choice label="If you set a higher amount:">
          The manager can act quickly — financing a repair or closing a time-sensitive deal
          without waiting on votes. More flexibility, more trust placed in the manager.
        </Choice>
        <P>
          Common choices for small companies run from $10,000 to $50,000. The limit applies per
          transaction (or related series of transactions), and guarantees of anyone else's debt
          always require every owner's consent regardless of amount.
        </P>
      </div>
    ),
  },
  tod: {
    title: "Transfer-on-Death Designation",
    body: (
      <div className="space-y-3">
        <P>
          Normally, when an owner dies, their company interest passes through their estate —
          which can mean probate: months of court process before anyone can act. Florida law lets
          you name a beneficiary who receives your interest <em>directly</em> at death, skipping
          probate, like a payable-on-death bank account.
        </P>
        <Choice label="If you designate a beneficiary:">
          You may name any person or entity. At your death, your interest passes to them
          automatically, subject to the operating agreement. In multi-member companies: your
          beneficiary immediately receives the economic rights — your share of distributions —
          from day one. If your beneficiary is close family (as the agreement defines it), they
          become a full voting member once they sign on to the agreement; anyone else becomes a
          voting member only if the other owners consent, the same rule that applies to lifetime
          transfers. Either way, the money flows to your chosen person without probate.
        </Choice>
        <Choice label="If you skip it:">
          Your interest passes through your estate — your will, or Florida's default rules if you
          have none. The agreement keeps the company running while that happens, but your heirs
          may wait on probate before receiving anything.
        </Choice>
        <P>
          <strong className="text-foreground">Worth knowing:</strong> you can change or remove
          the designation later (a signed writing with two witnesses, delivered to the manager).
          A will does <em>not</em> override this designation. If you have a trust or a larger
          estate plan, tell your estate planner about this designation so the pieces work
          together.
        </P>
      </div>
    ),
  },
  spousal: {
    title: "Owning Your Interest Together as Spouses",
    body: (
      <div className="space-y-3">
        <P>
          Married couples in Florida can own property — including an interest in this company —
          in a special form called <strong className="text-foreground">tenancy by the entirety
          (TBE)</strong>, available only to spouses. The law treats the couple as a single owner:
          neither spouse owns a share; the marriage owns the whole thing. That one idea produces
          a powerful asset-protection result.
        </P>
        <Choice label="If you choose tenants by the entirety:">
          A creditor of just <em>one</em> spouse generally cannot touch the interest at all — not
          seize it, not lien it, not force its sale — because neither spouse individually owns
          anything to take. Only a creditor of <em>both</em> spouses jointly (like a debt you both
          signed) can reach TBE property. If one spouse dies, the survivor automatically owns the
          entire interest, with no probate. The trade-offs: it only works while you're married
          (divorce converts the interest to ordinary co-ownership, and the protection ends),
          neither spouse can sell or transfer their piece alone, and you must actually be married
          when you acquire the interest this way.
        </Choice>
        <Choice label="If you choose joint tenants with right of survivorship (JTWROS):">
          The survivorship benefit is the same — the surviving spouse (or co-owner) automatically
          inherits, skipping probate. But the asset protection is much weaker: each owner holds
          their own separate half, so a creditor of one spouse <em>can</em> reach that spouse's
          half, and either owner can sever the joint tenancy on their own. JTWROS also doesn't
          require marriage. In practice, spouses choose JTWROS mainly when TBE isn't available to
          them.
        </Choice>
        <Choice label="If each spouse owns individually:">
          Each interest stands alone — separately transferable, and passing at death by TOD
          designation, will, or probate rather than automatic survivorship. A creditor of one
          spouse can pursue that spouse's interest, though Florida's charging-order protection may
          still apply — in a multi-member company, the creditor is generally limited to receiving
          that spouse's distributions, with no voting rights and no power to seize the interest
          itself. That's meaningful protection, but it isn't the same as TBE's full exemption: a
          charging order still captures the money as it flows, while a creditor of one spouse
          generally can't reach a TBE interest at all.
        </Choice>
        <P>
          <strong className="text-foreground">Worth knowing:</strong> TBE and JTWROS both require
          the spouses to own <strong className="text-foreground">equal, undivided shares of a
          single interest</strong> — the couple owns the whole thing together, not pieces of it.
          If you want unequal ownership between spouses (say, 51% and 49%), neither form is
          available; each spouse owns their percentage individually, with the individual-ownership
          consequences above. Also, with TBE and JTWROS ownership, the couple votes as a single
          unit — the agreement requires both spouses to agree to vote the interest — and a TOD
          beneficiary designated for a jointly held interest takes effect at the death of the last
          surviving spouse.
        </P>
        <P>
          ⚠️ <strong className="text-foreground">If you don't live in Florida:</strong> tenancy by
          the entirety is a creature of state law. Some states don't recognize it at all, others
          limit it to real estate, and which state's law applies to you can depend on where you
          live. Before relying on this protection, check with an attorney in the state where you
          reside.
        </P>
      </div>
    ),
  },
  contributions: {
    title: "Initial Contributions",
    body: (
      <div className="space-y-3">
        <P>
          Your contribution is what you're putting into the company or a series to start it —
          cash, property, or both. It gets recorded in the agreement's exhibits.
        </P>
        <P>
          <strong className="text-foreground">Why it matters:</strong> a funded company is harder
          for a future creditor to attack as an empty shell, and your contributions establish
          your investment for tax and accounting purposes. Contributions to a specific series
          belong to that series alone — deposit the money into that series' own bank account so
          the records match the agreement.
        </P>
        <Choice label="If you enter amounts now:">
          They're printed in Exhibit A and the Series Exhibits, and the agreement is complete on
          signing.
        </Choice>
        <Choice label="If you're not sure yet:">
          Enter what you plan to contribute — the exhibits can be updated when amounts change.
          What matters most is that money actually moved matches what the records say.
        </Choice>
      </div>
    ),
  },
  effectiveDate: {
    title: "Effective Date",
    body: (
      <div className="space-y-3">
        <P>The date your operating agreement takes effect. We've pre-filled today's date.</P>
        <Choice label="If you keep today's date:">
          The agreement governs from today forward — the usual choice when the company is newly
          formed.
        </Choice>
        <Choice label="If you pick a different date:">
          The agreement takes effect on the date you choose. Owners sometimes match it to the
          company's formation date or the date a property closes. It should not be earlier than
          the company's formation.
        </Choice>
      </div>
    ),
  },
};
