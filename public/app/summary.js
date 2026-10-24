/* summary.js: the Summary slideshow. A small city builds up one building per slide: the entry
   file first, then the files it imports (by importance). Each slide explains the file in plain
   words (no AI); with the user's key, "Explain with Gemini" narrates the slide.
   Light: one small renderer that only draws while something moves, buildings from the same
   factory as the city (shared materials), geometries disposed on close. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeBuilding } from './city/engine.js';
import { summaryPlan, slideText } from './insights.js';
import { keyStore, askGemini, openKeyDialog } from './keydlg.js';
const $ = (s, r = document) => r.querySelector(s);
const base = p => p.split('/').pop();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const AUTO_MS = 6500, RISE_MS = 700;

export function initSummary({ project, files, byPath, buildingOf, entryP, source, fileContext, onOpenInCity }) {
  const dlg = $('[data-sumdlg]'), btn = $('[data-summary-open]'); if (!dlg || !btn) return null;
  const stage = $('[data-sumcity]'), text = $('[data-sum-text]'), ai = $('[data-sum-ai]'), step = $('[data-sum-step]'), title = $('[data-sum-title]'), dots = $('[data-sum-dots]');
  const prev = $('[data-sum-prev]'), next = $('[data-sum-next]'), play = $('[data-sum-play]'), aiBtn = $('[data-sum-ai-btn]');
  let three = null, slides = [], entry = null, at = 0, timer = 0, aiCache = new Map(), aiGen = 0;

  function setup() {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); renderer.setClearColor(0x000000, 0);
    stage.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.7); sun.position.set(30, 50, 22); scene.add(sun);
    const cam = new THREE.PerspectiveCamera(32, 1, 0.5, 2000);
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping = false; controls.maxPolarAngle = Math.PI * 0.45; controls.enablePan = false;
    renderer.domElement.style.touchAction = 'none';
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshLambertMaterial({ color: 0xC9D1DA }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), new THREE.MeshBasicMaterial({ color: 0xFFC21A, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; scene.add(ring);
    const lineMat = new THREE.LineBasicMaterial({ color: 0xE8590C });
    const city = new THREE.Group(); scene.add(city);
    const draw = () => renderer.render(scene, cam);
    controls.addEventListener('change', draw);
    const ro = new ResizeObserver(() => { const w = stage.clientWidth || 1, h = stage.clientHeight || 1; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; cam.aspect = w / h; cam.updateProjectionMatrix(); draw(); });
    ro.observe(stage);
    three = { renderer, scene, cam, controls, ground, ring, lineMat, city, draw, ro, items: [], raf: 0 };
  }

  function layout() {
    // entry in the middle, the rest on a sunflower spiral around it (stable camera for the whole show)
    const S = Math.max(6, ...slides.map(s => { const b = buildingOf(s.path); return b ? Math.max(b.lot.w, b.lot.d) : 6; })) * 1.25;
    slides.forEach((s, i) => { const a = i * 2.39996, r = i ? S * (0.75 + 0.62 * Math.sqrt(i)) : 0; s.x = Math.cos(a) * r; s.z = Math.sin(a) * r; });
    const R = Math.max(S, ...slides.map(s => Math.hypot(s.x, s.z))) + S * 0.7;
    const T = three; T.ground.scale.setScalar(R);
    T.cam.position.set(R * 1.05, R * 1.15, R * 1.35); T.controls.target.set(0, S * 0.3, 0);
    T.controls.minDistance = R * 0.8; T.controls.maxDistance = R * 4; T.controls.update();
  }

  function clearCity() {
    const T = three; if (!T) return;
    cancelAnimationFrame(T.raf);
    for (const o of T.city.children.splice(0)) o.traverse(m => { if (m.geometry) m.geometry.dispose(); });
    T.items = [];
  }
  function build(upTo) {
    const T = three;
    // add the missing buildings, drop extra ones (going back)
    while (T.items.length > upTo + 1) { const it = T.items.pop(); T.city.remove(it.g); it.g.traverse(m => m.geometry && m.geometry.dispose()); if (it.line) { T.city.remove(it.line); it.line.geometry.dispose(); } }
    const fresh = [];
    for (let i = T.items.length; i <= upTo; i++) {
      const s = slides[i], b = buildingOf(s.path);
      const g = b ? makeBuilding(b, 'none') : new THREE.Group();
      const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3());
      const wrap = new THREE.Group(); g.position.set(-c.x, -box.min.y, -c.z); wrap.add(g); wrap.position.set(s.x, 0, s.z);
      T.city.add(wrap);
      let line = null;
      const from = s.from ? slides.find(o => o.path === s.from) : (i ? slides[0] : null);
      if (from) { line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(from.x, 0.12, from.z), new THREE.Vector3(s.x, 0.12, s.z)]), T.lineMat); T.city.add(line); }
      const it = { g: wrap, line, r: Math.max(2, 0.6 * Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z)) };
      T.items.push(it); fresh.push(it);
    }
    const cur = T.items[upTo]; T.ring.position.x = cur.g.position.x; T.ring.position.z = cur.g.position.z; T.ring.scale.setScalar(cur.r);
    if (reduce || !fresh.length) { T.draw(); return; }
    fresh.forEach(it => it.g.scale.set(1, 0.001, 1));
    const t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / RISE_MS), e = 1 - Math.pow(1 - k, 3);
      fresh.forEach(it => it.g.scale.set(1, Math.max(0.001, e), 1));
      T.draw();
      if (k < 1) T.raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(T.raf); T.raf = requestAnimationFrame(tick);
  }

  function show(i) {
    at = Math.max(0, Math.min(slides.length - 1, i));
    const s = slides[at], f = byPath[s.path];
    step.textContent = `Summary · step ${at + 1} of ${slides.length}` + (at === 0 ? ' · the entry file' : '');
    title.textContent = base(s.path);
    title.title = s.path;
    text.textContent = slideText(f, s, entry, slides.length);
    const c = aiCache.get(s.path); ai.hidden = !c; ai.textContent = c || '';
    aiGen++;
    [...dots.children].forEach((d, k) => { d.classList.toggle('is-on', k === at); d.classList.toggle('is-done', k < at); });
    prev.disabled = at === 0; next.textContent = at === slides.length - 1 ? 'Done' : 'Next →';
    build(at);
  }
  function stopAuto() { clearInterval(timer); timer = 0; play.setAttribute('aria-pressed', 'false'); play.textContent = 'Autoplay'; }
  function startAuto() {
    if (at === slides.length - 1) show(0);
    play.setAttribute('aria-pressed', 'true'); play.textContent = 'Pause';
    timer = setInterval(() => { if (at >= slides.length - 1) stopAuto(); else show(at + 1); }, AUTO_MS);
  }

  async function open() {
    entry = await entryP();
    slides = entry ? summaryPlan(files, entry, 8) : [];
    if (!slides.length) { text.textContent = 'This project has no code files to summarise.'; }
    if (!dlg.open) { dlg.showModal ? dlg.showModal() : dlg.setAttribute('open', ''); }
    if (!slides.length) return;
    if (!three) setup();
    three.ground.material.color.set(document.body.classList.contains('is-night') ? 0x263040 : 0xC9D1DA);
    document.body.classList.add('is-sum');
    clearCity(); layout();
    dots.replaceChildren(...slides.map(() => document.createElement('li')));
    show(0);
    next.focus();
  }
  function close() { stopAuto(); clearCity(); document.body.classList.remove('is-sum'); if (dlg.open) dlg.close(); }

  async function explain() {
    const s = slides[at]; if (!s) return;
    const key = keyStore.get();
    if (!key) { const ok = await openKeyDialog('To narrate the summary with AI, CodeLens needs your free Google Gemini key. The plain summary works without it.'); if (!ok) return; }
    const my = ++aiGen, f = byPath[s.path];
    ai.hidden = false; ai.className = 'ws-sum__ai is-wait'; ai.textContent = 'Gemini is reading ' + base(s.path) + '…';
    const body = { persona: 'narrator', project: project.name, file: s.path,
      question: `Slide ${at + 1} of ${slides.length} of a guided tour that starts at the entry file ${entry.path}.` + (s.from ? ` ${s.from} imports this file.` : '') + (at === 0 ? ' Explain how the program starts and the order its main functions run in.' : ' Explain what this file does for the program.'),
      context: fileContext(s.path) + '\nOffline summary: ' + slideText(f, s, entry, slides.length) };
    const src = await source(s.path).catch(() => null);
    if (src && src.kind === 'text') body.source = src.text.slice(0, 16000);
    const r = await askGemini(body);
    if (my !== aiGen) return;
    ai.className = 'ws-sum__ai' + (r.ok ? '' : ' is-err');
    ai.textContent = r.ok ? 'Gemini: ' + (r.text || '') : r.error;
    if (r.ok) aiCache.set(s.path, ai.textContent);
  }

  btn.hidden = false;
  btn.addEventListener('click', open);
  prev.addEventListener('click', () => { stopAuto(); show(at - 1); });
  next.addEventListener('click', () => { stopAuto(); if (at >= slides.length - 1) close(); else show(at + 1); });
  play.addEventListener('click', () => (timer ? stopAuto() : startAuto()));
  aiBtn.addEventListener('click', () => { stopAuto(); explain(); });
  $('[data-sum-open]').addEventListener('click', () => { const s = slides[at]; close(); if (s) onOpenInCity(s.path); });
  dlg.querySelectorAll('[data-sum-close]').forEach(b => b.addEventListener('click', close));
  dlg.addEventListener('close', () => { stopAuto(); clearCity(); document.body.classList.remove('is-sum'); });
  dlg.addEventListener('keydown', e => {
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); } else if (e.key === 'ArrowLeft') { e.preventDefault(); if (at) prev.click(); }
  });
  return { open, close, get slides() { return slides; }, show: i => show(i) };
}
