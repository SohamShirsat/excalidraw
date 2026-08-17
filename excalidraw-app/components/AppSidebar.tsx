import { DefaultSidebar } from "@excalidraw/excalidraw";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { WorkspaceSearchSidebar } from "./WorkspaceSearchSidebar";

import type { WorkspaceController } from "./WorkspaceSidebar";

export const AppSidebar = ({
  workspaceController,
  excalidrawAPI,
}: {
  workspaceController: WorkspaceController;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) => {
  return (
    <DefaultSidebar
      searchMenu={
        <WorkspaceSearchSidebar
          workspaceController={workspaceController}
          excalidrawAPI={excalidrawAPI}
        />
      }
    ></DefaultSidebar>
  );
};
