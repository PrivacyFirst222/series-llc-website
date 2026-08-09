/**
 * Every timestamp a client sees is Florida time with the zone stated. A client
 * may be reading from anywhere, and the server that wrote the record runs in
 * UTC, so the zone is never left to the machine doing the rendering.
 */
const ZONE = "America/New_York";

/** "August 9, 2026 at 4:12 PM ET" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    timeZone: ZONE,
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} at ${time} ET`;
}

/** "August 9, 2026" — for things that are dated but not timed. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** How the agreement is taxed, in the words a client would use. */
export function taxationLabel(version: string): string {
  if (version === "s" || version === "member-s") return "S Corporation";
  if (version === "single") return "Single-Member";
  return "Partnership";
}
