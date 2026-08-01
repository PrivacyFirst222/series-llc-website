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
  { feature: "One filing covers unlimited series", fl: "yes", de: "yes", multi: "no" },
  { feature: "Horizontal liability shield (series ↔ series)", fl: "yes", de: "yes", multi: "yes" },
  { feature: "Vertical shield (parent ↔ series)", fl: "yes", de: "yes", multi: "—" },
  { feature: "Series is a person distinct from the LLC", fl: "yes", de: "—", multi: "yes" },
  { feature: "Series can hold title to property in its own name", fl: "yes", de: "yes", multi: "yes" },
  {
    feature: "Shield applies without a notice provision in the certificate of formation",
    fl: "yes",
    de: "no",
    multi: "yes",
  },
  { feature: "Annual state charge", fl: "1 annual report", de: "$400 tax + $100 per registered series", multi: "10 annual reports" },
  { feature: "Federal EIN", fl: "1 EIN structure", de: "1 EIN structure", multi: "10 EINs" },
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

      <section className="container-wide section-pb">
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
