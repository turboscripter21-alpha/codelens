"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

type Controls = { target: THREE.Vector3; update: () => void };

/**
 * Phase 3: fly the camera to a building (Uses / Used by / largest-file links).
 * Runs only during the ~0.7 s flight, invalidating frame by frame; idle otherwise.
 */
export function CameraRig({ focus }: { focus: { x: number; y: number; z: number; n: number } | null }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const flight = useRef<{ t0: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (!focus || !controls) return;
    const toT = new THREE.Vector3(focus.x, focus.y, focus.z);
    const offset = camera.position.clone().sub(controls.target);
    const dist = Math.min(offset.length(), 70);
    offset.setLength(Math.max(30, dist));
    flight.current = { t0: performance.now(), fromT: controls.target.clone(), toT, fromP: camera.position.clone(), toP: toT.clone().add(offset) };
    invalidate();
  }, [focus, controls, camera, invalidate]);

  useFrame(() => {
    const f = flight.current;
    if (!f || !controls) return;
    const k = Math.min(1, (performance.now() - f.t0) / 700);
    const e = 1 - Math.pow(1 - k, 3);
    controls.target.lerpVectors(f.fromT, f.toT, e);
    camera.position.lerpVectors(f.fromP, f.toP, e);
    controls.update();
    if (k < 1) invalidate();
    else flight.current = null;
  });
  return null;
}
