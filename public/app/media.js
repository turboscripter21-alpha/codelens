/* Audio / video player for media files (mp3, wav, ogg, m4a, flac, mp4, webm).
   The bytes come as a blob: URL with an allowlisted content type (CSP media-src 'self' blob:).
   Only one player per host; the previous blob URL is revoked when it is replaced. */
const live = new WeakMap();   // host -> blob URL in use

export function clearMedia(host) {
  const url = live.get(host);
  if (url) { URL.revokeObjectURL(url); live.delete(host); }
  host.querySelector('.cl-media')?.remove();
}

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
