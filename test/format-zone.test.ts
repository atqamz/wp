import { test } from "node:test";
import assert from "node:assert/strict";

const inZone = async <T>(zone: string, run: (format: typeof import("../src/ui/format.ts")) => T): Promise<T> => {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run(await import(new URL(`../src/ui/format.ts?zone=${zone}`, import.meta.url).href));
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
};

for (const zone of ["America/Los_Angeles", "Pacific/Auckland", "Asia/Jakarta"]) {
  test(`date-only values read the same on a machine in ${zone}`, async () => {
    await inZone(zone, (format) => {
      assert.equal(new Intl.DateTimeFormat().resolvedOptions().timeZone, zone);
      assert.equal(format.formatDate("2027-01-01"), "1 Jan 2027");
      assert.match(format.formatDay("2026-10-06"), /^Tue,? 6 Oct$/);
      assert.match(format.formatDay("2027-10-30", "2026-10-07"), /^Sat,? 30 Oct 2027$/);
      assert.match(format.formatLong("2027-11-13"), /^Saturday,? 13 November 2027$/);
      assert.match(format.formatMonths("2026-06-01", "2026-09-30"), /^Jun\s?[–-]\s?Sept? 2026$/);
      assert.match(format.formatMonths("2027-01-01", "2027-01-31"), /^Jan 2027$/);
      assert.match(format.formatMonths("2026-10-01", "2027-01-31"), /^Oct 2026\s?[–-]\s?Jan 2027$/);
    });
  });
}
