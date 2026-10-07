import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");

const coarse = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";

test("scrollbars are thin and tokenised by default", () => {
  assert.match(css, /\*\s*\{[^}]*scrollbar-width: thin;[^}]*scrollbar-color: var\(--[a-z0-9-]+\) transparent;/);
});

test("every scrollbar is hidden on touch devices", () => {
  assert.match(coarse, /\*\s*\{\s*scrollbar-width: none;\s*\}/);
  assert.match(coarse, /\*::-webkit-scrollbar\s*\{\s*display: none;\s*\}/);
});
