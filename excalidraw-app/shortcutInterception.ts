/**
 * The remapping ENGINE's interception mechanism — the piece that makes a
 * remapped key combo actually trigger the right action, without touching
 * any of the ~35 hardcoded `keyTest` predicates in
 * `packages/excalidraw/actions/*.tsx`.
 *
 * Two parts, per the task spec:
 *  1. `findRemappedAction` — a pure decision function, fully unit-testable
 *     with no DOM.
 *  2. `installShortcutInterceptor` — the DOM wiring: a capture-phase
 *     `keydown` listener on `document` that runs BEFORE the core library's
 *     own bubble-phase `handleKeyboardGlobally` listener, intercepts only
 *     combos that have actually been remapped away from their default, and
 *     redirects them by synthesizing a `KeyboardEvent` carrying the
 *     action's real default binding — the same "synthetic keydown replay"
 *     trick already used for the native macOS menu (see the `useEffect`
 *     near the top of `excalidraw-app/App.tsx`'s `ExcalidrawWrapper`, and
 *     `electron/menu.ts`'s doc comment).
 */

import { isWritableElement } from "@excalidraw/common";

import { SHORTCUT_DEFINITIONS } from "./data/shortcutBindings";

import type {
  ShortcutBinding,
  ShortcutDefinition,
} from "./data/shortcutBindings";

/** A plain object shaped like the relevant `KeyboardEvent` fields. */
export type PressedCombo = ShortcutBinding;

export type ShortcutMatch = {
  actionId: string;
  /** The action's real DEFAULT binding — the payload to synthesize. */
  binding: ShortcutBinding;
};

const isModifierSet = (value: boolean | undefined): boolean => !!value;

const bindingsEqual = (a: ShortcutBinding, b: ShortcutBinding): boolean =>
  a.key === b.key &&
  a.code === b.code &&
  isModifierSet(a.metaKey) === isModifierSet(b.metaKey) &&
  isModifierSet(a.ctrlKey) === isModifierSet(b.ctrlKey) &&
  isModifierSet(a.shiftKey) === isModifierSet(b.shiftKey) &&
  isModifierSet(a.altKey) === isModifierSet(b.altKey);

/**
 * Pure decision function: given the current effective bindings (as returned
 * by `getEffectiveBindings`, i.e. canonical defaults with any persisted
 * overrides already merged in) and the pressed combo, determines whether
 * the pressed combo matches some action's CUSTOM (non-default) binding.
 *
 * Only combos that differ from an action's own canonical default are worth
 * intercepting — if a user hasn't remapped anything, or presses a key that
 * happens to equal some action's unmodified default, there's nothing to
 * redirect (the app's normal `keyTest`-based dispatch already handles that
 * correctly on its own). Returns `null` when there's no match.
 */
export const findRemappedAction = (
  effectiveBindings: readonly ShortcutDefinition[],
  pressed: PressedCombo,
): ShortcutMatch | null => {
  for (const effective of effectiveBindings) {
    const canonical = SHORTCUT_DEFINITIONS.find(
      (definition) => definition.id === effective.id,
    );
    if (!canonical) {
      continue;
    }

    if (bindingsEqual(effective.defaultBinding, canonical.defaultBinding)) {
      // Not remapped for this action — nothing to intercept.
      continue;
    }

    if (bindingsEqual(pressed, effective.defaultBinding)) {
      return { actionId: effective.id, binding: canonical.defaultBinding };
    }
  }
  return null;
};

/**
 * Marks a synthesized keydown so the capture-phase handler recognizes and
 * ignores it when it loops back through the same listener (loop guard).
 */
interface SyntheticShortcutKeyboardEvent extends KeyboardEvent {
  __isSyntheticShortcutRedispatch?: true;
}

/**
 * Installs the capture-phase interceptor on `document`. Returns an
 * unsubscribe function for effect cleanup, matching the convention already
 * used by `window.electronApp.onMenuSyntheticKeydown`/`onMenuAction` in
 * `electron/preload.ts`.
 *
 * `getEffectiveBindings` is a callback (not a snapshot) so the caller can
 * install this once and keep it reading the LATEST bindings via a ref,
 * without tearing down/reinstalling the DOM listener every time bindings
 * change (see the wiring in `excalidraw-app/App.tsx`).
 */
export const installShortcutInterceptor = (
  getEffectiveBindings: () => readonly ShortcutDefinition[],
): (() => void) => {
  const handler = (event: KeyboardEvent) => {
    // 1. Ignore events this interceptor dispatched itself (loop guard).
    if (
      (event as SyntheticShortcutKeyboardEvent).__isSyntheticShortcutRedispatch
    ) {
      return;
    }

    // 2. Skip interception when focus is on a text-input-like element —
    // reuses the existing `isWritableElement` utility
    // (packages/common/src/utils.ts) rather than reinventing it.
    if (isWritableElement(document.activeElement)) {
      return;
    }

    // 3. Run the pure decision function.
    const pressed: PressedCombo = {
      key: event.key,
      code: event.code,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
    };
    const match = findRemappedAction(getEffectiveBindings(), pressed);

    // 4. No match: do nothing, let the real event proceed untouched so
    // normal dispatch (including every *default*, non-remapped shortcut)
    // works exactly as it does today.
    if (!match) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const synthetic = new KeyboardEvent("keydown", {
      ...match.binding,
      bubbles: true,
      cancelable: true,
    }) as SyntheticShortcutKeyboardEvent;
    synthetic.__isSyntheticShortcutRedispatch = true;
    document.dispatchEvent(synthetic);
  };

  document.addEventListener("keydown", handler, { capture: true });
  return () =>
    document.removeEventListener("keydown", handler, { capture: true });
};
