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
yarn electron:dev         # run the native macOS shell against the Vite renderer
yarn electron:build       # create local macOS .app, .dmg, and .zip artifacts in release/
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
- **`electron/main.ts`**, **`electron/preload.ts`**, and the typed bridge exposed in **`excalidraw-app/electron.d.ts`** are the primary native transport when the Electron app is running. Workspace reads/writes are serialized in the main process and target the folder provided through `ELECTRON_WORKSPACE_ROOT`; native file selection and app settings use the same bridge.
- **`excalidraw-app/scripts/PersonalWorkspaceServer.ts`** remains the Vite fallback, exposing a REST-ish API under `/api/personal-workspace` (atomic writes via temp-file + rename) for `yarn start:personal` and browser development.
- **`excalidraw-app/data/WorkspaceData.ts`** defines the `WorkspaceMetadata`/`WorkspaceFolder`/`WorkspaceFile`/`WorkspacePage` types and the client-side store: an IndexedDB (`idb-keyval`) cache plus transport calls to the Electron bridge or the Vite server. The IDB copy is a cache; the filesystem is authoritative when either local transport is available.
- **`excalidraw-app/data/RepositoryLibraryData.ts`** and **`excalidraw-app/data/WorkspaceSearch.ts`** provide library sync and cross-page/cross-file search over the workspace.
- **`excalidraw-app/components/WorkspaceRail.tsx`** keeps the workspace folder tree visible on the left. **`WorkspaceSearchDialog.tsx`** supplies cross-workspace search via Command-P, while **`WorkspaceSearchSidebar.tsx`** remains reusable in the standard sidebar.
- **`excalidraw-app/components/SettingsDialog.tsx`** contains the native app's General, Shortcuts, and About settings. Shortcut overrides persist locally and the app shell can open it through the native menu.
- **`electron-builder.yml`** packages the local macOS app. Use `yarn electron:build`; it produces artifacts in `release/` and does not sign them with an Apple Developer ID.
- **`scripts/spotlight-app/`**, **`scripts/install-personal-excalidraw-spotlight-app.sh`**, and **`scripts/launch-personal-excalidraw.sh`** are legacy browser-launcher tooling. Keep them isolated from the native runtime until their retirement is explicitly approved.

When modifying workspace persistence, changes typically touch three layers together: the on-disk format and native/Vite transport (`electron/`, `PersonalWorkspaceServer.ts`), the client data layer (`WorkspaceData.ts`), and the workspace UI (`WorkspaceRail.tsx`).
