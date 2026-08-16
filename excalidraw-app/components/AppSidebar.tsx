import { DefaultSidebar, Sidebar } from "@excalidraw/excalidraw";
import { useUIAppState } from "@excalidraw/excalidraw/context/ui-appState";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { WORKSPACE_SIDEBAR_TAB } from "../data/WorkspaceData";

import { WorkspaceFolderIcon, WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceSearchSidebar } from "./WorkspaceSearchSidebar";

import type { WorkspaceController } from "./WorkspaceSidebar";

export const AppSidebar = ({
  workspaceController,
  excalidrawAPI,
}: {
  workspaceController: WorkspaceController;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) => {
  const { openSidebar } = useUIAppState();

  return (
    <DefaultSidebar
      searchMenu={
        <WorkspaceSearchSidebar
          workspaceController={workspaceController}
          excalidrawAPI={excalidrawAPI}
        />
      }
    >
      <DefaultSidebar.TabTriggers>
        <Sidebar.TabTrigger
          tab={WORKSPACE_SIDEBAR_TAB}
          aria-label="Workspace"
          title="Workspace"
          style={{
            opacity: openSidebar?.tab === WORKSPACE_SIDEBAR_TAB ? 1 : 0.4,
          }}
        >
          <WorkspaceFolderIcon />
        </Sidebar.TabTrigger>
      </DefaultSidebar.TabTriggers>
      <Sidebar.Tab tab={WORKSPACE_SIDEBAR_TAB}>
        <WorkspaceSidebar {...workspaceController} />
      </Sidebar.Tab>
    </DefaultSidebar>
  );
};
