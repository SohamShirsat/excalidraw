import { useEffect, useMemo, useRef, useState } from "react";

import "./WorkspaceSidebar.scss";

import type {
  WorkspaceItemType,
  WorkspaceMetadata,
} from "../data/WorkspaceData";

export type WorkspaceSaveStatus = "loading" | "saving" | "saved" | "error";

export type WorkspaceController = {
  workspace: WorkspaceMetadata | null;
  saveStatus: WorkspaceSaveStatus;
  onOpenPage: (pageId: string) => Promise<void>;
  onCreateFolder: (name: string) => Promise<void>;
  onCreateFile: (folderId: string, name: string) => Promise<void>;
  onCreatePage: (fileId: string, name: string) => Promise<void>;
  onRenameItem: (
    type: WorkspaceItemType,
    id: string,
    name: string,
  ) => Promise<void>;
  onDeleteItem: (type: WorkspaceItemType, id: string) => Promise<void>;
};

const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    viewBox="0 0 16 16"
    aria-hidden="true"
    className={expanded ? "workspace-chevron is-expanded" : "workspace-chevron"}
  >
    <path d="M5.5 3.5 10 8l-4.5 4.5" />
  </svg>
);

export const WorkspaceFolderIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M3.5 6.5h6l2 2h9v9.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

const FileIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M5 2.75h6l4 4v10.5H5V2.75Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinejoin="round"
    />
    <path
      d="M11 2.75v4h4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinejoin="round"
    />
  </svg>
);

const PageIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <rect
      x="4"
      y="3"
      width="10"
      height="12"
      rx="1.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
    />
    <path
      d="M6.5 6.5h5M6.5 9h5M6.5 11.5h3"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
    />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path
      d="M9 4v10M4 9h10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path
      d="M5.5 6v7.25c0 .7.55 1.25 1.25 1.25h4.5c.7 0 1.25-.55 1.25-1.25V6M4.5 4.5h9M7 4.5V3.25h4V4.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const EditIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path
      d="m4 12.75-.5 2 2-.5 7.75-7.75-1.5-1.5L4 12.75ZM10.75 6l1.5 1.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path
      d="m4 9.25 3.25 3.25L14 5.75"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path
      d="m5 5 8 8m0-8-8 8"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

type RenameState = {
  type: WorkspaceItemType;
  id: string;
  value: string;
};

type CreateState = {
  type: WorkspaceItemType;
  parentId: string | null;
  value: string;
};

const EditableName = ({
  type,
  id,
  name,
  renaming,
  setRenaming,
  onRename,
  onStartRename,
}: {
  type: WorkspaceItemType;
  id: string;
  name: string;
  renaming: RenameState | null;
  setRenaming: React.Dispatch<React.SetStateAction<RenameState | null>>;
  onRename: WorkspaceController["onRenameItem"];
  onStartRename: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const isRenaming = renaming?.type === type && renaming.id === id;

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const commitRename = () => {
    if (!isRenaming) {
      return;
    }

    const value = renaming.value.trim();
    setRenaming(null);
    if (value && value !== name) {
      void onRename(type, id, value);
    }
  };

  if (isRenaming) {
    return (
      <input
        ref={inputRef}
        className="workspace-rename-input"
        value={renaming.value}
        aria-label={`Rename ${type}`}
        onChange={(event) =>
          setRenaming({ ...renaming, value: event.target.value })
        }
        onBlur={commitRename}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitRename();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setRenaming(null);
          }
        }}
      />
    );
  }

  return (
    <span
      className="workspace-item-name"
      title={`${name} — double-click or use the pencil to rename`}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onStartRename();
      }}
    >
      {name}
    </span>
  );
};

const CreateItemRow = ({
  type,
  value,
  setValue,
  onCreate,
  onCancel,
}: {
  type: WorkspaceItemType;
  value: string;
  setValue: (value: string) => void;
  onCreate: (name: string) => Promise<void>;
  onCancel: () => void;
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commitCreate = async () => {
    const name = value.trim();
    if (!name || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate(name);
      onCancel();
    } finally {
      setIsSubmitting(false);
    }
  };

  const itemIcon =
    type === "folder" ? (
      <WorkspaceFolderIcon />
    ) : type === "file" ? (
      <FileIcon />
    ) : (
      <PageIcon />
    );

  return (
    <div className={`workspace-create-row is-${type}`}>
      <span className="workspace-row-icon">{itemIcon}</span>
      <input
        ref={inputRef}
        value={value}
        disabled={isSubmitting}
        aria-label={`Name new ${type}`}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void commitCreate();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <ActionButton
        label={`Create ${type}`}
        className="is-create-confirm"
        onClick={() => void commitCreate()}
      >
        <CheckIcon />
      </ActionButton>
      <ActionButton label={`Cancel new ${type}`} onClick={onCancel}>
        <CloseIcon />
      </ActionButton>
    </div>
  );
};

const ActionButton = ({
  label,
  className,
  children,
  onClick,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
}) => (
  <button
    type="button"
    className={`workspace-row-action${className ? ` ${className}` : ""}`}
    aria-label={label}
    title={label}
    onClick={onClick}
  >
    {children}
  </button>
);

const getSaveLabel = (status: WorkspaceSaveStatus) => {
  switch (status) {
    case "loading":
      return "Loading workspace";
    case "saving":
      return "Saving…";
    case "error":
      return "Repository save failed";
    default:
      return "Saved to repository";
  }
};

export const WorkspaceSidebar = ({
  workspace,
  saveStatus,
  onOpenPage,
  onCreateFolder,
  onCreateFile,
  onCreatePage,
  onRenameItem,
  onDeleteItem,
}: WorkspaceController) => {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [creating, setCreating] = useState<CreateState | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(
    () => new Set(),
  );
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(
    () => new Set(),
  );

  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleFolderIds = useMemo(() => {
    if (!workspace || !normalizedQuery) {
      return null;
    }

    const matchingFolderIds = new Set<string>();
    const matchingFileIds = new Set<string>();

    for (const file of workspace.files) {
      if (file.name.toLocaleLowerCase().includes(normalizedQuery)) {
        matchingFileIds.add(file.id);
        matchingFolderIds.add(file.folderId);
      }
    }

    for (const page of workspace.pages) {
      if (page.name.toLocaleLowerCase().includes(normalizedQuery)) {
        matchingFileIds.add(page.fileId);
        const file = workspace.files.find((item) => item.id === page.fileId);
        if (file) {
          matchingFolderIds.add(file.folderId);
        }
      }
    }

    for (const folder of workspace.folders) {
      if (folder.name.toLocaleLowerCase().includes(normalizedQuery)) {
        matchingFolderIds.add(folder.id);
      }
    }

    return { matchingFolderIds, matchingFileIds };
  }, [normalizedQuery, workspace]);

  if (!workspace) {
    return (
      <div className="workspace-sidebar workspace-sidebar--loading">
        <div className="workspace-loading-indicator" />
        <p>Preparing your local workspace…</p>
      </div>
    );
  }

  const toggleSetValue = (
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
    id: string,
  ) => {
    setter((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const requestDelete = (type: WorkspaceItemType, id: string, name: string) => {
    const description =
      type === "folder"
        ? "This removes every file and page inside it."
        : type === "file"
        ? "This removes every page inside it."
        : "This removes the page and its drawing.";

    if (window.confirm(`Delete “${name}”?\n\n${description}`)) {
      void onDeleteItem(type, id);
    }
  };

  const startRenaming = (type: WorkspaceItemType, id: string, name: string) => {
    setCreating(null);
    setRenaming({ type, id, value: name });
  };

  const startCreating = (
    type: WorkspaceItemType,
    parentId: string | null,
    suggestedName: string,
  ) => {
    setQuery("");
    setRenaming(null);
    setCreating({ type, parentId, value: suggestedName });

    if (type === "file" && parentId) {
      setCollapsedFolders((previous) => {
        const next = new Set(previous);
        next.delete(parentId);
        return next;
      });
    } else if (type === "page" && parentId) {
      const parentFile = workspace.files.find((file) => file.id === parentId);
      setCollapsedFiles((previous) => {
        const next = new Set(previous);
        next.delete(parentId);
        return next;
      });
      if (parentFile) {
        setCollapsedFolders((previous) => {
          const next = new Set(previous);
          next.delete(parentFile.folderId);
          return next;
        });
      }
    }
  };

  const updateCreatingValue = (value: string) => {
    setCreating((current) => (current ? { ...current, value } : null));
  };

  return (
    <div className="workspace-sidebar">
      <div className="workspace-sidebar-heading">
        <div>
          <h2>{workspace.name}</h2>
          <div
            className={`workspace-save-status is-${saveStatus}`}
            role="status"
          >
            <span className="workspace-save-dot" />
            {getSaveLabel(saveStatus)}
          </div>
        </div>
        <button
          type="button"
          className="workspace-new-folder-button"
          onClick={() => startCreating("folder", null, "New folder")}
        >
          <PlusIcon />
          <span>Folder</span>
        </button>
      </div>

      <div className="workspace-search">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle
            cx="8.5"
            cy="8.5"
            r="4.75"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="m12 12 4 4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search folders, files, pages"
          aria-label="Search workspace"
        />
      </div>

      <div className="workspace-naming-hint">
        Use <strong>+</strong> to create and the pencil to rename.
      </div>

      <div className="workspace-tree" role="tree" aria-label="Local workspace">
        {creating?.type === "folder" && (
          <CreateItemRow
            type="folder"
            value={creating.value}
            setValue={updateCreatingValue}
            onCreate={onCreateFolder}
            onCancel={() => setCreating(null)}
          />
        )}

        {workspace.folders.map((folder) => {
          const folderFiles = workspace.files.filter(
            (file) => file.folderId === folder.id,
          );
          const folderMatches =
            !visibleFolderIds ||
            visibleFolderIds.matchingFolderIds.has(folder.id);

          if (!folderMatches) {
            return null;
          }

          const folderExpanded =
            !!normalizedQuery || !collapsedFolders.has(folder.id);

          return (
            <div
              className="workspace-folder"
              key={folder.id}
              role="treeitem"
              aria-expanded={folderExpanded}
              aria-selected={false}
            >
              <div className="workspace-tree-row workspace-folder-row">
                <button
                  type="button"
                  className="workspace-disclosure"
                  aria-label={`${folderExpanded ? "Collapse" : "Expand"} ${
                    folder.name
                  }`}
                  onClick={() => toggleSetValue(setCollapsedFolders, folder.id)}
                >
                  <ChevronIcon expanded={folderExpanded} />
                </button>
                <span className="workspace-row-icon workspace-folder-icon">
                  <WorkspaceFolderIcon />
                </span>
                <EditableName
                  type="folder"
                  id={folder.id}
                  name={folder.name}
                  renaming={renaming}
                  setRenaming={setRenaming}
                  onRename={onRenameItem}
                  onStartRename={() =>
                    startRenaming("folder", folder.id, folder.name)
                  }
                />
                <span className="workspace-row-actions">
                  <ActionButton
                    label={`Rename folder ${folder.name}`}
                    className="is-always-visible"
                    onClick={(event) => {
                      event.stopPropagation();
                      startRenaming("folder", folder.id, folder.name);
                    }}
                  >
                    <EditIcon />
                  </ActionButton>
                  <ActionButton
                    label={`Create file in ${folder.name}`}
                    className="is-always-visible"
                    onClick={(event) => {
                      event.stopPropagation();
                      startCreating("file", folder.id, "Untitled file");
                    }}
                  >
                    <PlusIcon />
                  </ActionButton>
                  <ActionButton
                    label={`Delete folder ${folder.name}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      requestDelete("folder", folder.id, folder.name);
                    }}
                  >
                    <TrashIcon />
                  </ActionButton>
                </span>
              </div>

              {folderExpanded && (
                <div role="group" className="workspace-folder-children">
                  {creating?.type === "file" &&
                    creating.parentId === folder.id && (
                      <CreateItemRow
                        type="file"
                        value={creating.value}
                        setValue={updateCreatingValue}
                        onCreate={(name) => onCreateFile(folder.id, name)}
                        onCancel={() => setCreating(null)}
                      />
                    )}

                  {folderFiles.length === 0 &&
                  !(
                    creating?.type === "file" && creating.parentId === folder.id
                  ) ? (
                    <button
                      type="button"
                      className="workspace-empty-action"
                      onClick={() =>
                        startCreating("file", folder.id, "Untitled file")
                      }
                    >
                      <PlusIcon />
                      Create the first file
                    </button>
                  ) : (
                    folderFiles.map((file) => {
                      const filePages = workspace.pages.filter(
                        (page) => page.fileId === file.id,
                      );
                      const fileMatches =
                        !visibleFolderIds ||
                        visibleFolderIds.matchingFileIds.has(file.id) ||
                        file.name
                          .toLocaleLowerCase()
                          .includes(normalizedQuery) ||
                        folder.name
                          .toLocaleLowerCase()
                          .includes(normalizedQuery);

                      if (!fileMatches) {
                        return null;
                      }

                      const fileExpanded =
                        !!normalizedQuery || !collapsedFiles.has(file.id);

                      return (
                        <div
                          className="workspace-file"
                          key={file.id}
                          role="treeitem"
                          aria-expanded={fileExpanded}
                          aria-selected={false}
                        >
                          <div className="workspace-tree-row workspace-file-row">
                            <button
                              type="button"
                              className="workspace-disclosure"
                              aria-label={`${
                                fileExpanded ? "Collapse" : "Expand"
                              } ${file.name}`}
                              onClick={() =>
                                toggleSetValue(setCollapsedFiles, file.id)
                              }
                            >
                              <ChevronIcon expanded={fileExpanded} />
                            </button>
                            <span className="workspace-row-icon">
                              <FileIcon />
                            </span>
                            <EditableName
                              type="file"
                              id={file.id}
                              name={file.name}
                              renaming={renaming}
                              setRenaming={setRenaming}
                              onRename={onRenameItem}
                              onStartRename={() =>
                                startRenaming("file", file.id, file.name)
                              }
                            />
                            <span className="workspace-row-actions">
                              <ActionButton
                                label={`Rename file ${file.name}`}
                                className="is-always-visible"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startRenaming("file", file.id, file.name);
                                }}
                              >
                                <EditIcon />
                              </ActionButton>
                              <ActionButton
                                label={`Create page in ${file.name}`}
                                className="is-always-visible"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startCreating(
                                    "page",
                                    file.id,
                                    `Page ${filePages.length + 1}`,
                                  );
                                }}
                              >
                                <PlusIcon />
                              </ActionButton>
                              <ActionButton
                                label={`Delete file ${file.name}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  requestDelete("file", file.id, file.name);
                                }}
                              >
                                <TrashIcon />
                              </ActionButton>
                            </span>
                          </div>

                          {fileExpanded && (
                            <div
                              role="group"
                              className="workspace-file-children"
                            >
                              {creating?.type === "page" &&
                                creating.parentId === file.id && (
                                  <CreateItemRow
                                    type="page"
                                    value={creating.value}
                                    setValue={updateCreatingValue}
                                    onCreate={(name) =>
                                      onCreatePage(file.id, name)
                                    }
                                    onCancel={() => setCreating(null)}
                                  />
                                )}

                              {filePages.map((page) => {
                                if (
                                  normalizedQuery &&
                                  !page.name
                                    .toLocaleLowerCase()
                                    .includes(normalizedQuery) &&
                                  !file.name
                                    .toLocaleLowerCase()
                                    .includes(normalizedQuery) &&
                                  !folder.name
                                    .toLocaleLowerCase()
                                    .includes(normalizedQuery)
                                ) {
                                  return null;
                                }

                                const isActive =
                                  page.id === workspace.activePageId;
                                const isRenamingPage =
                                  renaming?.type === "page" &&
                                  renaming.id === page.id;

                                return (
                                  <div
                                    className={`workspace-tree-row workspace-page-row${
                                      isActive ? " is-active" : ""
                                    }`}
                                    key={page.id}
                                    role="treeitem"
                                    aria-current={isActive ? "page" : undefined}
                                    aria-selected={isActive}
                                  >
                                    {isRenamingPage ? (
                                      <div className="workspace-page-open">
                                        <span className="workspace-row-icon">
                                          <PageIcon />
                                        </span>
                                        <EditableName
                                          type="page"
                                          id={page.id}
                                          name={page.name}
                                          renaming={renaming}
                                          setRenaming={setRenaming}
                                          onRename={onRenameItem}
                                          onStartRename={() =>
                                            startRenaming(
                                              "page",
                                              page.id,
                                              page.name,
                                            )
                                          }
                                        />
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        className="workspace-page-open"
                                        onClick={() => void onOpenPage(page.id)}
                                      >
                                        <span className="workspace-row-icon">
                                          <PageIcon />
                                        </span>
                                        <EditableName
                                          type="page"
                                          id={page.id}
                                          name={page.name}
                                          renaming={renaming}
                                          setRenaming={setRenaming}
                                          onRename={onRenameItem}
                                          onStartRename={() =>
                                            startRenaming(
                                              "page",
                                              page.id,
                                              page.name,
                                            )
                                          }
                                        />
                                      </button>
                                    )}
                                    <span className="workspace-row-actions">
                                      <ActionButton
                                        label={`Rename page ${page.name}`}
                                        className="is-always-visible"
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          startRenaming(
                                            "page",
                                            page.id,
                                            page.name,
                                          );
                                        }}
                                      >
                                        <EditIcon />
                                      </ActionButton>
                                      <ActionButton
                                        label={`Delete page ${page.name}`}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          requestDelete(
                                            "page",
                                            page.id,
                                            page.name,
                                          );
                                        }}
                                      >
                                        <TrashIcon />
                                      </ActionButton>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {visibleFolderIds?.matchingFolderIds.size === 0 && (
          <div className="workspace-no-results">
            <p>No matching workspace items.</p>
            <button type="button" onClick={() => setQuery("")}>
              Clear search
            </button>
          </div>
        )}
      </div>

      <div className="workspace-storage-note">
        <span>Repository: personal-workspace/</span>
        <span aria-hidden="true">•</span>
        <span>Browser cache fallback</span>
      </div>
    </div>
  );
};
