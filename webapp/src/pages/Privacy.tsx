import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";
import privacySource from "@/content/privacy.md?raw";

/** Renders **bold** spans and [text](/path) internal links within a line. */
function renderInline(line: string): ReactNode {
  const parts = line.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <Link key={i} to={link[2]} className="underline underline-offset-2">
          {link[1]}
        </Link>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/**
 * The Privacy Policy is maintained as markdown in src/content/privacy.md
 * (headings, bold, bullets, internal links). Rendering from the source file
 * keeps the published page identical to the reviewed document.
 */
function renderPolicy(source: string): ReactNode[] {
  const blocks = source.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: ReactNode[] = [];
  blocks.forEach((block, bi) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => l.startsWith("- "));
    if (bullets.length > 0) {
      out.push(
        <ul key={`ul-${bi}`} className="mb-3 list-disc space-y-2 pl-6 text-sm leading-relaxed text-muted-foreground">
          {bullets.map((l, li) => (
            <li key={li}>{renderInline(l.slice(2))}</li>
          ))}
        </ul>,
      );
      return;
    }
    lines.forEach((line, li) => {
      const key = `${bi}-${li}`;
      if (line.startsWith("### ")) {
        const heading = line.slice(4);
        out.push(
          <h2 key={key} id={`section-${heading.split(".")[0]}`} className="mt-10 mb-3 scroll-mt-24 font-display text-xl">
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
          <p key={key} className="mb-3 text-sm leading-relaxed text-muted-foreground">
            {renderInline(line)}
          </p>,
        );
      }
    });
  });
  return out;
}

export default function Privacy() {
  return (
    <section className="container-wide section-y">
      <div className="mx-auto max-w-3xl">
        <span className="eyebrow">Legal</span>
        <h1 className="display mt-3 text-3xl lg:text-4xl">Privacy Policy</h1>
        <div className="mt-6">{renderPolicy(privacySource)}</div>
      </div>
    </section>
  );
}
