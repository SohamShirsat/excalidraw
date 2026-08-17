import { Dialog } from "@excalidraw/excalidraw/components/Dialog";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { WorkspaceSearchSidebar } from "./WorkspaceSearchSidebar";

import "./WorkspaceSearchDialog.scss";

import type { WorkspaceController } from "./WorkspaceSidebar";

export const WorkspaceSearchDialog = ({
  onClose,
  workspaceController,
  excalidrawAPI,
}: {
  onClose: () => void;
  workspaceController: WorkspaceController;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) => (
  <Dialog
    className="workspace-search-dialog"
    size="wide"
    title={false}
    onCloseRequest={onClose}
  >
    <WorkspaceSearchSidebar
      workspaceController={workspaceController}
      excalidrawAPI={excalidrawAPI}
      onClose={onClose}
    />
  </Dialog>
);
