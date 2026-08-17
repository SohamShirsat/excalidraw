/**
 * Pure data-shape types for the Personal Workspace hierarchy.
 *
 * This file intentionally has zero imports. `WorkspaceData.ts` (the browser
 * client) and `scripts/PersonalWorkspaceServer.ts` (the Node-side store,
 * consumed by both the Vite dev-server plugin and Electron's main process)
 * both need these shapes, but `WorkspaceData.ts` transitively pulls in
 * `@excalidraw/excalidraw`'s full barrel (React components, `import.meta.env`
 * usage, browser-only globals). Node/Electron tooling that only needs the
 * *types* — not the browser client — would drag all of that into its
 * compile if it imported from `WorkspaceData.ts` directly. Keeping the types
 * here lets `PersonalWorkspaceServer.ts` (and `electron/`, which compiles
 * with a Node-targeted `tsconfig.json`) depend on just the shapes.
 *
 * `WorkspaceData.ts` re-exports everything from here so its public API is
 * unchanged for existing consumers.
 */

export const WORKSPACE_VERSION = 1;

export type WorkspaceFolder = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceFile = {
  id: string;
  folderId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type WorkspacePage = {
  id: string;
  fileId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceMetadata = {
  version: typeof WORKSPACE_VERSION;
  name: string;
  folders: WorkspaceFolder[];
  files: WorkspaceFile[];
  pages: WorkspacePage[];
  activePageId: string;
  createdAt: number;
  updatedAt: number;
};
