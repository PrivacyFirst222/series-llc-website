import {
  Shield,
  Layers,
  Banknote,
  Scroll,
  MapPin,
  Scale,
  Sparkles,
  Building2,
} from "lucide-react";

const BENEFITS: { icon: typeof Shield; title: string; body: string }[] = [
  {
    icon: Shield,
    title: "Horizontal liability shield",
    body: "A creditor of Series A cannot reach Series B's assets. Statutorily-mandated asset segregation across every series.",
  },
  {
    icon: Layers,
    title: "Vertical shield (parent ↔ series)",
    body: "The mothership is insulated from series obligations, and vice versa — a structural feature missing from many older series statutes.",
  },
  {
    icon: Banknote,
    title: "One filing, one franchise relationship",
    body: "Pay the $125 Florida formation fee once. Add additional series by filing a Certificate of Designation for each (estimated $25 state filing fee per series).",
  },
  {
    icon: MapPin,
    title: "Real property recording rules",
    body: "§605.2301 lets you record real property in the name of a series. The county clerk recognizes the series itself — clean title chain.",
  },
  {
    icon: Scale,
    title: "Broader Florida-LLC extrapolation",
    body: "§605.2108 imports the rest of Chapter 605 — meaning every protection Florida regular LLCs enjoy applies to your series.",
  },
  {
    icon: Scroll,
    title: "Cleaner operating agreements",
    body: "One master OA + lightweight Series Designations. Easier to amend, easier for lenders to underwrite, easier to explain to partners.",
  },
  {
    icon: Building2,
    title: "Lender & title-friendly",
    body: "Florida-native structure means Florida lenders, title insurers, and county clerks understand it natively. No out-of-state friction.",
  },
  {
    icon: Sparkles,
    title: "Future-proof for growth",
    body: "Adding another asset is a quick Certificate of Designation (estimated $25 filing fee) — not another $125 LLC formation, new EIN, registered agent, and annual report.",
  },
];

export function BenefitsGrid() {
  return (
    <section className="relative">
      <div className="container-wide py-20 lg:py-28">
        <div className="max-w-2xl">
          <span className="eyebrow">Why investors choose it</span>
          <h2 className="display mt-3 text-4xl text-balance lg:text-5xl">
            The protections of a holding company.{" "}
            <em>The simplicity of a single LLC.</em>
          </h2>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b, i) => {
            const Icon = b.icon;
            return (
              <article
                key={b.title}
                className="group relative bg-card p-7 transition-colors hover:bg-secondary/60"
              >
                <span className="absolute right-5 top-5 font-mono-feature text-[0.65rem] tracking-[0.16em] text-muted-foreground/70">
                  0{i + 1}
                </span>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-display text-lg font-medium leading-snug">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
