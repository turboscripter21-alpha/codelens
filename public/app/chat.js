/* Talk to the file / Ask anything: real answers from Google Gemini through the same-origin
   proxy POST /api/chat (CSP connect-src is 'self').
   The user's key is kept only in this browser (localStorage) and sent per request in the
   x-gemini-key header; the server forwards it to Google and never stores or logs it.
   Answers are rendered with textContent only (never HTML): AI output and repo text are untrusted. */
import { keyStore as store, openKeyDialog, onKeyChange, askGemini } from './keydlg.js';
const $ = (s, r = document) => r.querySelector(s);
export const NEED_KEY = 'To answer, CodeLens needs your free Google Gemini API key. It takes a minute: follow the steps, paste the key and your question is sent right away.';

export function initChat({ project, current, fileContext, projectContext, source }) {
  const box = $('[data-chat]'), log = $('[data-chat-log]');
  const ask = $('[data-ask]'), follow = $('[data-follow]'), send = $('[data-follow-send]');
  const keyBtn = $('[data-key]'), keyLabel = $('[data-key-label]');
  const history = [];
  let busy = false;

  function renderKey() {
    const has = !!store.get();
    keyBtn.classList.toggle('is-set', has);
    keyLabel.textContent = has ? 'Gemini key added' : 'Add Gemini key';
    follow.placeholder = current() ? 'Ask ' + current().split('/').pop() + ' a question' : 'Ask this file a question';
  }
  const openKey = (reason) => openKeyDialog(typeof reason === 'string' ? reason : undefined);
  keyBtn.addEventListener('click', () => openKey());
  onKeyChange(renderKey);

  function bubble(role, text, cls) {
    box.hidden = false;
    const li = document.createElement('li');
    li.className = 'ws-msg ws-msg--' + role + (cls ? ' ' + cls : '');
    const p = document.createElement('p'); p.textContent = text; li.append(p);
    log.append(li); li.scrollIntoView({ block: 'nearest' });
    return li;
  }
  function action(li, label, fn) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ws-msg__act'; b.textContent = label;
    b.addEventListener('click', fn); li.append(b);
  }

  async function run(question, scope) {
    const key = store.get();
    const file = current();
    if (!key) {
      const li = bubble('ai', 'To answer, CodeLens needs your free Google Gemini API key. The key stays in this browser.', 'is-note');
      const again = () => openKey(NEED_KEY).then(saved => { if (saved) { li.remove(); run(question, scope); } });
      action(li, 'Add Gemini key', again);
      again();
      return;
    }
    busy = true; ask.disabled = follow.disabled = send.disabled = true;
    const wait = bubble('ai', 'Thinking…', 'is-wait');
    try {
      const body = { question, project: project.name, history: history.slice(-6) };
      if (scope === 'file' && file) {
        body.file = file; body.context = fileContext(file);
        const s = await source(file).catch(() => null);
        if (s && s.kind === 'text') body.source = s.text.slice(0, 24000);
      } else {
        body.file = file || ''; body.context = projectContext();
      }
      const r = await askGemini(body, key);
      wait.classList.remove('is-wait');
      if (!r.ok) {
        wait.classList.add('is-err');
        $('p', wait).textContent = r.error;
        if (r.status === 401) action(wait, 'Update key', () => openKey());
        else if (r.status === 429 || r.status === 503 || r.status === 0) action(wait, 'Try again', () => { wait.remove(); run(question, scope); });
        return;
      }
      const j = { text: r.text };
      $('p', wait).textContent = j.text || '';
      history.push({ role: 'user', text: question }, { role: 'model', text: (j.text || '').slice(0, 2000) });
    } catch {
      wait.classList.remove('is-wait'); wait.classList.add('is-err');
      $('p', wait).textContent = 'Could not reach CodeLens. Check your connection and try again.';
    } finally {
      busy = false; ask.disabled = follow.disabled = send.disabled = false;
    }
  }
  function submit(input, scope) {
    const q = input.value.trim(); if (!q || busy) return;
    input.value = '';
    const file = current();
    bubble('me', scope === 'file' && file ? q : q + (scope === 'project' ? '  (about the whole project)' : ''));
    run(q, scope);
  }
  ask.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(ask, 'project'); } });
  follow.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(follow, 'file'); } });
  send.addEventListener('click', () => submit(follow, 'file'));
  // Typing in the chat must never reach the city / Monaco / Esc-to-exit shortcuts.
  [ask, follow].forEach((el) => el.addEventListener('keydown', (e) => e.stopPropagation()));
  renderKey();
  return { renderKey, openKey };
}
