/* workspace.html: the CodeLens workspace, wired to the real project.
   The project comes only from the user's import (GitHub link, .zip or folder), stored in
   IndexedDB by building.html. There is no sample data: with nothing imported the page shows
   an "Import a repo first" empty state that links back to the import plate.
   The city is the live CodeCity engine (app/city/engine.js) built from that project. */
import { enterFocus, exitFocus, isFocus, setSourceProvider, setBuildingProvider, setProjectName } from './focus.js';
import { createCity } from './city/engine.js';
import { FEATURES } from './features.js';
import * as Lib from './citylib/index.js';

const $ = (s, r = document) => r.querySelector(s);
const q = new URLSearchParams(location.search);
const CL = window.CodeLens;
const base = p => p.split('/').pop();
// Lookups keyed by repo-controlled paths: null-prototype objects, so a file called
// `__proto__` / `constructor` (or ?file=__proto__) can never hit Object.prototype.
const table = entries => Object.assign(Object.create(null), Object.fromEntries(entries));

let stored = null;
try { stored = await CL.loadProject(); } catch (err) { console.warn('[codelens] no stored project', err); }
let started = false;
if (stored && Array.isArray(stored.files) && stored.files.length) {
  try { started = true; run(stored); }
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
  window.__workspaceReady = true;
}

function run(project) {
const files = project.files;
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
}

/* file tree: folders first, alphabetical, like an editor */
const list = $('[data-files]');
{
  const sorted = [...files].sort((a, b) => {
    const A = a.path.split('/'), B = b.path.split('/');
    for (let i = 0; i < Math.min(A.length, B.length); i++) {
      if (A[i] === B[i]) continue;
      const ad = i < A.length - 1, bd = i < B.length - 1;
      if (ad !== bd) return ad ? -1 : 1;
      return A[i].localeCompare(B[i]);
    }
    return A.length - B.length;
  });
  let prev = [];
  const frag = document.createDocumentFragment();
  for (const f of sorted) {
    const p = f.path, dirs = p.split('/').slice(0, -1);
    dirs.forEach((d, i) => {
      if (dirs.slice(0, i + 1).join('/') !== prev.slice(0, i + 1).join('/')) {
        const li = document.createElement('li'); li.className = 'ws-dir'; li.style.setProperty('--d', i); li.textContent = d + '/'; frag.append(li);
      }
    });
    prev = dirs;
    const li = document.createElement('li'); li.style.setProperty('--d', dirs.length);
    const b = document.createElement('button'); b.type = 'button'; b.dataset.path = p; b.className = 'ws-file ws-file--' + (f.secret ? 'vault' : modOf(f));
    b.innerHTML = '<span class="ws-file__dot"></span>'; b.append(base(p)); b.title = p;
    li.append(b); frag.append(li);
  }
  list.append(frag);
}

/* the live city */
const host = $('[data-city]');
let colorBy = FEATURES.colorCoding && ['moduleType', 'language'].includes(q.get('colorBy')) ? q.get('colorBy') : 'none';
const city = createCity(host, plan, {
  colorBy, labels: FEATURES.folderLabels && q.get('labels') !== '0',
  onSelect: id => { const b = bById[id]; select(b.members ? b.members[0] : id); },
  onOpen: id => { const b = bById[id]; const p = b.members ? b.members[0] : id; select(p); enterFocus(p, byPath[p]); },
});
window.__codelensCity = city;

/* Talk to the file */
function say(f) {
  if (f.description) return f.description;
  const n = base(f.path), b = buildingOf(f.path);
  if (f.secret) return `I'm ${n}, the vault. I hold secrets, so CodeLens only knows my name; my contents are never read.`;
  if (f.lockfile) return `I'm ${n}, a lockfile. Tools write me (${(f.lines || 0).toLocaleString()} lines) to pin exact dependency versions, so my lines don't count as code.`;
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
let current = null;
function select(p, push) {
  const f = byPath[p]; if (!f) return;
  current = p;
  document.querySelectorAll('.ws-files [data-path]').forEach(e => e.toggleAttribute('aria-current', e.dataset.path === p));
  const cur = list.querySelector('[aria-current]'); if (cur && push !== false) cur.scrollIntoView({ block: 'nearest' });
  const b = buildingOf(p); city.select(b ? b.id : null);
  $('[data-path]', $('.ws-who')).textContent = p;
  $('[data-tier]').textContent = tierOf(f); $('[data-type]').textContent = f.secret ? 'secrets' : modOf(f);
  $('[data-lines]').textContent = f.secret ? 'not read' : f.binary ? (f.bytes / 1024).toFixed(1) + ' KB' : (f.estimated ? '~' : '') + (f.lines || f.loc).toLocaleString() + ' lines';
  $('[data-langname]').textContent = f.secret || f.binary ? '' : f.language;
  $('[data-say]').textContent = say(f);
  $('[data-saycap]').textContent = f.description ? 'Summary from the import.' : 'Placeholder from the file\'s real stats until the Gemini phase. Real answers come from the AI key you paste, and AI can be wrong.';
  $('[data-follow]').placeholder = 'Ask ' + base(p) + ' a follow-up (Gemini phase)';
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
  real.hidden = true; none.hidden = false; msg.textContent = 'Loading ' + base(p) + '…';
  const s = await source(p);
  if (current !== p) return;
  if (s.kind !== 'text') { msg.textContent = s.message; $('[data-codenote]').textContent = 'Read only'; return; }
  const lines = s.text.replace(/\n$/, '').split('\n');
  $('[data-code-lines]').innerHTML = lines.map((l, i) => '<span class="ln">' + (i + 1) + '</span>' + esc(l)).join('\n');
  real.hidden = false; none.hidden = true; real.scrollTop = 0;
  $('[data-codenote]').textContent = (s.note ? s.note + ' · ' : '') + 'Read only' + (s.truncated ? ' · first ' + lines.length + ' lines' : '');
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
new MutationObserver(() => city.pause(document.body.classList.contains('is-focus') || $('#view-city').hidden)).observe(document.body, { attributes: true, attributeFilter: ['class'] });

/* colour-code + folder label toggles (feature flags: colorCoding, folderLabels) */
const cbBtn = $('[data-colorby]'), lbBtn = $('[data-labels]');
const CB = ['none', 'moduleType', 'language'], CBN = { none: 'none', moduleType: 'module type', language: 'language' };
function renderToggles() {
  cbBtn.textContent = 'Colour: ' + CBN[city.colorBy]; cbBtn.setAttribute('aria-pressed', String(city.colorBy !== 'none'));
  lbBtn.textContent = 'Folder labels: ' + (city.labels ? 'on' : 'off'); lbBtn.setAttribute('aria-pressed', String(city.labels));
  const used = new Set(plan.buildings.map(b => city.colorBy === 'language' ? b.language : b.moduleType));
  const L = Lib.legendFor(city.colorBy).filter(e => used.has(e.key === 'data / db' ? 'data' : e.key));
  $('[data-colorlegend]').innerHTML = L.map(e => `<span><i style="background:${e.color}"></i>${e.key}</span>`).join('');
}
cbBtn.hidden = !FEATURES.colorCoding; lbBtn.hidden = !FEATURES.folderLabels;
cbBtn.addEventListener('click', () => { city.setColorBy(CB[(CB.indexOf(city.colorBy) + 1) % CB.length]); renderToggles(); });
lbBtn.addEventListener('click', () => { city.setLabels(!city.labels); renderToggles(); });
renderToggles();

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
