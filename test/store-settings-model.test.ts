import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../src/store/api.ts";
import { memoryPersistence } from "../src/store/memory.ts";
import { createStore } from "../src/store/store.ts";
import { createServer } from "./store-server.ts";

const SEED = 20261007;
const RUNS = 150;
const STEPS = 14;

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const VALUES: Record<string, string[]> = {
  timezone: ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura", "Asia/Pontianak", "UTC"],
  hijri_offset_days: ["-2", "-1", "0", "1", "2"],
};
const KEYS = Object.keys(VALUES);

type Outcome = "ok" | "lost" | "5xx" | "offline" | "401";
const OUTCOMES: Outcome[] = ["ok", "ok", "lost", "5xx", "offline", "401"];

const flush = () => new Promise((resolve) => setImmediate(resolve));

const run = async (seed: number) => {
  const random = mulberry32(seed);
  const pick = <T>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const server = createServer();
  const through = server.as("a");
  const persistence = memoryPersistence();
  let outcome: Outcome = "ok";
  let gate: Promise<void> | null = null;
  const store = createStore({
    persistence,
    api: createApi(async (url, init) => {
      const post = init.method === "POST";
      if (post && gate) {
        const held = gate;
        gate = null;
        await held;
      }
      if (outcome === "offline") throw new TypeError("offline");
      if (outcome === "5xx") return new Response("bad", { status: 502 });
      if (outcome === "401") return Response.json({ error: "unauthorized" }, { status: 401 });
      const response = await through(url, init);
      if (outcome === "lost" && post) throw new TypeError("lost");
      return response;
    }),
  });
  await store.open();
  const last: Record<string, string> = {};
  const trail: string[] = [];
  const write = async () => {
    const key = pick(KEYS);
    const value = pick(VALUES[key]);
    const result = await store.setSetting(key, value);
    assert.equal(result.ok, true, `seed ${seed}: ${key}=${value}`);
    last[key] = value;
    trail.push(`${key}=${value}`);
  };
  for (let step = 0; step < STEPS; step++) {
    const kind = random();
    if (kind < 0.4) await write();
    else if (kind < 0.6) {
      outcome = pick(OUTCOMES);
      trail.push(`net ${outcome}`);
      await store.sync();
    } else {
      let release = () => {};
      gate = new Promise<void>((resolve) => (release = resolve));
      trail.push("hold");
      await write();
      await flush();
      for (let extra = Math.floor(random() * 3); extra > 0; extra--) await write();
      outcome = pick(OUTCOMES);
      trail.push(`net ${outcome}`);
      release();
      await flush();
      if (random() < 0.5) await write();
    }
  }
  outcome = "ok";
  await store.sync();
  await store.sync();
  const view = Object.fromEntries(store.getSnapshot().rows.settings.map((row) => [row.key, row.value]));
  for (const [key, value] of Object.entries(last)) {
    assert.equal(server.row("settings", key)?.value, value, `seed ${seed}: server for ${key} after ${trail.join(", ")}`);
    assert.equal(view[key], value, `seed ${seed}: view for ${key} after ${trail.join(", ")}`);
  }
  assert.equal(store.getSnapshot().pending, 0, `seed ${seed}: outbox not empty`);
  assert.equal(store.getSnapshot().rejected.length, 0, `seed ${seed}: something was refused`);
};

test("random repeated writes, failures, held requests and recoveries always end on the last value written, in order", { timeout: 60000 }, async () => {
  for (let i = 0; i < RUNS; i++) await run(SEED + i);
});
