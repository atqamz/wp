import { test } from "node:test";
import assert from "node:assert/strict";
import { keyboardInset } from "../src/domain/viewport.ts";

test("without a keyboard the inset is zero", () => {
  assert.equal(keyboardInset(800, { height: 800, offsetTop: 0, scale: 1 }), 0);
});

test("a keyboard that covers the bottom of the layout lifts the sheet by its height", () => {
  assert.equal(keyboardInset(800, { height: 500, offsetTop: 0, scale: 1 }), 300);
});

test("a page that the browser scrolled up above the keyboard counts the scroll offset", () => {
  assert.equal(keyboardInset(800, { height: 500, offsetTop: 120, scale: 1 }), 180);
  assert.equal(keyboardInset(800, { height: 500, offsetTop: 300, scale: 1 }), 0);
});

test("a viewport that is taller than the layout never gives a negative inset", () => {
  assert.equal(keyboardInset(800, { height: 820, offsetTop: 0, scale: 1 }), 0);
});

test("pinch zoom is not a keyboard", () => {
  assert.equal(keyboardInset(800, { height: 400, offsetTop: 0, scale: 2 }), 0);
  assert.equal(keyboardInset(800, { height: 500, offsetTop: 0, scale: 1.005 }), 300);
});

test("fractional sizes round to whole pixels", () => {
  assert.equal(keyboardInset(800, { height: 499.6, offsetTop: 0.2, scale: 1 }), 300);
});
