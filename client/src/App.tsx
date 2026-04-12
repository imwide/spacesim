import { Html, useGLTF } from '@react-three/drei';
import { setupStationLODs } from './stationLOD';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type ShipConfig, getShipConfig, DEFAULT_SHIP_ID } from './shipConfig';
import {
  ShipExteriorModel,
  ShipInteriorModel,
  preloadShipModels,
  type ShipInteriorCollisionData,
  useShipInteriorCollisionData,
} from './ShipModel';
import './ships'; // register all ship configs

// Preload the default ship models so GLBs download early
preloadShipModels(getShipConfig(DEFAULT_SHIP_ID));

import {
  ASTEROID_GROUP_VISIBILITY_RANGE,
  MOON_VISIBILITY_RANGE,
  PLANET_VISIBILITY_RANGE,
  SMALL_ASTEROID_VISIBILITY_RANGE,
  STAR_LENS_FLARE_RANGE,
  STAR_VISIBILITY_RANGE,
  type AsteroidData,
  type AsteroidGroupData,
  type DustAsteroidData,
  type GalaxyData,
  type MoonData,
  type PlanetData,
  type StationData,
  type StationKind,
  type StarSystemData,
  generateGalaxy,
  isLargeAsteroid,
} from './galaxy';
import {
  PLANET_TERRAIN_RENDER_DISTANCE,
  PlanetTerrain,
  getTerrainAltitudeAtPosition,
  getTerrainNormalAtPosition,
} from './PlanetTerrain';

import {
  type Dispatch,
  type FormEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type ReactElement,
  type SetStateAction,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { io, Socket } from 'socket.io-client';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

type Mode = 'space' | 'interior' | 'pilot' | 'planet-surface';
type Vec3Tuple = [number, number, number];
type QuatTuple = [number, number, number, number];

const METERS_PER_WORLD_UNIT = 1;
const STAR_MARKER_HIDE_RADIUS = 150;
const LOCAL_STAR_BODY_VISIBILITY_RANGE = 3_000_000_000;
const GALAXY_CAMERA_FAR = 3_000_000_000_000;
const CELESTIAL_PROXY_LINEAR_DISTANCE = 25_000;
const CELESTIAL_PROXY_LOG_FACTOR = 90_000;
const ASTEROID_PROXY_LINEAR_DISTANCE = 8_000;
const ASTEROID_PROXY_LOG_FACTOR = 22_000;
const STAR_PROXY_LINEAR_DISTANCE = 120_000;
const STAR_PROXY_LOG_FACTOR = 420_000;
const ASTEROID_RENDER_SCALE_MULTIPLIER = 1;
const MIN_PROXY_SCALE = 0.00000001;
const BODY_DETAIL_SPHERE_DISTANCE = PLANET_TERRAIN_RENDER_DISTANCE * 2;
const PLAYER_MAX_EVA_SPEED_METERS_PER_SECOND = 10 * METERS_PER_WORLD_UNIT;
const EVA_THRUST_ACCELERATION = 6 * METERS_PER_WORLD_UNIT;
const EVA_DAMPING = 0.85;
const EVA_STOP_SPEED_THRESHOLD = 0.12 * METERS_PER_WORLD_UNIT;
const INTERIOR_WALK_SPEED_METERS_PER_SECOND = 1.8 * METERS_PER_WORLD_UNIT;
const INTERIOR_GRAVITY_METERS_PER_SECOND = 9.81 * METERS_PER_WORLD_UNIT;
const INTERIOR_JUMP_VELOCITY = 5.0 * METERS_PER_WORLD_UNIT;
const SHIP_THRUST_ACCELERATION = 14 * METERS_PER_WORLD_UNIT;
const SHIP_MAX_SPEED_METERS_PER_SECOND = 240 * METERS_PER_WORLD_UNIT;
const SHIP_STATION_SLOW_ZONE_START_METERS = 2_000;
const SHIP_STATION_SLOW_ZONE_MIN_METERS = 100;
const SHIP_STATION_SLOW_ZONE_MIN_SPEED_METERS_PER_SECOND = 10;
const SHIP_STATION_MANUAL_HANDLING_MULTIPLIER = 0.2;
const SHIP_LINEAR_DAMPING = 0.18;
const SHIP_MANUAL_ANGULAR_ACCELERATION = 2.8;
const SHIP_MANUAL_MAX_ANGULAR_SPEED = 1.85;
const SHIP_MANUAL_ANGULAR_DAMPING = 2.4;
const SHIP_MANUAL_FORWARD_THRUST = SHIP_THRUST_ACCELERATION * 1.45;
const SHIP_MANUAL_REVERSE_THRUST = SHIP_THRUST_ACCELERATION * 1.1;
const SHIP_MANUAL_STRAFE_THRUST = SHIP_THRUST_ACCELERATION * 1.05;
const SHIP_MANUAL_COAST_DAMPING = 0.16;
const SHIP_MANUAL_LATERAL_DAMPING = 0.5;
const SHIP_MANUAL_TURN_LATERAL_DAMPING = 1.35;
const THIRD_PERSON_CAMERA_COLLISION_RADIUS = 0.8;
const THIRD_PERSON_CAMERA_COLLISION_BUFFER = 0.45;
const THIRD_PERSON_CAMERA_TERRAIN_SAMPLES = 10;
const PLAYER_COLLISION_RADIUS = 0.46;
const BOARDING_RADIUS_METERS = 10 * METERS_PER_WORLD_UNIT;
const SEAT_INTERACTION_DISTANCE_METERS = 1.15 * METERS_PER_WORLD_UNIT;
const INTERIOR_COLLISION_RADIUS = 0.28;
const INTERIOR_STEP_HEIGHT = 0.3;
const INTERIOR_GROUND_SNAP_DISTANCE = 0.22;
const INTERIOR_CEILING_PADDING = 0.12;
const INTERIOR_MAX_COLLISION_PASSES = 3;
const SAFEZONE_NOTICE_DURATION_MS = 3000;

// ── Legacy constants derived from the default ship config ──────────────────
// Used by autopilot and other code that doesn't have direct access to the
// active ShipConfig instance. These will be replaced once every subsystem
// receives the config as a parameter.
const _defaultShip = getShipConfig(DEFAULT_SHIP_ID);
const SHIP_COLLISION_RADIUS = _defaultShip.collisionRadius;
const SHIP_SPAWN_OFFSET_METERS = 18 * METERS_PER_WORLD_UNIT;
const SHIP_INTERIOR_FLOOR_HEIGHT_METERS = _defaultShip.interiorFloorHeight;
const SHIP_LANDING_GEAR_HEIGHT = _defaultShip.landingGearHeight;
const STAR_STATION_SCALE = 6;
const PLANET_STATION_SCALE = 4.5;
const ASTEROID_STATION_SCALE = 3.8;
// ─── Planet surface / landing constants ──────────────────────────────────────
const PLANET_GRAVITY_RANGE = 500_000; // 500 km from surface
const PLANET_SURFACE_GRAVITY = 9.81 * METERS_PER_WORLD_UNIT;
const PLANET_GRAVITY_TERMINAL_VELOCITY = 1000 * METERS_PER_WORLD_UNIT; // 1 km/s max fall speed
const PLANET_SURFACE_WALK_SPEED = 3.0 * METERS_PER_WORLD_UNIT;
const PLANET_SURFACE_JUMP_VELOCITY = 5.0 * METERS_PER_WORLD_UNIT;
const PLANET_SURFACE_EYE_HEIGHT = 1.7 * METERS_PER_WORLD_UNIT;
const STATION_GRAVITY_DETECTION_RANGE = 30 * METERS_PER_WORLD_UNIT;
// Max distance above terrain the player can be while still being "glued" to slope.
// Large enough to handle steep descents at walk speed; small enough that a jump breaks free.
const PLANET_SURFACE_GROUND_FOLLOW_DIST = 3.0 * METERS_PER_WORLD_UNIT;
const PLANET_TEXTURE_FILES = [
  '4k_ceres_fictional.jpg',
  '4k_eris_fictional.jpg',
  '4k_haumea_fictional.jpg',
  '4k_makemake_fictional.jpg',
  '4k_planet.jpg',
  '4k_planet2.jpg',
  '4k_venus_atmosphere.jpg',
  'dhnz12a-9b72a75c-92bc-4a91-abc4-db3300e3de90.jpg',
] as const;
const PLANET_TEXTURE_URLS = PLANET_TEXTURE_FILES.map((fileName) => new URL(`../../planet_textures/${fileName}`, import.meta.url).href);

let cachedPlanetTextureLibrary: THREE.Texture[] | null = null;
let cachedPlanetTextureLibraryPromise: Promise<THREE.Texture[]> | null = null;

interface ShipSnapshot {
  position: Vec3Tuple;
  velocity: Vec3Tuple;
  rotation: QuatTuple;
}

interface PlayerSnapshot {
  socketId: string;
  id: string;
  username: string;
  frameSystemId: string;
  frameOrigin: Vec3Tuple;
  position: Vec3Tuple;
  velocity: Vec3Tuple;
  rotation: QuatTuple;
  mode: Mode;
  insideShip: boolean;
  ship: ShipSnapshot;
}

interface AuthSession {
  token: string;
  user: {
    id: string;
    username: string;
  };
}

interface InventorySlotData {
  id: string;
  itemName: string | null;
}

interface HudState {
  connected: boolean;
  mode: Mode;
  speed: number;
  shipSpeed: number;
  prompt: string;
  playersOnline: number;
  speedLimitNotice: string;
  speedLimitNoticeColor: string;
  safezoneNotice: string;
  interactionPills: Array<{ key: string; label: string }>;
}

interface PilotCrosshairState {
  visible: boolean;
  shipVisible: boolean;
  shipScreenX: number;
  shipScreenY: number;
  aligned: boolean;
}

interface StationNode {
  id: string;
  name: string;
  kind: StationKind;
  systemId: string;
  systemName: string;
  localPosition: Vec3Tuple;
  mapPosition: [number, number];
  linkedStationIds: string[];
}

type AutopilotDestinationKind = StationKind | 'asteroid-object' | 'moon';

interface AutopilotDestination {
  id: string;
  name: string;
  kind: AutopilotDestinationKind;
  systemId: string;
  systemName: string;
  localPosition: Vec3Tuple;
  approachRadius: number;
  distanceFromShip: number;
  /** Actual geometric radius of the celestial body (planet/moon). 0 for stations etc. */
  bodyRadius: number;
  /** Actual center position of the celestial body (planet/moon center). Matches localPosition for non-body targets. */
  bodyCenter: Vec3Tuple;
  // For inter-system travel only: a waypoint far away in the destination's direction.
  // The ship flies to this point for visuals; fast-travel fires when interstellarArrivalAt elapses.
  interstellarWaypoint?: Vec3Tuple;
  // performance.now() timestamp (ms) at which fast-travel should trigger.
  interstellarArrivalAt?: number;
}

interface HighlightTarget {
  id: string;
  name: string;
  kind: string;
  systemId: string;
  localPosition: Vec3Tuple;
  bodyCenter: Vec3Tuple;
}

interface AutopilotObstacle {
  id: string;
  kind: 'star' | 'planet' | 'moon' | 'asteroid';
  position: Vec3Tuple;
  radius: number;
}

interface LocalAutopilotPlan {
  desiredDirection: THREE.Vector3;
  speedCap: number;
}

interface AutopilotCollisionResult {
  obstacleLocalPosition: THREE.Vector3;
  obstacleRadius: number;
  normal: THREE.Vector3;
  travelFraction: number;
}

interface SceneCollider {
  id: string;
  kind: 'star' | 'planet' | 'moon' | 'asteroid' | 'station' | 'ship';
  position: Vec3Tuple;
  radius: number;
  ownerId?: string;
}

interface StationForceFieldData {
  id: string;
  position: Vec3Tuple;
  radius: number;
  scale: number;
}

interface MotionCollisionResult {
  collider: SceneCollider;
  colliderLocalPosition: THREE.Vector3;
  normal: THREE.Vector3;
  travelFraction: number;
}

interface StationBorderSpeedLimitInfo {
  maxSpeed: number;
  active: boolean;
}

interface StationForceFieldHitResult {
  distance: number;
  field: StationForceFieldData;
  point: THREE.Vector3;
}

const stationForceFieldImpactHandlers = new Map<string, (worldHitPoint: THREE.Vector3) => void>();
const stationWalkableRoots = new Map<string, THREE.Object3D>();
// Reusable instances for findStationWalkCollision — avoids per-frame GC pressure.
const _walkRaycaster = new THREE.Raycaster();
const _walkDownDir = new THREE.Vector3(0, -1, 0);
const _walkBounds = new THREE.Box3();
const CARTOON_OUTLINE_ANGLE_DEGREES = 35;
const CARTOON_OUTLINE_DEPTH_THRESHOLD = 0.0025;

/** Objects registered here are hidden during the outline normal/depth pass
 *  so they don't receive cartoon outlines (e.g. star body, lens flare). */
const outlineExcludedObjects = new Set<THREE.Object3D>();

function setOutlineExcluded(object: THREE.Object3D | null, excluded: boolean): void {
  if (!object) {
    return;
  }

  if (excluded) {
    outlineExcludedObjects.add(object);
    return;
  }

  outlineExcludedObjects.delete(object);
}

/**
 * Material used during the normal/depth pass for objects that should BLOCK the outline
 * of geometry behind them, but should NOT have any outline drawn on themselves.
 * Writes depth normally so it occludes other geometry, but writes alpha=0 to the
 * normal colour buffer so the outline shader skips edge detection at those pixels.
 */
const outlineSentinelMaterial = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }
  `,
  fragmentShader: /* glsl */ `
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
    }
  `,
  depthWrite: true,
  depthTest: true,
  colorWrite: true,
  side: THREE.DoubleSide,
});

const CARTOON_OUTLINE_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CARTOON_OUTLINE_FRAGMENT_SHADER = /* glsl */ `
  #include <packing>

  uniform sampler2D tDiffuse;
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 texelSize;
  uniform vec3 outlineColor;
  uniform float normalDotThreshold;
  uniform float depthThreshold;
  uniform float cameraNear;
  uniform float cameraFar;

  varying vec2 vUv;

  vec3 decodeNormal(vec3 enc) {
    return normalize(enc * 2.0 - 1.0);
  }

  // Read a neighbour sample → vec4(normal.xyz, linearDepth).
  // Sentinel pixels are substituted with centre values to suppress false edges.
  // Background pixels use the centre normal and an inflated depth so the Sobel
  // operator sees a clean silhouette discontinuity on the depth channel only.
  vec4 readSample(vec2 uv, vec3 cNormal, float cDepth, bool cHasGeo) {
    float rawZ = texture2D(tDepth, uv).x;
    vec4  ns   = texture2D(tNormal, uv);
    bool  hasGeo   = rawZ < 1.0;
    bool  sentinel = hasGeo && ns.a < 0.5;

    if (sentinel) {
      return vec4(cNormal, cDepth);
    }
    if (!hasGeo) {
      float bgDepth = cHasGeo ? cDepth * 200.0 : cDepth;
      return vec4(cNormal, bgDepth);
    }
    return vec4(
      decodeNormal(ns.xyz),
      -perspectiveDepthToViewZ(rawZ, cameraNear, cameraFar)
    );
  }

  void main() {
    vec4 baseColor = texture2D(tDiffuse, vUv);

    // ---- centre pixel ----
    float cRawZ = texture2D(tDepth, vUv).x;
    vec4  cNS   = texture2D(tNormal, vUv);
    bool  cHasGeo = cRawZ < 1.0;

    if (cHasGeo && cNS.a < 0.5) {            // sentinel — skip outlines
      gl_FragColor = baseColor;
      return;
    }

    float cDepth  = cHasGeo
      ? -perspectiveDepthToViewZ(cRawZ, cameraNear, cameraFar)
      : 1e10;
    vec3  cNormal = cHasGeo ? decodeNormal(cNS.xyz) : vec3(0.0, 0.0, 1.0);

    // ---- 3×3 Sobel neighbourhood ----
    //   TL  T  TR
    //    L  C   R
    //   BL  B  BR
    vec4 TL = readSample(vUv + vec2(-1.0,  1.0) * texelSize, cNormal, cDepth, cHasGeo);
    vec4 T  = readSample(vUv + vec2( 0.0,  1.0) * texelSize, cNormal, cDepth, cHasGeo);
    vec4 TR = readSample(vUv + vec2( 1.0,  1.0) * texelSize, cNormal, cDepth, cHasGeo);
    vec4 L  = readSample(vUv + vec2(-1.0,  0.0) * texelSize, cNormal, cDepth, cHasGeo);
    vec4 R  = readSample(vUv + vec2( 1.0,  0.0) * texelSize, cNormal, cDepth, cHasGeo);
    vec4 BL = readSample(vUv + vec2(-1.0, -1.0) * texelSize, cNormal, cDepth, cHasGeo);
    vec4 B  = readSample(vUv + vec2( 0.0, -1.0) * texelSize, cNormal, cDepth, cHasGeo);
    vec4 BR = readSample(vUv + vec2( 1.0, -1.0) * texelSize, cNormal, cDepth, cHasGeo);

    // ---- Depth edge: Sobel on log-relative depth ----
    float refD = max(cDepth, 1.0);
    float dTL = min(TL.w / refD, 200.0);
    float dT  = min(T.w  / refD, 200.0);
    float dTR = min(TR.w / refD, 200.0);
    float dL  = min(L.w  / refD, 200.0);
    float dR  = min(R.w  / refD, 200.0);
    float dBL = min(BL.w / refD, 200.0);
    float dB  = min(B.w  / refD, 200.0);
    float dBR = min(BR.w / refD, 200.0);

    // Sobel X: [-1 0 1; -2 0 2; -1 0 1]
    // Sobel Y: [ 1 2 1;  0 0 0; -1 -2 -1]
    float dGx = -dTL + dTR - 2.0*dL + 2.0*dR - dBL + dBR;
    float dGy =  dTL + 2.0*dT + dTR - dBL - 2.0*dB - dBR;
    float depthGrad = sqrt(dGx * dGx + dGy * dGy);

    // ---- Normal edge: Sobel per xyz component ----
    float nxGx = -TL.x + TR.x - 2.0*L.x + 2.0*R.x - BL.x + BR.x;
    float nxGy =  TL.x + 2.0*T.x + TR.x - BL.x - 2.0*B.x - BR.x;
    float nyGx = -TL.y + TR.y - 2.0*L.y + 2.0*R.y - BL.y + BR.y;
    float nyGy =  TL.y + 2.0*T.y + TR.y - BL.y - 2.0*B.y - BR.y;
    float nzGx = -TL.z + TR.z - 2.0*L.z + 2.0*R.z - BL.z + BR.z;
    float nzGy =  TL.z + 2.0*T.z + TR.z - BL.z - 2.0*B.z - BR.z;
    float normalGrad = sqrt(
      nxGx*nxGx + nxGy*nxGy +
      nyGx*nyGx + nyGy*nyGy +
      nzGx*nzGx + nzGy*nzGy
    );

    // ---- Smooth thresholds → anti-aliased edges ----
    // Depth: Sobel amplifies underlying step by ~2×; use a band around that.
    float depthEdge = smoothstep(depthThreshold * 0.5, depthThreshold * 2.5, depthGrad);

    // Normal: convert cosine dot-threshold to Sobel gradient magnitude.
    // |n1−n2| = sqrt(2 − 2·cos θ), Sobel ≈ 2× at edge centre.
    float normalGradThr = 2.0 * sqrt(2.0 * (1.0 - normalDotThreshold));
    float normalEdge = smoothstep(normalGradThr * 0.5, normalGradThr * 1.2, normalGrad);

    float edge = max(normalEdge, depthEdge);
    gl_FragColor = mix(baseColor, vec4(outlineColor, baseColor.a), edge);
  }
`;

interface LocalGameState {
  frameSystemId: string;
  frameOrigin: THREE.Vector3;
  mode: Mode;
  insideShip: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Quaternion;
  autopilotDirection: THREE.Vector3;
  shipPosition: THREE.Vector3;
  shipVelocity: THREE.Vector3;
  shipAngularVelocity: THREE.Vector3;
  shipRotation: THREE.Quaternion;
  interiorPosition: THREE.Vector3;
  interiorVelocity: THREE.Vector3;
  yaw: number;
  pitch: number;
  lastNetworkAt: number;
  lastHudAt: number;
  /** Planet ID the player is near/on (empty string if none) */
  nearPlanetId: string;
  /** Planet center in frame-local coords when near a planet */
  nearPlanetCenter: THREE.Vector3;
  /** Planet radius when near a planet */
  nearPlanetRadius: number;
  /** Whether the ship is touching the ground */
  shipOnGround: boolean;
  /** Whether the player (EVA) is on the planet surface */
  playerOnGround: boolean;
  /** Whether pilot braking input is currently active */
  shipBraking: boolean;
}

const AUTH_STORAGE_KEY = 'spacesim.auth';
const AUTOPILOT_REACH_DISTANCE_METERS = 250;
const AUTOPILOT_INTERSTELLAR_TURN_RATE = 0.22;
const AUTOPILOT_LOCAL_TURN_RATE = 1.4;
const METERS_PER_LIGHT_YEAR = 9_460_730_472_580_800;
const AUTOPILOT_LOCAL_MAX_ACCELERATION = SHIP_THRUST_ACCELERATION * 5;
const AUTOPILOT_LOCAL_MAX_BRAKE_DECELERATION = SHIP_THRUST_ACCELERATION * 6.5;
// ─── Autopilot tuning ────────────────────────────────────────────────────────
const AUTOPILOT_MAX_SPEED_METERS_PER_SECOND = 200 * METERS_PER_LIGHT_YEAR;
const AUTOPILOT_INTERSTELLAR_CRUISE_SPEED = AUTOPILOT_MAX_SPEED_METERS_PER_SECOND;
// Local (intra-system) travel at 30 billion m/s gives a short 10-15 seconds pace where planets fly by quickly to keep travel under 2 mins.
const AUTOPILOT_LOCAL_CRUISE_SPEED = 30_000_000_000;
// Time in seconds to ramp from 0 → cruise (interstellar only)
const AUTOPILOT_ACCEL_TIME_SECONDS = 20;
// Time in seconds to ramp from cruise → 0 (interstellar only)
const AUTOPILOT_DECEL_TIME_SECONDS = 20;
// Distances below this use short-range proportional approach
const AUTOPILOT_LOCAL_RANGE_THRESHOLD_METERS = 100_000; // 100 km
// ─── Long-distance autopilot (intra-system, > 1000 km) ────────────────────────
const SPEED_OF_LIGHT_MPS = 299_792_458;
/** Long distance cruise speed — tune this value to adjust top travel speed */
const LONG_DISTANCE_CRUISE_SPEED = 80 * SPEED_OF_LIGHT_MPS;
const LONG_DISTANCE_THRESHOLD_METERS = 1_000_000; // 1 000 km
const LONG_DISTANCE_PHASE1_DURATION = 20; // seconds — slow accel & orient
const LONG_DISTANCE_PHASE1_TARGET_SPEED = 5_000; // 5 km/s
const LONG_DISTANCE_PHASE2_DURATION = 20; // seconds — fast accel to cruise
const LONG_DISTANCE_DECEL_DURATION = 20; // seconds — deceleration phase
// Decel trigger distance: 0.5 × cruiseSpeed × decelDuration ≈ 240 million km (1.6 AU)
const LONG_DISTANCE_DECEL_TRIGGER = 0.5 * LONG_DISTANCE_CRUISE_SPEED * LONG_DISTANCE_DECEL_DURATION;
const SHIP_WEAPON_FIRE_INTERVAL_SECONDS = 0.09;
const SHIP_WEAPON_PROJECTILE_SPEED = 3_600;
const SHIP_WEAPON_PROJECTILE_LIFETIME_SECONDS = 0.95;
const SHIP_WEAPON_PROJECTILE_LENGTH = 30;
const SHIP_WEAPON_PROJECTILE_RADIUS = 0.1;
const SHIP_WEAPON_FLASH_LIFETIME_SECONDS = 0.09;
const SHIP_WEAPON_MAX_PROJECTILES = 40;
const SHIP_WEAPON_MAX_FLASHES = 8;
const SHIP_WEAPON_IMPACT_LIFETIME_SECONDS = 0.4;
const SHIP_WEAPON_IMPACT_PARTICLE_COUNT = 8;
const SHIP_WEAPON_MAX_IMPACTS = 12;
const SHIP_WEAPON_IMPACT_SCALE_MULTIPLIER = 3;
const SHIP_THRUSTER_PARTICLE_COUNT = 6;
const SHIP_THRUSTER_FLAME_BLOB_COUNT = 4;
const SHIP_THRUSTER_PLUME_LENGTH = 5.5;
const SHIP_THRUSTER_IDLE_PLUME_LENGTH = 0.5;
const SHIP_THRUSTER_PLUME_RADIUS = 0.18;
const SHIP_THRUSTER_GLOW_RADIUS = 0.5;
const SHIP_THRUSTER_PARTICLE_DRIFT = 0.22;
const SHIP_THRUSTER_SMOOTH_TIME_SECONDS = 2.1;
const DUST_ASTEROID_HITS_TO_DESTROY = 4;
const DUST_ASTEROID_EXPLOSION_LIFETIME_SECONDS = 1.05;
const DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT = 12;
const DUST_ASTEROID_EXPLOSION_SUB_BURSTS = 4;
const DUST_ASTEROID_MAX_EXPLOSIONS = 10;
const DUST_ASTEROID_BLAST_RADIUS = 150;
const DUST_ASTEROID_BLAST_PUSH_VELOCITY = 85;
const STATION_FORCE_FIELD_SPOT_LIFETIME_SECONDS = 0.3;
const STATION_FORCE_FIELD_MAX_SPOTS = 6;
const STATION_FORCE_FIELD_IMPACT_REVEAL_RADIUS_METERS = 12;
const STATION_FORCE_FIELD_IMPACT_REVEAL_SOFTNESS_METERS = 16;
// Steepness of the Gaussian bell-curve deceleration profile.
// Higher → deceleration more concentrated in the middle; lower → more spread out.
const LONG_DISTANCE_BELL_CURVE_K = 2.0;

// Phase 5: final approach distance & duration.
const LONG_DISTANCE_PHASE5_DISTANCE = 100_000; // 100 km — start of final approach
const LONG_DISTANCE_PHASE5_MAX_SPEED = 5000; // 5 km/s — speed when entering final approach
const LONG_DISTANCE_PHASE5_STOP_ALT = 1000; // 1 km — altitude above terrain where autopilot disengages
// Distance of the interstellar waypoint. 3 Light Years provides a realistic warp duration
const INTERSTELLAR_WAYPOINT_DISTANCE = 3 * METERS_PER_LIGHT_YEAR;
// Arrival radius for the interstellar waypoint (physics fallback only).
// Very large to handle float32 precision error and overshoot.
const AUTOPILOT_WARP_ARRIVAL_RADIUS = 300_000_000_000;
// Interstellar trip duration in seconds. Computed from accel + cruise + decel phases.
// Used by the timer-based arrival trigger (independent of physics convergence).
function getInterstellarTripSeconds(): number {
  const accelDist = 0.5 * AUTOPILOT_INTERSTELLAR_CRUISE_SPEED * AUTOPILOT_ACCEL_TIME_SECONDS;
  const decelDist = 0.5 * AUTOPILOT_INTERSTELLAR_CRUISE_SPEED * AUTOPILOT_DECEL_TIME_SECONDS;
  const cruiseDist = Math.max(0, INTERSTELLAR_WAYPOINT_DISTANCE - accelDist - decelDist);
  return AUTOPILOT_ACCEL_TIME_SECONDS + AUTOPILOT_DECEL_TIME_SECONDS + cruiseDist / AUTOPILOT_INTERSTELLAR_CRUISE_SPEED;
}
// ─────────────────────────────────────────────────────────────────────────────
// Warp-streak visual fires above this speed (10 % of interstellar cruise)
const AUTOPILOT_WARP_EFFECT_SPEED_METERS_PER_SECOND = AUTOPILOT_INTERSTELLAR_CRUISE_SPEED * 0.1;
const AUTOPILOT_AVOIDANCE_BUFFER_METERS = 1_600;
const AUTOPILOT_ASTEROID_OBSTACLE_LIMIT = 120;
const AUTOPILOT_TARGET_ASTEROID_MIN_SIZE = 20;
const AUTOPILOT_TARGET_SURFACE_BUFFER_METERS = 140;
const TARGET_OUTLINE_PULSE_SPEED = 3.6;
const AUTOPILOT_LOCAL_MIN_SPEED = 18;
const AUTOPILOT_LOCAL_CLEARANCE_BUFFER_METERS = 220;
const AUTOPILOT_LOCAL_AVOIDANCE_WEIGHT = 1.35;
const AUTOPILOT_LOCAL_LOOKAHEAD_MIN = 1_200;
const AUTOPILOT_LOCAL_LOOKAHEAD_MAX = 18_000;
const AUTOPILOT_LOCAL_VELOCITY_RESPONSE_SECONDS = 1.35;
const AUTOPILOT_LOCAL_PATH_SMOOTHING = 1.4;
const AUTOPILOT_LOCAL_SETTLE_TIME_SECONDS = 2.4;
const AUTOPILOT_LOCAL_CLOSE_RANGE_SPEED_CAP = 180;
const AUTOPILOT_LOCAL_COLLISION_MARGIN_METERS = 42;
const AUTOPILOT_ETA_SIMULATION_STEP_SECONDS = 0.1;
const AUTOPILOT_ETA_MAX_SIMULATION_STEPS = 120_000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function tupleFromVector(vector: THREE.Vector3): Vec3Tuple {
  return [vector.x, vector.y, vector.z];
}

function tupleFromQuaternion(quaternion: THREE.Quaternion): QuatTuple {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function tupleAdd(left: Vec3Tuple, right: Vec3Tuple): Vec3Tuple {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function tupleSubtract(left: Vec3Tuple, right: Vec3Tuple): Vec3Tuple {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function vectorFromTuple(tuple: Vec3Tuple): THREE.Vector3 {
  return new THREE.Vector3(tuple[0], tuple[1], tuple[2]);
}

function toFrameLocalPosition(position: Vec3Tuple, frameOrigin: Vec3Tuple | THREE.Vector3): Vec3Tuple {
  if (frameOrigin instanceof THREE.Vector3) {
    return [position[0] - frameOrigin.x, position[1] - frameOrigin.y, position[2] - frameOrigin.z];
  }

  return [position[0] - frameOrigin[0], position[1] - frameOrigin[1], position[2] - frameOrigin[2]];
}

function projectWorldPointToScreen(point: THREE.Vector3, camera: THREE.Camera, viewportWidth: number, viewportHeight: number): { x: number; y: number; visible: boolean } {
  const cameraSpace = point.clone().applyMatrix4(camera.matrixWorldInverse);
  if (cameraSpace.z >= 0) {
    return {
      x: viewportWidth / 2,
      y: viewportHeight / 2,
      visible: false,
    };
  }

  const projected = point.clone().project(camera);
  const margin = 28;
  const halfWidth = viewportWidth / 2;
  const halfHeight = viewportHeight / 2;
  const clampedX = clamp(projected.x, -1 + margin / halfWidth, 1 - margin / halfWidth);
  const clampedY = clamp(projected.y, -1 + margin / halfHeight, 1 - margin / halfHeight);

  return {
    x: (clampedX * 0.5 + 0.5) * viewportWidth,
    y: (-clampedY * 0.5 + 0.5) * viewportHeight,
    visible: true,
  };
}

function compressProxyDistance(distance: number, linearDistance: number, logarithmicFactor: number): number {
  if (distance <= linearDistance) {
    return distance;
  }

  return linearDistance + Math.log1p((distance - linearDistance) / linearDistance) * logarithmicFactor;
}

function hashString(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finalizeSurfaceTexture(texture: THREE.Texture): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function createColorizedTextureVariant(baseTexture: THREE.Texture, seedKey: string): THREE.Texture {
  const random = createSeededRandom(hashString(seedKey));
  const source = baseTexture.image as CanvasImageSource & { width?: number; height?: number };
  const width = source.width ?? 2048;
  const height = source.height ?? 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');

  if (!context) {
    return finalizeSurfaceTexture(baseTexture.clone());
  }

  const hueRotation = (random() - 0.5) * 90;
  const saturation = 1.05 + random() * 0.65;
  const brightness = 0.88 + random() * 0.28;
  const contrast = 0.92 + random() * 0.22;
  const tintHue = Math.floor(random() * 360);
  const tintAlpha = 0.16 + random() * 0.12;

  context.filter = `hue-rotate(${hueRotation}deg) saturate(${saturation}) brightness(${brightness}) contrast(${contrast})`;
  context.drawImage(source, 0, 0, width, height);
  context.filter = 'none';
  context.globalCompositeOperation = 'soft-light';
  context.fillStyle = `hsla(${tintHue}, ${55 + random() * 20}%, ${48 + random() * 12}%, ${tintAlpha})`;
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'source-over';

  const variantTexture = new THREE.CanvasTexture(canvas);
  return finalizeSurfaceTexture(variantTexture);
}

function usePlanetTextureLibrary(): THREE.Texture[] {
  const [textures, setTextures] = useState<THREE.Texture[]>(cachedPlanetTextureLibrary ?? []);

  useEffect(() => {
    if (cachedPlanetTextureLibrary) {
      setTextures(cachedPlanetTextureLibrary);
      return;
    }

    if (!cachedPlanetTextureLibraryPromise) {
      const loader = new THREE.TextureLoader();
      cachedPlanetTextureLibraryPromise = Promise.all(PLANET_TEXTURE_URLS.map((url) => loader.loadAsync(url))).then((baseTextures) => {
        const originals = baseTextures.map((texture) => finalizeSurfaceTexture(texture.clone()));
        const variants = baseTextures.map((texture, index) => createColorizedTextureVariant(texture, `${PLANET_TEXTURE_FILES[index]}-variant`));
        cachedPlanetTextureLibrary = [...originals, ...variants];
        return cachedPlanetTextureLibrary;
      });
    }

    let cancelled = false;
    cachedPlanetTextureLibraryPromise
      .then((loadedTextures) => {
        if (!cancelled) {
          setTextures(loadedTextures);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTextures([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return textures;
}

function pickBodySurfaceTexture(textures: THREE.Texture[], bodyId: string): THREE.Texture | undefined {
  if (textures.length === 0) {
    return undefined;
  }

  return textures[hashString(bodyId) % textures.length] ?? textures[0];
}

function createStationSnapshot(state: LocalGameState): PlayerSnapshot {
  return {
    socketId: 'local',
    id: 'local',
    username: 'local',
    frameSystemId: state.frameSystemId,
    frameOrigin: tupleFromVector(state.frameOrigin),
    mode: state.mode,
    insideShip: state.mode !== 'space' && state.mode !== 'planet-surface',
    position: tupleFromVector(state.position),
    velocity: tupleFromVector(state.velocity),
    rotation: tupleFromQuaternion(state.rotation),
    ship: {
      position: tupleFromVector(state.shipPosition),
      velocity: tupleFromVector(state.shipVelocity),
      rotation: tupleFromQuaternion(state.shipRotation),
    },
  };
}

function buildStationNetwork(galaxy: GalaxyData): StationNode[] {
  const nodes = galaxy.systems.flatMap((system) => {
    const starStation: StationNode = {
      id: system.station.id,
      name: system.station.name,
      kind: system.station.kind,
      systemId: system.id,
      systemName: system.name,
      localPosition: system.station.position,
      mapPosition: [system.mapPosition[0], system.mapPosition[2]],
      linkedStationIds: [],
    };

    const planetStations = system.planets.flatMap((planet, index) => {
      const mapPos = [system.mapPosition[0] + planet.position[0] * 0.0000000014, system.mapPosition[2] + planet.position[2] * 0.0000000014] as [number, number];
      
      const pStations = planet.stations.map((station, stationIndex) => ({
        id: station.id,
          name: station.name,
        kind: station.kind,
        systemId: system.id,
        systemName: system.name,
        localPosition: tupleAdd(planet.position, station.position),
        mapPosition: mapPos,
        linkedStationIds: [starStation.id],
      } satisfies StationNode));

      const mStations = planet.moons.flatMap((moon, moonIndex) => 
        moon.stations.map((station, stationIndex) => ({
          id: station.id,
            name: station.name,
          kind: station.kind,
          systemId: system.id,
          systemName: system.name,
          localPosition: tupleAdd(planet.position, tupleAdd(moon.position, station.position)),
          mapPosition: mapPos,
          linkedStationIds: [starStation.id],
        } satisfies StationNode))
      );

      return [...pStations, ...mStations];
    });

    const asteroidStations = system.asteroidGroups.map((group, index) => ({
      id: group.station.id,
        name: group.station.name,
      kind: group.station.kind,
      systemId: system.id,
      systemName: system.name,
      localPosition: tupleAdd(group.position, group.station.position),
      mapPosition: [system.mapPosition[0] + group.position[0] * 0.0000000011, system.mapPosition[2] + group.position[2] * 0.0000000011] as [number, number],
      linkedStationIds: [starStation.id],
    } satisfies StationNode));

    starStation.linkedStationIds = [...planetStations.map((station) => station.id), ...asteroidStations.map((station) => station.id)];
    return [starStation, ...planetStations, ...asteroidStations];
  });

  const starStations = nodes.filter((node) => node.kind === 'star');

  starStations.forEach((station) => {
    const nearestStarStations = [...starStations]
      .filter((candidate) => candidate.id !== station.id)
      .sort((left, right) => {
        const leftDistance = (left.mapPosition[0] - station.mapPosition[0]) ** 2 + (left.mapPosition[1] - station.mapPosition[1]) ** 2;
        const rightDistance = (right.mapPosition[0] - station.mapPosition[0]) ** 2 + (right.mapPosition[1] - station.mapPosition[1]) ** 2;
        return leftDistance - rightDistance;
      })
      .slice(0, 2)
      .map((candidate) => candidate.id);

    station.linkedStationIds = Array.from(new Set([...station.linkedStationIds, ...nearestStarStations]));
  });

  return nodes;
}

function buildAutopilotObstacles(system: StarSystemData): AutopilotObstacle[] {
  const asteroidObstacles = system.asteroidGroups
    .flatMap((group) =>
      group.asteroids.map((asteroid) => ({
        id: asteroid.id,
        kind: 'asteroid' as const,
        position: tupleAdd(group.position, asteroid.position),
        radius: Math.max(asteroid.size * 0.9, 18),
      })),
    )
    .sort((left, right) => right.radius - left.radius)
    .slice(0, AUTOPILOT_ASTEROID_OBSTACLE_LIMIT);

  return [
    {
      id: `${system.id}-star-core`,
      kind: 'star',
      position: [0, 0, 0],
      radius: system.radius,
    },
    ...system.planets.flatMap((planet) => [
      {
        id: planet.id,
        kind: 'planet' as const,
        position: planet.position,
        radius: planet.radius,
      },
      ...planet.moons.map((moon) => ({
        id: moon.id,
        kind: 'moon' as const,
        position: tupleAdd(planet.position, moon.position),
        radius: moon.radius,
      })),
    ]),
    ...asteroidObstacles,
  ];
}

function getStationForceFieldRadius(station: StationData): number {
  return station.borderRadius;
}

function buildSystemStationForceFields(system: StarSystemData): StationForceFieldData[] {
  const fields: StationForceFieldData[] = [
    {
      id: `${system.station.id}:force-field`,
      position: system.station.position,
      radius: getStationForceFieldRadius(system.station),
      scale: STAR_STATION_SCALE,
    },
  ];

  system.planets.forEach((planet) => {
    planet.stations.forEach((station) => {
      fields.push({
        id: `${station.id}:force-field`,
        position: tupleAdd(planet.position, station.position),
        radius: getStationForceFieldRadius(station),
        scale: PLANET_STATION_SCALE,
      });
    });

    planet.moons.forEach((moon) => {
      const moonPosition = tupleAdd(planet.position, moon.position);
      moon.stations.forEach((station) => {
        fields.push({
          id: `${station.id}:force-field`,
          position: tupleAdd(moonPosition, station.position),
          radius: getStationForceFieldRadius(station),
          scale: PLANET_STATION_SCALE,
        });
      });
    });
  });

  system.asteroidGroups.forEach((group) => {
    fields.push({
      id: `${group.station.id}:force-field`,
      position: tupleAdd(group.position, group.station.position),
      radius: getStationForceFieldRadius(group.station),
      scale: ASTEROID_STATION_SCALE,
    });
  });

  return fields;
}

function buildStationSceneColliders(id: string, position: Vec3Tuple, scale: number): SceneCollider[] {
  const basePosition = vectorFromTuple(position);
  const colliderSpecs = [
    { offset: new THREE.Vector3(0, 0, 0), radius: scale * 1.05 },
    { offset: new THREE.Vector3(0, scale * 1.6, 0), radius: scale * 0.72 },
    { offset: new THREE.Vector3(0, -scale * 1.6, 0), radius: scale * 0.72 },
    { offset: new THREE.Vector3(scale * 2.25, 0, 0), radius: scale * 1.05 },
    { offset: new THREE.Vector3(-scale * 2.25, 0, 0), radius: scale * 1.05 },
    { offset: new THREE.Vector3(0, 0, scale * 2.25), radius: scale * 1.05 },
    { offset: new THREE.Vector3(0, 0, -scale * 2.25), radius: scale * 1.05 },
  ];

  return colliderSpecs.map((spec, index) => ({
    id: `${id}:part-${index}`,
    ownerId: id,
    kind: 'station' as const,
    position: tupleFromVector(basePosition.clone().add(spec.offset)),
    radius: spec.radius,
  }));
}

function buildShipSceneColliders(id: string, position: Vec3Tuple, rotation: QuatTuple | THREE.Quaternion, config?: ShipConfig): SceneCollider[] {
  const basePosition = vectorFromTuple(position);
  const quaternion = rotation instanceof THREE.Quaternion ? rotation.clone() : new THREE.Quaternion(...rotation);
  const colliderSpecs = config
    ? config.colliderSpheres.map((s) => ({ offset: new THREE.Vector3(...s.offset), radius: s.radius }))
    : [
        { offset: new THREE.Vector3(0, 0, -1.2), radius: 1.35 },
        { offset: new THREE.Vector3(0, 0, 1.65), radius: 1.15 },
        { offset: new THREE.Vector3(0, 0, 3.9), radius: 0.82 },
        { offset: new THREE.Vector3(2.35, 0, 0.45), radius: 0.92 },
        { offset: new THREE.Vector3(-2.35, 0, 0.45), radius: 0.92 },
      ];

  return colliderSpecs.map((spec, index) => ({
    id: `${id}:part-${index}`,
    ownerId: id,
    kind: 'ship' as const,
    position: tupleFromVector(basePosition.clone().add(spec.offset.clone().applyQuaternion(quaternion))),
    radius: spec.radius,
  }));
}

function buildSystemSceneColliders(system: StarSystemData): SceneCollider[] {
  const colliders: SceneCollider[] = [
    {
      id: `${system.id}-star-core`,
      kind: 'star',
      position: [0, 0, 0],
      radius: system.radius,
    },
    ...buildStationSceneColliders(system.station.id, system.station.position, STAR_STATION_SCALE),
  ];

  system.planets.forEach((planet) => {
    // No sphere collider for the planet body — terrain collision handles ground contact.

    planet.stations.forEach((station) => {
      colliders.push(...buildStationSceneColliders(station.id, tupleAdd(planet.position, station.position), PLANET_STATION_SCALE));
    });

    planet.moons.forEach((moon) => {
      const moonPosition = tupleAdd(planet.position, moon.position);
      // No sphere collider for the moon body — terrain collision handles ground contact.

      moon.stations.forEach((station) => {
        colliders.push(...buildStationSceneColliders(station.id, tupleAdd(moonPosition, station.position), PLANET_STATION_SCALE));
      });
    });
  });

  system.asteroidGroups.forEach((group) => {
    colliders.push(...buildStationSceneColliders(group.station.id, tupleAdd(group.position, group.station.position), ASTEROID_STATION_SCALE));

    group.asteroids.forEach((asteroid) => {
      colliders.push({
        id: asteroid.id,
        kind: 'asteroid',
        position: tupleAdd(group.position, asteroid.position),
        radius: Math.max(Math.max(asteroid.scale[0], asteroid.scale[1], asteroid.scale[2]) * 0.52, 14),
      });
    });
  });

  return colliders;
}

function buildRemoteShipColliders(remotePlayers: PlayerSnapshot[], viewerFrameOrigin: Vec3Tuple): SceneCollider[] {
  return remotePlayers.flatMap((player) =>
    buildShipSceneColliders(
      `ship:${player.socketId}`,
      tupleAdd(player.ship.position, tupleSubtract(player.frameOrigin, viewerFrameOrigin)),
      player.ship.rotation,
    ),
  );
}

function mapSceneCollidersToFrame(colliders: SceneCollider[], frameOrigin: Vec3Tuple): SceneCollider[] {
  return colliders.map((collider) => ({
    ...collider,
    position: toFrameLocalPosition(collider.position, frameOrigin),
  }));
}

function getStationBorderLimitedManualSpeed(
  shipPosition: THREE.Vector3,
  shipVelocity: THREE.Vector3,
  shipRadius: number,
  fields: StationForceFieldData[],
  defaultMaxSpeed: number,
): StationBorderSpeedLimitInfo {
  let nearestBorderDistance = Number.POSITIVE_INFINITY;
  let nearestAwayDirection: THREE.Vector3 | null = null;

  fields.forEach((field) => {
    const dx = shipPosition.x - field.position[0];
    const dy = shipPosition.y - field.position[1];
    const dz = shipPosition.z - field.position[2];
    const centerDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const borderDistance = centerDistance - field.radius - shipRadius;
    if (borderDistance < nearestBorderDistance) {
      nearestBorderDistance = borderDistance;
      nearestAwayDirection = centerDistance > 1e-6
        ? new THREE.Vector3(dx / centerDistance, dy / centerDistance, dz / centerDistance)
        : null;
    }
  });
  if (!Number.isFinite(nearestBorderDistance) || nearestBorderDistance >= SHIP_STATION_SLOW_ZONE_START_METERS) {
    return { maxSpeed: defaultMaxSpeed, active: false };
  }

  if (nearestBorderDistance <= SHIP_STATION_SLOW_ZONE_MIN_METERS) {
    return {
      maxSpeed: Math.min(defaultMaxSpeed, SHIP_STATION_SLOW_ZONE_MIN_SPEED_METERS_PER_SECOND),
      active: true,
    };
  }

  const normalizedDistance =
    (nearestBorderDistance - SHIP_STATION_SLOW_ZONE_MIN_METERS) /
    (SHIP_STATION_SLOW_ZONE_START_METERS - SHIP_STATION_SLOW_ZONE_MIN_METERS);

  const limitedSpeed = THREE.MathUtils.lerp(
    Math.min(defaultMaxSpeed, SHIP_STATION_SLOW_ZONE_MIN_SPEED_METERS_PER_SECOND),
    defaultMaxSpeed,
    THREE.MathUtils.clamp(normalizedDistance, 0, 1),
  );

  if (!nearestAwayDirection || shipVelocity.lengthSq() <= 1e-6) {
    return { maxSpeed: limitedSpeed, active: true };
  }

  const movingAway = shipVelocity.clone().normalize().dot(nearestAwayDirection) > 0;
  if (!movingAway) {
    return { maxSpeed: limitedSpeed, active: true };
  }

  return {
    maxSpeed: THREE.MathUtils.lerp(limitedSpeed, defaultMaxSpeed, 0.6),
    active: true,
  };
}

function isShipInsideStationBounds(shipPosition: THREE.Vector3, fields: StationForceFieldData[]): boolean {
  return fields.some((field) => {
    const dx = shipPosition.x - field.position[0];
    const dy = shipPosition.y - field.position[1];
    const dz = shipPosition.z - field.position[2];
    return dx * dx + dy * dy + dz * dz <= field.radius * field.radius;
  });
}

function findSceneCollisionOnSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  actorRadius: number,
  colliders: SceneCollider[],
  ignoredColliderIds: Set<string>,
): MotionCollisionResult | null {
  const delta = end.clone().sub(start);
  const lengthSq = delta.lengthSq();

  if (lengthSq <= 1e-8) {
    return null;
  }

  let nearestHit: MotionCollisionResult | null = null;

  colliders.forEach((collider) => {
    if (ignoredColliderIds.has(collider.id) || (collider.ownerId && ignoredColliderIds.has(collider.ownerId))) {
      return;
    }

    const colliderLocalPosition = vectorFromTuple(collider.position);
    const expandedRadius = collider.radius + actorRadius;
    const projectedT = clamp(colliderLocalPosition.clone().sub(start).dot(delta) / lengthSq, 0, 1);
    const closestPoint = start.clone().addScaledVector(delta, projectedT);
    const fromCenter = closestPoint.clone().sub(colliderLocalPosition);
    const centerDistance = fromCenter.length();

    if (centerDistance >= expandedRadius) {
      return;
    }

    let normal = centerDistance > 1e-6
      ? fromCenter.multiplyScalar(1 / centerDistance)
      : start.clone().sub(colliderLocalPosition).normalize();

    if (normal.lengthSq() < 1e-6) {
      normal = delta.clone().normalize().multiplyScalar(-1);
    }

    if (!nearestHit || projectedT < nearestHit.travelFraction) {
      nearestHit = {
        collider,
        colliderLocalPosition,
        normal,
        travelFraction: projectedT,
      };
    }
  });

  return nearestHit;
}

function findPreciseSceneCollisionOnSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  actorRadius: number,
  colliders: SceneCollider[],
  ignoredColliderIds: Set<string>,
): MotionCollisionResult | null {
  const delta = end.clone().sub(start);
  const lengthSq = delta.lengthSq();

  if (lengthSq <= 1e-8) {
    return null;
  }

  let nearestHit: MotionCollisionResult | null = null;

  colliders.forEach((collider) => {
    if (ignoredColliderIds.has(collider.id) || (collider.ownerId && ignoredColliderIds.has(collider.ownerId))) {
      return;
    }

    const colliderLocalPosition = vectorFromTuple(collider.position);
    const expandedRadius = collider.radius + actorRadius;
    const startOffset = start.clone().sub(colliderLocalPosition);
    const c = startOffset.lengthSq() - expandedRadius * expandedRadius;

    if (c <= 0) {
      const normal = startOffset.lengthSq() > 1e-8
        ? startOffset.normalize()
        : delta.clone().normalize().multiplyScalar(-1);
      if (!nearestHit || 0 < nearestHit.travelFraction) {
        nearestHit = {
          collider,
          colliderLocalPosition,
          normal,
          travelFraction: 0,
        };
      }
      return;
    }

    const a = lengthSq;
    const b = 2 * startOffset.dot(delta);
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      return;
    }

    const sqrtDiscriminant = Math.sqrt(discriminant);
    const tNear = (-b - sqrtDiscriminant) / (2 * a);
    const tFar = (-b + sqrtDiscriminant) / (2 * a);
    const travelFraction = tNear >= 0 && tNear <= 1
      ? tNear
      : tFar >= 0 && tFar <= 1
        ? tFar
        : null;

    if (travelFraction === null) {
      return;
    }

    const hitPoint = start.clone().addScaledVector(delta, travelFraction);
    let normal = hitPoint.sub(colliderLocalPosition);
    if (normal.lengthSq() <= 1e-8) {
      normal = delta.clone().normalize().multiplyScalar(-1);
    } else {
      normal.normalize();
    }

    if (!nearestHit || travelFraction < nearestHit.travelFraction) {
      nearestHit = {
        collider,
        colliderLocalPosition,
        normal,
        travelFraction,
      };
    }
  });

  return nearestHit;
}

function findThirdPersonCameraTerrainFraction(
  start: THREE.Vector3,
  end: THREE.Vector3,
  system: StarSystemData,
  frameOrigin: THREE.Vector3,
): number | null {
  const segment = end.clone().sub(start);
  const segmentLength = segment.length();

  if (segmentLength <= 1e-6) {
    return null;
  }

  const isTerrainBlocked = (point: THREE.Vector3): boolean => {
    const nearestPlanet = findNearestPlanet(point, system, frameOrigin);
    if (!nearestPlanet) {
      return false;
    }

    const minimumAltitude = getTerrainAltitudeAtPosition(
      point,
      nearestPlanet.planetCenter,
      nearestPlanet.planetRadius,
      nearestPlanet.planetId,
    ) + THIRD_PERSON_CAMERA_COLLISION_RADIUS + THIRD_PERSON_CAMERA_COLLISION_BUFFER;

    return point.distanceTo(nearestPlanet.planetCenter) <= minimumAltitude;
  };

  if (isTerrainBlocked(start)) {
    return 0;
  }

  let previousFraction = 0;
  const samplePoint = new THREE.Vector3();

  for (let sampleIndex = 1; sampleIndex <= THIRD_PERSON_CAMERA_TERRAIN_SAMPLES; sampleIndex += 1) {
    const fraction = sampleIndex / THIRD_PERSON_CAMERA_TERRAIN_SAMPLES;
    samplePoint.copy(start).addScaledVector(segment, fraction);

    if (!isTerrainBlocked(samplePoint)) {
      previousFraction = fraction;
      continue;
    }

    let safeFraction = previousFraction;
    let blockedFraction = fraction;
    for (let iteration = 0; iteration < 5; iteration += 1) {
      const midFraction = (safeFraction + blockedFraction) * 0.5;
      samplePoint.copy(start).addScaledVector(segment, midFraction);
      if (isTerrainBlocked(samplePoint)) {
        blockedFraction = midFraction;
      } else {
        safeFraction = midFraction;
      }
    }
    return safeFraction;
  }

  return null;
}

function shouldIgnoreThirdPersonCameraCollision(
  object: THREE.Object3D,
  ignoredRoots: Array<THREE.Object3D | null>,
): boolean {
  let current: THREE.Object3D | null = object;

  while (current) {
    if (ignoredRoots.some((root) => root === current)) {
      return true;
    }

    if (
      current.userData?.ignoreCameraCollision
      || current.userData?.ignoreWeaponCollision
      || current.userData?.ignoreMarkerOcclusion
      || current.userData?.ignoreStarOcclusion
      || current.userData?.suppressWeaponImpactEffect
    ) {
      return true;
    }

    current = current.parent;
  }

  return false;
}

const _thirdPersonCameraTargetBuffer: THREE.Object3D[] = [];

function resolveThirdPersonCameraPosition(
  scene: THREE.Scene,
  raycaster: THREE.Raycaster,
  focusPosition: THREE.Vector3,
  desiredPosition: THREE.Vector3,
  ignoredRoots: Array<THREE.Object3D | null>,
): THREE.Vector3 {
  const segment = desiredPosition.clone().sub(focusPosition);
  const segmentLength = segment.length();

  if (segmentLength <= 1e-6) {
    return desiredPosition.clone();
  }

  const direction = segment.clone().divideScalar(segmentLength);
  const CAMERA_PULLBACK_BUFFER = 0.5;

  // Build a flat list of candidate meshes via traverseVisible so we only
  // touch objects that are fully mounted (non-null matrixWorld).
  _thirdPersonCameraTargetBuffer.length = 0;
  scene.traverseVisible((object) => {
    if (
      object instanceof THREE.Mesh
      && object.geometry
      && object.matrixWorld
      && !shouldIgnoreThirdPersonCameraCollision(object, ignoredRoots)
    ) {
      _thirdPersonCameraTargetBuffer.push(object);
    }
  });

  raycaster.near = 0;
  raycaster.far = segmentLength;
  raycaster.set(focusPosition, direction);

  // recursive: false because the list is already flat
  const hits = raycaster.intersectObjects(_thirdPersonCameraTargetBuffer, false);
  if (hits.length > 0) {
    const safeDistance = Math.max(0, hits[0].distance - CAMERA_PULLBACK_BUFFER);
    return focusPosition.clone().addScaledVector(direction, safeDistance);
  }

  return desiredPosition.clone();
}

function findStationForceFieldHitOnSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  fields: StationForceFieldData[],
): StationForceFieldHitResult | null {
  const segment = end.clone().sub(start);
  const segmentLength = segment.length();

  if (segmentLength <= 1e-8) {
    return null;
  }

  const direction = segment.clone().divideScalar(segmentLength);
  let nearestHit: StationForceFieldHitResult | null = null;

  for (const field of fields) {
    const center = vectorFromTuple(field.position);
    const offset = start.clone().sub(center);
    const a = direction.dot(direction);
    const b = 2 * offset.dot(direction);
    const c = offset.dot(offset) - field.radius * field.radius;
    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0) {
      continue;
    }

    const sqrtDiscriminant = Math.sqrt(discriminant);
    const tNear = (-b - sqrtDiscriminant) / (2 * a);
    const tFar = (-b + sqrtDiscriminant) / (2 * a);
    const travel = tNear >= 0 ? tNear : tFar >= 0 ? tFar : -1;

    if (travel < 0 || travel > segmentLength) {
      continue;
    }

    if (!nearestHit || travel < nearestHit.distance) {
      nearestHit = {
        distance: travel,
        field,
        point: start.clone().addScaledVector(direction, travel),
      };
    }
  }

  return nearestHit;
}

function resolveStaticColliderOverlaps(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  actorRadius: number,
  colliders: SceneCollider[],
  ignoredColliderIds: Set<string>,
): void {
  for (let iteration = 0; iteration < 3; iteration += 1) {
    let corrected = false;

    for (const collider of colliders) {
      if (ignoredColliderIds.has(collider.id) || (collider.ownerId && ignoredColliderIds.has(collider.ownerId))) {
        continue;
      }

      const colliderLocalPosition = vectorFromTuple(collider.position);
      const separation = position.clone().sub(colliderLocalPosition);
      const minDistance = actorRadius + collider.radius;
      const distance = separation.length();

      if (distance >= minDistance || minDistance <= 0) {
        continue;
      }

      const normal = distance > 1e-6 ? separation.multiplyScalar(1 / distance) : new THREE.Vector3(0, 1, 0);
      position.copy(colliderLocalPosition).addScaledVector(normal, minDistance + 0.02);
      const inwardSpeed = velocity.dot(normal);
      if (inwardSpeed < 0) {
        velocity.addScaledVector(normal, -inwardSpeed);
      }
      corrected = true;
    }

    if (!corrected) {
      break;
    }
  }
}

function moveBodyWithSceneColliders(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  dt: number,
  actorRadius: number,
  colliders: SceneCollider[],
  ignoredIds: string[] = [],
): void {
  const ignoredColliderIds = new Set(ignoredIds);
  let remainingFraction = 1;

  for (let iteration = 0; iteration < 3 && remainingFraction > 1e-4; iteration += 1) {
    const nextPosition = position.clone().addScaledVector(velocity, dt * remainingFraction);
    const collision = findSceneCollisionOnSegment(position, nextPosition, actorRadius, colliders, ignoredColliderIds);

    if (!collision) {
      position.copy(nextPosition);
      break;
    }

    const safeFraction = clamp(collision.travelFraction - 0.02, 0, 1);
    const partialDelta = nextPosition.sub(position).multiplyScalar(safeFraction);
    position.add(partialDelta);
    position.copy(collision.colliderLocalPosition).addScaledVector(collision.normal, actorRadius + collision.collider.radius + 0.02);

    const inwardSpeed = velocity.dot(collision.normal);
    if (inwardSpeed < 0) {
      velocity.addScaledVector(collision.normal, -inwardSpeed);
    }

    remainingFraction *= Math.max(0, 1 - safeFraction);
  }

  resolveStaticColliderOverlaps(position, velocity, actorRadius, colliders, ignoredColliderIds);
}

function getInteriorHitNormal(hit: THREE.Intersection<THREE.Object3D>): THREE.Vector3 {
  if (!hit.face) {
    return new THREE.Vector3(0, 1, 0);
  }

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
  return hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
}

function raycastInteriorMeshes(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  maxDistance: number,
  collision: ShipInteriorCollisionData,
  predicate?: (hit: THREE.Intersection<THREE.Object3D>, normal: THREE.Vector3) => boolean,
): THREE.Intersection<THREE.Object3D> | null {
  if (!collision.colliderMeshes.length || maxDistance <= 0) {
    return null;
  }

  const hits = new THREE.Raycaster(origin, direction, 0, maxDistance).intersectObjects(collision.colliderMeshes, true);
  if (!predicate) {
    return hits[0] ?? null;
  }

  for (const hit of hits) {
    const normal = getInteriorHitNormal(hit);
    if (predicate(hit, normal)) {
      return hit;
    }
  }

  return null;
}

function findStationCollisionRoot(object: THREE.Object3D | null): THREE.Object3D | null {
  let current: THREE.Object3D | null = object;

  while (current) {
    if (typeof current.userData.stationCollisionRootId === 'string') {
      return current;
    }
    current = current.parent;
  }

  return null;
}

function isObjectHierarchyVisible(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

function findStationWalkCollision(position: THREE.Vector3): ShipInteriorCollisionData | null {
  const roots = Array.from(stationWalkableRoots.values()).filter((root) => isObjectHierarchyVisible(root));
  if (!roots.length) {
    return null;
  }

  _walkRaycaster.set(position, _walkDownDir);
  _walkRaycaster.near = 0;
  _walkRaycaster.far = STATION_GRAVITY_DETECTION_RANGE;
  const hits = _walkRaycaster.intersectObjects(roots, true);
  for (const hit of hits) {
    const normal = getInteriorHitNormal(hit);
    if (normal.y <= 0.25) {
      continue;
    }

    const root = findStationCollisionRoot(hit.object);
    if (!root) {
      continue;
    }

    return {
      colliderMeshes: [root],
      bounds: _walkBounds.setFromObject(root),
      standingHeight: PLANET_SURFACE_EYE_HEIGHT,
    };
  }

  return null;
}

function moveInteriorBodyWithCollision(
  position: THREE.Vector3,
  movement: THREE.Vector3,
  collision: ShipInteriorCollisionData,
): THREE.Vector3 {
  if (!collision.colliderMeshes.length || movement.lengthSq() <= 1e-10) {
    return position.clone().add(movement);
  }

  const nextPosition = position.clone();
  const remaining = movement.clone();
  const bodyOffsets = [0, -collision.standingHeight * 0.45, -Math.max(collision.standingHeight - 0.24, 0.24)];

  for (let pass = 0; pass < INTERIOR_MAX_COLLISION_PASSES && remaining.lengthSq() > 1e-8; pass += 1) {
    const travelDistance = remaining.length();
    const direction = remaining.clone().normalize();
    let blockingHit: THREE.Intersection<THREE.Object3D> | null = null;

    for (const offsetY of bodyOffsets) {
      const origin = nextPosition.clone();
      origin.y += offsetY;
      const hit = raycastInteriorMeshes(
        origin,
        direction,
        travelDistance + INTERIOR_COLLISION_RADIUS + 0.02,
        collision,
        (_candidate, normal) => Math.abs(normal.y) < 0.7,
      );

      if (hit && (!blockingHit || hit.distance < blockingHit.distance)) {
        blockingHit = hit;
      }
    }

    if (!blockingHit) {
      nextPosition.add(remaining);
      break;
    }

    const safeDistance = Math.max(0, blockingHit.distance - INTERIOR_COLLISION_RADIUS - 0.01);
    nextPosition.addScaledVector(direction, safeDistance);

    const consumed = direction.clone().multiplyScalar(safeDistance);
    remaining.sub(consumed);

    const hitNormal = getInteriorHitNormal(blockingHit);
    if (remaining.dot(hitNormal) < 0) {
      remaining.projectOnPlane(hitNormal);
    } else {
      break;
    }
  }

  return nextPosition;
}

function resolveInteriorVerticalPosition(
  currentPosition: THREE.Vector3,
  nextPosition: THREE.Vector3,
  verticalVelocity: number,
  collision: ShipInteriorCollisionData,
): { positionY: number; velocityY: number; grounded: boolean } {
  if (!collision.colliderMeshes.length) {
    return {
      positionY: nextPosition.y,
      velocityY: verticalVelocity,
      grounded: false,
    };
  }

  let positionY = nextPosition.y;
  let velocityY = verticalVelocity;
  let grounded = false;

  const downwardOrigin = new THREE.Vector3(
    nextPosition.x,
    Math.max(currentPosition.y, nextPosition.y) + INTERIOR_STEP_HEIGHT,
    nextPosition.z,
  );
  const downwardDistance = collision.standingHeight
    + INTERIOR_STEP_HEIGHT
    + Math.max(0, currentPosition.y - nextPosition.y)
    + INTERIOR_GROUND_SNAP_DISTANCE;
  const groundHit = raycastInteriorMeshes(
    downwardOrigin,
    new THREE.Vector3(0, -1, 0),
    downwardDistance,
    collision,
    (_candidate, normal) => normal.y > 0.25,
  );

  if (groundHit) {
    const floorY = groundHit.point.y + collision.standingHeight;
    const canStepUp = floorY >= currentPosition.y && floorY - currentPosition.y <= INTERIOR_STEP_HEIGHT;
    const shouldSnapToGround = positionY <= floorY + INTERIOR_GROUND_SNAP_DISTANCE;
    if (shouldSnapToGround || canStepUp) {
      positionY = floorY;
      velocityY = 0;
      grounded = true;
    }
  }

  if (!grounded && positionY > currentPosition.y) {
    const upwardDistance = positionY - currentPosition.y + INTERIOR_CEILING_PADDING;
    const ceilingHit = raycastInteriorMeshes(
      currentPosition,
      new THREE.Vector3(0, 1, 0),
      upwardDistance,
      collision,
      (_candidate, normal) => normal.y < -0.25,
    );

    if (ceilingHit) {
      positionY = Math.min(positionY, currentPosition.y + Math.max(0, ceilingHit.distance - INTERIOR_CEILING_PADDING));
      velocityY = Math.min(0, velocityY);
    }
  }

  return { positionY, velocityY, grounded };
}

function shouldResetInteriorPosition(
  position: THREE.Vector3,
  shipConfig: ShipConfig,
  collision: ShipInteriorCollisionData,
): boolean {
  if (
    position.y < shipConfig.interiorFloorHeight - 8
    || Math.abs(position.x) > shipConfig.interiorClampX + 8
    || Math.abs(position.z) > shipConfig.interiorClampZ + 8
  ) {
    return true;
  }

  const safeBounds = collision.bounds.clone();
  safeBounds.min.y -= Math.max(4, collision.standingHeight * 2);
  safeBounds.max.y += 2;
  safeBounds.expandByScalar(1.5);

  if (!safeBounds.containsPoint(position)) {
    return true;
  }

  const supportOrigin = position.clone();
  supportOrigin.y += 0.15;
  const supportHit = raycastInteriorMeshes(
    supportOrigin,
    new THREE.Vector3(0, -1, 0),
    Math.max(12, collision.standingHeight + 8),
    collision,
    (_candidate, normal) => normal.y > 0.25,
  );

  return !supportHit && position.distanceToSquared(shipConfig.insideSpawnVec) > 36;
}

// ─── Planet proximity & terrain collision helpers ─────────────────────────────

interface NearestPlanetInfo {
  planetId: string;
  planetCenter: THREE.Vector3;
  planetRadius: number;
  distanceToSurface: number;
}

/**
 * Find the nearest planet (or moon) to a position, in frame-local coordinates.
 * Returns null if no planet is within PLANET_GRAVITY_RANGE of the surface.
 */
function findNearestPlanet(
  position: THREE.Vector3,
  system: StarSystemData,
  frameOrigin: THREE.Vector3,
): NearestPlanetInfo | null {
  let nearest: NearestPlanetInfo | null = null;

  for (const planet of system.planets) {
    const center = new THREE.Vector3(
      planet.position[0] - frameOrigin.x,
      planet.position[1] - frameOrigin.y,
      planet.position[2] - frameOrigin.z,
    );
    const dist = position.distanceTo(center) - planet.radius;

    if (dist < PLANET_GRAVITY_RANGE && (!nearest || dist < nearest.distanceToSurface)) {
      nearest = {
        planetId: planet.id,
        planetCenter: center,
        planetRadius: planet.radius,
        distanceToSurface: dist,
      };
    }

    // Also check moons
    for (const moon of planet.moons) {
      const moonCenter = new THREE.Vector3(
        planet.position[0] + moon.position[0] - frameOrigin.x,
        planet.position[1] + moon.position[1] - frameOrigin.y,
        planet.position[2] + moon.position[2] - frameOrigin.z,
      );
      const moonDist = position.distanceTo(moonCenter) - moon.radius;

      if (moonDist < PLANET_GRAVITY_RANGE && (!nearest || moonDist < nearest.distanceToSurface)) {
        nearest = {
          planetId: moon.id,
          planetCenter: moonCenter,
          planetRadius: moon.radius,
          distanceToSurface: moonDist,
        };
      }
    }
  }

  return nearest;
}

/**
 * Clamp a body to the terrain surface without integrating velocity or applying
 * gravity.  Use this when velocity has already been integrated (e.g. during
 * piloted flight) and we only need to prevent the body from sinking through
 * the terrain.
 */
function clampBodyToTerrain(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  planetCenter: THREE.Vector3,
  planetRadius: number,
  planetId: string,
  bodyRadius: number,
): boolean {
  const toBody = new THREE.Vector3().subVectors(position, planetCenter);
  const distFromCenter = toBody.length();
  if (distFromCenter < 1e-6) return false;

  const terrainAltitude = getTerrainAltitudeAtPosition(position, planetCenter, planetRadius, planetId);
  const minAltitude = terrainAltitude + bodyRadius;

  if (distFromCenter <= minAltitude) {
    const upDir = toBody.divideScalar(distFromCenter);
    position.copy(planetCenter).addScaledVector(upDir, minAltitude);
    const normalSpeed = velocity.dot(upDir);
    if (normalSpeed < 0) {
      velocity.addScaledVector(upDir, -normalSpeed);
    }
    return true;
  }
  return false;
}

/**
 * Apply planet gravity to a body. Returns whether the body is on/touching the ground.
 */
function applyPlanetGravityAndTerrainCollision(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  planetCenter: THREE.Vector3,
  planetRadius: number,
  planetId: string,
  bodyRadius: number,
  dt: number,
): boolean {
  // Direction from planet center to body
  const toBody = new THREE.Vector3().subVectors(position, planetCenter);
  const distFromCenter = toBody.length();
  if (distFromCenter < 1e-6) return false;

  const gravityDir = toBody.clone().normalize().negate(); // toward planet center

  // Apply gravity
  velocity.addScaledVector(gravityDir, PLANET_SURFACE_GRAVITY * dt);

  // Cap gravity-induced speed to terminal velocity (1 km/s)
  const gravitySpeed = velocity.dot(gravityDir);
  if (gravitySpeed > PLANET_GRAVITY_TERMINAL_VELOCITY) {
    velocity.addScaledVector(gravityDir, -(gravitySpeed - PLANET_GRAVITY_TERMINAL_VELOCITY));
  }

  // Move body
  position.addScaledVector(velocity, dt);

  // Recompute radial direction from the NEW position so the snap is
  // always along the correct outward normal (fixes height mismatch on slopes).
  const newToBody = new THREE.Vector3().subVectors(position, planetCenter);
  const newDistFromCenter = newToBody.length();
  if (newDistFromCenter < 1e-6) return false;

  // Check terrain collision
  const terrainAltitude = getTerrainAltitudeAtPosition(position, planetCenter, planetRadius, planetId);
  const bodyAltitude = newDistFromCenter;
  const minAltitude = terrainAltitude + bodyRadius;

  if (bodyAltitude <= minAltitude) {
    // On ground: snap to surface using the correct (post-move) up direction
    const upDir = newToBody.divideScalar(newDistFromCenter);
    position.copy(planetCenter).addScaledVector(upDir, minAltitude);

    // Remove velocity component going into the ground
    const normalSpeed = velocity.dot(upDir);
    if (normalSpeed < 0) {
      velocity.addScaledVector(upDir, -normalSpeed);
    }

    // Apply friction when on ground
    const lateralVel = velocity.clone().addScaledVector(upDir, -velocity.dot(upDir));
    lateralVel.multiplyScalar(Math.max(0, 1 - 4.0 * dt));
    velocity.copy(upDir.clone().multiplyScalar(velocity.dot(upDir))).add(lateralVel);

    return true;
  }

  return false;
}

function integrateShipAngularVelocity(state: LocalGameState, dt: number, angularDamping: number): void {
  if (state.shipAngularVelocity.lengthSq() <= 1e-8) {
    state.shipAngularVelocity.set(0, 0, 0);
    return;
  }

  const deltaRotation = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      state.shipAngularVelocity.x * dt,
      state.shipAngularVelocity.y * dt,
      state.shipAngularVelocity.z * dt,
      'XYZ',
    ),
  );
  state.shipRotation.multiply(deltaRotation).normalize();

  const angularDampFactor = Math.max(0, 1 - angularDamping * dt);
  state.shipAngularVelocity.multiplyScalar(angularDampFactor);
  if (state.shipAngularVelocity.length() < 0.01) {
    state.shipAngularVelocity.set(0, 0, 0);
  }
}

function getAutopilotCruiseSpeed(isInterSystem: boolean): number {
  return isInterSystem ? AUTOPILOT_INTERSTELLAR_CRUISE_SPEED : AUTOPILOT_LOCAL_CRUISE_SPEED;
}

function getAutopilotAcceleration(isInterSystem: boolean, currentSpeed: number): number {
  void currentSpeed;
  const cruise = isInterSystem ? AUTOPILOT_INTERSTELLAR_CRUISE_SPEED : AUTOPILOT_LOCAL_CRUISE_SPEED;
  return cruise / AUTOPILOT_ACCEL_TIME_SECONDS;
}

function getAutopilotBrakeDeceleration(isInterSystem: boolean): number {
  const cruise = isInterSystem ? AUTOPILOT_INTERSTELLAR_CRUISE_SPEED : AUTOPILOT_LOCAL_CRUISE_SPEED;
  return cruise / AUTOPILOT_DECEL_TIME_SECONDS;
}

function getAutopilotBrakingDistance(): number {
  // v² = 2·a·d  →  d = cruise · decelTime / 2  (interstellar only)
  return (AUTOPILOT_INTERSTELLAR_CRUISE_SPEED * AUTOPILOT_INTERSTELLAR_CRUISE_SPEED) /
    (2 * (AUTOPILOT_INTERSTELLAR_CRUISE_SPEED / AUTOPILOT_DECEL_TIME_SECONDS));
}

function getAutopilotTargetSpeed(distanceToDestination: number, arrivalDistance: number, isInterSystem: boolean): number {
  const remainingDistance = Math.max(0, distanceToDestination - arrivalDistance);
  if (remainingDistance <= 0) return 0;

  if (!isInterSystem) {
    const aBrake = getAutopilotBrakeDeceleration(false);
    const brakingLimitedSpeed = Math.sqrt(2 * aBrake * remainingDistance);
    const settleLimitedSpeed = remainingDistance / AUTOPILOT_LOCAL_SETTLE_TIME_SECONDS;

    if (remainingDistance <= AUTOPILOT_REACH_DISTANCE_METERS * 0.35) {
      return 0;
    }

    return clamp(
      Math.max(
        AUTOPILOT_LOCAL_MIN_SPEED,
        Math.min(brakingLimitedSpeed, settleLimitedSpeed)
      ),
      0,
      AUTOPILOT_LOCAL_CRUISE_SPEED,
    );
  }

  // Interstellar: kinematic braking curve
  const brakingDistance = getAutopilotBrakingDistance();
  if (remainingDistance >= brakingDistance) {
    return AUTOPILOT_INTERSTELLAR_CRUISE_SPEED;
  }
  const aBrake = getAutopilotBrakeDeceleration(true);
  return clamp(Math.sqrt(2 * aBrake * remainingDistance), 0, AUTOPILOT_INTERSTELLAR_CRUISE_SPEED);
}

function getWarpEffectIntensity(currentSpeed: number): number {
  // Long-distance autopilot warp visual: ramp from 10% to 100% of cruise
  if (longDistanceState.active) {
    return clamp(
      (currentSpeed - LONG_DISTANCE_CRUISE_SPEED * 0.1) /
        (LONG_DISTANCE_CRUISE_SPEED - LONG_DISTANCE_CRUISE_SPEED * 0.1),
      0,
      1,
    );
  }
  return clamp(
    (currentSpeed - AUTOPILOT_WARP_EFFECT_SPEED_METERS_PER_SECOND) /
      (AUTOPILOT_MAX_SPEED_METERS_PER_SECOND - AUTOPILOT_WARP_EFFECT_SPEED_METERS_PER_SECOND),
    0,
    1,
  );
}

// ─── Long-distance autopilot phase state ─────────────────────────────────────

/**
 * Error function approximation (Abramowitz & Stegun 7.1.26, max error ≈ 1.5 × 10⁻⁷).
 */
function approxErf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t + -1.453152027) * t) + 1.421413741) * t + -0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

/**
 * Normalised Gaussian CDF mapping [0, 1] → [0, 1].
 * G(0) = 0, G(0.5) = 0.5, G(1) = 1.
 */
function bellCurveCDF(f: number, k: number): number {
  const ek = approxErf(k);
  return (approxErf(k * (2 * f - 1)) + ek) / (2 * ek);
}

/**
 * Ideal remaining-distance fraction at time-fraction f ∈ [0, 1] for the
 * bell-curve velocity profile `v(t) = v₀ · (1 − G(t/T))`.
 * Returns 1 at f = 0 and 0 at f = 1.
 */
function bellCurveIdealRemaining(f: number, k: number): number {
  const ek = approxErf(k);
  const xi = k * (2 * f - 1);
  // Antiderivative of erf(w): F(w) = w · erf(w) + exp(−w²) / √π
  const Fxi = xi * approxErf(xi) + Math.exp(-xi * xi) / Math.sqrt(Math.PI);
  const Fnk = k * ek + Math.exp(-k * k) / Math.sqrt(Math.PI); // = F(−k)
  const J = (Fxi - Fnk) / (2 * k);
  const I = (f * ek + J) / (2 * ek);
  return clamp(1 - 2 * f + 2 * I, 0, 1);
}

interface LongDistancePhaseState {
  active: boolean;
  phase: 1 | 2 | 3 | 4 | 5;
  phaseElapsed: number;
  /** Speed when entering phase 4 */
  decelEntrySpeed: number;
  /** Locked travel direction during phase 4 (straight line) */
  decelDirection: THREE.Vector3;
  /** Remaining distance recorded at the start of phase 4 */
  decelStartDistance: number;
  /** Ship position when entering phase 4 */
  decelStartPosition: THREE.Vector3;
  /** Point the ship must reach at end of phase 4 (10 km from destination) */
  decelArrivalPoint: THREE.Vector3;
  /** Ship position when entering phase 5 */
  phase5StartPosition: THREE.Vector3;
  /** Exact arrival point for phase 5 (250 m from destination) */
  phase5ArrivalPoint: THREE.Vector3;
  /** Speed when entering phase 5 */
  phase5EntrySpeed: number;
  destinationId: string;
}

const longDistanceState: LongDistancePhaseState = {
  active: false,
  phase: 1,
  phaseElapsed: 0,
  decelEntrySpeed: 0,
  decelDirection: new THREE.Vector3(),
  decelStartDistance: 0,
  decelStartPosition: new THREE.Vector3(),
  decelArrivalPoint: new THREE.Vector3(),
  phase5StartPosition: new THREE.Vector3(),
  phase5ArrivalPoint: new THREE.Vector3(),
  phase5EntrySpeed: 0,
  destinationId: '',
};

function resetLongDistanceState(): void {
  longDistanceState.active = false;
  longDistanceState.phase = 1;
  longDistanceState.phaseElapsed = 0;
  longDistanceState.decelEntrySpeed = 0;
  longDistanceState.decelDirection.set(0, 0, 0);
  longDistanceState.decelStartDistance = 0;
  longDistanceState.decelStartPosition.set(0, 0, 0);
  longDistanceState.decelArrivalPoint.set(0, 0, 0);
  longDistanceState.phase5StartPosition.set(0, 0, 0);
  longDistanceState.phase5ArrivalPoint.set(0, 0, 0);
  longDistanceState.phase5EntrySpeed = 0;
  longDistanceState.destinationId = '';
}

/**
 * Long-distance autopilot (intra-system, distance > 1 000 km).
 *
 * Phase 1 (20 s): Orient toward target & accelerate to 5 km/s.
 * Phase 2 (20 s): Accelerate to Long distance cruise speed (80 c).
 * Phase 3 (cruise): Hold cruise speed until ~240 M km (1.6 AU) from target.
 * Phase 4 (20 s): Bell-curve decelerate to ~10 km from target.
 * Phase 5 (20 s): Constant deceleration over last 10 km, arrive at 250 m threshold.
 */
function updateLongDistanceAutopilot(
  state: LocalGameState,
  dt: number,
  destination: AutopilotDestination,
  destinationLocalPosition: THREE.Vector3,
  distance: number,
  arrivalDistance: number,
  frameOrigin: Vec3Tuple,
): { arrived: boolean; distance: number } {
  const toTarget = destinationLocalPosition.clone().sub(state.shipPosition);
  const targetDirection = toTarget.clone().normalize();

  // Initialise / re-initialise when the destination changes
  if (!longDistanceState.active || longDistanceState.destinationId !== destination.id) {
    resetLongDistanceState();
    longDistanceState.active = true;
    longDistanceState.destinationId = destination.id;
  }

  longDistanceState.phaseElapsed += dt;
  const remainingDistance = Math.max(0, distance - arrivalDistance);

  // ── Compute target speed & direction for the current phase ──────────────
  let targetSpeed = 0;
  let desiredDirection = targetDirection.clone();
  let accelerationRate = 0;

  switch (longDistanceState.phase) {
    case 1: { // Slow acceleration & orientation
      const t = longDistanceState.phaseElapsed;
      accelerationRate = LONG_DISTANCE_PHASE1_TARGET_SPEED / LONG_DISTANCE_PHASE1_DURATION;
      targetSpeed = clamp(accelerationRate * t, 0, LONG_DISTANCE_PHASE1_TARGET_SPEED);

      if (t >= LONG_DISTANCE_PHASE1_DURATION) {
        longDistanceState.phase = 2;
        longDistanceState.phaseElapsed = 0;
      }
      break;
    }
    case 2: { // Fast acceleration to cruise
      const t = longDistanceState.phaseElapsed;
      accelerationRate =
        (LONG_DISTANCE_CRUISE_SPEED - LONG_DISTANCE_PHASE1_TARGET_SPEED) / LONG_DISTANCE_PHASE2_DURATION;
      targetSpeed = clamp(
        LONG_DISTANCE_PHASE1_TARGET_SPEED + accelerationRate * t,
        0,
        LONG_DISTANCE_CRUISE_SPEED,
      );

      // Safety: if remaining distance already requires deceleration, skip to phase 4
      const currentSpeed = state.shipVelocity.length();
      const decelDist = 0.5 * currentSpeed * LONG_DISTANCE_DECEL_DURATION;
      if (remainingDistance <= decelDist && currentSpeed > LONG_DISTANCE_PHASE1_TARGET_SPEED) {
        longDistanceState.phase = 4;
        longDistanceState.phaseElapsed = 0;
        longDistanceState.decelEntrySpeed = currentSpeed;
        longDistanceState.decelDirection.copy(targetDirection);
        longDistanceState.decelStartDistance = Math.max(0, remainingDistance - LONG_DISTANCE_PHASE5_DISTANCE);
        longDistanceState.decelStartPosition.copy(state.shipPosition);
        longDistanceState.decelArrivalPoint.copy(destinationLocalPosition).addScaledVector(targetDirection, -(arrivalDistance + LONG_DISTANCE_PHASE5_DISTANCE));
        // Velocity is NOT zeroed — the new velocity-based phase 4 decelerates
        // from the current speed smoothly.
        return { arrived: false, distance };
      }

      if (t >= LONG_DISTANCE_PHASE2_DURATION) {
        longDistanceState.phase = 3;
        longDistanceState.phaseElapsed = 0;
      }
      break;
    }
    case 3: { // Cruise
      targetSpeed = LONG_DISTANCE_CRUISE_SPEED;
      accelerationRate =
        (LONG_DISTANCE_CRUISE_SPEED - LONG_DISTANCE_PHASE1_TARGET_SPEED) / LONG_DISTANCE_PHASE2_DURATION;

      if (remainingDistance <= LONG_DISTANCE_DECEL_TRIGGER) {
        longDistanceState.phase = 4;
        longDistanceState.phaseElapsed = 0;
        longDistanceState.decelEntrySpeed = state.shipVelocity.length() || LONG_DISTANCE_CRUISE_SPEED;
        longDistanceState.decelDirection.copy(targetDirection);
        longDistanceState.decelStartPosition.copy(state.shipPosition);

        // For planets, target a stopping point 100km above the actual surface radius,
        // rather than the coarse "arrivalDistance" which includes 20% approach buffer.
        const isPlanetDest = (destination.kind === 'planet' || destination.kind === 'moon') && destination.bodyRadius > 0;
        const targetRadius = isPlanetDest ? destination.bodyRadius : arrivalDistance;
        const phase5StartDist = targetRadius + LONG_DISTANCE_PHASE5_DISTANCE;

        longDistanceState.decelStartDistance = Math.max(0, distance - phase5StartDist);
        longDistanceState.decelArrivalPoint.copy(destinationLocalPosition).addScaledVector(targetDirection, -phase5StartDist);
        // Velocity is NOT zeroed — the new velocity-based phase 4 decelerates
        // from the current speed smoothly.
        return { arrived: false, distance };
      }
      break;
    }
    case 4: { // Deceleration — position-interpolated approach
      // Uses ease-out cubic interpolation to move the ship from its current
      // distance to ~100 km from the destination over DECEL_DURATION seconds.
      // This avoids numerical issues of velocity-based braking across the
      // ~7 orders of magnitude speed range (80c → 5 km/s).
      //
      // At the end of the interpolation the velocity is explicitly set to
      // LONG_DISTANCE_PHASE5_MAX_SPEED (5 km/s) for a clean phase 5 handoff.
      const t4 = clamp(longDistanceState.phaseElapsed / LONG_DISTANCE_DECEL_DURATION, 0, 1);

      // Ease-out cubic: f(t) = 1 − (1−t)³.  Starts fast, slows to a stop.
      const oneMinusT = 1 - t4;
      const f = 1 - oneMinusT * oneMinusT * oneMinusT;

      const isPlanetDest = (destination.kind === 'planet' || destination.kind === 'moon') && destination.bodyRadius > 0;
      const targetRadius = isPlanetDest ? destination.bodyRadius : arrivalDistance;
      const phase5StartDist = targetRadius + LONG_DISTANCE_PHASE5_DISTANCE;

      // interpolate the distance offset from the exact position
      const originalDist = longDistanceState.decelStartDistance;
      const currentTargetDist = (1 - f) * originalDist + phase5StartDist;

      // Place ship along the approach line (uses live destinationLocalPosition
      // so frame-origin re-centering is handled automatically).
      state.shipPosition.copy(destinationLocalPosition).addScaledVector(
        targetDirection, -currentTargetDist,
      );

      // Implied velocity from the easing derivative: f'(t_norm) = 3(1−t)²
      const fDeriv = 3 * oneMinusT * oneMinusT;
      const impliedSpeed = originalDist * fDeriv / LONG_DISTANCE_DECEL_DURATION;
      state.shipVelocity.copy(targetDirection).multiplyScalar(
        Math.max(impliedSpeed, LONG_DISTANCE_PHASE5_MAX_SPEED),
      );

      // Orient toward destination
      const decelRotation = createShipFacingQuaternion(targetDirection);
      state.shipAngularVelocity.set(0, 0, 0);
      state.shipRotation.rotateTowards(decelRotation, 0.3 * dt);
      state.rotation.copy(state.shipRotation);
      state.autopilotDirection.copy(targetDirection);

      state.position.copy(state.shipPosition);
      state.velocity.copy(state.shipVelocity);

      // Transition to phase 5 when the easing completes
      if (t4 >= 1) {
        state.shipVelocity.copy(targetDirection).multiplyScalar(LONG_DISTANCE_PHASE5_MAX_SPEED);
        state.velocity.copy(state.shipVelocity);
        longDistanceState.phase = 5;
        longDistanceState.phaseElapsed = 0;
        longDistanceState.phase5StartPosition.copy(state.shipPosition);
        const toTargetNow = destinationLocalPosition.clone().sub(state.shipPosition).normalize();
        longDistanceState.phase5ArrivalPoint.copy(destinationLocalPosition).addScaledVector(toTargetNow, -targetRadius);
      }

      return { arrived: false, distance };
    }
    case 5: { // Final approach — terrain-tracking descent
      // Use the REAL planet center and radius from the destination's bodyCenter/bodyRadius.
      const isPlanetDest = (destination.kind === 'planet' || destination.kind === 'moon') && destination.bodyRadius > 0;

      let planetCenter5: THREE.Vector3;
      let planetRadius5: number;
      let planetId5: string;
      if (isPlanetDest) {
        planetCenter5 = vectorFromTuple(toFrameLocalPosition(destination.bodyCenter, frameOrigin));
        planetRadius5 = destination.bodyRadius;
        planetId5 = destination.id;
      } else {
        // Non-planet target: just drive straight to destination
        const toDest = destinationLocalPosition.clone().sub(state.shipPosition);
        const distToDest = toDest.length();
        if (distToDest <= arrivalDistance + 1) {
          state.shipVelocity.set(0, 0, 0);
          state.shipAngularVelocity.set(0, 0, 0);
          state.position.copy(state.shipPosition);
          state.velocity.copy(state.shipVelocity);
          state.rotation.copy(state.shipRotation);
          resetLongDistanceState();
          return { arrived: true, distance: distToDest };
        }
        const speed5 = Math.min(distToDest / 10, LONG_DISTANCE_PHASE5_MAX_SPEED);
        const dir5 = toDest.normalize();
        state.shipVelocity.copy(dir5).multiplyScalar(speed5);
        state.shipPosition.addScaledVector(state.shipVelocity, dt);
        state.position.copy(state.shipPosition);
        state.velocity.copy(state.shipVelocity);
        const decelRot5 = createShipFacingQuaternion(dir5);
        state.shipAngularVelocity.set(0, 0, 0);
        state.shipRotation.rotateTowards(decelRot5, 1.0 * dt);
        state.rotation.copy(state.shipRotation);
        return { arrived: false, distance: distToDest };
      }

      // ── Realtime terrain-altitude query ─────────────────────────────────
      const radial5 = state.shipPosition.clone().sub(planetCenter5);
      const radialDist5 = radial5.length();
      if (radialDist5 < 1e-6) return { arrived: false, distance };
      const radialDir5 = radial5.clone().divideScalar(radialDist5);

      const terrainAlt5 = getTerrainAltitudeAtPosition(state.shipPosition, planetCenter5, planetRadius5, planetId5);
      const shipAlt5 = radialDist5 - terrainAlt5; // altitude above terrain

      // ── Arrival: stop at 1 km above terrain & disengage autopilot ──────
      if (shipAlt5 <= LONG_DISTANCE_PHASE5_STOP_ALT) {
        // Place ship exactly at stop altitude
        state.shipPosition.copy(planetCenter5).addScaledVector(radialDir5, terrainAlt5 + LONG_DISTANCE_PHASE5_STOP_ALT);
        state.shipVelocity.set(0, 0, 0);
        state.shipAngularVelocity.set(0, 0, 0);
        state.position.copy(state.shipPosition);
        state.velocity.copy(state.shipVelocity);
        state.rotation.copy(state.shipRotation);
        resetLongDistanceState();
        return { arrived: true, distance: 0 };
      }

      // ── Speed profile: v = sqrt(2·a·(alt - stopAlt)) ──────────────────
      // Decelerates from PHASE5_MAX_SPEED at ~100 km to 0 at 1 km altitude.
      // a = PHASE5_MAX_SPEED² / (2 · (PHASE5_DISTANCE - STOP_ALT))
      const altAboveStop = shipAlt5 - LONG_DISTANCE_PHASE5_STOP_ALT;
      const phase5Range = LONG_DISTANCE_PHASE5_DISTANCE - LONG_DISTANCE_PHASE5_STOP_ALT;
      const phase5BrakeAccel = (LONG_DISTANCE_PHASE5_MAX_SPEED * LONG_DISTANCE_PHASE5_MAX_SPEED) / (2 * phase5Range);
      const descentSpeed5 = clamp(
        Math.sqrt(Math.max(0, 2 * phase5BrakeAccel * altAboveStop)),
        0,
        LONG_DISTANCE_PHASE5_MAX_SPEED,
      );

      // ── Drive direction: toward planet center (down) ────────────────────
      const driveDir5 = radialDir5.clone().negate();

      // ── Horizontal correction toward surface target ─────────────────────
      const toDestHoriz = destinationLocalPosition.clone().sub(state.shipPosition);
      toDestHoriz.addScaledVector(radialDir5, -toDestHoriz.dot(radialDir5));
      const horizDist5 = toDestHoriz.length();
      let blendedDir5 = driveDir5.clone();
      if (horizDist5 > 5) {
        const correctionStrength = clamp(horizDist5 / 500, 0, 0.3);
        blendedDir5.addScaledVector(toDestHoriz.normalize(), correctionStrength).normalize();
      }

      // ── Orient ship: gradually level out (belly toward planet) ──────────
      const decelRotation5 = createShipFacingQuaternion(blendedDir5);
      const toCenter5 = planetCenter5.clone().sub(state.shipPosition).normalize();
      const fwd5 = blendedDir5.clone();
      fwd5.addScaledVector(toCenter5, -fwd5.dot(toCenter5)).normalize();
      if (fwd5.lengthSq() > 0.01) {
        const horizontalMatrix5 = new THREE.Matrix4().lookAt(
          new THREE.Vector3(0, 0, 0), fwd5, toCenter5.clone().negate(),
        );
        const horizontalQuat5 = new THREE.Quaternion().setFromRotationMatrix(horizontalMatrix5);
        const f5blend = clamp(1 - shipAlt5 / LONG_DISTANCE_PHASE5_DISTANCE, 0, 1);
        decelRotation5.slerp(horizontalQuat5, f5blend);
      }
      state.shipAngularVelocity.set(0, 0, 0);
      state.shipRotation.rotateTowards(decelRotation5, 1.5 * dt);
      state.rotation.copy(state.shipRotation);
      state.autopilotDirection.copy(blendedDir5);

      // ── Apply actual speed — limit frame-step so the ship can't overshoot ──
      const maxFrameStep5 = shipAlt5 * 0.5; // never move more than half the remaining altitude
      const actualSpeed5 = Math.min(descentSpeed5, maxFrameStep5 / Math.max(dt, 1e-6));
      state.shipVelocity.copy(blendedDir5).multiplyScalar(actualSpeed5);
      state.shipPosition.addScaledVector(state.shipVelocity, dt);

      // Clamp to terrain to prevent sinking through the surface
      clampBodyToTerrain(state.shipPosition, state.shipVelocity, planetCenter5, planetRadius5, planetId5, SHIP_LANDING_GEAR_HEIGHT);

      state.position.copy(state.shipPosition);
      state.velocity.copy(state.shipVelocity);

      return { arrived: false, distance: shipAlt5 };
    }
  }

  // ── Orient the ship ─────────────────────────────────────────────────────
  const desiredRotation = createShipFacingQuaternion(desiredDirection);
  state.shipAngularVelocity.set(0, 0, 0);
  // Phase 1 uses a higher turn rate for initial orientation
  const turnRate = longDistanceState.phase === 1 ? 0.5 : 0.22;
  state.shipRotation.rotateTowards(desiredRotation, turnRate * dt);
  state.rotation.copy(state.shipRotation);
  state.autopilotDirection.copy(desiredDirection);

  // ── Apply velocity along ship forward axis ──────────────────────────────
  const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.shipRotation);

  // Throttle by heading alignment during orient / accel phases so the ship
  // doesn't shoot sideways while still turning.
  if (longDistanceState.phase <= 3) {
    const alignment = Math.max(0, currentForward.dot(desiredDirection));
    targetSpeed *= clamp(alignment * alignment, 0.005, 1);
  }

  const forwardScalar = state.shipVelocity.dot(currentForward);
  const lateralVelocity = state.shipVelocity.clone().sub(currentForward.clone().multiplyScalar(forwardScalar));
  lateralVelocity.multiplyScalar(Math.max(0, 1 - 2.0 * dt)); // damp lateral drift

  let nextForward: number;
  if (targetSpeed >= forwardScalar) {
    const maxStep = (accelerationRate > 0 ? accelerationRate : (LONG_DISTANCE_CRUISE_SPEED / LONG_DISTANCE_PHASE2_DURATION)) * dt;
    nextForward = Math.min(targetSpeed, forwardScalar + maxStep);
  } else {
    const decelRate = longDistanceState.decelEntrySpeed > 0
      ? longDistanceState.decelEntrySpeed / LONG_DISTANCE_DECEL_DURATION
      : LONG_DISTANCE_CRUISE_SPEED / LONG_DISTANCE_DECEL_DURATION;
    nextForward = Math.max(targetSpeed, forwardScalar - decelRate * dt);
  }

  state.shipVelocity.copy(lateralVelocity).addScaledVector(currentForward, Math.max(0, nextForward));

  // ── Move the ship ──────────────────────────────────────────────────────
  state.shipPosition.addScaledVector(state.shipVelocity, dt);
  state.position.copy(state.shipPosition);
  state.velocity.copy(state.shipVelocity);

  return { arrived: false, distance };
}

function estimateAutopilotEtaSeconds(
  distanceToDestination: number,
  approachRadius: number,
  currentSpeed: number,
  isInterSystem: boolean,
): number {
  const arrivalDistance = Math.max(
    AUTOPILOT_REACH_DISTANCE_METERS,
    approachRadius + AUTOPILOT_TARGET_SURFACE_BUFFER_METERS,
  );
  let remainingDistance = Math.max(0, distanceToDestination - arrivalDistance);

  if (remainingDistance <= 0) {
    return 0;
  }

  // ── Long-distance ETA (phase-aware) ─────────────────────────────────────
  if (!isInterSystem && longDistanceState.active) {
    const phase = longDistanceState.phase;
    const pe = longDistanceState.phaseElapsed;
    let eta = 0;
    let dist = remainingDistance;
    let speed = currentSpeed;

    // Time left in current phase
    if (phase === 1) {
      const tLeft1 = Math.max(0, LONG_DISTANCE_PHASE1_DURATION - pe);
      const accel1 = LONG_DISTANCE_PHASE1_TARGET_SPEED / LONG_DISTANCE_PHASE1_DURATION;
      const dPhase1 = speed * tLeft1 + 0.5 * accel1 * tLeft1 * tLeft1;
      eta += tLeft1;
      dist -= dPhase1;
      speed = LONG_DISTANCE_PHASE1_TARGET_SPEED;

      // Phase 2
      const accel2 = (LONG_DISTANCE_CRUISE_SPEED - LONG_DISTANCE_PHASE1_TARGET_SPEED) / LONG_DISTANCE_PHASE2_DURATION;
      const dPhase2 = speed * LONG_DISTANCE_PHASE2_DURATION + 0.5 * accel2 * LONG_DISTANCE_PHASE2_DURATION * LONG_DISTANCE_PHASE2_DURATION;
      eta += LONG_DISTANCE_PHASE2_DURATION;
      dist -= dPhase2;
      speed = LONG_DISTANCE_CRUISE_SPEED;
    } else if (phase === 2) {
      const tLeft2 = Math.max(0, LONG_DISTANCE_PHASE2_DURATION - pe);
      const accel2 = (LONG_DISTANCE_CRUISE_SPEED - LONG_DISTANCE_PHASE1_TARGET_SPEED) / LONG_DISTANCE_PHASE2_DURATION;
      const dPhase2 = speed * tLeft2 + 0.5 * accel2 * tLeft2 * tLeft2;
      eta += tLeft2;
      dist -= dPhase2;
      speed = LONG_DISTANCE_CRUISE_SPEED;
    }

    if (phase <= 3) {
      // Cruise distance = remaining minus decel distance minus phase5 distance
      const decelDist = 0.5 * speed * LONG_DISTANCE_DECEL_DURATION;
      const cruiseDist = Math.max(0, dist - decelDist - LONG_DISTANCE_PHASE5_DISTANCE);
      if (cruiseDist > 0) {
        eta += cruiseDist / speed;
        dist -= cruiseDist;
      }
      // Decel phase (bell-curve)
      eta += LONG_DISTANCE_DECEL_DURATION;
      // Phase 5 (final approach, realtime terrain descent — estimate ~LAND_ALT/0.5s + decel from MAX_SPEED)
      eta += LONG_DISTANCE_PHASE5_DISTANCE / (LONG_DISTANCE_PHASE5_MAX_SPEED * 0.5);
    } else if (phase === 4) {
      // Still in bell-curve decel
      const tLeft4 = Math.max(0, LONG_DISTANCE_DECEL_DURATION - pe);
      eta += tLeft4;
      eta += LONG_DISTANCE_PHASE5_DISTANCE / (LONG_DISTANCE_PHASE5_MAX_SPEED * 0.5);
    } else {
      // Phase 5: estimate remaining descent time from current altitude (approximation)
      eta += dist / (LONG_DISTANCE_PHASE5_MAX_SPEED * 0.5);
    }
    return Math.max(0, eta);
  }

  const cruise = isInterSystem ? AUTOPILOT_INTERSTELLAR_CRUISE_SPEED : AUTOPILOT_LOCAL_CRUISE_SPEED;
  let simulatedSpeed = Math.max(0, currentSpeed);
  let elapsed = 0;

  for (let step = 0; step < AUTOPILOT_ETA_MAX_SIMULATION_STEPS && remainingDistance > 0; step += 1) {
    const dt =
      simulatedSpeed > AUTOPILOT_WARP_EFFECT_SPEED_METERS_PER_SECOND * 0.5
        ? 0.25
        : AUTOPILOT_ETA_SIMULATION_STEP_SECONDS;
    const targetSpeed = getAutopilotTargetSpeed(remainingDistance + arrivalDistance, arrivalDistance, isInterSystem);
    const accelerating = targetSpeed >= simulatedSpeed;
    const maxVelocityStep =
      (accelerating ? getAutopilotAcceleration(isInterSystem, simulatedSpeed) : getAutopilotBrakeDeceleration(isInterSystem)) * dt;
    const speedDelta = targetSpeed - simulatedSpeed;

    if (Math.abs(speedDelta) <= maxVelocityStep) {
      simulatedSpeed = targetSpeed;
    } else {
      simulatedSpeed += Math.sign(speedDelta) * maxVelocityStep;
    }

    simulatedSpeed = clamp(simulatedSpeed, 0, cruise);

    if (isInterSystem && simulatedSpeed >= cruise * 0.999 && targetSpeed >= cruise * 0.999) {
      // Skip ahead through the interstellar cruise phase in one step
      const brakingDistance = getAutopilotBrakingDistance();
      const skipThreshold = Math.max(brakingDistance, AUTOPILOT_LOCAL_RANGE_THRESHOLD_METERS);
      if (remainingDistance > skipThreshold + cruise * 2) {
        const cruiseDistance = remainingDistance - skipThreshold;
        elapsed += cruiseDistance / simulatedSpeed;
        remainingDistance = skipThreshold;
        continue;
      }
    }

    remainingDistance = Math.max(0, remainingDistance - simulatedSpeed * dt);
    elapsed += dt;
  }

  return remainingDistance <= 0 ? elapsed : elapsed + remainingDistance / Math.max(simulatedSpeed, 1);
}

function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return 'Arriving';
  }

  if (seconds < 10) {
    return `${seconds.toFixed(1)}s`;
  }

  const rounded = Math.ceil(seconds);
  const minutes = Math.floor(rounded / 60);
  const secs = rounded % 60;

  if (minutes <= 0) {
    return `${rounded}s`;
  }

  return secs === 0 ? `${minutes}m` : `${minutes}m ${secs}s`;
}

function formatNumberSpacing(numStr: string): string {
  const parts = numStr.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return parts.join('.');
}

function formatDistance(distance: number): string {
  if (distance >= 149_597_870_700 * 0.1) {
    return `${formatNumberSpacing((distance / 149_597_870_700).toFixed(1))} AU`;
  }
  if (distance >= 1000) {
    return `${formatNumberSpacing((distance / 1000).toFixed(1))} km`;
  }
  return `${formatNumberSpacing(distance.toFixed(0))} m`;
}

function formatSpeed(speed: number): string {
  if (speed >= METERS_PER_LIGHT_YEAR * 0.001) {
    return `${formatNumberSpacing((speed / METERS_PER_LIGHT_YEAR).toFixed(4))} ly/s`;
  }
  if (speed >= 299_792_458) {
    return `${formatNumberSpacing((speed / 299_792_458).toFixed(1))} c`;
  }
  if (speed >= 1000) {
    return `${formatNumberSpacing((speed / 1000).toFixed(1))} km/s`;
  }

  return `${formatNumberSpacing(speed.toFixed(1))} m/s`;
}

function createShipFacingQuaternion(forward: THREE.Vector3): THREE.Quaternion {
  const safeForward = forward.lengthSq() > 1e-8 ? forward.clone().normalize() : new THREE.Vector3(0, 0, -1);
  const zAxis = safeForward.clone().multiplyScalar(-1);
  let xAxis = new THREE.Vector3(0, 1, 0).cross(zAxis);

  if (xAxis.lengthSq() < 1e-8) {
    xAxis = new THREE.Vector3(1, 0, 0).cross(zAxis);
  }

  xAxis.normalize();
  const yAxis = zAxis.clone().cross(xAxis).normalize();

  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
}

function projectVectorOntoPlane(vector: THREE.Vector3, planeNormal: THREE.Vector3): THREE.Vector3 {
  return vector.sub(planeNormal.clone().multiplyScalar(vector.dot(planeNormal)));
}

function getPreferredClearanceDirection(
  pathDirection: THREE.Vector3,
  toObstacle: THREE.Vector3,
  shipVelocity: THREE.Vector3,
): THREE.Vector3 {
  const lateralVelocity = projectVectorOntoPlane(shipVelocity.clone(), pathDirection);
  let preferred = lateralVelocity.lengthSq() > 1e-6 ? lateralVelocity.normalize() : projectVectorOntoPlane(new THREE.Vector3(0, 1, 0), pathDirection);

  if (preferred.lengthSq() < 1e-6) {
    preferred = projectVectorOntoPlane(new THREE.Vector3(1, 0, 0), pathDirection);
  }

  if (preferred.lengthSq() < 1e-6) {
    preferred = new THREE.Vector3(1, 0, 0);
  }

  preferred.normalize();

  if (preferred.dot(toObstacle) > 0) {
    preferred.multiplyScalar(-1);
  }

  return preferred;
}

function buildLocalAutopilotPlan(
  state: LocalGameState,
  targetDirection: THREE.Vector3,
  remainingDistance: number,
  destination: AutopilotDestination,
  frameOrigin: Vec3Tuple,
  obstacles: AutopilotObstacle[],
): LocalAutopilotPlan {
  const currentSpeed = state.shipVelocity.length();
  const lookaheadDistance = clamp(
    Math.max(
      AUTOPILOT_LOCAL_LOOKAHEAD_MIN,
      currentSpeed * 4.5,
      remainingDistance * 0.7,
    ),
    AUTOPILOT_LOCAL_LOOKAHEAD_MIN,
    AUTOPILOT_LOCAL_LOOKAHEAD_MAX,
  );
  const steering = new THREE.Vector3();
  let speedCap = AUTOPILOT_LOCAL_CRUISE_SPEED;

  obstacles.forEach((obstacle) => {
    if (obstacle.id === destination.id) {
      return;
    }

    const obstacleLocalPosition = vectorFromTuple(toFrameLocalPosition(obstacle.position, frameOrigin));
    const toObstacle = obstacleLocalPosition.sub(state.shipPosition);
    const alongPath = toObstacle.dot(targetDirection);

    if (alongPath <= -obstacle.radius || alongPath >= lookaheadDistance + obstacle.radius) {
      return;
    }

    const corridorOffset = toObstacle.clone().sub(targetDirection.clone().multiplyScalar(alongPath));
    const dynamicBuffer =
      AUTOPILOT_LOCAL_CLEARANCE_BUFFER_METERS +
      Math.min(1_200, currentSpeed * 0.45) +
      obstacle.radius * 0.25;
    const influenceRadius = obstacle.radius + dynamicBuffer;
    const lateralDistance = corridorOffset.length();
    const conflict = clamp(1 - lateralDistance / influenceRadius, 0, 1);

    if (conflict <= 0) {
      return;
    }

    const forwardWeight = clamp(1 - Math.max(alongPath, 0) / (lookaheadDistance + influenceRadius), 0, 1);
    const urgency = conflict * Math.sqrt(forwardWeight);
    let clearanceDirection = corridorOffset.lengthSq() > 1e-6
      ? corridorOffset.normalize().multiplyScalar(-1)
      : getPreferredClearanceDirection(targetDirection, toObstacle, state.shipVelocity);

    if (clearanceDirection.lengthSq() < 1e-6) {
      clearanceDirection = getPreferredClearanceDirection(targetDirection, toObstacle, state.shipVelocity);
    }

    const bypassOffset = influenceRadius + Math.min(1_400, currentSpeed * 0.6 + obstacle.radius * 0.3);
    const forwardLead = Math.min(Math.max(obstacle.radius * 0.5, 80), 650);
    const bypassPoint = obstacleLocalPosition
      .clone()
      .addScaledVector(clearanceDirection, bypassOffset)
      .addScaledVector(targetDirection, forwardLead);
    const bypassDirection = bypassPoint.sub(state.shipPosition);

    if (bypassDirection.lengthSq() > 1e-6) {
      bypassDirection.normalize();
      const obstacleWeight = obstacle.kind === 'asteroid' ? 1.7 : obstacle.kind === 'moon' ? 1.25 : 1.05;
      steering.addScaledVector(bypassDirection, urgency * obstacleWeight);
    }

    if (conflict > 0.35) {
      const forwardClearance = Math.max(0, alongPath - influenceRadius * 0.65);
      const obstacleSpeedCap = Math.min(
        Math.sqrt(2 * AUTOPILOT_LOCAL_MAX_BRAKE_DECELERATION * forwardClearance) * 0.78,
        forwardClearance / 2.1,
      );
      speedCap = Math.min(speedCap, Math.max(AUTOPILOT_LOCAL_MIN_SPEED * 1.5, obstacleSpeedCap));
    }

    if (toObstacle.length() < obstacle.radius + AUTOPILOT_LOCAL_CLEARANCE_BUFFER_METERS) {
      speedCap = Math.min(speedCap, AUTOPILOT_LOCAL_MIN_SPEED * 1.2);
      steering.addScaledVector(clearanceDirection, 1.8 * urgency);
    }
  });

  const desiredDirection = targetDirection.clone();
  if (steering.lengthSq() > 1e-8) {
    desiredDirection.addScaledVector(steering, AUTOPILOT_LOCAL_AVOIDANCE_WEIGHT).normalize();
  }

  return {
    desiredDirection,
    speedCap,
  };
}

function getAutopilotTurnRate(isInterSystem: boolean): number {
  return isInterSystem ? AUTOPILOT_INTERSTELLAR_TURN_RATE : AUTOPILOT_LOCAL_TURN_RATE;
}

function smoothAutopilotDirection(
  currentDirection: THREE.Vector3,
  desiredDirection: THREE.Vector3,
  dt: number,
): THREE.Vector3 {
  const safeCurrent = currentDirection.lengthSq() > 1e-8 ? currentDirection.clone().normalize() : desiredDirection.clone();
  const blend = 1 - Math.exp(-AUTOPILOT_LOCAL_PATH_SMOOTHING * dt);
  return safeCurrent.lerp(desiredDirection, blend).normalize();
}

function findAutopilotCollisionOnSegment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  destination: AutopilotDestination,
  frameOrigin: Vec3Tuple,
  obstacles: AutopilotObstacle[],
): AutopilotCollisionResult | null {
  const delta = end.clone().sub(start);
  const lengthSq = delta.lengthSq();

  if (lengthSq <= 1e-8) {
    return null;
  }

  let nearestHit: AutopilotCollisionResult | null = null;

  obstacles.forEach((obstacle) => {
    if (obstacle.id === destination.id) {
      return;
    }

    const obstacleLocalPosition = vectorFromTuple(toFrameLocalPosition(obstacle.position, frameOrigin));
    const effectiveRadius = obstacle.radius + AUTOPILOT_LOCAL_COLLISION_MARGIN_METERS;
    const projectedT = clamp(obstacleLocalPosition.clone().sub(start).dot(delta) / lengthSq, 0, 1);
    const closestPoint = start.clone().addScaledVector(delta, projectedT);
    const fromCenter = closestPoint.clone().sub(obstacleLocalPosition);
    const centerDistance = fromCenter.length();

    if (centerDistance >= effectiveRadius) {
      return;
    }

    let normal = centerDistance > 1e-6
      ? fromCenter.multiplyScalar(1 / centerDistance)
      : start.clone().sub(obstacleLocalPosition).normalize();

    if (normal.lengthSq() < 1e-6) {
      normal = delta.clone().normalize().multiplyScalar(-1);
    }

    if (!nearestHit || projectedT < nearestHit.travelFraction) {
      nearestHit = {
        obstacleLocalPosition,
        obstacleRadius: effectiveRadius,
        normal,
        travelFraction: projectedT,
      };
    }
  });

  return nearestHit;
}

function updateAutopilotShip(
  state: LocalGameState,
  dt: number,
  destination: AutopilotDestination,
  frameOrigin: Vec3Tuple,
  obstacles: AutopilotObstacle[],
  sceneColliders: SceneCollider[],
): { arrived: boolean; distance: number } {
  const isInterSystem = destination.systemId !== state.frameSystemId;
  // For inter-system travel the localPosition is in the *destination* system's frame and is
  // meaningless here. Use the precomputed interstellarWaypoint (a real far-away point in the
  // departure system's coordinate space) instead.
  const destinationLocalPosition = (isInterSystem && destination.interstellarWaypoint)
    ? vectorFromTuple(destination.interstellarWaypoint)
    : vectorFromTuple(toFrameLocalPosition(destination.localPosition, frameOrigin));
  const toTarget = destinationLocalPosition.clone().sub(state.shipPosition);
  const distance = toTarget.length();
  // For waypoint-based interstellar trips the waypoint is a virtual trigger point —
  // not a physical object. Use a flat generous radius so the arrival fires reliably
  // inside the kinematic deceleration curve, and the physical approach radius of the
  // real destination (which may be star-sized) is irrelevant here.
  const arrivalDistance = destination.interstellarWaypoint
    ? AUTOPILOT_WARP_ARRIVAL_RADIUS
    : Math.max(
        AUTOPILOT_REACH_DISTANCE_METERS,
        destination.approachRadius + AUTOPILOT_TARGET_SURFACE_BUFFER_METERS,
      );
  const remainingDistance = Math.max(0, distance - arrivalDistance);
  const currentSpeed = state.shipVelocity.length();

  // ── Long-distance autopilot: intra-system trips longer than 1 000 km ───
  // Check long-distance BEFORE the general arrival gate so that phase-5
  // terrain-tracking descent is never short-circuited by the coarse
  // distance <= arrivalDistance test (which doesn't account for terrain).
  if (!isInterSystem && (distance > LONG_DISTANCE_THRESHOLD_METERS || longDistanceState.active)) {
    return updateLongDistanceAutopilot(state, dt, destination, destinationLocalPosition, distance, arrivalDistance, frameOrigin);
  }

  if (distance <= arrivalDistance) {
    state.shipVelocity.set(0, 0, 0);
    state.shipAngularVelocity.set(0, 0, 0);
    state.position.copy(state.shipPosition);
    state.velocity.copy(state.shipVelocity);
    state.rotation.copy(state.shipRotation);
    resetLongDistanceState();
    return { arrived: true, distance };
  }

  const targetDirection = toTarget.clone().normalize();
  const acceleration = getAutopilotAcceleration(isInterSystem, currentSpeed);
  const brakeDeceleration = getAutopilotBrakeDeceleration(isInterSystem);
  let absoluteTargetSpeed = getAutopilotTargetSpeed(distance, arrivalDistance, isInterSystem);
  let desiredDirection = targetDirection.clone();

  if (!isInterSystem) {
    const localPlan = buildLocalAutopilotPlan(state, targetDirection, remainingDistance, destination, frameOrigin, obstacles);
    desiredDirection = smoothAutopilotDirection(state.autopilotDirection, localPlan.desiredDirection, dt);
    state.autopilotDirection.copy(desiredDirection);
    absoluteTargetSpeed = Math.min(absoluteTargetSpeed, localPlan.speedCap);
  } else {
    state.autopilotDirection.copy(targetDirection);
  }

  const lookDirection = currentSpeed > 4 && !isInterSystem
    ? desiredDirection.clone().lerp(state.shipVelocity.clone().normalize(), 0.25).normalize()
    : desiredDirection;
  const desiredRotation = createShipFacingQuaternion(lookDirection);
  state.shipAngularVelocity.set(0, 0, 0);
  state.shipRotation.rotateTowards(desiredRotation, getAutopilotTurnRate(isInterSystem) * dt);
  state.rotation.copy(state.shipRotation);

  if (isInterSystem && destination.interstellarArrivalAt) {
    const timeLeft = (destination.interstellarArrivalAt - performance.now()) / 1000;
    const cruiseSpeedCap = getAutopilotCruiseSpeed(isInterSystem);
    const brakingTime = cruiseSpeedCap / brakeDeceleration;
    if (timeLeft < brakingTime) {
      absoluteTargetSpeed = Math.min(absoluteTargetSpeed, brakeDeceleration * Math.max(0, timeLeft));
    }
  }

  const cruiseSpeedCap = getAutopilotCruiseSpeed(isInterSystem);
  if (isInterSystem) {
    const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.shipRotation);
    const headingAlignment = Math.max(0, currentForward.dot(desiredDirection));
    const throttlingFactor = headingAlignment * headingAlignment * headingAlignment * headingAlignment;
    const targetSpeed = absoluteTargetSpeed * Math.max(0.005, throttlingFactor);
    const forwardScalar = state.shipVelocity.dot(currentForward);
    const forwardVelocity = currentForward.clone().multiplyScalar(forwardScalar);
    const lateralVelocity = state.shipVelocity.clone().sub(forwardVelocity).multiplyScalar(Math.max(0, 1 - 1.5 * dt));

    let nextForwardScalar = forwardScalar;
    if (targetSpeed < forwardScalar) {
      nextForwardScalar = Math.max(targetSpeed, forwardScalar - brakeDeceleration * dt);
    } else {
      nextForwardScalar = Math.min(targetSpeed, forwardScalar + acceleration * dt);
    }

    state.shipVelocity.copy(lateralVelocity).add(currentForward.clone().multiplyScalar(Math.max(0, nextForwardScalar)));
  } else {
    absoluteTargetSpeed = Math.min(absoluteTargetSpeed, cruiseSpeedCap);

    const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.shipRotation);
    const headingAlignment = Math.max(0, currentForward.dot(desiredDirection));
    absoluteTargetSpeed *= Math.max(0.05, headingAlignment * headingAlignment);

    const desiredVelocity = desiredDirection.clone().multiplyScalar(absoluteTargetSpeed);
    const velocityError = desiredVelocity.sub(state.shipVelocity);

    if (velocityError.lengthSq() > 1e-8) {
      const accelerating = desiredVelocity.lengthSq() >= state.shipVelocity.lengthSq();
      const responseTime = accelerating
        ? clamp(AUTOPILOT_LOCAL_VELOCITY_RESPONSE_SECONDS + currentSpeed / 4_000, 0.9, 1.8)
        : 0.1;
      const requestedAcceleration = velocityError.multiplyScalar(1 / responseTime);
      requestedAcceleration.clampLength(0, accelerating ? acceleration : brakeDeceleration);
      state.shipVelocity.addScaledVector(requestedAcceleration, dt);
    }
  }

  if (state.shipVelocity.length() > cruiseSpeedCap) {
    state.shipVelocity.setLength(cruiseSpeedCap);
  }

  if (isInterSystem && state.shipVelocity.length() * dt > remainingDistance && remainingDistance > 0) {
    const safeVelocity = remainingDistance / dt;
    state.shipVelocity.setLength(safeVelocity);
  }

  if (!isInterSystem) {
    moveBodyWithSceneColliders(state.shipPosition, state.shipVelocity, dt, SHIP_COLLISION_RADIUS, sceneColliders, [destination.id]);
  } else {
    state.shipPosition.addScaledVector(state.shipVelocity, dt);
  }

  state.position.copy(state.shipPosition);
  state.velocity.copy(state.shipVelocity);
  return { arrived: false, distance };
}

function settleShipVelocity(
  state: LocalGameState,
  dt: number,
  sceneColliders?: SceneCollider[],
  linearDampingMultiplier = 1,
): void {
  integrateShipAngularVelocity(state, dt, SHIP_MANUAL_ANGULAR_DAMPING);
  const shipDampFactor = Math.max(0, 1 - SHIP_LINEAR_DAMPING * linearDampingMultiplier * dt);
  state.shipVelocity.multiplyScalar(shipDampFactor);
  if (state.shipVelocity.length() < 0.2) {
    state.shipVelocity.set(0, 0, 0);
  }
  if (sceneColliders) {
    moveBodyWithSceneColliders(state.shipPosition, state.shipVelocity, dt, SHIP_COLLISION_RADIUS, sceneColliders);
  } else {
    state.shipPosition.addScaledVector(state.shipVelocity, dt);
  }
  state.position.copy(state.shipPosition);
  state.velocity.copy(state.shipVelocity);
  state.rotation.copy(state.shipRotation);
}

function createLocalState(frameSystemId: string): LocalGameState {
  return {
    frameSystemId,
    frameOrigin: new THREE.Vector3(0, 0, 0),
    mode: 'space',
    insideShip: false,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Quaternion(),
    autopilotDirection: new THREE.Vector3(0, 0, -1),
    shipPosition: new THREE.Vector3(SHIP_SPAWN_OFFSET_METERS, 0, 0),
    shipVelocity: new THREE.Vector3(0, 0, 0),
    shipAngularVelocity: new THREE.Vector3(0, 0, 0),
    shipRotation: new THREE.Quaternion(),
    interiorPosition: new THREE.Vector3(0, SHIP_INTERIOR_FLOOR_HEIGHT_METERS, 2.5),
    interiorVelocity: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    pitch: 0,
    lastNetworkAt: 0,
    lastHudAt: 0,
    nearPlanetId: '',
    nearPlanetCenter: new THREE.Vector3(),
    nearPlanetRadius: 0,
    shipOnGround: false,
    playerOnGround: false,
    shipBraking: false,
  };
}

function createRandomStationSpawnOffset(maxRadius = 500): THREE.Vector3 {
  const minPolarAngleFromUp = THREE.MathUtils.degToRad(40);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const radius = Math.cbrt(Math.random()) * maxRadius;
    const azimuth = Math.random() * Math.PI * 2;
    const polarFromUp = minPolarAngleFromUp + Math.random() * (Math.PI / 2 - minPolarAngleFromUp);
    const sinPolar = Math.sin(polarFromUp);
    const cosPolar = Math.cos(polarFromUp);

    const offset = new THREE.Vector3(
      Math.cos(azimuth) * radius * sinPolar,
      radius * cosPolar,
      Math.sin(azimuth) * radius * sinPolar,
    );

    if (offset.y >= 0) {
      return offset;
    }
  }

  return new THREE.Vector3(maxRadius * 0.5, maxRadius * 0.2, 0);
}

function initializeHomeSpawnState(state: LocalGameState, homeSystemId: string, homeStationPosition: Vec3Tuple, shipConfig: ShipConfig): void {
  const spawnOffset = createRandomStationSpawnOffset(500);

  state.frameSystemId = homeSystemId;
  state.frameOrigin.set(...homeStationPosition);
  state.mode = 'interior';
  state.insideShip = true;
  state.position.copy(spawnOffset);
  state.velocity.set(0, 0, 0);
  state.rotation.identity();
  state.shipPosition.copy(spawnOffset);
  state.shipVelocity.set(0, 0, 0);
  state.shipAngularVelocity.set(0, 0, 0);
  state.shipRotation.identity();
  state.interiorPosition.copy(shipConfig.insideSpawnVec);
  state.interiorVelocity.set(0, 0, 0);
  state.yaw = 0;
  state.pitch = 0;
  state.lastHudAt = 0;
  state.lastNetworkAt = 0;
}

function hydrateLocalState(target: LocalGameState, snapshot: PlayerSnapshot): void {
  target.frameSystemId = snapshot.frameSystemId;
  target.frameOrigin.set(...snapshot.frameOrigin);
  target.mode = snapshot.mode;
  target.insideShip = snapshot.insideShip;
  target.position.set(...snapshot.position);
  target.velocity.set(...snapshot.velocity);
  target.rotation.set(...snapshot.rotation);
  target.shipPosition.set(...snapshot.ship.position);
  target.shipVelocity.set(...snapshot.ship.velocity);
  target.shipAngularVelocity.set(0, 0, 0);
  target.shipRotation.set(...snapshot.ship.rotation);
  target.autopilotDirection.set(0, 0, -1).applyQuaternion(target.shipRotation).normalize();

  const euler = new THREE.Euler().setFromQuaternion(target.rotation, 'YXZ');
  target.pitch = euler.x;
  target.yaw = euler.y;
}

function getInitialSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

function persistSession(session: AuthSession | null): void {
  if (!session) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

function CartoonOutlinePostProcess(): null {
  const { gl, scene, camera, size } = useThree();

  const composerRef = useRef<EffectComposer | null>(null);
  const normalTargetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const normalMaterial = useMemo(() => new THREE.MeshNormalMaterial(), []);
  const renderPassRef = useRef<RenderPass | null>(null);
  const bloomPassRef = useRef<UnrealBloomPass | null>(null);
  const outlinePassRef = useRef<ShaderPass | null>(null);
  const outputPassRef = useRef<OutputPass | null>(null);
  const sentinelMeshBuffer = useMemo<Array<[THREE.Mesh, THREE.Material | THREE.Material[]]>>(() => [], []);
  const renderPixelWidth = Math.max(1, Math.floor(size.width * gl.getPixelRatio()));
  const renderPixelHeight = Math.max(1, Math.floor(size.height * gl.getPixelRatio()));

  useEffect(() => {
    const normalTarget = new THREE.WebGLRenderTarget(renderPixelWidth, renderPixelHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    normalTarget.depthTexture = new THREE.DepthTexture(renderPixelWidth, renderPixelHeight);
    normalTarget.depthTexture.minFilter = THREE.NearestFilter;
    normalTarget.depthTexture.magFilter = THREE.NearestFilter;

    const composer = new EffectComposer(gl);
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(renderPixelWidth, renderPixelHeight),
      /* strength */ 0.55,
      /* radius   */ 0.6,
      /* threshold */ 0.5,
    );
    const outlinePass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        tNormal: { value: normalTarget.texture },
        tDepth: { value: normalTarget.depthTexture },
        texelSize: { value: new THREE.Vector2(1.0 / renderPixelWidth, 1.0 / renderPixelHeight) },
        outlineColor: { value: new THREE.Color('#000000') },
        normalDotThreshold: { value: Math.cos(THREE.MathUtils.degToRad(CARTOON_OUTLINE_ANGLE_DEGREES)) },
        depthThreshold: { value: CARTOON_OUTLINE_DEPTH_THRESHOLD },
        cameraNear: { value: camera.near },
        cameraFar: { value: camera.far },
      },
      vertexShader: CARTOON_OUTLINE_VERTEX_SHADER,
      fragmentShader: CARTOON_OUTLINE_FRAGMENT_SHADER,
    });
    const outputPass = new OutputPass();

    composer.addPass(renderPass);
    composer.addPass(bloomPass);
    composer.addPass(outlinePass);
    composer.addPass(outputPass);

    composerRef.current = composer;
    normalTargetRef.current = normalTarget;
    renderPassRef.current = renderPass;
    bloomPassRef.current = bloomPass;
    outlinePassRef.current = outlinePass;
    outputPassRef.current = outputPass;

    return () => {
      composer.dispose();
      normalTarget.dispose();
      normalTarget.depthTexture?.dispose();
      composerRef.current = null;
      normalTargetRef.current = null;
      renderPassRef.current = null;
      bloomPassRef.current = null;
      outlinePassRef.current = null;
      outputPassRef.current = null;
    };
  }, [camera, gl, renderPixelHeight, renderPixelWidth, scene, size.height, size.width]);

  useEffect(() => {
    if (composerRef.current) {
      composerRef.current.setPixelRatio(gl.getPixelRatio());
      composerRef.current.setSize(size.width, size.height);
    }

    if (bloomPassRef.current) {
      bloomPassRef.current.resolution.set(renderPixelWidth, renderPixelHeight);
    }

    if (normalTargetRef.current) {
      normalTargetRef.current.setSize(renderPixelWidth, renderPixelHeight);
      if (normalTargetRef.current.depthTexture) {
        normalTargetRef.current.depthTexture.dispose();
        normalTargetRef.current.depthTexture = new THREE.DepthTexture(renderPixelWidth, renderPixelHeight);
        normalTargetRef.current.depthTexture.minFilter = THREE.NearestFilter;
        normalTargetRef.current.depthTexture.magFilter = THREE.NearestFilter;
      }
    }

    if (outlinePassRef.current) {
      outlinePassRef.current.material.uniforms.tNormal.value = normalTargetRef.current?.texture ?? null;
      outlinePassRef.current.material.uniforms.tDepth.value = normalTargetRef.current?.depthTexture ?? null;
      outlinePassRef.current.material.uniforms.texelSize.value.set(1.0 / renderPixelWidth, 1.0 / renderPixelHeight);
    }

  }, [gl, renderPixelHeight, renderPixelWidth, size.height, size.width]);

  useFrame((_state, _delta) => {
    const composer = composerRef.current;
    const normalTarget = normalTargetRef.current;
    const outlinePass = outlinePassRef.current;
    const renderPass = renderPassRef.current;
    if (!composer || !normalTarget || !outlinePass || !renderPass) {
      return;
    }

    outlinePass.material.uniforms.cameraNear.value = camera.near;
    outlinePass.material.uniforms.cameraFar.value = camera.far;
    renderPass.camera = camera;

    const previousOverrideMaterial = scene.overrideMaterial;
    const previousTarget = gl.getRenderTarget();

    // 1. Hide excluded objects (star body, flare, etc.) for the normal/depth pass
    const hiddenByUs: THREE.Object3D[] = [];
    outlineExcludedObjects.forEach((obj) => {
      if (obj.visible) {
        obj.visible = false;
        hiddenByUs.push(obj);
      }
    });

    // 2a. For objects tagged userData.ignoreOutline, swap their material to the
    //     sentinel so they write depth (blocking outline behind) but write alpha=0
    //     to the normal colour buffer so edge detection is suppressed on them.
    //     All other visible meshes get normalMaterial as usual.
    sentinelMeshBuffer.length = 0;
    scene.traverseVisible((obj) => {
      if (!(obj instanceof THREE.Mesh) || !obj.geometry || !obj.matrixWorld) {
        return;
      }

      // Per-mesh custom outline material takes highest priority.
      if (obj.userData?.customOutlineMaterial) {
        sentinelMeshBuffer.push([obj, obj.material]);
        // eslint-disable-next-line no-param-reassign
        (obj as THREE.Mesh).material = obj.userData.customOutlineMaterial;
        return;
      }

      let isSentinel = false;
      let node: THREE.Object3D | null = obj;
      while (node) {
        if (node.userData?.ignoreOutline) {
          isSentinel = true;
          break;
        }
        node = node.parent;
      }
      sentinelMeshBuffer.push([obj, obj.material]);
      // eslint-disable-next-line no-param-reassign
      (obj as THREE.Mesh).material = isSentinel ? outlineSentinelMaterial : normalMaterial;
    });

    // 2b. Render normals+depth without scene.overrideMaterial (each mesh already
    //     has the right material set above).
    gl.setRenderTarget(normalTarget);
    gl.clear();
    gl.render(scene, camera);
    gl.setRenderTarget(previousTarget);

    // 2c. Restore all mesh materials.
    for (const [mesh, mat] of sentinelMeshBuffer) {
      (mesh as THREE.Mesh).material = mat;
    }

    // 3. Restore excluded objects before the main color pass
    for (const obj of hiddenByUs) {
      obj.visible = true;
    }

    // 4. Composer renders the full scene with outline applied
    composer.render();
  }, 1);

  return null;
}

function App(): ReactElement {
  const [session, setSession] = useState<AuthSession | null>(() => getInitialSession());

  return session ? (
    <SpaceSim
      session={session}
      onLogout={() => {
        persistSession(null);
        setSession(null);
      }}
    />
  ) : (
    <AuthScreen
      onAuthenticated={(nextSession) => {
        persistSession(nextSession);
        setSession(nextSession);
      }}
    />
  );
}

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (session: AuthSession) => void;
}): ReactElement {
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const payload = (await response.json()) as AuthSession & { message?: string };

      if (!response.ok) {
        setError(payload.message ?? 'Unable to authenticate right now.');
        return;
      }

      onAuthenticated(payload);
    } catch {
      setError('Unable to reach the server. Start the backend and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-hero">
          <div className="status-pill">
            <span className="status-dot" /> Prototype build
          </div>
          <h1>SpaceSim</h1>
          <p>
            A browser-based multiplayer space sandbox with account auth, zero-g EVA movement, shared ships,
            and a walkable gravity interior for the pilot seat loop.
          </p>
          <ul className="feature-list">
            <li>Procedural deep-space backdrop with asteroid clusters.</li>
            <li>Simple registration and login backed by hashed credentials.</li>
            <li>Realtime multiplayer presence with shared ship and astronaut states.</li>
            <li>Seamless swap between floating in space, boarding, and piloting.</li>
          </ul>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <h2>{mode === 'register' ? 'Create your pilot account' : 'Welcome back, pilot'}</h2>
          <p>Use a username and password to join the shared sector.</p>
          {error ? <div className="error-banner">{error}</div> : null}
          <label>
            Username
            <input
              autoComplete="username"
              minLength={3}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="captain-nova"
              required
            />
          </label>
          <label>
            Password
            <input
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={6}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 characters"
              required
            />
          </label>
          <button disabled={loading} type="submit">
            {loading ? 'Connecting…' : mode === 'register' ? 'Register and launch' : 'Login'}
          </button>
          <button
            className="auth-switch"
            onClick={() => setMode((current) => (current === 'login' ? 'register' : 'login'))}
            type="button"
          >
            {mode === 'login' ? 'Need an account? Register' : 'Already registered? Login'}
          </button>
        </form>
      </section>
    </main>
  );
}

/**
 * Directional light that points from the active system's star toward the ship.
 *
 * The ship position stored in local state is frame-local, not star-local, so the
 * correct sun direction is based on `shipPosition + frameOrigin` (ship position in
 * system coordinates relative to the star at system origin).
 *
 * To avoid needless per-frame updates, the light is only recomputed when the frame
 * origin changes (loading / reframing the world) and while travelling faster than
 * light speed.
 */
function SunDirectionalLight({
  activeFrameOrigin,
  localStateRef,
}: {
  activeFrameOrigin: Vec3Tuple;
  localStateRef: MutableRefObject<LocalGameState>;
}): ReactElement {
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const systemSpaceShipPosition = useMemo(() => new THREE.Vector3(), []);
  const frameOriginVector = useMemo(() => new THREE.Vector3(), []);

  const updateLightDirection = useCallback(() => {
    const light = lightRef.current;
    if (!light) {
      return;
    }

    frameOriginVector.set(...activeFrameOrigin);
    systemSpaceShipPosition.copy(localStateRef.current.shipPosition).add(frameOriginVector);

    const len = systemSpaceShipPosition.length();
    if (len < 1) {
      systemSpaceShipPosition.set(0, 1, 0);
    } else {
      systemSpaceShipPosition.divideScalar(len);
    }

    // DirectionalLight shines from `position` toward its target (origin by default).
    // Invert the direction so the incoming light matches the star position visually.
    light.position.copy(systemSpaceShipPosition).multiplyScalar(-1e6);
  }, [activeFrameOrigin, frameOriginVector, localStateRef, systemSpaceShipPosition]);

  useEffect(() => {
    updateLightDirection();
  }, [updateLightDirection]);

  useFrame(() => {
    if (localStateRef.current.shipVelocity.length() > SPEED_OF_LIGHT_MPS) {
      updateLightDirection();
    }
  });

  return <directionalLight ref={lightRef} intensity={1.25} color="#dbeafe" />;
}

function SpaceSim({ session, onLogout }: { session: AuthSession; onLogout: () => void }): ReactElement {
  const galaxy = useMemo(() => generateGalaxy(42), []);
  const stationNetwork = useMemo(() => buildStationNetwork(galaxy), [galaxy]);
  const inventorySlots = useMemo<InventorySlotData[]>(
    () => [
      { id: 'slot-1', itemName: null },
      { id: 'slot-2', itemName: null },
      { id: 'slot-3', itemName: null },
    ],
    [],
  );
  const homeSystemId = galaxy.systems[0]?.id ?? 'system-1';
  const homeStation = useMemo(
    () =>
      stationNetwork.find((station) => station.systemId === homeSystemId && station.kind === 'asteroid') ??
      stationNetwork.find((station) => station.systemId === homeSystemId && station.kind === 'planet') ??
      stationNetwork.find((station) => station.systemId === homeSystemId) ??
      null,
    [homeSystemId, stationNetwork],
  );
  const [players, setPlayers] = useState<Record<string, PlayerSnapshot>>({});
  const [selfId, setSelfId] = useState('');
  const [activeSystemId, setActiveSystemId] = useState(homeSystemId);
  const [activeFrameOrigin, setActiveFrameOrigin] = useState<Vec3Tuple>(homeStation?.localPosition ?? [0, 0, 0]);
  const [tabletOpen, setTabletOpen] = useState(false);
  const [showDebugAnchors, setShowDebugAnchors] = useState(false);
  const [pilotCrosshair, setPilotCrosshair] = useState<PilotCrosshairState>({
    visible: false,
    shipVisible: false,
    shipScreenX: typeof window !== 'undefined' ? window.innerWidth / 2 : 0,
    shipScreenY: typeof window !== 'undefined' ? window.innerHeight / 2 : 0,
    aligned: false,
  });
  const [teleporting, setTeleporting] = useState(false);
  const [autopilotDestination, setAutopilotDestination] = useState<AutopilotDestination | null>(null);
  const [autopilotEngaged, setAutopilotEngaged] = useState(false);
  const [autopilotReachedDestinationId, setAutopilotReachedDestinationId] = useState('');
  const [highlightedTarget, setHighlightedTarget] = useState<HighlightTarget | null>(null);
  const [autopilotStatus, setAutopilotStatus] = useState('Select a destination from inside the ship to engage autopilot.');
  const [hud, setHud] = useState<HudState>({
    connected: false,
    mode: 'space',
    speed: 0,
    shipSpeed: 0,
    prompt: 'Connecting to the sector…',
    playersOnline: 1,
    speedLimitNotice: '',
    speedLimitNoticeColor: '#38bdf8',
    safezoneNotice: '',
    interactionPills: [],
  });
  const activeSystem = useMemo(
    () => galaxy.systems.find((system) => system.id === activeSystemId) ?? null,
    [activeSystemId, galaxy.systems],
  );
  const localStateRef = useRef<LocalGameState>(createLocalState(homeSystemId));
  const autopilotEtaRef = useRef<{ timestamp: number; eta: number } | null>(null);
  const shipPositionForSort = localStateRef.current.shipPosition;
  const currentSystemStations = useMemo(
    () => stationNetwork.filter((station) => station.systemId === activeSystemId),
    [activeSystemId, stationNetwork],
  );
  
  
  // Refresh the ETA countdown every second (live countdown)
  const currentTimestampForEta = Math.floor(Date.now() / 1000) * 1000;
  const autopilotEtaLabel = useMemo(() => {
    if (!autopilotDestination) {
      autopilotEtaRef.current = null;
      return '—';
    }

    const now = Date.now();
    let etaInfo = autopilotEtaRef.current;

    // Recalculate ETA every 5 seconds if autopilot is engaged, otherwise just keep counting down
    if (!etaInfo || now - etaInfo.timestamp > 5000) {
      // For inter-system travel the meaningful distance is to the interstellar waypoint, not
      // the destination's localPosition (which lives in a different coordinate frame).
      const liveDistance = autopilotDestination.interstellarWaypoint
        ? vectorFromTuple(autopilotDestination.interstellarWaypoint).distanceTo(localStateRef.current.shipPosition)
        : vectorFromTuple(toFrameLocalPosition(autopilotDestination.localPosition, activeFrameOrigin))
            .distanceTo(localStateRef.current.shipPosition);

      const calculatedEta = estimateAutopilotEtaSeconds(
        liveDistance,
        autopilotDestination.approachRadius,
        localStateRef.current.shipVelocity.length(),
        autopilotDestination.systemId !== activeSystemId,
      );

      etaInfo = {
        timestamp: currentTimestampForEta,
        eta: calculatedEta,
      };
      autopilotEtaRef.current = etaInfo;
    }

    // Tick down in between recalculations
    const elapsedSeconds = Math.floor((currentTimestampForEta - etaInfo.timestamp) / 1000);
    const displayedEta = Math.max(0, etaInfo.eta - elapsedSeconds);

    return formatEta(displayedEta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFrameOrigin, autopilotDestination?.id, currentTimestampForEta]);
  const autopilotObstacles = useMemo(() => (activeSystem ? buildAutopilotObstacles(activeSystem) : []), [activeSystem]);
  
  const socketRef = useRef<Socket | null>(null);
  const sendState = useCallback((payload: PlayerSnapshot) => {
    socketRef.current?.emit('state:update', payload);
  }, []);

  useEffect(() => {
    if (!homeStation) {
      return;
    }

    const state = localStateRef.current;
    initializeHomeSpawnState(state, homeStation.systemId, homeStation.localPosition, _defaultShip);
    setActiveSystemId(homeStation.systemId);
    setActiveFrameOrigin(homeStation.localPosition);
  }, [homeStation]);

  

  useEffect(() => {
    if (hud.mode === 'space' || hud.mode === 'planet-surface') {
      resetLongDistanceState();
      setAutopilotEngaged(false);
    }
  }, [hud.mode]);

  useEffect(() => {
    const socket = io('/', {
      auth: {
        token: session.token,
      },
      transports: ['websocket'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setHud((current) => ({ ...current, connected: true, prompt: 'Click the viewport to capture the mouse.' }));
    });

    socket.on('disconnect', () => {
      setHud((current) => ({ ...current, connected: false, prompt: 'Disconnected. Refresh or re-login.' }));
    });

    socket.on('connect_error', (error) => {
      setHud((current) => ({ ...current, connected: false, prompt: error.message || 'Connection failed.' }));
    });

    socket.on('world:bootstrap', (payload: { selfId: string; players: PlayerSnapshot[] }) => {
      const mapped = Object.fromEntries(payload.players.map((player) => [player.socketId, player]));
      setSelfId(payload.selfId);
      setPlayers(mapped);

      const self = payload.players.find((entry) => entry.socketId === payload.selfId);
      if (self) {
        hydrateLocalState(localStateRef.current, self);
        setActiveSystemId(self.frameSystemId);
        setActiveFrameOrigin(self.frameOrigin);

        if (homeStation && self.frameSystemId === homeStation.systemId && self.frameOrigin.every((value) => Math.abs(value) < 1e-3)) {
          const state = localStateRef.current;
          initializeHomeSpawnState(state, homeStation.systemId, homeStation.localPosition, _defaultShip);
          setActiveFrameOrigin(homeStation.localPosition);
          sendState(createStationSnapshot(state));
        }
      }
    });

    socket.on('world:snapshot', (nextPlayers: PlayerSnapshot[]) => {
      setPlayers(Object.fromEntries(nextPlayers.map((player) => [player.socketId, player])));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [homeStation, sendState, session.token]);

  const remotePlayers = useMemo(
    () => Object.values(players).filter((player) => player.socketId !== selfId && player.frameSystemId === activeSystemId),
    [activeSystemId, players, selfId],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (isTypingTarget) {
        return;
      }

      if (event.repeat) {
        return;
      }

      if (event.code === 'KeyT') {
        event.preventDefault();
        setTabletOpen((current) => !current);
        return;
      }

      if (event.code !== 'Numpad0') {
        return;
      }

      event.preventDefault();
      setShowDebugAnchors((current) => !current);
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (tabletOpen && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, [tabletOpen]);

  const handleFastTravel = useCallback(
    (station: StationNode) => {
      const state = localStateRef.current;
      const base = vectorFromTuple(station.localPosition);
      const standOffDistance = station.kind === 'star' ? 220 : station.kind === 'planet' ? 90 : 55;
      const shipOffset = new THREE.Vector3(0, 0, standOffDistance);
      const playerOffset = new THREE.Vector3(0, 0, standOffDistance + 10);

      const wasInsideShip = state.insideShip;

      state.frameSystemId = station.systemId;
      state.frameOrigin.copy(base);
      state.shipPosition.copy(shipOffset);
      state.shipVelocity.set(0, 0, 0);
      state.shipAngularVelocity.set(0, 0, 0);
      state.shipRotation.identity();
      state.velocity.set(0, 0, 0);

      if (!wasInsideShip) {
        state.mode = 'space';
        state.insideShip = false;
        state.position.copy(playerOffset);
        state.rotation.identity();
        state.yaw = 0;
        state.pitch = 0;
        state.interiorPosition.set(0, SHIP_INTERIOR_FLOOR_HEIGHT_METERS, 2.5);
        state.interiorVelocity.set(0, 0, 0);
      } else {
        // If they were inside the ship, keep their mode (interior/pilot) and their interior position
        state.position.copy(state.shipPosition);
      }

      state.lastHudAt = 0;
      state.lastNetworkAt = 0;

      sendState(createStationSnapshot(state));
      setActiveSystemId(station.systemId);
      setActiveFrameOrigin(station.localPosition);
      setTabletOpen(false);
      setAutopilotEngaged(false);
      setAutopilotReachedDestinationId('');
      setAutopilotStatus('Select a destination from inside the ship to engage autopilot.');
      setHud((current) => ({ ...current, prompt: `Fast-traveled to ${station.name}.` }));
    },
    [sendState],
  );

  const handleEngageAutopilot = useCallback(() => {
    if (!autopilotDestination || hud.mode === 'space' || hud.mode === 'planet-surface') {
      return;
    }

    resetLongDistanceState();
    setAutopilotEngaged(true);
    setAutopilotReachedDestinationId('');
    setAutopilotStatus(`Autopilot engaged for ${autopilotDestination.name}.`);
  }, [autopilotDestination, hud.mode]);



  const handleDisengageAutopilot = useCallback(() => {
    resetLongDistanceState();
    setAutopilotEngaged(false);
    setAutopilotStatus('Autopilot disengaged.');
  }, []);

  return (
    <main className="sim-shell">
      <Canvas camera={{ fov: 75, near: 0.05, far: GALAXY_CAMERA_FAR }} gl={{ logarithmicDepthBuffer: true }}>
        <color attach="background" args={['#02030b']} />
        <ambientLight intensity={0.85} />
        <SunDirectionalLight activeFrameOrigin={activeFrameOrigin} localStateRef={localStateRef} />
        <pointLight intensity={10} distance={120} position={[0, 0, 0]} color="#60a5fa" />
        <GameScene
          activeFrameOrigin={activeFrameOrigin}
          autopilotActive={autopilotEngaged}
          autopilotDestination={autopilotDestination}
            activeAutopilotTarget={autopilotDestination?.id !== autopilotReachedDestinationId ? autopilotDestination : null}
          highlightedTarget={highlightedTarget}
          autopilotEtaLabel={autopilotEtaLabel}
          autopilotObstacles={autopilotObstacles}
          activeSystemId={activeSystemId}
          galaxy={galaxy}
          
          mode={hud.mode}
          onAutopilotArrival={setAutopilotReachedDestinationId}
          onInterstellarArrival={(dest) => {
            // Fast-travel the ship to the actual destination system.
            const kind = (dest.kind === 'asteroid-object' || dest.kind === 'moon') ? 'planet' : dest.kind as StationKind;
            handleFastTravel({
              id: dest.id,
              name: dest.name,
              kind,
              systemId: dest.systemId,
              systemName: dest.systemName,
              localPosition: dest.localPosition,
              mapPosition: [0, 0],
              linkedStationIds: [],
            });
          }}
          localStateRef={localStateRef}
          onAutopilotStatusChange={setAutopilotStatus}
          onAutopilotToggle={setAutopilotEngaged}
          playersOnline={remotePlayers.length + (selfId ? 1 : 0)}
          remotePlayers={remotePlayers}
          sendState={sendState}
          setHud={setHud}
          setPilotCrosshair={setPilotCrosshair}
          showDebugAnchors={showDebugAnchors}
          shipConfig={getShipConfig(DEFAULT_SHIP_ID)}
          tabletOpen={tabletOpen}
        />
        <CartoonOutlinePostProcess />
      </Canvas>

      <div className="hud">
        {pilotCrosshair.visible ? (
          <div className="pilot-crosshair-layer" aria-hidden="true">
            <div className={`pilot-crosshair-circle${pilotCrosshair.aligned ? ' is-aligned' : ''}`} />
            {pilotCrosshair.shipVisible ? (
              <div
                className="pilot-crosshair-ship"
                style={{ left: `${pilotCrosshair.shipScreenX}px`, top: `${pilotCrosshair.shipScreenY}px` }}
              />
            ) : null}
          </div>
        ) : null}

        <div className="hud-panel">
          <h2>{session.user.username}</h2>
          <div className="hud-grid">
            <div>
              <span>Status</span>
              {hud.connected ? 'Online' : 'Offline'}
            </div>
            <div>
              <span>Mode</span>
              {hud.mode}
            </div>
            <div>
              <span>Speed</span>
              {formatSpeed(hud.speed)}
            </div>
            <div>
              <span>Ship</span>
              {formatSpeed(hud.shipSpeed)}
            </div>
            <div>
              <span>Players</span>
              {hud.playersOnline}
            </div>
          </div>
          <button className="logout-button" onClick={onLogout} type="button">
            Logout
          </button>
        </div>

        {hud.speedLimitNotice ? (
          <div
            className="hud-speed-limit-banner"
            style={{
              color: hud.speedLimitNoticeColor,
              borderColor:
                hud.speedLimitNoticeColor === '#ef4444'
                  ? 'rgba(239, 68, 68, 0.45)'
                  : 'rgba(14, 165, 233, 0.35)',
            }}
          >
            {hud.speedLimitNotice}
          </div>
        ) : null}
        {hud.safezoneNotice ? (
          <div className="hud-speed-limit-banner is-safezone-alert">
            {hud.safezoneNotice}
          </div>
        ) : null}

        {hud.interactionPills.length ? (
          <div className="hud-interaction-pills">
            {hud.interactionPills.map((pill) => (
              <div className="hud-interaction-pill" key={pill.key}>
                {pill.label}
              </div>
            ))}
          </div>
        ) : null}

        <InventoryHud slots={inventorySlots} />

        {teleporting && (
          <div className="teleport-overlay">
            <div className="teleport-glow" />
            <div className="teleport-text">INITIATING JUMP</div>
          </div>
        )}

        {tabletOpen ? (
          
        <SpaceTablet
          frameOrigin={activeFrameOrigin}
          shipPosition={localStateRef.current ? [localStateRef.current.shipPosition.x, localStateRef.current.shipPosition.y, localStateRef.current.shipPosition.z] as [number, number, number] : undefined}
          shipSpeed={localStateRef.current?.shipVelocity.length() ?? 0}
          activeSystemId={activeSystemId}
          autopilotDestinationId={autopilotDestination?.id || ''}
          autopilotEngaged={autopilotEngaged}
          galaxy={galaxy}
          highlightedTargetId={highlightedTarget?.id ?? ''}
          hudMode={hud.mode}
          lastTravelledId={autopilotReachedDestinationId}
          network={stationNetwork}
          onClose={() => setTabletOpen(false)}
          onHighlightTarget={setHighlightedTarget}
          onStopAutopilot={() => {
            resetLongDistanceState();
            setAutopilotEngaged(false);
            setAutopilotStatus('Autopilot disengaged.');
          }}
          onEngageAutopilot={(dest) => {
            if (dest.systemId !== activeSystemId) {
              setTeleporting(true);
              setTimeout(() => {
                const fullDest = stationNetwork.find(n => n.id === dest.id);
                if (fullDest) handleFastTravel(fullDest);
                setTimeout(() => setTeleporting(false), 2000);
              }, 1000); // Trigger travel when screen maxes out white
              setTabletOpen(false);
            } else {
              resetLongDistanceState();
              setAutopilotDestination(dest);
              setAutopilotEngaged(true);
              setAutopilotReachedDestinationId('');
              setAutopilotStatus(`Autopilot engaged for ${dest.name}.`);
              setTabletOpen(false);
            }
          }}
          onTravel={handleFastTravel}
        />

        ) : null}
      </div>
    </main>
  );
}

function GameScene({
  activeFrameOrigin,
  autopilotActive,
  autopilotDestination,
  activeAutopilotTarget,
  highlightedTarget,
  autopilotEtaLabel,
  autopilotObstacles,
  activeSystemId,
  galaxy,
    mode,
  localStateRef,
  onAutopilotArrival,
  onInterstellarArrival,
  onAutopilotStatusChange,
  onAutopilotToggle,
  playersOnline,
  remotePlayers,
  sendState,
  setHud,
  setPilotCrosshair,
  showDebugAnchors,
  shipConfig,
  tabletOpen,
}: {
  activeFrameOrigin: Vec3Tuple;
  autopilotActive: boolean;
  autopilotDestination: AutopilotDestination | null;
  activeAutopilotTarget: AutopilotDestination | null;
  highlightedTarget: HighlightTarget | null;
  autopilotEtaLabel: string;
  autopilotObstacles: AutopilotObstacle[];
  activeSystemId: string;
  galaxy: GalaxyData;
    mode: Mode;
  localStateRef: MutableRefObject<LocalGameState>;
  onAutopilotArrival: Dispatch<SetStateAction<string>>;
  onInterstellarArrival: (dest: AutopilotDestination) => void;
  onAutopilotStatusChange: Dispatch<SetStateAction<string>>;
  onAutopilotToggle: Dispatch<SetStateAction<boolean>>;
  playersOnline: number;
  remotePlayers: PlayerSnapshot[];
  sendState: (payload: PlayerSnapshot) => void;
  setHud: Dispatch<SetStateAction<HudState>>;
  setPilotCrosshair: Dispatch<SetStateAction<PilotCrosshairState>>;
  showDebugAnchors: boolean;
  shipConfig: ShipConfig;
  tabletOpen: boolean;
}): ReactElement {
  const { camera, gl, scene } = useThree();
  const interiorCollision = useShipInteriorCollisionData(shipConfig);
  const lastPilotCrosshairRef = useRef<PilotCrosshairState>({
    visible: false,
    shipVisible: false,
    shipScreenX: 0,
    shipScreenY: 0,
    aligned: false,
  });
  const lastInsideSafezoneRef = useRef(false);
  const safezoneTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedKeys = useRef(new Set<string>());
  const actionQueue = useRef(new Set<string>());
  const firingPrimaryRef = useRef(false);
  const lastWeaponBlockedNoticeAtRef = useRef(0);
  const lastWeaponBlockedReasonRef = useRef('');
  const shipGroupRef = useRef<THREE.Group>(null);
  const interiorGroupRef = useRef<THREE.Group>(null);
  const activeSystem = useMemo(
    () => galaxy.systems.find((system) => system.id === activeSystemId) ?? null,
    [activeSystemId, galaxy.systems],
  );
  const environmentColliders = useMemo(
    () => (activeSystem ? buildSystemSceneColliders(activeSystem) : []),
    [activeSystem],
  );
  const localEnvironmentColliders = useMemo(
    () => mapSceneCollidersToFrame(environmentColliders, activeFrameOrigin),
    [activeFrameOrigin, environmentColliders],
  );
  const thirdPersonCameraRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const stationForceFields = useMemo(
    () => (activeSystem
      ? buildSystemStationForceFields(activeSystem).map((field) => ({
          ...field,
          position: toFrameLocalPosition(field.position, activeFrameOrigin),
        }))
      : []),
    [activeFrameOrigin, activeSystem],
  );
  const remoteShipColliders = useMemo(
    () => buildRemoteShipColliders(remotePlayers, activeFrameOrigin),
    [activeFrameOrigin, remotePlayers],
  );
  const shipSceneColliders = useMemo(
    () => [...localEnvironmentColliders, ...remoteShipColliders],
    [localEnvironmentColliders, remoteShipColliders],
  );

  useEffect(() => {
    const downHandler = (event: KeyboardEvent) => {
      pressedKeys.current.add(event.code);
      if (!event.repeat) {
        actionQueue.current.add(event.code);
      }
    };

    const upHandler = (event: KeyboardEvent) => {
      pressedKeys.current.delete(event.code);
    };

    const mouseDownHandler = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      if (!tabletOpen && document.pointerLockElement !== gl.domElement) {
        gl.domElement.requestPointerLock();
      }

      if (localStateRef.current.mode === 'pilot') {
        firingPrimaryRef.current = true;
      }
    };

    const mouseUpHandler = (event: MouseEvent) => {
      if (event.button === 0) {
        firingPrimaryRef.current = false;
      }
    };

    const blurHandler = () => {
      firingPrimaryRef.current = false;
    };

    const pointerLockChangeHandler = () => {
      if (document.pointerLockElement !== gl.domElement) {
        firingPrimaryRef.current = false;
      }
    };

    const clickHandler = () => {
      if (!tabletOpen && document.pointerLockElement !== gl.domElement) {
        gl.domElement.requestPointerLock();
      }
    };

    const mouseHandler = (event: MouseEvent) => {
      if (document.pointerLockElement !== gl.domElement) {
        return;
      }

      const state = localStateRef.current;
      if (state.mode === 'pilot') {
        const rotationSpeed = 0.0025;
        const isUpsideDown = Math.cos(state.pitch) < 0;
        state.yaw -= event.movementX * rotationSpeed * (isUpsideDown ? -1 : 1);
        state.pitch -= event.movementY * rotationSpeed;
        return;
      }

      state.yaw -= event.movementX * 0.0025;
      state.pitch = clamp(state.pitch - event.movementY * 0.0025, -Math.PI / 2.1, Math.PI / 2.1);
    };

    window.addEventListener('keydown', downHandler);
    window.addEventListener('keyup', upHandler);
    window.addEventListener('mousedown', mouseDownHandler);
    window.addEventListener('mouseup', mouseUpHandler);
    window.addEventListener('blur', blurHandler);
    document.addEventListener('pointerlockchange', pointerLockChangeHandler);
    document.addEventListener('mousemove', mouseHandler);
    gl.domElement.addEventListener('click', clickHandler);

    return () => {
      window.removeEventListener('keydown', downHandler);
      window.removeEventListener('keyup', upHandler);
      window.removeEventListener('mousedown', mouseDownHandler);
      window.removeEventListener('mouseup', mouseUpHandler);
      window.removeEventListener('blur', blurHandler);
      document.removeEventListener('pointerlockchange', pointerLockChangeHandler);
      document.removeEventListener('mousemove', mouseHandler);
      gl.domElement.removeEventListener('click', clickHandler);
    };
  }, [gl, localStateRef, tabletOpen]);

  useEffect(() => {
    if (!tabletOpen) {
      return;
    }

    pressedKeys.current.clear();
    actionQueue.current.clear();
    firingPrimaryRef.current = false;
  }, [tabletOpen]);

  useFrame((_frameState, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = performance.now();
    const state = localStateRef.current;
    state.shipBraking = false;
    const pointerLocked = document.pointerLockElement === gl.domElement;
    const consumeAction = (code: string) => {
      const exists = actionQueue.current.has(code);
      if (exists) {
        actionQueue.current.delete(code);
      }
      return exists;
    };

    const keys = pressedKeys.current;
    const movementEnabled = !tabletOpen;
    const lookRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ'));
    const autopilotAvailable = autopilotActive && Boolean(autopilotDestination) && state.mode !== 'space' && state.mode !== 'planet-surface';

    // Disengage autopilot if the ship is inside any station force-field boundary.
    if (autopilotActive && isShipInsideStationBounds(state.shipPosition, stationForceFields)) {
      onAutopilotToggle(false);
      onAutopilotStatusChange('Autopilot unavailable inside station boundary.');
    }
    const playerSceneColliders = [
      ...localEnvironmentColliders,
      ...remoteShipColliders,
      ...buildShipSceneColliders('local-ship', tupleFromVector(state.shipPosition), state.shipRotation, shipConfig),
    ];

    // ── Detect nearest planet for gravity ────────────────────────────────────
    let nearestPlanet: NearestPlanetInfo | null = null;
    if (activeSystem) {
      nearestPlanet = findNearestPlanet(state.position, activeSystem, state.frameOrigin);
      if (nearestPlanet) {
        state.nearPlanetId = nearestPlanet.planetId;
        state.nearPlanetCenter.copy(nearestPlanet.planetCenter);
        state.nearPlanetRadius = nearestPlanet.planetRadius;
      } else {
        state.nearPlanetId = '';
      }
    }

    // ── Also check ship proximity to planet for ship gravity ─────────────────
    let shipNearPlanet: NearestPlanetInfo | null = null;
    if (activeSystem) {
      shipNearPlanet = findNearestPlanet(state.shipPosition, activeSystem, state.frameOrigin);
    }

    const stationWalkCollision = state.mode === 'space' ? findStationWalkCollision(state.position) : null;

    if (state.mode === 'space') {
      state.rotation.copy(lookRotation);

      // Slowly level the ship toward horizontal while the player is EVA
      // (nobody is in the pilot seat).  Preserves heading but zeroes pitch/roll.
      {
        const SHIP_LEVEL_SPEED = 0.4; // rad/s
        const shipForwardFlat = new THREE.Vector3(0, 0, -1).applyQuaternion(state.shipRotation);
        shipForwardFlat.y = 0;
        if (shipForwardFlat.lengthSq() > 1e-4) {
          shipForwardFlat.normalize();
          const levelTarget = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), shipForwardFlat, new THREE.Vector3(0, 1, 0)),
          );
          state.shipRotation.slerp(levelTarget, Math.min(1, SHIP_LEVEL_SPEED * dt));
        }
      }

      if (stationWalkCollision) {
        const localLook = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, state.yaw, 0, 'YXZ'));
        const walkForward = new THREE.Vector3(0, 0, -1).applyQuaternion(localLook);
        const walkRight = new THREE.Vector3(1, 0, 0).applyQuaternion(localLook);
        const walk = new THREE.Vector3();

        if (movementEnabled && keys.has('KeyW')) {
          walk.add(walkForward);
        }
        if (movementEnabled && keys.has('KeyS')) {
          walk.addScaledVector(walkForward, -1);
        }
        if (movementEnabled && keys.has('KeyA')) {
          walk.addScaledVector(walkRight, -1);
        }
        if (movementEnabled && keys.has('KeyD')) {
          walk.add(walkRight);
        }

        if (walk.lengthSq() > 0) {
          walk.normalize().multiplyScalar(INTERIOR_WALK_SPEED_METERS_PER_SECOND);
          state.velocity.x = walk.x;
          state.velocity.z = walk.z;
          const nextStationPosition = moveInteriorBodyWithCollision(
            state.position,
            walk.clone().multiplyScalar(dt),
            stationWalkCollision,
          );
          state.position.x = nextStationPosition.x;
          state.position.z = nextStationPosition.z;
        } else {
          state.velocity.x = 0;
          state.velocity.z = 0;
        }

        if (movementEnabled && consumeAction('Space') && state.playerOnGround) {
          state.velocity.y = INTERIOR_JUMP_VELOCITY;
          state.playerOnGround = false;
        }

        state.velocity.y -= INTERIOR_GRAVITY_METERS_PER_SECOND * dt;
        const stationVerticalResolution = resolveInteriorVerticalPosition(
          state.position,
          state.position.clone().add(new THREE.Vector3(0, state.velocity.y * dt, 0)),
          state.velocity.y,
          stationWalkCollision,
        );
        state.position.y = stationVerticalResolution.positionY;
        state.velocity.y = stationVerticalResolution.velocityY;
        state.playerOnGround = stationVerticalResolution.grounded;
      } else {
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.rotation);
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(state.rotation);
        const moveUp = new THREE.Vector3(0, 1, 0);
        const hasDirectionalInput =
          movementEnabled &&
          (keys.has('KeyW') ||
            keys.has('KeyS') ||
            keys.has('KeyA') ||
            keys.has('KeyD') ||
            keys.has('Space') ||
            keys.has('ShiftLeft') ||
            keys.has('ShiftRight'));

        if (movementEnabled && keys.has('KeyW')) {
          state.velocity.addScaledVector(forward, EVA_THRUST_ACCELERATION * dt);
        }
        if (movementEnabled && keys.has('KeyS')) {
          state.velocity.addScaledVector(forward, -EVA_THRUST_ACCELERATION * dt);
        }
        if (movementEnabled && keys.has('KeyA')) {
          state.velocity.addScaledVector(right, -EVA_THRUST_ACCELERATION * dt);
        }
        if (movementEnabled && keys.has('KeyD')) {
          state.velocity.addScaledVector(right, EVA_THRUST_ACCELERATION * dt);
        }
        if (movementEnabled && keys.has('Space')) {
          state.velocity.addScaledVector(moveUp, EVA_THRUST_ACCELERATION * dt);
        }
        if (movementEnabled && (keys.has('ShiftLeft') || keys.has('ShiftRight'))) {
          state.velocity.addScaledVector(moveUp, -EVA_THRUST_ACCELERATION * dt);
        }

        const speed = state.velocity.length();

        if (speed > PLAYER_MAX_EVA_SPEED_METERS_PER_SECOND) {
          state.velocity.setLength(PLAYER_MAX_EVA_SPEED_METERS_PER_SECOND);
        }

        if (!hasDirectionalInput) {
          const dampFactor = Math.max(0, 1 - EVA_DAMPING * dt);
          state.velocity.multiplyScalar(dampFactor);

          if (state.velocity.length() < EVA_STOP_SPEED_THRESHOLD) {
            state.velocity.set(0, 0, 0);
          }
        }

        state.playerOnGround = false;
      }

      // Apply planet gravity to EVA player within 100km of surface
      if (!stationWalkCollision && nearestPlanet && nearestPlanet.distanceToSurface < PLANET_GRAVITY_RANGE) {
        const onGround = applyPlanetGravityAndTerrainCollision(
          state.position, state.velocity,
          nearestPlanet.planetCenter, nearestPlanet.planetRadius,
          nearestPlanet.planetId, PLAYER_COLLISION_RADIUS, dt,
        );
        state.playerOnGround = onGround;

        // Auto-switch to planet-surface mode when touching ground
        if (onGround) {
          state.mode = 'planet-surface';
          state.insideShip = false;
        }
      } else if (!stationWalkCollision) {
        moveBodyWithSceneColliders(state.position, state.velocity, dt, PLAYER_COLLISION_RADIUS, playerSceneColliders);
      }

      camera.position.copy(state.position);
      camera.quaternion.copy(state.rotation);

      // Check boarding: player must be within BOARDING_RADIUS_METERS of the ship's entry point (world-space)
      const entryWorld = shipConfig.entryPointVec.clone().applyQuaternion(state.shipRotation).add(state.shipPosition);
      if (consumeAction('KeyE') && state.position.distanceTo(entryWorld) < BOARDING_RADIUS_METERS) {
        state.mode = 'interior';
        state.insideShip = true;
        state.interiorPosition.copy(shipConfig.insideSpawnVec);
        state.interiorVelocity.set(0, 0, 0);
      }
    } else if (state.mode === 'interior') {
      if (autopilotAvailable && autopilotDestination) {
        // Time-based interstellar arrival: fire fast-travel when the pre-computed
        // arrival timestamp is reached, regardless of physics convergence.
        if (
          autopilotDestination.interstellarWaypoint &&
          autopilotDestination.interstellarArrivalAt !== undefined &&
          performance.now() >= autopilotDestination.interstellarArrivalAt
        ) {
          onInterstellarArrival(autopilotDestination);
        } else {
          const autopilotStep = updateAutopilotShip(state, dt, autopilotDestination, activeFrameOrigin, autopilotObstacles, shipSceneColliders);
          if (autopilotStep.arrived) {
            if (autopilotDestination.interstellarWaypoint) {
              onInterstellarArrival(autopilotDestination);
            } else {
              onAutopilotArrival(autopilotDestination.id);
              onAutopilotToggle(false);
              onAutopilotStatusChange(`Destination reached: ${autopilotDestination.name}.`);
            }
          }
        }
      } else {
        settleShipVelocity(state, dt, shipSceneColliders);

        // Slowly level the ship toward horizontal while the pilot seat is
        // unoccupied.  We project the ship's current forward onto the XZ plane
        // to preserve heading (yaw) while gradually zeroing out pitch and roll.
        const SHIP_LEVEL_SPEED = 0.4; // rad/s
        const shipForwardFlat = new THREE.Vector3(0, 0, -1).applyQuaternion(state.shipRotation);
        shipForwardFlat.y = 0;
        if (shipForwardFlat.lengthSq() > 1e-4) {
          shipForwardFlat.normalize();
          const levelTarget = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), shipForwardFlat, new THREE.Vector3(0, 1, 0)),
          );
          state.shipRotation.slerp(levelTarget, Math.min(1, SHIP_LEVEL_SPEED * dt));
        }
      }

      const localLook = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, state.yaw, 0, 'YXZ'));
      const walkForward = new THREE.Vector3(0, 0, -1).applyQuaternion(localLook);
      const walkRight = new THREE.Vector3(1, 0, 0).applyQuaternion(localLook);
      const walk = new THREE.Vector3();

      if (movementEnabled && keys.has('KeyW')) {
        walk.add(walkForward);
      }
      if (movementEnabled && keys.has('KeyS')) {
        walk.addScaledVector(walkForward, -1);
      }
      if (movementEnabled && keys.has('KeyA')) {
        walk.addScaledVector(walkRight, -1);
      }
      if (movementEnabled && keys.has('KeyD')) {
        walk.add(walkRight);
      }

      if (walk.lengthSq() > 0) {
        walk.normalize().multiplyScalar(INTERIOR_WALK_SPEED_METERS_PER_SECOND);
        state.interiorVelocity.x = walk.x;
        state.interiorVelocity.z = walk.z;
        if (interiorCollision.colliderMeshes.length) {
          const nextInteriorPosition = moveInteriorBodyWithCollision(
            state.interiorPosition,
            walk.clone().multiplyScalar(dt),
            interiorCollision,
          );
          state.interiorPosition.x = nextInteriorPosition.x;
          state.interiorPosition.z = nextInteriorPosition.z;
        } else {
          state.interiorPosition.addScaledVector(walk, dt);
          state.interiorPosition.x = clamp(state.interiorPosition.x, -shipConfig.interiorClampX, shipConfig.interiorClampX);
          state.interiorPosition.z = clamp(state.interiorPosition.z, -shipConfig.interiorClampZ, shipConfig.interiorClampZ);
        }
      } else {
        state.interiorVelocity.x = 0;
        state.interiorVelocity.z = 0;
      }

      if (movementEnabled && consumeAction('Space') && state.playerOnGround) {
        state.interiorVelocity.y = INTERIOR_JUMP_VELOCITY;
        state.playerOnGround = false;
      }

      state.interiorVelocity.y -= INTERIOR_GRAVITY_METERS_PER_SECOND * dt;
      if (interiorCollision.colliderMeshes.length) {
        const verticalResolution = resolveInteriorVerticalPosition(
          state.interiorPosition,
          state.interiorPosition.clone().add(new THREE.Vector3(0, state.interiorVelocity.y * dt, 0)),
          state.interiorVelocity.y,
          interiorCollision,
        );
        state.interiorPosition.y = verticalResolution.positionY;
        state.interiorVelocity.y = verticalResolution.velocityY;
        state.playerOnGround = verticalResolution.grounded;
      } else {
        state.interiorPosition.y += state.interiorVelocity.y * dt;
        if (state.interiorPosition.y < shipConfig.interiorFloorHeight) {
          state.interiorPosition.y = shipConfig.interiorFloorHeight;
          state.interiorVelocity.y = 0;
          state.playerOnGround = true;
        } else {
          state.playerOnGround = false;
        }
      }

      if (shouldResetInteriorPosition(state.interiorPosition, shipConfig, interiorCollision)) {
        state.interiorPosition.copy(shipConfig.insideSpawnVec);
        state.interiorVelocity.set(0, 0, 0);
      }

      state.position.copy(state.shipPosition);
      state.velocity.copy(state.shipVelocity);
      state.rotation.copy(state.shipRotation);

      const worldLook = state.shipRotation.clone().multiply(lookRotation);
      const cameraOffset = state.interiorPosition.clone().applyQuaternion(state.shipRotation);
      camera.position.copy(state.shipPosition).add(cameraOffset);
      camera.quaternion.copy(worldLook);

      if (consumeAction('KeyF') && state.interiorPosition.distanceTo(shipConfig.pilotSeatVec) < SEAT_INTERACTION_DISTANCE_METERS) {
        state.mode = 'pilot';
        state.insideShip = true;
        state.shipAngularVelocity.set(0, 0, 0);
        const pilotEuler = new THREE.Euler().setFromQuaternion(state.shipRotation, 'YXZ');
        state.pitch = pilotEuler.x;
        state.yaw = pilotEuler.y;
      }

      if (consumeAction('KeyX')) {
        // Exit the ship at the configured outside spawn point
        const exitOffset = shipConfig.outsideSpawnVec.clone().applyQuaternion(state.shipRotation);
        state.mode = 'space';
        state.insideShip = false;
        state.position.copy(state.shipPosition).add(exitOffset);
        state.velocity.copy(state.shipVelocity);
        resetLongDistanceState();
        onAutopilotToggle(false);
        onAutopilotStatusChange('Autopilot disengaged.');
      }
    } else if (state.mode === 'planet-surface') {
      // ── Planet surface walking mode ─────────────────────────────────────

      if (nearestPlanet) {
        // "Up" is away from planet center
        const planetUp = new THREE.Vector3().subVectors(state.position, nearestPlanet.planetCenter).normalize();

        // Build a stable surface-aligned reference frame.
        // Pick a world reference direction that isn't parallel to planetUp.
        const refDir = Math.abs(planetUp.y) < 0.99
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(1, 0, 0);
        // Project refDir onto the tangent plane to get a stable "surface forward"
        const surfForward = refDir.clone().addScaledVector(planetUp, -refDir.dot(planetUp)).normalize();

        // Surface-aligned quaternion: makes camera up = planetUp, forward = surfForward
        const surfaceLookMatrix = new THREE.Matrix4().lookAt(
          new THREE.Vector3(0, 0, 0), surfForward, planetUp,
        );
        const surfaceQuat = new THREE.Quaternion().setFromRotationMatrix(surfaceLookMatrix);

        // Apply FPS pitch/yaw within the surface-aligned frame
        const localLook = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(state.pitch, state.yaw, 0, 'YXZ'),
        );
        state.rotation.copy(surfaceQuat).multiply(localLook);

        // Walking direction uses yaw only (pitch-independent, always in tangent plane).
        // Derive from the surface quaternion + yaw (no pitch) to stay robust.
        const localYaw = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, state.yaw, 0, 'YXZ'),
        );
        const surfYaw = surfaceQuat.clone().multiply(localYaw);
        const tangentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(surfYaw);
        const tangentRight = new THREE.Vector3(1, 0, 0).applyQuaternion(surfYaw);

        const walk = new THREE.Vector3();
        if (movementEnabled && keys.has('KeyW')) walk.add(tangentForward);
        if (movementEnabled && keys.has('KeyS')) walk.addScaledVector(tangentForward, -1);
        if (movementEnabled && keys.has('KeyA')) walk.addScaledVector(tangentRight, -1);
        if (movementEnabled && keys.has('KeyD')) walk.add(tangentRight);

        if (walk.lengthSq() > 0) {
          walk.normalize().multiplyScalar(PLANET_SURFACE_WALK_SPEED);
          // Set horizontal velocity along surface, but preserve vertical (gravity) component
          const verticalSpeed = state.velocity.dot(planetUp);
          state.velocity.copy(walk).addScaledVector(planetUp, verticalSpeed);
        } else {
          // Damp horizontal velocity
          const verticalComponent = planetUp.clone().multiplyScalar(state.velocity.dot(planetUp));
          const horizontalComponent = state.velocity.clone().sub(verticalComponent);
          horizontalComponent.multiplyScalar(Math.max(0, 1 - 8.0 * dt));
          state.velocity.copy(verticalComponent).add(horizontalComponent);
        }

        // Jump with Space
        if (movementEnabled && consumeAction('Space') && state.playerOnGround) {
          state.velocity.addScaledVector(planetUp, PLANET_SURFACE_JUMP_VELOCITY);
          state.playerOnGround = false;
        }

        // Apply gravity
        const gravityDir = planetUp.clone().negate();
        state.velocity.addScaledVector(gravityDir, PLANET_SURFACE_GRAVITY * dt);

        // Cap fall speed to terminal velocity (1 km/s)
        const fallSpeed = state.velocity.dot(gravityDir);
        if (fallSpeed > PLANET_GRAVITY_TERMINAL_VELOCITY) {
          state.velocity.addScaledVector(gravityDir, -(fallSpeed - PLANET_GRAVITY_TERMINAL_VELOCITY));
        }

        state.position.addScaledVector(state.velocity, dt);

        // Terrain collision + slope following
        const terrainAlt = getTerrainAltitudeAtPosition(
          state.position, nearestPlanet.planetCenter,
          nearestPlanet.planetRadius, nearestPlanet.planetId,
        );
        const playerAlt = state.position.distanceTo(nearestPlanet.planetCenter);
        const minAlt = terrainAlt + PLANET_SURFACE_EYE_HEIGHT;
        const altError = playerAlt - minAlt;
        const upNorm = new THREE.Vector3().subVectors(state.position, nearestPlanet.planetCenter).normalize();

        if (altError <= 0) {
          // Below terrain surface: snap up and kill downward velocity.
          state.position.copy(nearestPlanet.planetCenter).addScaledVector(upNorm, minAlt);
          const normalSpeed = state.velocity.dot(upNorm);
          if (normalSpeed < 0) {
            state.velocity.addScaledVector(upNorm, -normalSpeed);
          }
          state.playerOnGround = true;
        } else if (state.playerOnGround && altError < PLANET_SURFACE_GROUND_FOLLOW_DIST) {
          // Player was on the ground and is now hovering slightly above it — terrain
          // dropped away beneath them (walking down a slope). Snap down to follow the
          // slope smoothly instead of falling through the gap each frame.
          state.position.copy(nearestPlanet.planetCenter).addScaledVector(upNorm, minAlt);
          // Strip the entire radial velocity component so gravity doesn't accumulate
          // while following the slope downward.
          const normalSpeed = state.velocity.dot(upNorm);
          state.velocity.addScaledVector(upNorm, -normalSpeed);
          state.playerOnGround = true;
        } else {
          state.playerOnGround = false;
        }

        // Board ship with E — must be near the ship's configured entry point
        const entryWorldPS = shipConfig.entryPointVec.clone().applyQuaternion(state.shipRotation).add(state.shipPosition);
        if (consumeAction('KeyE') && state.position.distanceTo(entryWorldPS) < BOARDING_RADIUS_METERS) {
          state.mode = 'interior';
          state.insideShip = true;
          state.interiorPosition.copy(shipConfig.insideSpawnVec);
          state.interiorVelocity.set(0, 0, 0);
        }

        // Leave surface (jetpack up) with Shift+Space — switch back to EVA space mode
        if (movementEnabled && (keys.has('ShiftLeft') || keys.has('ShiftRight')) && !state.playerOnGround) {
          state.mode = 'space';
        }
      } else {
        // Somehow left planet gravity range, switch back to space
        state.mode = 'space';
        state.playerOnGround = false;
      }

      camera.position.copy(state.position);
      camera.quaternion.copy(state.rotation);
    } else {
        const exitPilotSeat = consumeAction('KeyX');
      const insideStationBounds = isShipInsideStationBounds(state.shipPosition, stationForceFields);
      const manualHandlingMultiplier = insideStationBounds ? SHIP_STATION_MANUAL_HANDLING_MULTIPLIER : 1;
        const forwardInput = movementEnabled && keys.has('KeyW') ? 1 : 0;
        const brakingInput = movementEnabled && keys.has('KeyS');
        state.shipBraking = brakingInput;
        const lateralInput =
          (movementEnabled && keys.has('KeyD') ? 1 : 0) -
          (movementEnabled && keys.has('KeyA') ? 1 : 0);
        const verticalInput =
          (movementEnabled && keys.has('Space') ? 1 : 0) -
          (movementEnabled && (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 1 : 0);
        
        const hasThrustInput = forwardInput !== 0 || brakingInput || lateralInput !== 0 || verticalInput !== 0;
        const hasManualPilotInput = hasThrustInput;

        if (exitPilotSeat) {
          state.mode = 'interior';
          state.interiorPosition.copy(shipConfig.pilotSeatVec).add(new THREE.Vector3(0, 0, 0.8));
          state.interiorVelocity.set(0, 0, 0);
          state.shipAngularVelocity.set(0, 0, 0);
        } else if (hasManualPilotInput) {
          if (autopilotAvailable) {
            resetLongDistanceState();
            onAutopilotToggle(false);
            onAutopilotStatusChange('Autopilot disengaged. Manual control active.');
          }

            const alignToCamera = movementEnabled && (keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD'));
            let angleToTarget = 0;

            if (alignToCamera) {
              const turnSpeed = 1.0 * (shipConfig.turningSpeedMultiplier || 1.0) * dt;
              angleToTarget = state.shipRotation.angleTo(lookRotation);

              // Calculate a roll (lean) based on how far we need to turn horizontally
              const targetForward = new THREE.Vector3(0, 0, -1).applyQuaternion(lookRotation);
              const shipRightTemp = new THREE.Vector3(1, 0, 0).applyQuaternion(state.shipRotation);
              const dotX = targetForward.dot(shipRightTemp);
              const maxRoll = Math.PI / 4; // 45 degrees max lean
              const targetRoll = -dotX * maxRoll;

              // Combine camera look direction with local Z-roll
              const rollQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), targetRoll);
              const shipTargetRotation = lookRotation.clone().multiply(rollQuat);

              state.shipRotation.slerp(shipTargetRotation, Math.min(1, turnSpeed));
              state.shipAngularVelocity.set(0, 0, 0);
            }

            state.rotation.copy(state.shipRotation);

            const accelMul = shipConfig.accelerationMultiplier * manualHandlingMultiplier;
            const brakingMul = shipConfig.brakingMultiplier * manualHandlingMultiplier;
            const shipForward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.shipRotation);
            const shipRight = new THREE.Vector3(1, 0, 0).applyQuaternion(state.shipRotation);
            const shipUp = new THREE.Vector3(0, 1, 0).applyQuaternion(state.shipRotation);

            // Turn in place: only apply forward thrust if the ship points roughly in the camera's direction.
            // Starts fading out thrust at 120 degrees (2*PI/3) and zeroes it towards 180 degrees.
            const startBrakeAngle = (2 * Math.PI) / 3;
            let forwardAlignmentMultiplier = 1.0;
            if (alignToCamera && angleToTarget > startBrakeAngle) {
              const maxAngleRemaining = Math.PI - startBrakeAngle;
              forwardAlignmentMultiplier = Math.max(0, 1 - ((angleToTarget - startBrakeAngle) / maxAngleRemaining));
            }
            const effectiveForwardInput = forwardInput > 0 ? forwardInput * forwardAlignmentMultiplier : forwardInput;

            if (effectiveForwardInput > 0) {
              state.shipVelocity.addScaledVector(shipForward, effectiveForwardInput * SHIP_MANUAL_FORWARD_THRUST * accelMul * dt);
            }
            if (brakingInput) {
              const forwardSpeed = state.shipVelocity.dot(shipForward);
              const brakingDelta = SHIP_MANUAL_REVERSE_THRUST * accelMul * dt;
              const nextForwardSpeed = forwardSpeed > 0
                ? Math.max(0, forwardSpeed - brakingDelta)
                : Math.min(0, forwardSpeed + brakingDelta);
              state.shipVelocity.addScaledVector(shipForward, nextForwardSpeed - forwardSpeed);
            }
            if (lateralInput !== 0) {
              state.shipVelocity.addScaledVector(shipRight, lateralInput * SHIP_MANUAL_STRAFE_THRUST * accelMul * dt);
            }
            if (verticalInput !== 0) {
              state.shipVelocity.addScaledVector(shipUp, verticalInput * SHIP_MANUAL_STRAFE_THRUST * accelMul * dt);
            }

            // Strong lateral damping ensures the ship doesn't slide sideways
            const forwardVelocity = shipForward.clone().multiplyScalar(state.shipVelocity.dot(shipForward));
            const lateralVelocity = state.shipVelocity.clone().sub(forwardVelocity);
            const lateralDamping = 10.0;
            lateralVelocity.multiplyScalar(Math.max(0, 1 - (lateralDamping * brakingMul) * dt));
            
            // Also apply some braking to forward velocity for sharp turns (> 120 deg) so the ship doesn't fly off too far
            let turnBraking = 0;
            if (alignToCamera && angleToTarget > startBrakeAngle) {
              const maxAngleRemaining = Math.PI - startBrakeAngle;
              turnBraking = Math.min(1, (angleToTarget - startBrakeAngle) / maxAngleRemaining) * 4.0;
            }
            forwardVelocity.multiplyScalar(Math.max(0, 1 - (turnBraking * brakingMul) * dt));
            
            state.shipVelocity.copy(forwardVelocity).add(lateralVelocity);

        const stationSpeedLimitInfo = getStationBorderLimitedManualSpeed(
          state.shipPosition,
          state.shipVelocity,
          shipConfig.collisionRadius,
          stationForceFields,
          SHIP_MAX_SPEED_METERS_PER_SECOND * shipConfig.speedMultiplier,
        );
        const maxSpeed = stationSpeedLimitInfo.maxSpeed;
        const shipSpeed = state.shipVelocity.length();
        if (shipSpeed > maxSpeed) {
          state.shipVelocity.setLength(maxSpeed);
        }

        if (!hasThrustInput) {
          const dampFactor = Math.max(0, 1 - SHIP_MANUAL_COAST_DAMPING * dt);
          state.shipVelocity.multiplyScalar(dampFactor);
          if (state.shipVelocity.length() < 0.1) {
            state.shipVelocity.set(0, 0, 0);
          }
        }

        moveBodyWithSceneColliders(state.shipPosition, state.shipVelocity, dt, shipConfig.collisionRadius, shipSceneColliders);
        state.position.copy(state.shipPosition);
        state.velocity.copy(state.shipVelocity);
      } else if (autopilotAvailable && autopilotDestination) {
        // Time-based interstellar arrival (pilot mode)
        if (
          autopilotDestination.interstellarWaypoint &&
          autopilotDestination.interstellarArrivalAt !== undefined &&
          performance.now() >= autopilotDestination.interstellarArrivalAt
        ) {
          onInterstellarArrival(autopilotDestination);
        } else {
          const autopilotStep = updateAutopilotShip(state, dt, autopilotDestination, activeFrameOrigin, autopilotObstacles, shipSceneColliders);
          if (autopilotStep.arrived) {
            if (autopilotDestination.interstellarWaypoint) {
              onInterstellarArrival(autopilotDestination);
            } else {
              onAutopilotArrival(autopilotDestination.id);
              onAutopilotToggle(false);
              onAutopilotStatusChange(`Destination reached: ${autopilotDestination.name}.`);
            }
          }
        }
      } else {
        settleShipVelocity(state, dt, shipSceneColliders, insideStationBounds ? SHIP_STATION_MANUAL_HANDLING_MULTIPLIER : 1);
      }

    }

    // ── Apply ship gravity when touching ground (any mode except flying) ───
    if (shipNearPlanet && state.mode !== 'pilot') {
      const shipOnGround = applyPlanetGravityAndTerrainCollision(
        state.shipPosition, state.shipVelocity,
        shipNearPlanet.planetCenter, shipNearPlanet.planetRadius,
        shipNearPlanet.planetId, shipConfig.landingGearHeight, dt,
      );
      state.shipOnGround = shipOnGround;
    } else if (shipNearPlanet && state.mode === 'pilot') {
      // In pilot mode, always clamp to terrain to prevent the ship from
      // sinking through the surface.  Full gravity integration only runs
      // when already grounded or nearly stationary so it does not fight
      // with autopilot / manual thrust.
      if (state.shipOnGround || state.shipVelocity.length() < 2.0) {
        const shipOnGround = applyPlanetGravityAndTerrainCollision(
          state.shipPosition, state.shipVelocity,
          shipNearPlanet.planetCenter, shipNearPlanet.planetRadius,
          shipNearPlanet.planetId, shipConfig.landingGearHeight, dt,
        );
        state.shipOnGround = shipOnGround;
      } else {
        // Still prevent clipping through the terrain even at speed
        state.shipOnGround = clampBodyToTerrain(
          state.shipPosition, state.shipVelocity,
          shipNearPlanet.planetCenter, shipNearPlanet.planetRadius,
          shipNearPlanet.planetId, shipConfig.landingGearHeight,
        );
      }
    } else {
      state.shipOnGround = false;
    }

    if (state.mode === 'pilot') {
      const desiredCameraOffset = new THREE.Vector3(0, 2, shipConfig.cameraOrbitRadius).applyQuaternion(lookRotation);
      const desiredCameraPosition = state.shipPosition.clone().add(desiredCameraOffset);
      const resolvedCameraPosition = resolveThirdPersonCameraPosition(
        scene,
        thirdPersonCameraRaycaster,
        state.shipPosition,
        desiredCameraPosition,
        [shipGroupRef.current, interiorGroupRef.current],
      );
      camera.position.copy(resolvedCameraPosition);
      camera.quaternion.copy(lookRotation);
    }

    // ── Dual-layer visibility ─────────────────────────────────────────────
    // Exterior: visible when outside the ship (space, planet-surface) or piloting (3rd-person orbit camera)
    // Interior: visible only when walking inside the ship (interior mode)
    if (shipGroupRef.current) {
      shipGroupRef.current.visible = state.mode !== 'interior';
      shipGroupRef.current.position.copy(state.shipPosition);
      shipGroupRef.current.quaternion.copy(state.shipRotation);
    }

    if (interiorGroupRef.current) {
      interiorGroupRef.current.visible = state.mode === 'interior';
      interiorGroupRef.current.position.copy(state.shipPosition);
      interiorGroupRef.current.quaternion.copy(state.shipRotation);
    }

    if (state.mode === 'pilot') {
      const shipForwardPoint = state.shipPosition.clone().add(
        new THREE.Vector3(0, 0, -2000).applyQuaternion(state.shipRotation),
      );
      const shipMarker = projectWorldPointToScreen(
        shipForwardPoint,
        camera,
        gl.domElement.clientWidth,
        gl.domElement.clientHeight,
      );
      const viewportCenterX = gl.domElement.clientWidth / 2;
      const viewportCenterY = gl.domElement.clientHeight / 2;
      const nextPilotCrosshair: PilotCrosshairState = {
        visible: !tabletOpen,
        shipVisible: shipMarker.visible,
        shipScreenX: shipMarker.x,
        shipScreenY: shipMarker.y,
        aligned: shipMarker.visible && Math.hypot(shipMarker.x - viewportCenterX, shipMarker.y - viewportCenterY) <= 10,
      };
      const lastPilotCrosshair = lastPilotCrosshairRef.current;

      if (
        lastPilotCrosshair.visible !== nextPilotCrosshair.visible
        || lastPilotCrosshair.shipVisible !== nextPilotCrosshair.shipVisible
        || lastPilotCrosshair.aligned !== nextPilotCrosshair.aligned
        || Math.abs(lastPilotCrosshair.shipScreenX - nextPilotCrosshair.shipScreenX) > 0.5
        || Math.abs(lastPilotCrosshair.shipScreenY - nextPilotCrosshair.shipScreenY) > 0.5
      ) {
        lastPilotCrosshairRef.current = nextPilotCrosshair;
        setPilotCrosshair(nextPilotCrosshair);
      }
    } else if (lastPilotCrosshairRef.current.visible) {
      const hiddenPilotCrosshair: PilotCrosshairState = {
        visible: false,
        shipVisible: false,
        shipScreenX: lastPilotCrosshairRef.current.shipScreenX,
        shipScreenY: lastPilotCrosshairRef.current.shipScreenY,
        aligned: false,
      };
      lastPilotCrosshairRef.current = hiddenPilotCrosshair;
      setPilotCrosshair(hiddenPilotCrosshair);
    }

    if (now - state.lastNetworkAt > 66) {
      sendState(createStationSnapshot(state));
      state.lastNetworkAt = now;
    }

    if (now - state.lastHudAt > 100) {
      const boardingDistance = state.position.distanceTo(state.shipPosition);
      const entryWorldHud = shipConfig.entryPointVec.clone().applyQuaternion(state.shipRotation).add(state.shipPosition);
      const entryDist = state.position.distanceTo(entryWorldHud);
      const canEnter = (state.mode === 'space' || state.mode === 'planet-surface') && entryDist < BOARDING_RADIUS_METERS;
      const canPilot = state.mode === 'interior' && state.interiorPosition.distanceTo(shipConfig.pilotSeatVec) < SEAT_INTERACTION_DISTANCE_METERS;
      const shipSpeed = state.shipVelocity.length();
      const speed = state.mode === 'pilot' ? shipSpeed : state.mode === 'space' || state.mode === 'planet-surface' ? state.velocity.length() : walkSpeed(state);
      const stationSpeedLimitInfo = state.mode === 'pilot'
        ? getStationBorderLimitedManualSpeed(
            state.shipPosition,
            state.shipVelocity,
            shipConfig.collisionRadius,
            stationForceFields,
            SHIP_MAX_SPEED_METERS_PER_SECOND * shipConfig.speedMultiplier,
          )
        : { maxSpeed: SHIP_MAX_SPEED_METERS_PER_SECOND * shipConfig.speedMultiplier, active: false };
      
      let insideSafezone = false;
      const shipPos = state.shipPosition;
      for (const field of stationForceFields) {
        const dx = shipPos.x - field.position[0];
        const dy = shipPos.y - field.position[1];
        const dz = shipPos.z - field.position[2];
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < field.radius * field.radius) {
          insideSafezone = true;
          break;
        }
      }

      if (insideSafezone !== lastInsideSafezoneRef.current) {
        lastInsideSafezoneRef.current = insideSafezone;
        if (safezoneTimeoutRef.current) {
          clearTimeout(safezoneTimeoutRef.current);
          safezoneTimeoutRef.current = null;
        }
        
        const message = insideSafezone ? 'ENTERING SAFEZONE' : 'LEAVING SAFEZONE';
        setHud((current) => ({
          ...current,
          safezoneNotice: message,
        }));

        safezoneTimeoutRef.current = setTimeout(() => {
          setHud((current) => ({
            ...current,
            safezoneNotice: '',
          }));
          safezoneTimeoutRef.current = null;
        }, SAFEZONE_NOTICE_DURATION_MS);
      }

      const weaponBlockedByField = firingPrimaryRef.current && state.mode === 'pilot' && insideSafezone;
      const weaponBlockedBySpeedOrAP = firingPrimaryRef.current && state.mode === 'pilot' && !insideSafezone && (autopilotActive || state.shipVelocity.length() > 2000);
      if (weaponBlockedByField || weaponBlockedBySpeedOrAP) {
        lastWeaponBlockedNoticeAtRef.current = now;
        lastWeaponBlockedReasonRef.current = weaponBlockedBySpeedOrAP
          ? (autopilotActive ? 'WEAPONS INHIBITED · AUTOPILOT ACTIVE' : 'WEAPONS INHIBITED · VELOCITY TOO HIGH')
          : 'WEAPONS INHIBITED · STATION ARMISTICE ZONE';
      }

      const showWeaponBlockedNotice = now - lastWeaponBlockedNoticeAtRef.current < 3000;
      
      let speedLimitNotice = '';
      let speedLimitNoticeColor = '#38bdf8';

      if (showWeaponBlockedNotice) {
        speedLimitNotice = lastWeaponBlockedReasonRef.current;
        speedLimitNoticeColor = '#ef4444';
      } else if (stationSpeedLimitInfo.active) {
        speedLimitNotice = 'STATION TRAFFIC FIELD · VELOCITY LIMITED';
        speedLimitNoticeColor = '#38bdf8';
      }

      const interactionPills: Array<{ key: string; label: string }> = [];
      if (canEnter) {
        interactionPills.push({
          key: 'enter-ship',
          label: state.mode === 'planet-surface' ? 'E · BOARD SHIP' : 'E · ENTER SHIP',
        });
      }
      if (canPilot) {
        interactionPills.push({
          key: 'pilot-seat',
          label: 'F · ENTER PILOT SEAT',
        });
      }

      let prompt = pointerLocked
        ? 'WASD to move, Space/Shift for vertical thrust. Momentum is preserved.'
        : 'Click the viewport to capture the mouse.';
      if (tabletOpen) {
        prompt = 'Space-Tablet open. Select any station in the network to fast travel.';
      }
      if (state.mode === 'space' && state.playerOnGround) {
        prompt = 'Walking on station. WASD to walk, Space to jump. Step clear to return to EVA thrusters.';
      }
      if (state.mode === 'space' && canEnter) {
        prompt = 'Press E to enter your ship.';
      }
      if (state.mode === 'planet-surface') {
        const canBoard = canEnter;
        if (canBoard) {
          prompt = 'Walking on planet surface. WASD to walk, Space to jump. Press E to board ship.';
        } else {
          prompt = 'Walking on planet surface. WASD to walk, Space to jump. Use jetpack (Shift while airborne) to return to EVA.';
        }
      }
      if (state.mode === 'interior') {
        prompt = canPilot ? 'Press F near the seat to sit down, or use the autopilot panel to select a destination. Space jumps.' : 'Explore the ship interior with WASD, Space to jump. Use the autopilot panel or press X to exit.';
      }
      if (state.mode === 'pilot') {
        prompt = autopilotActive && autopilotDestination
          ? `Autopilot en route to ${autopilotDestination.name}. ETA ${autopilotEtaLabel}. Use WASD to take over. X exits the seat.`
          : 'Pilot seat engaged. Mouse orbits camera, WASD thrusts and aligns. Space/Shift is vertical. X exits.';
      }
      if (state.mode !== 'space' && state.mode !== 'planet-surface' && autopilotActive && autopilotDestination) {
        prompt = `Autopilot en route to ${autopilotDestination.name}. ETA ${autopilotEtaLabel}. Arrival threshold: ${formatDistance(AUTOPILOT_REACH_DISTANCE_METERS)}.`;
      }
      if (tabletOpen) {
        prompt = 'Space-Tablet open. Select any station in the network to fast travel.';
      }

      setHud((current) => ({
        ...current,
        mode: state.mode,
        speed,
        shipSpeed,
        prompt,
        playersOnline,
        speedLimitNotice,
        speedLimitNoticeColor,
        interactionPills,
      }));
      state.lastHudAt = now;
    }
  }, -10);

  return (
    <>
      <GalaxyBackdrop activeFrameOrigin={activeFrameOrigin} activeSystemId={activeSystemId} galaxy={galaxy} autopilotTarget={activeAutopilotTarget} highlightedTarget={highlightedTarget} localStateRef={localStateRef} />
      <WarpSpeedEffect localStateRef={localStateRef} />
      <ShipWeaponEffects autopilotActive={autopilotActive} firingPrimaryRef={firingPrimaryRef} localShipRef={shipGroupRef} localStateRef={localStateRef} stationForceFields={stationForceFields} shipConfig={shipConfig} />
      <group ref={shipGroupRef} userData={{ ignoreCameraCollision: true }}>
        <ShipThrusterEffects localStateRef={localStateRef} shipConfig={shipConfig} />
        <ShipExteriorModel config={shipConfig} highlight showDebugAnchors={showDebugAnchors} />
      </group>
      {highlightedTarget?.kind === 'ship' && (mode === 'space' || mode === 'planet-surface') ? (
        <ShipHighlightTag target={highlightedTarget} localStateRef={localStateRef} />
      ) : null}
      <group ref={interiorGroupRef} visible={false} userData={{ ignoreCameraCollision: true }}>
        <ShipInteriorModel config={shipConfig} showDebugAnchors={showDebugAnchors} />
      </group>
      {remotePlayers.map((player) => (
        <RemotePlayer key={player.socketId} player={player} viewerFrameOrigin={activeFrameOrigin} showDebugAnchors={showDebugAnchors} />
      ))}
    </>
  );
}

function walkSpeed(state: LocalGameState): number {
  return Math.sqrt(state.interiorVelocity.x ** 2 + state.interiorVelocity.z ** 2);
}

function AutopilotPanel({
  active,
  destinations,
  onDestinationChange,
  onEngage,
  onStop,
  selectedDestination,
  selectedDestinationId,
  selectedEtaLabel,
  status,
}: {
  active: boolean;
  destinations: AutopilotDestination[];
  onDestinationChange: (destinationId: string) => void;
  onEngage: () => void;
  onStop: () => void;
  selectedDestination: AutopilotDestination | null;
  selectedDestinationId: string;
  selectedEtaLabel: string;
  status: string;
}): ReactElement {
  return (
    <section className="autopilot-panel">
      <div className="autopilot-panel-header">
        <span>Shipboard Navigation</span>
        <strong>Autopilot</strong>
      </div>

      <label className="autopilot-field">
        <span>Destination</span>
        <select value={selectedDestinationId} onChange={(event) => onDestinationChange(event.currentTarget.value)}>
          {destinations.map((destination) => (
            <option key={destination.id} value={destination.id}>
              {destination.kind === 'asteroid-object'
                ? `${destination.name} · ${formatDistance(destination.distanceFromShip)}`
                : `${destination.name} · ${destination.kind} station`}
            </option>
          ))}
        </select>
      </label>

      {selectedDestination ? (
        <div className="autopilot-meta">
          <div>
            <span>Type</span>
            <strong>{selectedDestination.kind === 'asteroid-object' ? 'Single asteroid' : `${selectedDestination.kind} station`}</strong>
          </div>
          <div>
            <span>Distance</span>
            <strong>{formatDistance(selectedDestination.distanceFromShip)}</strong>
          </div>
          <div>
            <span>ETA</span>
            <strong>{selectedEtaLabel}</strong>
          </div>
        </div>
      ) : null}

      <div className="autopilot-actions">
        <button disabled={!selectedDestinationId || active} onClick={onEngage} type="button">
          Engage
        </button>
        <button className="autopilot-stop" disabled={!active} onClick={onStop} type="button">
          Stop
        </button>
      </div>

      <p className="autopilot-status">{status}</p>
    </section>
  );
}

function WarpSpeedEffect({ localStateRef }: { localStateRef: MutableRefObject<LocalGameState> }): ReactElement {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const materialRef = useRef<THREE.LineBasicMaterial>(null);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  const streakCount = 72;
  const streakStateRef = useRef(
    Array.from({ length: streakCount }, () => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.35 + Math.random() * 1.9,
      speed: 90 + Math.random() * 180,
      z: -20 - Math.random() * 260,
      length: 8 + Math.random() * 34,
    })),
  );
  const positions = useMemo(() => new Float32Array(streakCount * 2 * 3), [streakCount]);

  useFrame((_state, delta) => {
    if (!groupRef.current || !materialRef.current || !geometryRef.current) {
      return;
    }

    const shipSpeed = localStateRef.current.shipVelocity.length();
    const intensity = getWarpEffectIntensity(shipSpeed);
    groupRef.current.visible = intensity > 0.001 && localStateRef.current.mode !== 'space' && localStateRef.current.mode !== 'planet-surface';

    if (!groupRef.current.visible) {
      materialRef.current.opacity = 0;
      return;
    }

    groupRef.current.position.copy(camera.position);
    groupRef.current.quaternion.copy(camera.quaternion);

    streakStateRef.current.forEach((streak, index) => {
      streak.z += streak.speed * delta * (0.4 + intensity * 3.4);
      if (streak.z > -4) {
        streak.angle = Math.random() * Math.PI * 2;
        streak.radius = 0.35 + Math.random() * 2.2;
        streak.speed = 90 + Math.random() * 220;
        streak.z = -160 - Math.random() * 220;
        streak.length = 12 + Math.random() * 42;
      }

      const x = Math.cos(streak.angle) * streak.radius;
      const y = Math.sin(streak.angle) * streak.radius;
      const headX = x * 0.1;
      const headY = y * 0.1;
      const startIndex = index * 6;

      positions[startIndex] = x;
      positions[startIndex + 1] = y;
      positions[startIndex + 2] = streak.z;
      positions[startIndex + 3] = headX;
      positions[startIndex + 4] = headY;
      positions[startIndex + 5] = streak.z + streak.length;
    });

    geometryRef.current.attributes.position.needsUpdate = true;
    materialRef.current.opacity = 0.08 + intensity * 0.72;
  });

  return (
    <group ref={groupRef} visible={false} renderOrder={1000}>
      <lineSegments frustumCulled={false}>
        <bufferGeometry ref={geometryRef}>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} usage={THREE.DynamicDrawUsage} />
        </bufferGeometry>
        <lineBasicMaterial
          ref={materialRef}
          color="#dbeafe"
          transparent
          opacity={0}
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

function InventoryHud({ slots }: { slots: InventorySlotData[] }): ReactElement {
  return (
    <section className="inventory-hud" aria-label="Inventory">
      <div className="inventory-header">
        <span>Cargo</span>
        <strong>Inventory</strong>
      </div>
      <div className="inventory-slots">
        {slots.map((slot, index) => {
          const empty = !slot.itemName;

          return (
            <div key={slot.id} className={`inventory-slot${empty ? ' inventory-slot-empty' : ''}`}>
              <span className="inventory-slot-index">{index + 1}</span>
              <div className="inventory-slot-core">
                <span>{slot.itemName ?? 'Empty'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function hasOcclusionFlag(object: THREE.Object3D | null, flagName: string): boolean {
  let current: THREE.Object3D | null = object;

  while (current) {
    if (current.userData[flagName]) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function isStarOccluded(
  scene: THREE.Scene,
  camera: THREE.Camera,
  raycaster: THREE.Raycaster,
  intersections: THREE.Intersection[],
  starWorldPosition: THREE.Vector3,
  starRadius: number,
  ignoreFlagName = 'ignoreStarOcclusion',
): boolean {
  const direction = starWorldPosition.clone().sub(camera.position);
  const distance = direction.length();

  if (distance <= starRadius) {
    return false;
  }

  raycaster.set(camera.position, direction.normalize());
  raycaster.camera = camera;
  raycaster.far = Math.max(distance - starRadius * 0.9, 0);
  intersections.length = 0;

  try {
    const candidates = scene.children.filter((child): child is THREE.Object3D =>
      Boolean(child) && !outlineExcludedObjects.has(child),
    );
    raycaster.intersectObjects(candidates, true, intersections);
  } catch {
    intersections.length = 0;
    return false;
  }

  return intersections.some((intersection) => !hasOcclusionFlag(intersection.object, ignoreFlagName));
}


type SpaceTabletMapMode = 'galaxy' | 'system' | 'sector';
type SpaceTabletFilter = 'all' | 'stations' | 'bodies' | 'asteroids';
type SpaceTabletMarkerKind = 'system' | 'star' | 'planet' | 'moon' | 'station' | 'asteroid-belt' | 'asteroid-object' | 'ship';

interface SpaceTabletMarker {
  id: string;
  name: string;
  kind: SpaceTabletMarkerKind;
  systemId: string;
  systemName: string;
  mapPosition: [number, number];
  localPosition?: Vec3Tuple;
  approachRadius: number;
  parentId: string | null;
  stationNode?: StationNode;
  subtitle: string;
  accent: string;
  count?: number;
}

function formatSpaceTabletKind(kind: SpaceTabletMarkerKind): string {
  switch (kind) {
    case 'system':
      return 'Star system';
    case 'asteroid-belt':
      return 'Asteroid belt';
    case 'asteroid-object':
      return 'Asteroid';
    case 'ship':
      return 'Your ship';
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

function distanceBetweenPoints(left?: Vec3Tuple, right?: Vec3Tuple): number | null {
  if (!left || !right) {
    return null;
  }

  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  const dz = left[2] - right[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function findPathToNode(galaxy: GalaxyData, targetId: string): string[] {
  const system = galaxy.systems.find((entry) => entry.id === targetId || entry.station.id === targetId);
  return system ? [system.id, system.station.id] : [];
}

function SpaceTablet({
  frameOrigin,
  shipPosition,
  shipSpeed,
  activeSystemId,
  autopilotDestinationId,
  autopilotEngaged,
  galaxy,
  highlightedTargetId,
  hudMode,
  lastTravelledId,
  network,
  onClose,
  onEngageAutopilot,
  onHighlightTarget,
  onStopAutopilot,
  onTravel,
}: {
  frameOrigin?: Vec3Tuple;
  activeSystemId: string;
  autopilotDestinationId: string;
  autopilotEngaged: boolean;
  galaxy: GalaxyData;
  highlightedTargetId: string;
  hudMode: Mode;
  lastTravelledId: string;
  network: StationNode[];
  onClose: () => void;
  onEngageAutopilot: (dest: AutopilotDestination) => void;
  onHighlightTarget: Dispatch<SetStateAction<HighlightTarget | null>>;
  onStopAutopilot: () => void;
  onTravel: (station: StationNode) => void;
  shipPosition?: [number, number, number];
  shipSpeed: number;
}): ReactElement {
  const MAP_CANVAS_WIDTH = 1600;
  const MAP_CANVAS_HEIGHT = 1200;
  const [mapMode, setMapMode] = useState<SpaceTabletMapMode>('sector');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedSystemId, setSelectedSystemId] = useState(activeSystemId);
  const [selectedStationId, setSelectedStationId] = useState<string>(
    `system:${activeSystemId}`,
  );
  const [sectorFocusId, setSectorFocusId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{ x: number; y: number } | null>(null);
  const initializedViewRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const shipAbsolutePosition = useMemo<Vec3Tuple | undefined>(() => {
    if (!shipPosition) {
      return undefined;
    }

    return frameOrigin ? tupleAdd(frameOrigin, shipPosition) : shipPosition;
  }, [frameOrigin, shipPosition]);

  const stationById = useMemo(() => new Map(network.map((station) => [station.id, station])), [network]);
  const systemById = useMemo(() => new Map(galaxy.systems.map((system) => [system.id, system])), [galaxy.systems]);

  useEffect(() => {
    setSelectedSystemId((current) => current || activeSystemId);
  }, [activeSystemId]);

  const galaxyMarkers = useMemo<SpaceTabletMarker[]>(() => {
    return galaxy.systems.map((system) => ({
      id: `system:${system.id}`,
      name: system.name,
      kind: 'system',
      systemId: system.id,
      systemName: system.name,
      mapPosition: [system.mapPosition[0], system.mapPosition[2]],
      approachRadius: system.radius,
      parentId: null,
      subtitle: `${network.filter((station) => station.systemId === system.id).length} stations`,
      accent: '#8ab4ff',
      count: network.filter((station) => station.systemId === system.id).length,
    }));
  }, [galaxy.systems, network]);

  const galaxyMarkerLookup = useMemo(() => new Map(galaxyMarkers.map((marker) => [marker.id, marker])), [galaxyMarkers]);

  const selectedSystem = systemById.get(selectedSystemId) ?? systemById.get(activeSystemId) ?? galaxy.systems[0] ?? null;

  const selectedSystemMarkers = useMemo<SpaceTabletMarker[]>(() => {
    if (!selectedSystem) {
      return [];
    }

    const systemStations = network.filter((station) => station.systemId === selectedSystem.id);
    const systemStationById = new Map(systemStations.map((station) => [station.id, station]));
    const positions: Vec3Tuple[] = [[0, 0, 0]];

    selectedSystem.planets.forEach((planet) => {
      positions.push(planet.position);
      planet.stations.forEach((station) => positions.push(tupleAdd(planet.position, station.position)));
      planet.moons.forEach((moon) => {
        const moonAbsolute = tupleAdd(planet.position, moon.position);
        positions.push(moonAbsolute);
        moon.stations.forEach((station) => positions.push(tupleAdd(moonAbsolute, station.position)));
      });
    });

    selectedSystem.asteroidGroups.forEach((group) => {
      positions.push(group.position);
      positions.push(tupleAdd(group.position, group.station.position));
      group.asteroids.forEach((asteroid) => positions.push(tupleAdd(group.position, asteroid.position)));
    });

    if (shipAbsolutePosition && activeSystemId === selectedSystem.id) {
      positions.push(shipAbsolutePosition);
    }

    const maxDistance = Math.max(1, ...positions.map((position) => Math.hypot(position[0], position[2])));
    const mapRadius = 460;
    const toMap = (position: Vec3Tuple): [number, number] => [
      (position[0] / maxDistance) * mapRadius,
      (position[2] / maxDistance) * mapRadius,
    ];

    const markers: SpaceTabletMarker[] = [
      {
        id: `star:${selectedSystem.id}`,
        name: `${selectedSystem.name} Primary`,
        kind: 'star',
        systemId: selectedSystem.id,
        systemName: selectedSystem.name,
        mapPosition: [0, 0],
        localPosition: [0, 0, 0],
        approachRadius: selectedSystem.radius,
        parentId: null,
        subtitle: 'Primary star',
        accent: '#f8f0a8',
      },
    ];

    const starStationNode = systemStationById.get(selectedSystem.station.id);
    if (starStationNode) {
      markers.push({
        id: starStationNode.id,
        name: starStationNode.name,
        kind: 'station',
        systemId: selectedSystem.id,
        systemName: selectedSystem.name,
        mapPosition: toMap(starStationNode.localPosition),
        localPosition: starStationNode.localPosition,
        approachRadius: 180,
        parentId: `star:${selectedSystem.id}`,
        stationNode: starStationNode,
        subtitle: 'Prime station',
        accent: '#9ee7ff',
      });
    }

    selectedSystem.planets.forEach((planet) => {
      markers.push({
        id: planet.id,
        name: planet.name,
        kind: 'planet',
        systemId: selectedSystem.id,
        systemName: selectedSystem.name,
        mapPosition: toMap(planet.position),
        localPosition: planet.position,
        approachRadius: Math.max(planet.radius * 1.2, 180),
        parentId: `star:${selectedSystem.id}`,
        subtitle: `${planet.moons.length} moons · ${planet.stations.length} stations`,
        accent: planet.color,
      });

      planet.stations.forEach((station) => {
        const absolute = tupleAdd(planet.position, station.position);
        const node = systemStationById.get(station.id);
        markers.push({
          id: station.id,
          name: node?.name ?? station.name,
          kind: 'station',
          systemId: selectedSystem.id,
          systemName: selectedSystem.name,
          mapPosition: toMap(absolute),
          localPosition: absolute,
          approachRadius: 60,
          parentId: planet.id,
          stationNode: node,
          subtitle: 'Orbital station',
          accent: '#8bf2ff',
        });
      });

      planet.moons.forEach((moon) => {
        const moonAbsolute = tupleAdd(planet.position, moon.position);
        markers.push({
          id: moon.id,
          name: moon.name,
          kind: 'moon',
          systemId: selectedSystem.id,
          systemName: selectedSystem.name,
          mapPosition: toMap(moonAbsolute),
          localPosition: moonAbsolute,
          approachRadius: Math.max(moon.radius * 1.8, 120),
          parentId: planet.id,
          subtitle: `${moon.stations.length} stations`,
          accent: moon.color,
        });

        moon.stations.forEach((station) => {
          const absolute = tupleAdd(moonAbsolute, station.position);
          const node = systemStationById.get(station.id);
          markers.push({
            id: station.id,
            name: node?.name ?? station.name,
            kind: 'station',
            systemId: selectedSystem.id,
            systemName: selectedSystem.name,
            mapPosition: toMap(absolute),
            localPosition: absolute,
            approachRadius: 45,
            parentId: moon.id,
            stationNode: node,
            subtitle: 'Moon station',
            accent: '#8bf2ff',
          });
        });
      });
    });

    selectedSystem.asteroidGroups.forEach((group, index) => {
      markers.push({
        id: group.id,
        name: `Belt ${index + 1}`,
        kind: 'asteroid-belt',
        systemId: selectedSystem.id,
        systemName: selectedSystem.name,
        mapPosition: toMap(group.position),
        localPosition: group.position,
        approachRadius: Math.max(group.radius * 3, 900),
        parentId: `star:${selectedSystem.id}`,
        subtitle: `${group.asteroids.length} asteroids`,
        accent: '#cbd5e1',
        count: group.asteroids.length,
      });

      const beltStationAbsolute = tupleAdd(group.position, group.station.position);
      const beltStationNode = systemStationById.get(group.station.id);
      markers.push({
        id: group.station.id,
        name: beltStationNode?.name ?? group.station.name,
        kind: 'station',
        systemId: selectedSystem.id,
        systemName: selectedSystem.name,
        mapPosition: toMap(beltStationAbsolute),
        localPosition: beltStationAbsolute,
        approachRadius: 55,
        parentId: group.id,
        stationNode: beltStationNode,
        subtitle: 'Belt station',
        accent: '#8bf2ff',
      });

      group.asteroids.forEach((asteroid, asteroidIndex) => {
        const absolute = tupleAdd(group.position, asteroid.position);
        markers.push({
          id: asteroid.id,
          name: `Asteroid ${asteroidIndex + 1}`,
          kind: 'asteroid-object',
          systemId: selectedSystem.id,
          systemName: selectedSystem.name,
          mapPosition: toMap(absolute),
          localPosition: absolute,
          approachRadius: Math.max(asteroid.size * 2.2, 100),
          parentId: group.id,
          subtitle: asteroid.shape === 'abstract' ? 'Irregular mass' : 'Stable body',
          accent: '#cbd5e1',
        });
      });
    });

    if (shipAbsolutePosition && activeSystemId === selectedSystem.id) {
      markers.push({
        id: `ship:${selectedSystem.id}`,
        name: 'Your ship',
        kind: 'ship',
        systemId: selectedSystem.id,
        systemName: selectedSystem.name,
        mapPosition: toMap(shipAbsolutePosition),
        localPosition: shipAbsolutePosition,
        approachRadius: 0,
        parentId: null,
        subtitle: 'Current position',
        accent: '#6ee7ff',
      });
    }

    return markers;
  }, [activeSystemId, network, selectedSystem, shipAbsolutePosition]);

  const selectedSystemMarkerLookup = useMemo(
    () => new Map(selectedSystemMarkers.map((marker) => [marker.id, marker])),
    [selectedSystemMarkers],
  );

  const systemOverviewMarkers = useMemo(
    () => selectedSystemMarkers.filter((marker) =>
      marker.kind === 'star' ||
      marker.kind === 'planet' ||
      marker.kind === 'asteroid-belt'
    ),
    [selectedSystemMarkers]
  );

  const sectorFocusMarker = useMemo(() => {
    const current = selectedSystemMarkerLookup.get(sectorFocusId ?? selectedStationId);
    if (!current) {
      return null;
    }

    if (current.kind === 'station' || current.kind === 'asteroid-object') {
      return current.parentId ? selectedSystemMarkerLookup.get(current.parentId) ?? current : current;
    }

    return current;
  }, [sectorFocusId, selectedStationId, selectedSystemMarkerLookup]);

  const sectorMarkers = useMemo<SpaceTabletMarker[]>(() => {
    if (!selectedSystem || !sectorFocusMarker || !sectorFocusMarker.localPosition) {
      return [];
    }

    const focusPosition = sectorFocusMarker.localPosition;
    const hasAncestor = (marker: SpaceTabletMarker, ancestorId: string): boolean => {
      let parentId = marker.parentId;

      while (parentId) {
        if (parentId === ancestorId) {
          return true;
        }

        parentId = selectedSystemMarkerLookup.get(parentId)?.parentId ?? null;
      }

      return false;
    };

    const included = selectedSystemMarkers.filter((marker) => {
      if (marker.systemId !== selectedSystem.id) {
        return false;
      }
      if (marker.id === sectorFocusMarker.id) {
        if (sectorFocusMarker.kind === 'asteroid-belt') {
          return false;
        }
        return true;
      }
      if (marker.kind === 'ship') {
        return false;
      }

      if (sectorFocusMarker.kind === 'star') {
        return hasAncestor(marker, sectorFocusMarker.id);
      }

      return hasAncestor(marker, sectorFocusMarker.id);
    });

    const relativePositions = included
      .map((marker) => marker.localPosition)
      .filter((position): position is Vec3Tuple => Boolean(position))
      .map((position) => tupleSubtract(position, focusPosition));
    relativePositions.push([0, 0, 0]);

    const maxDistance = Math.max(1, ...relativePositions.map((position) => Math.hypot(position[0], position[2])));
    const mapRadius = 380;
    const toMap = (position: Vec3Tuple): [number, number] => [
      (position[0] / maxDistance) * mapRadius,
      (position[2] / maxDistance) * mapRadius,
    ];

    return included.map((marker) => ({
      ...marker,
      mapPosition: marker.localPosition ? toMap(tupleSubtract(marker.localPosition, focusPosition)) : [0, 0],
      subtitle: marker.id === sectorFocusMarker.id ? `${marker.subtitle} · sector focus` : marker.subtitle,
    }));
  }, [activeSystemId, sectorFocusMarker, selectedSystem, selectedSystemMarkerLookup, selectedSystemMarkers]);

  const currentSystemMarkerId = `system:${activeSystemId}`;
  const currentShipMarkerId = `ship:${activeSystemId}`;
  const visibleMarkers = useMemo(() => {
    switch (mapMode) {
      case 'system':
        return systemOverviewMarkers;
      case 'sector':
        return sectorMarkers;
      default:
        return galaxyMarkers;
    }
  }, [galaxyMarkers, mapMode, sectorMarkers, systemOverviewMarkers]);

  const visibleMarkerLookup = useMemo(() => new Map(visibleMarkers.map((marker) => [marker.id, marker])), [visibleMarkers]);
  const combinedMarkerLookup = useMemo(
    () => new Map([...galaxyMarkers, ...selectedSystemMarkers, ...sectorMarkers].map((marker) => [marker.id, marker])),
    [galaxyMarkers, sectorMarkers, selectedSystemMarkers],
  );

  const selectedMarker =
    combinedMarkerLookup.get(selectedStationId) ??
    selectedSystemMarkerLookup.get(selectedStationId) ??
    galaxyMarkerLookup.get(selectedStationId) ??
    galaxyMarkerLookup.get(`system:${selectedSystemId}`) ??
    visibleMarkers[0] ??
    null;

  useEffect(() => {
    if (!selectedMarker) {
      return;
    }

    if (selectedMarker.kind === 'system') {
      setSelectedSystemId(selectedMarker.systemId);
    } else if (selectedMarker.systemId) {
      setSelectedSystemId(selectedMarker.systemId);
    }
  }, [selectedMarker]);

  const activeBounds = useMemo(() => {
    const boundsSource = visibleMarkers;
    const xs = boundsSource.map((marker) => marker.mapPosition[0]);
    const ys = boundsSource.map((marker) => marker.mapPosition[1]);
    const minX = Math.min(...xs, -50);
    const maxX = Math.max(...xs, 50);
    const minY = Math.min(...ys, -50);
    const maxY = Math.max(...ys, 50);
    const paddingX = Math.max((maxX - minX) * 0.18, 120);
    const paddingY = Math.max((maxY - minY) * 0.18, 120);

    return {
      minX: minX - paddingX,
      maxX: maxX + paddingX,
      minY: minY - paddingY,
      maxY: maxY + paddingY,
    };
  }, [visibleMarkers]);

  const project = useCallback(
    (position: [number, number]) => {
      const xSpan = Math.max(activeBounds.maxX - activeBounds.minX, 1);
      const ySpan = Math.max(activeBounds.maxY - activeBounds.minY, 1);
      return {
        left: 140 + ((position[0] - activeBounds.minX) / xSpan) * (MAP_CANVAS_WIDTH - 280),
        top: 140 + ((position[1] - activeBounds.minY) / ySpan) * (MAP_CANVAS_HEIGHT - 280),
      };
    },
    [activeBounds, MAP_CANVAS_HEIGHT, MAP_CANVAS_WIDTH],
  );

  const mapConnections = useMemo(() => {
    if (mapMode === 'galaxy') {
      const starStations = network.filter((station) => station.kind === 'star');
      const byId = new Map(starStations.map((station) => [station.id, station]));
      const routes = new Map<string, { from: [number, number]; to: [number, number]; variant: 'network' | 'route' }>();

      starStations.forEach((station) => {
        station.linkedStationIds.forEach((linkedId) => {
          const linked = byId.get(linkedId);
          if (!linked) {
            return;
          }

          const key = [station.id, linked.id].sort().join(':');
          if (!routes.has(key)) {
            routes.set(key, {
              from: station.mapPosition,
              to: linked.mapPosition,
              variant: 'network',
            });
          }
        });
      });

      if (selectedMarker?.systemId && selectedMarker.systemId !== activeSystemId) {
        const fromSystem = systemById.get(activeSystemId);
        const toSystem = systemById.get(selectedMarker.systemId);
        if (fromSystem && toSystem) {
          routes.set('active-route', {
            from: [fromSystem.mapPosition[0], fromSystem.mapPosition[2]],
            to: [toSystem.mapPosition[0], toSystem.mapPosition[2]],
            variant: 'route',
          });
        }
      }

      return Array.from(routes.values());
    }

    const lookup = new Map((visibleMarkers).map((marker) => [marker.id, marker]));
    const hideSectorCenterConnections = mapMode === 'sector' && sectorFocusMarker?.kind === 'asteroid-belt';
    const connections: Array<{ from: [number, number]; to: [number, number]; variant: 'network' | 'route' }> = (visibleMarkers)
      .filter((marker) => marker.parentId && lookup.has(marker.parentId))
      .filter((marker) => !hideSectorCenterConnections || marker.parentId !== sectorFocusMarker?.id)
      .map((marker) => ({
        from: lookup.get(marker.parentId!)!.mapPosition,
        to: marker.mapPosition,
        variant: 'network' as const,
      }));

    if (mapMode !== 'sector' && selectedMarker?.localPosition && selectedMarker.systemId === activeSystemId && lookup.has(currentShipMarkerId)) {
      connections.push({
        from: lookup.get(currentShipMarkerId)!.mapPosition,
        to: selectedMarker.mapPosition,
        variant: 'route',
      });
    }

    return connections;
  }, [activeSystemId, currentShipMarkerId, mapMode, network, sectorFocusMarker, selectedMarker, systemById, visibleMarkers]);

  const orbitRings = useMemo(() => {
    if (mapMode === 'galaxy') {
      return [] as Array<{ center: [number, number]; radius: number }>;
    }

    const lookup = new Map((visibleMarkers).map((marker) => [marker.id, marker]));
    return (visibleMarkers)
      .filter((marker) => marker.parentId && lookup.has(marker.parentId) && marker.kind !== 'station' && marker.kind !== 'ship' && marker.kind !== 'asteroid-object')
      .map((marker) => {
        const parent = lookup.get(marker.parentId!)!;
        return {
          center: parent.mapPosition,
          radius: Math.hypot(marker.mapPosition[0] - parent.mapPosition[0], marker.mapPosition[1] - parent.mapPosition[1]),
        };
      })
      .filter((ring) => ring.radius > 14);
  }, [mapMode, visibleMarkers]);

  const nearestContact = useMemo(() => {
    if (!shipAbsolutePosition) {
      return currentSystemMarkerId;
    }

    const candidates = selectedSystemMarkers.filter(
      (marker) => marker.kind !== 'ship' && marker.systemId === activeSystemId && marker.localPosition,
    );
    let bestId = currentSystemMarkerId;
    let bestDistance = Number.POSITIVE_INFINITY;

    candidates.forEach((marker) => {
      const nextDistance = distanceBetweenPoints(shipAbsolutePosition, marker.localPosition);
      if (nextDistance !== null && nextDistance < bestDistance) {
        bestId = marker.id;
        bestDistance = nextDistance;
      }
    });

    return bestId;
  }, [activeSystemId, currentSystemMarkerId, selectedSystemMarkers, shipAbsolutePosition]);

  const currentLocationName = useMemo(() => {
    if (mapMode === 'galaxy') {
      return systemById.get(activeSystemId)?.name ?? 'Unknown system';
    }

    return combinedMarkerLookup.get(nearestContact)?.name ?? systemById.get(activeSystemId)?.name ?? 'Unknown contact';
  }, [activeSystemId, combinedMarkerLookup, mapMode, nearestContact, systemById]);

  const resolveSectorFocusId = useCallback(
    (markerId: string | null): string | null => {
      if (!markerId) {
        return null;
      }

      const marker = selectedSystemMarkerLookup.get(markerId);
      if (!marker) {
        return null;
      }

      if (marker.kind === 'station' || marker.kind === 'asteroid-object') {
        return marker.parentId ? selectedSystemMarkerLookup.get(marker.parentId)?.id ?? marker.parentId : marker.id;
      }

      return marker.id;
    },
    [selectedSystemMarkerLookup],
  );

  useEffect(() => {
    if (initializedViewRef.current || selectedSystemMarkers.length === 0) {
      return;
    }

    initializedViewRef.current = true;
    setSelectedSystemId(activeSystemId);
    setSelectedStationId(nearestContact);

    const nextSectorFocusId = resolveSectorFocusId(nearestContact);
    setSectorFocusId(nextSectorFocusId);
    setMapMode(nextSectorFocusId ? 'sector' : 'system');
  }, [activeSystemId, nearestContact, resolveSectorFocusId, selectedSystemMarkers.length]);

  const focusMarker = useCallback(
    (markerId: string, nextMode?: SpaceTabletMapMode) => {
      const marker = combinedMarkerLookup.get(markerId) ?? galaxyMarkerLookup.get(markerId);
      if (!marker) {
        return;
      }

      setSelectedStationId(markerId);
      setSelectedSystemId(marker.systemId);

      if (nextMode === 'sector') {
        setSectorFocusId(markerId);
      }

      if (nextMode) {
        setMapMode(nextMode);
      }
    },
    [combinedMarkerLookup, galaxyMarkerLookup],
  );

  useEffect(() => {
    if (mapMode !== 'sector') {
      setSectorFocusId(null);
    }
  }, [mapMode]);

  const resetView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const fitWidth = viewport.clientWidth / MAP_CANVAS_WIDTH;
    const fitHeight = viewport.clientHeight / MAP_CANVAS_HEIGHT;
    const baseZoom = Math.min(fitWidth, fitHeight) * 0.96;
    const nextZoom = clamp(baseZoom, 0.52, mapMode === 'galaxy' ? 0.92 : 1.02);

    setZoom(nextZoom);
    setPan({
      x: viewport.clientWidth * 0.5 - (MAP_CANVAS_WIDTH * nextZoom) * 0.5,
      y: viewport.clientHeight * 0.5 - (MAP_CANVAS_HEIGHT * nextZoom) * 0.5,
    });
  }, [MAP_CANVAS_HEIGHT, MAP_CANVAS_WIDTH, mapMode]);

  useEffect(() => {
    resetView();
  }, [mapMode, resetView]);

  const handleWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const viewport = viewportRef.current;

    if (!viewport) {
      setZoom((current) => clamp(current - Math.sign(event.deltaY) * 0.12, 0.55, 2.6));
      return;
    }

    const rect = viewport.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    setZoom((current) => {
      const nextZoom = clamp(current - Math.sign(event.deltaY) * 0.12, 0.55, 2.6);

      setPan((currentPan) => {
        const worldX = (cursorX - currentPan.x) / current;
        const worldY = (cursorY - currentPan.y) / current;

        return {
          x: cursorX - worldX * nextZoom,
          y: cursorY - worldY * nextZoom,
        };
      });

      return nextZoom;
    });
  }, []);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    setDragState({ x: event.clientX, y: event.clientY });
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragState) {
        return;
      }

      const deltaX = event.clientX - dragState.x;
      const deltaY = event.clientY - dragState.y;
      setPan((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
      setDragState({ x: event.clientX, y: event.clientY });
    },
    [dragState],
  );

  const stopDragging = useCallback(() => {
    setDragState(null);
  }, []);

  const selectedDistance = selectedMarker?.localPosition ? distanceBetweenPoints(shipAbsolutePosition, selectedMarker.localPosition) : null;
  const selectedStationNode =
    selectedMarker?.stationNode ?? (selectedMarker?.kind === 'station' ? stationById.get(selectedMarker.id) : undefined);
  const selectedCanAutopilot = Boolean(
    selectedMarker &&
      (selectedMarker.kind === 'station' || selectedMarker.kind === 'asteroid-belt' || selectedMarker.kind === 'asteroid-object' || selectedMarker.kind === 'planet' || selectedMarker.kind === 'moon') &&
      selectedMarker.localPosition &&
      hudMode !== 'space' && hudMode !== 'planet-surface',
  );
  const selectedCanTravel = Boolean((hudMode === 'space' || hudMode === 'planet-surface') && selectedStationNode);
  const selectedAutopilotActive = Boolean(autopilotEngaged && selectedMarker && autopilotDestinationId === selectedMarker.id);
  const selectedHighlightActive = Boolean(selectedMarker && highlightedTargetId === selectedMarker.id);
  const selectedCanHighlight = Boolean(
    selectedMarker &&
      selectedMarker.kind !== 'system' &&
      selectedMarker.localPosition &&
      selectedMarker.systemId === activeSystemId &&
      (selectedMarker.kind !== 'ship' || hudMode === 'space' || hudMode === 'planet-surface'),
  );

  const buildDestination = useCallback(
    (marker: SpaceTabletMarker): AutopilotDestination | null => {
      if (!marker.localPosition) {
        return null;
      }

      const destinationKind: AutopilotDestinationKind =
        marker.kind === 'station'
          ? marker.stationNode?.kind ?? 'planet'
          : marker.kind === 'asteroid-belt' || marker.kind === 'asteroid-object'
            ? 'asteroid-object'
            : marker.kind === 'moon'
              ? 'moon'
              : marker.kind === 'star' || marker.kind === 'planet'
                ? marker.kind
                : 'planet';

      // For planets and moons, target the closest surface point instead of the center
      let targetPosition: Vec3Tuple = marker.localPosition;
      let targetApproachRadius = marker.approachRadius;
      // Real celestial-body geometry — used by autopilot phases 4/5 for terrain queries.
      // For non-body destinations these stay at 0 / localPosition.
      let realBodyRadius = 0;
      let realBodyCenter: Vec3Tuple = marker.localPosition;
      if ((marker.kind === 'planet' || marker.kind === 'moon') && shipAbsolutePosition) {
        const cx = marker.localPosition[0];
        const cy = marker.localPosition[1];
        const cz = marker.localPosition[2];
        const dx = shipAbsolutePosition[0] - cx;
        const dy = shipAbsolutePosition[1] - cy;
        const dz = shipAbsolutePosition[2] - cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Compute the actual geometric radius by removing the approach-padding multiplier
        realBodyRadius = marker.kind === 'planet'
          ? (marker.approachRadius >= 180 ? marker.approachRadius / 1.2 : marker.approachRadius)
          : (marker.approachRadius >= 120 ? marker.approachRadius / 1.8 : marker.approachRadius);
        realBodyCenter = marker.localPosition; // planet/moon center
        if (dist > 0) {
          const wPos = new THREE.Vector3(shipAbsolutePosition[0], shipAbsolutePosition[1], shipAbsolutePosition[2]);
          const pCenter = new THREE.Vector3(cx, cy, cz);
          const actualTerrainAlt = getTerrainAltitudeAtPosition(wPos, pCenter, realBodyRadius, marker.id);
          const surfaceAltitude = actualTerrainAlt + 500; // Stop exactly 500m above the specific terrain point
          
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;
          targetPosition = [
            cx + nx * surfaceAltitude,
            cy + ny * surfaceAltitude,
            cz + nz * surfaceAltitude,
          ];
          targetApproachRadius = 0; // the position itself is already near the surface
        }
      }

      return {
        id: marker.id,
        name: marker.name,
        kind: destinationKind,
        systemId: marker.systemId,
        systemName: marker.systemName,
        localPosition: targetPosition,
        approachRadius: targetApproachRadius,
        bodyRadius: realBodyRadius,
        bodyCenter: realBodyCenter,
        distanceFromShip: distanceBetweenPoints(shipAbsolutePosition, targetPosition) ?? 0,
      };
    },
    [shipAbsolutePosition],
  );

  const buildHighlightTarget = useCallback(
    (marker: SpaceTabletMarker): HighlightTarget | null => {
      if (!marker.localPosition || marker.kind === 'system') {
        return null;
      }

      return {
        id: marker.id,
        name: marker.name,
        kind: marker.kind,
        systemId: marker.systemId,
        localPosition: marker.localPosition,
        bodyCenter: marker.localPosition,
      };
    },
    [],
  );

  const selectedVisibleMarker = visibleMarkerLookup.get(selectedStationId) ?? visibleMarkerLookup.get(selectedMarker?.id ?? '');
  const mapSurfaceMarkers = visibleMarkers;
  const breadcrumbItems = useMemo(
    () => [
      {
        key: 'system',
        label: selectedSystem?.name ?? 'System',
        active: mapMode !== 'sector',
        onClick: () => {
          setSelectedSystemId(selectedSystem?.id ?? activeSystemId);
          setMapMode('system');
        },
      },
      ...(mapMode === 'sector' && sectorFocusMarker
        ? [
            {
              key: 'sector',
              label: sectorFocusMarker.name,
              active: true,
              onClick: () => setMapMode('sector'),
            },
          ]
        : []),
    ],
    [activeSystemId, mapMode, sectorFocusMarker, selectedSystem],
  );

  const closestMarkerId = useMemo(() => {
    if (!shipAbsolutePosition) return null;
    let bestId: string | null = null;
    let bestDist = Infinity;
    
    for (const marker of mapSurfaceMarkers) {
      if (marker.kind === 'ship') continue;
      
      let dist = Infinity;
      if (mapMode === 'galaxy') {
        const sys = systemById.get(marker.systemId);
        const activeSys = systemById.get(activeSystemId);
        if (sys && activeSys) {
           dist = Math.hypot(sys.mapPosition[0] - activeSys.mapPosition[0], sys.mapPosition[2] - activeSys.mapPosition[2]);
        }
      } else {
        if (marker.localPosition && marker.systemId === activeSystemId) {
          const d = distanceBetweenPoints(shipAbsolutePosition, marker.localPosition);
          if (d !== null) {
            dist = d;
          }
        }
      }
      
      if (dist < bestDist) {
        bestDist = dist;
        bestId = marker.id;
      }
    }
    return bestId;
  }, [shipAbsolutePosition, mapSurfaceMarkers, mapMode, activeSystemId, systemById]);


  return (
    <section className="tablet-shell">
      <div className="tablet-card">
        <div className="tablet-header">
          <div>
            <span className="tablet-eyebrow">Space-Tablet</span>
            <h3>System Navigation Grid</h3>
            <p>Modern tactical map for local routing, station access, and live object tracking.</p>
            <div className="tablet-status-row">
              <span className="tablet-status-chip">You are near {currentLocationName}</span>
              <span className="tablet-status-chip">{hudMode === 'space' || hudMode === 'planet-surface' ? 'Fast-travel ready' : 'Autopilot routing online'}</span>
              <span className="tablet-status-chip">{selectedSystem?.name ?? 'No system selected'}</span>
            </div>
            <div className="tablet-breadcrumbs" aria-label="Space tablet navigation breadcrumbs">
              {breadcrumbItems.map((item, index) => (
                <span className="tablet-breadcrumb-item" key={item.key}>
                  <button
                    className={item.active ? 'tablet-breadcrumb tablet-breadcrumb-active' : 'tablet-breadcrumb'}
                    onClick={item.onClick}
                    type="button"
                  >
                    {item.label}
                  </button>
                  {index < breadcrumbItems.length - 1 ? <span className="tablet-breadcrumb-separator">/</span> : null}
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="tablet-layout">
          <div className="tablet-map-panel">
            <div className="tablet-toolbar">
              <div className="tablet-tab-group">
                <button className={mapMode === 'system' ? 'tablet-tab-active' : ''} onClick={() => setMapMode('system')} type="button">
                  System
                </button>
                <button
                  className={mapMode === 'sector' ? 'tablet-tab-active' : ''}
                  disabled={!sectorFocusMarker}
                  onClick={() => setMapMode('sector')}
                  type="button"
                >
                  Sector
                </button>
              </div>
              <button onClick={() => setZoom((current) => clamp(current + 0.2, 0.55, 2.6))} type="button">
                +
              </button>
              <button onClick={() => setZoom((current) => clamp(current - 0.2, 0.55, 2.6))} type="button">
                −
              </button>
              <button onClick={resetView} type="button">
                Fit
              </button>
              <button onClick={() => setPan({ x: 0, y: 0 })} type="button">
                Center
              </button>
              <span className="tablet-zoom">{Math.round(zoom * 100)}%</span>
            </div>

            <div
              className="tablet-map tablet-viewport"
              onPointerCancel={stopDragging}
              onPointerDown={handlePointerDown}
              onPointerLeave={stopDragging}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDragging}
              onWheel={handleWheel}
              ref={viewportRef}
            >
              <div className="tablet-map-hud">
                <strong>{mapMode === 'system' ? `${selectedSystem?.name ?? 'System'} map` : `${sectorFocusMarker?.name ?? 'Sector'} detail`}</strong>
                <span>{mapMode === 'system' ? 'Clean system overview with stations, worlds, belts, and your live position' : 'Detailed local sector with close-range contacts'}</span>
              </div>

              <div
                className="tablet-map-canvas"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
              >
                <svg className="tablet-lines" viewBox={`0 0 ${MAP_CANVAS_WIDTH} ${MAP_CANVAS_HEIGHT}`}>
                  {orbitRings.map((ring, index) => {
                    const center = project(ring.center);
                    const projectedEdge = project([ring.center[0] + ring.radius, ring.center[1]]);
                    const radius = Math.abs(projectedEdge.left - center.left);
                    return <circle className="tablet-orbit-ring" cx={center.left} cy={center.top} key={`ring-${index}`} r={radius} />;
                  })}

                  {mapConnections.map((connection, index) => {
                    const from = project(connection.from);
                    const to = project(connection.to);
                    return (
                      <line
                        className={`tablet-link tablet-link-${connection.variant}`}
                        key={`line-${index}`}
                        x1={from.left}
                        x2={to.left}
                        y1={from.top}
                        y2={to.top}
                      />
                    );
                  })}
                </svg>

                {mapSurfaceMarkers.map((marker) => {
                  const projected = project(marker.mapPosition);
                  const selected = selectedVisibleMarker?.id === marker.id || selectedMarker?.id === marker.id;
                  const isCurrent = marker.id === closestMarkerId;
                  const shouldShowLabel = selected;

                  const markerDistance = marker.localPosition && marker.systemId === activeSystemId
                    ? distanceBetweenPoints(shipAbsolutePosition, marker.localPosition)
                    : null;
                  const canAutopilot = Boolean(
                    (marker.kind === 'station' || marker.kind === 'asteroid-belt' || marker.kind === 'asteroid-object' || marker.kind === 'planet' || marker.kind === 'moon') &&
                    (mapMode === 'system' || mapMode === 'sector') &&
                    hudMode !== 'space' && hudMode !== 'planet-surface' &&
                    marker.localPosition &&
                    (typeof markerDistance !== 'number' || markerDistance > 50)
                  );
                  // For inter-system targets the ship travels INTERSTELLAR_WAYPOINT_DISTANCE,
                  // not the meaningless local frame distance to the destination's localPosition.
                  const etaDistance = (marker.systemId !== activeSystemId)
                    ? INTERSTELLAR_WAYPOINT_DISTANCE
                    : markerDistance;
                  const autopilotEtaSeconds = canAutopilot && etaDistance !== null
                    ? estimateAutopilotEtaSeconds(etaDistance, marker.approachRadius, shipSpeed, marker.systemId !== activeSystemId)
                    : null;
                  const isAutopilotTarget = autopilotEngaged && autopilotDestinationId === marker.id;
                  const isHighlightedTarget = highlightedTargetId === marker.id;
                  const canHighlight = Boolean(
                    marker.kind !== 'system' &&
                    marker.localPosition &&
                    marker.systemId === activeSystemId &&
                    (marker.kind !== 'ship' || hudMode === 'space' || hudMode === 'planet-surface'),
                  );

                  return (
                    <div
                      className={`tablet-marker tablet-marker-${marker.kind} ${selected ? 'tablet-marker-selected' : ''} ${isCurrent ? 'tablet-marker-current' : ''}`}
                      key={marker.id}
                      onClick={() => {
                        focusMarker(marker.id, undefined);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          focusMarker(marker.id, undefined);
                        }
                      }}
                      role="button"
                      style={{
                        left: `${projected.left}px`,
                        top: `${projected.top}px`,
                        ['--tablet-label-scale' as string]: `${1 / zoom}`,
                        zIndex: selected ? 1000 : undefined
                      }}
                      tabIndex={0}
                    >
                      <span className="tablet-marker-ping" />
                      <span className="tablet-marker-core" />
                      {shouldShowLabel ? (
                        <div className="tablet-marker-label" onClick={(e) => e.stopPropagation()}>
                          <strong>{marker.name}</strong>
                          <small>{marker.subtitle}</small>
                          {markerDistance !== null ? <small>{formatDistance(markerDistance)}</small> : null}
                          {canAutopilot ? <small>{autopilotEtaSeconds !== null ? `ETA ${formatEta(autopilotEtaSeconds)}` : 'ETA unavailable'}</small> : null}

                          <div className="tablet-label-actions">
                            {mapMode === 'system' && (marker.kind === 'star' || marker.kind === 'planet' || marker.kind === 'asteroid-belt') ? (
                              <button onClick={(e) => { e.stopPropagation(); focusMarker(marker.id, 'sector'); }} type="button">
                                Zoom in
                              </button>
                            ) : null}

                            {(mapMode === 'sector' || (mapMode === 'system' && (marker.systemId !== activeSystemId || marker.kind === 'planet' || marker.kind === 'moon'))) && canAutopilot ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isAutopilotTarget) {
                                    onStopAutopilot();
                                  } else {
                                    const dest = buildDestination(marker);
                                    if (dest) {
                                      onEngageAutopilot(dest);
                                    }
                                  }
                                }}
                                type="button"
                              >
                                {isAutopilotTarget ? 'Stop autopilot' : 'Engage autopilot'}
                              </button>
                            ) : null}

                            {canHighlight ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isHighlightedTarget) {
                                    onHighlightTarget(null);
                                  } else {
                                    onHighlightTarget(buildHighlightTarget(marker));
                                  }
                                }}
                                type="button"
                              >
                                {isHighlightedTarget ? 'Clear highlight' : 'Highlight'}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



function createLensFlareTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(0.42, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(0.7, 'rgba(180,210,255,0.12)');
  gradient.addColorStop(1, 'rgba(180,210,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function GalaxyBackdrop({
  activeFrameOrigin,
  activeSystemId,
  autopilotTarget,
  highlightedTarget,
  galaxy,
  localStateRef,
}: {
  activeFrameOrigin: Vec3Tuple;
  activeSystemId: string;
  autopilotTarget: AutopilotDestination | null;
  highlightedTarget: HighlightTarget | null;
  galaxy: GalaxyData;
  localStateRef: MutableRefObject<LocalGameState>;
}): ReactElement {
  const activeSystem = galaxy.systems.find((system) => system.id === activeSystemId) ?? galaxy.systems[0] ?? null;
  const activeSystemPosition = activeSystem?.mapPosition ?? [0, 0, 0];

  return (
    <group>
      <GalaxyStarMarkers activeSystemId={activeSystemId} activeSystemPosition={activeSystemPosition} galaxy={galaxy} />
      {activeSystem ? <StarSystem autopilotTarget={autopilotTarget} highlightedTarget={highlightedTarget} renderPosition={toFrameLocalPosition([0, 0, 0], activeFrameOrigin)} system={activeSystem} localStateRef={localStateRef} /> : null}
    </group>
  );
}

function GalaxyStarMarkers({
  activeSystemId,
  activeSystemPosition,
  galaxy,
}: {
  activeSystemId: string;
  activeSystemPosition: Vec3Tuple;
  galaxy: GalaxyData;
}): ReactElement {
  return (
    <group>
      {galaxy.systems
        .filter((system) => system.id !== activeSystemId)
        .map((system) => (
        <StarMarker key={`${system.id}-marker`} position={tupleSubtract(system.mapPosition, activeSystemPosition)} />
      ))}
    </group>
  );
}

function StarMarker({ position }: { position: Vec3Tuple }): ReactElement {
  const { camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const intersections = useMemo<THREE.Intersection[]>(() => [], []);
  const worldPosition = useMemo(() => new THREE.Vector3(...position), [position]);
  const pointPosition = useMemo(() => new Float32Array([0, 0, 0]), []);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);
  const lastOcclusionCheckRef = useRef(0);
  const markerVisibleRef = useRef(true);

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }

    projectedPosition.copy(worldPosition).project(camera);
    const distance = worldPosition.distanceTo(camera.position);
    const inFront = projectedPosition.z > -1 && projectedPosition.z < 1;
    const inRange = distance <= STAR_VISIBILITY_RANGE && distance > STAR_MARKER_HIDE_RADIUS;

    if (!inFront || !inRange) {
      groupRef.current.visible = false;
      return;
    }

    if (state.clock.elapsedTime - lastOcclusionCheckRef.current > 0.12) {
      markerVisibleRef.current = !isStarOccluded(scene, camera, raycaster, intersections, worldPosition, 0.5, 'ignoreMarkerOcclusion');
      lastOcclusionCheckRef.current = state.clock.elapsedTime;
    }

    groupRef.current.visible = markerVisibleRef.current;
  });

  return (
    <group position={position} ref={groupRef} userData={{ ignoreMarkerOcclusion: true }}>
      <points frustumCulled={false} userData={{ ignoreMarkerOcclusion: true }}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[pointPosition, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#ffffff"
          depthTest
          depthWrite={false}
          opacity={0.95}
          size={3.5}
          sizeAttenuation={false}
          transparent
        />
      </points>
    </group>
  );
}

function getStarScreenRadiusNdc(camera: THREE.Camera, distance: number, starRadius: number): number {
  const perspectiveCamera = camera as THREE.PerspectiveCamera;

  if (!('isPerspectiveCamera' in perspectiveCamera) || !perspectiveCamera.isPerspectiveCamera) {
    return THREE.MathUtils.clamp(starRadius * 0.002, 0.001, 1.5);
  }

  if (distance <= 1e-4) {
    return 1.5;
  }

  const halfFovTangent = Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov * 0.5));
  return THREE.MathUtils.clamp(starRadius / (distance * halfFovTangent), 0.001, 1.5);
}


function AutopilotTargetTag({ target, renderPosition, localStateRef }: { target: Pick<HighlightTarget, 'name' | 'localPosition' | 'bodyCenter'>; renderPosition: Vec3Tuple; localStateRef: MutableRefObject<LocalGameState> }) {
  // We use bodyCenter except if it happens to be not provided, fallback to localPosition
  const pos = target.bodyCenter || target.localPosition;
  const targetPosition = useMemo(() => new THREE.Vector3(...tupleAdd(renderPosition, pos)), [pos, renderPosition]);
  const [distanceLabel, setDistanceLabel] = useState(() => formatDistance(targetPosition.distanceTo(localStateRef.current.position)));

  useFrame(() => {
    const nextLabel = formatDistance(targetPosition.distanceTo(localStateRef.current.position));
    setDistanceLabel((current) => (current === nextLabel ? current : nextLabel));
  });
  
  return (
    <PhysicalProxyGroup physicalPosition={tupleAdd(renderPosition, pos)} visibleRange={1_200_000_000}>
      <Html center zIndexRange={[1, 0]}>
        <div className="cyber-target-tag">
          <div className="cyber-line-top"></div>
          <div className="cyber-content">
            <div className="cyber-id">{distanceLabel}</div>
            <div className="cyber-name">{target.name.toUpperCase()}</div>
          </div>
          <div className="cyber-line-bottom"></div>
        </div>
      </Html>
    </PhysicalProxyGroup>
  );
}

function ShipHighlightTag({ target, localStateRef }: { target: HighlightTarget; localStateRef: MutableRefObject<LocalGameState> }) {
  const groupRef = useRef<THREE.Group>(null);
  const targetPosition = useMemo(
    () => new THREE.Vector3(...(target.bodyCenter || target.localPosition)),
    [target.bodyCenter, target.localPosition],
  );
  const [distanceLabel, setDistanceLabel] = useState(() => formatDistance(localStateRef.current.position.distanceTo(targetPosition)));

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.set(
        targetPosition.x,
        targetPosition.y + 4,
        targetPosition.z,
      );
    }
    const nextLabel = formatDistance(localStateRef.current.position.distanceTo(targetPosition));
    setDistanceLabel((current) => (current === nextLabel ? current : nextLabel));
  });

  return (
    <group ref={groupRef} position={[targetPosition.x, targetPosition.y + 4, targetPosition.z]}>
      <Html center zIndexRange={[1, 0]}>
        <div className="cyber-target-tag">
          <div className="cyber-line-top"></div>
          <div className="cyber-content">
            <div className="cyber-id">{distanceLabel}</div>
            <div className="cyber-name">{target.name.toUpperCase()}</div>
          </div>
          <div className="cyber-line-bottom"></div>
        </div>
      </Html>
    </group>
  );
}

interface WeaponProjectileEffect {
  active: boolean;
  age: number;
  position: THREE.Vector3;
  previousPosition: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface WeaponFlashEffect {
  active: boolean;
  age: number;
  life: number;
  position: THREE.Vector3;
  localOffset: THREE.Vector3;
  scale: number;
}

interface WeaponImpactEffect {
  active: boolean;
  age: number;
  life: number;
  normal: THREE.Vector3;
  particleOffsets: THREE.Vector3[];
  particleVelocities: THREE.Vector3[];
  position: THREE.Vector3;
}

function shouldIgnoreWeaponCollision(object: THREE.Object3D, localShipRef: MutableRefObject<THREE.Group | null>, weaponEffectsRef: MutableRefObject<THREE.Group | null>): boolean {
  let current: THREE.Object3D | null = object;

  while (current) {
    if (current === localShipRef.current || current === weaponEffectsRef.current) {
      return true;
    }
    if (current.userData?.ignoreWeaponCollision || current.userData?.ignoreMarkerOcclusion || current.userData?.ignoreStarOcclusion) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function createHexPatternTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  if (!context) {
    const fallbackTexture = new THREE.CanvasTexture(canvas);
    fallbackTexture.wrapS = THREE.RepeatWrapping;
    fallbackTexture.wrapT = THREE.RepeatWrapping;
    return fallbackTexture;
  }

  context.clearRect(0, 0, size, size);
  context.strokeStyle = 'rgba(170, 245, 255, 0.82)';
  context.lineWidth = 2.2;
  context.shadowColor = 'rgba(34, 211, 238, 0.38)';
  context.shadowBlur = 8;
  const radius = 16;
  const stepX = radius * 3;
  const stepY = Math.sqrt(3) * radius;

  const drawHex = (hx: number, hy: number) => {
    context.beginPath();
    for (let side = 0; side < 6; side += 1) {
      const angle = (Math.PI / 3) * side + Math.PI / 6;
      const x = hx + Math.cos(angle) * radius;
      const y = hy + Math.sin(angle) * radius;
      if (side === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }
    context.closePath();
    context.stroke();
  };

  for (let row = -3; row <= Math.ceil(size / (stepY * 0.5)) + 3; row += 1) {
    const offsetX = row % 2 === 0 ? 0 : stepX * 0.5;
    for (let col = -3; col <= Math.ceil(size / stepX) + 3; col += 1) {
      drawHex(col * stepX + offsetX, row * stepY * 0.5);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function StationForceField({ fieldId, radius }: { fieldId: string; radius: number }): ReactElement {
  const shieldGroupRef = useRef<THREE.Group>(null);
  const raycastMeshRef = useRef<THREE.Mesh>(null);
  const shieldMeshRef = useRef<THREE.Mesh>(null);
  const shieldMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const localHitPoint = useMemo(() => new THREE.Vector3(), []);
  const localNormal = useMemo(() => new THREE.Vector3(), []);
  const shieldTexture = useMemo(() => createHexPatternTexture(), []);
  const shieldUniforms = useMemo(
    () => ({
      shieldTexture: { value: shieldTexture },
      shieldColor: { value: new THREE.Color('#7dd3fc') },
      textureRepeat: { value: new THREE.Vector2(216, 108) },
      impactNormals: { value: Array.from({ length: STATION_FORCE_FIELD_MAX_SPOTS }, () => new THREE.Vector3(0, 1, 0)) },
      impactStrengths: { value: Array.from({ length: STATION_FORCE_FIELD_MAX_SPOTS }, () => 0) },
      impactRadius: { value: STATION_FORCE_FIELD_IMPACT_REVEAL_RADIUS_METERS / Math.max(radius, 1) },
      impactSoftness: { value: STATION_FORCE_FIELD_IMPACT_REVEAL_SOFTNESS_METERS / Math.max(radius, 1) },
    }),
    [radius, shieldTexture],
  );
  const spots = useMemo(() => Array.from({ length: STATION_FORCE_FIELD_MAX_SPOTS }, () => ({
    active: false,
    age: 0,
    life: STATION_FORCE_FIELD_SPOT_LIFETIME_SECONDS,
    normal: new THREE.Vector3(0, 1, 0),
  })), []);
  const nextImpactRef = useRef(0);

  useEffect(() => {
    if (!raycastMeshRef.current) {
      return;
    }

    const handleShieldImpact = (hit: THREE.Intersection<THREE.Object3D>) => {
      const idx = nextImpactRef.current % STATION_FORCE_FIELD_MAX_SPOTS;
      nextImpactRef.current += 1;
      const spot = spots[idx];
      localHitPoint.copy(hit.point);
      shieldGroupRef.current?.worldToLocal(localHitPoint);
      localNormal.copy(localHitPoint).normalize();
      spot.active = true;
      spot.age = 0;
      spot.life = STATION_FORCE_FIELD_SPOT_LIFETIME_SECONDS;
      spot.normal.copy(localNormal);
      return { suppressDefaultImpact: true };
    };

    raycastMeshRef.current.userData.onWeaponImpact = handleShieldImpact;
    raycastMeshRef.current.userData.suppressWeaponImpactEffect = true;
    stationForceFieldImpactHandlers.set(fieldId, (worldHitPoint) => {
      const idx = nextImpactRef.current % STATION_FORCE_FIELD_MAX_SPOTS;
      nextImpactRef.current += 1;
      const spot = spots[idx];
      localHitPoint.copy(worldHitPoint);
      shieldGroupRef.current?.worldToLocal(localHitPoint);
      localNormal.copy(localHitPoint).normalize();
      spot.active = true;
      spot.age = 0;
      spot.life = STATION_FORCE_FIELD_SPOT_LIFETIME_SECONDS;
      spot.normal.copy(localNormal);
    });

    return () => {
      if (raycastMeshRef.current) {
        delete raycastMeshRef.current.userData.onWeaponImpact;
        delete raycastMeshRef.current.userData.suppressWeaponImpactEffect;
      }
      stationForceFieldImpactHandlers.delete(fieldId);
    };
  }, [fieldId, localHitPoint, localNormal, radius, spots]);

  useEffect(() => () => {
    shieldTexture.dispose();
  }, [shieldTexture]);

  useFrame((_state, delta) => {
    const shaderMaterial = shieldMaterialRef.current;
    const impactNormals = shieldUniforms.impactNormals.value;
    const impactStrengths = shieldUniforms.impactStrengths.value;

    for (let i = 0; i < STATION_FORCE_FIELD_MAX_SPOTS; i += 1) {
      const spot = spots[i];

      if (!spot.active) {
        impactStrengths[i] = 0;
        continue;
      }

      spot.age += delta;
      if (spot.age >= spot.life) {
        spot.active = false;
        impactStrengths[i] = 0;
        continue;
      }

      impactNormals[i].copy(spot.normal);
      impactStrengths[i] = 1 - spot.age / spot.life;
    }

    if (shaderMaterial) {
      shaderMaterial.uniformsNeedUpdate = true;
    }
  });

  /** Sentinel material for the outline pass: uses the same reveal logic as the
   *  visual shield shader.  Where the field is visible (projectile hit), it writes
   *  alpha=0 to the normal colour buffer so the outline shader skips edge detection
   *  at those pixels, hiding station outlines behind the visible shield.
   *  depthWrite is FALSE so the sphere never creates false depth discontinuities
   *  (which would cause a phantom outline on the invisible sphere). Where the field
   *  is not revealed, the fragment discards entirely, preserving station normals
   *  and outlines behind it. */
  const forceFieldSentinelMaterial = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vLocalNormal;
      void main() {
        vLocalNormal = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <logdepthbuf_pars_fragment>
      uniform vec3 impactNormals[${STATION_FORCE_FIELD_MAX_SPOTS}];
      uniform float impactStrengths[${STATION_FORCE_FIELD_MAX_SPOTS}];
      uniform float impactRadius;
      uniform float impactSoftness;
      varying vec3 vLocalNormal;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 localNormal = normalize(vLocalNormal);
        float reveal = 0.0;
        for (int i = 0; i < ${STATION_FORCE_FIELD_MAX_SPOTS}; i++) {
          float strength = impactStrengths[i];
          if (strength <= 0.0) continue;
          float normalDistance = distance(localNormal, normalize(impactNormals[i]));
          float revealBand = 1.0 - smoothstep(impactRadius, impactRadius + impactSoftness, normalDistance);
          reveal = max(reveal, revealBand * strength);
        }
        if (reveal <= 0.001) {
          discard;
        }
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      }
    `,
    uniforms: {
      impactNormals: shieldUniforms.impactNormals,
      impactStrengths: shieldUniforms.impactStrengths,
      impactRadius: shieldUniforms.impactRadius,
      impactSoftness: shieldUniforms.impactSoftness,
    },
    depthWrite: false,
    depthTest: true,
    colorWrite: true,
    side: THREE.DoubleSide,
  }), [shieldUniforms]);

  // Exclude the invisible raycast sphere from the outline pass entirely.
  useEffect(() => {
    const mesh = raycastMeshRef.current;
    if (mesh) {
      outlineExcludedObjects.add(mesh);
    }
    return () => {
      if (mesh) {
        outlineExcludedObjects.delete(mesh);
      }
    };
  }, []);

  return (
    <group ref={shieldGroupRef} userData={{ stationForceFieldId: fieldId, ignoreCameraCollision: true }}>
      {/* Invisible raycast-only sphere — always present, never visually rendered */}
      <mesh ref={raycastMeshRef} userData={{ stationForceFieldId: fieldId }}>
        <sphereGeometry args={[radius, 32, 24]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} colorWrite={false} />
      </mesh>
      <mesh ref={shieldMeshRef} renderOrder={69} userData={{ ignoreWeaponCollision: true, stationForceFieldId: fieldId, customOutlineMaterial: forceFieldSentinelMaterial }}>
        <sphereGeometry args={[radius + 1.5, 64, 48]} />
        <shaderMaterial
          ref={shieldMaterialRef}
          uniforms={shieldUniforms}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
          vertexShader={`
            #include <common>
            #include <logdepthbuf_pars_vertex>

            varying vec2 vUv;
            varying vec3 vWorldPosition;
            varying vec3 vWorldNormal;
            varying vec3 vLocalNormal;

            void main() {
              vUv = uv;
              vLocalNormal = normalize(position);
              vec4 worldPosition = modelMatrix * vec4(position, 1.0);
              vWorldPosition = worldPosition.xyz;
              vWorldNormal = normalize(mat3(modelMatrix) * normal);
              gl_Position = projectionMatrix * viewMatrix * worldPosition;
              #include <logdepthbuf_vertex>
            }
          `}
          fragmentShader={`
            #include <logdepthbuf_pars_fragment>

            uniform sampler2D shieldTexture;
            uniform vec3 shieldColor;
            uniform vec2 textureRepeat;
            uniform vec3 impactNormals[${STATION_FORCE_FIELD_MAX_SPOTS}];
            uniform float impactStrengths[${STATION_FORCE_FIELD_MAX_SPOTS}];
            uniform float impactRadius;
            uniform float impactSoftness;

            varying vec2 vUv;
            varying vec3 vWorldPosition;
            varying vec3 vWorldNormal;
            varying vec3 vLocalNormal;

            float getRevealMask(vec3 localNormal) {
              float reveal = 0.0;
              for (int i = 0; i < ${STATION_FORCE_FIELD_MAX_SPOTS}; i += 1) {
                float strength = impactStrengths[i];
                if (strength <= 0.0) {
                  continue;
                }

                float normalDistance = distance(localNormal, normalize(impactNormals[i]));
                float revealBand = 1.0 - smoothstep(impactRadius, impactRadius + impactSoftness, normalDistance);
                reveal = max(reveal, revealBand * strength);
              }
              return reveal;
            }

            void main() {
              #include <logdepthbuf_fragment>

              vec3 localNormal = normalize(vLocalNormal);
              float reveal = getRevealMask(localNormal);
              if (reveal <= 0.001) {
                discard;
              }

              vec2 tiledUv = vUv * textureRepeat;
              vec4 tex = texture2D(shieldTexture, tiledUv);
              float pattern = clamp(tex.a + dot(tex.rgb, vec3(0.2126, 0.7152, 0.0722)) * 0.35, 0.0, 1.0);
              vec3 viewDir = normalize(cameraPosition - vWorldPosition);
              float fresnel = pow(1.0 - max(dot(normalize(vWorldNormal), viewDir), 0.0), 2.4);
              float alpha = reveal * pattern * (0.85 + fresnel * 0.45);
              vec3 color = shieldColor * (0.48 + pattern * 1.15 + fresnel * 0.55);

              gl_FragColor = vec4(color, alpha);
            }
          `}
        />
      </mesh>
    </group>
  );
}

function ShipWeaponEffects({
  autopilotActive,
  firingPrimaryRef,
  localShipRef,
  localStateRef,
  stationForceFields,
  shipConfig,
}: {
  autopilotActive: boolean;
  firingPrimaryRef: MutableRefObject<boolean>;
  localShipRef: MutableRefObject<THREE.Group | null>;
  localStateRef: MutableRefObject<LocalGameState>;
  stationForceFields: StationForceFieldData[];
  shipConfig: ShipConfig;
}): ReactElement {
  const { scene } = useThree();
  const weaponEffectsRef = useRef<THREE.Group>(null);
  const projectileHeadRefs = useRef<Array<THREE.Mesh | null>>([]);
  const projectileTracerCoreRefs = useRef<Array<THREE.Mesh | null>>([]);
  const projectileTracerGlowRefs = useRef<Array<THREE.Mesh | null>>([]);
  const flashCoreRefs = useRef<Array<THREE.Mesh | null>>([]);
  const flashGlowRefs = useRef<Array<THREE.Mesh | null>>([]);
  const impactFlashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const impactGlowRefs = useRef<Array<THREE.Mesh | null>>([]);
  const impactParticleRefs = useRef<Array<THREE.Mesh | null>>([]);
  const lastFireAtRef = useRef(-Infinity);
  const nextGunIndexRef = useRef(0);
  const nextProjectileIndexRef = useRef(0);
  const nextFlashIndexRef = useRef(0);
  const nextImpactIndexRef = useRef(0);
  const fallbackGunAnchors = useMemo(() => [
    new THREE.Vector3(0.92, -0.18, -2.2),
    new THREE.Vector3(-0.92, -0.18, -2.2),
  ], []);
  const gunAnchors = shipConfig.gunVecs.length ? shipConfig.gunVecs : fallbackGunAnchors;
  const projectiles = useMemo<WeaponProjectileEffect[]>(
    () => Array.from({ length: SHIP_WEAPON_MAX_PROJECTILES }, () => ({
      active: false,
      age: 0,
      position: new THREE.Vector3(),
      previousPosition: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
    })),
    [],
  );
  const flashes = useMemo<WeaponFlashEffect[]>(
    () => Array.from({ length: SHIP_WEAPON_MAX_FLASHES }, () => ({
      active: false,
      age: 0,
      life: SHIP_WEAPON_FLASH_LIFETIME_SECONDS,
      position: new THREE.Vector3(),
      localOffset: new THREE.Vector3(),
      scale: 1,
    })),
    [],
  );
  const impacts = useMemo<WeaponImpactEffect[]>(
    () => Array.from({ length: SHIP_WEAPON_MAX_IMPACTS }, () => ({
      active: false,
      age: 0,
      life: SHIP_WEAPON_IMPACT_LIFETIME_SECONDS,
      normal: new THREE.Vector3(0, 1, 0),
      particleOffsets: Array.from({ length: SHIP_WEAPON_IMPACT_PARTICLE_COUNT }, () => new THREE.Vector3()),
      particleVelocities: Array.from({ length: SHIP_WEAPON_IMPACT_PARTICLE_COUNT }, () => new THREE.Vector3()),
      position: new THREE.Vector3(),
    })),
    [],
  );
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const raycastTargets = useMemo<THREE.Mesh[]>(() => [], []);
  const projectileDirection = useMemo(() => new THREE.Vector3(), []);
  const tracerUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const impactNormal = useMemo(() => new THREE.Vector3(), []);
  const nextProjectilePosition = useMemo(() => new THREE.Vector3(), []);
  const randomVector = useMemo(() => new THREE.Vector3(), []);
  const shipForward = useMemo(() => new THREE.Vector3(), []);
  const muzzleWorld = useMemo(() => new THREE.Vector3(), []);
  const tracerDirection = useMemo(() => new THREE.Vector3(), []);
  const tracerGlowScale = useMemo(
    () => new THREE.Vector3(SHIP_WEAPON_PROJECTILE_RADIUS * 2.4, SHIP_WEAPON_PROJECTILE_LENGTH * 1.08, SHIP_WEAPON_PROJECTILE_RADIUS * 2.4),
    [],
  );
  const tracerMidpoint = useMemo(() => new THREE.Vector3(), []);
  const tracerQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tracerScale = useMemo(
    () => new THREE.Vector3(SHIP_WEAPON_PROJECTILE_RADIUS, SHIP_WEAPON_PROJECTILE_LENGTH, SHIP_WEAPON_PROJECTILE_RADIUS),
    [],
  );

  useFrame((frameState, delta) => {
    const state = localStateRef.current;
    const insideStationForceField = stationForceFields.some((field) => state.shipPosition.distanceToSquared(vectorFromTuple(field.position)) < field.radius ** 2);
    const shipSpeed = state.shipVelocity.length();
    const isPilotFiring = state.mode === 'pilot' && firingPrimaryRef.current && !insideStationForceField && !autopilotActive && shipSpeed <= 2000;

    if (state.mode !== 'pilot') {
      firingPrimaryRef.current = false;
    }

    if (isPilotFiring) {
      while (frameState.clock.elapsedTime - lastFireAtRef.current >= SHIP_WEAPON_FIRE_INTERVAL_SECONDS) {
        const gunAnchor = gunAnchors[nextGunIndexRef.current % gunAnchors.length];
        nextGunIndexRef.current += 1;

        muzzleWorld.copy(gunAnchor).applyQuaternion(state.shipRotation).add(state.shipPosition);
        shipForward.set(0, 0, -1).applyQuaternion(state.shipRotation).normalize();

        const projectile = projectiles[nextProjectileIndexRef.current % projectiles.length];
        nextProjectileIndexRef.current += 1;
        projectile.active = true;
        projectile.age = 0;
        projectile.position.copy(muzzleWorld);
        projectile.previousPosition.copy(muzzleWorld);
        projectile.velocity.copy(shipForward).multiplyScalar(SHIP_WEAPON_PROJECTILE_SPEED).add(state.shipVelocity);

        const flash = flashes[nextFlashIndexRef.current % flashes.length];
        nextFlashIndexRef.current += 1;
        flash.active = true;
        flash.age = 0;
        flash.life = SHIP_WEAPON_FLASH_LIFETIME_SECONDS;
        flash.position.copy(muzzleWorld);
        flash.localOffset.copy(gunAnchor);
        flash.scale = 0.48 + Math.random() * 0.24;

        lastFireAtRef.current = Number.isFinite(lastFireAtRef.current)
          ? lastFireAtRef.current + SHIP_WEAPON_FIRE_INTERVAL_SECONDS
          : frameState.clock.elapsedTime;

        if (!Number.isFinite(lastFireAtRef.current)) {
          lastFireAtRef.current = frameState.clock.elapsedTime;
        }

        if (frameState.clock.elapsedTime - lastFireAtRef.current < SHIP_WEAPON_FIRE_INTERVAL_SECONDS) {
          break;
        }
      }
    } else if (!Number.isFinite(lastFireAtRef.current) || lastFireAtRef.current === -Infinity) {
      lastFireAtRef.current = frameState.clock.elapsedTime;
    } else if (frameState.clock.elapsedTime - lastFireAtRef.current > SHIP_WEAPON_FIRE_INTERVAL_SECONDS * 3) {
      lastFireAtRef.current = frameState.clock.elapsedTime - SHIP_WEAPON_FIRE_INTERVAL_SECONDS;
    }

    for (let index = 0; index < projectiles.length; index += 1) {
      const projectile = projectiles[index];
      const headMesh = projectileHeadRefs.current[index];
      const tracerCoreMesh = projectileTracerCoreRefs.current[index];
      const tracerGlowMesh = projectileTracerGlowRefs.current[index];

      if (!headMesh || !tracerCoreMesh || !tracerGlowMesh) {
        continue;
      }

      if (!projectile.active) {
        headMesh.visible = false;
        tracerCoreMesh.visible = false;
        tracerGlowMesh.visible = false;
        continue;
      }

      projectile.age += delta;
      if (projectile.age >= SHIP_WEAPON_PROJECTILE_LIFETIME_SECONDS) {
        projectile.active = false;
        headMesh.visible = false;
        tracerCoreMesh.visible = false;
        tracerGlowMesh.visible = false;
        continue;
      }

      projectile.previousPosition.copy(projectile.position);
      nextProjectilePosition.copy(projectile.position).addScaledVector(projectile.velocity, delta);
      projectileDirection.copy(nextProjectilePosition).sub(projectile.position);
      const stepDistance = projectileDirection.length();

      if (stepDistance > 1e-5) {
        projectileDirection.divideScalar(stepDistance);
        raycaster.set(projectile.position, projectileDirection);
        raycaster.far = stepDistance;
        const forceFieldHit = findStationForceFieldHitOnSegment(projectile.position, nextProjectilePosition, stationForceFields);
        raycastTargets.length = 0;
        scene.traverseVisible((object) => {
          if (object instanceof THREE.Mesh && object.parent && !shouldIgnoreWeaponCollision(object, localShipRef, weaponEffectsRef)) {
            raycastTargets.push(object);
          }
        });
        const hits = raycaster.intersectObjects(raycastTargets, false);
        const validHit = hits.find((hit) => {
          if (!(hit.object instanceof THREE.Mesh)) {
            return false;
          }
          const shouldIgnore = hit.object.userData?.shouldIgnoreWeaponImpact;
          return typeof shouldIgnore === 'function' ? !shouldIgnore(hit) : true;
        });

        if (forceFieldHit && (!validHit || forceFieldHit.distance <= validHit.distance)) {
          projectile.active = false;
          headMesh.visible = false;
          tracerCoreMesh.visible = false;
          tracerGlowMesh.visible = false;

          const handleForceFieldImpact = stationForceFieldImpactHandlers.get(forceFieldHit.field.id);
          handleForceFieldImpact?.(forceFieldHit.point);

          const impact = impacts[nextImpactIndexRef.current % impacts.length];
          nextImpactIndexRef.current += 1;
          impact.active = true;
          impact.age = 0;
          impact.life = SHIP_WEAPON_IMPACT_LIFETIME_SECONDS;
          impact.position.copy(forceFieldHit.point);
          impactNormal.copy(forceFieldHit.point).sub(vectorFromTuple(forceFieldHit.field.position)).normalize();
          impact.normal.copy(impactNormal);

          for (let particleIndex = 0; particleIndex < SHIP_WEAPON_IMPACT_PARTICLE_COUNT; particleIndex += 1) {
            impact.particleOffsets[particleIndex].set(0, 0, 0);
            randomVector.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            impact.particleVelocities[particleIndex]
              .copy(impact.normal)
              .multiplyScalar(7 + Math.random() * 8)
              .addScaledVector(randomVector, 4 + Math.random() * 6);
          }

          continue;
        }

        if (validHit) {
          projectile.active = false;
          headMesh.visible = false;
          tracerCoreMesh.visible = false;
          tracerGlowMesh.visible = false;

          const onWeaponImpact = validHit.object.userData?.onWeaponImpact;
          const impactResult = typeof onWeaponImpact === 'function' ? onWeaponImpact(validHit) : null;
          const suppressDefaultImpact = Boolean(impactResult?.suppressDefaultImpact || validHit.object.userData?.suppressWeaponImpactEffect);
          if (suppressDefaultImpact) {
            continue;
          }

          const impact = impacts[nextImpactIndexRef.current % impacts.length];
          nextImpactIndexRef.current += 1;
          impact.active = true;
          impact.age = 0;
          impact.life = SHIP_WEAPON_IMPACT_LIFETIME_SECONDS;
          impact.position.copy(validHit.point);
          impactNormal.copy(validHit.face?.normal ?? projectileDirection).normalize();
          impactNormal.transformDirection((validHit.object as THREE.Mesh).matrixWorld);
          impact.normal.copy(impactNormal.normalize());

          for (let particleIndex = 0; particleIndex < SHIP_WEAPON_IMPACT_PARTICLE_COUNT; particleIndex += 1) {
            impact.particleOffsets[particleIndex].set(0, 0, 0);
            randomVector.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            impact.particleVelocities[particleIndex]
              .copy(impact.normal)
              .multiplyScalar(7 + Math.random() * 8)
              .addScaledVector(randomVector, 4 + Math.random() * 6);
          }

          continue;
        }
      }

      projectile.position.copy(nextProjectilePosition);
      tracerDirection.copy(projectile.velocity).normalize();
      tracerMidpoint.copy(projectile.position).addScaledVector(tracerDirection, -SHIP_WEAPON_PROJECTILE_LENGTH * 0.5);
      tracerQuaternion.setFromUnitVectors(tracerUp, tracerDirection);

      headMesh.visible = true;
      headMesh.position.copy(projectile.position);
      headMesh.scale.setScalar(SHIP_WEAPON_PROJECTILE_RADIUS * 3.25);

      tracerCoreMesh.visible = true;
      tracerCoreMesh.position.copy(tracerMidpoint);
      tracerCoreMesh.quaternion.copy(tracerQuaternion);
      tracerCoreMesh.scale.copy(tracerScale);

      tracerGlowMesh.visible = true;
      tracerGlowMesh.position.copy(tracerMidpoint);
      tracerGlowMesh.quaternion.copy(tracerQuaternion);
      tracerGlowMesh.scale.copy(tracerGlowScale);
    }

    for (let index = 0; index < flashes.length; index += 1) {
      const flash = flashes[index];
      const flashCoreMesh = flashCoreRefs.current[index];
      const flashGlowMesh = flashGlowRefs.current[index];

      if (!flashCoreMesh || !flashGlowMesh) {
        continue;
      }

      if (!flash.active) {
        flashCoreMesh.visible = false;
        flashGlowMesh.visible = false;
        continue;
      }

      flash.age += delta;
      if (flash.age >= flash.life) {
        flash.active = false;
        flashCoreMesh.visible = false;
        flashGlowMesh.visible = false;
        continue;
      }

      const alpha = 1 - flash.age / flash.life;
      const flashPosition = flash.position.copy(flash.localOffset).applyQuaternion(state.shipRotation).add(state.shipPosition);
      flashCoreMesh.visible = true;
      flashCoreMesh.position.copy(flashPosition);
      flashCoreMesh.scale.setScalar(flash.scale * (0.45 + alpha * 1.2));
      flashGlowMesh.visible = true;
      flashGlowMesh.position.copy(flashPosition);
      flashGlowMesh.scale.setScalar(flash.scale * (0.9 + alpha * 2.0));
      const flashCoreMaterial = flashCoreMesh.material;
      if (flashCoreMaterial instanceof THREE.MeshBasicMaterial) {
        flashCoreMaterial.opacity = 0.78 + alpha * 0.22;
      }
      const flashGlowMaterial = flashGlowMesh.material;
      if (flashGlowMaterial instanceof THREE.MeshBasicMaterial) {
        flashGlowMaterial.opacity = 0.36 + alpha * 0.26;
      }
    }

    for (let impactIndex = 0; impactIndex < impacts.length; impactIndex += 1) {
      const impact = impacts[impactIndex];
      const impactFlashMesh = impactFlashRefs.current[impactIndex];
      const impactGlowMesh = impactGlowRefs.current[impactIndex];

      if (!impactFlashMesh || !impactGlowMesh) {
        continue;
      }

      if (!impact.active) {
        impactFlashMesh.visible = false;
        impactGlowMesh.visible = false;
        for (let particleIndex = 0; particleIndex < SHIP_WEAPON_IMPACT_PARTICLE_COUNT; particleIndex += 1) {
          const particleMesh = impactParticleRefs.current[impactIndex * SHIP_WEAPON_IMPACT_PARTICLE_COUNT + particleIndex];
          if (particleMesh) {
            particleMesh.visible = false;
          }
        }
        continue;
      }

      impact.age += delta;
      if (impact.age >= impact.life) {
        impact.active = false;
        impactFlashMesh.visible = false;
        impactGlowMesh.visible = false;
        for (let particleIndex = 0; particleIndex < SHIP_WEAPON_IMPACT_PARTICLE_COUNT; particleIndex += 1) {
          const particleMesh = impactParticleRefs.current[impactIndex * SHIP_WEAPON_IMPACT_PARTICLE_COUNT + particleIndex];
          if (particleMesh) {
            particleMesh.visible = false;
          }
        }
        continue;
      }

      const impactAlpha = 1 - impact.age / impact.life;
      impactFlashMesh.visible = true;
      impactFlashMesh.position.copy(impact.position);
      impactFlashMesh.scale.setScalar((0.18 + impactAlpha * 0.72) * SHIP_WEAPON_IMPACT_SCALE_MULTIPLIER);
      const impactFlashMaterial = impactFlashMesh.material;
      if (impactFlashMaterial instanceof THREE.MeshBasicMaterial) {
        impactFlashMaterial.opacity = 0.45 + impactAlpha * 0.55;
      }

      impactGlowMesh.visible = true;
      impactGlowMesh.position.copy(impact.position);
      impactGlowMesh.scale.setScalar((0.35 + impactAlpha * 1.4) * SHIP_WEAPON_IMPACT_SCALE_MULTIPLIER);
      const impactGlowMaterial = impactGlowMesh.material;
      if (impactGlowMaterial instanceof THREE.MeshBasicMaterial) {
        impactGlowMaterial.opacity = 0.18 + impactAlpha * 0.2;
      }

      for (let particleIndex = 0; particleIndex < SHIP_WEAPON_IMPACT_PARTICLE_COUNT; particleIndex += 1) {
        const particleMesh = impactParticleRefs.current[impactIndex * SHIP_WEAPON_IMPACT_PARTICLE_COUNT + particleIndex];
        if (!particleMesh) {
          continue;
        }

        impact.particleOffsets[particleIndex].addScaledVector(impact.particleVelocities[particleIndex], delta);
        impact.particleVelocities[particleIndex].multiplyScalar(Math.max(0, 1 - 3.8 * delta));
        impact.particleVelocities[particleIndex].addScaledVector(impact.normal, -2.2 * delta);

        particleMesh.visible = true;
        particleMesh.position.copy(impact.position).add(impact.particleOffsets[particleIndex]);
        particleMesh.scale.setScalar((0.03 + impactAlpha * 0.08) * SHIP_WEAPON_IMPACT_SCALE_MULTIPLIER);
        const particleMaterial = particleMesh.material;
        if (particleMaterial instanceof THREE.MeshBasicMaterial) {
          particleMaterial.opacity = 0.1 + impactAlpha * 0.5;
        }
      }
    }
  });

  return (
    <group ref={weaponEffectsRef} userData={{ ignoreWeaponCollision: true, ignoreOutline: true }}>
      {projectiles.map((_, index) => (
        <group key={`weapon-projectile-${index}`}>
          <mesh ref={(mesh) => {
            projectileTracerGlowRefs.current[index] = mesh;
          }} visible={false} renderOrder={60}>
            <cylinderGeometry args={[1, 1, 1, 8, 1, true]} />
            <meshBasicMaterial color="#ff8a47" transparent opacity={0.22} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh ref={(mesh) => {
            projectileTracerCoreRefs.current[index] = mesh;
          }} visible={false} renderOrder={61}>
            <cylinderGeometry args={[1, 1, 1, 8, 1, true]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.96} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh ref={(mesh) => {
            projectileHeadRefs.current[index] = mesh;
          }} visible={false} renderOrder={62}>
            <sphereGeometry args={[1, 10, 10]} />
            <meshBasicMaterial color="#fff3d6" transparent opacity={1} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      ))}
      {flashes.map((_, index) => (
        <group key={`weapon-flash-${index}`}>
          <mesh ref={(mesh) => {
            flashGlowRefs.current[index] = mesh;
          }} visible={false} renderOrder={63}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color="#fff0d8" transparent opacity={0.6} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh ref={(mesh) => {
            flashCoreRefs.current[index] = mesh;
          }} visible={false} renderOrder={64}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={1} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
        </group>
      ))}
      {impacts.map((_, impactIndex) => (
        <group key={`weapon-impact-${impactIndex}`}>
          <mesh ref={(mesh) => {
            impactGlowRefs.current[impactIndex] = mesh;
          }} visible={false} renderOrder={65}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color="#ff9d57" transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          <mesh ref={(mesh) => {
            impactFlashRefs.current[impactIndex] = mesh;
          }} visible={false} renderOrder={66}>
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color="#fff4df" transparent opacity={1} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          {Array.from({ length: SHIP_WEAPON_IMPACT_PARTICLE_COUNT }, (_, particleIndex) => (
            <mesh
              key={`weapon-impact-${impactIndex}-particle-${particleIndex}`}
              ref={(mesh) => {
                impactParticleRefs.current[impactIndex * SHIP_WEAPON_IMPACT_PARTICLE_COUNT + particleIndex] = mesh;
              }}
              visible={false}
              renderOrder={67}
            >
              <sphereGeometry args={[1, 8, 8]} />
              <meshBasicMaterial color="#d9c2a3" transparent opacity={0.6} depthWrite={false} toneMapped={false} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function ShipThrusterEffects({
  localStateRef,
  shipConfig,
}: {
  localStateRef: MutableRefObject<LocalGameState>;
  shipConfig: ShipConfig;
}): ReactElement {
  const thrusterFlameRefs = useRef<Array<THREE.Mesh | null>>([]);
  const thrusterGlowRefs = useRef<Array<THREE.Mesh | null>>([]);
  const thrusterParticleRefs = useRef<Array<THREE.Mesh | null>>([]);
  const previousVelocityRef = useRef(new THREE.Vector3());
  const intensityRef = useRef(0);
  const initializedRef = useRef(false);
  const fallbackThrusters = useMemo(
    () => [
      new THREE.Vector3(0.5, -0.2, 2.1),
      new THREE.Vector3(-0.5, -0.2, 2.1),
    ],
    [],
  );
  const thrusterAnchors = shipConfig.thrusterVecs.length ? shipConfig.thrusterVecs : fallbackThrusters;
  const inverseRotation = useMemo(() => new THREE.Quaternion(), []);
  const localVelocity = useMemo(() => new THREE.Vector3(), []);
  const localAcceleration = useMemo(() => new THREE.Vector3(), []);
  const baseOffset = useMemo(() => new THREE.Vector3(0, 0, 0.15), []);
  const flamePosition = useMemo(() => new THREE.Vector3(), []);
  const glowPosition = useMemo(() => new THREE.Vector3(), []);
  const particlePosition = useMemo(() => new THREE.Vector3(), []);
  const flameScale = useMemo(() => new THREE.Vector3(), []);
  const glowScale = useMemo(() => new THREE.Vector3(), []);

  useFrame((frameState, delta) => {
    const state = localStateRef.current;

    if (!initializedRef.current) {
      previousVelocityRef.current.copy(state.shipVelocity);
      initializedRef.current = true;
    }

    if (delta > 1e-5) {
      localAcceleration.copy(state.shipVelocity).sub(previousVelocityRef.current).divideScalar(delta);
    } else {
      localAcceleration.set(0, 0, 0);
    }
    previousVelocityRef.current.copy(state.shipVelocity);

    inverseRotation.copy(state.shipRotation).invert();
    localVelocity.copy(state.shipVelocity).applyQuaternion(inverseRotation);
    localAcceleration.applyQuaternion(inverseRotation);

    const forwardSpeed = Math.max(0, -localVelocity.z);
    const accelerationMagnitude = localAcceleration.length();
    const forwardAcceleration = Math.max(0, -localAcceleration.z);
    const speedFactor = clamp(
      forwardSpeed / Math.max(1, SHIP_MAX_SPEED_METERS_PER_SECOND * shipConfig.speedMultiplier),
      0,
      1,
    );
    const accelFactor = clamp(
      forwardAcceleration / Math.max(1, SHIP_MANUAL_FORWARD_THRUST * shipConfig.accelerationMultiplier * 1.1),
      0,
      1,
    );
    const maneuverFactor = clamp(
      accelerationMagnitude / Math.max(1, SHIP_MANUAL_FORWARD_THRUST * shipConfig.accelerationMultiplier * 2.2),
      0,
      1,
    );
    const idleFactor = state.mode === 'pilot' ? 0.2 : 0;
    const boostedIntensity = clamp(
      Math.max(
        idleFactor + speedFactor * 0.55 + accelFactor * 0.42,
        idleFactor + maneuverFactor * 0.4,
      ),
      0,
      1,
    );
    const targetIntensity = state.mode === 'interior'
      ? 0
      : (state.shipBraking ? idleFactor : boostedIntensity);

    intensityRef.current = THREE.MathUtils.lerp(intensityRef.current, targetIntensity, clamp(delta / SHIP_THRUSTER_SMOOTH_TIME_SECONDS, 0, 1));

    const intensity = intensityRef.current;
    const activeFlameFactor = clamp((intensity - idleFactor) / Math.max(1e-5, 1 - idleFactor), 0, 1);
    const activePlumeLength = SHIP_THRUSTER_PLUME_LENGTH * (0.22 + activeFlameFactor * 1.03 + speedFactor * 0.68);
    const plumeLength = THREE.MathUtils.lerp(SHIP_THRUSTER_IDLE_PLUME_LENGTH, activePlumeLength, activeFlameFactor);
    const plumeRadius = SHIP_THRUSTER_PLUME_RADIUS * (0.85 + intensity * 0.8);
    const elapsed = frameState.clock.elapsedTime;

    for (let thrusterIndex = 0; thrusterIndex < thrusterAnchors.length; thrusterIndex += 1) {
      const anchor = thrusterAnchors[thrusterIndex];
      const glowMesh = thrusterGlowRefs.current[thrusterIndex];
      const visible = intensity > 0.015;
      const flameVisible = visible && plumeLength > 0.08;

      for (let blobIndex = 0; blobIndex < SHIP_THRUSTER_FLAME_BLOB_COUNT; blobIndex += 1) {
        const flameMesh = thrusterFlameRefs.current[thrusterIndex * SHIP_THRUSTER_FLAME_BLOB_COUNT + blobIndex];
        if (!flameMesh) {
          continue;
        }

        flameMesh.visible = flameVisible;
        if (!flameVisible) {
          continue;
        }

        const blobPhase = blobIndex / Math.max(1, SHIP_THRUSTER_FLAME_BLOB_COUNT - 1);
        const turbulence = elapsed * (1.5 + intensity * 2.6) + thrusterIndex * 0.91 + blobIndex * 1.37;
        const widthJitter = 0.82 + 0.2 * Math.sin(turbulence * 1.8);
        const sideJitter = 0.04 + intensity * 0.06;
        flamePosition.copy(anchor).add(baseOffset);
        flamePosition.x += Math.sin(turbulence * 1.9) * sideJitter * (0.2 + blobPhase);
        flamePosition.y += Math.cos(turbulence * 1.6) * sideJitter * (0.18 + blobPhase * 0.8);
        flamePosition.z += plumeLength * (0.12 + blobPhase * 0.72);
        flameMesh.position.copy(flamePosition);

        const blobRadius = plumeRadius * (1.1 - blobPhase * 0.45) * widthJitter;
        const blobLength = plumeLength * (0.38 - blobPhase * 0.05) * (0.92 + 0.16 * Math.sin(turbulence));
        flameScale.set(blobRadius, blobRadius, blobLength);
        flameMesh.scale.copy(flameScale);

        const flameMaterial = flameMesh.material;
        if (flameMaterial instanceof THREE.MeshBasicMaterial) {
          flameMaterial.opacity = (0.26 + intensity * 0.22) * (1 - blobPhase * 0.14);
        }
      }

      if (glowMesh) {
        glowMesh.visible = visible;
        if (visible) {
          glowPosition.copy(anchor).add(baseOffset);
          glowMesh.position.copy(glowPosition);
          const flicker = 0.88 + 0.12 * Math.sin(elapsed * 22 + thrusterIndex * 1.73);
          glowScale.setScalar((SHIP_THRUSTER_GLOW_RADIUS * (0.5 + intensity * 1.25)) * flicker);
          glowMesh.scale.copy(glowScale);
          const glowMaterial = glowMesh.material;
          if (glowMaterial instanceof THREE.MeshBasicMaterial) {
            glowMaterial.opacity = 0.18 + intensity * 0.16;
          }
        }
      }

      for (let particleIndex = 0; particleIndex < SHIP_THRUSTER_PARTICLE_COUNT; particleIndex += 1) {
        const mesh = thrusterParticleRefs.current[thrusterIndex * SHIP_THRUSTER_PARTICLE_COUNT + particleIndex];
        if (!mesh) {
          continue;
        }

        mesh.visible = visible && activeFlameFactor > 0.08;
        if (!mesh.visible) {
          continue;
        }

        const phase = (elapsed * (1.8 + intensity * 5.2) + thrusterIndex * 0.37 + particleIndex / SHIP_THRUSTER_PARTICLE_COUNT) % 1;
        const driftAngle = thrusterIndex * 2.4 + particleIndex * 1.7;
        particlePosition.copy(anchor).add(baseOffset);
        particlePosition.x += Math.cos(driftAngle) * SHIP_THRUSTER_PARTICLE_DRIFT * phase;
        particlePosition.y += Math.sin(driftAngle) * SHIP_THRUSTER_PARTICLE_DRIFT * phase;
        particlePosition.z += phase * plumeLength;
        mesh.position.copy(particlePosition);
        mesh.scale.setScalar(0.05 + intensity * 0.11 + (1 - phase) * 0.08);
        const particleMaterial = mesh.material;
        if (particleMaterial instanceof THREE.MeshBasicMaterial) {
          particleMaterial.opacity = (0.08 + intensity * 0.3) * (1 - phase * 0.72);
        }
      }
    }
  });

  return (
    <group userData={{ ignoreOutline: true, ignoreWeaponCollision: true }}>
      {thrusterAnchors.map((_, thrusterIndex) => (
        <group key={`thruster-${thrusterIndex}`}>
          {Array.from({ length: SHIP_THRUSTER_FLAME_BLOB_COUNT }, (_, blobIndex) => (
            <mesh
              key={`thruster-${thrusterIndex}-flame-${blobIndex}`}
              ref={(mesh) => {
                thrusterFlameRefs.current[thrusterIndex * SHIP_THRUSTER_FLAME_BLOB_COUNT + blobIndex] = mesh;
              }}
              visible={false}
              renderOrder={58}
            >
              <sphereGeometry args={[1, 10, 10]} />
              <meshBasicMaterial color="#c9fbff" transparent opacity={0.42} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </mesh>
          ))}
          <mesh
            ref={(mesh) => {
              thrusterGlowRefs.current[thrusterIndex] = mesh;
            }}
            visible={false}
            renderOrder={59}
          >
            <sphereGeometry args={[1, 12, 12]} />
            <meshBasicMaterial color="#4fe7ff" transparent opacity={0.3} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </mesh>
          {Array.from({ length: SHIP_THRUSTER_PARTICLE_COUNT }, (_, particleIndex) => (
            <mesh
              key={`thruster-${thrusterIndex}-particle-${particleIndex}`}
              ref={(mesh) => {
                thrusterParticleRefs.current[thrusterIndex * SHIP_THRUSTER_PARTICLE_COUNT + particleIndex] = mesh;
              }}
              visible={false}
              renderOrder={57}
            >
              <sphereGeometry args={[1, 8, 8]} />
              <meshBasicMaterial color="#8bf3ff" transparent opacity={0.22} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function StarSystem({ autopilotTarget, highlightedTarget, renderPosition, system, localStateRef }: { autopilotTarget: AutopilotDestination | null; highlightedTarget: HighlightTarget | null; renderPosition: Vec3Tuple; system: StarSystemData; localStateRef: MutableRefObject<LocalGameState> }): ReactElement {
  const { camera } = useThree();
  const starVisualsRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const haloMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const worldPosition = useMemo(() => new THREE.Vector3(...renderPosition), [renderPosition]);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraForward = useMemo(() => new THREE.Vector3(), []);
  const toStarDirection = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const group = starVisualsRef.current;
    if (group) {
      outlineExcludedObjects.add(group);
    }
    return () => {
      if (group) {
        outlineExcludedObjects.delete(group);
      }
    };
  }, []);

  useFrame(() => {
    if (!haloRef.current || !haloMaterialRef.current) {
      return;
    }

    projectedPosition.copy(worldPosition).project(camera);
    camera.getWorldDirection(cameraForward);
    toStarDirection.copy(worldPosition).sub(camera.position).normalize();
    const distance = worldPosition.distanceTo(camera.position);
    const inBodyRange = distance <= LOCAL_STAR_BODY_VISIBILITY_RANGE;
    const inFront = cameraForward.dot(toStarDirection) > 0;
    const frontFactor = inFront ? 1 : 0;
    const edgeDistance = Math.max(Math.abs(projectedPosition.x), Math.abs(projectedPosition.y));
    const edgeFactor = THREE.MathUtils.clamp(1 - Math.max(0, edgeDistance - 0.82) / 0.78, 0, 1);

    if (!inBodyRange || frontFactor <= 0 || edgeFactor <= 0) {
      haloRef.current.visible = false;
      return;
    }

    haloRef.current.visible = true;

    const distanceFactor = THREE.MathUtils.clamp(1 - distance / LOCAL_STAR_BODY_VISIBILITY_RANGE, 0, 1);
    const closeBoost = distanceFactor;
    const screenRadiusNdc = getStarScreenRadiusNdc(camera, distance, system.radius);
    const screenFactor = THREE.MathUtils.clamp(Math.pow(screenRadiusNdc / 0.028, 0.65), 0.38, 4.2);
    const visibilityFactor = frontFactor * (0.28 + edgeFactor * 0.72);
    const haloScale = 2.05 + closeBoost * 0.8 + screenFactor * 0.75;
    const haloOpacity = THREE.MathUtils.clamp((0.08 + closeBoost * 0.12 + screenFactor * 0.03) * visibilityFactor, 0.03, 0.42);

    haloRef.current.scale.setScalar(haloScale);
    haloMaterialRef.current.opacity = haloOpacity;
  });

  return (
    <>
      <StarLensFlare starPosition={renderPosition} starRadius={system.radius} />
      <PhysicalProxyGroup
        linearDistance={STAR_PROXY_LINEAR_DISTANCE}
        logarithmicFactor={STAR_PROXY_LOG_FACTOR}
        physicalPosition={renderPosition}
        visibleRange={STAR_LENS_FLARE_RANGE}
      >
        <group ref={starVisualsRef}>
          <mesh userData={{ ignoreStarOcclusion: true }}>
            <sphereGeometry args={[system.radius, 24, 24]} />
            <meshBasicMaterial color={system.color} />
          </mesh>
          <mesh ref={haloRef} scale={1.85} userData={{ ignoreStarOcclusion: true }}>
            <sphereGeometry args={[system.radius, 20, 20]} />
            <meshBasicMaterial ref={haloMaterialRef} color={system.color} transparent opacity={0.11} />
          </mesh>
        </group>
      </PhysicalProxyGroup>

      <SpaceStation station={system.station} physicalPosition={tupleAdd(renderPosition, system.station.position)} scale={STAR_STATION_SCALE} />

      {system.planets.map((planet) => (
        <PlanetBody key={planet.id} physicalPosition={tupleAdd(renderPosition, planet.position)} planet={planet} />
      ))}

      {autopilotTarget && autopilotTarget.systemId === system.id ? (
        <AutopilotTargetTag target={autopilotTarget} renderPosition={renderPosition} localStateRef={localStateRef} />
      ) : null}

      {highlightedTarget && highlightedTarget.kind !== 'ship' && highlightedTarget.systemId === system.id && highlightedTarget.id !== autopilotTarget?.id ? (
        <AutopilotTargetTag target={highlightedTarget} renderPosition={renderPosition} localStateRef={localStateRef} />
      ) : null}

      {system.asteroidGroups.map((asteroidGroup) => (
        <AsteroidCluster key={asteroidGroup.id} group={asteroidGroup} localStateRef={localStateRef} physicalPosition={tupleAdd(renderPosition, asteroidGroup.position)} />
      ))}
    </>
  );
}

function StarLensFlare({ starPosition, starRadius }: { starPosition: Vec3Tuple; starRadius: number }): ReactElement {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const coreSpriteRef = useRef<THREE.Sprite>(null);
  const haloSpriteRef = useRef<THREE.Sprite>(null);
  const coreMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const haloMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const flareTexture = useMemo(() => createLensFlareTexture(), []);
  const worldPosition = useMemo(() => new THREE.Vector3(...starPosition), [starPosition]);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);
  const cameraForward = useMemo(() => new THREE.Vector3(), []);
  const toStarDirection = useMemo(() => new THREE.Vector3(), []);
  const proxyOffset = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const group = groupRef.current;
    if (group) {
      outlineExcludedObjects.add(group);
    }
    return () => {
      if (group) {
        outlineExcludedObjects.delete(group);
      }
      flareTexture.dispose();
    };
  }, [flareTexture]);

  useFrame((state) => {
    if (
      !groupRef.current ||
      !coreSpriteRef.current ||
      !haloSpriteRef.current ||
      !coreMaterialRef.current ||
      !haloMaterialRef.current
    ) {
      return;
    }

    projectedPosition.copy(worldPosition).project(camera);
    camera.getWorldDirection(cameraForward);
    toStarDirection.copy(worldPosition).sub(camera.position).normalize();
    const distance = worldPosition.distanceTo(camera.position);
    const inRange = distance <= STAR_LENS_FLARE_RANGE;
    const inFront = cameraForward.dot(toStarDirection) > 0;
    const frontFactor = inFront ? 1 : 0;
    const edgeDistance = Math.max(Math.abs(projectedPosition.x), Math.abs(projectedPosition.y));
    const edgeFactor = THREE.MathUtils.clamp(1 - Math.max(0, edgeDistance - 0.8) / 0.95, 0, 1);
    const couldBeVisible = inRange && frontFactor > 0 && edgeFactor > 0;

    if (!couldBeVisible) {
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;
    const compressedDistance = compressProxyDistance(distance, STAR_PROXY_LINEAR_DISTANCE, STAR_PROXY_LOG_FACTOR);
    const proxyScale = clamp(compressedDistance / distance, MIN_PROXY_SCALE, 1);

    proxyOffset.copy(toStarDirection).multiplyScalar(compressedDistance);
    groupRef.current.position.copy(camera.position).add(proxyOffset);
    groupRef.current.scale.setScalar(proxyScale);
    groupRef.current.quaternion.copy(camera.quaternion);
    coreSpriteRef.current.position.setScalar(0);
    haloSpriteRef.current.position.setScalar(0);

    const distanceFactor = THREE.MathUtils.clamp(1 - distance / STAR_LENS_FLARE_RANGE, 0, 1);
    const closeBoost = distanceFactor;
    const viewFactor = THREE.MathUtils.clamp(0.12 + edgeFactor * 0.88, 0, 1) * frontFactor;
    const screenRadiusNdc = getStarScreenRadiusNdc(camera, distance, starRadius);
    const screenFactor = THREE.MathUtils.clamp(Math.pow(screenRadiusNdc / 0.026, 0.7), 0.45, 4.8);
    const opacity = THREE.MathUtils.clamp((0.035 + distanceFactor * 0.1 + closeBoost * 0.18) * viewFactor * (0.7 + screenFactor * 0.22), 0.012, 0.38);

    coreMaterialRef.current.opacity = opacity;
    haloMaterialRef.current.opacity = opacity * 0.68;

    const starScale = THREE.MathUtils.clamp(starRadius * 0.00012, 0.045, 0.12);
    const flareScale = starScale * (1.2 + distanceFactor * 0.7 + closeBoost * 0.95 + screenFactor * 0.45);
    const spriteDistanceScale = compressedDistance / 2;
    coreSpriteRef.current.scale.setScalar((flareScale * spriteDistanceScale) / proxyScale);
    haloSpriteRef.current.scale.setScalar((flareScale * 3.8 * spriteDistanceScale) / proxyScale);
  });

  return (
    <group ref={groupRef} userData={{ ignoreStarOcclusion: true, ignoreMarkerOcclusion: true }}>
      <sprite ref={coreSpriteRef} userData={{ ignoreStarOcclusion: true, ignoreMarkerOcclusion: true }}>
        <spriteMaterial
          ref={coreMaterialRef}
          attach="material"
          map={flareTexture}
          color="#ffffff"
          transparent
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite ref={haloSpriteRef} userData={{ ignoreStarOcclusion: true, ignoreMarkerOcclusion: true }}>
        <spriteMaterial
          ref={haloMaterialRef}
          attach="material"
          map={flareTexture}
          color="#8eb8ff"
          transparent
          depthWrite={false}
          depthTest
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

function PhysicalProxyGroup({
  children,
  excludeFromOutline = false,
  excludeFromOutlineWhenProxy = false,
  linearDistance = CELESTIAL_PROXY_LINEAR_DISTANCE,
  logarithmicFactor = CELESTIAL_PROXY_LOG_FACTOR,
  physicalPosition,
  visibleRange,
}: {
  children: ReactNode;
  excludeFromOutline?: boolean;
  excludeFromOutlineWhenProxy?: boolean;
  linearDistance?: number;
  logarithmicFactor?: number;
  physicalPosition: Vec3Tuple;
  visibleRange: number;
}): ReactElement {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const outlineExcludedRef = useRef(false);
  const physicalPositionVector = useMemo(() => new THREE.Vector3(...physicalPosition), [physicalPosition]);
  const direction = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => () => {
    setOutlineExcluded(groupRef.current, false);
    outlineExcludedRef.current = false;
  }, []);

  useFrame(() => {
    if (!groupRef.current) {
      return;
    }

    direction.copy(physicalPositionVector).sub(camera.position);
    const physicalDistance = direction.length();
    const shouldExcludeFromOutline = excludeFromOutline || (excludeFromOutlineWhenProxy && physicalDistance > linearDistance);

    if (shouldExcludeFromOutline !== outlineExcludedRef.current) {
      setOutlineExcluded(groupRef.current, shouldExcludeFromOutline);
      outlineExcludedRef.current = shouldExcludeFromOutline;
    }

    if (physicalDistance > visibleRange) {
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;

    if (physicalDistance <= linearDistance || physicalDistance <= 1e-6) {
      groupRef.current.position.copy(physicalPositionVector);
      groupRef.current.scale.setScalar(1);
      return;
    }

    const compressedDistance = compressProxyDistance(physicalDistance, linearDistance, logarithmicFactor);
    const scale = clamp(compressedDistance / physicalDistance, MIN_PROXY_SCALE, 1);

    direction.normalize().multiplyScalar(compressedDistance);
    groupRef.current.position.copy(camera.position).add(direction);
    groupRef.current.scale.setScalar(scale);
  });

  return <group ref={groupRef}>{children}</group>;
}

function AdaptiveBodySurface({
  color,
  detailDistance = BODY_DETAIL_SPHERE_DISTANCE,
  lowSegments,
  metalness,
  physicalPosition,
  radius,
  roughness,
  surfaceTexture,
  terrainDistance = PLANET_TERRAIN_RENDER_DISTANCE,
}: {
  color: string;
  detailDistance?: number;
  lowSegments: number;
  metalness: number;
  physicalPosition: Vec3Tuple;
  radius: number;
  roughness: number;
  surfaceTexture?: THREE.Texture;
  terrainDistance?: number;
}): ReactElement {
  const { camera } = useThree();
  const lowRef = useRef<THREE.Mesh>(null);
  const highRef = useRef<THREE.Mesh>(null);
  const physicalPositionVector = useMemo(() => new THREE.Vector3(...physicalPosition), [physicalPosition]);
  const highSegments = lowSegments * 2;

  useFrame(() => {
    const distanceToSurface = camera.position.distanceTo(physicalPositionVector) - radius;
    const showTerrainOnly = distanceToSurface <= terrainDistance;
    const showHighDetailSphere = !showTerrainOnly && distanceToSurface <= detailDistance;

    if (lowRef.current) {
      lowRef.current.visible = !showTerrainOnly && !showHighDetailSphere;
    }
    if (highRef.current) {
      highRef.current.visible = showHighDetailSphere;
    }
  });

  return (
    <>
      <mesh ref={lowRef}>
        <sphereGeometry args={[radius, lowSegments, lowSegments]} />
        <meshStandardMaterial color={color} map={surfaceTexture} roughness={roughness} metalness={metalness} />
      </mesh>
      <mesh ref={highRef} visible={false}>
        <sphereGeometry args={[radius, highSegments, highSegments]} />
        <meshStandardMaterial color={color} map={surfaceTexture} roughness={roughness} metalness={metalness} />
      </mesh>
    </>
  );
}

function PlanetBody({ physicalPosition, planet }: { physicalPosition: Vec3Tuple; planet: PlanetData }): ReactElement {
  const textureLibrary = usePlanetTextureLibrary();
  const surfaceTexture = useMemo(() => pickBodySurfaceTexture(textureLibrary, planet.id), [planet.id, textureLibrary]);

  return (
    <>
      <PhysicalProxyGroup physicalPosition={physicalPosition} visibleRange={PLANET_VISIBILITY_RANGE}>
        <AdaptiveBodySurface
          color={planet.color}
          lowSegments={20}
          metalness={0.04}
          physicalPosition={physicalPosition}
          radius={planet.radius}
          roughness={0.96}
          surfaceTexture={surfaceTexture}
        />
      </PhysicalProxyGroup>

      <PlanetTerrain
        planetPosition={physicalPosition}
        planetRadius={planet.radius}
        planetId={planet.id}
        planetColor={planet.color}
      />

      {planet.stations.map((station) => (
        <SpaceStation key={station.id} station={station} physicalPosition={tupleAdd(physicalPosition, station.position)} scale={PLANET_STATION_SCALE} />
      ))}

      {planet.moons.map((moon) => (
        <MoonBody key={moon.id} physicalPosition={tupleAdd(physicalPosition, moon.position)} moon={moon} />
      ))}
    </>
  );
}

function MoonBody({ moon, physicalPosition }: { moon: MoonData; physicalPosition: Vec3Tuple }): ReactElement {
  const textureLibrary = usePlanetTextureLibrary();
  const surfaceTexture = useMemo(() => pickBodySurfaceTexture(textureLibrary, moon.id), [moon.id, textureLibrary]);

  return (
    <>
      <PhysicalProxyGroup physicalPosition={physicalPosition} visibleRange={PLANET_VISIBILITY_RANGE}>
        <AdaptiveBodySurface
          color={moon.color}
          lowSegments={16}
          metalness={0.03}
          physicalPosition={physicalPosition}
          radius={moon.radius}
          roughness={0.98}
          surfaceTexture={surfaceTexture}
        />
      </PhysicalProxyGroup>

      <PlanetTerrain
        planetPosition={physicalPosition}
        planetRadius={moon.radius}
        planetId={moon.id}
        planetColor={moon.color}
      />

      {moon.stations.map((station) => (
        <SpaceStation key={station.id} station={station} physicalPosition={tupleAdd(physicalPosition, station.position)} scale={PLANET_STATION_SCALE} />
      ))}
    </>
  );
}

function DistanceVisibleGroup({
  children,
  position = [0, 0, 0],
  visibleRange,
}: {
  children: ReactNode;
  position?: [number, number, number];
  visibleRange: number;
}): ReactElement {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  const visibleRangeSquared = visibleRange * visibleRange;

  useFrame(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.getWorldPosition(scratch);
    groupRef.current.visible = scratch.distanceToSquared(camera.position) <= visibleRangeSquared;
  });

  return (
    <group position={position} ref={groupRef}>
      {children}
    </group>
  );
}

function AsteroidCluster({
  group,
  localStateRef,
    physicalPosition: physicalPositionTuple,
}: {
  group: AsteroidGroupData;
  localStateRef: MutableRefObject<LocalGameState>;
    physicalPosition: Vec3Tuple;
}): ReactElement {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const physicalPosition = useMemo(() => new THREE.Vector3(...physicalPositionTuple), [physicalPositionTuple]);
  const direction = useMemo(() => new THREE.Vector3(), []);
  const [showCluster, setShowCluster] = useState(false);
  const [showSmallAsteroids, setShowSmallAsteroids] = useState(false);
  const largeAsteroids = useMemo(() => group.asteroids.filter((asteroid) => isLargeAsteroid(asteroid)), [group.asteroids]);

  useFrame(() => {
    if (!groupRef.current) {
      return;
    }

    direction.copy(physicalPosition).sub(camera.position);
    const distance = direction.length();
    const nextShowCluster = distance <= ASTEROID_GROUP_VISIBILITY_RANGE;
    const nextShowSmall = distance <= SMALL_ASTEROID_VISIBILITY_RANGE;

    groupRef.current.visible = nextShowCluster;

    if (nextShowCluster) {
      if (distance <= ASTEROID_PROXY_LINEAR_DISTANCE || distance <= 1e-6) {
        groupRef.current.position.copy(physicalPosition);
        groupRef.current.scale.setScalar(1);
      } else {
        const compressedDistance = compressProxyDistance(distance, ASTEROID_PROXY_LINEAR_DISTANCE, ASTEROID_PROXY_LOG_FACTOR);
        const scale = clamp(compressedDistance / distance, MIN_PROXY_SCALE, 1);
        direction.normalize().multiplyScalar(compressedDistance);
        groupRef.current.position.copy(camera.position).add(direction);
        groupRef.current.scale.setScalar(scale);
      }
    }

    if (nextShowCluster !== showCluster) {
      setShowCluster(nextShowCluster);
    }
    if (nextShowSmall !== showSmallAsteroids) {
      setShowSmallAsteroids(nextShowSmall);
    }
  });

  const asteroidsToRender = showSmallAsteroids ? group.asteroids : largeAsteroids;

  return (
    <>
      <group ref={groupRef} visible={false} />
      
      {showCluster && (
        <group>
          <AsteroidDust dust={group.dust} localStateRef={localStateRef} physicalPosition={physicalPositionTuple} show={showCluster} />
          <SpaceStation station={group.station} physicalPosition={tupleAdd(physicalPositionTuple, group.station.position)} scale={ASTEROID_STATION_SCALE} />
          {asteroidsToRender.map((asteroid) => (
            <AsteroidMesh key={asteroid.id} asteroid={asteroid} physicalPosition={tupleAdd(physicalPositionTuple, asteroid.position)} show={showCluster} />
          ))}
        </group>
      )}
    </>
  );
}

function StationModel({ modelPath }: { modelPath: string }): ReactElement {
  const { scene } = useGLTF(modelPath);
  const lodRefs = useRef<THREE.LOD[]>([]);
  const clonedScene = useMemo(() => {
    const cloned = scene.clone(true);
    lodRefs.current = setupStationLODs(cloned);
    return cloned;
  }, [scene]);

  const tmpV = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ camera }) => {
    for (const lod of lodRefs.current) {
      tmpV.setFromMatrixPosition(lod.matrixWorld);
      const dist = camera.position.distanceTo(tmpV);
      const cullDist = lod.userData.cullDistance as number;
      if (dist > cullDist) {
        lod.visible = false;
      } else {
        lod.visible = true;
        lod.update(camera);
      }
    }
  });

  return <primitive object={clonedScene} />;
}

function SpaceStation({ station, physicalPosition, scale }: { station: StationData; physicalPosition: Vec3Tuple; scale: number }): ReactElement {
  const fieldRadius = useMemo(() => getStationForceFieldRadius(station), [station]);
  const walkableRootRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!walkableRootRef.current) {
      return;
    }

    walkableRootRef.current.userData.stationCollisionRootId = station.id;
    stationWalkableRoots.set(station.id, walkableRootRef.current);

    return () => {
      stationWalkableRoots.delete(station.id);
    };
  }, [station.id]);

  return (
    <PhysicalProxyGroup physicalPosition={physicalPosition} visibleRange={1_200_000_000}>
      <>
        <StationForceField fieldId={`${station.id}:force-field`} radius={fieldRadius} />
        {station.modelPath ? (
          <group ref={walkableRootRef} scale={station.modelScale}>
            <StationModel modelPath={station.modelPath} />
          </group>
        ) : (
          <group ref={walkableRootRef} scale={scale}>
            <>
              <mesh>
                <cylinderGeometry args={[0.8, 0.8, 5.5, 18]} />
                <meshStandardMaterial color="#cbd5e1" metalness={0.8} roughness={0.24} />
              </mesh>
              <mesh rotation={[0, 0, Math.PI / 2]}>
                <torusGeometry args={[3.4, 0.4, 14, 32]} />
                <meshStandardMaterial color="#60a5fa" metalness={0.55} roughness={0.32} emissive="#1d4ed8" emissiveIntensity={0.45} />
              </mesh>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[2.2, 0.22, 14, 28]} />
                <meshStandardMaterial color="#e2e8f0" metalness={0.65} roughness={0.28} />
              </mesh>
              <mesh position={[0, 0.3, 0]}>
                <sphereGeometry args={[0.65, 18, 18]} />
                <meshBasicMaterial color="#22d3ee" />
              </mesh>
            </>
          </group>
        )}
      </>
    </PhysicalProxyGroup>
  );
}

function AsteroidDust({ dust, localStateRef, physicalPosition, show }: { dust: DustAsteroidData[]; localStateRef: MutableRefObject<LocalGameState>; physicalPosition: Vec3Tuple; show: boolean }): ReactElement {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  const dustGroupRef = useRef<THREE.Group>(null);
  const explosionFlashRefs = useRef<Array<THREE.Mesh | null>>([]);
  const explosionGlowRefs = useRef<Array<THREE.Mesh | null>>([]);
  const explosionFragmentRefs = useRef<Array<THREE.Mesh | null>>([]);
  const nextExplosionIndexRef = useRef(0);
  const shotCountsRef = useRef<number[]>([]);
  const removedRef = useRef<boolean[]>([]);
  const matrixDummy = useMemo(() => new THREE.Object3D(), []);
  const hiddenPosition = useMemo(() => new THREE.Vector3(0, -1_000_000, 0), []);
  const localHitPoint = useMemo(() => new THREE.Vector3(), []);
  const worldHitPoint = useMemo(() => new THREE.Vector3(), []);
  const randomDirection = useMemo(() => new THREE.Vector3(), []);
  const upward = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const explosionDirection = useMemo(() => new THREE.Vector3(), []);
  const shipBlastDirection = useMemo(() => new THREE.Vector3(), []);
  const currentShipForward = useMemo(() => new THREE.Vector3(), []);
  const projectedForward = useMemo(() => new THREE.Vector3(), []);
  const fallbackForward = useMemo(() => new THREE.Vector3(), []);
  const targetShipRotation = useMemo(() => new THREE.Quaternion(), []);
  const lookMatrix = useMemo(() => new THREE.Matrix4(), []);
  const lookTarget = useMemo(() => new THREE.Vector3(), []);
  const lookOrigin = useMemo(() => new THREE.Vector3(), []);
  const baseMatrices = useMemo(() => dust.map((d) => {
    const matrix = new THREE.Matrix4();
    matrixDummy.position.set(d.position[0], d.position[1], d.position[2]);
    matrixDummy.rotation.set(d.rotation[0], d.rotation[1], d.rotation[2]);
    matrixDummy.scale.set(d.size, d.size, d.size);
    matrixDummy.updateMatrix();
    matrix.copy(matrixDummy.matrix);
    return matrix;
  }), [dust, matrixDummy]);
  const explosions = useMemo(() => Array.from({ length: DUST_ASTEROID_MAX_EXPLOSIONS }, () => ({
    active: false,
    age: 0,
    life: DUST_ASTEROID_EXPLOSION_LIFETIME_SECONDS,
    position: new THREE.Vector3(),
    scale: 1,
    burstOffsets: Array.from({ length: DUST_ASTEROID_EXPLOSION_SUB_BURSTS }, () => new THREE.Vector3()),
    burstScales: Array.from({ length: DUST_ASTEROID_EXPLOSION_SUB_BURSTS }, () => 1),
    fragmentPositions: Array.from({ length: DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT }, () => new THREE.Vector3()),
    fragmentVelocities: Array.from({ length: DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT }, () => new THREE.Vector3()),
  })), []);

  useEffect(() => {
    if (!instancedMeshRef.current) {
      return;
    }

    shotCountsRef.current = Array.from({ length: dust.length }, () => 0);
    removedRef.current = Array.from({ length: dust.length }, () => false);

    dust.forEach((_, index) => {
      instancedMeshRef.current?.setMatrixAt(index, baseMatrices[index]);
    });
    instancedMeshRef.current.instanceMatrix.needsUpdate = true;

    const handleDustImpact = (hit: THREE.Intersection<THREE.Object3D>) => {
      const instanceId = hit.instanceId;
      if (instanceId === undefined || instanceId === null || removedRef.current[instanceId]) {
        return;
      }

      shotCountsRef.current[instanceId] = (shotCountsRef.current[instanceId] ?? 0) + 1;
      if (shotCountsRef.current[instanceId] < DUST_ASTEROID_HITS_TO_DESTROY) {
        return;
      }

      removedRef.current[instanceId] = true;
      matrixDummy.position.copy(hiddenPosition);
      matrixDummy.rotation.set(0, 0, 0);
      matrixDummy.scale.setScalar(0.0001);
      matrixDummy.updateMatrix();
      instancedMeshRef.current?.setMatrixAt(instanceId, matrixDummy.matrix);
      if (instancedMeshRef.current) {
        instancedMeshRef.current.instanceMatrix.needsUpdate = true;
      }

      const explosion = explosions[nextExplosionIndexRef.current % explosions.length];
      nextExplosionIndexRef.current += 1;
      explosion.active = true;
      explosion.age = 0;
      explosion.life = DUST_ASTEROID_EXPLOSION_LIFETIME_SECONDS;
      explosion.scale = Math.max(0.6, dust[instanceId]?.size ?? 0.6) * 2.8;
      worldHitPoint.copy(hit.point);
      localHitPoint.copy(worldHitPoint);
      dustGroupRef.current?.worldToLocal(localHitPoint);
      explosion.position.copy(localHitPoint);

      for (let burstIndex = 0; burstIndex < DUST_ASTEROID_EXPLOSION_SUB_BURSTS; burstIndex += 1) {
        randomDirection.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        explosion.burstOffsets[burstIndex]
          .copy(randomDirection)
          .multiplyScalar(explosion.scale * (0.2 + Math.random() * 0.95));
        explosion.burstScales[burstIndex] = 0.55 + Math.random() * 0.9;
      }

      for (let fragmentIndex = 0; fragmentIndex < DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT; fragmentIndex += 1) {
        explosion.fragmentPositions[fragmentIndex].set(0, 0, 0);
        randomDirection.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
        explosionDirection.copy(upward).multiplyScalar(0.35 + Math.random() * 0.8).addScaledVector(randomDirection, 1.2 + Math.random() * 2.2).normalize();
        explosion.fragmentVelocities[fragmentIndex].copy(explosionDirection).multiplyScalar(explosion.scale * (1.8 + Math.random() * 2.6));
      }

      const shipDistance = localStateRef.current.shipPosition.distanceTo(worldHitPoint);
      if (shipDistance <= DUST_ASTEROID_BLAST_RADIUS && shipDistance > 1e-4) {
        shipBlastDirection.copy(localStateRef.current.shipPosition).sub(worldHitPoint).normalize();
        const blastStrength = (1 - shipDistance / DUST_ASTEROID_BLAST_RADIUS) * (DUST_ASTEROID_BLAST_PUSH_VELOCITY + explosion.scale * 10);
        localStateRef.current.shipVelocity.addScaledVector(shipBlastDirection, blastStrength);

        currentShipForward.set(0, 0, -1).applyQuaternion(localStateRef.current.shipRotation);
        projectedForward.copy(currentShipForward).addScaledVector(shipBlastDirection, -currentShipForward.dot(shipBlastDirection));
        if (projectedForward.lengthSq() < 1e-4) {
          fallbackForward.set(1, 0, 0).addScaledVector(shipBlastDirection, -shipBlastDirection.x);
          if (fallbackForward.lengthSq() < 1e-4) {
            fallbackForward.set(0, 0, -1).addScaledVector(shipBlastDirection, shipBlastDirection.z);
          }
          projectedForward.copy(fallbackForward);
        }
        projectedForward.normalize();
        lookOrigin.set(0, 0, 0);
        lookTarget.copy(projectedForward);
        lookMatrix.lookAt(lookOrigin, lookTarget, shipBlastDirection);
        targetShipRotation.setFromRotationMatrix(lookMatrix);
        localStateRef.current.shipRotation.slerp(targetShipRotation, 0.6);
      }
    };

    const shouldIgnoreDustImpact = (hit: THREE.Intersection<THREE.Object3D>) => {
      const instanceId = hit.instanceId;
      return instanceId === undefined || instanceId === null || removedRef.current[instanceId];
    };

    instancedMeshRef.current.userData.onWeaponImpact = handleDustImpact;
    instancedMeshRef.current.userData.shouldIgnoreWeaponImpact = shouldIgnoreDustImpact;

    return () => {
      if (instancedMeshRef.current) {
        delete instancedMeshRef.current.userData.onWeaponImpact;
        delete instancedMeshRef.current.userData.shouldIgnoreWeaponImpact;
      }
    };
  }, [baseMatrices, dust, explosions, fallbackForward, hiddenPosition, localHitPoint, localStateRef, lookMatrix, lookOrigin, lookTarget, matrixDummy, nextExplosionIndexRef, projectedForward, randomDirection, shipBlastDirection, targetShipRotation, upward, worldHitPoint]);

  useFrame((_state, delta) => {
    for (let explosionIndex = 0; explosionIndex < explosions.length; explosionIndex += 1) {
      const explosion = explosions[explosionIndex];
      const hasAllBurstMeshes = Array.from({ length: DUST_ASTEROID_EXPLOSION_SUB_BURSTS }).every((_, burstIndex) => {
        const refIndex = explosionIndex * DUST_ASTEROID_EXPLOSION_SUB_BURSTS + burstIndex;
        return Boolean(explosionFlashRefs.current[refIndex] && explosionGlowRefs.current[refIndex]);
      });

      if (!hasAllBurstMeshes) {
        continue;
      }

      if (!explosion.active) {
        for (let burstIndex = 0; burstIndex < DUST_ASTEROID_EXPLOSION_SUB_BURSTS; burstIndex += 1) {
          const refIndex = explosionIndex * DUST_ASTEROID_EXPLOSION_SUB_BURSTS + burstIndex;
          const flashMesh = explosionFlashRefs.current[refIndex];
          const glowMesh = explosionGlowRefs.current[refIndex];
          if (flashMesh) {
            flashMesh.visible = false;
          }
          if (glowMesh) {
            glowMesh.visible = false;
          }
        }
        for (let fragmentIndex = 0; fragmentIndex < DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT; fragmentIndex += 1) {
          const fragmentMesh = explosionFragmentRefs.current[explosionIndex * DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT + fragmentIndex];
          if (fragmentMesh) {
            fragmentMesh.visible = false;
          }
        }
        continue;
      }

      explosion.age += delta;
      if (explosion.age >= explosion.life) {
        explosion.active = false;
        for (let burstIndex = 0; burstIndex < DUST_ASTEROID_EXPLOSION_SUB_BURSTS; burstIndex += 1) {
          const refIndex = explosionIndex * DUST_ASTEROID_EXPLOSION_SUB_BURSTS + burstIndex;
          const flashMesh = explosionFlashRefs.current[refIndex];
          const glowMesh = explosionGlowRefs.current[refIndex];
          if (flashMesh) {
            flashMesh.visible = false;
          }
          if (glowMesh) {
            glowMesh.visible = false;
          }
        }
        for (let fragmentIndex = 0; fragmentIndex < DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT; fragmentIndex += 1) {
          const fragmentMesh = explosionFragmentRefs.current[explosionIndex * DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT + fragmentIndex];
          if (fragmentMesh) {
            fragmentMesh.visible = false;
          }
        }
        continue;
      }

      const alpha = 1 - explosion.age / explosion.life;
      for (let burstIndex = 0; burstIndex < DUST_ASTEROID_EXPLOSION_SUB_BURSTS; burstIndex += 1) {
        const refIndex = explosionIndex * DUST_ASTEROID_EXPLOSION_SUB_BURSTS + burstIndex;
        const flashMesh = explosionFlashRefs.current[refIndex];
        const glowMesh = explosionGlowRefs.current[refIndex];
        if (!flashMesh || !glowMesh) {
          continue;
        }

        const burstSpread = 0.35 + (1 - alpha) * 0.9;
        const burstPosition = explosion.position.clone().addScaledVector(explosion.burstOffsets[burstIndex], burstSpread);
        const burstScale = explosion.scale * explosion.burstScales[burstIndex];

        flashMesh.visible = true;
        flashMesh.position.copy(burstPosition);
        flashMesh.scale.setScalar(burstScale * (0.65 + alpha * 1.2));
        const flashMaterial = flashMesh.material;
        if (flashMaterial instanceof THREE.MeshBasicMaterial) {
          flashMaterial.opacity = 0.35 + alpha * 0.65;
        }

        glowMesh.visible = true;
        glowMesh.position.copy(burstPosition);
        glowMesh.scale.setScalar(burstScale * (1.25 + alpha * 2.1));
        const glowMaterial = glowMesh.material;
        if (glowMaterial instanceof THREE.MeshBasicMaterial) {
          glowMaterial.opacity = 0.12 + alpha * 0.24;
        }
      }

      for (let fragmentIndex = 0; fragmentIndex < DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT; fragmentIndex += 1) {
        const fragmentMesh = explosionFragmentRefs.current[explosionIndex * DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT + fragmentIndex];
        if (!fragmentMesh) {
          continue;
        }

        explosion.fragmentPositions[fragmentIndex].addScaledVector(explosion.fragmentVelocities[fragmentIndex], delta);
        explosion.fragmentVelocities[fragmentIndex].multiplyScalar(Math.max(0, 1 - 1.9 * delta));

        fragmentMesh.visible = true;
        fragmentMesh.position.copy(explosion.position).add(explosion.fragmentPositions[fragmentIndex]);
        fragmentMesh.scale.setScalar(explosion.scale * (0.12 + alpha * 0.18));
        const fragmentMaterial = fragmentMesh.material;
        if (fragmentMaterial instanceof THREE.MeshStandardMaterial) {
          fragmentMaterial.emissiveIntensity = alpha * 0.18;
          fragmentMaterial.opacity = 0.22 + alpha * 0.78;
        }
      }
    }
  });

  return (
    <PhysicalProxyGroup
      physicalPosition={physicalPosition}
      visibleRange={SMALL_ASTEROID_VISIBILITY_RANGE * 2}
      linearDistance={ASTEROID_PROXY_LINEAR_DISTANCE}
      logarithmicFactor={ASTEROID_PROXY_LOG_FACTOR}
    >
      <group ref={dustGroupRef} visible={show} userData={{ ignoreOutline: true }}>
        <instancedMesh ref={instancedMeshRef} args={[null as any, null as any, dust.length]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#64748b" roughness={0.96} metalness={0.06} />
        </instancedMesh>
        {explosions.map((_, explosionIndex) => (
          <group key={`dust-explosion-${explosionIndex}`}>
            {Array.from({ length: DUST_ASTEROID_EXPLOSION_SUB_BURSTS }, (_, burstIndex) => (
              <group key={`dust-explosion-${explosionIndex}-burst-${burstIndex}`}>
                <mesh ref={(mesh) => {
                  explosionGlowRefs.current[explosionIndex * DUST_ASTEROID_EXPLOSION_SUB_BURSTS + burstIndex] = mesh;
                }} visible={false} renderOrder={71}>
                  <sphereGeometry args={[1, 12, 12]} />
                  <meshBasicMaterial color="#ff9d57" transparent opacity={0.35} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
                </mesh>
                <mesh ref={(mesh) => {
                  explosionFlashRefs.current[explosionIndex * DUST_ASTEROID_EXPLOSION_SUB_BURSTS + burstIndex] = mesh;
                }} visible={false} renderOrder={72}>
                  <sphereGeometry args={[1, 12, 12]} />
                  <meshBasicMaterial color="#fff4df" transparent opacity={1} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
                </mesh>
              </group>
            ))}
            {Array.from({ length: DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT }, (_, fragmentIndex) => (
              <mesh
                key={`dust-explosion-${explosionIndex}-fragment-${fragmentIndex}`}
                ref={(mesh) => {
                  explosionFragmentRefs.current[explosionIndex * DUST_ASTEROID_EXPLOSION_FRAGMENT_COUNT + fragmentIndex] = mesh;
                }}
                visible={false}
                renderOrder={73}
              >
                <dodecahedronGeometry args={[1, 0]} />
                <meshStandardMaterial color="#64748b" transparent opacity={1} roughness={0.98} metalness={0.04} emissive="#f59e0b" emissiveIntensity={0.12} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </PhysicalProxyGroup>
  );
}

function AsteroidMesh({
  asteroid,
  physicalPosition,
  show,
}: {
  asteroid: AsteroidData;
  physicalPosition: Vec3Tuple;
  show: boolean;
}): ReactElement {
  const visualScale: Vec3Tuple = [
    asteroid.scale[0] * ASTEROID_RENDER_SCALE_MULTIPLIER,
    asteroid.scale[1] * ASTEROID_RENDER_SCALE_MULTIPLIER,
    asteroid.scale[2] * ASTEROID_RENDER_SCALE_MULTIPLIER,
  ];
  const outlineMaterialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame((state) => {
    // Shimmer effect no longer needed for HTML tooltip target
  });

  return (
    <PhysicalProxyGroup
      physicalPosition={physicalPosition}
      visibleRange={SMALL_ASTEROID_VISIBILITY_RANGE * 2}
      linearDistance={ASTEROID_PROXY_LINEAR_DISTANCE}
      logarithmicFactor={ASTEROID_PROXY_LOG_FACTOR}
    >
      <group rotation={asteroid.rotation} scale={visualScale} visible={show}>
        {asteroid.shape === 'abstract' ? (
          <mesh>
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial color="#78716c" flatShading roughness={0.96} metalness={0.08} />
          </mesh>
        ) : (
          <mesh>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#94a3b8" roughness={0.98} metalness={0.04} />
          </mesh>
        )}

        
      </group>
    </PhysicalProxyGroup>
  );
}

function ShipExterior({ highlight = false }: { highlight?: boolean }): ReactElement {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[1.05, 6.4, 6, 18]} />
        <meshStandardMaterial color={highlight ? '#93c5fd' : '#94a3b8'} metalness={0.5} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.2, -4.35]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.95, 2.6, 20]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.45} roughness={0.3} />
      </mesh>
      <mesh position={[2.35, 0, 0.35]} rotation={[0, 0, Math.PI / 14]}>
        <boxGeometry args={[3.8, 0.18, 7.8]} />
        <meshStandardMaterial color="#475569" metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh position={[-2.35, 0, 0.35]} rotation={[0, 0, -Math.PI / 14]}>
        <boxGeometry args={[3.8, 0.18, 7.8]} />
        <meshStandardMaterial color="#475569" metalness={0.65} roughness={0.35} />
      </mesh>
      <mesh position={[0.95, 0.1, 4.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.5, 1.35, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[-0.95, 0.1, 4.15]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.5, 1.35, 16]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[0.95, 0.1, 4.95]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.3, 0.6, 14]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
      <mesh position={[-0.95, 0.1, 4.95]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.22, 0.3, 0.6, 14]} />
        <meshBasicMaterial color="#38bdf8" />
      </mesh>
    </group>
  );
}

function ShipInterior({ isPilot = false }: { isPilot?: boolean }): ReactElement {
  return (
    <group>
      <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[6, 11]} />
        <meshStandardMaterial color="#111827" metalness={0.2} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.35, -3.4]} visible={!isPilot}>
        <boxGeometry args={[1.2, 0.5, 1]} />
        <meshStandardMaterial color="#334155" metalness={0.25} roughness={0.65} />
      </mesh>
      <mesh position={[0, 1, -3.8]} visible={!isPilot}>
        <boxGeometry args={[1.6, 1.1, 0.28]} />
        <meshStandardMaterial color="#38bdf8" emissive="#0ea5e9" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0, 1.1, 2.6]}>
        <boxGeometry args={[3.1, 1.7, 0.9]} />
        <meshStandardMaterial color="#1e293b" metalness={0.2} roughness={0.7} />
      </mesh>
      <mesh position={[0, 2.65, -5.75]} rotation={[0, 0, 0]} visible={!isPilot}>
        <planeGeometry args={[1.8, 0.8]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.45} />
      </mesh>
    </group>
  );
}

function RemotePlayer({
  player,
  viewerFrameOrigin,
  showDebugAnchors,
}: {
  player: PlayerSnapshot;
  viewerFrameOrigin: Vec3Tuple;
  showDebugAnchors: boolean;
}): ReactElement {
  const remoteShipConfig = useMemo(() => getShipConfig(DEFAULT_SHIP_ID), []);
  const shipQuaternion = useMemo(
    () => new THREE.Quaternion(...player.ship.rotation),
    [player.ship.rotation],
  );
  const bodyQuaternion = useMemo(() => new THREE.Quaternion(...player.rotation), [player.rotation]);
  const relativeShipPosition = useMemo<Vec3Tuple>(
    () => tupleAdd(player.ship.position, tupleSubtract(player.frameOrigin, viewerFrameOrigin)),
    [player.frameOrigin, player.ship.position, viewerFrameOrigin],
  );
  const relativeBodyPosition = useMemo<Vec3Tuple>(
    () => tupleAdd(player.position, tupleSubtract(player.frameOrigin, viewerFrameOrigin)),
    [player.frameOrigin, player.position, viewerFrameOrigin],
  );

  return (
    <group>
      <group position={relativeShipPosition} quaternion={shipQuaternion}>
        <ShipExteriorModel config={remoteShipConfig} showDebugAnchors={showDebugAnchors} />
        <Html distanceFactor={18} position={[0, 1.9, 0]} transform>
          <div className="status-pill">{player.username}</div>
        </Html>
      </group>
      {!player.insideShip && (player.mode === 'space' || player.mode === 'planet-surface') ? (
        <group position={relativeBodyPosition} quaternion={bodyQuaternion}>
          <Astronaut />
        </group>
      ) : null}
    </group>
  );
}

function Astronaut(): ReactElement {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <capsuleGeometry args={[0.28, 0.74, 4, 12]} />
        <meshStandardMaterial color="#cbd5e1" metalness={0.08} roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.92, 0]}>
        <sphereGeometry args={[0.24, 20, 20]} />
        <meshStandardMaterial color="#e0f2fe" metalness={0.15} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.92, -0.16]}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

export default App;
