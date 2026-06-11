import { PageHero } from "@/components/sections/PageHero";
import { CallToAction } from "@/components/sections/CallToAction";
import { MothershipDiagram } from "@/components/home/MothershipDiagram";
import { Quote, BookOpen } from "lucide-react";

export default function WhatIs() {
  return (
    <>
      <PageHero
        eyebrow="The basics"
        title={
          <>
            What is a <em>Florida Protected</em> Series LLC?
          </>
        }
        description="A single LLC that contains an unlimited number of internally-segregated 'series.' Each series acts like its own legal entity for liability purposes — but you only file, tax, and administer one company."
      />

      {/* Body */}
      <section className="container-wide py-16 lg:py-24">
        <div className="grid gap-14 lg:grid-cols-12">
          <article className="lg:col-span-8 prose-invert max-w-none space-y-10">
            <div className="space-y-4">
              <span className="eyebrow">In one paragraph</span>
              <p className="text-xl leading-relaxed text-foreground/90 font-display font-light">
                A Protected Series LLC is a parent ("mothership") company that holds within it an
                unlimited number of <em className="text-accent">series</em>. Each series can own its own
                assets, sign its own contracts, and be sued separately — but they share one EIN-friendly
                tax structure, one operating agreement, and one Florida filing.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-3xl">The three layers</h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                Florida's statute (§605.2101 through §605.2401) defines three nested concepts:
              </p>
              <ol className="space-y-4 list-none">
                {[
                  {
                    n: "01",
                    t: "The Series LLC ('Mothership')",
                    d: "The parent company. Files Articles of Organization with Florida's Division of Corporations. Holds your master Operating Agreement.",
                  },
                  {
                    n: "02",
                    t: "Protected Series",
                    d: "Internal compartments created via a Certificate of Designation. Each one is recognized by statute as a separate person for liability and contracting purposes.",
                  },
                  {
                    n: "03",
                    t: "Series Assets & Liabilities",
                    d: "Held strictly within the boundary of a single series. Statute requires separate books and records — that's the price of admission for the liability shield.",
                  },
                ].map((row) => (
                  <li
                    key={row.n}
                    className="flex gap-5 rounded-xl border border-border bg-card p-5"
                  >
                    <div className="font-mono-feature text-2xl text-accent">{row.n}</div>
                    <div>
                      <div className="font-display text-lg font-semibold">{row.t}</div>
                      <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{row.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="space-y-4">
              <h2 className="text-3xl">Why "protected"?</h2>
              <p className="text-base leading-relaxed text-muted-foreground">
                The word matters. Older series statutes (Delaware 2002, Texas, Tennessee) created series
                with limited shielding — courts were free to question whether a series was "really" a
                separate entity. Florida's 2026 statute, modeled on the{" "}
                <em className="font-display text-foreground">Uniform Protected Series Act</em>, gives each
                series statutory entity status. Translation: a much harder shield to pierce.
              </p>
            </div>

            <figure className="rounded-2xl border-l-4 border-accent bg-secondary/50 p-7">
              <Quote className="h-6 w-6 text-accent" />
              <blockquote className="mt-3 font-display text-2xl leading-snug text-foreground">
                A Florida protected series is treated, for liability purposes, as if it were a free-standing
                limited liability company — with full statutory recognition by Florida courts, lenders, and
                county clerks.
              </blockquote>
              <figcaption className="mt-4 text-sm text-muted-foreground">
                — Adapted from Florida Statute §605.2104(2)
              </figcaption>
            </figure>

            <div className="space-y-4">
              <h2 className="text-3xl">Who it's built for</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {[
                  "Real estate investors with multiple properties",
                  "Short-term rental & vacation property operators",
                  "Boutique investment fund managers",
                  "Family offices managing diversified holdings",
                  "Operating businesses with a real estate side",
                  "Owners of intellectual property portfolios",
                ].map((u) => (
                  <li
                    key={u}
                    className="flex items-start gap-2 rounded-lg border border-border bg-card p-4 text-sm"
                  >
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-trust shrink-0" />
                    {u}
                  </li>
                ))}
              </ul>
            </div>
          </article>

          {/* Sidebar */}
          <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-24 self-start">
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 text-trust">
                <BookOpen className="h-4 w-4" />
                <span className="font-mono-feature text-xs uppercase tracking-[0.18em]">
                  Statute reference
                </span>
              </div>
              <h3 className="mt-3 font-display text-xl">Florida Revised LLC Act, Part III</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                Sections §605.2101 through §605.2401. Effective for entities formed on or after July 1, 2026.
              </p>
              <a
                href="https://www.flsenate.gov/Laws/Statutes/2024/Chapter605/All"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-sm font-medium text-primary hover:text-accent transition-colors"
              >
                Read the statute →
              </a>
            </div>

            <div className="rounded-2xl bg-primary text-primary-foreground p-6">
              <div className="font-mono-feature text-xs uppercase tracking-[0.18em] text-primary-foreground/70">
                Quick fact
              </div>
              <h3 className="mt-3 font-display text-xl leading-tight">
                Only 16 U.S. states have any series LLC statute.
              </h3>
              <p className="mt-2 text-sm text-primary-foreground/80">
                And Florida's is now the most comprehensive — period.
              </p>
            </div>
          </aside>
        </div>
      </section>

      <MothershipDiagram />
      <CallToAction />
    </>
  );
}
