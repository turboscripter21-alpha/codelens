# CodeLens

See a codebase as a low-poly city: folders are blocks on a road grid, files are buildings.
College showcase project by Maverick. Desktop only. Free, one Next.js app.

> Style inspired by a low-poly city model by abhi on Sketchfab (CC-BY)

The frontend is Maverick's design, served as static pages from `public/` (no redesign, no React
port): the landing scroll site, the building (progress) page and the workspace, plus the
CodeCity `city.js` engine and its component library. The Next.js app adds the backend: API
routes, the in-browser analyzer bundle and the IndexedDB project store.

**There is no sample project in the app.** The city, file tree, Talk panel, Code tab and focus
mode come only from the user's GitHub link, `.zip` or folder. With nothing imported,
`/workspace` shows an "Import a repo first" card and `/building` says "Nothing to build", both
linking back to the import plate. (The landing page's baked renders are illustrations of an
example repo, `my-app`; they are visuals only.)

## Run it

Needs **Node 20.9+** (developed on Node 22).

```bash
npm install
npm run dev          # then open http://localhost:3000
```

Production check:

```bash
npm run build        # prebuild bundles lib/bridge -> public/app/codelens-bridge.js
npm run start        # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run bridge` | esbuild: `lib/bridge/index.ts` -> `public/app/codelens-bridge.js` (runs automatically before `dev` and `build`) |
| `npm test` | Unit tests (`tests/*.test.ts`, Node test runner + tsx): analyzer, ignore rules, path traversal, URL parsing, block layout, "no sample in the app" guards |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next config; `public/` is static and not linted) |

Optional env var: `GITHUB_TOKEN` (server-side only, never sent to the browser) raises the
GitHub API limit from 60 to 5,000 requests an hour. An import uses about 2 API calls; the
source itself comes from codeload as one zip. Put it in `.env.local`, which is never zipped
or committed.

## URLs

| URL | What |
| --- | --- |
| `/` | Landing scroll site (`public/index.html`). The last stop is the **import plate**: GitHub link, Choose .zip, Choose folder, or drag and drop |
| `/building` | `public/building.html`: real import progress (reading, secrets, imports, roads, buildings), then opens the workspace. Errors (bad link, repo not found, rate limit with reset time, too big) show in red |
| `/workspace` | `public/workspace.html`: file tree, live 3D city, Talk panel, Code tab, double-click focus mode (Monaco Light Modern + levitating building). Empty state when nothing was imported |
| `/app-legacy`, `/city` | The earlier React (Phase 1-3) screens, kept for reference. Also import-only, no sample |
| `POST /api/import/github` | `{ url }` -> NDJSON stream of progress events, then the analyzed project |
| `GET /api/github/file?owner&repo&ref&path` | One file's text for the Code tab / focus mode (403 for secrets, 415 for binaries) |

## How the wiring works

1. **Import plate** (`public/codelens.js`): the GitHub link is checked with
   `CodeLens.checkGithubUrl` (github.com/owner/repo only). A link, a picked `.zip` or a folder
   becomes a *pending import* in IndexedDB (`codelens` db, `projects` store, key `pending`;
   `File` objects are structured-cloneable), then the page goes to `/building`.
2. **Building** (`public/app/building.js`) runs the pending import:
   - GitHub: `POST /api/import/github` (server: repo info, tree, codeload zip, the same analyzer).
   - `.zip` / folder: parsed **in the browser** by the bundled `lib/analyze` code (fflate +
     File API). Nothing is uploaded. Same ignore rules (node_modules, build output, minified,
     binaries...), same caps and the same path-traversal guard as the server.
   - Progress events drive the steps and the bar. The project is saved under key `current`.
3. **Workspace** (`public/app/workspace.js`) loads `current`, plans the city with
   `CodeLens.plan()` (`lib/city/blockLayout.ts`) and renders it with
   `public/app/city/engine.js` (the generalised city.js).

Why browser-side parsing for zip/folder: the files never leave the user's machine, there is
no upload limit on a free host, and the server stays a thin GitHub proxy.

Security: repo code is never executed and is treated as untrusted text. Secrets files (`.env*`,
`*.pem`, `id_rsa`, keys...) become **Vault** buildings by name only; their contents are never
read or returned ("contents never read"). GitHub URLs are validated strictly (github.com only,
SSRF safe; no arbitrary fetch). Zip entries with `..`, absolute or drive paths are rejected.
Both API routes are rate limited per IP (in memory, per server instance), every response sends
a CSP and security headers (`next.config.ts`), and upstream GitHub calls time out. The full
review is in [`SECURITY-REVIEW.md`](SECURITY-REVIEW.md).

| Env var | Default | Meaning |
|---|---|---|
| `GITHUB_TOKEN` | unset | Optional, server-side only. Raises the GitHub API limit |
| `CODELENS_IMPORTS_PER_10MIN` | 8 | GitHub imports per IP per 10 minutes (then 429 with reset time) |
| `CODELENS_CONCURRENT_IMPORTS` | 3 | Imports running at once on the server ("CodeLens is busy") |
| `CODELENS_FILES_PER_MIN` | 120 | `/api/github/file` requests per IP per minute |

### City layout (`lib/city/blockLayout.ts`, pure and unit tested)

- Every folder is a **block** on a road grid (big folders split into sub-folders, then
  numbered parts; at most 48 buildings per block). Root files are the city hall block.
- Blocks are placed in a spiral from the centre (largest = downtown). Leftover cells are parks.
- Inside a block, tiers are **mixed** (tall / medium / small interleaved and hash-shuffled),
  with green lots (~16%), a fountain plaza in blocks with 6+ buildings, footpaths between row
  pairs and raised sub-plots for nested folders.
- Height = score (lines x weight by kind + 18 per importer). Tall >= max(150, p93), medium
  >= max(55, p70). Lockfiles are capped low, so they are never towers.
- The glowing **main artery** runs past downtown; the **Gateway** and exit road sit on the
  east edge. Deterministic (FNV-1a hash): the same files always build the same city.
- Above 700 buildings, the top files keep their own building and the rest are grouped into
  per-folder "small files" blocks (shallower folders if there are very many), so the city
  never exceeds 700 buildings.

## Feature flags (`public/app/features.js`)

Everything is on for now. Set a flag to `false` to remove that feature, or try it for one
visit with the URL: `/workspace?ff=traffic:0,glowArtery:0`.

| Flag | Feature |
| --- | --- |
| `glowArtery` | The glowing main artery / common path through downtown (false = plain roads only) |
| `traffic` | Moving bikes (imports), cars (to the Gateway), trucks (CI / tests / manifest) and buses |
| `folderLabels` | Folder labels on the ground (with an on/off toggle; never painted on buildings) |
| `colorCoding` | Colour toggle: none / module type / language, with a legend |
| `connectionLines` | Select / hover highlight: shells plus arcs to Uses (orange) and Used by (blue) |
| `parks` | Green lots, grass strips with trees, park blocks in empty cells |
| `plazas` | Fountain plaza with benches in blocks with 6+ buildings |
| `gateway` | The Gateway and the exit road on the east edge |
| `lamps` | Street lamps along the roads |
| `trees` | The tree ring around the city |
| `subPlots` | Nested folders as slightly raised sub-plots inside a block |
| `footpaths` | Footpaths between back-to-back rows of lots |
| `tooltip` | Hover tooltip with the file name |
| `shadows` | Sun shadows |

`LIMITS` in the same file: bikes 36, cars 8, trucks 6, buses 4, arcs 30 (per direction for
the selected file), labels 80.

## Performance

- Static scenery (roads, pads, greenery, lamps, the artery's static parts) and all buildings
  are **baked** into a few merged, vertex-coloured meshes by material class.
- Vehicles are one `InstancedMesh` per (vehicle, material class); artery pulses are one
  instanced mesh; picking uses one invisible instanced proxy; the selection highlight
  (shells, rings, edges, arcs, dots) is about 6 draw calls however many links it has.
- Big cities get lighter detail: small parts are dropped from buildings (LOD) and greenery is
  thinner (fewer trees and flowers per lot, capped grass tufts, parks capped at 46 x 46).
- Rendering is continuous only while traffic / the artery animate; it pauses when the tab is
  hidden, in focus mode and on the Code tab.

Measured on the dev box with **software WebGL (swiftshader)**, so FPS is far below a real GPU;
draw calls and triangles (both include the shadow pass) are the useful numbers:

| Project | Buildings | Draw calls | Triangles |
| --- | --- | --- | --- |
| sindresorhus/slugify | 13 | 45 | 68k |
| local folder (city demo) | 65 | 49 | 394k |
| local zip (this app's source) | 81 | 61 | 464k |
| vercel/swr | 346 | 73 | 1.56M |
| facebook/react (5,000 files) | 689 | 56 | 1.69M |

## Limits

- Zip up to 50 MB; up to 5,000 files analyzed after ignore rules; files over 1 MB are counted,
  not read (LOC estimated).
- Previews: 400 lines / 64 KB per file. GitHub imports keep about 1.25 MB of previews in the
  stream; other GitHub files are fetched on demand through `/api/github/file`. Zip/folder
  files outside the preview budget can't be shown (re-import a smaller folder).
- Imports are found with regexes (JS/TS/Python/CSS), not a full parser.
- Unauthenticated GitHub API: 60 requests an hour per server IP (set `GITHUB_TOKEN` for more).
- The Talk panel text is a placeholder built from real stats until the Gemini phase.
- Public repos only. Desktop only.

## Verifying (dev box)

`tools/shoot-v2.mts` drives headless Chrome (swiftshader) against `npm run start` on `PORT`
(default 3100), writes 1440x900 screenshots to `/workspace/codelens-app-shots/v2/` and prints
perf numbers: `node --import tsx tools/shoot-v2.mts [all|landing|empty|github|local|errors|large]`.
It uses the playwright-core copy at `/workspace/codelens-city-demo/node_modules`.
`tools/shoot.mts` is the older Phase 1 script.

`tools/sec-e2e.mts` is the security and functional sweep (hostile zips, XSS names, secrets,
odd folders, malformed saved state, UI toggles, flags, Monaco under the CSP, GitHub cases):
`node --import tsx tools/make-sec-fixtures.mts` then
`node --import tsx tools/sec-e2e.mts [all|xss|monaco|secrets|zips|folder|state|ui|github]`.
`GH_URLS="url|ws,url|err"` overrides the GitHub list. For the sweep, start the server with
higher limits (`CODELENS_IMPORTS_PER_10MIN=500 CODELENS_FILES_PER_MIN=5000`).
