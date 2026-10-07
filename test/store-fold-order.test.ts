import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../src/store/api.ts";
import { memoryPersistence } from "../src/store/memory.ts";
import { createStore } from "../src/store/store.ts";
import type { Persistence } from "../src/store/persistence.ts";
import { createServer } from "./store-server.ts";
import { idOf } from "./store-client.ts";

const flush = () => new Promise((resolve) => setImmediate(resolve));

const valueOf = (store: ReturnType<typeof createStore>, key: string) => store.getSnapshot().rows.settings.find((row) => row.key === key)?.value;

type Outcome = "lost response" | "5xx" | "offline" | "401";

const heldFirstPost = (outcome: Outcome) => {
  const server = createServer();
  const through = server.as("a");
  const persistence = memoryPersistence();
  let release = () => {};
  let first = true;
  let down = false;
  const store = createStore({
    persistence,
    api: createApi(async (url, init) => {
      if (init.method === "POST" && first) {
        first = false;
        await new Promise<void>((resolve) => (release = resolve));
        down = true;
        if (outcome === "lost response") {
          await through(url, init);
          throw new TypeError("lost");
        }
        if (outcome === "5xx") return new Response("bad", { status: 502 });
        if (outcome === "401") return Response.json({ error: "unauthorized" }, { status: 401 });
        throw new TypeError("offline");
      }
      if (down) throw new TypeError("offline");
      return through(url, init);
    }),
  });
  return { server, persistence, store, release: () => release(), recover: () => (down = false) };
};

for (const outcome of ["lost response", "5xx", "offline", "401"] as const) {
  test(`a write in flight, two more, then a ${outcome}, then a fourth: the fourth wins in the view and on the server`, async () => {
    const { server, persistence, store, release, recover } = heldFirstPost(outcome);
    await store.open();
    idOf(await store.setSetting("timezone", "Asia/Jakarta"));
    await flush();
    idOf(await store.setSetting("timezone", "Asia/Makassar"));
    idOf(await store.setSetting("timezone", "Asia/Jayapura"));
    release();
    await flush();
    idOf(await store.setSetting("timezone", "Asia/Pontianak"));
    assert.equal(valueOf(store, "timezone"), "Asia/Pontianak");
    const queued = (await persistence.load()).outbox.map((entry) => entry.patch.value);
    assert.deepEqual(queued, ["Asia/Jakarta", "Asia/Pontianak"]);
    recover();
    await store.sync();
    await store.sync();
    assert.equal(server.row("settings", "timezone")?.value, "Asia/Pontianak");
    assert.equal(valueOf(store, "timezone"), "Asia/Pontianak");
    assert.equal(store.getSnapshot().pending, 0);
  });
}

const gatedPersistence = (match: (write: Parameters<Persistence["write"]>[0]) => boolean) => {
  const persistence = memoryPersistence();
  const write = persistence.write;
  let hold = false;
  let release = () => {};
  let entered = () => {};
  const inside = new Promise<void>((resolve) => (entered = resolve));
  persistence.write = async (change) => {
    if (hold && match(change)) {
      entered();
      await new Promise<void>((resolve) => (release = resolve));
    }
    return write(change);
  };
  return { persistence, inside, arm: () => (hold = true), disarm: () => (hold = false), release: () => release() };
};

test("a write made while the answer to a sent write is being stored is not folded into the sent one", { timeout: 4000 }, async () => {
  const server = createServer();
  const through = server.as("a");
  const gate = gatedPersistence((change) => (change.outbox?.drop?.length ?? 0) > 0);
  let release = () => {};
  let first = true;
  const store = createStore({
    persistence: gate.persistence,
    api: createApi(async (url, init) => {
      if (init.method === "POST" && first) {
        first = false;
        await new Promise<void>((resolve) => (release = resolve));
      }
      return through(url, init);
    }),
  });
  await store.open();
  idOf(await store.setSetting("timezone", "Asia/Jakarta"));
  await flush();
  idOf(await store.setSetting("timezone", "Asia/Makassar"));
  gate.arm();
  release();
  await gate.inside;
  idOf(await store.setSetting("timezone", "Asia/Jayapura"));
  gate.disarm();
  gate.release();
  await store.sync();
  await store.sync();
  assert.equal(server.row("settings", "timezone")?.value, "Asia/Jayapura");
  assert.equal(valueOf(store, "timezone"), "Asia/Jayapura");
  assert.equal(store.getSnapshot().pending, 0);
});

test("a write made while a refused write is being parked is neither lost nor folded into it", { timeout: 4000 }, async () => {
  const server = createServer();
  const through = server.as("a");
  const gate = gatedPersistence((change) => change.outbox?.put?.some((entry) => entry.rejected !== undefined) === true);
  let refuse = false;
  const store = createStore({
    persistence: gate.persistence,
    api: createApi(async (url, init) => {
      if (init.method === "POST" && refuse) {
        refuse = false;
        return Response.json({ status: 400, errors: ["simulated"], index: 0 }, { status: 400 });
      }
      return through(url, init);
    }),
  });
  await store.open();
  idOf(await store.setSetting("timezone", "UTC"));
  await store.sync();
  refuse = true;
  gate.arm();
  idOf(await store.setSetting("timezone", "Asia/Jakarta"));
  await gate.inside;
  idOf(await store.setSetting("timezone", "Asia/Makassar"));
  gate.disarm();
  gate.release();
  await store.sync();
  await store.sync();
  const snapshot = store.getSnapshot();
  assert.deepEqual(snapshot.rejected.map((entry) => entry.patch.value), ["Asia/Jakarta"]);
  assert.equal(server.row("settings", "timezone")?.value, "Asia/Makassar");
  assert.equal(valueOf(store, "timezone"), "Asia/Makassar");
});

test("a refused write that is parked is never a fold target, so the next write is sent", { timeout: 4000 }, async () => {
  const server = createServer();
  const through = server.as("a");
  let refuse = false;
  const store = createStore({
    persistence: memoryPersistence(),
    api: createApi(async (url, init) => {
      if (init.method === "POST" && refuse) {
        refuse = false;
        return Response.json({ status: 400, errors: ["simulated"], index: 0 }, { status: 400 });
      }
      return through(url, init);
    }),
  });
  await store.open();
  idOf(await store.setSetting("timezone", "UTC"));
  await store.sync();
  refuse = true;
  idOf(await store.setSetting("timezone", "Asia/Jakarta"));
  await store.sync();
  assert.equal(store.getSnapshot().rejected.length, 1);
  idOf(await store.setSetting("timezone", "Asia/Makassar"));
  await store.sync();
  assert.equal(store.getSnapshot().rejected.length, 1);
  assert.equal(server.row("settings", "timezone")?.value, "Asia/Makassar");
  assert.equal(store.getSnapshot().pending, 0);
});

test("with several unsent writes of one key the newest is the one that takes the next value", { timeout: 4000 }, async () => {
  const server = createServer();
  const through = server.as("a");
  const persistence = memoryPersistence();
  let fail = false;
  const store = createStore({
    persistence,
    api: createApi(async (url, init) => {
      if (fail) throw new TypeError("offline");
      return through(url, init);
    }),
  });
  await store.open();
  idOf(await store.setSetting("timezone", "Asia/Jakarta"));
  await store.sync();
  fail = true;
  idOf(await store.setSetting("timezone", "Asia/Makassar"));
  await store.sync();
  idOf(await store.setSetting("timezone", "Asia/Jayapura"));
  const { outbox } = await persistence.load();
  assert.deepEqual(outbox.map((entry) => [entry.op, entry.patch.value]), [["update", "Asia/Jayapura"]]);
  fail = false;
  await store.sync();
  assert.equal(server.row("settings", "timezone")?.value, "Asia/Jayapura");
});

test("fifty writes while one is on its way queue the sent one and one folded one, never more", { timeout: 4000 }, async () => {
  const { persistence, store, release, recover } = heldFirstPost("offline");
  await store.open();
  idOf(await store.setSetting("hijri_offset_days", "1"));
  await flush();
  for (let i = 0; i < 50; i++) idOf(await store.setSetting("hijri_offset_days", String((i % 5) - 2)));
  const queued = (await persistence.load()).outbox;
  assert.equal(queued.length, 2);
  assert.equal(queued.at(-1)?.patch.value, "2");
  release();
  await flush();
  recover();
  await store.sync();
  assert.equal(store.getSnapshot().pending, 0);
});
