import { Check, X, Minus } from "lucide-react";
import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";

type Cell = "yes" | "no" | "partial" | string;

interface Row {
  feature: string;
  fl: Cell;
  de: Cell;
  multi: Cell;
}

const ROWS: Row[] = [
  { feature: "One filing covers unlimited entities", fl: "yes", de: "yes", multi: "no" },
  { feature: "Horizontal liability shield (series ↔ series)", fl: "yes", de: "yes", multi: "yes" },
  { feature: "Vertical shield (parent ↔ series)", fl: "yes", de: "yes", multi: "—" },
  { feature: "Real property recordable in series's name", fl: "yes", de: "no", multi: "yes" },
  { feature: "Charging order exclusivity inherited statewide", fl: "yes", de: "partial", multi: "yes" },
  { feature: "Annual reports", fl: "1 report", de: "1 report", multi: "10+ reports" },
  { feature: "Federal EIN", fl: "1 EIN structure", de: "1 EIN structure", multi: "10 EINs" },
  { feature: "Recognized by Florida courts natively", fl: "yes", de: "partial", multi: "yes" },
  { feature: "Setup time", fl: "5–7 days", de: "10–14 days", multi: "60+ days for 10 LLCs" },
  { feature: "Formation cost", fl: "$499 + $125 + state fees", de: "$1,499 + $400", multi: "$2,500+ in fees alone" },
  { feature: "Annual cost (10-asset portfolio)", fl: "$138.75", de: "$300 + $400", multi: "$1,200+/yr" },
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
            Florida Protected Series LLC <em>vs.</em> the alternatives.
          </>
        }
        description="A clear-eyed comparison against the two most common structures: a Delaware Series LLC and a stack of multiple Florida regular LLCs."
      />

      <section className="container-wide pb-20 lg:pb-28">
        <div className="overflow-hidden rounded-3xl border border-border bg-card">
          <div className="grid grid-cols-12 border-b border-border bg-secondary/60 px-6 py-5 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <span className="col-span-5">Feature</span>
            <span className="col-span-3 text-center text-accent">Florida Protected Series</span>
            <span className="col-span-2 text-center">Delaware Series</span>
            <span className="col-span-2 text-center">Multiple FL LLCs</span>
          </div>
          {ROWS.map((row, i) => (
            <div
              key={row.feature}
              className={`grid grid-cols-12 px-6 py-5 text-sm ${
                i !== ROWS.length - 1 ? "border-b border-border" : ""
              } ${i % 2 === 1 ? "bg-secondary/20" : ""}`}
            >
              <span className="col-span-5 font-medium">{row.feature}</span>
              <span className="col-span-3 flex justify-center items-center">
                {renderCell(row.fl, true)}
              </span>
              <span className="col-span-2 flex justify-center items-center">
                {renderCell(row.de)}
              </span>
              <span className="col-span-2 flex justify-center items-center">
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
            <h3 className="mt-2 font-display text-xl">Florida Protected Series LLC</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              The clear winner for any Florida-domiciled investor or operator with two or more assets.
              Strongest legal protection, lowest ongoing cost, simplest administration.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-7">
            <div className="font-mono-feature text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Use Delaware if…
            </div>
            <h3 className="mt-2 font-display text-xl">You operate exclusively outside FL</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              You don't hold Florida real estate and you specifically need Delaware Court of Chancery
              jurisdiction. Otherwise the Florida statute is now strictly better.
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
