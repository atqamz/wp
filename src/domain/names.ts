import type { Side } from "../../shared/api.ts";

export type Words = { you: string; them: string; both: string; nobody: string };

export const sideName = (
  side: string | null,
  me: Side | null,
  nicknames: { a: string | null; b: string | null },
  words: Words,
) =>
  side === "a" || side === "b"
    ? (nicknames[side] ?? (side === me ? words.you : words.them))
    : side === "both"
      ? words.both
      : words.nobody;
