import type {
  LibraryAdatapterSource,
  LibraryPersistedData,
  LibraryPersistenceAdapter,
} from "@excalidraw/excalidraw/data/library";

import * as WorkspaceTransport from "./workspaceTransport";
import { LibraryIndexedDBAdapter } from "./LocalData";

const loadRepositoryLibrary = () => WorkspaceTransport.readLibrary();

const saveRepositoryLibrary = (library: LibraryPersistedData) =>
  WorkspaceTransport.writeLibrary(library.libraryItems);

/**
 * Keeps the repository library as the durable source of truth. On the first
 * load after this adapter is introduced, any existing IndexedDB library is
 * copied to the repository without deleting the browser copy.
 */
export const RepositoryLibraryAdapter: LibraryPersistenceAdapter = {
  async load(_metadata: { source: LibraryAdatapterSource }) {
    const repositoryData = await loadRepositoryLibrary();
    // The transport layer deliberately types library payloads as `unknown[]`
    // (it mirrors the untyped IPC/HTTP boundary — see workspaceTransport.ts)
    // rather than depending on @excalidraw/excalidraw's types. The store on
    // the other end already validates this shape (`isLibraryData` in
    // PersonalWorkspaceServer.ts), so this is a trusted narrowing, not a
    // new assumption.
    const library = repositoryData.library as LibraryPersistedData | null;
    if (library) {
      void Promise.resolve(LibraryIndexedDBAdapter.save(library)).catch(
        (error: unknown) => {
          console.error("Couldn't update the browser library fallback.", error);
        },
      );
      return library;
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
