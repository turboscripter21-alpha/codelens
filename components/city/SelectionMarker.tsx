"use client";

import type { Building } from "@/lib/types";

/**
 * Static marker for the selected building: an accent pad at its base and a
 * small diamond floating above the roof. Two tiny meshes, no animation,
 * only mounted while something is selected.
 */
export function SelectionMarker({ building: b }: { building: Building | null }) {
  if (!b) return null;
  return (
    <group raycast={() => null}>
      <mesh position={[b.x, 0.23, b.z]} raycast={() => null}>
        <boxGeometry args={[b.width + 1.1, 0.06, b.depth + 1.1]} />
        <meshBasicMaterial color="#FFC21A" />
      </mesh>
      <mesh position={[b.x, b.height + 2.4, b.z]} scale={[0.7, 1.1, 0.7]} raycast={() => null}>
        <octahedronGeometry args={[1, 0]} />
        <meshLambertMaterial color="#FFC21A" emissive="#7a5a00" emissiveIntensity={0.35} flatShading />
      </mesh>
    </group>
  );
}
