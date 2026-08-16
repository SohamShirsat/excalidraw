import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

import type {
  WorkspaceFile,
  WorkspaceFolder,
  WorkspaceMetadata,
  WorkspacePage,
} from "../data/WorkspaceData";

const API_ROOT = "/api/personal-workspace";
const MAX_REQUEST_BYTES = 128 * 1024 * 1024;
const WORKSPACE_FILE = "workspace.json";
const LIBRARY_FILE = "library.excalidrawlib";
const FOLDERS_DIRECTORY = "folders";

const isNodeError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && "code" in error;

const pathExists = async (target: string) => {
  try {
    await access(target);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const writeFileAtomically = async (target: string, contents: string) => {
  await mkdir(path.dirname(target), { recursive: true });
  const fingerprint = createHash("sha1")
    .update(`${process.pid}:${Date.now()}:${target}`)
    .digest("hex")
    .slice(0, 12);
  const temporaryFile = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${fingerprint}.tmp`,
  );

  await writeFile(temporaryFile, contents, "utf8");
  await rename(temporaryFile, target);
};

const writeJSONAtomically = (target: string, value: unknown) =>
  writeFileAtomically(target, `${JSON.stringify(value, null, 2)}\n`);

const sanitizeId = (id: string) => {
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  if (!sanitized) {
    throw new Error("Workspace item has an invalid identifier.");
  }
  return sanitized;
};

export const sanitizeWorkspacePathSegment = (
  name: string,
  fallback: string,
) => {
  const printableName = Array.from(name, (character) =>
    character.charCodeAt(0) < 32 ? " " : character,
  ).join("");
  const sanitized = printableName
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 80);
  const candidate = sanitized || fallback;

  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(candidate)
    ? `_${candidate}`
    : candidate;
};

const entryName = (name: string, id: string, fallback: string) =>
  `${sanitizeWorkspacePathSegment(name, fallback)}--${sanitizeId(id)}`;

const isWorkspaceMetadata = (value: unknown): value is WorkspaceMetadata => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const workspace = value as Partial<WorkspaceMetadata>;
  if (
    workspace.version !== 1 ||
    typeof workspace.name !== "string" ||
    !Array.isArray(workspace.folders) ||
    !Array.isArray(workspace.files) ||
    !Array.isArray(workspace.pages) ||
    typeof workspace.activePageId !== "string"
  ) {
    return false;
  }

  const folderIds = new Set<string>();
  for (const folder of workspace.folders) {
    if (
      !folder ||
      typeof folder.id !== "string" ||
      typeof folder.name !== "string" ||
      folderIds.has(folder.id)
    ) {
      return false;
    }
    folderIds.add(folder.id);
  }

  const fileIds = new Set<string>();
  for (const file of workspace.files) {
    if (
      !file ||
      typeof file.id !== "string" ||
      typeof file.folderId !== "string" ||
      typeof file.name !== "string" ||
      !folderIds.has(file.folderId) ||
      fileIds.has(file.id)
    ) {
      return false;
    }
    fileIds.add(file.id);
  }

  const pageIds = new Set<string>();
  for (const page of workspace.pages) {
    if (
      !page ||
      typeof page.id !== "string" ||
      typeof page.fileId !== "string" ||
      typeof page.name !== "string" ||
      !fileIds.has(page.fileId) ||
      pageIds.has(page.id)
    ) {
      return false;
    }
    pageIds.add(page.id);
  }

  return pageIds.has(workspace.activePageId);
};

const readWorkspaceFile = async (
  workspaceRoot: string,
): Promise<WorkspaceMetadata | null> => {
  try {
    const contents = await readFile(
      path.join(workspaceRoot, WORKSPACE_FILE),
      "utf8",
    );
    const workspace: unknown = JSON.parse(contents);
    if (!isWorkspaceMetadata(workspace)) {
      throw new Error(
        "personal-workspace/workspace.json is not a valid workspace file.",
      );
    }
    return workspace;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

type RepositoryLibraryFile = {
  type: "excalidrawlib";
  version: 2;
  source: "Personal Excalidraw";
  libraryItems: unknown[];
};

const isLibraryData = (
  value: unknown,
): value is Pick<RepositoryLibraryFile, "libraryItems"> =>
  !!value &&
  typeof value === "object" &&
  Array.isArray((value as { libraryItems?: unknown }).libraryItems);

export const getPersonalLibraryPath = (workspaceRoot: string) =>
  path.join(workspaceRoot, LIBRARY_FILE);

const getFolder = (workspace: WorkspaceMetadata, folderId: string) => {
  const folder = workspace.folders.find((item) => item.id === folderId);
  if (!folder) {
    throw new Error("Workspace file references a missing folder.");
  }
  return folder;
};

const getFile = (workspace: WorkspaceMetadata, fileId: string) => {
  const file = workspace.files.find((item) => item.id === fileId);
  if (!file) {
    throw new Error("Workspace page references a missing file.");
  }
  return file;
};

const getPage = (workspace: WorkspaceMetadata, pageId: string) => {
  const page = workspace.pages.find((item) => item.id === pageId);
  if (!page) {
    throw new Error("The requested page is not part of this workspace.");
  }
  return page;
};

const folderPath = (workspaceRoot: string, folder: WorkspaceFolder) =>
  path.join(
    workspaceRoot,
    FOLDERS_DIRECTORY,
    entryName(folder.name, folder.id, "Folder"),
  );

const filePath = (
  workspaceRoot: string,
  folder: WorkspaceFolder,
  file: WorkspaceFile,
) =>
  path.join(
    folderPath(workspaceRoot, folder),
    "files",
    entryName(file.name, file.id, "File"),
  );

export const getWorkspacePagePath = (
  workspaceRoot: string,
  workspace: WorkspaceMetadata,
  page: WorkspacePage,
) => {
  const file = getFile(workspace, page.fileId);
  const folder = getFolder(workspace, file.folderId);

  return path.join(
    filePath(workspaceRoot, folder, file),
    "pages",
    `${entryName(page.name, page.id, "Page")}.excalidraw`,
  );
};

const findPageScene = async (
  workspaceRoot: string,
  pageId: string,
): Promise<string | null> => {
  const foldersRoot = path.join(workspaceRoot, FOLDERS_DIRECTORY);
  const suffix = `--${sanitizeId(pageId)}.excalidraw`;

  if (!(await pathExists(foldersRoot))) {
    return null;
  }

  const pending = [foldersRoot];
  while (pending.length) {
    const directory = pending.pop()!;
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(target);
      } else if (entry.isFile() && entry.name.endsWith(suffix)) {
        return target;
      }
    }
  }

  return null;
};

const removeGeneratedSidecarsAndEmptyDirectories = async (
  workspaceRoot: string,
) => {
  const foldersRoot = path.join(workspaceRoot, FOLDERS_DIRECTORY);
  if (!(await pathExists(foldersRoot))) {
    return;
  }

  const cleanDirectory = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await cleanDirectory(target);
      } else if (
        entry.isFile() &&
        (entry.name === "folder.json" || entry.name === "file.json")
      ) {
        await rm(target);
      }
    }

    if (directory !== foldersRoot) {
      try {
        await rmdir(directory);
      } catch (error) {
        if (
          !isNodeError(error) ||
          (error.code !== "ENOTEMPTY" && error.code !== "ENOENT")
        ) {
          throw error;
        }
      }
    }
  };

  await cleanDirectory(foldersRoot);
};

const writeLayoutSidecars = async (
  workspaceRoot: string,
  workspace: WorkspaceMetadata,
) => {
  await mkdir(path.join(workspaceRoot, FOLDERS_DIRECTORY), {
    recursive: true,
  });

  for (const folder of workspace.folders) {
    const targetFolder = folderPath(workspaceRoot, folder);
    await mkdir(targetFolder, { recursive: true });
    await writeJSONAtomically(path.join(targetFolder, "folder.json"), folder);
  }

  for (const file of workspace.files) {
    const folder = getFolder(workspace, file.folderId);
    const targetFile = filePath(workspaceRoot, folder, file);
    await mkdir(path.join(targetFile, "pages"), { recursive: true });
    await writeJSONAtomically(path.join(targetFile, "file.json"), file);
  }
};

export class PersonalWorkspaceStore {
  constructor(private readonly workspaceRoot: string) {}

  async readStatus() {
    const workspace = await readWorkspaceFile(this.workspaceRoot);
    if (!workspace) {
      return {
        workspace: null,
        missingPageIds: [] as string[],
        directory: "personal-workspace",
      };
    }

    const missingPageIds: string[] = [];
    for (const page of workspace.pages) {
      const expectedPath = getWorkspacePagePath(
        this.workspaceRoot,
        workspace,
        page,
      );
      if (
        !(await pathExists(expectedPath)) &&
        !(await findPageScene(this.workspaceRoot, page.id))
      ) {
        missingPageIds.push(page.id);
      }
    }

    return {
      workspace,
      missingPageIds,
      directory: "personal-workspace",
    };
  }

  async readLibrary() {
    try {
      const contents = await readFile(
        getPersonalLibraryPath(this.workspaceRoot),
        "utf8",
      );
      const libraryFile: unknown = JSON.parse(contents);
      if (
        !libraryFile ||
        typeof libraryFile !== "object" ||
        (libraryFile as Partial<RepositoryLibraryFile>).type !==
          "excalidrawlib" ||
        (libraryFile as Partial<RepositoryLibraryFile>).version !== 2 ||
        !isLibraryData(libraryFile)
      ) {
        throw new Error(
          "personal-workspace/library.excalidrawlib is not a valid library file.",
        );
      }

      return {
        library: { libraryItems: libraryFile.libraryItems },
        directory: "personal-workspace/library.excalidrawlib",
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {
          library: null,
          directory: "personal-workspace/library.excalidrawlib",
        };
      }
      throw error;
    }
  }

  async writeLibrary(value: unknown) {
    if (!isLibraryData(value)) {
      throw new Error("The app sent invalid library data.");
    }

    const libraryFile: RepositoryLibraryFile = {
      type: "excalidrawlib",
      version: 2,
      source: "Personal Excalidraw",
      libraryItems: value.libraryItems,
    };
    await writeJSONAtomically(
      getPersonalLibraryPath(this.workspaceRoot),
      libraryFile,
    );
  }

  async syncMetadata(value: unknown) {
    if (!isWorkspaceMetadata(value)) {
      throw new Error("The app sent invalid workspace metadata.");
    }

    const workspace = value;
    const previousWorkspace = await readWorkspaceFile(this.workspaceRoot);
    await mkdir(this.workspaceRoot, { recursive: true });

    for (const page of workspace.pages) {
      const expectedPath = getWorkspacePagePath(
        this.workspaceRoot,
        workspace,
        page,
      );
      if (await pathExists(expectedPath)) {
        continue;
      }

      const previousPage = previousWorkspace?.pages.find(
        (item) => item.id === page.id,
      );
      const previousPath = previousPage
        ? getWorkspacePagePath(
            this.workspaceRoot,
            previousWorkspace!,
            previousPage,
          )
        : null;
      const existingPath =
        previousPath && (await pathExists(previousPath))
          ? previousPath
          : await findPageScene(this.workspaceRoot, page.id);

      if (existingPath && existingPath !== expectedPath) {
        await mkdir(path.dirname(expectedPath), { recursive: true });
        await rename(existingPath, expectedPath);
      }
    }

    await removeGeneratedSidecarsAndEmptyDirectories(this.workspaceRoot);
    await writeLayoutSidecars(this.workspaceRoot, workspace);
    await writeJSONAtomically(
      path.join(this.workspaceRoot, WORKSPACE_FILE),
      workspace,
    );
  }

  async readPageScene(pageId: string) {
    const workspace = await readWorkspaceFile(this.workspaceRoot);
    if (!workspace) {
      throw new Error("The repository workspace has not been created yet.");
    }

    const page = getPage(workspace, pageId);
    const expectedPath = getWorkspacePagePath(
      this.workspaceRoot,
      workspace,
      page,
    );
    const scenePath = (await pathExists(expectedPath))
      ? expectedPath
      : await findPageScene(this.workspaceRoot, pageId);

    if (!scenePath) {
      return null;
    }

    return readFile(scenePath, "utf8");
  }

  async writePageScene(pageId: string, scene: unknown) {
    if (typeof scene !== "string") {
      throw new Error("The app sent an invalid page scene.");
    }

    const workspace = await readWorkspaceFile(this.workspaceRoot);
    if (!workspace) {
      throw new Error("The repository workspace has not been created yet.");
    }

    const page = getPage(workspace, pageId);
    JSON.parse(scene);
    await writeFileAtomically(
      getWorkspacePagePath(this.workspaceRoot, workspace, page),
      scene,
    );
  }

  async deletePageScenes(pageIds: unknown) {
    if (
      !Array.isArray(pageIds) ||
      pageIds.some((pageId) => typeof pageId !== "string")
    ) {
      throw new Error("The app sent invalid page identifiers.");
    }

    for (const pageId of pageIds) {
      const scenePath = await findPageScene(this.workspaceRoot, pageId);
      if (scenePath) {
        await rm(scenePath);
      }
    }

    const workspace = await readWorkspaceFile(this.workspaceRoot);
    await removeGeneratedSidecarsAndEmptyDirectories(this.workspaceRoot);
    if (workspace) {
      await writeLayoutSidecars(this.workspaceRoot, workspace);
    }
  }
}

const sendJSON = (
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) => {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
};

const readRequestJSON = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("The drawing is too large to save locally.");
    }
    chunks.push(buffer);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
};

const createMiddleware = (workspaceRoot: string) => {
  const store = new PersonalWorkspaceStore(workspaceRoot);
  let operationQueue = Promise.resolve();

  const queueOperation = <T>(operation: () => Promise<T>) => {
    const result = operationQueue.then(operation, operation);
    operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    if (!requestUrl.pathname.startsWith(API_ROOT)) {
      next();
      return;
    }

    try {
      await operationQueue;

      if (request.method === "GET" && requestUrl.pathname === API_ROOT) {
        sendJSON(response, 200, await store.readStatus());
        return;
      }

      if (
        request.method === "GET" &&
        requestUrl.pathname === `${API_ROOT}/library`
      ) {
        sendJSON(response, 200, await store.readLibrary());
        return;
      }

      if (
        request.method === "PUT" &&
        requestUrl.pathname === `${API_ROOT}/library`
      ) {
        const body = await readRequestJSON(request);
        await queueOperation(() => store.writeLibrary(body));
        sendJSON(response, 200, {
          saved: true,
          directory: "personal-workspace/library.excalidrawlib",
        });
        return;
      }

      if (
        request.method === "PUT" &&
        requestUrl.pathname === `${API_ROOT}/metadata`
      ) {
        const body = await readRequestJSON(request);
        await queueOperation(() => store.syncMetadata(body));
        sendJSON(response, 200, { saved: true });
        return;
      }

      const pageMatch = requestUrl.pathname.match(
        new RegExp(`^${API_ROOT}/pages/([^/]+)$`),
      );
      if (pageMatch && request.method === "GET") {
        const pageId = decodeURIComponent(pageMatch[1]);
        const scene = await store.readPageScene(pageId);
        sendJSON(response, 200, { scene });
        return;
      }

      if (pageMatch && request.method === "PUT") {
        const pageId = decodeURIComponent(pageMatch[1]);
        const body = (await readRequestJSON(request)) as { scene?: unknown };
        await queueOperation(() => store.writePageScene(pageId, body.scene));
        sendJSON(response, 200, { saved: true });
        return;
      }

      if (
        request.method === "DELETE" &&
        requestUrl.pathname === `${API_ROOT}/pages`
      ) {
        const body = (await readRequestJSON(request)) as {
          pageIds?: unknown;
        };
        await queueOperation(() => store.deletePageScenes(body.pageIds));
        sendJSON(response, 200, { deleted: true });
        return;
      }

      sendJSON(response, 404, { error: "Unknown personal workspace action." });
    } catch (error) {
      console.error("[personal-workspace]", error);
      sendJSON(response, 500, {
        error:
          error instanceof Error
            ? error.message
            : "The repository workspace could not be updated.",
      });
    }
  };
};

export const personalWorkspaceServer = (repositoryRoot: string): Plugin => {
  const workspaceRoot = path.resolve(repositoryRoot, "personal-workspace");
  const middleware = createMiddleware(workspaceRoot);

  return {
    name: "personal-workspace-server",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
};
