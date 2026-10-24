/* workspace.html: the CodeLens workspace, wired to the real project.
   The project comes only from the user's import (GitHub link, .zip or folder), stored in
   IndexedDB by building.html. There is no sample data: with nothing imported the page shows
   an "Import a repo first" empty state that links back to the import plate.
   The city is the live CodeCity engine (app/city/engine.js) built from that project. */
import { enterFocus, exitFocus, isFocus, setSourceProvider, setBuildingProvider, setProjectName } from './focus.js';
import { offerKeyOnce } from './keydlg.js';
import { initBuildingChat } from './bchat.js';
import { initSearch } from './search.js';
import { initSummary } from './summary.js';
import { findEntry, whereToStart } from './insights.js';
import { mountChip, noteSaved } from './account.js';
import { createCity } from './city/engine.js';
import { FEATURES } from './features.js';
import * as Lib from './citylib/index.js';
import { initChat } from './chat.js';
import { showMedia, clearMedia } from './media.js';
const MEDIA_RE = /\.(mp3|wav|ogg|m4a|flac|mp4|webm)$/i;

const $ = (s, r = document) => r.querySelector(s);
const q = new URLSearchParams(location.search);
const CL = window.CodeLens;
const base = p => p.split('/').pop();
const SKIP_SHORT = { 'ignored-dir': 'in dependency/tool folders', 'build-output': 'generated build output', 'os-metadata': 'OS metadata', minified: 'minified / source maps', vendored: 'vendored', 'unsafe-path': 'unsafe paths', 'over-cap': 'over the file limit' };
const SKIP_LONG = { 'ignored-dir': 'dependency / tool folders (node_modules, .git, caches, virtualenvs)', 'build-output': 'generated build output (dist / build / out with source maps, hashed or minified bundles)', 'os-metadata': 'OS metadata (__MACOSX, ._ files, .DS_Store, Thumbs.db)', minified: 'minified files and source maps', vendored: 'vendored third-party code (vendor/, third_party/)', 'unsafe-path': 'unsafe paths (absolute or ..), ignored for safety', 'over-cap': 'over the 5,000 file limit' };
// Lookups keyed by repo-controlled paths: null-prototype objects, so a file called
// `__proto__` / `constructor` (or ?file=__proto__) can never hit Object.prototype.
const table = entries => Object.assign(Object.create(null), Object.fromEntries(entries));

/* Day / night (feature flag dayNight): light mode = day with a sun, dark mode = night with a moon,
   stars and lit windows. One toggle in the header, remembered in this browser. */
const THEME_KEY = 'codelens.theme';
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked */ } } };
let night = FEATURES.dayNight && ls.get(THEME_KEY) === 'night';
let onTheme = () => {};
{
  const btn = $('[data-theme]');
  const paint = () => {
    document.body.classList.toggle('is-night', night);
    btn.setAttribute('aria-pressed', String(night));
    btn.title = night ? 'Switch to day (sun)' : 'Switch to night (moon)';
    $('[data-theme-label]').textContent = night ? 'Night' : 'Day';
  };
  btn.hidden = !FEATURES.dayNight;
  btn.addEventListener('click', () => { night = !night; ls.set(THEME_KEY, night ? 'night' : 'day'); paint(); onTheme(night); });
  paint();
}

if (FEATURES.accounts !== false) { try { mountChip($('.ws-bar'), $('[data-intro-open]')); } catch (err) { console.warn('[codelens] account chip', err); } }

let stored = null;
try { stored = await CL.loadProject(); } catch (err) { console.warn('[codelens] no stored project', err); }
let started = false;
if (stored && Array.isArray(stored.files) && stored.files.length) {
  try { started = true; run(stored); if (FEATURES.accounts !== false) noteSaved(); }
  catch (err) {
    // A stored project this version can't read (old format, edited by hand): don't crash, ask for a fresh import.
    console.warn('[codelens] stored project unreadable', err);
    started = false;
    CL.clearProject().catch(() => {});
    $('.ws-empty__eyebrow').textContent = 'Saved project could not be read';
  }
}
if (!started) {
  // Empty state: nothing has been imported (no sample fallback).
  document.body.classList.add('ws-is-empty');
  $('.ws').hidden = true;
  $('[data-empty]').hidden = false;
  document.title = 'Import a repo first · CodeLens';
  $('[data-intro-open]').hidden = true;
  $('[data-sidetoggle]').hidden = true;
  window.__workspaceReady = true;
}

function run(project) {
const files = project.files;
let current = null;   // the selected file path
const byPath = table(files.map(f => [f.path, f]));
const plan = CL.plan(project, { parks: FEATURES.parks, plazas: FEATURES.plazas, glowArtery: FEATURES.glowArtery, gateway: FEATURES.gateway });
const bById = table(plan.buildings.map(b => [b.id, b]));
const buildingOf = p => bById[plan.fileToBuilding[p]];
window.__codelensPlan = plan;

const TIER = { tall: 'Tall building', medium: 'Medium building', small: 'Small shop', vault: 'Vault' };
const tierOf = f => { const b = buildingOf(f.path); return b ? (b.members ? 'Small block (' + b.members.length + ' files)' : TIER[b.tier]) : 'Small shop'; };
const modOf = f => buildingOf(f.path)?.moduleType || f.moduleType || 'utility';

/* header + import note */
document.title = project.name + ' · CodeLens workspace';
$('.ws-proj__name').textContent = project.name;
const src = project.source;
$('[data-projchip]').textContent = src.kind === 'github' ? 'GitHub' : src.kind === 'zip' ? '.zip' : 'Folder';
$('.ws-ask input').placeholder = 'Ask anything about ' + project.name;
$('[data-filecount]').textContent = files.length.toLocaleString();
{
  const el = $('[data-import]'), st = project.stats;
  const parts = [];
  {
    parts.push((src.kind === 'github' ? 'Built from github.com/' + src.owner + '/' + src.repo + ' (' + src.branch + ')' : 'Built from ' + (src.name || project.name)) +
      ': ' + st.filesCounted.toLocaleString() + ' files, ' + st.totalLoc.toLocaleString() + ' lines of code' + (st.filesSkipped ? ', ' + st.filesSkipped.toLocaleString() + ' skipped' : '') + '.');
    if (plan.stats.aggregatedFiles) parts.push(plan.stats.aggregatedFiles.toLocaleString() + ' small files are grouped into small blocks so the city stays readable.');
    for (const w of project.warnings || []) parts.push(w);
  }
  el.hidden = false; el.textContent = parts.join(' ');
  // "X files skipped: reasons", with a few example paths per reason.
  const sk = Object.entries(st.skipped || {}).filter(([, n]) => n > 0);
  if (sk.length) {
    const d = document.createElement('details'); d.className = 'ws-skipped'; d.dataset.skipped = '';
    const sum = document.createElement('summary');
    sum.textContent = st.filesSkipped.toLocaleString() + ' file' + (st.filesSkipped === 1 ? '' : 's') + ' skipped: ' + sk.map(([r, n]) => n.toLocaleString() + ' ' + (SKIP_SHORT[r] || r)).join(', ');
    const ul = document.createElement('ul');
    for (const [r, n] of sk) {
      const li = document.createElement('li');
      const b = document.createElement('b'); b.textContent = n.toLocaleString() + ' · ' + (SKIP_LONG[r] || r); li.append(b);
      const ex = (st.skippedExamples || {})[r] || [];
      if (ex.length) { const c = document.createElement('code'); c.textContent = ex.join(', ') + (n > ex.length ? ', …' : ''); li.append(' ', c); }
      ul.append(li);
    }
    d.append(sum, ul); el.append(' ', d);
  }
}

/* plain-words explanation of a building (shown in the Talk panel) */
function plain(f) {
  const n = base(f.path), b = buildingOf(f.path), dir = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : '';
  const where = dir ? ` It stands in the ${dir}/ district (folder).` : ' It stands in the town centre (the project root).';
  if (f.secret) return `This is ${n}, a secrets file. In the city it is the Vault: CodeLens shows only its name and never reads what is inside.${where}`;
  if (f.binary && MEDIA_RE.test(f.path)) return `This is ${n}, ${/\.(mp4|webm)$/i.test(f.path) ? 'a video' : 'an audio'} file (${(f.bytes / 1024).toFixed(1)} KB). Open the Code tab or double-click the building to play it.${where}`;
  if (f.binary) return `This is ${n}, a binary file (${(f.bytes / 1024).toFixed(1)} KB, no readable code). Its building is small and plain.${where}`;
  const by = f.usedBy.length, uses = f.uses.length, lines = (f.lines || f.loc || 0);
  const a = /^[aeiou]/i.test(f.language) ? 'an' : 'a';
  let t = `This is ${n}, ${a} ${f.language} file with ${(f.estimated ? 'about ' : '') + lines.toLocaleString()} line${lines === 1 ? '' : 's'}` +
    (by ? `, used by ${by} file${by === 1 ? '' : 's'}` : ', not imported by any other file') + (uses ? ` and imports ${uses} file${uses === 1 ? '' : 's'}` : '') + '.';
  if (b && b.members) t += ` It is small, so it shares a small block with ${b.members.length - 1} other small file${b.members.length === 2 ? '' : 's'}.`;
  else if (b) t += ` Its building is ${b.tier === 'tall' ? 'one of the tall towers' : b.tier === 'medium' ? 'a medium building' : 'a small shop'}: height comes from its lines of code` + (by ? ', and the plot grows with how many files import it.' : '.');
  return t + where;
}

/* file tree: VS Code-style collapsible folders (folders first, alphabetical). Only expanded
   folders are rendered, so 1,000+ files stay smooth. Top-level entries show; folders start
   collapsed except the path to the selected file. Open folders are remembered per project. */
const list = $('[data-files]');
const tree = (() => {
  const root = { path: '', dirs: new Map(), files: [] };
  for (const f of files) {
    const parts = f.path.split('/'); let n = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const dp = parts.slice(0, i + 1).join('/');
      let c = n.dirs.get(parts[i]); if (!c) { c = { name: parts[i], path: dp, dirs: new Map(), files: [] }; n.dirs.set(parts[i], c); }
      n = c;
    }
    n.files.push(f);
  }
  const TKEY = 'codelens.tree.' + (src.kind === 'github' ? src.owner + '/' + src.repo : src.kind + ':' + (src.name || project.name));
  let open = new Set(), litDir = null;
  try { const v = JSON.parse(ls.get(TKEY) || '[]'); if (Array.isArray(v)) open = new Set(v.filter(x => typeof x === 'string').slice(0, 2000)); } catch { /* bad JSON */ }
  const save = () => ls.set(TKEY, JSON.stringify([...open].slice(0, 2000)));
  const cmp = (a, b) => a.localeCompare(b);
  function rows(n, d, frag) {
    for (const k of [...n.dirs.keys()].sort(cmp)) {
      const c = n.dirs.get(k), isOpen = open.has(c.path);
      const li = document.createElement('li'); li.className = 'ws-dir'; li.style.setProperty('--d', d);
      const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'ws-dirbtn' + (c.path === litDir ? ' is-district' : ''); bt.dataset.dir = c.path; bt.title = c.path + '/';
      bt.setAttribute('aria-expanded', String(isOpen)); bt.innerHTML = '<i class="ws-chev" aria-hidden="true"></i>'; bt.append(c.name);
      li.append(bt); frag.append(li);
      if (isOpen) rows(c, d + 1, frag);
    }
    for (const f of [...n.files].sort((a, b) => cmp(base(a.path), base(b.path)))) {
      const li = document.createElement('li'); li.style.setProperty('--d', d);
      const bt = document.createElement('button'); bt.type = 'button'; bt.dataset.path = f.path; bt.className = 'ws-file ws-file--' + (f.secret ? 'vault' : modOf(f));
      bt.innerHTML = '<span class="ws-file__dot"></span>'; bt.append(base(f.path)); bt.title = f.path;
      if (f.path === current) bt.setAttribute('aria-current', '');
      li.append(bt); frag.append(li);
    }
  }
  function render() { const frag = document.createDocumentFragment(); rows(root, 0, frag); const top = list.scrollTop; list.replaceChildren(frag); list.scrollTop = top; }
  function reveal(p) {   // open every folder on the way to p; true if something changed
    const parts = p.split('/'); let changed = false;
    for (let i = 1; i < parts.length; i++) { const dp = parts.slice(0, i).join('/'); if (!open.has(dp)) { open.add(dp); changed = true; } }
    if (changed) { save(); render(); }
    return changed;
  }
  list.addEventListener('click', e => {
    const bt = e.target.closest('.ws-dirbtn'); if (!bt) return;
    const dp = bt.dataset.dir;
    if (open.has(dp)) { for (const o of [...open]) if (o === dp || o.startsWith(dp + '/')) open.delete(o); } else open.add(dp);
    save(); render();
    list.querySelector('[data-dir="' + CSS.escape(dp) + '"]')?.focus({ preventScroll: true });
    // the folder's own district lights up in the city (folders with only sub-folders have none)
    litDir = city.setDistrict?.(dp) ? dp : null;
    list.querySelectorAll('.ws-dirbtn.is-district').forEach(x => x.classList.remove('is-district'));
    if (litDir) list.querySelector('[data-dir="' + CSS.escape(dp) + '"]')?.classList.add('is-district');
  });
  $('[data-collapse-all]').addEventListener('click', () => { open.clear(); save(); render(); if (current) reveal(current); list.scrollTop = 0; });
  render();
  return { reveal, render, get openDirs() { return [...open]; } };
})();

/* collapsible files sidebar: header button or Ctrl+B / Cmd+B (like VS Code), remembered in this browser */
{
  const btn = $('[data-sidetoggle]'), TREE_KEY = 'codelens.sidebar';
  const set = (off, save) => {
    document.body.classList.toggle('tree-off', off);
    btn.setAttribute('aria-expanded', String(!off));
    btn.title = (off ? 'Show' : 'Hide') + ' the files sidebar (Ctrl+B)';
    $('[data-side-label]').textContent = off ? 'Show files' : 'Hide files';
    $('#ws-tree').inert = off;
    if (save) ls.set(TREE_KEY, off ? 'off' : 'on');
  };
  document.body.classList.add('no-anim'); set(ls.get(TREE_KEY) === 'off', false);
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-anim')));
  const toggle = () => set(!document.body.classList.contains('tree-off'), true);
  btn.addEventListener('click', toggle);
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'B') && !document.querySelector('dialog[open]')) { e.preventDefault(); e.stopPropagation(); toggle(); }
  }, true);
  window.CodeLensSidebar = { toggle, set: off => set(off, true), get open() { return !document.body.classList.contains('tree-off'); } };
}

/* the live city */
const host = $('[data-city]');
let colorBy = FEATURES.colorCoding && ['moduleType', 'language', ...(FEATURES.healthColors ? ['health'] : [])].includes(q.get('colorBy')) ? q.get('colorBy') : 'none';
const city = createCity(host, plan, {
  colorBy, night, labels: FEATURES.folderLabels && q.get('labels') !== '0',
  onSelect: id => { const b = bById[id]; select(b.members ? b.members[0] : id); },
  onOpen: id => { const b = bById[id]; const p = b.members ? b.members[0] : id; select(p); enterFocus(p, byPath[p]); },
});
window.__codelensCity = city;
onTheme = on => city.setNight && city.setNight(on, true);

let chat = null;
/* Talk to the file */
function say(f) {
  if (f.description) return f.description;
  const n = base(f.path), b = buildingOf(f.path);
  if (f.secret) return `I'm ${n}, the vault. I hold secrets, so CodeLens only knows my name; my contents are never read.`;
  if (f.lockfile) return `I'm ${n}, a lockfile. Tools write me (${(f.lines || 0).toLocaleString()} lines) to pin exact dependency versions, so my lines don't count as code.`;
  if (f.binary && MEDIA_RE.test(f.path)) return `I'm ${n}, ${/\.(mp4|webm)$/i.test(f.path) ? 'a video' : 'a sound'} file (${(f.bytes / 1024).toFixed(1)} KB). No code in me, but you can play me.`;
  if (f.binary) return `I'm ${n}, a binary file (${(f.bytes / 1024).toFixed(1)} KB). There is no code in me to explain.`;
  const uses = f.uses.length, by = f.usedBy.length;
  return `I'm ${n}, ${f.loc.toLocaleString()} lines of ${f.language} code${b && b.tier === 'tall' ? ', one of the tallest towers in town' : ''}. ` +
    `I use ${uses} file${uses === 1 ? '' : 's'} here and ${by} file${by === 1 ? '' : 's'} use${by === 1 ? 's' : ''} me.`;
}
function li(p, kind) {
  const l = document.createElement('li');
  if (byPath[p]) { const b = document.createElement('button'); b.type = 'button'; b.dataset.path = p; b.textContent = base(p); b.title = p; l.append(b); }
  else l.textContent = p;
  if (kind && kind !== 'import') { const k = document.createElement('span'); k.textContent = kind; l.append(k); }
  return l;
}
function select(p, push) {
  const f = byPath[p]; if (!f) return;
  current = p;
  tree.reveal(p);
  document.querySelectorAll('.ws-files [data-path]').forEach(e => e.toggleAttribute('aria-current', e.dataset.path === p));
  const cur = list.querySelector('[aria-current]'); if (cur && push !== false) cur.scrollIntoView({ block: 'nearest' });
  const b = buildingOf(p); city.select(b ? b.id : null);
  $('[data-path]', $('.ws-who')).textContent = p;
  $('[data-tier]').textContent = tierOf(f); $('[data-type]').textContent = f.secret ? 'secrets' : modOf(f);
  $('[data-lines]').textContent = f.secret ? 'not read' : f.binary ? (f.bytes / 1024).toFixed(1) + ' KB' : (f.estimated ? '~' : '') + (f.lines || f.loc).toLocaleString() + ' lines';
  $('[data-langname]').textContent = f.secret || f.binary ? '' : f.language;
  $('[data-plain]').textContent = plain(f);
  {
    const h = $('[data-health]'), fh = FEATURES.healthColors && f.health;
    h.hidden = !fh;
    if (fh) {
      const L = { good: 'healthy', warn: 'worth watching', bad: 'complex' }[fh.lv] || fh.lv;
      h.className = 'ws-health ws-health--' + fh.lv;
      h.replaceChildren();
      const b = document.createElement('b'); b.textContent = 'Health ' + (100 - fh.s) + '/100 · ' + L;
      const sp = document.createElement('span');
      sp.textContent = `Complexity ${fh.s}/100 from ${fh.br} branches, nesting depth ${fh.dp}` + (fh.fn ? `, longest function ${fh.fn} lines${fh.fnName ? ' (' + fh.fnName + ')' : ''}` : '') + '. A static estimate, not a verdict.';
      h.append(b, sp);
    }
  }
  $('[data-say]').textContent = say(f);
  $('[data-saycap]').textContent = f.description ? 'Summary from the import.' : 'From the file\'s real stats (no AI). Ask a question below for a Gemini answer; AI can be wrong.';
  chat && chat.renderKey();
  const uses = $('[data-uses]'), by = $('[data-by]'); uses.replaceChildren(); by.replaceChildren();
  f.uses.slice(0, 200).forEach(t => uses.append(li(t)));
  f.usedBy.slice(0, 200).forEach(t => by.append(li(t)));
  if (!uses.children.length) uses.append(Object.assign(document.createElement('li'), { className: 'is-none', textContent: 'Nothing' }));
  if (!by.children.length) by.append(Object.assign(document.createElement('li'), { className: 'is-none', textContent: 'Nobody yet' }));
  $('[data-tabfile]').textContent = base(p); $('[data-codefile]').textContent = p;
  if (!$('#view-code').hidden) showCode(p);
  if (push !== false) history.replaceState(null, '', '?' + new URLSearchParams({ ...Object.fromEntries(q), file: p }).toString());
}

/* Code tab: the real source, read only */
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
async function source(p) { return CL.getSource(project, p); }
async function showCode(p) {
  const real = $('[data-code-real]'), none = $('[data-code-none]'), msg = $('[data-nocode-msg]');
  real.hidden = true; none.hidden = false; msg.hidden = false; msg.textContent = 'Loading ' + base(p) + '…';
  clearMedia(none);
  const s = await source(p);
  if (current !== p) { if (s.kind === 'media' && s.revoke) URL.revokeObjectURL(s.url); return; }
  if (s.kind === 'media') { msg.hidden = true; showMedia(none, s, base(p)); $('[data-codenote]').textContent = 'Read only · player'; return; }
  if (s.kind !== 'text') { msg.textContent = s.message; $('[data-codenote]').textContent = 'Read only'; return; }
  const lines = s.text.replace(/\n$/, '').split('\n');
  $('[data-code-lines]').innerHTML = lines.map((l, i) => '<span class="ln">' + (i + 1) + '</span>' + esc(l)).join('\n');
  real.hidden = false; none.hidden = true; real.scrollTop = 0;
  $('[data-codenote]').textContent = (s.note ? s.note + ' · ' : '') + 'Read only' + (s.truncated ? ' · first ' + lines.length + ' lines' : '');
}

/* Gemini chat (Talk panel + Ask anything), also usable beside Monaco in focus mode */
chat = initChat({
  project, current: () => current, source,
  fileContext: p => fileContext(p),
  projectContext: () => {
    const st = project.stats;
    const dirs = {}; for (const f of files) { const d = f.path.includes('/') ? f.path.split('/')[0] + '/' : '(root)'; dirs[d] = (dirs[d] || 0) + 1; }
    return [`${files.length} files, ${st.totalLoc.toLocaleString()} lines of code, ${st.imports} imports.`,
      'Languages: ' + st.languages.slice(0, 8).map(l => l.language + ' ' + l.loc).join(', '),
      'Top folders: ' + Object.entries(dirs).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, n]) => d + ' (' + n + ')').join(', '),
      'Largest files: ' + st.largest.slice(0, 10).map(l => l.path + ' (' + l.loc + ' loc)').join(', '),
      'Most imported: ' + [...files].sort((a, b) => b.usedBy.length - a.usedBy.length).slice(0, 10).map(f => f.path + ' (' + f.usedBy.length + ')').join(', ')].join('\n');
  },
});

/* intro: what the buildings mean (first visit; reopen with ?) */
{
  const dlg = $('[data-intro]'), never = $('[data-intro-never]');
  const open = () => { never.checked = ls.get('codelens.introSeen') === '1'; if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); } };
  const close = () => { if (never.checked) ls.set('codelens.introSeen', '1'); else if (ls.get('codelens.introSeen') === '1') ls.set('codelens.introSeen', '0'); dlg.close(); };
  // The Gemini key pop-up is offered once, right after the intro closes (and whenever AI is used without a key).
  dlg.addEventListener('close', () => { if (q.get('key') !== '0') setTimeout(offerKeyOnce, 250); });
  dlg.querySelectorAll('[data-intro-close]').forEach(b => b.addEventListener('click', close));
  dlg.addEventListener('cancel', () => { if (never.checked) ls.set('codelens.introSeen', '1'); });
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  $('[data-intro-open]').addEventListener('click', open);
  window.CodeLensIntro = { open, close };
  if (ls.get('codelens.introSeen') !== '1' && q.get('intro') !== '0') open();
  else if (q.get('key') !== '0') setTimeout(offerKeyOnce, 600);
}

/* focus mode gets the same data */
setProjectName(project.name);
setSourceProvider(source);
setBuildingProvider(p => buildingOf(p));

document.addEventListener('click', e => {
  const b = e.target.closest('button[data-path]'); if (!b) return;
  select(b.dataset.path);
  if (isFocus()) enterFocus(b.dataset.path, byPath[b.dataset.path]);
});
document.addEventListener('dblclick', e => {
  const b = e.target.closest('.ws-file'); if (!b) return;
  e.preventDefault(); getSelection && getSelection().removeAllRanges();
  select(b.dataset.path); enterFocus(b.dataset.path, byPath[b.dataset.path]);
});
document.querySelectorAll('.ws-focus__close, .ws-focus__back').forEach(b => b.addEventListener('click', exitFocus));
window.CodeLensWorkspace = { focus: p => { select(p); enterFocus(p, byPath[p]); }, exit: exitFocus, select, city, plan };
new MutationObserver(() => city.pause(document.body.classList.contains('is-focus') || document.body.classList.contains('is-sum') || $('#view-city').hidden)).observe(document.body, { attributes: true, attributeFilter: ['class'] });

/* colour-code + folder label toggles (feature flags: colorCoding, folderLabels) */
const cbBtn = $('[data-colorby]'), lbBtn = $('[data-labels]');
const CB = ['none', 'moduleType', 'language', ...(FEATURES.healthColors ? ['health'] : [])], CBN = { none: 'none', moduleType: 'module type', language: 'language', health: 'code health' };
function renderToggles() {
  cbBtn.textContent = 'Colour: ' + CBN[city.colorBy]; cbBtn.setAttribute('aria-pressed', String(city.colorBy !== 'none'));
  lbBtn.textContent = 'Folder labels: ' + (city.labels ? 'on' : 'off'); lbBtn.setAttribute('aria-pressed', String(city.labels));
  const used = new Set(plan.buildings.map(b => city.colorBy === 'language' ? b.language : city.colorBy === 'health' ? (b.health || 'none') : b.moduleType));
  const L = Lib.legendFor(city.colorBy).filter(e => used.has(city.colorBy === 'health' ? e.level : e.key === 'data / db' ? 'data' : e.key));
  $('[data-colorlegend]').innerHTML = L.map(e => `<span><i style="background:${e.color}"></i>${e.key}</span>`).join('');
}
cbBtn.hidden = !FEATURES.colorCoding; lbBtn.hidden = !FEATURES.folderLabels;
cbBtn.addEventListener('click', () => { city.setColorBy(CB[(CB.indexOf(city.colorBy) + 1) % CB.length]); renderToggles(); });
lbBtn.addEventListener('click', () => { city.setLabels(!city.labels); renderToggles(); });
renderToggles();

/* ---- learning helpers: where to start, search, building chat, summary ---- */
const fileContext = p => {
  const f = byPath[p]; if (!f) return '';
  const syms = (f.symbols || []).slice(0, 40).map(x => x.n + ' (' + x.k + ', line ' + x.l + (x.e ? ', exported' : '') + ')').join(', ');
  return [plain(f), 'Language: ' + f.language + '. Kind: ' + modOf(f) + '.',
    'Uses: ' + (f.uses.slice(0, 30).join(', ') || 'nothing'), 'Used by: ' + (f.usedBy.slice(0, 30).join(', ') || 'nobody')].concat(syms ? ['Functions / exports: ' + syms] : []).join('\n');
};
// The entry file: package.json main/bin when there is one (read through the same safe source path), else by name / importance.
let entryPromise = null;
const entryP = () => entryPromise || (entryPromise = (async () => {
  const pkg = files.find(f => f.path === 'package.json') ? await source('package.json').catch(() => null) : null;
  return findEntry(files, pkg && pkg.kind === 'text' ? pkg.text : null);
})());
let startList = [];
const flyTo = (p, opts = {}) => {
  if (isFocus()) exitFocus();
  show('city'); select(p);
  const b = buildingOf(p); if (b && city.flyTo) city.flyTo(b.id, opts.dist);
};
{
  const btn = $('[data-start-open]'), panel = $('[data-startpanel]'), ol = $('[data-startlist]');
  const render = () => {
    ol.replaceChildren(...startList.map((s, i) => {
      const li = document.createElement('li'); const b = document.createElement('button'); b.type = 'button'; b.className = 'ws-start__item'; b.dataset.start = s.path;
      const n = document.createElement('i'); n.textContent = String(i + 1);
      const t = document.createElement('b'); t.textContent = base(s.path); t.title = s.path;
      const w = document.createElement('span'); w.textContent = s.why;
      b.append(n, t, w); b.addEventListener('click', () => flyTo(s.path)); li.append(b); return li;
    }));
  };
  const setOn = on => {
    panel.hidden = !on; btn.setAttribute('aria-pressed', String(on));
    const marks = [];
    if (on) for (const [i, s] of startList.entries()) { const b = buildingOf(s.path); if (b) marks.push({ id: b.id, n: i + 1, title: (i + 1) + '. ' + s.path, onClick: () => flyTo(s.path) }); }
    city.setMarkers && city.setMarkers(marks);
  };
  if (FEATURES.whereToStart !== false) {
    btn.hidden = false;
    entryP().then(e => { startList = whereToStart(files, e); render(); if (q.get('start') === '1') setOn(true); });
    btn.addEventListener('click', () => setOn(panel.hidden));
    $('[data-start-close]').addEventListener('click', () => setOn(false));
  }
  window.CodeLensStart = { get list() { return startList; }, set: setOn };
}
if (FEATURES.search !== false) window.CodeLensSearch = initSearch({ files, onPick: r => { flyTo(r.path); } });
const bchat = FEATURES.buildingChat !== false ? initBuildingChat({ project, byPath, source, fileContext, startList: () => startList }) : null;
const summary = FEATURES.summary !== false ? initSummary({ project, files, byPath, buildingOf, entryP, source, fileContext, onOpenInCity: p => flyTo(p) }) : null;
window.CodeLensLearn = { bchat, summary, entry: entryP };

/* tabs */
const tabs = [$('#tab-city'), $('#tab-code')];
function show(which) {
  tabs.forEach(t => t.setAttribute('aria-selected', String(t.id === 'tab-' + which)));
  $('#view-city').hidden = which !== 'city'; $('#view-code').hidden = which !== 'code';
  city.pause(which !== 'city'); if (which === 'city') city.resize();
  if (which === 'code' && current) showCode(current);
}
tabs.forEach(t => t.addEventListener('click', () => show(t.id.slice(4))));
$('.ws-tabs').addEventListener('keydown', e => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = tabs.indexOf(document.activeElement); if (i < 0) return;
  const n = tabs[(i + 1) % 2]; n.focus(); n.click();
});

const first = byPath[q.get('file')] ? q.get('file') : (plan.buildings.filter(b => !b.members).sort((a, b) => b.score - a.score)[0]?.id || files[0].path);
select(first, false);
show(q.get('tab') === 'code' ? 'code' : 'city');
window.__workspaceReady = true;
}
