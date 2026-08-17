/**
 * Ranking for the page palette (Ctrl/Cmd+T) — the "open a page" surface.
 *
 * Kept as a pure function, separate from the component, for the same reason
 * `WorkspaceSearch.ts` is: the interesting part is the ordering, and that
 * should be testable without rendering anything.
 *
 * A page matches on its own name, its file's name, or its folder's name, so
 * typing "hotel" finds every page inside a "Hotel Mate" file even when the
 * pages themselves are called "Page 1", "Page 2"… — which is exactly how
 * this workspace's pages are usually named.
 */

import { orderPageIdsByRecency, type RecentPageEntry } from "./recentPages";

import type { WorkspaceMetadata } from "./workspaceTypes";

export type PagePaletteEntry = {
  pageId: string;
  pageName: string;
  fileName: string;
  folderName: string;
  /** `null` for a page this machine has never opened. */
  openedAt: number | null;
  /** Which field the query hit — drives the subtitle's emphasis. */
  matchedOn: "page" | "file" | "folder" | null;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase();

const matchScore = (haystack: string, needle: string): number => {
  const target = normalize(haystack);
  if (!target) {
    return -1;
  }
  if (target === needle) {
    return 0;
  }
  if (target.startsWith(needle)) {
    return 1;
  }
  const index = target.indexOf(needle);
  return index < 0 ? -1 : 2;
};

export const buildPagePaletteEntries = ({
  workspace,
  recents,
  query,
}: {
  workspace: WorkspaceMetadata | null;
  recents: readonly RecentPageEntry[];
  query: string;
}): PagePaletteEntry[] => {
  if (!workspace) {
    return [];
  }

  const filesById = new Map(workspace.files.map((file) => [file.id, file]));
  const foldersById = new Map(
    workspace.folders.map((folder) => [folder.id, folder]),
  );
  const openedAtById = new Map(
    recents.map((entry) => [entry.pageId, entry.openedAt]),
  );

  const recencyOrder = orderPageIdsByRecency(
    workspace.pages.map((page) => page.id),
    recents,
  );
  const recencyRank = new Map(
    recencyOrder.map((pageId, index) => [pageId, index]),
  );

  const needle = normalize(query);

  const entries = workspace.pages.map((page) => {
    const file = filesById.get(page.fileId);
    const folder = file ? foldersById.get(file.folderId) : undefined;

    return {
      pageId: page.id,
      pageName: page.name,
      fileName: file?.name ?? "",
      folderName: folder?.name ?? "",
      openedAt: openedAtById.get(page.id) ?? null,
    };
  });

  if (!needle) {
    return entries
      .sort(
        (a, b) =>
          (recencyRank.get(a.pageId) ?? 0) - (recencyRank.get(b.pageId) ?? 0),
      )
      .map((entry) => ({ ...entry, matchedOn: null }));
  }

  const scored: (PagePaletteEntry & { score: number })[] = [];

  for (const entry of entries) {
    const pageScore = matchScore(entry.pageName, needle);
    const fileScore = matchScore(entry.fileName, needle);
    const folderScore = matchScore(entry.folderName, needle);

    // A page-name hit always outranks a file-name hit, which outranks a
    // folder-name hit, regardless of how tight each individual match is —
    // the thing the user named is the thing they meant.
    const [score, matchedOn]: [number, PagePaletteEntry["matchedOn"]] =
      pageScore >= 0
        ? [pageScore, "page"]
        : fileScore >= 0
        ? [10 + fileScore, "file"]
        : folderScore >= 0
        ? [20 + folderScore, "folder"]
        : [-1, null];

    if (score >= 0) {
      scored.push({ ...entry, matchedOn, score });
    }
  }

  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        (recencyRank.get(a.pageId) ?? 0) - (recencyRank.get(b.pageId) ?? 0),
    )
    .map(({ score, ...entry }) => entry);
};
