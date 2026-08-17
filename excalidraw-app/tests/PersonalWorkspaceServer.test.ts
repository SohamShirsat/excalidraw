import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getPersonalLibraryPath,
  getWorkspacePagePath,
  PersonalWorkspaceStore,
  sanitizeWorkspacePathSegment,
} from "../scripts/PersonalWorkspaceServer";

import type { WorkspaceMetadata } from "../data/WorkspaceData";

const temporaryDirectories: string[] = [];

const createWorkspace = (): WorkspaceMetadata => ({
  version: 1,
  name: "Local workspace",
  folders: [
    {
      id: "folder-1",
      name: "Client / Research",
      createdAt: 1,
      updatedAt: 1,
    },
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

const createTemporaryWorkspace = async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "personal-excalidraw-"),
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

describe("PersonalWorkspaceStore", () => {
  it("stores the personal library as a portable Excalidraw library file", async () => {
    const workspaceRoot = await createTemporaryWorkspace();
    const store = new PersonalWorkspaceStore(workspaceRoot);
    const libraryItems = [
      {
        id: "preset-group-1",
        status: "unpublished",
        created: 1,
        elements: [{ id: "shape-1", type: "rectangle" }],
      },
    ];

    expect(await store.readLibrary()).toEqual({
      library: null,
      directory: "personal-workspace/library.excalidrawlib",
    });

    await store.writeLibrary({ libraryItems });

    expect(await store.readLibrary()).toEqual({
      library: { libraryItems },
      directory: "personal-workspace/library.excalidrawlib",
    });
    expect(
      JSON.parse(await readFile(getPersonalLibraryPath(workspaceRoot), "utf8")),
    ).toEqual({
      type: "excalidrawlib",
      version: 2,
      source: "Personal Excalidraw",
      libraryItems,
    });
  });

  it("rejects invalid library data without replacing the saved library", async () => {
    const workspaceRoot = await createTemporaryWorkspace();
    const store = new PersonalWorkspaceStore(workspaceRoot);
    const libraryItems = [{ id: "preset-group-1", elements: [] }];
    await store.writeLibrary({ libraryItems });

    await expect(
      store.writeLibrary({ libraryItems: "not-an-array" }),
    ).rejects.toThrow("invalid library data");
    expect((await store.readLibrary()).library).toEqual({ libraryItems });
  });

  it("writes repository metadata and a normal Excalidraw page file", async () => {
    const workspaceRoot = await createTemporaryWorkspace();
    const workspace = createWorkspace();
    const store = new PersonalWorkspaceStore(workspaceRoot);
    const scene = JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [{ id: "shape-1", type: "rectangle" }],
      appState: {},
      files: {},
    });

    await store.syncMetadata(workspace);
    await store.writePageScene("page-1", scene);

    const status = await store.readStatus();
    expect(status.workspace).toEqual(workspace);
    expect(status.missingPageIds).toEqual([]);
    expect(await store.readPageScene("page-1")).toBe(scene);

    const pagePath = getWorkspacePagePath(
      workspaceRoot,
      workspace,
      workspace.pages[0],
    );
    expect(await readFile(pagePath, "utf8")).toBe(scene);
    expect(pagePath).toContain("Client Research--folder-1");
    expect(pagePath).toContain("HotelMate--file-1");
    expect(pagePath).toContain("Booking flow--page-1.excalidraw");
  });

  it("moves an existing page when hierarchy names change", async () => {
    const workspaceRoot = await createTemporaryWorkspace();
    const workspace = createWorkspace();
    const store = new PersonalWorkspaceStore(workspaceRoot);
    const scene = JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements: [],
      appState: {},
      files: {},
    });
    await store.syncMetadata(workspace);
    await store.writePageScene("page-1", scene);
    const previousPagePath = getWorkspacePagePath(
      workspaceRoot,
      workspace,
      workspace.pages[0],
    );

    const renamedWorkspace: WorkspaceMetadata = {
      ...workspace,
      folders: [{ ...workspace.folders[0], name: "Product Research" }],
      files: [{ ...workspace.files[0], name: "Hotel workflows" }],
      pages: [{ ...workspace.pages[0], name: "Reservation lifecycle" }],
      updatedAt: 2,
    };
    await store.syncMetadata(renamedWorkspace);

    const renamedPagePath = getWorkspacePagePath(
      workspaceRoot,
      renamedWorkspace,
      renamedWorkspace.pages[0],
    );
    await expect(access(previousPagePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await readFile(renamedPagePath, "utf8")).toBe(scene);
    expect(await store.readPageScene("page-1")).toBe(scene);
  });

  it("deletes requested scenes without writing outside the workspace", async () => {
    const workspaceRoot = await createTemporaryWorkspace();
    const workspace = createWorkspace();
    const store = new PersonalWorkspaceStore(workspaceRoot);
    await store.syncMetadata(workspace);
    await store.writePageScene(
      "page-1",
      JSON.stringify({
        type: "excalidraw",
        version: 2,
        elements: [],
        appState: {},
        files: {},
      }),
    );

    await store.deletePageScenes(["page-1"]);

    expect(await store.readPageScene("page-1")).toBeNull();
    // Status is metadata-only so opening a large workspace never waits on a
    // filesystem check for each page. Missing scenes are discovered on demand
    // by `readPageScene()` instead.
    expect((await store.readStatus()).missingPageIds).toEqual([]);
  });
});

describe("sanitizeWorkspacePathSegment", () => {
  it("produces safe cross-platform repository names", () => {
    expect(sanitizeWorkspacePathSegment("../Client: Work?", "Folder")).toBe(
      "Client Work",
    );
    expect(sanitizeWorkspacePathSegment("CON", "Folder")).toBe("_CON");
    expect(sanitizeWorkspacePathSegment(" ... ", "Folder")).toBe("Folder");
  });
});
