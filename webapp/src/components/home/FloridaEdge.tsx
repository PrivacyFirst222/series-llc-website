import { Link } from "react-router-dom";
import { ArrowRight, ScrollText, Landmark } from "lucide-react";

export function FloridaEdge() {
  return (
    <section className="relative overflow-hidden bg-primary text-primary-foreground">
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "radial-gradient(currentColor 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-1/2 h-[700px] w-[700px] -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, hsl(18 88% 56% / 0.28), transparent 70%)" }}
      />

      <div className="container-wide relative py-20 lg:py-28">
        <div className="grid gap-14 lg:grid-cols-12">
          <div className="lg:col-span-5 space-y-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1 text-xs uppercase tracking-[0.18em]">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Why Florida wins
            </span>
            <h2 className="display text-4xl text-balance lg:text-5xl">
              The Sunshine State just <em>leapfrogged</em> Delaware.
            </h2>
            <p className="text-base leading-relaxed text-primary-foreground/80">
              Most series LLC statutes are minimum-viable. Florida wrote a deeper one — with two
              provisions that make a real, day-to-day difference for property and fund operators.
            </p>
            <Link
              to="/florida-advantages"
              className="inline-flex items-center gap-2 text-accent hover:text-primary-foreground transition-colors font-medium"
            >
              Read the full breakdown
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="lg:col-span-7 grid gap-6 sm:grid-cols-2">
            <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/5 p-7 backdrop-blur">
              <div className="flex items-center gap-2 text-accent">
                <Landmark className="h-4 w-4" />
                <span className="font-mono-feature text-[0.7rem] uppercase tracking-[0.18em]">
                  §605.2301
                </span>
              </div>
              <h3 className="mt-3 font-display text-2xl">Real Property Recording Rules</h3>
              <p className="mt-3 text-sm leading-relaxed text-primary-foreground/80">
                Title to Florida real estate can be held{" "}
                <em className="font-display text-primary-foreground">in the name of the series itself</em>.
                County clerks recognize the series, deeds record cleanly, and there's no risk of veil-piercing
                via title-chain confusion. Out-of-state series can't do this in Florida.
              </p>
            </div>

            <div className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/5 p-7 backdrop-blur">
              <div className="flex items-center gap-2 text-accent">
                <ScrollText className="h-4 w-4" />
                <span className="font-mono-feature text-[0.7rem] uppercase tracking-[0.18em]">
                  §605.2108
                </span>
              </div>
              <h3 className="mt-3 font-display text-2xl">Broader Extrapolation Rule</h3>
              <p className="mt-3 text-sm leading-relaxed text-primary-foreground/80">
                Anything that applies to a Florida regular LLC under Chapter 605 — charging order
                exclusivity, member liability protections, judicial dissolution standards — applies{" "}
                <em className="font-display text-primary-foreground">automatically</em> to every series.
                Decades of caselaw, instantly inherited.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
