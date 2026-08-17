import path from "node:path";

import type { OpenedFile, OpenFilesDialogOptions } from "./appIpcChannels";

export type ShowOpenDialog = (options: {
  title: string;
  properties: ("openFile" | "multiSelections")[];
  filters?: { name: string; extensions: string[] }[];
}) => Promise<{ canceled: boolean; filePaths: string[] }>;

export type ReadFile = (filePath: string) => Promise<Uint8Array>;

/**
 * Creates the native file picker handler without importing Electron itself so
 * it remains unit-testable. Files cross IPC as Uint8Arrays; the renderer turns
 * them into ordinary File objects and reuses Excalidraw's existing parser.
 */
export const createOpenFilesHandler =
  (showOpenDialog: ShowOpenDialog, readFile: ReadFile) =>
  async (options: OpenFilesDialogOptions): Promise<OpenedFile[]> => {
    const extensions = options.extensions?.map((extension) =>
      extension.replace(/^\./, ""),
    );
    const result = await showOpenDialog({
      title: options.description,
      properties: [
        "openFile",
        ...(options.multiple ? (["multiSelections"] as const) : []),
      ],
      ...(extensions?.length
        ? { filters: [{ name: options.description, extensions }] }
        : {}),
    });

    if (result.canceled) {
      return [];
    }

    return Promise.all(
      result.filePaths.map(async (filePath) => ({
        name: path.basename(filePath),
        data: await readFile(filePath),
      })),
    );
  };
