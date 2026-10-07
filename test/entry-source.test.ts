import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOGIN_URL } from "../src/store/api.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("the sign-in and wrong-account buttons are plain links to the login path", () => {
  assert.equal(LOGIN_URL, "/api/login");
  assert.match(read("../src/views/entry.tsx"), /<a className="button entry-action" href=\{LOGIN_URL\}>/);
});

test("the denied check runs before the store is opened", () => {
  const main = read("../src/main.tsx");
  assert.ok(main.indexOf("takeDenied(location, history)") > 0);
  assert.ok(main.indexOf("takeDenied(location, history)") < main.indexOf("openStore()"));
  assert.match(main, /screenFor\(useSnapshot\(\)\)/);
});
