import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";
import { Landmark, ScrollText, Anchor, Scale, FileCheck, Building2 } from "lucide-react";


export default function FloridaAdvantages() {
  return (
    <>
      <PageHero
        eyebrow="The statute"
        title={
          <>
            Florida's statute, <em>section by section</em>.
          </>
        }
        description="Two sections do most of the day-to-day work: how a protected series holds property, and how a court reads a series when the chapter applies. Here is what each one says."
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

      {/* Florida-formed */}
      <section className="bg-primary text-primary-foreground">
        <div className="container-wide section-y">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1 text-xs uppercase tracking-[0.18em]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Formed in Florida
            </span>
            <h2 className="display mt-4 text-4xl text-balance lg:text-5xl">
              A Florida entity, under <em>Florida's</em> own statute.
            </h2>
            <p className="mt-5 text-base leading-relaxed text-primary-foreground/75">
              If you live and do business in Florida, you can form your protected series LLC here.
              There is no need to form the entity in another state and then register it back into
              Florida as a foreign LLC to hold Florida property or do business here — one filing with
              the Division of Corporations, one annual report, and one registered agent, all governed
              by Chapter 605.
            </p>
          </div>
        </div>
      </section>

      <CallToAction
        eyebrow="Formed in Florida"
        title="File under the Florida statute."
        body="The law is in effect and filings are open — reserve your name and start your statutory clock as soon as the Division accepts your Articles."
      />
    </>
  );
}
