import { Html } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
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

type Mode = 'space' | 'interior' | 'pilot';
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
const PLAYER_MAX_EVA_SPEED_METERS_PER_SECOND = 10 * METERS_PER_WORLD_UNIT;
const EVA_THRUST_ACCELERATION = 6 * METERS_PER_WORLD_UNIT;
const EVA_DAMPING = 0.85;
const EVA_STOP_SPEED_THRESHOLD = 0.12 * METERS_PER_WORLD_UNIT;
const INTERIOR_WALK_SPEED_METERS_PER_SECOND = 1.8 * METERS_PER_WORLD_UNIT;
const INTERIOR_GRAVITY_METERS_PER_SECOND = 9.81 * METERS_PER_WORLD_UNIT;
const SHIP_THRUST_ACCELERATION = 14 * METERS_PER_WORLD_UNIT;
const SHIP_MAX_SPEED_METERS_PER_SECOND = 240 * METERS_PER_WORLD_UNIT;
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
const PLAYER_COLLISION_RADIUS = 0.46;
const SHIP_COLLISION_RADIUS = 5.15;
const STATION_COLLISION_RADIUS_FACTOR = 4.25;
const SHIP_SPAWN_OFFSET_METERS = 18 * METERS_PER_WORLD_UNIT;
const BOARDING_DISTANCE_METERS = 8 * METERS_PER_WORLD_UNIT;
const SEAT_INTERACTION_DISTANCE_METERS = 1.15 * METERS_PER_WORLD_UNIT;
const SHIP_EXIT_OFFSET_METERS = 9.5 * METERS_PER_WORLD_UNIT;
const SHIP_INTERIOR_FLOOR_HEIGHT_METERS = 1.6 * METERS_PER_WORLD_UNIT;
const SHIP_INTERIOR_CLAMP_X_METERS = 2.8 * METERS_PER_WORLD_UNIT;
const SHIP_INTERIOR_CLAMP_Z_METERS = 5 * METERS_PER_WORLD_UNIT;
const STAR_STATION_SCALE = 6;
const PLANET_STATION_SCALE = 4.5;
const ASTEROID_STATION_SCALE = 3.8;
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
  // For inter-system travel only: a waypoint far away in the destination's direction.
  // The ship flies to this point for visuals; fast-travel fires when interstellarArrivalAt elapses.
  interstellarWaypoint?: Vec3Tuple;
  // performance.now() timestamp (ms) at which fast-travel should trigger.
  interstellarArrivalAt?: number;
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

interface MotionCollisionResult {
  collider: SceneCollider;
  colliderLocalPosition: THREE.Vector3;
  normal: THREE.Vector3;
  travelFraction: number;
}

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
}

const AUTH_STORAGE_KEY = 'spacesim.auth';
const seatPosition = new THREE.Vector3(0, 1.2, -3.2);
const pilotCameraOffset = new THREE.Vector3(0, 1.45, -3.05);
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
// Steepness of the Gaussian bell-curve deceleration profile.
// Higher → deceleration more concentrated in the middle; lower → more spread out.
const LONG_DISTANCE_BELL_CURVE_K = 2.0;
// Phase 5: final approach distance & duration
const LONG_DISTANCE_PHASE5_DISTANCE = 10_000; // 10 km
const LONG_DISTANCE_PHASE5_DURATION = 20; // seconds — constant decel over last 10 km
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
    insideShip: state.mode !== 'space',
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
        name: `${system.name} Planet ${index + 1} Station ${stationIndex + 1}`,
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
          name: `${system.name} Planet ${index + 1} Moon ${moonIndex + 1} Station ${stationIndex + 1}`,
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
      name: `${system.name} Belt ${index + 1} Station`,
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

function getStationCollisionRadius(scale: number): number {
  return scale * STATION_COLLISION_RADIUS_FACTOR;
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

function buildShipSceneColliders(id: string, position: Vec3Tuple, rotation: QuatTuple | THREE.Quaternion): SceneCollider[] {
  const basePosition = vectorFromTuple(position);
  const quaternion = rotation instanceof THREE.Quaternion ? rotation.clone() : new THREE.Quaternion(...rotation);
  const colliderSpecs = [
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
    colliders.push({
      id: planet.id,
      kind: 'planet',
      position: planet.position,
      radius: planet.radius,
    });

    planet.stations.forEach((station) => {
      colliders.push(...buildStationSceneColliders(station.id, tupleAdd(planet.position, station.position), PLANET_STATION_SCALE));
    });

    planet.moons.forEach((moon) => {
      const moonPosition = tupleAdd(planet.position, moon.position);
      colliders.push({
        id: moon.id,
        kind: 'moon',
        position: moonPosition,
        radius: moon.radius,
      });

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
        break;
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
        longDistanceState.decelStartDistance = Math.max(0, remainingDistance - LONG_DISTANCE_PHASE5_DISTANCE);
        longDistanceState.decelStartPosition.copy(state.shipPosition);
        longDistanceState.decelArrivalPoint.copy(destinationLocalPosition).addScaledVector(targetDirection, -(arrivalDistance + LONG_DISTANCE_PHASE5_DISTANCE));
      }
      break;
    }
    case 4: { // Deceleration — bell-curve profile, straight line
      const t = longDistanceState.phaseElapsed;
      const T = LONG_DISTANCE_DECEL_DURATION;
      const D0 = longDistanceState.decelStartDistance;
      const f = clamp(t / T, 0, 1);
      const decelDir = longDistanceState.decelDirection;
      const startPos = longDistanceState.decelStartPosition;
      const arrivalPt = longDistanceState.decelArrivalPoint;

      // Progress fraction from bell-curve: 0 at start, 1 at arrival
      const progressFraction = 1 - bellCurveIdealRemaining(f, LONG_DISTANCE_BELL_CURVE_K);

      // Ideal position = lerp from startPos to arrivalPt
      const idealPosition = startPos.clone().lerp(arrivalPt, progressFraction);

      // Compute velocity needed to reach ideal position this frame
      const posError = idealPosition.clone().sub(state.shipPosition);
      const errorDist = posError.length();

      // Also compute the analytical speed for visual smoothness
      const v0 = D0 > 0 ? 2 * D0 / T : longDistanceState.decelEntrySpeed;
      const speedFraction = 1 - bellCurveCDF(f, LONG_DISTANCE_BELL_CURVE_K);
      const analyticalSpeed = v0 * speedFraction;

      // ── Arrival checks ──────────────────────────────────────────────────
      if (f >= 1) {
        // Snap to the phase-4 arrival point (10 km out) and transition to phase 5
        state.shipPosition.copy(arrivalPt);
        state.shipVelocity.set(0, 0, 0);
        state.position.copy(state.shipPosition);
        state.velocity.copy(state.shipVelocity);

        const toTargetNow = destinationLocalPosition.clone().sub(state.shipPosition).normalize();
        longDistanceState.phase = 5;
        longDistanceState.phaseElapsed = 0;
        longDistanceState.phase5StartPosition.copy(state.shipPosition);
        longDistanceState.phase5ArrivalPoint.copy(destinationLocalPosition).addScaledVector(toTargetNow, -arrivalDistance);
        longDistanceState.phase5EntrySpeed = 2 * LONG_DISTANCE_PHASE5_DISTANCE / LONG_DISTANCE_PHASE5_DURATION;
        return { arrived: false, distance: state.shipPosition.distanceTo(destinationLocalPosition) };
      }

      // Drive toward ideal position: use the analytical speed as the
      // magnitude but point directly at the ideal position so any
      // lateral or longitudinal drift is corrected each frame.
      let driveSpeed: number;
      if (dt > 0 && errorDist > 0.01) {
        // Speed needed to reach the ideal position in this frame
        const correctionSpeed = errorDist / dt;
        // Blend: mostly correction, clamp to avoid wild jumps
        driveSpeed = clamp(correctionSpeed, 0, Math.max(analyticalSpeed * 3, errorDist / dt));
      } else {
        driveSpeed = analyticalSpeed;
      }

      const driveDirection = errorDist > 0.01
        ? posError.normalize()
        : decelDir;

      // ── Orient ship along decel direction ────────────────────────────────
      const decelRotation = createShipFacingQuaternion(decelDir);
      state.shipAngularVelocity.set(0, 0, 0);
      state.shipRotation.rotateTowards(decelRotation, 0.22 * dt);
      state.rotation.copy(state.shipRotation);
      state.autopilotDirection.copy(decelDir);

      // ── Set velocity and move ───────────────────────────────────────────
      state.shipVelocity.copy(driveDirection).multiplyScalar(driveSpeed);
      state.shipPosition.addScaledVector(state.shipVelocity, dt);
      state.position.copy(state.shipPosition);
      state.velocity.copy(state.shipVelocity);

      // Post-move arrival check
      const newDist = state.shipPosition.distanceTo(destinationLocalPosition);
      if (newDist <= arrivalDistance) {
        state.shipVelocity.set(0, 0, 0);
        state.shipAngularVelocity.set(0, 0, 0);
        state.position.copy(state.shipPosition);
        state.velocity.copy(state.shipVelocity);
        state.rotation.copy(state.shipRotation);
        resetLongDistanceState();
        return { arrived: true, distance: newDist };
      }

      return { arrived: false, distance };
    }
    case 5: { // Final approach — constant deceleration over last 10 km
      const t = longDistanceState.phaseElapsed;
      const T = LONG_DISTANCE_PHASE5_DURATION;
      const f5 = clamp(t / T, 0, 1);
      const startPos5 = longDistanceState.phase5StartPosition;
      const arrivalPt5 = longDistanceState.phase5ArrivalPoint;

      // Constant-deceleration position: s(t) = v0*t - 0.5*a*t²
      // with v0 = 2D/T, a = 2D/T² => s/D = 2f - f²
      const progressFraction5 = 2 * f5 - f5 * f5;

      // Ideal position = lerp from start to arrival
      const idealPos5 = startPos5.clone().lerp(arrivalPt5, progressFraction5);

      // Speed: v(t) = v0 * (1 - f)
      const v05 = longDistanceState.phase5EntrySpeed;
      const analyticalSpeed5 = v05 * (1 - f5);

      // Compute drive toward ideal position
      const posError5 = idealPos5.clone().sub(state.shipPosition);
      const errorDist5 = posError5.length();

      // ── Arrival ───────────────────────────────────────────────────────
      if (f5 >= 1 || distance <= arrivalDistance) {
        state.shipPosition.copy(arrivalPt5);
        state.shipVelocity.set(0, 0, 0);
        state.shipAngularVelocity.set(0, 0, 0);
        state.position.copy(state.shipPosition);
        state.velocity.copy(state.shipVelocity);
        state.rotation.copy(state.shipRotation);
        resetLongDistanceState();
        return { arrived: true, distance: state.shipPosition.distanceTo(destinationLocalPosition) };
      }

      // Drive toward ideal position
      let driveSpeed5: number;
      if (dt > 0 && errorDist5 > 0.01) {
        const correctionSpeed5 = errorDist5 / dt;
        driveSpeed5 = clamp(correctionSpeed5, 0, Math.max(analyticalSpeed5 * 3, correctionSpeed5));
      } else {
        driveSpeed5 = analyticalSpeed5;
      }

      const driveDir5 = errorDist5 > 0.01
        ? posError5.normalize()
        : longDistanceState.decelDirection;

      // Orient ship toward target
      const decelRotation5 = createShipFacingQuaternion(driveDir5);
      state.shipAngularVelocity.set(0, 0, 0);
      state.shipRotation.rotateTowards(decelRotation5, 1.0 * dt);
      state.rotation.copy(state.shipRotation);
      state.autopilotDirection.copy(driveDir5);

      // Move
      state.shipVelocity.copy(driveDir5).multiplyScalar(driveSpeed5);
      state.shipPosition.addScaledVector(state.shipVelocity, dt);
      state.position.copy(state.shipPosition);
      state.velocity.copy(state.shipVelocity);

      // Post-move arrival check
      const newDist5 = state.shipPosition.distanceTo(destinationLocalPosition);
      if (newDist5 <= arrivalDistance) {
        state.shipVelocity.set(0, 0, 0);
        state.shipAngularVelocity.set(0, 0, 0);
        state.position.copy(state.shipPosition);
        state.velocity.copy(state.shipVelocity);
        state.rotation.copy(state.shipRotation);
        resetLongDistanceState();
        return { arrived: true, distance: newDist5 };
      }

      return { arrived: false, distance };
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
      // Phase 5 (final approach)
      eta += LONG_DISTANCE_PHASE5_DURATION;
    } else if (phase === 4) {
      // Still in bell-curve decel
      const tLeft4 = Math.max(0, LONG_DISTANCE_DECEL_DURATION - pe);
      eta += tLeft4;
      eta += LONG_DISTANCE_PHASE5_DURATION;
    } else {
      // Phase 5: final approach
      const tLeft5 = Math.max(0, LONG_DISTANCE_PHASE5_DURATION - pe);
      eta += tLeft5;
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

  if (distance <= arrivalDistance) {
    state.shipVelocity.set(0, 0, 0);
    state.shipAngularVelocity.set(0, 0, 0);
    state.position.copy(state.shipPosition);
    state.velocity.copy(state.shipVelocity);
    state.rotation.copy(state.shipRotation);
    resetLongDistanceState();
    return { arrived: true, distance };
  }

  // ── Long-distance autopilot: intra-system trips longer than 1 000 km ───
  if (!isInterSystem && (distance > LONG_DISTANCE_THRESHOLD_METERS || longDistanceState.active)) {
    return updateLongDistanceAutopilot(state, dt, destination, destinationLocalPosition, distance, arrivalDistance);
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

function settleShipVelocity(state: LocalGameState, dt: number, sceneColliders?: SceneCollider[]): void {
  integrateShipAngularVelocity(state, dt, SHIP_MANUAL_ANGULAR_DAMPING);
  const shipDampFactor = Math.max(0, 1 - SHIP_LINEAR_DAMPING * dt);
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
  };
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
  const [teleporting, setTeleporting] = useState(false);
  const [autopilotDestination, setAutopilotDestination] = useState<AutopilotDestination | null>(null);
  const [autopilotEngaged, setAutopilotEngaged] = useState(false);
  const [autopilotReachedDestinationId, setAutopilotReachedDestinationId] = useState('');
  const [autopilotStatus, setAutopilotStatus] = useState('Select a destination from inside the ship to engage autopilot.');
  const [hud, setHud] = useState<HudState>({
    connected: false,
    mode: 'space',
    speed: 0,
    shipSpeed: 0,
    prompt: 'Connecting to the sector…',
    playersOnline: 1,
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
  const highlightedAsteroidTargetId =
    autopilotDestination?.kind === 'asteroid-object' && autopilotDestination.id !== autopilotReachedDestinationId ? autopilotDestination.id : '';
  const socketRef = useRef<Socket | null>(null);
  const sendState = useCallback((payload: PlayerSnapshot) => {
    socketRef.current?.emit('state:update', payload);
  }, []);

  useEffect(() => {
    if (!homeStation) {
      return;
    }

    const state = localStateRef.current;
    state.frameSystemId = homeStation.systemId;
    state.frameOrigin.set(...homeStation.localPosition);
    state.position.set(0, 0, 10);
    state.shipPosition.set(0, 0, 0);
    setActiveSystemId(homeStation.systemId);
    setActiveFrameOrigin(homeStation.localPosition);
  }, [homeStation]);

  

  useEffect(() => {
    if (hud.mode === 'space') {
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
          state.frameOrigin.set(...homeStation.localPosition);
          state.position.set(0, 0, 10);
          state.shipPosition.set(0, 0, 0);
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
      if (event.repeat || event.code !== 'KeyT') {
        return;
      }

      event.preventDefault();
      setTabletOpen((current) => !current);
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
    if (!autopilotDestination || hud.mode === 'space') {
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

  const controls = useMemo(() => {
    switch (hud.mode) {
      case 'interior':
        return [
          'Move with WASD while gravity keeps you grounded inside the ship.',
          'Press F near the pilot seat to sit down and monitor the autopilot view.',
          'Use the autopilot panel to pick a destination, or press X to exit back into space.',
        ];
      case 'pilot':
        return [
          'Manual flight: arrow keys rotate the ship with inertia instead of snapping instantly.',
          'W/S thrust forward and backward, A/D thrust left and right. The ship naturally bleeds off sideways drift.',
          'Shift exits the pilot seat. Mouse and Space do nothing here. Press T for the Space-Tablet.',
        ];
      default:
        return [
          'Click the scene to lock the cursor, then look around with the mouse.',
          'W/S thrust where you are looking, A/D strafes, and Space/Shift move up or down.',
          'Approach your ship and press E to board it. Press T to fast travel via the Space-Tablet.',
        ];
    }
  }, [hud.mode]);

  return (
    <main className="sim-shell">
      <Canvas camera={{ fov: 75, near: 0.05, far: GALAXY_CAMERA_FAR }} gl={{ logarithmicDepthBuffer: true }}>
        <color attach="background" args={['#02030b']} />
        <ambientLight intensity={0.85} />
        <directionalLight intensity={1.25} position={[12, 18, 4]} color="#dbeafe" />
        <pointLight intensity={10} distance={120} position={[0, 0, 0]} color="#60a5fa" />
        <GameScene
          activeFrameOrigin={activeFrameOrigin}
          autopilotActive={autopilotEngaged}
          autopilotDestination={autopilotDestination}
          autopilotEtaLabel={autopilotEtaLabel}
          autopilotObstacles={autopilotObstacles}
          activeSystemId={activeSystemId}
          galaxy={galaxy}
          highlightedAsteroidTargetId={highlightedAsteroidTargetId}
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
          tabletOpen={tabletOpen}
        />
      </Canvas>

      <div className="hud">
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

        <div className="hud-banner">{hud.prompt}</div>

        {!tabletOpen ? <div className="crosshair" /> : null}

        <div className="hud-bottom">
          <strong>Controls</strong>
          <ul>
            {controls.map((control) => (
              <li key={control}>{control}</li>
            ))}
          </ul>
        </div>

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
          hudMode={hud.mode}
          lastTravelledId={autopilotReachedDestinationId}
          network={stationNetwork}
          onClose={() => setTabletOpen(false)}
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
  autopilotEtaLabel,
  autopilotObstacles,
  activeSystemId,
  galaxy,
  highlightedAsteroidTargetId,
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
  tabletOpen,
}: {
  activeFrameOrigin: Vec3Tuple;
  autopilotActive: boolean;
  autopilotDestination: AutopilotDestination | null;
  autopilotEtaLabel: string;
  autopilotObstacles: AutopilotObstacle[];
  activeSystemId: string;
  galaxy: GalaxyData;
  highlightedAsteroidTargetId: string;
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
  tabletOpen: boolean;
}): ReactElement {
  const { camera, gl } = useThree();
  const pressedKeys = useRef(new Set<string>());
  const actionQueue = useRef(new Set<string>());
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
        return;
      }

      state.yaw -= event.movementX * 0.0025;
      state.pitch = clamp(state.pitch - event.movementY * 0.0025, -Math.PI / 2.1, Math.PI / 2.1);
    };

    window.addEventListener('keydown', downHandler);
    window.addEventListener('keyup', upHandler);
    document.addEventListener('mousemove', mouseHandler);
    gl.domElement.addEventListener('click', clickHandler);

    return () => {
      window.removeEventListener('keydown', downHandler);
      window.removeEventListener('keyup', upHandler);
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
  }, [tabletOpen]);

  useFrame((_frameState, delta) => {
    const dt = Math.min(delta, 0.05);
    const now = performance.now();
    const state = localStateRef.current;
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
    const autopilotAvailable = autopilotActive && Boolean(autopilotDestination) && state.mode !== 'space';
    const playerSceneColliders = [
      ...localEnvironmentColliders,
      ...remoteShipColliders,
      ...buildShipSceneColliders('local-ship', tupleFromVector(state.shipPosition), state.shipRotation),
    ];

    if (state.mode === 'space') {
      state.rotation.copy(lookRotation);
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

      moveBodyWithSceneColliders(state.position, state.velocity, dt, PLAYER_COLLISION_RADIUS, playerSceneColliders);
      camera.position.copy(state.position);
      camera.quaternion.copy(state.rotation);

      if (consumeAction('KeyE') && state.position.distanceTo(state.shipPosition) < BOARDING_DISTANCE_METERS) {
        state.mode = 'interior';
        state.insideShip = true;
        state.interiorPosition.set(0, SHIP_INTERIOR_FLOOR_HEIGHT_METERS, 2.5);
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
        state.interiorPosition.addScaledVector(walk, dt);
      } else {
        state.interiorVelocity.x = 0;
        state.interiorVelocity.z = 0;
      }

      state.interiorVelocity.y -= INTERIOR_GRAVITY_METERS_PER_SECOND * dt;
      state.interiorPosition.y += state.interiorVelocity.y * dt;

      if (state.interiorPosition.y < SHIP_INTERIOR_FLOOR_HEIGHT_METERS) {
        state.interiorPosition.y = SHIP_INTERIOR_FLOOR_HEIGHT_METERS;
        state.interiorVelocity.y = 0;
      }

      state.interiorPosition.x = clamp(state.interiorPosition.x, -SHIP_INTERIOR_CLAMP_X_METERS, SHIP_INTERIOR_CLAMP_X_METERS);
      state.interiorPosition.z = clamp(state.interiorPosition.z, -SHIP_INTERIOR_CLAMP_Z_METERS, SHIP_INTERIOR_CLAMP_Z_METERS);
      state.position.copy(state.shipPosition);
      state.velocity.copy(state.shipVelocity);
      state.rotation.copy(state.shipRotation);

      const worldLook = state.shipRotation.clone().multiply(lookRotation);
      const cameraOffset = state.interiorPosition.clone().applyQuaternion(state.shipRotation);
      camera.position.copy(state.shipPosition).add(cameraOffset);
      camera.quaternion.copy(worldLook);

      if (consumeAction('KeyF') && state.interiorPosition.distanceTo(seatPosition) < SEAT_INTERACTION_DISTANCE_METERS) {
        state.mode = 'pilot';
        state.insideShip = true;
        state.shipAngularVelocity.set(0, 0, 0);
        const pilotEuler = new THREE.Euler().setFromQuaternion(state.shipRotation, 'YXZ');
        state.pitch = pilotEuler.x;
        state.yaw = pilotEuler.y;
      }

      if (consumeAction('KeyX')) {
        const exitOffset = new THREE.Vector3(0, 0, SHIP_EXIT_OFFSET_METERS).applyQuaternion(state.shipRotation);
        state.mode = 'space';
        state.insideShip = false;
        state.position.copy(state.shipPosition).add(exitOffset);
        state.velocity.copy(state.shipVelocity);
        resetLongDistanceState();
        onAutopilotToggle(false);
        onAutopilotStatusChange('Autopilot disengaged.');
      }
    } else {
      const exitPilotSeat = consumeAction('ShiftLeft') || consumeAction('ShiftRight') || consumeAction('KeyX');
      const pitchInput =
        (movementEnabled && keys.has('ArrowUp') ? 1 : 0) -
        (movementEnabled && keys.has('ArrowDown') ? 1 : 0);
      const yawInput =
        (movementEnabled && keys.has('ArrowLeft') ? 1 : 0) -
        (movementEnabled && keys.has('ArrowRight') ? 1 : 0);
      const forwardInput =
        (movementEnabled && keys.has('KeyW') ? 1 : 0) -
        (movementEnabled && keys.has('KeyS') ? 1 : 0);
      const lateralInput =
        (movementEnabled && keys.has('KeyD') ? 1 : 0) -
        (movementEnabled && keys.has('KeyA') ? 1 : 0);
      const hasTurningInput = pitchInput !== 0 || yawInput !== 0;
      const hasThrustInput = forwardInput !== 0 || lateralInput !== 0;
      const hasManualPilotInput = hasTurningInput || hasThrustInput;

      if (exitPilotSeat) {
        state.mode = 'interior';
        state.interiorPosition.copy(seatPosition).add(new THREE.Vector3(0, 0, 0.8));
        state.interiorVelocity.set(0, 0, 0);
        state.shipAngularVelocity.set(0, 0, 0);
      } else if (hasManualPilotInput) {
        if (autopilotAvailable) {
          resetLongDistanceState();
          onAutopilotToggle(false);
          onAutopilotStatusChange('Autopilot disengaged. Manual control active.');
        }

        state.shipAngularVelocity.x = clamp(
          state.shipAngularVelocity.x + pitchInput * SHIP_MANUAL_ANGULAR_ACCELERATION * dt,
          -SHIP_MANUAL_MAX_ANGULAR_SPEED,
          SHIP_MANUAL_MAX_ANGULAR_SPEED,
        );
        state.shipAngularVelocity.y = clamp(
          state.shipAngularVelocity.y + yawInput * SHIP_MANUAL_ANGULAR_ACCELERATION * dt,
          -SHIP_MANUAL_MAX_ANGULAR_SPEED,
          SHIP_MANUAL_MAX_ANGULAR_SPEED,
        );
        integrateShipAngularVelocity(state, dt, SHIP_MANUAL_ANGULAR_DAMPING);
        state.rotation.copy(state.shipRotation);

        const shipForward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.shipRotation);
        const shipRight = new THREE.Vector3(1, 0, 0).applyQuaternion(state.shipRotation);

        if (forwardInput > 0) {
          state.shipVelocity.addScaledVector(shipForward, SHIP_MANUAL_FORWARD_THRUST * dt);
        }
        if (forwardInput < 0) {
          state.shipVelocity.addScaledVector(shipForward, -SHIP_MANUAL_REVERSE_THRUST * dt);
        }
        if (lateralInput !== 0) {
          state.shipVelocity.addScaledVector(shipRight, lateralInput * SHIP_MANUAL_STRAFE_THRUST * dt);
        }

        const forwardVelocity = shipForward.clone().multiplyScalar(state.shipVelocity.dot(shipForward));
        const lateralVelocity = state.shipVelocity.clone().sub(forwardVelocity);
        const lateralDamping = hasTurningInput ? SHIP_MANUAL_TURN_LATERAL_DAMPING : SHIP_MANUAL_LATERAL_DAMPING;
        lateralVelocity.multiplyScalar(Math.max(0, 1 - lateralDamping * dt));
        state.shipVelocity.copy(forwardVelocity).add(lateralVelocity);

        const shipSpeed = state.shipVelocity.length();
        if (shipSpeed > SHIP_MAX_SPEED_METERS_PER_SECOND) {
          state.shipVelocity.setLength(SHIP_MAX_SPEED_METERS_PER_SECOND);
        }

        if (!hasThrustInput) {
          const dampFactor = Math.max(0, 1 - SHIP_MANUAL_COAST_DAMPING * dt);
          state.shipVelocity.multiplyScalar(dampFactor);
          if (state.shipVelocity.length() < 0.1) {
            state.shipVelocity.set(0, 0, 0);
          }
        }

        moveBodyWithSceneColliders(state.shipPosition, state.shipVelocity, dt, SHIP_COLLISION_RADIUS, shipSceneColliders);
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
        settleShipVelocity(state, dt, shipSceneColliders);
      }

      const cockpitOffset = pilotCameraOffset.clone().applyQuaternion(state.shipRotation);
      camera.position.copy(state.shipPosition).add(cockpitOffset);
      camera.quaternion.copy(state.shipRotation);
    }

    if (shipGroupRef.current) {
      shipGroupRef.current.visible = state.mode !== 'pilot';
      shipGroupRef.current.position.copy(state.shipPosition);
      shipGroupRef.current.quaternion.copy(state.shipRotation);
    }

    if (interiorGroupRef.current) {
      interiorGroupRef.current.visible = state.mode === 'interior' || state.mode === 'pilot';
      interiorGroupRef.current.position.copy(state.shipPosition);
      interiorGroupRef.current.quaternion.copy(state.shipRotation);
    }

    if (now - state.lastNetworkAt > 66) {
      sendState(createStationSnapshot(state));
      state.lastNetworkAt = now;
    }

    if (now - state.lastHudAt > 100) {
      const boardingDistance = state.position.distanceTo(state.shipPosition);
      const canEnter = state.mode === 'space' && boardingDistance < BOARDING_DISTANCE_METERS;
      const canPilot = state.mode === 'interior' && state.interiorPosition.distanceTo(seatPosition) < SEAT_INTERACTION_DISTANCE_METERS;
      const shipSpeed = state.shipVelocity.length();
      const speed = state.mode === 'pilot' ? shipSpeed : state.mode === 'space' ? state.velocity.length() : walkSpeed(state);

      let prompt = pointerLocked
        ? 'WASD to move, Space/Shift for vertical thrust. Momentum is preserved.'
        : 'Click the viewport to capture the mouse.';
      if (tabletOpen) {
        prompt = 'Space-Tablet open. Select any station in the network to fast travel.';
      }
      if (state.mode === 'space' && canEnter) {
        prompt = 'Press E to enter your ship.';
      }
      if (state.mode === 'interior') {
        prompt = canPilot ? 'Press F near the seat to sit down, or use the autopilot panel to select a destination.' : 'Explore the ship interior with WASD. Use the autopilot panel or press X to exit.';
      }
      if (state.mode === 'pilot') {
        prompt = autopilotActive && autopilotDestination
          ? `Autopilot en route to ${autopilotDestination.name}. ETA ${autopilotEtaLabel}. Use arrow keys or WASD to take over. Shift exits the seat.`
          : 'Pilot seat engaged. Arrow keys rotate, WASD thrusts, Shift exits the seat. Mouse and Space do nothing.';
      }
      if (state.mode !== 'space' && autopilotActive && autopilotDestination) {
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
      }));
      state.lastHudAt = now;
    }
  }, -10);

  return (
    <>
      <GalaxyBackdrop activeFrameOrigin={activeFrameOrigin} activeSystemId={activeSystemId} galaxy={galaxy} highlightedAsteroidTargetId={highlightedAsteroidTargetId} />
      <WarpSpeedEffect localStateRef={localStateRef} />
      <group ref={shipGroupRef}>
        <ShipExterior highlight />
      </group>
      <group ref={interiorGroupRef} visible={false}>
        <ShipInterior isPilot={mode === 'pilot'} />
      </group>
      {remotePlayers.map((player) => (
        <RemotePlayer key={player.socketId} player={player} viewerFrameOrigin={activeFrameOrigin} />
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
    groupRef.current.visible = intensity > 0.001 && localStateRef.current.mode !== 'space';

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
    const candidates = scene.children.filter((child): child is THREE.Object3D => Boolean(child));
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
  hudMode,
  lastTravelledId,
  network,
  onClose,
  onEngageAutopilot,
  onStopAutopilot,
  onTravel,
}: {
  frameOrigin?: Vec3Tuple;
  activeSystemId: string;
  autopilotDestinationId: string;
  autopilotEngaged: boolean;
  galaxy: GalaxyData;
  hudMode: 'space' | 'interior' | 'pilot';
  lastTravelledId: string;
  network: StationNode[];
  onClose: () => void;
  onEngageAutopilot: (dest: AutopilotDestination) => void;
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
      (selectedMarker.kind === 'station' || selectedMarker.kind === 'asteroid-belt' || selectedMarker.kind === 'asteroid-object') &&
      selectedMarker.localPosition &&
      hudMode !== 'space',
  );
  const selectedCanTravel = Boolean(hudMode === 'space' && selectedStationNode);
  const selectedAutopilotActive = Boolean(autopilotEngaged && selectedMarker && autopilotDestinationId === selectedMarker.id);

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

      return {
        id: marker.id,
        name: marker.name,
        kind: destinationKind,
        systemId: marker.systemId,
        systemName: marker.systemName,
        localPosition: marker.localPosition,
        approachRadius: marker.approachRadius,
        distanceFromShip: distanceBetweenPoints(shipAbsolutePosition, marker.localPosition) ?? 0,
      };
    },
    [shipAbsolutePosition],
  );

  const selectedVisibleMarker = visibleMarkerLookup.get(selectedStationId) ?? visibleMarkerLookup.get(selectedMarker?.id ?? '');
  const mapSurfaceMarkers = visibleMarkers;
  const breadcrumbItems = useMemo(
    () => [
      {
        key: 'galaxy',
        label: 'Galaxy',
        active: mapMode === 'galaxy',
        onClick: () => setMapMode('galaxy'),
      },
      {
        key: 'system',
        label: selectedSystem?.name ?? 'System',
        active: mapMode === 'system',
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
            <h3>Galaxy Navigation Grid</h3>
            <p>Modern tactical map for galaxy travel, in-system routing, and live object tracking.</p>
            <div className="tablet-status-row">
              <span className="tablet-status-chip">You are near {currentLocationName}</span>
              <span className="tablet-status-chip">{hudMode === 'space' ? 'Fast-travel ready' : 'Autopilot routing online'}</span>
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
                <button className={mapMode === 'galaxy' ? 'tablet-tab-active' : ''} onClick={() => setMapMode('galaxy')} type="button">
                  Galaxy
                </button>
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
                <strong>{mapMode === 'galaxy' ? 'Galaxy overview' : mapMode === 'system' ? `${selectedSystem?.name ?? 'System'} map` : `${sectorFocusMarker?.name ?? 'Sector'} detail`}</strong>
                <span>{mapMode === 'galaxy' ? 'All star systems and jump routes' : mapMode === 'system' ? 'Clean system overview with stations, worlds, belts, and your live position' : 'Detailed local sector with close-range contacts'}</span>
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
                    (marker.kind === 'station' || marker.kind === 'asteroid-belt' || marker.kind === 'asteroid-object') &&
                    (mapMode === 'system' || mapMode === 'sector') &&
                    hudMode !== 'space' &&
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
                            {mapMode === 'galaxy' ? (
                              <button onClick={(e) => { e.stopPropagation(); focusMarker(marker.id, 'system'); }} type="button">
                                Zoom in
                              </button>
                            ) : null}

                            {mapMode === 'system' && (marker.kind === 'star' || marker.kind === 'planet' || marker.kind === 'asteroid-belt') ? (
                              <button onClick={(e) => { e.stopPropagation(); focusMarker(marker.id, 'sector'); }} type="button">
                                Zoom in
                              </button>
                            ) : null}

                            {(mapMode === 'sector' || (mapMode === 'system' && marker.systemId !== activeSystemId)) && canAutopilot ? (
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
  galaxy,
  highlightedAsteroidTargetId,
}: {
  activeFrameOrigin: Vec3Tuple;
  activeSystemId: string;
  galaxy: GalaxyData;
  highlightedAsteroidTargetId: string;
}): ReactElement {
  const activeSystem = galaxy.systems.find((system) => system.id === activeSystemId) ?? galaxy.systems[0] ?? null;
  const activeSystemPosition = activeSystem?.mapPosition ?? [0, 0, 0];

  return (
    <group>
      <GalaxyStarMarkers activeSystemId={activeSystemId} activeSystemPosition={activeSystemPosition} galaxy={galaxy} />
      {activeSystem ? <StarSystem highlightedAsteroidTargetId={highlightedAsteroidTargetId} renderPosition={toFrameLocalPosition([0, 0, 0], activeFrameOrigin)} system={activeSystem} /> : null}
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

function StarSystem({ highlightedAsteroidTargetId, renderPosition, system }: { highlightedAsteroidTargetId: string; renderPosition: Vec3Tuple; system: StarSystemData }): ReactElement {
  const { camera, scene } = useThree();
  const haloRef = useRef<THREE.Mesh>(null);
  const haloMaterialRef = useRef<THREE.MeshBasicMaterial>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const intersections = useMemo<THREE.Intersection[]>(() => [], []);
  const worldPosition = useMemo(() => new THREE.Vector3(...renderPosition), [renderPosition]);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);
  const lastOcclusionCheckRef = useRef(0);
  const haloVisibleRef = useRef(true);

  useFrame((state) => {
    if (!haloRef.current || !haloMaterialRef.current) {
      return;
    }

    projectedPosition.copy(worldPosition).project(camera);
    const distance = worldPosition.distanceTo(camera.position);
    const inBodyRange = distance <= LOCAL_STAR_BODY_VISIBILITY_RANGE;
    const inFront = projectedPosition.z > -1 && projectedPosition.z < 1;

    if (!inBodyRange || !inFront) {
      haloVisibleRef.current = false;
      haloRef.current.visible = false;
      return;
    }

    if (state.clock.elapsedTime - lastOcclusionCheckRef.current > 0.12) {
      haloVisibleRef.current = !isStarOccluded(scene, camera, raycaster, intersections, worldPosition, system.radius);
      lastOcclusionCheckRef.current = state.clock.elapsedTime;
    }

    haloRef.current.visible = haloVisibleRef.current;

    if (haloVisibleRef.current) {
      const distanceFactor = THREE.MathUtils.clamp(1 - distance / LOCAL_STAR_BODY_VISIBILITY_RANGE, 0, 1);
      const screenRadiusNdc = getStarScreenRadiusNdc(camera, distance, system.radius);
      const screenFactor = THREE.MathUtils.clamp(Math.pow(screenRadiusNdc / 0.035, 0.55), 0.55, 3.2);
      const haloScale = 1.95 + distanceFactor * 0.45 + screenFactor * 0.7;
      const haloOpacity = THREE.MathUtils.clamp(0.11 + distanceFactor * 0.08 + screenFactor * 0.045, 0.1, 0.34);

      haloRef.current.scale.setScalar(haloScale);
      haloMaterialRef.current.opacity = haloOpacity;
    }
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
        <group>
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

      {system.asteroidGroups.map((asteroidGroup) => (
        <AsteroidCluster key={asteroidGroup.id} group={asteroidGroup} highlightedAsteroidTargetId={highlightedAsteroidTargetId} physicalPosition={tupleAdd(renderPosition, asteroidGroup.position)} />
      ))}
    </>
  );
}

function StarLensFlare({ starPosition, starRadius }: { starPosition: Vec3Tuple; starRadius: number }): ReactElement {
  const { camera, scene } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const coreSpriteRef = useRef<THREE.Sprite>(null);
  const haloSpriteRef = useRef<THREE.Sprite>(null);
  const ghostOneRef = useRef<THREE.Sprite>(null);
  const ghostTwoRef = useRef<THREE.Sprite>(null);
  const ghostThreeRef = useRef<THREE.Sprite>(null);
  const coreMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const haloMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const ghostOneMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const ghostTwoMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const ghostThreeMaterialRef = useRef<THREE.SpriteMaterial>(null);
  const flareTexture = useMemo(() => createLensFlareTexture(), []);
  const worldPosition = useMemo(() => new THREE.Vector3(...starPosition), [starPosition]);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);
  const screenPosition = useMemo(() => new THREE.Vector3(), []);
  const ghostOffset = useMemo(() => new THREE.Vector2(), []);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const intersections = useMemo<THREE.Intersection[]>(() => [], []);
  const lastOcclusionCheckRef = useRef(0);
  const occludedRef = useRef(false);

  useEffect(() => {
    return () => {
      flareTexture.dispose();
    };
  }, [flareTexture]);

  useFrame((state) => {
    if (
      !groupRef.current ||
      !coreSpriteRef.current ||
      !haloSpriteRef.current ||
      !ghostOneRef.current ||
      !ghostTwoRef.current ||
      !ghostThreeRef.current ||
      !coreMaterialRef.current ||
      !haloMaterialRef.current ||
      !ghostOneMaterialRef.current ||
      !ghostTwoMaterialRef.current ||
      !ghostThreeMaterialRef.current
    ) {
      return;
    }

    projectedPosition.copy(worldPosition).project(camera);
    const distance = worldPosition.distanceTo(camera.position);
    const inRange = distance <= STAR_LENS_FLARE_RANGE;
    const inFront = projectedPosition.z > -1 && projectedPosition.z < 1;
    const nearViewport = Math.abs(projectedPosition.x) < 1.35 && Math.abs(projectedPosition.y) < 1.35;
    const couldBeVisible = inRange && inFront && nearViewport;

    if (!couldBeVisible) {
      groupRef.current.visible = false;
      return;
    }

    if (state.clock.elapsedTime - lastOcclusionCheckRef.current > 0.12) {
      occludedRef.current = isStarOccluded(scene, camera, raycaster, intersections, worldPosition, starRadius);
      lastOcclusionCheckRef.current = state.clock.elapsedTime;
    }

    const visible = !occludedRef.current;
    groupRef.current.visible = visible;

    if (!visible) {
      return;
    }

    groupRef.current.position.copy(camera.position);
    groupRef.current.quaternion.copy(camera.quaternion);

    const planeDistance = 2;
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(perspectiveCamera.fov * 0.5)) * planeDistance;
    const halfWidth = halfHeight * perspectiveCamera.aspect;
    const baseX = projectedPosition.x * halfWidth;
    const baseY = projectedPosition.y * halfHeight;

    screenPosition.set(baseX, baseY, -planeDistance);
    coreSpriteRef.current.position.copy(screenPosition);
    haloSpriteRef.current.position.copy(screenPosition);

    ghostOffset.set(baseX, baseY);
    ghostOneRef.current.position.set(-ghostOffset.x * 0.35, -ghostOffset.y * 0.35, -planeDistance);
    ghostTwoRef.current.position.set(-ghostOffset.x * 0.72, -ghostOffset.y * 0.72, -planeDistance);
    ghostThreeRef.current.position.set(ghostOffset.x * 0.42, ghostOffset.y * 0.42, -planeDistance);

    const distanceFactor = 1 - distance / STAR_LENS_FLARE_RANGE;
    const viewFactor = 1 - Math.min(1, Math.sqrt(projectedPosition.x ** 2 + projectedPosition.y ** 2));
    const screenRadiusNdc = getStarScreenRadiusNdc(camera, distance, starRadius);
    const screenFactor = THREE.MathUtils.clamp(Math.pow(screenRadiusNdc / 0.028, 0.6), 0.7, 4.5);
    const opacity = THREE.MathUtils.clamp((0.05 + distanceFactor * 0.18) * viewFactor * (0.6 + screenFactor * 0.32), 0.018, 0.34);

    coreMaterialRef.current.opacity = opacity;
    haloMaterialRef.current.opacity = opacity * 0.55;
    ghostOneMaterialRef.current.opacity = opacity * 0.48;
    ghostTwoMaterialRef.current.opacity = opacity * 0.32;
    ghostThreeMaterialRef.current.opacity = opacity * 0.24;

    const starScale = THREE.MathUtils.clamp(starRadius * 0.00012, 0.045, 0.12);
    const flareScale = starScale * (1.25 + distanceFactor * 1.35 + screenFactor * 0.55);
    coreSpriteRef.current.scale.setScalar(flareScale);
    haloSpriteRef.current.scale.setScalar(flareScale * 3.4);
    ghostOneRef.current.scale.setScalar(flareScale * 0.95);
    ghostTwoRef.current.scale.setScalar(flareScale * 1.4);
    ghostThreeRef.current.scale.setScalar(flareScale * 0.65);
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
          depthTest={false}
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
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite ref={ghostOneRef} userData={{ ignoreStarOcclusion: true, ignoreMarkerOcclusion: true }}>
        <spriteMaterial
          ref={ghostOneMaterialRef}
          attach="material"
          map={flareTexture}
          color="#dbeafe"
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite ref={ghostTwoRef} userData={{ ignoreStarOcclusion: true, ignoreMarkerOcclusion: true }}>
        <spriteMaterial
          ref={ghostTwoMaterialRef}
          attach="material"
          map={flareTexture}
          color="#bfdbfe"
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
      <sprite ref={ghostThreeRef} userData={{ ignoreStarOcclusion: true, ignoreMarkerOcclusion: true }}>
        <spriteMaterial
          ref={ghostThreeMaterialRef}
          attach="material"
          map={flareTexture}
          color="#f8fafc"
          transparent
          depthWrite={false}
          depthTest={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}

function PhysicalProxyGroup({
  children,
  linearDistance = CELESTIAL_PROXY_LINEAR_DISTANCE,
  logarithmicFactor = CELESTIAL_PROXY_LOG_FACTOR,
  physicalPosition,
  visibleRange,
}: {
  children: ReactNode;
  linearDistance?: number;
  logarithmicFactor?: number;
  physicalPosition: Vec3Tuple;
  visibleRange: number;
}): ReactElement {
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const physicalPositionVector = useMemo(() => new THREE.Vector3(...physicalPosition), [physicalPosition]);
  const direction = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (!groupRef.current) {
      return;
    }

    direction.copy(physicalPositionVector).sub(camera.position);
    const physicalDistance = direction.length();

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

function PlanetBody({ physicalPosition, planet }: { physicalPosition: Vec3Tuple; planet: PlanetData }): ReactElement {
  const textureLibrary = usePlanetTextureLibrary();
  const surfaceTexture = useMemo(() => pickBodySurfaceTexture(textureLibrary, planet.id), [planet.id, textureLibrary]);

  return (
    <>
      <PhysicalProxyGroup physicalPosition={physicalPosition} visibleRange={PLANET_VISIBILITY_RANGE}>
        <mesh>
          <sphereGeometry args={[planet.radius, 20, 20]} />
          <meshStandardMaterial color={planet.color} map={surfaceTexture} roughness={0.96} metalness={0.04} />
        </mesh>
      </PhysicalProxyGroup>

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
        <mesh>
          <sphereGeometry args={[moon.radius, 16, 16]} />
          <meshStandardMaterial color={moon.color} map={surfaceTexture} roughness={0.98} metalness={0.03} />
        </mesh>
      </PhysicalProxyGroup>

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
  highlightedAsteroidTargetId,
  physicalPosition: physicalPositionTuple,
}: {
  group: AsteroidGroupData;
  highlightedAsteroidTargetId: string;
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
          <AsteroidDust dust={group.dust} physicalPosition={physicalPositionTuple} show={showCluster} />
          <SpaceStation station={group.station} physicalPosition={tupleAdd(physicalPositionTuple, group.station.position)} scale={ASTEROID_STATION_SCALE} />
          {asteroidsToRender.map((asteroid) => (
            <AsteroidMesh key={asteroid.id} asteroid={asteroid} highlightTarget={asteroid.id === highlightedAsteroidTargetId} physicalPosition={tupleAdd(physicalPositionTuple, asteroid.position)} show={showCluster} />
          ))}
        </group>
      )}
    </>
  );
}

function SpaceStation({ station, physicalPosition, scale }: { station: StationData; physicalPosition: Vec3Tuple; scale: number }): ReactElement {
  return (
    <PhysicalProxyGroup physicalPosition={physicalPosition} visibleRange={1_200_000_000}>
      <group scale={scale}>
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
      </group>
    </PhysicalProxyGroup>
  );
}

function AsteroidDust({ dust, physicalPosition, show }: { dust: DustAsteroidData[]; physicalPosition: Vec3Tuple; show: boolean }): ReactElement {
  const instancedMeshRef = useRef<THREE.InstancedMesh>(null);
  
  const matrices = useMemo(() => {
    const _matrices = new Float32Array(dust.length * 16);
    const dummy = new THREE.Object3D();

    dust.forEach((d, i) => {
      dummy.position.set(d.position[0], d.position[1], d.position[2]);
      dummy.rotation.set(d.rotation[0], d.rotation[1], d.rotation[2]);
      dummy.scale.set(d.size, d.size, d.size);
      dummy.updateMatrix();
      dummy.matrix.toArray(_matrices, i * 16);
    });

    return _matrices;
  }, [dust]);

  useEffect(() => {
    if (instancedMeshRef.current) {
      instancedMeshRef.current.instanceMatrix.set(matrices);
      instancedMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [matrices]);

  return (
    <PhysicalProxyGroup physicalPosition={physicalPosition} visibleRange={SMALL_ASTEROID_VISIBILITY_RANGE * 2} linearDistance={ASTEROID_PROXY_LINEAR_DISTANCE} logarithmicFactor={ASTEROID_PROXY_LOG_FACTOR}>
      <group visible={show}>
        <instancedMesh ref={instancedMeshRef} raycast={() => null} args={[null as any, null as any, dust.length]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color="#64748b" roughness={0.96} metalness={0.06} />
        </instancedMesh>
      </group>
    </PhysicalProxyGroup>
  );
}

function AsteroidMesh({
  asteroid,
  highlightTarget = false,
  physicalPosition,
  show,
}: {
  asteroid: AsteroidData;
  highlightTarget?: boolean;
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
    if (!outlineMaterialRef.current) {
      return;
    }
    
    if (!highlightTarget) {
      if (outlineMaterialRef.current.opacity !== 0) {
        outlineMaterialRef.current.opacity = 0;
      }
      return;
    }

    const shimmer = 0.35 + (Math.sin(state.clock.elapsedTime * TARGET_OUTLINE_PULSE_SPEED) * 0.5 + 0.5) * 0.65;
    outlineMaterialRef.current.opacity = shimmer;
  });

  return (
    <PhysicalProxyGroup physicalPosition={physicalPosition} visibleRange={SMALL_ASTEROID_VISIBILITY_RANGE * 2} linearDistance={ASTEROID_PROXY_LINEAR_DISTANCE} logarithmicFactor={ASTEROID_PROXY_LOG_FACTOR}>
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

        {highlightTarget ? (
          asteroid.shape === 'abstract' ? (
            <mesh scale={[1.12, 1.12, 1.12]}>
              <icosahedronGeometry args={[1, 1]} />
              <meshBasicMaterial ref={outlineMaterialRef} color="#67e8f9" side={THREE.BackSide} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          ) : (
            <mesh scale={[1.12, 1.12, 1.12]}>
              <dodecahedronGeometry args={[1, 0]} />
              <meshBasicMaterial ref={outlineMaterialRef} color="#67e8f9" side={THREE.BackSide} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
            </mesh>
          )
        ) : null}
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

function RemotePlayer({ player, viewerFrameOrigin }: { player: PlayerSnapshot; viewerFrameOrigin: Vec3Tuple }): ReactElement {
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
        <ShipExterior />
        <Html distanceFactor={18} position={[0, 1.9, 0]} transform>
          <div className="status-pill">{player.username}</div>
        </Html>
      </group>
      {!player.insideShip && player.mode === 'space' ? (
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
