import { Link } from "react-router-dom";
import { ArrowUpRight, ShieldCheck, BookOpen, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HomeHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Sun + sky wash */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(180deg, hsl(38 60% 92%) 0%, hsl(38 35% 96%) 60%, hsl(38 35% 96%) 100%)",
        }}
      />
      <div
        aria-hidden
        className="absolute -top-40 left-1/2 -z-10 h-[640px] w-[640px] -translate-x-1/2 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(closest-side, hsl(18 88% 70% / 0.45), hsl(18 88% 56% / 0.18) 50%, transparent 70%)",
        }}
      />
      <svg
        aria-hidden
        viewBox="0 0 1440 200"
        className="absolute bottom-0 left-0 -z-10 w-full text-primary/5"
        preserveAspectRatio="none"
      >
        <path
          fill="currentColor"
          d="M0,128 C240,180 480,180 720,140 C960,100 1200,100 1440,140 L1440,200 L0,200 Z"
        />
      </svg>

      <div className="container-wide pt-16 pb-24 lg:pt-24 lg:pb-32">
        <div className="grid lg:grid-cols-12 gap-12 items-end">
          <div className="lg:col-span-8 space-y-8 anim-rise">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span className="text-xs font-medium tracking-wide text-foreground/80">
                Florida's first dedicated Protected Series LLC formation service
              </span>
            </div>

            <h1 className="display text-[2.6rem] text-balance leading-[1.02] sm:text-6xl lg:text-[5.2rem]">
              One mothership.{" "}
              <span className="block">
                <em>Unlimited</em> protected series.
              </span>
              <span className="block text-foreground/70 italic font-display font-light text-[0.7em] mt-3">
                Designed for the way Floridians actually invest.
              </span>
            </h1>

            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
              Florida's new <span className="text-foreground font-medium">Protected Series LLC Act</span>{" "}
              (Statute §605.2101, effective July 1, 2026) lets you segregate every property, fund, or venture
              under a single umbrella — with horizontal <em className="text-foreground font-display">and</em>{" "}
              vertical liability shields stronger than Delaware's. We file it all for you.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild size="lg" className="rounded-full bg-primary hover:bg-primary/90 px-7 h-12">
                <Link to="/pricing">
                  Form your Protected Series LLC
                  <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full bg-card/60 backdrop-blur h-12 px-6"
              >
                <Link to="/what-is">
                  <BookOpen className="mr-2 h-4 w-4" />
                  How it works
                </Link>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-trust" />
                Featured in the <em className="font-display not-italic text-foreground">Florida Bar Journal</em>
              </span>
              <span className="hidden sm:inline-flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
                FL Division of Corporations registered agent
              </span>
            </div>
          </div>

          {/* Editorial side card */}
          <div className="lg:col-span-4 anim-rise delay-200">
            <div className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-[0_30px_80px_-30px_rgba(13,46,85,0.25)]">
              <div className="aspect-[4/5] relative">
                <img
                  src="https://images.unsplash.com/photo-1605723517503-3cadb5818a0c?auto=format&fit=crop&w=1200&q=80"
                  alt="Florida coastal real estate at sunset"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/80 via-primary/20 to-transparent" />
                <div className="absolute inset-x-6 bottom-6 text-primary-foreground space-y-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/15 backdrop-blur px-2.5 py-1 text-[0.65rem] uppercase tracking-[0.16em]">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    Statute snapshot
                  </span>
                  <h3 className="font-display text-2xl leading-tight">
                    "A series LLC reduces costs and litigation exposure for multi-asset Floridians."
                  </h3>
                  <p className="text-xs text-primary-foreground/80">— Florida Bar Journal, March 2025</p>
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border">
                {[
                  { k: "Effective", v: "7/1/26" },
                  { k: "Fee / series", v: "$0 *" },
                  { k: "Setup time", v: "5 days" },
                ].map((s) => (
                  <div key={s.k} className="p-4 text-center">
                    <div className="font-display text-xl">{s.v}</div>
                    <div className="text-[0.65rem] uppercase tracking-[0.14em] text-muted-foreground mt-1">
                      {s.k}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-3 text-[0.7rem] text-muted-foreground">
              * No additional Florida filing fee per protected series under §605.2106.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
