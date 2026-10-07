import { useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

const PANE_REM = 60;

export const useRoom = (anchor: RefObject<HTMLElement | null>) => {
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const host = anchor.current?.closest(".content");
    if (!host) return;
    const measure = () => setWide(host.clientWidth >= PANE_REM * parseFloat(getComputedStyle(document.documentElement).fontSize));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [anchor]);
  return wide;
};
