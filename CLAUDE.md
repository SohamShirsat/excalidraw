# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

Excalidraw is a **monorepo** (Yarn 1 workspaces) with a clear separation between the core library and the application:

- **`packages/excalidraw/`** - Main React component library published to npm as `@excalidraw/excalidraw`
- **`excalidraw-app/`** - Full-featured web application (excalidraw.com) that uses the library
- **`packages/common`, `packages/element`, `packages/math`, `packages/utils`, `packages/fractional-indexing`, `packages/laser-pointer`** - Core packages consumed via `@excalidraw/*` path aliases (see `vitest.config.mts` / `excalidraw-app/vite.config.mts` for the alias list — new packages must be added to both)
- **`examples/`** - Integration examples (NextJS, browser script)

This is a fork with a **local-first "Personal Workspace" feature** layered on top of upstream Excalidraw (see below).

## Development Commands

```bash
yarn start                # run the app (excalidraw.com behavior)
yarn start:personal       # run the app with the Personal Workspace server enabled
yarn test:typecheck       # tsc, no emit
yarn test:code            # eslint --max-warnings=0
yarn test:other           # prettier --list-different
yarn test:app             # vitest (watch mode)
yarn test:app --watch=false            # vitest, single run
yarn test:app <pattern> --watch=false  # run a single test file/suite, e.g.:
yarn test:app WorkspaceSearch --watch=false
yarn test:update          # vitest --update --watch=false (regenerate snapshots)
yarn test:all             # typecheck + lint + prettier + full test run
yarn fix                  # fix:code (eslint --fix) + fix:other (prettier --write)
yarn build:packages       # build all packages/* in dependency order
yarn build:app            # build excalidraw-app for production
```

Always run `yarn test:update` before committing, and `yarn test:typecheck` to verify types.

## Architecture Notes

### Package System

- Internal `@excalidraw/*` packages are resolved via path aliases defined identically in `vitest.config.mts` (tests) and `excalidraw-app/vite.config.mts` (dev/build) — keep these two files in sync when adding a package or alias.
- Build system uses esbuild for packages (`scripts/buildPackage.js`), Vite for the app.
- TypeScript throughout with strict configuration; each package has its own `tsconfig.json` extending `packages/tsconfig.base.json`.

### Personal Workspace (local-first fork feature)

This fork adds a folder/file/page hierarchy and local persistence backed by the filesystem, distinct from upstream's browser-only/collab storage model:

- **`personal-workspace/`** at repo root is the durable source of truth: `workspace.json` (folder/file/page metadata), `library.excalidrawlib` (personal library), `folders/` (mirrors the hierarchy on disk), and one `.excalidraw` JSON file per page. See `personal-workspace/README.md` for on-disk conventions — do not hand-edit these files while the app is running.
- **`excalidraw-app/scripts/PersonalWorkspaceServer.ts`** is a Vite dev-server plugin exposing a REST-ish API under `/api/personal-workspace` (atomic writes via temp-file + rename) that reads/writes `personal-workspace/`. It's wired into `excalidraw-app/vite.config.mts` and only meaningful when running against a local Vite server (i.e. `yarn start:personal`), not in the production build.
- **`excalidraw-app/data/WorkspaceData.ts`** defines the `WorkspaceMetadata`/`WorkspaceFolder`/`WorkspaceFile`/`WorkspacePage` types and the client-side store: an IndexedDB (`idb-keyval`) cache plus `repositoryRequest` calls to `PersonalWorkspaceServer`'s API. The IDB copy is a cache; the filesystem (via the dev server) is authoritative when available.
- **`excalidraw-app/data/RepositoryLibraryData.ts`** and **`excalidraw-app/data/WorkspaceSearch.ts`** provide library sync and cross-page/cross-file search over the workspace.
- **`excalidraw-app/components/WorkspaceSidebar.tsx`** and **`WorkspaceSearchSidebar.tsx`** are the UI surfaces (folder tree, search) registered into the app's `DefaultSidebar` alongside the existing library sidebar.
- **`scripts/spotlight-app/`**, **`scripts/install-personal-excalidraw-spotlight-app.sh`**, **`scripts/launch-personal-excalidraw.sh`** package a macOS Spotlight-launchable app that starts the local dev server and opens the browser — unrelated to the web app's runtime code, only relevant when working on the desktop-launcher UX.

When modifying workspace persistence, changes typically touch three layers together: the on-disk format (`personal-workspace/`, `PersonalWorkspaceServer.ts`), the client data layer (`WorkspaceData.ts`), and the UI (`WorkspaceSidebar.tsx`).
