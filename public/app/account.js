/* account.js: email sign-in (6-digit code) or guest, plus the history panel.
   Shared by the landing page (index.html) and the workspace. Everything shown from the server
   (titles, emails) goes in with textContent. The session is an httpOnly cookie, so this file never
   sees it; guests are remembered for this tab only (sessionStorage). */
const CL = window.CodeLens;
const GUEST = 'codelens.guest', SEEN = 'codelens.accountAsked';
const NOTE = 'Log in with email to keep your history.';
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } } };

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c);
  return e;
}

let status = null, dlg = null, body = null, chipEls = [];
const listeners = new Set();
export const onAccount = (fn) => { listeners.add(fn); if (status) fn(status); };
function setStatus(s) { status = s; for (const c of chipEls) paintChip(c); for (const fn of listeners) fn(s); }
export const accountStatus = () => status;
export async function refresh() { setStatus(await CL.authStatus()); return status; }

function ensureDialog() {
  if (dlg) return dlg;
  if (!document.querySelector('link[data-account-css]')) document.head.append(el('link', { rel: 'stylesheet', href: new URL('account.css', import.meta.url).pathname, 'data-account-css': true }));
  body = el('div', { class: 'ac-body', 'aria-live': 'polite' });
  dlg = el('dialog', { class: 'ac-dlg', 'aria-labelledby': 'ac-h', 'data-account': true },
    el('div', { class: 'ac-card' },
      el('button', { type: 'button', class: 'ac-x', 'aria-label': 'Close', onclick: () => close() }, '×'),
      body));
  dlg.addEventListener('cancel', () => { if (!status?.user && !ss.get(GUEST)) ss.set(GUEST, '1'); });
  dlg.addEventListener('close', () => { dlg.dispatchEvent(new CustomEvent('account-closed')); });
  document.body.append(dlg);
  return dlg;
}
function close() { if (!status?.user && !ss.get(GUEST)) ss.set(GUEST, '1'); dlg?.close(); }
function show(view) { ensureDialog(); body.replaceChildren(...view); if (!dlg.open) dlg.showModal(); const f = body.querySelector('[autofocus]'); if (f) f.focus(); }
const head = (eyebrow, h) => [el('p', { class: 'ac-eyebrow', text: eyebrow }), el('h2', { id: 'ac-h', text: h })];
const err = () => el('p', { class: 'ac-err', role: 'alert', hidden: true });
function fail(box, msg) { box.hidden = !msg; box.textContent = msg || ''; }
function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }

/* ---------- views ---------- */
function signInView(opts = {}) {
  const s = status || { mode: 'off', available: false, user: null };
  const out = [...head(opts.eyebrow || 'Welcome to CodeLens', opts.title || 'Keep your cities, or just look around')];
  if (!s.available) {
    out.push(el('p', { class: 'ac-off', 'data-auth-off': true, text: "Email login isn't set up on this server yet." }),
      el('p', { text: 'You can still use everything as a guest. Your city stays in this browser for this visit.' }),
      el('div', { class: 'ac-btns' }, el('button', { type: 'button', class: 'ac-go', 'data-guest': true, autofocus: true, onclick: guest, text: 'Continue as guest' })));
    return out;
  }
  const box = err();
  const input = el('input', { type: 'email', name: 'email', required: true, maxlength: '254', autocomplete: 'email', inputmode: 'email', placeholder: 'you@college.edu', autofocus: true, 'data-email': true });
  const send = el('button', { type: 'submit', class: 'ac-go', 'data-send': true, text: 'Email me a code' });
  const form = el('form', { class: 'ac-form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); fail(box);
    const email = input.value.trim();
    if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email)) return fail(box, 'Enter a valid email address.');
    busy(send, true, 'Sending…');
    const r = await CL.startLogin(email);
    busy(send, false, 'Email me a code');
    if (!r.ok) return fail(box, r.error || 'Could not send a code. Try again.');
    show(codeView(email, r.message));
  } },
  el('label', { class: 'ac-field' }, el('span', { text: 'Email' }), input), box,
  el('div', { class: 'ac-btns' }, el('button', { type: 'button', class: 'ac-ghost', 'data-guest': true, onclick: guest, text: 'Continue as guest' }), send));
  out.push(el('p', { text: 'Log in with email and CodeLens keeps a history of the repos and zips you open. No password: we email you a 6-digit code.' }), form,
    el('p', { class: 'ac-fine', 'data-guest-note': true, text: 'Guest = a one-time visit, nothing is saved. ' + NOTE }));
  if (s.mode === 'dev') out.push(el('p', { class: 'ac-dev', text: 'Local dev mode: no email is sent, the code is printed in the server console.' }));
  return out;
}

function codeView(email, message) {
  const box = err();
  const input = el('input', { type: 'text', name: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', pattern: '[0-9]{6}', maxlength: '6', placeholder: '123456', autofocus: true, 'data-code': true });
  input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
  const go = el('button', { type: 'submit', class: 'ac-go', 'data-verify': true, text: 'Log in' });
  const again = el('button', { type: 'button', class: 'ac-link', disabled: true, text: 'Send a new code (30 s)' });
  let t = 30; const iv = setInterval(() => { t--; if (t <= 0) { clearInterval(iv); again.disabled = false; again.textContent = 'Send a new code'; } else again.textContent = `Send a new code (${t} s)`; }, 1000);
  again.addEventListener('click', async () => { again.disabled = true; const r = await CL.startLogin(email); fail(box, r.ok ? '' : r.error); if (r.ok) { show(codeView(email, 'A new code is on its way. The old one no longer works.')); } else again.disabled = false; });
  const form = el('form', { class: 'ac-form', novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); fail(box);
    if (!/^\d{6}$/.test(input.value)) return fail(box, 'The code has 6 digits.');
    busy(go, true, 'Checking…');
    const r = await CL.verifyLogin(email, input.value);
    busy(go, false, 'Log in');
    if (!r.ok) { input.select(); return fail(box, r.error || 'That code did not work.'); }
    clearInterval(iv);
    await refresh();
    show(await historyView());
  } },
  el('label', { class: 'ac-field' }, el('span', { text: '6-digit code' }), input), box,
  el('div', { class: 'ac-btns' }, el('button', { type: 'button', class: 'ac-ghost', onclick: () => { clearInterval(iv); show(signInView()); }, text: 'Use another email' }), go));
  const sent = el('p', {}, message || 'If that address can receive email, a 6-digit code is on its way.', ' ', el('b', { text: email }));
  return [...head('Check your inbox', 'Enter your code'), sent, form, el('p', { class: 'ac-fine' }, 'The code works for 10 minutes and 5 tries. ', again)];
}

const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const statLine = (s) => [`${s.files.toLocaleString()} files`, `${s.loc.toLocaleString()} lines`, s.languages.slice(0, 3).join(', '), s.imports ? `${s.imports.toLocaleString()} imports` : '', s.secrets ? `${s.secrets} in the vault` : ''].filter(Boolean).join(' · ');

async function historyView() {
  if (!status?.user) return signInView({ eyebrow: 'History', title: 'Your history lives behind a login' });
  const box = err();
  const list = el('ul', { class: 'ac-hist', 'data-history': true });
  let items = [];
  try { items = (await CL.listHistory()) || []; } catch (e) { fail(box, e.message); }
  const paint = () => {
    list.replaceChildren();
    if (!items.length) list.append(el('li', { class: 'ac-empty', text: 'Nothing yet. Import a GitHub repo, a .zip or a folder and it shows up here.' }));
    for (const it of items) {
      const del = el('button', { type: 'button', class: 'ac-del', 'aria-label': 'Delete ' + it.title, title: 'Delete', text: 'Delete' });
      const open = el('button', { type: 'button', class: 'ac-open', 'data-open': it.id, text: 'Re-open' });
      if (it.kind !== 'github' && !it.hasAnalysis) { open.disabled = true; open.title = 'This entry was too large to save its analysis'; }
      del.addEventListener('click', async () => { del.disabled = true; try { await CL.deleteHistory(it.id); items = items.filter((x) => x.id !== it.id); paint(); } catch (e) { fail(box, e.message); del.disabled = false; } });
      open.addEventListener('click', () => reopen(it, open, box));
      list.append(el('li', { class: 'ac-item' },
        el('span', { class: 'ac-kind ac-kind--' + it.kind, text: it.kind === 'github' ? 'GitHub' : it.kind === 'zip' ? '.zip' : 'Folder' }),
        el('span', { class: 'ac-meta' }, el('b', { class: 'ac-title', text: it.title, title: it.url || it.title }), el('span', { class: 'ac-sub', text: fmtDate(it.createdAt) + ' · ' + statLine(it.stats) })),
        el('span', { class: 'ac-acts' }, open, del)));
    }
  };
  paint();
  const out = el('button', { type: 'button', class: 'ac-ghost', 'data-logout': true, text: 'Log out', onclick: async () => { await CL.logout(); await refresh(); show(signInView({ eyebrow: 'Logged out', title: 'See you next time' })); } });
  const clear = el('button', { type: 'button', class: 'ac-link', text: 'Delete all', onclick: async () => { if (!items.length || !confirm('Delete your whole CodeLens history?')) return; try { await CL.deleteHistory(null); items = []; paint(); } catch (e) { fail(box, e.message); } } });
  return [...head('History', 'Your cities'), el('p', { class: 'ac-who' }, 'Logged in as ', el('b', { text: status.user.email })), box, list,
    el('div', { class: 'ac-btns ac-btns--split' }, clear, out),
    el('p', { class: 'ac-fine', text: 'Saved: the repo link or zip name, the date and the stats (for zips and folders also the analysis: file names, sizes, imports). Never saved: file contents or anything from secret files.' })];
}

async function reopen(it, btn, box) {
  btn.disabled = true; btn.textContent = 'Opening…';
  try {
    if (it.kind === 'github') {
      const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(it.url || '');
      if (!m) throw new Error('That link is not a github.com repo.');
      await CL.setPending({ src: 'github', url: it.url, name: m[1] + '/' + m[2] });
      location.href = new URL('../building.html', import.meta.url).pathname;
    } else {
      const project = await CL.restoreHistory(it);
      await CL.saveProject(project);
      location.href = new URL('../workspace.html', import.meta.url).pathname;
    }
  } catch (e) { fail(box, e.message || 'Could not open that entry.'); btn.disabled = false; btn.textContent = 'Re-open'; }
}

function guest() { ss.set(GUEST, '1'); dlg?.close(); for (const c of chipEls) paintChip(c); }

/* ---------- header chip ---------- */
function paintChip(c) {
  const u = status?.user;
  c.classList.toggle('is-in', !!u);
  c.querySelector('[data-ac-label]').textContent = u ? 'History' : ss.get(GUEST) ? 'Guest · Log in' : 'Log in';
  c.title = u ? 'Your history (' + u.email + ')' : NOTE;
}
export function mountChip(where, before = null) {
  const c = el('button', { type: 'button', class: 'ac-chip', 'data-account-open': true },
    el('span', { class: 'ac-ico', 'aria-hidden': 'true' }), el('span', { 'data-ac-label': true, text: 'Log in' }));
  c.querySelector('.ac-ico').innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.8V10l2.8 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  c.addEventListener('click', () => openAccount());
  if (before) where.insertBefore(c, before); else where.append(c);
  chipEls.push(c); paintChip(c);
  return c;
}
export async function openAccount() { if (!status) await refresh(); show(status.user ? await historyView() : signInView()); }

/** First visit in this tab: ask once (sign in, or continue as guest). */
export async function askOnce() {
  if (!status) await refresh();
  if (status.user || ss.get(GUEST) || ss.get(SEEN)) return false;
  ss.set(SEEN, '1');
  show(signInView());
  return new Promise((res) => dlg.addEventListener('account-closed', () => res(true), { once: true }));
}

/** Small toast after an import: saved to history, or the guest note. */
export function noteSaved() {
  let r = null; try { r = JSON.parse(sessionStorage.getItem('codelens.saved') || 'null'); sessionStorage.removeItem('codelens.saved'); } catch { /* none */ }
  if (!r) return;
  const t = el('div', { class: 'ac-toast', role: 'status' }, r.saved ? 'Saved to your history.' : NOTE);
  if (!r.saved) t.append(' ', el('button', { type: 'button', class: 'ac-link', text: 'Log in', onclick: () => { t.remove(); openAccount(); } }));
  if (!document.querySelector('link[data-account-css]')) ensureDialog();
  document.body.append(t);
  setTimeout(() => t.classList.add('is-out'), 6500); setTimeout(() => t.remove(), 7200);
}

window.CodeLensAccount = { openAccount, refresh, askOnce, mountChip, accountStatus };
