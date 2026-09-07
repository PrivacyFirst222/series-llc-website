/** A person's name must carry a first and a last name everywhere one is typed
 *  (Adam, 7 Sep 2026: "Make every place where a name is entered require a
 *  first and last name"). For a single full-name box that means at least two
 *  words of letters; "Casey Member, Jr." passes, "Adam" does not. */
export const FIRST_AND_LAST = "Enter first and last name.";

export function hasFirstAndLast(name: string | undefined | null): boolean {
  const words = (name ?? "").trim().split(/\s+/).filter((w) => /\p{L}/u.test(w));
  return words.length >= 2;
}
