import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useEffect, useMemo, useRef, useState } from "react";

import { buildPagePaletteEntries } from "../data/pagePalette";
import { formatRelativeTime, readRecentPages } from "../data/recentPages";

import "./PagePalette.scss";

import type { WorkspaceMetadata } from "../data/WorkspaceData";

const PageIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
    <path
      d="M5.25 2.75h6l3.5 3.5v11a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-14a.5.5 0 0 1 .5-.5Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path d="M11 2.75v3.5h3.75" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
    <path
      d="M10 4.5v11M4.5 10h11"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
    <circle cx="8.75" cy="8.75" r="5" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="m12.5 12.5 4.25 4.25"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const Highlighted = ({ text, query }: { text: string; query: string }) => {
  const needle = query.trim();
  if (!needle) {
    return <>{text}</>;
  }
  const index = text.toLocaleLowerCase().indexOf(needle.toLocaleLowerCase());
  if (index < 0) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + needle.length)}</mark>
      {text.slice(index + needle.length)}
    </>
  );
};

/**
 * The Ctrl/Cmd+T surface — "open a page", not "create a page".
 *
 * This mirrors what a new tab does in Figma (and in a browser): it opens a
 * search box over what already exists, with creating something new offered
 * as one explicit option at the bottom rather than as the only path. Page
 * *creation* keeps its own dedicated flow — `NewPageDialog`, which asks for
 * folder → file → page name — reached from the last row here, from Cmd+N,
 * or from the "+" buttons in the workspace rail.
 */
export const PagePalette = ({
  workspace,
  targetLabel,
  onClose,
  onOpenPage,
  onCreatePage,
}: {
  workspace: WorkspaceMetadata | null;
  /** "main" or "split" — which pane the chosen page will open into. */
  targetLabel: string;
  onClose: () => void;
  onOpenPage: (pageId: string) => void;
  onCreatePage: () => void;
}) => {
  const [query, setQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const [recents] = useState(readRecentPages);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const entries = useMemo(
    () => buildPagePaletteEntries({ workspace, recents, query }),
    [workspace, recents, query],
  );

  // "Create a new page" is the last row rather than a separate button, so
  // arrow keys reach it and Enter on an empty result set lands on it.
  const rowCount = entries.length + 1;
  const createIndex = entries.length;

  useEffect(() => {
    setFocusedIndex(0);
  }, [query]);

  useEffect(() => {
    const entry = entries[focusedIndex];
    if (entry) {
      rowRefs.current.get(entry.pageId)?.scrollIntoView({ block: "nearest" });
    }
  }, [entries, focusedIndex]);

  const commit = (index: number) => {
    if (index === createIndex) {
      onCreatePage();
      return;
    }
    const entry = entries[index];
    if (entry) {
      onOpenPage(entry.pageId);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setFocusedIndex((index) => (index + 1) % rowCount);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setFocusedIndex((index) => (index - 1 + rowCount) % rowCount);
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(focusedIndex);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const hasQuery = !!query.trim();
  const now = Date.now();

  return (
    <Dialog
      className="page-palette"
      size="small"
      title={false}
      onCloseRequest={onClose}
    >
      <div className="page-palette-body" onKeyDown={handleKeyDown}>
        <div className="page-palette-input">
          <span aria-hidden="true">
            <SearchIcon />
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder={`Search pages to open in ${targetLabel}…`}
            aria-label="Search pages"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        <div className="page-palette-section-label">
          {hasQuery
            ? `${entries.length} ${entries.length === 1 ? "page" : "pages"}`
            : "Recent"}
        </div>

        <div className="page-palette-results" role="listbox">
          {entries.map((entry, index) => (
            <button
              key={entry.pageId}
              type="button"
              role="option"
              aria-selected={index === focusedIndex}
              ref={(node) => {
                if (node) {
                  rowRefs.current.set(entry.pageId, node);
                } else {
                  rowRefs.current.delete(entry.pageId);
                }
              }}
              className={`page-palette-row${
                index === focusedIndex ? " is-focused" : ""
              }`}
              onMouseEnter={() => setFocusedIndex(index)}
              onClick={() => commit(index)}
            >
              <span className="page-palette-row-icon" aria-hidden="true">
                <PageIcon />
              </span>
              <span className="page-palette-row-copy">
                <strong>
                  <Highlighted text={entry.pageName} query={query} />
                </strong>
                <span>
                  <Highlighted
                    text={[entry.folderName, entry.fileName]
                      .filter(Boolean)
                      .join(" / ")}
                    query={query}
                  />
                </span>
              </span>
              <span className="page-palette-row-meta">
                {entry.openedAt === null
                  ? ""
                  : formatRelativeTime(entry.openedAt, now)}
              </span>
            </button>
          ))}

          {hasQuery && entries.length === 0 && (
            <p className="page-palette-empty">
              No page matches “{query.trim()}”.
            </p>
          )}

          <button
            type="button"
            role="option"
            aria-selected={focusedIndex === createIndex}
            className={`page-palette-row page-palette-row--create${
              focusedIndex === createIndex ? " is-focused" : ""
            }`}
            onMouseEnter={() => setFocusedIndex(createIndex)}
            onClick={() => commit(createIndex)}
          >
            <span className="page-palette-row-icon" aria-hidden="true">
              <PlusIcon />
            </span>
            <span className="page-palette-row-copy">
              <strong>New page…</strong>
              <span>Choose a folder and a file for it</span>
            </span>
            <span className="page-palette-row-meta">⌘N</span>
          </button>
        </div>

        <footer className="page-palette-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
          <span>
            <kbd>esc</kbd> to close
          </span>
        </footer>
      </div>
    </Dialog>
  );
};
