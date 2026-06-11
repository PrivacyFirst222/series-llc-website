import { ReactNode } from "react";

interface PageHeroProps {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  meta?: ReactNode;
}

export function PageHero({ eyebrow, title, description, align = "left", meta }: PageHeroProps) {
  return (
    <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-b from-secondary/50 via-background to-background">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[420px] ring-spotlight pointer-events-none"
      />
      <div className="container-wide relative pt-16 pb-20 lg:pt-24 lg:pb-28">
        <div className={align === "center" ? "max-w-3xl mx-auto text-center" : "max-w-4xl"}>
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="display mt-4 text-4xl text-balance md:text-5xl lg:text-7xl">{title}</h1>
          {description ? (
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground text-pretty">
              {description}
            </p>
          ) : null}
          {meta ? <div className="mt-8">{meta}</div> : null}
        </div>
      </div>
    </section>
  );
}
