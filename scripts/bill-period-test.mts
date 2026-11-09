// Dev tool: billing-period maths (no database). Usage: npx tsx scripts/bill-period-test.mts
import { nextPeriod, periodError, periodLabel } from "../src/lib/bill-period";

const ok = (cond: boolean, what: string) => console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
const d = (s: string) => new Date(`${s}T12:00:00Z`);
const day = (x: Date) => x.toISOString().slice(0, 10);

ok(periodLabel(d("2026-11-09"), d("2026-12-09")) === "1 month", "9 Nov -> 9 Dec is 1 month");
ok(periodLabel(d("2026-11-09"), d("2027-02-09")) === "3 months", "9 Nov -> 9 Feb is 3 months");
ok(periodLabel(d("2026-11-09"), d("2027-11-09")) === "1 year", "a year");
ok(periodLabel(d("2026-11-09"), d("2026-11-23")) === "2 weeks", "14 days is 2 weeks");
ok(periodLabel(d("2026-11-09"), d("2026-11-19")) === "10 days", "10 days");
ok(periodLabel(null, d("2026-12-09")) === "monthly", "older bills without a start are monthly");

let n = nextPeriod(d("2026-11-09"), d("2026-12-09"));
ok(day(n.start) === "2026-12-09" && day(n.end) === "2027-01-09", `monthly rolls to 9 Dec -> 9 Jan (${day(n.start)} -> ${day(n.end)})`);
n = nextPeriod(d("2026-11-09"), d("2026-11-23"));
ok(day(n.start) === "2026-11-23" && day(n.end) === "2026-12-07", `2-week rolls to 23 Nov -> 7 Dec (${day(n.end)})`);
n = nextPeriod(d("2026-11-15"), d("2027-02-15"));
ok(day(n.end) === "2027-05-15", `quarterly stays on the 15th (${day(n.end)})`);
n = nextPeriod(null, d("2026-12-09"));
ok(day(n.start) === "2026-12-09" && day(n.end) === "2027-01-09", "older bills roll monthly");

ok(periodError(d("2026-11-09"), d("2026-11-09")) !== null, "same start and end is refused");
ok(periodError(d("2026-11-09"), d("2026-11-01")) !== null, "end before start is refused");
ok(periodError(d("2026-11-09"), d("2028-11-09")) !== null, "longer than about a year is refused");
ok(periodError(d("2026-11-09"), d("2026-12-09")) === null, "a normal month is fine");
