import { debounce } from "@excalidraw/common";
import { serializeAsJSON } from "@excalidraw/excalidraw";
import { createStore, del, get, set } from "idb-keyval";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

import { STORAGE_KEYS } from "../app_constants";

import * as WorkspaceTransport from "./workspaceTransport";
import {
  WORKSPACE_VERSION,
  type WorkspaceFolder,
  type WorkspaceFile,
  type WorkspacePage,
  type WorkspaceMetadata,
} from "./workspaceTypes";

// Re-exported so existing consumers can keep importing these from
// "./WorkspaceData" — the shapes themselves live in "./workspaceTypes" so
// Node/Electron-side code can depend on just the types without pulling in
// this file's browser-only imports (idb-keyval, @excalidraw/excalidraw).
export {
  WORKSPACE_VERSION,
  type WorkspaceFolder,
  type WorkspaceFile,
  type WorkspacePage,
  type WorkspaceMetadata,
};

export const WORKSPACE_SIDEBAR_TAB = "workspace";

export type WorkspaceItemType = "folder" | "file" | "page";

type WorkspaceIdFactory = () => string;
type CreateWorkspaceItemOptions = {
  name?: string;
  idFactory?: WorkspaceIdFactory;
};

const workspaceStore = createStore(
  `${STORAGE_KEYS.IDB_WORKSPACE}-db`,
  `${STORAGE_KEYS.IDB_WORKSPACE}-store`,
);

const METADATA_KEY = "metadata";
const sceneKey = (pageId: string) => `scene:${pageId}`;

const createId: WorkspaceIdFactory = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const getUniqueName = (baseName: string, existingNames: string[]) => {
  const normalizedNames = new Set(
    existingNames.map((name) => name.trim().toLocaleLowerCase()),
  );

  if (!normalizedNames.has(baseName.toLocaleLowerCase())) {
    return baseName;
  }

  let suffix = 2;
  while (normalizedNames.has(`${baseName} ${suffix}`.toLocaleLowerCase())) {
    suffix += 1;
  }

  return `${baseName} ${suffix}`;
};

const touchWorkspace = (workspace: WorkspaceMetadata): WorkspaceMetadata => ({
  ...workspace,
  updatedAt: Date.now(),
});

export const createInitialWorkspace = (
  initialFileName = "Untitled file",
  idFactory: WorkspaceIdFactory = createId,
): WorkspaceMetadata => {
  const now = Date.now();
  const folderId = idFactory();
  const fileId = idFactory();
  const pageId = idFactory();

  return {
    version: WORKSPACE_VERSION,
    name: "Local workspace",
    folders: [
      {
        id: folderId,
        name: "My drawings",
        createdAt: now,
        updatedAt: now,
      },
    ],
    files: [
      {
        id: fileId,
        folderId,
        name: initialFileName.trim() || "Untitled file",
        createdAt: now,
        updatedAt: now,
      },
    ],
    pages: [
      {
        id: pageId,
        fileId,
        name: "Page 1",
        createdAt: now,
        updatedAt: now,
      },
    ],
    activePageId: pageId,
    createdAt: now,
    updatedAt: now,
  };
};

export const addWorkspaceFolder = (
  workspace: WorkspaceMetadata,
  {
    name = "New folder",
    idFactory = createId,
  }: CreateWorkspaceItemOptions = {},
) => {
  const now = Date.now();
  const folder: WorkspaceFolder = {
    id: idFactory(),
    name: getUniqueName(
      name.trim() || "New folder",
      workspace.folders.map((item) => item.name),
    ),
    createdAt: now,
    updatedAt: now,
  };

  return {
    folder,
    workspace: touchWorkspace({
      ...workspace,
      folders: [...workspace.folders, folder],
    }),
  };
};

export const addWorkspaceFile = (
  workspace: WorkspaceMetadata,
  folderId: string,
  {
    name = "Untitled file",
    idFactory = createId,
  }: CreateWorkspaceItemOptions = {},
) => {
  if (!workspace.folders.some((folder) => folder.id === folderId)) {
    throw new Error("Cannot create a file in a missing folder.");
  }

  const now = Date.now();
  const file: WorkspaceFile = {
    id: idFactory(),
    folderId,
    name: getUniqueName(
      name.trim() || "Untitled file",
      workspace.files
        .filter((item) => item.folderId === folderId)
        .map((item) => item.name),
    ),
    createdAt: now,
    updatedAt: now,
  };
  const page: WorkspacePage = {
    id: idFactory(),
    fileId: file.id,
    name: "Page 1",
    createdAt: now,
    updatedAt: now,
  };

  return {
    file,
    page,
    workspace: touchWorkspace({
      ...workspace,
      files: [...workspace.files, file],
      pages: [...workspace.pages, page],
      activePageId: page.id,
    }),
  };
};

export const addWorkspacePage = (
  workspace: WorkspaceMetadata,
  fileId: string,
  { name, idFactory = createId }: CreateWorkspaceItemOptions = {},
) => {
  if (!workspace.files.some((file) => file.id === fileId)) {
    throw new Error("Cannot create a page in a missing file.");
  }

  const now = Date.now();
  const siblingPages = workspace.pages.filter((page) => page.fileId === fileId);
  const page: WorkspacePage = {
    id: idFactory(),
    fileId,
    name: getUniqueName(
      name?.trim() || `Page ${siblingPages.length + 1}`,
      siblingPages.map((item) => item.name),
    ),
    createdAt: now,
    updatedAt: now,
  };

  return {
    page,
    workspace: touchWorkspace({
      ...workspace,
      pages: [...workspace.pages, page],
      activePageId: page.id,
    }),
  };
};

export const renameWorkspaceItem = (
  workspace: WorkspaceMetadata,
  type: WorkspaceItemType,
  id: string,
  nextName: string,
) => {
  const name = nextName.trim();
  if (!name) {
    return workspace;
  }

  const updatedAt = Date.now();

  if (type === "folder") {
    return touchWorkspace({
      ...workspace,
      folders: workspace.folders.map((folder) =>
        folder.id === id ? { ...folder, name, updatedAt } : folder,
      ),
    });
  }

  if (type === "file") {
    return touchWorkspace({
      ...workspace,
      files: workspace.files.map((file) =>
        file.id === id ? { ...file, name, updatedAt } : file,
      ),
    });
  }

  return touchWorkspace({
    ...workspace,
    pages: workspace.pages.map((page) =>
      page.id === id ? { ...page, name, updatedAt } : page,
    ),
  });
};

export const getWorkspacePageIds = (
  workspace: WorkspaceMetadata,
  type: WorkspaceItemType,
  id: string,
) => {
  if (type === "page") {
    return workspace.pages.some((page) => page.id === id) ? [id] : [];
  }

  if (type === "file") {
    return workspace.pages
      .filter((page) => page.fileId === id)
      .map((page) => page.id);
  }

  const folderFileIds = new Set(
    workspace.files
      .filter((file) => file.folderId === id)
      .map((file) => file.id),
  );

  return workspace.pages
    .filter((page) => folderFileIds.has(page.fileId))
    .map((page) => page.id);
};

export const removeWorkspaceItem = (
  workspace: WorkspaceMetadata,
  type: WorkspaceItemType,
  id: string,
): WorkspaceMetadata => {
  const pageIds = new Set(getWorkspacePageIds(workspace, type, id));
  const nextPages = workspace.pages.filter((page) => !pageIds.has(page.id));

  if (nextPages.length === 0) {
    throw new Error("Your workspace must keep at least one page.");
  }

  if (type === "page") {
    const page = workspace.pages.find((item) => item.id === id);
    if (!page) {
      return workspace;
    }

    const siblingPages = workspace.pages.filter(
      (item) => item.fileId === page.fileId,
    );
    if (siblingPages.length === 1) {
      throw new Error("A file must keep at least one page.");
    }
  }

  const removedFileIds = new Set<string>();
  if (type === "file") {
    removedFileIds.add(id);
  } else if (type === "folder") {
    workspace.files
      .filter((file) => file.folderId === id)
      .forEach((file) => removedFileIds.add(file.id));
  }

  const nextFiles = workspace.files.filter(
    (file) => !removedFileIds.has(file.id),
  );
  if (nextFiles.length === 0) {
    throw new Error("Your workspace must keep at least one file.");
  }

  const nextFolders =
    type === "folder"
      ? workspace.folders.filter((folder) => folder.id !== id)
      : workspace.folders;

  return touchWorkspace({
    ...workspace,
    folders: nextFolders,
    files: nextFiles,
    pages: nextPages,
    activePageId: pageIds.has(workspace.activePageId)
      ? nextPages[0].id
      : workspace.activePageId,
  });
};

const isWorkspaceMetadata = (value: unknown): value is WorkspaceMetadata => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workspace = value as Partial<WorkspaceMetadata>;
  return (
    workspace.version === WORKSPACE_VERSION &&
    Array.isArray(workspace.folders) &&
    Array.isArray(workspace.files) &&
    Array.isArray(workspace.pages) &&
    typeof workspace.activePageId === "string" &&
    workspace.pages.some((page) => page.id === workspace.activePageId)
  );
};

type ScheduledSceneSave = {
  pageId: string;
  scene: string;
  onComplete?: (error: Error | null) => void;
};

type ScheduledSceneSaver = ((payload: ScheduledSceneSave) => void) & {
  flush: () => void;
  cancel: () => void;
};

export class WorkspaceData {
  private static _savedSceneJSON = new Map<string, string>();
  private static _pendingSceneJSON = new Map<string, string>();

  // One debounced saver per page, not a single shared one. Split view (and
  // any future multi-pane editing) can produce onChange bursts for two
  // *different* pages within the same 450ms window; a single shared
  // debounce would keep resetting its one timer to the latest call's
  // args, silently dropping the other page's save entirely.
  private static _saveSceneByPage = new Map<string, ScheduledSceneSaver>();

  private static _getSaveScene(pageId: string) {
    let saveScene = WorkspaceData._saveSceneByPage.get(pageId);
    if (!saveScene) {
      saveScene = debounce(
        async ({ scene, onComplete }: ScheduledSceneSave) => {
          try {
            await WorkspaceData.savePageSceneJSON(pageId, scene);
            onComplete?.(null);
          } catch (error: any) {
            console.error(error);
            onComplete?.(
              error instanceof Error
                ? error
                : new Error("Unable to save the workspace page."),
            );
          } finally {
            if (WorkspaceData._pendingSceneJSON.get(pageId) === scene) {
              WorkspaceData._pendingSceneJSON.delete(pageId);
            }
          }
        },
        450,
      );
      WorkspaceData._saveSceneByPage.set(pageId, saveScene);
    }
    return saveScene;
  }

  static async loadOrCreate(initialFileName?: string) {
    const repositoryStatus = await WorkspaceTransport.getWorkspaceStatus();
    const cachedWorkspace = await get<WorkspaceMetadata>(
      METADATA_KEY,
      workspaceStore,
    );

    if (isWorkspaceMetadata(repositoryStatus.workspace)) {
      await set(METADATA_KEY, repositoryStatus.workspace, workspaceStore);

      for (const pageId of repositoryStatus.missingPageIds) {
        const cachedScene = await get<string>(sceneKey(pageId), workspaceStore);
        if (cachedScene) {
          await WorkspaceTransport.writePageScene(pageId, cachedScene);
        }
      }

      return repositoryStatus.workspace;
    }

    const workspace = isWorkspaceMetadata(cachedWorkspace)
      ? cachedWorkspace
      : createInitialWorkspace(initialFileName);
    await WorkspaceData.saveMetadata(workspace);

    for (const page of workspace.pages) {
      const cachedScene = await get<string>(sceneKey(page.id), workspaceStore);
      if (cachedScene) {
        await WorkspaceTransport.writePageScene(page.id, cachedScene);
      }
    }

    return workspace;
  }

  static async saveMetadata(workspace: WorkspaceMetadata) {
    await WorkspaceTransport.writeMetadata(workspace);
    await set(METADATA_KEY, workspace, workspaceStore);
  }

  static async loadPageScene(pageId: string) {
    const scene = await WorkspaceTransport.readPageScene(pageId);
    if (scene) {
      await set(sceneKey(pageId), scene, workspaceStore);
      WorkspaceData._savedSceneJSON.set(pageId, scene);
      return scene;
    }

    const cachedScene = await get<string>(sceneKey(pageId), workspaceStore);
    if (cachedScene) {
      await WorkspaceTransport.writePageScene(pageId, cachedScene);
      WorkspaceData._savedSceneJSON.set(pageId, cachedScene);
    }
    return cachedScene;
  }

  static async savePageScene(
    pageId: string,
    elements: readonly ExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) {
    await WorkspaceData.savePageSceneJSON(
      pageId,
      serializeAsJSON(elements, appState, files, "local"),
    );
  }

  static async savePageSceneJSON(pageId: string, scene: string) {
    await WorkspaceTransport.writePageScene(pageId, scene);
    await set(sceneKey(pageId), scene, workspaceStore);
    WorkspaceData._savedSceneJSON.set(pageId, scene);
    WorkspaceData._pendingSceneJSON.delete(pageId);
  }

  static schedulePageSceneSave(payload: ScheduledSceneSave) {
    if (
      WorkspaceData._savedSceneJSON.get(payload.pageId) === payload.scene ||
      WorkspaceData._pendingSceneJSON.get(payload.pageId) === payload.scene
    ) {
      return false;
    }

    WorkspaceData._pendingSceneJSON.set(payload.pageId, payload.scene);
    WorkspaceData._getSaveScene(payload.pageId)(payload);
    return true;
  }

  static flushScheduledPageSave() {
    for (const saveScene of WorkspaceData._saveSceneByPage.values()) {
      saveScene.flush();
    }
  }

  static cancelScheduledPageSave() {
    for (const saveScene of WorkspaceData._saveSceneByPage.values()) {
      saveScene.cancel();
    }
    WorkspaceData._pendingSceneJSON.clear();
  }

  static async deletePageScenes(pageIds: string[]) {
    await WorkspaceTransport.deletePageScenes(pageIds);
    await Promise.all(
      pageIds.map((pageId) => del(sceneKey(pageId), workspaceStore)),
    );
    pageIds.forEach((pageId) => {
      WorkspaceData._savedSceneJSON.delete(pageId);
      WorkspaceData._pendingSceneJSON.delete(pageId);
      WorkspaceData._saveSceneByPage.get(pageId)?.cancel();
      WorkspaceData._saveSceneByPage.delete(pageId);
    });
  }
}
