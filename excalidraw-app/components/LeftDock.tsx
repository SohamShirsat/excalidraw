import { useCallback, useEffect, useRef, useState } from "react";

import { WorkspaceSidebar } from "./WorkspaceSidebar";

import "./LeftDock.scss";

import type { WorkspaceController } from "./WorkspaceSidebar";

const ACTIVE_TAB_STORAGE_KEY = "personal-excalidraw-left-dock-tab";
const WIDTH_STORAGE_KEY = "personal-excalidraw-left-dock-width";
const COLLAPSED_STORAGE_KEY = "personal-excalidraw-workspace-rail-collapsed";

const MIN_WIDTH = 200;
const MAX_WIDTH = 520;
const DEFAULT_WIDTH = 264;

export type LeftDockTab = "pages" | "library" | "search";

export const LEFT_DOCK_TABS: LeftDockTab[] = ["pages", "library", "search"];

const TAB_LABELS: Record<LeftDockTab, string> = {
  pages: "Pages",
  library: "Library",
  search: "Search",
};

const PagesIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
    <path
      d="M2.75 5.25h5l1.5 1.75h8v8.25a1.5 1.5 0 0 1-1.5 1.5h-11.5a1.5 1.5 0 0 1-1.5-1.5V5.25Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

const LibraryIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
    <rect
      x="2.75"
      y="2.75"
      width="6"
      height="6"
      rx="1.25"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <rect
      x="11.25"
      y="2.75"
      width="6"
      height="6"
      rx="3"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <rect
      x="2.75"
      y="11.25"
      width="6"
      height="6"
      rx="1.25"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <path
      d="m14.25 11 3 6h-6l3-6Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
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

const SettingsIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
    <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.4" />
    <path
      d="M8.6 2.9a1 1 0 0 1 1-.83h.8a1 1 0 0 1 1 .83l.14.9a6 6 0 0 1 1.3.75l.85-.34a1 1 0 0 1 1.23.42l.4.7a1 1 0 0 1-.22 1.27l-.7.58a6 6 0 0 1 0 1.5l.7.58a1 1 0 0 1 .22 1.27l-.4.7a1 1 0 0 1-1.23.42l-.85-.34a6 6 0 0 1-1.3.75l-.14.9a1 1 0 0 1-1 .83h-.8a1 1 0 0 1-1-.83l-.14-.9a6 6 0 0 1-1.3-.75l-.85.34a1 1 0 0 1-1.23-.42l-.4-.7a1 1 0 0 1 .22-1.27l.7-.58a6 6 0 0 1 0-1.5l-.7-.58a1 1 0 0 1-.22-1.27l.4-.7a1 1 0 0 1 1.23-.42l.85.34a6 6 0 0 1 1.3-.75l.14-.9Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
  </svg>
);

const PanelCollapseIcon = () => (
  <svg viewBox="0 0 20 20" aria-hidden="true" fill="none">
    <rect
      x="2.75"
      y="3.75"
      width="14.5"
      height="12.5"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.4"
    />
    <path d="M8 3.75v12.5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const TAB_ICONS: Record<LeftDockTab, () => React.ReactElement> = {
  pages: PagesIcon,
  library: LibraryIcon,
  search: SearchIcon,
};

const readStoredTab = (): LeftDockTab => {
  if (typeof localStorage === "undefined") {
    return "pages";
  }
  const stored = localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
  return stored === "library" || stored === "search" || stored === "pages"
    ? stored
    : "pages";
};

const readStoredWidth = () => {
  if (typeof localStorage === "undefined") {
    return DEFAULT_WIDTH;
  }
  const parsed = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
  return Number.isFinite(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH
    ? parsed
    : DEFAULT_WIDTH;
};

const readStoredCollapsed = () =>
  typeof localStorage !== "undefined" &&
  localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";

export type LeftDockState = {
  activeTab: LeftDockTab;
  isCollapsed: boolean;
  width: number;
  setWidth: (width: number) => void;
  /** Focus a tab, expanding the dock. Re-selecting the open tab collapses it. */
  selectTab: (tab: LeftDockTab) => void;
  /** Focus a tab, always expanding — for menu/shortcut entry points. */
  openTab: (tab: LeftDockTab) => void;
  toggleCollapsed: () => void;
};

/**
 * Owned by `App.tsx` rather than the component so keyboard shortcuts, the
 * native menu and the command palette can all drive the same dock.
 */
export const useLeftDockState = (): LeftDockState => {
  const [activeTab, setActiveTab] = useState<LeftDockTab>(readStoredTab);
  const [isCollapsed, setIsCollapsed] = useState(readStoredCollapsed);
  const [width, setWidth] = useState(readStoredWidth);

  useEffect(() => {
    localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  // Clicking the already-active tab collapses the panel and leaves the rail —
  // the same toggle affordance VS Code uses, so the rail never becomes a
  // dead-end when the user wants maximum canvas.
  const selectTab = useCallback(
    (tab: LeftDockTab) => {
      if (tab === activeTab && !isCollapsed) {
        setIsCollapsed(true);
        return;
      }
      setActiveTab(tab);
      setIsCollapsed(false);
    },
    [activeTab, isCollapsed],
  );

  const openTab = useCallback((tab: LeftDockTab) => {
    setActiveTab(tab);
    setIsCollapsed(false);
  }, []);

  const toggleCollapsed = useCallback(
    () => setIsCollapsed((collapsed) => !collapsed),
    [],
  );

  return {
    activeTab,
    isCollapsed,
    width,
    setWidth,
    selectTab,
    openTab,
    toggleCollapsed,
  };
};

/**
 * The app's primary navigation surface: a VS Code-style activity rail plus a
 * resizable panel. Holds everything that answers "what am I working on"
 * — the folder/file/page tree, the shape library, and cross-workspace search.
 *
 * The library lives here rather than in Excalidraw's own right-hand sidebar
 * because the right column is reserved for the design inspector, the same way
 * Figma splits "what exists" (left) from "how it looks" (right). The library's
 * actual content is portaled in from inside the `<Excalidraw>` tree — see
 * `InspectorPanel.tsx`'s `LibraryDockPanel` — since it needs editor contexts.
 */
export const LeftDock = ({
  state,
  workspaceController,
  onOpenSettings,
  onLibraryHostChange,
  onSearchHostChange,
}: {
  state: LeftDockState;
  workspaceController: WorkspaceController;
  onOpenSettings: () => void;
  /** Portal targets — see `DockPortals.tsx` for why these two tabs differ. */
  onLibraryHostChange: (node: HTMLDivElement | null) => void;
  onSearchHostChange: (node: HTMLDivElement | null) => void;
}) => {
  const { activeTab, isCollapsed, width, setWidth, selectTab } = state;

  const panelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleResizePointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  // `width` is the *panel* width only — the activity rail is a fixed-width
  // flex sibling, so measuring from the panel's own left edge keeps the drag
  // 1:1 with the cursor regardless of the rail.
  const handleResizePointerMove = (event: React.PointerEvent) => {
    const panel = panelRef.current;
    if (!isDraggingRef.current || !panel) {
      return;
    }
    const next = event.clientX - panel.getBoundingClientRect().left;
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
  };

  const handleResizePointerUp = (event: React.PointerEvent) => {
    isDraggingRef.current = false;
    setIsDragging(false);
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  };

  return (
    <aside
      className={`left-dock${isCollapsed ? " is-collapsed" : ""}`}
      aria-label="Workspace navigation"
    >
      <nav className="left-dock-rail" aria-label="Panels">
        <div className="left-dock-rail-group">
          {LEFT_DOCK_TABS.map((tab) => {
            const Icon = TAB_ICONS[tab];
            const isActive = activeTab === tab && !isCollapsed;
            return (
              <button
                key={tab}
                type="button"
                className={`left-dock-rail-button${
                  isActive ? " is-active" : ""
                }`}
                aria-label={TAB_LABELS[tab]}
                aria-pressed={isActive}
                title={TAB_LABELS[tab]}
                onClick={() => selectTab(tab)}
              >
                <Icon />
              </button>
            );
          })}
        </div>
        <div className="left-dock-rail-group">
          <button
            type="button"
            className="left-dock-rail-button"
            aria-label="Settings"
            title="Settings"
            onClick={onOpenSettings}
          >
            <SettingsIcon />
          </button>
        </div>
      </nav>

      {!isCollapsed && (
        <div
          className="left-dock-panel"
          style={{ width: `${width}px` }}
          ref={panelRef}
        >
          <div className="chrome-panel-header">
            <span className="chrome-panel-title">{TAB_LABELS[activeTab]}</span>
            <button
              type="button"
              className="chrome-icon-button"
              aria-label="Collapse panel"
              title="Collapse panel"
              onClick={() => selectTab(activeTab)}
            >
              <PanelCollapseIcon />
            </button>
          </div>

          {/* All three tabs stay mounted. The tree keeps its expand/collapse
              state, and the library keeps its scroll position and any pending
              selection, instead of resetting every time the user glances at
              another tab. */}
          <div className="left-dock-body" hidden={activeTab !== "pages"}>
            <WorkspaceSidebar {...workspaceController} />
          </div>
          <div
            className="left-dock-body left-dock-body--library"
            hidden={activeTab !== "library"}
            ref={onLibraryHostChange}
          />
          <div
            className="left-dock-body"
            hidden={activeTab !== "search"}
            ref={onSearchHostChange}
          />

          <button
            type="button"
            className={`chrome-resize-handle left-dock-resize${
              isDragging ? " is-dragging" : ""
            }`}
            aria-label="Resize panel"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
          />
        </div>
      )}
    </aside>
  );
};
