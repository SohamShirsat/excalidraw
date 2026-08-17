/**
 * Canonical remappable-shortcut registry — pure data + pure functions only.
 *
 * **Zero browser-only/React/DOM runtime imports.** This file compiles under
 * BOTH the normal `excalidraw-app` TypeScript program (bundler resolution)
 * AND `electron/tsconfig.json`'s separate Node/CommonJS program — the same
 * dual-compilation trick already used for `excalidraw-app/data/workspaceTypes.ts`
 * (see that file's header comment, and `electron/tsconfig.json`'s `include`
 * array, which this file's path has been added to). Do not add any import
 * here that isn't itself dual-compile-safe.
 *
 * Every `defaultBinding` below was derived by reading the *real* dispatch
 * predicate for that shortcut — either a registered action's `keyTest` in
 * `packages/excalidraw/actions/*.tsx`, or (for the handful of shortcuts that
 * aren't registered actions) the matching inline branch in
 * `packages/excalidraw/components/App.tsx`'s `onKeyDown` — never guessed
 * from `packages/excalidraw/actions/shortcuts.ts`'s `shortcutMap` display
 * strings alone (that map is itself DISPLAY-ONLY and has zero effect on
 * dispatch). Each entry cites its source. This app targets macOS only (see
 * `electron/main.ts`), so `CtrlOrCmd` below always resolves to `metaKey`,
 * matching the convention `electron/menuShortcuts.ts` already established.
 *
 * Coverage notes (shortcuts intentionally NOT included — see the full
 * rationale in the task report, not duplicated here):
 *  - `shortcutMap.saveScene`: not a real `ActionName` (no `actionSaveScene`
 *    exists) — a display-only alias sharing `saveToActiveFile`'s binding.
 *  - `shortcutMap.copy` / `shortcutMap.paste`: `keyTest: undefined` — these
 *    fire off the browser's native `copy`/`paste` clipboard events, not a
 *    `keydown`, so there's no combo to bind or intercept.
 *  - `shortcutMap.addToLibrary` / `shortcutMap.wrapSelectionInFrame`: empty
 *    `shortcutMap` arrays — no default shortcut exists to remap.
 *  - `shortcutMap.toolLock` ("Q"): its handling in `App.tsx`'s `onKeyDown`
 *    is gated behind the same mid-interaction guard as tool-switching
 *    (`!newElement && !selectionElement && !selectedElementsAreBeingDragged`)
 *    — context-dependent, skipped per the "ambiguous/context-dependent, skip
 *    it" instruction.
 *  - `TOOLS.image` / `TOOLS.lasso` / `TOOLS.embeddable`: no `letterKey`
 *    defined for these tools — nothing to bind.
 *  - `TOOLS.freedraw`'s second `letterKey` alias ("x", alongside "p") and
 *    every tool's `numericKey` alias (1–9, 0): out of scope for remapping in
 *    this version per the task spec — left as fixed, unremappable aliases.
 */

import type { SyntheticKeydownPayload } from "../../electron/appIpcChannels";

/**
 * Reuses `SyntheticKeydownPayload`'s exact shape (see
 * `electron/appIpcChannels.ts` — that file has zero Electron runtime
 * dependency, confirmed by reading it) rather than inventing a second
 * near-duplicate type.
 */
export type ShortcutBinding = SyntheticKeydownPayload;

export type ShortcutDefinition = {
  /** stable, e.g. "toggleTheme", "tool.rectangle" */
  id: string;
  /** human-readable, for a future Settings UI */
  label: string;
  /** e.g. "Tools", "Editing", "View", "File" */
  category: string;
  defaultBinding: ShortcutBinding;
};

export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  // ---------------------------------------------------------------------
  // Tools — packages/excalidraw/components/Tools.tsx's TOOLS map,
  // `letterKey` only (numericKey aliases are out of scope, see above).
  // Dispatch: App.tsx's onKeyDown -> findShapeByKey(event.key, ...), gated
  // behind !ctrlKey && !altKey && !metaKey && no mid-interaction state.
  // ---------------------------------------------------------------------
  {
    id: "tool.selection",
    label: "Selection tool",
    category: "Tools",
    defaultBinding: { key: "v", code: "KeyV" },
  },
  {
    id: "tool.rectangle",
    label: "Rectangle tool",
    category: "Tools",
    defaultBinding: { key: "r", code: "KeyR" },
  },
  {
    id: "tool.diamond",
    label: "Diamond tool",
    category: "Tools",
    defaultBinding: { key: "d", code: "KeyD" },
  },
  {
    id: "tool.ellipse",
    label: "Ellipse tool",
    category: "Tools",
    defaultBinding: { key: "o", code: "KeyO" },
  },
  {
    id: "tool.arrow",
    label: "Arrow tool",
    category: "Tools",
    defaultBinding: { key: "a", code: "KeyA" },
  },
  {
    id: "tool.line",
    label: "Line tool",
    category: "Tools",
    defaultBinding: { key: "l", code: "KeyL" },
  },
  {
    // TOOLS.freedraw.letterKey is [KEYS.P, KEYS.X] — two valid keys. "p" is
    // taken as canonical (first-listed, same "take the first" convention
    // `getShortcutFromShortcutName` uses); the "x" alias is intentionally
    // left out of the remappable registry (see file header).
    id: "tool.freedraw",
    label: "Freedraw tool",
    category: "Tools",
    defaultBinding: { key: "p", code: "KeyP" },
  },
  {
    id: "tool.text",
    label: "Text tool",
    category: "Tools",
    defaultBinding: { key: "t", code: "KeyT" },
  },
  {
    id: "tool.eraser",
    label: "Eraser tool",
    category: "Tools",
    defaultBinding: { key: "e", code: "KeyE" },
  },
  {
    id: "tool.frame",
    label: "Frame tool",
    category: "Tools",
    defaultBinding: { key: "f", code: "KeyF" },
  },
  {
    // TOOLS.autoshape requires shiftKey (Tools.tsx: `shiftKey: true`).
    id: "tool.autoshape",
    label: "Auto-detect shape tool",
    category: "Tools",
    defaultBinding: { key: "X", code: "KeyX", shiftKey: true },
  },
  {
    id: "tool.hand",
    label: "Hand (pan) tool",
    category: "Tools",
    defaultBinding: { key: "h", code: "KeyH" },
  },
  {
    id: "tool.laser",
    label: "Laser pointer tool",
    category: "Tools",
    defaultBinding: { key: "k", code: "KeyK" },
  },

  // ---------------------------------------------------------------------
  // Editing
  // ---------------------------------------------------------------------
  {
    // keyTest: packages/excalidraw/actions/actionClipboard.tsx:121
    id: "cut",
    label: "Cut",
    category: "Editing",
    defaultBinding: { key: "x", code: "KeyX", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionStyles.ts:68-69
    id: "copyStyles",
    label: "Copy styles",
    category: "Editing",
    defaultBinding: { key: "c", code: "KeyC", metaKey: true, altKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionStyles.ts:170-171
    id: "pasteStyles",
    label: "Paste styles",
    category: "Editing",
    defaultBinding: { key: "v", code: "KeyV", metaKey: true, altKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionSelectAll.ts:69
    id: "selectAll",
    label: "Select all",
    category: "Editing",
    defaultBinding: { key: "a", code: "KeyA", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionDeleteSelected.tsx:305-307
    // (checks event.key, not event.code — Backspace also matches, Delete
    // taken as canonical).
    id: "deleteSelectedElements",
    label: "Delete selected elements",
    category: "Editing",
    defaultBinding: { key: "Delete", code: "Delete" },
  },
  {
    // keyTest: packages/excalidraw/actions/actionDuplicateSelection.tsx:111.
    // (The Alt+drag gesture alias from shortcutMap is a mouse gesture, not a
    // key combo — out of scope here.)
    id: "duplicateSelection",
    label: "Duplicate selection",
    category: "Editing",
    defaultBinding: { key: "d", code: "KeyD", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionZindex.tsx:37-40
    id: "sendBackward",
    label: "Send backward",
    category: "Editing",
    defaultBinding: { key: "[", code: "BracketLeft", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionZindex.tsx:67-70
    id: "bringForward",
    label: "Bring forward",
    category: "Editing",
    defaultBinding: { key: "]", code: "BracketRight", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionZindex.tsx:96-103 (isDarwin
    // branch — this app is macOS-only, see electron/main.ts).
    id: "sendToBack",
    label: "Send to back",
    category: "Editing",
    defaultBinding: {
      key: "[",
      code: "BracketLeft",
      metaKey: true,
      altKey: true,
    },
  },
  {
    // keyTest: packages/excalidraw/actions/actionZindex.tsx:134-141 (isDarwin
    // branch).
    id: "bringToFront",
    label: "Bring to front",
    category: "Editing",
    defaultBinding: {
      key: "]",
      code: "BracketRight",
      metaKey: true,
      altKey: true,
    },
  },
  {
    // keyTest: packages/excalidraw/actions/actionClipboard.tsx:250
    id: "copyAsPng",
    label: "Copy as PNG",
    category: "Editing",
    defaultBinding: { key: "c", code: "KeyC", altKey: true, shiftKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionGroup.tsx:199-200
    id: "group",
    label: "Group selection",
    category: "Editing",
    defaultBinding: { key: "g", code: "KeyG", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionGroup.tsx:303-306 — checks
    // `event.key === KEYS.G.toUpperCase()` exactly (case-sensitive, unlike
    // most other code-based checks here), so `key` must stay "G".
    id: "ungroup",
    label: "Ungroup selection",
    category: "Editing",
    defaultBinding: {
      key: "G",
      code: "KeyG",
      metaKey: true,
      shiftKey: true,
    },
  },
  {
    // keyTest: packages/excalidraw/actions/actionFlip.ts:51
    id: "flipHorizontal",
    label: "Flip horizontal",
    category: "Editing",
    defaultBinding: { key: "h", code: "KeyH", shiftKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionFlip.ts:76-77
    id: "flipVertical",
    label: "Flip vertical",
    category: "Editing",
    defaultBinding: { key: "v", code: "KeyV", shiftKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionLink.tsx:40
    id: "hyperlink",
    label: "Add / edit link",
    category: "Editing",
    defaultBinding: { key: "k", code: "KeyK", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionElementLock.ts:147-157.
    // The combo itself is unambiguous (CtrlOrCmd+Shift+L); the keyTest's
    // extra "has a selection" check only gates whether the action performs
    // once dispatched (same as pressing the real key with nothing
    // selected), not what key combo triggers it.
    id: "toggleElementLock",
    label: "Lock / unlock selection",
    category: "Editing",
    defaultBinding: {
      key: "L",
      code: "KeyL",
      metaKey: true,
      shiftKey: true,
    },
  },

  // ---------------------------------------------------------------------
  // View
  // ---------------------------------------------------------------------
  {
    // keyTest: packages/excalidraw/actions/actionCanvas.tsx:447-451. Keyed
    // off event.code, not event.key — see electron/menuShortcuts.ts, which
    // this entry now feeds.
    id: "toggleTheme",
    label: "Toggle light / dark theme",
    category: "View",
    defaultBinding: {
      key: "d",
      code: "KeyD",
      shiftKey: true,
      altKey: true,
    },
  },
  {
    // keyTest: packages/excalidraw/actions/actionToggleGridMode.tsx:33
    id: "gridMode",
    label: "Toggle grid mode",
    category: "View",
    defaultBinding: { key: "'", code: "Quote", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionToggleZenMode.tsx:34-35
    id: "zenMode",
    label: "Toggle zen mode",
    category: "View",
    defaultBinding: { key: "z", code: "KeyZ", altKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionToggleObjectsSnapMode.tsx:32-33
    id: "objectsSnapMode",
    label: "Toggle snap-to-objects",
    category: "View",
    defaultBinding: { key: "s", code: "KeyS", altKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionToggleStats.tsx:26-27
    id: "stats",
    label: "Toggle stats panel",
    category: "View",
    defaultBinding: { key: "/", code: "Slash", altKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionToggleViewMode.tsx:34-35
    id: "viewMode",
    label: "Toggle view mode",
    category: "View",
    defaultBinding: { key: "r", code: "KeyR", altKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionCanvas.tsx:270-272 (also
    // accepts Shift+0 — CtrlOrCmd+0 taken as canonical, matching
    // shortcutMap.resetZoom).
    id: "resetZoom",
    label: "Reset zoom to 100%",
    category: "View",
    defaultBinding: { key: "0", code: "Digit0", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionCanvas.tsx:216-218 (also
    // accepts Shift+-).
    id: "zoomOut",
    label: "Zoom out",
    category: "View",
    defaultBinding: { key: "-", code: "Minus", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionCanvas.tsx:169-171 (also
    // accepts Shift+=).
    id: "zoomIn",
    label: "Zoom in",
    category: "View",
    defaultBinding: { key: "=", code: "Equal", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionCanvas.tsx:373-377. Note
    // the source comment there: "this action should use shift-2 per figma,
    // alas" — shift-3 is the real, verified binding regardless.
    id: "zoomToFitSelection",
    label: "Zoom to fit selection",
    category: "View",
    defaultBinding: { key: "3", code: "Digit3", shiftKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionCanvas.tsx:411-415
    id: "zoomToFit",
    label: "Zoom to fit all",
    category: "View",
    defaultBinding: { key: "1", code: "Digit1", shiftKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionCanvas.tsx:329-333
    id: "zoomToFitSelectionInViewport",
    label: "Zoom to fit selection in viewport",
    category: "View",
    defaultBinding: { key: "2", code: "Digit2", shiftKey: true },
  },
  {
    // Inline onKeyDown branch: packages/excalidraw/components/App.tsx:5451
    // (`event.key === KEYS.QUESTION_MARK`) — runs before, and shadows,
    // actionMenu.tsx's registered `actionShortcuts` (also keyed on "?").
    id: "toggleShortcuts",
    label: "Show keyboard shortcuts",
    category: "View",
    defaultBinding: { key: "?", code: "Slash", shiftKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionToggleSearchMenu.ts:57
    id: "searchMenu",
    label: "Open search",
    category: "View",
    defaultBinding: { key: "f", code: "KeyF", metaKey: true },
  },
  {
    // isCommandPaletteToggleShortcut:
    // packages/excalidraw/components/CommandPalette/CommandPalette.tsx:140-146.
    // Accepts CtrlOrCmd+/ OR CtrlOrCmd+Shift+P — CtrlOrCmd+/ taken as
    // canonical (matches shortcutMap's first-listed entry, and
    // electron/menuShortcuts.ts's existing precedent).
    id: "commandPalette",
    label: "Open command palette",
    category: "View",
    defaultBinding: { key: "/", code: "Slash", metaKey: true },
  },

  // ---------------------------------------------------------------------
  // File
  // ---------------------------------------------------------------------
  {
    // keyTest: packages/excalidraw/actions/actionExport.tsx:428
    id: "loadScene",
    label: "Open a file",
    category: "File",
    defaultBinding: { key: "o", code: "KeyO", metaKey: true },
  },
  {
    // keyTest: packages/excalidraw/actions/actionExport.tsx:375-378
    id: "saveFileToDisk",
    label: "Save as…",
    category: "File",
    defaultBinding: {
      key: "s",
      code: "KeyS",
      metaKey: true,
      shiftKey: true,
    },
  },
  {
    // keyTest: packages/excalidraw/actions/actionExport.tsx:324-325
    id: "saveToActiveFile",
    label: "Save",
    category: "File",
    defaultBinding: { key: "s", code: "KeyS", metaKey: true },
  },
  {
    // Inline onKeyDown branch: packages/excalidraw/components/App.tsx:5456-5463
    // (not a registered action's keyTest).
    id: "imageExport",
    label: "Save as image (export)",
    category: "File",
    defaultBinding: {
      key: "e",
      code: "KeyE",
      metaKey: true,
      shiftKey: true,
    },
  },
  {
    // Inline onKeyDown branch: packages/excalidraw/components/App.tsx:5763-5767
    // (`event[KEYS.CTRL_OR_CMD] && (event.key === KEYS.BACKSPACE ||
    // event.key === KEYS.DELETE)` — opens the clear-canvas confirm dialog;
    // Delete taken as canonical, Backspace also matches).
    id: "clearCanvas",
    label: "Clear canvas",
    category: "File",
    defaultBinding: { key: "Delete", code: "Delete", metaKey: true },
  },
];

/**
 * Merges persisted overrides onto the canonical registry. For each
 * definition: a present, non-null override replaces `defaultBinding`; an
 * explicit `null` override (user reset) or an absent key (never touched)
 * both resolve to the canonical default.
 */
export const getEffectiveBindings = (
  overrides: Readonly<Record<string, ShortcutBinding | null>>,
): ShortcutDefinition[] =>
  SHORTCUT_DEFINITIONS.map((definition) => {
    const override = overrides[definition.id];
    if (override == null) {
      return definition;
    }
    return { ...definition, defaultBinding: override };
  });
