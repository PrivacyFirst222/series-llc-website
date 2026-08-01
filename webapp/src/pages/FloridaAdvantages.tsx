import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";
import { Landmark, ScrollText, Anchor, Scale, FileCheck, Building2 } from "lucide-react";

const COMPARISON_ROWS: { feature: string; fl: string; de: string }[] = [
  { feature: "Series is a person distinct from the LLC", fl: "Yes (§605.2103)", de: "—" },
  { feature: "Series can hold title to property in its own name", fl: "Yes (§605.2301)", de: "Yes (§18-215(c))" },
  { feature: "Series debts enforceable only against that series", fl: "Yes (§605.2401)", de: "Yes (§18-215(b))" },
  {
    feature: "Shield applies without a notice provision in the certificate of formation",
    fl: "Yes",
    de: "No (§18-215(b))",
  },
];

export default function FloridaAdvantages() {
  return (
    <>
      <PageHero
        eyebrow="The Florida edge"
        title={
          <>
            Two sections worth reading before you <em>file</em>.
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
                  Where it applies, §605.2108 tells a court to read a protected series{" "}
                  <em className="text-foreground">as if it were its own LLC</em> — separately formed and
                  distinct from the company and every other series, with its associated members treated as
                  that LLC's members, its managers as its managers, and its assets as its assets. It is a
                  targeted rule, not a blanket one: it operates in the application of the specific sections
                  the statute lists.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-7">
                <h3 className="font-display text-lg font-semibold">Where it applies</h3>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2 text-sm">
                  {[
                    { i: ScrollText, t: "§605.2106 — operating agreement" },
                    { i: Building2, t: "§605.2304(3) — manager duties" },
                    { i: Scale, t: "§605.2304(6) — derivative actions" },
                    { i: FileCheck, t: "§605.2501(4)(a) — judicial dissolution" },
                    { i: Anchor, t: "§605.2502(1) — winding up" },
                    { i: Scale, t: "§605.2503(2) — claims process" },
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
                Application of the Chapter
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                For the questions it covers, Florida's statute says how to treat a protected series
                instead of leaving a court to work it out — a deeming rule that stands the series up as
                its own LLC for those purposes.
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
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Side by side
            </span>
            <h2 className="display mt-4 text-4xl text-balance lg:text-5xl">
              How Florida compares to <em>Delaware</em>.
            </h2>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-primary-foreground/15 bg-primary-foreground/[0.04]">
            <div className="grid grid-cols-3 border-b border-primary-foreground/15 px-6 py-4 text-xs uppercase tracking-[0.16em] text-primary-foreground/60">
              <span>Feature</span>
              <span className="text-center text-accent">Florida</span>
              <span className="text-center">Delaware</span>
            </div>
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 px-6 py-4 text-sm ${
                  i !== COMPARISON_ROWS.length - 1 ? "border-b border-primary-foreground/10" : ""
                }`}
              >
                <span className="text-primary-foreground/85">{row.feature}</span>
                <span className="no-liga text-center font-display text-base text-accent">{row.fl}</span>
                <span className="no-liga text-center text-primary-foreground/70">{row.de}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-primary-foreground/60">
            Delaware citations are to 6 Del. C. ch. 18. Comparisons are limited to what the two statutes
            say on their face and are not legal advice.
          </p>
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
