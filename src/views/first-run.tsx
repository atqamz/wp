import { useState } from "react";
import type { FormEvent } from "react";
import { actions, useSnapshot } from "../hooks/use-store.ts";
import { text } from "../ui/text.ts";

export function FirstRun() {
  const [errors, setErrors] = useState<string[]>([]);
  const { link } = useSnapshot();

  const start = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
    if (title === "") return;
    const result = await actions.create("items", { kind: "project", title, status: "active" });
    if (!result.ok) setErrors(result.errors);
  };

  if (link === "expired") {
    return (
      <main className="first-run">
        <h1>{text.sync.login}</h1>
        <p>{text.sync.expiredBody}</p>
        <div className="form-actions">
          <button type="button" onClick={actions.logIn}>
            {text.sync.login}
          </button>
        </div>
      </main>
    );
  }

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
          <button type="submit">{text.firstRun.submit}</button>
        </div>
      </form>
    </main>
  );
}
