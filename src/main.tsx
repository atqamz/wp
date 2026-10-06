import { StrictMode, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { screenFor } from "./domain/status.ts";
import { openStore, useSnapshot } from "./hooks/use-store.ts";
import { useRoute } from "./router.ts";
import { ErrorBoundary } from "./ui/error-boundary.tsx";
import { Shell } from "./ui/shell.tsx";
import { listViews, views } from "./ui/registry.ts";
import { text } from "./ui/text.ts";
import { Title } from "./ui/title.tsx";
import { Budget } from "./views/budget.tsx";
import { BudgetLine } from "./views/budget-line.tsx";
import { Connect } from "./views/connect.tsx";
import { GenericItem } from "./views/generic-item.tsx";
import { GenericList } from "./views/generic-list.tsx";
import { Home } from "./views/home.tsx";
import { Settings } from "./views/settings.tsx";
import { Sync } from "./views/sync.tsx";
import "./style.css";
import "./ui/ui.css";

function Page({ section, id }: { section: string; id?: string }) {
  const listed = listViews.find((name) => views[name].route === section);
  if (listed) return id ? <GenericItem key={id} name={listed} id={id} /> : <GenericList name={listed} />;
  switch (section) {
    case "":
      return <Home />;
    case "budget":
      return id ? <BudgetLine key={id} id={id} /> : <Budget />;
    case "payments":
      return id ? <GenericItem key={id} name="payment" id={id} /> : <Budget />;
    case "settings":
      return <Settings />;
    case "sync":
      return <Sync />;
    default:
      return <Title>{text.notFound}</Title>;
  }
}

function App() {
  const { ready, me } = useSnapshot();
  const route = useRoute();
  const [section = "", id] = route.split("/").filter(Boolean);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) first.current = false;
    else {
      document.querySelector<HTMLElement>("h1")?.focus();
      scrollTo(0, 0);
    }
  }, [route]);

  useEffect(() => {
    const heading = document.querySelector("h1")?.textContent;
    document.title = heading ? `${heading} · ${text.appName}` : text.appName;
  });

  const screen = screenFor(ready, me !== null);
  if (screen === "loading") return <p className="splash" role="status">{text.loading}</p>;
  if (screen === "connect") return <Connect />;
  return (
    <Shell section={section === "payments" ? "budget" : section}>
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

openStore().catch(() => root.render(<p className="splash" role="alert">{text.storageBroken}</p>));
