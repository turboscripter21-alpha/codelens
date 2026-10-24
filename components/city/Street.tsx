"use client";

import { useMemo } from "react";
import type { CityLayout } from "@/lib/types";
import { groundBoxes } from "@/lib/cityGeometry";
import { InstancedBoxes } from "./InstancedBoxes";
import { crownGeometry, flatLambert, poleGeometry, trunkGeometry, type Inst } from "./shared";

const POLE_H = 3.4;

/** Ground plane, the single plain road, sidewalks, plots, lamp posts and trees. ~6 draw calls total. */
export function Street({ layout }: { layout: CityLayout }) {
  const flat = useMemo(() => groundBoxes(layout), [layout]);

  const { poles, heads } = useMemo(() => {
    const poles: Inst[] = [];
    const heads: Inst[] = [];
    for (const l of layout.lamps) {
      poles.push({ x: l.x, y: POLE_H / 2 + 0.18, z: l.z, sx: 1, sy: POLE_H, sz: 1, color: "#6b7280" });
      // arm + plain lamp head over the road (no light source, no glow)
      if (l.armAxis === "x") {
        // Phase 3 cross streets: same lamp, arm pointing along x.
        heads.push({ x: l.x + l.armDir * 0.45, y: POLE_H + 0.12, z: l.z, sx: 0.9, sy: 0.12, sz: 0.14, color: "#6b7280" });
        heads.push({ x: l.x + l.armDir * 0.95, y: POLE_H + 0.02, z: l.z, sx: 0.5, sy: 0.16, sz: 0.36, color: "#eef0f2" });
        continue;
      }
      heads.push({ x: l.x, y: POLE_H + 0.12, z: l.z + l.armDir * 0.45, sx: 0.14, sy: 0.12, sz: 0.9, color: "#6b7280" });
      heads.push({ x: l.x, y: POLE_H + 0.02, z: l.z + l.armDir * 0.95, sx: 0.36, sy: 0.16, sz: 0.5, color: "#eef0f2" });
    }
    return { poles, heads };
  }, [layout]);

  const { trunks, crowns } = useMemo(() => {
    const trunks: Inst[] = [];
    const crowns: Inst[] = [];
    layout.trees.forEach((t, i) => {
      trunks.push({ x: t.x, y: 0.6 * t.scale + 0.2, z: t.z, sx: t.scale, sy: 1.2 * t.scale, sz: t.scale, color: "#7a5236" });
      crowns.push({
        x: t.x,
        y: 1.9 * t.scale + 0.2,
        z: t.z,
        sx: 1.15 * t.scale,
        sy: 1.35 * t.scale,
        sz: 1.15 * t.scale,
        ry: i * 0.7,
        color: i % 3 === 0 ? "#5aa543" : i % 3 === 1 ? "#6fb64f" : "#4e9a46",
      });
    });
    return { trunks, crowns };
  }, [layout]);

  const size = Math.max(layout.bounds.halfX, layout.bounds.halfZ) * 14;

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow raycast={() => null}>
        <planeGeometry args={[size, size]} />
        <meshLambertMaterial color="#cfe0b0" />
      </mesh>
      <InstancedBoxes items={flat} receiveShadow />
      <InstancedBoxes items={poles} geometry={poleGeometry} castShadow />
      <InstancedBoxes items={heads} castShadow />
      <InstancedBoxes items={trunks} geometry={trunkGeometry} />
      <InstancedBoxes items={crowns} geometry={crownGeometry} material={flatLambert} castShadow />
    </group>
  );
}
