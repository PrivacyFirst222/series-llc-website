/** Calendar dates are YYYY-MM-DD, never instants. Only timestamps use a zone. */
export const EASTERN_ZONE = "America/New_York";
export function easternToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: EASTERN_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function validCalendarDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso.slice(0, 4) === "0000") return false;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}
export function shiftCalendarDay(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function formatCalendarDate(iso: string): string {
  if (!validCalendarDate(iso)) return "";
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {timeZone:"UTC", year:"numeric",month:"long",day:"numeric"});
}
function weekday(iso: string): number { return new Date(`${iso}T12:00:00Z`).getUTCDay(); }
function nthMonday(year: string, month: string, n: number): string {
  const first = `${year}-${month}-01`;
  return shiftCalendarDay(first, (8 - weekday(first)) % 7 + 7 * (n - 1));
}
/** Federal Reserve BANKS schedule, not Board/federal-office closures.
 * Saturday holidays do not close the preceding Friday; Sunday is observed Monday.
 * Source: https://www.federalreserve.gov/aboutthefed/k8.htm (2026–2030). */
export function isBankingDay(iso: string): boolean {
  if (!validCalendarDate(iso) || [0, 6].includes(weekday(iso))) return false;
  const y = iso.slice(0, 4);
  const fixed = ["01-01","06-19","07-04","11-11","12-25"].map(md => `${y}-${md}`);
  const memorial = shiftCalendarDay(`${y}-05-31`, -((weekday(`${y}-05-31`) + 6) % 7));
  const thanksgiving = shiftCalendarDay(`${y}-11-01`, (11 - weekday(`${y}-11-01`)) % 7 + 21);
  const holidays = [...fixed.flatMap(d => weekday(d) === 0 ? [d,shiftCalendarDay(d,1)] : [d]), nthMonday(y,"01",3),nthMonday(y,"02",3),memorial,nthMonday(y,"09",1),nthMonday(y,"10",2),thanksgiving];
  return !holidays.includes(iso);
}
export function shiftBankingDays(iso: string, count: number): string {
  let d = iso;
  for (let moved = 0; moved < Math.abs(count);) {
    d = shiftCalendarDay(d, count < 0 ? -1 : 1);
    if (isBankingDay(d)) moved++;
  }
  return d;
}
export function anticipatedFilingDay(now = new Date()): string { return shiftBankingDays(easternToday(now), 1); }
export function effectiveDateRange(filingDay: string): { earliest: string; latest: string } {
  if (!validCalendarDate(filingDay)) throw new Error("Invalid filing date.");
  return {earliest:shiftBankingDays(filingDay,-5),latest:shiftCalendarDay(filingDay,90)};
}
export function closestEffectiveDate(requested: string, filingDay: string): string {
  if (!validCalendarDate(requested)) throw new Error("Invalid requested effective date.");
  const {earliest,latest}=effectiveDateRange(filingDay);
  return requested < earliest ? earliest : requested > latest ? latest : requested;
}
export const EFFECTIVE_DATE_NOTICE = "We typically submit your filing within one business day after receiving your completed order. The effective-date range shown is based on that anticipated filing date. If your requested effective date falls outside the permitted range when we file, we will use the closest permitted date to your requested date. We cannot guarantee an exact effective date.";
