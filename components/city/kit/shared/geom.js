/**
 * geom.js — Low-poly building blocks. All helpers take a parent Object3D and place the
 * piece by its BASE (yBase = bottom of the shape), so stacking is just adding heights.
 */
import * as THREE from 'three';
import { mat } from './materials.js';

function place(parent, mesh, x, y, z, o) {
  mesh.position.set(x, y, z);
  if (o.rx) mesh.rotation.x = o.rx; if (o.ry) mesh.rotation.y = o.ry; if (o.rz) mesh.rotation.z = o.rz;
  mesh.castShadow = o.cast !== false; mesh.receiveShadow = true;
  if (o.name) mesh.name = o.name;
  if (parent) parent.add(mesh);
  return mesh;
}
/** Axis-aligned box whose bottom sits at yBase. */
export function box(parent, w, h, d, color, x = 0, yBase = 0, z = 0, o = {}) {
  return place(parent, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o)), x, yBase + h / 2, z, o);
}
/** Box positioned by its centre (useful for rotated/slanted pieces). */
export function boxC(parent, w, h, d, color, x = 0, y = 0, z = 0, o = {}) {
  return place(parent, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, o)), x, y, z, o);
}
/** Low-poly cylinder (default 8 sides) with its bottom at yBase. */
export function cyl(parent, rTop, rBot, h, color, x = 0, yBase = 0, z = 0, o = {}) {
  return place(parent, new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, o.segs ?? 8), mat(color, o)), x, yBase + h / 2, z, o);
}
/** Cylinder positioned by centre (for wheels, pipes on their side). */
export function cylC(parent, rTop, rBot, h, color, x = 0, y = 0, z = 0, o = {}) {
  return place(parent, new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, o.segs ?? 8), mat(color, o)), x, y, z, o);
}
/** Faceted blob (icosahedron) centred at (x,y,z) — leaves, bushes, clouds. */
export function blob(parent, r, color, x = 0, y = 0, z = 0, o = {}) {
  const m = place(parent, new THREE.Mesh(new THREE.IcosahedronGeometry(r, o.detail ?? 0), mat(color, o)), x, y, z, o);
  if (o.sy) m.scale.set(1, o.sy, 1);
  return m;
}
/** Triangular prism (gable roof) along X: width w, depth d, ridge height h, bottom at yBase. */
export function prism(parent, w, h, d, color, x = 0, yBase = 0, z = 0, o = {}) {
  const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.lineTo(-d / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
  return place(parent, new THREE.Mesh(g, mat(color, o)), x, yBase, z, o);
}
/** Flat disc / ring lying on the ground. */
export function ring(parent, rIn, rOut, color, x = 0, y = 0, z = 0, o = {}) {
  const g = new THREE.RingGeometry(rIn, rOut, o.segs ?? 32); g.rotateX(-Math.PI / 2);
  const m = place(parent, new THREE.Mesh(g, mat(color, o)), x, y, z, o); m.castShadow = false; return m;
}
/** Run fn(faceGroup, faceWidth) for each of the 4 walls of a w x d footprint. faceGroup's +Z points outward, origin on the wall. */
export function eachFace(parent, w, d, fn, faces = ['front', 'right', 'back', 'left']) {
  const defs = { front: [0, d / 2, 0, w], back: [0, -d / 2, Math.PI, w], right: [w / 2, 0, Math.PI / 2, d], left: [-w / 2, 0, -Math.PI / 2, d] };
  for (const f of faces) {
    const [x, z, ry, fw] = defs[f]; const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g); fn(g, fw, f);
  }
}
/** Make every mesh in a group cast/receive shadows and tag the group with metadata. */
export function finish(group, type, meta = {}) {
  group.traverse(o => { if (o.isMesh) { o.receiveShadow = true; } });
  group.userData = { ...group.userData, codecity: { type, ...meta } };
  group.name = group.name || type;
  return group;
}
