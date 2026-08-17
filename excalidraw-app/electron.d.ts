/**
 * Ambient bridge type exposed by `electron/preload.ts` via
 * `contextBridge.exposeInMainWorld("electronWorkspace", ...)`. Only present
 * when the renderer is running inside the Electron app; absent in the plain
 * browser dev app, where `excalidraw-app/data/workspaceTransport.ts` falls
 * back to `fetch` against `PersonalWorkspaceServer.ts`'s HTTP API instead.
 *
 * Kept structurally in sync with `electron/preload.ts`'s exposed object by
 * hand — the two live in separate TypeScript programs (this one is checked
 * as part of `excalidraw-app`'s bundler-resolution build, `electron/` is
 * checked as part of its own Node-targeted, CommonJS-output build) so there
 * isn't a single shared compiled type to import across that boundary.
 */

import type { ShortcutBinding } from "./data/shortcutBindings";
import type { WorkspaceMetadata } from "./data/workspaceTypes";

export interface ElectronWorkspaceBridge {
  readStatus: () => Promise<{
    workspace: WorkspaceMetadata | null;
    missingPageIds: string[];
    directory: string;
  }>;
  readLibrary: () => Promise<{
    library: { libraryItems: unknown[] } | null;
    directory: string;
  }>;
  writeLibrary: (libraryItems: readonly unknown[]) => Promise<void>;
  writeMetadata: (metadata: WorkspaceMetadata) => Promise<void>;
  readPageScene: (pageId: string) => Promise<string | null>;
  writePageScene: (pageId: string, scene: string) => Promise<void>;
  deletePageScenes: (pageIds: string[]) => Promise<void>;
}

/**
 * Payload replayed as a real `KeyboardEvent` on `document` by
 * `excalidraw-app/App.tsx` — see `electron/appIpcChannels.ts` for the
 * canonical (main-process-side) definition this is kept in sync with by
 * hand, for the same cross-TypeScript-program reason noted above.
 */
export interface SyntheticKeydownPayload {
  key: string;
  code: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** Bespoke menu action ids with no existing keyboard shortcut to synthesize. */
export type MenuActionId =
  | "export-json"
  | "change-canvas-background"
  | "open-settings"
  | "open-workspace-search"
  | "open-new-page";

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export interface OpenFilesDialogOptions {
  description: string;
  extensions?: string[];
  multiple?: boolean;
}

export interface OpenedFile {
  name: string;
  data: Uint8Array;
}

/**
 * Ambient bridge type exposed by `electron/preload.ts` via
 * `contextBridge.exposeInMainWorld("electronApp", ...)`. App-shell-level
 * browser stuff (native menu dispatch, native dialogs) — deliberately kept
 * separate from `ElectronWorkspaceBridge` above, which is scoped to
 * Personal Workspace data only.
 */
export interface ElectronAppBridge {
  onMenuSyntheticKeydown: (
    callback: (payload: SyntheticKeydownPayload) => void,
  ) => () => void;
  onMenuAction: (callback: (actionId: MenuActionId) => void) => () => void;
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  openFiles: (options: OpenFilesDialogOptions) => Promise<OpenedFile[]>;
  getVersion: () => Promise<string>;
  readShortcutOverrides: () => Promise<Record<string, ShortcutBinding | null>>;
  writeShortcutOverrides: (
    overrides: Record<string, ShortcutBinding | null>,
  ) => Promise<void>;
}

declare global {
  interface Window {
    electronWorkspace?: ElectronWorkspaceBridge;
    electronApp?: ElectronAppBridge;
  }
}
