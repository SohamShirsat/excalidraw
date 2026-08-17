import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getSettingsFilePath,
  readShortcutOverrides,
  writeShortcutOverrides,
} from "../../electron/settingsStore";

/**
 * Exercises `electron/settingsStore.ts` the same way
 * `excalidraw-app/tests/ElectronIpcHandlers.test.ts` exercises
 * `electron/ipcHandlers.ts`: plain, path-parameterized functions with no
 * real Electron runtime involved, run against a temp directory — never
 * `personal-workspace/`.
 */

const temporaryDirectories: string[] = [];

const createTemporarySettingsPath = async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "personal-excalidraw-settings-"),
  );
  temporaryDirectories.push(directory);
  return getSettingsFilePath(directory);
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("electron/settingsStore", () => {
  it("reads back {} when settings.json doesn't exist yet", async () => {
    const settingsPath = await createTemporarySettingsPath();
    expect(await readShortcutOverrides(settingsPath)).toEqual({});
  });

  it("round-trips a shortcut overrides map", async () => {
    const settingsPath = await createTemporarySettingsPath();
    const overrides = {
      "tool.rectangle": { key: "j", code: "KeyJ", ctrlKey: true },
      cut: { key: "x", code: "KeyX", metaKey: true, shiftKey: true },
    };

    await writeShortcutOverrides(settingsPath, overrides);

    expect(await readShortcutOverrides(settingsPath)).toEqual(overrides);
  });

  it("distinguishes an explicit null override (reset) from an absent id", async () => {
    const settingsPath = await createTemporarySettingsPath();

    await writeShortcutOverrides(settingsPath, {
      toggleTheme: null,
      // "cut" intentionally absent — never touched.
    });

    const read = await readShortcutOverrides(settingsPath);
    expect(read).toHaveProperty("toggleTheme", null);
    expect(read).not.toHaveProperty("cut");
  });

  it("overwrites the overrides map wholesale on a second write, but preserves other top-level settings.json keys", async () => {
    const settingsPath = await createTemporarySettingsPath();

    await writeShortcutOverrides(settingsPath, {
      "tool.rectangle": { key: "j", code: "KeyJ" },
    });

    // Simulate some other, unrelated top-level settings.json key already
    // being present (a future setting this task doesn't own).
    const raw = JSON.parse(await readFile(settingsPath, "utf8"));
    raw.someOtherFutureSetting = "keep-me";
    const { writeFile } = await import("node:fs/promises");
    await writeFile(settingsPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

    await writeShortcutOverrides(settingsPath, {
      "tool.rectangle": { key: "k", code: "KeyK" },
    });

    expect(await readShortcutOverrides(settingsPath)).toEqual({
      "tool.rectangle": { key: "k", code: "KeyK" },
    });
    const finalRaw = JSON.parse(await readFile(settingsPath, "utf8"));
    expect(finalRaw.someOtherFutureSetting).toBe("keep-me");
  });

  it("treats a corrupt settings.json as empty overrides rather than throwing", async () => {
    const settingsPath = await createTemporarySettingsPath();
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, "{ not valid json", "utf8");

    await expect(readShortcutOverrides(settingsPath)).resolves.toEqual({});
  });

  it("getSettingsFilePath joins the userData path with settings.json", () => {
    expect(getSettingsFilePath("/tmp/example-userdata")).toBe(
      path.join("/tmp/example-userdata", "settings.json"),
    );
  });
});
