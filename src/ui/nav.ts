import { text } from "./text.ts";

type Item = { section: string; icon: "home" | "tasks" | "budget" | "vendors" | "guests" | "settings"; label: string; rail?: true };

const items: Item[] = [
  { section: "", icon: "home", label: text.nav.home },
  { section: "tasks", icon: "tasks", label: text.nav.tasks },
  { section: "budget", icon: "budget", label: text.nav.budget },
  { section: "vendors", icon: "vendors", label: text.nav.vendors },
  { section: "guests", icon: "guests", label: text.nav.guests },
  { section: "settings", icon: "settings", label: text.nav.settings, rail: true },
];

export const navItems = (kind: "tabs" | "rail") => (kind === "rail" ? items : items.filter((item) => !item.rail));
