import { Check, Minus } from "lucide-react";

const ROWS: { label: string; us: string; them: string; themHasNone: boolean }[] = [
  {
    label: "Dedicated to Florida Protected Series LLCs",
    us: "Our only business",
    them: "One product among dozens",
    themHasNone: false,
  },
  {
    label: "Operating agreement written for Ch. 605's protected series rules",
    us: "With a Series Exhibit for every series",
    them: "Generic LLC agreement, if any",
    themHasNone: false,
  },
  {
    label: "Series LLC Owner's Manual",
    us: "Included",
    them: "None offered, anywhere",
    themHasNone: true,
  },
  {
    label: "Recordkeeping app built around §605.2301",
    us: "Free with formation",
    them: "None offered, anywhere",
    themHasNone: true,
  },
  {
    label: "Registered agent + legal-mail client portal",
    us: "First year included",
    them: "Extra, or standalone",
    themHasNone: false,
  },
];

const FOOTNOTE =
  "Comparison based on our review of leading national formation services' published offerings (August 2026).";

export function WhyOnlyUs() {
  return (
    <section className="relative bg-background">
      <div className="container-wide section-y">
        <div className="max-w-3xl space-y-5">
          <span className="eyebrow">Why we're different</span>
          <h2 className="display text-4xl text-balance lg:text-5xl">
            Formation is the <em>easy</em> part. Everything else is why we exist.
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground">
            Any filing service can send Articles to Tallahassee. But Florida's Protected Series Act
            only protects you if your operating agreement is properly drafted and every series'
            assets are documented to the statute's standard — and that's where the industry goes
            silent. National formation services either don't form series LLCs at all or hand you a
            standard LLC operating agreement and wish you luck.
          </p>
          <p className="text-base font-medium text-foreground">We built the whole system:</p>
        </div>

        <div className="mt-8 overflow-x-auto">
          <div className="min-w-[640px] overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-secondary/60 text-left">
                  <th className="px-5 py-4 font-display text-sm font-semibold" />
                  <th className="px-5 py-4 font-display text-sm font-semibold text-foreground">
                    MyFloridaSeriesLLC
                  </th>
                  <th className="px-5 py-4 font-display text-sm font-semibold text-muted-foreground">
                    Typical formation sites
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-card">
                {ROWS.map((r) => (
                  <tr key={r.label}>
                    <td className="px-5 py-4 font-medium text-foreground/90">{r.label}</td>
                    <td className="px-5 py-4">
                      <span className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-trust" />
                        <span className="text-foreground/85">{r.us}</span>
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="flex items-start gap-2">
                        <Minus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                        <span
                          className={
                            r.themHasNone
                              ? "font-medium text-foreground/75"
                              : "text-muted-foreground"
                          }
                        >
                          {r.them}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">{FOOTNOTE}</p>
      </div>
    </section>
  );
}

/** Condensed version for the Pricing page — the four differentiators as a strip. */
export function WhyOnlyUsCompact() {
  const items = [
    { t: "Series operating agreement", d: "Drafted for Ch. 605, with a Series Exhibit per series" },
    { t: "Series LLC Owner's Manual", d: "No other formation service offers one" },
    { t: "Recordkeeping app", d: "Built around §605.2301 — free with formation" },
    { t: "Only-business focus", d: "Florida Protected Series LLCs are all we do" },
  ];
  return (
    <div className="mt-10 lg:mt-12">
      <h3 className="font-display text-2xl">What's behind the fee</h3>
      <p className="text-sm text-muted-foreground">
        The only formation service anywhere that includes all four.
      </p>
      <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.t} className="bg-card p-5">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-trust" />
              <div className="text-sm font-medium">{it.t}</div>
            </div>
            <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{it.d}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{FOOTNOTE}</p>
    </div>
  );
}
