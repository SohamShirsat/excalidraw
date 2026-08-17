import { useState } from "react";

import {
  connectGithubSync,
  disconnectGithubSync,
  resolveGithubSyncConflict,
  syncGithubNow,
  updateGithubSyncPreferences,
} from "../data/githubSync";
import {
  GITHUB_SYNC_SCHEDULE_LABELS,
  type GithubSyncSchedule,
  type GithubSyncStatus,
} from "../data/githubSyncTypes";
import { formatRelativeTime } from "../data/recentPages";

const SCHEDULES = Object.keys(
  GITHUB_SYNC_SCHEDULE_LABELS,
) as GithubSyncSchedule[];

const TOKEN_HELP_URL = "https://github.com/settings/personal-access-tokens/new";

/**
 * Settings → Sync.
 *
 * The mental model this UI is built around: **the folder on this Mac is the
 * real workspace; GitHub is a backup that happens to be shareable**. So the
 * copy never says "your files live on GitHub", nothing here can be turned
 * into a requirement for using the app, and every destructive branch (the
 * two conflict resolutions) states in the button's own label which copy
 * survives — plus the app takes a local backup folder before overwriting
 * anything with GitHub's version.
 */
export const GithubSyncSettings = ({
  status,
  onStatusChange,
}: {
  status: GithubSyncStatus;
  onStatusChange: (status: GithubSyncStatus) => void;
}) => {
  const [repository, setRepository] = useState("");
  const [branch, setBranch] = useState("main");
  const [token, setToken] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [schedule, setSchedule] = useState<GithubSyncSchedule>("daily");
  const [syncOnStart, setSyncOnStart] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const run = async (operation: () => Promise<GithubSyncStatus>) => {
    setIsBusy(true);
    setFormError("");
    try {
      onStatusChange(await operation());
    } catch (error) {
      console.error("[github-sync]", error);
      setFormError(
        error instanceof Error
          ? error.message
          : "Something went wrong talking to GitHub.",
      );
    } finally {
      setIsBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      const next = await connectGithubSync({
        repository,
        branch,
        token,
        authorName,
        authorEmail,
        schedule,
        syncOnStart,
        // "auto" deliberately refuses to guess when both sides have content;
        // the conflict panel above then asks which copy wins.
        initialStrategy: "auto",
      });
      if (next.state !== "conflict" && next.state !== "error") {
        // Only clear the token field once it is safely stored; leaving it
        // filled after a failure saves the user pasting it again.
        setToken("");
      }
      return next;
    });

  if (!status.isSupported) {
    return (
      <>
        <h3>Sync with GitHub</h3>
        <p className="settings-sync-copy">
          GitHub sync runs in the desktop app, where it can read and write the
          workspace folder directly. Open Personal Excalidraw as an app (not in
          a browser tab) to set it up.
        </p>
      </>
    );
  }

  const { config } = status;

  return (
    <>
      <div className="settings-panel-heading">
        <div>
          <h3>Sync with GitHub</h3>
          <p>
            Your drawings stay on this Mac. Sync pushes a copy to a GitHub
            repository you own, so nothing is lost and you can pick the work up
            on another machine.
          </p>
        </div>
      </div>

      {formError && (
        <p className="settings-sync-error" role="alert">
          {formError}
        </p>
      )}

      {status.state === "conflict" && (
        <div className="settings-sync-conflict" role="alert">
          <strong>Two versions to choose between</strong>
          <p>{status.error}</p>
          {status.conflictedPaths.length > 0 && (
            <ul>
              {status.conflictedPaths.slice(0, 8).map((filePath) => (
                <li key={filePath}>{filePath}</li>
              ))}
            </ul>
          )}
          <div className="settings-sync-actions">
            {/* Reached both from a first connect against a non-empty repo
                and from a genuine mid-life divergence — the resolution is
                the same operation in either case, so there is one pair of
                buttons rather than two parallel flows. */}
            <button
              type="button"
              disabled={isBusy}
              onClick={() =>
                void run(() => resolveGithubSyncConflict("keep-local"))
              }
            >
              Keep this Mac's copy
            </button>
            <button
              type="button"
              className="is-secondary"
              disabled={isBusy}
              onClick={() =>
                void run(() => resolveGithubSyncConflict("keep-remote"))
              }
            >
              Use GitHub's copy
            </button>
          </div>
          <small>
            Whichever you pick, the other version is kept: a dated backup folder
            is written next to your workspace before anything is replaced.
          </small>
        </div>
      )}

      {config ? (
        <>
          <div className="settings-field">
            <span>Repository</span>
            <code>
              {config.owner}/{config.repo} · {config.branch}
            </code>
            <small>
              {status.lastSyncAt
                ? `Last synced ${formatRelativeTime(status.lastSyncAt)}${
                    status.lastSyncSummary ? ` — ${status.lastSyncSummary}` : ""
                  }`
                : "Not synced yet."}
            </small>
          </div>

          <div className="settings-field">
            <span>Unsynced changes</span>
            <code>
              {status.pendingChanges === 0
                ? "Everything is backed up"
                : `${status.pendingChanges} ${
                    status.pendingChanges === 1 ? "file" : "files"
                  } changed since the last sync`}
            </code>
          </div>

          <div className="settings-field">
            <span>Automatic sync</span>
            <select
              value={config.schedule}
              disabled={isBusy}
              onChange={(event) =>
                void run(() =>
                  updateGithubSyncPreferences({
                    schedule: event.target.value as GithubSyncSchedule,
                  }),
                )
              }
            >
              {SCHEDULES.map((item) => (
                <option key={item} value={item}>
                  {GITHUB_SYNC_SCHEDULE_LABELS[item]}
                </option>
              ))}
            </select>
            <label className="settings-sync-checkbox">
              <input
                type="checkbox"
                checked={config.syncOnStart}
                disabled={isBusy}
                onChange={(event) =>
                  void run(() =>
                    updateGithubSyncPreferences({
                      syncOnStart: event.target.checked,
                    }),
                  )
                }
              />
              Also sync shortly after the app opens
            </label>
          </div>

          <div className="settings-sync-actions">
            <button
              type="button"
              disabled={isBusy || status.state === "syncing"}
              onClick={() => void run(syncGithubNow)}
            >
              {status.state === "syncing" ? "Syncing…" : "Sync now"}
            </button>
            <button
              type="button"
              className="is-secondary"
              disabled={isBusy}
              onClick={() => void run(disconnectGithubSync)}
            >
              Disconnect
            </button>
          </div>

          {status.state === "error" && status.error && (
            <p className="settings-sync-error" role="alert">
              {status.error}
            </p>
          )}

          <small className="settings-sync-note">
            Disconnecting only forgets the token on this Mac. Your workspace
            folder, its history, and the GitHub repository are all left as they
            are.
          </small>
        </>
      ) : (
        <form
          className="settings-sync-form"
          onSubmit={(event) => {
            event.preventDefault();
            void connect();
          }}
        >
          <label className="settings-field">
            <span>GitHub repository</span>
            <input
              value={repository}
              placeholder="your-username/my-drawings"
              onChange={(event) => setRepository(event.target.value)}
            />
            <small>
              Paste <code>owner/repo</code> or a github.com URL. Create it empty
              and private first — this app does not create repositories for you.
            </small>
          </label>

          <label className="settings-field">
            <span>Branch</span>
            <input
              value={branch}
              placeholder="main"
              onChange={(event) => setBranch(event.target.value)}
            />
          </label>

          <label className="settings-field">
            <span>Personal access token</span>
            <input
              type="password"
              value={token}
              autoComplete="off"
              placeholder="github_pat_…"
              onChange={(event) => setToken(event.target.value)}
            />
            <small>
              Needs <strong>Contents: read and write</strong> on that one
              repository.{" "}
              <a href={TOKEN_HELP_URL} target="_blank" rel="noreferrer">
                Create a fine-grained token
              </a>
              . It is encrypted with your macOS keychain and never leaves this
              Mac except to talk to GitHub.
            </small>
          </label>

          <label className="settings-field">
            <span>Commit author (optional)</span>
            <input
              value={authorName}
              placeholder="Your name"
              onChange={(event) => setAuthorName(event.target.value)}
            />
          </label>

          <label className="settings-field">
            <span>Commit email (optional)</span>
            <input
              value={authorEmail}
              placeholder="you@example.com"
              onChange={(event) => setAuthorEmail(event.target.value)}
            />
          </label>

          <label className="settings-field">
            <span>Automatic sync</span>
            <select
              value={schedule}
              onChange={(event) =>
                setSchedule(event.target.value as GithubSyncSchedule)
              }
            >
              {SCHEDULES.map((item) => (
                <option key={item} value={item}>
                  {GITHUB_SYNC_SCHEDULE_LABELS[item]}
                </option>
              ))}
            </select>
            <label className="settings-sync-checkbox">
              <input
                type="checkbox"
                checked={syncOnStart}
                onChange={(event) => setSyncOnStart(event.target.checked)}
              />
              Also sync shortly after the app opens
            </label>
          </label>

          <div className="settings-sync-actions">
            <button type="submit" disabled={isBusy}>
              {isBusy ? "Connecting…" : "Connect repository"}
            </button>
          </div>
        </form>
      )}
    </>
  );
};
