import { useGLTF } from '@react-three/drei';
import { type ReactElement, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ShipConfig } from './shipConfig';

// ─── Preloading ─────────────────────────────────────────────────────────────

/** Call once at startup for every ship the player might see, so the GLBs
 *  download in the background while the rest of the scene initialises. */
export function preloadShipModels(config: ShipConfig): void {
  useGLTF.preload(config.exteriorModel);
  useGLTF.preload(config.interiorModel);
}

// ─── Exterior layer ─────────────────────────────────────────────────────────

interface ShipExteriorModelProps {
  config: ShipConfig;
  highlight?: boolean;
}

export function ShipExteriorModel({ config, highlight = false }: ShipExteriorModelProps): ReactElement {
  const { scene } = useGLTF(config.exteriorModel);
  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // Clone materials so we can tint per-instance without affecting the cache
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else {
          mesh.material = mesh.material.clone();
        }
      }
    });
    return clone;
  }, [scene]);

  // Apply highlight tint when requested (e.g. player's own ship)
  useEffect(() => {
    clonedScene.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.emissive.set(highlight ? 0x2563eb : 0x000000);
            mat.emissiveIntensity = highlight ? 0.12 : 0;
          }
        }
      }
    });
  }, [clonedScene, highlight]);

  return <primitive object={clonedScene} rotation={[0, Math.PI, 0]} />;
}

// ─── Interior layer ─────────────────────────────────────────────────────────

interface ShipInteriorModelProps {
  config: ShipConfig;
}

export function ShipInteriorModel({ config }: ShipInteriorModelProps): ReactElement {
  const { scene } = useGLTF(config.interiorModel);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  return <primitive object={clonedScene} rotation={[0, Math.PI, 0]} />;
}
