import { test } from "node:test";
import assert from "node:assert/strict";
import { todayIn, zoneSupported } from "../src/domain/dates.ts";
import { DEFAULT_ZONE, readSettings } from "../src/domain/settings.ts";
import { formatDate, formatDay } from "../src/ui/format.ts";
import { canResetView } from "../src/ui/recovery.ts";
import { text } from "../src/ui/text.ts";

const late = new Date("2026-10-06T20:00:00Z");
const bad = ["Mars/Olympus", "", "x".repeat(10_000), "Asia/Jakarta\u0000", "Asia/\nJakarta", "\u001b[31m", "Asia/Jakarta ", "UTC+7"];

test("a supported zone shifts the day", () => {
  assert.equal(todayIn(late, "Asia/Jakarta"), "2026-10-07");
  assert.equal(todayIn(late, "UTC"), "2026-10-06");
});

test("an unsupported zone falls back to the default zone instead of throwing", () => {
  const expected = todayIn(late, DEFAULT_ZONE);
  assert.equal(expected, "2026-10-07");
  for (const zone of bad) {
    assert.equal(zoneSupported(zone), false, JSON.stringify(zone.slice(0, 20)));
    assert.equal(todayIn(late, zone), expected, JSON.stringify(zone.slice(0, 20)));
  }
  assert.equal(todayIn(late, undefined as unknown as string), expected);
});

test("a zone that another runtime rejects falls back", () => {
  const real = Intl.DateTimeFormat;
  const only = (zone: string) =>
    class extends real {
      constructor(locale?: string | string[], options?: Intl.DateTimeFormatOptions) {
        if (options?.timeZone === zone) throw new RangeError(`Invalid time zone specified: ${zone}`);
        super(locale, options);
      }
    };
  Intl.DateTimeFormat = only("Asia/Pontianak") as typeof Intl.DateTimeFormat;
  try {
    assert.equal(zoneSupported("Asia/Pontianak"), false);
    assert.equal(todayIn(late, "Asia/Pontianak"), "2026-10-07");
    assert.equal(zoneSupported("Asia/Makassar"), true);
  } finally {
    Intl.DateTimeFormat = real;
  }
});

test("reading settings keeps the stored zone untouched", () => {
  for (const zone of bad) {
    const rows = [{ key: "timezone", value: zone }] as unknown as Parameters<typeof readSettings>[0];
    assert.equal(readSettings(rows).timezone, zone);
  }
});

test("formatting never depends on the saved zone", () => {
  assert.equal(formatDate("2026-10-06"), "6 Oct 2026");
  assert.match(formatDay("2026-10-06"), /^Tue,? 6 Oct$/);
});

test("the view can be reset only away from the home route", () => {
  for (const hash of ["", "#", "#/"]) assert.equal(canResetView(hash), false, hash);
  for (const hash of ["#/budget", "#/settings", "#budget", "#/vendor/abc"]) assert.equal(canResetView(hash), true, hash);
});

test("recovery text is one plain generic sentence", () => {
  assert.match(text.crashed, /^[^.]+\. [^.]+\.$/);
  assert.equal(text.reload, "Reload");
  assert.equal(text.resetView, "Reset the view");
  assert.doesNotMatch(text.crashed, /error|stack|undefined|\[object/i);
});
