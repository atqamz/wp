import { useSyncExternalStore } from "react";
import type { Field, Kind } from "../domain/draft.ts";

export type SheetDraft = { input: string; kindPick: Kind | null; ignore: Field[]; edits: Record<string, string>; ownerPick: string | null };

export const withSeed = (kept: string, seed: string) => [kept.trim(), seed.trim()].filter((part) => part !== "").join(" ");

type State = { adding: boolean; seed: string; session: number; toast: { id: number; message: string } | null };

const TOAST_MS = 6000;

let state: State = { adding: false, seed: "", session: 0, toast: null };
let opener: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let toasts = 0;
let kept: SheetDraft | null = null;
const listeners = new Set<() => void>();

const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

export const overlay = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  getSnapshot: () => state,
  openAdd: (seed = "") => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    set({ adding: true, seed, session: state.session + 1 });
  },
  closeAdd: () => set({ adding: false }),
  keepDraft: (draft: SheetDraft | null) => {
    kept = draft;
  },
  keptDraft: () => kept,
  returnFocus: () => {
    const target = opener?.isConnected ? opener : document.querySelector<HTMLElement>("h1");
    opener = null;
    target?.focus({ preventScroll: true });
  },
  announce: (message: string) => {
    clearTimeout(timer);
    set({ toast: { id: ++toasts, message } });
    timer = setTimeout(() => set({ toast: null }), TOAST_MS);
  },
};

export const useOverlay = () => useSyncExternalStore(overlay.subscribe, overlay.getSnapshot);
