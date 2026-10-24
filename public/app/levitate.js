/* One building, alone, levitating and turning slowly on its own axis.
   Built from the same CodeCity components and parameters as the city
   renders (see LAYOUT). Low pixel ratio, renders only while visible. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeBuilding } from './city/engine.js';

/* The building comes from the city plan (same factory + options as in the city). */

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(30,40,55,0.42)'); r.addColorStop(0.55, 'rgba(30,40,55,0.18)'); r.addColorStop(1, 'rgba(30,40,55,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createLevitator(host, { reduce = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 2.0));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.position.set(14, 26, 12); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  // wheel / pinch zoom, right-drag (or shift-drag) pan, left-drag orbit around the building
  const controls = new OrbitControls(cam, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.62;
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  renderer.domElement.style.touchAction = 'none';
  let userView = false;
  controls.addEventListener('start', () => { userView = true; if (!running) requestAnimationFrame(() => renderer.render(scene, cam)); });
  controls.addEventListener('change', () => { if (!running) renderer.render(scene, cam); });
  const spin = new THREE.Group(), lift = new THREE.Group(); lift.add(spin); scene.add(lift);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  let size = 1, height = 1, footW = 1, footD = 1, raf = 0, t0 = performance.now(), running = false;
  const TURN = 16, BOB = 3.4;           // seconds per full turn, seconds per bob

  function fit() {
    const w = host.clientWidth || 1, h = host.clientHeight || 1;
    renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    cam.aspect = w / h;
    // fit the turning building: its footprint circle across, its height (plus bob) up
    const rh = 0.5 * Math.hypot(footW, footD), vt = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), ht = vt * cam.aspect;
    const dist = Math.max((height * 0.62 + rh * 0.35) / vt, (rh * 1.2) / ht) + rh;
    const look = new THREE.Vector3(0, height * 0.55, 0);
    const dir = new THREE.Vector3(0.62, 0.3, 0.66).normalize();
    cam.updateProjectionMatrix();
    if (userView) return;   // keep the user's zoom / pan / orbit across resizes
    cam.position.copy(look).addScaledVector(dir, dist);
    controls.target.copy(look); controls.minDistance = dist * 0.25; controls.maxDistance = dist * 3; controls.update();
  }
  function pose(t) {
    if (reduce) { spin.rotation.y = -0.6; lift.position.y = height * 0.08; shadow.scale.set(size * 1.5, size * 1.5, 1); shadow.material.opacity = 0.85; return; }
    const b = Math.sin((t / BOB) * Math.PI * 2);              // -1..1
    lift.position.y = height * (0.08 + 0.035 * b);
    spin.rotation.y = -0.6 + (t / TURN) * Math.PI * 2;
    const s = size * (1.5 - 0.12 * b);                        // higher: smaller, fainter shadow
    shadow.scale.set(s, s, 1); shadow.material.opacity = 0.85 - 0.18 * b;
  }
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    controls.update(); pose((now - t0) / 1000); renderer.render(scene, cam);
  }
  const ro = new ResizeObserver(() => { fit(); pose((performance.now() - t0) / 1000); renderer.render(scene, cam); });
  ro.observe(host);

  return {
    show(path, b) {
      while (spin.children.length) { const o = spin.children.pop(); o.traverse(m => { m.geometry?.dispose?.(); }); }
      if (!b) return false;
      const g = makeBuilding(b, 'none');
      const box = new THREE.Box3().setFromObject(g), c = box.getCenter(new THREE.Vector3());
      g.position.set(-c.x, -box.min.y, -c.z);                  // turn around its own vertical axis
      spin.add(g);
      footW = box.max.x - box.min.x; footD = box.max.z - box.min.z; size = Math.max(footW, footD); height = box.max.y - box.min.y;
      userView = false; fit(); t0 = performance.now(); pose(0); renderer.render(scene, cam);
      return true;
    },
    start() { if (running || reduce) { renderer.render(scene, cam); return; } running = true; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    at(t) { pose(t); renderer.render(scene, cam); },
    camState: () => ({ pos: cam.position.toArray(), target: controls.target.toArray(), dist: +cam.position.distanceTo(controls.target).toFixed(3) }),          // review shots: a fixed moment
  };
}
