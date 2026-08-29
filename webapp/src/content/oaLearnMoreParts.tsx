// The two tiny presentational components used by the LEARN_MORE content —
// apart from the constants file so each file is either components-only or
// component-free (react-refresh) — split 29 Aug 2026.
import type { ReactNode } from "react";

export const P = ({ children }: { children: ReactNode }) => (
  <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
);

export const Choice = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="rounded-lg border border-border bg-secondary/30 p-3">
    <p className="text-sm font-medium text-foreground">{label}</p>
    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{children}</p>
  </div>
);
