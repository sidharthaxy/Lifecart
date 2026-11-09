/**
 * Billing periods: a bill's current period runs from `start` to `end` (the due date).
 * Paying rolls it forward by the same length. When start and end fall on the same day of the month
 * (9 Nov -> 9 Dec, or 15 Jan -> 15 Apr), the period is a whole number of calendar months, so it rolls by
 * months and the due day never drifts. Otherwise it rolls by days (e.g. every 14 or 28 days).
 * Shared by the server and the bill form (no server-only imports).
 */
const DAY = 86_400_000;

export const MAX_PERIOD_DAYS = 400; // up to a yearly bill

export function monthsBetween(start: Date, end: Date): number | null {
  if (start.getDate() !== end.getDate()) return null;
  const m = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  return m >= 1 ? m : null;
}

export const periodDays = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / DAY);

/** "1 month", "3 months", "1 year", "2 weeks", "10 days". */
export function periodLabel(start: Date | null, end: Date): string {
  if (!start) return "monthly";
  const months = monthsBetween(start, end);
  if (months === 12) return "1 year";
  if (months) return months === 1 ? "1 month" : `${months} months`;
  const days = periodDays(start, end);
  if (days > 0 && days % 7 === 0) return days === 7 ? "1 week" : `${days / 7} weeks`;
  return days === 1 ? "1 day" : `${days} days`;
}

/** The next period after paying: starts where this one ended, same length. */
export function nextPeriod(start: Date | null, end: Date): { start: Date; end: Date } {
  const months = start ? monthsBetween(start, end) : 1;
  if (months) {
    const next = new Date(end);
    next.setMonth(next.getMonth() + months);
    return { start: new Date(end), end: next };
  }
  return { start: new Date(end), end: new Date(end.getTime() + periodDays(start!, end) * DAY) };
}

/** Check a period the user typed. Returns an error message, or null when it's fine. */
export function periodError(start: Date, end: Date): string | null {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "Pick the start and end dates of the current period.";
  const days = periodDays(start, end);
  if (days < 1) return "The period has to end after it starts.";
  if (days > MAX_PERIOD_DAYS) return "A billing period can be at most about a year.";
  return null;
}
