/** Social Security number checks shared by every box that takes one, so the
 *  box itself can say what is wrong the moment it is typed (Adam, 7 Sep
 *  2026: "The field should give an immediate error message when the bad
 *  input is entered. Not just give an error at the end").
 *
 *  The Social Security Administration never issues area numbers 000, 666 or
 *  900-999 (ssa.gov, "Social Security Number Randomization": "excluding area
 *  numbers 000, 666 and 900-999") — the same rule the server applies. */
export const SSN_AREA_MESSAGE = "That is not a valid Social Security number — check the first three digits.";
export const SSN_LENGTH_MESSAGE = "A Social Security number has 9 digits.";

export const ssnDigits = (value: string): string => value.replace(/\D/g, "");

/** What is wrong while the client is still typing: a bad area number shows
 *  as soon as three digits are in; too many digits shows at the tenth. */
export function ssnTypingProblem(value: string): string {
  const d = ssnDigits(value);
  if (d.length >= 3 && /^(000|666|9\d\d)/.test(d)) return SSN_AREA_MESSAGE;
  if (d.length > 9) return SSN_LENGTH_MESSAGE;
  return "";
}

/** What is wrong once the client leaves the box: also a short number. A
 *  blank box is not a problem here — whether it is required is decided by
 *  the form. */
export function ssnProblem(value: string): string {
  const d = ssnDigits(value);
  if (d === "") return "";
  return ssnTypingProblem(value) || (d.length !== 9 ? SSN_LENGTH_MESSAGE : "");
}

/** The EIN form's box takes an SSN or an ITIN. An ITIN is "a 9-digit number
 *  the IRS issues" (irs.gov, Individual taxpayer identification number); no
 *  opened source gives its area numbers, so only the length is checked. */
export function tinProblem(value: string, leaving: boolean): string {
  const d = ssnDigits(value);
  if (d.length > 9) return "An SSN or ITIN has 9 digits.";
  if (leaving && d !== "" && d.length !== 9) return "An SSN or ITIN has 9 digits.";
  return "";
}
