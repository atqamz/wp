import type { ItemRow } from "../../shared/tables.ts";

export type Headcount = { guests: number; people: number };

export type Side = "a" | "b" | "none";

export const headcount = (guests: readonly ItemRow[]): Record<Side, Headcount> => {
  const count = { a: { guests: 0, people: 0 }, b: { guests: 0, people: 0 }, none: { guests: 0, people: 0 } };
  for (const guest of guests) {
    if (guest.kind !== "guest" || guest.status === "declined") continue;
    const side = guest.who === "a" || guest.who === "b" ? guest.who : "none";
    count[side].guests += 1;
    count[side].people += guest.qty ?? 1;
  }
  return count;
};

export const total = (count: Record<Side, Headcount>): Headcount => ({
  guests: count.a.guests + count.b.guests + count.none.guests,
  people: count.a.people + count.b.people + count.none.people,
});
