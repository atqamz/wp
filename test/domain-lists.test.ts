import { test } from "node:test";
import assert from "node:assert/strict";
import { headcount, total } from "../src/domain/guests.ts";
import { sectionsOf } from "../src/domain/groups.ts";
import { owns } from "../src/domain/owner.ts";
import { item } from "./domain-rows.ts";

const owned = [item({ title: "a", who: "a" }), item({ title: "b", who: "b" }), item({ title: "both", who: "both" }), item({ title: "none", who: null })];

const titles = (rows: readonly { title: string }[]) => rows.map((row) => row.title);

const ownedBy = (rows: typeof owned, owner: Parameters<typeof owns>[1], me: Parameters<typeof owns>[2]) => rows.filter((row) => owns(row.who, owner, me));

test("everyone keeps every row, including those nobody owns", () => {
  assert.deepEqual(titles(ownedBy(owned, "everyone", "a")), ["a", "b", "both", "none"]);
});

test("mine keeps my rows and the shared ones, and never the other side or nobody", () => {
  assert.deepEqual(titles(ownedBy(owned, "mine", "a")), ["a", "both"]);
  assert.deepEqual(titles(ownedBy(owned, "mine", "b")), ["b", "both"]);
});

test("theirs keeps the other side and the shared ones", () => {
  assert.deepEqual(titles(ownedBy(owned, "theirs", "a")), ["b", "both"]);
  assert.deepEqual(titles(ownedBy(owned, "theirs", "b")), ["a", "both"]);
});

test("without a known side no filter hides anything, and the input is never reordered or mutated", () => {
  assert.deepEqual(titles(ownedBy(owned, "mine", null)), ["a", "b", "both", "none"]);
  const before = titles(owned);
  ownedBy(owned, "theirs", "a");
  assert.deepEqual(titles(owned), before);
});

test("one category is one section however it is cased, spaced or padded, shown as first written", () => {
  const rows = [
    item({ title: "1", group_key: "family" }),
    item({ title: "2", group_key: "Family" }),
    item({ title: "3", group_key: "  FAMILY  " }),
    item({ title: "4", group_key: "Friends  and\toffice" }),
    item({ title: "5", group_key: "friends and office" }),
  ];
  assert.deepEqual(
    sectionsOf(rows).map((section) => [section.key, titles(section.rows)]),
    [
      ["family", ["1", "2", "3"]],
      ["Friends and office", ["4", "5"]],
    ],
  );
});

test("sections run alphabetically without regard to case, and rows with no group come last", () => {
  const rows = ["Cherry", null, "apple", "  ", "Banana"].map((group_key, i) => item({ title: String(i), group_key }));
  assert.deepEqual(
    sectionsOf(rows).map((section) => [section.key, titles(section.rows)]),
    [
      ["apple", ["2"]],
      ["Banana", ["4"]],
      ["Cherry", ["0"]],
      [null, ["1", "3"]],
    ],
  );
});

test("rows keep their incoming order inside a section, and no rows give no sections", () => {
  const rows = [item({ title: "z", group_key: "g" }), item({ title: "a", group_key: "g" })];
  assert.deepEqual(titles(sectionsOf(rows)[0].rows), ["z", "a"]);
  assert.deepEqual(sectionsOf([]), []);
});

test("the guest total adds every side, declined guests stay out", () => {
  const guest = (fields: Parameters<typeof item>[0]) => item({ kind: "guest", status: "todo", ...fields });
  const count = headcount([guest({ who: "a", qty: 4 }), guest({ who: "b", qty: 2 }), guest({ qty: 1 }), guest({ who: "a", qty: 9, status: "declined" })]);
  assert.deepEqual(total(count), { guests: 3, people: 7 });
});
