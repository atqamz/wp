export type Viewport = { height: number; offsetTop: number; scale: number };

export const ZOOMED = 1.01;

export const keyboardInset = (layoutHeight: number, viewport: Viewport) =>
  viewport.scale > ZOOMED ? 0 : Math.max(0, Math.round(layoutHeight - viewport.height - viewport.offsetTop));
