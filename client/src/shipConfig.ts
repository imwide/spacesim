import * as THREE from 'three';

// ─── Ship configuration schema ──────────────────────────────────────────────

export interface ShipConfigRaw {
  /** Human-readable ship name */
  name: string;

  /** Short abbreviation used to identify collections inside the GLB
   *  (e.g. "asc" → collections "exterior_asc" / "interior_asc"). */
  abbreviation: string;

  /**
   * Path to the GLB model (relative to public/).
   * The file should contain two top-level collections:
   *   - `exterior_<abbreviation>` — the exterior hull
   *   - `interior_<abbreviation>` — the interior / walkable space
   */
  model: string;

  /** @deprecated Use `model` instead. Path to the exterior GLB model. */
  exteriorModel?: string;
  /** @deprecated Use `model` instead. Path to the interior GLB model. */
  interiorModel?: string;

  // ── Spatial anchors (coordinates relative to ship origin) ──────────────
  // These are optional when the GLB contains named anchor nodes
  // (thruster_<abbr>_NN, gun_<abbr>_NN, outside_door_<abbr>, inside_door_<abbr>).
  // If provided here they serve as fallbacks for legacy GLBs without anchor nodes.

  /** Position of the "door" on the outside of the hull — the player can
   *  board when within 10 m of this point. */
  entryPoint?: [number, number, number];

  /** Position of the "door" on the inside of the hull — the player can
   *  exit the ship when within 10 m of this point. */
  exitPoint?: [number, number, number];

  /** Where the player spawns (in ship-local coords) after boarding. */
  insideSpawnPoint?: [number, number, number];

  /** Where the player spawns (in ship-local coords) after exiting, offset
   *  is applied in world-space relative to the ship. */
  outsideSpawnPoint?: [number, number, number];

  /** Relative ship-local positions of engine / thruster exhaust points. */
  thrusterPositions?: [number, number, number][];

  /** Relative ship-local positions of projectile / gun muzzle points. */
  gunPositions?: [number, number, number][];

  // ── Flight characteristics ────────────────────────────────────────────

  /** Multiplier applied to base thrust acceleration (default 1.0). */
  accelerationMultiplier: number;
  /** Multiplier applied to max speed (default 1.0). */
  speedMultiplier: number;
  /** Multiplier applied to angular / turning speed (default 1.0). */
  turningSpeedMultiplier: number;
  /** Multiplier applied to linear damping / braking (default 1.0). */
  brakingMultiplier: number;

  // ── Camera ────────────────────────────────────────────────────────────

  /** Orbit radius (meters) for the third-person pilot camera. */
  cameraOrbitRadius: number;

  // ── Collision ─────────────────────────────────────────────────────────

  /** Overall collision radius used for broad-phase checks. */
  collisionRadius: number;

  /** Composite collision spheres (ship-local space). */
  colliderSpheres: { offset: [number, number, number]; radius: number }[];

  // ── Interior bounds ───────────────────────────────────────────────────

  /** Floor height (Y) for interior walking. */
  interiorFloorHeight: number;
  /** Half-extent clamping on the X axis inside the ship. */
  interiorClampX: number;
  /** Half-extent clamping on the Z axis inside the ship. */
  interiorClampZ: number;

  /** Height of the landing gear (distance from ship origin to ground contact). */
  landingGearHeight: number;
}

// ─── Resolved config with THREE objects for runtime use ─────────────────────

export interface ShipConfig extends ShipConfigRaw {
  /** Resolved THREE.Vector3 helpers (derived from the raw tuples). */
  entryPointVec: THREE.Vector3;
  exitPointVec: THREE.Vector3;
  insideSpawnVec: THREE.Vector3;
  outsideSpawnVec: THREE.Vector3;
  thrusterVecs: THREE.Vector3[];
  gunVecs: THREE.Vector3[];
}

// ─── Ship registry ──────────────────────────────────────────────────────────

const shipRegistry = new Map<string, ShipConfig>();

/** Register a raw ship config. Call once per ship type at startup. */
export function registerShip(id: string, raw: ShipConfigRaw): ShipConfig {
  const fallback: [number, number, number] = [0, 0, 0];
  const config: ShipConfig = {
    ...raw,
    entryPointVec: new THREE.Vector3(...(raw.entryPoint ?? fallback)),
    exitPointVec: new THREE.Vector3(...(raw.exitPoint ?? fallback)),
    insideSpawnVec: new THREE.Vector3(...(raw.insideSpawnPoint ?? fallback)),
    outsideSpawnVec: new THREE.Vector3(...(raw.outsideSpawnPoint ?? fallback)),
    thrusterVecs: (raw.thrusterPositions ?? []).map((position) => new THREE.Vector3(...position)),
    gunVecs: (raw.gunPositions ?? []).map((position) => new THREE.Vector3(...position)),
  };
  shipRegistry.set(id, config);
  return config;
}

// ─── Runtime anchor extraction from GLB ─────────────────────────────────────

/**
 * Extracts spatial anchors (thrusters, guns, doors) from named nodes in a loaded
 * GLB scene and writes them into the ship config's Vec3 fields.
 *
 * Expected node names (case-sensitive, at any depth):
 *   - `thruster_<abbreviation>_01`, `thruster_<abbreviation>_02`, …
 *   - `gun_<abbreviation>_01`, `gun_<abbreviation>_02`, …
 *   - `outside_door_<abbreviation>`  → entryPointVec + outsideSpawnVec
 *   - `inside_door_<abbreviation>`   → exitPointVec  + insideSpawnVec
 *
 * Coordinates in the GLB are rotated 180° around Y (the model group has
 * `rotation={[0, Math.PI, 0]}`) so extracted positions are flipped:  (x, y, z) → (-x, y, -z).
 *
 * Call once per ship after the GLB scene is available.  Only nodes that are
 * actually found will overwrite the config — missing nodes leave the fallback
 * values from the raw config intact.
 */
export function extractShipAnchors(scene: THREE.Object3D, config: ShipConfig): void {
  const abbr = config.abbreviation;
  if (!abbr) return;

  const outsideDoorName = `outside_door_${abbr}`;
  const insideDoorName = `inside_door_${abbr}`;
  const thrusterPrefix = `thruster_${abbr}_`;
  const gunPrefix = `gun_${abbr}_`;

  const thrusters: { index: number; position: THREE.Vector3 }[] = [];
  const guns: { index: number; position: THREE.Vector3 }[] = [];

  /** Flip a GLB position by 180° around Y (matching the render-time rotation). */
  const flip = (v: THREE.Vector3): THREE.Vector3 => new THREE.Vector3(-v.x, v.y, -v.z);

  scene.traverse((node) => {
    const name = node.name;
    if (!name) return;

    if (name === outsideDoorName) {
      const pos = flip(node.position);
      config.entryPointVec.copy(pos);
      config.outsideSpawnVec.copy(pos);
      return;
    }

    if (name === insideDoorName) {
      const pos = flip(node.position);
      config.exitPointVec.copy(pos);
      config.insideSpawnVec.copy(pos);
      return;
    }

    if (name.startsWith(thrusterPrefix)) {
      const suffix = name.slice(thrusterPrefix.length);
      const index = parseInt(suffix, 10);
      if (!Number.isNaN(index)) {
        thrusters.push({ index, position: flip(node.position) });
      }
      return;
    }

    if (name.startsWith(gunPrefix)) {
      const suffix = name.slice(gunPrefix.length);
      const index = parseInt(suffix, 10);
      if (!Number.isNaN(index)) {
        guns.push({ index, position: flip(node.position) });
      }
    }
  });

  // Sort by index so ordering matches the Blender naming (01, 02, …)
  if (thrusters.length > 0) {
    thrusters.sort((a, b) => a.index - b.index);
    config.thrusterVecs = thrusters.map((t) => t.position);
  }

  if (guns.length > 0) {
    guns.sort((a, b) => a.index - b.index);
    config.gunVecs = guns.map((g) => g.position);
  }
}

/** Retrieve a registered ship config by id. */
export function getShipConfig(id: string): ShipConfig {
  const cfg = shipRegistry.get(id);
  if (!cfg) throw new Error(`Ship config "${id}" not found. Did you forget to register it?`);
  return cfg;
}

/** Return all registered ship configs. */
export function getAllShipConfigs(): Map<string, ShipConfig> {
  return shipRegistry;
}

/** The default / starter ship id. */
export const DEFAULT_SHIP_ID = 'ascendancy';
