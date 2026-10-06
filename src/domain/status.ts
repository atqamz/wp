export type Screen = "loading" | "connect" | "first-run" | "app";

export const screenFor = (ready: boolean, heardFromServer: boolean, hasProject: boolean): Screen =>
  !ready ? "loading" : hasProject ? "app" : heardFromServer ? "first-run" : "connect";

export type Badge = "storage" | "login" | "rejected" | "offline" | "pending" | "synced";

export type Health = {
  storage: "ok" | "failed";
  link: "online" | "offline" | "expired";
  rejected: number;
  pending: number;
};

export const badgeFor = ({ storage, link, rejected, pending }: Health): Badge =>
  storage === "failed"
    ? "storage"
    : link === "expired"
      ? "login"
      : rejected > 0
        ? "rejected"
        : link === "offline"
          ? "offline"
          : pending > 0
            ? "pending"
            : "synced";
