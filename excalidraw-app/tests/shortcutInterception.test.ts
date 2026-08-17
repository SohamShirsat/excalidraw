import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getEffectiveBindings,
  SHORTCUT_DEFINITIONS,
} from "../data/shortcutBindings";
import {
  findRemappedAction,
  installShortcutInterceptor,
} from "../shortcutInterception";

import type { ShortcutDefinition } from "../data/shortcutBindings";

/**
 * Exercises `excalidraw-app/shortcutInterception.ts` — both the pure
 * decision function (`findRemappedAction`) and the real DOM wiring
 * (`installShortcutInterceptor`), the latter against the actual jsdom
 * `document` this repo's `vitest.config.mts` already provides
 * (`environment: "jsdom"`).
 */

describe("shortcutInterception", () => {
  describe("findRemappedAction (pure)", () => {
    it("returns null when nothing has been remapped", () => {
      const effective = getEffectiveBindings({});
      const pressed = { key: "r", code: "KeyR" };
      expect(findRemappedAction(effective, pressed)).toBeNull();
    });

    it("matches a remapped combo and returns the action's real default binding", () => {
      const canonicalRectangle = SHORTCUT_DEFINITIONS.find(
        (d) => d.id === "tool.rectangle",
      )!;
      const customBinding = { key: "j", code: "KeyJ", ctrlKey: true };
      const effective = getEffectiveBindings({
        "tool.rectangle": customBinding,
      });

      const match = findRemappedAction(effective, customBinding);

      expect(match).toEqual({
        actionId: "tool.rectangle",
        binding: canonicalRectangle.defaultBinding,
      });
    });

    it("ignores a combo that equals an action's current (unmodified) default", () => {
      // Nothing overridden — pressing the default combo should not be
      // reported as a "remap match" (the app's own dispatch already
      // handles this correctly without any interception).
      const effective = getEffectiveBindings({});
      const rectangleDefault = SHORTCUT_DEFINITIONS.find(
        (d) => d.id === "tool.rectangle",
      )!.defaultBinding;

      expect(findRemappedAction(effective, rectangleDefault)).toBeNull();
    });

    it("ignores a completely unrelated combo", () => {
      const customBinding = { key: "j", code: "KeyJ", ctrlKey: true };
      const effective = getEffectiveBindings({
        "tool.rectangle": customBinding,
      });

      expect(
        findRemappedAction(effective, {
          key: "z",
          code: "KeyZ",
          altKey: true,
        }),
      ).toBeNull();
    });

    it("distinguishes combos by every modifier, not just key/code", () => {
      const customBinding = {
        key: "j",
        code: "KeyJ",
        ctrlKey: true,
        shiftKey: true,
      };
      const effective = getEffectiveBindings({
        "tool.rectangle": customBinding,
      });

      // Same key + code, but missing shiftKey — must not match.
      expect(
        findRemappedAction(effective, {
          key: "j",
          code: "KeyJ",
          ctrlKey: true,
        }),
      ).toBeNull();

      // Same key + code + ctrlKey + shiftKey, extra altKey — must not match
      // (exact modifier-set equality, not "at least these modifiers").
      expect(
        findRemappedAction(effective, {
          key: "j",
          code: "KeyJ",
          ctrlKey: true,
          shiftKey: true,
          altKey: true,
        }),
      ).toBeNull();

      // Exact match — must match.
      expect(findRemappedAction(effective, customBinding)).not.toBeNull();
    });

    it("only reports a match for the specific action that was remapped, among several definitions", () => {
      const rectangleOverride = { key: "j", code: "KeyJ" };
      const effective = getEffectiveBindings({
        "tool.rectangle": rectangleOverride,
      });

      // Pressing some other action's untouched default must not match.
      const cutDefault = SHORTCUT_DEFINITIONS.find(
        (d) => d.id === "cut",
      )!.defaultBinding;
      expect(findRemappedAction(effective, cutDefault)).toBeNull();
    });
  });

  describe("installShortcutInterceptor (jsdom integration)", () => {
    let uninstall: (() => void) | null = null;

    afterEach(() => {
      uninstall?.();
      uninstall = null;
    });

    const rectangleOverride = {
      key: "j",
      code: "KeyJ",
      ctrlKey: true,
    };

    const getFixedEffectiveBindings = (): ShortcutDefinition[] =>
      getEffectiveBindings({ "tool.rectangle": rectangleOverride });

    it("redirects a remapped combo: synthesizes the default binding, prevents default on the original event", () => {
      const spy = vi.fn();
      // Registered BEFORE installing the interceptor, with the SAME
      // `capture: true` flag the interceptor itself uses. Since the event
      // is dispatched directly on `document` (the target itself, no
      // ancestor chain), same-target listeners with the same capture flag
      // fire strictly in registration order — so this spy is guaranteed to
      // observe the original event before the interceptor's own handler
      // runs (and, on the nested synthetic dispatch, before the
      // interceptor's loop-guard short-circuit too).
      document.addEventListener("keydown", spy, { capture: true });

      uninstall = installShortcutInterceptor(getFixedEffectiveBindings);

      const originalEvent = new KeyboardEvent("keydown", {
        key: "j",
        code: "KeyJ",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(originalEvent);

      // The pressed (remapped) combo should have been prevented.
      expect(originalEvent.defaultPrevented).toBe(true);

      // A second keydown carrying the action's real DEFAULT binding
      // ("r"/"KeyR", no modifiers) should have been synthesized and
      // observed by the spy.
      const rectangleDefault = SHORTCUT_DEFINITIONS.find(
        (d) => d.id === "tool.rectangle",
      )!.defaultBinding;

      const seenEvents = spy.mock.calls.map((call) => call[0] as KeyboardEvent);
      expect(seenEvents).toHaveLength(2);
      expect(seenEvents[0]).toBe(originalEvent);

      const synthesized = seenEvents[1];
      expect(synthesized.key).toBe(rectangleDefault.key);
      expect(synthesized.code).toBe(rectangleDefault.code);
      expect(!!synthesized.ctrlKey).toBe(!!rectangleDefault.ctrlKey);
      expect(!!synthesized.metaKey).toBe(!!rectangleDefault.metaKey);
      expect(!!synthesized.shiftKey).toBe(!!rectangleDefault.shiftKey);
      expect(!!synthesized.altKey).toBe(!!rectangleDefault.altKey);
    });

    it("does not intercept an unrelated, unmapped combo — defaultPrevented stays false, nothing extra fires", () => {
      const spy = vi.fn();
      document.addEventListener("keydown", spy, { capture: true });

      uninstall = installShortcutInterceptor(getFixedEffectiveBindings);

      const unrelatedEvent = new KeyboardEvent("keydown", {
        key: "z",
        code: "KeyZ",
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(unrelatedEvent);

      expect(unrelatedEvent.defaultPrevented).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy.mock.calls[0][0]).toBe(unrelatedEvent);
    });

    it("loop guard: the synthesized redispatch is not itself re-intercepted (no infinite loop, no duplicate synthetic events)", () => {
      const spy = vi.fn();
      document.addEventListener("keydown", spy, { capture: true });

      uninstall = installShortcutInterceptor(getFixedEffectiveBindings);

      const originalEvent = new KeyboardEvent("keydown", {
        key: "j",
        code: "KeyJ",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(originalEvent);

      // Exactly two keydown events total: the original + one synthetic
      // redispatch. If the loop guard failed, the synthetic event's
      // binding ("r"/"KeyR", no modifiers) doesn't itself match any
      // remapped action here, so even without the guard this particular
      // case wouldn't infinite-loop — but it WOULD still show up as a
      // third "no-op interceptor pass"; the real assertion is that the
      // synthetic event carries the marker and the handler returns early
      // for it without evaluating findRemappedAction again.
      expect(spy).toHaveBeenCalledTimes(2);

      const synthesized = spy.mock.calls[1][0] as KeyboardEvent & {
        __isSyntheticShortcutRedispatch?: true;
      };
      expect(synthesized.__isSyntheticShortcutRedispatch).toBe(true);
      // The synthetic event itself must not have been prevented by the
      // interceptor (it was ignored, not reprocessed).
      expect(synthesized.defaultPrevented).toBe(false);
    });

    it("skips interception entirely when focus is on a writable/text-input element", () => {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      input.focus();
      expect(document.activeElement).toBe(input);

      const spy = vi.fn();
      document.addEventListener("keydown", spy);

      uninstall = installShortcutInterceptor(getFixedEffectiveBindings);

      const event = new KeyboardEvent("keydown", {
        key: "j",
        code: "KeyJ",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);

      document.body.removeChild(input);
    });

    it("returns an unsubscribe function that removes the capture-phase listener", () => {
      const spy = vi.fn();
      document.addEventListener("keydown", spy);

      const unsubscribe = installShortcutInterceptor(getFixedEffectiveBindings);
      unsubscribe();

      const event = new KeyboardEvent("keydown", {
        key: "j",
        code: "KeyJ",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      // With the interceptor uninstalled, the remapped combo is no longer
      // redirected: only the original event fires, untouched.
      expect(event.defaultPrevented).toBe(false);
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
