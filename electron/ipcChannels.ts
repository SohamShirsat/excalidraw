/**
 * IPC channel names shared between `electron/main.ts` (registers
 * `ipcMain.handle` for each), `electron/preload.ts` (calls
 * `ipcRenderer.invoke` for each), and `electron/ipcHandlers.ts` (the actual
 * handler implementations). Kept in their own file, with zero other
 * dependencies, so both the main-process and preload bundles can import it
 * without pulling in anything else.
 */
export const WORKSPACE_IPC_CHANNELS = {
  status: "workspace:status",
  libraryRead: "workspace:library:read",
  libraryWrite: "workspace:library:write",
  metadataWrite: "workspace:metadata:write",
  pagesRead: "workspace:pages:read",
  pagesWrite: "workspace:pages:write",
  pagesDelete: "workspace:pages:delete",
} as const;

export type WorkspaceIpcChannel =
  typeof WORKSPACE_IPC_CHANNELS[keyof typeof WORKSPACE_IPC_CHANNELS];
