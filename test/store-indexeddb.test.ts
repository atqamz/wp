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

test("a reset clears the three row stores, the outbox and meta in one transaction, then writes the new meta", async () => {
  await withFake({ epoch: "old" }, async ({ calls, transactions }) => {
    const applied = await indexedDbPersistence("fake").reset("old", { epoch: "new", rev: 0, me: "a" });
    assert.equal(applied, true);
    assert.equal(transactions.length, 1);
    assert.deepEqual(transactions[0].sort(), [...tableNames, "meta", "outbox"].sort());
    const clears = calls.filter((call) => call.op === "clear").map((call) => call.store);
    assert.deepEqual(clears.sort(), [...tableNames, "meta", "outbox"].sort());
    const puts = calls.filter((call) => call.op === "put");
    assert.deepEqual(puts.map((call) => [call.store, call.args[1], call.args[0]]), [
      ["meta", "epoch", "new"],
      ["meta", "rev", 0],
      ["meta", "me", "a"],
    ]);
    const lastClear = calls.map((call) => call.op).lastIndexOf("clear");
    const firstPut = calls.map((call) => call.op).indexOf("put");
    assert.ok(lastClear < firstPut);
    assert.equal(new Set(calls.map((call) => call.transaction)).size, 1);
  });
});

test("a reset does nothing when the stored epoch is no longer the one the caller believed foreign", async () => {
  await withFake({ epoch: "reset by another tab" }, async ({ calls }) => {
    assert.equal(await indexedDbPersistence("fake").reset("old", { epoch: "new", rev: 0, me: "a" }), false);
    assert.deepEqual(calls, []);
  });
  await withFake({}, async ({ calls }) => {
    assert.equal(await indexedDbPersistence("fake").reset("old", { epoch: "new", rev: 0, me: "a" }), false);
    assert.equal(await indexedDbPersistence("fake").reset(null, { epoch: "new", rev: 0, me: "a" }), true);
    assert.equal(calls.filter((call) => call.op === "clear").length, 5);
  });
});
