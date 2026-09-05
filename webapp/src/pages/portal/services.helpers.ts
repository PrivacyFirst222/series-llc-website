// Service-order display and "does the client owe us something" rules —
// apart from ServicesCard.tsx so that file exports only components (fast
// refresh), and so the dashboard's red outlines and action-needed toast use
// the same rule as the card's own rows (Adam, 5 Sep 2026).
import type { ServiceOrder } from "./ServicesCard";

export function summaryOf(o: ServiceOrder): string {
  if (o.type === "series") return `Protected Series Designation — ${o.details.seriesName ?? o.llc_name}`;
  if (o.type === "s-election") return `S Corporation Election Package — ${o.llc_name}`;
  if (o.type === "certificate-of-status") return `Certificate of Status — ${o.llc_name}`;
  if (o.type === "certified-copy") return `Certified Copy of the Articles — ${o.llc_name}`;
  return `Federal EIN — ${o.details.target === "series" ? o.details.seriesName ?? "series" : o.llc_name}`;
}

/** An order the CLIENT must act on now (Adam, 5 Sep 2026): it is waiting for
 *  their details, and the detail form is open to them — an EIN or S election
 *  on a company not yet formed is not, because that button opens the
 *  "formed first" explanation instead of the form. The dashboard's red
 *  outlines and its action-needed toast both use this rule. */
export function clientMustAct(o: ServiceOrder, llcFormed: boolean): boolean {
  if (o.status !== "awaiting_info") return false;
  if ((o.type === "ein" || o.type === "s-election") && !llcFormed) return false;
  return true;
}

/** What the toast tells the client to do for one such order. */
export function clientActionLabel(o: ServiceOrder): string {
  return `Provide details for the ${summaryOf(o)}`;
}

