import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, daysUntil, todayIn } from "../src/domain/dates.ts";
import { headcount } from "../src/domain/guests.ts";
import { parseRupiah } from "../src/domain/money.ts";
import { bySort, sortBefore } from "../src/domain/order.ts";
import { normalizePhone, whatsappUrl } from "../src/domain/phone.ts";
import { DEFAULT_ZONE, readSettings } from "../src/domain/settings.ts";
import { item } from "./domain-rows.ts";

test("phone: 08 and +62 forms normalise to E.164", () => {
  for (const input of ["08123456789", "0812-3456-789", "+62 812 3456 789", "62812 3456 789", "0062 812 3456 789", "+62 0812 3456 789", "(0812) 3456.789"]) {
    assert.equal(normalizePhone(input), "+628123456789", input);
  }
});

test("phone: landline and foreign numbers keep their digits", () => {
  assert.equal(normalizePhone("021 555 1234"), "+62215551234");
  assert.equal(normalizePhone("+65 9123 4567"), "+6591234567");
});

test("phone: junk, short and bare numbers are refused", () => {
  for (const input of ["", "abc", "0812", "8123456789", "+0123456789", "+62 812 abc", "08123456789012345678"]) {
    assert.equal(normalizePhone(input), null, input);
  }
});

test("phone: wa.me link has no plus", () => {
  assert.equal(whatsappUrl("+628123456789"), "https://wa.me/628123456789");
});

test("rupiah input drops separators and refuses the rest", () => {
  assert.equal(parseRupiah("5.000.000"), 5_000_000);
  assert.equal(parseRupiah("Rp 1,500,000"), 1_500_000);
  assert.equal(parseRupiah("0"), 0);
  assert.equal(parseRupiah(""), null);
  assert.equal(parseRupiah("12a"), null);
  assert.equal(parseRupiah("-5"), null);
});

test("sorting follows the fractional sort, then created_at, then id", () => {
  const row = (id: string, sort: number, created_at = "2026-10-01T00:00:00Z") => ({ id, sort, created_at });
  const sorted = [row("c", 2), row("b", 1.5), row("a2", 1, "2026-10-02T00:00:00Z"), row("a1", 1), row("a0", 1)].sort(bySort);
  assert.deepEqual(
    sorted.map((r) => r.id),
    ["a0", "a1", "a2", "b", "c"],
  );
});

test("sortBefore goes ahead of every row", () => {
  assert.equal(sortBefore([]), 0);
  assert.equal(sortBefore([item({ sort: 0 })]), -1);
  assert.equal(sortBefore([item({ sort: 5 }), item({ sort: 3 })]), 0);
  assert.equal(sortBefore([item({ sort: -2.5 }), item({ sort: 3 })]), -3.5);
});

test("countdown counts calendar days, negative after the day", () => {
  assert.equal(daysUntil("2027-10-06", "2026-10-06"), 365);
  assert.equal(daysUntil("2026-10-06", "2026-10-06"), 0);
  assert.equal(daysUntil("2026-10-01", "2026-10-06"), -5);
  assert.equal(daysUntil("2028-03-01", "2028-02-27"), 3);
  assert.equal(daysUntil(null, "2026-10-06"), null);
  assert.equal(daysBetween("2026-10-06", "2026-10-07"), 1);
});

test("addDays crosses month and year ends", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-10-06", -6), "2026-09-30");
});

test("today follows the project time zone, not the machine", () => {
  const now = new Date("2026-10-06T20:00:00Z");
  assert.equal(todayIn(now, "Asia/Jakarta"), "2026-10-07");
  assert.equal(todayIn(now, "UTC"), "2026-10-06");
  assert.equal(todayIn(now, "America/Los_Angeles"), "2026-10-06");
  assert.equal(todayIn(new Date("2026-10-06T16:59:59Z"), "Asia/Jakarta"), "2026-10-06");
  assert.equal(todayIn(new Date("2026-10-06T17:00:00Z"), "Asia/Jakarta"), "2026-10-07");
});

test("settings default the zone and leave the rest empty", () => {
  assert.deepEqual(readSettings([]), { ceremonyDate: null, timezone: DEFAULT_ZONE, partnerA: null, partnerB: null });
  const row = (key: string, value: string) => ({ key, value, rev: 1, created_at: "", updated_at: "", updated_by: null, deleted_at: null });
  assert.deepEqual(
    readSettings([row("ceremony_date", "2027-01-01"), row("timezone", "Asia/Makassar"), row("partner_a_label", "Sam")]),
    { ceremonyDate: "2027-01-01", timezone: "Asia/Makassar", partnerA: "Sam", partnerB: null },
  );
});

test("headcount sums people per side, skips declined, counts a missing size as one", () => {
  const guest = (fields: Parameters<typeof item>[0]) => item({ kind: "guest", status: "todo", ...fields });
  assert.deepEqual(
    headcount([
      guest({ who: "a", qty: 4 }),
      guest({ who: "a" }),
      guest({ who: "b", qty: 2, status: "confirmed" }),
      guest({ who: "b", qty: 9, status: "declined" }),
      guest({ qty: 3 }),
      item({ kind: "task", who: "a" }),
    ]),
    { a: { guests: 2, people: 5 }, b: { guests: 1, people: 2 }, none: { guests: 1, people: 3 } },
  );
});
