import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ShieldCheck } from "lucide-react";

interface CallToActionProps {
  eyebrow?: string;
  title?: string;
  body?: string;
}

export function CallToAction({
  eyebrow = "Ready when you are",
  title = "Form your Florida Protected Series LLC.",
  body = "Reserve your mothership and as many protected series as your portfolio needs. Filings open January 2026; effective when the statute goes live July 1, 2026.",
}: CallToActionProps) {
  return (
    <section className="relative overflow-hidden">
      <div className="container-wide py-20 lg:py-28">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-primary text-primary-foreground">
          {/* Decorative wave */}
          <svg
            aria-hidden
            className="absolute -right-10 -top-10 h-72 w-72 text-primary-foreground/[0.06]"
            viewBox="0 0 200 200"
            fill="currentColor"
          >
            <path d="M0 100 Q 50 60 100 100 T 200 100 V200 H0 Z" />
            <path d="M0 130 Q 50 90 100 130 T 200 130 V200 H0 Z" opacity="0.7" />
          </svg>
          <div
            aria-hidden
            className="absolute inset-x-0 -bottom-32 mx-auto h-64 w-[140%] rounded-full"
            style={{ background: "radial-gradient(closest-side, hsl(18 88% 56% / 0.35), transparent)" }}
          />

          <div className="relative grid gap-10 p-10 lg:grid-cols-12 lg:p-16">
            <div className="lg:col-span-7 space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em]">
                <ShieldCheck className="h-3.5 w-3.5 text-accent" />
                {eyebrow}
              </span>
              <h2 className="display text-4xl text-balance lg:text-6xl">
                {title.split(".")[0]}
                <em>.</em>
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-primary-foreground/75">{body}</p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20"
                >
                  <Link to="/pricing">
                    See pricing
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col justify-center gap-3">
              {[
                { k: "Filings begin", v: "Jan 2026" },
                { k: "Statute effective", v: "Jul 1, 2026" },
                { k: "Avg. formation time", v: "5–7 days" },
                { k: "Series under one umbrella", v: "Unlimited" },
              ].map((row) => (
                <div
                  key={row.k}
                  className="flex items-baseline justify-between border-b border-primary-foreground/15 pb-3"
                >
                  <span className="text-xs uppercase tracking-[0.16em] text-primary-foreground/60">
                    {row.k}
                  </span>
                  <span className="font-display text-xl font-medium">{row.v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
