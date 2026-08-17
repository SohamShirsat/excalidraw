import {
  fileOpen as _fileOpen,
  fileSave as _fileSave,
  supported as nativeFileSystemSupported,
} from "browser-fs-access";

import { MIME_TYPES } from "@excalidraw/common";

import { normalizeFile } from "./blob";

type FILE_EXTENSION = Exclude<keyof typeof MIME_TYPES, "binary">;

type ElectronFileBridge = {
  openFiles?: (opts: {
    description: string;
    extensions?: string[];
    multiple?: boolean;
  }) => Promise<{ name: string; data: Uint8Array }[]>;
};

const getElectronFileBridge = (): ElectronFileBridge | undefined =>
  (globalThis as typeof globalThis & { electronApp?: ElectronFileBridge })
    .electronApp;

export const fileOpen = async <M extends boolean | undefined = false>(opts: {
  extensions?: FILE_EXTENSION[];
  description: string;
  multiple?: M;
}): Promise<M extends false | undefined ? File : File[]> => {
  // an unsafe TS hack, alas not much we can do AFAIK
  type RetType = M extends false | undefined ? File : File[];

  const mimeTypes = opts.extensions?.reduce((mimeTypes, type) => {
    mimeTypes.push(MIME_TYPES[type]);

    return mimeTypes;
  }, [] as string[]);

  const extensions = opts.extensions?.reduce((acc, ext) => {
    if (ext === "jpg") {
      return acc.concat(".jpg", ".jpeg");
    }
    return acc.concat(`.${ext}`);
  }, [] as string[]);

  const electronBridge = getElectronFileBridge();
  if (electronBridge?.openFiles) {
    const openedFiles = await electronBridge.openFiles({
      description: opts.description,
      extensions,
      multiple: opts.multiple,
    });
    if (!openedFiles.length) {
      throw new DOMException("The file dialog was cancelled.", "AbortError");
    }
    const files = await Promise.all(
      openedFiles.map((file) =>
        // Electron's IPC type is Uint8Array<ArrayBufferLike>, while the DOM
        // File constructor only accepts an ArrayBuffer-backed view. Copying
        // also prevents a transferred IPC buffer from being retained.
        normalizeFile(
          new File(
            [new Uint8Array(file.data).buffer as ArrayBuffer],
            file.name,
          ),
        ),
      ),
    );
    return (opts.multiple ? files : files[0]) as RetType;
  }

  const files = await _fileOpen({
    description: opts.description,
    extensions,
    mimeTypes,
    multiple: opts.multiple ?? false,
  });

  if (Array.isArray(files)) {
    return (await Promise.all(
      files.map((file) => normalizeFile(file)),
    )) as RetType;
  }
  return (await normalizeFile(files)) as RetType;
};

export const fileSave = (
  blob: Blob | Promise<Blob>,
  opts: {
    /** supply without the extension */
    name: string;
    /** file extension */
    extension: FILE_EXTENSION;
    mimeTypes?: string[];
    description: string;
    /** existing FileSystemFileHandle */
    fileHandle?: FileSystemFileHandle | null;
  },
) => {
  return _fileSave(
    blob,
    {
      fileName: `${opts.name}.${opts.extension}`,
      description: opts.description,
      extensions: [`.${opts.extension}`],
      mimeTypes: opts.mimeTypes,
    },
    opts.fileHandle,
    false,
  );
};

export { nativeFileSystemSupported };
