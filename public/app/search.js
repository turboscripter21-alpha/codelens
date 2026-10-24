/* search.js: Ctrl+K (or "/") palette over file names, paths and functions / exports.
   The index is built once from the analysis (no file contents). Picking a result flies the
   camera to its building and selects it. Results are rendered with textContent only. */
import { searchIndex, search } from './insights.js';
const $ = (s, r = document) => r.querySelector(s);
const KIND = { file: 'file', fn: 'function', method: 'method', class: 'class', type: 'type', var: 'export', const: 'export' };

export function initSearch({ files, onPick }) {
  const dlg = $('[data-searchdlg]'), input = $('[data-searchinput]'), list = $('[data-searchlist]'), btn = $('[data-search-open]');
  if (!dlg) return null;
  let index = null, results = [], at = 0;
  const top = () => [...files].filter(f => !f.secret).sort((a, b) => b.importance - a.importance).slice(0, 8)
    .map(f => ({ t: 'file', label: f.path.split('/').pop(), sub: f.path, path: f.path }));

  function render() {
    const q = input.value;
    results = q.trim() ? search(index || (index = searchIndex(files)), q, 30) : top();
    at = Math.min(at, Math.max(0, results.length - 1));
    if (!results.length) {
      const li = document.createElement('li'); li.className = 'ws-search__none'; li.textContent = 'No file or function matches “' + q.trim() + '”.';
      list.replaceChildren(li); input.removeAttribute('aria-activedescendant'); return;
    }
    list.replaceChildren(...results.map((r, i) => {
      const li = document.createElement('li'); li.id = 'sr-' + i; li.setAttribute('role', 'option'); li.className = 'ws-search__item';
      li.setAttribute('aria-selected', String(i === at)); li.dataset.i = i;
      const k = document.createElement('span'); k.className = 'ws-search__k ws-search__k--' + (r.t === 'file' ? 'file' : 'sym'); k.textContent = KIND[r.t] || r.t;
      const n = document.createElement('b'); n.textContent = r.label;
      const sub = document.createElement('span'); sub.className = 'ws-search__sub'; sub.textContent = r.sub;
      li.append(k, n, sub);
      return li;
    }));
    input.setAttribute('aria-activedescendant', 'sr-' + at);
    list.children[at]?.scrollIntoView({ block: 'nearest' });
  }
  function move(d) { if (!results.length) return; at = (at + d + results.length) % results.length; [...list.children].forEach((c, i) => c.setAttribute('aria-selected', String(i === at))); input.setAttribute('aria-activedescendant', 'sr-' + at); list.children[at]?.scrollIntoView({ block: 'nearest' }); }
  function pick(i) { const r = results[i]; if (!r) return; close(); onPick(r); }
  function open() { if (dlg.open) return; at = 0; input.value = ''; render(); dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', ''); input.focus(); }
  function close() { if (dlg.open) dlg.close(); }

  input.addEventListener('input', () => { at = 0; render(); });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(at); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('click', e => { const li = e.target.closest('[data-i]'); if (li) pick(+li.dataset.i); });
  list.addEventListener('mousemove', e => { const li = e.target.closest('[data-i]'); if (li && +li.dataset.i !== at) { at = +li.dataset.i; move(0); } });
  dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
  btn.hidden = false; btn.addEventListener('click', open);
  addEventListener('keydown', e => {
    if (document.querySelector('dialog[open]')) return;
    const t = e.target, typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || (t.closest && t.closest('.monaco-editor')));
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); open(); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(); }
  }, true);
  return { open, close };
}
