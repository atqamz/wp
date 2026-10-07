import { test } from "node:test";
import assert from "node:assert/strict";
import { isDenied, withoutDenied } from "../src/domain/access.ts";

test("only access=denied selects the wrong-account screen", () => {
  assert.equal(isDenied("?access=denied"), true);
  assert.equal(isDenied("?x=1&access=denied"), true);
  for (const search of ["", "?access=", "?access=granted", "?access=Denied", "?denied=1", "?other=access%3Ddenied"]) assert.equal(isDenied(search), false, search);
});

test("the denied query is removed and everything else in the address is kept", () => {
  assert.equal(withoutDenied("https://wp.example.test/?access=denied"), "/");
  assert.equal(withoutDenied("https://wp.example.test/?access=denied#/budget"), "/#/budget");
  assert.equal(withoutDenied("https://wp.example.test/?x=1&access=denied&y=2#/"), "/?x=1&y=2#/");
  assert.equal(withoutDenied("https://wp.example.test/"), "/");
});

test("a cleaned address no longer selects the wrong-account screen", () => {
  const href = "https://wp.example.test/?access=denied&x=1";
  assert.equal(isDenied(new URL(withoutDenied(href), href).search), false);
});
