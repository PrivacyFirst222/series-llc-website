import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";
import { Landmark, ScrollText, Anchor, Scale, FileCheck, Building2 } from "lucide-react";

const COMPARISON_ROWS: { feature: string; fl: string; de: string; tx: string }[] = [
  { feature: "Statutory entity status", fl: "Full", de: "Partial", tx: "Limited" },
  { feature: "Charging order exclusivity inherited", fl: "Yes (§605.2108)", de: "Limited", tx: "Limited" },
  { feature: "Vertical (parent ↔ series) shield", fl: "Yes", de: "Yes", tx: "Yes" },
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
        <div className="container-wide section-y">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-14">
            <div className="lg:col-span-5 space-y-5">
              <div className="inline-flex items-center gap-2 rounded-full border border-trust/30 bg-trust/5 px-3 py-1 text-trust">
                <Landmark className="h-4 w-4" />
                <span className="font-mono-feature text-xs uppercase tracking-[0.18em]">§605.2301</span>
              </div>
              <h2 className="display text-4xl text-balance lg:text-5xl">
                Associated Assets &amp; Real Property
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Florida real estate can be deeded to, held by, and conveyed by a protected series in its
                own name. What keeps that separation intact is how the property is titled and how well
                your records tie it to the series.
              </p>
            </div>
            <div className="lg:col-span-7 space-y-5">
              <div className="rounded-2xl border border-border bg-card p-7">
                <h3 className="font-display text-lg font-semibold">What the statute does</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  A protected series is a person distinct from the LLC and from every other series
                  (§605.2103), with the same powers and purposes as the LLC (§605.2104) — and those powers
                  include acquiring, owning, and conveying real property (§605.0109). Section 605.2301
                  addresses deeds directly: a recorded deed granting an interest in real property{" "}
                  <em className="font-display text-foreground">to or from a protected series</em> is
                  conclusive of the signer's authority in favor of a person who gives value without
                  knowledge of any lack of authority, and stands as the record that the property is an
                  associated asset of that series.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-7">
                <h3 className="font-display text-lg font-semibold">What you have to get right</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {[
                    "Title in the series' own statutory name — it begins with the LLC's name and includes \"protected series\" or \"P.S.\" (§605.2202).",
                    "A protected series may not hold an asset in the LLC's name or another series' name (§605.2301(5)).",
                    "Your records must let a disinterested, reasonable person identify the asset, when and from whom it was acquired, and any consideration paid (§605.2301(2)).",
                    "Property not properly associated with its series can be reached by a judgment against the company or another series (§605.2404).",
                  ].map((p) => (
                    <li key={p} className="flex gap-2">
                      <FileCheck className="mt-0.5 h-4 w-4 text-trust shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Statute deep dive 2 */}
      <section>
        <div className="container-wide section-y">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-14">
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
        <div className="container-wide section-y">
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
        body="The law is in effect and filings are open — reserve your name and start your statutory clock as soon as the Division accepts your Articles."
      />
    </>
  );
}
