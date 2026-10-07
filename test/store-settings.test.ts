import { test } from "node:test";
import assert from "node:assert/strict";
import { createApi } from "../src/store/api.ts";
import { memoryPersistence } from "../src/store/memory.ts";
import { createStore } from "../src/store/store.ts";
import { createServer } from "./store-server.ts";
import { client, idOf, task } from "./store-client.ts";

const offline = async () => {
  const server = createServer();
  server.control.down = true;
  const c = client(server, "a");
  await c.store.open();
  return { server, ...c };
};

const settingsOf = (store: ReturnType<typeof client>["store"]) => Object.fromEntries(store.getSnapshot().rows.settings.map((row) => [row.key, row.value]));

test("many writes to one setting while offline queue one mutation, and the last value wins", async () => {
  const { store, persistence } = await offline();
  for (let i = 0; i < 60; i++) idOf(await store.setSetting("hijri_offset_days", String((i % 3) - 1)));
  idOf(await store.setSetting("hijri_offset_days", "1"));
  assert.equal(store.getSnapshot().pending, 1);
  assert.equal(settingsOf(store).hijri_offset_days, "1");
  const saved = await persistence.load();
  assert.equal(saved.outbox.length, 1);
  assert.deepEqual([saved.outbox[0].op, saved.outbox[0].patch.value], ["create", "1"]);
});

test("a pending create keeps its created_at and takes the newest value and time", async () => {
  const { store, persistence } = await offline();
  idOf(await store.setSetting("timezone", "Asia/Jakarta"));
  const first = (await persistence.load()).outbox[0];
  idOf(await store.setSetting("timezone", "Asia/Makassar"));
  const [only] = (await persistence.load()).outbox;
  assert.equal(only.seq, first.seq);
  assert.equal(only.id, first.id);
  assert.equal(only.patch.created_at, first.patch.created_at);
  assert.equal(only.patch.value, "Asia/Makassar");
});

test("a pending update of a synced setting is folded into one update", async () => {
  const server = createServer();
  const online = client(server, "a");
  await online.store.open();
  idOf(await online.store.setSetting("timezone", "Asia/Jakarta"));
  await online.store.sync();
  server.control.down = true;
  idOf(await online.store.setSetting("timezone", "Asia/Makassar"));
  await online.store.sync();
  idOf(await online.store.setSetting("timezone", "Asia/Jayapura"));
  await online.store.sync();
  const { outbox } = await online.persistence.load();
  assert.deepEqual(outbox.map((entry) => [entry.op, entry.patch.value]), [["update", "Asia/Jayapura"]]);
  server.control.down = false;
  await online.store.sync();
  assert.equal(online.store.getSnapshot().pending, 0);
  assert.equal(server.row("settings", "timezone")?.value, "Asia/Jayapura");
});

test("different settings, and other tables, are never folded together", async () => {
  const { store, persistence } = await offline();
  idOf(await store.setSetting("timezone", "Asia/Jakarta"));
  idOf(await store.setSetting("hijri_offset_days", "1"));
  const id = idOf(await store.create("items", task("Book a hall")));
  idOf(await store.update("items", id, { status: "done", done_on: "2026-10-06" }));
  idOf(await store.update("items", id, { status: "todo", done_on: null }));
  const { outbox } = await persistence.load();
  assert.deepEqual(outbox.map((entry) => [entry.table, entry.op]), [["settings", "create"], ["settings", "create"], ["items", "create"], ["items", "update"], ["items", "update"]]);
});

test("a write whose mutation is on its way is not folded into it, so the newer value is not lost", async () => {
  const server = createServer();
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const through = server.as("a");
  const persistence = memoryPersistence();
  const store = createStore({
    persistence,
    api: createApi(async (url, init) => {
      if (init.method === "POST") await gate;
      return through(url, init);
    }),
  });
  await store.open();
  idOf(await store.setSetting("timezone", "Asia/Jakarta"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  idOf(await store.setSetting("timezone", "Asia/Makassar"));
  assert.equal(store.getSnapshot().pending, 2);
  release();
  await store.sync();
  await store.sync();
  assert.equal(store.getSnapshot().pending, 0);
  assert.equal(server.row("settings", "timezone")?.value, "Asia/Makassar");
  assert.equal(settingsOf(store).timezone, "Asia/Makassar");
});

test("a folded value that the contract refuses is refused and the earlier one stays queued", async () => {
  const { store, persistence } = await offline();
  idOf(await store.setSetting("hijri_offset_days", "1"));
  const refused = await store.setSetting("hijri_offset_days", "7");
  assert.equal(refused.ok, false);
  const { outbox } = await persistence.load();
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].patch.value, "1");
});

test("folding survives a reload of the phone", async () => {
  const { server, store, persistence } = await offline();
  idOf(await store.setSetting("timezone", "Asia/Jakarta"));
  idOf(await store.setSetting("timezone", "Asia/Makassar"));
  const reopened = client(server, "a", persistence);
  await reopened.store.open();
  assert.equal(reopened.store.getSnapshot().pending, 1);
  idOf(await reopened.store.setSetting("timezone", "Asia/Jayapura"));
  assert.equal((await persistence.load()).outbox.length, 1);
  server.control.down = false;
  await reopened.store.sync();
  assert.equal(server.row("settings", "timezone")?.value, "Asia/Jayapura");
});
