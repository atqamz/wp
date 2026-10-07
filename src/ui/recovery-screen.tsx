import { useEffect } from "react";
import type { ReactNode } from "react";
import { text } from "./text.ts";
import { Title } from "./title.tsx";

export function Recovery({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · ${text.appName}`;
    document.querySelector<HTMLElement>("h1")?.focus();
  }, [title]);
  return (
    <main className="recovery">
      <Title>{title}</Title>
      <p>{body}</p>
      {children && <div className="form-actions">{children}</div>}
    </main>
  );
}
