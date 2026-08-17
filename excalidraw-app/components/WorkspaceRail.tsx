import { useEffect, useState } from "react";

import { WorkspaceSidebar } from "./WorkspaceSidebar";

import "./WorkspaceRail.scss";

import type { WorkspaceController } from "./WorkspaceSidebar";

const COLLAPSED_STORAGE_KEY = "personal-excalidraw-workspace-rail-collapsed";

const getInitialCollapsedState = () =>
  typeof localStorage !== "undefined" &&
  localStorage.getItem(COLLAPSED_STORAGE_KEY) === "true";

/**
 * Desktop-first home for the folder/file/page tree. Unlike the generic
 * Excalidraw sidebar this is always mounted, so navigating a workspace never
 * depends on opening a tab first. It can still collapse to preserve canvas
 * room on a smaller laptop display.
 */
export const WorkspaceRail = ({
  workspaceController,
}: {
  workspaceController: WorkspaceController;
}) => {
  const [isCollapsed, setIsCollapsed] = useState(getInitialCollapsedState);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, String(isCollapsed));
  }, [isCollapsed]);

  return (
    <aside
      className={`workspace-rail${isCollapsed ? " is-collapsed" : ""}`}
      aria-label="Workspace"
    >
      <button
        className="workspace-rail-toggle"
        type="button"
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        aria-label={isCollapsed ? "Expand workspace" : "Collapse workspace"}
        title={isCollapsed ? "Expand workspace" : "Collapse workspace"}
      >
        <span aria-hidden="true">{isCollapsed ? "›" : "‹"}</span>
      </button>
      {!isCollapsed && <WorkspaceSidebar {...workspaceController} />}
    </aside>
  );
};
