/**
 * Client-facing timestamps are Florida time with the zone stated. Vercel runs
 * functions in UTC, so the zone is always given explicitly rather than
 * inherited from the host clock.
 */
const ZONE = "America/New_York";

/** "August 9, 2026 at 4:12 PM ET" — the page, the PDF footer, email. */
export function stampEastern(d: Date = new Date()): string {
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

/** "2026-08-09-1612ET" — sortable, filename-safe, still readable. */
export function stampForFilename(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  // en-CA renders midnight as hour 24; a filename should say 00.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}-${hour}${get("minute")}ET`;
}

/** How the agreement is taxed, in the words a client would use. */
export function taxationLabel(version: string): string {
  if (version === "s" || version === "member-s") return "S Corporation";
  if (version === "single") return "Single-Member";
  return "Partnership";
}
