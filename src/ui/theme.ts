export const THEMES = ["system", "light", "dark"] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_KEY = "wp-theme";

export const readTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
};

export const applyTheme = (theme: Theme) => {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
  for (const meta of metas) meta.dataset.color ??= meta.content;
  const forced = theme === "system" ? undefined : metas.find((meta) => meta.media.includes(theme));
  for (const meta of metas) meta.content = (forced ?? meta).dataset.color!;
};

export const saveTheme = (theme: Theme) => {
  try {
    if (theme === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, theme);
  } catch {
    return applyTheme(theme);
  }
  applyTheme(theme);
};
