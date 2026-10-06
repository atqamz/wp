import { useState } from "react";
import type { FormEvent } from "react";
import { zoneSupported } from "../domain/dates.ts";
import { DEFAULT_ZONE, settingKeys } from "../domain/settings.ts";
import { useSettings } from "../hooks/use-plan.ts";
import { useBusy } from "../hooks/use-busy.ts";
import { actions, useSnapshot } from "../hooks/use-store.ts";
import { failureOf } from "../ui/failure.ts";
import { Field } from "../ui/field.tsx";
import type { Control } from "../ui/field.tsx";
import { exportQuery, views } from "../ui/registry.ts";
import type { ViewName } from "../ui/registry.ts";
import { text } from "../ui/text.ts";
import { Title } from "../ui/title.tsx";

const exports = [
  { label: text.settings.exportAll, query: "format=json" },
  ...(Object.keys(views) as ViewName[]).map((name) => ({
    label: text.export[name],
    query: exportQuery(name),
  })),
];

export function Settings() {
  const settings = useSettings();
  const { me } = useSnapshot();
  const signedInAs = me === "a" ? settings.partnerA : me === "b" ? settings.partnerB : null;
  const [failure, setFailure] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const { busy, once } = useBusy();

  const [initial] = useState<Record<string, string>>(() => ({
    [settingKeys.ceremonyDate]: settings.ceremonyDate ?? "",
    [settingKeys.timezone]: settings.timezone,
    [settingKeys.partnerA]: settings.partnerA ?? "",
    [settingKeys.partnerB]: settings.partnerB ?? "",
  }));

  const [mine, theirs] = me === "b" ? [settingKeys.partnerB, settingKeys.partnerA] : [settingKeys.partnerA, settingKeys.partnerB];
  const nicknames: Control[] = [
    { name: mine, label: text.settings.yourNickname, type: "text", value: initial[mine] },
    { name: theirs, label: text.settings.theirNickname, type: "text", value: initial[theirs] },
  ];
  const fields: Control[] = [
    { name: settingKeys.ceremonyDate, label: text.settings.ceremonyDate, type: "date", value: initial[settingKeys.ceremonyDate] },
    {
      name: settingKeys.timezone,
      label: text.settings.timezone,
      type: "zone",
      value: initial[settingKeys.timezone],
      suggestions: [DEFAULT_ZONE, "Asia/Makassar", "Asia/Jayapura"],
    },
    ...nicknames,
  ];
  const controls = fields.map((control) => ({ ...control, required: initial[control.name] !== "" }));

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return once(() => store(new FormData(event.currentTarget)));
  };

  const store = async (form: FormData) => {
    const errors: string[] = [];
    for (const control of controls) {
      const value = String(form.get(control.name) ?? "").trim();
      if (value === "" || value === initial[control.name]) continue;
      errors.push(...failureOf(await actions.setSetting(control.name, value)));
    }
    setFailure(errors);
    setSaved(errors.length === 0);
  };

  return (
    <>
      <Title>{text.nav.settings}</Title>
      {signedInAs && <p className="hint">{text.settings.signedInAs(signedInAs)}</p>}
      <form className="form" onSubmit={save} onChange={() => setSaved(false)}>
        {controls.map((control) => (
          <Field key={control.name} control={control} />
        ))}
        {!zoneSupported(settings.timezone) && (
          <p className="error" role="status">
            {text.settings.zoneUnsupported}
          </p>
        )}
        {failure.length > 0 && (
          <p className="error" role="alert">
            {failure.join(" ")}
          </p>
        )}
        {saved && <p role="status">{text.saved}</p>}
        <div className="form-actions">
          <button type="submit" disabled={busy}>
            {text.save}
          </button>
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
