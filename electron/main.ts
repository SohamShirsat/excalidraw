import path from "node:path";

import { app, BrowserWindow, dialog, ipcMain, net, protocol } from "electron";

import { PersonalWorkspaceStore } from "../excalidraw-app/scripts/PersonalWorkspaceServer";

import { createWorkspaceIpcHandlers } from "./ipcHandlers";
import { WORKSPACE_IPC_CHANNELS } from "./ipcChannels";
import { resolveWorkspaceRoot } from "./workspaceRoot";

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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

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
  const handlers = createWorkspaceIpcHandlers(store);
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

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });

  try {
    await app.whenReady();

    const workspaceRoot = await resolveWorkspaceRoot();
    console.info(`[electron/main] resolved workspace root: ${workspaceRoot}`);

    const store = new PersonalWorkspaceStore(workspaceRoot);
    registerWorkspaceIpcHandlers(store);

    if (app.isPackaged) {
      registerAppProtocol();
    }

    await createMainWindow();
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
