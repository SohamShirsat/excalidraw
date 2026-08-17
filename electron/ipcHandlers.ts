import { WORKSPACE_IPC_CHANNELS } from "./ipcChannels";

import type { IpcMainInvokeEvent } from "electron";
import type { PersonalWorkspaceStore } from "../excalidraw-app/scripts/PersonalWorkspaceServer";

/**
 * Mirrors the write-serialization queue that lived in
 * `PersonalWorkspaceServer.ts`'s HTTP middleware (`createMiddleware`'s
 * `operationQueue`/`queueOperation`,
 * `excalidraw-app/scripts/PersonalWorkspaceServer.ts`): reads wait for
 * whatever's already queued and then run directly (not themselves added to
 * the queue, so concurrent reads aren't serialized against each other);
 * writes are chained onto the queue.
 *
 * `queueOperation` deliberately does its `operationQueue.then(...)` chaining
 * *synchronously*, with no `await` beforehand — that's what makes it safe
 * against writes dispatched back-to-back in the same microtask batch (e.g.
 * several `ipcRenderer.invoke` calls fired without awaiting each other, or
 * `Promise.all`-driven test code). An `await operationQueue` before the
 * chaining step would let every call in such a batch read the *same*
 * pre-update queue value and start concurrently regardless — which is
 * exactly the bug an earlier version of this file had.
 */
export type WorkspaceWriteStateListener = (inFlightWrites: number) => void;

const createOperationQueue = (
  onWriteStateChange: WorkspaceWriteStateListener = () => {},
) => {
  let operationQueue: Promise<void> = Promise.resolve();
  let inFlightWrites = 0;

  const queueOperation = <T>(operation: () => Promise<T>): Promise<T> => {
    inFlightWrites += 1;
    onWriteStateChange(inFlightWrites);
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    result.then(
      () => {
        inFlightWrites -= 1;
        onWriteStateChange(inFlightWrites);
      },
      () => {
        inFlightWrites -= 1;
        onWriteStateChange(inFlightWrites);
      },
    );
    return result;
  };

  const runRead = async <T>(operation: () => Promise<T>): Promise<T> => {
    await operationQueue;
    return operation();
  };

  const runWrite = <T>(operation: () => Promise<T>): Promise<T> =>
    queueOperation(operation);

  return { runRead, runWrite };
};

/**
 * Builds the `ipcMain.handle` callbacks for the Personal Workspace API, each
 * wrapping the matching `PersonalWorkspaceStore` method 1:1. Returned as a
 * plain object (rather than calling `ipcMain.handle` directly) so this can
 * be exercised in tests without an actual Electron runtime — `main.ts`
 * registers each entry against `ipcMain.handle` itself.
 */
export const createWorkspaceIpcHandlers = (
  store: PersonalWorkspaceStore,
  onWriteStateChange?: WorkspaceWriteStateListener,
) => {
  const { runRead, runWrite } = createOperationQueue(onWriteStateChange);

  return {
    [WORKSPACE_IPC_CHANNELS.status]: (_event: IpcMainInvokeEvent) =>
      runRead(() => store.readStatus()),

    [WORKSPACE_IPC_CHANNELS.libraryRead]: (_event: IpcMainInvokeEvent) =>
      runRead(() => store.readLibrary()),

    [WORKSPACE_IPC_CHANNELS.libraryWrite]: (
      _event: IpcMainInvokeEvent,
      arg: { libraryItems: unknown[] },
    ) => runWrite(() => store.writeLibrary(arg)),

    [WORKSPACE_IPC_CHANNELS.metadataWrite]: (
      _event: IpcMainInvokeEvent,
      arg: unknown,
    ) => runWrite(() => store.syncMetadata(arg)),

    [WORKSPACE_IPC_CHANNELS.pagesRead]: (
      _event: IpcMainInvokeEvent,
      pageId: string,
    ) => runRead(() => store.readPageScene(pageId)),

    [WORKSPACE_IPC_CHANNELS.pagesWrite]: (
      _event: IpcMainInvokeEvent,
      pageId: string,
      scene: string,
    ) => runWrite(() => store.writePageScene(pageId, scene)),

    [WORKSPACE_IPC_CHANNELS.pagesDelete]: (
      _event: IpcMainInvokeEvent,
      pageIds: string[],
    ) => runWrite(() => store.deletePageScenes(pageIds)),
  };
};

export type WorkspaceIpcHandlers = ReturnType<
  typeof createWorkspaceIpcHandlers
>;
