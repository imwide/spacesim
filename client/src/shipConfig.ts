import * as THREE from 'three';

// ─── Ship configuration schema ──────────────────────────────────────────────

export interface ShipConfigRaw {
  /** Human-readable ship name */
  name: string;

  /** Path to the exterior GLB model (relative to public/) */
  exteriorModel: string;
  /** Path to the interior GLB model (relative to public/) */
  interiorModel: string;

  // ── Spatial anchors (coordinates relative to ship origin) ──────────────

  /** Position of the "door" on the outside of the hull — the player can
   *  board when within 10 m of this point. */
  entryPoint: [number, number, number];

  /** Position of the "door" on the inside of the hull — the player can
   *  exit the ship when within 10 m of this point. */
  exitPoint: [number, number, number];

  /** Where the player spawns (in ship-local coords) after boarding. */
  insideSpawnPoint: [number, number, number];

  /** Where the player spawns (in ship-local coords) after exiting, offset
   *  is applied in world-space relative to the ship. */
  outsideSpawnPoint: [number, number, number];

  /** Position of the pilot seat inside the interior model. */
  pilotSeatPosition: [number, number, number];

  /** Relative ship-local positions of engine / thruster exhaust points. */
  thrusterPositions: [number, number, number][];

  /** Relative ship-local positions of projectile / gun muzzle points. */
  gunPositions: [number, number, number][];

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
  pilotSeatVec: THREE.Vector3;
  thrusterVecs: THREE.Vector3[];
  gunVecs: THREE.Vector3[];
}

// ─── Ship registry ──────────────────────────────────────────────────────────

const shipRegistry = new Map<string, ShipConfig>();

/** Register a raw ship config. Call once per ship type at startup. */
export function registerShip(id: string, raw: ShipConfigRaw): ShipConfig {
  const config: ShipConfig = {
    ...raw,
    entryPointVec: new THREE.Vector3(...raw.entryPoint),
    exitPointVec: new THREE.Vector3(...raw.exitPoint),
    insideSpawnVec: new THREE.Vector3(...raw.insideSpawnPoint),
    outsideSpawnVec: new THREE.Vector3(...raw.outsideSpawnPoint),
    pilotSeatVec: new THREE.Vector3(...raw.pilotSeatPosition),
    thrusterVecs: raw.thrusterPositions.map((position) => new THREE.Vector3(...position)),
    gunVecs: raw.gunPositions.map((position) => new THREE.Vector3(...position)),
  };
  shipRegistry.set(id, config);
  return config;
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
export const DEFAULT_SHIP_ID = 'aether';
