import { createPortal } from "react-dom";

import { LibraryMenu } from "@excalidraw/excalidraw/components/LibraryMenu";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { WorkspaceSearchSidebar } from "./WorkspaceSearchSidebar";

import type { WorkspaceController } from "./WorkspaceSidebar";

/**
 * Left-dock tabs whose content can't simply be rendered where it's shown.
 *
 * Both the shape library and the workspace search panel depend on the editor's
 * React contexts — `useApp()` / `useExcalidrawSetAppState()` and, crucially,
 * the *isolated* jotai store Excalidraw creates via `createIsolation()`. That
 * store has no ambient fallback: rendering a consumer outside the provider
 * throws "Missing Provider from createIsolation" outright rather than
 * degrading.
 *
 * So each panel mounts as a child of `<Excalidraw>` (inside every provider)
 * and portals its DOM into the dock's host node. React context follows the
 * component tree, not the DOM tree, so the hooks resolve normally while the
 * markup lands on the left where it belongs.
 */

export const LibraryDockPanel = ({ host }: { host: HTMLElement | null }) => {
  if (!host) {
    return null;
  }
  return createPortal(<LibraryMenu />, host);
};

export const SearchDockPanel = ({
  host,
  workspaceController,
  excalidrawAPI,
}: {
  host: HTMLElement | null;
  workspaceController: WorkspaceController;
  excalidrawAPI: ExcalidrawImperativeAPI | null;
}) => {
  if (!host) {
    return null;
  }
  return createPortal(
    <WorkspaceSearchSidebar
      workspaceController={workspaceController}
      excalidrawAPI={excalidrawAPI}
    />,
    host,
  );
};
