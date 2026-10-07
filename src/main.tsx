import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { screenFor } from "./domain/status.ts";
import { openStore, useSnapshot } from "./hooks/use-store.ts";
import { useRoute } from "./router.ts";
import { ErrorBoundary } from "./ui/error-boundary.tsx";
import { Recovery } from "./ui/recovery-screen.tsx";
import { screenOf } from "./ui/routes.ts";
import { Shell } from "./ui/shell.tsx";
import { text } from "./ui/text.ts";
import { Title } from "./ui/title.tsx";
import { Connect } from "./views/connect.tsx";
import { GenericItem } from "./views/generic-item.tsx";
import { Home } from "./views/home.tsx";
import { MoneyView } from "./views/money.tsx";
import { People } from "./views/people.tsx";
import { Settings } from "./views/settings.tsx";
import { Sync } from "./views/sync.tsx";
import { Tasks } from "./views/tasks.tsx";
import "./tokens.css";
import "./style.css";
import "./ui/ui.css";
import "./views/home.css";
import "./views/money.css";
import "./views/people.css";

function Page({ section, id }: { section: string; id?: string }) {
  const screen = screenOf(section);
  switch (screen) {
    case "home":
      return <Home />;
    case "tasks":
      return id ? <GenericItem key={id} name="task" id={id} /> : <Tasks />;
    case "money":
      return <MoneyView id={id} />;
    case "payments":
      return id ? <GenericItem key={id} name="payment" id={id} /> : <MoneyView />;
    case "people":
      return <People route={section} id={id} />;
    case "settings":
      return <Settings />;
    case "sync":
      return <Sync />;
    case null:
      return <Title>{text.notFound}</Title>;
  }
}

function App() {
  const { ready, me } = useSnapshot();
  const route = useRoute();
  const [section = "", id] = route.split("/").filter(Boolean);
  const first = useRef(true);
  const split = useRef<Element | null>(null);

  useEffect(() => {
    const now = document.querySelector(".split");
    const selecting = now !== null && now === split.current && now.hasAttribute("data-wide") && id !== undefined;
    if (first.current) first.current = false;
    else if (!selecting) {
      document.querySelector<HTMLElement>("h1")?.focus();
      scrollTo(0, 0);
    }
  }, [route]);

  useEffect(() => {
    split.current = document.querySelector(".split");
  });

  useEffect(() => {
    const heading = document.querySelector("h1")?.textContent;
    document.title = heading ? `${heading} · ${text.appName}` : text.appName;
  });

  const screen = screenFor(ready, me !== null);
  if (screen === "loading") return <p className="splash" role="status">{text.loading}</p>;
  if (screen === "connect") return <Connect />;
  return (
    <Shell section={section}>
      <Page section={section} id={id} />
    </Shell>
  );
}

const root = createRoot(document.getElementById("root")!);

root.render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

openStore().catch(() => root.render(<Recovery title={text.storageBrokenTitle} body={text.storageBroken} />));
