"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";

declare global {
  interface Window {
    __codelens?: {
      info: () => { calls: number; triangles: number; geometries: number; programs: number; frames: number };
      /** World point to CSS pixel position on the canvas (for automated click tests). */
      screenOf: (x: number, y: number, z: number) => { x: number; y: number };
    };
  }
}

/**
 * Optional dev readout (?fps=1): FPS, draw calls and triangles from renderer.info.
 * Writes straight into a DOM node, so it never causes React re-renders.
 * Also exposes window.__codelens.info() for automated checks.
 */
export function PerfProbe({ show }: { show: boolean }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const frames = useRef(0);
  const last = useRef({ t: 0, f: 0 });

  useEffect(() => {
    window.__codelens = {
      info: () => ({
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        programs: gl.info.programs?.length ?? 0,
        frames: frames.current,
      }),
      screenOf: (x, y, z) => {
        const v = new Vector3(x, y, z).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
      },
    };
    return () => {
      delete window.__codelens;
    };
  }, [gl, camera]);

  useFrame(() => {
    frames.current += 1;
    if (!show) return;
    const now = performance.now();
    if (now - last.current.t >= 500) {
      const fps = ((frames.current - last.current.f) * 1000) / (now - last.current.t || 1);
      last.current = { t: now, f: frames.current };
      const el = document.getElementById("cl-fps");
      if (el) el.textContent = `${fps.toFixed(0)} fps  |  ${gl.info.render.calls} draw calls  |  ${gl.info.render.triangles.toLocaleString()} tris`;
    }
  });
  return null;
}
