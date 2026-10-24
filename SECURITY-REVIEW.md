# CodeLens security and bug review

Date: 22 Oct 2026. Scope: only this app (`/workspace/codelens-app`), run locally with `npm run build && npm start`
on localhost. No external host was scanned or probed. The only outbound traffic was the app's normal
GitHub import of public repos (sindresorhus/slugify, vercel/swr, and one repo name that does not exist).
Nothing was deployed or pushed.

Method: the checklists in the Claude-BugHunter skills (bb-methodology, triage-validation, hunt-nextjs,
hunt-lfi / path traversal, hunt-dom / XSS, hunt-ssrf, hunt-cache-poison, hunt-llm-ai), used as reference only.
Severity uses the triage-validation gate honestly. CodeLens is a free, single-user showcase app: it has
no accounts, no stored data on the server, and no cookies or sessions. That means most "classic" impact
(account takeover, data theft) does not exist here, and the severities below reflect that. No finding is inflated.

## Findings

| ID | Class | Severity | Where | How reproduced | Fix | Test added | Status |
|---|---|---|---|---|---|---|---|
| SEC-01 | Prototype-key confusion (repo file names used as plain `{}` keys) | Low | `lib/analyze/language.ts`, `analyze.ts`, `lib/city/blockLayout.ts`, `lib/bridge/index.ts`, `public/app/focus.js`, `workspace.js` | A zip that has a file named `__proto__` crashed the city plan with "Cannot read properties of undefined (reading 'toLowerCase')". Files named `constructor` and `x.constructor` got language "Object" and no colour, and `getSource("__proto__")` returned `Object.prototype` | New `lib/safeDict.ts` (`dict()` is a null-prototype object; `own()` reads own properties only). Lookups in workspace.js and focus.js use null-prototype tables or `hasOwnProperty` | `tests/security.test.ts` SEC-01 (also checks after a JSON round-trip); e2e `xss` | Fixed |
| SEC-02 | Resource use in zip parsing (duplicate entry names) | Low | `lib/analyze/zip.ts` | A zip with 2,000–3,000 entries all named the same thing: each copy was inflated again | Each planned name is inflated once (`toRead.delete`) | SEC-02 unit test (2,000 duplicates); e2e `zips` (3,000) | Fixed |
| SEC-03 | Secrets classification gaps (contents could be read and previewed) | Low | `lib/analyze/rules.ts` `isSecretPath` | `.env-prod`, `.envrc`, `.tfvars`, `.tfstate`, `.dev.vars`, `.pgpass`, `.s3cfg`, `kubeconfig`, `.aws/credentials`, `.ssh/*`, `*.ppk` and others were shown as normal code | Patterns added. Any file directly inside `.aws/`, `.kube/`, `.docker/`, `.ssh/` or `.gnupg/` is a Vault (except a readme) | SEC-03 (13 secret files with a marker string: the marker is never stored or shown; benign names are not flagged); e2e `secrets` | Fixed |
| SEC-04 | No rate limit or concurrency cap on the API routes (anyone could use up the server's shared GitHub quota or tie up the server) | Low–Medium | `app/api/import/github/route.ts`, `app/api/github/file/route.ts` | Repeated posts from one IP were all accepted, with no limit | `lib/server/rateLimit.ts`: per-IP sliding window (8 imports per 10 min, 120 file requests per minute) and 3 imports at once. Replies 429 with JSON, `Retry-After` and `resetAt`. Request bodies are capped at 4 KB (400). Limits can be changed with env vars | SEC-04 unit tests; route test (nine posts: eight accepted, then 429); browser check with `CODELENS_IMPORTS_PER_10MIN=1` (the building page shows "Too many imports… resets at…") | Fixed |
| SEC-05 | No CSP or security headers | Low (defence in depth: no XSS was found) | `next.config.ts` | `curl -I` showed no CSP, no X-Frame-Options and `X-Powered-By: Next.js` | Static pages get a strict CSP (scripts from 'self' plus the sha256 of the importmap, `object-src 'none'`, `frame-ancestors 'none'`, `connect-src 'self'`). Every route gets nosniff, Referrer-Policy, X-Frame-Options DENY, Permissions-Policy and COOP. API routes get `default-src 'none'`. `poweredByHeader: false` | SEC-05 config test; e2e checks for zero CSP violations on every page, Monaco included | Fixed |
| SEC-06 | Prototype keys in URL params (`?ff=__proto__:0`, `?file=__proto__`) | Info–Low | `public/app/features.js`, `workspace.js` | `?ff=__proto__:0,constructor:0` wrote onto the prototype chain of the flags object; `?file=__proto__` read the prototype | Only own keys of `FEATURES` are accepted; file lookups use null-prototype tables | SEC-06 unit test; e2e `xss` | Fixed |
| SEC-07 | No timeouts on upstream GitHub fetches (a slow upstream could hold a request and a concurrency slot open indefinitely) | Low | `lib/server/githubApi.ts` | Code review (fetch had no signal) | `timedFetch` with AbortSignal.timeout: API 15 s, codeload 50 s, raw 15 s. A timeout becomes a clean `ImportError` | Covered by the route error tests | Fixed |
| SEC-08 | Prompt injection through repo content, for the planned Gemini phase | Info (future surface; not present yet) | Talk panel (placeholder today) | n/a: no LLM is called yet | Guidance below | n/a | Open (future work) |

### Functional bugs found and fixed

| ID | Bug | Fix | Test |
|---|---|---|---|
| FN-01 | GitHub import errors sent as plain JSON (400/429) with no trailing newline showed only "import stopped" | `lib/client/importClient.ts` parses the leftover buffer and maps bad JSON to a `ClientImportError` | route and client tests; e2e rate-limit run |
| FN-02 | A malformed saved project in IndexedDB (files not an array, missing fields, a string) crashed the workspace | `workspace.js` checks the shape, clears the bad project, says "Saved project could not be read" and shows the empty state | e2e `state` (3 cases) |
| FN-03 | A malformed pending import showed a raw "TypeError: Cannot read properties of undefined" | `building.js` checks the pending shape (github: url; zip: Blob; folder: an array of {file, path}), clears it and shows "The saved import could not be read. Go back and import the repo again." | e2e `state` |
| FN-04 | A single `/api` headers entry set Cache-Control and overrode the file route's own caching | Cache-Control removed from the config entry | SEC-05 config test |
| FN-05 | The stream to the client could leave the concurrency slot held if the client disconnected or `send` threw | `release()` runs in `finally` and in the stream's `cancel()`; `send` and `close` are guarded | route tests |

## Verified as secure (no change needed)

- Path traversal: `normalizePath` rejects `..`, absolute paths, drive letters, `~`, backslash escapes and control characters. Zip-slip fixture (`../../evil.js`, `/etc/passwd`, `C:\Windows\win.ini`, `ok/..\..\evil2.js`, a NUL name): only `ok/good.js` is kept, and 5 unsafe paths are counted. The file route returns 400 for traversal.
- Zip bombs: fflate caps output at the declared size (a zip that lies about its size was checked). Limits: 1 MB per file read (larger files are counted and their size estimated), 200 MB total read, 50 MB archive enforced while streaming, 5,000 files analyzed. The 3 MB oversized fixture is estimated, not read.
- SSRF: the hosts are fixed (api.github.com, codeload.github.com, raw.githubusercontent.com). Redirects are followed only to api.github.com, at most 2 hops; codeload and raw use `redirect: "error"`. Owner, repo and ref are validated with regexes, and path segments are URI-encoded. `github.com.evil.com/...` and `127.0.0.1` links are rejected both on the plate and on the server.
- Secrets: Vault files are refused (403) by the file route and by `getSource`; their contents are never inflated or stored. `GITHUB_TOKEN` is read only on the server; a grep of `.next/static` and `public/` found no token.
- XSS / DOM sinks: every `innerHTML` sink escapes its input (`esc` in building.js and workspace.js; the legend uses constants). Everything else uses `textContent`, Monaco models or canvas text. There is no `postMessage`, no inline event handler, no `javascript:` URL and no `eval`. Hostile file names (`<img onerror>`, `<svg onload>`, `<script>`, RTL override, quotes) ran no script anywhere: tree, labels, tooltip, Talk, Code tab or Monaco.
- Open redirect: the app only navigates to its own fixed pages (`/building`, `/workspace`, `index.html#your-repo`). No URL parameter decides where it navigates.
- Errors: replies are generic, with no stack traces or upstream bodies (route test).
- Repo code is never executed: it is only read as text.
- Next.js specifics (hunt-nextjs): no middleware is used for auth (so the middleware-bypass class of bugs does not apply), no server actions, no `next/image` remote patterns, and no user-controlled rewrites. Cache poisoning: API replies are not cached publicly, and static pages do not vary on headers.

## Not fixed, and why

- The rate limiter keeps its counts in memory, per server instance. On serverless or multi-instance hosting each instance counts on its own. That is fine for a showcase; use a shared store (for example Upstash) if it ever matters.
- `x-forwarded-for` is trusted for the client IP. Behind Vercel or Render the platform sets it; if the app is exposed directly, a client can spoof it and avoid the per-IP limit. The concurrency cap still applies.
- If the browser cancels an import, the server stops streaming but does not abort a GitHub download already running (it finishes or hits its timeout). This is low impact.
- The CSP keeps `style-src 'unsafe-inline'` because three.js, Monaco and the design use inline styles. The legacy React pages (`/app-legacy`, `/city`) also need `script-src 'unsafe-inline'` for Next's inline bootstrap. Moving to nonces would need dynamic rendering, which is out of scope.
- npm audit dev findings (see below).
- An empty or binaries-only GitHub repo was not imported for real (no such public repo was used, to keep outbound traffic to the normal flow). The same code path was tested with zips: "only binaries" and "empty after ignore rules".

## npm audit

- `npm audit --omit=dev`: **0 vulnerabilities** (everything that ships at runtime is clean).
- `npm audit` (including dev dependencies): 5 high, all from one chain: `eslint-config-next@16.4.2 → @next/eslint-plugin-next → fast-glob@3.3.1 → micromatch@4.0.8 → braces@3.0.3` (GHSA-vfj7-8cjw-p6xm, a stack-exhaustion DoS when given a crafted glob). It is lint-time only and never runs in the app or on untrusted input. There is no non-breaking fix: `npm audit fix --force` would downgrade to eslint-config-next 14, which breaks linting for Next 16. Left as is; it will clear when eslint-config-next updates fast-glob.

## Tests and checks (final run)

- `npm test`: 43/43 pass (`tests/security.test.ts` plus the existing suites). Malicious fixtures are in `tests/fixtures/malicious.ts`: zip-slip, XSS names, oversized file, duplicate entries, secrets.
- `npx tsc --noEmit`: clean. `npx eslint .`: clean. `npm run build`: passes.
- Headless Chrome sweep (`tools/sec-e2e.mts`, all modes, production server):
  - xss 6/6, monaco 3/3, secrets 3/3, zips 7/7, folder 1/1, state 8/8, ui 3/3, github 5/5;
  - also vercel/swr imported cleanly;
  - in the rate-limit run (limit set to 1) the 429 message shows with its reset time. The only console line is Chrome's own log of that expected 429 response.
- The UI sweep covered:
  - colour toggles ×12, labels, focus/Esc ×8 and resizes;
  - geometry count stable (42 → 42, no leak);
  - every `features.js` flag off one at a time, then all off: no errors;
  - reload, back/forward and double-click Build (imports once).
- Perf hot spots (from the earlier pass): the biggest cost is triangle count on huge repos (react ≈ 1.69M triangles, 56 draw calls), handled with instancing and greenery thinning. Nothing new was found in this pass.

## Guidance for the Gemini phase (prompt injection)

Repo files are attacker-controlled text. When the Talk panel starts calling Gemini:

- Call it from the server only, with the key server-side.
- Put file content in clearly delimited data blocks, and tell the model it is untrusted.
- Never send Vault/secret files.
- Give the model no tools and no URL fetching.
- Render its output with `textContent`, or sanitise markdown with no raw HTML and no auto-loaded images or links (this stops data from leaking through image URLs).
- Apply the same per-IP rate limit to the endpoint.
