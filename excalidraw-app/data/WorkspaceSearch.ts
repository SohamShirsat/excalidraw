import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { BinaryFiles, LibraryItems } from "@excalidraw/excalidraw/types";

import type { WorkspaceMetadata } from "./WorkspaceData";

export type WorkspaceSearchScene = {
  elements: readonly ExcalidrawElement[];
  files: BinaryFiles;
};

export type WorkspaceSearchGroup =
  | "workspace"
  | "canvas"
  | "assets"
  | "libraries";

export type WorkspaceSearchResultKind =
  | "folder"
  | "file"
  | "page"
  | "text"
  | "frame"
  | "element"
  | "asset"
  | "library";

export type WorkspaceSearchResult = {
  key: string;
  group: WorkspaceSearchGroup;
  kind: WorkspaceSearchResultKind;
  title: string;
  subtitle: string;
  pageId?: string;
  elementId?: string;
  libraryItemId?: string;
  score: number;
};

type SearchWorkspaceOptions = {
  workspace: WorkspaceMetadata;
  scenes: ReadonlyMap<string, WorkspaceSearchScene>;
  libraryItems: LibraryItems;
  query: string;
};

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

const getTokens = (query: string) =>
  normalizeSearchText(query).trim().split(/\s+/).filter(Boolean);

const matchesTokens = (searchText: string, tokens: string[]) => {
  const normalized = normalizeSearchText(searchText);
  return tokens.every((token) => normalized.includes(token));
};

const getScore = (
  title: string,
  searchText: string,
  tokens: string[],
  baseScore: number,
) => {
  const normalizedTitle = normalizeSearchText(title);
  const normalizedSearchText = normalizeSearchText(searchText);
  const normalizedQuery = tokens.join(" ");

  if (normalizedTitle === normalizedQuery) {
    return baseScore + 80;
  }
  if (normalizedTitle.startsWith(normalizedQuery)) {
    return baseScore + 55;
  }
  if (normalizedTitle.includes(normalizedQuery)) {
    return baseScore + 35;
  }
  if (normalizedSearchText.includes(normalizedQuery)) {
    return baseScore + 20;
  }
  return baseScore;
};

const compactText = (value: string, maxLength = 92) => {
  const compacted = value.replace(/\s+/g, " ").trim();
  return compacted.length > maxLength
    ? `${compacted.slice(0, maxLength - 1)}…`
    : compacted;
};

const stringifyCustomData = (value: unknown) => {
  if (!value) {
    return "";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
};

const getElementSearchText = (element: ExcalidrawElement) => {
  const text =
    "text" in element && typeof element.text === "string" ? element.text : "";
  const name =
    "name" in element && typeof element.name === "string" ? element.name : "";
  const link = typeof element.link === "string" ? element.link : "";

  return [
    element.type,
    text,
    name,
    link,
    stringifyCustomData(element.customData),
  ]
    .filter(Boolean)
    .join(" ");
};

const getWorkspacePath = (workspace: WorkspaceMetadata, pageId: string) => {
  const page = workspace.pages.find((item) => item.id === pageId);
  const file = workspace.files.find((item) => item.id === page?.fileId);
  const folder = workspace.folders.find((item) => item.id === file?.folderId);

  return {
    page,
    file,
    folder,
    label: [folder?.name, file?.name, page?.name].filter(Boolean).join(" / "),
  };
};

const getFirstPageIdForFile = (workspace: WorkspaceMetadata, fileId: string) =>
  workspace.pages.find((page) => page.fileId === fileId)?.id;

const getFirstPageIdForFolder = (
  workspace: WorkspaceMetadata,
  folderId: string,
) => {
  const file = workspace.files.find((item) => item.folderId === folderId);
  return file ? getFirstPageIdForFile(workspace, file.id) : undefined;
};

const getAssetName = (
  mimeType: string,
  linkedElement: ExcalidrawElement | undefined,
) => {
  const customData = linkedElement?.customData;
  if (customData && typeof customData === "object") {
    for (const key of ["fileName", "filename", "name", "title"]) {
      const value = customData[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }

  const subtype = mimeType.split("/")[1]?.toLocaleUpperCase();
  return subtype ? `${subtype} image` : "Image asset";
};

export const searchWorkspace = ({
  workspace,
  scenes,
  libraryItems,
  query,
}: SearchWorkspaceOptions): WorkspaceSearchResult[] => {
  const tokens = getTokens(query);
  if (!tokens.length) {
    return [];
  }

  const results: WorkspaceSearchResult[] = [];

  for (const folder of workspace.folders) {
    const fileCount = workspace.files.filter(
      (file) => file.folderId === folder.id,
    ).length;
    const searchText = `${folder.name} folder ${fileCount} files`;
    if (matchesTokens(searchText, tokens)) {
      results.push({
        key: `folder:${folder.id}`,
        group: "workspace",
        kind: "folder",
        title: folder.name,
        subtitle: `Folder · ${fileCount} ${fileCount === 1 ? "file" : "files"}`,
        pageId: getFirstPageIdForFolder(workspace, folder.id),
        score: getScore(folder.name, searchText, tokens, 400),
      });
    }
  }

  for (const file of workspace.files) {
    const folder = workspace.folders.find((item) => item.id === file.folderId);
    const pageCount = workspace.pages.filter(
      (page) => page.fileId === file.id,
    ).length;
    const searchText = `${file.name} file ${folder?.name || ""}`;
    if (matchesTokens(searchText, tokens)) {
      results.push({
        key: `file:${file.id}`,
        group: "workspace",
        kind: "file",
        title: file.name,
        subtitle: `${folder?.name || "Workspace"} · ${pageCount} ${
          pageCount === 1 ? "page" : "pages"
        }`,
        pageId: getFirstPageIdForFile(workspace, file.id),
        score: getScore(file.name, searchText, tokens, 380),
      });
    }
  }

  for (const page of workspace.pages) {
    const path = getWorkspacePath(workspace, page.id);
    const searchText = `${page.name} page ${path.file?.name || ""} ${
      path.folder?.name || ""
    }`;
    if (matchesTokens(searchText, tokens)) {
      results.push({
        key: `page:${page.id}`,
        group: "workspace",
        kind: "page",
        title: page.name,
        subtitle: [path.folder?.name, path.file?.name]
          .filter(Boolean)
          .join(" / "),
        pageId: page.id,
        score: getScore(page.name, searchText, tokens, 360),
      });
    }
  }

  for (const [pageId, scene] of scenes) {
    const path = getWorkspacePath(workspace, pageId);
    if (!path.page) {
      continue;
    }

    for (const element of scene.elements) {
      if (element.isDeleted) {
        continue;
      }

      const searchText = getElementSearchText(element);
      if (!matchesTokens(searchText, tokens)) {
        continue;
      }

      const isText = element.type === "text" && "text" in element;
      const isFrame =
        (element.type === "frame" || element.type === "magicframe") &&
        "name" in element;
      const title = isText
        ? compactText(String(element.text)) || "Text"
        : isFrame
        ? compactText(String(element.name || "Untitled frame"))
        : compactText(
            typeof element.link === "string" && element.link
              ? element.link
              : element.type[0].toLocaleUpperCase() + element.type.slice(1),
          );
      const kind = isText ? "text" : isFrame ? "frame" : "element";

      results.push({
        key: `element:${pageId}:${element.id}`,
        group: "canvas",
        kind,
        title,
        subtitle: `${path.label} · ${
          isText ? "Text" : isFrame ? "Frame" : element.type
        }`,
        pageId,
        elementId: element.id,
        score: getScore(title, searchText, tokens, 280),
      });
    }

    for (const file of Object.values(scene.files)) {
      const linkedElement = scene.elements.find(
        (element) =>
          !element.isDeleted &&
          "fileId" in element &&
          element.fileId === file.id,
      );
      const title = getAssetName(file.mimeType, linkedElement);
      const mimeSubtype = file.mimeType.split("/")[1] || file.mimeType;
      const searchText = [
        title,
        "asset",
        "image",
        "media",
        "upload",
        "attachment",
        file.mimeType,
        mimeSubtype,
        file.id,
        linkedElement ? stringifyCustomData(linkedElement.customData) : "",
      ].join(" ");

      if (matchesTokens(searchText, tokens)) {
        results.push({
          key: `asset:${pageId}:${file.id}`,
          group: "assets",
          kind: "asset",
          title,
          subtitle: `${path.label} · ${file.mimeType}`,
          pageId,
          elementId: linkedElement?.id,
          score: getScore(title, searchText, tokens, 220),
        });
      }
    }
  }

  for (const item of libraryItems) {
    const elementSearchText = item.elements
      .map((element) => getElementSearchText(element))
      .join(" ");
    const searchText = `${item.name || ""} library symbol component ${
      item.status
    } ${elementSearchText}`;
    if (!matchesTokens(searchText, tokens)) {
      continue;
    }

    const firstContent = item.elements
      .map((element) => {
        if (element.type === "text" && "text" in element) {
          return element.text;
        }
        if (
          (element.type === "frame" || element.type === "magicframe") &&
          "name" in element
        ) {
          return element.name;
        }
        return "";
      })
      .find(Boolean);
    const title =
      item.name?.trim() ||
      compactText(String(firstContent || "")) ||
      `Library item ${item.id.slice(0, 6)}`;

    results.push({
      key: `library:${item.id}`,
      group: "libraries",
      kind: "library",
      title,
      subtitle: `Personal library · ${item.elements.length} ${
        item.elements.length === 1 ? "element" : "elements"
      }`,
      libraryItemId: item.id,
      score: getScore(title, searchText, tokens, 180),
    });
  }

  return results.sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title),
  );
};
