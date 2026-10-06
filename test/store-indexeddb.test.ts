import { test } from "node:test";
import assert from "node:assert/strict";
import { tableNames } from "../shared/tables.ts";
import { indexedDbPersistence } from "../src/store/db.ts";

type Call = { transaction: number; store: string; op: string; args: unknown[] };

const fakeIndexedDb = (meta: Record<string, unknown>) => {
  const calls: Call[] = [];
  const transactions: string[][] = [];
  const answer = <T>(result: T) => {
    const request: { result: T; onsuccess?: () => void; onerror?: () => void } = { result };
    queueMicrotask(() => request.onsuccess?.());
    return request;
  };
  const db = {
    createObjectStore: () => undefined,
    transaction: (names: string[], mode: string) => {
      const id = transactions.push(names);
      assert.equal(mode === "readwrite" || mode === "readonly", true);
      const tx: { oncomplete?: () => void; objectStore: (name: string) => unknown } = {
        objectStore: (store) => ({
          clear: () => calls.push({ transaction: id, store, op: "clear", args: [] }),
          put: (...args: unknown[]) => calls.push({ transaction: id, store, op: "put", args }),
          delete: (...args: unknown[]) => calls.push({ transaction: id, store, op: "delete", args }),
          getAll: () => answer([]),
          get: (key: string) => answer(store === "meta" ? meta[key] : undefined),
        }),
      };
      setTimeout(() => tx.oncomplete?.(), 0);
      return tx;
    },
  };
  const indexedDB = {
    open: () => {
      const request: { result: typeof db; onupgradeneeded?: () => void; onsuccess?: () => void } = { result: db };
      queueMicrotask(() => {
        request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
  return { indexedDB, calls, transactions };
};

const withFake = async (meta: Record<string, unknown>, run: (fake: ReturnType<typeof fakeIndexedDb>) => Promise<void>) => {
  const fake = fakeIndexedDb(meta);
  Object.assign(globalThis, { indexedDB: fake.indexedDB });
  try {
    await run(fake);
  } finally {
    Reflect.deleteProperty(globalThis, "indexedDB");
  }
};

const next = { epoch: "new", rev: 0, me: "a" } as const;

test("a reset clears the three row stores, the outbox and meta in one transaction, then writes the new meta with a fresh generation", async () => {
  await withFake({ generation: "g1" }, async ({ calls, transactions }) => {
    const generation = await indexedDbPersistence("fake").reset("g1", next);
    assert.match(generation ?? "", /^[0-9a-f-]{36}$/);
    assert.notEqual(generation, "g1");
    assert.equal(transactions.length, 1);
    assert.deepEqual(transactions[0].sort(), [...tableNames, "meta", "outbox"].sort());
    const clears = calls.filter((call) => call.op === "clear").map((call) => call.store);
    assert.deepEqual(clears.sort(), [...tableNames, "meta", "outbox"].sort());
    const puts = calls.filter((call) => call.op === "put");
    assert.deepEqual(puts.map((call) => [call.store, call.args[1], call.args[0]]), [
      ["meta", "epoch", "new"],
      ["meta", "rev", 0],
      ["meta", "me", "a"],
      ["meta", "generation", generation],
    ]);
    const lastClear = calls.map((call) => call.op).lastIndexOf("clear");
    const firstPut = calls.map((call) => call.op).indexOf("put");
    assert.ok(lastClear < firstPut);
    assert.equal(new Set(calls.map((call) => call.transaction)).size, 1);
  });
});

test("a reset does nothing when another tab has reset since the caller read its generation", async () => {
  await withFake({ generation: "written by the other tab", epoch: "same epoch" }, async ({ calls }) => {
    assert.equal(await indexedDbPersistence("fake").reset("g1", next), null);
    assert.equal(await indexedDbPersistence("fake").reset(null, next), null);
    assert.deepEqual(calls, []);
  });
});

test("a database that never reset has no generation, which matches only a caller that saw none", async () => {
  await withFake({ epoch: "same epoch" }, async ({ calls }) => {
    assert.equal(await indexedDbPersistence("fake").reset("g1", next), null);
    assert.deepEqual(calls, []);
    assert.notEqual(await indexedDbPersistence("fake").reset(null, next), null);
    assert.equal(calls.filter((call) => call.op === "clear").length, 5);
  });
});

test("a reset caused by a lower revision keeps the epoch and still changes the generation", async () => {
  await withFake({ epoch: "same epoch", generation: "g1" }, async ({ calls }) => {
    const generation = await indexedDbPersistence("fake").reset("g1", { epoch: "same epoch", rev: 0, me: "a" });
    assert.notEqual(generation, null);
    assert.notEqual(generation, "g1");
    assert.deepEqual(calls.filter((call) => call.op === "put").map((call) => call.args[1]), ["epoch", "rev", "me", "generation"]);
  });
});
