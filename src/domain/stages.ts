import type { ItemRow } from "../../shared/tables.ts";
import { MONTH_MAX, STAGES_MAX, stageProblems } from "../../shared/validate.ts";
import type { Stage } from "../../shared/validate.ts";

export type { Stage };

export const STAGES: readonly Stage[] = [
  { key: "foundations", name: "Foundations", from: -17, to: -14 },
  { key: "bookings", name: "Big bookings", from: -13, to: -11 },
  { key: "lamaran", name: "Lamaran", from: -10, to: -10 },
  { key: "details", name: "Details", from: -9, to: -4 },
  { key: "kua", name: "KUA and papers", from: -3, to: -2 },
  { key: "invitations", name: "Invitations", from: -1, to: -1 },
  { key: "akad", name: "The akad", from: 0, to: 0 },
];

export const parseStages = (value: string | null): readonly Stage[] => {
  if (value === null) return STAGES;
  try {
    const list: unknown = JSON.parse(value);
    return stageProblems(list).length === 0 ? (list as Stage[]) : STAGES;
  } catch {
    return STAGES;
  }
};

const firstFree = (make: (n: number) => string, taken: ReadonlySet<string>) => {
  let n = 1;
  while (taken.has(make(n).toLowerCase())) n++;
  return make(n);
};

export const canAddStage = (list: readonly Stage[]) => list.length < STAGES_MAX && (list.at(-1)?.to ?? -1) < MONTH_MAX;

export const addStage = (list: readonly Stage[]): Stage[] => {
  if (!canAddStage(list)) return [...list];
  const month = (list.at(-1)?.to ?? -1) + 1;
  const key = firstFree((n) => `stage_${n}`, new Set(list.map((stage) => stage.key)));
  const name = firstFree((n) => (n === 1 ? "New stage" : `New stage ${n}`), new Set(list.map((stage) => stage.name.toLowerCase())));
  return [...list, { key, name, from: month, to: month }];
};

export const removeStage = (list: readonly Stage[], index: number): Stage[] => (list.length > 1 ? list.filter((_, at) => at !== index) : [...list]);

export const moveStage = (list: readonly Stage[], index: number, step: -1 | 1): Stage[] => {
  const other = index + step;
  if (other < 0 || other >= list.length) return [...list];
  return list.map((stage, at) =>
    at === index ? { ...list[other], from: stage.from, to: stage.to } : at === other ? { ...list[index], from: stage.from, to: stage.to } : stage,
  );
};

export type StageState = "past" | "now" | "next" | "later";

export type Station = Stage & { start: string; end: string; state: StageState; day: boolean; total: number; done: number };

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
    return {
      ...stage,
      start,
      end,
      state,
      day: stage.from <= 0 && stage.to >= 0,
      total: tasksOf.length,
      done: tasksOf.filter((task) => task.status === "done").length,
    };
  });
};
