import { createApi } from "./api.ts";
import { indexedDbPersistence } from "./db.ts";
import { createStore } from "./store.ts";

export const store = createStore({
  persistence: indexedDbPersistence(),
  api: createApi((url, init) => fetch(url, init)),
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") void store.sync();
});

addEventListener("online", () => void store.sync());
