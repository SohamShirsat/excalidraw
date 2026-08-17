import {
  Excalidraw,
  TTDDialogTrigger,
  CaptureUpdateAction,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import {
  CommandPalette,
  DEFAULT_CATEGORIES,
} from "@excalidraw/excalidraw/components/CommandPalette/CommandPalette";
import { ErrorDialog } from "@excalidraw/excalidraw/components/ErrorDialog";
import { OverwriteConfirmDialog } from "@excalidraw/excalidraw/components/OverwriteConfirm/OverwriteConfirm";
import {
  EVENT,
  debounce,
  isTestEnv,
  isWritableElement,
  preventUnload,
  resolvablePromise,
  isDevEnv,
} from "@excalidraw/common";
import polyfill from "@excalidraw/excalidraw/polyfill";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadFromBlob } from "@excalidraw/excalidraw/data/blob";
import { t } from "@excalidraw/excalidraw/i18n";

import {
  GithubIcon,
  XBrandIcon,
  DiscordIcon,
  youtubeIcon,
} from "@excalidraw/excalidraw/components/icons";
import { isElementLink } from "@excalidraw/element";
import {
  restoreAppState,
  restoreElements,
} from "@excalidraw/excalidraw/data/restore";
import { newElementWith } from "@excalidraw/element";
import { isInitializedImageElement } from "@excalidraw/element";
import {
  parseLibraryTokensFromUrl,
  useHandleLibrary,
} from "@excalidraw/excalidraw/data/library";

import type { RestoredDataState } from "@excalidraw/excalidraw/data/restore";
import type {
  FileId,
  NonDeletedExcalidrawElement,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  UIAppState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";
import type { ResolutionType } from "@excalidraw/common/utility-types";
import type { ResolvablePromise } from "@excalidraw/common/utils";

import CustomStats from "./CustomStats";
import { Provider, useAtomValue, appJotaiStore } from "./app-jotai";
import { STORAGE_KEYS, SYNC_BROWSER_TABS_TIMEOUT } from "./app_constants";
import { AppFooter } from "./components/AppFooter";
import { AppMainMenu } from "./components/AppMainMenu";
import { AppWelcomeScreen } from "./components/AppWelcomeScreen";
import { TopErrorBoundary } from "./components/TopErrorBoundary";

import { updateStaleImageStatuses } from "./data/FileManager";
import { FileStatusStore } from "./data/fileStatusStore";
import { importFromLocalStorage } from "./data/localStorage";

import {
  LibraryLocalStorageMigrationAdapter,
  LocalData,
  localStorageQuotaExceededAtom,
} from "./data/LocalData";
import { RepositoryLibraryAdapter } from "./data/RepositoryLibraryData";
import { getEffectiveBindings } from "./data/shortcutBindings";
import {
  loadShortcutOverrides,
  saveShortcutOverrides,
} from "./data/shortcutOverrides";
import { isBrowserStorageStateNewer } from "./data/tabSync";
import * as WorkspaceTransport from "./data/workspaceTransport";
import { installShortcutInterceptor } from "./shortcutInterception";
import { useHandleAppTheme } from "./useHandleAppTheme";
import { getPreferredLanguage } from "./app-language/language-detector";
import { useAppLangCode } from "./app-language/language-state";
import DebugCanvas, {
  debugRenderer,
  isVisualDebuggerEnabled,
  loadSavedDebugState,
} from "./components/DebugCanvas";

import "./index.scss";

import { AppSidebar } from "./components/AppSidebar";
import { QuickAccessActions } from "./components/QuickAccessActions";
import { SettingsDialog } from "./components/SettingsDialog";
import { LeftDock, useLeftDockState } from "./components/LeftDock";
import { InspectorPanel, useInspectorState } from "./components/InspectorPanel";
import { LibraryDockPanel, SearchDockPanel } from "./components/DockPortals";
import { WorkspaceSearchDialog } from "./components/WorkspaceSearchDialog";
import { EditorTabBar } from "./components/EditorTabBar";
import { NewPageDialog } from "./components/NewPageDialog";
import { SecondaryPagePane } from "./components/SecondaryPagePane";
import "./components/AppLayout.scss";
import "./components/CanvasChrome.scss";
import {
  WorkspaceData,
  addWorkspaceFile,
  addWorkspaceFolder,
  addWorkspacePage,
  getWorkspacePageIds,
  removeWorkspaceItem,
  renameWorkspaceItem,
} from "./data/WorkspaceData";

import type { EditorTab } from "./components/EditorTabBar";
import type { NewPageDialogSubmitInput } from "./components/NewPageDialog";
import type {
  WorkspaceController,
  WorkspaceSaveStatus,
} from "./components/WorkspaceSidebar";
import type {
  WorkspaceItemType,
  WorkspaceMetadata,
} from "./data/WorkspaceData";
import type {
  ShortcutBinding,
  ShortcutDefinition,
} from "./data/shortcutBindings";

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

const PRIMARY_TABS_STORAGE_KEY = "personal-excalidraw-primary-tabs";

let isSelfEmbedding = false;

if (window.self !== window.top) {
  try {
    const parentUrl = new URL(document.referrer);
    const currentUrl = new URL(window.location.href);
    if (parentUrl.origin === currentUrl.origin) {
      isSelfEmbedding = true;
    }
  } catch (error) {
    // ignore
  }
}

const initializeScene = async (): Promise<{
  scene: ExcalidrawInitialDataState | null;
}> => {
  const localDataState = importFromLocalStorage();

  const scene: Omit<
    RestoredDataState,
    // we're not storing files in the scene database/localStorage, and instead
    // fetch them async from a different store
    "files"
  > & {
    scrollToContent?: boolean;
  } = {
    elements: restoreElements(localDataState?.elements, null, {
      repairBindings: true,
      deleteInvisibleElements: true,
    }),
    appState: restoreAppState(localDataState?.appState, null),
  };

  return { scene };
};

const ExcalidrawWrapper = () => {
  const excalidrawAPI = useExcalidrawAPI();

  const [errorMessage, setErrorMessage] = useState("");

  const { editorTheme, appTheme, setAppTheme } = useHandleAppTheme();

  const [langCode, setLangCode] = useAppLangCode();

  // initial state
  // ---------------------------------------------------------------------------

  const initialStatePromiseRef = useRef<{
    promise: ResolvablePromise<ExcalidrawInitialDataState | null>;
  }>({ promise: null! });
  if (!initialStatePromiseRef.current.promise) {
    initialStatePromiseRef.current.promise =
      resolvablePromise<ExcalidrawInitialDataState | null>();
  }

  const [workspace, setWorkspace] = useState<WorkspaceMetadata | null>(null);
  const [workspaceSaveStatus, setWorkspaceSaveStatus] =
    useState<WorkspaceSaveStatus>("loading");
  const [workspaceDirectory, setWorkspaceDirectory] = useState<string | null>(
    null,
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isWorkspaceSearchOpen, setIsWorkspaceSearchOpen] = useState(false);
  const [appVersion, setAppVersion] = useState("Development build");
  const workspaceRef = useRef<WorkspaceMetadata | null>(null);
  const activeWorkspacePageIdRef = useRef<string | null>(null);
  const isWorkspaceSwitchingRef = useRef(false);
  const isWorkspaceAutosaveEnabledRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Docked chrome (left navigation dock + right design inspector)
  //
  // Both panels are real flex columns of the shell, so the canvas genuinely
  // shrinks rather than hiding underneath an overlay. Their *content*, though,
  // needs Excalidraw's React contexts, so the components mount inside
  // `<Excalidraw>` and portal their DOM into these host nodes. State lives up
  // here so the keyboard shortcuts below, the native menu and the command
  // palette all drive the same panels.
  // ---------------------------------------------------------------------------

  const leftDock = useLeftDockState();
  const inspector = useInspectorState();
  const [libraryHost, setLibraryHost] = useState<HTMLDivElement | null>(null);
  const [searchHost, setSearchHost] = useState<HTMLDivElement | null>(null);
  const [inspectorHost, setInspectorHost] = useState<HTMLElement | null>(null);

  // ---------------------------------------------------------------------------
  // Tabs (primary pane) + split view (optional secondary pane)
  // ---------------------------------------------------------------------------

  const [primaryTabs, setPrimaryTabs] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PRIMARY_TABS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(PRIMARY_TABS_STORAGE_KEY, JSON.stringify(primaryTabs));
  }, [primaryTabs]);

  // Single source of truth stays `workspace.activePageId` (unchanged, still
  // what gets persisted to workspace.json) — this just keeps an ordered tab
  // strip in sync with it: append newly-activated pages, drop tabs whose
  // page no longer exists (e.g. after a delete elsewhere).
  useEffect(() => {
    if (!workspace) {
      return;
    }
    const validIds = new Set(workspace.pages.map((page) => page.id));
    setPrimaryTabs((tabs) => {
      let next = tabs.filter((id) => validIds.has(id));
      if (workspace.activePageId && !next.includes(workspace.activePageId)) {
        next = [...next, workspace.activePageId];
      }
      if (
        next.length === tabs.length &&
        next.every((id, index) => id === tabs[index])
      ) {
        return tabs;
      }
      return next;
    });
  }, [workspace]);

  const [secondaryPane, setSecondaryPane] = useState<{
    tabs: string[];
    activePageId: string;
  } | null>(null);

  // Prunes the split pane the same way, and auto-closes it if its active
  // page (or all of its tabs) got deleted out from under it.
  useEffect(() => {
    if (!workspace || !secondaryPane) {
      return;
    }
    const validIds = new Set(workspace.pages.map((page) => page.id));
    const nextTabs = secondaryPane.tabs.filter((id) => validIds.has(id));
    if (nextTabs.length === 0) {
      setSecondaryPane(null);
      return;
    }
    const nextActivePageId = validIds.has(secondaryPane.activePageId)
      ? secondaryPane.activePageId
      : nextTabs[0];
    if (
      nextTabs.length !== secondaryPane.tabs.length ||
      nextActivePageId !== secondaryPane.activePageId
    ) {
      setSecondaryPane({ tabs: nextTabs, activePageId: nextActivePageId });
    }
  }, [workspace, secondaryPane]);

  const [splitPct, setSplitPct] = useState(50);
  const isDraggingDividerRef = useRef(false);
  const panesContainerRef = useRef<HTMLDivElement>(null);

  const handleDividerPointerDown = (event: React.PointerEvent) => {
    event.preventDefault();
    isDraggingDividerRef.current = true;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const handleDividerPointerMove = (event: React.PointerEvent) => {
    if (!isDraggingDividerRef.current || !panesContainerRef.current) {
      return;
    }
    const rect = panesContainerRef.current.getBoundingClientRect();
    const pct = ((event.clientX - rect.left) / rect.width) * 100;
    setSplitPct(Math.min(75, Math.max(25, pct)));
  };

  const handleDividerPointerUp = (event: React.PointerEvent) => {
    isDraggingDividerRef.current = false;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  };

  const [newPageDialogTarget, setNewPageDialogTarget] = useState<
    "primary" | "secondary" | null
  >(null);

  const commitWorkspaceState = useCallback((next: WorkspaceMetadata) => {
    workspaceRef.current = next;
    activeWorkspacePageIdRef.current = next.activePageId;
    setWorkspace(next);
  }, []);

  const debugCanvasRef = useRef<HTMLCanvasElement>(null);

  useHandleLibrary({
    excalidrawAPI,
    adapter: RepositoryLibraryAdapter,
    // TODO maybe remove this in several months (shipped: 24-03-11)
    migrationAdapter: LibraryLocalStorageMigrationAdapter,
  });

  const [, forceRefresh] = useState(false);

  useEffect(() => {
    let isMounted = true;
    WorkspaceTransport.getWorkspaceStatus()
      .then((status) => {
        if (isMounted) {
          setWorkspaceDirectory(status.directory);
        }
      })
      .catch((error) => {
        console.error("[settings] unable to load workspace directory", error);
      });
    window.electronApp
      ?.getVersion()
      .then((version) => {
        if (isMounted) {
          setAppVersion(version);
        }
      })
      .catch((error) => {
        console.error("[settings] unable to load app version", error);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isDevEnv()) {
      const debugState = loadSavedDebugState();

      if (debugState.enabled && !window.visualDebug) {
        window.visualDebug = {
          data: [],
        };
      } else {
        delete window.visualDebug;
      }
      forceRefresh((prev) => !prev);
    }
  }, [excalidrawAPI]);

  // Bridges the native macOS application menu (`electron/menu.ts`) into the
  // renderer. No-ops outside Electron, since `window.electronApp` is only
  // ever defined there (see `excalidraw-app/electron.d.ts`).
  useEffect(() => {
    const unsubscribeSyntheticKeydown =
      window.electronApp?.onMenuSyntheticKeydown((payload) => {
        // Replays the exact same `KeyboardEvent` a real keypress would
        // produce, dispatched on `document` — flows through the app's
        // existing `handleKeyboardGlobally` keydown dispatch unchanged, no
        // second action-triggering system.
        document.dispatchEvent(
          new KeyboardEvent("keydown", {
            ...payload,
            bubbles: true,
            cancelable: true,
          }),
        );
      });

    const unsubscribeMenuAction = window.electronApp?.onMenuAction(
      (actionId) => {
        switch (actionId) {
          case "open-settings":
            setIsSettingsOpen(true);
            break;
          case "open-workspace-search":
            setIsWorkspaceSearchOpen(true);
            break;
          case "open-new-page":
            setNewPageDialogTarget("primary");
            break;
          case "export-json":
            if (!excalidrawAPI) {
              return;
            }
            // Mirrors `MainMenu.DefaultItems.Export`'s onSelect exactly.
            excalidrawAPI.updateScene({
              appState: { openDialog: { name: "jsonExport" } },
            });
            break;
          case "change-canvas-background":
            if (!excalidrawAPI) {
              return;
            }
            // Mirrors clicking the in-canvas hamburger menu — the real code
            // path `MainMenu.DefaultItems.ChangeCanvasBackground` (an inline
            // color picker, not a standalone toggle) lives behind
            // (`packages/excalidraw/components/main-menu/MainMenu.tsx`).
            excalidrawAPI.updateScene({ appState: { openMenu: "canvas" } });
            break;
        }
      },
    );

    return () => {
      unsubscribeSyntheticKeydown?.();
      unsubscribeMenuAction?.();
    };
  }, [excalidrawAPI]);

  // Remappable-shortcut interception (see `excalidraw-app/shortcutInterception.ts`
  // and `excalidraw-app/data/shortcutBindings.ts`). No Settings/rebinding UI
  // exists yet — this effect only makes ALREADY-PERSISTED overrides
  // (however they got there) actually take effect. A ref keeps the DOM
  // listener installed exactly once while always reading the LATEST
  // bindings, so overrides loading in after mount don't require tearing
  // down and reinstalling the capture-phase listener.
  const shortcutBindingsRef = useRef<ShortcutDefinition[]>(
    getEffectiveBindings({}),
  );
  const [shortcutOverrides, setShortcutOverrides] = useState<
    Record<string, ShortcutBinding | null>
  >({});

  useEffect(() => {
    let isMounted = true;

    const uninstall = installShortcutInterceptor(
      () => shortcutBindingsRef.current,
    );

    loadShortcutOverrides()
      .then((overrides) => {
        if (isMounted) {
          shortcutBindingsRef.current = getEffectiveBindings(overrides);
          setShortcutOverrides(overrides);
        }
      })
      .catch((error) => {
        console.error("[shortcuts] failed to load overrides", error);
      });

    return () => {
      isMounted = false;
      uninstall();
    };
  }, []);

  const handleSaveShortcutOverrides = useCallback(
    async (next: Record<string, ShortcutBinding | null>) => {
      await saveShortcutOverrides(next);
      shortcutBindingsRef.current = getEffectiveBindings(next);
      setShortcutOverrides(next);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Hoisted loadImages
  // ---------------------------------------------------------------------------
  const loadImages = useCallback(
    (data: ResolutionType<typeof initializeScene>, isInitialLoad = false) => {
      if (!data.scene || !excalidrawAPI) {
        return;
      }

      const fileIds =
        data.scene.elements?.reduce((acc, element) => {
          if (isInitializedImageElement(element)) {
            return acc.concat(element.fileId);
          }
          return acc;
        }, [] as FileId[]) || [];
      const embeddedFileIds = new Set(
        Object.keys(data.scene.files || {}) as FileId[],
      );

      if (isInitialLoad) {
        const locallyStoredFileIds = fileIds.filter(
          (fileId) => !embeddedFileIds.has(fileId),
        );
        if (locallyStoredFileIds.length) {
          LocalData.fileStorage
            .getFiles(locallyStoredFileIds)
            .then(async ({ loadedFiles, erroredFiles }) => {
              if (loadedFiles.length) {
                excalidrawAPI.addFiles(loadedFiles);
              }
              updateStaleImageStatuses({
                excalidrawAPI,
                erroredFiles,
                elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
              });
            });
        }
        // on fresh load, clear unused files from IDB (from previous
        // session)
        LocalData.fileStorage.clearObsoleteFiles({
          currentFileIds: fileIds,
        });
      }
    },
    [excalidrawAPI],
  );

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }

    initializeScene().then(async (data) => {
      let initialData = data;

      try {
        const initialFileName =
          data.scene?.appState?.name || excalidrawAPI.getName();
        const loadedWorkspace = await WorkspaceData.loadOrCreate(
          initialFileName,
        );

        commitWorkspaceState(loadedWorkspace);
        isWorkspaceAutosaveEnabledRef.current = true;

        if (isWorkspaceAutosaveEnabledRef.current) {
          const storedScene = await WorkspaceData.loadPageScene(
            loadedWorkspace.activePageId,
          );

          if (storedScene) {
            const workspaceScene = await loadFromBlob(
              new Blob([storedScene], { type: "application/json" }),
              excalidrawAPI.getAppState(),
              null,
            );
            const activePage = loadedWorkspace.pages.find(
              (page) => page.id === loadedWorkspace.activePageId,
            );
            const activeFile = loadedWorkspace.files.find(
              (file) => file.id === activePage?.fileId,
            );

            initialData = {
              ...data,
              scene: {
                ...workspaceScene,
                appState: {
                  ...workspaceScene.appState,
                  name: activeFile?.name || "Untitled file",
                },
              },
            };
          }
        }

        setWorkspaceSaveStatus("saved");
      } catch (error) {
        console.error(error);
        setWorkspaceSaveStatus("error");
      }

      loadImages(initialData, /* isInitialLoad */ true);
      initialStatePromiseRef.current.promise.resolve(initialData.scene);
    });

    const onHashChange = async (event: HashChangeEvent) => {
      event.preventDefault();
      const libraryUrlTokens = parseLibraryTokensFromUrl();
      if (!libraryUrlTokens) {
        excalidrawAPI.updateScene({ appState: { isLoading: true } });

        initializeScene().then((data) => {
          loadImages(data);
          if (data.scene) {
            excalidrawAPI.updateScene({
              elements: restoreElements(data.scene.elements, null, {
                repairBindings: true,
              }),
              appState: restoreAppState(data.scene.appState, null),
              captureUpdate: CaptureUpdateAction.IMMEDIATELY,
            });
          }
        });
      }
    };

    const syncData = debounce(() => {
      if (isTestEnv()) {
        return;
      }
      if (!document.hidden) {
        // don't sync if local state is newer or identical to browser state
        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_DATA_STATE)) {
          const localDataState = importFromLocalStorage();
          setLangCode(getPreferredLanguage());
          excalidrawAPI.updateScene({
            ...localDataState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          Promise.resolve(
            RepositoryLibraryAdapter.load({ source: "load" }),
          ).then((data) => {
            if (data) {
              excalidrawAPI.updateLibrary({
                libraryItems: data.libraryItems,
              });
            }
          });
        }

        if (isBrowserStorageStateNewer(STORAGE_KEYS.VERSION_FILES)) {
          const elements = excalidrawAPI.getSceneElementsIncludingDeleted();
          const currFiles = excalidrawAPI.getFiles();
          const fileIds =
            elements?.reduce((acc, element) => {
              if (
                isInitializedImageElement(element) &&
                // only load and update images that aren't already loaded
                !currFiles[element.fileId]
              ) {
                return acc.concat(element.fileId);
              }
              return acc;
            }, [] as FileId[]) || [];
          if (fileIds.length) {
            LocalData.fileStorage
              .getFiles(fileIds)
              .then(({ loadedFiles, erroredFiles }) => {
                if (loadedFiles.length) {
                  excalidrawAPI.addFiles(loadedFiles);
                }
                updateStaleImageStatuses({
                  excalidrawAPI,
                  erroredFiles,
                  elements: excalidrawAPI.getSceneElementsIncludingDeleted(),
                });
              });
          }
        }
      }
    }, SYNC_BROWSER_TABS_TIMEOUT);

    const onUnload = () => {
      LocalData.flushSave();
      WorkspaceData.flushScheduledPageSave();
    };

    const visibilityChange = (event: FocusEvent | Event) => {
      if (event.type === EVENT.BLUR || document.hidden) {
        LocalData.flushSave();
        WorkspaceData.flushScheduledPageSave();
      }
      if (
        event.type === EVENT.VISIBILITY_CHANGE ||
        event.type === EVENT.FOCUS
      ) {
        syncData();
      }
    };

    window.addEventListener(EVENT.HASHCHANGE, onHashChange, false);
    window.addEventListener(EVENT.UNLOAD, onUnload, false);
    window.addEventListener(EVENT.BLUR, visibilityChange, false);
    document.addEventListener(EVENT.VISIBILITY_CHANGE, visibilityChange, false);
    window.addEventListener(EVENT.FOCUS, visibilityChange, false);
    return () => {
      window.removeEventListener(EVENT.HASHCHANGE, onHashChange, false);
      window.removeEventListener(EVENT.UNLOAD, onUnload, false);
      window.removeEventListener(EVENT.BLUR, visibilityChange, false);
      window.removeEventListener(EVENT.FOCUS, visibilityChange, false);
      document.removeEventListener(
        EVENT.VISIBILITY_CHANGE,
        visibilityChange,
        false,
      );
    };
  }, [excalidrawAPI, setLangCode, loadImages, commitWorkspaceState]);

  useEffect(() => {
    const unloadHandler = (event: BeforeUnloadEvent) => {
      LocalData.flushSave();
      WorkspaceData.flushScheduledPageSave();

      if (
        excalidrawAPI &&
        LocalData.fileStorage.shouldPreventUnload(
          excalidrawAPI.getSceneElements(),
        )
      ) {
        if (import.meta.env.VITE_APP_DISABLE_PREVENT_UNLOAD !== "true") {
          preventUnload(event);
        } else {
          console.warn(
            "preventing unload disabled (VITE_APP_DISABLE_PREVENT_UNLOAD)",
          );
        }
      }
    };
    window.addEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    return () => {
      window.removeEventListener(EVENT.BEFORE_UNLOAD, unloadHandler);
    };
  }, [excalidrawAPI]);

  const onChange = (
    elements: readonly OrderedExcalidrawElement[],
    appState: AppState,
    files: BinaryFiles,
  ) => {
    const activeWorkspacePageId = activeWorkspacePageIdRef.current;
    if (
      activeWorkspacePageId &&
      isWorkspaceAutosaveEnabledRef.current &&
      !isWorkspaceSwitchingRef.current
    ) {
      const scene = serializeAsJSON(elements, appState, files, "local");
      const didScheduleSave = WorkspaceData.schedulePageSceneSave({
        pageId: activeWorkspacePageId,
        scene,
        onComplete: (error) => {
          setWorkspaceSaveStatus(error ? "error" : "saved");
        },
      });
      if (didScheduleSave) {
        setWorkspaceSaveStatus("saving");
      }
    }

    // this check is redundant, but since this is a hot path, it's best
    // not to evaludate the nested expression every time
    if (!LocalData.isSavePaused()) {
      LocalData.save(elements, appState, files, () => {
        if (excalidrawAPI) {
          let didChange = false;

          const elements = excalidrawAPI
            .getSceneElementsIncludingDeleted()
            .map((element) => {
              if (
                LocalData.fileStorage.shouldUpdateImageElementStatus(element)
              ) {
                const newElement = newElementWith(element, { status: "saved" });
                if (newElement !== element) {
                  didChange = true;
                }
                return newElement;
              }
              return element;
            });

          if (didChange) {
            excalidrawAPI.updateScene({
              elements,
              captureUpdate: CaptureUpdateAction.NEVER,
            });
          }
        }
      });
    }

    // Render the debug scene if the debug canvas is available
    if (debugCanvasRef.current && excalidrawAPI) {
      debugRenderer(
        debugCanvasRef.current,
        appState,
        elements,
        window.devicePixelRatio,
      );
    }
  };

  const reportWorkspaceError = (error: unknown) => {
    const message =
      error instanceof Error
        ? error.message
        : "The local workspace could not complete that action.";
    console.error(error);
    setWorkspaceSaveStatus("error");
    excalidrawAPI?.setToast({
      message,
      closable: true,
      duration: 5000,
    });
  };

  const saveActiveWorkspacePage = async () => {
    const pageId = activeWorkspacePageIdRef.current;
    if (!pageId || !excalidrawAPI) {
      return;
    }

    WorkspaceData.cancelScheduledPageSave();
    setWorkspaceSaveStatus("saving");
    await WorkspaceData.savePageScene(
      pageId,
      excalidrawAPI.getSceneElementsIncludingDeleted(),
      excalidrawAPI.getAppState(),
      excalidrawAPI.getFiles(),
    );
    setWorkspaceSaveStatus("saved");
  };

  const activateWorkspacePage = async (
    pageId: string,
    nextWorkspace: WorkspaceMetadata,
    saveCurrentPage: boolean,
  ) => {
    if (!excalidrawAPI) {
      throw new Error("The drawing editor is still loading.");
    }

    const targetPage = nextWorkspace.pages.find((page) => page.id === pageId);
    const targetFile = nextWorkspace.files.find(
      (file) => file.id === targetPage?.fileId,
    );
    if (!targetPage || !targetFile) {
      throw new Error("The selected workspace page no longer exists.");
    }

    if (
      saveCurrentPage &&
      activeWorkspacePageIdRef.current &&
      activeWorkspacePageIdRef.current !== pageId
    ) {
      await saveActiveWorkspacePage();
    } else {
      WorkspaceData.cancelScheduledPageSave();
    }

    isWorkspaceSwitchingRef.current = true;
    setWorkspaceSaveStatus("saving");

    try {
      const currentAppState = excalidrawAPI.getAppState();
      const metadata = {
        ...nextWorkspace,
        activePageId: pageId,
        updatedAt: Date.now(),
      };
      await WorkspaceData.saveMetadata(metadata);
      const storedScene = await WorkspaceData.loadPageScene(pageId);
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

      commitWorkspaceState(metadata);

      const nextAppState = {
        ...currentAppState,
        ...targetScene.appState,
        name: targetFile.name,
        fileHandle: null,
        openSidebar: currentAppState.openSidebar,
        defaultSidebarDockedPreference:
          currentAppState.defaultSidebarDockedPreference,
        isLoading: false,
      };

      if (!storedScene) {
        await WorkspaceData.savePageScene(pageId, [], nextAppState, {});
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

      isWorkspaceAutosaveEnabledRef.current = true;
      setWorkspaceSaveStatus("saved");
    } finally {
      window.requestAnimationFrame(() => {
        isWorkspaceSwitchingRef.current = false;
      });
    }
  };

  const handleOpenWorkspacePage = async (pageId: string) => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace || currentWorkspace.activePageId === pageId) {
      return;
    }

    try {
      await activateWorkspacePage(pageId, currentWorkspace, true);
    } catch (error) {
      reportWorkspaceError(error);
    }
  };

  const handleCreateWorkspaceFolder = async (name: string) => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace) {
      return;
    }

    try {
      const result = addWorkspaceFolder(currentWorkspace, { name });
      setWorkspaceSaveStatus("saving");
      await WorkspaceData.saveMetadata(result.workspace);
      commitWorkspaceState(result.workspace);
      setWorkspaceSaveStatus("saved");
    } catch (error) {
      reportWorkspaceError(error);
    }
  };

  const handleCreateWorkspaceFile = async (folderId: string, name: string) => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace) {
      return;
    }

    try {
      const result = addWorkspaceFile(currentWorkspace, folderId, { name });
      await activateWorkspacePage(result.page.id, result.workspace, true);
    } catch (error) {
      reportWorkspaceError(error);
    }
  };

  const handleCreateWorkspacePage = async (fileId: string, name: string) => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace) {
      return;
    }

    try {
      const result = addWorkspacePage(currentWorkspace, fileId, { name });
      await activateWorkspacePage(result.page.id, result.workspace, true);
    } catch (error) {
      reportWorkspaceError(error);
    }
  };

  const handleRenameWorkspaceItem = async (
    type: WorkspaceItemType,
    id: string,
    name: string,
  ) => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace) {
      return;
    }

    try {
      const nextWorkspace = renameWorkspaceItem(
        currentWorkspace,
        type,
        id,
        name,
      );
      setWorkspaceSaveStatus("saving");
      await WorkspaceData.saveMetadata(nextWorkspace);
      commitWorkspaceState(nextWorkspace);

      if (type === "file" && excalidrawAPI) {
        const activePage = nextWorkspace.pages.find(
          (page) => page.id === nextWorkspace.activePageId,
        );
        if (activePage?.fileId === id) {
          excalidrawAPI.updateScene({
            appState: { name },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
      }

      setWorkspaceSaveStatus("saved");
    } catch (error) {
      reportWorkspaceError(error);
    }
  };

  const handleDeleteWorkspaceItem = async (
    type: WorkspaceItemType,
    id: string,
  ) => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace) {
      return;
    }

    try {
      const removedPageIds = getWorkspacePageIds(currentWorkspace, type, id);
      const nextWorkspace = removeWorkspaceItem(currentWorkspace, type, id);
      const removesActivePage = removedPageIds.includes(
        currentWorkspace.activePageId,
      );

      if (removesActivePage) {
        await activateWorkspacePage(
          nextWorkspace.activePageId,
          nextWorkspace,
          false,
        );
      } else {
        setWorkspaceSaveStatus("saving");
        await WorkspaceData.saveMetadata(nextWorkspace);
        commitWorkspaceState(nextWorkspace);
      }

      await WorkspaceData.deletePageScenes(removedPageIds);
      setWorkspaceSaveStatus("saved");
    } catch (error) {
      reportWorkspaceError(error);
    }
  };

  const handleSelectPrimaryTab = (pageId: string) => {
    void handleOpenWorkspacePage(pageId);
  };

  const handleClosePrimaryTab = (pageId: string) => {
    const index = primaryTabs.indexOf(pageId);
    if (index === -1 || primaryTabs.length <= 1) {
      return;
    }
    setPrimaryTabs(primaryTabs.filter((id) => id !== pageId));
    if (workspaceRef.current?.activePageId === pageId) {
      const neighbor = primaryTabs[index - 1] ?? primaryTabs[index + 1];
      if (neighbor) {
        void handleOpenWorkspacePage(neighbor);
      }
    }
  };

  const handleSplitPageToSecondary = (pageId: string) => {
    setSecondaryPane((current) => {
      if (current) {
        const tabs = current.tabs.includes(pageId)
          ? current.tabs
          : [...current.tabs, pageId];
        return { tabs, activePageId: pageId };
      }
      return { tabs: [pageId], activePageId: pageId };
    });
  };

  const handleSelectSecondaryTab = (pageId: string) => {
    setSecondaryPane((current) =>
      current ? { ...current, activePageId: pageId } : current,
    );
  };

  const handleCloseSecondaryTab = (pageId: string) => {
    setSecondaryPane((current) => {
      if (!current) {
        return current;
      }
      const next = current.tabs.filter((id) => id !== pageId);
      if (next.length === 0) {
        return null;
      }
      return {
        tabs: next,
        activePageId:
          current.activePageId === pageId
            ? next[next.length - 1]
            : current.activePageId,
      };
    });
  };

  const handleCloseSecondaryPane = () => setSecondaryPane(null);

  const handleCyclePrimaryTab = (direction: 1 | -1) => {
    const activePageId = workspaceRef.current?.activePageId;
    if (!activePageId || primaryTabs.length < 2) {
      return;
    }
    const index = primaryTabs.indexOf(activePageId);
    if (index === -1) {
      return;
    }
    const next =
      primaryTabs[
        (index + direction + primaryTabs.length) % primaryTabs.length
      ];
    void handleOpenWorkspacePage(next);
  };

  // ---------------------------------------------------------------------------
  // Workspace shortcut layer
  //
  // These are the app's own chrome shortcuts (docks, page tabs, split view) —
  // the things reached dozens of times a day. Each one is registered in
  // `SHORTCUT_DEFINITIONS` under the "Workspace" category, so Settings >
  // Shortcuts can rebind them: `installShortcutInterceptor` replays the
  // *default* chord whenever a custom one is pressed, and this listener is
  // keyed on those defaults, so remapping needs no extra wiring here.
  //
  // Capture phase, ahead of the editor's own bubble-phase handler, and skipped
  // entirely while typing so none of them steal a keystroke from a rename
  // field or the canvas text editor. In Electron the native menu fires the
  // same actions; this listener is what makes them work under
  // `yarn start:personal` too.
  // ---------------------------------------------------------------------------
  const workspaceShortcutHandlers = {
    leftDock,
    inspector,
    primaryTabs,
    handleCyclePrimaryTab,
    handleClosePrimaryTab,
    handleSplitPageToSecondary,
  };
  const workspaceShortcutsRef = useRef(workspaceShortcutHandlers);
  workspaceShortcutsRef.current = workspaceShortcutHandlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        isWritableElement(event.target)
      ) {
        return;
      }

      const {
        leftDock: dock,
        inspector: panel,
        handleCyclePrimaryTab: cycleTab,
        handleClosePrimaryTab: closeTab,
        handleSplitPageToSecondary: splitTab,
      } = workspaceShortcutsRef.current;

      const activePageId = workspaceRef.current?.activePageId ?? null;
      const run = (action: () => void) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        action();
      };

      // plain Cmd
      if (!event.altKey && !event.shiftKey) {
        switch (event.code) {
          case "Backslash":
            return run(dock.toggleCollapsed);
          case "Digit1":
            return run(() => dock.openTab("pages"));
          case "Digit2":
            return run(() => dock.openTab("library"));
          case "Digit3":
            return run(() => dock.openTab("search"));
          case "KeyP":
            return run(() => setIsWorkspaceSearchOpen(true));
          case "KeyT":
            return run(() => setNewPageDialogTarget("primary"));
        }
        return;
      }

      // Cmd+Alt
      if (event.altKey && !event.shiftKey) {
        switch (event.code) {
          case "Backslash":
            return run(panel.toggleCollapsed);
          case "ArrowRight":
            return run(() => cycleTab(1));
          case "ArrowLeft":
            return run(() => cycleTab(-1));
        }
        return;
      }

      // Cmd+Shift
      if (event.shiftKey && !event.altKey) {
        switch (event.code) {
          case "KeyW":
            return activePageId ? run(() => closeTab(activePageId)) : undefined;
          case "Backslash":
            return activePageId ? run(() => splitTab(activePageId)) : undefined;
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // Backs the Ctrl/Cmd+T "New page" flow. Folder/file creation reuse the
  // exact same pure `WorkspaceData` helpers the rail's inline "+" buttons
  // use; the only new piece is routing the *result* to whichever pane asked
  // for it without letting a "new page → secondary" request silently steal
  // `workspace.activePageId` (which must keep meaning "what primary shows").
  const handleSubmitNewPageDialog = async (input: NewPageDialogSubmitInput) => {
    const currentWorkspace = workspaceRef.current;
    if (!currentWorkspace) {
      return;
    }
    const target = newPageDialogTarget ?? "primary";
    setNewPageDialogTarget(null);

    try {
      let nextWorkspace = currentWorkspace;
      let folderId = input.folderId;

      if (!folderId && input.newFolderName) {
        const result = addWorkspaceFolder(nextWorkspace, {
          name: input.newFolderName,
        });
        nextWorkspace = result.workspace;
        folderId = result.folder.id;
      }
      if (!folderId) {
        throw new Error("Choose or create a folder for the new page.");
      }

      let newPageId: string;

      if (!input.fileId && input.newFileName) {
        const result = addWorkspaceFile(nextWorkspace, folderId, {
          name: input.newFileName,
        });
        nextWorkspace =
          input.pageName && input.pageName !== result.page.name
            ? renameWorkspaceItem(
                result.workspace,
                "page",
                result.page.id,
                input.pageName,
              )
            : result.workspace;
        newPageId = result.page.id;
      } else if (input.fileId) {
        const result = addWorkspacePage(nextWorkspace, input.fileId, {
          name: input.pageName,
        });
        nextWorkspace = result.workspace;
        newPageId = result.page.id;
      } else {
        throw new Error("Choose or create a file for the new page.");
      }

      if (target === "secondary") {
        // Persist the tree, but keep `activePageId` pointing at whatever
        // primary currently shows — this creation must not silently switch
        // primary's canvas.
        const persisted = {
          ...nextWorkspace,
          activePageId: currentWorkspace.activePageId,
          updatedAt: Date.now(),
        };
        await WorkspaceData.saveMetadata(persisted);
        commitWorkspaceState(persisted);
        handleSplitPageToSecondary(newPageId);
      } else {
        await activateWorkspacePage(newPageId, nextWorkspace, true);
      }
    } catch (error) {
      reportWorkspaceError(error);
    }
  };

  const workspaceController: WorkspaceController = {
    workspace,
    saveStatus: workspaceSaveStatus,
    onOpenPage: handleOpenWorkspacePage,
    onCreateFolder: handleCreateWorkspaceFolder,
    onCreateFile: handleCreateWorkspaceFile,
    onCreatePage: handleCreateWorkspacePage,
    onRenameItem: handleRenameWorkspaceItem,
    onDeleteItem: handleDeleteWorkspaceItem,
  };

  const renderCustomStats = (
    elements: readonly NonDeletedExcalidrawElement[],
    appState: UIAppState,
  ) => {
    return (
      <CustomStats
        setToast={(message) => excalidrawAPI!.setToast({ message })}
        appState={appState}
        elements={elements}
      />
    );
  };

  const localStorageQuotaExceeded = useAtomValue(localStorageQuotaExceededAtom);

  // ---------------------------------------------------------------------------
  // onExport — intercepts file save to wait for pending image loads
  // ---------------------------------------------------------------------------
  const onExport: Required<ExcalidrawProps>["onExport"] = useCallback(
    async function* () {
      let snapshot = FileStatusStore.getSnapshot();
      const { pending, total } = FileStatusStore.getPendingCount(
        snapshot.value,
      );
      if (pending === 0) {
        return;
      }

      // Yield initial progress
      yield {
        type: "progress",
        progress: (total - pending) / total,
        message: `Loading images (${total - pending}/${total})...`,
      };

      // Wait for all pending images to finish
      while (true) {
        snapshot = await FileStatusStore.pull(snapshot.version);
        const { pending: nowPending, total: nowTotal } =
          FileStatusStore.getPendingCount(snapshot.value);

        yield {
          type: "progress",
          progress: (nowTotal - nowPending) / nowTotal,
          message: `Loading images (${nowTotal - nowPending}/${nowTotal})...`,
        };

        if (nowPending === 0) {
          await new Promise((r) => setTimeout(r, 500));
          yield {
            type: "progress",
            message: `Preparing export...`,
          };
          return;
        }
      }
    },
    [],
  );

  // const onExport = () => {
  //   return new Promise((r) => setTimeout(r, 2500));
  //   // console.log("onExport");
  // };

  // browsers generally prevent infinite self-embedding, there are
  // cases where it still happens, and while we disallow self-embedding
  // by not whitelisting our own origin, this serves as an additional guard
  if (isSelfEmbedding) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          height: "100%",
        }}
      >
        <h1>I'm not a pretzel!</h1>
      </div>
    );
  }

  const primaryEditorTabs: EditorTab[] = primaryTabs
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
    <div
      style={{ height: "100%" }}
      className={`excalidraw-app excalidraw${
        editorTheme === "dark" ? " theme--dark" : ""
      }`}
    >
      <div className="app-shell">
        <LeftDock
          state={leftDock}
          workspaceController={workspaceController}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onLibraryHostChange={setLibraryHost}
          onSearchHostChange={setSearchHost}
        />
        <div className="app-panes" ref={panesContainerRef}>
          <div
            className="app-pane app-pane--primary"
            style={secondaryPane ? { flex: `0 0 ${splitPct}%` } : undefined}
          >
            <EditorTabBar
              tabs={primaryEditorTabs}
              activeId={workspace?.activePageId ?? null}
              onSelect={handleSelectPrimaryTab}
              onClose={handleClosePrimaryTab}
              onNewTab={() => setNewPageDialogTarget("primary")}
              onSplitTab={handleSplitPageToSecondary}
              trailing={
                <button
                  type="button"
                  className={`chrome-icon-button${
                    inspector.isCollapsed ? "" : " is-active"
                  }`}
                  aria-label="Toggle design panel"
                  aria-pressed={!inspector.isCollapsed}
                  title="Toggle design panel (⌘⌥\)"
                  onClick={inspector.toggleCollapsed}
                >
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
                    <path
                      d="M12 3.75v12.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                    />
                  </svg>
                </button>
              }
            />
            <div className="app-pane-canvas">
              <Excalidraw
                onChange={onChange}
                onExport={onExport}
                initialData={initialStatePromiseRef.current.promise}
                UIOptions={{
                  canvasActions: {
                    toggleTheme: true,
                  },
                }}
                langCode={langCode}
                renderCustomStats={renderCustomStats}
                detectScroll={false}
                handleKeyboardGlobally={!secondaryPane}
                autoFocus={true}
                theme={editorTheme}
                onThemeChange={setAppTheme}
                renderTopRightUI={(isMobile) => {
                  if (isMobile || !excalidrawAPI) {
                    return null;
                  }

                  return (
                    <div className="excalidraw-ui-top-right">
                      <QuickAccessActions excalidrawAPI={excalidrawAPI} />
                    </div>
                  );
                }}
                onLinkOpen={(element, event) => {
                  if (element.link && isElementLink(element.link)) {
                    event.preventDefault();
                    excalidrawAPI?.setViewport({
                      target: element.link,
                      fit: "scale-down",
                      animation: true,
                    });
                  }
                }}
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
                {localStorageQuotaExceeded && (
                  <div className="alert alert--danger">
                    {t("alerts.localStorageQuotaExceeded")}
                  </div>
                )}

                <AppSidebar
                  workspaceController={workspaceController}
                  excalidrawAPI={excalidrawAPI}
                />

                {/* Mounted here for the editor's React contexts, rendered
                    into the shell's own columns via portals. */}
                <InspectorPanel host={inspectorHost} state={inspector} />
                <LibraryDockPanel host={libraryHost} />
                <SearchDockPanel
                  host={searchHost}
                  workspaceController={workspaceController}
                  excalidrawAPI={excalidrawAPI}
                />

                {isWorkspaceSearchOpen && (
                  <WorkspaceSearchDialog
                    onClose={() => setIsWorkspaceSearchOpen(false)}
                    workspaceController={workspaceController}
                    excalidrawAPI={excalidrawAPI}
                  />
                )}

                {isSettingsOpen && (
                  <SettingsDialog
                    onClose={() => setIsSettingsOpen(false)}
                    workspaceDirectory={workspaceDirectory}
                    appTheme={appTheme}
                    onThemeChange={setAppTheme}
                    appVersion={appVersion}
                    overrides={shortcutOverrides}
                    onSaveOverrides={handleSaveShortcutOverrides}
                  />
                )}

                {errorMessage && (
                  <ErrorDialog onClose={() => setErrorMessage("")}>
                    {errorMessage}
                  </ErrorDialog>
                )}

                <CommandPalette
                  customCommandPaletteItems={[
                    {
                      label: "GitHub",
                      icon: GithubIcon,
                      category: DEFAULT_CATEGORIES.links,
                      predicate: true,
                      keywords: [
                        "issues",
                        "bugs",
                        "requests",
                        "report",
                        "features",
                        "social",
                        "community",
                      ],
                      perform: () => {
                        window.open(
                          "https://github.com/excalidraw/excalidraw",
                          "_blank",
                          "noopener noreferrer",
                        );
                      },
                    },
                    {
                      label: t("labels.followUs"),
                      icon: XBrandIcon,
                      category: DEFAULT_CATEGORIES.links,
                      predicate: true,
                      keywords: ["twitter", "contact", "social", "community"],
                      perform: () => {
                        window.open(
                          "https://x.com/excalidraw",
                          "_blank",
                          "noopener noreferrer",
                        );
                      },
                    },
                    {
                      label: t("labels.discordChat"),
                      category: DEFAULT_CATEGORIES.links,
                      predicate: true,
                      icon: DiscordIcon,
                      keywords: [
                        "chat",
                        "talk",
                        "contact",
                        "bugs",
                        "requests",
                        "report",
                        "feedback",
                        "suggestions",
                        "social",
                        "community",
                      ],
                      perform: () => {
                        window.open(
                          "https://discord.gg/UexuTaE",
                          "_blank",
                          "noopener noreferrer",
                        );
                      },
                    },
                    {
                      label: "YouTube",
                      icon: youtubeIcon,
                      category: DEFAULT_CATEGORIES.links,
                      predicate: true,
                      keywords: [
                        "features",
                        "tutorials",
                        "howto",
                        "help",
                        "community",
                      ],
                      perform: () => {
                        window.open(
                          "https://youtube.com/@excalidraw",
                          "_blank",
                          "noopener noreferrer",
                        );
                      },
                    },
                  ]}
                />
                {isVisualDebuggerEnabled() && excalidrawAPI && (
                  <DebugCanvas
                    appState={excalidrawAPI.getAppState()}
                    scale={window.devicePixelRatio}
                    ref={debugCanvasRef}
                  />
                )}
                {newPageDialogTarget && (
                  <NewPageDialog
                    workspace={workspace}
                    targetLabel={
                      newPageDialogTarget === "primary" ? "main" : "split"
                    }
                    onClose={() => setNewPageDialogTarget(null)}
                    onSubmit={(input) => void handleSubmitNewPageDialog(input)}
                  />
                )}
              </Excalidraw>
            </div>
          </div>

          {secondaryPane && (
            <>
              <div
                className="app-pane-divider"
                onPointerDown={handleDividerPointerDown}
                onPointerMove={handleDividerPointerMove}
                onPointerUp={handleDividerPointerUp}
              />
              <div className="app-pane app-pane--secondary" style={{ flex: 1 }}>
                <SecondaryPagePane
                  workspace={workspace}
                  tabs={secondaryPane.tabs}
                  activePageId={secondaryPane.activePageId}
                  editorTheme={editorTheme}
                  appTheme={appTheme}
                  onThemeChange={setAppTheme}
                  onSelectTab={handleSelectSecondaryTab}
                  onCloseTab={handleCloseSecondaryTab}
                  onClosePane={handleCloseSecondaryPane}
                  onNewTab={() => setNewPageDialogTarget("secondary")}
                />
              </div>
            </>
          )}
        </div>

        {/* Portal target for the design inspector. Kept outside
            `.excalidraw-container` on purpose: the library's
            `getViewportOffsets()` DOM sweep then correctly ignores it, because
            there is no canvas hidden underneath a panel that the canvas was
            never sized to include. */}
        <aside
          className="app-inspector-host"
          ref={setInspectorHost}
          aria-label="Design"
        />
      </div>
    </div>
  );
};

const ExcalidrawApp = () => {
  return (
    <TopErrorBoundary>
      <Provider store={appJotaiStore}>
        <ExcalidrawAPIProvider>
          <ExcalidrawWrapper />
        </ExcalidrawAPIProvider>
      </Provider>
    </TopErrorBoundary>
  );
};

export default ExcalidrawApp;
