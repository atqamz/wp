import { useState } from "react";
import { exclusive } from "../domain/once.ts";

export const useBusy = () => {
  const [exclusively] = useState(exclusive);
  const [busy, setBusy] = useState(false);
  const once = (work: () => Promise<void>) =>
    exclusively(async () => {
      setBusy(true);
      try {
        await work();
      } finally {
        setBusy(false);
      }
    });
  return { busy, once };
};
