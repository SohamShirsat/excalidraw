/**
 * Shared shapes for the GitHub backup/sync feature.
 *
 * Kept free of DOM/React/browser imports so both TypeScript programs can use
 * them: the renderer (`excalidraw-app/data/githubSync.ts`, `SettingsDialog`)
 * and the Node/Electron main process (`electron/githubSync.ts`), which is
 * where the actual git work happens. Same pattern as `workspaceTypes.ts` —
 * see the note in `electron/tsconfig.json`'s `include`.
 *
 * The user's Personal Access Token is deliberately NOT part of any type that
 * travels back to the renderer. It goes one way only — renderer → main, once,
 * at connect time — and after that the renderer can only ever learn whether a
 * token exists (`hasToken`), never its value.
 */

/** How often the app syncs on its own, on top of the manual "Sync now". */
export type GithubSyncSchedule =
  | "manual"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly";

export const GITHUB_SYNC_SCHEDULE_LABELS: Record<GithubSyncSchedule, string> = {
  manual: "Only when I click Sync",
  hourly: "Every hour",
  daily: "Once a day",
  weekly: "Once a week",
  monthly: "Once a month",
};

export type GithubSyncConfig = {
  /** Normalized to `https://github.com/<owner>/<repo>.git`. */
  remoteUrl: string;
  owner: string;
  repo: string;
  branch: string;
  authorName: string;
  authorEmail: string;
  schedule: GithubSyncSchedule;
  /** Run a sync shortly after the app launches. */
  syncOnStart: boolean;
};

export type GithubSyncState =
  /** No repo connected yet. */
  | "disconnected"
  /** Connected, nothing in flight. */
  | "idle"
  | "syncing"
  /** Local and remote both moved and git could not merge them by itself. */
  | "conflict"
  | "error";

export type GithubSyncStatus = {
  /** `false` outside the desktop app — the browser dev server has no git. */
  isSupported: boolean;
  state: GithubSyncState;
  config: GithubSyncConfig | null;
  hasToken: boolean;
  /** Files changed locally since the last sync. */
  pendingChanges: number;
  lastSyncAt: number | null;
  /** Human-readable result of the last completed sync. */
  lastSyncSummary: string | null;
  /** Set when `state` is "error" or "conflict". */
  error: string | null;
  /** Paths git could not merge; only set when `state` is "conflict". */
  conflictedPaths: string[];
};

export type GithubSyncResult = {
  status: GithubSyncStatus;
  summary: string;
};

/** What the Settings → Sync form sends when connecting a repository. */
export type GithubConnectInput = {
  /** `owner/repo`, an https URL, or an ssh URL — all normalized on arrival. */
  repository: string;
  branch: string;
  token: string;
  authorName: string;
  authorEmail: string;
  schedule: GithubSyncSchedule;
  syncOnStart: boolean;
  /**
   * How to reconcile the very first time, when the local workspace and the
   * remote repository both already have content. "auto" refuses to guess and
   * reports back a conflict so the user can choose.
   */
  initialStrategy?: "auto" | "prefer-local" | "prefer-remote";
};

/** Explicit, user-chosen escape hatches out of a `conflict` state. */
export type GithubConflictResolution = "keep-local" | "keep-remote";

export const createDisconnectedStatus = (
  isSupported: boolean,
): GithubSyncStatus => ({
  isSupported,
  state: "disconnected",
  config: null,
  hasToken: false,
  pendingChanges: 0,
  lastSyncAt: null,
  lastSyncSummary: null,
  error: null,
  conflictedPaths: [],
});
