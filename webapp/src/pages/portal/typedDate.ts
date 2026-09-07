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

/** MM/DD/YYYY as typed, the slashes added when missing (Adam, 6 Sep 2026:
 *  "The date field should add the '/' symbols if missing"). Bare digits
 *  09012026 become 09/01/2026 as they arrive; slashes the client types are
 *  kept, so 9/1/2026 stays 9/1/2026; a slash is never re-added after a
 *  backspace removes it; letters are ignored. */
export function formatTypedDate(raw: string): string {
  if (raw.includes("-")) return raw; // a stored YYYY-MM-DD pasted in — leave it to the parser
  const groups = ["", "", ""];
  let g = 0;
  for (const ch of raw) {
    if (/\d/.test(ch)) {
      if (g < 2 && groups[g].length === 2) g++;
      if (g === 2 && groups[2].length === 4) continue;
      groups[g] += ch;
    } else if (ch === "/" && g < 2 && groups[g] !== "") {
      g++;
    }
  }
  return groups.slice(0, g + 1).join("/");
}

/** (305) 555-0100 as typed; the stored value is the ten digits. The box's
 *  hint is the bare shape "(   )    -    " — no letters (Adam, 6 Sep 2026). */
export const formatPhone = (value: string): string => {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};
