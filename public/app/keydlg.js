/* keydlg.js: the Gemini key pop-up (same style as the intro) and the shared Gemini request.
   The key lives only in this browser (localStorage) and is sent in the x-gemini-key header to
   this site's own /api/chat proxy, only when a question is asked (or "Test key" is pressed). */
const KEY = 'codelens.geminiKey', ASKED = 'codelens.keyAsked';
export const KEY_RE = /^[A-Za-z0-9_-]{30,64}$/;
const $ = (s, r = document) => r.querySelector(s);
export const keyStore = {
  get() { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } },
  set(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } fire(); },
};
const subs = new Set();
export const onKeyChange = (fn) => { subs.add(fn); };
function fire() { for (const fn of subs) { try { fn(!!keyStore.get()); } catch { /* listener */ } } }

/** POST /api/chat. Returns { ok, text } or { ok:false, status, error }. */
export async function askGemini(body, key = keyStore.get()) {
  try {
    const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-gemini-key': key }, body: JSON.stringify(body) });
    let j = {}; try { j = await res.json(); } catch { /* not JSON */ }
    return res.ok ? { ok: true, text: j.text || '' } : { ok: false, status: res.status, error: j.error || ('Gemini request failed (' + res.status + ').') };
  } catch {
    return { ok: false, status: 0, error: 'Could not reach CodeLens. Check your connection and try again.' };
  }
}

/** "Test key": one tiny request. Result: ok / invalid / rate-limited / busy / offline. */
export async function testKey(key) {
  if (!KEY_RE.test(key)) return { state: 'invalid', text: 'That does not look like a Gemini API key (it usually starts with "AIza").' };
  const r = await askGemini({ question: 'ping', test: true }, key);
  if (r.ok) return { state: 'ok', text: 'Key works. Gemini answered.' };
  if (r.status === 401 || r.status === 400) return { state: 'invalid', text: 'Invalid key: Google rejected it. Copy it again from AI Studio.' };
  if (r.status === 429) return { state: 'limited', text: 'The key is valid but rate-limited right now (free tier). Wait a minute; you can still save it.' };
  if (r.status === 503) return { state: 'busy', text: 'Gemini is busy right now. The key could not be checked; try again in a moment.' };
  return { state: 'error', text: r.error };
}

let pending = null, dlg = null;
function wire() {
  if (dlg) return dlg;
  dlg = $('[data-keydlg]'); if (!dlg) return null;
  const input = $('[data-keyinput]', dlg), err = $('[data-keyerr]', dlg), st = $('[data-keystatus]', dlg), eye = $('[data-keyshow]', dlg);
  const status = (cls, text) => { st.hidden = !text; st.className = 'ws-keystatus' + (cls ? ' is-' + cls : ''); st.textContent = text || ''; };
  eye.addEventListener('click', () => {
    const show = input.type === 'password'; input.type = show ? 'text' : 'password';
    eye.textContent = show ? 'Hide' : 'Show'; eye.setAttribute('aria-pressed', String(show)); eye.setAttribute('aria-label', show ? 'Hide key' : 'Show key'); input.focus();
  });
  input.addEventListener('input', () => { err.hidden = true; status(); });
  input.addEventListener('keydown', (e) => e.stopPropagation());
  $('[data-keytest]', dlg).addEventListener('click', async (e) => {
    const b = e.currentTarget; b.disabled = true; err.hidden = true; status('wait', 'Testing the key…');
    const r = await testKey(input.value.trim());
    b.disabled = false;
    status(r.state === 'ok' ? 'ok' : r.state === 'invalid' ? 'bad' : 'wait', r.text);
  });
  dlg.querySelectorAll('[data-keyskip]').forEach((b) => b.addEventListener('click', () => done(false)));
  $('[data-keyremove]', dlg).addEventListener('click', () => { keyStore.set(''); input.value = ''; done(false); });
  $('[data-keyform]', dlg).addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!KEY_RE.test(v)) { err.hidden = false; err.textContent = 'That does not look like a Gemini API key (it usually starts with "AIza").'; input.focus(); return; }
    keyStore.set(v); done(true);
  });
  dlg.addEventListener('cancel', () => { setTimeout(() => done(false), 0); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) done(false); });
  return dlg;
}
function done(saved) {
  try { localStorage.setItem(ASKED, '1'); } catch { /* blocked */ }
  if (dlg && dlg.open) dlg.close();
  const p = pending; pending = null; p && p(saved);
}

/** Open the pop-up. reason: shown above the steps (e.g. "To answer, …"). Resolves true when a key was saved. */
export function openKeyDialog(reason) {
  const d = wire(); if (!d) return Promise.resolve(false);
  const input = $('[data-keyinput]', d);
  input.value = keyStore.get(); input.type = 'password';
  const eye = $('[data-keyshow]', d); eye.textContent = 'Show'; eye.setAttribute('aria-pressed', 'false');
  $('[data-keyerr]', d).hidden = true; $('[data-keystatus]', d).hidden = true;
  $('[data-keyremove]', d).hidden = !keyStore.get();
  const lead = $('[data-keylead]', d);
  if (!lead.dataset.base) lead.dataset.base = lead.innerHTML;
  if (reason) lead.textContent = reason; else lead.innerHTML = lead.dataset.base;
  if (pending) pending(false);
  if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  input.focus();
  return new Promise((res) => { pending = res; });
}

/** Once per browser, right after the intro: offer the key (skipped if one is saved). */
export function offerKeyOnce() {
  let asked = null; try { asked = localStorage.getItem(ASKED); } catch { /* blocked */ }
  if (asked === '1' || keyStore.get()) return false;
  openKeyDialog();
  return true;
}
