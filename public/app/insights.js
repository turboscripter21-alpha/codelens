/* insights.js: non-AI "learning" helpers, built only from the analysis (paths, LOC, imports,
   symbols, health). Pure functions (no DOM), shared by the workspace, building chat, summary
   slideshow, search and where-to-start, and unit-tested in tests/insights.test.ts.
   Repo text is untrusted: package.json is only JSON.parse'd for main/bin/module strings. */

const base = (p) => p.slice(p.lastIndexOf('/') + 1);
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const CODE_EXT = /\.(m?[jt]sx?|cjs|cts|mts|py|go|rs|java|kt|rb|php|cs|swift|c|cc|cpp|h|hpp|vue|svelte|dart|scala)$/i;
const isCode = (f) => !f.secret && !f.binary && !f.lockfile && CODE_EXT.test(f.path);
const ENTRY_NAMES = ['index', 'main', 'app', 'server', 'cli', '__main__', 'manage', 'lib', 'mod'];
const CONFIG_RE = /(^|\/)(package\.json|pyproject\.toml|setup\.py|requirements\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|composer\.json|Gemfile|tsconfig\.json|vite\.config\.[jt]s|next\.config\.[jt]s|webpack\.config\.[jt]s|Dockerfile|Makefile)$/;
const README_RE = /(^|\/)readme(\.(md|rst|txt))?$/i;

function normRel(p) {
  const out = [];
  for (const s of String(p).replace(/\\/g, '/').split('/')) { if (!s || s === '.') continue; if (s === '..') { if (!out.length) return null; out.pop(); } else out.push(s); }
  return out.join('/');
}

/** Candidate entry paths named by a package.json (main, module, bin, exports["."]), relative to its folder. */
export function packageEntries(pkgText, pkgPath = 'package.json') {
  let j; try { j = JSON.parse(pkgText); } catch { return []; }
  if (!j || typeof j !== 'object') return [];
  const out = [], dir = dirOf(pkgPath);
  const add = (v) => { if (typeof v === 'string' && v.length < 300) { const n = normRel((dir ? dir + '/' : '') + v); if (n) out.push(n); } };
  if (typeof j.bin === 'string') add(j.bin); else if (j.bin && typeof j.bin === 'object') Object.values(j.bin).slice(0, 5).forEach(add);
  add(j.main); add(j.module); add(j.source);
  const ex = j.exports;
  if (typeof ex === 'string') add(ex);
  else if (ex && typeof ex === 'object') { const dot = ex['.'] ?? ex; if (typeof dot === 'string') add(dot); else if (dot && typeof dot === 'object') ['source', 'import', 'require', 'default', 'node'].forEach((k) => typeof dot[k] === 'string' && add(dot[k])); }
  return [...new Set(out)];
}

/** Map a built path (dist/index.js) to a source file in the project (src/index.ts …). */
export function resolveEntry(cand, byPath) {
  if (byPath[cand]) return cand;
  const stem = cand.replace(/\.(m?[jt]sx?|cjs|d\.ts)$/i, '');
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts'];
  const tries = [stem, stem.replace(/(^|\/)(dist|build|lib|out|esm|cjs)\//, '$1src/'), stem.replace(/(^|\/)(dist|build|lib|out|esm|cjs)\//, '$1')];
  for (const t of tries) { for (const e of exts) if (byPath[t + e]) return t + e; for (const e of exts) if (byPath[t + '/index' + e]) return t + '/index' + e; }
  return null;
}

/** The entry file: package.json main/bin first, then index/main/app-like names near the root, then the most important code file. */
export function findEntry(files, pkgText) {
  const byPath = Object.create(null); for (const f of files) byPath[f.path] = f;
  if (pkgText) for (const c of packageEntries(pkgText)) { const r = resolveEntry(c, byPath); if (r && !byPath[r].secret) return { path: r, why: 'package.json points to it (main / bin)' }; }
  const code = files.filter(isCode);
  if (!code.length) return files.length ? { path: [...files].sort((a, b) => b.importance - a.importance)[0].path, why: 'the most important file' } : null;
  const depth = (p) => p.split('/').length - 1;
  const nameRank = (p) => { const n = base(p).replace(/\.[^.]+$/, '').toLowerCase(); const i = ENTRY_NAMES.indexOf(n); return i < 0 ? 99 : i; };
  const named = code.filter((f) => nameRank(f.path) < 99 && depth(f.path.replace(/^(src|app|cmd\/[^/]+|lib|source)\//, '')) === 0 && !/(^|\/)(test|tests|__tests__|spec|examples?|docs?)\//i.test(f.path));
  if (named.length) {
    named.sort((a, b) => depth(a.path) - depth(b.path) || nameRank(a.path) - nameRank(b.path) || b.importance - a.importance);
    return { path: named[0].path, why: 'its name (' + base(named[0].path) + ') and place near the root mark it as the starting point' };
  }
  const top = [...code].sort((a, b) => b.importance - a.importance)[0];
  return { path: top.path, why: 'it has the highest importance score (size + how many files import it)' };
}

/** ~5 files to read first, in order: entry, the most-used files, then config and the readme. */
export function whereToStart(files, entry) {
  const out = [], seen = new Set();
  const push = (f, why) => { if (f && !seen.has(f.path) && !f.secret) { seen.add(f.path); out.push({ path: f.path, why }); } };
  const by = Object.create(null); for (const f of files) by[f.path] = f;
  if (entry && by[entry.path]) push(by[entry.path], 'Start here: the entry file. ' + entry.why[0].toUpperCase() + entry.why.slice(1) + '.');
  const used = files.filter((f) => isCode(f) && f.usedBy.length > 0).sort((a, b) => b.usedBy.length - a.usedBy.length || b.importance - a.importance);
  for (const f of used) { if (out.length >= 3) break; push(f, `Used by ${f.usedBy.length} file${f.usedBy.length === 1 ? '' : 's'}: once you know it, a lot of the code makes sense.`); }
  if (out.length < 3) for (const f of files.filter(isCode).sort((a, b) => b.importance - a.importance)) { if (out.length >= 3) break; push(f, 'One of the biggest, most connected code files.'); }
  const cfg = files.filter((f) => CONFIG_RE.test(f.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  push(cfg, 'Config: shows the dependencies, scripts and how the project is built and run.');
  const readme = files.filter((f) => README_RE.test(f.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  push(readme, 'The readme: what the project is for, in the authors\' own words.');
  if (out.length < 5) for (const f of used) { if (out.length >= 5) break; push(f, `Used by ${f.usedBy.length} files.`); }
  return out.slice(0, 5);
}

/* ---------- roles, intros and offline answers ---------- */
const ROLE = { core: 'a core file the project leans on', ui: 'a UI piece (what people see)', hook: 'a reusable hook', util: 'a helper / utility', style: 'styles (how things look)', test: 'a test (it checks other code works)', config: 'configuration', docs: 'documentation', ci: 'automation (CI)', markup: 'markup / a page', asset: 'an asset', secret: 'a secrets file', block: 'a group of small files' };
export function roleOf(f) {
  if (f.secret) return 'the vault (a secrets file)';
  if (f.lockfile) return 'a lockfile (pinned dependency versions)';
  if (README_RE.test(f.path)) return 'the readme';
  if (CONFIG_RE.test(f.path)) return 'project configuration';
  return ROLE[f.kind] || 'part of the project';
}
const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? '' : 's'}`;
const listNames = (ps, n = 3) => ps.slice(0, n).map(base).join(', ') + (ps.length > n ? ` and ${ps.length - n} more` : '');
export const topSymbols = (f, n = 5) => (f.symbols || []).filter((s) => s.k !== 'var' || s.e).sort((a, b) => (b.e || 0) - (a.e || 0) || ((b.end || b.l) - b.l) - ((a.end || a.l) - a.l)).slice(0, n);
const symName = (s) => s.n + (s.k === 'fn' || s.k === 'method' ? '()' : '');

/** First-person intro for the building chat ("Hi, I'm auth.ts…"). */
export function introOf(f) {
  const n = base(f.path);
  if (f.secret) return `Hi, I'm ${n}, the vault. I hold secrets, so CodeLens only knows my name and never reads me. Keep me out of git!`;
  if (f.binary) return `Hi, I'm ${n}, ${/\.(mp3|wav|ogg|m4a|flac)$/i.test(f.path) ? 'a sound file' : /\.(mp4|webm)$/i.test(f.path) ? 'a video' : 'a binary file'} (${(f.bytes / 1024).toFixed(1)} KB). No code in me to explain.`;
  const parts = [`Hi, I'm ${n}! I'm ${roleOf(f)}, ${f.estimated ? 'about ' : ''}${plural(f.loc, 'line')} of ${f.language}.`];
  const ex = topSymbols(f, 3);
  if (ex.length) parts.push(`My main ${ex.length === 1 ? 'piece is' : 'pieces are'} ${ex.map(symName).join(', ')}.`);
  if (f.usedBy.length) parts.push(`${plural(f.usedBy.length, 'file')} ${f.usedBy.length === 1 ? 'uses' : 'use'} me.`);
  else if (!f.lockfile) parts.push('No other file imports me' + (f.kind === 'test' ? ' (normal for a test).' : ', so I may be an entry point, a page or a script.'));
  return parts.join(' ');
}

export const SUGGESTIONS = ['What do you do?', 'Who uses you?', 'What should I read first?', 'Explain line '];

/** Offline answer (no key): only facts from the analysis, never invented. */
export function localAnswer(question, f, ctx = {}) {
  const q = question.toLowerCase(), n = base(f.path);
  const lineM = /line\s*(\d+)/.exec(q);
  if (lineM) {
    const ln = +lineM[1], text = ctx.lineText;
    const sym = (f.symbols || []).filter((s) => s.l <= ln && (s.end || s.l) >= ln).sort((a, b) => b.l - a.l)[0];
    if (text == null) return `I can't see line ${ln} right now. Open my code (it's beside me) and ask again, or add a Gemini key for a real explanation.`;
    const t = text.trim();
    let what = 'a line of code';
    if (!t) what = 'an empty line';
    else if (/^(import|from|require|using|#include|use )\b/.test(t) || /require\(/.test(t)) what = 'an import: it pulls in code from another file or package';
    else if (/^(export\s+)?(async\s+)?(function|def|fn|func)\b/.test(t)) what = 'the start of a function definition';
    else if (/^(export\s+)?(abstract\s+)?(class|struct|interface|type|enum)\b/.test(t)) what = 'a type / class definition';
    else if (/^(if|else|elif|switch|case|match)\b|\?\s/.test(t)) what = 'a decision (a branch): the code goes one way or another here';
    else if (/^(for|while|do|loop)\b|\.(map|forEach|filter|reduce)\(/.test(t)) what = 'a loop: it repeats work for many items';
    else if (/^return\b/.test(t)) what = 'a return: it hands a result back to whoever called the function';
    else if (/^(\/\/|#|\/\*|\*)/.test(t)) what = 'a comment: a note for humans, the computer ignores it';
    else if (/^(const|let|var)\b|^\w+\s*=/.test(t)) what = 'a variable assignment: it stores a value under a name';
    else if (/^(try|catch|except|finally)\b/.test(t)) what = 'error handling';
    else if (/\w+\(.*\)\s*;?$/.test(t)) what = 'a function call';
    return `Line ${ln} is ${what}${sym ? `, inside ${symName(sym)} (lines ${sym.l}–${sym.end || sym.l})` : ''}:\n${t.slice(0, 200)}\n(Offline explanation from the code's shape. Add a Gemini key for a fuller answer.)`;
  }
  if (/who (uses|imports|needs)|used by|depend/.test(q)) {
    if (!f.usedBy.length) return `Nobody imports me. ${f.kind === 'test' ? 'I am a test, so the test runner calls me.' : 'I am probably started directly (an entry point, a page, a script or a config file).'}`;
    return `${plural(f.usedBy.length, 'file')} ${f.usedBy.length === 1 ? 'uses' : 'use'} me: ${listNames(f.usedBy, 6)}. In the city, the blue arcs come from them.`;
  }
  if (/read first|start|where.*begin|next/.test(q)) {
    const order = (ctx.start || []).map((s, i) => `${i + 1}. ${base(s.path)}`);
    const mine = f.uses.length ? `Before me, read what I import: ${listNames(f.uses, 4)}.` : 'I don\'t import other project files, so you can read me on my own.';
    return mine + (order.length ? ` For the whole project, the suggested order is: ${order.join(', ')}.` : '');
  }
  if (/what (do|does)|purpose|role|explain|about you|who are you|summar/.test(q)) {
    const ex = topSymbols(f, 6);
    const h = f.health ? ` My complexity score is ${f.health.s}/100 (${{ good: 'healthy', warn: 'worth watching', bad: 'complex' }[f.health.lv]}).` : '';
    return `I'm ${roleOf(f)} in ${f.path.includes('/') ? dirOf(f.path) + '/' : 'the project root'}. ` +
      (ex.length ? `I define ${ex.map(symName).join(', ')}. ` : '') +
      (f.uses.length ? `I import ${listNames(f.uses)}. ` : '') +
      (f.usedBy.length ? `${plural(f.usedBy.length, 'file')} rely on me.` : '') + h +
      ' (Facts from the code, no AI. Add a Gemini key for a plain-words explanation.)';
  }
  return `Offline, I can tell you what I do, who uses me, what to read first, or explain a line ("Explain line 12"). For any other question, add a free Gemini key.`;
}

/* ---------- summary slideshow ---------- */
/** Slides: the entry file first, then the files it imports by importance (then other key files). */
export function summaryPlan(files, entry, max = 8) {
  const by = Object.create(null); for (const f of files) by[f.path] = f;
  const e = entry && by[entry.path]; if (!e) return [];
  const out = [e], seen = new Set([e.path]);
  for (const p of [...e.uses].sort((a, b) => (by[b]?.importance || 0) - (by[a]?.importance || 0))) { if (out.length >= max) break; if (by[p] && !by[p].secret) { out.push(by[p]); seen.add(p); } }
  // second level: what the imports import, by importance
  if (out.length < max) {
    const next = [...new Set(out.slice(1).flatMap((f) => f.uses))].filter((p) => !seen.has(p) && by[p] && !by[p].secret).sort((a, b) => by[b].importance - by[a].importance);
    for (const p of next) { if (out.length >= max) break; out.push(by[p]); seen.add(p); }
  }
  if (out.length < Math.min(4, max)) for (const f of files.filter(isCode).sort((a, b) => b.importance - a.importance)) { if (out.length >= Math.min(4, max)) break; if (!seen.has(f.path)) { out.push(f); seen.add(f.path); } }
  return out.map((f, i) => ({ path: f.path, step: i + 1, from: i === 0 ? null : (e.uses.includes(f.path) ? e.path : out.slice(1, i).find((g) => g.uses.includes(f.path))?.path || null) }));
}

/** Plain narration for one slide. The first slide walks through the entry file's functions in order. */
export function slideText(f, slide, entry, all) {
  const n = base(f.path);
  if (slide.step === 1) {
    const fns = (f.symbols || []).filter((s) => s.k === 'fn' || s.k === 'method' || s.k === 'class').sort((a, b) => a.l - b.l);
    const flow = fns.length
      ? 'Reading it top to bottom: ' + fns.slice(0, 6).map((s, i) => `${i === 0 ? 'first' : i === fns.length - 1 || i === 5 ? 'finally' : 'then'} ${symName(s)} (line ${s.l}${s.end ? '–' + s.end : ''})`).join(', ') + (fns.length > 6 ? `, plus ${fns.length - 6} more` : '') + '.'
      : 'It has no named functions: its code runs top to bottom when the program starts.';
    return `${n} is where the program starts: ${entry.why}. ${flow} ${f.uses.length ? `It brings in ${plural(f.uses.length, 'project file')}; the next slides add them one by one.` : 'It does not import other project files.'}`;
  }
  const ex = topSymbols(f, 3);
  const from = slide.from ? base(slide.from) : null;
  return `${from ? `${from} imports ${n}` : `${n} joins the city`}. It is ${roleOf(f)} (${plural(f.loc, 'line')} of ${f.language})` +
    (ex.length ? ` and gives the rest of the code ${ex.map(symName).join(', ')}` : '') + '. ' +
    (f.usedBy.length > 1 ? `${plural(f.usedBy.length, 'file')} depend on it.` : f.usedBy.length === 1 ? 'Only one file uses it.' : '') +
    (slide.step === all ? ' That is the core of the project: everything else builds on these files.' : '');
}

/* ---------- search ---------- */
/** Build a flat index once: files (name + path) and their functions / exports. */
export function searchIndex(files) {
  const items = [];
  for (const f of files) {
    items.push({ t: 'file', label: base(f.path), sub: f.path, path: f.path, key: base(f.path).toLowerCase(), key2: f.path.toLowerCase() });
    for (const s of f.symbols || []) items.push({ t: s.k, label: s.n, sub: `${f.path}:${s.l}`, path: f.path, line: s.l, key: s.n.toLowerCase(), key2: '', exp: !!s.e });
  }
  return items;
}
/** Rank: exact > prefix > word start > substring > subsequence on the name; path matches after. */
export function search(index, query, limit = 30) {
  const q = query.trim().toLowerCase(); if (!q) return [];
  const scored = [];
  for (const it of index) {
    let s = 0;
    if (it.key === q) s = 100;
    else if (it.key.startsWith(q)) s = 80 - Math.min(20, it.key.length - q.length);
    else if (new RegExp('(^|[^a-z0-9])' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(it.key)) s = 60;
    else if (it.key.includes(q)) s = 45;
    else if (it.key2 && it.key2.includes(q)) s = 30;
    else if (q.length >= 3 && subseq(it.key, q)) s = 12;
    if (!s) continue;
    if (it.t === 'file') s += 4; if (it.exp) s += 3;
    scored.push([s, it]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].label.length - b[1].label.length || a[1].sub.localeCompare(b[1].sub));
  return scored.slice(0, limit).map((x) => x[1]);
}
function subseq(s, q) { let i = 0; for (let j = 0; j < s.length && i < q.length; j++) if (s[j] === q[i]) i++; return i === q.length; }
