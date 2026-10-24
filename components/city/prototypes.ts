/**
 * Building prototypes: each detailed kit building is generated ONCE per variant,
 * then merged into a single vertex-coloured BufferGeometry. Buildings.tsx draws
 * every building of a variant with one InstancedMesh, so a whole city of detailed
 * buildings costs about one draw call per variant in use.
 *
 * Scale: kit buildings are modelled at roughly 2x the city grid, so every prototype is
 * scaled uniformly to fit a 5.4-unit grid cell (Phase 1 cell size).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Tier } from "@/lib/types";
import { createTallBuilding } from "./kit/buildings/TallBuilding.js";
import { createMediumBuilding } from "./kit/buildings/MediumBuilding.js";
import { createSmallShop } from "./kit/buildings/SmallShop.js";
import { createDiner } from "./kit/buildings/Diner.js";
import { createVault } from "./kit/buildings/Vault.js";
import { PALETTE as P } from "./kit/shared/palette.js";

/** Max footprint (x or z) of a prototype after scaling, to fit the 5.4 grid cell. */
export const MAX_FOOTPRINT = 4.8;
const BASE_SCALE = 0.5;

export interface PrototypeDef {
  key: string;
  tier: Tier | "vault";
  make: () => THREE.Object3D;
}

export const PROTOTYPE_DEFS: PrototypeDef[] = [
  // tall -> Skyscraper / TallBuilding (importance sets the floor count)
  { key: "tower-a1", tier: "tower", make: () => createTallBuilding({ importance: 0, width: 6.4, depth: 6.4, seed: 3 }) },
  { key: "tower-a2", tier: "tower", make: () => createTallBuilding({ importance: 0.45, width: 6.4, depth: 6.4, seed: 5 }) },
  { key: "tower-a3", tier: "tower", make: () => createTallBuilding({ importance: 0.7, width: 6.4, depth: 6.4, seed: 7 }) },
  { key: "tower-b1", tier: "tower", make: () => createTallBuilding({ importance: 0.1, width: 6.4, depth: 6.4, tiers: 2, accentColor: P.teal, seed: 11 }) },
  { key: "tower-b2", tier: "tower", make: () => createTallBuilding({ importance: 0.6, width: 6.4, depth: 6.4, tiers: 2, accentColor: P.teal, seed: 13 }) },
  // medium -> OfficeBlock / ApartmentBuilding (MediumBuilding wrapper)
  { key: "office-2", tier: "mid", make: () => createMediumBuilding({ variant: "office", floors: 2, width: 8.6, depth: 7.4, seed: 2 }) },
  { key: "office-3", tier: "mid", make: () => createMediumBuilding({ variant: "office", floors: 3, width: 8.6, depth: 7.4, seed: 4 }) },
  { key: "apt-3", tier: "mid", make: () => createMediumBuilding({ variant: "apartment", floors: 3, width: 7.4, depth: 6.6, seed: 6 }) },
  { key: "apt-5", tier: "mid", make: () => createMediumBuilding({ variant: "apartment", floors: 5, width: 7.4, depth: 6.6, seed: 8 }) },
  // small -> Shop / Diner / SmallHouse (SmallShop wrapper)
  { key: "shop-0", tier: "shop", make: () => createSmallShop({ variant: "shop", scheme: 0, width: 6.4, depth: 5.4, seed: 2 }) },
  { key: "shop-2", tier: "shop", make: () => createSmallShop({ variant: "shop", scheme: 2, width: 6.4, depth: 5.4, seed: 3 }) },
  { key: "diner", tier: "shop", make: () => createDiner({ width: 7.6, depth: 5.8 }) },
  { key: "house", tier: "shop", make: () => createSmallHouse() },
  // secrets
  { key: "vault", tier: "vault", make: () => createVault({ width: 6, depth: 5 }) },
];

// SmallHouse via the SmallShop wrapper keeps the kit's seeded colours.
function createSmallHouse() {
  return createSmallShop({ variant: "house", width: 5.4, depth: 5, seed: 3 });
}

export interface Prototype {
  key: string;
  geometry: THREE.BufferGeometry;
  /** Footprint and height after scaling (origin at ground centre, front faces +z). */
  width: number;
  depth: number;
  height: number;
  triangles: number;
}

const tmpColor = new THREE.Color();

/** Flatten a kit group into one non-indexed geometry with a per-vertex colour from each mesh's material. */
export function bakePrototype(def: PrototypeDef, opts: { lite?: boolean; minPart?: number } = {}): Prototype {
  const minPart = opts.minPart ?? (opts.lite ? 0.45 : 0);
  const root = def.make();
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const bb0 = new THREE.Box3();
  const sz0 = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    if (minPart > 0) {
      // Lighter variants for big cities: drop small parts (rails, bolts, posts, then window panes) that vanish at city zoom anyway.
      bb0.setFromObject(m).getSize(sz0);
      if (Math.max(sz0.x, sz0.y, sz0.z) < minPart) return;
    }
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
    g.applyMatrix4(m.matrixWorld);
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    tmpColor.copy((mat as THREE.MeshLambertMaterial).color ?? tmpColor.set("#ffffff"));
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      colors[i * 3] = tmpColor.r;
      colors[i * 3 + 1] = tmpColor.g;
      colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (!g.attributes.normal) g.computeVertexNormals();
    parts.push(g);
    g = null as unknown as THREE.BufferGeometry;
  });
  const merged = mergeGeometries(parts, false)!;
  parts.forEach((p) => p.dispose());

  // Size from the FULL model, so every detail level lines up with the same lot and dims.
  const bb = new THREE.Box3().setFromObject(root);
  const size = bb.getSize(new THREE.Vector3());
  const scale = Math.min(BASE_SCALE, MAX_FOOTPRINT / Math.max(size.x, size.z));
  // Centre the footprint on the origin, keep the base on y = 0.
  root.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
  merged.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  merged.scale(scale, scale, scale);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return {
    key: def.key,
    geometry: merged,
    width: +(size.x * scale).toFixed(2),
    depth: +(size.z * scale).toFixed(2),
    height: +(size.y * scale).toFixed(2),
    triangles: merged.attributes.position.count / 3,
  };
}

/**
 * Detail levels, picked by building count so big repos stay smooth:
 * full (every part), lite (drops rails/bolts/small panes), low (keeps bodies, roofs,
 * awnings and big windows only). All levels share the same footprint and height.
 */
export type DetailLevel = "full" | "lite" | "low";
export const MIN_PART: Record<DetailLevel, number> = { full: 0, lite: 1.0, low: 1.3 };

export function detailFor(buildingCount: number): DetailLevel {
  return buildingCount <= 150 ? "full" : buildingCount <= 600 ? "lite" : "low";
}

const cache: Partial<Record<DetailLevel, Map<string, Prototype>>> = {};

/** All prototypes at one detail level, baked lazily once per page. */
export function getPrototypes(level: DetailLevel = "full"): Map<string, Prototype> {
  if (!cache[level]) cache[level] = new Map(PROTOTYPE_DEFS.map((d) => [d.key, bakePrototype(d, { minPart: MIN_PART[level] })]));
  return cache[level]!;
}

/** Shared material for every building: flat-shaded Lambert with vertex colours (the kit's look). */
export const buildingMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
