import {
  Excalidraw,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
  CaptureUpdateAction,
  serializeAsJSON,
  TTDDialogTrigger,
} from "@excalidraw/excalidraw";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import { useEffect, useRef, useState } from "react";

import { resolvablePromise } from "@excalidraw/common";

import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/element/types";
import type { Theme } from "@excalidraw/element/types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import { WorkspaceData } from "../data/WorkspaceData";

import { AppFooter } from "./AppFooter";
import { AppMainMenu } from "./AppMainMenu";
import { AppWelcomeScreen } from "./AppWelcomeScreen";
import { EditorTabBar } from "./EditorTabBar";

import type { EditorTab } from "./EditorTabBar";
import type { WorkspaceMetadata } from "../data/WorkspaceData";

const CloseIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="m4.5 4.5 7 7m0-7-7 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

export type SecondaryPagePaneProps = {
  workspace: WorkspaceMetadata | null;
  tabs: string[];
  activePageId: string;
  editorTheme: Theme;
  appTheme: Theme | "system";
  onThemeChange: (theme: Theme | "system") => void;
  onSelectTab: (pageId: string) => void;
  onCloseTab: (pageId: string) => void;
  onClosePane: () => void;
  onNewTab: () => void;
};

/**
 * The right-hand split pane: a fully independent, fully editable second
 * `<Excalidraw>` instance (own API, own undo history, own autosave), not a
 * read-only preview. It never touches `workspace.activePageId` — that field
 * means "what the primary pane is showing", and stays exactly that. This
 * pane loads/saves its own page directly through `WorkspaceData`'s
 * per-page-keyed APIs, which is what makes two panes autosaving two
 * different pages at once safe.
 */
const SecondaryPageEditor = ({
  workspace,
  tabs,
  activePageId,
  editorTheme,
  appTheme,
  onThemeChange,
  onSelectTab,
  onCloseTab,
  onClosePane,
  onNewTab,
}: SecondaryPagePaneProps) => {
  const excalidrawAPI = useExcalidrawAPI();
  const [, forceRefresh] = useState(false);

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }
  useEffect(() => {
    // No "restore last session" concept here — a split pane always opens a
    // specific, known page. The load effect below fills it in right after
    // first paint.
    initialStatePromiseRef.current.promise.resolve(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const activePageIdRef = useRef(activePageId);
  activePageIdRef.current = activePageId;

  const isSwitchingRef = useRef(false);
  const loadedPageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!excalidrawAPI || loadedPageIdRef.current === activePageId) {
      return;
    }

    let cancelled = false;

    (async () => {
      isSwitchingRef.current = true;
      try {
        const storedScene = await WorkspaceData.loadPageScene(activePageId);
        if (cancelled) {
          return;
        }

        const currentAppState = excalidrawAPI.getAppState();
        const defaultAppState = getDefaultAppState();
        const targetScene = storedScene
          ? await loadFromBlob(
              new Blob([storedScene], { type: "application/json" }),
              currentAppState,
              null,
            )
          : {
              elements: [],
              appState: {
                scrollX: defaultAppState.scrollX,
                scrollY: defaultAppState.scrollY,
                zoom: defaultAppState.zoom,
                selectedElementIds: {},
                selectedGroupIds: {},
                editingGroupId: null,
                editingElement: null,
                selectedLinearElement: null,
                activeTool: defaultAppState.activeTool,
                viewBackgroundColor: defaultAppState.viewBackgroundColor,
                gridSize: defaultAppState.gridSize,
                gridStep: defaultAppState.gridStep,
                gridModeEnabled: defaultAppState.gridModeEnabled,
              },
              files: {},
            };

        if (cancelled) {
          return;
        }

        const page = workspaceRef.current?.pages.find(
          (item) => item.id === activePageId,
        );
        const file = workspaceRef.current?.files.find(
          (item) => item.id === page?.fileId,
        );

        const nextAppState = {
          ...currentAppState,
          ...targetScene.appState,
          name: file?.name || "Untitled file",
          fileHandle: null,
          isLoading: false,
        };

        if (!storedScene) {
          await WorkspaceData.savePageScene(activePageId, [], nextAppState, {});
        }

        const targetFiles = Object.values(
          (targetScene.files || {}) as BinaryFiles,
        );
        if (targetFiles.length) {
          excalidrawAPI.addFiles(targetFiles);
        }

        excalidrawAPI.updateScene({
          elements: targetScene.elements || [],
          appState: nextAppState,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        excalidrawAPI.history.clear();
        loadedPageIdRef.current = activePageId;
      } finally {
        if (!cancelled) {
          window.requestAnimationFrame(() => {
            isSwitchingRef.current = false;
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activePageId, excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    const pageId = activePageIdRef.current;
    if (pageId && !isSwitchingRef.current) {
      const scene = serializeAsJSON(elements, appState, files, "local");
      WorkspaceData.schedulePageSceneSave({ pageId, scene });
    }
  };

  const editorTabs: EditorTab[] = tabs
    .map((pageId) => {
      const page = workspace?.pages.find((item) => item.id === pageId);
      if (!page) {
        return null;
      }
      const file = workspace?.files.find((item) => item.id === page.fileId);
      return { pageId, label: page.name, secondaryLabel: file?.name };
    })
    .filter((tab): tab is NonNullable<typeof tab> => tab !== null);

  return (
    <>
      <EditorTabBar
        tabs={editorTabs}
        activeId={activePageId}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onNewTab={onNewTab}
        newTabLabel="New page in split"
        canCloseLast
        trailing={
          <button
            type="button"
            className="pane-close-split"
            onClick={onClosePane}
            title="Close split"
          >
            <CloseIcon />
            <span>Close split</span>
          </button>
        }
      />
      <div className="app-pane-canvas">
        <Excalidraw
          onChange={onChange}
          initialData={initialStatePromiseRef.current.promise}
          theme={editorTheme}
          onThemeChange={onThemeChange}
          detectScroll={false}
          handleKeyboardGlobally={false}
          autoFocus={false}
        >
          <AppMainMenu
            theme={appTheme}
            refresh={() => forceRefresh((prev) => !prev)}
          />
          <AppWelcomeScreen />
          <OverwriteConfirmDialog>
            <OverwriteConfirmDialog.Actions.ExportToImage />
            <OverwriteConfirmDialog.Actions.SaveToDisk />
          </OverwriteConfirmDialog>
          <AppFooter onChange={() => excalidrawAPI?.refresh()} />
          <TTDDialogTrigger />
        </Excalidraw>
      </div>
    </>
  );
};

export const SecondaryPagePane = (props: SecondaryPagePaneProps) => (
  <ExcalidrawAPIProvider>
    <SecondaryPageEditor {...props} />
  </ExcalidrawAPIProvider>
);
