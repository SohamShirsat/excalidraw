import path from "node:path";
import { promises as fs } from "node:fs";

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  safeStorage,
  Menu,
} from "electron";
import windowStateKeeper from "electron-window-state";

import { PersonalWorkspaceStore } from "../excalidraw-app/scripts/PersonalWorkspaceServer";

import { APP_IPC_CHANNELS } from "./appIpcChannels";
import { createConfirmHandler } from "./dialogHandlers";
import { createOpenFilesHandler } from "./fileDialogHandlers";
import { createWorkspaceIpcHandlers } from "./ipcHandlers";
import { WORKSPACE_IPC_CHANNELS } from "./ipcChannels";
import { buildApplicationMenu } from "./menu";
import {
  createGithubSyncEngine,
  millisecondsUntilNextSync,
} from "./githubSync";
import {
  createSettingsGithubSyncStore,
  getSettingsFilePath,
  readShortcutOverrides,
  writeShortcutOverrides,
} from "./settingsStore";
import { resolveWorkspaceRoot } from "./workspaceRoot";

import type { GithubSyncEngine } from "./githubSync";
import type {
  ConfirmDialogOptions,
  OpenFilesDialogOptions,
} from "./appIpcChannels";
import type { ShortcutBinding } from "../excalidraw-app/data/shortcutBindings";
import type {
  GithubConflictResolution,
  GithubConnectInput,
  GithubSyncSchedule,
  GithubSyncStatus,
} from "../excalidraw-app/data/githubSyncTypes";

const APP_DISPLAY_NAME = "Personal Excalidraw";
// Renamed early (before `app.whenReady()`) so `app.getName()`/the About
// panel reflect it. Note this does NOT rename the running executable itself
// — in dev mode the Dock/menu-bar title still reads "Electron" (a bundle
// Info.plist property only a real packaged build controls); harmless, and
// resolved automatically once `electron-builder`'s `productName` (already
// set in `electron-builder.yml`) takes over for packaged builds.
app.setName(APP_DISPLAY_NAME);

// Fixed dev-server port (see `electron:dev` in package.json) — deliberately
// distinct from `start` (3000), `start:personal` (3001), and `serve` (5001).
const DEV_SERVER_URL = "http://localhost:5273";
const APP_SCHEME = "excalidraw";
// `app.getAppPath()` resolves to the directory containing the app's
// package.json — the project root in dev, or the packaged app's root
// (inside `app.asar`/`resources/app`) once built — so this stays correct
// regardless of how deep `electron-dist/electron/main.js` itself is nested.
const getRendererBuildDir = () =>
  path.join(app.getAppPath(), "excalidraw-app", "build");

// Only ever turned on deliberately for GUI-attach verification during
// development — never enabled by default, and never in a packaged build.
const shouldEnableCdp =
  !app.isPackaged && process.env.ELECTRON_ENABLE_CDP === "1";
if (shouldEnableCdp) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
  console.info("[electron/main] remote debugging enabled on port 9222");
}

// Must be called before `app.whenReady()`. A plain `file://` load of the
// packaged renderer would give Chromium a null/opaque origin, which breaks
// IndexedDB — the app's idb-keyval-based workspace cache
// (`excalidraw-app/data/WorkspaceData.ts`, `LocalData.ts`) depends on
// IndexedDB persisting normally. Registering a privileged custom scheme and
// serving the built files through it gives the renderer a normal, stable
// origin (`excalidraw://app`) instead.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;
let inFlightWorkspaceWrites = 0;
let canQuitWithPendingWrites = false;
let isQuitConfirmationOpen = false;

const registerAppProtocol = () => {
  protocol.handle(APP_SCHEME, (request) => {
    const requestUrl = new URL(request.url);
    const relativePath = decodeURIComponent(requestUrl.pathname);
    const targetPath = path.join(
      getRendererBuildDir(),
      relativePath === "/" || relativePath === "" ? "index.html" : relativePath,
    );
    return net.fetch(`file://${targetPath}`);
  });
};

const createMainWindow = async () => {
  // Persists window size/position across launches (multi-monitor-aware —
  // e.g. won't restore a window off-screen if a monitor got disconnected).
  // Its state file lives in `app.getPath("userData")` by default, which is
  // fine to leave as-is.
  const windowState = windowStateKeeper({
    defaultWidth: 1400,
    defaultHeight: 900,
  });

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    show: false,
    // The packaged app receives this same multi-resolution icon from
    // electron-builder.yml. In development it also prevents the generic
    // Electron icon from appearing in the Dock.
    icon: path.join(
      app.getAppPath(),
      "electron",
      "assets",
      "personal-excalidraw.icns",
    ),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Registers resize/move/close listeners and restores maximized/full-screen
  // state; must be called after construction, per `electron-window-state`'s
  // own contract.
  windowState.manage(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (!app.isPackaged) {
    console.info(`[electron/main] loading dev server at ${DEV_SERVER_URL}`);
    await mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    const url = `${APP_SCHEME}://app/index.html`;
    console.info(`[electron/main] loading packaged renderer from ${url}`);
    await mainWindow.loadURL(url);
  }
};

const registerWorkspaceIpcHandlers = (store: PersonalWorkspaceStore) => {
  const handlers = createWorkspaceIpcHandlers(store, (pendingWrites) => {
    inFlightWorkspaceWrites = pendingWrites;
  });
  ipcMain.handle(
    WORKSPACE_IPC_CHANNELS.status,
    handlers[WORKSPACE_IPC_CHANNELS.status],
  );
  ipcMain.handle(
    WORKSPACE_IPC_CHANNELS.libraryRead,
    handlers[WORKSPACE_IPC_CHANNELS.libraryRead],
  );
  ipcMain.handle(
    WORKSPACE_IPC_CHANNELS.libraryWrite,
    handlers[WORKSPACE_IPC_CHANNELS.libraryWrite],
  );
  ipcMain.handle(
    WORKSPACE_IPC_CHANNELS.metadataWrite,
    handlers[WORKSPACE_IPC_CHANNELS.metadataWrite],
  );
  ipcMain.handle(
    WORKSPACE_IPC_CHANNELS.pagesRead,
    handlers[WORKSPACE_IPC_CHANNELS.pagesRead],
  );
  ipcMain.handle(
    WORKSPACE_IPC_CHANNELS.pagesWrite,
    handlers[WORKSPACE_IPC_CHANNELS.pagesWrite],
  );
  ipcMain.handle(
    WORKSPACE_IPC_CHANNELS.pagesDelete,
    handlers[WORKSPACE_IPC_CHANNELS.pagesDelete],
  );
  console.info(
    `[electron/main] IPC handlers registered: ${Object.values(
      WORKSPACE_IPC_CHANNELS,
    ).join(", ")}`,
  );
};

/**
 * Registers the app-shell-level IPC surface (currently just the native
 * confirm dialog — the menu's synthetic-keydown/action channels are
 * one-directional `webContents.send` from `electron/menu.ts` and don't need
 * an `ipcMain.handle`). References the module-level `mainWindow` directly
 * (rather than capturing a parameter) so it always targets whichever window
 * is currently open, including after a mac "activate" re-creates it.
 */
const registerAppIpcHandlers = () => {
  const confirmHandler = createConfirmHandler((messageBoxOptions) => {
    if (!mainWindow) {
      return Promise.resolve({ response: 0 });
    }
    return dialog.showMessageBox(mainWindow, messageBoxOptions);
  });

  ipcMain.handle(
    APP_IPC_CHANNELS.dialogConfirm,
    (_event, options: ConfirmDialogOptions) => confirmHandler(options),
  );
  const openFilesHandler = createOpenFilesHandler(
    (options) =>
      mainWindow
        ? dialog.showOpenDialog(mainWindow, options)
        : dialog.showOpenDialog(options),
    (filePath) => fs.readFile(filePath),
  );
  ipcMain.handle(
    APP_IPC_CHANNELS.dialogOpenFiles,
    (_event, options: OpenFilesDialogOptions) => openFilesHandler(options),
  );
  ipcMain.handle(APP_IPC_CHANNELS.appVersion, () => app.getVersion());

  // Remappable-shortcut overrides — see `excalidraw-app/data/shortcutBindings.ts`
  // for the canonical registry these overrides get merged onto, and
  // `electron/settingsStore.ts` for the settings.json read/write logic
  // itself (kept as plain, path-parameterized functions there for
  // testability; resolved to a real path only here).
  const settingsPath = getSettingsFilePath(app.getPath("userData"));
  ipcMain.handle(APP_IPC_CHANNELS.settingsShortcutsRead, () =>
    readShortcutOverrides(settingsPath),
  );
  ipcMain.handle(
    APP_IPC_CHANNELS.settingsShortcutsWrite,
    (_event, overrides: Record<string, ShortcutBinding | null>) =>
      writeShortcutOverrides(settingsPath, overrides),
  );

  console.info(
    `[electron/main] app IPC handlers registered: ${[
      APP_IPC_CHANNELS.dialogConfirm,
      APP_IPC_CHANNELS.dialogOpenFiles,
      APP_IPC_CHANNELS.appVersion,
      APP_IPC_CHANNELS.settingsShortcutsRead,
      APP_IPC_CHANNELS.settingsShortcutsWrite,
    ].join(", ")}`,
  );
};

/**
 * GitHub backup/sync. All of the actual git work lives in
 * `electron/githubSync.ts`; this is the thin Electron layer around it —
 * token encryption via `safeStorage`, the IPC surface, and the timer that
 * drives the "every hour / day / week / month" schedules.
 */
let githubSyncEngine: GithubSyncEngine | null = null;
let autoSyncTimer: NodeJS.Timeout | null = null;
// Never re-arm faster than this, whatever the persisted timestamps say — a
// clock change or a corrupt lastSyncAt must not turn into a push loop.
const MIN_AUTO_SYNC_DELAY_MS = 60 * 1000;

const scheduleAutoSync = () => {
  if (autoSyncTimer) {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
  }
  const engine = githubSyncEngine;
  if (!engine) {
    return;
  }

  void engine
    .getStatus()
    .then((status) => {
      if (!status.config || !status.hasToken) {
        return;
      }
      const delay = millisecondsUntilNextSync(
        status.config.schedule,
        status.lastSyncAt,
        Date.now(),
      );
      if (delay === null) {
        return;
      }
      autoSyncTimer = setTimeout(() => {
        void engine
          .sync()
          .catch((error) =>
            console.error("[electron/main] scheduled sync failed", error),
          )
          .finally(scheduleAutoSync);
      }, Math.max(delay, MIN_AUTO_SYNC_DELAY_MS));
    })
    .catch((error) =>
      console.error("[electron/main] could not schedule sync", error),
    );
};

const registerGithubSyncHandlers = (workspaceRoot: string) => {
  const settingsPath = getSettingsFilePath(app.getPath("userData"));

  const store = createSettingsGithubSyncStore({
    settingsPath,
    encryptToken: (token) => {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error(
          "This Mac's keychain is unavailable, so the GitHub token cannot be stored securely. Sync is disabled until it is.",
        );
      }
      return safeStorage.encryptString(token).toString("base64");
    },
    decryptToken: (encrypted) =>
      safeStorage.decryptString(Buffer.from(encrypted, "base64")),
  });

  githubSyncEngine = createGithubSyncEngine({
    getWorkspaceDir: () => workspaceRoot,
    store,
    onStatusChange: (status) => {
      mainWindow?.webContents.send(APP_IPC_CHANNELS.githubSyncChanged, status);
    },
  });

  const engine = githubSyncEngine;
  // Every schedule-affecting operation re-arms the timer, so changing the
  // cadence in Settings takes effect without a restart.
  const withReschedule = async (
    operation: () => Promise<GithubSyncStatus>,
  ): Promise<GithubSyncStatus> => {
    const status = await operation();
    scheduleAutoSync();
    return status;
  };

  ipcMain.handle(APP_IPC_CHANNELS.githubSyncStatus, () => engine.getStatus());
  ipcMain.handle(
    APP_IPC_CHANNELS.githubSyncConnect,
    (_event, input: GithubConnectInput) =>
      withReschedule(() => engine.connect(input)),
  );
  ipcMain.handle(APP_IPC_CHANNELS.githubSyncDisconnect, () =>
    withReschedule(() => engine.disconnect()),
  );
  ipcMain.handle(APP_IPC_CHANNELS.githubSyncNow, () =>
    withReschedule(() => engine.sync()),
  );
  ipcMain.handle(
    APP_IPC_CHANNELS.githubSyncResolveConflict,
    (_event, resolution: GithubConflictResolution) =>
      withReschedule(() => engine.resolveConflict(resolution)),
  );
  ipcMain.handle(
    APP_IPC_CHANNELS.githubSyncPreferences,
    (_event, patch: { schedule?: GithubSyncSchedule; syncOnStart?: boolean }) =>
      withReschedule(() => engine.updatePreferences(patch)),
  );

  console.info("[electron/main] GitHub sync handlers registered");
};

/**
 * "Sync when the app opens", deferred so it never competes with the first
 * paint or with the workspace load — a backup push is never urgent.
 */
const runStartupSyncIfEnabled = () => {
  const engine = githubSyncEngine;
  if (!engine) {
    return;
  }
  void engine.getStatus().then((status) => {
    if (status.config?.syncOnStart && status.hasToken) {
      setTimeout(() => {
        void engine
          .sync()
          .catch((error) =>
            console.error("[electron/main] startup sync failed", error),
          );
      }, 5000);
    }
  });
};

const main = async () => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  // Autosave means this is normally a no-op. It only appears if the main
  // process is still serializing a real workspace write, preventing a quit
  // from racing the filesystem queue without adding a confirmation to every
  // normal macOS quit.
  app.on("before-quit", (event) => {
    if (canQuitWithPendingWrites || inFlightWorkspaceWrites === 0) {
      return;
    }
    event.preventDefault();
    if (isQuitConfirmationOpen) {
      return;
    }
    isQuitConfirmationOpen = true;
    const options = {
      type: "warning" as const,
      buttons: ["Keep app open", "Quit anyway"],
      defaultId: 0,
      cancelId: 0,
      message: "Saving your workspace…",
      detail:
        "A drawing is still being saved locally. Keep the app open until it finishes, or quit now.",
    };
    const confirmation = mainWindow
      ? dialog.showMessageBox(mainWindow, options)
      : dialog.showMessageBox(options);
    void confirmation
      .then(({ response }) => {
        isQuitConfirmationOpen = false;
        if (response === 1) {
          canQuitWithPendingWrites = true;
          app.quit();
        }
      })
      .catch((error) => {
        isQuitConfirmationOpen = false;
        console.error("[electron/main] quit confirmation failed", error);
      });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // Re-registers the menu too — its `click` handlers close over the
      // specific `BrowserWindow` instance passed to `buildApplicationMenu`,
      // which was just destroyed along with the last window.
      void createMainWindow().then(() => {
        if (mainWindow) {
          Menu.setApplicationMenu(buildApplicationMenu(mainWindow));
        }
      });
    }
  });

  try {
    await app.whenReady();

    const workspaceRoot = await resolveWorkspaceRoot();
    console.info(`[electron/main] resolved workspace root: ${workspaceRoot}`);

    const store = new PersonalWorkspaceStore(workspaceRoot);
    registerWorkspaceIpcHandlers(store);
    registerAppIpcHandlers();
    registerGithubSyncHandlers(workspaceRoot);

    if (app.isPackaged) {
      registerAppProtocol();
    }

    app.setAboutPanelOptions({
      applicationName: APP_DISPLAY_NAME,
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
    });

    await createMainWindow();

    if (mainWindow) {
      Menu.setApplicationMenu(buildApplicationMenu(mainWindow));
      console.info("[electron/main] application menu registered");
    }

    scheduleAutoSync();
    runStartupSyncIfEnabled();

    console.info("[electron/main] window created and loaded");
  } catch (error) {
    console.error("[electron/main] fatal startup error", error);
    dialog.showErrorBox(
      "Personal Excalidraw could not start",
      error instanceof Error ? error.message : "An unknown error occurred.",
    );
    app.quit();
  }
};

void main();
