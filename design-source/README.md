# CodeLens: design prototype

A scroll-driven landing page plus two app screens for CodeLens, built with the scroll-craft engine. Desktop only (designed and checked at 1440x900, also checked at 1280x620 and 1024x520).

This is a design prototype. There is no backend and nothing is processed:
- The GitHub link is checked for shape only (github.com/owner/repo). Nothing is fetched.
- "Choose .zip" / "Choose folder" / drag-and-drop open the real browser pickers, but only the name and file count are shown. No file is opened or uploaded.
- "Build my city" goes to building.html, a simulated progress screen on a timer, which moves on to workspace.html by itself.
- workspace.html is a static mock with the demo-project sample: file tree, city render, Talk to the file, and a read-only code tab. "Ask anything", the follow-up box and "Add Gemini key" are not connected.
- All file names, code and explanations are sample content for a made-up project called demo-project.

## Run it

From this folder:

    npx serve .

Then open the address it prints (usually http://localhost:3000) in Chrome, Edge or Firefox on desktop.

Any static server works (for example `python -m http.server 4517`). Do not open index.html by double-clicking: workspace.html uses JavaScript modules, which browsers block from file://.

Note: `npx serve` turns building.html into /building and drops anything after "?" on the way. The picked project name is also kept in sessionStorage, so the flow works either way.

## Pages

- index.html: the landing page (7 stops). In stop 2 the folder tree lights line by line and the city builds beside it as you scroll. The last stop is the import area.
- building.html: simulated build screen. "Skip to the workspace" jumps ahead.
- workspace.html: app workspace mock. Click any file in the tree or any building in the city to select it. Double-click a building (or a file) for focus mode: the file opens on the left in a read-only Monaco editor styled like VS Code Light Modern, and the building floats on its own on the right, turning slowly (live three.js, same components as the city renders). Esc or Back to city returns.

## What's here

- index.html, codelens.css, codelens.js: landing page
- building.html, workspace.html, app/: app screens (app/project.js and app/code.js are the demo-project sample data and sample code)
- app/vendor/monaco: Monaco editor 0.57 min build (MIT), served locally, no CDN
- app/vendor/three, app/citylib: three.js (MIT) and the CodeCity building components used for the floating building
- scrollcraft.js, scrollcraft.css: scroll engine (unmodified)
- assets/city: city renders (full city, base, artery glow, 19 per-building layers, vehicles, heatmap, 19 selection views in sel/)
- assets/kit: transparent cutouts (vehicles, gateway, vault, tower, trees)
- fonts: Archivo and Geist Mono subsets
- BRIEF.md: design brief

Respects prefers-reduced-motion (buildings fade in place instead of rising; no parallax).

## Credits

Style inspired by a low-poly city model by abhi on Sketchfab (CC-BY).
Renders made with three.js (MIT). Code view uses Monaco Editor (MIT, app/vendor/monaco/LICENSE.txt).
