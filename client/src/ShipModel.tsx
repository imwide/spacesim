import { Html, useGLTF } from '@react-three/drei';
import { type ReactElement, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ShipConfig } from './shipConfig';

export interface ShipInteriorCollisionData {
  colliderMeshes: THREE.Object3D[];
  bounds: THREE.Box3;
  standingHeight: number;
}

const INTERIOR_COLLIDER_ROTATION = new THREE.Matrix4().makeRotationY(Math.PI);
const INTERIOR_COLLIDER_RAY_DOWN = new THREE.Vector3(0, -1, 0);
const INTERIOR_COLLIDER_MATERIAL = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

interface ShipAnchorMarkerProps {
  color: string;
  label: string;
  position: THREE.Vector3;
}

function ShipAnchorMarker({ color, label, position }: ShipAnchorMarkerProps): ReactElement {
  return (
    <group position={[position.x, position.y, position.z]}>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[
              new Float32Array([
                -0.35, 0, 0,
                0.35, 0, 0,
                0, -0.35, 0,
                0, 0.35, 0,
                0, 0, -0.35,
                0, 0, 0.35,
              ]),
              3,
            ]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={color} depthTest={false} toneMapped={false} />
      </lineSegments>
      <mesh>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} depthTest={false} />
      </mesh>
      <Html center distanceFactor={12} zIndexRange={[2, 0]}>
        <div
          style={{
            pointerEvents: 'none',
            color,
            fontFamily: 'monospace',
            fontSize: '10px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            background: 'rgba(2, 6, 23, 0.72)',
            border: `1px solid ${color}`,
            padding: '2px 6px',
            transform: 'translate(10px, -18px)',
          }}
        >
          {label}
        </div>
      </Html>
    </group>
  );
}

function ShipAnchorDebugMarkers({ config, interior = false }: { config: ShipConfig; interior?: boolean }): ReactElement {
  const markers = interior
    ? [
        { label: 'inside spawn', color: '#a3e635', position: config.insideSpawnVec },
        { label: 'pilot seat', color: '#f472b6', position: config.pilotSeatVec },
      ]
    : [
        { label: 'outside spawn', color: '#fb7185', position: config.outsideSpawnVec },
        ...config.thrusterVecs.map((position, index) => ({ label: `thruster ${index + 1}`, color: '#22d3ee', position })),
        ...config.gunVecs.map((position, index) => ({ label: `gun ${index + 1}`, color: '#f59e0b', position })),
      ];

  return (
    <group>
      {markers.map((marker) => (
        <ShipAnchorMarker
          key={`${marker.label}-${marker.position.x}-${marker.position.y}-${marker.position.z}`}
          color={marker.color}
          label={marker.label}
          position={marker.position}
        />
      ))}
    </group>
  );
}

// ─── Preloading ─────────────────────────────────────────────────────────────

/** Call once at startup for every ship the player might see, so the GLBs
 *  download in the background while the rest of the scene initialises. */
export function preloadShipModels(config: ShipConfig): void {
  useGLTF.preload(config.exteriorModel);
  useGLTF.preload(config.interiorModel);
}

export function useShipInteriorCollisionData(config: ShipConfig): ShipInteriorCollisionData {
  const { scene } = useGLTF(config.interiorModel);

  return useMemo(() => {
    scene.updateMatrixWorld(true);

    const colliderMeshes: THREE.Mesh[] = [];
    const bounds = new THREE.Box3();
    scene.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) {
        return;
      }

      const mesh = child as THREE.Mesh;
      if (!mesh.geometry) {
        return;
      }

      const bakedGeometry = mesh.geometry.clone();
      const bakedMatrix = INTERIOR_COLLIDER_ROTATION.clone().multiply(mesh.matrixWorld);
      bakedGeometry.applyMatrix4(bakedMatrix);
      bakedGeometry.computeBoundingBox();
      bakedGeometry.computeBoundingSphere();

      const colliderMesh = new THREE.Mesh(bakedGeometry, INTERIOR_COLLIDER_MATERIAL);
      colliderMesh.matrixAutoUpdate = false;
      colliderMesh.updateMatrixWorld(true);
      colliderMeshes.push(colliderMesh);

      if (bakedGeometry.boundingBox) {
        bounds.union(bakedGeometry.boundingBox);
      }
    });

    const standingOrigin = config.insideSpawnVec.clone();
    standingOrigin.y += 0.05;

    const standingHit = new THREE.Raycaster(standingOrigin, INTERIOR_COLLIDER_RAY_DOWN, 0, 6)
      .intersectObjects(colliderMeshes, false)
      .find((hit) => (hit.face?.normal.y ?? 0) > 0.25);

    return {
      colliderMeshes,
      bounds,
      standingHeight: standingHit
        ? THREE.MathUtils.clamp(standingOrigin.y - standingHit.point.y, 0.6, 2.4)
        : config.interiorFloorHeight,
    };
  }, [config, scene]);
}

// ─── Exterior layer ─────────────────────────────────────────────────────────

interface ShipExteriorModelProps {
  config: ShipConfig;
  highlight?: boolean;
  showDebugAnchors?: boolean;
}

export function ShipExteriorModel({ config, highlight = false, showDebugAnchors = true }: ShipExteriorModelProps): ReactElement {
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

  return (
    <group>
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={clonedScene} />
      </group>
      {showDebugAnchors ? <ShipAnchorDebugMarkers config={config} /> : null}
    </group>
  );
}

// ─── Interior layer ─────────────────────────────────────────────────────────

interface ShipInteriorModelProps {
  config: ShipConfig;
  showDebugAnchors?: boolean;
}

export function ShipInteriorModel({ config, showDebugAnchors = true }: ShipInteriorModelProps): ReactElement {
  const { scene } = useGLTF(config.interiorModel);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);
  return (
    <group>
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={clonedScene} />
      </group>
      {showDebugAnchors ? <ShipAnchorDebugMarkers config={config} interior /> : null}
    </group>
  );
}
