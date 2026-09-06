/** The optional dates are typed, not picked: an iPad's native date box fills
 *  in today's date the moment it is tapped, and blank here has a meaning —
 *  "use the date on your filed Articles" (Adam, 6 Sep 2026). Typed as
 *  MM/DD/YYYY (or M/D/YYYY); stored as YYYY-MM-DD. */
export function typedDateToIso(typed: string): string | null {
  const t = typed.trim();
  if (t === "") return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : us ? [us[3], us[1], us[2]] : [null, null, null];
  if (!y || !m || !d) return null;
  const mm = m.padStart(2, "0"), dd = d.padStart(2, "0");
  const probe = new Date(`${y}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(probe.getTime()) || probe.toISOString().slice(0, 10) !== `${y}-${mm}-${dd}`) return null;
  return `${y}-${mm}-${dd}`;
}
export function isoToTypedDate(iso: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : (iso ?? "");
}
