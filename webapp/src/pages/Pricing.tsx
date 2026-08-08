import { Link } from "react-router-dom";
import { Check, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/sections/PageHero";
import { WhyOnlyUsCompact } from "@/components/home/WhyOnlyUs";

const SHARED_FEATURES: string[] = [
  "Form Operating Agreement for you to review and adapt",
  "Property titling manual — how to properly title assets in the LLC or series",
  "Ledger forms for each series",
  "Complete Series LLC maintenance guide",
  "Up to 3 Protected Series Designations, including their state filing fees",
  "Florida registered agent service — first year included ($99/yr after)",
  "Free iOS app (available end of year) — track LLC records, income & expenses, asset acquisitions and sales",
];

const PACKAGES: {
  key: string;
  eyebrow: string;
  heading: string;
  blurb: string;
  stateFees: string[];
  features: string[];
}[] = [
  {
    key: "new",
    eyebrow: "New formation",
    heading: "Form a new Protected Series LLC",
    blurb: "You do not have an LLC yet. We file the Articles of Organization and your Protected Series Designations together.",
    stateFees: ["+ $125 Florida state filing fee (at cost)"],
    features: ["Articles of Organization filed with FL Div. of Corps", ...SHARED_FEATURES],
  },
  {
    key: "convert",
    eyebrow: "Existing LLC",
    heading: "Convert your existing Florida LLC",
    blurb: "You already have a Florida LLC. There is no $125 Articles fee, because the company is already on file with the state.",
    stateFees: ["No $125 Articles filing fee — your LLC already exists"],
    features: [
      "Protected Series Designations filed for your existing LLC",
      ...SHARED_FEATURES,
    ],
  },
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
        description="The same $499 service fee whether you are forming a new Protected Series LLC or converting the Florida LLC you already have. Need more series, or a Federal EIN? Add them at a straightforward rate."
      />

      <section className="container-wide section-pb">
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          {PACKAGES.map((pkg, i) => (
            <article
              key={pkg.key}
              className={`relative flex flex-col rounded-3xl bg-card p-8 lg:p-10 ${
                i === 0
                  ? "border border-accent ring-1 ring-accent shadow-[0_30px_80px_-30px_rgba(13,46,85,0.25)]"
                  : "border border-border"
              }`}
            >
              <span
                className={`font-mono-feature text-xs uppercase tracking-[0.18em] ${
                  i === 0 ? "text-accent" : "text-trust"
                }`}
              >
                {pkg.eyebrow}
              </span>
              <h2 className="mt-2 font-display text-xl">{pkg.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pkg.blurb}</p>

              <div className="mt-6 space-y-1">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-5xl">$499</span>
                  <span className="text-sm text-muted-foreground">one-time service fee</span>
                </div>
                {pkg.stateFees.map((f) => (
                  <div key={f} className="text-sm text-muted-foreground">
                    {f}
                  </div>
                ))}
                <div className="mt-2 text-xs text-muted-foreground">
                  Covers up to 3 Protected Series Designations, including their state filing fees.
                  Additional Protected Series Designations cost $50 each — $25 to prepare plus the
                  $25 state filing fee.
                </div>
              </div>

              <ul className="mt-8 space-y-3 text-sm">
                {pkg.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-trust" />
                    <span className="text-foreground/85">{f}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-6 border-t border-border">
                <Button
                  asChild
                  size="lg"
                  className={`w-full rounded-full ${
                    i === 0
                      ? "bg-accent text-accent-foreground hover:bg-accent/90"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  <Link to="/form-llc">
                    Get started
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>

        {/* À-la-carte */}
        <div className="mt-10 lg:mt-12">
          <h3 className="font-display text-2xl">Add-ons &amp; à-la-carte</h3>
          <p className="text-sm text-muted-foreground">Choose only what you need.</p>
          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
            {[
              {
                t: "Extra Protected Series Designation",
                p: "$50 / series",
                n: "$25 to prepare plus the $25 state filing fee.",
              },
              { t: "EIN obtained for the LLC or any series", p: "$50 / EIN" },
              {
                t: "S corporation election package",
                p: "$95",
                n: "We prepare IRS Form 2553 complete, with a cover letter and filing instructions — you sign and file it. Available for new LLCs we form, ordered within 65 days of formation. The IRS deadline for a first-year election is 2 months and 15 days from formation.",
              },
              { t: "Florida registered agent service (after year one)", p: "$99 / yr" },
              { t: "Certificate of Status (state fee, at cost)", p: "$5" },
              { t: "Certified copy of the Articles (state fee, at cost)", p: "$30" },
            ].map((a) => (
              <div key={a.t} className="bg-card p-5">
                <div className="text-sm font-medium">{a.t}</div>
                <div className="mt-1 font-display text-lg text-trust">{a.p}</div>
                {a.n ? <div className="mt-1.5 text-xs text-muted-foreground">{a.n}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <WhyOnlyUsCompact />
      </section>
    </>
  );
}
