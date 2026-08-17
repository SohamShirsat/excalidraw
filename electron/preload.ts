import { contextBridge, ipcRenderer } from "electron";

import { APP_IPC_CHANNELS } from "./appIpcChannels";
import { WORKSPACE_IPC_CHANNELS } from "./ipcChannels";

import type { IpcRendererEvent } from "electron";
import type {
  ConfirmDialogOptions,
  MenuActionId,
  SyntheticKeydownPayload,
} from "./appIpcChannels";

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
};

contextBridge.exposeInMainWorld("electronApp", electronAppBridge);
