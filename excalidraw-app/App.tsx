import {
  Excalidraw,
  TTDDialogTrigger,
  CaptureUpdateAction,
  ExcalidrawAPIProvider,
  useExcalidrawAPI,
  DefaultSidebar,
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
import { isBrowserStorageStateNewer } from "./data/tabSync";
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
import { WorkspaceFolderIcon } from "./components/WorkspaceSidebar";
import {
  WorkspaceData,
  WORKSPACE_SIDEBAR_TAB,
  addWorkspaceFile,
  addWorkspaceFolder,
  addWorkspacePage,
  getWorkspacePageIds,
  removeWorkspaceItem,
  renameWorkspaceItem,
} from "./data/WorkspaceData";

import type {
  WorkspaceController,
  WorkspaceSaveStatus,
} from "./components/WorkspaceSidebar";
import type {
  WorkspaceItemType,
  WorkspaceMetadata,
} from "./data/WorkspaceData";

polyfill();

window.EXCALIDRAW_THROTTLE_RENDER = true;

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
  const workspaceRef = useRef<WorkspaceMetadata | null>(null);
  const activeWorkspacePageIdRef = useRef<string | null>(null);
  const isWorkspaceSwitchingRef = useRef(false);
  const isWorkspaceAutosaveEnabledRef = useRef(false);

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

  return (
    <div style={{ height: "100%" }} className="excalidraw-app">
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
        handleKeyboardGlobally={true}
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
        <DefaultSidebar.Trigger
          title="Workspace"
          tab={WORKSPACE_SIDEBAR_TAB}
          icon={<WorkspaceFolderIcon />}
        >
          Workspace
        </DefaultSidebar.Trigger>
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
              keywords: ["features", "tutorials", "howto", "help", "community"],
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
      </Excalidraw>
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
