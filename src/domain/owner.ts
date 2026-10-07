import type { Side } from "../../shared/api.ts";

export const OWNERS = ["everyone", "mine", "theirs"] as const;

export type Owner = (typeof OWNERS)[number];

export const owns = (who: string | null, owner: Owner, me: Side | null) => {
  if (owner === "everyone" || me === null) return true;
  const wanted = owner === "mine" ? me : me === "a" ? "b" : "a";
  return who === wanted || who === "both";
};
