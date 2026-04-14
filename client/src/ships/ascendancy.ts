import { registerShip, type ShipConfigRaw } from '../shipConfig';

// ─── Ascendancy — default starter ship ──────────────────────────────────────

const ascendancyConfig: ShipConfigRaw = {
  name: 'Ascendancy',
  abbreviation: 'acd',

  model: '/models/ascendancy.glb',

  // Spatial anchors (entry/exit doors, thrusters, guns) are extracted at
  // runtime from named empty nodes in the GLB — no need to hardcode them.

  // ── Flight multipliers (1.0 = baseline) ───────────────────────────────
  accelerationMultiplier: 0.5,
  speedMultiplier: 1.5,
  turningSpeedMultiplier: 0.2,
  brakingMultiplier: 0.5,

  // ── Camera ────────────────────────────────────────────────────────────
  cameraOrbitRadius: 50,

  // ── Collision ─────────────────────────────────────────────────────────
  collisionRadius: 5.15,

  colliderSpheres: [
    { offset: [0, 0, -1.2], radius: 1.35 },
    { offset: [0, 0, 1.65], radius: 1.15 },
    { offset: [0, 0, 3.9], radius: 0.82 },
    { offset: [2.35, 0, 0.45], radius: 0.92 },
    { offset: [-2.35, 0, 0.45], radius: 0.92 },
  ],

  // ── Interior bounds ───────────────────────────────────────────────────
  interiorFloorHeight: 1.6,
  interiorClampX: 2.8,
  interiorClampZ: 5,
  landingGearHeight: 6.0,
};

export const ascendancyShipConfig = registerShip('ascendancy', ascendancyConfig);
