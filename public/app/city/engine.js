/**
 * engine.js: the CodeCity renderer, driven by a REAL project.
 *
 * Port of user-design/codecity-demo-project/city.js. The look, the lib/ components, the
 * lighting, roads, intersections, district pads, sub-plots, greenery, lamps, Gateway,
 * glowing artery, traffic, hover shells + arcs and ground labels all come from that file.
 * What changed: the layout is no longer hand-placed for demo-project; it comes from a
 * CityPlan (lib/city/blockLayout.ts, bundled in codelens-bridge.js) built from any repo.
 *
 * Performance: every static piece (buildings, roads, pads, trees, lamps...) is baked into a
 * handful of merged meshes (one per material class, vertex colours), so a city with hundreds
 * of buildings is still a few dozen draw calls. Identical pieces are baked once and reused.
 * Vehicles are merged per vehicle. Rendering pauses when nothing moves and the tab is hidden.
 * No text is ever drawn on a building: names only appear as HTML overlays.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as C from '../citylib/index.js';
import { FEATURES, LIMITS } from '../features.js';

const PAD = 0.25, SUB = 0.06;
const N = 0, S = Math.PI, W = -Math.PI / 2;

/* ------------------------------------------------------------------ buildings */
export function makeBuilding(b, colorBy = 'none') {
  const o = { ...b.opts, colorBy, moduleType: b.moduleType, language: b.language, health: b.health };
  let g;
  switch (b.comp) {
    case 'tall': g = C.createTallBuilding(o); break;
    case 'skyscraper': g = C.createSkyscraper(o); break;
    case 'office': g = C.createMediumBuilding({ ...o, variant: 'office' }); break;
    case 'apartment': g = C.createMediumBuilding({ ...o, variant: 'apartment' }); break;
    case 'office-block': g = C.createOfficeBlock(o); break;
    case 'apartment-block': g = C.createApartmentBuilding(o); break;
    case 'house': g = C.createSmallShop({ ...o, variant: 'house' }); break;
    case 'diner': g = C.createDiner(o); break;
    case 'vault': g = C.createVault(o); break;
    default: g = C.createSmallShop({ ...o, variant: 'shop' });
  }
  // keep it inside its lot
  const box = new THREE.Box3().setFromObject(g);
  const k = Math.min(1, b.lot.w / Math.max(0.01, box.max.x - box.min.x), b.lot.d / Math.max(0.01, box.max.z - box.min.z));
  if (k < 1) g.scale.setScalar(k);
  return g;
}

/* ------------------------------------------------------------------ baking (merge) */
const tmpC = new THREE.Color();
function classOf(mesh, m) {
  if (mesh.userData.noMerge || m.map || m.transparent || m.isMeshToonMaterial || !(m.isMeshLambertMaterial || m.isMeshBasicMaterial)) return 'mat:' + m.uuid;
  return m.isMeshBasicMaterial ? 'basic' : 'lambert';
}
/** Flatten a group into local-space chunks: [{cls, mat, cast, receive, pos, nrm, col, idx}] */
/* Night mode: window glass panes light up. Glass is found by its colour (the kit's glass /
   window palette, plus a building's own glassColor) on meshes that cast no shadow. Each pane
   gets a stable random value; the baker turns it into lit / dark and a warm tint per pane. */
const LAMP = 'lamp';
const GLASS = new Set(['#0584a8', '#38829e', '#f5edcd', '#fee11c', '#a9d3dc', '#e8b7c0', '#9fd0e0']);
// Colours that are only ever glass in the kit: these panes light up even when the mesh casts a
// shadow (OfficeBlock's glass ground floor, shop fronts). Cream / warm tones are also wall colours,
// so they count as windows only on thin, shadowless panes.
const PURE_GLASS = new Set(['#0584a8', '#38829e', '#a9d3dc', '#9fd0e0']);
const SIGN_GLOW = '#ffcc2b';   // the Vault's yellow trim and sign panels: lit at night like neon
const hexOf = (m) => m.color ? '#' + m.color.getHexString() : '';
/* flatten(root, minPart, glass, building, winMin): `building` turns on window detection (only
   buildings get lit windows: car glass and fountain water stay dark). Level of detail drops parts
   smaller than minPart, but window panes only below winMin, so big cities keep every lit window. */
function flatten(root, minPart = 0, glass = null, building = false, winMin = minPart) {
  let pane = 0;
  root.updateMatrixWorld(true);
  const pb = new THREE.Box3(), ps = new THREE.Vector3();
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const out = new Map();
  const m4 = new THREE.Matrix4(), n3 = new THREE.Matrix3(), v = new THREE.Vector3();
  root.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isInstancedMesh || !mesh.visible) return;
    const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const cls = classOf(mesh, m);
    // window seed: 0 = not a window; 2 = always lit (lamp bulbs, the Vault's neon trim)
    const hx = hexOf(m), gl = glass instanceof Set && glass.has(hx);
    const isWin = building && cls === 'lambert' && ((!mesh.castShadow && (GLASS.has(hx) || gl)) || PURE_GLASS.has(hx) || gl);
    const neon = building && cls === 'lambert' && !mesh.castShadow && hx === SIGN_GLOW;
    if (minPart > 0) { pb.setFromObject(mesh).getSize(ps); if (Math.max(ps.x, ps.y, ps.z) < (isWin || neon ? winMin : minPart)) return; }   // level of detail for big cities
    const key = cls + '|' + (mesh.castShadow ? 1 : 0) + (mesh.receiveShadow ? 1 : 0);
    let c = out.get(key);
    if (!c) { c = { cls, mat: m, cast: mesh.castShadow, receive: mesh.receiveShadow, pos: [], nrm: [], col: [], idx: [], uv: [], win: [] }; out.set(key, c); }
    const seed = isWin ? 0.001 + ((Math.imul(++pane + 7, 2654435761) >>> 0) % 997) / 1000 : (neon || (cls === 'basic' && glass === LAMP) ? 2 : 0);
    const geo = mesh.geometry, P = geo.attributes.position, Nn = geo.attributes.normal, UV = geo.attributes.uv;
    if (!P) return;
    m4.multiplyMatrices(inv, mesh.matrixWorld); n3.getNormalMatrix(m4);
    const base = c.pos.length / 3;
    tmpC.copy(m.color || tmpC.set('#ffffff'));
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m4); c.pos.push(v.x, v.y, v.z);
      if (Nn) { v.fromBufferAttribute(Nn, i).applyMatrix3(n3).normalize(); c.nrm.push(v.x, v.y, v.z); } else c.nrm.push(0, 1, 0);
      c.col.push(tmpC.r, tmpC.g, tmpC.b); c.win.push(seed);
      if (cls.startsWith('mat:')) c.uv.push(UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) c.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < P.count; i++) c.idx.push(base + i);
  });
  // packed typed arrays: the flat cache holds one entry per model / building, so plain JS number
  // arrays here cost about 4x the memory (118 MB of heap on a 350-building city before this)
  return [...out.values()].map(c => ({ ...c, pos: new Float32Array(c.pos), nrm: new Float32Array(c.nrm), col: new Float32Array(c.col),
    idx: new Uint32Array(c.idx), uv: new Float32Array(c.uv), win: c.win.some(w => w) ? new Float32Array(c.win) : null }));
}
const flatCache = new Map();
const glassOf = (b) => b.opts?.glassColor ? new Set(['#' + new THREE.Color(b.opts.glassColor).getHexString()]) : null;
function flatOf(key, make, glass = null) {
  let f = flatCache.get(key);
  if (!f) { const g = make(); f = flatten(g, 0, glass); g.traverse(o => o.isMesh && o.geometry.dispose()); flatCache.set(key, f); }
  return f;
}
const WIN_TONES = [[255, 214, 140], [255, 196, 110], [255, 236, 190], [210, 228, 255], [255, 178, 96]];
/* One shared uniform drives the night look of every baked mesh: 0 = day, 1 = night.
   Windows and lamp bulbs add their 'glow' vertex colour as emitted light, so lighting a whole
   city costs nothing extra per frame (no per-window lights, no extra draw calls). */
export const NIGHT = { value: 0 };
function nightPatch(mat, basic) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = NIGHT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 glow;\nvarying vec3 vGlow;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvGlow = glow;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec3 vGlow;');
    sh.fragmentShader = basic
      ? sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, max(outgoingLight * 0.26, vGlow * 1.25), uNight);   // unlit parts (artery glow) dim at night: roads never glow\n#include <opaque_fragment>')
      : sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * vGlow * uNight * 1.35;');
  };
  mat.customProgramCacheKey = () => 'cl-night' + (basic ? 'b' : 'l');
  return mat;
}
const LAMBERT = nightPatch(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), false);
const BASIC = nightPatch(new THREE.MeshBasicMaterial({ vertexColors: true }), true);

/** Collects placed chunks and builds merged meshes. */
function dropArray() { this.array = null; }
class Baker {
  constructor() { this.b = new Map(); this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.n = new THREE.Matrix3(); }
  add(chunks, x, y, z, ry = 0, s = 1) {
    this.m.compose(new THREE.Vector3(x, y, z), this.q.setFromEuler(this.e.set(0, ry, 0)), new THREE.Vector3(s, s, s));
    this.n.getNormalMatrix(this.m);
    const me = this.m.elements, ne = this.n.elements;
    for (const c of chunks) {
      const key = c.cls + '|' + (c.cast ? 1 : 0) + (c.receive ? 1 : 0);
      let t = this.b.get(key);
      if (!t) { t = { c, parts: [], verts: 0, tris: 0 }; this.b.set(key, t); }
      t.parts.push({ c, me: me.slice(), ne: ne.slice() });
      t.verts += c.pos.length / 3; t.tris += c.idx.length;
    }
  }
  build(parent, name) {
    const meshes = [];
    for (const t of this.b.values()) {
      const pos = new Float32Array(t.verts * 3), nrm = new Float32Array(t.verts * 3), col = new Uint8Array(t.verts * 3);
      const uvs = t.c.cls.startsWith('mat:') ? new Float32Array(t.verts * 2) : null;
      const glow = new Uint8Array(t.verts * 3);   // night window / lamp light (vertex colour of the emitted light)
      let anyGlow = false;
      const big = t.verts > 65535, idx = big ? new Uint32Array(t.tris) : new Uint16Array(t.tris);
      let vo = 0, io = 0;
      for (const { c, me, ne } of t.parts) {
        const n = c.pos.length / 3;
        for (let i = 0; i < n; i++) {
          const x = c.pos[i * 3], y = c.pos[i * 3 + 1], z = c.pos[i * 3 + 2], o = (vo + i) * 3;
          pos[o] = me[0] * x + me[4] * y + me[8] * z + me[12]; pos[o + 1] = me[1] * x + me[5] * y + me[9] * z + me[13]; pos[o + 2] = me[2] * x + me[6] * y + me[10] * z + me[14];
          const a = c.nrm[i * 3], bb = c.nrm[i * 3 + 1], cc = c.nrm[i * 3 + 2];
          nrm[o] = ne[0] * a + ne[3] * bb + ne[6] * cc; nrm[o + 1] = ne[1] * a + ne[4] * bb + ne[7] * cc; nrm[o + 2] = ne[2] * a + ne[5] * bb + ne[8] * cc;
          col[o] = Math.round(c.col[i * 3] * 255); col[o + 1] = Math.round(c.col[i * 3 + 1] * 255); col[o + 2] = Math.round(c.col[i * 3 + 2] * 255);
          if (uvs) { uvs[(vo + i) * 2] = c.uv[i * 2]; uvs[(vo + i) * 2 + 1] = c.uv[i * 2 + 1]; }
        }
        if (c.win) {
          const ph = ((Math.imul(Math.round(me[12] * 7.3) + 31, 73856093) ^ Math.imul(Math.round(me[14] * 5.1) + 17, 19349663)) >>> 0) / 4294967296;
          for (let i = 0; i < n; i++) {
            const w = c.win[i]; if (!w) continue;
            const o = (vo + i) * 3;
            if (w === 2) { glow[o] = 255; glow[o + 1] = 226; glow[o + 2] = 150; anyGlow = true; continue; }
            // per pane, per building: every pane glows; about 88% bright in a few warm / cool tones,
            // the rest a dim lamp-behind-curtains glow, so every building reads clearly lit at night
            const u = (w + ph) % 1;
            const tone = WIN_TONES[Math.floor(u * 97) % WIN_TONES.length], k = u > 0.88 ? 0.42 : 0.72 + 0.28 * ((u * 13.7) % 1);
            glow[o] = tone[0] * k; glow[o + 1] = tone[1] * k; glow[o + 2] = tone[2] * k; anyGlow = true;
          }
        }
        for (let i = 0; i < c.idx.length; i++) idx[io + i] = c.idx[i] + vo;
        vo += n; io += c.idx.length;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
      if (uvs) g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      if (anyGlow || t.c.cls === 'lambert' || t.c.cls === 'basic') g.setAttribute('glow', new THREE.BufferAttribute(glow, 3, true));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      const mat = t.c.cls === 'lambert' ? LAMBERT : t.c.cls === 'basic' ? BASIC : t.c.mat;
      // once on the GPU the CPU copies are not needed (picking uses the proxy boxes): free them
      for (const a of [...Object.values(g.attributes), g.index]) a.onUpload(dropArray);
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = FEATURES.shadows && t.c.cast; mesh.receiveShadow = FEATURES.shadows && t.c.receive; mesh.name = name;
      parent.add(mesh); meshes.push(mesh);
    }
    this.b.clear();
    return meshes;
  }
}
/** Vehicles: one InstancedMesh per (vehicle look, material class); movers move plain Object3Ds. */
class VehiclePool {
  constructor() { this.kinds = new Map(); }
  get(make, key) {
    let k = this.kinds.get(key);
    if (!k) { k = { make, objs: [] }; this.kinds.set(key, k); }
    const o = new THREE.Object3D(); k.objs.push(o); return o;
  }
  build(parent) {
    this.meshes = [];
    for (const [key, k] of this.kinds) {
      const g = new THREE.Group(), bk = new Baker();
      bk.add(flatOf(key, k.make), 0, 0, 0); bk.build(g, key);
      for (const m of g.children) {
        const im = new THREE.InstancedMesh(m.geometry, m.material, k.objs.length);
        im.name = key; im.frustumCulled = false; im.castShadow = false; parent.add(im);
        this.meshes.push({ im, objs: k.objs });
      }
    }
    this.sync();
  }
  sync() {
    for (const { im, objs } of this.meshes || []) { objs.forEach((o, i) => { o.updateMatrix(); im.setMatrixAt(i, o.matrix); }); im.instanceMatrix.needsUpdate = true; }
  }
}

/* ------------------------------------------------------------------ the city */
export function createCity(host, plan, { onSelect, onOpen, onHover, colorBy: cb0 = 'none', labels: lb0 = FEATURES.folderLabels, night: night0 = false } = {}) {
  let colorBy = FEATURES.colorCoding ? cb0 : 'none', showLabels = FEATURES.folderLabels && lb0;
  let running = true, need = true, raf = 0, frames = 0, simT = 0, last = performance.now(), inTick = false, labelsDirty = true;
  // No preserveDrawingBuffer (it forces a full-buffer copy every frame); pixel ratio capped at 1.5.
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const DPR_FULL = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(DPR_FULL);
  renderer.shadowMap.enabled = FEATURES.shadows; renderer.shadowMap.type = THREE.PCFShadowMap;
  // The city is static, so the sun's shadow map is drawn once (and again only when the
  // buildings are rebaked), not every frame. Vehicles cast no shadows.
  renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  host.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  const overlay = document.createElement('div'); overlay.className = 'cc-labels'; host.appendChild(overlay);
  const tip = document.createElement('div'); tip.className = 'cc-tip'; host.appendChild(tip);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe4ea);
  const B = plan.bounds, W0 = B.x1 - B.x0, D0 = B.z1 - B.z0, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, span = Math.max(W0, D0);
  scene.fog = new THREE.Fog(0xdfe4ea, span * 1.4 + 120, span * 2.6 + 300);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.0); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  const SUN_DIR = new THREE.Vector3(14, 26, 12).normalize();
  sun.position.copy(SUN_DIR).multiplyScalar(span + 60).add(new THREE.Vector3(cx, 0, cz));
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = FEATURES.shadows; sun.shadow.mapSize.set(2048, 2048);
  const sh = span * 0.62 + 10;
  Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh, near: 1, far: span * 2.6 + 200 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(span * 6 + 400, span * 6 + 400), new THREE.MeshLambertMaterial({ color: 0xc9d1bd }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(cx, -0.02, cz); ground.receiveShadow = true; scene.add(ground);
  const XL = plan.XL, ZL = plan.ZL, nC = XL.length - 1, nR = ZL.length - 1;
  const cityBase = new THREE.Mesh(new THREE.PlaneGeometry(XL[nC] - XL[0] + 24, ZL[nR] - ZL[0] + 24), new THREE.MeshLambertMaterial({ color: 0xbfc4ca }));
  cityBase.rotation.x = -Math.PI / 2; cityBase.position.set((XL[0] + XL[nC]) / 2, -0.01, (ZL[0] + ZL[nR]) / 2); cityBase.receiveShadow = true; scene.add(cityBase);

  /* ---- static scenery, baked */
  const staticG = new THREE.Group(); scene.add(staticG);
  const bk = new Baker();
  const staticStats = {};
  // Fine detail (trees, grass tufts, flowers, benches, lamps) is baked separately so the
  // quality governor can hide it while the camera moves on big cities.
  const DETAIL = new Set(['tree', 'grass', 'flowers', 'bench', 'lamp', 'fountain']);
  const bkD = new Baker();
  const place = (key, make, x, z, ry = 0, y = 0) => {
    const k = key.split(':')[0], f = flatOf(key, make, k === 'lamp' ? LAMP : null);
    const st = staticStats[k] || (staticStats[k] = { n: 0, tris: 0 });
    st.n++; for (const c of f) st.tris += c.idx.length / 3;
    (DETAIL.has(k) ? bkD : bk).add(f, x, y, z, ry);
  };
  const art = plan.artery, gw = plan.gateway;
  const artRow = art ? art.line : -1;
  const isArtSeg = (r, c) => art && r === artRow && c === art.c0;
  // intersections
  for (let r = 0; r <= nR; r++) for (let c = 0; c <= nC; c++) {
    const sides = [];
    if (r > 0) sides.push('n'); if (r < nR) sides.push('s');
    if (c > 0) sides.push('w'); if (c < nC || (FEATURES.gateway && r === artRow)) sides.push('e');
    if (c === nC && FEATURES.gateway && r === (art ? artRow : -1)) { /* exit east */ }
    place('x:' + sides.join(''), () => C.createRoadIntersection({ sides }), XL[c], ZL[r]);
  }
  // E-W streets
  for (let r = 0; r <= nR; r++) for (let c = 0; c < nC; c++) {
    if (isArtSeg(r, c)) continue;
    const a = XL[c] + 7, b = XL[c + 1] - 7, L = +(b - a).toFixed(2);
    place('rs:' + L, () => C.createRoadStraight({ length: L }), (a + b) / 2, ZL[r], Math.PI / 2);
  }
  // N-S streets
  for (let c = 0; c <= nC; c++) for (let r = 0; r < nR; r++) {
    const a = ZL[r] + 7, b = ZL[r + 1] - 7, L = +(b - a).toFixed(2);
    place('rs:' + L, () => C.createRoadStraight({ length: L }), XL[c], (a + b) / 2);
  }
  // main artery (CommonPath), animated glow: kept as its own object
  // Everything static in it is baked with the city; only the moving flow pulses stay live,
  // as one instanced mesh (same look, one draw call).
  let artery = null;
  const arteryMats = [];   // unlit glow materials: dimmed at night so roads never glow
  if (art && FEATURES.glowArtery) {
    const length = art.x1 - art.x0;
    const g = C.createCommonPath({ length, intensity: 0.95, width: 14 });
    g.userData.paused = true;
    const pulses = [];
    g.traverse(m => { if (m.isMesh && Math.abs(m.position.y - 0.235) < 1e-3) pulses.push(m); });
    pulses.forEach(m => m.parent.remove(m));
    g.position.set((art.x0 + art.x1) / 2, 0, art.z); g.rotation.y = Math.PI / 2;
    g.traverse(m => { if (m.isMesh) { m.receiveShadow = true; if (m.material?.isMeshBasicMaterial && !arteryMats.some(a => a.m === m.material)) arteryMats.push({ m: m.material, c: m.material.color.clone(), o: m.material.opacity }); } });
    bk.add(flatten(g), g.position.x, 0, g.position.z, g.rotation.y);
    if (pulses.length) {
      const im = new THREE.InstancedMesh(pulses[0].geometry, pulses[0].material, pulses.length);
      im.frustumCulled = false; scene.add(im);
      const n = pulses.length, o = new THREE.Object3D();
      artery = { userData: { im, setTime(t) {
        for (let i = 0; i < n; i++) {
          const z = ((t * 8 + (i * length) / n) % length) - length / 2;   // CommonPath's own formula (flowSpeed 8)
          o.position.set(g.position.x + z, 0.235, art.z); o.rotation.set(0, Math.PI / 2, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
      } } };
      artery.userData.setTime(0);
    } else artery = { userData: {} };
  }
  // exit road + Gateway (east edge)
  const gwZ = gw.z;
  if (FEATURES.gateway) {
    const a = XL[nC] + 7, L = +(gw.exitEnd - a).toFixed(2);
    place('rs:' + L, () => C.createRoadStraight({ length: L }), (a + gw.exitEnd) / 2, gwZ, Math.PI / 2);
    place('gateway', () => C.createGateway({ open: true }), gw.x, gwZ, Math.PI / 2);
  }
  // district pads + curb rings, sub-plots, footpaths
  const padBox = (x0, x1, z0, z1, opt = {}) => {
    const L = +(z1 - z0).toFixed(2), Wd = +(x1 - x0).toFixed(2);
    const key = `sw:${L}:${Wd}:${opt.color || ''}:${opt.height ?? ''}:${opt.tiles === false ? 0 : 1}`;
    place(key, () => C.createSidewalk({ length: L, width: Wd, curb: 'none', ...opt }), (x0 + x1) / 2, (z0 + z1) / 2, 0, opt.y ?? 0);
  };
  const curbRing = (x0, x1, z0, z1) => {
    const c = '#d9d9d9', o = { tiles: false, color: c, height: PAD + 0.02 };
    padBox(x0, x1, z0 - 0.3, z0, o); padBox(x0, x1, z1, z1 + 0.3, o); padBox(x0 - 0.3, x0, z0, z1, o); padBox(x1, x1 + 0.3, z0, z1, o);
  };
  const SEED = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const treeAt = (x, z, v, seed, y) => place(`tree:${v}:${seed % 24}`, () => C.createTree({ variant: v, seed: seed % 24 }), x, z, 0, y);
  const grass = (r, seed, y) => {
    const w = +(r.x1 - r.x0).toFixed(1), d = +(r.z1 - r.z0).toFixed(1);
    if (w < 1 || d < 1) return;
    place(`grass:${w}:${d}:${seed % 6}:${big ? 1 : 0}`, () => C.createGrassPatch({ width: w, depth: d, tufts: Math.min(big ? 24 : 60, Math.round(w * d / (big ? 30 : 14))), seed: seed % 6 }), (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0, y);
  };
  // big cities: sparser greenery detail (trees, flowers, grass tufts) to keep the triangle count sane
  const big = plan.buildings.length > 150, flowersIn = {};
  for (const d of plan.districts) {
    const p = d.pad;
    padBox(p.x0 + 0.3, p.x1 - 0.3, p.z0 + 0.3, p.z1 - 0.3); curbRing(p.x0 + 0.3, p.x1 - 0.3, p.z0 + 0.3, p.z1 - 0.3);
    if (d.kind === 'park') {
      if (FEATURES.parks) {
        // createPark's detail grows with area (about 14 tris per m2), so big leftover cells get a
        // park of at most PARK_MAX x PARK_MAX in the middle, on a lawn with scattered trees.
        const PARK_MAX = 46, mx = (p.x0 + p.x1) / 2, mz = (p.z0 + p.z1) / 2;
        const fw = p.x1 - p.x0 - 3, fd = p.z1 - p.z0 - 3;
        const w = +Math.min(fw, PARK_MAX).toFixed(1), dd = +Math.min(fd, PARK_MAX).toFixed(1);
        if (fw > PARK_MAX || fd > PARK_MAX) {
          grass({ x0: p.x0 + 1.5, x1: p.x1 - 1.5, z0: p.z0 + 1.5, z1: p.z1 - 1.5 }, SEED(d.key), PAD);
          const V = ['round', 'cone', 'tall'], n = Math.min(40, Math.round((fw * fd - w * dd) / 220));
          for (let k = 0; k < n; k++) {
            const h = SEED(d.key + ':t' + k);
            const x = p.x0 + 3 + (h % 1000) / 1000 * (fw - 3), z = p.z0 + 3 + ((h >>> 10) % 1000) / 1000 * (fd - 3);
            if (Math.abs(x - mx) < w / 2 + 2 && Math.abs(z - mz) < dd / 2 + 2) continue;
            treeAt(x, z, V[h % 3], h, PAD + 0.3);
          }
        }
        place(`park:${w}:${dd}`, () => C.createPark({ width: w, depth: dd, seed: 6 }), mx, mz, 0, PAD + (fw > PARK_MAX || fd > PARK_MAX ? 0.04 : 0));
      }
      continue;
    }
    if (FEATURES.subPlots) for (const s of d.subplots) padBox(s.x0, s.x1, s.z0, s.z1, { color: '#b9bcc2', height: SUB, y: PAD });
    if (FEATURES.footpaths) for (const f of d.footpaths) { const L = +(f.x1 - f.x0).toFixed(1); place(`path:${L}`, () => C.createPath({ length: L, width: 1.7, style: 'paver' }), f.x0, f.z, Math.PI / 2, PAD); }
    if (FEATURES.parks) d.greens.forEach((g, i) => {
      const seed = SEED(d.key + i);
      grass(g, seed, PAD);
      const area = (g.x1 - g.x0) * (g.z1 - g.z0), n = Math.max(1, Math.min(big ? 5 : 14, Math.round(area / (big ? 70 : 30))));
      const V = ['round', 'cone', 'tall'];
      for (let k = 0; k < n; k++) {
        const h = SEED(d.key + ':' + i + ':' + k);
        const x = g.x0 + 1 + (h % 1000) / 1000 * Math.max(0.1, g.x1 - g.x0 - 2), z = g.z0 + 1 + ((h >>> 10) % 1000) / 1000 * Math.max(0.1, g.z1 - g.z0 - 2);
        treeAt(x, z, V[h % 3], h, PAD + 0.3);
      }
      if (area > (big ? 90 : 40) && SEED(d.key + 'f' + i) % 2 && (flowersIn.n = (flowersIn.n || 0) + 1) <= (big ? 20 : 999)) place('flowers:' + (i % 8), () => C.createFlowerBed({ seed: i % 8 }), (g.x0 + g.x1) / 2, g.z1 - 1, 0, PAD);
    });
    if (FEATURES.plazas && d.plaza) {
      const { x, z } = d.plaza;
      place('fountain', () => C.createFountain({ radius: 2.2 }), x, z, 0, PAD);
      place('bench', () => C.createBench(), x, z + 3.6, S, PAD); place('bench', () => C.createBench(), x - 3.6, z, -W, PAD); place('bench', () => C.createBench(), x + 3.6, z, W, PAD);
    }
  }
  if (FEATURES.lamps) for (const l of plan.lamps) place('lamp', () => C.createStreetLamp(), l.x, l.z, l.ry, 0);
  if (FEATURES.trees) for (const t of plan.trees) treeAt(t.x, t.z, t.variant, t.seed, 0);
  bk.build(staticG, 'static');
  const detailG = new THREE.Group(); scene.add(detailG); bkD.build(detailG, 'detail');

  /* ---- buildings: baked into a few meshes, rebuilt when colour-coding changes */
  const bGroup = new THREE.Group(); scene.add(bGroup);
  const bLo = new THREE.Group(); bLo.visible = false; scene.add(bLo);   // low-detail buildings, shown only while the camera moves on big cities
  const byId = new Map(plan.buildings.map((b, i) => [b.id, i]));
  const info = plan.buildings.map(() => ({ box: new THREE.Box3(), anchor: new THREE.Vector3(), h: 1 }));
  // Level of detail: big cities drop the smallest parts (bolts, rails, small panes) that vanish at city zoom.
  let sceneTris = 0, bigCity = false;
  const dark = [], darkLo = [];
  const nB = plan.buildings.length, minPart = nB > 450 ? 0.9 : nB > 150 ? 0.5 : 0;
  function buildBuildings() {
    bGroup.traverse(o => o.isMesh && o.geometry.dispose()); bGroup.clear();
    const bb = new Baker(); dark.length = 0;
    plan.buildings.forEach((b, i) => {
      const key = `b:${minPart}:${b.comp}:${JSON.stringify(b.opts)}:${colorBy}:${colorBy === 'none' ? '' : b.moduleType + b.language + (b.health || '')}`;
      let f = flatCache.get(key), size = flatCache.get(key + ':size');
      if (!f) {
        const g = makeBuilding(b, colorBy);
        const lb = new THREE.Box3().setFromObject(g);
        size = { x0: lb.min.x, x1: lb.max.x, z0: lb.min.z, z1: lb.max.z, h: lb.max.y };
        f = flatten(g, minPart, glassOf(b), true, Math.min(minPart, 0.5)); g.traverse(o => o.isMesh && o.geometry.dispose());
        flatCache.set(key, f); flatCache.set(key + ':size', size);
      }
      bb.add(f, b.x, b.y, b.z, b.ry);
      if (!f.some(c => c.win)) dark.push(b.id);   // a building with no lit pane at night (should stay empty)
      const rot = Math.abs(Math.sin(b.ry)) > 0.5;
      const hx = Math.max(Math.abs(size.x0), Math.abs(size.x1)), hz = Math.max(Math.abs(size.z0), Math.abs(size.z1));
      const ex = rot ? hz : hx, ez = rot ? hx : hz;
      info[i].box.set(new THREE.Vector3(b.x - ex, b.y, b.z - ez), new THREE.Vector3(b.x + ex, b.y + size.h, b.z + ez));
      info[i].h = size.h;
      info[i].anchor.set(b.x, b.y + Math.min(size.h * 0.75, 20) + 1.5, b.z);
    });
    bb.build(bGroup, 'buildings');
    // Big cities also get a low-detail bake (only walls, roofs and big parts) for camera motion.
    const tris = (g) => { let t = 0; g.traverse(o => { if (o.isMesh) t += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; }); return t; };
    sceneTris = tris(bGroup) + tris(staticG) + tris(detailG);
    bigCity = sceneTris > 350000;
    bLo.traverse(o => o.isMesh && o.geometry.dispose()); bLo.clear();
    darkLo.length = 0;
    if (bigCity) {
      const lo = new Baker();
      plan.buildings.forEach((b) => {
        const key = `blo:${b.comp}:${JSON.stringify(b.opts)}:${colorBy}:${colorBy === 'none' ? '' : b.moduleType + b.language + (b.health || '')}`;
        let f = flatCache.get(key);
        if (!f) { const g = makeBuilding(b, colorBy); f = flatten(g, 2.2, glassOf(b), true, 0.5); g.traverse(o => o.isMesh && o.geometry.dispose()); flatCache.set(key, f); }
        lo.add(f, b.x, b.y, b.z, b.ry);
        if (!f.some(c => c.win)) darkLo.push(b.id);
      });
      lo.build(bLo, 'buildings-lo');
      bLo.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
    }
    renderer.shadowMap.needsUpdate = true;
    requestRender();
  }

  /* ---- picking proxies: one invisible instanced box mesh */
  const proxy = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }), Math.max(1, plan.buildings.length));
  scene.add(proxy);
  function updateProxies() {
    const m = new THREE.Matrix4(), s = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Quaternion();
    info.forEach((it, i) => { it.box.getSize(s); it.box.getCenter(c); m.compose(c, q, s); proxy.setMatrixAt(i, m); });
    proxy.count = plan.buildings.length; proxy.instanceMatrix.needsUpdate = true; proxy.computeBoundingSphere(); proxy.computeBoundingBox?.();
  }
  buildBuildings(); updateProxies();

  /* ---- traffic (routes on the grid, from the import graph) */
  const nodes = plan.nodes, adj = nodes.map(() => []);
  for (const [a, b] of plan.edges) { const d = Math.abs(nodes[a].x - nodes[b].x) + Math.abs(nodes[a].z - nodes[b].z); adj[a].push([b, d]); adj[b].push([a, d]); }
  const spMemo = new Map();
  function dijkstra(src) {
    if (spMemo.has(src)) return spMemo.get(src);
    const dist = nodes.map(() => Infinity), prev = nodes.map(() => -1), done = new Uint8Array(nodes.length); dist[src] = 0;
    for (let k = 0; k < nodes.length; k++) { let u = -1; for (let i = 0; i < nodes.length; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i; if (u < 0 || dist[u] === Infinity) break; done[u] = 1; for (const [v, w] of adj[u]) if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; } }
    const r = { dist, prev }; spMemo.set(src, r); return r;
  }
  const nodePath = (a, b) => { const out = [], sp = dijkstra(a); for (let v = b; v !== -1; v = sp.prev[v]) out.unshift(v); return out; };
  function streetRoute(A, Bp) {
    if (A.ends.every(e => Bp.ends.includes(e))) return [A.pt, Bp.pt];
    let best = null;
    for (const a of A.ends) for (const b of Bp.ends) {
      const d = Math.hypot(A.pt.x - nodes[a].x, A.pt.z - nodes[a].z) + dijkstra(a).dist[b] + Math.hypot(Bp.pt.x - nodes[b].x, Bp.pt.z - nodes[b].z);
      if (!best || d < best.d) best = { d, a, b };
    }
    return [A.pt, ...nodePath(best.a, best.b).map(i => nodes[i]), Bp.pt];
  }
  const isArtery = (a, b) => art && FEATURES.glowArtery && Math.abs(a.z - art.z) < 0.01 && Math.abs(b.z - art.z) < 0.01 && Math.max(a.x, b.x) > art.x0 - 7 && Math.min(a.x, b.x) < art.x1 + 7;
  const LANES = { bike: { road: 3.2, artery: 5.8, walk: 0.5 }, car: { road: 2, artery: 3.8, walk: 0 }, truck: { road: 2, artery: 3.8, walk: 0 }, bus: { road: 2, artery: 1.8, walk: 0 } };
  function laneOffset(raw, kind, closed = false) {
    const pts = raw.filter((p, i) => i === 0 || Math.hypot(p.x - raw[i - 1].x, p.z - raw[i - 1].z) > 1e-6);
    const segs = [], n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b.x - a.x, b.z - a.z);
      const d = { x: (b.x - a.x) / L, z: (b.z - a.z) / L };
      const type = (a.walk || b.walk) ? 'walk' : isArtery(a, b) ? 'artery' : 'road';
      segs.push({ a, b, d, nrm: { x: -d.z, z: d.x }, off: LANES[kind][type], y: type === 'walk' ? PAD + 0.04 : 0.07 });
    }
    const out = [], pushP = (x, z, y) => out.push(new THREE.Vector3(x, y, z));
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], prev = i > 0 ? segs[i - 1] : closed ? segs[segs.length - 1] : null;
      if (!prev) { pushP(s.a.x + s.nrm.x * s.off, s.a.z + s.nrm.z * s.off, s.y); continue; }
      const dot = prev.d.x * s.d.x + prev.d.z * s.d.z;
      if (Math.abs(dot) < 0.01) pushP(s.a.x + prev.nrm.x * prev.off + s.nrm.x * s.off, s.a.z + prev.nrm.z * prev.off + s.nrm.z * s.off, Math.max(s.y, prev.y));
      else if (dot > 0) { pushP(s.a.x + prev.nrm.x * prev.off, s.a.z + prev.nrm.z * prev.off, prev.y); if (prev.off !== s.off) pushP(s.a.x + s.nrm.x * s.off, s.a.z + s.nrm.z * s.off, s.y); }
      else { pushP(s.a.x + prev.nrm.x * prev.off, s.a.z + prev.nrm.z * prev.off, prev.y); pushP(s.a.x + s.nrm.x * s.off, s.a.z + s.nrm.z * s.off, s.y); }
    }
    if (segs.length === 0) return out;
    if (closed) out.push(out[0].clone()); else { const s = segs[segs.length - 1]; pushP(s.b.x + s.nrm.x * s.off, s.b.z + s.nrm.z * s.off, s.y); }
    return out;
  }
  const polyLen = (p) => { const c = [0]; for (let i = 1; i < p.length; i++) c.push(c[i - 1] + p[i].distanceTo(p[i - 1])); return c; };
  const walkPts = (b) => b.walk.map(p => ({ ...p, walk: true }));
  function routeBetween(fa, fb, kind) {
    const mid = streetRoute(fa.attach, fb.attach);
    return kind === 'bike' ? [...walkPts(fa), ...mid, ...walkPts(fb).reverse()] : mid;
  }
  const routeToGateway = (fa) => streetRoute(fa.attach, { pt: nodes[plan.exitNode], ends: [plan.exitNode, plan.exitNode] });
  const movers = [], vGroup = new THREE.Group(); scene.add(vGroup);
  const pool = new VehiclePool();
  const mergedObject = (make, key) => pool.get(make, key);
  function addPingPong(obj, raw, kind, { speed = 6, pause = 1.2, phase = 0 } = {}) {
    const fwd = laneOffset(raw, kind), back = laneOffset(raw.slice().reverse(), kind);
    if (fwd.length < 2) return;
    movers.push({ obj, legs: [fwd, back].map(p => ({ p, c: polyLen(p) })), speed, pause, phase });
  }
  function addLoop(obj, raw, kind, { speed = 6, phase = 0 } = {}) {
    const p = laneOffset(raw, kind, true); if (p.length < 2) return;
    movers.push({ obj, loop: { p, c: polyLen(p) }, speed, phase });
  }
  function placeOn(obj, P, c, s) {
    let i = 1; while (i < P.length - 1 && c[i] < s) i++;
    const a = P[i - 1], b = P[i], t = (s - c[i - 1]) / Math.max(1e-6, c[i] - c[i - 1]);
    obj.position.lerpVectors(a, b, Math.min(1, Math.max(0, t)));
    obj.position.y = (a.y === b.y) ? a.y : (t < 0.5 ? a.y : b.y);
    obj.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
  }
  function updateMovers(t) {
    for (const m of movers) {
      if (m.loop) { const L = m.loop.c[m.loop.c.length - 1]; placeOn(m.obj, m.loop.p, m.loop.c, ((t * m.speed + m.phase * L) % L + L) % L); continue; }
      const L = m.legs[0].c[m.legs[0].c.length - 1], legT = L / m.speed, cyc = 2 * (legT + m.pause);
      let u = ((t + m.phase * cyc) % cyc + cyc) % cyc, leg = 0;
      if (u > legT + m.pause) { leg = 1; u -= legT + m.pause; }
      placeOn(m.obj, m.legs[leg].p, m.legs[leg].c, Math.min(u, legT) * m.speed);
    }
  }
  const B_ = (id) => plan.buildings[byId.get(id)];
  if (FEATURES.traffic) {
    const RIDERS = ['#ff6c0d', '#202da9', '#e51907', '#038458', '#fdad36', '#0765d4', '#ff3fc3', '#7cdb04', '#0a9795'];
    // bikes = imports between files (the busiest ones first)
    const ranked = plan.links.map(l => ({ l, s: (B_(l.from)?.score || 0) + (B_(l.to)?.score || 0) })).sort((a, b) => b.s - a.s).slice(0, LIMITS.bikes);
    ranked.forEach(({ l }, i) => {
      const fa = B_(l.from), fb = B_(l.to); if (!fa || !fb) return;
      addPingPong(mergedObject(() => C.createBike({ riderColor: RIDERS[i % RIDERS.length] }), 'bike' + (i % RIDERS.length)), routeBetween(fa, fb, 'bike'), 'bike', { speed: 4.5, pause: 0.8, phase: (i * 0.137) % 1 });
    });
    // trucks = heavy jobs: CI runs the tests; the manifest builds the app
    const ci = plan.buildings.filter(b => /(^|\/)\.github\/workflows\/|(^|\/)\.gitlab-ci|(^|\/)\.circleci\//.test(b.id));
    const tests = plan.buildings.filter(b => b.moduleType === 'test' && !b.members);
    const manifest = plan.buildings.find(b => /(^|\/)(package\.json|pyproject\.toml|requirements\.txt|Cargo\.toml|go\.mod|pom\.xml|build\.gradle)$/.test(b.id) && !b.id.includes('/node_modules/'));
    const truckColors = ['#ff6c0d', '#e51907', '#038458', '#202da9'];
    let nt = 0;
    for (const c of ci) for (const t of tests.slice(0, 3)) { if (nt >= LIMITS.trucks - 1) break; addPingPong(mergedObject(() => C.createTruck({ color: truckColors[nt % 4] }), 'truck' + (nt % 4)), routeBetween(c, t, 'truck'), 'truck', { speed: 6, phase: 0.15 + nt * 0.31 }); nt++; }
    const topCore = [...plan.buildings].filter(b => b.tier === 'tall').sort((a, b) => b.score - a.score)[0];
    if (manifest && topCore && manifest !== topCore) { addPingPong(mergedObject(() => C.createTruck({ color: '#038458', cargoColor: '#f5edcd' }), 'truck-g'), routeBetween(manifest, topCore, 'truck'), 'truck', { speed: 6, phase: 0.6 }); }
    // cars = calls that leave the city through the Gateway (package registry, CI service, API code)
    if (FEATURES.gateway) {
      const out = [manifest, ci[0], ...plan.buildings.filter(b => b.moduleType === 'api' && !b.members).sort((a, b) => b.score - a.score)].filter(Boolean).slice(0, Math.ceil(LIMITS.cars / 2));
      out.forEach((fa, i) => {
        const style = ['sedan', 'van', 'hatch'][i % 3], color = ['#e51907', '#f8faf8', '#0765d4'][i % 3];
        for (let k = 0; k < 2; k++) addPingPong(mergedObject(() => C.createCar({ style, color }), 'car' + (i % 3)), routeToGateway(fa), 'car', { speed: 10, pause: 0.6, phase: k * 0.5 + i * 0.17 });
      });
    }
    // buses = events circulating on the artery and around downtown
    if (nR >= 1 && nC >= 1) {
      const n = (x, z) => ({ x, z });
      const c0 = art ? art.c0 : Math.floor(nC / 2), r0 = art ? art.line : Math.floor(nR / 2);
      const rUp = Math.max(0, r0 - 1), rDn = Math.min(nR, r0 + 1);
      const loops = [
        [n(XL[c0], ZL[r0]), n(XL[c0 + 1], ZL[r0]), n(XL[c0 + 1], ZL[rUp]), n(XL[c0], ZL[rUp])],
        [n(XL[c0 + 1], ZL[r0]), n(XL[c0], ZL[r0]), n(XL[c0], ZL[rDn]), n(XL[c0 + 1], ZL[rDn])],
        [n(XL[0], ZL[r0]), n(XL[nC], ZL[r0]), n(XL[nC], ZL[nR]), n(XL[0], ZL[nR])],
        [n(XL[nC], ZL[r0]), n(XL[0], ZL[r0]), n(XL[0], ZL[0]), n(XL[nC], ZL[0])],
      ].filter(l => new Set(l.map(p => p.x + ',' + p.z)).size === 4).slice(0, LIMITS.buses);
      const busColors = [undefined, '#ff6c0d', '#0845a5', undefined];
      loops.forEach((l, i) => addLoop(mergedObject(() => C.createBus(busColors[i] ? { color: busColors[i] } : {}), 'bus' + i), l, 'bus', { speed: 7 + (i > 1 ? 1 : 0), phase: [0, 0.1, 0.62, 0.3][i] }));
    }
  }
  pool.build(vGroup);

  /* ---- hover / select highlighting (shells + arcs), from city.js */
  const COLORS = { self: '#ffd23a', out: '#ff7a1a', in: '#19b4ff' };
  const hl = new THREE.Group(); hl.renderOrder = 10; scene.add(hl);
  const dots = [];
  const outOf = new Map(), inOf = new Map();
  for (const l of plan.links) { (outOf.get(l.from) || outOf.set(l.from, []).get(l.from)).push(l.to); (inOf.get(l.to) || inOf.set(l.to, []).get(l.to)).push(l.from); }
  // Highlight pieces are collected, then drawn as a handful of instanced / merged meshes
  // (about 6 draw calls however many links the selected file has).
  let hlShells = [], hlArcs = [], dotIM = null;
  const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1), UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX);
  const UNIT_RING = new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), DOT = new THREE.SphereGeometry(1, 10, 8);
  function shell(i, color) {
    const box = info[i].box, s = box.getSize(new THREE.Vector3()).addScalar(0.8), c = box.getCenter(new THREE.Vector3());
    hlShells.push({ s, c, color: new THREE.Color(color), y: plan.buildings[i].y + 0.06, r: Math.max(s.x, s.z) * 0.62 + 0.8 });
  }
  function arc(a, b, color) {
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y = Math.max(a.y, b.y) + 6 + a.distanceTo(b) * 0.28;
    hlArcs.push({ curve: new THREE.QuadraticBezierCurve3(a, mid, b), a, b, color: new THREE.Color(color) });
  }
  function instanced(geo, mat, items, set) {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length)); im.count = items.length; im.frustumCulled = false;
    const o = new THREE.Object3D();
    items.forEach((it, k) => { set(o, it); o.updateMatrix(); im.setMatrixAt(k, o.matrix); if (it.color) im.setColorAt(k, it.color); });
    hl.add(im); return im;
  }
  // highlight materials are made once and reused (hovering never allocates materials)
  const HLM = {
    shell: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, depthWrite: false }),
    ring: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, depthWrite: false }),
    edge: new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95, depthTest: false }),
    tube: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, depthTest: false }),
    end: new THREE.MeshBasicMaterial({ depthTest: false }),
    dot: new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false }),
  };
  const HL_MATS = new Set(Object.values(HLM));
  function flushHighlight() {
    if (hlShells.length) {
      instanced(UNIT_BOX, HLM.shell, hlShells, (o, h) => { o.position.copy(h.c); o.scale.copy(h.s); });
      instanced(UNIT_RING, HLM.ring, hlShells, (o, h) => { o.position.set(h.c.x, h.y, h.c.z); o.scale.set(h.r, 1, h.r); });
      const ep = UNIT_EDGES.attributes.position, n = ep.count, pos = new Float32Array(n * 3 * hlShells.length), col = new Float32Array(pos.length);
      hlShells.forEach((h, k) => { for (let v = 0; v < n; v++) { const o = (k * n + v) * 3; pos[o] = ep.getX(v) * h.s.x + h.c.x; pos[o + 1] = ep.getY(v) * h.s.y + h.c.y; pos[o + 2] = ep.getZ(v) * h.s.z + h.c.z; col[o] = h.color.r; col[o + 1] = h.color.g; col[o + 2] = h.color.b; } });
      const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); eg.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const e = new THREE.LineSegments(eg, HLM.edge); e.renderOrder = 11; hl.add(e);
    }
    if (hlArcs.length) {
      const parts = hlArcs.map(h => ({ g: new THREE.TubeGeometry(h.curve, 48, 0.32, 6, false), c: h.color }));
      let nv = 0, ni = 0; for (const { g } of parts) { nv += g.attributes.position.count; ni += g.index.count; }
      const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni); let vo = 0, io = 0;
      for (const { g, c } of parts) {
        pos.set(g.attributes.position.array, vo * 3);
        for (let v = 0; v < g.attributes.position.count; v++) { col[(vo + v) * 3] = c.r; col[(vo + v) * 3 + 1] = c.g; col[(vo + v) * 3 + 2] = c.b; }
        const gi = g.index.array; for (let k = 0; k < gi.length; k++) idx[io + k] = gi[k] + vo;
        vo += g.attributes.position.count; io += gi.length; g.dispose();
      }
      const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setIndex(new THREE.BufferAttribute(idx, 1));
      const t = new THREE.Mesh(tg, HLM.tube); t.renderOrder = 12; t.frustumCulled = false; hl.add(t);
      const ends = []; for (const h of hlArcs) ends.push({ p: h.a, color: h.color }, { p: h.b, color: h.color });
      const em = instanced(DOT, HLM.end, ends, (o, h) => { o.position.copy(h.p); o.scale.setScalar(0.55); }); em.renderOrder = 12;
      for (const h of hlArcs) for (let k = 0; k < 2; k++) dots.push({ curve: h.curve, k });
      dotIM = instanced(DOT, HLM.dot, dots, (o) => o.scale.setScalar(0.75)); dotIM.renderOrder = 13;
      updateDots(simT);
    }
    hlShells = []; hlArcs = [];
  }
  const gateAnchor = new THREE.Vector3(gw.x, 8, gw.z);
  const SHARED_HL = new Set([UNIT_BOX, UNIT_EDGES, UNIT_RING, DOT]);
  let hlId;
  function highlight(id) {
    if (id === hlId && hl.children.length) return;   // same building: nothing to rebuild
    hlId = id;
    hl.traverse(o => { if (o.geometry && !SHARED_HL.has(o.geometry)) o.geometry.dispose(); if (o.material && !HL_MATS.has(o.material)) o.material.dispose?.(); if (o.isInstancedMesh) o.dispose(); });
    hl.clear(); dots.length = 0; dotIM = null; hlShells = []; hlArcs = [];
    const i = byId.get(id); if (i === undefined) { requestRender(); return; }
    shell(i, COLORS.self, true);
    if (FEATURES.connectionLines) {
      for (const to of (outOf.get(id) || []).slice(0, LIMITS.arcs)) { const j = byId.get(to); shell(j, COLORS.out); arc(info[i].anchor, info[j].anchor, COLORS.out); }
      for (const from of (inOf.get(id) || []).slice(0, LIMITS.arcs)) { const j = byId.get(from); shell(j, COLORS.in); arc(info[j].anchor, info[i].anchor, COLORS.in); }
    }
    flushHighlight();
    requestRender();
  }
  const _dotO = new THREE.Object3D();
  function updateDots(t) {
    if (!dotIM) return;
    dots.forEach(({ curve, k }, n) => { _dotO.position.copy(curve.getPoint((t * 0.35 + k * 0.5) % 1)); _dotO.scale.setScalar(0.75); _dotO.updateMatrix(); dotIM.setMatrixAt(n, _dotO.matrix); });
    dotIM.instanceMatrix.needsUpdate = true;
  }

  /* ---- ground labels (HTML overlay, never painted on buildings) */
  // long folder paths are shortened to their last two parts ("…/app/cache-tags/"); the full path is the tooltip
  const shortLabel = (t) => {
    if (t.length <= 26) return t;
    const m = t.match(/^(.*?)(\/?)(\s*\(.*\))?$/), parts = m[1].split('/').filter(Boolean);
    return parts.length > 2 ? '…/' + parts.slice(-2).join('/') + m[2] + (m[3] || '') : t;
  };
  const LABELS = [];
  for (const d of plan.districts) {
    if (d.kind === 'park') continue;
    LABELS.push([d.label, (d.pad.x0 + d.pad.x1) / 2, d.pad.z1 - 1.2, 'big']);
    for (const s of d.subplots) if (s.label) LABELS.push([s.label, (s.x0 + s.x1) / 2, s.z1 - 0.8, 'sub']);
  }
  if (FEATURES.gateway) LABELS.push(['Gateway → outside world', gw.x, gwZ + 6.5, 'gate']);
  if (artery) LABELS.push(['main artery · common path', (art.x0 + art.x1) / 2 - 10, art.z + 0.2, 'artery']);
  const PRI = { gate: 0, artery: 1, big: 2, sub: 3 };
  const labelEls = LABELS.map((L, i) => ({ L, i, n: L[3] === 'big' ? -(plan.districts.find(d => d.label === L[0])?.buildings.length || 0) : 0 }))
    .sort((a, b) => PRI[a.L[3]] - PRI[b.L[3]] || a.n - b.n || a.i - b.i).slice(0, LIMITS.labels)
    .map(({ L: [t, x, z, cls] }) => { const d = document.createElement('div'); d.className = 'glabel ' + (cls || ''); const sh = shortLabel(t); d.textContent = sh; d.title = t; overlay.appendChild(d); return { d, v: new THREE.Vector3(x, 0.4, z), w: sh.length * (cls === 'big' ? 7.6 : 6.6) + 14, gate: cls === 'gate' }; });
  const pv = new THREE.Vector3();
  /* numbered "where to start" markers (HTML, above the roofs): [{ id, n, title }] */
  const marks = document.createElement('div'); marks.className = 'cc-marks'; host.appendChild(marks);
  let markEls = [];
  function setMarkers(list = []) {
    marks.replaceChildren(); markEls = [];
    for (const m of list) {
      const i = byId.get(m.id); if (i === undefined) continue;
      const b = info[i].box, d = document.createElement('button');
      d.type = 'button'; d.className = 'cc-mark'; d.textContent = String(m.n); d.title = m.title || ''; d.dataset.markId = m.id;
      d.setAttribute('aria-label', 'Start here ' + m.n + ': ' + (m.title || m.id));
      d.addEventListener('click', (e) => { e.stopPropagation(); m.onClick && m.onClick(); });
      marks.appendChild(d);
      markEls.push({ d, v: new THREE.Vector3((b.min.x + b.max.x) / 2, b.max.y + 2.2, (b.min.z + b.max.z) / 2) });
    }
    labelsDirty = true; requestRender();
  }
  function updateMarks() {
    if (!markEls.length) return;
    const w = host.clientWidth, h = host.clientHeight;
    for (const M of markEls) {
      pv.copy(M.v).project(cam);
      const vis = pv.z < 1 && Math.abs(pv.x) < 1.02 && Math.abs(pv.y) < 1.02;
      const disp = vis ? 'flex' : 'none'; if (M.disp !== disp) { M.d.style.display = disp; M.disp = disp; }
      if (vis) { const tf = `translate(-50%,-100%) translate(${((pv.x + 1) / 2 * w).toFixed(1)}px,${((1 - pv.y) / 2 * h).toFixed(1)}px)`; if (M.tf !== tf) { M.d.style.transform = tf; M.tf = tf; } }
    }
  }
  function updateLabels() {
    labelsDirty = false;
    updateMarks();
    const od = showLabels ? 'block' : 'none'; if (overlay.style.display !== od) overlay.style.display = od; if (!showLabels) return;
    const w = host.clientWidth, h = host.clientHeight, placed = [];
    for (const L of labelEls) {
      pv.copy(L.v).project(cam);
      let vis = pv.z < 1 && Math.abs(pv.x) < 1.05 && Math.abs(pv.y) < 1.05;
      let x = (pv.x + 1) / 2 * w; const y = (1 - pv.y) / 2 * h;
      if (vis && L.gate) x = Math.max(L.w / 2 + 6, Math.min(w - L.w / 2 - 6, x));   // the Gateway label slides in rather than hiding
      if (vis) {   // skip labels that would overlap one already shown (biggest folders win)
        const r = { x0: x - L.w / 2 - 3, x1: x + L.w / 2 + 3, y0: y - 10, y1: y + 10 };
        if (r.x0 < 2 || r.x1 > w - 2 || r.y0 < 2 || r.y1 > h - 2) vis = false;   // never clip at the canvas edge
        else if (placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) vis = false; else placed.push(r);
      }
      const disp = vis ? 'block' : 'none'; if (L.disp !== disp) { L.d.style.display = disp; L.disp = disp; }
      if (vis) { const tf = `translate(-50%,-50%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; if (L.tf !== tf) { L.d.style.transform = tf; L.tf = tf; } }
    }
  }

  /* ---- camera / interaction */
  const cam = new THREE.PerspectiveCamera(34, 1, 1, span * 4 + 600);
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 12; controls.maxDistance = span * 3 + 200;
  const target0 = new THREE.Vector3((XL[0] + XL[nC]) / 2 + (FEATURES.gateway ? 8 : 0), 0, (ZL[0] + ZL[nR]) / 2);
  function fitView() {
    // Fit the whole grid (plus the Gateway road) in the view: project its corners, then scale the distance.
    const dir = new THREE.Vector3(54, 136, 162).normalize();
    const x0 = XL[0] - 10, x1 = (FEATURES.gateway ? gw.x + 10 : XL[nC] + 10), z0 = ZL[0] - 10, z1 = ZL[nR] + 10;
    const tallest = Math.max(8, ...info.map(i => i.h));
    const pts = [];
    for (const x of [x0, x1]) for (const z of [z0, z1]) pts.push(new THREE.Vector3(x, 0, z));
    target0.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const ti = info.reduce((a, it, i) => (it.h > info[a].h ? i : a), 0), tc = info[ti].box.getCenter(new THREE.Vector3());
    pts.push(new THREE.Vector3(tc.x, tallest, tc.z));
    let dist = Math.max(x1 - x0, z1 - z0) * 1.2 + 20;
    for (let k = 0; k < 6; k++) {
      cam.position.copy(target0).addScaledVector(dir, dist); cam.lookAt(target0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      let m = 0; for (const p of pts) { const v = p.clone().project(cam); m = Math.max(m, Math.abs(v.x), Math.abs(v.y)); }
      dist *= m / 0.97;
    }
    cam.position.copy(target0).addScaledVector(dir, dist); controls.target.copy(target0); controls.update();
  }
  function resize() { const w = host.clientWidth || 1, h = host.clientHeight || 1; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; cam.aspect = w / h; cam.updateProjectionMatrix(); requestRender(); }
  // While the host animates (files sidebar sliding), the canvas just stretches with CSS; the real
  // resize + re-render happens once the size settles, so a big city is not redrawn every frame.
  let roT = 0, roFirst = true;
  const ro = new ResizeObserver(() => { if (roFirst) { roFirst = false; resize(); return; } clearTimeout(roT); roT = setTimeout(resize, 90); }); ro.observe(host);
  resize(); fitView();

  /* ---- day / night (FEATURES.dayNight): sun by day, moon + stars + lit windows + lamps by night */
  const DAY = { bg: new THREE.Color(0xdfe4ea), sky: new THREE.Color(0xffe9c7), hemiS: new THREE.Color(0xffffff), hemiG: new THREE.Color(0x8a8f99), hemi: 2.0, key: 1.7, keyC: new THREE.Color(0xffffff), ground: new THREE.Color(0xc9d1bd), base: new THREE.Color(0xbfc4ca) };
  const NITE = { bg: new THREE.Color(0x0b1424), sky: new THREE.Color(0x0b1424), hemiS: new THREE.Color(0x7d8cc4), hemiG: new THREE.Color(0x1a1d26), hemi: 0.55, key: 0.42, keyC: new THREE.Color(0xa9bcff), ground: new THREE.Color(0x5d6a5a), base: new THREE.Color(0x6b7078) };
  const sky = new THREE.Group(); sky.visible = !!FEATURES.dayNight; scene.add(sky);
  const disc = (r, color, opacity = 1) => new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshBasicMaterial({ color, fog: false, transparent: opacity < 1, opacity, depthWrite: opacity === 1 }));
  const sunBall = disc(1, 0xffd36b), sunHalo = disc(1.9, 0xffe7a8, 0.28), moonBall = disc(0.8, 0xe9eefc), moonHalo = disc(1.6, 0x9fb4ff, 0.16);
  const sunG = new THREE.Group(); sunG.add(sunBall, sunHalo); const moonG = new THREE.Group(); moonG.add(moonBall, moonHalo);
  sky.add(sunG, moonG);
  const skyLight = new THREE.DirectionalLight(0xfff0d0, 0.35); scene.add(skyLight, skyLight.target);   // soft light from the sun / moon disc
  // stars: one Points draw call on a dome around the city
  const starGeo = new THREE.BufferGeometry(); { const n = 900, a = new Float32Array(n * 3); let h = 1234567; const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; for (let i = 0; i < n; i++) { const az = rnd() * Math.PI * 2, el = Math.asin(0.04 + rnd() * 0.94); a[i * 3] = Math.cos(el) * Math.cos(az); a[i * 3 + 1] = Math.sin(el); a[i * 3 + 2] = Math.cos(el) * Math.sin(az); } starGeo.setAttribute('position', new THREE.BufferAttribute(a, 3)); }
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, fog: false, transparent: true, opacity: 0, depthWrite: false }));
  sky.add(stars);
  // lamp glow: soft additive halos at every lamp head (one Points draw call; only at night; roads stay plain)
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,230,160,1)'); r.addColorStop(0.35, 'rgba(255,210,120,0.45)'); r.addColorStop(1, 'rgba(255,200,100,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const lampPts = new Float32Array(((FEATURES.lamps && plan.lamps) || []).length * 3);
  (FEATURES.lamps ? plan.lamps : []).forEach((l, i) => { lampPts[i * 3] = l.x + Math.sin(l.ry || 0) * 1.4; lampPts[i * 3 + 1] = 6.2; lampPts[i * 3 + 2] = l.z + Math.cos(l.ry || 0) * 1.4; });
  const lampGeo = new THREE.BufferGeometry(); lampGeo.setAttribute('position', new THREE.BufferAttribute(lampPts, 3));
  const lampGlow = new THREE.Points(lampGeo, new THREE.PointsMaterial({ map: glowTex, size: 5.5, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd890 }));
  lampGlow.visible = false; scene.add(lampGlow);
  let qVis = true, night = 0, nightTo = 0, nightFrom = 0, nightT0 = 0;
  const NIGHT_MS = 900;
  function placeSky() {
    // the sun / moon sit low over the far side of the city, inside the default view
    const fwd = new THREE.Vector3().subVectors(controls.target, cam.position).setY(0).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    const R = span * 1.25 + 90, p = controls.target.clone().addScaledVector(fwd, R).addScaledVector(right, -R * 0.42); p.y = R * 0.42;
    const r = R * 0.055;
    sunG.position.copy(p); sunG.scale.setScalar(r); moonG.position.copy(p); moonG.scale.setScalar(r);
    skyLight.position.copy(p); skyLight.target.position.copy(controls.target);
    stars.position.copy(controls.target); stars.scale.setScalar(span * 2.2 + 400);
  }
  function applyNight(k) {
    night = k; NIGHT.value = k;
    scene.background.copy(DAY.bg).lerp(NITE.bg, k); scene.fog.color.copy(scene.background);
    hemi.color.copy(DAY.hemiS).lerp(NITE.hemiS, k); hemi.groundColor.copy(DAY.hemiG).lerp(NITE.hemiG, k); hemi.intensity = DAY.hemi + (NITE.hemi - DAY.hemi) * k;
    sun.color.copy(DAY.keyC).lerp(NITE.keyC, k); sun.intensity = DAY.key + (NITE.key - DAY.key) * k;
    ground.material.color.copy(DAY.ground).lerp(NITE.ground, k); cityBase.material.color.copy(DAY.base).lerp(NITE.base, k);
    skyLight.color.set(k < 0.5 ? 0xfff0d0 : 0xb8c6ff); skyLight.intensity = 0.35 * (1 - k) + 0.12 * k;
    sunG.visible = k < 0.98; sunBall.material.opacity = 1 - k; sunBall.material.transparent = k > 0; sunHalo.material.opacity = 0.28 * (1 - k);
    moonG.visible = k > 0.02; moonBall.material.transparent = k < 1; moonBall.material.opacity = k; moonHalo.material.opacity = 0.16 * k;
    stars.material.opacity = k; stars.visible = k > 0.02;
    lampGlow.visible = k > 0.02; lampGlow.material.opacity = 0.85 * k;
    for (const a of arteryMats) { a.m.color.copy(a.c).multiplyScalar(1 - 0.82 * k); a.m.opacity = a.o * (1 - 0.85 * k); }
    if (artery?.userData.im) artery.userData.im.visible = qVis && k < 0.5;
    labelsDirty = true;
  }
  function setNight(on, animate = true) {
    if (!FEATURES.dayNight) on = false;
    nightTo = on ? 1 : 0; nightFrom = night; nightT0 = performance.now();
    if (!animate) applyNight(nightTo);
    requestRender();
  }

  /* ---- picking + hover: at most once per frame, never while a button is down or the camera moves */
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, cam);
    const hit = ray.intersectObject(proxy, false)[0];
    return hit && hit.instanceId !== undefined ? plan.buildings[hit.instanceId].id : null;
  }
  let hovered = null, selected = null, pendingMove = null, dragging = false;
  function hoverAt(ev) {
    const p = pick(ev);
    if (p && FEATURES.tooltip) { const r = host.getBoundingClientRect(), b = B_(p); tip.style.display = 'block'; tip.style.left = (ev.clientX - r.left + 14) + 'px'; tip.style.top = (ev.clientY - r.top + 12) + 'px'; tip.replaceChildren(); const bb = document.createElement('b'); bb.textContent = b.name; const sp = document.createElement('span'); sp.textContent = b.members ? b.dir + '/' : b.id; tip.append(bb, sp); } else tip.style.display = 'none';
    renderer.domElement.style.cursor = p ? 'pointer' : '';
    if (p !== hovered) { hovered = p; highlight(hovered || selected); onHover && onHover(p); }
  }
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (ev.buttons || dragging) { pendingMove = null; if (tip.style.display !== 'none') tip.style.display = 'none'; return; }
    pendingMove = { clientX: ev.clientX, clientY: ev.clientY }; requestRender();
  });
  renderer.domElement.addEventListener('pointerleave', () => { pendingMove = null; tip.style.display = 'none'; if (hovered) { hovered = null; highlight(selected); } });
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => { down = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener('pointerup', (ev) => { if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5) return; const p = pick(ev); if (p) onSelect && onSelect(p); });
  renderer.domElement.addEventListener('dblclick', (ev) => { const p = pick(ev); if (p) { ev.preventDefault(); onOpen && onOpen(p); } });
  renderer.domElement.addEventListener('contextmenu', (ev) => ev.preventDefault());   // right-drag pans
  renderer.domElement.addEventListener('wheel', () => { motionUntil = performance.now() + 350; }, { passive: true });
  controls.addEventListener('start', () => { dragging = true; motionUntil = performance.now() + 350; tip.style.display = 'none'; requestRender(); });
  controls.addEventListener('end', () => { dragging = false; motionUntil = performance.now() + 250; requestRender(); });
  // 'change' fires from user input AND from controls.update() inside tick (damping); inside tick
  // it must not schedule another frame, or every damped frame would start one more loop.
  controls.addEventListener('change', () => { labelsDirty = true; motionUntil = Math.max(motionUntil, performance.now() + 120); requestRender(); });

  /* ---- adaptive quality governor
     While the camera moves, frame time is watched. If frames get slow the governor steps
     down: 1 = traffic frozen + hidden, 2 = lower pixel ratio, 3 = low-detail buildings and no
     small scenery. Big cities start moving at level 3. When the camera stops (idle 250 ms),
     full quality comes back for the still image. Levels never change the idle look. */
  let motionUntil = 0, inMotion = false, qLevel = 0, qFloor = 0, slow = 0, fast = 0, lastFrameT = 0, lastRenderT = 0;
  const perfRing = { cpu: new Float32Array(240), dt: new Float32Array(240), moving: new Uint8Array(240), n: 0 };
  function applyQuality(level) {
    vGroup.visible = level < 1 && FEATURES.traffic; qVis = level < 1; if (artery?.userData.im) artery.userData.im.visible = qVis && night < 0.5;
    const dpr = level >= 2 ? Math.min(DPR_FULL, 1) : DPR_FULL;
    if (renderer.getPixelRatio() !== dpr) { renderer.setPixelRatio(dpr); resize(); }
    detailG.visible = level < 3; bLo.visible = level >= 3 && bLo.children.length > 0; bGroup.visible = !bLo.visible;
  }
  function setMotion(on) {
    if (on === inMotion) return;
    inMotion = on;
    if (on) { qLevel = Math.max(qFloor, bigCity ? 3 : 0); applyQuality(qLevel); }
    else { applyQuality(0); labelsDirty = true; need = true; }
  }

  /* ---- loop: exactly one requestAnimationFrame chain; continuous only while something moves */
  const animated = movers.length > 0 || !!artery;
  function requestRender() { need = true; if (running && !raf && !inTick) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0; if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    const t0 = performance.now();
    inTick = true;
    const moving = controls.update();
    inTick = false;
    const motion = dragging || moving || now < motionUntil;
    setMotion(motion);
    if (nightTo !== night) { const k = Math.min(1, (now - nightT0) / NIGHT_MS); applyNight(nightFrom + (nightTo - nightFrom) * (k * k * (3 - 2 * k))); need = true; }
    if (pendingMove && !motion) { const ev = pendingMove; pendingMove = null; hoverAt(ev); }
    const trafficOn = animated && vGroup.visible;
    // idle traffic animates at ~30 fps (half the GPU work); camera motion renders every frame
    const due = need || motion || dots.length || (trafficOn && now - lastRenderT > 31);
    if (due) {
      simT += dt;
      if (trafficOn) { updateMovers(simT); pool.sync(); artery?.userData.setTime?.(simT); }
      updateDots(simT);
      if (labelsDirty) updateLabels();
      renderer.render(scene, cam); frames++; need = false; lastRenderT = now;
      const cpu = performance.now() - t0, i = perfRing.n++ % 240;
      perfRing.cpu[i] = cpu; perfRing.dt[i] = lastFrameT ? now - lastFrameT : 0; perfRing.moving[i] = motion ? 1 : 0; lastFrameT = now;
      if (motion && !bigCity) {   // governor: step down after 8 slow frames, step back up after 90 fast ones
        const fd = perfRing.dt[i];
        if (fd > 22) { slow++; fast = 0; if (slow > 8 && qLevel < 3) { qLevel++; qFloor = Math.max(qFloor, qLevel - 1); slow = 0; applyQuality(qLevel); } }
        else if (fd > 0 && fd < 15) { fast++; slow = 0; if (fast > 90 && qLevel > 0) { qLevel--; fast = 0; applyQuality(qLevel); } }
      }
      if (hud) drawHud(now);
    } else lastFrameT = 0;
    if (motion || need || dots.length || trafficOn || nightTo !== night || pendingMove) { if (!raf) raf = requestAnimationFrame(tick); }
  }
  placeSky(); applyNight(night0 && FEATURES.dayNight ? 1 : 0); nightTo = night;
  requestRender();
  const onVis = () => { if (document.hidden) pause(true); else pause(false); };
  document.addEventListener('visibilitychange', onVis);
  function pause(p) { running = !p; if (running) { last = performance.now(); requestRender(); } else { cancelAnimationFrame(raf); raf = 0; } }
  function perf() {
    const n = Math.min(perfRing.n, 240), mv = { cpu: [], dt: [] }, all = { cpu: [], dt: [] };
    for (let k = 0; k < n; k++) { const tgt = perfRing.moving[k] ? mv : null; all.cpu.push(perfRing.cpu[k]); if (perfRing.dt[k]) all.dt.push(perfRing.dt[k]); if (tgt) { tgt.cpu.push(perfRing.cpu[k]); if (perfRing.dt[k]) tgt.dt.push(perfRing.dt[k]); } }
    const st = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return { avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +b[Math.floor(b.length * 0.95)].toFixed(2), max: +b[b.length - 1].toFixed(2), n: a.length }; };
    return { cpuMoving: st(mv.cpu), frameMsMoving: st(mv.dt), cpuAll: st(all.cpu), quality: qLevel, bigCity, dpr: renderer.getPixelRatio(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  }
  // fps HUD: workspace.html?fps=1
  let hud = null, hudT = 0, hudN = 0;
  try { if (new URLSearchParams(location.search).get('fps') === '1') { hud = document.createElement('div'); hud.className = 'cc-hud'; host.appendChild(hud); } } catch { /* no location */ }
  function drawHud(now) {
    hudN++; if (now - hudT < 500) return;
    const fps = hudN * 1000 / (now - hudT || 1); hudT = now; hudN = 0;
    const i = (perfRing.n - 1 + 240) % 240, ri = renderer.info.render;
    hud.textContent = `${fps.toFixed(0)} fps · frame ${perfRing.dt[i].toFixed(1)} ms · js ${perfRing.cpu[i].toFixed(2)} ms\n${ri.calls} draws · ${(ri.triangles / 1000).toFixed(0)}k tris · dpr ${renderer.getPixelRatio()} · q${inMotion ? qLevel : 0}${inMotion ? ' moving' : ''}`;
  }
  return {
    select(id) { selected = id; highlight(id); },
    setColorBy(v) { if (!FEATURES.colorCoding) return; colorBy = v; buildBuildings(); },
    get colorBy() { return colorBy; },
    setLabels(v) { showLabels = !!v && FEATURES.folderLabels; updateLabels(); requestRender(); },
    get labels() { return showLabels; },
    fitView: () => { fitView(); placeSky(); requestRender(); },
    setNight, get night() { return nightTo === 1; },
    perf,
    setMarkers,
    /* smooth camera flight to a building (search, where-to-start); instant with reduced motion */
    flyTo(id, dist = 60) {
      const i = byId.get(id); if (i === undefined) return false;
      const c = info[i].box.getCenter(new THREE.Vector3()); c.y = Math.min(c.y, info[i].box.min.y + 4);
      const dir = cam.position.clone().sub(controls.target).normalize();
      const t0 = controls.target.clone(), p0 = cam.position.clone(), p1 = c.clone().addScaledVector(dir, dist);
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches, T = reduce ? 0 : 700, s0 = performance.now();
      const step = () => {
        const k = T ? Math.min(1, (performance.now() - s0) / T) : 1, e = 1 - Math.pow(1 - k, 3);
        controls.target.lerpVectors(t0, c, e); cam.position.lerpVectors(p0, p1, e); controls.update();
        labelsDirty = true; motionUntil = Math.max(motionUntil, performance.now() + 120); requestRender();
        if (k < 1) requestAnimationFrame(step);
      };
      step();
      return true;
    },
    focusOn(id, dist = 70) { const i = byId.get(id); if (i === undefined) return; const c = info[i].box.getCenter(new THREE.Vector3()); const dir = cam.position.clone().sub(controls.target).normalize(); controls.target.copy(c); cam.position.copy(c).addScaledVector(dir, dist); controls.update(); requestRender(); },
    resize, pause,
    windowStats: () => ({ buildings: plan.buildings.length, withoutLitWindows: [...dark], withoutLitWindowsLowDetail: bigCity ? [...darkLo] : null }),
    debugQuality(l) { applyQuality(l); requestRender(); },   // tests: show a governor level (3 = the low-detail moving view) on a still frame
    camState: () => ({ pos: cam.position.toArray(), target: controls.target.toArray(), dist: +cam.position.distanceTo(controls.target).toFixed(2) }),
    memInfo: () => ({ ...renderer.info.memory }),
    staticStats: () => staticStats,
    debug() { const by = {}; scene.traverse(o => { if (o.isMesh && o.visible) { const k = o.name || '?'; const t = (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1); by[k] = by[k] || { meshes: 0, tris: 0 }; by[k].meshes++; by[k].tris += Math.round(t); } }); return by; },
    render: () => { updateMovers(simT); pool.sync(); artery?.userData.setTime?.(simT); updateLabels(); renderer.render(scene, cam); return true; },
    setTime: (t) => { simT = t; },
    screenPos(id) { const i = byId.get(id); if (i === undefined) return null; const v = info[i].box.getCenter(new THREE.Vector3()).project(cam); const r = renderer.domElement.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height]; },
    info: () => ({ ...renderer.info.render, geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length, frames, buildings: plan.buildings.length, vehicles: movers.length, meshes: countMeshes() }),
    dispose() { running = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); renderer.dispose(); host.replaceChildren(); },
  };
  function countMeshes() { const by = {}; scene.traverse(o => { if (o.isMesh && o.visible) { const k = (o.name || '?').replace(/\d+$/, '') + (o.material.transparent ? '(t)' : ''); by[k] = (by[k] || 0) + 1; } }); return by; }
}

/* styles for the overlay (from the demo's index.html) */
const css = `.cc-hud{position:absolute;left:10px;top:10px;z-index:4;pointer-events:none;white-space:pre;font:600 11px/1.45 'Geist Mono',ui-monospace,Menlo,Consolas,monospace;color:#d8ffe0;background:rgba(10,14,20,.78);padding:6px 9px;border-radius:7px}
.cc-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.cc-marks{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.cc-marks .cc-mark{position:absolute;left:0;top:0;pointer-events:auto;display:flex;align-items:center;justify-content:center;width:26px;height:26px;margin-top:-6px;border-radius:50%;border:2px solid #fff;background:#ffc21a;color:#12161c;font:700 13px/1 'Geist Mono',ui-monospace,Menlo,Consolas,monospace;box-shadow:0 2px 6px rgba(0,0,0,.28);cursor:pointer;padding:0}
.cc-marks .cc-mark::after{content:'';position:absolute;left:50%;bottom:-8px;margin-left:-5px;border:5px solid transparent;border-top:6px solid #fff}
.cc-marks .cc-mark:hover,.cc-marks .cc-mark:focus-visible{background:#fff;outline:2px solid #ffc21a}
.cc-labels .glabel{position:absolute;left:0;top:0;white-space:nowrap;font:600 11px/1 'Geist Mono',ui-monospace,Menlo,Consolas,monospace;color:#2b2f36;background:rgba(255,255,255,.82);padding:3px 6px;border-radius:5px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.cc-labels .glabel.big{font-size:12px;padding:4px 8px;background:rgba(34,38,45,.86);color:#fff}
.cc-labels .glabel.sub{font-size:10px;font-weight:500;background:rgba(255,255,255,.7)}
.cc-labels .glabel.gate{background:rgba(8,69,165,.88);color:#fff}.cc-labels .glabel.artery{background:rgba(255,210,58,.92);color:#3a2e00}
.cc-tip{position:absolute;display:none;pointer-events:none;background:#22262d;color:#fff;padding:5px 8px;border-radius:7px;font-size:12px;z-index:3;max-width:360px}
.cc-tip span{display:block;color:#b9c0ca;font-family:'Geist Mono',ui-monospace,Menlo,monospace;font-size:11px;overflow:hidden;text-overflow:ellipsis}`;
if (typeof document !== 'undefined' && !document.getElementById('cc-engine-css')) { const s = document.createElement('style'); s.id = 'cc-engine-css'; s.textContent = css; document.head.appendChild(s); }
