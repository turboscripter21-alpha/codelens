"use client";

import { useLayoutEffect, useRef } from "react";
import type * as THREE from "three";
import { lambert, unitBox, writeInstances, type Inst } from "./shared";

interface Props {
  items: Inst[];
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/** A static group of boxes (or any shared geometry) drawn as ONE instanced draw call. Not clickable. */
export function InstancedBoxes({ items, geometry = unitBox, material = lambert, castShadow, receiveShadow }: Props) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    if (ref.current) writeInstances(ref.current, items);
  }, [items]);
  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, Math.max(1, items.length)]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      raycast={() => null}
      frustumCulled={false}
    />
  );
}
