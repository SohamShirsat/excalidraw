/**
 * Single transport layer for the Personal Workspace filesystem API.
 *
 * In the browser dev app (`yarn start` / `yarn start:personal`), this talks
 * to `PersonalWorkspaceServer.ts`'s Vite middleware over `fetch`, exactly as
 * before. Inside the Electron app, `electron/preload.ts` exposes
 * `window.electronWorkspace`, and calls are routed over IPC to the same
 * `PersonalWorkspaceStore` methods instead — no HTTP round trip, no separate
 * dev-server process to "fail to connect" to.
 *
 * `WorkspaceData.ts` and `RepositoryLibraryData.ts` both used to have their
 * own near-identical `fetch` wrapper (`repositoryRequest` /
 * `requestRepositoryLibrary`). This module unifies both into one place.
 */

import type { WorkspaceMetadata } from "./workspaceTypes";

const WORKSPACE_API = "/api/personal-workspace";
const LIBRARY_API = `${WORKSPACE_API}/library`;

export type RepositoryWorkspaceStatus = {
  workspace: WorkspaceMetadata | null;
  missingPageIds: string[];
  directory: string;
};

export type RepositoryLibraryResponse = {
  library: { libraryItems: unknown[] } | null;
  directory: string;
};

const isElectronRuntime = () =>
  typeof window !== "undefined" && !!window.electronWorkspace;

/**
 * IPC calls can't "fail to connect" the way `fetch` can — if we got a
 * rejection at all, the main-process handler ran and threw. Surface its
 * message directly instead of the browser-dev-mode "start the local
 * launcher" copy, which assumes a separate HTTP server process that doesn't
 * exist in the Electron architecture.
 */
const describeIpcFailure = (error: unknown, fallback: string) =>
  new Error(error instanceof Error ? error.message : fallback, {
    cause: error,
  });

const fetchJSON = async <T>(
  pathname: string,
  init: RequestInit | undefined,
  unavailableMessage: string,
  defaultErrorMessage: string,
): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(pathname, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch (error) {
    throw new Error(unavailableMessage, { cause: error });
  }

  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || defaultErrorMessage);
  }

  return body;
};

const WORKSPACE_UNAVAILABLE_MESSAGE =
  "The repository workspace is unavailable. Start Personal Excalidraw with its local launcher.";
const WORKSPACE_SAVE_FAILED_MESSAGE =
  "Personal Excalidraw could not save to personal-workspace/.";
const LIBRARY_UNAVAILABLE_MESSAGE =
  "The repository library is unavailable. Start Personal Excalidraw with its local launcher.";
const LIBRARY_SAVE_FAILED_MESSAGE =
  "Personal Excalidraw could not save the library to personal-workspace/.";

export const getWorkspaceStatus =
  async (): Promise<RepositoryWorkspaceStatus> => {
    if (isElectronRuntime()) {
      try {
        return await window.electronWorkspace!.readStatus();
      } catch (error) {
        throw describeIpcFailure(
          error,
          "The repository workspace could not be loaded.",
        );
      }
    }

    return fetchJSON<RepositoryWorkspaceStatus>(
      WORKSPACE_API,
      undefined,
      WORKSPACE_UNAVAILABLE_MESSAGE,
      WORKSPACE_SAVE_FAILED_MESSAGE,
    );
  };

export const writeMetadata = async (
  workspace: WorkspaceMetadata,
): Promise<void> => {
  if (isElectronRuntime()) {
    try {
      await window.electronWorkspace!.writeMetadata(workspace);
      return;
    } catch (error) {
      throw describeIpcFailure(
        error,
        "The repository workspace could not be saved.",
      );
    }
  }

  await fetchJSON(
    `${WORKSPACE_API}/metadata`,
    { method: "PUT", body: JSON.stringify(workspace) },
    WORKSPACE_UNAVAILABLE_MESSAGE,
    WORKSPACE_SAVE_FAILED_MESSAGE,
  );
};

export const readPageScene = async (pageId: string): Promise<string | null> => {
  if (isElectronRuntime()) {
    try {
      return await window.electronWorkspace!.readPageScene(pageId);
    } catch (error) {
      throw describeIpcFailure(
        error,
        "The requested page could not be loaded.",
      );
    }
  }

  const { scene } = await fetchJSON<{ scene: string | null }>(
    `${WORKSPACE_API}/pages/${encodeURIComponent(pageId)}`,
    undefined,
    WORKSPACE_UNAVAILABLE_MESSAGE,
    WORKSPACE_SAVE_FAILED_MESSAGE,
  );
  return scene;
};

export const writePageScene = async (
  pageId: string,
  scene: string,
): Promise<void> => {
  if (isElectronRuntime()) {
    try {
      await window.electronWorkspace!.writePageScene(pageId, scene);
      return;
    } catch (error) {
      throw describeIpcFailure(error, "The page could not be saved.");
    }
  }

  await fetchJSON(
    `${WORKSPACE_API}/pages/${encodeURIComponent(pageId)}`,
    { method: "PUT", body: JSON.stringify({ scene }) },
    WORKSPACE_UNAVAILABLE_MESSAGE,
    WORKSPACE_SAVE_FAILED_MESSAGE,
  );
};

export const deletePageScenes = async (pageIds: string[]): Promise<void> => {
  if (isElectronRuntime()) {
    try {
      await window.electronWorkspace!.deletePageScenes(pageIds);
      return;
    } catch (error) {
      throw describeIpcFailure(error, "The page(s) could not be deleted.");
    }
  }

  await fetchJSON(
    `${WORKSPACE_API}/pages`,
    { method: "DELETE", body: JSON.stringify({ pageIds }) },
    WORKSPACE_UNAVAILABLE_MESSAGE,
    WORKSPACE_SAVE_FAILED_MESSAGE,
  );
};

export const readLibrary = async (): Promise<RepositoryLibraryResponse> => {
  if (isElectronRuntime()) {
    try {
      return await window.electronWorkspace!.readLibrary();
    } catch (error) {
      throw describeIpcFailure(
        error,
        "The repository library could not be loaded.",
      );
    }
  }

  return fetchJSON<RepositoryLibraryResponse>(
    LIBRARY_API,
    undefined,
    LIBRARY_UNAVAILABLE_MESSAGE,
    LIBRARY_SAVE_FAILED_MESSAGE,
  );
};

export const writeLibrary = async (
  libraryItems: readonly unknown[],
): Promise<void> => {
  if (isElectronRuntime()) {
    try {
      await window.electronWorkspace!.writeLibrary(libraryItems);
      return;
    } catch (error) {
      throw describeIpcFailure(
        error,
        "The repository library could not be saved.",
      );
    }
  }

  await fetchJSON(
    LIBRARY_API,
    { method: "PUT", body: JSON.stringify({ libraryItems }) },
    LIBRARY_UNAVAILABLE_MESSAGE,
    LIBRARY_SAVE_FAILED_MESSAGE,
  );
};
