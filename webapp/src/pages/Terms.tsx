import { Fragment, type ReactNode } from "react";
import termsSource from "@/content/terms.md?raw";

/** Renders the **bold** spans within a single line of the terms document. */
function renderInline(line: string): ReactNode {
  const parts = line.split("**");
  return parts.map((part, i) => (
    <Fragment key={i}>{i % 2 === 1 ? <strong className="text-foreground">{part}</strong> : part}</Fragment>
  ));
}

/**
 * The Terms of Service is maintained as markdown in src/content/terms.md
 * (headings, bold, paragraphs only). Rendering from the source file keeps
 * the published page identical to the reviewed document.
 */
function renderTerms(source: string): ReactNode[] {
  const blocks = source.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: ReactNode[] = [];
  blocks.forEach((block, bi) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    lines.forEach((line, li) => {
      const key = `${bi}-${li}`;
      if (line.startsWith("### ")) {
        const heading = line.slice(4);
        out.push(
          <h2
            key={key}
            id={`section-${heading.split(".")[0]}`}
            className="font-display text-xl mt-10 mb-3 scroll-mt-24"
          >
            {heading}
          </h2>,
        );
      } else if (line.startsWith("Last updated:")) {
        out.push(
          <p key={key} className="text-sm text-muted-foreground">
            {renderInline(line)}
          </p>,
        );
      } else {
        out.push(
          <p key={key} className="text-sm leading-relaxed text-muted-foreground mb-3">
            {renderInline(line)}
          </p>,
        );
      }
    });
  });
  return out;
}

export default function Terms() {
  return (
    <section className="container-wide section-y">
      <div className="mx-auto max-w-3xl">
        <span className="eyebrow">Legal</span>
        <h1 className="display mt-3 text-3xl lg:text-4xl">Terms of Service</h1>
        <div className="mt-6">{renderTerms(termsSource)}</div>
      </div>
    </section>
  );
}
