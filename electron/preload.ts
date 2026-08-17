import { contextBridge, ipcRenderer } from "electron";

import { WORKSPACE_IPC_CHANNELS } from "./ipcChannels";

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
