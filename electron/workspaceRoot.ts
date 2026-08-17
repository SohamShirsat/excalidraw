import { promises as fs } from "node:fs";
import path from "node:path";

import { app } from "electron";

const CONFIG_FILE_NAME = "config.json";

type PersistedWorkspaceConfig = {
  workspaceRoot?: string;
};

const directoryExists = async (target: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(target);
    return stat.isDirectory();
  } catch {
    return false;
  }
};

const readPersistedConfig = async (
  configPath: string,
): Promise<PersistedWorkspaceConfig> => {
  try {
    const contents = await fs.readFile(configPath, "utf8");
    const parsed: unknown = JSON.parse(contents);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as PersistedWorkspaceConfig).workspaceRoot === "string"
    ) {
      return parsed as PersistedWorkspaceConfig;
    }
  } catch {
    // No config yet, or it's unreadable/invalid — fall through to discovery.
  }
  return {};
};

const persistWorkspaceRoot = async (
  configPath: string,
  workspaceRoot: string,
): Promise<void> => {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(
    configPath,
    `${JSON.stringify({ workspaceRoot }, null, 2)}\n`,
    "utf8",
  );
};

/**
 * Resolves the directory `PersonalWorkspaceStore` should read/write.
 *
 * Resolution order:
 *  1. `ELECTRON_WORKSPACE_ROOT` env var — set by the `electron:dev` script,
 *     points directly at this checkout's `personal-workspace/` directory.
 *     No discovery logic in dev mode.
 *  2. A previously-resolved path persisted at
 *     `app.getPath("userData")/config.json` (packaged-app runs after the
 *     first launch).
 *  3. The known default for this machine —
 *     `~/Documents/Personal Excalidraw/personal-workspace` — adopted
 *     directly (zero migration) if it exists, and persisted for next time.
 *  4. A fresh `~/Documents/Personal Excalidraw/personal-workspace` this
 *     directory doesn't already exist elsewhere; `PersonalWorkspaceStore`
 *     creates it lazily on first metadata write, so it isn't pre-created
 *     here. Also persisted for next time.
 *
 * Keeping the directory outside Electron's opaque `userData` folder
 * preserves the git-trackable/portable workflow documented in
 * `personal-workspace/README.md`.
 */
export const resolveWorkspaceRoot = async (): Promise<string> => {
  const devWorkspaceRoot = process.env.ELECTRON_WORKSPACE_ROOT;
  if (devWorkspaceRoot) {
    return path.resolve(devWorkspaceRoot);
  }

  const configPath = path.join(app.getPath("userData"), CONFIG_FILE_NAME);
  const persisted = await readPersistedConfig(configPath);
  if (
    persisted.workspaceRoot &&
    (await directoryExists(persisted.workspaceRoot))
  ) {
    return persisted.workspaceRoot;
  }

  const knownDefault = path.join(
    app.getPath("home"),
    "Documents",
    "Personal Excalidraw",
    "personal-workspace",
  );
  if (await directoryExists(knownDefault)) {
    await persistWorkspaceRoot(configPath, knownDefault);
    return knownDefault;
  }

  const fallback = path.join(
    app.getPath("documents"),
    "Personal Excalidraw",
    "personal-workspace",
  );
  await persistWorkspaceRoot(configPath, fallback);
  return fallback;
};
