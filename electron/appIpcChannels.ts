/**
 * IPC channel names + payload shapes for the app-shell surface (native menu
 * dispatch, native confirm dialog) — a separate, parallel concern from
 * `ipcChannels.ts`'s Personal Workspace data channels. Shared between
 * `electron/menu.ts` and `electron/main.ts` (senders/handlers) and
 * `electron/preload.ts` (the `window.electronApp` bridge that relays them
 * into the renderer). Kept in its own file, with zero other dependencies,
 * for the same reason `ipcChannels.ts` is: both the main-process and preload
 * bundles can import it without pulling in anything else.
 */
export const APP_IPC_CHANNELS = {
  menuSyntheticKeydown: "menu:synthetic-keydown",
  menuAction: "menu:action",
  dialogConfirm: "dialog:confirm",
  dialogOpenFiles: "dialog:open-files",
  appVersion: "app:version",
  settingsShortcutsRead: "settings:shortcuts:read",
  settingsShortcutsWrite: "settings:shortcuts:write",
} as const;

export type AppIpcChannel =
  typeof APP_IPC_CHANNELS[keyof typeof APP_IPC_CHANNELS];

/**
 * Sent from `electron/menu.ts`'s `click` handlers to the renderer for any
 * menu item that mirrors a REAL existing in-app keyboard shortcut. The
 * renderer (`excalidraw-app/App.tsx`) turns this back into an actual
 * `KeyboardEvent` dispatched on `document`, so it flows through the exact
 * same `keyTest`-predicate dispatch (`packages/excalidraw/actions/manager.tsx`)
 * and ad-hoc `onKeyDown` branches (`packages/excalidraw/components/App.tsx`)
 * that a real keypress would — no second, parallel action-triggering system.
 */
export type SyntheticKeydownPayload = {
  key: string;
  code: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
};

/**
 * Bespoke action ids sent over `menu:action` for the handful of menu items
 * that have genuinely no existing keyboard shortcut to synthesize instead.
 * Kept as a closed union so both `electron/menu.ts` (sender) and
 * `excalidraw-app/App.tsx` (handler) stay in sync on the valid ids.
 */
export type MenuActionId =
  | "export-json"
  | "change-canvas-background"
  | "open-settings"
  | "open-workspace-search";

/** Options accepted by the `dialog:confirm` IPC handler in `electron/main.ts`. */
export type ConfirmDialogOptions = {
  title: string;
  message: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

/** Options and serializable file payloads for Electron's native open dialog. */
export type OpenFilesDialogOptions = {
  description: string;
  extensions?: string[];
  multiple?: boolean;
};

export type OpenedFile = {
  name: string;
  data: Uint8Array;
};
