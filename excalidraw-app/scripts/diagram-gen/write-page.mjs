// Writes a generated scene into personal-workspace/ as a new page, mirroring
// exactly what PersonalWorkspaceServer.ts's syncMetadata/writePageScene do,
// so the on-disk layout stays consistent with what the running dev server
// would produce (folder.json/file.json sidecars, `Name--id` path segments).
//
// IMPORTANT: only run this while the Vite dev server (yarn start:personal)
// is NOT concurrently writing to the same workspace.json — there's no lock.
// In practice: write the page first, then start/refresh the browser after.

import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sanitizeId = (id) => {
  const sanitized = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100);
  if (!sanitized) {
    throw new Error("invalid id");
  }
  return sanitized;
};

const sanitizeSegment = (name, fallback) => {
  const printable = Array.from(name, (ch) => (ch.charCodeAt(0) < 32 ? " " : ch)).join("");
  const sanitized = printable
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 80);
  const candidate = sanitized || fallback;
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(candidate) ? `_${candidate}` : candidate;
};

const entryName = (name, id, fallback) => `${sanitizeSegment(name, fallback)}--${sanitizeId(id)}`;

/**
 * @param {object} opts
 * @param {string} opts.repoRoot - absolute path to the Personal Excalidraw repo root
 * @param {string} opts.folderName - workspace folder to use (created if it doesn't exist)
 * @param {string} opts.fileName - workspace file to use (created if it doesn't exist)
 * @param {string} [opts.pageName] - page name (default "Page 1"); a numeric
 *   suffix is added if a page with this name already exists under the file
 * @param {any[]} [opts.elements] - full Excalidraw elements array (omit/empty
 *   for a placeholder page you intend to fill in via the browser, e.g. the
 *   mermaid paste-to-diagram path)
 * @param {boolean} [opts.setActive] - set as the workspace's active page (default true)
 */
export async function writeWorkspacePage({
  repoRoot,
  folderName,
  fileName,
  pageName = "Page 1",
  elements = [],
  setActive = true,
}) {
  const workspaceRoot = path.join(repoRoot, "personal-workspace");
  const workspacePath = path.join(workspaceRoot, "workspace.json");
  const ws = JSON.parse(await fs.readFile(workspacePath, "utf8"));
  const now = Date.now();

  let folder = ws.folders.find((f) => f.name.toLowerCase() === folderName.toLowerCase());
  if (!folder) {
    folder = { id: randomUUID(), name: folderName, createdAt: now, updatedAt: now };
    ws.folders.push(folder);
  }

  let file = ws.files.find(
    (f) => f.folderId === folder.id && f.name.toLowerCase() === fileName.toLowerCase(),
  );
  if (!file) {
    file = { id: randomUUID(), folderId: folder.id, name: fileName, createdAt: now, updatedAt: now };
    ws.files.push(file);
  }

  const siblings = ws.pages.filter((p) => p.fileId === file.id);
  let uniquePageName = pageName;
  let suffix = 2;
  while (siblings.some((p) => p.name.toLowerCase() === uniquePageName.toLowerCase())) {
    uniquePageName = `${pageName} ${suffix++}`;
  }

  const page = { id: randomUUID(), fileId: file.id, name: uniquePageName, createdAt: now, updatedAt: now };
  ws.pages.push(page);
  if (setActive) {
    ws.activePageId = page.id;
  }
  ws.updatedAt = now;

  const folderDir = path.join(workspaceRoot, "folders", entryName(folder.name, folder.id, "Folder"));
  const fileDir = path.join(folderDir, "files", entryName(file.name, file.id, "File"));
  const pagesDir = path.join(fileDir, "pages");
  await fs.mkdir(pagesDir, { recursive: true });

  await fs.writeFile(path.join(folderDir, "folder.json"), `${JSON.stringify(folder, null, 2)}\n`);
  await fs.writeFile(path.join(fileDir, "file.json"), `${JSON.stringify(file, null, 2)}\n`);

  const scene = {
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    elements,
    appState: {
      gridSize: 20,
      gridStep: 5,
      gridModeEnabled: false,
      viewBackgroundColor: "#ffffff",
    },
    files: {},
  };
  const scenePath = path.join(pagesDir, `${entryName(page.name, page.id, "Page")}.excalidraw`);
  await fs.writeFile(scenePath, JSON.stringify(scene));

  await fs.writeFile(workspacePath, `${JSON.stringify(ws, null, 2)}\n`);

  return { folder, file, page, scenePath };
}

// CLI usage (for quick manual runs / debugging):
//   node write-page.mjs --repoRoot "/path" --folder "X" --file "Y" --page "Z" --elementsFile elements.json
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(
    process.argv.slice(2).reduce((acc, arg, i, arr) => {
      if (arg.startsWith("--")) acc.push([arg.slice(2), arr[i + 1]]);
      return acc;
    }, []),
  );
  const elements = args.elementsFile
    ? JSON.parse(await fs.readFile(args.elementsFile, "utf8"))
    : [];
  const result = await writeWorkspacePage({
    repoRoot: args.repoRoot,
    folderName: args.folder,
    fileName: args.file,
    pageName: args.page,
    elements,
  });
  console.log(JSON.stringify(result, null, 2));
}
