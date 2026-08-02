import { Link } from "react-router-dom";
import { Check, ArrowUpRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/sections/PageHero";

const FEATURES: string[] = [
  "Articles of Organization filed with FL Div. of Corps",
  "Form Operating Agreement for you to review and adapt",
  "Property titling manual — how to properly title assets in the LLC or series",
  "Ledger forms for each series",
  "Complete Series LLC maintenance guide",
  "Includes preparation of up to 3 Protected Series Designations (to form up to 3 series)",
  "First-year Florida registered agent service — or serve as your own if you're a Florida resident",
  "Annual report filing reminders",
  "Email support",
  "Free iOS app — track LLC records, income & expenses, asset acquisitions and sales",
];

export default function Pricing() {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        align="center"
        title={
          <>
            Honest pricing. <em>One flat fee</em>. Three series included.
          </>
        }
        description="One flat service fee covers preparation and electronic filing, including up to three Protected Series Designations. Need more series, or a Federal EIN? Add them at a straightforward rate."
      />

      <section className="container-wide section-pb">
        <div className="mx-auto max-w-2xl">
          <article className="relative flex flex-col rounded-3xl border border-accent bg-card p-10 shadow-[0_30px_80px_-30px_rgba(13,46,85,0.25)] ring-1 ring-accent">
            <span className="font-mono-feature text-xs uppercase tracking-[0.18em] text-accent">
              Formation fee
            </span>

            <div className="mt-4 space-y-1">
              <div className="flex items-baseline gap-1">
                <span className="font-display text-6xl">$499</span>
                <span className="text-sm text-muted-foreground">one-time service fee</span>
              </div>
              <div className="text-sm text-muted-foreground">
                + $125 Florida state filing fee (at cost)
              </div>
              <div className="text-sm text-muted-foreground">
                + $25 state filing fee per Protected Series Designation
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Includes preparation of up to 3 Protected Series Designations to form up to 3 series. Additional Protected Series Designations cost $25 each (drafting) plus the $25 state filing fee.
              </div>
            </div>

            <ul className="mt-8 space-y-3 text-sm">
              {FEATURES.map((f) => (
                <li key={f} className="flex gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-trust" />
                  <span className="text-foreground/85">{f}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 pt-6 border-t border-border">
              <Button
                asChild
                size="lg"
                className="w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
              >
                <Link to="/form-llc">
                  Get started
                  <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Stripe checkout — secure &amp; encrypted
              </p>
            </div>
          </article>
        </div>

        {/* Trust bar */}
        <div className="mt-8 lg:mt-10 grid gap-3 md:grid-cols-2 rounded-2xl border border-border bg-secondary/30 p-6">
          {[
            "30-day no-questions money-back guarantee",
            "Stripe-secured checkout with split-pay options",
          ].map((t) => (
            <div key={t} className="flex items-center gap-2 text-sm text-foreground/80">
              <ShieldCheck className="h-4 w-4 text-trust" />
              {t}
            </div>
          ))}
        </div>

        {/* À-la-carte */}
        <div className="mt-10 lg:mt-12">
          <h3 className="font-display text-2xl">Add-ons &amp; à-la-carte</h3>
          <p className="text-sm text-muted-foreground">Choose only what you need.</p>
          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
            {[
              { t: "Extra Protected Series Designation (drafting)", p: "$25 / series + $25 state filing fee" },
              { t: "EIN obtained for the LLC or any series", p: "$50 / EIN" },
              { t: "Registered agent service after year one", p: "$99 / yr" },
            ].map((a) => (
              <div key={a.t} className="bg-card p-5">
                <div className="text-sm font-medium">{a.t}</div>
                <div className="mt-1 font-display text-lg text-trust">{a.p}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
