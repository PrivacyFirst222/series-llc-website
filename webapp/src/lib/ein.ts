/** IRS "Valid EINs" prefixes (irs.gov, How EINs are Assigned and Valid EIN
 *  Prefixes), read in the browser 6 Sep 2026. */
export const VALID_EIN_PREFIXES = new Set(
  ("10 12 60 67 50 53 01 02 03 04 05 06 11 13 14 16 21 22 23 25 34 51 52 54 55 56 57 58 59 65 " +
   "30 32 35 36 37 38 61 15 24 40 44 94 95 80 90 33 39 41 42 43 46 48 62 63 64 66 68 71 72 73 74 75 76 77 85 86 87 88 91 92 93 98 99 " +
   "20 26 27 45 47 81 82 83 84 31").split(" "),
);

/** Nine digits with a valid prefix; dashes and spaces are ignored. */
export function einDigits(raw: string | undefined | null): string {
  return (raw ?? "").replace(/[\s-]/g, "");
}
export function isValidEin(raw: string | undefined | null): boolean {
  const d = einDigits(raw);
  return /^\d{9}$/.test(d) && VALID_EIN_PREFIXES.has(d.slice(0, 2));
}
export const fmtEinDisplay = (digits: string): string => (/^\d{9}$/.test(digits) ? `${digits.slice(0, 2)}-${digits.slice(2)}` : digits);
