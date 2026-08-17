import { describe, expect, it } from "vitest";

import { buildPagePaletteEntries } from "../data/pagePalette";
import { formatRelativeTime, orderPageIdsByRecency } from "../data/recentPages";

import type { WorkspaceMetadata } from "../data/workspaceTypes";

/**
 * The Ctrl/Cmd+T palette's ranking, which is the whole reason that surface
 * exists: "open the page I mean" has to work on the first keystroke, and it
 * has to work when every page in a file is literally called "Page 1".
 */

const now = 1_700_000_000_000;

const workspace: WorkspaceMetadata = {
  version: 1,
  name: "Local workspace",
  folders: [
    { id: "folder-hotel", name: "Hotel Mate", createdAt: 0, updatedAt: 0 },
    { id: "folder-personal", name: "Personal", createdAt: 0, updatedAt: 0 },
  ],
  files: [
    {
      id: "file-ota",
      folderId: "folder-hotel",
      name: "OTA flows",
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "file-notes",
      folderId: "folder-personal",
      name: "Notes",
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  pages: [
    {
      id: "page-1",
      fileId: "file-ota",
      name: "Page 1",
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "page-2",
      fileId: "file-ota",
      name: "Rate sheet",
      createdAt: 0,
      updatedAt: 0,
    },
    {
      id: "page-3",
      fileId: "file-notes",
      name: "Reading list",
      createdAt: 0,
      updatedAt: 0,
    },
  ],
  activePageId: "page-1",
  createdAt: 0,
  updatedAt: 0,
};

describe("buildPagePaletteEntries", () => {
  it("shows every page most-recently-opened first when nothing is typed", () => {
    const entries = buildPagePaletteEntries({
      workspace,
      recents: [
        { pageId: "page-3", openedAt: now },
        { pageId: "page-2", openedAt: now - 1000 },
      ],
      query: "",
    });

    expect(entries.map((entry) => entry.pageId)).toEqual([
      "page-3",
      "page-2",
      // Never opened on this machine, so it sorts last rather than nowhere.
      "page-1",
    ]);
  });

  it("carries the folder and file a page lives in", () => {
    const [entry] = buildPagePaletteEntries({
      workspace,
      recents: [{ pageId: "page-2", openedAt: now }],
      query: "",
    });

    expect(entry).toMatchObject({
      pageId: "page-2",
      pageName: "Rate sheet",
      fileName: "OTA flows",
      folderName: "Hotel Mate",
      openedAt: now,
    });
  });

  it("matches on the file name, so generically named pages are reachable", () => {
    const entries = buildPagePaletteEntries({
      workspace,
      recents: [],
      query: "ota",
    });

    expect(entries.map((entry) => entry.pageId)).toEqual(["page-1", "page-2"]);
    expect(entries.every((entry) => entry.matchedOn === "file")).toBe(true);
  });

  it("matches on the folder name too", () => {
    const entries = buildPagePaletteEntries({
      workspace,
      recents: [],
      query: "personal",
    });

    expect(entries.map((entry) => entry.pageId)).toEqual(["page-3"]);
    expect(entries[0].matchedOn).toBe("folder");
  });

  it("ranks a page-name hit above a file-name hit", () => {
    const entries = buildPagePaletteEntries({
      workspace,
      recents: [],
      query: "r",
    });

    // "Rate sheet"/"Reading list" start with the query; the "OTA flows" pages
    // only match via their folder/file, so they come after.
    expect(entries[0].matchedOn).toBe("page");
  });

  it("returns nothing for a workspace that hasn't loaded yet", () => {
    expect(
      buildPagePaletteEntries({ workspace: null, recents: [], query: "" }),
    ).toEqual([]);
  });
});

describe("orderPageIdsByRecency", () => {
  it("keeps never-opened pages in their original order, after the rest", () => {
    expect(
      orderPageIdsByRecency(
        ["a", "b", "c", "d"],
        [
          { pageId: "c", openedAt: 200 },
          { pageId: "a", openedAt: 100 },
        ],
      ),
    ).toEqual(["c", "a", "b", "d"]);
  });
});

describe("formatRelativeTime", () => {
  it("describes recency in the units a person would use", () => {
    expect(formatRelativeTime(now, now)).toBe("just now");
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5m ago");
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(formatRelativeTime(now - 2 * 86_400_000, now)).toBe("2d ago");
    expect(formatRelativeTime(now - 60 * 86_400_000, now)).toBe("2mo ago");
    expect(formatRelativeTime(now - 400 * 86_400_000, now)).toBe("1y ago");
  });
});
