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
}

interface AutopilotObstacle {
  id: string;
  kind: 'star' | 'planet' | 'moon' | 'asteroid';
  position: Vec3Tuple;
  radius: number;
}

interface LocalGameState {
  frameSystemId: string;
  frameOrigin: THREE.Vector3;
  mode: Mode;
  insideShip: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotation: THREE.Quaternion;
  shipPosition: THREE.Vector3;
  shipVelocity: THREE.Vector3;
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
const AUTOPILOT_TURN_RESPONSE = 0.15; // Softened significantly for majestic, massive ship rotation
const METERS_PER_LIGHT_YEAR = 9_460_730_472_580_800;
const AUTOPILOT_ACCELERATION = SHIP_THRUST_ACCELERATION * 1.18;
const AUTOPILOT_BRAKE_DECELERATION = SHIP_THRUST_ACCELERATION * 1.4;
const AUTOPILOT_MAX_SPEED_METERS_PER_SECOND = 0.1 * METERS_PER_LIGHT_YEAR;
const AUTOPILOT_WARP_EFFECT_SPEED_METERS_PER_SECOND = 0.01 * METERS_PER_LIGHT_YEAR;
const AUTOPILOT_AVOIDANCE_WEIGHT = 1.9;
const AUTOPILOT_AVOIDANCE_BUFFER_METERS = 1_600;
const AUTOPILOT_ASTEROID_OBSTACLE_LIMIT = 120;
const AUTOPILOT_TARGET_ASTEROID_MIN_SIZE = 20;
const AUTOPILOT_TARGET_SURFACE_BUFFER_METERS = 140;
const TARGET_OUTLINE_PULSE_SPEED = 3.6;
const AUTOPILOT_ACCELERATION_CURVE_AMPLITUDE = 650_000_000_000_000;
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

function getAutopilotCurveBoost(currentSpeed: number): number {
  return 0; // Deprecated by proportional logic
}

function getAutopilotAcceleration(currentSpeed: number): number {
  // Base thruster acceleration (50 m/s^2) plus warp multiplier (exponential scaling)
  return 50.0 + currentSpeed * 0.6;
}

function getAutopilotBrakeDeceleration(currentSpeed: number): number {
  // Base retro-thruster (100 m/s^2) plus warp braking capability
  return 100.0 + currentSpeed * 1.2;
}

function getAutopilotTargetSpeed(distanceToDestination: number, arrivalDistance: number): number {
  const remainingDistance = Math.max(0, distanceToDestination - arrivalDistance);
  if (remainingDistance <= 0) return 0;
  
  // Proportional kinematic controller sets speed limit: v = distance / time_constant.
  // This guarantees a smooth, exponential slide into the destination without overshooting.
  // We add 25 m/s base speed so the final 100m isn't agonizingly slow.
  const approachSpeed = (remainingDistance / 4.0) + 25.0;
  
  return clamp(approachSpeed, 0, AUTOPILOT_MAX_SPEED_METERS_PER_SECOND);
}

function getWarpEffectIntensity(currentSpeed: number): number {
  return clamp(
    (currentSpeed - AUTOPILOT_WARP_EFFECT_SPEED_METERS_PER_SECOND) /
      (AUTOPILOT_MAX_SPEED_METERS_PER_SECOND - AUTOPILOT_WARP_EFFECT_SPEED_METERS_PER_SECOND),
    0,
    1,
  );
}

function estimateAutopilotEtaSeconds(distanceToDestination: number, approachRadius: number, currentSpeed: number): number {
  const arrivalDistance = Math.max(
    AUTOPILOT_REACH_DISTANCE_METERS,
    approachRadius + AUTOPILOT_TARGET_SURFACE_BUFFER_METERS,
  );
  let remainingDistance = Math.max(0, distanceToDestination - arrivalDistance);

  if (remainingDistance <= 0) {
    return 0;
  }

  let simulatedSpeed = Math.max(0, currentSpeed);
  let elapsed = 0;

  for (let step = 0; step < AUTOPILOT_ETA_MAX_SIMULATION_STEPS && remainingDistance > 0; step += 1) {
    const dt =
      simulatedSpeed > AUTOPILOT_WARP_EFFECT_SPEED_METERS_PER_SECOND * 0.5
        ? 0.25
        : AUTOPILOT_ETA_SIMULATION_STEP_SECONDS;
    const targetSpeed = getAutopilotTargetSpeed(remainingDistance + arrivalDistance, arrivalDistance);
    const accelerating = targetSpeed >= simulatedSpeed;
    const maxVelocityStep =
      (accelerating ? getAutopilotAcceleration(simulatedSpeed) : getAutopilotBrakeDeceleration(simulatedSpeed)) * dt;
    const speedDelta = targetSpeed - simulatedSpeed;

    if (Math.abs(speedDelta) <= maxVelocityStep) {
      simulatedSpeed = targetSpeed;
    } else {
      simulatedSpeed += Math.sign(speedDelta) * maxVelocityStep;
    }

    simulatedSpeed = clamp(simulatedSpeed, 0, AUTOPILOT_MAX_SPEED_METERS_PER_SECOND);

    if (
      simulatedSpeed >= AUTOPILOT_MAX_SPEED_METERS_PER_SECOND * 0.999 &&
      targetSpeed >= AUTOPILOT_MAX_SPEED_METERS_PER_SECOND * 0.999
    ) {
      // With proportional speed logic: targetSpeed < MAX_SPEED when remainingDistance / 4.0 < MAX_SPEED
      const brakingDistance = AUTOPILOT_MAX_SPEED_METERS_PER_SECOND * 4.0;
      if (remainingDistance > brakingDistance + AUTOPILOT_MAX_SPEED_METERS_PER_SECOND * 2) {
        const cruiseDistance = remainingDistance - brakingDistance;
        const cruiseTime = cruiseDistance / simulatedSpeed;
        elapsed += cruiseTime;
        remainingDistance = brakingDistance;
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

function updateAutopilotShip(
  state: LocalGameState,
  dt: number,
  destination: AutopilotDestination,
  frameOrigin: Vec3Tuple,
  obstacles: AutopilotObstacle[],
): { arrived: boolean; distance: number } {
  const destinationLocalPosition = vectorFromTuple(toFrameLocalPosition(destination.localPosition, frameOrigin));
  const toTarget = destinationLocalPosition.sub(state.shipPosition);
  const distance = toTarget.length();
  const arrivalDistance = Math.max(
    AUTOPILOT_REACH_DISTANCE_METERS,
    destination.approachRadius + AUTOPILOT_TARGET_SURFACE_BUFFER_METERS,
  );
  const remainingDistance = Math.max(0, distance - arrivalDistance);
  const currentSpeed = state.shipVelocity.length();

  if (distance <= arrivalDistance) {
    state.shipVelocity.set(0, 0, 0);
    state.position.copy(state.shipPosition);
    state.velocity.copy(state.shipVelocity);
    state.rotation.copy(state.shipRotation);
    return { arrived: true, distance };
  }

  const targetDirection = toTarget.normalize();
  const avoidance = new THREE.Vector3();

  obstacles.forEach((obstacle) => {
    if (obstacle.id === destination.id) {
      return;
    }

    const obstacleLocalPosition = vectorFromTuple(toFrameLocalPosition(obstacle.position, frameOrigin));
    const awayFromObstacle = state.shipPosition.clone().sub(obstacleLocalPosition);
    const centerDistance = awayFromObstacle.length();
    const surfaceDistance = centerDistance - obstacle.radius;
    // Look ahead heavily based on current speed and base avoidance buffer to steer wide and early
    const isAsteroid = obstacle.kind === 'asteroid';
    const anticipationBuffer = isAsteroid 
      ? Math.max(AUTOPILOT_AVOIDANCE_BUFFER_METERS * 0.8, currentSpeed * 0.2 + AUTOPILOT_AVOIDANCE_BUFFER_METERS * 0.5)
      : Math.max(AUTOPILOT_AVOIDANCE_BUFFER_METERS * 20, currentSpeed * 1.5 + AUTOPILOT_AVOIDANCE_BUFFER_METERS * 5);
    const influenceRadius = obstacle.radius + anticipationBuffer;

    if (surfaceDistance >= anticipationBuffer || centerDistance >= influenceRadius) {
      return;
    }

    const awayDirection = centerDistance > 1e-5 ? awayFromObstacle.clone().multiplyScalar(1 / centerDistance) : targetDirection.clone().multiplyScalar(-1);
    const obstacleDirection = obstacleLocalPosition.clone().sub(state.shipPosition).normalize();
    
    let evasionDirection: THREE.Vector3;
    if (isAsteroid) {
      evasionDirection = awayDirection.clone();
    } else {
      // Find the tangential path around the obstacle that leads to the target
      let tangentDirection = targetDirection.clone().sub(
        obstacleDirection.clone().multiplyScalar(targetDirection.dot(obstacleDirection)),
      );
      
      // If heading straight dead center into the obstacle, pick an arbitrary tangent
      if (tangentDirection.lengthSq() < 1e-6) {
        tangentDirection = new THREE.Vector3(0, 1, 0).cross(obstacleDirection);
        if (tangentDirection.lengthSq() < 1e-6) {
          tangentDirection = new THREE.Vector3(1, 0, 0).cross(obstacleDirection);
        }
      }
      tangentDirection.normalize();

      // Blend radial push (don't crash) with tangential push (slide around)
      // Scale tangent weight based on how much speed we have (faster = steer wider)
      evasionDirection = awayDirection.clone().addScaledVector(tangentDirection, 3.5).normalize();
    }
    
    const closingBias = clamp((targetDirection.dot(obstacleDirection) + 1) * 0.5, 0.0, 1);
    // Smoothly scale the avoidance strength as we enter the anticipation zone
    const normalizedSurfaceDistance = Math.pow(clamp(1 - surfaceDistance / anticipationBuffer, 0, 1), 0.5);
    const kindWeight = obstacle.kind === 'star' ? 6.0 : obstacle.kind === 'planet' ? 4.5 : obstacle.kind === 'moon' ? 3.0 : 8.0;
    
    avoidance.addScaledVector(evasionDirection, normalizedSurfaceDistance * normalizedSurfaceDistance * closingBias * kindWeight);
  });

  const desiredDirection = targetDirection.clone().addScaledVector(avoidance, AUTOPILOT_AVOIDANCE_WEIGHT);
  if (desiredDirection.lengthSq() < 1e-8) {
    desiredDirection.copy(targetDirection);
  } else {
    desiredDirection.normalize();
  }

  const desiredRotation = createShipFacingQuaternion(desiredDirection);
  state.shipRotation.slerp(desiredRotation, 1 - Math.exp(-AUTOPILOT_TURN_RESPONSE * dt));
  state.shipRotation.rotateTowards(desiredRotation, 0.5 * dt); // Snaps the remaining tail end cleanly
  state.rotation.copy(state.shipRotation);

  const acceleration = getAutopilotAcceleration(currentSpeed);
  const brakeDeceleration = getAutopilotBrakeDeceleration(currentSpeed);
  const absoluteTargetSpeed = getAutopilotTargetSpeed(distance, arrivalDistance);

  const currentForward = new THREE.Vector3(0, 0, -1).applyQuaternion(state.shipRotation);
  const headingAlignment = Math.max(0, currentForward.dot(desiredDirection));
  const throttlingFactor = headingAlignment * headingAlignment * headingAlignment * headingAlignment;
  const targetSpeed = absoluteTargetSpeed * Math.max(0.005, throttlingFactor);

  // Decompose velocity into forward movement and lateral sideways drift
  const forwardScalar = state.shipVelocity.dot(currentForward);
  const forwardVelocity = currentForward.clone().multiplyScalar(forwardScalar);
  const lateralVelocity = state.shipVelocity.clone().sub(forwardVelocity);

  // Aggressively kill sideways drift so the ship tracks flawlessly
  const lateralDamping = Math.max(0, 1 - 4.0 * dt);
  lateralVelocity.multiplyScalar(lateralDamping);

  // Accelerate or brake purely along the forward axis
  let nextForwardScalar = forwardScalar;
  if (targetSpeed < forwardScalar) {
    nextForwardScalar = Math.max(targetSpeed, forwardScalar - brakeDeceleration * dt);
  } else {
    nextForwardScalar = Math.min(targetSpeed, forwardScalar + acceleration * dt);
  }
  nextForwardScalar = Math.max(0, nextForwardScalar);

  // Apply cleanly recombined momentum
  state.shipVelocity.copy(lateralVelocity).add(currentForward.clone().multiplyScalar(nextForwardScalar));

  if (state.shipVelocity.length() > AUTOPILOT_MAX_SPEED_METERS_PER_SECOND) {
    state.shipVelocity.setLength(AUTOPILOT_MAX_SPEED_METERS_PER_SECOND);
  }

  // Safety net to smoothly finish the final millimeter without snapping past the destination
  if (state.shipVelocity.length() * dt > remainingDistance) {
    const safeVelocity = Math.max(0, (remainingDistance / dt) * 0.99);
    state.shipVelocity.setLength(safeVelocity);
  }

  state.shipPosition.addScaledVector(state.shipVelocity, dt);
  state.position.copy(state.shipPosition);
  state.velocity.copy(state.shipVelocity);

  return { arrived: false, distance };
}

function settleShipVelocity(state: LocalGameState, dt: number): void {
  const shipDampFactor = Math.max(0, 1 - SHIP_LINEAR_DAMPING * dt);
  state.shipVelocity.multiplyScalar(shipDampFactor);
  if (state.shipVelocity.length() < 0.2) {
    state.shipVelocity.set(0, 0, 0);
  }
  state.shipPosition.addScaledVector(state.shipVelocity, dt);
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
    shipPosition: new THREE.Vector3(SHIP_SPAWN_OFFSET_METERS, 0, 0),
    shipVelocity: new THREE.Vector3(0, 0, 0),
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
  target.shipRotation.set(...snapshot.ship.rotation);

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
      const destinationLocalPosition = vectorFromTuple(
        toFrameLocalPosition(autopilotDestination.localPosition, activeFrameOrigin),
      );
      const liveDistance = destinationLocalPosition.distanceTo(localStateRef.current.shipPosition);

      const calculatedEta = estimateAutopilotEtaSeconds(
        liveDistance,
        autopilotDestination.approachRadius,
        localStateRef.current.shipVelocity.length(),
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

      state.frameSystemId = station.systemId;
      state.frameOrigin.copy(base);
      state.mode = 'space';
      state.insideShip = false;
      state.position.copy(playerOffset);
      state.velocity.set(0, 0, 0);
      state.shipPosition.copy(shipOffset);
      state.shipVelocity.set(0, 0, 0);
      state.shipRotation.identity();
      state.rotation.identity();
      state.yaw = 0;
      state.pitch = 0;
      state.interiorPosition.set(0, SHIP_INTERIOR_FLOOR_HEIGHT_METERS, 2.5);
      state.interiorVelocity.set(0, 0, 0);
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

    setAutopilotEngaged(true);
    setAutopilotReachedDestinationId('');
    setAutopilotStatus(`Autopilot engaged for ${autopilotDestination.name}.`);
  }, [autopilotDestination, hud.mode]);



  const handleDisengageAutopilot = useCallback(() => {
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
          'The pilot seat now operates autopilot only; the ship handles turning and thrust automatically.',
          'Pick a destination in the autopilot panel and the ship will fly there, slowing itself near arrival.',
          'Press X to stand up and return to the interior. Press T for the Space-Tablet.',
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
            setAutopilotEngaged(false);
            setAutopilotStatus('Autopilot disengaged.');
          }}
          onEngageAutopilot={(dest) => {
            setAutopilotDestination(dest);
            setAutopilotEngaged(true);
            setAutopilotReachedDestinationId('');
            setAutopilotStatus(`Autopilot engaged for ${dest.name}.`);
            setTabletOpen(false);
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

      state.position.addScaledVector(state.velocity, dt);
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
        const autopilotStep = updateAutopilotShip(state, dt, autopilotDestination, activeFrameOrigin, autopilotObstacles);
        if (autopilotStep.arrived) {
          onAutopilotArrival(autopilotDestination.id);
          onAutopilotToggle(false);
          onAutopilotStatusChange(`Destination reached: ${autopilotDestination.name}.`);
        }
      } else {
        settleShipVelocity(state, dt);
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
        onAutopilotToggle(false);
        onAutopilotStatusChange('Autopilot disengaged.');
      }
    } else {
      if (autopilotAvailable && autopilotDestination) {
        const autopilotStep = updateAutopilotShip(state, dt, autopilotDestination, activeFrameOrigin, autopilotObstacles);
        if (autopilotStep.arrived) {
          onAutopilotArrival(autopilotDestination.id);
          onAutopilotToggle(false);
          onAutopilotStatusChange(`Destination reached: ${autopilotDestination.name}.`);
        }
      } else {
        settleShipVelocity(state, dt);
      }

      const cockpitOffset = pilotCameraOffset.clone().applyQuaternion(state.shipRotation);
      camera.position.copy(state.shipPosition).add(cockpitOffset);
      camera.quaternion.copy(state.shipRotation);

      if (consumeAction('KeyX')) {
        state.mode = 'interior';
        state.interiorPosition.copy(seatPosition).add(new THREE.Vector3(0, 0, 0.8));
        state.interiorVelocity.set(0, 0, 0);
      }
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
          ? `Autopilot en route to ${autopilotDestination.name}. ETA ${autopilotEtaLabel}. Press X to stand up from the seat.`
          : 'Pilot seat engaged. Select a destination in the autopilot panel, or press X to stand up.';
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
      selectedMarker.kind !== 'ship' &&
      selectedMarker.kind !== 'system' &&
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
                    ((marker.kind === 'station' && (mapMode === 'system' || mapMode === 'sector')) ||
                      (mapMode === 'sector' && marker.kind !== 'ship' && marker.kind !== 'system' && marker.kind !== 'star')) &&
                    hudMode !== 'space' &&
                    marker.localPosition &&
                    (typeof markerDistance !== 'number' || markerDistance > 50)
                  );
                  const autopilotEtaSeconds = canAutopilot && markerDistance !== null
                    ? estimateAutopilotEtaSeconds(markerDistance, marker.approachRadius, shipSpeed)
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

                            {mapMode === 'sector' && canAutopilot ? (
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

function StarSystem({ highlightedAsteroidTargetId, renderPosition, system }: { highlightedAsteroidTargetId: string; renderPosition: Vec3Tuple; system: StarSystemData }): ReactElement {
  const { camera, scene } = useThree();
  const haloRef = useRef<THREE.Mesh>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const intersections = useMemo<THREE.Intersection[]>(() => [], []);
  const worldPosition = useMemo(() => new THREE.Vector3(...renderPosition), [renderPosition]);
  const projectedPosition = useMemo(() => new THREE.Vector3(), []);
  const lastOcclusionCheckRef = useRef(0);
  const haloVisibleRef = useRef(true);

  useFrame((state) => {
    if (!haloRef.current) {
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
            <meshBasicMaterial color={system.color} transparent opacity={0.07} />
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
    const opacity = THREE.MathUtils.clamp(distanceFactor * viewFactor * 0.22, 0.01, 0.16);

    coreMaterialRef.current.opacity = opacity;
    haloMaterialRef.current.opacity = opacity * 0.35;
    ghostOneMaterialRef.current.opacity = opacity * 0.4;
    ghostTwoMaterialRef.current.opacity = opacity * 0.26;
    ghostThreeMaterialRef.current.opacity = opacity * 0.18;

    const starScale = THREE.MathUtils.clamp(starRadius * 0.00012, 0.045, 0.12);
    const flareScale = starScale * (1 + distanceFactor * 1.6);
    coreSpriteRef.current.scale.setScalar(flareScale);
    haloSpriteRef.current.scale.setScalar(flareScale * 2.8);
    ghostOneRef.current.scale.setScalar(flareScale * 0.8);
    ghostTwoRef.current.scale.setScalar(flareScale * 1.25);
    ghostThreeRef.current.scale.setScalar(flareScale * 0.55);
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
  return (
    <>
      <PhysicalProxyGroup physicalPosition={physicalPosition} visibleRange={PLANET_VISIBILITY_RANGE}>
        <mesh>
          <sphereGeometry args={[planet.radius, 20, 20]} />
          <meshStandardMaterial color={planet.color} roughness={0.92} metalness={0.08} />
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
  return (
    <>
      <PhysicalProxyGroup physicalPosition={physicalPosition} visibleRange={PLANET_VISIBILITY_RANGE}>
        <mesh>
          <sphereGeometry args={[moon.radius, 16, 16]} />
          <meshStandardMaterial color={moon.color} roughness={0.97} metalness={0.04} />
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
