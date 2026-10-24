"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import type { Building } from "@/lib/types";
import { lambert, unitBox } from "./shared";
import { buildingMaterial, detailFor, getPrototypes } from "./prototypes";

interface Props {
  buildings: Building[];
  selectedId: string | null;
  onBuildingClick: (id: string) => void;
}

/** Above this many buildings, buildings stop casting shadows (the shadow pass would redraw every triangle). */
const SHADOWS_UP_TO = 600;

const tmp = new THREE.Object3D();
const col = new THREE.Color();
const NATURAL = new THREE.Color(1, 1, 1);
const HOVER = new THREE.Color(1.22, 1.22, 1.22);
const SELECTED = new THREE.Color(1.25, 1.12, 0.55);

/**
 * Phase 3: detailed kit buildings, drawn as ONE InstancedMesh per prototype in use
 * (Skyscraper, OfficeBlock, Apartment, Shop, Diner, SmallHouse, Vault...).
 * Clicks and hover go through one invisible instanced hit-box mesh (unit boxes,
 * never drawn), so raycasts stay cheap. Hover / selection only rewrite the instance
 * colour of one or two buildings and request a single frame.
 */
export function Buildings({ buildings, selectedId, onBuildingClick }: Props) {
  const hitRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const invalidate = useThree((s) => s.invalidate);
  const level = detailFor(buildings.length);
  const protos = useMemo(() => getPrototypes(level), [level]);
  const shadows = buildings.length <= SHADOWS_UP_TO;

  // Group buildings by prototype; remember where each building lives.
  const groups = useMemo(() => {
    const m = new Map<string, number[]>();
    buildings.forEach((b, i) => {
      const k = b.style && protos.has(b.style) ? b.style : "shop-0";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(i);
    });
    return [...m.entries()].map(([key, idx]) => ({ key, idx, proto: protos.get(key)! }));
  }, [buildings, protos]);
  const where = useMemo(() => {
    const w = new Map<number, { g: number; slot: number }>();
    groups.forEach((g, gi) => g.idx.forEach((bi, slot) => w.set(bi, { g: gi, slot })));
    return w;
  }, [groups]);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);

  // Instance matrices: one write when the city changes.
  useLayoutEffect(() => {
    groups.forEach((g, gi) => {
      const mesh = meshes.current[gi];
      if (!mesh) return;
      g.idx.forEach((bi, slot) => {
        const b = buildings[bi];
        tmp.position.set(b.x, 0.2, b.z);
        tmp.rotation.set(0, b.facing === 1 ? 0 : Math.PI, 0);
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        mesh.setMatrixAt(slot, tmp.matrix);
        mesh.setColorAt(slot, NATURAL);
      });
      mesh.count = g.idx.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    const hit = hitRef.current;
    if (hit) {
      buildings.forEach((b, i) => {
        tmp.position.set(b.x, b.height / 2 + 0.2, b.z);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(b.width, b.height, b.depth);
        tmp.updateMatrix();
        hit.setMatrixAt(i, tmp.matrix);
      });
      hit.count = buildings.length;
      hit.instanceMatrix.needsUpdate = true;
      hit.computeBoundingSphere();
    }
    invalidate();
  }, [groups, buildings, invalidate]);

  // Re-tint only the buildings whose hover / selection state changed.
  const prev = useRef<number[]>([]);
  useLayoutEffect(() => {
    const sel = selectedId ? buildings.findIndex((b) => b.id === selectedId) : -1;
    const touched = new Set([...prev.current, sel, hovered ?? -1].filter((i) => i >= 0));
    for (const bi of touched) {
      const w = where.get(bi);
      const mesh = w ? meshes.current[w.g] : null;
      if (!w || !mesh) continue;
      col.copy(bi === sel ? SELECTED : bi === hovered ? HOVER : NATURAL);
      mesh.setColorAt(w.slot, col);
      // eslint-disable-next-line react-hooks/immutability -- three.js buffers are mutated by design
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    prev.current = [sel, hovered ?? -1].filter((i) => i >= 0);
    invalidate();
  }, [hovered, selectedId, buildings, where, invalidate]);

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined && e.instanceId !== hovered) {
      setHovered(e.instanceId);
      document.body.style.cursor = "pointer";
    }
  };
  const onOut = () => {
    setHovered(null);
    document.body.style.cursor = "";
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 5 || e.instanceId === undefined) return; // ignore orbit drags
    onBuildingClick(buildings[e.instanceId].id);
  };

  return (
    <group>
      {groups.map((g, gi) => (
        <instancedMesh
          key={`${g.key}-${level}-${g.idx.length}`}
          ref={(m) => {
            meshes.current[gi] = m;
          }}
          args={[g.proto.geometry, buildingMaterial, g.idx.length]}
          castShadow={shadows}
          receiveShadow
          raycast={() => null}
          frustumCulled={false}
        />
      ))}
      {/* Invisible hit boxes: raycast target only, never rendered. */}
      <instancedMesh
        ref={hitRef}
        args={[unitBox, lambert, Math.max(1, buildings.length)]}
        visible={false}
        onPointerMove={onMove}
        onPointerOut={onOut}
        onClick={onClick}
      />
    </group>
  );
}
