/**
 * PlanetTerrain — procedurally generated terrain with LOD for planet surfaces.
 *
 * Renders terrain chunks around the camera when the player is close enough
 * to a planet. Uses simplex noise for heightmap; LOD levels based on distance.
 */

import { useFrame, useThree } from '@react-three/fiber';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import * as THREE from 'three';
import { SimplexNoise, getTerrainHeight } from './noise';

// ─── Configuration ──────────────────────────────────────────────────────────────

/** Distance from surface at which terrain starts rendering (meters) */
export const PLANET_TERRAIN_RENDER_DISTANCE = 200_000; // 200 km — starts showing detail
/** Number of LOD levels */
const LOD_LEVELS = 4;
/** Base grid resolution for the lowest LOD */
const BASE_GRID_SIZE = 32;
/** How large each terrain chunk is in world units (at the finest LOD) */
const BASE_CHUNK_WORLD_SIZE = 2_000; // 2 km
/** Maximum terrain chunks per LOD level (ring around camera) */
const CHUNKS_PER_AXIS = 5; // 5×5 grid of chunks
/** Vertical exaggeration for visual impact when far away */
const FAR_HEIGHT_MULTIPLIER = 1.0;

// Colors for terrain based on height
const TERRAIN_COLOR_LOW = new THREE.Color(0x2d4a1e); // dark green (valleys)
const TERRAIN_COLOR_MID = new THREE.Color(0x8b7355); // brown (hills)
const TERRAIN_COLOR_HIGH = new THREE.Color(0xc8c8c8); // grey (mountains)
const TERRAIN_COLOR_PEAK = new THREE.Color(0xffffff); // white (snow peaks)
const TERRAIN_COLOR_OCEAN = new THREE.Color(0x1a3a5c); // deep blue (below sea level)

// Reusable scratch vector for shading calculations
const _sunDir = new THREE.Vector3();

// ─── Types ──────────────────────────────────────────────────────────────────────

interface PlanetTerrainProps {
  /** Planet center position in frame-local coordinates */
  planetPosition: [number, number, number];
  /** Planet radius in world units (meters) */
  planetRadius: number;
  /** Planet ID used as noise seed */
  planetId: string;
  /** Planet base color */
  planetColor: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// ─── Terrain Manager (imperative for performance) ───────────────────────────────

/**
 * Manages a single highly-detailed terrain patch that slides with the camera.
 * Updates are anchored to prevent jitter and stretching.
 */
class TerrainChunkManager {
  private noise: SimplexNoise;
  private planetCenter: THREE.Vector3;
  private planetRadius: number;
  private planetColor: THREE.Color;
  private group: THREE.Group;
  
  private mesh: THREE.Mesh;
  private geometry: THREE.BufferGeometry;
  private material: THREE.MeshStandardMaterial;
  
  private gridRes = 96; // 96x96 grid = ~9k vertices (fast to update)
  private lastAnchor = new THREE.Vector3();
  private lastPatchSize = 0;

  constructor(
    planetId: string,
    planetCenter: THREE.Vector3,
    planetRadius: number,
    planetColor: string,
    group: THREE.Group,
  ) {
    this.noise = new SimplexNoise(hashString(planetId));
    this.planetCenter = planetCenter.clone();
    this.planetRadius = planetRadius;
    this.planetColor = new THREE.Color(planetColor);
    this.group = group;

    // Allocate geometry buffers once
    const vertexCount = (this.gridRes + 1) * (this.gridRes + 1);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    
    // Index buffer (static)
    const indexCount = this.gridRes * this.gridRes * 6;
    const indices = new Uint32Array(indexCount);
    let indexOffset = 0;
    for (let iz = 0; iz < this.gridRes; iz++) {
      for (let ix = 0; ix < this.gridRes; ix++) {
        const a = iz * (this.gridRes + 1) + ix;
        const b = a + 1;
        const c = (iz + 1) * (this.gridRes + 1) + ix;
        const d = c + 1;
        indices[indexOffset++] = a;
        indices[indexOffset++] = b;
        indices[indexOffset++] = c;
        indices[indexOffset++] = b;
        indices[indexOffset++] = d;
        indices[indexOffset++] = c;
      }
    }
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));

    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.05,
      flatShading: false,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    // Center the mesh at the planet to prevent float32 precision jitter in WebGL
    this.mesh.position.copy(this.planetCenter);
    this.mesh.frustumCulled = false; // Always visible when in range
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  update(cameraPosition: THREE.Vector3): void {
    const toPlanetCenter = new THREE.Vector3().subVectors(this.planetCenter, cameraPosition);
    const distToCenter = toPlanetCenter.length();
    const distToSurface = distToCenter - this.planetRadius;

    if (distToSurface > PLANET_TERRAIN_RENDER_DISTANCE || distToSurface < -this.planetRadius * 0.1) {
      this.mesh.visible = false;
      return;
    }

    this.mesh.visible = true;

    // Scale patch size smoothly with altitude for infinite LOD
    // At orbit: ~300km patch. At ground: ~4km patch.
    const targetPatchSize = Math.max(4000, distToSurface * 2.5);

    // Point on ideal sphere directly under camera
    const upDir = toPlanetCenter.clone().negate().normalize();
    const currentSurfacePoint = this.planetCenter.clone().addScaledVector(upDir, this.planetRadius);

    // Only rebuild geometry if camera moves significantly relative to current patch size
    // meaning the patch stays anchored in world space until crossing the threshold.
    const movedDist = currentSurfacePoint.distanceTo(this.lastAnchor);
    const sizeChanged = Math.abs(targetPatchSize - this.lastPatchSize) > targetPatchSize * 0.15;

    if (movedDist > targetPatchSize * 0.1 || sizeChanged || this.lastPatchSize === 0) {
      this.mesh.position.copy(currentSurfacePoint);
      this.rebuildPatch(currentSurfacePoint, upDir, targetPatchSize);
      this.lastAnchor.copy(currentSurfacePoint);
      this.lastPatchSize = targetPatchSize;
    }
  }

  private rebuildPatch(anchor: THREE.Vector3, upDir: THREE.Vector3, patchSize: number) {
    const tangent = new THREE.Vector3();
    if (Math.abs(upDir.y) < 0.99) {
      tangent.crossVectors(upDir, new THREE.Vector3(0, 1, 0)).normalize();
    } else {
      tangent.crossVectors(upDir, new THREE.Vector3(1, 0, 0)).normalize();
    }
    const bitangent = new THREE.Vector3().crossVectors(upDir, tangent).normalize();

    const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = this.geometry.attributes.color as THREE.BufferAttribute;
    const positions = posAttr.array as Float32Array;
    const colors = colAttr.array as Float32Array;

    const cellSize = patchSize / this.gridRes;
    const halfPatch = patchSize / 2;

    const planePoint = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const spherePoint = new THREE.Vector3();

    const heightScale = Math.min(this.planetRadius * 0.008, 80_000);
    const planetBaseColor = new THREE.Color(this.planetColor);
    const color = new THREE.Color();

    const anchorOffsetX = anchor.x - this.planetCenter.x;
    const anchorOffsetY = anchor.y - this.planetCenter.y;
    const anchorOffsetZ = anchor.z - this.planetCenter.z;

    for (let iz = 0; iz <= this.gridRes; iz++) {
      for (let ix = 0; ix <= this.gridRes; ix++) {
        const localX = ix * cellSize - halfPatch;
        const localZ = iz * cellSize - halfPatch;

        // Point on flat tangent plane
        planePoint.copy(anchor)
          .addScaledVector(tangent, localX)
          .addScaledVector(bitangent, localZ);

        // Project plane point onto perfect sphere to prevent the patch curving up into the sky at the edges
        dir.copy(planePoint).sub(this.planetCenter).normalize();

        // Sample noise and offset along radial normal
        const height = getTerrainHeight(dir.x, dir.y, dir.z, this.noise, this.planetRadius);

        const totalR = this.planetRadius + height;
        const idx = iz * (this.gridRes + 1) + ix;
        positions[idx * 3] = dir.x * totalR - anchorOffsetX;
        positions[idx * 3 + 1] = dir.y * totalR - anchorOffsetY;
        positions[idx * 3 + 2] = dir.z * totalR - anchorOffsetZ;

        // Colors
        const normalizedHeight = height / heightScale;
        if (normalizedHeight < -0.05) {
          color.copy(TERRAIN_COLOR_OCEAN);
        } else if (normalizedHeight < 0.15) {
          const t = (normalizedHeight + 0.05) / 0.2;
          color.copy(TERRAIN_COLOR_OCEAN).lerp(TERRAIN_COLOR_LOW, Math.max(0, t));
        } else if (normalizedHeight < 0.4) {
          const t = (normalizedHeight - 0.15) / 0.25;
          color.copy(TERRAIN_COLOR_LOW).lerp(TERRAIN_COLOR_MID, t);
        } else if (normalizedHeight < 0.7) {
          const t = (normalizedHeight - 0.4) / 0.3;
          color.copy(TERRAIN_COLOR_MID).lerp(TERRAIN_COLOR_HIGH, t);
        } else {
          const t = Math.min(1, (normalizedHeight - 0.7) / 0.3);
          color.copy(TERRAIN_COLOR_HIGH).lerp(TERRAIN_COLOR_PEAK, t);
        }

        color.lerp(planetBaseColor, 0.2);

        colors[idx * 3] = color.r;
        colors[idx * 3 + 1] = color.g;
        colors[idx * 3 + 2] = color.b;
      }
    }

    posAttr.needsUpdate = true;
    
    // Compute normals based on the newly displaced vertices
    this.geometry.computeVertexNormals();

    // Bake simple directional shading into vertex colors so hills/valleys are visible.
    // Use a fixed sun direction; the MeshStandardMaterial's ambient-to-directional ratio
    // is too flat on its own to show terrain relief clearly.
    const normalAttr = this.geometry.attributes.normal as THREE.BufferAttribute;
    const normals = normalAttr.array as Float32Array;
    const sunDir = _sunDir.set(0.4, 0.75, 0.3).normalize();
    const totalVerts = (this.gridRes + 1) * (this.gridRes + 1);
    for (let i = 0; i < totalVerts; i++) {
      const nx = normals[i * 3];
      const ny = normals[i * 3 + 1];
      const nz = normals[i * 3 + 2];
      const dot = nx * sunDir.x + ny * sunDir.y + nz * sunDir.z;
      // Shade range: 0.35 (shadow) to 1.0 (full sun)
      const shade = 0.35 + 0.65 * Math.max(0, dot);
      colors[i * 3] *= shade;
      colors[i * 3 + 1] *= shade;
      colors[i * 3 + 2] *= shade;
    }

    colAttr.needsUpdate = true;
  }

  dispose(): void {
    if (this.mesh.parent) {
        this.mesh.parent.remove(this.mesh);
    }
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ─── React component ────────────────────────────────────────────────────────────

export function PlanetTerrain({
  planetPosition,
  planetRadius,
  planetId,
  planetColor,
}: PlanetTerrainProps): ReactElement {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const managerRef = useRef<TerrainChunkManager | null>(null);
  const planetCenterVec = useMemo(() => new THREE.Vector3(...planetPosition), [planetPosition]);

  // Create/recreate manager when planet changes
  useEffect(() => {
    if (!groupRef.current) return;
    managerRef.current?.dispose();
    managerRef.current = new TerrainChunkManager(
      planetId,
      planetCenterVec,
      planetRadius,
      planetColor,
      groupRef.current,
    );

    return () => {
      managerRef.current?.dispose();
      managerRef.current = null;
    };
  }, [planetId, planetCenterVec, planetRadius, planetColor]);

  useFrame(() => {
    if (!managerRef.current) return;

    managerRef.current.update(camera.position);
  });

  return <group ref={groupRef} />;
}

// ─── Terrain height query for physics ───────────────────────────────────────────

/** Shared noise instances per planet, lazily created */
const noiseCache = new Map<string, SimplexNoise>();

function getNoiseForPlanet(planetId: string): SimplexNoise {
  let noise = noiseCache.get(planetId);
  if (!noise) {
    noise = new SimplexNoise(hashString(planetId));
    noiseCache.set(planetId, noise);
  }
  return noise;
}

/**
 * Get the terrain height at a world position for physics.
 * Returns the altitude above the planet center (planetRadius + terrainHeight).
 */
export function getTerrainAltitudeAtPosition(
  worldPosition: THREE.Vector3,
  planetCenter: THREE.Vector3,
  planetRadius: number,
  planetId: string,
): number {
  const dir = new THREE.Vector3().subVectors(worldPosition, planetCenter);
  const dist = dir.length();
  if (dist < 1e-6) return planetRadius;
  dir.divideScalar(dist);

  const noise = getNoiseForPlanet(planetId);
  const height = getTerrainHeight(dir.x, dir.y, dir.z, noise, planetRadius);
  return planetRadius + height;
}

/**
 * Get the surface normal at a world position (for collision response).
 */
export function getTerrainNormalAtPosition(
  worldPosition: THREE.Vector3,
  planetCenter: THREE.Vector3,
  planetRadius: number,
  planetId: string,
): THREE.Vector3 {
  const dir = new THREE.Vector3().subVectors(worldPosition, planetCenter).normalize();
  const noise = getNoiseForPlanet(planetId);

  // Sample 4 nearby points to estimate surface normal
  const sampleOffset = 0.0001; // small angular offset
  const tangent = new THREE.Vector3();
  if (Math.abs(dir.y) < 0.99) {
    tangent.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  } else {
    tangent.crossVectors(dir, new THREE.Vector3(1, 0, 0)).normalize();
  }
  const bitangent = new THREE.Vector3().crossVectors(dir, tangent).normalize();

  const hCenter = getTerrainHeight(dir.x, dir.y, dir.z, noise, planetRadius);

  const dx = dir.clone().addScaledVector(tangent, sampleOffset).normalize();
  const hDx = getTerrainHeight(dx.x, dx.y, dx.z, noise, planetRadius);

  const dz = dir.clone().addScaledVector(bitangent, sampleOffset).normalize();
  const hDz = getTerrainHeight(dz.x, dz.y, dz.z, noise, planetRadius);

  // Approximate gradient
  const angularDist = sampleOffset * planetRadius;
  const slopeX = (hDx - hCenter) / angularDist;
  const slopeZ = (hDz - hCenter) / angularDist;

  // Normal in local tangent space then transform to world
  const localNormal = new THREE.Vector3(-slopeX, 1, -slopeZ).normalize();

  // Build rotation from local (up=Y) to world
  const mat = new THREE.Matrix4().makeBasis(tangent, dir, bitangent);
  return localNormal.applyMatrix4(mat).normalize();
}
