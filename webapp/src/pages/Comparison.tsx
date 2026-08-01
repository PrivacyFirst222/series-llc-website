import { Check, X, Minus } from "lucide-react";
import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";

type Cell = "yes" | "no" | "partial" | string;

interface Row {
  feature: string;
  fl: Cell;
  multi: Cell;
}

const ROWS: Row[] = [
  { feature: "One state filing covers unlimited series", fl: "yes", multi: "no" },
  { feature: "Liability separation between assets", fl: "yes", multi: "yes" },
  { feature: "Each asset in a person distinct from the others", fl: "yes", multi: "yes" },
  { feature: "Property titled in the holding entity's own name", fl: "yes", multi: "yes" },
  { feature: "Annual reports to file", fl: "1 report", multi: "10 reports" },
  { feature: "Registered agent relationships", fl: "1", multi: "10" },
  { feature: "Adding another asset", fl: "Certificate of Designation", multi: "A whole new LLC" },
  { feature: "Federal EIN", fl: "1 EIN structure", multi: "10 EINs" },
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
  if (v === "partial")
    return (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Minus className="h-4 w-4" />
        Partial
      </span>
    );
  if (v === "—")
    return <span className="text-muted-foreground">—</span>;
  return <span className={accent ? "text-accent font-medium" : "text-foreground/85"}>{v}</span>;
}

export default function Comparison() {
  return (
    <>
      <PageHero
        eyebrow="Side by side"
        title={
          <>
            One Protected Series LLC <em>vs.</em> ten separate LLCs.
          </>
        }
        description="Both structures separate your assets. The difference is how much filing, paperwork, and annual upkeep you carry to get there."
      />

      <section className="container-wide section-pb">
        <div className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="grid grid-cols-12 border-b border-border bg-secondary/60 px-6 py-5 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <span className="col-span-6">Feature</span>
            <span className="col-span-3 text-center text-accent">Protected Series LLC</span>
            <span className="col-span-3 text-center">10 separate FL LLCs</span>
          </div>
          {ROWS.map((row, i) => (
            <div
              key={row.feature}
              className={`grid grid-cols-12 px-6 py-5 text-sm ${
                i !== ROWS.length - 1 ? "border-b border-border" : ""
              } ${i % 2 === 1 ? "bg-secondary/20" : ""}`}
            >
              <span className="col-span-6 font-medium">{row.feature}</span>
              <span className="col-span-3 flex justify-center items-center">
                {renderCell(row.fl, true)}
              </span>
              <span className="col-span-3 flex justify-center items-center">
                {renderCell(row.multi)}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-accent/30 bg-card p-7">
            <div className="font-mono-feature text-xs uppercase tracking-[0.18em] text-accent">
              Verdict
            </div>
            <h3 className="mt-2 font-display text-xl">Protected Series LLC</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Built for a Florida owner with two or more assets: one filing, one annual report, one
              registered agent, and a new series whenever you add something.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-7">
            <div className="font-mono-feature text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Formed in Florida
            </div>
            <h3 className="mt-2 font-display text-xl">No out-of-state detour</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              If you live and do business in Florida, you can form here under Florida's own statute —
              no forming somewhere else and then registering that entity back into Florida as a foreign
              LLC.
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
