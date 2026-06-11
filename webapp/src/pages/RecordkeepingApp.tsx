import { Link } from "react-router-dom";
import {
  Smartphone,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BookOpen,
  ArrowUpRight,
  Building2,
  DollarSign,
  FileText,
  FolderOpen,
  ShieldCheck,
  Users,
  TrendingUp,
  Receipt,
  ArrowLeftRight,
  Star,
  Layers,
  CreditCard,
  LayoutGrid,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHero } from "@/components/sections/PageHero";

const appFeatures = [
  { icon: Building2, label: "Main LLC assets", desc: "Track everything owned at the main LLC level — real estate, accounts, equipment, and more." },
  { icon: Layers, label: "Series assets", desc: "Record which assets belong to each individual protected series, separately from the main LLC and every other series." },
  { icon: DollarSign, label: "Income by entity", desc: "Log income received at the main LLC level or assign it to the correct protected series." },
  { icon: Receipt, label: "Expenses by entity", desc: "Track expenses paid by the main LLC versus expenses that belong to a specific series." },
  { icon: CreditCard, label: "Distributions", desc: "Document distributions to members, including amount, date, and the entity making the distribution." },
  { icon: Users, label: "Ownership records", desc: "Keep a clear record of membership interests and ownership percentages for the main LLC and each series." },
  { icon: ArrowLeftRight, label: "Asset transfers", desc: "Record transfers of assets between the main LLC and its series, or between series, with supporting notes." },
  { icon: FileText, label: "Notes and records", desc: "Attach notes, memos, and records to any series, transaction, or asset entry for a complete audit trail." },
  { icon: LayoutGrid, label: "Separated by entity", desc: "Every item is organized by the entity or series it belongs to — no commingling, no confusion." },
];

const comparisonRows = [
  { feature: "Files state formation documents", typical: true, ours: true },
  { feature: "Provides operating agreement", typical: true, ours: true },
  { feature: "Issues EIN (tax ID)", typical: true, ours: true },
  { feature: "Delivers basic document package", typical: true, ours: true },
  { feature: "Explains recordkeeping obligations", typical: false, ours: true },
  { feature: "Provides purpose-built recordkeeping app", typical: false, ours: true },
  { feature: "App tracks assets per series", typical: false, ours: true },
  { feature: "App separates income and expenses by entity", typical: false, ours: true },
  { feature: "App documents distributions and transfers", typical: false, ours: true },
  { feature: "Ongoing compliance support tool", typical: false, ours: true },
];

const commonProblems = [
  {
    icon: FolderOpen,
    title: "Assets titled to the wrong entity",
    desc: "An asset purchased for Series B gets recorded under the main LLC — or worse, under a different series. When disputes arise, there is no clear documentary basis to show which entity owns what.",
  },
  {
    icon: DollarSign,
    title: "Income deposited without identifying the series",
    desc: "Rent from a Series A property gets deposited into a single account with no notation of which series the income belongs to. Over time, the books become impossible to untangle.",
  },
  {
    icon: Receipt,
    title: "Expenses paid from the wrong account",
    desc: "A repair expense for Series C is paid out of the main LLC account with no record of the reimbursement or allocation. The books no longer reflect the true financial picture of each series.",
  },
  {
    icon: CreditCard,
    title: "Distributions never documented",
    desc: "Cash goes out to members with no written record of the amount, date, authorizing entity, or the series the distribution came from. This creates exposure and confusion.",
  },
  {
    icon: Layers,
    title: "No clear record of what each series owns",
    desc: "After a few years, the owner cannot produce a clean list of which assets belong to the main LLC versus each series — undermining the entire purpose of the structure.",
  },
  {
    icon: BookOpen,
    title: "Books and records not separated by series",
    desc: "All income, expenses, and assets are tracked in a single spreadsheet with no separation by entity or series. The legal firewall exists on paper, but the records tell a different story.",
  },
];

const benefits = [
  { icon: ShieldCheck, title: "Cleaner, more defensible records", desc: "Every asset, transaction, and note is organized by entity or series — making your books clear and easy to explain if questions ever arise." },
  { icon: LayoutGrid, title: "True separation between entities", desc: "The app mirrors the legal structure of your FPSLLC, helping you keep the main LLC and each series genuinely distinct in your books — not just on paper." },
  { icon: TrendingUp, title: "Better organization as you grow", desc: "Add new series as you acquire new assets. Each series gets its own records without creating confusion in the rest of your books." },
  { icon: Smartphone, title: "Designed for this exact structure", desc: "Unlike generic accounting apps, this tool is built around how a Florida Protected Series LLC actually works — with the main LLC and its series at the center." },
  { icon: Star, title: "Confidence after formation", desc: "Formation is not the finish line. This app gives you a practical system for maintaining the structure you paid to create — so it keeps working the way it was designed to." },
  { icon: Users, title: "Built for non-accountants", desc: "You do not need to be a bookkeeper to use it. The app is straightforward enough for any business owner to use regularly, without requiring professional help for every entry." },
];

export default function RecordkeepingApp() {
  return (
    <>
      <PageHero
        eyebrow="Free with formation"
        title={
          <>
            Formation is only step one.{" "}
            <em>Proper records keep your FPSLLC working.</em>
          </>
        }
        description="When you form your Florida Protected Series LLC through our service, you receive free access to the iPhone app built specifically for FPSLLC recordkeeping — a practical compliance companion designed to grow with your portfolio."
        meta={
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20"
            >
              <Link to="/pricing">
                Form your FPSLLC — free app included
                <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-full">
              <Link to="/what-is">Learn about the FPSLLC</Link>
            </Button>
          </div>
        }
      />

      {/* Free app callout banner */}
      <section className="container-wide pt-10 pb-4">
        <div className="mx-auto max-w-3xl flex items-start gap-4 rounded-2xl border border-trust/30 bg-trust/5 p-6">
          <Smartphone className="h-8 w-8 shrink-0 text-trust mt-0.5" />
          <div>
            <p className="font-medium text-foreground">Every formation includes the iPhone app — at no additional cost.</p>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              Customers who form their Florida Protected Series LLC through our service receive free access to our iPhone recordkeeping app. It is included with your formation, not sold separately.
            </p>
          </div>
        </div>
      </section>

      {/* ── Why Recordkeeping Matters ── */}
      <section className="container-wide py-20 lg:py-28">
        <div className="mx-auto max-w-3xl space-y-10">
          <div>
            <span className="eyebrow">Why recordkeeping matters</span>
            <h2 className="display mt-4 text-3xl lg:text-4xl text-balance">
              The legal firewall only works if your records support it.
            </h2>
          </div>

          <p className="text-base text-foreground/80 leading-relaxed">
            A Florida Protected Series LLC is designed to keep the assets and liabilities of each protected series separate from one another and from the main LLC. That separation — the firewall — is what gives the structure its value. One series can face a lawsuit or a debt, and the assets held in your other series are not exposed.
          </p>

          <p className="text-base text-foreground/80 leading-relaxed">
            But the firewall is not self-maintaining. It depends on how you operate the entity. Florida law requires that each protected series maintain its own records and that the assets and liabilities associated with each series be identifiable as belonging to that series. If your records do not clearly show what belongs to the main LLC versus what belongs to each series, you have created ambiguity — and ambiguity is exactly what creditors and opposing counsel look for.
          </p>

          <div className="rounded-2xl border border-border bg-card p-8 space-y-4">
            <div className="flex items-center gap-2 text-xs font-mono-feature uppercase tracking-widest text-muted-foreground">
              <span className="h-px w-6 bg-border" /> The practical reality
            </div>
            <p className="text-sm text-foreground/80 leading-relaxed">
              Think of the legal structure as the blueprint and your records as the building. You can have the best blueprint in the world — but if no one follows it, the building is not what the plans describe. A well-formed FPSLLC with poor recordkeeping is a structure that exists legally but may not hold up to scrutiny when it actually needs to protect you.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="font-display text-xl">What proper records accomplish</h3>
            <ul className="space-y-3">
              {[
                "They show which assets belong to the main LLC and which belong to each individual protected series.",
                "They document which income is received by each entity or series — and from what source.",
                "They track which expenses are paid by the main LLC versus a specific series, and why.",
                "They record distributions to members, transfers between entities, and ownership information.",
                "They give you — and anyone else reviewing your books — a clear, organized picture of how the structure is actually operating.",
              ].map((item) => (
                <li key={item} className="flex gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-trust" />
                  <span className="text-foreground/80">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-6 space-y-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
              <h4 className="font-medium text-sm">Recordkeeping is not optional — it is part of operating the structure correctly.</h4>
            </div>
            <p className="text-sm text-foreground/70 leading-relaxed">
              Many business owners treat recordkeeping as an administrative afterthought. With a Florida Protected Series LLC, it is one of the core obligations of operating the structure. Sloppy records do not just create accounting headaches — they can give a creditor or a court a basis to question whether the series boundaries were ever maintained in practice.
            </p>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="container-wide">
        <div className="mx-auto max-w-3xl border-t border-border" />
      </div>

      {/* ── Introducing the App ── */}
      <section className="container-wide py-20 lg:py-28">
        <div className="mx-auto max-w-3xl space-y-10">
          <div>
            <span className="eyebrow">Your built-in compliance companion</span>
            <h2 className="display mt-4 text-3xl lg:text-4xl text-balance">
              An iPhone app designed specifically for FPSLLC recordkeeping.
            </h2>
            <p className="mt-4 text-base text-muted-foreground leading-relaxed">
              Most business formation companies hand you your documents and send you on your way. We give you the tool you need to maintain the structure after it is formed.
            </p>
          </div>

          {/* App feature grid */}
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {appFeatures.map((f) => (
              <div key={f.label} className="bg-card p-6 space-y-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <p className="font-medium text-sm">{f.label}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-8 space-y-4">
            <div className="flex items-start gap-3">
              <Star className="h-5 w-5 text-accent shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Free with your formation — no subscription, no upsell.</p>
                <p className="mt-2 text-sm text-foreground/80 leading-relaxed">
                  When you form your Florida Protected Series LLC through our service, you receive access to the app at no additional charge. It is part of what makes our formation service different from every other option on the market. Other companies form the entity. We form the entity and give you the tool you need to maintain it.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="container-wide">
        <div className="mx-auto max-w-3xl border-t border-border" />
      </div>

      {/* ── Comparison Section ── */}
      <section className="container-wide py-20 lg:py-28">
        <div className="mx-auto max-w-3xl space-y-10">
          <div>
            <span className="eyebrow">How we compare</span>
            <h2 className="display mt-4 text-3xl lg:text-4xl text-balance">
              Other services form the LLC. We form it and help you maintain it.
            </h2>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="p-4 text-left font-medium text-muted-foreground w-1/2">What you get</th>
                  <th className="p-4 text-center font-medium text-muted-foreground w-1/4">
                    <span className="block text-xs uppercase tracking-widest text-destructive/80">Typical service</span>
                  </th>
                  <th className="p-4 text-center font-medium text-trust w-1/4">
                    <span className="block text-xs uppercase tracking-widest text-trust">Our service</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {comparisonRows.map((row) => (
                  <tr key={row.feature}>
                    <td className="p-4 text-foreground/80">{row.feature}</td>
                    <td className="p-4 text-center">
                      {row.typical ? (
                        <CheckCircle2 className="h-4 w-4 text-trust mx-auto" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive/50 mx-auto" />
                      )}
                    </td>
                    <td className="p-4 text-center">
                      <CheckCircle2 className="h-4 w-4 text-trust mx-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 space-y-3">
              <p className="text-xs font-mono-feature uppercase tracking-[0.18em] text-destructive/70">Typical formation service</p>
              <p className="font-display text-lg">Forms the entity. Delivers documents. Leaves you to figure out the rest.</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You receive your operating agreement and articles. The filing is done. What happens next — how you maintain the books, track your assets and series, and keep your records compliant — is left entirely up to you.
              </p>
            </div>
            <div className="rounded-2xl border border-trust/30 bg-trust/5 p-6 space-y-3">
              <p className="text-xs font-mono-feature uppercase tracking-[0.18em] text-trust">Our FPSLLC formation service</p>
              <p className="font-display text-lg">Forms the entity. Delivers documents. Gives you the tool to maintain it.</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You receive everything a typical service provides — plus free access to an iPhone app built specifically for Florida Protected Series LLC recordkeeping. Formation is the beginning, not the end.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="container-wide">
        <div className="mx-auto max-w-3xl border-t border-border" />
      </div>

      {/* ── Common Recordkeeping Problems ── */}
      <section className="container-wide py-20 lg:py-28">
        <div className="mx-auto max-w-3xl space-y-10">
          <div>
            <span className="eyebrow">Common recordkeeping problems</span>
            <h2 className="display mt-4 text-3xl lg:text-4xl text-balance">
              What goes wrong when records are not maintained properly.
            </h2>
            <p className="mt-4 text-base text-muted-foreground leading-relaxed">
              These are the issues we see most often with FPSLLC owners who did not have a system in place from the start.
            </p>
          </div>

          <div className="space-y-4">
            {commonProblems.map((problem) => (
              <div key={problem.title} className="flex items-start gap-4 rounded-2xl border border-border bg-card p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10">
                  <problem.icon className="h-5 w-5 text-destructive" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-sm text-foreground">{problem.title}</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{problem.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <p className="text-sm text-foreground/80 leading-relaxed">
              None of these problems are inevitable. They are almost always the result of not having a clear, dedicated system from day one. The app we include with formation is designed to prevent each of these issues before they start.
            </p>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="container-wide">
        <div className="mx-auto max-w-3xl border-t border-border" />
      </div>

      {/* ── Benefits Section ── */}
      <section className="container-wide py-20 lg:py-28">
        <div className="mx-auto max-w-3xl space-y-10">
          <div>
            <span className="eyebrow">What the app gives you</span>
            <h2 className="display mt-4 text-3xl lg:text-4xl text-balance">
              A practical system for running your FPSLLC correctly from day one.
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {benefits.map((b) => (
              <div key={b.title} className="bg-card p-6 space-y-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-trust/10">
                  <b.icon className="h-5 w-5 text-trust" />
                </div>
                <p className="font-medium text-sm">{b.title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Section ── */}
      <section className="container-wide pb-20 lg:pb-28">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl border border-border bg-primary text-primary-foreground overflow-hidden relative">
            {/* Decorative */}
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

            <div className="relative p-10 lg:p-14 space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em]">
                <Smartphone className="h-3.5 w-3.5 text-accent" />
                Free iPhone app with every formation
              </span>
              <h2 className="display text-3xl text-balance lg:text-5xl">
                Form your FPSLLC and get the recordkeeping app built for it.
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-primary-foreground/75">
                Every formation customer receives free access to our iPhone recordkeeping app — the only app built specifically for the ongoing maintenance of a Florida Protected Series LLC. Formation is step one. This is how you do the rest.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90 shadow-lg shadow-accent/20"
                >
                  <Link to="/pricing">
                    See pricing and get started
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="rounded-full border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
                >
                  <Link to="/what-is">Learn more about the FPSLLC</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Disclaimer ── */}
      <section className="container-wide pb-20 lg:pb-28">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-secondary/40 p-6 lg:p-8">
          <p className="text-xs font-mono-feature uppercase tracking-[0.18em] text-muted-foreground mb-3">Disclaimer</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We are not a law firm and do not provide legal advice. The information on this page is provided for general informational purposes only and does not constitute legal, tax, or accounting advice. The iPhone recordkeeping app described on this page is a recordkeeping and organization tool only. It is not a substitute for professional legal, tax, or accounting advice, and it does not ensure legal compliance with any law or regulation. Every business owner's situation is different. You should consult with qualified legal, tax, and accounting professionals regarding your specific circumstances, the suitability of a Florida Protected Series LLC for your goals, and your recordkeeping and compliance obligations.
          </p>
        </div>
      </section>
    </>
  );
}
