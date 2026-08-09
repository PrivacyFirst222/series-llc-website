/**
 * Ownership can be expressed as percentages or as fractions, and the totals
 * have to be exact — three owners at 1/3 each must sum to exactly one, which
 * floating-point percentages can never do (33.33 × 3 = 99.99).
 *
 * Percentages are compared in hundredths as integers; fractions are compared
 * over a common denominator. Shared by the questionnaire and the server so
 * both agree on what "adds up" means.
 */

export type OwnershipMode = "percent" | "fraction";

export interface OwnershipShare {
  /** Percent mode: 0–100, up to two decimals. */
  percentage?: number;
  /** Fraction mode: numerator / denominator, both positive integers. */
  numerator?: number;
  denominator?: number;
}

/** Greatest common divisor, for reducing fractions to lowest terms. */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function reduceFraction(numerator: number, denominator: number): { numerator: number; denominator: number } {
  if (denominator === 0) return { numerator, denominator };
  const d = gcd(numerator, denominator) || 1;
  return { numerator: numerator / d, denominator: denominator / d };
}

/** True when the shares total exactly 100% (or exactly one whole). */
export function sharesAreComplete(mode: OwnershipMode, shares: OwnershipShare[]): boolean {
  if (shares.length === 0) return false;
  if (mode === "percent") {
    // Work in hundredths of a percent so 33.33 + 33.33 + 33.34 is exact.
    const total = shares.reduce((acc, s) => acc + Math.round((s.percentage ?? 0) * 100), 0);
    return total === 10_000;
  }
  // Sum n/d over a common denominator using integers only.
  let num = 0;
  let den = 1;
  for (const s of shares) {
    const n = s.numerator ?? 0;
    const d = s.denominator ?? 0;
    if (d <= 0 || n < 0) return false;
    num = num * d + n * den;
    den = den * d;
  }
  return num === den;
}

/** What a share reads as in the agreement: "40%" or "1/3". */
export function shareLabel(mode: OwnershipMode, share: OwnershipShare): string {
  if (mode === "percent") {
    const pct = share.percentage ?? 0;
    return `${Number.isInteger(pct) ? pct : Number(pct.toFixed(2))}%`;
  }
  const { numerator, denominator } = reduceFraction(share.numerator ?? 0, share.denominator ?? 1);
  return `${numerator}/${denominator}`;
}

/** Numeric weight (0–100) for any arithmetic the engine still needs. */
export function shareValue(mode: OwnershipMode, share: OwnershipShare): number {
  if (mode === "percent") return share.percentage ?? 0;
  const d = share.denominator ?? 0;
  return d > 0 ? ((share.numerator ?? 0) / d) * 100 : 0;
}

/** True when 100 divides evenly among this many owners. */
export function splitsEvenlyAsPercent(count: number): boolean {
  return count > 0 && Number.isInteger((100 * 100) / count) && (10_000 % count === 0);
}

/** Equal shares for `count` owners, in the requested notation. */
export function equalShares(mode: OwnershipMode, count: number): OwnershipShare[] {
  if (count <= 0) return [];
  if (mode === "fraction") {
    return Array.from({ length: count }, () => ({ numerator: 1, denominator: count }));
  }
  // Distribute hundredths so the total is exactly 100 even when it doesn't
  // divide evenly — the remainder lands on the first owners.
  const base = Math.floor(10_000 / count);
  let remainder = 10_000 - base * count;
  return Array.from({ length: count }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return { percentage: (base + extra) / 100 };
  });
}
