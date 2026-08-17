import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useMemo, useRef, useState } from "react";

import "./NewPageDialog.scss";

import type { WorkspaceMetadata } from "../data/WorkspaceData";

const NEW_OPTION_VALUE = "__new__";

export type NewPageDialogSubmitInput = {
  folderId: string | null;
  newFolderName: string | null;
  fileId: string | null;
  newFileName: string | null;
  pageName: string;
};

/**
 * The Ctrl/Cmd+T flow: rather than a bare "new page" that lands wherever the
 * app feels like, this always asks which folder and file the page belongs
 * in first — same mental model as "New Tab" in a browser that lets you pick
 * a window, just applied to this app's folder/file/page hierarchy.
 */
export const NewPageDialog = ({
  workspace,
  targetLabel,
  onClose,
  onSubmit,
}: {
  workspace: WorkspaceMetadata | null;
  targetLabel: string;
  onClose: () => void;
  onSubmit: (input: NewPageDialogSubmitInput) => void;
}) => {
  const folders = workspace?.folders ?? [];
  const [folderId, setFolderId] = useState<string>(
    () => folders[0]?.id ?? NEW_OPTION_VALUE,
  );
  const [newFolderName, setNewFolderName] = useState("New folder");
  const isNewFolder = folderId === NEW_OPTION_VALUE;

  const filesInFolder = useMemo(
    () =>
      isNewFolder
        ? []
        : (workspace?.files ?? []).filter((file) => file.folderId === folderId),
    [workspace, folderId, isNewFolder],
  );

  const [fileId, setFileId] = useState<string>(
    () => filesInFolder[0]?.id ?? NEW_OPTION_VALUE,
  );
  const [newFileName, setNewFileName] = useState("Untitled file");
  const isNewFile = isNewFolder || fileId === NEW_OPTION_VALUE;

  const pageCountInFile = isNewFile
    ? 0
    : (workspace?.pages ?? []).filter((page) => page.fileId === fileId).length;
  const [pageName, setPageName] = useState(() => `Page ${pageCountInFile + 1}`);
  const pageNameTouchedRef = useRef(false);

  const handleFolderChange = (value: string) => {
    setFolderId(value);
    const nextFiles =
      value === NEW_OPTION_VALUE
        ? []
        : (workspace?.files ?? []).filter((file) => file.folderId === value);
    const nextFileId = nextFiles[0]?.id ?? NEW_OPTION_VALUE;
    setFileId(nextFileId);
    if (!pageNameTouchedRef.current) {
      setPageName("Page 1");
    }
  };

  const handleFileChange = (value: string) => {
    setFileId(value);
    if (!pageNameTouchedRef.current) {
      const count =
        value === NEW_OPTION_VALUE
          ? 0
          : (workspace?.pages ?? []).filter((page) => page.fileId === value)
              .length;
      setPageName(`Page ${count + 1}`);
    }
  };

  const canSubmit =
    (!isNewFolder || newFolderName.trim().length > 0) &&
    (!isNewFile || newFileName.trim().length > 0) &&
    pageName.trim().length > 0;

  const submit = () => {
    if (!canSubmit) {
      return;
    }
    onSubmit({
      folderId: isNewFolder ? null : folderId,
      newFolderName: isNewFolder ? newFolderName.trim() : null,
      fileId: isNewFile ? null : fileId,
      newFileName: isNewFile ? newFileName.trim() : null,
      pageName: pageName.trim(),
    });
  };

  return (
    <Dialog
      className="new-page-dialog"
      size="small"
      title={`New page — ${targetLabel}`}
      onCloseRequest={onClose}
    >
      <form
        className="new-page-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label className="new-page-dialog-field">
          <span>Folder</span>
          <select
            value={folderId}
            onChange={(event) => handleFolderChange(event.target.value)}
            autoFocus
          >
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
            <option value={NEW_OPTION_VALUE}>+ New folder…</option>
          </select>
        </label>

        {isNewFolder && (
          <label className="new-page-dialog-field">
            <span>New folder name</span>
            <input
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="New folder"
            />
          </label>
        )}

        <label className="new-page-dialog-field">
          <span>File</span>
          <select
            value={isNewFolder ? NEW_OPTION_VALUE : fileId}
            disabled={isNewFolder}
            onChange={(event) => handleFileChange(event.target.value)}
          >
            {filesInFolder.map((file) => (
              <option key={file.id} value={file.id}>
                {file.name}
              </option>
            ))}
            <option value={NEW_OPTION_VALUE}>+ New file…</option>
          </select>
        </label>

        {isNewFile && (
          <label className="new-page-dialog-field">
            <span>New file name</span>
            <input
              value={newFileName}
              onChange={(event) => setNewFileName(event.target.value)}
              placeholder="Untitled file"
            />
          </label>
        )}

        <label className="new-page-dialog-field">
          <span>Page name</span>
          <input
            value={pageName}
            onChange={(event) => {
              pageNameTouchedRef.current = true;
              setPageName(event.target.value);
            }}
            placeholder="Page 1"
          />
        </label>

        <div className="new-page-dialog-actions">
          <button type="button" className="is-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}>
            Create page
          </button>
        </div>
      </form>
    </Dialog>
  );
};
