import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export function StatuteTeaser() {
  return (
    <section className="relative overflow-hidden bg-primary text-primary-foreground">
      <div className="container-wide relative section-y">
        <div className="max-w-3xl space-y-5">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1 text-xs uppercase tracking-[0.18em]">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" /> Formed in Florida
          </span>
          <h2 className="display text-4xl text-balance lg:text-5xl">
            A Florida entity, under <em>Florida's</em> own statute.
          </h2>
          <p className="text-base leading-relaxed text-primary-foreground/80">
            Form here and stay here — no forming somewhere else and registering that entity back into
            Florida as a foreign LLC. Two sections do most of the day-to-day work: how a protected
            series holds property, and how a court reads a series when the chapter applies.
          </p>
          <Link
            to="/the-statute"
            className="inline-flex items-center gap-2 text-accent hover:text-primary-foreground transition-colors font-medium"
          >
            Read the statute section by section
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
