import type {
  LibraryAdatapterSource,
  LibraryPersistedData,
  LibraryPersistenceAdapter,
} from "@excalidraw/excalidraw/data/library";

import { LibraryIndexedDBAdapter } from "./LocalData";

const REPOSITORY_LIBRARY_API = "/api/personal-workspace/library";

type RepositoryLibraryResponse = {
  library: LibraryPersistedData | null;
  directory: string;
};

const requestRepositoryLibrary = async <T>(init?: RequestInit): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(REPOSITORY_LIBRARY_API, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch (error) {
    throw new Error(
      "The repository library is unavailable. Start Personal Excalidraw with its local launcher.",
      { cause: error },
    );
  }

  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(
      body.error ||
        "Personal Excalidraw could not save the library to personal-workspace/.",
    );
  }

  return body;
};

const loadRepositoryLibrary = () =>
  requestRepositoryLibrary<RepositoryLibraryResponse>();

const saveRepositoryLibrary = (library: LibraryPersistedData) =>
  requestRepositoryLibrary<{ saved: true; directory: string }>({
    method: "PUT",
    body: JSON.stringify(library),
  });

/**
 * Keeps the repository library as the durable source of truth. On the first
 * load after this adapter is introduced, any existing IndexedDB library is
 * copied to the repository without deleting the browser copy.
 */
export const RepositoryLibraryAdapter: LibraryPersistenceAdapter = {
  async load(_metadata: { source: LibraryAdatapterSource }) {
    const repositoryData = await loadRepositoryLibrary();
    if (repositoryData.library) {
      void Promise.resolve(
        LibraryIndexedDBAdapter.save(repositoryData.library),
      ).catch((error: unknown) => {
        console.error("Couldn't update the browser library fallback.", error);
      });
      return repositoryData.library;
    }

    const browserData = await LibraryIndexedDBAdapter.load();
    if (browserData) {
      await saveRepositoryLibrary(browserData);
    }

    return browserData;
  },

  async save(libraryData: LibraryPersistedData) {
    await saveRepositoryLibrary(libraryData);
    try {
      await LibraryIndexedDBAdapter.save(libraryData);
    } catch (error) {
      console.error("Couldn't update the browser library fallback.", error);
    }
  },
};
