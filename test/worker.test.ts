import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { createAuthenticator } from "../worker/auth.ts";
import worker, { createWorker } from "../worker/index.ts";
import type { Bindings } from "../worker/index.ts";
import { createDb, id, mutation, project, task } from "./sync-db.ts";

const url = (path: string) => `https://wp.example.test${path}`;


const setup = (extra: Partial<Bindings> = {}) => {
  const { db, sqlite, calls } = createDb();
  const env: Bindings = { DB: db, AUTH_MODE: "dev", DEV_WHO: "b", ...extra };
  return { env, db, sqlite, calls };
};

const call = (env: Bindings, path: string, init?: RequestInit) => worker.fetch(new Request(url(path), init), env);

const LEAK = /\bat .+[(:]|Error:|node_modules|\.ts:\d+|SQLITE|\/home\//;

test("GET /api/health returns ok for an authenticated caller", async () => {
  const { env } = setup();
  const res = await call(env, "/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("every /api route needs authentication, including health and unknown paths", async () => {
  const { env } = setup({ AUTH_MODE: undefined });
  for (const [method, path] of [["GET", "/api/health"], ["GET", "/api/login"], ["GET", "/api/sync"], ["POST", "/api/sync"], ["GET", "/api/export?format=json"], ["GET", "/api/nope"], ["DELETE", "/api/sync"]]) {
    const res = await call(env, path, { method });
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.deepEqual(await res.json(), { error: "unauthorized" });
  }
});

test("unknown /api paths are 404 json for an authenticated caller, other paths are 404 too", async () => {
  const { env } = setup();
  for (const path of ["/api/nope", "/api/sync/", "/api/", "/other"]) {
    const res = await call(env, path);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "not_found" });
  }
});

test("wrong methods are 405 with Allow", async () => {
  const { env } = setup();
  const cases: [string, string, string][] = [
    ["POST", "/api/health", "GET"],
    ["PUT", "/api/login", "GET"],
    ["POST", "/api/export?format=json", "GET"],
    ["DELETE", "/api/sync", "GET, POST"],
    ["PATCH", "/api/sync", "GET, POST"],
  ];
  for (const [method, path, allow] of cases) {
    const res = await call(env, path, { method });
    assert.equal(res.status, 405, `${method} ${path}`);
    assert.equal(res.headers.get("allow"), allow);
    assert.deepEqual(await res.json(), { error: "method_not_allowed" });
  }
});

test("GET /api/login redirects to /", async () => {
  const { env } = setup();
  const res = await call(env, "/api/login", { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/");
});

test("a sync round trip through the router", async () => {
  const { env, sqlite } = setup();
  const body = JSON.stringify({ mutations: [project(1), task(2, 1)] });
  const post = await call(env, "/api/sync", { method: "POST", body });
  assert.equal(post.status, 200);
  const result = (await post.json()) as { rev: number; rows: { items: { id: string; updated_by: string; updated_at: string }[] } };
  assert.equal(result.rev, 1);
  assert.equal(result.rows.items.length, 2);
  assert.equal(result.rows.items[0].updated_by, "b");
  assert.match(result.rows.items[0].updated_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.notEqual(result.rows.items[0].updated_at, "2026-10-01T00:00:00Z");
  const pull = await call(env, "/api/sync?since=0");
  const pulled = (await pull.json()) as { rev: number; me: string; changes: { items: unknown[] } };
  assert.deepEqual([pulled.rev, pulled.me, pulled.changes.items.length], [1, "b", 2]);
  assert.equal((sqlite.prepare("SELECT count(*) AS n FROM items").get() as { n: number }).n, 2);
});

test("a rejection keeps the Rejection shape and the matching http status", async () => {
  const { env } = setup();
  const res = await call(env, "/api/sync", { method: "POST", body: JSON.stringify({ mutations: [mutation("update", "items", id(9), { title: "x" })] }) });
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { status: 404, errors: ["row_id: no such row"], index: 0 });
});

test("the export route answers json and csv", async () => {
  const { env } = setup();
  assert.equal((await call(env, "/api/export?format=json")).status, 200);
  assert.equal((await call(env, "/api/export?format=csv&table=items&kind=task")).status, 200);
  assert.equal((await call(env, "/api/export")).status, 400);
});

test("a JWT travels through the router and picks the side", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const jwk = { ...(await exportJWK(publicKey)), kid: "k", alg: "RS256", use: "sig" };
  const handler = createWorker(createAuthenticator(async () => Response.json({ keys: [jwk] })));
  const { db } = createDb();
  const env: Bindings = { DB: db, ACCESS_TEAM_DOMAIN: "team.example.test", ACCESS_AUD: "aud", ALLOWED_EMAILS: "a@example.test,b@example.test" };
  const jwt = await new SignJWT({ email: "B@Example.test" })
    .setProtectedHeader({ alg: "RS256", kid: "k" })
    .setIssuer("https://team.example.test")
    .setAudience("aud")
    .setExpirationTime("5m")
    .sign(privateKey);
  const res = await handler.fetch(new Request(url("/api/sync"), { headers: { "Cf-Access-Jwt-Assertion": jwt } }), env);
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { me: string }).me, "b");
  const anonymous = await handler.fetch(new Request(url("/api/sync")), env);
  assert.equal(anonymous.status, 401);
});

test("no response leaks a stack trace or internals", async (t) => {
  const log = mock.method(console, "error", () => {});
  t.after(() => log.mock.restore());
  const { env } = setup();
  const failing: Bindings = {
    ...env,
    DB: {
      prepare: env.DB.prepare,
      batch: async () => {
        throw new Error("SQLITE_BUSY: database is locked at /home/someone/wp/worker/sync.ts:1:1");
      },
    },
  };
  const requests: [Bindings, string, RequestInit?][] = [
    [env, "/api/health"],
    [env, "/api/nope"],
    [env, "/api/sync", { method: "DELETE" }],
    [env, "/api/sync?since=zzz"],
    [env, "/api/sync", { method: "POST", body: "{" }],
    [env, "/api/sync", { method: "POST", body: JSON.stringify({ mutations: [{}] }) }],
    [env, "/api/sync", { method: "POST", body: JSON.stringify({ mutations: [mutation("update", "items", id(9))] }) }],
    [env, "/api/export?format=xml"],
    [env, "/api/export?format=csv&table=settings"],
    [{ ...env, AUTH_MODE: undefined }, "/api/sync"],
    [failing, "/api/sync"],
    [failing, "/api/sync", { method: "POST", body: JSON.stringify({ mutations: [project(1)] }) }],
    [failing, "/api/export?format=json"],
  ];
  for (const [bindings, path, init] of requests) {
    const res = await call(bindings, path, init);
    const text = await res.text();
    assert.doesNotMatch(text, LEAK, `${init?.method ?? "GET"} ${path}`);
    assert.ok(res.status >= 200 && res.status < 600);
  }
  const res = await call(failing, "/api/sync");
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "internal" });
  assert.ok(log.mock.callCount() > 0);
  assert.doesNotMatch(JSON.stringify(log.mock.calls.map((c) => c.arguments)), /SQLITE|someone|locked/);
});
