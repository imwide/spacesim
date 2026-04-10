import { registerShip, type ShipConfigRaw } from '../shipConfig';

// ─── Aether — default starter ship ─────────────────────────────────────────

const aetherConfig: ShipConfigRaw = {
  name: 'Aether',

  exteriorModel: '/models/aether.glb',
  interiorModel: '/models/aether_interior.glb',

  // The entry point is just behind the ship (where a ramp/door would be).
  // Players can board when within 10 m of this world-space offset from the ship origin.
  entryPoint: [0, -1, 5],

  // The exit point (inside the hull) — press X near here to leave.
  exitPoint: [0, 0, 4],

  // Where the player appears (ship-local) after boarding.
  insideSpawnPoint: [0, 1.6, 2.5],

  // Where the player appears (ship-local offset, applied in world-space) after exiting.
  outsideSpawnPoint: [0, 0, 9.5],

  // Pilot seat location inside the interior model.
  pilotSeatPosition: [0, 1.2, -3.2],

  // Engine exhaust anchors.
  thrusterPositions: [
    [0.95, 0.1, 4.95],
    [-0.95, 0.1, 4.95],
  ],

  // Weapon muzzle anchors.
  gunPositions: [
    [1.95, 0.08, -3.95],
    [-1.95, 0.08, -3.95],
  ],

  // ── Flight multipliers (1.0 = baseline) ───────────────────────────────
  accelerationMultiplier: 1.0,
  speedMultiplier: 1.0,
  turningSpeedMultiplier: 1.0,
  brakingMultiplier: 1.0,

  // ── Camera ────────────────────────────────────────────────────────────
  cameraOrbitRadius: 15,

  // ── Collision ─────────────────────────────────────────────────────────
  collisionRadius: 5.15,

  colliderSpheres: [
    { offset: [0, 0, -1.2], radius: 1.35 },   // main hull
    { offset: [0, 0, 1.65], radius: 1.15 },    // rear section
    { offset: [0, 0, 3.9], radius: 0.82 },     // tail
    { offset: [2.35, 0, 0.45], radius: 0.92 }, // left wing
    { offset: [-2.35, 0, 0.45], radius: 0.92 },// right wing
  ],

  // ── Interior bounds ───────────────────────────────────────────────────
  interiorFloorHeight: 1.6,
  interiorClampX: 2.8,
  interiorClampZ: 5,
  landingGearHeight: 6.0,
};

export const aetherShipConfig = registerShip('aether', aetherConfig);
