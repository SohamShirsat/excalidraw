import { app, Menu } from "electron";

import { APP_IPC_CHANNELS } from "./appIpcChannels";
import { MENU_SYNTHETIC_KEYDOWN_PAYLOADS } from "./menuShortcuts";

import type { BrowserWindow, MenuItemConstructorOptions } from "electron";
import type { MenuActionId, SyntheticKeydownPayload } from "./appIpcChannels";

/**
 * Native macOS application menu, built once from `electron/main.ts` after
 * the main window is created and installed via `Menu.setApplicationMenu`.
 * Replaces Electron's implicit default menu (previously left untouched —
 * `main.ts` deliberately set no app menu).
 *
 * Dispatch strategy for non-`role` items:
 *  - Anything that mirrors a REAL existing in-app keyboard shortcut (see
 *    `packages/excalidraw/actions/shortcuts.ts`'s `shortcutMap`, plus the
 *    inline `onKeyDown` branches in `packages/excalidraw/components/App.tsx`
 *    for shortcuts — like image export — that aren't registered actions)
 *    sends a synthetic keydown over `menu:synthetic-keydown`. The renderer
 *    (`excalidraw-app/App.tsx`) replays it as a real `KeyboardEvent` on
 *    `document`, so it flows through the app's existing keyboard dispatch
 *    unchanged — no second, parallel action-triggering system here.
 *  - The two items with no existing shortcut at all (Export…, Change Canvas
 *    Background) send a bespoke id over `menu:action` instead; the renderer
 *    replicates the exact same call their in-canvas menu equivalents make
 *    (`MainMenu.DefaultItems.Export` / `ChangeCanvasBackground` in
 *    `packages/excalidraw/components/main-menu/DefaultItems.tsx`).
 */

const sendSyntheticKeydown = (
  mainWindow: BrowserWindow,
  payload: SyntheticKeydownPayload,
) => {
  mainWindow.webContents.send(APP_IPC_CHANNELS.menuSyntheticKeydown, payload);
};

const sendMenuAction = (mainWindow: BrowserWindow, actionId: MenuActionId) => {
  mainWindow.webContents.send(APP_IPC_CHANNELS.menuAction, actionId);
};

export const buildApplicationMenu = (mainWindow: BrowserWindow): Menu => {
  const template: MenuItemConstructorOptions[] = [
    // macOS convention: About/Services/Hide/Hide Others/Show All/Quit, all
    // labeled from `app.name` (set via `app.setName(...)` in `main.ts`) —
    // no need to hand-roll an "About Personal Excalidraw" item alongside it.
    { role: "appMenu" },
    {
      label: "File",
      submenu: [
        {
          // Mirrors `MainMenu.DefaultItems.LoadScene` (shortcutMap.loadScene).
          label: "Open…",
          accelerator: "CmdOrCtrl+O",
          click: () =>
            sendSyntheticKeydown(
              mainWindow,
              MENU_SYNTHETIC_KEYDOWN_PAYLOADS.openScene,
            ),
        },
        {
          // Mirrors `MainMenu.DefaultItems.SaveToActiveFile` (shortcutMap.saveScene).
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () =>
            sendSyntheticKeydown(
              mainWindow,
              MENU_SYNTHETIC_KEYDOWN_PAYLOADS.saveToActiveFile,
            ),
        },
        { type: "separator" },
        {
          // Mirrors `MainMenu.DefaultItems.Export` — genuinely has no
          // keyboard shortcut in-app (no `shortcut` prop on that item, no
          // shortcutMap entry), so this goes over the bespoke action
          // channel instead of a synthetic keydown.
          label: "Export…",
          click: () => sendMenuAction(mainWindow, "export-json"),
        },
        {
          // Mirrors `MainMenu.DefaultItems.SaveAsImage` (shortcutMap.imageExport).
          // Handled by an inline branch in `App.tsx`'s onKeyDown rather than
          // a registered action, but that branch lives on the same
          // document-level keydown listener, so a synthetic keydown reaches
          // it exactly the same way.
          label: "Save as Image…",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () =>
            sendSyntheticKeydown(
              mainWindow,
              MENU_SYNTHETIC_KEYDOWN_PAYLOADS.saveAsImage,
            ),
        },
        // `role: "quit"` lives in the appMenu on macOS — not duplicated here.
      ],
    },
    // Gives Undo/Redo/Cut/Copy/Paste/Select All for free, correctly wired to
    // whatever's focused (an input, a textarea, or the canvas) — no need to
    // reimplement any of this by hand.
    { label: "Edit", role: "editMenu" },
    {
      label: "View",
      submenu: [
        {
          // Mirrors `MainMenu.DefaultItems.CommandPalette`
          // (shortcutMap.commandPalette[0]).
          label: "Command Palette",
          accelerator: "CmdOrCtrl+/",
          click: () =>
            sendSyntheticKeydown(
              mainWindow,
              MENU_SYNTHETIC_KEYDOWN_PAYLOADS.commandPalette,
            ),
        },
        {
          // Mirrors `MainMenu.DefaultItems.SearchMenu` (shortcutMap.searchMenu).
          label: "Search",
          accelerator: "CmdOrCtrl+F",
          click: () =>
            sendSyntheticKeydown(
              mainWindow,
              MENU_SYNTHETIC_KEYDOWN_PAYLOADS.searchMenu,
            ),
        },
        { type: "separator" },
        {
          // Mirrors `MainMenu.DefaultItems.ToggleTheme` (shortcutMap.toggleTheme).
          // `actionToggleTheme`'s keyTest checks `event.code === CODES.D`
          // (not `event.key`), so `code` must be set correctly here.
          label: "Toggle Theme",
          accelerator: "Shift+Alt+D",
          click: () =>
            sendSyntheticKeydown(
              mainWindow,
              MENU_SYNTHETIC_KEYDOWN_PAYLOADS.toggleTheme,
            ),
        },
        {
          // Mirrors `MainMenu.DefaultItems.ChangeCanvasBackground` — that
          // component isn't a single toggle, it's an inline `ColorPicker`
          // (`actionChangeViewBackgroundColor`'s `PanelComponent`) rendered
          // directly inside the in-canvas hamburger menu, with no shortcut
          // and no standalone "open the picker" call to replicate. The
          // closest faithful equivalent — the real code path clicking the
          // hamburger icon takes — is opening that same menu
          // (`appState.openMenu = "canvas"`, see
          // `packages/excalidraw/components/main-menu/MainMenu.tsx`), which
          // surfaces the picker without inventing new UI.
          label: "Change Canvas Background…",
          click: () => sendMenuAction(mainWindow, "change-canvas-background"),
        },
        ...(app.isPackaged
          ? []
          : ([
              { type: "separator" },
              { role: "toggleDevTools" },
            ] as MenuItemConstructorOptions[])),
      ],
    },
    // Standard Minimize/Zoom/Close, plus the window-list section on macOS.
    { label: "Window", role: "windowMenu" },
    {
      label: "Help",
      submenu: [
        {
          // Mirrors `MainMenu.DefaultItems.Help` (`actionShortcuts`,
          // shortcut "?") — opens the in-app keyboard-shortcuts dialog. No
          // other help surface exists to link to (third-party links were
          // stripped in Phase 1), so this is the one useful, minimal thing
          // to put here.
          label: "Keyboard Shortcuts",
          accelerator: "Shift+/",
          click: () =>
            sendSyntheticKeydown(
              mainWindow,
              MENU_SYNTHETIC_KEYDOWN_PAYLOADS.keyboardShortcuts,
            ),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
};
