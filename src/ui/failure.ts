import type { Written } from "../hooks/use-store.ts";
import { text } from "./text.ts";

export const failureOf = (result: Written): string[] => (result.ok ? [] : result.storage ? [text.storageFailed] : result.errors);
