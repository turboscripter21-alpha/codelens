"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { CityLayout } from "@/lib/types";
import { Buildings } from "./Buildings";
import { Street } from "./Street";
import { SelectionMarker } from "./SelectionMarker";
import { PerfProbe } from "./PerfProbe";
import { CameraRig } from "./CameraRig";

interface Props {
  layout: CityLayout;
  selectedId: string | null;
  onBuildingClick: (id: string) => void;
  onEmptyClick: () => void;
  showFps?: boolean;
  /** CSS left inset, so the city recentres beside the maximized panel. */
  leftInset?: number;
  /** Phase 3: fly the camera here (n changes on every request). */
  focus?: { x: number; y: number; z: number; n: number } | null;
}

/**
 * The 3D city. Performance choices:
 * - frameloop="demand": nothing renders while the scene is still (orbit/hover invalidate one frame).
 * - dpr capped at 1.5, no postprocessing, no per-frame work.
 * - ~10 meshes total, all instanced; one directional light with a 1024 shadow map.
 * With ?fps=1 the loop runs continuously so the FPS readout is meaningful.
 */
export default function CityCanvas({ layout, selectedId, onBuildingClick, onEmptyClick, showFps = false, leftInset = 0, focus = null }: Props) {
  const down = useRef<{ x: number; y: number } | null>(null);
  const selected = useMemo(() => layout.buildings.find((b) => b.id === selectedId) ?? null, [layout, selectedId]);

  // Phase 3: also account for tall detailed towers.
  const span = Math.max(layout.bounds.halfX, layout.bounds.halfZ * 1.4, layout.bounds.maxHeight * 1.7);
  const big = span > 80;
  const camPos: [number, number, number] = [span * 0.42, span * 1.3, span * 1.8];
  const shadowExt = Math.max(layout.bounds.halfX, layout.bounds.halfZ) + 4;

  return (
    <div
      className="absolute inset-y-0 right-0"
      style={{ left: leftInset }}
      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
    >
      <Canvas
        frameloop={showFps ? "always" : "demand"}
        dpr={[1, 1.5]}
        shadows={{ type: THREE.PCFShadowMap }}
        camera={{ position: camPos, fov: 38, near: 1, far: span * 8 }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        onPointerMissed={(e) => {
          const d = down.current;
          if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return; // was an orbit drag
          onEmptyClick();
        }}
      >
        <color attach="background" args={["#e4ecf2"]} />
        <fog attach="fog" args={["#e4ecf2", span * 2.6, span * 5.5]} />
        <hemisphereLight args={["#ffffff", "#b9c7a3", 1.35]} />
        <directionalLight
          position={[shadowExt * 0.6, shadowExt * 1.4, shadowExt * 0.9]}
          intensity={1.7}
          castShadow
          shadow-mapSize={big ? [2048, 2048] : [1024, 1024]}
          shadow-bias={-0.0006}
          shadow-normalBias={0.03}
          shadow-camera-left={-shadowExt}
          shadow-camera-right={shadowExt}
          shadow-camera-top={shadowExt}
          shadow-camera-bottom={-shadowExt}
          shadow-camera-near={1}
          shadow-camera-far={shadowExt * 5}
        />
        <Street layout={layout} />
        <Buildings buildings={layout.buildings} selectedId={selectedId} onBuildingClick={onBuildingClick} />
        <SelectionMarker building={selected} />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.12}
          target={[0, Math.min(8, 2 + layout.bounds.maxHeight * 0.12), 2]}
          minPolarAngle={0.25}
          maxPolarAngle={1.25}
          minDistance={18}
          maxDistance={span * 3.4}
          zoomSpeed={0.8}
        />
        <CameraRig focus={focus} />
        <PerfProbe show={showFps} />
      </Canvas>
    </div>
  );
}
