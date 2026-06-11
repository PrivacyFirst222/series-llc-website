import { Building2, Anchor, Waves, Palmtree, Briefcase, Home as HomeIcon } from "lucide-react";

const SERIES: { icon: typeof Anchor; label: string; sub: string }[] = [
  { icon: HomeIcon, label: "Series A", sub: "Miami duplex" },
  { icon: Building2, label: "Series B", sub: "Tampa office" },
  { icon: Briefcase, label: "Series C", sub: "Investment fund" },
  { icon: Palmtree, label: "Series D", sub: "Vacation rental" },
  { icon: Waves, label: "Series E", sub: "Marina lease" },
  { icon: Anchor, label: "Series F", sub: "Boat charter" },
];

export function MothershipDiagram() {
  return (
    <section className="relative overflow-hidden bg-secondary/40">
      <div className="container-wide py-20 lg:py-28">
        <div className="grid lg:grid-cols-12 gap-14 items-center">
          <div className="lg:col-span-5 space-y-6">
            <span className="eyebrow">The architecture</span>
            <h2 className="display text-4xl text-balance lg:text-5xl">
              One umbrella. <em>Six walls</em> between every asset.
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground">
              Every protected series is its own legal compartment. A judgment, debt, or lawsuit against
              one series cannot reach the assets of another — or the parent company. That's the
              <em className="text-foreground font-display"> horizontal shield</em>. The
              <em className="text-foreground font-display"> vertical shield</em> insulates the parent from
              series obligations, and vice versa.
            </p>
            <ul className="space-y-3 pt-2 text-sm">
              {[
                "Distinct membership interests, managers, and economic rights per series",
                "Separate books, records, and asset ledger per series",
                "Recordable Certificate of Designation per series for real property",
                "All under one Federal EIN structure & one Florida filing",
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                  <span className="text-foreground/85">{line}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Diagram */}
          <div className="lg:col-span-7">
            <div className="relative rounded-3xl border border-border bg-card p-6 lg:p-10 shadow-sm">
              <div className="absolute inset-x-10 top-6 flex items-center justify-between">
                <span className="font-mono-feature text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  fl-protected-series-llc.diagram
                </span>
                <span className="font-mono-feature text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
                  §605.2101
                </span>
              </div>

              <div className="pt-10 pb-2 flex justify-center">
                <div className="relative inline-flex flex-col items-center gap-2 rounded-2xl border border-primary/20 bg-primary text-primary-foreground px-8 py-5">
                  <span className="text-[0.65rem] uppercase tracking-[0.2em] text-primary-foreground/70">
                    Mothership LLC
                  </span>
                  <span className="font-display text-xl">Sunshine Holdings, LLC</span>
                  <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-3 w-px bg-primary/40" />
                </div>
              </div>

              {/* Connector line */}
              <div className="mx-auto mt-1 h-6 w-[80%] border-t border-dashed border-primary/30" />

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:gap-4 pt-6">
                {SERIES.map((s) => {
                  const Icon = s.icon;
                  return (
                    <div
                      key={s.label}
                      className="group rounded-xl border border-border bg-background p-4 transition-all hover:border-accent hover:shadow-md"
                    >
                      <div className="flex items-center gap-2 text-trust">
                        <Icon className="h-4 w-4" />
                        <span className="font-display text-sm font-semibold text-foreground">
                          {s.label}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{s.sub}</div>
                      <div className="mt-3 flex items-center gap-1">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <span
                            key={i}
                            className="h-1 flex-1 rounded-full bg-trust/20 group-hover:bg-trust/60 transition-colors"
                          />
                        ))}
                      </div>
                      <div className="mt-1.5 text-[0.65rem] uppercase tracking-[0.14em] text-trust">
                        Liability shield · Active
                      </div>
                    </div>
                  );
                })}
              </div>

              <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                Each box is its own legal entity for liability purposes — but a single tax filing,
                operating agreement, and bank-banking relationship from your perspective.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
