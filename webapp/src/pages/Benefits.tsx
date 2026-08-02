import { Link } from "react-router-dom";
import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";
import { BenefitsGrid } from "@/components/home/BenefitsGrid";
import { Check, X, TrendingDown } from "lucide-react";

type Cell = "yes" | "no" | string;

const STRUCTURE: { feature: string; series: Cell; many: Cell }[] = [
  { feature: "One state filing covers unlimited series", series: "yes", many: "no" },
  { feature: "Liability separation between assets", series: "yes", many: "yes" },
  { feature: "Property titled in the holding entity's own name", series: "yes", many: "yes" },
  { feature: "Annual reports to file", series: "1 report", many: "10 reports" },
  { feature: "Registered agent relationships", series: "1", many: "10" },
  { feature: "Federal EIN", series: "1 EIN structure", many: "10 EINs" },
  { feature: "Adding another series", series: "Protected Series Designation", many: "A whole new LLC" },
];

function renderCell(v: Cell, accent?: boolean) {
  if (v === "yes")
    return (
      <span className={`inline-flex items-center gap-1.5 ${accent ? "text-accent" : "text-trust"}`}>
        <Check className="h-4 w-4" />
        Yes
      </span>
    );
  if (v === "no")
    return (
      <span className="inline-flex items-center gap-1.5 text-destructive">
        <X className="h-4 w-4" />
        No
      </span>
    );
  if (v === "—") return <span className="text-muted-foreground">—</span>;
  return <span className={accent ? "text-accent font-medium" : "text-foreground/85"}>{v}</span>;
}

const ONE_TIME: { label: string; oldVal: string; newVal: string; costlier?: boolean }[] = [
  { label: "State filing fee to form", oldVal: "$1,250", newVal: "$125" },
  {
    label: "Protected Series Designations (10 series)",
    oldVal: "—",
    newVal: "$250",
    costlier: true,
  },
];

const RECURRING: { label: string; note?: string; oldVal: string; newVal: string }[] = [
  { label: "Registered agent fees", oldVal: "$990/yr", newVal: "$99/yr" },
  {
    label: "Annual report fees",
    note: "First one is due the year after you form",
    oldVal: "$1,387.50/yr",
    newVal: "$138.75/yr",
  },
  { label: "Tax filings", oldVal: "10 returns", newVal: "1 return" },
];

export default function Benefits() {
  return (
    <>
      <PageHero
        eyebrow="The advantages"
        title={
          <>
            Why a Florida Protected Series LLC <em>beats</em> ten regular LLCs.
          </>
        }
        description="Same liability protection. A fraction of the paperwork, fees, and bookkeeping. Built for portfolios that grow."
      />

      <BenefitsGrid />

      {/* Cost comparison */}
      <section className="bg-secondary/40">
        <div className="container-wide section-y">
          <div className="grid lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5 space-y-5">
              <span className="eyebrow">The math</span>
              <h2 className="display text-4xl text-balance lg:text-5xl">
                A 10-property investor saves <em>~$2,140</em> every year.
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                The real cost of running ten Florida LLCs isn't the one-time filing fee — it's the
                recurring annual reports, registered agent renewals, and separate tax returns. Folding
                everything into a Protected Series LLC eliminates almost all of it. One-time filing fees
                are listed separately below, and your first annual report is not due until the year after
                you form — so year one and every year after it are shown as two different numbers.
              </p>
              <div className="flex items-center gap-4 pt-3">
                <div className="rounded-xl bg-trust/10 p-3 text-trust">
                  <TrendingDown className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-display text-3xl">~90%</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                    recurring admin cost reduction
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 border-b border-border bg-secondary/60 px-4 sm:px-6 py-3 text-[0.65rem] sm:text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Item</span>
                  <span className="text-center">10 separate LLCs</span>
                  <span className="text-right">1 Protected Series LLC</span>
                </div>
                <div className="border-b border-border bg-secondary/30 px-4 sm:px-6 py-2 text-[0.65rem] sm:text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Paid once, at formation
                </div>
                {ONE_TIME.map((row) => (
                  <div key={row.label} className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 border-b border-border px-4 sm:px-6 py-4 sm:py-5 text-xs sm:text-sm">
                    <span className="font-medium">{row.label}</span>
                    <span
                      className={`text-center font-mono-feature text-muted-foreground ${
                        row.oldVal === "—" ? "" : "line-through"
                      }`}
                    >
                      {row.oldVal}
                    </span>
                    <span
                      className={`text-right font-mono-feature font-semibold ${
                        row.costlier ? "text-foreground/70" : "text-trust"
                      }`}
                    >
                      {row.newVal}
                    </span>
                  </div>
                ))}

                <div className="border-b border-border bg-secondary/30 px-4 sm:px-6 py-2 text-[0.65rem] sm:text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">
                  Paid every year
                </div>
                {RECURRING.map((row) => (
                  <div key={row.label} className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 border-b border-border px-4 sm:px-6 py-4 sm:py-5 text-xs sm:text-sm">
                    <span className="font-medium">
                      {row.label}
                      {row.note ? (
                        <span className="mt-1 block text-[0.68rem] font-normal leading-snug text-muted-foreground">
                          {row.note}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-center font-mono-feature text-muted-foreground line-through">
                      {row.oldVal}
                    </span>
                    <span className="text-right font-mono-feature text-trust font-semibold">
                      {row.newVal}
                    </span>
                  </div>
                ))}

                <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 border-b border-primary/20 bg-primary/90 px-4 sm:px-6 py-4 sm:py-5 text-primary-foreground">
                  <span className="font-display text-base sm:text-lg">
                    First-year savings
                    <span className="mt-1 block font-sans text-[0.68rem] font-normal leading-snug text-primary-foreground/70">
                      No annual report in your formation year
                    </span>
                  </span>
                  <span className="text-center text-primary-foreground/60 font-mono-feature">—</span>
                  <span className="text-right font-display text-lg sm:text-2xl whitespace-nowrap">≈ $1,765</span>
                </div>
                <div className="grid grid-cols-[1.2fr_1fr_1fr] gap-2 bg-primary px-4 sm:px-6 py-4 sm:py-5 text-primary-foreground">
                  <span className="font-display text-base sm:text-lg">Every year after</span>
                  <span className="text-center text-primary-foreground/60 font-mono-feature">—</span>
                  <span className="text-right font-display text-lg sm:text-2xl whitespace-nowrap">≈ $2,140</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Estimates assume ten property-owning Florida LLCs, each paying the $125 state filing fee,
                the $138.75 annual report fee, and $99/yr for a registered agent — against one Protected
                Series LLC holding ten protected series, at $125 to file the Articles, $25 in state
                filing fees per Protected Series Designation, one $138.75 annual report, and one $99/yr
                registered agent. Registered agent pricing is held at $99/yr on both sides, so the
                comparison turns on the number of entities rather than on what any agent charges. Florida does not require an annual report in the year an
                entity is formed, so the first-year figure covers filing fees and registered agent only.
                State fees only; our service fee is on the{" "}
                <Link
                  to="/pricing"
                  className="text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:text-accent"
                >
                  pricing page
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Structural comparison, merged from the old /comparison page */}
      <section className="container-wide section-y">
        <div className="max-w-2xl">
          <span className="eyebrow">Side by side</span>
          <h2 className="display mt-3 text-4xl text-balance lg:text-5xl">
            One Protected Series LLC <em>vs.</em> ten separate LLCs.
          </h2>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Both structures separate your assets. The difference is how much filing, paperwork, and
            annual upkeep you carry to get there.
          </p>
        </div>

        <div className="mt-8 lg:mt-10 overflow-hidden rounded-3xl border border-border bg-card">
          <div className="grid grid-cols-12 border-b border-border bg-secondary/60 px-6 py-5 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <span className="col-span-6">Feature</span>
            <span className="col-span-3 text-center text-accent">Protected Series LLC</span>
            <span className="col-span-3 text-center">10 separate FL LLCs</span>
          </div>
          {STRUCTURE.map((row, i) => (
            <div
              key={row.feature}
              className={`grid grid-cols-12 px-6 py-5 text-sm ${
                i !== STRUCTURE.length - 1 ? "border-b border-border" : ""
              } ${i % 2 === 1 ? "bg-secondary/20" : ""}`}
            >
              <span className="col-span-6 font-medium">{row.feature}</span>
              <span className="col-span-3 flex justify-center items-center text-center">
                {renderCell(row.series, true)}
              </span>
              <span className="col-span-3 flex justify-center items-center text-center">
                {renderCell(row.many)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-8 lg:mt-10 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-7">
            <div className="font-mono-feature text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Formed in Florida
            </div>
            <h3 className="mt-2 font-display text-xl">No out-of-state detour</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              If you live and do business in Florida, you can form here under Florida's own statute —
              no forming somewhere else and then registering that entity back into Florida as a
              foreign LLC.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-7">
            <div className="font-mono-feature text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Use multiple LLCs if…
            </div>
            <h3 className="mt-2 font-display text-xl">You only ever own 1 asset</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              For one property, the cost difference is negligible. The Series LLC's value scales with
              every additional asset you add.
            </p>
          </div>
        </div>
      </section>

      <CallToAction />
    </>
  );
}
