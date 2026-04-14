import { Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { type MutableRefObject, type ReactElement, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ShipConfig } from './shipConfig';
import { fixGLBTransparency, setupLODs } from './lod';

// ─── Pilot seat outline (inverted-hull method) ─────────────────────────────

const SEAT_OUTLINE_THICKNESS = 0.018; // metres pushed along vertex normals

const SEAT_OUTLINE_MATERIAL = new THREE.ShaderMaterial({
  uniforms: {},
  vertexShader: /* glsl */ `
    void main() {
      vec3 pos = position + normal * ${SEAT_OUTLINE_THICKNESS.toFixed(4)};
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    void main() {
      gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
    }
  `,
  side: THREE.BackSide,
  depthTest: true,
  depthWrite: false,
  toneMapped: false,
});

export interface ShipInteriorCollisionData {
  colliderMeshes: THREE.Object3D[];
  bounds: THREE.Box3;
  standingHeight: number;
  /** World-space position of the pilot seat (extracted from the GLB interior).
   *  null if no object with "pilot_chair" in its name was found. */
  pilotSeatPosition: THREE.Vector3 | null;
  /** The mesh objects that make up the pilot seat (for outline rendering). */
  pilotSeatMeshes: THREE.Mesh[];
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
  if (config.model) {
    useGLTF.preload(config.model);
  } else {
    // Legacy: separate exterior/interior files
    if (config.exteriorModel) useGLTF.preload(config.exteriorModel);
    if (config.interiorModel) useGLTF.preload(config.interiorModel);
  }
}

// ─── Helpers: extract sub-scene from unified GLB ────────────────────────────

/**
 * Returns the model path to load with useGLTF for a given layer (exterior or
 * interior).  For unified GLBs (config.model set), both layers come from the
 * same file.  For legacy configs the separate path is used.
 */
function getModelPath(config: ShipConfig, layer: 'exterior' | 'interior'): string {
  if (config.model) return config.model;
  // Legacy fallback
  return layer === 'exterior' ? config.exteriorModel! : config.interiorModel!;
}

/**
 * Given the full GLB scene and a ship config, clone the scene and extract only
 * the sub-tree belonging to the specified collection (`exterior_<abbr>` or
 * `interior_<abbr>`).  For legacy configs (separate GLB files) the entire scene
 * is returned unchanged.
 *
 * LODs are automatically set up on the returned scene graph.
 */
function useShipCollectionScene(
  config: ShipConfig,
  layer: 'exterior' | 'interior',
): { clonedScene: THREE.Object3D; lodRefs: React.MutableRefObject<THREE.LOD[]> } {
  const modelPath = getModelPath(config, layer);
  const { scene } = useGLTF(modelPath);
  const lodRefs = useRef<THREE.LOD[]>([]);

  const clonedScene = useMemo(() => {
    const fullClone = scene.clone(true);

    let root: THREE.Object3D;

    if (config.model && config.abbreviation) {
      // Unified GLB — find the collection node
      const collectionName = `${layer}_${config.abbreviation}`;
      const collectionNode = fullClone.getObjectByName(collectionName);

      if (collectionNode) {
        // Detach the collection sub-tree and use it as root
        root = collectionNode;
      } else {
        // Fallback: collection node not found — use the full scene.
        // This handles GLBs where Blender's exporter flattened the hierarchy.
        root = fullClone;
      }
    } else {
      // Legacy: separate files, use as-is
      root = fullClone;
    }

    // Apply LODs on whatever root we ended up with
    lodRefs.current = setupLODs(root);
    // Fix glass/window materials that were exported as OPAQUE in Blender
    fixGLBTransparency(root);

    return root;
  }, [scene, config, layer]);

  return { clonedScene, lodRefs };
}

// ─── Interior collision data ────────────────────────────────────────────────

export function useShipInteriorCollisionData(config: ShipConfig): ShipInteriorCollisionData {
  const modelPath = getModelPath(config, 'interior');
  const { scene } = useGLTF(modelPath);

  return useMemo(() => {
    const fullClone = scene.clone(true);

    let interiorRoot: THREE.Object3D;
    if (config.model && config.abbreviation) {
      const collectionName = `interior_${config.abbreviation}`;
      const found = fullClone.getObjectByName(collectionName);
      interiorRoot = found ?? fullClone;
    } else {
      interiorRoot = fullClone;
    }

    interiorRoot.updateMatrixWorld(true);

    const colliderMeshes: THREE.Mesh[] = [];
    const bounds = new THREE.Box3();
    const pilotSeatMeshes: THREE.Mesh[] = [];
    let pilotSeatPosition: THREE.Vector3 | null = null;

    // First pass: identify pilot_chair nodes and collect their meshes (deduplicated)
    const seatNodeSet = new Set<THREE.Object3D>();
    interiorRoot.traverse((child) => {
      if (child.name.toLowerCase().includes('pilot_chair') && !seatNodeSet.has(child)) {
        seatNodeSet.add(child);
        if ((child as THREE.Mesh).isMesh) {
          pilotSeatMeshes.push(child as THREE.Mesh);
        }
        child.traverse((sub) => {
          if (sub !== child && !seatNodeSet.has(sub)) {
            seatNodeSet.add(sub);
            if ((sub as THREE.Mesh).isMesh) {
              pilotSeatMeshes.push(sub as THREE.Mesh);
            }
          }
        });
      }
    });

    // Second pass: bake all interior meshes for collision + compute pilot seat position
    interiorRoot.traverse((child) => {
      if (!(child as THREE.Mesh).isMesh) return;
      const mesh = child as THREE.Mesh;
      if (!mesh.geometry) return;

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

      // Derive pilot seat position from the baked geometry center of the first seat mesh.
      // This puts the position in the exact same coordinate space as the player movement.
      if (seatNodeSet.has(child) && bakedGeometry.boundingBox && !pilotSeatPosition) {
        pilotSeatPosition = new THREE.Vector3();
        bakedGeometry.boundingBox.getCenter(pilotSeatPosition);
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
      pilotSeatPosition,
      pilotSeatMeshes,
    };
  }, [config, scene]);
}

// ─── Exterior layer ─────────────────────────────────────────────────────────

interface ShipExteriorModelProps {
  config: ShipConfig;
  showDebugAnchors?: boolean;
}

export function ShipExteriorModel({ config, showDebugAnchors = true }: ShipExteriorModelProps): ReactElement {
  const { clonedScene, lodRefs } = useShipCollectionScene(config, 'exterior');

  // Mark as non-collidable and clone materials for per-instance tinting
  useMemo(() => {
    clonedScene.userData.ignoreCameraCollision = true;
    clonedScene.traverse((child) => {
      child.userData.ignoreCameraCollision = true;
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => m.clone());
        } else {
          mesh.material = mesh.material.clone();
        }
      }
    });
  }, [clonedScene]);

  // Per-frame LOD updates
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    for (const lod of lodRefs.current) {
      tmpV.setFromMatrixPosition(lod.matrixWorld);
      const dist = camera.position.distanceTo(tmpV);
      const cullDist = lod.userData.cullDistance as number | undefined;
      if (cullDist && dist > cullDist) {
        lod.visible = false;
      } else {
        lod.visible = true;
        lod.update(camera);
      }
    }
  });

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
  /** When the ref value is true the pilot seat gets a white outline. */
  seatOutlineVisibleRef?: MutableRefObject<boolean>;
}

export function ShipInteriorModel({ config, showDebugAnchors = true, seatOutlineVisibleRef }: ShipInteriorModelProps): ReactElement {
  const { clonedScene, lodRefs } = useShipCollectionScene(config, 'interior');

  useMemo(() => {
    clonedScene.userData.ignoreCameraCollision = true;
    clonedScene.traverse((child) => {
      child.userData.ignoreCameraCollision = true;
    });
  }, [clonedScene]);

  // Build outline clones for pilot seat meshes
  const outlineGroupRef = useRef<THREE.Group | null>(null);
  useEffect(() => {
    if (outlineGroupRef.current) {
      // Remove old outline children
      while (outlineGroupRef.current.children.length) {
        outlineGroupRef.current.remove(outlineGroupRef.current.children[0]);
      }
    }

    const group = outlineGroupRef.current;
    if (!group) return;

    clonedScene.traverse((child) => {
      if (!child.name.toLowerCase().includes('pilot_chair')) return;
      const addOutline = (obj: THREE.Object3D) => {
        if (!(obj as THREE.Mesh).isMesh) return;
        const mesh = obj as THREE.Mesh;
        if (!mesh.geometry) return;
        const outlineMesh = new THREE.Mesh(mesh.geometry, SEAT_OUTLINE_MATERIAL);
        outlineMesh.matrixAutoUpdate = false;
        outlineMesh.matrixWorldAutoUpdate = false;
        outlineMesh.userData.ignoreCameraCollision = true;
        outlineMesh.userData.ignoreOutline = true;
        outlineMesh.userData.isBlenderEdgeOverlay = true;
        outlineMesh.raycast = () => {};
        // Store a reference to the source mesh so we can copy its world matrix each frame
        outlineMesh.userData._sourceMesh = mesh;
        group.add(outlineMesh);
      };
      addOutline(child);
      child.traverse((sub) => { if (sub !== child) addOutline(sub); });
    });

    group.visible = false;
  }, [clonedScene]);

  // Per-frame LOD updates + outline visibility
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    for (const lod of lodRefs.current) {
      tmpV.setFromMatrixPosition(lod.matrixWorld);
      const dist = camera.position.distanceTo(tmpV);
      const cullDist = lod.userData.cullDistance as number | undefined;
      if (cullDist && dist > cullDist) {
        lod.visible = false;
      } else {
        lod.visible = true;
        lod.update(camera);
      }
    }

    // Update outline group visibility and per-mesh world matrices
    const group = outlineGroupRef.current;
    if (group) {
      const show = seatOutlineVisibleRef?.current ?? false;
      group.visible = show;
      if (show) {
        for (const child of group.children) {
          const src = child.userData._sourceMesh as THREE.Mesh | undefined;
          if (src) {
            child.matrixWorld.copy(src.matrixWorld);
          }
        }
      }
    }
  });

  return (
    <group>
      <group rotation={[0, Math.PI, 0]}>
        <primitive object={clonedScene} />
      </group>
      {/* Outline group lives outside the rotation wrapper — it copies world matrices directly */}
      <group ref={outlineGroupRef} userData={{ ignoreCameraCollision: true, ignoreOutline: true }} />
      {showDebugAnchors ? <ShipAnchorDebugMarkers config={config} interior /> : null}
    </group>
  );
}
