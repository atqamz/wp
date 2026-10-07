export type Screen = "loading" | "signin" | "connect" | "app";

export const screenFor = (ready: boolean, heardFromServer: boolean, expired: boolean): Screen =>
  !ready ? "loading" : heardFromServer ? "app" : expired ? "signin" : "connect";

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
