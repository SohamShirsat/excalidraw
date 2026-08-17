import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { WORKSPACE_IPC_CHANNELS } from "../../electron/ipcChannels";
import { createWorkspaceIpcHandlers } from "../../electron/ipcHandlers";
import { PersonalWorkspaceStore } from "../scripts/PersonalWorkspaceServer";

import type { WorkspaceMetadata } from "../data/WorkspaceData";

/**
 * Exercises `electron/ipcHandlers.ts` the same way `electron/main.ts`'s
 * `ipcMain.handle` callbacks would invoke it — no real Electron runtime
 * involved, just the plain handler functions `createWorkspaceIpcHandlers`
 * returns, called with a stand-in `IpcMainInvokeEvent` (unused by any
 * handler, so `{}` is fine) followed by the same positional args the
 * preload bridge sends. Run against a temp directory, never
 * `personal-workspace/`.
 */

const FAKE_EVENT = {} as Electron.IpcMainInvokeEvent;

const temporaryDirectories: string[] = [];

const createTemporaryWorkspace = async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "personal-excalidraw-ipc-"),
  );
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const createWorkspace = (): WorkspaceMetadata => ({
  version: 1,
  name: "Local workspace",
  folders: [
    { id: "folder-1", name: "Client / Research", createdAt: 1, updatedAt: 1 },
  ],
  files: [
    {
      id: "file-1",
      folderId: "folder-1",
      name: "HotelMate",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  pages: [
    {
      id: "page-1",
      fileId: "file-1",
      name: "Booking flow",
      createdAt: 1,
      updatedAt: 1,
    },
  ],
  activePageId: "page-1",
  createdAt: 1,
  updatedAt: 1,
});

describe("electron/ipcHandlers", () => {
  it("round-trips metadata, a page scene, the library, and deletion via the IPC handler functions", async () => {
    const workspaceRoot = await createTemporaryWorkspace();
    const store = new PersonalWorkspaceStore(workspaceRoot);
    const handlers = createWorkspaceIpcHandlers(store);
    const workspace = createWorkspace();
    const scene = JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [{ id: "shape-1", type: "rectangle" }],
      appState: {},
      files: {},
    });

    // Matches an empty workspace before anything has been written yet.
    expect(await handlers[WORKSPACE_IPC_CHANNELS.status](FAKE_EVENT)).toEqual({
      workspace: null,
      missingPageIds: [],
      directory: "personal-workspace",
    });

    await handlers[WORKSPACE_IPC_CHANNELS.metadataWrite](FAKE_EVENT, workspace);
    await handlers[WORKSPACE_IPC_CHANNELS.pagesWrite](
      FAKE_EVENT,
      "page-1",
      scene,
    );

    const status = await handlers[WORKSPACE_IPC_CHANNELS.status](FAKE_EVENT);
    expect(status.workspace).toEqual(workspace);
    expect(status.missingPageIds).toEqual([]);

    expect(
      await handlers[WORKSPACE_IPC_CHANNELS.pagesRead](FAKE_EVENT, "page-1"),
    ).toBe(scene);

    const libraryItems = [{ id: "preset-group-1", elements: [] }];
    await handlers[WORKSPACE_IPC_CHANNELS.libraryWrite](FAKE_EVENT, {
      libraryItems,
    });
    expect(
      await handlers[WORKSPACE_IPC_CHANNELS.libraryRead](FAKE_EVENT),
    ).toEqual({
      library: { libraryItems },
      directory: "personal-workspace/library.excalidrawlib",
    });

    await handlers[WORKSPACE_IPC_CHANNELS.pagesDelete](FAKE_EVENT, ["page-1"]);
    expect(
      await handlers[WORKSPACE_IPC_CHANNELS.pagesRead](FAKE_EVENT, "page-1"),
    ).toBeNull();
    expect(
      (await handlers[WORKSPACE_IPC_CHANNELS.status](FAKE_EVENT))
        .missingPageIds,
    ).toEqual(["page-1"]);
  });

  it("serializes writes the same way the old HTTP middleware's operation queue did", async () => {
    const workspaceRoot = await createTemporaryWorkspace();
    const store = new PersonalWorkspaceStore(workspaceRoot);
    const handlers = createWorkspaceIpcHandlers(store);
    const workspace = createWorkspace();
    await handlers[WORKSPACE_IPC_CHANNELS.metadataWrite](FAKE_EVENT, workspace);

    // Fire a batch of page-scene writes concurrently — without the queue,
    // interleaved writes to the same underlying atomic-write temp file
    // scheme could race; with it, they resolve in submission order and every
    // write lands.
    const scenes = Array.from({ length: 5 }, (_, index) =>
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        elements: [{ id: `shape-${index}` }],
        appState: {},
        files: {},
      }),
    );

    await Promise.all(
      scenes.map((scene) =>
        handlers[WORKSPACE_IPC_CHANNELS.pagesWrite](
          FAKE_EVENT,
          "page-1",
          scene,
        ),
      ),
    );

    // The last write submitted should be the last one applied, since writes
    // are serialized in submission order rather than racing.
    expect(
      await handlers[WORKSPACE_IPC_CHANNELS.pagesRead](FAKE_EVENT, "page-1"),
    ).toBe(scenes[scenes.length - 1]);
  });

  it("reports in-flight writes so the shell can guard an in-progress quit", async () => {
    const workspaceRoot = await createTemporaryWorkspace();
    const store = new PersonalWorkspaceStore(workspaceRoot);
    const writeStates: number[] = [];
    const handlers = createWorkspaceIpcHandlers(store, (count) => {
      writeStates.push(count);
    });

    await handlers[WORKSPACE_IPC_CHANNELS.metadataWrite](
      FAKE_EVENT,
      createWorkspace(),
    );

    expect(writeStates).toEqual([1, 0]);
  });
});
