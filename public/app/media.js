/* Audio / video player for media files (mp3, wav, ogg, m4a, flac, mp4, webm).
   The bytes come as a blob: URL with an allowlisted content type (CSP media-src 'self' blob:).
   Only one player per host; the previous blob URL is revoked when it is replaced. */
const live = new WeakMap();   // host -> blob URL in use

export function clearMedia(host) {
  const url = live.get(host);
  if (url) { URL.revokeObjectURL(url); live.delete(host); }
  host.querySelectorAll('.cl-media, .cl-img, .cl-card').forEach(n => n.remove());
  host.classList.remove('has-viewer');
}

const fmtBytes = n => n == null ? '' : n < 1024 ? n + ' B' : n < 1024 * 1024 ? (n / 1024).toFixed(1) + ' KB' : (n / 1024 / 1024).toFixed(2) + ' MB';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

/* Image viewer (png, jpg, gif, webp, bmp, ico, avif, svg). Always an <img> with a blob: URL (CSP img-src blob:):
   SVG is never inlined into the page, so its scripts / links cannot run here. Fit or 100% zoom, checkerboard
   behind transparent pixels, size + dimensions. The blob URL is revoked by clearMedia (when the file changes or closes). */
export function showImage(host, src, name) {
  clearMedia(host);
  host.classList.add('has-viewer');
  const wrap = el('figure', 'cl-img');
  const bar = el('figcaption', 'cl-img__bar');
  const title = el('b', 'cl-img__name', name);
  const meta = el('span', 'cl-img__meta', (src.mime === 'image/svg+xml' ? 'SVG' : src.mime.replace('image/', '').replace('x-icon', 'ICO').toUpperCase()) + ' · ' + fmtBytes(src.bytes));
  const zoom = el('span', 'cl-img__zoom'); zoom.setAttribute('role', 'group'); zoom.setAttribute('aria-label', 'Zoom');
  const fit = el('button', '', 'Fit'), one = el('button', '', '100%');
  fit.type = one.type = 'button';
  zoom.append(fit, one);
  bar.append(title, meta, zoom);
  const stage = el('div', 'cl-img__stage is-fit');
  const img = new Image();
  img.alt = name; img.decoding = 'async'; img.draggable = false;
  img.referrerPolicy = 'no-referrer';
  const setMode = m => {
    stage.classList.toggle('is-fit', m === 'fit'); stage.classList.toggle('is-one', m === 'one');
    fit.setAttribute('aria-pressed', String(m === 'fit')); one.setAttribute('aria-pressed', String(m === 'one'));
  };
  fit.addEventListener('click', () => setMode('fit'));
  one.addEventListener('click', () => setMode('one'));
  img.addEventListener('dblclick', () => setMode(stage.classList.contains('is-fit') ? 'one' : 'fit'));
  img.addEventListener('load', () => {
    const w = img.naturalWidth, h = img.naturalHeight;
    meta.textContent = (w && h ? w + ' × ' + h + ' px · ' : src.mime === 'image/svg+xml' ? 'vector · ' : '') + meta.textContent;
    wrap.dataset.w = w; wrap.dataset.h = h;
    wrap.dataset.ready = '1';
  }, { once: true });
  img.addEventListener('error', () => { wrap.dataset.ready = 'error'; stage.replaceChildren(el('p', 'cl-img__err', 'This browser cannot show this ' + src.mime + ' image (it may be damaged).')); }, { once: true });
  img.src = src.url;
  stage.append(img);
  setMode('fit');
  wrap.append(bar, stage);
  host.append(wrap);
  if (src.revoke) live.set(host, src.url);
  return wrap;
}

/* Friendly card for files with no text and no viewer (pdf, fonts, archives, too-large images...). */
export function showCard(host, src, name) {
  clearMedia(host);
  host.classList.add('has-viewer');
  const card = el('div', 'cl-card' + (src.tooLarge ? ' is-big' : ''));
  card.append(el('b', 'cl-card__name', name));
  const facts = [src.type, fmtBytes(src.bytes)].filter(Boolean).join(' · ');
  if (facts) card.append(el('span', 'cl-card__type', facts));
  card.append(el('p', 'cl-card__msg', src.message));
  host.append(card);
  return card;
}

/* "View source" / "View image" toggle for SVG, placed in `bar`. Returns the button (removed by removeToggle). */
export function sourceToggle(bar, onImage, onSource) {
  removeToggle(bar);
  const b = el('button', 'cl-srcbtn', 'View source'); b.type = 'button'; b.dataset.mode = 'image';
  b.addEventListener('click', () => {
    if (b.dataset.mode === 'image') { b.dataset.mode = 'source'; b.textContent = 'View image'; onSource(); }
    else { b.dataset.mode = 'image'; b.textContent = 'View source'; onImage(); }
  });
  bar.append(b);
  return b;
}
export function removeToggle(bar) { bar.querySelector('.cl-srcbtn')?.remove(); }

/** Put a player for `src` ({ kind: 'media', media, mime, url }) into `host`. Returns the element. */
export function showMedia(host, src, name) {
  clearMedia(host);
  const wrap = document.createElement('figure');
  wrap.className = 'cl-media cl-media--' + src.media;
  const el = document.createElement(src.media === 'video' ? 'video' : 'audio');
  el.controls = true; el.preload = 'metadata';
  if (src.media === 'video') el.playsInline = true;
  const s = document.createElement('source'); s.src = src.url; s.type = src.mime; el.append(s);
  el.addEventListener('error', () => { cap.textContent = name + ' — this browser cannot play ' + src.mime + '.'; }, true);
  const cap = document.createElement('figcaption');
  cap.textContent = name + ' · ' + (src.media === 'video' ? 'video' : 'audio') + ' (' + src.mime + ')';
  wrap.append(el, cap);
  host.append(wrap);
  if (src.revoke) live.set(host, src.url);
  return el;
}
