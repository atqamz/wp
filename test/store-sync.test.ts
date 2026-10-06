import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_MUTATIONS } from "../shared/api.ts";
import { createApi } from "../src/store/api.ts";
import { memoryPersistence } from "../src/store/memory.ts";
import { BATCH_BYTES, takeBatch } from "../src/store/outbox.ts";
import type { Pending } from "../src/store/persistence.ts";
import { createStore } from "../src/store/store.ts";
import { createServer } from "./store-server.ts";
import type { Server } from "./store-server.ts";
import { client, idOf, pullOnly, task, titles } from "./store-client.ts";

const started = async (server: Server, side: "a" | "b" = "a") => {
  const c = client(server, side);
  await c.store.open();
  const project = idOf(await c.store.create("items", { kind: "project", title: "Plan", status: "active" }));
  await c.store.sync();
  return { ...c, project };
};

const posts = (server: Server) => server.seen.filter((request) => request.method === "POST");

test("offline writes flush once the server is back, with server-owned columns filled in", async () => {
  const server = createServer();
  server.control.down = true;
  const { store, persistence } = client(server, "b");
  await store.open();
  const project = idOf(await store.create("items", { kind: "project", title: "Plan", status: "active" }));
  const id = idOf(await store.create("items", task(project, "Book a hall")));
  await store.sync();
  assert.equal(store.getSnapshot().link, "offline");
  assert.equal(store.getSnapshot().pending, 2);
  assert.equal(server.rev, 0);

  server.control.down = false;
  await store.sync();
  const snap = store.getSnapshot();
  assert.deepEqual([snap.pending, snap.link, snap.me], [0, "online", "b"]);
  const row = snap.rows.items.find((item) => item.id === id)!;
  assert.deepEqual([row.rev, row.updated_by], [1, "b"]);
  assert.equal(server.row("items", id)?.title, "Book a hall");
  const saved = await persistence.load();
  assert.deepEqual([saved.outbox.length, saved.meta], [0, { rev: 1, me: "b" }]);
  assert.equal(saved.rows.items.length, 2);
});

test("the outbox goes out in write order, parents first", async () => {
  const server = createServer();
  server.control.down = true;
  const { store } = client(server, "a");
  await store.open();
  const project = idOf(await store.create("items", { kind: "project", title: "Plan", status: "active" }));
  const line = idOf(await store.create("budget_entries", { entry_type: "planned", title: "Venue", group_key: "reception", project_id: project, amount: 100 }));
  idOf(await store.create("budget_entries", { entry_type: "payment", title: "Deposit", budget_id: line, project_id: project, status: "due", amount: 50 }));
  server.control.down = false;
  await store.sync();
  assert.equal(store.getSnapshot().rejected.length, 0);
  assert.deepEqual(posts(server).map((request) => request.mutations), [3]);
  assert.equal(store.getSnapshot().rows.budget_entries.length, 2);
});

test("a rejected mutation is parked with its errors, the rest still goes out, nothing is retried blindly", async () => {
  const server = createServer();
  const { store, persistence, project } = await started(server);
  server.control.down = true;
  idOf(await store.create("items", task(project, "first")));
  const ghost = "00000000-0000-4000-8000-0000000000aa";
  idOf(await store.create("items", task(ghost, "orphan")));
  idOf(await store.create("items", task(project, "third")));
  server.control.down = false;
  const before = posts(server).length;
  await store.sync();
  const snap = store.getSnapshot();
  assert.equal(snap.pending, 0);
  assert.equal(snap.rejected.length, 1);
  assert.equal(snap.rejected[0].patch.title, "orphan");
  assert.match(snap.rejected[0].rejected!.join(), /project_id/);
  assert.deepEqual(titles(snap.rows.items), ["Plan", "first", "third"]);
  assert.deepEqual(posts(server).slice(before).map((request) => request.mutations), [3, 2]);
  assert.equal(server.row("items", snap.rejected[0].row_id), undefined);

  await store.sync();
  await store.sync();
  assert.equal(posts(server).length, before + 2);

  const reopened = client(server, "a", persistence);
  await reopened.store.open();
  assert.equal(reopened.store.getSnapshot().rejected.length, 1);
  await reopened.store.discard(snap.rejected[0].seq);
  assert.equal(reopened.store.getSnapshot().rejected.length, 0);
  assert.equal((await persistence.load()).outbox.length, 0);
});

test("a rejection without an index parks the head of the request", async () => {
  const server = createServer();
  const real = server.as("a");
  let refused = false;
  const fetcher: typeof real = async (url, init) => {
    if (init.method === "POST" && !refused) {
      refused = true;
      return Response.json({ status: 400, errors: ["body: malformed"] }, { status: 400 });
    }
    return real(url, init);
  };
  const persistence = memoryPersistence();
  const store = createStore({ persistence, api: createApi(fetcher) });
  await store.open();
  const project = idOf(await store.create("items", { kind: "project", title: "Plan", status: "active" }));
  await store.sync();
  assert.deepEqual(store.getSnapshot().rejected.map((entry) => entry.row_id), [project]);
  assert.equal(store.getSnapshot().pending, 0);
});

test("a 5xx or a network failure keeps the outbox and waits for the next trigger", async () => {
  const server = createServer();
  const { store, project } = await started(server);
  idOf(await store.create("items", task(project, "later")));
  await store.sync();

  server.control.fail = [500, 502, 503];
  idOf(await store.create("items", task(project, "one")));
  await store.sync();
  assert.deepEqual([store.getSnapshot().link, store.getSnapshot().pending, store.getSnapshot().rejected.length], ["offline", 1, 0]);
  const left = server.control.fail.length;
  await store.sync();
  assert.equal(server.control.fail.length, left - 1);

  server.control.fail = [];
  server.control.down = true;
  await store.sync();
  assert.deepEqual([store.getSnapshot().link, store.getSnapshot().pending], ["offline", 1]);

  server.control.down = false;
  await store.sync();
  assert.deepEqual([store.getSnapshot().link, store.getSnapshot().pending], ["online", 0]);
  assert.equal(titles(store.getSnapshot().rows.items).includes("one"), true);
});

for (const session of ["redirect", "html", "unauthorized"] as const) {
  test(`an expired session (${session}) stops flushing, asks for a login and keeps the outbox`, async () => {
    const server = createServer();
    const { store, persistence, project } = await started(server);
    server.control.session = session;
    idOf(await store.create("items", task(project, "while expired")));
    await store.sync();
    assert.deepEqual([store.getSnapshot().link, store.getSnapshot().pending, store.getSnapshot().rejected.length], ["expired", 1, 0]);
    assert.equal((await persistence.load()).outbox.length, 1);

    server.control.session = "ok";
    const requests = server.seen.length;
    idOf(await store.create("items", task(project, "no request while the login is pending")));
    assert.equal(server.seen.length, requests);
    assert.equal(store.getSnapshot().link, "expired");

    await store.sync();
    assert.deepEqual([store.getSnapshot().link, store.getSnapshot().pending], ["online", 0]);
    assert.equal(titles(store.getSnapshot().rows.items).length, 3);
  });
}

test("an expired pull keeps the local rows and the login state", async () => {
  const server = createServer();
  const { store, project } = await started(server);
  idOf(await store.create("items", task(project, "kept")));
  await store.sync();
  server.control.session = "html";
  await store.sync();
  assert.equal(store.getSnapshot().link, "expired");
  assert.deepEqual(titles(store.getSnapshot().rows.items), ["Plan", "kept"]);
  assert.equal(store.getSnapshot().ready, true);
});

const pending = (n: number, size = 10): Pending[] =>
  Array.from({ length: n }, (_, seq) => ({
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    table: "items",
    op: "update",
    row_id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    patch: { note: "x".repeat(size) },
    seq,
    at: "2026-10-06T00:00:00Z",
  }));

test("a batch holds at most MAX_MUTATIONS", () => {
  assert.equal(takeBatch(pending(MAX_MUTATIONS + 5)).length, MAX_MUTATIONS);
  assert.equal(takeBatch(pending(3)).length, 3);
  assert.equal(takeBatch([]).length, 0);
});

test("a batch stops before the body passes the size cap, but always holds one", () => {
  const entry = 100_000;
  const batch = takeBatch(pending(12, entry));
  assert.equal(batch.length, Math.floor(BATCH_BYTES / (entry + 200)));
  assert.equal(takeBatch(pending(3, BATCH_BYTES + 1)).length, 1);
  const bytes = new TextEncoder().encode(JSON.stringify({ mutations: batch.map(({ id, table, op, row_id, patch }) => ({ id, table, op, row_id, patch })) })).length;
  assert.equal(bytes <= BATCH_BYTES, true);
});

test("a long outbox goes out in requests of at most MAX_MUTATIONS", async () => {
  const server = createServer();
  const { store, project } = await started(server);
  server.control.down = true;
  for (let n = 0; n < 45; n++) idOf(await store.create("items", task(project, `task ${n}`)));
  server.control.down = false;
  const before = posts(server).length;
  await store.sync();
  assert.deepEqual(posts(server).slice(before).map((request) => request.mutations), [20, 20, 5]);
  assert.equal(store.getSnapshot().pending, 0);
  assert.equal(server.row("items", store.getSnapshot().rows.items[0].id) !== undefined, true);
});

test("oversized pending mutations are split by the size cap and sent in order", async () => {
  const bodies: string[] = [];
  const reply = (body: unknown) => Response.json(body);
  const fetcher = async (url: string, init: RequestInit) => {
    if (init.method === "POST") {
      bodies.push(String(init.body));
      return reply({ rev: bodies.length, rows: { items: [], budget_entries: [], settings: [] } });
    }
    return reply({ rev: bodies.length, me: "a", changes: { items: [], budget_entries: [], settings: [] } });
  };
  const persistence = memoryPersistence();
  await persistence.write({ outbox: { put: pending(12, 100_000) } });
  const store = createStore({ persistence, api: createApi(fetcher) });
  await store.open();
  const counts = bodies.map((body) => (JSON.parse(body) as { mutations: unknown[] }).mutations.length);
  assert.deepEqual(counts, [5, 5, 2]);
  assert.equal(bodies.every((body) => new TextEncoder().encode(body).length <= BATCH_BYTES), true);
  assert.equal(store.getSnapshot().pending, 0);
});

test("two phones converge: creates, field-level edits, delete wins, undo", async () => {
  const server = createServer();
  const a = await started(server, "a");
  const b = client(server, "b");
  await b.store.open();
  const id = idOf(await a.store.create("items", task(a.project, "Book a hall")));
  await a.store.sync();
  await b.store.sync();
  assert.deepEqual(titles(b.store.getSnapshot().rows.items), ["Book a hall", "Plan"]);
  assert.equal(b.store.getSnapshot().me, "b");

  server.control.down = true;
  idOf(await a.store.update("items", id, { amount: 750_000 }));
  idOf(await b.store.update("items", id, { status: "done", done_on: "2026-10-06" }));
  server.control.down = false;
  await a.store.sync();
  await b.store.sync();
  await a.store.sync();
  for (const side of [a, b]) {
    const row = side.store.getSnapshot().rows.items.find((item) => item.id === id)!;
    assert.deepEqual([row.amount, row.status], [750_000, "done"]);
  }

  server.control.down = true;
  idOf(await a.store.update("items", id, { title: "from a" }));
  idOf(await b.store.update("items", id, { title: "from b" }));
  server.control.down = false;
  await a.store.sync();
  await b.store.sync();
  await a.store.sync();
  assert.equal(a.store.getSnapshot().rows.items.find((item) => item.id === id)?.title, "from b");

  server.control.down = true;
  idOf(await a.store.remove("items", id));
  idOf(await b.store.update("items", id, { note: "late edit" }));
  server.control.down = false;
  await b.store.sync();
  await a.store.sync();
  await b.store.sync();
  for (const side of [a, b]) assert.deepEqual(titles(side.store.getSnapshot().rows.items), ["Plan"]);

  idOf(await b.store.update("items", id, { deleted_at: null }));
  await b.store.sync();
  await a.store.sync();
  for (const side of [a, b]) assert.deepEqual(titles(side.store.getSnapshot().rows.items), ["Plan", "from b"]);
});

test("a tombstone from the server hides the row but stays stored", async () => {
  const server = createServer();
  const a = await started(server, "a");
  const b = client(server, "b");
  await b.store.open();
  const id = idOf(await a.store.create("items", task(a.project, "gone")));
  await a.store.sync();
  await b.store.sync();
  idOf(await a.store.remove("items", id));
  await a.store.sync();
  await b.store.sync();
  assert.deepEqual(titles(b.store.getSnapshot().rows.items), ["Plan"]);
  const stored = (await b.persistence.load()).rows.items.find((row) => row.id === id);
  assert.equal(typeof stored?.deleted_at, "string");
  assert.equal(server.row("items", id)?.deleted_at !== null, true);
  const reopened = client(server, "b", b.persistence);
  await reopened.store.open();
  assert.deepEqual(titles(reopened.store.getSnapshot().rows.items), ["Plan"]);
});

test("the pull cursor follows pulls only: a push result must not skip another phone's writes", async () => {
  const server = createServer();
  const a = await started(server, "a");
  const b = client(server, "b");
  await b.store.open();
  await b.store.sync();
  idOf(await b.store.create("items", task(a.project, "from b")));
  await b.store.sync();
  idOf(await a.store.create("items", task(a.project, "from a")));
  await a.store.sync();
  assert.deepEqual(titles(a.store.getSnapshot().rows.items), ["Plan", "from a", "from b"]);
  assert.equal((await a.persistence.load()).meta.rev, server.rev);
});

test("pulls start from the stored rev and apply rows by rev only", async () => {
  const server = createServer();
  const a = await started(server, "a");
  const id = idOf(await a.store.create("items", task(a.project, "v1")));
  await a.store.sync();
  idOf(await a.store.update("items", id, { title: "v2" }));
  await a.store.sync();
  const known = (await a.persistence.load()).meta.rev;
  const reopened = client(server, "a", a.persistence);
  await reopened.store.open();
  assert.equal(server.seen.at(-1)?.since, known);

  const stale = { ...(await a.persistence.load()).rows.items.find((row) => row.id === id)!, title: "old", rev: 1 };
  const fetcher = async (_url: string, init: RequestInit) =>
    Response.json(
      init.method === "POST"
        ? { rev: 9, rows: { items: [], budget_entries: [], settings: [] } }
        : { rev: 1, me: "a", changes: { items: [stale], budget_entries: [], settings: [] } },
    );
  const lagging = createStore({ persistence: a.persistence, api: createApi(fetcher) });
  await lagging.open();
  assert.equal(lagging.getSnapshot().rows.items.find((row) => row.id === id)?.title, "v2");
  assert.equal((await a.persistence.load()).meta.rev, known);
});

test("the identity is cached for offline reopens, and a never-synced offline start is still ready", async () => {
  const server = createServer();
  const a = await started(server, "a");
  server.control.down = true;
  const reopened = client(server, "a", a.persistence);
  await reopened.store.open();
  assert.deepEqual([reopened.store.getSnapshot().me, reopened.store.getSnapshot().ready], ["a", true]);

  const fresh = client(server, "b");
  assert.equal(fresh.store.getSnapshot().ready, false);
  await fresh.store.open();
  assert.deepEqual([fresh.store.getSnapshot().me, fresh.store.getSnapshot().ready, fresh.store.getSnapshot().link], [null, true, "offline"]);
});

test("writes made during a flush are sent by the same trigger", async () => {
  const server = createServer();
  const { store, project } = await started(server);
  const first = store.create("items", task(project, "one"));
  const second = store.create("items", task(project, "two"));
  await Promise.all([first, second]);
  await store.sync();
  assert.equal(store.getSnapshot().pending, 0);
  assert.deepEqual(titles(store.getSnapshot().rows.items), ["Plan", "one", "two"]);
});
