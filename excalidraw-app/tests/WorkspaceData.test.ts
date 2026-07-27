import { describe, expect, it } from "vitest";

import {
  addWorkspaceFile,
  addWorkspaceFolder,
  addWorkspacePage,
  createInitialWorkspace,
  getWorkspacePageIds,
  removeWorkspaceItem,
  renameWorkspaceItem,
} from "../data/WorkspaceData";

const createIdFactory =
  (...ids: string[]) =>
  () => {
    const id = ids.shift();
    if (!id) {
      throw new Error("Test ID factory ran out of IDs.");
    }
    return id;
  };

describe("WorkspaceData", () => {
  it("creates a usable folder, file, and page hierarchy", () => {
    const workspace = createInitialWorkspace(
      "Brainstorming",
      createIdFactory("folder-1", "file-1", "page-1"),
    );

    expect(workspace.folders).toMatchObject([
      { id: "folder-1", name: "My drawings" },
    ]);
    expect(workspace.files).toMatchObject([
      {
        id: "file-1",
        folderId: "folder-1",
        name: "Brainstorming",
      },
    ]);
    expect(workspace.pages).toMatchObject([
      { id: "page-1", fileId: "file-1", name: "Page 1" },
    ]);
    expect(workspace.activePageId).toBe("page-1");
  });

  it("adds uniquely named files and pages in creation order", () => {
    const initial = createInitialWorkspace(
      "Untitled file",
      createIdFactory("folder-1", "file-1", "page-1"),
    );
    const secondFile = addWorkspaceFile(initial, "folder-1", {
      idFactory: createIdFactory("file-2", "page-2"),
    });
    const secondPage = addWorkspacePage(secondFile.workspace, "file-2", {
      idFactory: createIdFactory("page-3"),
    });

    expect(secondFile.file.name).toBe("Untitled file 2");
    expect(secondPage.page.name).toBe("Page 2");
    expect(secondPage.workspace.activePageId).toBe("page-3");
    expect(
      secondPage.workspace.pages
        .filter((page) => page.fileId === "file-2")
        .map((page) => page.id),
    ).toEqual(["page-2", "page-3"]);
  });

  it("uses supplied names while preserving unique sibling records", () => {
    const initial = createInitialWorkspace(
      "Existing file",
      createIdFactory("folder-1", "file-1", "page-1"),
    );
    const namedFolder = addWorkspaceFolder(initial, {
      name: "  Research  ",
      idFactory: createIdFactory("folder-2"),
    });
    const namedFile = addWorkspaceFile(
      namedFolder.workspace,
      namedFolder.folder.id,
      {
        name: "Wireframes",
        idFactory: createIdFactory("file-2", "page-2"),
      },
    );
    const duplicateFile = addWorkspaceFile(
      namedFile.workspace,
      namedFolder.folder.id,
      {
        name: "Wireframes",
        idFactory: createIdFactory("file-3", "page-3"),
      },
    );
    const namedPage = addWorkspacePage(
      duplicateFile.workspace,
      namedFile.file.id,
      {
        name: "Checkout flow",
        idFactory: createIdFactory("page-4"),
      },
    );

    expect(namedFolder.folder).toMatchObject({
      id: "folder-2",
      name: "Research",
    });
    expect(namedFile.file).toMatchObject({
      id: "file-2",
      folderId: "folder-2",
      name: "Wireframes",
    });
    expect(duplicateFile.file.name).toBe("Wireframes 2");
    expect(namedPage.page).toMatchObject({
      id: "page-4",
      fileId: "file-2",
      name: "Checkout flow",
    });
  });

  it("renames items without changing their hierarchy", () => {
    const initial = createInitialWorkspace(
      "Untitled file",
      createIdFactory("folder-1", "file-1", "page-1"),
    );
    const renamed = renameWorkspaceItem(
      renameWorkspaceItem(initial, "file", "file-1", "Wireframes"),
      "page",
      "page-1",
      "Checkout flow",
    );

    expect(renamed.files[0]).toMatchObject({
      id: "file-1",
      folderId: "folder-1",
      name: "Wireframes",
    });
    expect(renamed.pages[0]).toMatchObject({
      id: "page-1",
      fileId: "file-1",
      name: "Checkout flow",
    });
  });

  it("cascades folder deletion while preserving another workspace branch", () => {
    const initial = createInitialWorkspace(
      "First file",
      createIdFactory("folder-1", "file-1", "page-1"),
    );
    const secondFolder = addWorkspaceFolder(initial, {
      idFactory: createIdFactory("folder-2"),
    });
    const secondFile = addWorkspaceFile(secondFolder.workspace, "folder-2", {
      idFactory: createIdFactory("file-2", "page-2"),
    });

    expect(
      getWorkspacePageIds(secondFile.workspace, "folder", "folder-1"),
    ).toEqual(["page-1"]);

    const remaining = removeWorkspaceItem(
      secondFile.workspace,
      "folder",
      "folder-1",
    );

    expect(remaining.folders.map((folder) => folder.id)).toEqual(["folder-2"]);
    expect(remaining.files.map((file) => file.id)).toEqual(["file-2"]);
    expect(remaining.pages.map((page) => page.id)).toEqual(["page-2"]);
    expect(remaining.activePageId).toBe("page-2");
  });

  it("guards the final file and final page invariants", () => {
    const initial = createInitialWorkspace(
      "Only file",
      createIdFactory("folder-1", "file-1", "page-1"),
    );

    expect(() => removeWorkspaceItem(initial, "page", "page-1")).toThrow(
      "at least one page",
    );
    expect(() => removeWorkspaceItem(initial, "file", "file-1")).toThrow(
      "at least one page",
    );
    expect(() => removeWorkspaceItem(initial, "folder", "folder-1")).toThrow(
      "at least one page",
    );
  });
});
