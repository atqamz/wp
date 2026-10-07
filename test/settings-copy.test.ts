import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { text } from "../src/ui/text.ts";

const settings = readFileSync(new URL("../src/views/settings.tsx", import.meta.url), "utf8");

test("the sign out note says what it ends and what stays on the phone", () => {
  assert.match(text.settings.signOutNote, /Access session/);
  assert.match(text.settings.signOutNote, /on this device/);
  assert.match(text.settings.signOutNote, /already synced to this phone stays readable until you clear this browser's data/);
});

test("the sign out link keeps the Access logout path and sits next to its note", () => {
  assert.match(settings, /LOGOUT_URL = "\/cdn-cgi\/access\/logout"/);
  assert.match(settings, /href=\{LOGOUT_URL\}/);
  assert.match(settings, /text\.settings\.signOutNote/);
});

test("the Hijri note says local announcements can differ by a day", () => {
  assert.match(text.settings.hijriNote, /differ by a day from local announcements/);
});
