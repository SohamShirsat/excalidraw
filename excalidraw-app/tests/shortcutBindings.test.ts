import { describe, expect, it } from "vitest";

import {
  getEffectiveBindings,
  SHORTCUT_DEFINITIONS,
} from "../data/shortcutBindings";

describe("data/shortcutBindings", () => {
  it("has no duplicate ids", () => {
    const ids = SHORTCUT_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe("getEffectiveBindings", () => {
    it("uses the canonical default when there are no overrides at all", () => {
      const effective = getEffectiveBindings({});
      expect(effective).toEqual(SHORTCUT_DEFINITIONS);
      // Distinct array instances (a fresh map), not the same reference.
      expect(effective).not.toBe(SHORTCUT_DEFINITIONS);
    });

    it("replaces defaultBinding with a present, non-null override", () => {
      const customBinding = {
        key: "r",
        code: "KeyR",
        ctrlKey: true,
        shiftKey: true,
      };
      const effective = getEffectiveBindings({
        "tool.rectangle": customBinding,
      });

      const rectangle = effective.find((d) => d.id === "tool.rectangle");
      expect(rectangle?.defaultBinding).toEqual(customBinding);

      // Every other definition is untouched.
      const others = effective.filter((d) => d.id !== "tool.rectangle");
      const canonicalOthers = SHORTCUT_DEFINITIONS.filter(
        (d) => d.id !== "tool.rectangle",
      );
      expect(others).toEqual(canonicalOthers);
    });

    it("resets to the canonical default on an explicit null override", () => {
      const canonical = SHORTCUT_DEFINITIONS.find(
        (d) => d.id === "toggleTheme",
      )!;

      const effective = getEffectiveBindings({ toggleTheme: null });

      const toggleTheme = effective.find((d) => d.id === "toggleTheme");
      expect(toggleTheme?.defaultBinding).toEqual(canonical.defaultBinding);
    });

    it("uses the canonical default for any id absent from the overrides map", () => {
      const canonical = SHORTCUT_DEFINITIONS.find((d) => d.id === "cut")!;

      // Overrides map has entries, just not for "cut".
      const effective = getEffectiveBindings({
        "tool.rectangle": { key: "j", code: "KeyJ" },
      });

      const cut = effective.find((d) => d.id === "cut");
      expect(cut?.defaultBinding).toEqual(canonical.defaultBinding);
    });

    it("handles a mix of present, null, and absent overrides in one call", () => {
      const customSelectAll = { key: "j", code: "KeyJ", metaKey: true };
      const canonicalGroup = SHORTCUT_DEFINITIONS.find(
        (d) => d.id === "group",
      )!;
      const canonicalCut = SHORTCUT_DEFINITIONS.find((d) => d.id === "cut")!;

      const effective = getEffectiveBindings({
        selectAll: customSelectAll,
        group: null,
        // "cut" intentionally absent.
      });

      expect(
        effective.find((d) => d.id === "selectAll")?.defaultBinding,
      ).toEqual(customSelectAll);
      expect(effective.find((d) => d.id === "group")?.defaultBinding).toEqual(
        canonicalGroup.defaultBinding,
      );
      expect(effective.find((d) => d.id === "cut")?.defaultBinding).toEqual(
        canonicalCut.defaultBinding,
      );
    });
  });
});
