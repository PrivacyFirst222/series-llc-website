import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X, ArrowUpRight } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV: { to: string; label: string }[] = [
  { to: "/what-is", label: "What Is" },
  { to: "/benefits", label: "Benefits" },
  { to: "/asset-protection", label: "Asset Protection" },
  { to: "/recordkeeping-app", label: "Free App" },
  { to: "/florida-advantages", label: "FL Advantages" },
  { to: "/how-it-works", label: "Process" },
  { to: "/pricing", label: "Pricing" },
  { to: "/comparison", label: "Compare" },
  { to: "/faq", label: "FAQ" },
];

export function Header() {
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-border/70 bg-background/85 backdrop-blur-md"
          : "border-b border-transparent bg-background/0",
      )}
    >
      <div className="container-wide flex h-16 items-center justify-between gap-4 lg:h-20">
        <Logo />

        <nav className="hidden xl:flex items-center gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <span className="relative">
                  {item.label}
                  {isActive ? (
                    <span className="absolute -bottom-1 left-0 h-px w-full bg-accent" />
                  ) : null}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-5 hidden md:inline-flex">
            <Link to="/pricing">
              Form your LLC
              <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="xl:hidden inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="xl:hidden border-t border-border/70 bg-background/95 backdrop-blur">
          <nav className="container-wide flex flex-col py-4">
            <Link
              to="/"
              className={cn(
                "py-3 text-base font-medium",
                location.pathname === "/" ? "text-foreground" : "text-muted-foreground",
              )}
            >
              Home
            </Link>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "py-3 text-base font-medium border-t border-border/50",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <div className="mt-4">
              <Button asChild className="w-full rounded-full bg-primary text-primary-foreground">
                <Link to="/pricing">Form LLC</Link>
              </Button>
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
