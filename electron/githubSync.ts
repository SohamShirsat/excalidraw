/**
 * GitHub backup/sync for the Personal Workspace folder.
 *
 * The workspace directory on disk stays the source of truth — this turns
 * that same directory into a real git repository and pushes it to a GitHub
 * repo the user owns. Nothing about drawing, saving or opening pages changes:
 * if GitHub is unreachable, or never configured at all, the app keeps working
 * exactly as before. Sync is a backup/transport layer bolted on the side, not
 * a storage backend.
 *
 * Why `isomorphic-git` rather than shelling out to the `git` CLI: this app is
 * meant to be downloadable by people who don't have Xcode command line tools
 * installed. A pure-JS git means "download the app, paste a token, done" with
 * no external prerequisite.
 *
 * Auth is a GitHub Personal Access Token supplied by the user. It is stored
 * encrypted (see `electron/main.ts`, which passes `safeStorage`-backed
 * read/write functions in) and never travels back to the renderer.
 *
 * Everything here is plain, dependency-injected functions — no `electron`
 * import — so it can be unit-tested against a temp directory with no Electron
 * runtime, same as `electron/settingsStore.ts` and `electron/dialogHandlers.ts`.
 */

import { promises as fsPromises } from "node:fs";
import fs from "node:fs";
import path from "node:path";

import git from "isomorphic-git";
import http from "isomorphic-git/http/node";

import type {
  GithubConflictResolution,
  GithubConnectInput,
  GithubSyncConfig,
  GithubSyncSchedule,
  GithubSyncStatus,
} from "../excalidraw-app/data/githubSyncTypes";

export type GithubSyncPersistedState = {
  config: GithubSyncConfig | null;
  lastSyncAt: number | null;
  lastSyncSummary: string | null;
};

export type GithubSyncStore = {
  read: () => Promise<GithubSyncPersistedState>;
  write: (next: GithubSyncPersistedState) => Promise<void>;
  readToken: () => Promise<string | null>;
  writeToken: (token: string | null) => Promise<void>;
};

const REMOTE_NAME = "origin";
const DEFAULT_AUTHOR_NAME = "Personal Excalidraw";
const DEFAULT_AUTHOR_EMAIL = "personal-excalidraw@localhost";

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in `excalidraw-app/tests/GithubSync.test.ts`)
// ---------------------------------------------------------------------------

/**
 * Accepts every shape a person plausibly pastes into the repository field —
 * `owner/repo`, a browser URL, a `.git` clone URL, or an SSH remote — and
 * normalizes them all to the HTTPS URL isomorphic-git needs (SSH keys aren't
 * usable here; auth is token-over-HTTPS).
 */
export const parseGithubRepository = (
  input: string,
): { owner: string; repo: string; remoteUrl: string } => {
  const value = input
    .trim()
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  if (!value) {
    throw new Error("Enter a GitHub repository, for example you/my-drawings.");
  }

  const patterns = [
    /^git@github\.com:(?<owner>[^/]+)\/(?<repo>[^/]+)$/i,
    /^(?:https?:\/\/)?(?:[^@/]+@)?github\.com\/(?<owner>[^/]+)\/(?<repo>[^/]+)$/i,
    /^(?<owner>[A-Za-z0-9-_.]+)\/(?<repo>[A-Za-z0-9-_.]+)$/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.groups) {
      const { owner, repo } = match.groups;
      return {
        owner,
        repo,
        remoteUrl: `https://github.com/${owner}/${repo}.git`,
      };
    }
  }

  throw new Error(
    `"${input}" is not a GitHub repository. Use owner/repo or a github.com URL.`,
  );
};

const SCHEDULE_INTERVAL_MS: Record<GithubSyncSchedule, number | null> = {
  manual: null,
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000,
};

export const scheduleIntervalMs = (schedule: GithubSyncSchedule) =>
  SCHEDULE_INTERVAL_MS[schedule];

/**
 * Milliseconds until the next automatic sync, or `null` when the schedule is
 * manual. A never-synced repo (or one whose deadline has already passed) is
 * due immediately, reported as `0`.
 */
export const millisecondsUntilNextSync = (
  schedule: GithubSyncSchedule,
  lastSyncAt: number | null,
  now: number,
): number | null => {
  const interval = SCHEDULE_INTERVAL_MS[schedule];
  if (interval === null) {
    return null;
  }
  if (lastSyncAt === null) {
    return 0;
  }
  return Math.max(0, lastSyncAt + interval - now);
};

export const describeSyncSummary = ({
  committedFiles,
  pulled,
  pushed,
}: {
  committedFiles: number;
  pulled: boolean;
  pushed: boolean;
}): string => {
  const parts: string[] = [];
  if (committedFiles > 0) {
    parts.push(
      `saved ${committedFiles} ${committedFiles === 1 ? "change" : "changes"}`,
    );
  }
  if (pulled) {
    parts.push("pulled updates from GitHub");
  }
  if (pushed) {
    parts.push("pushed to GitHub");
  }
  if (!parts.length) {
    return "Already up to date.";
  }
  return `${parts.join(", ").replace(/^./, (char) => char.toUpperCase())}.`;
};

// ---------------------------------------------------------------------------
// git plumbing
// ---------------------------------------------------------------------------

const pathExists = async (target: string) => {
  try {
    await fsPromises.stat(target);
    return true;
  } catch {
    return false;
  }
};

const directoryHasEntries = async (dir: string) => {
  try {
    const entries = await fsPromises.readdir(dir);
    return entries.some((entry) => entry !== ".git" && entry !== ".DS_Store");
  } catch {
    return false;
  }
};

/**
 * Files changed in the working tree relative to the last commit. Also used
 * for the "N unsynced changes" badge in the app chrome, so it must stay cheap
 * enough to call on a timer.
 */
export const countWorkingTreeChanges = async (dir: string): Promise<number> => {
  const matrix = await git.statusMatrix({ fs, dir });
  return matrix.filter(([, head, workdir, stage]) => {
    return !(head === 1 && workdir === 1 && stage === 1);
  }).length;
};

const stageAllChanges = async (dir: string): Promise<number> => {
  const matrix = await git.statusMatrix({ fs, dir });
  let staged = 0;

  for (const [filepath, head, workdir, stage] of matrix) {
    if (head === 1 && workdir === 1 && stage === 1) {
      continue;
    }
    if (workdir === 0) {
      await git.remove({ fs, dir, filepath });
    } else {
      await git.add({ fs, dir, filepath });
    }
    staged += 1;
  }

  return staged;
};

const resolveRefOrNull = async (dir: string, ref: string) => {
  try {
    return await git.resolveRef({ fs, dir, ref });
  } catch {
    return null;
  }
};

const writeDefaultGitignore = async (dir: string) => {
  const gitignorePath = path.join(dir, ".gitignore");
  if (await pathExists(gitignorePath)) {
    return;
  }
  await fsPromises.writeFile(gitignorePath, ".DS_Store\n", "utf8");
};

/**
 * Isomorphic-git surfaces auth failures as an opaque `HttpError`; the raw
 * message ("HTTP Error: 401 Unauthorized") tells a user nothing about what to
 * do, so the common ones get rewritten into an instruction.
 */
const describeGitError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (/401|Unauthorized|Authentication/i.test(message)) {
    return "GitHub rejected the token. Check that it has not expired and that it grants read/write access to the repository's contents.";
  }
  if (/404|Not Found/i.test(message)) {
    return "GitHub could not find that repository. Check the owner/name, and that the token can see it (private repos need explicit access).";
  }
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network/i.test(message)) {
    return "Could not reach GitHub. Check your internet connection and try again.";
  }
  return message;
};

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export type GithubSyncEngine = ReturnType<typeof createGithubSyncEngine>;

export const createGithubSyncEngine = ({
  getWorkspaceDir,
  store,
  now = Date.now,
  onStatusChange,
}: {
  getWorkspaceDir: () => string;
  store: GithubSyncStore;
  now?: () => number;
  onStatusChange?: (status: GithubSyncStatus) => void;
}) => {
  let isSyncing = false;
  let conflictState: { message: string; paths: string[] } | null = null;
  let lastError: string | null = null;

  // Every mutating operation runs through this, so a scheduled sync can
  // never interleave with one the user just clicked.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation, operation);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const buildStatus = async (): Promise<GithubSyncStatus> => {
    const persisted = await store.read();
    const token = await store.readToken();
    const dir = getWorkspaceDir();

    let pendingChanges = 0;
    if (persisted.config && (await pathExists(path.join(dir, ".git")))) {
      try {
        pendingChanges = await countWorkingTreeChanges(dir);
      } catch {
        pendingChanges = 0;
      }
    }

    const state: GithubSyncStatus["state"] = !persisted.config
      ? "disconnected"
      : isSyncing
      ? "syncing"
      : conflictState
      ? "conflict"
      : lastError
      ? "error"
      : "idle";

    return {
      isSupported: true,
      state,
      config: persisted.config,
      hasToken: !!token,
      pendingChanges,
      lastSyncAt: persisted.lastSyncAt,
      lastSyncSummary: persisted.lastSyncSummary,
      error: conflictState?.message ?? lastError,
      conflictedPaths: conflictState?.paths ?? [],
    };
  };

  const publishStatus = async () => {
    const status = await buildStatus();
    onStatusChange?.(status);
    return status;
  };

  const requireConnection = async () => {
    const persisted = await store.read();
    const token = await store.readToken();
    if (!persisted.config) {
      throw new Error("Connect a GitHub repository first.");
    }
    if (!token) {
      throw new Error(
        "No GitHub token is stored. Reconnect the repository in Settings → Sync.",
      );
    }
    return { config: persisted.config, token, persisted };
  };

  const authFor = (token: string) => () => ({
    // GitHub accepts any username with a PAT as the password; the
    // "x-access-token" convention is what the official gh tooling uses.
    username: "x-access-token",
    password: token,
  });

  const ensureRepository = async (config: GithubSyncConfig) => {
    const dir = getWorkspaceDir();
    await fsPromises.mkdir(dir, { recursive: true });

    if (!(await pathExists(path.join(dir, ".git")))) {
      await git.init({ fs, dir, defaultBranch: config.branch });
    }
    await writeDefaultGitignore(dir);
    await git.addRemote({
      fs,
      dir,
      remote: REMOTE_NAME,
      url: config.remoteUrl,
      force: true,
    });
    return dir;
  };

  const commitAll = async (dir: string, config: GithubSyncConfig) => {
    const staged = await stageAllChanges(dir);
    if (!staged) {
      return 0;
    }
    await git.commit({
      fs,
      dir,
      message: `Workspace sync — ${new Date(now()).toISOString()}`,
      author: {
        name: config.authorName || DEFAULT_AUTHOR_NAME,
        email: config.authorEmail || DEFAULT_AUTHOR_EMAIL,
      },
    });
    return staged;
  };

  const fetchRemote = async (
    dir: string,
    config: GithubSyncConfig,
    token: string,
  ) => {
    try {
      await git.fetch({
        fs,
        http,
        dir,
        remote: REMOTE_NAME,
        ref: config.branch,
        singleBranch: true,
        tags: false,
        onAuth: authFor(token),
      });
    } catch (error) {
      // A brand-new, empty GitHub repo has no branch to fetch yet — that is
      // a normal first-connect state, not a failure.
      const message = error instanceof Error ? error.message : String(error);
      if (!/Could not find|not found|RemoteBranch/i.test(message)) {
        throw error;
      }
    }
    return resolveRefOrNull(
      dir,
      `refs/remotes/${REMOTE_NAME}/${config.branch}`,
    );
  };

  const pushBranch = async (
    dir: string,
    config: GithubSyncConfig,
    token: string,
    force = false,
  ) => {
    const result = await git.push({
      fs,
      http,
      dir,
      remote: REMOTE_NAME,
      ref: config.branch,
      remoteRef: `refs/heads/${config.branch}`,
      force,
      onAuth: authFor(token),
    });
    if (result.error) {
      throw new Error(result.error);
    }
  };

  const persist = async (patch: Partial<GithubSyncPersistedState>) => {
    const current = await store.read();
    await store.write({ ...current, ...patch });
  };

  /** The steady-state operation: commit local work, merge remote, push. */
  const runSync = async (): Promise<GithubSyncStatus> => {
    const { config, token } = await requireConnection();
    if (conflictState) {
      throw new Error(
        "This workspace has a sync conflict waiting on a decision. Choose which copy to keep in Settings → Sync.",
      );
    }

    isSyncing = true;
    lastError = null;
    void publishStatus();

    try {
      const dir = await ensureRepository(config);
      const committedFiles = await commitAll(dir, config);
      const localOid = await resolveRefOrNull(dir, config.branch);
      const remoteOid = await fetchRemote(dir, config, token);

      let pulled = false;
      let pushed = false;

      if (remoteOid && localOid && remoteOid !== localOid) {
        try {
          const merge = await git.merge({
            fs,
            dir,
            ours: config.branch,
            theirs: `refs/remotes/${REMOTE_NAME}/${config.branch}`,
            abortOnConflict: true,
            author: {
              name: config.authorName || DEFAULT_AUTHOR_NAME,
              email: config.authorEmail || DEFAULT_AUTHOR_EMAIL,
            },
          });
          if (!merge.alreadyMerged) {
            pulled = true;
            // `merge` only moves the ref; the working tree has to be
            // refreshed explicitly or the app would keep showing pre-merge
            // files until the next launch.
            await git.checkout({ fs, dir, ref: config.branch, force: true });
          }
        } catch (error) {
          const paths =
            (error as { data?: { filepaths?: string[] } })?.data?.filepaths ??
            [];
          conflictState = {
            message:
              "This workspace and GitHub both changed since the last sync, and the two versions could not be merged automatically. Choose which copy to keep.",
            paths,
          };
          return await publishStatus();
        }
      } else if (remoteOid && !localOid) {
        await git.checkout({ fs, dir, ref: config.branch, force: true });
        pulled = true;
      }

      const finalLocalOid = await resolveRefOrNull(dir, config.branch);
      const finalRemoteOid = await resolveRefOrNull(
        dir,
        `refs/remotes/${REMOTE_NAME}/${config.branch}`,
      );
      if (finalLocalOid && finalLocalOid !== finalRemoteOid) {
        await pushBranch(dir, config, token);
        pushed = true;
      }

      const summary = describeSyncSummary({ committedFiles, pulled, pushed });
      await persist({ lastSyncAt: now(), lastSyncSummary: summary });
      return await publishStatus();
    } catch (error) {
      lastError = describeGitError(error);
      return await publishStatus();
    } finally {
      isSyncing = false;
    }
  };

  /**
   * Copies the workspace aside before any operation that overwrites local
   * files with GitHub's copy. Cheap insurance: this app's whole promise is
   * that drawings don't disappear.
   */
  const backupWorkspace = async (dir: string) => {
    const stamp = new Date(now()).toISOString().replace(/[:.]/g, "-");
    const target = `${dir}-backup-${stamp}`;
    await fsPromises.cp(dir, target, { recursive: true });
    return target;
  };

  const runConnect = async (input: GithubConnectInput) => {
    const { owner, repo, remoteUrl } = parseGithubRepository(input.repository);
    const token = input.token.trim();
    if (!token) {
      throw new Error("Paste a GitHub personal access token to connect.");
    }

    const config: GithubSyncConfig = {
      remoteUrl,
      owner,
      repo,
      branch: input.branch.trim() || "main",
      authorName: input.authorName.trim() || DEFAULT_AUTHOR_NAME,
      authorEmail: input.authorEmail.trim() || DEFAULT_AUTHOR_EMAIL,
      schedule: input.schedule,
      syncOnStart: input.syncOnStart,
    };

    conflictState = null;
    lastError = null;
    isSyncing = true;
    void publishStatus();

    try {
      await store.writeToken(token);
      await persist({ config });

      const dir = await ensureRepository(config);
      const hadLocalFiles = await directoryHasEntries(dir);
      const localOid = await resolveRefOrNull(dir, config.branch);
      const remoteOid = await fetchRemote(dir, config, token);

      const strategy = input.initialStrategy ?? "auto";

      if (remoteOid && (hadLocalFiles || localOid) && strategy === "auto") {
        // Both sides have content and the user hasn't said which wins.
        // Refusing to guess is the whole point — one wrong guess here
        // silently destroys either the drawings on this Mac or the ones
        // already backed up.
        conflictState = {
          message:
            "That repository already has content, and this Mac has a workspace too. Choose which copy to start from — the other one is kept as a backup, never deleted.",
          paths: [],
        };
        return await publishStatus();
      }

      if (remoteOid && strategy === "prefer-remote") {
        await backupWorkspace(dir);
        await git.checkout({ fs, dir, ref: config.branch, force: true });
        await persist({
          lastSyncAt: now(),
          lastSyncSummary: "Started from the copy on GitHub.",
        });
        return await publishStatus();
      }

      const committedFiles = await commitAll(dir, config);
      const headOid = await resolveRefOrNull(dir, config.branch);
      if (headOid) {
        await pushBranch(dir, config, token, strategy === "prefer-local");
      }
      await persist({
        lastSyncAt: now(),
        lastSyncSummary: describeSyncSummary({
          committedFiles,
          pulled: false,
          pushed: !!headOid,
        }),
      });
      return await publishStatus();
    } catch (error) {
      lastError = describeGitError(error);
      return await publishStatus();
    } finally {
      isSyncing = false;
    }
  };

  const runResolveConflict = async (resolution: GithubConflictResolution) => {
    const { config, token } = await requireConnection();
    isSyncing = true;
    void publishStatus();

    try {
      const dir = await ensureRepository(config);

      if (resolution === "keep-local") {
        await commitAll(dir, config);
        await pushBranch(dir, config, token, true);
        conflictState = null;
        lastError = null;
        await persist({
          lastSyncAt: now(),
          lastSyncSummary: "Kept this Mac's copy and replaced GitHub's.",
        });
      } else {
        const backup = await backupWorkspace(dir);
        const remoteOid = await fetchRemote(dir, config, token);
        if (!remoteOid) {
          throw new Error("GitHub has no copy of this branch to restore from.");
        }
        await git.writeRef({
          fs,
          dir,
          ref: `refs/heads/${config.branch}`,
          value: remoteOid,
          force: true,
        });
        await git.checkout({ fs, dir, ref: config.branch, force: true });
        conflictState = null;
        lastError = null;
        await persist({
          lastSyncAt: now(),
          lastSyncSummary: `Restored GitHub's copy. A backup of the previous workspace is at ${backup}.`,
        });
      }

      return await publishStatus();
    } catch (error) {
      lastError = describeGitError(error);
      return await publishStatus();
    } finally {
      isSyncing = false;
    }
  };

  const runDisconnect = async () => {
    // Leaves the `.git` directory and every commit in place: disconnecting
    // is about this app forgetting the token, not about throwing away the
    // user's backup history.
    await store.writeToken(null);
    await store.write({
      config: null,
      lastSyncAt: null,
      lastSyncSummary: null,
    });
    conflictState = null;
    lastError = null;
    return publishStatus();
  };

  const runUpdatePreferences = async (patch: {
    schedule?: GithubSyncSchedule;
    syncOnStart?: boolean;
  }) => {
    const persisted = await store.read();
    if (!persisted.config) {
      throw new Error("Connect a GitHub repository first.");
    }
    await persist({ config: { ...persisted.config, ...patch } });
    return publishStatus();
  };

  return {
    getStatus: () => buildStatus(),
    connect: (input: GithubConnectInput) => enqueue(() => runConnect(input)),
    disconnect: () => enqueue(() => runDisconnect()),
    sync: () => enqueue(() => runSync()),
    resolveConflict: (resolution: GithubConflictResolution) =>
      enqueue(() => runResolveConflict(resolution)),
    updatePreferences: (patch: {
      schedule?: GithubSyncSchedule;
      syncOnStart?: boolean;
    }) => enqueue(() => runUpdatePreferences(patch)),
  };
};
