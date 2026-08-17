/**
 * "Recently opened pages", the list the page palette (Ctrl/Cmd+T) shows
 * before anything is typed.
 *
 * Deliberately stored in `localStorage` rather than in `workspace.json`:
 * recency is a per-machine, per-person UI detail, and `workspace.json` is
 * the file that gets committed and synced to GitHub — pushing a commit
 * every time a page is merely *looked at* would make the sync history
 * useless. See `excalidraw-app/data/githubSync.ts`.
 */

const STORAGE_KEY = "personal-excalidraw-recent-pages";
const MAX_ENTRIES = 30;

export type RecentPageEntry = {
  pageId: string;
  openedAt: number;
};

const isEntry = (value: unknown): value is RecentPageEntry =>
  !!value &&
  typeof value === "object" &&
  typeof (value as RecentPageEntry).pageId === "string" &&
  typeof (value as RecentPageEntry).openedAt === "number";

export const readRecentPages = (): RecentPageEntry[] => {
  if (typeof localStorage === "undefined") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "");
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
};

/** Moves `pageId` to the front, keeping the list capped and duplicate-free. */
export const recordRecentPage = (
  pageId: string,
  now = Date.now(),
): RecentPageEntry[] => {
  const next = [
    { pageId, openedAt: now },
    ...readRecentPages().filter((entry) => entry.pageId !== pageId),
  ].slice(0, MAX_ENTRIES);

  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A full/blocked localStorage must never break opening a page.
    }
  }

  return next;
};

/**
 * Orders `pageIds` by recency, most recent first, with never-opened pages
 * last (in the order they were given, i.e. workspace order). Pure, so the
 * palette's ordering is unit-testable without a DOM.
 */
export const orderPageIdsByRecency = (
  pageIds: readonly string[],
  recents: readonly RecentPageEntry[],
): string[] => {
  const openedAtById = new Map(
    recents.map((entry) => [entry.pageId, entry.openedAt]),
  );

  return [...pageIds].sort((a, b) => {
    const aOpenedAt = openedAtById.get(a);
    const bOpenedAt = openedAtById.get(b);
    if (aOpenedAt === undefined && bOpenedAt === undefined) {
      return 0;
    }
    if (aOpenedAt === undefined) {
      return 1;
    }
    if (bOpenedAt === undefined) {
      return -1;
    }
    return bOpenedAt - aOpenedAt;
  });
};

export const formatRelativeTime = (
  timestamp: number,
  now = Date.now(),
): string => {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.round(months / 12)}y ago`;
};
