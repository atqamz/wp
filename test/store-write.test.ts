import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "./store-server.ts";
import { client, idOf, task, titles } from "./store-client.ts";

const offline = async (side: "a" | "b" = "a") => {
  const server = createServer();
  server.control.down = true;
  const c = client(server, side);
  await c.store.open();
  return { server, ...c };
};

test("a write shows at once, queues one mutation and survives a reload", async () => {
  const { server, store, persistence } = await offline();
  idOf(await store.create("items", task("Book a hall")));
  const snap = store.getSnapshot();
  assert.deepEqual(titles(snap.rows.items), ["Book a hall"]);
  assert.equal(snap.pending, 1);
  assert.equal(snap.link, "offline");
  const saved = await persistence.load();
  assert.deepEqual(saved.outbox.map((entry) => [entry.op, entry.table]), [["create", "items"]]);
  assert.deepEqual(saved.rows.items, []);

  const reopened = client(server, "a", persistence);
  await reopened.store.open();
  assert.equal(reopened.store.getSnapshot().pending, 1);
  assert.deepEqual(titles(reopened.store.getSnapshot().rows.items), ["Book a hall"]);
});

test("an update sends only the fields that changed", async () => {
  const { store, persistence } = await offline();
  const id = idOf(await store.create("items", task("Book a hall")));
  idOf(await store.update("items", id, { title: "Book a hall", status: "done", done_on: "2026-10-06" }));
  const { outbox } = await persistence.load();
  assert.deepEqual(Object.keys(outbox[1].patch).sort(), ["done_on", "status", "updated_at"]);
  assert.equal(store.getSnapshot().rows.items.find((row) => row.id === id)?.status, "done");
});

test("a data patch carries only the changed keys and null removes one", async () => {
  const { store, persistence } = await offline();
  const id = idOf(
    await store.create("items", {
      kind: "vendor",
      title: "Caterer",
      status: "option",
      data: { phone: "+628123456789", pic: "Sam" },
    }),
  );
  idOf(await store.update("items", id, { data: { phone: "+628123456789", pic: null, facts: "no refunds" } }));
  const { outbox } = await persistence.load();
  assert.deepEqual(outbox[1].patch.data, { pic: null, facts: "no refunds" });
  assert.deepEqual(store.getSnapshot().rows.items.find((row) => row.id === id)?.data, {
    phone: "+628123456789",
    facts: "no refunds",
  });
});

test("an update that changes nothing queues nothing", async () => {
  const { store } = await offline();
  const id = idOf(await store.create("items", task("Book a hall")));
  const before = store.getSnapshot().pending;
  idOf(await store.update("items", id, { title: "Book a hall", due_on: null, data: {} }));
  assert.equal(store.getSnapshot().pending, before);
});

test("invalid writes are refused with the shared validator's errors and never queued", async () => {
  const { store } = await offline();
  const before = store.getSnapshot().pending;
  const bad = await store.create("items", { ...task("x"), due_on: "2026-02-30" });
  assert.equal(bad.ok, false);
  assert.match(bad.ok ? "" : bad.errors.join(), /due_on/);
  const id = idOf(await store.create("items", task("ok")));
  const worse = await store.update("items", id, { status: "bogus" });
  assert.equal(worse.ok, false);
  const missing = await store.update("items", "00000000-0000-4000-8000-000000000000", { title: "x" });
  assert.equal(missing.ok, false);
  const setting = await store.setSetting("ceremony_date", "not a date");
  assert.equal(setting.ok, false);
  assert.equal(store.getSnapshot().pending, before + 1);
});

test("delete hides the row locally and undo brings it back", async () => {
  const { store } = await offline();
  const id = idOf(await store.create("items", task("Book a hall")));
  idOf(await store.remove("items", id));
  assert.deepEqual(titles(store.getSnapshot().rows.items), []);
  idOf(await store.update("items", id, { deleted_at: null }));
  assert.deepEqual(titles(store.getSnapshot().rows.items), ["Book a hall"]);
});

test("settings are created once and a second write to the same key is folded into it", async () => {
  const { store, persistence } = await offline();
  idOf(await store.setSetting("partner_a_label", "Sam"));
  idOf(await store.setSetting("partner_a_label", "Alex"));
  const { outbox } = await persistence.load();
  assert.deepEqual(outbox.map((entry) => [entry.op, entry.row_id, entry.patch.value]), [["create", "partner_a_label", "Alex"]]);
  assert.equal(store.getSnapshot().rows.settings[0].value, "Alex");
  assert.equal((await store.remove("settings", "partner_a_label")).ok, false);
});

test("deleting any synced row is accepted by the server", async () => {
  const { server, store } = await offline();
  server.control.down = false;
  const id = idOf(await store.create("items", task("Book a hall")));
  await store.sync();
  idOf(await store.remove("items", id));
  await store.sync();
  const snap = store.getSnapshot();
  assert.deepEqual([snap.rejected.length, snap.pending], [0, 0]);
  assert.deepEqual(titles(snap.rows.items), []);
});
