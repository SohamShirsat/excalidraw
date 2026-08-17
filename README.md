# Personal Excalidraw

A local-first drawing workspace for macOS, built on [Excalidraw](https://github.com/excalidraw/excalidraw).

Excalidraw is a brilliant canvas, but on excalidraw.com a drawing is a browser tab. This fork turns it into a native desktop app with the thing a canvas is missing once you use it every day: **a real workspace**. Folders hold files, files hold pages, every page is an ordinary `.excalidraw` file in a folder on your Mac, and an optional one-way-you-control sync keeps a copy in a GitHub repository you own.

- **Local-first.** Your drawings are plain files in a folder you can see, back up, and open with anything else. There is no account, no server, and no telemetry.
- **A workspace, not tabs.** Folders → files → pages, a persistent sidebar, page tabs, and a split view.
- **Backed up on your terms.** Connect a private GitHub repo, then sync manually, on app launch, or on an hourly/daily/weekly/monthly schedule.
- **Yours to rebind.** Every workspace shortcut is remappable in Settings → Shortcuts.

## Install

### Download

Grab the latest `.dmg` from [Releases](https://github.com/SohamShirsat/excalidraw/releases), drag the app to Applications, then **right-click → Open** the first time. The app is signed ad-hoc rather than with an Apple Developer ID, so Gatekeeper asks once and then never again.

### Or build it yourself

```bash
git clone https://github.com/SohamShirsat/excalidraw.git
cd excalidraw
yarn install
yarn electron:build
```

The `.app`, `.dmg` and `.zip` land in `release/`.

## Where your drawings live

Everything is a file on disk, in one folder:

```
personal-workspace/
├── workspace.json            folder/file/page hierarchy
├── library.excalidrawlib     your shape library
├── folders/                  the same hierarchy, mirrored on disk
└── <page>.excalidraw         one JSON file per page, drawings and images included
```

By default the app uses `~/Documents/Personal Excalidraw/personal-workspace`, and Settings → General shows the exact resolved path. Nothing is bundled inside the app: deleting the app never deletes a drawing.

Saving is automatic and debounced; there is no "save" step to remember. Don't hand-edit files in that folder while the app is running.

## Sync with GitHub

Sync is **optional and off by default**. When it's on, the folder above becomes a git repository that is pushed to a GitHub repo you own. The folder stays the source of truth; GitHub is a durable, shareable backup — the app keeps working normally when GitHub is unreachable, or when you never set it up at all.

### Setting it up

1. **Create an empty private repository** on GitHub (this app never creates repositories for you). Don't add a README — an empty repo makes the first sync trivial.
2. **Create a fine-grained personal access token** at [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new):
   - Repository access → _Only select repositories_ → the repo from step 1.
   - Permissions → Repository permissions → **Contents: Read and write**.
   - Nothing else. That single permission is all the app uses.
3. In the app: **Settings → Sync**, paste `owner/repo` and the token, pick how often to sync automatically, and press **Connect repository**.

The token is encrypted with your macOS keychain (Electron's `safeStorage`) before it touches disk, and it is never sent back to the app's UI — the interface can only ever ask _whether_ a token exists.

### Using it day to day

The circular arrows in the left rail are both the status and the button:

| What you see    | What it means                                              |
| --------------- | ---------------------------------------------------------- |
| Plain icon      | Everything is backed up                                    |
| Icon with a dot | You have unsynced changes — click to push them now         |
| Spinning icon   | A sync is running                                          |
| Red icon        | Something needs a decision — click to open Settings → Sync |

Automatic syncs run on the schedule you picked, plus optionally a few seconds after the app opens.

### Moving to another Mac

Install the app there, connect it to the same repository, and choose **Use GitHub's copy** when it asks which version to start from. Your workspace arrives intact.

### When both sides changed

If this Mac and GitHub both moved on since the last sync and git can't merge them automatically, the app stops and asks rather than guessing. You choose **Keep this Mac's copy** or **Use GitHub's copy** — and either way the app writes a dated backup folder next to your workspace before replacing anything, so the losing version is never actually gone.

Disconnecting only forgets the token on that Mac. Your workspace folder, its git history, and the GitHub repository are all left exactly as they are.

## Keyboard

Everything in Excalidraw's own canvas works as usual. On top of that:

| Shortcut | Action |
| --- | --- |
| `⌘T` | Open a page — search everything you've got, with "New page…" as the last row |
| `⌘N` | New page — pick the folder and file it belongs in |
| `⌘P` | Search the whole workspace (pages, canvas text, assets, library) |
| `⌘1` / `⌘2` / `⌘3` | Pages / Library / Search panel |
| `⌘\` | Toggle the sidebar |
| `⌘⌥\` | Toggle the design panel |
| `⌘⇧\` | Open the current page to the side (split view) |
| `⌘⌥←` / `⌘⌥→` | Previous / next page tab |
| `⌘⇧W` | Close page tab |
| `⌘,` | Settings |

All of these are remappable in Settings → Shortcuts.

## Development

```bash
yarn electron:dev      # native app against the Vite dev server
yarn start:personal    # browser-only fallback, no Electron
yarn test:all          # typecheck + lint + prettier + the full test suite
yarn electron:build    # package the macOS app into release/
```

Architecture notes for contributors (and for AI assistants) live in [CLAUDE.md](CLAUDE.md).

## Credit and licence

This is a fork of [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw), which does all of the hard work — the canvas, the renderer, the file format, the library ecosystem. Everything here is a shell around it. MIT licensed, same as upstream; see [LICENSE](LICENSE).

Features that depend on infrastructure a desktop user doesn't control — real-time collaboration, shareable encrypted links, the hosted AI features, analytics and error reporting — are deliberately removed rather than left half-working offline.
