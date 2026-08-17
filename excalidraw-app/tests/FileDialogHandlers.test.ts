import { describe, expect, it, vi } from "vitest";

import { createOpenFilesHandler } from "../../electron/fileDialogHandlers";

describe("electron/fileDialogHandlers", () => {
  it("normalizes filters, reads selected files, and preserves multiple selection", async () => {
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ["/tmp/Flow.excalidraw", "/tmp/Notes.json"],
    });
    const readFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const openFiles = createOpenFilesHandler(showOpenDialog, readFile);

    await expect(
      openFiles({
        description: "Excalidraw files",
        extensions: [".excalidraw", ".json"],
        multiple: true,
      }),
    ).resolves.toEqual([
      { name: "Flow.excalidraw", data: new Uint8Array([1, 2, 3]) },
      { name: "Notes.json", data: new Uint8Array([1, 2, 3]) },
    ]);
    expect(showOpenDialog).toHaveBeenCalledWith({
      title: "Excalidraw files",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Excalidraw files", extensions: ["excalidraw", "json"] },
      ],
    });
  });

  it("returns no files when the user cancels", async () => {
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: true,
      filePaths: [],
    });
    const readFile = vi.fn();
    const openFiles = createOpenFilesHandler(showOpenDialog, readFile);

    await expect(openFiles({ description: "Image" })).resolves.toEqual([]);
    expect(readFile).not.toHaveBeenCalled();
  });
});
