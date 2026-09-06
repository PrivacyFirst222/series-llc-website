// Form 2553 timing — designed and unit-tested by Adam in a separate chat,
// 6 Sep 2026; ported here verbatim in logic (TypeScript, module exports).
// The rule is the IRS's, from the Instructions for Form 2553, "When To Make
// the Election": "the 2-month period begins on the day of the month the tax
// year begins and ends with the close of the day before the numerically
// corresponding day of the second calendar month following that month. If
// there is no corresponding day, use the close of the last day of the
// calendar month" — then 15 days. Example 1: January 7 → March 21.
//
// All date math is on YYYY-MM-DD strings. "today" is passed in as an
// Eastern Time date string — never the server clock directly (Vercel runs
// UTC).

export const DEFAULT_MIN_DAYS = 5;

function parseISODate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new Error(`Expected YYYY-MM-DD, got: ${s}`);
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    throw new Error(`Invalid calendar date: ${s}`);
  }
  return dt;
}
function toISO(dt: Date): string { return dt.toISOString().slice(0, 10); }
function toDisplay(iso: string): string { const [y, m, d] = iso.split("-"); return `${m}/${d}/${y}`; }
function addDays(dt: Date, n: number): Date { return new Date(dt.getTime() + n * 86400000); }
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86400000); }
function lastDayOfMonth(y: number, mZeroBased: number): Date { return new Date(Date.UTC(y, mZeroBased + 1, 0)); }

export function form2553Deadline(effectiveDateISO: string): string {
  const eff = parseISODate(effectiveDateISO);
  const y = eff.getUTCFullYear(), m = eff.getUTCMonth(), d = eff.getUTCDate();
  const corresponding = new Date(Date.UTC(y, m + 2, d));
  const noCorrespondingDay = corresponding.getUTCMonth() !== ((m + 2) % 12);
  const endOfTwoMonths = noCorrespondingDay ? lastDayOfMonth(y, m + 2) : addDays(corresponding, -1);
  return toISO(addDays(endOfTwoMonths, 15));
}

function businessDaysBetween(a: Date, b: Date): number {
  let count = 0;
  for (let cur = addDays(a, 1); cur.getTime() <= b.getTime(); cur = addDays(cur, 1)) {
    const dow = cur.getUTCDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

export type TimingStatus = "invalid" | "late" | "insufficient" | "ok";

export interface TimingResult {
  status: TimingStatus;
  deadline: string | null;
  deadlineDisplay: string | null;
  daysRemaining: number | null;
  message: string;
  acknowledgment: string | null;
}

export function evaluate2553Timing(opts: {
  formationDate?: string;
  effectiveDate?: string;
  today: string;
  minDays?: number;
  businessDays?: boolean;
}): TimingResult {
  const { formationDate, today, minDays = DEFAULT_MIN_DAYS, businessDays = false } = opts;
  const effectiveDate = opts.effectiveDate || formationDate;
  if (!effectiveDate) throw new Error("effectiveDate or formationDate is required");
  if (!today) throw new Error("today is required");
  const eff = parseISODate(effectiveDate);
  const now = parseISODate(today);
  if (formationDate && eff.getTime() < parseISODate(formationDate).getTime()) {
    return { status: "invalid", deadline: null, deadlineDisplay: null, daysRemaining: null,
      message: "The election effective date cannot be earlier than the date on your filed Articles of Organization.",
      acknowledgment: null };
  }
  const deadlineISO = form2553Deadline(effectiveDate);
  const deadline = parseISODate(deadlineISO);
  const deadlineDisplay = toDisplay(deadlineISO);
  const calendarDaysRemaining = daysBetween(now, deadline);
  const runway = businessDays ? businessDaysBetween(now, deadline) : calendarDaysRemaining;
  if (calendarDaysRemaining < 0) {
    return { status: "late", deadline: deadlineISO, deadlineDisplay, daysRemaining: calendarDaysRemaining,
      message: `Your Form 2553 filing deadline was ${deadlineDisplay}. We do not prepare late S-election packages. A late election requires relief under Rev. Proc. 2013-30 — please consult a tax professional.`,
      acknowledgment: null };
  }
  if (runway < minDays) {
    return { status: "insufficient", deadline: deadlineISO, deadlineDisplay, daysRemaining: calendarDaysRemaining,
      message: `Your Form 2553 filing deadline is ${deadlineDisplay}. That leaves insufficient time for us to prepare your package and for you to sign and file it. We do not prepare packages inside this window.`,
      acknowledgment: null };
  }
  return { status: "ok", deadline: deadlineISO, deadlineDisplay, daysRemaining: calendarDaysRemaining,
    message: `Your Form 2553 must be filed (postmarked or faxed) by ${deadlineDisplay}.`,
    acknowledgment: `I understand that Form 2553 must be filed (postmarked or faxed) by ${deadlineDisplay}, and that MyFloridaSeriesLLC prepares the form but does not file it for me.` };
}

export const ORDER_TIME_ACKNOWLEDGMENT =
  "I understand that MyFloridaSeriesLLC prepares Form 2553 but does not file it, that I am responsible " +
  "for filing it within 2 months and 15 days after my LLC's effective date, and that no refund is provided " +
  "if I miss that deadline. MyFloridaSeriesLLC does not prepare late-election packages.";

/** Adam's eligibility acknowledgment on the S election form (6 Sep 2026).
 *  The tests are the IRS's ("Who May Elect", Instructions for Form 2553):
 *  no more than 100 shareholders; only individuals, estates, certain exempt
 *  organizations and certain trusts; no nonresident alien shareholders. */
export const ELIGIBILITY_ACKNOWLEDGMENT =
  "I understand that (I) only U.S. residents can be S corporation shareholders, and an election with a " +
  "nonresident alien shareholder will be rejected; (II) LLCs and most irrevocable trusts cannot be S " +
  "corporation shareholders; (III) an S corporation cannot have more than 100 shareholders; and (IV) if I " +
  "list an ineligible shareholder and the election is rejected — or mistakenly approved — MyFloridaSeriesLLC " +
  "is not liable and no refund will be given.";
