import { useRef, useState } from "react";

export const useBusy = () => {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const once = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { busy, once };
};
