# CodeLens: BRIEF

**Self-authored under explicit creative delegation.**
The user asked: "build a website design for code lens only prototye and send some screenshots dont make up the backend and stuff only the design and use scrollcraft skill". There was no interview. Product facts below come from the user's own messages in the planning conversation; every design decision is marked as authored.

## Evidence (from the user)

- CodeLens is a free web app for coding beginners, students and vibecoders.
- Paste a GitHub repo link, or upload a zip / project folder. It helps you understand what the code does and what the developer meant to build, without reading the whole repo.
- Users paste their own AI API key; most use a free Gemini key.
- College showcase project.
- Signature concept: the codebase becomes a 3D low-poly Code City. Folders are districts, files are buildings (tall = core modules like App.js, medium = mid modules, small shops = small parts like css, tests, config), imports are roads, a glowing common path shows the most-used route, bikes = function calls, cars = API calls leaving through a Gateway, trucks = heavy jobs (tests, builds, DB), buses = events, a Vault = secrets (.env, values hidden).
- The city is built deterministically from the files with no AI. AI is used only for: Talk to the file (click a building and it explains itself in first person), Ask anything in a Monaco-style editor line by line, an AI guided tour that flies through the city, a 2D map with hover explanations of why links exist, and a step-by-step guide to clone and run the project.
- Optional colour-coding turns the city into a heatmap by module type or language.
- Honest drawbacks: AI can be wrong (a guide, not gospel); big repos get crowded; public repos only.
- The user liked the low-poly Sketchfab city model credited to "abhi"; the component library is an original procedural recreation in that style. Credit line: "Style inspired by a low-poly city model by abhi on Sketchfab (CC-BY)".
- Scope from the user: design only. No backend, no made-up working features.

## Assumptions (authored)

- Visitors arrive from a college demo, a classmate's link, or a social post, on a laptop or a phone.
- The visitor has a repo in mind (their own or one they cloned) and has been stuck on it.
- No real metrics, users or testimonials exist, so the page carries no counters, quotes or logos.

## The eight topics

1. **Vibe in three to five words** (authored): a city you can read. Toy-bright, civic, calm, honest.
   References outside the web: a transit line diagram on a train wall; SimCity 2000's overview map; the paper fold-out map you get at a city's visitor centre.
2. **Scroll journey** (authored, following the user's six-feature list): arrive at your city; feel the pain of a raw file tree; watch the tree build the city; learn what the traffic means; click a building and hear it talk; read App.js line by line; see the heatmap and the setup steps; arrive at the last stop where you paste your own repo.
3. **Energy curve** (authored): calm and bright at the top, a dense uncomfortable second stop, the biggest change of the page at the third, playful sideways travel, an intimate quiet click, a focused working stretch, a confident short stretch, a still, resolved ending.
4. **Feeling, stage by stage, and the one moment**: see the feeling curve and peak below.
5. **One thing no site they have seen does** (seed given by the parent brief): "your repo turns into a city you can walk through". Made literal as the signature move below.
6. **How far from premium-minimal** (authored): playful-civic. Light concrete ground, bright toy colours from the renders, one signal-yellow accent borrowed from the common path and the buses. Not dark, not luxury, no gradients.
7. **One unbroken world or distinct scenes** (authored): distinct stops on one line. The page is a transit route; each section is a station you arrive at. Not a continuous camera flight.
8. **Assets**: the user's own product. Real renders from the CodeLens demo-project city and the CodeCity component library, re-rendered for this page from the same Three.js code (transparent per-building layers from one fixed camera, transparent vehicle and building cutouts, a downtown close-up, the plain and colour-coded overviews, the App.js selected state). No generated imagery, no kie.ai spend (no key on the box, and it was not needed).

## World: why low-poly is allowed here

worlds.md bans soft low-poly as a *default*, because it is the house style of AI scroll sites and announces that nothing is real. Here the low-poly city is not decoration; it is the product's actual output. Every image on the page is a real render produced by the same code that the CodeLens demo runs, of a real (sample) project tree. Swapping in photography would misrepresent what the app does. The brand is genuinely illustrated, so the world commits to the product's own illustration style and nothing else: no clay, no tilt-shift toy styling, no generated scenes.

## Journey (beats)

1. Recognition: this is my repo, but as a place.
2. Tension: the raw file tree, where nothing says what matters.
3. Turn: the tree builds the city, file by file, with no AI.
4. Substance: what the traffic means.
5. Intimacy: a building answers you.
6. Competence: line-by-line reading in the editor.
7. Range: heatmap, tour, map, and the real commands to run it.
8. Commitment: the last stop, your repo.

## Feeling curve (written before the score)

| Stop | Emotion | What on screen causes it |
|---|---|---|
| 1 Arrive | Curiosity | A whole city floats on the page in separate planes; a tower and a bus pass in front as you scroll |
| 2 The pile, built (PEAK at its end) | Recognition, then awe | One pinned act. It opens on the dense mono file tree and "Which one do I open first?"; the question fades, the city's plots appear beside the same tree, each tree line lights in turn and its building rises, then the main road lights and traffic appears |
| 3 Traffic | Play | Vehicles slide past sideways, each with a museum-style label |
| 4 Talk | Intimacy | You click a building and it speaks one first-person sentence |
| 5 Read | Focus | App.js scrolls under a highlight, line by line, with a plain explanation beside it |
| 6 Run | Confidence | A wipe turns the plain city into a heatmap; real clone/run commands beside it |
| 7 Your repo | Resolve | The full city at rest, a repo field and one button, the honest fine print |

No two adjacent stops share a feeling.

v4 change (user request): the pile and the build were two acts; they are now one. The tree the visitor just read is the tree that builds the city, so the dread turns into awe in the same frame instead of across a cut. The route line lost its Build stop (7 stops now).

## The peak

> "I scrolled down the folder list and the buildings came up out of the ground one by one, then the main road lit up."

Lives at the end of stop 2 (The pile, built): the last building lands, then the main road lights and the traffic arrives. The act has the largest span on the page (4.6 viewport heights against the next largest 2.5) and the only per-building asset set. Its first ~18% is the pile's question on its own; the build then starts almost at once (the empty-plot hold was cut to ~3% of the build after user testing showed an empty city read as broken).

## Tell-someone sentence

"It's the site where your folder list builds a city as you scroll, one building per file."

## Signature move

**The tree builds the city.** The same mono file tree the visitor just read (the demo-project's 19 files) stays put while the city's empty plots fade in beside it. Scroll is the construction clock: each file line lights in order, a leader line draws from that line to its plot, and that file's building rises out of the ground there (each building sits in a box the size of its own render with overflow hidden, and slides up out of the box's bottom edge, its plot, while fading in: no clip-path, so it does not depend on GPU compositor paths). Tall files rise tall, shops rise small, the Vault drops in last. After the last file, the common path layer lights and the vehicle layer fades in. The per-building layers are pixel-aligned renders from one fixed camera, so the finished state is identical to the real render. Built in page JS from the act's progress. The engine is untouched.

## Authored silence

- Stop 2, the start of its build (~3%): the empty city with plots and roads only, so the first building has something to rise from. Kept short on purpose (see above).
- Stop 7: the close holds still. Intentional resolved hold.

## Honesty rules for this prototype

- Nothing on the page fetches, uploads, or calls an AI. The repo field and key field are visual mockups; pressing the button explains that this is a design prototype.
- All file data, explanations and building "speech" are sample text written for the made-up demo-project, and the page says so where they appear.
- No statistics, counters, testimonials, logos, pricing or dates.
