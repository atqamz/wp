import { text } from "./text.ts";
import type { ViewName } from "./registry.ts";

type Labels = Record<string, string>;

export const fieldLabel = (name: ViewName, field: string) =>
  (text.field as Record<string, Labels>)[name]?.[field] ?? (text.field.common as Labels)[field] ?? field;

export const optionLabel = (name: ViewName, field: string, value: string, side: (who: string) => string) =>
  field === "who"
    ? side(value)
    : ((text.option as Record<string, Labels>)[`${name}.${field}`]?.[value] ?? (text.option as Record<string, Labels>)[field]?.[value] ?? value);
