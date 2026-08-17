import { contextBridge, ipcRenderer } from "electron";

import type { IpcRendererEvent } from "electron";
import type {
  ConfirmDialogOptions,
  MenuActionId,
  OpenFilesDialogOptions,
  OpenedFile,
  SyntheticKeydownPayload,
} from "./appIpcChannels";
import type { ShortcutBinding } from "../excalidraw-app/data/shortcutBindings";
import type {
  GithubConflictResolution,
  GithubConnectInput,
  GithubSyncSchedule,
  GithubSyncStatus,
} from "../excalidraw-app/data/githubSyncTypes";

// Sandboxed Electron preloads may require Electron's built-in modules but not
// sibling CommonJS modules. Keep these channel names local (and in sync with
// `ipcChannels.ts`/`appIpcChannels.ts`) so the preload remains loadable with
// `sandbox: true`; otherwise no bridge is exposed to the renderer.
const WORKSPACE_IPC_CHANNELS = {
  status: "workspace:status",
  libraryRead: "workspace:library:read",
  libraryWrite: "workspace:library:write",
  metadataWrite: "workspace:metadata:write",
  pagesRead: "workspace:pages:read",
  pagesWrite: "workspace:pages:write",
  pagesDelete: "workspace:pages:delete",
} as const;

const APP_IPC_CHANNELS = {
  menuSyntheticKeydown: "menu:synthetic-keydown",
  menuAction: "menu:action",
  dialogConfirm: "dialog:confirm",
  dialogOpenFiles: "dialog:open-files",
  appVersion: "app:version",
  settingsShortcutsRead: "settings:shortcuts:read",
  settingsShortcutsWrite: "settings:shortcuts:write",
  githubSyncStatus: "github-sync:status",
  githubSyncConnect: "github-sync:connect",
  githubSyncDisconnect: "github-sync:disconnect",
  githubSyncNow: "github-sync:now",
  githubSyncResolveConflict: "github-sync:resolve-conflict",
  githubSyncPreferences: "github-sync:preferences",
  githubSyncChanged: "github-sync:changed",
} as const;

/**
 * Exposed on `window.electronWorkspace` in the renderer (see
 * `excalidraw-app/electron.d.ts` for the ambient type declaration the
 * renderer code checks against). Method names/shapes here are the contract
 * `excalidraw-app/data/workspaceTransport.ts` calls into when running inside
 * Electron, instead of its `fetch`-based fallback.
 *
 * `contextIsolation: true` + `sandbox: true` on the `BrowserWindow` means the
 * renderer has no direct access to `ipcRenderer`/Node — this bridge is the
 * only door between them, and it only exposes exactly these seven methods.
 */
const electronWorkspaceBridge = {
  readStatus: () => ipcRenderer.invoke(WORKSPACE_IPC_CHANNELS.status),

  readLibrary: () => ipcRenderer.invoke(WORKSPACE_IPC_CHANNELS.libraryRead),

  writeLibrary: (libraryItems: readonly unknown[]) =>
    ipcRenderer.invoke(WORKSPACE_IPC_CHANNELS.libraryWrite, { libraryItems }),

  writeMetadata: (metadata: unknown) =>
    ipcRenderer.invoke(WORKSPACE_IPC_CHANNELS.metadataWrite, metadata),

  readPageScene: (pageId: string) =>
    ipcRenderer.invoke(WORKSPACE_IPC_CHANNELS.pagesRead, pageId),

  writePageScene: (pageId: string, scene: string) =>
    ipcRenderer.invoke(WORKSPACE_IPC_CHANNELS.pagesWrite, pageId, scene),

  deletePageScenes: (pageIds: string[]) =>
    ipcRenderer.invoke(WORKSPACE_IPC_CHANNELS.pagesDelete, pageIds),
};

contextBridge.exposeInMainWorld("electronWorkspace", electronWorkspaceBridge);

/**
 * Exposed on `window.electronApp` — app-shell-level browser stuff (native
 * menu dispatch, native dialogs), deliberately kept separate from
 * `window.electronWorkspace` above, which is scoped to Personal Workspace
 * data only. See `excalidraw-app/electron.d.ts` for the ambient type this is
 * kept in sync with, and `excalidraw-app/App.tsx` for where
 * `onMenuSyntheticKeydown`/`onMenuAction` get subscribed to.
 */
const electronAppBridge = {
  /**
   * Subscribes to synthetic keydown payloads sent by `electron/menu.ts` for
   * menu items that mirror a real existing in-app keyboard shortcut. Returns
   * an unsubscribe function for proper effect cleanup.
   */
  onMenuSyntheticKeydown: (
    callback: (payload: SyntheticKeydownPayload) => void,
  ) => {
    const listener = (
      _event: IpcRendererEvent,
      payload: SyntheticKeydownPayload,
    ) => callback(payload);
    ipcRenderer.on(APP_IPC_CHANNELS.menuSyntheticKeydown, listener);
    return () =>
      ipcRenderer.removeListener(
        APP_IPC_CHANNELS.menuSyntheticKeydown,
        listener,
      );
  },

  /**
   * Subscribes to bespoke menu action ids sent by `electron/menu.ts` for the
   * few menu items with no existing keyboard shortcut to synthesize instead.
   * Returns an unsubscribe function for proper effect cleanup.
   */
  onMenuAction: (callback: (actionId: MenuActionId) => void) => {
    const listener = (_event: IpcRendererEvent, actionId: MenuActionId) =>
      callback(actionId);
    ipcRenderer.on(APP_IPC_CHANNELS.menuAction, listener);
    return () =>
      ipcRenderer.removeListener(APP_IPC_CHANNELS.menuAction, listener);
  },

  /**
   * Native `dialog.showMessageBox`-backed confirm, replacing `window.confirm`
   * inside Electron. Resolves `true` iff the destructive/confirm button was
   * chosen.
   */
  confirm: (options: ConfirmDialogOptions): Promise<boolean> =>
    ipcRenderer.invoke(APP_IPC_CHANNELS.dialogConfirm, options),

  /** Native file chooser for imports in the Electron renderer. */
  openFiles: (options: OpenFilesDialogOptions): Promise<OpenedFile[]> =>
    ipcRenderer.invoke(APP_IPC_CHANNELS.dialogOpenFiles, options),

  /** The packaged app version shown in Settings → About. */
  getVersion: (): Promise<string> =>
    ipcRenderer.invoke(APP_IPC_CHANNELS.appVersion),

  /**
   * Remappable-shortcut override persistence — reads/writes
   * `userData/settings.json` via `electron/settingsStore.ts`, keyed by the
   * `ShortcutDefinition.id`s in `excalidraw-app/data/shortcutBindings.ts`.
   * Consumed by `excalidraw-app/data/shortcutOverrides.ts`'s Electron
   * branch (its browser-dev fallback uses `localStorage` instead, when this
   * bridge is undefined).
   */
  readShortcutOverrides: (): Promise<Record<string, ShortcutBinding | null>> =>
    ipcRenderer.invoke(APP_IPC_CHANNELS.settingsShortcutsRead),

  writeShortcutOverrides: (
    overrides: Record<string, ShortcutBinding | null>,
  ): Promise<void> =>
    ipcRenderer.invoke(APP_IPC_CHANNELS.settingsShortcutsWrite, overrides),

  /**
   * GitHub backup/sync (`electron/githubSync.ts`). The token travels one way
   * only — into `connect` — and is never returned by any of these; the
   * renderer can learn `hasToken`, never the token itself.
   */
  githubSync: {
    getStatus: (): Promise<GithubSyncStatus> =>
      ipcRenderer.invoke(APP_IPC_CHANNELS.githubSyncStatus),

    connect: (input: GithubConnectInput): Promise<GithubSyncStatus> =>
      ipcRenderer.invoke(APP_IPC_CHANNELS.githubSyncConnect, input),

    disconnect: (): Promise<GithubSyncStatus> =>
      ipcRenderer.invoke(APP_IPC_CHANNELS.githubSyncDisconnect),

    syncNow: (): Promise<GithubSyncStatus> =>
      ipcRenderer.invoke(APP_IPC_CHANNELS.githubSyncNow),

    resolveConflict: (
      resolution: GithubConflictResolution,
    ): Promise<GithubSyncStatus> =>
      ipcRenderer.invoke(
        APP_IPC_CHANNELS.githubSyncResolveConflict,
        resolution,
      ),

    updatePreferences: (patch: {
      schedule?: GithubSyncSchedule;
      syncOnStart?: boolean;
    }): Promise<GithubSyncStatus> =>
      ipcRenderer.invoke(APP_IPC_CHANNELS.githubSyncPreferences, patch),

    onStatusChange: (callback: (status: GithubSyncStatus) => void) => {
      const listener = (_event: IpcRendererEvent, status: GithubSyncStatus) =>
        callback(status);
      ipcRenderer.on(APP_IPC_CHANNELS.githubSyncChanged, listener);
      return () =>
        ipcRenderer.removeListener(
          APP_IPC_CHANNELS.githubSyncChanged,
          listener,
        );
    },
  },
};

contextBridge.exposeInMainWorld("electronApp", electronAppBridge);
