import type { ReactNode } from "react";
import { actions, useSnapshot } from "../hooks/use-store.ts";
import { Icon } from "./icons.tsx";
import type { IconName } from "./icons.tsx";
import { SyncBadge } from "./sync-badge.tsx";
import { text } from "./text.ts";

const tabs: { section: string; icon: IconName; label: string }[] = [
  { section: "", icon: "week", label: text.nav.week },
  { section: "tasks", icon: "tasks", label: text.nav.tasks },
  { section: "budget", icon: "budget", label: text.nav.budget },
  { section: "vendors", icon: "vendors", label: text.nav.vendors },
  { section: "guests", icon: "guests", label: text.nav.guests },
];

export function Shell({ section, children }: { section: string; children: ReactNode }) {
  const { notice } = useSnapshot();
  return (
    <>
      <header className="bar">
        <span className="app-title">{text.appName}</span>
        <SyncBadge />
        <a className="icon-link" href="#/settings" aria-label={text.nav.settings} aria-current={section === "settings" ? "page" : undefined}>
          <Icon name="settings" />
        </a>
      </header>
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
      <main>{children}</main>
      <nav className="tabs" aria-label={text.nav.label}>
        {tabs.map((tab) => (
          <a key={tab.section} href={`#/${tab.section}`} aria-current={tab.section === section ? "page" : undefined}>
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </a>
        ))}
      </nav>
    </>
  );
}
