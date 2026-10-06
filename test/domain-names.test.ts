import { test } from "node:test";
import assert from "node:assert/strict";
import { sideName } from "../src/domain/names.ts";
import { text } from "../src/ui/text.ts";

const name = (side: string | null, me: "a" | "b" | null, a: string | null, b: string | null) => sideName(side, me, { a, b }, text);

test("both nicknames set: each side shows its nickname whoever is signed in", () => {
  for (const me of ["a", "b", null] as const) {
    assert.deepEqual([name("a", me, "Ana", "Bo"), name("b", me, "Ana", "Bo")], ["Ana", "Bo"], String(me));
  }
});

test("no nickname set: the signed-in side is You and the other side is Them", () => {
  assert.deepEqual([name("a", "a", null, null), name("b", "a", null, null)], ["You", "Them"]);
  assert.deepEqual([name("a", "b", null, null), name("b", "b", null, null)], ["Them", "You"]);
});

test("no nickname set and nobody known: every side is Them, never empty", () => {
  assert.deepEqual([name("a", null, null, null), name("b", null, null, null)], ["Them", "Them"]);
});

test("one nickname set: the other side falls back by who is signed in", () => {
  assert.deepEqual([name("a", "a", "Ana", null), name("b", "a", "Ana", null)], ["Ana", "Them"]);
  assert.deepEqual([name("a", "b", "Ana", null), name("b", "b", "Ana", null)], ["Ana", "You"]);
  assert.deepEqual([name("a", "a", null, "Bo"), name("b", "a", null, "Bo")], ["You", "Bo"]);
  assert.deepEqual([name("a", "b", null, "Bo"), name("b", "b", null, "Bo")], ["Them", "Bo"]);
  assert.deepEqual([name("a", null, "Ana", null), name("b", null, "Ana", null)], ["Ana", "Them"]);
  assert.deepEqual([name("a", null, null, "Bo"), name("b", null, null, "Bo")], ["Them", "Bo"]);
});

test("both and nobody do not depend on nicknames or on who is signed in", () => {
  for (const me of ["a", "b", null] as const) {
    for (const [a, b] of [["Ana", "Bo"], [null, null], ["Ana", null]] as const) {
      assert.deepEqual([name("both", me, a, b), name(null, me, a, b), name("", me, a, b)], ["Both", "Nobody yet", "Nobody yet"]);
    }
  }
});
