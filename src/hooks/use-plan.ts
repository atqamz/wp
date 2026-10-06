import { useEffect, useMemo, useState } from "react";
import { todayIn } from "../domain/dates.ts";
import { sideName } from "../domain/names.ts";
import { readSettings } from "../domain/settings.ts";
import { text } from "../ui/text.ts";
import { useSnapshot, useTable } from "./use-store.ts";

export const useSettings = () => {
  const rows = useTable("settings");
  return useMemo(() => readSettings(rows), [rows]);
};

export const useToday = () => {
  const { timezone } = useSettings();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  return todayIn(now, timezone);
};

export const useStamp = () => {
  const { timezone } = useSettings();
  return () => todayIn(new Date(), timezone);
};

export const usePartner = () => {
  const { partnerA, partnerB } = useSettings();
  const { me } = useSnapshot();
  const label = (side: string | null) => sideName(side, me, { a: partnerA, b: partnerB }, text);
  return { me, label };
};
