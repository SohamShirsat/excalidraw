/**
 * Persistence for shortcut-binding overrides — Electron IPC when present,
 * a `localStorage` fallback otherwise (plain browser-dev mode, i.e.
 * `yarn start` / `yarn start:personal` outside Electron). Same
 * dual-transport philosophy as `excalidraw-app/data/workspaceTransport.ts`:
 * this branches on `window.electronApp` presence exactly the way that
 * module's `isElectronRuntime()` does.
 *
 * The persisted shape — `Record<ShortcutDefinition["id"], ShortcutBinding |
 * null>` — is exactly what `excalidraw-app/data/shortcutBindings.ts`'s
 * `getEffectiveBindings` expects as input.
 */

import type { ShortcutBinding } from "./shortcutBindings";

const LOCAL_STORAGE_KEY = "excalidraw-shortcut-overrides";

const isElectronRuntime = () =>
  typeof window !== "undefined" && !!window.electronApp;

export const loadShortcutOverrides = async (): Promise<
  Record<string, ShortcutBinding | null>
> => {
  if (isElectronRuntime()) {
    try {
      return await window.electronApp!.readShortcutOverrides();
    } catch (error) {
      console.error(
        "[shortcutOverrides] failed to read overrides via Electron IPC",
        error,
      );
      return {};
    }
  }

  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, ShortcutBinding | null>;
    }
  } catch (error) {
    console.error(
      "[shortcutOverrides] failed to parse localStorage overrides",
      error,
    );
  }
  return {};
};

export const saveShortcutOverrides = async (
  overrides: Record<string, ShortcutBinding | null>,
): Promise<void> => {
  if (isElectronRuntime()) {
    await window.electronApp!.writeShortcutOverrides(overrides);
    return;
  }

  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(overrides));
};
