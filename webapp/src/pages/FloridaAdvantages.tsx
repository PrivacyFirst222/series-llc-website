import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";
import { Landmark, ScrollText, Anchor, Scale, FileCheck, Building2 } from "lucide-react";

const COMPARISON_ROWS: { feature: string; fl: string; de: string; tx: string }[] = [
  { feature: "Series can hold real property in its own name", fl: "Yes (§605.2301)", de: "No", tx: "Ambiguous" },
  { feature: "Statutory entity status", fl: "Full", de: "Partial", tx: "Limited" },
  { feature: "Charging order exclusivity inherited", fl: "Yes (§605.2108)", de: "Limited", tx: "Limited" },
  { feature: "Vertical (parent ↔ series) shield", fl: "Yes", de: "Yes", tx: "Yes" },
  { feature: "Foreign series — recognized in FL?", fl: "Yes — but no §605.2301 benefits", de: "—", tx: "—" },
  { feature: "Filing fee per series", fl: "$0", de: "$0", tx: "$0 — but $300 franchise tax/series" },
];

export default function FloridaAdvantages() {
  return (
    <>
      <PageHero
        eyebrow="The Florida edge"
        title={
          <>
            Two statutes that make Florida the <em>strongest</em> series LLC state in America.
          </>
        }
        description="Most series LLC statutes were written 15+ years ago, when nobody quite knew how courts would treat them. Florida had the benefit of hindsight — and used it."
      />

      {/* Statute deep dive 1 */}
      <section className="bg-secondary/40">
        <div className="container-wide py-20 lg:py-28">
          <div className="grid lg:grid-cols-12 gap-14">
            <div className="lg:col-span-5 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-trust/30 bg-trust/5 px-3 py-1 text-trust">
                <Landmark className="h-4 w-4" />
                <span className="font-mono-feature text-xs uppercase tracking-[0.18em]">§605.2301</span>
              </div>
              <h2 className="display text-4xl text-balance lg:text-5xl">
                Real Property Recording Rules
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                In most series-LLC states, real property has to be titled in the parent or in a hybrid
                "Series A of Sunshine Holdings, LLC" format that confuses lenders and county clerks.
                Florida fixed this.
              </p>
            </div>
            <div className="lg:col-span-7 space-y-5">
              <div className="rounded-2xl border border-border bg-card p-7">
                <h3 className="font-display text-lg font-semibold">What it does</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Section 605.2301 explicitly authorizes a Florida county clerk to record deeds, mortgages,
                  liens, and easements <em className="font-display text-foreground">in the name of a
                  protected series itself</em>. The series is treated as a recordable owner — like a
                  natural person, a corporation, or a trust.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-7">
                <h3 className="font-display text-lg font-semibold">Why it matters</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {[
                    "Title insurance underwriters can issue clean policies on series-owned property.",
                    "Lenders can lend to a single series without parent-level guarantees.",
                    "1031 exchanges work cleanly — series is its own taxpayer-recognized owner.",
                    "Series-level deed restrictions and easements are recordable and enforceable.",
                  ].map((p) => (
                    <li key={p} className="flex gap-2">
                      <FileCheck className="mt-0.5 h-4 w-4 text-trust shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border-l-4 border-accent bg-card p-7">
                <p className="font-display text-xl leading-snug text-foreground">
                  "Florida is the first state to make series LLCs <em>actually work</em> for residential
                  and commercial real estate at scale."
                </p>
                <p className="mt-3 text-xs text-muted-foreground">
                  — Florida Bar Journal, "The Protected Series LLC Comes to Florida," Vol. 99, No. 2
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Statute deep dive 2 */}
      <section>
        <div className="container-wide py-20 lg:py-28">
          <div className="grid lg:grid-cols-12 gap-14">
            <div className="lg:col-span-7 space-y-5 lg:order-2">
              <div className="rounded-2xl border border-border bg-card p-7">
                <h3 className="font-display text-lg font-semibold">What it does</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  Section 605.2108 imports the <em className="text-foreground">entirety</em> of Florida's
                  Revised LLC Act (Chapter 605) into series-level operations — except where the protected
                  series provisions specifically modify it. In effect, every protected series stands on
                  Florida's well-developed regular LLC caselaw and statutory protections.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-7">
                <h3 className="font-display text-lg font-semibold">What you inherit</h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
                  {[
                    { i: Scale, t: "Charging-order-only creditor remedy" },
                    { i: Anchor, t: "Member liability protection" },
                    { i: Building2, t: "Manager fiduciary duty framework" },
                    { i: ScrollText, t: "Operating agreement primacy" },
                    { i: FileCheck, t: "Florida judicial dissolution standard" },
                    { i: Scale, t: "Decades of FL court precedent" },
                  ].map((row) => {
                    const Icon = row.i;
                    return (
                      <li key={row.t} className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        {row.t}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
            <div className="lg:col-span-5 space-y-5 lg:order-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-trust/30 bg-trust/5 px-3 py-1 text-trust">
                <ScrollText className="h-4 w-4" />
                <span className="font-mono-feature text-xs uppercase tracking-[0.18em]">§605.2108</span>
              </div>
              <h2 className="display text-4xl text-balance lg:text-5xl">
                Broader Extrapolation Rule
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Other states' series statutes are silos — courts have to guess how regular LLC law applies.
                Florida's statute eliminates the guesswork: every protection a regular Florida LLC enjoys
                automatically applies to every series.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* State comparison table */}
      <section className="bg-primary text-primary-foreground">
        <div className="container-wide py-20 lg:py-28">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1 text-xs uppercase tracking-[0.18em]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> State by state
            </span>
            <h2 className="display mt-4 text-4xl text-balance lg:text-5xl">
              How Florida compares to <em>Delaware</em> and <em>Texas</em>.
            </h2>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-primary-foreground/15 bg-primary-foreground/[0.04]">
            <div className="grid grid-cols-4 border-b border-primary-foreground/15 px-6 py-4 text-xs uppercase tracking-[0.16em] text-primary-foreground/60">
              <span>Feature</span>
              <span className="text-center text-accent">Florida</span>
              <span className="text-center">Delaware</span>
              <span className="text-center">Texas</span>
            </div>
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-4 px-6 py-4 text-sm ${
                  i !== COMPARISON_ROWS.length - 1 ? "border-b border-primary-foreground/10" : ""
                }`}
              >
                <span className="text-primary-foreground/85">{row.feature}</span>
                <span className="text-center font-display text-base text-accent">{row.fl}</span>
                <span className="text-center text-primary-foreground/70">{row.de}</span>
                <span className="text-center text-primary-foreground/70">{row.tx}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CallToAction
        eyebrow="Florida-first"
        title="Lock in the Florida edge."
        body="Beat the July 1, 2026 effective date — early-bird filings reserve your name and start your statutory clock the moment the law takes effect."
      />
    </>
  );
}
