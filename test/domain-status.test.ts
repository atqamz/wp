import { test } from "node:test";
import assert from "node:assert/strict";
import { changedValues } from "../src/domain/changes.ts";
import { isOverdue } from "../src/domain/dates.ts";
import { exclusive } from "../src/domain/once.ts";
import { badgeFor, screenFor } from "../src/domain/status.ts";
import type { Health } from "../src/domain/status.ts";
import { exportQuery, views } from "../src/ui/registry.ts";
import type { ViewName } from "../src/ui/registry.ts";

const healthy: Health = { storage: "ok", link: "online", rejected: 0, pending: 0 };

test("the app opens once the server has been heard, with or without data, and never offers creation before that", () => {
  assert.equal(screenFor(false, false), "loading");
  assert.equal(screenFor(false, true), "loading");
  assert.equal(screenFor(true, false), "connect");
  assert.equal(screenFor(true, true), "app");
});

test("the badge shows the worst state first: storage, login, rejected, offline, pending, synced", () => {
  assert.equal(badgeFor(healthy), "synced");
  assert.equal(badgeFor({ ...healthy, pending: 2 }), "pending");
  assert.equal(badgeFor({ ...healthy, pending: 2, link: "offline" }), "offline");
  assert.equal(badgeFor({ ...healthy, pending: 2, link: "offline", rejected: 1 }), "rejected");
  assert.equal(badgeFor({ ...healthy, pending: 2, link: "expired", rejected: 1 }), "login");
  assert.equal(badgeFor({ storage: "failed", link: "expired", rejected: 1, pending: 2 }), "storage");
  assert.equal(badgeFor({ ...healthy, storage: "failed" }), "storage");
  assert.equal(badgeFor({ ...healthy, link: "offline" }), "offline");
});

test("overdue means strictly before today and only when there is a date", () => {
  assert.equal(isOverdue("2026-10-05", "2026-10-06"), true);
  assert.equal(isOverdue("2026-10-06", "2026-10-06"), false);
  assert.equal(isOverdue("2026-10-07", "2026-10-06"), false);
  assert.equal(isOverdue(null, "2026-10-06"), false);
});

test("parked values: data keys are flattened, technical columns are hidden, a cleared value stays", () => {
  assert.deepEqual(
    changedValues({
      id: "x",
      kind: "task",
      budget_id: "b",
      currency: "IDR",
      sort: 0,
      created_at: "t",
      updated_at: "t",
      title: "Down payment",
      amount: 5_000_000,
      due_on: null,
      data: { phone: "+628123456789", pic: null },
    }),
    [
      ["title", "Down payment"],
      ["amount", 5_000_000],
      ["due_on", null],
      ["data.phone", "+628123456789"],
      ["data.pic", null],
    ],
  );
  assert.deepEqual(changedValues({ value: "Sam", key: "partner_a_label" }), [["value", "Sam"]]);
});

test("exclusive runs one piece of work at a time and frees itself afterwards, even after a failure", async () => {
  const run = exclusive();
  let started = 0;
  let release: () => void = () => undefined;
  const first = run(async () => {
    started += 1;
    await new Promise<void>((resolve) => (release = resolve));
  });
  assert.equal(await run(async () => void (started += 1)), false);
  assert.equal(started, 1);
  release();
  assert.equal(await first, true);
  assert.equal(await run(async () => void (started += 1)), true);
  assert.equal(started, 2);
  await assert.rejects(run(async () => Promise.reject(new Error("write failed"))));
  assert.equal(await run(async () => void (started += 1)), true);
  assert.equal(started, 3);
});

test("export links name the table and the discriminator the worker expects, for every view", () => {
  const names = Object.keys(views) as ViewName[];
  assert.deepEqual(
    names.map(exportQuery),
    [
      "format=csv&table=items&kind=task",
      "format=csv&table=items&kind=vendor",
      "format=csv&table=items&kind=guest",
      "format=csv&table=budget_entries&entry_type=planned",
      "format=csv&table=budget_entries&entry_type=payment",
    ],
  );
});
