import { Link } from "react-router-dom";
import { Sparkles, ArrowRight } from "lucide-react";

export function AnnouncementBar() {
  return (
    <div className="relative overflow-hidden bg-primary text-primary-foreground">
      <div className="container-wide flex items-center justify-center gap-2 py-2 text-[0.78rem]">
        <Sparkles className="h-3.5 w-3.5 text-accent" />
        <span className="font-medium">
          Florida Statute §605.2101 takes effect{" "}
          <span className="font-display italic">July 1, 2026</span> — early filings now open.
        </span>
        <Link
          to="/how-it-works"
          className="hidden md:inline-flex items-center gap-1 underline decoration-accent decoration-2 underline-offset-4 hover:text-accent transition-colors"
        >
          Reserve your series
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
