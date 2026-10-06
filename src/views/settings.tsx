import { useState } from "react";
import type { FormEvent } from "react";
import { DEFAULT_ZONE, settingKeys } from "../domain/settings.ts";
import { useProject, useSettings } from "../hooks/use-plan.ts";
import { actions, useSnapshot } from "../hooks/use-store.ts";
import { Field } from "../ui/field.tsx";
import type { Control } from "../ui/field.tsx";
import { text } from "../ui/text.ts";
import { Title } from "../ui/title.tsx";

const exports = [
  { label: text.settings.exportAll, query: "format=json" },
  { label: text.nav.tasks, query: "format=csv&table=items&kind=task" },
  { label: text.nav.vendors, query: "format=csv&table=items&kind=vendor" },
  { label: text.nav.guests, query: "format=csv&table=items&kind=guest" },
  { label: text.settings.exportLines, query: "format=csv&table=budget_entries&entry_type=planned" },
  { label: text.settings.exportPayments, query: "format=csv&table=budget_entries&entry_type=payment" },
];

export function Settings() {
  const project = useProject();
  const settings = useSettings();
  const { me } = useSnapshot();
  const [failure, setFailure] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const controls: Control[] = [
    { name: "title", label: text.settings.project, type: "text", required: true, value: project?.title },
    { name: settingKeys.ceremonyDate, label: text.settings.ceremonyDate, type: "date", value: settings.ceremonyDate },
    {
      name: settingKeys.timezone,
      label: text.settings.timezone,
      type: "zone",
      value: settings.timezone,
      suggestions: [DEFAULT_ZONE, "Asia/Makassar", "Asia/Jayapura"],
    },
    { name: settingKeys.partnerA, label: text.settings.partnerA, type: "text", value: settings.partnerA },
    { name: settingKeys.partnerB, label: text.settings.partnerB, type: "text", value: settings.partnerB },
  ];

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const errors: string[] = [];
    const current: Record<string, string | null | undefined> = {
      title: project?.title,
      [settingKeys.ceremonyDate]: settings.ceremonyDate,
      [settingKeys.timezone]: settings.timezone,
      [settingKeys.partnerA]: settings.partnerA,
      [settingKeys.partnerB]: settings.partnerB,
    };
    for (const control of controls) {
      const value = String(form.get(control.name) ?? "").trim();
      if (value === "" || value === (current[control.name] ?? "")) continue;
      const result =
        control.name === "title" && project
          ? await actions.update("items", project.id, { title: value })
          : await actions.setSetting(control.name, value);
      if (!result.ok) errors.push(...result.errors);
    }
    setFailure(errors);
    setSaved(errors.length === 0);
  };

  return (
    <>
      <Title>{text.nav.settings}</Title>
      {me && <p className="hint">{text.settings.signedInAs(me === "a" ? (settings.partnerA ?? text.partnerA) : (settings.partnerB ?? text.partnerB))}</p>}
      <form className="form" onSubmit={save} onChange={() => setSaved(false)}>
        {controls.map((control) => (
          <Field key={control.name} control={control} />
        ))}
        {failure.length > 0 && (
          <p className="error" role="alert">
            {failure.join(" ")}
          </p>
        )}
        {saved && <p role="status">{text.saved}</p>}
        <div className="form-actions">
          <button type="submit">{text.save}</button>
        </div>
      </form>
      <section aria-labelledby="export">
        <h2 id="export">{text.settings.export}</h2>
        <ul className="links">
          {exports.map((link) => (
            <li key={link.query}>
              <a href={`/api/export?${link.query}`} download>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
      <p className="trail">
        <a href="#/sync">{text.settings.syncDetails}</a>
      </p>
    </>
  );
}
