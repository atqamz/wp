import type { ItemRow } from "../../shared/tables.ts";

export type Stage = { key: string; name: string; from: number; to: number };

export const STAGES: readonly Stage[] = [
  { key: "foundations", name: "Foundations", from: -17, to: -14 },
  { key: "bookings", name: "Big bookings", from: -13, to: -11 },
  { key: "lamaran", name: "Lamaran", from: -10, to: -10 },
  { key: "details", name: "Details", from: -9, to: -4 },
  { key: "kua", name: "KUA and papers", from: -3, to: -2 },
  { key: "invitations", name: "Invitations", from: -1, to: -1 },
  { key: "akad", name: "The akad", from: 0, to: 0 },
];

export type StageState = "past" | "now" | "next" | "later";

export type Station = Stage & { start: string; end: string; state: StageState; total: number; done: number };

const day = (month: number, date: number) => new Date(Date.UTC(Math.floor(month / 12), month % 12, date)).toISOString().slice(0, 10);

export const routeOf = (ceremony: string, today: string, tasks: readonly ItemRow[], stages: readonly Stage[] = STAGES): Station[] => {
  const [year, month] = ceremony.split("-").map(Number);
  const anchor = year * 12 + month - 1;
  const own = (stage: Stage) =>
    tasks.filter((task) => {
      const group = task.group_key?.trim().toLowerCase();
      return task.kind === "task" && (group === stage.key || group === stage.name.toLowerCase());
    });
  let next = true;
  return stages.map((stage) => {
    const start = day(anchor + stage.from, 1);
    const end = day(anchor + stage.to + 1, 0);
    const state: StageState = end < today ? "past" : start <= today ? "now" : next ? "next" : "later";
    if (state === "next") next = false;
    const tasksOf = own(stage);
    return { ...stage, start, end, state, total: tasksOf.length, done: tasksOf.filter((task) => task.status === "done").length };
  });
};
