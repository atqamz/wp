import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.ts";

test("GET /api/health returns ok", async () => {
  const res = worker.fetch(new Request("http://localhost/api/health"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
});

test("other /api paths are 404 json", async () => {
  const res = worker.fetch(new Request("http://localhost/api/nope"));
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "not_found" });
});
