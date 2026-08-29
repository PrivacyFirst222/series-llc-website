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
export function serviceLabel(s: AdminServiceOrder, llcName: string, long = false): string {
  const short = (name?: string) => {
    if (!name) return "";
    const rest = name.startsWith(llcName) ? name.slice(llcName.length) : name;
    return rest.replace(/^[\s,–—-]+/, "").trim() || name;
  };
  if (s.type === "ein") return s.details.target === "series" ? `EIN — ${short(s.details.seriesName)}` : "EIN";
  if (s.type === "s-election") return long ? "S Election (2553)" : "S Election";
  return `${short(s.details.seriesName) || "Series"} Designation`;
}
export function summaryOf(o: { type: string; details: AdminServiceOrder["details"]; llc_name: string }): string {
  if (o.type === "series") return o.details.seriesName ?? o.llc_name;
  if (o.type === "s-election") return `S Election (2553) — ${o.llc_name}`;
  return `EIN — ${o.details.target === "series" ? o.details.seriesName ?? "series" : o.llc_name}`;
}
