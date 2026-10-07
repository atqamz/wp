import type { ReactNode } from "react";
import { actions, useSnapshot } from "../hooks/use-store.ts";
import { Pair } from "./avatar.tsx";
import { Icon } from "./icons.tsx";
import { navItems } from "./nav.ts";
import { SyncBadge } from "./sync-badge.tsx";
import { text } from "./text.ts";

function Nav({ className, section }: { className: "tabs" | "rail"; section: string }) {
  return (
    <nav className={className} aria-label={text.nav.label}>
      {navItems(className).map((item) => (
        <a key={item.section} href={`#/${item.section}`} aria-current={item.section === section ? "page" : undefined}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

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
        <Nav className="rail" section={section} />
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
      <Nav className="tabs" section={section} />
    </div>
  );
}
