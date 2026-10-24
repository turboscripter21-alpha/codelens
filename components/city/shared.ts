import * as THREE from "three";

/**
 * Shared geometries and materials. Created once per page and reused by every
 * mesh, so the GPU sees a handful of buffers and shader programs.
 */
export const unitBox = new THREE.BoxGeometry(1, 1, 1);
export const poleGeometry = new THREE.CylinderGeometry(0.08, 0.11, 1, 6);
export const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.22, 1, 5);
export const crownGeometry = new THREE.IcosahedronGeometry(1, 0);

/** White Lambert material; per-instance colour comes from instanceColor. */
export const lambert = new THREE.MeshLambertMaterial({ color: "#ffffff" });
export const flatLambert = new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true });

const tmp = new THREE.Object3D();
const col = new THREE.Color();

export interface Inst {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
  ry?: number;
}

/** Write position/scale/colour for every instance, then flag the buffers for upload. */
export function writeInstances(mesh: THREE.InstancedMesh, items: Inst[]) {
  items.forEach((it, i) => {
    tmp.position.set(it.x, it.y, it.z);
    tmp.rotation.set(0, it.ry ?? 0, 0);
    tmp.scale.set(it.sx, it.sy, it.sz);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
    mesh.setColorAt(i, col.set(it.color));
  });
  mesh.count = items.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
}
