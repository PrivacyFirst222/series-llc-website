import { Link } from "react-router-dom";
import { Mail, MapPin, ShieldCheck, Building2 } from "lucide-react";
import { Logo } from "./Logo";

const groups: { title: string; links: { to: string; label: string }[] }[] = [
  {
    title: "Learn",
    links: [
      { to: "/what-is", label: "What Is a Series LLC" },
      { to: "/benefits", label: "Key Benefits" },
      { to: "/florida-advantages", label: "Florida Advantages" },
      { to: "/comparison", label: "Compare to Delaware" },
    ],
  },
  {
    title: "Get Started",
    links: [
      { to: "/how-it-works", label: "Formation Process" },
      { to: "/pricing", label: "Packages & Pricing" },
      { to: "/contact", label: "Contact Us" },
      { to: "/faq", label: "FAQ" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-border bg-secondary/40">
      <div className="container-wide py-16 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5 space-y-6">
            <Logo />
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              The first dedicated formation service for Florida's new Protected Series LLC —
              statute-driven asset protection, designed for investors and operators across the Sunshine State.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-trust" />
                Statute §605.2101 compliant
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-trust" />
                FL Div. of Corps registered agent
              </span>
            </div>
          </div>

          {groups.map((group) => (
            <div key={group.title} className="lg:col-span-2 space-y-4">
              <h4 className="font-display text-sm font-semibold tracking-wide">{group.title}</h4>
              <ul className="space-y-2.5">
                {group.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="lg:col-span-3 space-y-4">
            <h4 className="font-display text-sm font-semibold tracking-wide">Contact</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                <span>
                  201 E. Las Olas Blvd, Suite 1700
                  <br />
                  Fort Lauderdale, FL 33301
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <a href="mailto:hello@myfloridaseriesllc.com" className="hover:text-foreground">
                  hello@myfloridaseriesllc.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 hairline" />

        <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <p className="text-xs text-muted-foreground max-w-3xl leading-relaxed">
            <strong className="text-foreground/80">Disclaimer:</strong> MyFloridaSeriesLLC.com is a document
            preparation and registered agent service. The information on this site is provided for general
            educational purposes and does not constitute legal advice. Use of this site does not create an
            attorney–client relationship.
          </p>
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} MyFloridaSeriesLLC.com. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
