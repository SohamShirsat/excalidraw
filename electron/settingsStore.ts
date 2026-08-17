import { promises as fs } from "node:fs";
import path from "node:path";

import type { GithubSyncPersistedState } from "./githubSync";
import type { ShortcutBinding } from "../excalidraw-app/data/shortcutBindings";

const SETTINGS_FILE_NAME = "settings.json";

/**
 * Shape of `userData/settings.json`. Separate from
 * `electron/workspaceRoot.ts`'s `config.json` — different concern (app
 * preferences vs. where the workspace data lives on disk) — deliberately
 * not conflated into one file. `shortcuts` maps a `ShortcutDefinition.id`
 * (see `excalidraw-app/data/shortcutBindings.ts`) to either a custom
 * `ShortcutBinding` override, or an explicit `null` meaning "user reset
 * this one back to its default" (distinct from the id being absent, which
 * means "never touched").
 */
export type SettingsFile = {
  shortcuts?: Record<string, ShortcutBinding | null>;
  /**
   * GitHub sync: which repository this Mac is connected to, plus when it
   * last synced. The access token is NOT here in plain text — it lives in
   * `githubToken` below, encrypted by Electron's `safeStorage` (macOS
   * Keychain-backed) before it is ever written to disk.
   */
  githubSync?: GithubSyncPersistedState;
  /** Base64 of the `safeStorage`-encrypted personal access token. */
  githubToken?: string | null;
};

/**
 * Resolves the settings.json path given Electron's `app.getPath("userData")`
 * value — takes that value as a plain string parameter rather than
 * importing `app` from "electron" directly, so this file (and the read/write
 * functions below) can be exercised in tests against a temp directory with
 * no real Electron runtime — same testability goal as
 * `electron/dialogHandlers.ts`. `electron/main.ts` is the only real caller,
 * and it's the one that supplies an actual `app.getPath("userData")` value.
 */
export const getSettingsFilePath = (userDataPath: string): string =>
  path.join(userDataPath, SETTINGS_FILE_NAME);

const readSettingsFile = async (
  settingsPath: string,
): Promise<SettingsFile> => {
  try {
    const contents = await fs.readFile(settingsPath, "utf8");
    const parsed: unknown = JSON.parse(contents);
    if (parsed && typeof parsed === "object") {
      return parsed as SettingsFile;
    }
  } catch {
    // No settings file yet, or it's unreadable/invalid — treat as empty.
  }
  return {};
};

/**
 * Atomic write is not required for a file this small and low-write-frequency
 * (per the task spec) — writes the whole file each time, which is simple
 * and correct here.
 */
const writeSettingsFile = async (
  settingsPath: string,
  settings: SettingsFile,
): Promise<void> => {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(
    settingsPath,
    `${JSON.stringify(settings, null, 2)}\n`,
    "utf8",
  );
};

/**
 * Reads the persisted shortcut overrides. Missing/corrupt settings.json
 * reads back as `{}` (no overrides), which is indistinguishable from "every
 * shortcut is still at its default" — the correct behavior either way.
 */
export const readShortcutOverrides = async (
  settingsPath: string,
): Promise<Record<string, ShortcutBinding | null>> => {
  const settings = await readSettingsFile(settingsPath);
  return settings.shortcuts ?? {};
};

/**
 * Overwrites the persisted `shortcuts` map wholesale (not a per-id merge —
 * the caller is expected to send the full overrides map each time, same
 * contract `WorkspaceData.ts`'s `writeMetadata` uses for `workspace.json`).
 * Preserves any other top-level `settings.json` keys untouched.
 */
export const writeShortcutOverrides = async (
  settingsPath: string,
  overrides: Record<string, ShortcutBinding | null>,
): Promise<void> => {
  const settings = await readSettingsFile(settingsPath);
  await writeSettingsFile(settingsPath, { ...settings, shortcuts: overrides });
};

const EMPTY_SYNC_STATE: GithubSyncPersistedState = {
  config: null,
  lastSyncAt: null,
  lastSyncSummary: null,
};

/**
 * Builds the `GithubSyncStore` the sync engine depends on, over the same
 * `settings.json` the shortcut overrides use.
 *
 * `encryptToken`/`decryptToken` are injected rather than importing
 * Electron's `safeStorage` here, both for the usual testability reason and
 * because encryption availability is a runtime property of the OS keychain —
 * `electron/main.ts` decides what to pass, and a machine where `safeStorage`
 * is unavailable simply refuses to store a token rather than silently
 * writing one in plain text.
 */
export const createSettingsGithubSyncStore = ({
  settingsPath,
  encryptToken,
  decryptToken,
}: {
  settingsPath: string;
  encryptToken: (token: string) => string;
  decryptToken: (encrypted: string) => string;
}) => ({
  read: async (): Promise<GithubSyncPersistedState> => {
    const settings = await readSettingsFile(settingsPath);
    return settings.githubSync ?? EMPTY_SYNC_STATE;
  },

  write: async (next: GithubSyncPersistedState): Promise<void> => {
    const settings = await readSettingsFile(settingsPath);
    await writeSettingsFile(settingsPath, { ...settings, githubSync: next });
  },

  readToken: async (): Promise<string | null> => {
    const settings = await readSettingsFile(settingsPath);
    if (!settings.githubToken) {
      return null;
    }
    try {
      return decryptToken(settings.githubToken);
    } catch {
      // A token encrypted under a different machine/keychain identity is
      // unusable; treat it as absent so the UI prompts for a fresh one.
      return null;
    }
  },

  writeToken: async (token: string | null): Promise<void> => {
    const settings = await readSettingsFile(settingsPath);
    await writeSettingsFile(settingsPath, {
      ...settings,
      githubToken: token === null ? null : encryptToken(token),
    });
  },
});
