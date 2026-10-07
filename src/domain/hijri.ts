import { addDays } from "./dates.ts";

export const HIJRI_OFFSETS = [-1, 0, 1] as const;

export const hijriChoices = (current: number): number[] => [...new Set([current, ...HIJRI_OFFSETS])].sort((a, b) => a - b);

const formatter = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const hijriOf = (date: string, offset = 0): string | null => {
  if (formatter.resolvedOptions().calendar !== "islamic-umalqura") return null;
  const parts = Object.fromEntries(formatter.formatToParts(new Date(`${addDays(date, offset)}T00:00:00Z`)).map((part) => [part.type, part.value]));
  return `${parts.day} ${parts.month} ${parts.year}`;
};
