import { useId } from "react";
import type { Type } from "../../shared/tables.ts";

export type Control = {
  name: string;
  label: string;
  type: Type;
  value?: string | number | boolean | null;
  required?: boolean;
  options?: readonly { value: string; label: string }[] | null;
  blank?: string;
  suggestions?: readonly string[];
  hint?: string;
};

const attributes = (type: Type) =>
  type === "date"
    ? { type: "date" }
    : type === "phone"
      ? { type: "tel", inputMode: "tel" as const, autoComplete: "off" }
      : type === "url"
        ? { type: "url", inputMode: "url" as const, autoComplete: "off" }
        : type === "int"
          ? { type: "text", inputMode: "numeric" as const, autoComplete: "off" }
          : { type: "text", autoComplete: "off" };

export function Field({ control, error }: { control: Control; error?: string }) {
  const id = useId();
  const { name, label, type, value, required, options, blank, suggestions, hint } = control;
  const shown = value === null || value === undefined || typeof value === "boolean" ? "" : String(value);
  const described = [hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  const common = { id, name, required, "aria-invalid": error ? true : undefined, "aria-describedby": described };
  if (type === "bool") {
    return (
      <div className="field check-field">
        <label>
          <input type="checkbox" name={name} defaultChecked={value === true} /> {label}
        </label>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {options ? (
        <select {...common} defaultValue={shown}>
          {!required && <option value="">{blank}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : type === "note" ? (
        <textarea {...common} rows={3} defaultValue={shown} />
      ) : (
        <input {...common} {...attributes(type)} defaultValue={shown} list={suggestions ? `${id}-list` : undefined} />
      )}
      {suggestions && (
        <datalist id={`${id}-list`}>
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
