import type { ReactNode } from "react";
import { actions, useSnapshot } from "../hooks/use-store.ts";
import { Pair } from "./avatar.tsx";
import { Icon } from "./icons.tsx";
import type { IconName } from "./icons.tsx";
import { SyncBadge } from "./sync-badge.tsx";
import { text } from "./text.ts";

const tabs: { section: string; icon: IconName; label: string; wide?: true }[] = [
  { section: "", icon: "home", label: text.nav.home },
  { section: "tasks", icon: "tasks", label: text.nav.tasks },
  { section: "budget", icon: "budget", label: text.nav.budget },
  { section: "vendors", icon: "vendors", label: text.nav.vendors },
  { section: "guests", icon: "guests", label: text.nav.guests },
  { section: "settings", icon: "settings", label: text.nav.settings, wide: true },
];

export function Shell({ section, children }: { section: string; children: ReactNode }) {
  const { notice } = useSnapshot();
  const home = section === "";
  return (
    <div className="shell">
      <div className="chrome">
        <header className="bar" data-hero={home || undefined}>
          <a className="brand" href="#/">
            {text.appName}
          </a>
          <SyncBadge />
          <a className="pair" href="#/settings" aria-label={text.nav.settings} aria-current={section === "settings" ? "page" : undefined}>
            <Pair />
          </a>
        </header>
        <nav className="tabs" aria-label={text.nav.label}>
          {tabs.map((tab) => (
            <a key={tab.section} href={`#/${tab.section}`} data-wide={tab.wide} aria-current={tab.section === section ? "page" : undefined}>
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </a>
          ))}
        </nav>
      </div>
      <div className="content">
        {notice && (
          <div className="notice" role="status">
            <p>
              {text.notice.reset}
              {notice.discarded > 0 && ` ${text.notice.discarded(notice.discarded)}`}
            </p>
            <button type="button" className="secondary" onClick={actions.dismissNotice}>
              {text.notice.dismiss}
            </button>
          </div>
        )}
        <main data-page={home ? "home" : undefined}>{children}</main>
      </div>
    </div>
  );
}
