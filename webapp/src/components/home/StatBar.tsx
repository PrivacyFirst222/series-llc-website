const STATS: { k: string; v: string; sub: string }[] = [
  { v: "$125", k: "One filing fee", sub: "covers your mothership and all series" },
  { v: "∞", k: "Protected series", sub: "spin up as many as your portfolio needs" },
  { v: "2x", k: "Liability shields", sub: "horizontal + vertical, statute-backed" },
  { v: "1st", k: "Florida-native", sub: "purpose-built for §605.2101" },
];

export function StatBar() {
  return (
    <section className="border-y border-border bg-card">
      <div className="container-wide grid grid-cols-2 gap-x-6 gap-y-8 py-10 lg:grid-cols-4 lg:gap-12 lg:py-12">
        {STATS.map((s) => (
          <div key={s.k} className="space-y-1.5">
            <div className="font-display text-4xl tracking-tight lg:text-5xl">{s.v}</div>
            <div className="text-sm font-medium text-foreground">{s.k}</div>
            <div className="text-xs text-muted-foreground leading-relaxed">{s.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
