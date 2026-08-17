import type { SyntheticKeydownPayload } from "./appIpcChannels";

/**
 * Synthetic keydown payloads for native menu items
 * (`electron/menu.ts`) that mirror a REAL existing in-app keyboard shortcut.
 * Kept in their own file, separate from `menu.ts`'s `Menu.buildFromTemplate`
 * wiring (which needs a real Electron runtime to exercise), so the payload
 * shapes themselves — the part most prone to a wrong `key`/`code`/modifier —
 * can be unit-tested directly (see `excalidraw-app/tests/ElectronAppHandlers.test.ts`).
 *
 * Each entry's source of truth is `packages/excalidraw/actions/shortcuts.ts`
 * (`shortcutMap`) plus the corresponding action's `keyTest` (or, for
 * `saveAsImage`/`keyboardShortcuts`, the inline `onKeyDown` branch in
 * `packages/excalidraw/components/App.tsx` that isn't a registered action).
 */
export const MENU_SYNTHETIC_KEYDOWN_PAYLOADS: Record<
  | "openScene"
  | "saveToActiveFile"
  | "saveAsImage"
  | "commandPalette"
  | "searchMenu"
  | "toggleTheme"
  | "keyboardShortcuts",
  SyntheticKeydownPayload
> = {
  // shortcutMap.loadScene / actionLoadScene's keyTest: CmdOrCtrl+O.
  openScene: { key: "o", code: "KeyO", metaKey: true },
  // shortcutMap.saveScene / actionSaveToActiveFile's keyTest: CmdOrCtrl+S
  // (explicitly `!event.shiftKey`, so `shiftKey` must stay unset here).
  saveToActiveFile: { key: "s", code: "KeyS", metaKey: true },
  // shortcutMap.imageExport: CmdOrCtrl+Shift+E, handled by an inline
  // `onKeyDown` branch in `App.tsx` rather than a registered action.
  saveAsImage: { key: "e", code: "KeyE", metaKey: true, shiftKey: true },
  // shortcutMap.commandPalette[0] / `isCommandPaletteToggleShortcut`:
  // CmdOrCtrl+/.
  commandPalette: { key: "/", code: "Slash", metaKey: true },
  // shortcutMap.searchMenu / actionToggleSearchMenu's keyTest: CmdOrCtrl+F.
  searchMenu: { key: "f", code: "KeyF", metaKey: true },
  // shortcutMap.toggleTheme / actionToggleTheme's keyTest: Shift+Alt+D.
  // Notably `keyTest` checks `event.code === CODES.D`, NOT `event.key` —
  // the one shortcut on this list keyed off `code` rather than `key`, so
  // getting `code` wrong here would silently break it.
  toggleTheme: { key: "d", code: "KeyD", shiftKey: true, altKey: true },
  // The in-app "?" shortcut (`KEYS.QUESTION_MARK`) that opens the keyboard
  // shortcuts dialog (`actionShortcuts`, `App.tsx`'s onKeyDown).
  keyboardShortcuts: { key: "?", code: "Slash", shiftKey: true },
};
