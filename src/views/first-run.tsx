import { useState } from "react";
import type { FormEvent } from "react";
import { useBusy } from "../hooks/use-busy.ts";
import { actions } from "../hooks/use-store.ts";
import { failureOf } from "../ui/failure.ts";
import { text } from "../ui/text.ts";

export function FirstRun() {
  const [errors, setErrors] = useState<string[]>([]);
  const { busy, once } = useBusy();

  const start = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (title === "") return;
    return once(async () => setErrors(failureOf(await actions.create("items", { kind: "project", title, status: "active" }))));
  };

  return (
    <main className="first-run">
      <h1>{text.firstRun.title}</h1>
      <form className="form" onSubmit={start}>
        <div className="field">
          <label htmlFor="project-title">{text.firstRun.label}</label>
          <input id="project-title" name="title" required maxLength={500} autoComplete="off" autoFocus placeholder={text.firstRun.placeholder} />
        </div>
        {errors.length > 0 && (
          <p className="error" role="alert">
            {errors.join(" ")}
          </p>
        )}
        <div className="form-actions">
          <button type="submit" disabled={busy}>
            {text.firstRun.submit}
          </button>
        </div>
      </form>
    </main>
  );
}
