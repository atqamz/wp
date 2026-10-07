export const heroColor = { light: "#131f4c", dark: "#111e47" };

export const tintThemeColor = (metas: { media: string; content: string }[]) => {
  const before = metas.map((meta) => meta.content);
  for (const meta of metas) meta.content = meta.media.includes("dark") ? heroColor.dark : heroColor.light;
  return () =>
    metas.forEach((meta, index) => {
      meta.content = before[index];
    });
};
