import { useEffect, useMemo, useRef, useState } from "react";

import {
  CLASSES,
  DEFAULT_SIDEBAR,
  KEYS,
  LIBRARY_SIDEBAR_TAB,
} from "@excalidraw/common";
import { useExcalidrawSetAppState } from "@excalidraw/excalidraw/components/App";
import { searchIcon } from "@excalidraw/excalidraw/components/icons";
import { librarySearchQueryAtom } from "@excalidraw/excalidraw/components/LibraryMenuItems";
import { libraryItemsAtom } from "@excalidraw/excalidraw/data/library";
import { useAtomValue, useSetAtom } from "@excalidraw/excalidraw/editor-jotai";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import {
  searchWorkspace,
  type WorkspaceSearchGroup,
  type WorkspaceSearchResult,
  type WorkspaceSearchScene,
} from "../data/WorkspaceSearch";
import { WorkspaceData } from "../data/WorkspaceData";

import "./WorkspaceSearchSidebar.scss";

import type { WorkspaceController } from "./WorkspaceSidebar";

const SEARCH_GROUPS: {
  id: "all" | WorkspaceSearchGroup;
  label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "workspace", label: "Workspace" },
  { id: "canvas", label: "Canvas" },
  { id: "assets", label: "Assets" },
  { id: "libraries", label: "Libraries" },
];

const GROUP_LABELS: Record<WorkspaceSearchGroup, string> = {
  workspace: "Folders, files & pages",
  canvas: "Canvas content",
  assets: "Assets",
  libraries: "Libraries",
};

const SearchResultIcon = ({ result }: { result: WorkspaceSearchResult }) => {
  const label =
    result.kind === "folder"
      ? "F"
      : result.kind === "file"
      ? "D"
      : result.kind === "page"
      ? "P"
      : result.kind === "text"
      ? "T"
      : result.kind === "frame"
      ? "⌗"
      : result.kind === "asset"
      ? "▧"
      : result.kind === "library"
      ? "◇"
      : "•";

  return (
    <span
      className={`workspace-global-search-result-icon is-${result.group}`}
      aria-hidden="true"
    >
      {label}
    </span>
  );
};

const HighlightedText = ({ text, query }: { text: string; query: string }) => {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return <>{text}</>;
  }

  const index = text
    .toLocaleLowerCase()
    .indexOf(normalizedQuery.toLocaleLowerCase());
  if (index < 0) {
    return <>{text}</>;
  }

  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + normalizedQuery.length)}</mark>
      {text.slice(index + normalizedQuery.length)}
    </>
  );
};

const parseStoredScene = (scene: string): WorkspaceSearchScene | null => {
  try {
    const parsed = JSON.parse(scene);
    if (!parsed || !Array.isArray(parsed.elements)) {
      return null;
    }
    return {
      elements: parsed.elements,
      files: parsed.files || {},
    };
  } catch {
    return null;
  }
};

export const WorkspaceSearchSidebar = ({
  workspaceController,
  excalidrawAPI,
}: {
  workspaceController: WorkspaceController;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) => {
  const { workspace, onOpenPage } = workspaceController;
  const setAppState = useExcalidrawSetAppState();
  const libraryItemsData = useAtomValue(libraryItemsAtom);
  const setLibrarySearchQuery = useSetAtom(librarySearchQueryAtom);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef(new Map<string, HTMLButtonElement>());
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState<"all" | WorkspaceSearchGroup>(
    "all",
  );
  const [storedScenes, setStoredScenes] = useState<
    Map<string, WorkspaceSearchScene>
  >(() => new Map());
  const [liveScene, setLiveScene] = useState<WorkspaceSearchScene | null>(() =>
    excalidrawAPI
      ? {
          elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
          files: excalidrawAPI.getFiles(),
        }
      : null,
  );
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexError, setIndexError] = useState("");
  const [focusedResultIndex, setFocusedResultIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    setLiveScene({
      elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
      files: excalidrawAPI.getFiles(),
    });

    return excalidrawAPI.onChange((elements, _appState, files) => {
      setLiveScene({ elements, files });
    });
  }, [excalidrawAPI]);

  const workspacePageKey = workspace?.pages
    .map((page) => page.id)
    .sort()
    .join("|");

  useEffect(() => {
    if (!workspace) {
      setStoredScenes(new Map());
      return;
    }

    let cancelled = false;
    setIsIndexing(true);
    setIndexError("");

    Promise.all(
      workspace.pages
        .filter((page) => page.id !== workspace.activePageId)
        .map(async (page) => {
          const scene = await WorkspaceData.loadPageScene(page.id);
          return [page.id, scene ? parseStoredScene(scene) : null] as const;
        }),
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }
        setStoredScenes(
          new Map(
            entries.filter(
              (entry): entry is readonly [string, WorkspaceSearchScene] =>
                !!entry[1],
            ),
          ),
        );
      })
      .catch((error) => {
        if (!cancelled) {
          console.error(error);
          setIndexError("Some saved pages could not be indexed.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsIndexing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [workspace, workspacePageKey, workspace?.activePageId]);

  const scenes = useMemo(() => {
    const next = new Map(storedScenes);
    if (workspace?.activePageId && liveScene) {
      next.set(workspace.activePageId, liveScene);
    }
    return next;
  }, [liveScene, storedScenes, workspace?.activePageId]);

  const allResults = useMemo(
    () =>
      workspace
        ? searchWorkspace({
            workspace,
            scenes,
            libraryItems: libraryItemsData.libraryItems,
            query,
          })
        : [],
    [libraryItemsData.libraryItems, query, scenes, workspace],
  );

  const results = useMemo(
    () =>
      activeGroup === "all"
        ? allResults
        : allResults.filter((result) => result.group === activeGroup),
    [activeGroup, allResults],
  );

  const groupedResults = useMemo(
    () =>
      (["workspace", "canvas", "assets", "libraries"] as const)
        .map((group) => ({
          group,
          results: results.filter((result) => result.group === group),
        }))
        .filter((section) => section.results.length),
    [results],
  );

  useEffect(() => {
    setFocusedResultIndex(0);
  }, [activeGroup, query]);

  useEffect(() => {
    const result = results[focusedResultIndex];
    if (result) {
      resultRefs.current.get(result.key)?.scrollIntoView({ block: "nearest" });
    }
  }, [focusedResultIndex, results]);

  const openResult = async (result: WorkspaceSearchResult) => {
    if (result.group === "libraries") {
      setLibrarySearchQuery(query.trim());
      setAppState({
        openSidebar: {
          name: DEFAULT_SIDEBAR.name,
          tab: LIBRARY_SIDEBAR_TAB,
        },
      });
      return;
    }

    if (result.pageId) {
      await onOpenPage(result.pageId);
    }

    if (result.elementId && excalidrawAPI) {
      window.requestAnimationFrame(() => {
        const element = excalidrawAPI
          .getSceneElements()
          .find((item) => item.id === result.elementId);
        if (!element) {
          return;
        }

        excalidrawAPI.updateScene({
          appState: {
            selectedElementIds: { [element.id]: true },
            selectedGroupIds: {},
          },
        });
        excalidrawAPI.setViewport({
          target: element,
          fit: "scale-down",
          animation: true,
        });
      });
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLocaleLowerCase() === KEYS.F
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.select();
      return;
    }

    if (event.key === KEYS.ESCAPE) {
      event.preventDefault();
      event.stopPropagation();
      if (query) {
        setQuery("");
      } else {
        setAppState({ openSidebar: null });
      }
      return;
    }

    if (!results.length) {
      return;
    }

    if (event.key === KEYS.ARROW_DOWN) {
      event.preventDefault();
      setFocusedResultIndex((index) => (index + 1) % results.length);
    } else if (event.key === KEYS.ARROW_UP) {
      event.preventDefault();
      setFocusedResultIndex(
        (index) => (index - 1 + results.length) % results.length,
      );
    } else if (event.key === KEYS.ENTER) {
      event.preventDefault();
      void openResult(results[focusedResultIndex] || results[0]);
    }
  };

  const hasQuery = !!query.trim();

  return (
    <div className="workspace-global-search" aria-label="Search everything">
      <div className="workspace-global-search-header">
        <h2>Search everything</h2>
        <p>Every folder, file, page, canvas, asset, and library item.</p>
      </div>

      <div
        className={`workspace-global-search-input ${CLASSES.SEARCH_MENU_INPUT_WRAPPER}`}
      >
        <span aria-hidden="true">{searchIcon}</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder="Search anything…"
          aria-label="Search everything"
        />
        <kbd>⌘ F</kbd>
      </div>

      <div
        className="workspace-global-search-filters"
        role="tablist"
        aria-label="Search scope"
      >
        {SEARCH_GROUPS.map((group) => {
          const count =
            group.id === "all"
              ? allResults.length
              : allResults.filter((result) => result.group === group.id).length;
          return (
            <button
              type="button"
              key={group.id}
              className={activeGroup === group.id ? "is-active" : ""}
              role="tab"
              aria-selected={activeGroup === group.id}
              onClick={() => setActiveGroup(group.id)}
            >
              {group.label}
              {hasQuery && <span>{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="workspace-global-search-status" role="status">
        {hasQuery
          ? `${results.length} ${results.length === 1 ? "result" : "results"}`
          : "Type a name, word, link, shape, or asset type."}
        {isIndexing && <span>Indexing saved pages…</span>}
      </div>

      {indexError && (
        <div className="workspace-global-search-warning">{indexError}</div>
      )}

      <div className="workspace-global-search-results">
        {!hasQuery && (
          <div className="workspace-global-search-empty">
            <div className="workspace-global-search-scope-grid">
              <span>
                <strong>Workspace</strong>
                Folders, files, pages
              </span>
              <span>
                <strong>Canvas</strong>
                Text, frames, links, shapes
              </span>
              <span>
                <strong>Assets</strong>
                Images, SVG, PNG, uploads
              </span>
              <span>
                <strong>Libraries</strong>
                Names and item content
              </span>
            </div>
            <p>
              Use <kbd>↑</kbd> <kbd>↓</kbd> to move and <kbd>Enter</kbd> to
              open.
            </p>
          </div>
        )}

        {hasQuery && !results.length && !isIndexing && (
          <div className="workspace-global-search-no-results">
            <strong>No results for “{query.trim()}”</strong>
            <span>
              Try a page name, canvas word, file type, or library name.
            </span>
          </div>
        )}

        {groupedResults.map((section) => (
          <section key={section.group}>
            <div className="workspace-global-search-section-heading">
              <span>{GROUP_LABELS[section.group]}</span>
              <span>{section.results.length}</span>
            </div>
            {section.results.map((result) => {
              const index = results.findIndex(
                (item) => item.key === result.key,
              );
              return (
                <button
                  type="button"
                  key={result.key}
                  ref={(node) => {
                    if (node) {
                      resultRefs.current.set(result.key, node);
                    } else {
                      resultRefs.current.delete(result.key);
                    }
                  }}
                  className={`workspace-global-search-result${
                    index === focusedResultIndex ? " is-focused" : ""
                  }`}
                  onMouseEnter={() => setFocusedResultIndex(index)}
                  onClick={() => void openResult(result)}
                >
                  <SearchResultIcon result={result} />
                  <span className="workspace-global-search-result-copy">
                    <strong>
                      <HighlightedText text={result.title} query={query} />
                    </strong>
                    <span>{result.subtitle}</span>
                  </span>
                  <span
                    className="workspace-global-search-result-action"
                    aria-hidden="true"
                  >
                    {result.group === "libraries" ? "Open" : "Go"}
                  </span>
                </button>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
};
