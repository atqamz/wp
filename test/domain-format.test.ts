import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDate, formatDay, formatLong, formatMoney, formatMonths, formatStamp } from "../src/ui/format.ts";

test("money is whole rupiah with dot grouping", () => {
  assert.equal(formatMoney(600_000).replace(/\s/g, " "), "Rp 600.000");
  assert.equal(formatMoney(0).replace(/\s/g, " "), "Rp 0");
  assert.equal(formatMoney(58_500_000).replace(/\s/g, " "), "Rp 58.500.000");
});

test("dates read day, month name, year and ignore the machine zone", () => {
  assert.equal(formatDate("2026-10-06"), "6 Oct 2026");
  assert.equal(formatDate("2027-01-01"), "1 Jan 2027");
  assert.match(formatDay("2026-10-06"), /^Tue,? 6 Oct$/);
});

test("a day in another year than today carries its year", () => {
  assert.match(formatDay("2027-10-30", "2026-10-07"), /^Sat,? 30 Oct 2027$/);
  assert.match(formatDay("2026-10-30", "2026-10-07"), /^Fri,? 30 Oct$/);
});

test("long dates and month ranges ignore the machine zone", () => {
  assert.match(formatLong("2027-11-13"), /^Saturday,? 13 November 2027$/);
  assert.match(formatMonths("2026-06-01", "2026-09-30"), /^Jun\s?[–-]\s?Sept? 2026$/);
  assert.match(formatMonths("2027-01-01", "2027-01-31"), /^Jan 2027$/);
  assert.match(formatMonths("2026-10-01", "2027-01-31"), /^Oct 2026\s?[–-]\s?Jan 2027$/);
});

test("an instant is shown in the saved zone and falls back to the default zone for a bad one", () => {
  assert.match(formatStamp("2026-10-06T14:40:00Z", "Asia/Jakarta"), /^Tue,? 6 Oct,? 21[.:]40$/);
  assert.match(formatStamp("2026-10-06T14:40:00Z", "UTC"), /^Tue,? 6 Oct,? 14[.:]40$/);
  assert.equal(formatStamp("2026-10-06T14:40:00Z", "Mars/Olympus"), formatStamp("2026-10-06T14:40:00Z", "Asia/Jakarta"));
});
