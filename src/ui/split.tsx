import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useRoom } from "../hooks/use-room.ts";

type Props = { open: boolean; hint: string; list: ReactNode; detail: (wide: boolean) => ReactNode };

export function Split({ open, hint, list, detail }: Props) {
  const anchor = useRef<HTMLDivElement>(null);
  const wide = useRoom(anchor);
  return (
    <div ref={anchor} className="split" data-wide={wide || undefined}>
      {wide ? (
        <>
          <div className="col">{list}</div>
          <aside className="pane">{open ? detail(true) : <p className="empty">{hint}</p>}</aside>
        </>
      ) : open ? (
        detail(false)
      ) : (
        list
      )}
    </div>
  );
}

export function DetailTitle({ wide, children }: { wide: boolean; children: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  const Tag = wide ? "h2" : "h1";
  return (
    <Tag ref={heading} tabIndex={-1} className="pane-t">
      {children}
    </Tag>
  );
}
