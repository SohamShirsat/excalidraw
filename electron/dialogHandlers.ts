import type { ConfirmDialogOptions } from "./appIpcChannels";

/**
 * Minimal structural shape of `Electron.Dialog.showMessageBox` this handler
 * depends on — deliberately not importing the real `electron` module here,
 * so `createConfirmHandler` can be exercised in tests with a plain mock and
 * no real Electron runtime, the same way `electron/ipcHandlers.ts`'s
 * handlers are tested against a plain `PersonalWorkspaceStore` (see
 * `excalidraw-app/tests/ElectronAppHandlers.test.ts`).
 */
export type ShowMessageBox = (options: {
  type: "warning";
  buttons: string[];
  defaultId: number;
  cancelId: number;
  message: string;
  detail?: string;
}) => Promise<{ response: number }>;

/**
 * Builds the `dialog:confirm` IPC handler's logic, wrapping a
 * `dialog.showMessageBox` implementation 1:1. Returned as a plain function
 * (rather than calling `ipcMain.handle` directly) for the same testability
 * reason `createWorkspaceIpcHandlers` is — `electron/main.ts` wires it up to
 * the real `dialog.showMessageBox` (bound to the current `mainWindow`) and
 * registers it against `ipcMain.handle` itself.
 *
 * Resolves `true` iff the confirm/destructive button (index 1) was chosen,
 * `false` for cancel (index 0) or the dialog being dismissed.
 */
export const createConfirmHandler =
  (showMessageBox: ShowMessageBox) =>
  async (options: ConfirmDialogOptions): Promise<boolean> => {
    const result = await showMessageBox({
      type: "warning",
      buttons: [
        options.cancelLabel ?? "Cancel",
        options.confirmLabel ?? "Delete",
      ],
      defaultId: 1,
      cancelId: 0,
      message: options.message,
      detail: options.detail,
    });
    return result.response === 1;
  };
