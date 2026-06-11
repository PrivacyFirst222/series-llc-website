import { Link } from "react-router-dom";
import { ShieldCheck, ShieldAlert, ArrowUpRight, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/sections/PageHero";

export default function AssetProtection() {
  return (
    <>
      <PageHero
        eyebrow="Asset Protection"
        align="center"
        title={
          <>
            Two shields. <em>One entity.</em> Every asset protected.
          </>
        }
        description="LLCs provide two fundamentally different types of liability protection. Understanding them — and how a Florida Protected Series LLC amplifies both — is essential for any serious investor."
      />

      {/* Intro callout */}
      <section className="container-wide pb-12">
        <div className="mx-auto max-w-3xl rounded-2xl border border-accent/30 bg-accent/5 p-8">
          <p className="text-base text-foreground/80 leading-relaxed">
            When most people talk about "asset protection," they are only thinking about one dimension of liability. In reality, every asset you own faces threats from two entirely different directions — and a proper legal structure must defend against both. A Florida Protected Series LLC addresses all of them simultaneously, for every asset in your portfolio, under a single filing.
          </p>
        </div>
      </section>

      {/* Inside Liability */}
      <section className="container-wide pb-20 lg:pb-24">
        <div className="mx-auto max-w-3xl space-y-10">

          {/* Section header */}
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <span className="font-mono-feature text-xs uppercase tracking-[0.18em] text-destructive">Type 1</span>
              <h2 className="mt-1 font-display text-3xl lg:text-4xl">Inside Liability</h2>
              <p className="mt-2 text-muted-foreground">
                Liability that originates from an asset held inside the entity.
              </p>
            </div>
          </div>

          <p className="text-base text-foreground/80 leading-relaxed">
            Every asset you own carries the potential to generate a lawsuit. A rental property tenant slips on an icy walkway. A piece of heavy equipment injures a worker. An environmental contamination issue surfaces. These are liabilities that are <em>born inside</em> the entity — they arise from the asset itself.
          </p>

          {/* Example */}
          <div className="rounded-2xl border border-border bg-card p-8 space-y-4">
            <div className="flex items-center gap-2 text-xs font-mono-feature uppercase tracking-widest text-muted-foreground">
              <span className="h-px w-6 bg-border" /> Example
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Chuck and Belinda form <strong>Heavenly Havens, LLC</strong> to hold a small apartment complex. A tenant named Ralph slips on an improperly maintained walkway and breaks his leg. Ralph sues. Because the property is titled in the LLC's name and Ralph was clearly dealing with a legal entity, he can only sue Heavenly Havens, LLC — not Chuck and Belinda personally. A judgment against the LLC can reach the LLC's bank accounts and real estate, but cannot touch Chuck and Belinda's personal savings, home, or other assets.
            </p>
          </div>

          {/* How Series amplifies this */}
          <div className="rounded-2xl border border-trust/30 bg-trust/5 p-8 space-y-5">
            <h3 className="font-display text-xl text-trust">How a Protected Series LLC amplifies Inside Liability protection</h3>
            <p className="text-sm text-foreground/80 leading-relaxed">
              A standard LLC keeps inside liability from reaching your personal assets. That's valuable — but it's a single wall. If you hold ten rental properties in one LLC, a catastrophic judgment against that LLC could wipe out all ten properties at once.
            </p>
            <p className="text-sm text-foreground/80 leading-relaxed">
              A Florida Protected Series LLC builds a separate firewall around every single property. Each property lives in its own designated series. A slip-and-fall on Series A's Miami duplex cannot touch Series B's Tampa office, Series C's vacation rental, or any other series. The liability is hermetically sealed at the series level — not just at the entity level.
            </p>
            <ul className="space-y-3">
              {[
                "One catastrophic judgment cannot cascade across your entire portfolio",
                "Each series holds its own assets, bank accounts, and books — creditors of one series are legally barred from the rest",
                "Florida §605.2101 gives each series statutory entity status — the firewall is embedded in state law, not just contractual language",
                "Adding a new asset simply means creating a new series, not a new LLC filing",
              ].map((item) => (
                <li key={item} className="flex gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-trust" />
                  <span className="text-foreground/80">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Inside liability grid */}
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-3">
            {[
              { entity: "Corporation", verdict: "bad", note: "Inside liability contained, but all corporate assets are at risk from a single judgment due to no internal firewalls" },
              { entity: "Standard LLC", verdict: "ok", note: "Protects personal assets, but a single large judgment can wipe out all LLC assets" },
              { entity: "FL Protected Series LLC", verdict: "best", note: "Each series is a separate firewall — one judgment cannot reach other series assets" },
            ].map((row) => (
              <div key={row.entity} className="bg-card p-6 space-y-2">
                <div className="font-medium text-sm">{row.entity}</div>
                <div className={`text-xs font-mono-feature uppercase tracking-widest ${
                  row.verdict === "best" ? "text-trust" : row.verdict === "ok" ? "text-yellow-500" : "text-destructive"
                }`}>
                  {row.verdict === "best" ? "Maximum protection" : row.verdict === "ok" ? "Partial protection" : "Limited protection"}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{row.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="container-wide pb-20 lg:pb-24">
        <div className="mx-auto max-w-3xl border-t border-border" />
      </div>

      {/* Outside Liability */}
      <section className="container-wide pb-20 lg:pb-24">
        <div className="mx-auto max-w-3xl space-y-10">

          {/* Section header */}
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <span className="font-mono-feature text-xs uppercase tracking-[0.18em] text-destructive">Type 2</span>
              <h2 className="mt-1 font-display text-3xl lg:text-4xl">Outside Liability</h2>
              <p className="mt-2 text-muted-foreground">
                Liability that originates from something completely unrelated to the entity.
              </p>
            </div>
          </div>

          <p className="text-base text-foreground/80 leading-relaxed">
            Outside liability is the risk most investors overlook. This is when <em>you personally</em> become liable for something that has nothing to do with your investment properties — a car accident, a personal lawsuit, a failed business venture, a medical debt. Suddenly, a creditor is coming after everything you own, including your ownership interest in your LLC.
          </p>

          {/* Corporation failure example */}
          <div className="rounded-2xl border border-border bg-card p-8 space-y-4">
            <div className="flex items-center gap-2 text-xs font-mono-feature uppercase tracking-widest text-muted-foreground">
              <span className="h-px w-6 bg-border" /> Why a corporation fails here
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Suppose Chuck and Belinda had used a corporation — <strong>Heavenly Havens, Inc.</strong> — instead. Chuck causes a serious car accident and is hit with $20 million in judgments. His creditors simply take his corporate stock. Now Belinda is in business with Chuck's creditors, who can force a liquidation of the entire corporation and a sale of the underlying property. The corporate form provides zero protection against outside liability.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-xs text-destructive font-medium">Corporate stock can be seized directly — no barrier between you and your creditors.</span>
            </div>
          </div>

          {/* Charging order explanation */}
          <div className="space-y-4">
            <h3 className="font-display text-2xl">The LLC's secret weapon: the charging order</h3>
            <p className="text-base text-foreground/80 leading-relaxed">
              When a creditor holds a judgment against a member of an LLC, they cannot simply seize that member's ownership interest the way they can with corporate stock. Instead, Florida law limits the creditor to a <strong>charging order</strong> — a court order that entitles them to receive distributions <em>if and when</em> the LLC decides to make them.
            </p>
            <p className="text-base text-foreground/80 leading-relaxed">
              The critical word is <em>if</em>. Because the creditor cannot vote, they have no ability to force distributions. The remaining members remain in control of all management and distribution decisions. If Chuck and Belinda simply stop distributing money from the LLC — reinvesting rents into new properties, for example — the creditor receives nothing while the judgment clock ticks. Faced with the prospect of waiting twenty years and collecting zero, creditors frequently settle for a fraction of the judgment.
            </p>
          </div>

          {/* Charging order example */}
          <div className="rounded-2xl border border-border bg-card p-8 space-y-4">
            <div className="flex items-center gap-2 text-xs font-mono-feature uppercase tracking-widest text-muted-foreground">
              <span className="h-px w-6 bg-border" /> How a charging order plays out
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              The same $20 million judgment — but now Chuck and Belinda hold the property in <strong>Heavenly Havens, LLC</strong>. The creditors obtain a charging order against Chuck's 50% interest. They cannot seize his interest, vote his shares, or reach the property. Chuck and Belinda, still the managers, simply reinvest all rental income rather than distributing it. The creditors receive nothing. Faced with a 20-year wait, they negotiate a settlement for far less than the full judgment amount.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <CheckCircle2 className="h-4 w-4 text-trust shrink-0" />
              <span className="text-xs text-trust font-medium">Charging order = powerful negotiating leverage. Creditors settle rather than wait.</span>
            </div>
          </div>

          {/* Single-member caveat */}
          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
              <h4 className="font-medium text-sm">Important: single-member LLCs do not get this protection</h4>
            </div>
            <p className="text-sm text-foreground/70 leading-relaxed">
              Charging order protection only applies to LLCs with two or more members. If you own a single-member LLC, a creditor can seize your entire ownership interest just as easily as corporate stock — negating the outside liability shield entirely. This is true regardless of how the LLC is taxed (disregarded entity, S-corp election, or otherwise).
            </p>
          </div>

          {/* How Series amplifies outside liability protection */}
          <div className="rounded-2xl border border-trust/30 bg-trust/5 p-8 space-y-5">
            <h3 className="font-display text-xl text-trust">How a <em>multi-member</em> Protected Series LLC amplifies Outside Liability protection</h3>

            <div className="flex items-start gap-3 rounded-xl border border-yellow-500/40 bg-yellow-500/10 p-4">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-foreground/80 leading-relaxed">
                <strong>Membership structure matters.</strong> A Florida Protected Series LLC with two or more members receives full charging order protection against outside liability. A <strong>single-member</strong> Protected Series LLC does not — a creditor can seize the sole member's interest directly, just as with a corporation. This rule is the same regardless of how the LLC is taxed.
              </p>
            </div>

            <p className="text-sm text-foreground/80 leading-relaxed">
              When structured as a multi-member entity, a Florida Protected Series LLC goes beyond what any standard LLC can offer:
            </p>
            <ul className="space-y-3">
              {[
                "Florida §605.2108 explicitly extends every charging-order protection available to a standard LLC to each protected series — the shield is inherited by statute, not by contract",
                "Even if a creditor obtains a charging order against your interest in the master LLC, the individual series assets are separately titled and separately shielded",
                "Each series can have its own distinct membership interests — structuring each series with multiple members locks in charging-order exclusivity at every level of the structure",
                'The Florida legislature has established by statute that the charging order is the \u201csole and exclusive\u201d remedy available to a creditor of a person holding a membership interest in a multi-member Florida LLC, including each of its associated series',
                "With an entire portfolio protected across multiple series, a creditor has no single point of attack — their only remedy is to wait, which gives you enormous negotiating leverage",
              ].map((item) => (
                <li key={item} className="flex gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-trust" />
                  <span className="text-foreground/80">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Outside liability comparison grid */}
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
            {[
              { entity: "Corporation", verdict: "bad", note: "Stock can be seized directly — creditors become your business partner instantly" },
              { entity: "Single-Member LLC", verdict: "bad", note: "Charging order protection does not apply — interest can be seized like corporate stock" },
              { entity: "Single-Member FL Protected Series LLC", verdict: "bad", note: "Same weakness applies — single-member status negates charging order protection regardless of the series structure" },
              { entity: "Multi-Member LLC", verdict: "ok", note: "Charging order protection applies, but all LLC assets are behind a single shield" },
              { entity: "Multi-Member FL Protected Series LLC", verdict: "best", note: "Charging order protection inherited by every series under §605.2108 — maximum leverage against creditors at every level" },
            ].map((row) => (
              <div key={row.entity} className={`bg-card p-6 space-y-2 ${row.entity === "Multi-Member FL Protected Series LLC" ? "md:col-span-2 lg:col-span-1" : ""}`}>
                <div className={`font-medium text-sm ${row.entity === "Multi-Member FL Protected Series LLC" ? "text-trust" : ""}`}>{row.entity}</div>
                <div className={`text-xs font-mono-feature uppercase tracking-widest ${
                  row.verdict === "best" ? "text-trust" : row.verdict === "ok" ? "text-yellow-500" : "text-destructive"
                }`}>
                  {row.verdict === "best" ? "Maximum protection" : row.verdict === "ok" ? "Good protection" : "No protection"}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{row.note}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Summary table */}
      <section className="container-wide pb-20 lg:pb-28">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-3xl mb-8 text-center">Protection at a glance</h2>
          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="p-4 text-left font-medium text-muted-foreground">Entity type</th>
                  <th className="p-4 text-center font-medium text-muted-foreground">Inside liability</th>
                  <th className="p-4 text-center font-medium text-muted-foreground">Outside liability</th>
                  <th className="p-4 text-center font-medium text-muted-foreground">Inter-asset isolation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { name: "Corporation", inside: false, outside: false, inter: false },
                  { name: "Single-Member LLC", inside: true, outside: false, inter: false },
                  { name: "Multi-Member LLC", inside: true, outside: true, inter: false },
                  { name: "Single-Member FL Protected Series LLC", inside: true, outside: false, inter: true },
                  { name: "Multi-Member FL Protected Series LLC", inside: true, outside: true, inter: true },
                ].map((row) => (
                  <tr key={row.name} className={row.name === "Multi-Member FL Protected Series LLC" ? "bg-trust/5" : ""}>
                    <td className={`p-4 font-medium ${row.name === "Multi-Member FL Protected Series LLC" ? "text-trust" : ""}`}>{row.name}</td>
                    <td className="p-4 text-center">
                      {row.inside ? (
                        <CheckCircle2 className="h-4 w-4 text-trust mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive mx-auto" />
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {row.outside ? (
                        <CheckCircle2 className="h-4 w-4 text-trust mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive mx-auto" />
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {row.inter ? (
                        <CheckCircle2 className="h-4 w-4 text-trust mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* CTA */}
          <div className="mt-14 rounded-3xl border border-accent bg-card p-10 text-center shadow-[0_30px_80px_-30px_rgba(13,46,85,0.2)]">
            <div className="flex justify-center mb-4">
              <ShieldCheck className="h-10 w-10 text-trust" />
            </div>
            <h3 className="font-display text-2xl">Ready to build the strongest possible shield?</h3>
            <p className="mt-3 text-muted-foreground max-w-md mx-auto">
              A multi-member Florida Protected Series LLC is the only structure that defends against inside liability, outside liability, and inter-asset contagion — all in one filing.
            </p>
            <div className="mt-8 flex justify-center">
              <Button asChild size="lg" className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/pricing">
                  Form your LLC — $499
                  <ArrowUpRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
