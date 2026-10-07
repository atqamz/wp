import { screenOf } from "./routes.ts";
import type { Screen } from "./routes.ts";
import { text } from "./text.ts";

type Item = { section: string; icon: "home" | "money" | "people" | "settings"; label: string; screens: readonly Screen[]; rail?: true };

const items: Item[] = [
  { section: "", icon: "home", label: text.nav.home, screens: ["home", "tasks"] },
  { section: "money", icon: "money", label: text.nav.money, screens: ["money", "payments"] },
  { section: "people", icon: "people", label: text.nav.people, screens: ["people"] },
  { section: "settings", icon: "settings", label: text.nav.settings, screens: ["settings"], rail: true },
];

export const navItems = (kind: "tabs" | "rail") => (kind === "rail" ? items : items.filter((item) => !item.rail));

export const isCurrent = (item: Item, section: string) => {
  const screen = screenOf(section);
  return screen !== null && item.screens.includes(screen);
};
