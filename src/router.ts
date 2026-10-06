import { useSyncExternalStore } from "react";

const subscribe = (notify: () => void) => {
  addEventListener("hashchange", notify);
  return () => removeEventListener("hashchange", notify);
};

export const useRoute = () => useSyncExternalStore(subscribe, () => location.hash.slice(1) || "/");
