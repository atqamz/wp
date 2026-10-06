import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { text } from "../src/ui/text.ts";

const strings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : typeof value === "function"
      ? [value(1), value("x")].flatMap(strings)
      : typeof value === "object" && value !== null
        ? Object.values(value).flatMap(strings)
        : [];

test("no UI string says Partner", () => {
  const all = strings(text);
  assert.ok(all.length > 100);
  assert.deepEqual(all.filter((line) => /partner/i.test(line)), []);
});

test("no source file spells out Partner A or Partner B", () => {
  const files = readdirSync(new URL("../src/", import.meta.url), { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile());
  assert.ok(files.length > 20);
  for (const file of files) {
    assert.doesNotMatch(readFileSync(`${file.parentPath}/${file.name}`, "utf8"), /Partner [AB]/, file.name);
  }
});

test("the two nickname fields and the ownership blank are named without placeholders", () => {
  assert.deepEqual([text.settings.yourNickname, text.settings.theirNickname, text.nobody, text.both], ["Your nickname", "Their nickname", "Nobody yet", "Both"]);
});
