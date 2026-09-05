// Service-order display helpers — apart from the section component so that
// file exports only components (react-refresh) — split 29 Aug 2026.
import type { AdminServiceOrder } from "./ServiceOrdersSection";

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const STATUS_STYLE: Record<string, string> = {
  fulfilled: "bg-trust/10 text-trust",
  in_progress: "bg-amber-100 text-amber-900",
  awaiting_info: "bg-secondary text-muted-foreground",
  pending_payment: "bg-secondary text-muted-foreground",
};
export const serviceIsOpen = (s: AdminServiceOrder) => s.status === "awaiting_info" || s.status === "in_progress";

/** A service order bought AFTER the company was formed — a new order from an
 *  existing client (Adam, 5 Sep 2026). Intake add-ons (EIN, S election,
 *  certificates chosen on the wizard) are created at payment, before
 *  formation, so they are formation work, not new work: a formed company
 *  still owing them stays in column two. */
export const boughtAfterFormation = (s: AdminServiceOrder, formedAt: string | null) =>
  !!formedAt && serviceIsOpen(s) && new Date(s.created_at).getTime() > new Date(formedAt).getTime();
export function serviceLabel(s: AdminServiceOrder, llcName: string, long = false): string {
  const short = (name?: string) => {
    if (!name) return "";
    const rest = name.startsWith(llcName) ? name.slice(llcName.length) : name;
    return rest.replace(/^[\s,–—-]+/, "").trim() || name;
  };
  if (s.type === "ein") return s.details.target === "series" ? `EIN — ${short(s.details.seriesName)}` : "EIN";
  if (s.type === "s-election") return long ? "S Election (2553)" : "S Election";
  if (s.type === "certificate-of-status") return long ? "Certificate of Status" : "Cert. of Status";
  if (s.type === "certified-copy") return long ? "Certified Copy of the Articles" : "Certified Copy";
  return `${short(s.details.seriesName) || "Series"} Designation`;
}
export function summaryOf(o: { type: string; details: AdminServiceOrder["details"]; llc_name: string }): string {
  if (o.type === "series") return o.details.seriesName ?? o.llc_name;
  if (o.type === "s-election") return `S Election (2553) — ${o.llc_name}`;
  if (o.type === "certificate-of-status") return `Certificate of Status — ${o.llc_name}`;
  if (o.type === "certified-copy") return `Certified Copy — ${o.llc_name}`;
  return `EIN — ${o.details.target === "series" ? o.details.seriesName ?? "series" : o.llc_name}`;
}
