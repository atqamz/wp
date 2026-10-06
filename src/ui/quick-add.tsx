import { useState } from "react";
import type { FormEvent } from "react";
import { sortBefore } from "../domain/order.ts";
import { usePartner, useProject } from "../hooks/use-plan.ts";
import { actions, useTable } from "../hooks/use-store.ts";
import { firstStatus } from "./registry.ts";
import type { ViewName } from "./registry.ts";
import { text } from "./text.ts";

export function QuickAdd({ name }: { name: "task" | "vendor" | "guest" }) {
  const project = useProject();
  const items = useTable("items");
  const { me, label } = usePartner();
  const [errors, setErrors] = useState<string[]>([]);

  const add = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get("title") ?? "").trim();
    if (title === "" || !project) return;
    const result = await actions.create("items", {
      kind: name,
      title,
      status: firstStatus(name as ViewName)!,
      project_id: project.id,
      sort: sortBefore(items.filter((item) => item.kind === name)),
      ...(name === "guest" ? { who: String(data.get("who")) as "a" | "b" } : {}),
    });
    if (result.ok) {
      form.reset();
      setErrors([]);
    } else {
      setErrors(result.errors);
    }
  };

  return (
    <form className="quick-add" onSubmit={add}>
      <label className="visually-hidden" htmlFor={`add-${name}`}>
        {text.quickAdd[name].label}
      </label>
      <input
        id={`add-${name}`}
        name="title"
        required
        maxLength={500}
        autoComplete="off"
        enterKeyHint="done"
        placeholder={text.quickAdd[name].placeholder}
      />
      {name === "guest" && (
        <select name="who" aria-label={text.quickAdd.side} defaultValue={me ?? "a"} key={me}>
          <option value="a">{label("a")}</option>
          <option value="b">{label("b")}</option>
        </select>
      )}
      <button type="submit">{text.add}</button>
      {errors.length > 0 && (
        <p className="error" role="alert">
          {errors.join(" ")}
        </p>
      )}
    </form>
  );
}
