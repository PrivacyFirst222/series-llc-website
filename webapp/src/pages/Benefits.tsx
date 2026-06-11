import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";
import { BenefitsGrid } from "@/components/home/BenefitsGrid";
import { Check, X, TrendingDown, Wallet, Calendar, FileText } from "lucide-react";

const SAVINGS = [
  { label: "FL filing fees (10 LLCs)", oldVal: "$1,250", newVal: "$125" },
  { label: "Annual report fees", oldVal: "$1,388.75/yr", newVal: "$138.75/yr" },
  { label: "Registered agent fees", oldVal: "$1,200/yr", newVal: "$150/yr" },
  { label: "Tax filings", oldVal: "10 returns", newVal: "1 return" },
  { label: "Bank accounts", oldVal: "10 accounts", newVal: "1 master + sub-accounts" },
];

export default function Benefits() {
  return (
    <>
      <PageHero
        eyebrow="The advantages"
        title={
          <>
            Why a Florida Protected Series LLC <em>beats</em> ten regular LLCs.
          </>
        }
        description="Same liability protection. A fraction of the paperwork, fees, and bookkeeping. Built for portfolios that grow."
      />

      <BenefitsGrid />

      {/* Cost comparison */}
      <section className="bg-secondary/40">
        <div className="container-wide py-20 lg:py-28">
          <div className="grid lg:grid-cols-12 gap-12">
            <div className="lg:col-span-5 space-y-5">
              <span className="eyebrow">The math</span>
              <h2 className="display text-4xl text-balance lg:text-5xl">
                A 10-property investor saves <em>~$2,400/yr</em>.
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                The real cost of running ten Florida LLCs isn't the formation fee — it's the recurring
                annual reports, registered agent renewals, separate tax returns, and ten bank
                relationships. Folding everything into a Protected Series LLC eliminates almost all of it.
              </p>
              <div className="flex items-center gap-4 pt-3">
                <div className="rounded-xl bg-trust/10 p-3 text-trust">
                  <TrendingDown className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-display text-3xl">~80%</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-[0.16em]">
                    annual admin cost reduction
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                <div className="grid grid-cols-3 border-b border-border bg-secondary/60 px-6 py-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <span>Item</span>
                  <span className="text-center">10 separate LLCs</span>
                  <span className="text-right">1 Protected Series LLC</span>
                </div>
                {SAVINGS.map((row, i) => (
                  <div
                    key={row.label}
                    className={`grid grid-cols-3 px-6 py-5 text-sm ${
                      i !== SAVINGS.length - 1 ? "border-b border-border" : ""
                    }`}
                  >
                    <span className="font-medium">{row.label}</span>
                    <span className="text-center font-mono-feature text-muted-foreground line-through">
                      {row.oldVal}
                    </span>
                    <span className="text-right font-mono-feature text-trust font-semibold">
                      {row.newVal}
                    </span>
                  </div>
                ))}
                <div className="grid grid-cols-3 bg-primary px-6 py-5 text-primary-foreground">
                  <span className="font-display text-lg">Year 1 savings</span>
                  <span className="text-center text-primary-foreground/60 line-through font-mono-feature">
                    —
                  </span>
                  <span className="text-right font-display text-2xl">≈ $3,600</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Estimates assume 10 property-owning LLCs in Florida, each with $138.75 annual report fee
                and a $120/yr commercial registered agent.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Side by side traits */}
      <section className="container-wide py-20 lg:py-28">
        <div className="text-center max-w-2xl mx-auto">
          <span className="eyebrow">Trait by trait</span>
          <h2 className="display mt-3 text-4xl text-balance lg:text-5xl">
            What you keep. What you stop doing.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl border border-trust/30 bg-trust/5 p-7 space-y-4">
            <div className="flex items-center gap-2 text-trust">
              <Check className="h-5 w-5" />
              <span className="font-display text-lg font-semibold">You keep</span>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                "Full statutory liability protection per series",
                "Separate creditor pools — judgments don't migrate",
                "Independent management, governance, and exit options",
                "Recordable real estate title in the series's name",
                "Charging order exclusivity from Chapter 605",
              ].map((s) => (
                <li key={s} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 text-trust shrink-0" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-border bg-card p-7 space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <X className="h-5 w-5" />
              <span className="font-display text-lg font-semibold">You stop</span>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                { i: Wallet, t: "Paying $125 every time you buy a new asset" },
                { i: Calendar, t: "Filing 10+ separate annual reports each May" },
                { i: FileText, t: "Maintaining 10 sets of articles & operating agreements" },
                { i: Wallet, t: "Renewing 10 registered agents every year" },
                { i: FileText, t: "Filing 10 separate federal tax returns" },
              ].map((s) => {
                const Icon = s.i;
                return (
                  <li key={s.t} className="flex gap-2">
                    <Icon className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground line-through">{s.t}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </section>

      <CallToAction />
    </>
  );
}
