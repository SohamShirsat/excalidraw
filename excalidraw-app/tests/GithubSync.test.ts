import { mkdtemp, rm, writeFile } from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import git from "isomorphic-git";
import { afterEach, describe, expect, it } from "vitest";

import {
  countWorkingTreeChanges,
  createGithubSyncEngine,
  describeSyncSummary,
  millisecondsUntilNextSync,
  parseGithubRepository,
  scheduleIntervalMs,
} from "../../electron/githubSync";
import { createSettingsGithubSyncStore } from "../../electron/settingsStore";

import type { GithubSyncPersistedState } from "../../electron/githubSync";

/**
 * Covers the parts of `electron/githubSync.ts` that don't need the network:
 * remote parsing, schedule maths, summary copy, and the local git plumbing
 * (staging/commit/change counting) run against a real repository in a temp
 * directory. Anything that would push to GitHub is deliberately left out —
 * those paths are verified by hand against a real repository.
 */

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (prefix: string) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("parseGithubRepository", () => {
  it.each([
    "SohamShirsat/drawings",
    "https://github.com/SohamShirsat/drawings",
    "https://github.com/SohamShirsat/drawings.git",
    "http://github.com/SohamShirsat/drawings/",
    "git@github.com:SohamShirsat/drawings.git",
  ])("normalizes %s to an https clone URL", (input) => {
    expect(parseGithubRepository(input)).toEqual({
      owner: "SohamShirsat",
      repo: "drawings",
      remoteUrl: "https://github.com/SohamShirsat/drawings.git",
    });
  });

  it("rejects input that isn't a GitHub repository", () => {
    expect(() => parseGithubRepository("")).toThrow(/Enter a GitHub/);
    expect(() => parseGithubRepository("https://gitlab.com/a/b")).toThrow(
      /not a GitHub repository/,
    );
  });
});

describe("sync scheduling", () => {
  it("has no interval for the manual schedule", () => {
    expect(scheduleIntervalMs("manual")).toBeNull();
    expect(millisecondsUntilNextSync("manual", null, 0)).toBeNull();
  });

  it("treats a never-synced repository as due immediately", () => {
    expect(millisecondsUntilNextSync("daily", null, 1_000)).toBe(0);
  });

  it("counts down from the last sync, never below zero", () => {
    const hour = 60 * 60 * 1000;
    expect(millisecondsUntilNextSync("hourly", 1_000, 1_000)).toBe(hour);
    expect(millisecondsUntilNextSync("hourly", 1_000, 1_000 + hour / 2)).toBe(
      hour / 2,
    );
    expect(millisecondsUntilNextSync("hourly", 1_000, 1_000 + hour * 10)).toBe(
      0,
    );
  });
});

describe("describeSyncSummary", () => {
  it("reports nothing to do", () => {
    expect(
      describeSyncSummary({ committedFiles: 0, pulled: false, pushed: false }),
    ).toBe("Already up to date.");
  });

  it("describes what actually happened, in order", () => {
    expect(
      describeSyncSummary({ committedFiles: 3, pulled: true, pushed: true }),
    ).toBe("Saved 3 changes, pulled updates from GitHub, pushed to GitHub.");
  });

  it("singularizes a one-file commit", () => {
    expect(
      describeSyncSummary({ committedFiles: 1, pulled: false, pushed: true }),
    ).toBe("Saved 1 change, pushed to GitHub.");
  });
});

describe("countWorkingTreeChanges", () => {
  it("counts new, modified and deleted files against the last commit", async () => {
    const dir = await createTemporaryDirectory("personal-excalidraw-git-");
    await git.init({ fs, dir, defaultBranch: "main" });

    await writeFile(path.join(dir, "workspace.json"), "{}", "utf8");
    expect(await countWorkingTreeChanges(dir)).toBe(1);

    await git.add({ fs, dir, filepath: "workspace.json" });
    await git.commit({
      fs,
      dir,
      message: "initial",
      author: { name: "Test", email: "test@example.com" },
    });
    expect(await countWorkingTreeChanges(dir)).toBe(0);

    await writeFile(path.join(dir, "workspace.json"), '{"a":1}', "utf8");
    await writeFile(path.join(dir, "page.excalidraw"), "{}", "utf8");
    expect(await countWorkingTreeChanges(dir)).toBe(2);
  });
});

describe("createGithubSyncEngine", () => {
  const createStore = () => {
    let state: GithubSyncPersistedState = {
      config: null,
      lastSyncAt: null,
      lastSyncSummary: null,
    };
    let token: string | null = null;

    return {
      read: async () => state,
      write: async (next: GithubSyncPersistedState) => {
        state = next;
      },
      readToken: async () => token,
      writeToken: async (next: string | null) => {
        token = next;
      },
    };
  };

  it("reports a disconnected status before any repository is connected", async () => {
    const dir = await createTemporaryDirectory("personal-excalidraw-engine-");
    const engine = createGithubSyncEngine({
      getWorkspaceDir: () => dir,
      store: createStore(),
    });

    const status = await engine.getStatus();
    expect(status).toMatchObject({
      isSupported: true,
      state: "disconnected",
      config: null,
      hasToken: false,
      pendingChanges: 0,
    });
  });

  it("refuses to sync without a connected repository", async () => {
    const dir = await createTemporaryDirectory("personal-excalidraw-engine-");
    const engine = createGithubSyncEngine({
      getWorkspaceDir: () => dir,
      store: createStore(),
    });

    await expect(engine.sync()).rejects.toThrow(/Connect a GitHub repository/);
  });

  it("refuses to change preferences without a connected repository", async () => {
    const dir = await createTemporaryDirectory("personal-excalidraw-engine-");
    const engine = createGithubSyncEngine({
      getWorkspaceDir: () => dir,
      store: createStore(),
    });

    await expect(
      engine.updatePreferences({ schedule: "daily" }),
    ).rejects.toThrow(/Connect a GitHub repository/);
  });
});

describe("createSettingsGithubSyncStore", () => {
  it("round-trips sync state and never stores the token in plain text", async () => {
    const directory = await createTemporaryDirectory(
      "personal-excalidraw-settings-",
    );
    const settingsPath = path.join(directory, "settings.json");
    // Stands in for Electron's `safeStorage`, whose real implementation is
    // only available inside a running Electron app.
    const store = createSettingsGithubSyncStore({
      settingsPath,
      encryptToken: (token) => Buffer.from(token).toString("base64"),
      decryptToken: (encrypted) =>
        Buffer.from(encrypted, "base64").toString("utf8"),
    });

    expect(await store.read()).toEqual({
      config: null,
      lastSyncAt: null,
      lastSyncSummary: null,
    });
    expect(await store.readToken()).toBeNull();

    await store.write({
      config: {
        remoteUrl: "https://github.com/o/r.git",
        owner: "o",
        repo: "r",
        branch: "main",
        authorName: "Test",
        authorEmail: "test@example.com",
        schedule: "daily",
        syncOnStart: true,
      },
      lastSyncAt: 42,
      lastSyncSummary: "Pushed to GitHub.",
    });
    await store.writeToken("github_pat_secret");

    expect((await store.read()).config?.repo).toBe("r");
    expect(await store.readToken()).toBe("github_pat_secret");

    const rawSettings = await fs.promises.readFile(settingsPath, "utf8");
    expect(rawSettings).not.toContain("github_pat_secret");

    await store.writeToken(null);
    expect(await store.readToken()).toBeNull();
  });
});
