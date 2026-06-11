import { Link } from "react-router-dom";

interface LogoProps {
  variant?: "default" | "light";
}

export function Logo({ variant = "default" }: LogoProps) {
  const text = variant === "light" ? "text-background" : "text-foreground";
  const subtle = variant === "light" ? "text-background/60" : "text-muted-foreground";

  return (
    <Link to="/" className="group inline-flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center">
        <svg viewBox="0 0 36 36" className="h-9 w-9" fill="none">
          <defs>
            <linearGradient id="lg" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="hsl(206 78% 26%)" />
              <stop offset="1" stopColor="hsl(206 78% 38%)" />
            </linearGradient>
          </defs>
          <path
            d="M18 2 L32 9 V20 C32 27 26 32 18 34 C10 32 4 27 4 20 V9 Z"
            fill="url(#lg)"
          />
          <path
            d="M18 8 L26 11.5 V19 C26 23.5 22.5 27 18 28 C13.5 27 10 23.5 10 19 V11.5 Z"
            fill="hsl(38 35% 96%)"
            opacity="0.95"
          />
          <circle cx="18" cy="18" r="2.4" fill="hsl(18 88% 56%)" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className={`font-display text-[1.05rem] font-semibold tracking-tight ${text}`}>
          My<span className="text-accent">Florida</span>SeriesLLC
        </span>
        <span className={`text-[0.62rem] uppercase tracking-[0.18em] ${subtle}`}>
          Effective July 1, 2026
        </span>
      </span>
    </Link>
  );
}
