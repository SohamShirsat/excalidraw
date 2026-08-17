import { SHORTCUT_DEFINITIONS } from "../excalidraw-app/data/shortcutBindings";

import type { SyntheticKeydownPayload } from "./appIpcChannels";

/**
 * Synthetic keydown payloads for native menu items
 * (`electron/menu.ts`) that mirror a REAL existing in-app keyboard shortcut.
 * Kept in their own file, separate from `menu.ts`'s `Menu.buildFromTemplate`
 * wiring (which needs a real Electron runtime to exercise), so the payload
 * shapes themselves — the part most prone to a wrong `key`/`code`/modifier —
 * can be unit-tested directly (see `excalidraw-app/tests/ElectronAppHandlers.test.ts`).
 *
 * Each entry's `defaultBinding` is sourced from
 * `excalidraw-app/data/shortcutBindings.ts` — the canonical registry built
 * later (for the remappable-shortcuts engine) from the exact same
 * `keyTest`-verification work this file originally did by hand for these 7
 * entries. Importing from there instead of duplicating the literal
 * `{ key, code, ... }` objects here eliminates a drift risk between the two
 * lists — see that file for each entry's full `keyTest`/inline-`onKeyDown`
 * citation.
 */
const getDefaultBinding = (id: string): SyntheticKeydownPayload => {
  const definition = SHORTCUT_DEFINITIONS.find(
    (candidate) => candidate.id === id,
  );
  if (!definition) {
    throw new Error(
      `[menuShortcuts] no canonical shortcut definition found for id "${id}"`,
    );
  }
  return definition.defaultBinding;
};

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
  openScene: getDefaultBinding("loadScene"),
  saveToActiveFile: getDefaultBinding("saveToActiveFile"),
  saveAsImage: getDefaultBinding("imageExport"),
  commandPalette: getDefaultBinding("commandPalette"),
  searchMenu: getDefaultBinding("searchMenu"),
  toggleTheme: getDefaultBinding("toggleTheme"),
  keyboardShortcuts: getDefaultBinding("toggleShortcuts"),
};
