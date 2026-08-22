/**
 * Florida's distinguishability rules, as published in the Division of
 * Corporations FAQ ("What factors are not distinguishable for Florida
 * business entity names?", read 22 Aug 2026). Two names are the SAME name if
 * they differ only by:
 *   1. suffixes/designators (Inc., LLC, Co., Ltd., ...)
 *   2. definite and indefinite articles (the, a, an)
 *   3. "and" vs "&"
 *   4. singular / plural / possessive forms
 *   5. punctuation and symbols
 * normalizeEntityName() reduces a name to the key those rules leave behind;
 * two names conflict when their keys match. sunbizSearchUrl() deep-links the
 * public search, pre-run, so the human confirms against the live record.
 */

const SUFFIXES = new Set([
  "LLC", "L.L.C", "PLLC", "P.L.L.C", "INC", "INCORPORATED", "CORP",
  "CORPORATION", "CO", "COMPANY", "LTD", "LIMITED", "LP", "L.P", "LLP",
  "LLLP", "PA", "P.A", "PL", "P.L", "PC", "CHARTERED",
]);
const ARTICLES = new Set(["THE", "A", "AN"]);

export function normalizeEntityName(name: string): string {
  const tokens = name
    .toUpperCase()
    .replace(/&/g, " AND ")
    // rule 5: punctuation and symbols are nothing — but an apostrophe merges
    // ("Tallahassee's" is TALLAHASSEES, not TALLAHASSEE + stray S), and the
    // plural/possessive fold below then strips the trailing S
    .replace(/['\u2019]/g, "")
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    // rules 1-3: drop suffixes, articles, and AND wherever they appear
    .filter((t) => !SUFFIXES.has(t) && !ARTICLES.has(t) && t !== "AND")
    // rule 4: possessive already lost its apostrophe above; fold plural/
    // possessive tails onto the stem (SPORTS/SPORT'S -> SPORT)
    .map((t) => (t.length > 3 && t.endsWith("S") ? t.slice(0, -1) : t));
  return tokens.join(" ");
}

/** Deep link to the public Sunbiz entity-name search, pre-run for this name.
 *  The client's own browser loads it, so the state's bot protection — which
 *  blocks automated lookups — never enters the picture. */
export function sunbizSearchUrl(name: string): string {
  const term = normalizeEntityName(name) || name.trim();
  return (
    "https://search.sunbiz.org/Inquiry/CorporationSearch/SearchResults?InquiryType=EntityName&SearchTerm=" +
    encodeURIComponent(term)
  );
}

/** Human-readable examples of names Florida would treat as THIS name, for the
 *  "watch for these in the results" hint. */
export function similarityExamples(name: string): string[] {
  const base = name.trim();
  if (!base) return [];
  const out: string[] = [];
  out.push(`${base}, Inc.`);
  out.push(`The ${base}`);
  if (/\band\b/i.test(base)) out.push(base.replace(/\band\b/i, "&"));
  else if (/&/.test(base)) out.push(base.replace(/&/g, "and"));
  const words = base.split(/\s+/);
  const last = words[words.length - 1];
  if (last && last.length > 3) {
    const variant = last.endsWith("s") ? last.slice(0, -1) : last + "s";
    out.push([...words.slice(0, -1), variant].join(" "));
  }
  return out.slice(0, 3);
}
