import { text } from "./text.ts";

type Item = { section: string; icon: "home" | "money" | "people" | "settings"; label: string; also: readonly string[]; rail?: true };

const items: Item[] = [
  { section: "", icon: "home", label: text.nav.home, also: ["tasks"] },
  { section: "money", icon: "money", label: text.nav.money, also: ["budget", "payments"] },
  { section: "people", icon: "people", label: text.nav.people, also: ["guests", "vendors"] },
  { section: "settings", icon: "settings", label: text.nav.settings, also: [], rail: true },
];

export const navItems = (kind: "tabs" | "rail") => (kind === "rail" ? items : items.filter((item) => !item.rail));

export const isCurrent = (item: Item, section: string) => item.section === section || item.also.includes(section);
