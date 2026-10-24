/* bchat.js: double-click a building and it talks to you, in the first person, beside its code.
   No key: answers come from the analysis (localAnswer, facts only, never invented).
   With the user's Gemini key: /api/chat with persona "building"; the file's code is fenced as
   untrusted data on the server. Everything is rendered with textContent only. */
import { onFocus, cursorLine, lineAt, goToLine } from './focus.js';
import { introOf, localAnswer, SUGGESTIONS } from './insights.js';
import { keyStore, askGemini, openKeyDialog } from './keydlg.js';
const $ = (s, r = document) => r.querySelector(s);
const base = p => p.split('/').pop();

export function initBuildingChat({ project, byPath, source, fileContext, startList }) {
  const box = $('[data-bchat]'); if (!box) return null;
  const log = $('[data-bchat-log]'), chips = $('[data-bchat-chips]'), form = $('[data-bchat-form]'), input = $('[data-bchat-input]'), note = $('[data-bchat-note]');
  let file = null, history = [], busy = false, gen = 0;

  function bubble(role, text, cls) {
    const li = document.createElement('li');
    li.className = 'ws-bmsg ws-bmsg--' + role + (cls ? ' ' + cls : '');
    if (role === 'me') li.textContent = text;
    else { const who = document.createElement('b'); who.textContent = base(file.path); const p = document.createElement('p'); p.textContent = text; li.append(who, p); }
    log.append(li); log.scrollTop = log.scrollHeight;
    return li;
  }
  function renderNote() {
    note.textContent = keyStore.get()
      ? 'Answers by Gemini (your key, this file only). AI can be wrong.'
      : 'Offline answers from the code itself. Add a free Gemini key for open questions.';
  }
  function renderChips() {
    chips.replaceChildren(...SUGGESTIONS.map(s => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ws-bchip';
      const line = s.startsWith('Explain line');
      b.textContent = line ? 'Explain line X' : s;
      b.title = line ? 'Explains the line your cursor is on in the code (click a line first)' : s;
      b.addEventListener('click', () => {
        if (line) { const c = cursorLine(); ask('Explain line ' + (c ? c.line : 1)); }
        else ask(s);
      });
      return b;
    }));
  }
  function reset(p) {
    const f = byPath[p]; if (!f) { box.hidden = true; return; }
    file = f; history = []; gen++; busy = false; input.disabled = false;
    box.hidden = false; log.replaceChildren();
    bubble('ai', introOf(f));
    input.placeholder = 'Ask ' + base(p) + ' anything';
    renderChips(); renderNote();
  }
  onFocus(reset);

  async function ask(question) {
    if (!file || busy) return;
    const f = file, my = gen;
    bubble('me', question);
    const lm = /line\s*(\d+)/i.exec(question);
    if (lm) goToLine(+lm[1]);
    const lineText = lm ? lineAt(+lm[1]) : null;
    const key = keyStore.get();
    const offline = () => localAnswer(question, f, { lineText, start: startList() });
    const isCanned = SUGGESTIONS.some(s => question.startsWith(s.trim()));
    if (!key || f.secret) {
      const a = offline();
      bubble('ai', a, 'is-local');
      // An open question needs AI: offer the key pop-up (once per question, never forced).
      if (!key && !isCanned && !f.secret) {
        const li = bubble('ai', 'For a real answer to that, add your free Gemini key.', 'is-note');
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ws-msg__act'; b.textContent = 'Add Gemini key';
        const go = () => openKeyDialog('To let ' + base(f.path) + ' answer any question, CodeLens needs your free Google Gemini key.').then(ok => { renderNote(); if (ok && file === f) { li.remove(); ask(question); } });
        b.addEventListener('click', go); li.append(b); go();
      }
      return;
    }
    busy = true; input.disabled = true;
    const wait = bubble('ai', 'Thinking…', 'is-wait');
    const body = { question, persona: 'building', project: project.name, file: f.path, context: fileContext(f.path) + (lineText != null ? `\nLine ${lm[1]}: ${lineText.slice(0, 400)}` : ''), history: history.slice(-6) };
    const s = await source(f.path).catch(() => null);
    if (s && s.kind === 'text') body.source = s.text.slice(0, 24000);
    const r = await askGemini(body, key);
    if (my !== gen) return;                      // the user opened another building meanwhile
    busy = false; input.disabled = false;
    wait.classList.remove('is-wait');
    if (r.ok) {
      $('p', wait).textContent = r.text || '(no answer)';
      history.push({ role: 'user', text: question }, { role: 'model', text: (r.text || '').slice(0, 2000) });
    } else {
      wait.classList.add('is-err');
      $('p', wait).textContent = r.error + (isCanned ? ' Offline answer: ' + offline() : '');
      if (r.status === 401) { const b = document.createElement('button'); b.type = 'button'; b.className = 'ws-msg__act'; b.textContent = 'Update key'; b.addEventListener('click', () => openKeyDialog().then(renderNote)); wait.append(b); }
    }
  }
  form.addEventListener('submit', e => { e.preventDefault(); const q = input.value.trim(); if (!q) return; input.value = ''; ask(q); });
  input.addEventListener('keydown', e => { if (e.key !== 'Escape') e.stopPropagation(); });
  return { ask, reset, renderNote };
}
