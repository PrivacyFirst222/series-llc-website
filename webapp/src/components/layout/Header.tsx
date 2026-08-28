import { useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Menu, X, ArrowUpRight, ChevronDown } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const LEARN: { to: string; label: string; sub: string }[] = [
  { to: "/what-is", label: "What Is a Series LLC", sub: "The structure, in plain English" },
  { to: "/benefits", label: "Key Benefits", sub: "Why investors choose it" },
  { to: "/asset-protection", label: "Asset Protection", sub: "The two liability shields" },
  { to: "/the-statute", label: "The Florida Statute", sub: "Ch. 605 highlights" },
  { to: "/faq", label: "FAQ", sub: "Common questions, answered" },
];

const NAV: { to: string; label: string }[] = [
  { to: "/how-it-works", label: "How It Works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/recordkeeping-app", label: "Free App" },
];

/** Full flat list for the mobile drawer. */
const MOBILE_NAV: { to: string; label: string }[] = [
  { to: "/what-is", label: "What Is" },
  { to: "/benefits", label: "Benefits" },
  { to: "/asset-protection", label: "Asset Protection" },
  { to: "/the-statute", label: "The Statute" },
  { to: "/faq", label: "FAQ" },
  { to: "/how-it-works", label: "How It Works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/recordkeeping-app", label: "Free App" },
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

  const learnActive = LEARN.some((l) => location.pathname === l.to);

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

        <nav className="hidden items-center gap-0.5 rounded-full border border-border/70 bg-card/80 p-1 shadow-sm backdrop-blur lg:flex">
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "group inline-flex items-center gap-1 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium outline-none transition-colors",
                learnActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground data-[state=open]:bg-secondary data-[state=open]:text-foreground",
              )}
            >
              Learn
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-180" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              sideOffset={10}
              className="w-72 rounded-xl border border-border bg-card p-1.5 shadow-lg"
            >
              {LEARN.map((item) => (
                <DropdownMenuItem key={item.to} asChild className="rounded-lg px-3 py-2.5">
                  <Link to={item.to} className="flex w-full cursor-pointer flex-col !items-start gap-0.5 text-left">
                    <span
                      className={cn(
                        "text-sm font-medium leading-snug",
                        location.pathname === item.to ? "text-accent" : "text-foreground",
                      )}
                    >
                      {item.label}
                    </span>
                    <span className="text-xs leading-snug text-muted-foreground">{item.sub}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 lg:gap-2">
          <Link
            to="/portal/login"
            className="hidden whitespace-nowrap px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
          >
            Client Login
          </Link>
          <span className="hidden h-5 w-px bg-border lg:block" />
          <Button
            asChild
            size="sm"
            className="hidden whitespace-nowrap rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90 lg:inline-flex"
          >
            <Link to="/pricing">
              Form your LLC
              <ArrowUpRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <button
            type="button"
            aria-label="Menu"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border/70 bg-background/95 backdrop-blur lg:hidden">
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
            {MOBILE_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "border-t border-border/50 py-3 text-base font-medium",
                    isActive ? "text-foreground" : "text-muted-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <Link
              to="/portal/login"
              className={cn(
                "border-t border-border/50 py-3 text-base font-medium",
                location.pathname.startsWith("/portal") ? "text-foreground" : "text-muted-foreground",
              )}
            >
              Client Login
            </Link>
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
