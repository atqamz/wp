import type { ReactNode } from "react";

export function Title({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h1 tabIndex={-1} className={className}>
      {children}
    </h1>
  );
}
