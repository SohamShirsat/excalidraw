import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { showSelectedShapeActions } from "@excalidraw/element";
import { SelectedShapeActions } from "@excalidraw/excalidraw/components/Actions";
import {
  EditorInterfaceContext,
  useApp,
  useEditorInterface,
  useExcalidrawActionManager,
  useExcalidrawElements,
} from "@excalidraw/excalidraw/components/App";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";
import { getSelectedElements } from "@excalidraw/excalidraw/scene";
import {
  actionToggleGridMode,
  actionToggleObjectsSnapMode,
  actionToggleZenMode,
  actionToggleStats,
  actionZoomToFit,
} from "@excalidraw/excalidraw/actions";
import { actionToggleViewMode } from "@excalidraw/excalidraw/actions/actionToggleViewMode";

import "./InspectorPanel.scss";

const INSPECTOR_WIDTH_STORAGE_KEY = "personal-excalidraw-inspector-width";
const INSPECTOR_COLLAPSED_STORAGE_KEY =
  "personal-excalidraw-inspector-collapsed";

const MIN_WIDTH = 220;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 252;

const CollapseIcon = () => (
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
    <path d="M12 3.75v12.5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

export type InspectorState = {
  isCollapsed: boolean;
  width: number;
  setWidth: (width: number) => void;
  toggleCollapsed: () => void;
};

const readStoredWidth = () => {
  if (typeof localStorage === "undefined") {
    return DEFAULT_WIDTH;
  }
  const parsed = Number(localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY));
  return Number.isFinite(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH
    ? parsed
    : DEFAULT_WIDTH;
};

const readStoredCollapsed = () =>
  typeof localStorage !== "undefined" &&
  localStorage.getItem(INSPECTOR_COLLAPSED_STORAGE_KEY) === "true";

/** Owned by `App.tsx` so shortcuts and the native menu can drive the panel. */
export const useInspectorState = (): InspectorState => {
  const [isCollapsed, setIsCollapsed] = useState(readStoredCollapsed);
  const [width, setWidth] = useState(readStoredWidth);

  useEffect(() => {
    localStorage.setItem(INSPECTOR_COLLAPSED_STORAGE_KEY, String(isCollapsed));
  }, [isCollapsed]);

  useEffect(() => {
    localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(width));
  }, [width]);

  return {
    isCollapsed,
    width,
    setWidth,
    toggleCollapsed: useCallback(
      () => setIsCollapsed((collapsed) => !collapsed),
      [],
    ),
  };
};

const ToggleRow = ({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) => (
  <label className="inspector-toggle">
    <span className="inspector-toggle-label">
      {label}
      {hint && <span className="inspector-toggle-hint">{hint}</span>}
    </span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`inspector-switch${checked ? " is-on" : ""}`}
      onClick={onChange}
    >
      <span className="inspector-switch-thumb" />
    </button>
  </label>
);

/**
 * The canvas-level state of the inspector, shown when nothing is selected.
 *
 * Figma's right panel is never empty — with no selection it shows page/document
 * properties. Mirroring that keeps the column from flickering in and out of
 * existence (which is what makes upstream Excalidraw's floating styles island
 * feel unstable), and it gives the everyday canvas toggles a permanent home
 * instead of burying them three levels into a hamburger submenu.
 */
const CanvasProperties = () => {
  const app = useApp();
  const appState = useUIAppState();
  const actionManager = useExcalidrawActionManager();

  return (
    <>
      <section className="inspector-section">
        <h3 className="inspector-section-title">Canvas</h3>
        <div className="inspector-canvas-background">
          {actionManager.renderAction("changeViewBackgroundColor")}
        </div>
      </section>

      <section className="inspector-section">
        <h3 className="inspector-section-title">Guides</h3>
        <ToggleRow
          label="Grid"
          hint="⌘'"
          checked={!!appState.gridModeEnabled}
          onChange={() => actionManager.executeAction(actionToggleGridMode)}
        />
        <ToggleRow
          label="Snap to objects"
          hint="⌥S"
          checked={!!appState.objectsSnapModeEnabled}
          onChange={() =>
            actionManager.executeAction(actionToggleObjectsSnapMode)
          }
        />
      </section>

      <section className="inspector-section">
        <h3 className="inspector-section-title">View</h3>
        <ToggleRow
          label="Zen mode"
          hint="⌥Z"
          checked={!!appState.zenModeEnabled}
          onChange={() => actionManager.executeAction(actionToggleZenMode)}
        />
        <ToggleRow
          label="View only"
          hint="⌥R"
          checked={!!appState.viewModeEnabled}
          onChange={() => actionManager.executeAction(actionToggleViewMode)}
        />
        <ToggleRow
          label="Stats"
          checked={!!appState.stats.open}
          onChange={() => actionManager.executeAction(actionToggleStats)}
        />
        <button
          type="button"
          className="inspector-action-button"
          onClick={() => actionManager.executeAction(actionZoomToFit)}
        >
          Zoom to fit
          <span className="inspector-toggle-hint">⇧1</span>
        </button>
      </section>

      <section className="inspector-section">
        <h3 className="inspector-section-title">Scene</h3>
        <dl className="inspector-stats">
          <div>
            <dt>Elements</dt>
            <dd>{app.scene.getNonDeletedElements().length}</dd>
          </div>
          {/* No zoom readout here: `zoom` is stripped from `UIAppState`, so
              this panel never re-renders on zoom change and the number would
              go stale. The footer's zoom control is the live one. */}
          <div>
            <dt>Background</dt>
            <dd>{appState.viewBackgroundColor}</dd>
          </div>
        </dl>
      </section>
    </>
  );
};

const InspectorContent = ({ onCollapse }: { onCollapse: () => void }) => {
  const app = useApp();
  const appState = useUIAppState();
  const elements = useExcalidrawElements();
  const actionManager = useExcalidrawActionManager();

  const hasShapeActions = showSelectedShapeActions(appState, elements);
  const selectedCount = getSelectedElements(elements, appState).length;

  return (
    <>
      <div className="chrome-panel-header inspector-header">
        <span className="chrome-panel-title">Design</span>
        <span className="inspector-selection-badge">
          {selectedCount > 0
            ? `${selectedCount} selected`
            : hasShapeActions
            ? "Tool defaults"
            : "No selection"}
        </span>
        <button
          type="button"
          className="chrome-icon-button"
          aria-label="Collapse design panel"
          title="Collapse design panel (⌥\)"
          onClick={onCollapse}
        >
          <CollapseIcon />
        </button>
      </div>
      <div className="inspector-body">
        {hasShapeActions ? (
          <section className="inspector-section inspector-section--shape">
            <SelectedShapeActions
              appState={appState}
              elementsMap={app.scene.getNonDeletedElementsMap()}
              renderAction={actionManager.renderAction}
              app={app}
            />
          </section>
        ) : (
          <CanvasProperties />
        )}
      </div>
    </>
  );
};

/**
 * Forces the full-size styles-panel layout inside the inspector.
 *
 * `useStylesPanelMode()` derives "compact" from the *canvas container's*
 * dimensions — and with two docks flanking it, that container is narrow enough
 * to read as a tablet on any normal laptop window. Left alone, the inspector's
 * colour pickers collapse to a bare swatch with no palette, which is precisely
 * the control this panel exists to surface.
 *
 * The panel's own width is independent of the canvas's, so it overrides the
 * derived interface for its subtree. Scoped to the inspector: the toolbar and
 * every other in-canvas surface keep adapting to the real canvas size.
 */
const FullSizeStylesPanel = ({ children }: { children: React.ReactNode }) => {
  const editorInterface = useEditorInterface();
  const value = useMemo(
    () => ({
      ...editorInterface,
      formFactor: "desktop" as const,
      desktopUIMode: "full" as const,
    }),
    [editorInterface],
  );

  return (
    <EditorInterfaceContext.Provider value={value}>
      {children}
    </EditorInterfaceContext.Provider>
  );
};

/**
 * Renders the design inspector.
 *
 * Mounted *inside* `<Excalidraw>` so it can reach the editor's React contexts
 * (app instance, action manager, UI app state), but portaled *out* into the
 * shell's right-hand column so it's a real layout sibling of the canvas rather
 * than an island floating on top of it. That's what makes the canvas actually
 * shrink — the Figma behaviour — instead of hiding content underneath a panel.
 *
 * Because the portal target lives outside `.excalidraw-container`, the
 * library's `getViewportOffsets()` DOM sweep correctly ignores it: there is no
 * canvas area under the panel to compensate for.
 */
export const InspectorPanel = ({
  host,
  state,
}: {
  host: HTMLElement | null;
  state: InspectorState;
}) => {
  const { width, setWidth, isCollapsed, toggleCollapsed } = state;
  const panelRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  if (!host || isCollapsed) {
    return null;
  }

  const handlePointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    isDraggingRef.current = true;
    setIsDragging(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const panel = panelRef.current;
    if (!isDraggingRef.current || !panel) {
      return;
    }
    // dragging left widens: measure from the panel's right edge inward
    const next = panel.getBoundingClientRect().right - event.clientX;
    setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    isDraggingRef.current = false;
    setIsDragging(false);
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  };

  return createPortal(
    <FullSizeStylesPanel>
      <div
        className="inspector-panel"
        style={{ width: `${width}px` }}
        ref={panelRef}
      >
        <button
          type="button"
          className={`chrome-resize-handle inspector-resize${
            isDragging ? " is-dragging" : ""
          }`}
          aria-label="Resize design panel"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
        <InspectorContent onCollapse={toggleCollapsed} />
      </div>
    </FullSizeStylesPanel>,
    host,
  );
};
