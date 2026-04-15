import {
  galaxyConfig,
  type GalaxyConfigAsteroidGroup,
  type GalaxyConfigMoon,
  type GalaxyConfigOrbit,
  type GalaxyConfigPlanet,
  type GalaxyConfigStation,
  type GalaxyConfigSystem,
} from './galaxyConfig';

export type GalaxyVec3 = [number, number, number];

export type StationKind = 'star' | 'planet' | 'asteroid';

export interface StationData {
  id: string;
  name: string;
  kind: StationKind;
  modelPath?: string;
  modelScale: number;
  borderRadius: number;
  position: GalaxyVec3;
}

export interface MoonData {
  id: string;
  name: string;
  position: GalaxyVec3;
  radius: number;
  color: string;
  stations: StationData[];
}

export interface PlanetData {
  id: string;
  name: string;
  position: GalaxyVec3;
  radius: number;
  color: string;
  moons: MoonData[];
  stations: StationData[];
}

export interface AsteroidData {
  id: string;
  position: GalaxyVec3;
  rotation: GalaxyVec3;
  scale: GalaxyVec3;
  size: number;
  shape: 'boring' | 'abstract';
}

export interface DustAsteroidData {
  position: GalaxyVec3;
  size: number;
  rotation: GalaxyVec3;
}

export interface AsteroidGroupData {
  id: string;
  position: GalaxyVec3;
  radius: number;
  asteroids: AsteroidData[];
  dust: DustAsteroidData[];
  station: StationData;
}

export interface StarSystemData {
  id: string;
  name: string;
  mapPosition: GalaxyVec3;
  color: string;
  radius: number;
  station: StationData;
  planets: PlanetData[];
  asteroidGroups: AsteroidGroupData[];
}

export interface GalaxyData {
  systems: StarSystemData[];
}

const METERS_PER_ASTRONOMICAL_UNIT = 149_597_870_700;
export const GALAXY_MAP_SYSTEM_DISTANCE = 420;
export const GALAXY_MAP_RADIUS = 15_000;
export const STAR_VISIBILITY_RANGE = 10_000;
export const STAR_LENS_FLARE_RANGE = 2_500_000_000_000;
export const PLANET_VISIBILITY_RANGE = 74_799_000_000; // ~0.5 AU
export const MOON_VISIBILITY_RANGE = 40_000_000;
export const ASTEROID_GROUP_VISIBILITY_RANGE = 3_000_000_000;
export const SMALL_ASTEROID_VISIBILITY_RANGE = 1_200_000_000;

const STAR_COUNT = 1;
const MIN_PLANET_ORBIT_RADIUS = 0.38 * METERS_PER_ASTRONOMICAL_UNIT;
const MAX_PLANET_ORBIT_RADIUS = 5.2 * METERS_PER_ASTRONOMICAL_UNIT;
const MAX_MOON_ORBIT_RADIUS = 1_600_000_000;
const MIN_ASTEROID_GROUP_RADIUS = 1.8 * METERS_PER_ASTRONOMICAL_UNIT;
const MAX_ASTEROID_GROUP_RADIUS = 4.6 * METERS_PER_ASTRONOMICAL_UNIT;
const PLANET_STATION_STANDOFF = 600_000;
const ASTEROID_STATION_STANDOFF = 18_000_000;
const STAR_STATION_STANDOFF = 180_000_000;
const LARGE_ASTEROID_THRESHOLD = 80;

const starColors = ['#ffffff'];
const planetColors = ['#7dd3fc', '#fca5a5', '#c4b5fd', '#86efac', '#fcd34d', '#fdba74', '#93c5fd'];
const METERS_PER_KILOMETER = 1_000;

function toGalaxyVec3([x, y, z]: readonly number[]): GalaxyVec3 {
  return [x, y, z];
}

function kmToMeters(valueKm: number): number {
  return valueKm * METERS_PER_KILOMETER;
}

function orbitToPosition(orbit: GalaxyConfigOrbit): GalaxyVec3 {
  const radians = (orbit.angleDeg * Math.PI) / 180;
  const distance = kmToMeters(orbit.distanceKm);
  return [
    Math.cos(radians) * distance,
    kmToMeters(orbit.verticalOffsetKm ?? 0),
    Math.sin(radians) * distance,
  ];
}

function toStationData(station: GalaxyConfigStation): StationData {
  return {
    id: station.id,
    name: station.name,
    kind: station.kind,
    modelPath: station.modelPath,
    modelScale: station.modelScale ?? 1,
    borderRadius: kmToMeters(station.borderRadiusKm),
    position: orbitToPosition(station.orbit),
  };
}

function toMoonData(moon: GalaxyConfigMoon): MoonData {
  return {
    id: moon.id,
    name: moon.name,
    position: orbitToPosition(moon.orbit),
    radius: kmToMeters(moon.radiusKm),
    color: moon.color,
    stations: moon.stations.map(toStationData),
  };
}

function toPlanetData(planet: GalaxyConfigPlanet): PlanetData {
  return {
    id: planet.id,
    name: planet.name,
    position: orbitToPosition(planet.orbit),
    radius: kmToMeters(planet.radiusKm),
    color: planet.color,
    moons: planet.moons.map(toMoonData),
    stations: planet.stations.map(toStationData),
  };
}

function buildConfiguredDust(random: () => number, radius: number, dustCount: number): DustAsteroidData[] {
  return Array.from({ length: dustCount }, () => {
    const angle = random() * Math.PI * 2;
    const dustRadius = Math.pow(random(), 0.7) * radius * 1.2;
    return {
      position: [
        Math.cos(angle) * dustRadius,
        (random() - 0.5) * Math.max(radius * 0.25, 400),
        Math.sin(angle) * dustRadius,
      ],
      size: 1 + random() * 9,
      rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
    };
  });
}

function buildConfiguredAsteroidGroup(group: GalaxyConfigAsteroidGroup): AsteroidGroupData {
  const random = createSeededRandom(group.layoutSeed);
  const radius = kmToMeters(group.radiusKm);
  const dust = buildConfiguredDust(random, radius, group.dustCount);
  return {
    id: group.id,
    position: orbitToPosition(group.orbit),
    radius,
    asteroids: Array.from({ length: group.asteroidCount }, (_, index) =>
      createAsteroid(random, group.id, index + 1, radius),
    ),
    dust,
    station: toStationData(group.station),
  };
}

function buildConfiguredStarSystem(system: GalaxyConfigSystem): StarSystemData {
  return {
    id: system.id,
    name: system.name,
    mapPosition: toGalaxyVec3(system.mapPosition),
    color: system.color,
    radius: kmToMeters(system.radiusKm),
    station: toStationData(system.station),
    planets: system.planets.map(toPlanetData),
    asteroidGroups: system.asteroidGroups.map(buildConfiguredAsteroidGroup),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function pick<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)] ?? items[0];
}

function tupleDistance(a: GalaxyVec3, b: GalaxyVec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function gaussianRandom(random: () => number, mean: number, deviation: number): number {
  const u1 = Math.max(random(), 1e-6);
  const u2 = Math.max(random(), 1e-6);
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + normal * deviation;
}

function randomIntFromNormal(
  random: () => number,
  minimum: number,
  maximum: number,
  mean: number,
  deviation: number,
): number {
  return clamp(Math.round(gaussianRandom(random, mean, deviation)), minimum, maximum);
}

function randomRadialPosition(random: () => number, radius: number): GalaxyVec3 {
  const theta = random() * Math.PI * 2;
  const phi = Math.acos(2 * random() - 1);
  const distance = radius * Math.pow(random(), 1.75);
  return [
    distance * Math.sin(phi) * Math.cos(theta),
    distance * Math.cos(phi) * 0.45,
    distance * Math.sin(phi) * Math.sin(theta),
  ];
}

function sortIncreasing(values: number[]): number[] {
  return [...values].sort((left, right) => left - right);
}

function buildPlanetOrbits(random: () => number, count: number): number[] {
  const availableSpan = MAX_PLANET_ORBIT_RADIUS - MIN_PLANET_ORBIT_RADIUS;
  const raw = Array.from({ length: count }, () => MIN_PLANET_ORBIT_RADIUS + random() * availableSpan);
  const sorted = sortIncreasing(raw);
  return sorted.map((value, index) => {
    const minimum = MIN_PLANET_ORBIT_RADIUS + index * (0.28 * METERS_PER_ASTRONOMICAL_UNIT);
    return clamp(
      Math.max(value, minimum),
      minimum,
      MAX_PLANET_ORBIT_RADIUS - (count - index - 1) * (0.22 * METERS_PER_ASTRONOMICAL_UNIT),
    );
  });
}

function buildMoonCount(random: () => number): number {
  if (random() > 0.6) {
    return 0;
  }

  let count = randomIntFromNormal(random, 1, 5, 2, 1.5);
  return count;
}

function buildMoonOrbits(random: () => number, count: number, planetRadius: number): number[] {
  // Start moons much further out so there's room for stations etc
  const start = planetRadius * 4 + 220_000_000 + random() * 280_000_000;
  return Array.from({ length: count }, (_, index) =>
    clamp(
      start + index * (260_000_000 + random() * 320_000_000),
      planetRadius * 4 + 120_000_000,
      MAX_MOON_ORBIT_RADIUS * 5, // Expanded max to fit more moons
    ),
  );
}

function buildAsteroidCount(random: () => number): number {
  return randomIntFromNormal(random, 20, 150, 85, 30);
}

function buildAsteroidSize(random: () => number): number {
  return 1 + Math.pow(random(), 2.8) * 249;
}

function buildSystemName(index: number): string {
  return `SYS-${String(index + 1).padStart(2, '0')}`;
}

function buildStationName(label: string, suffix: string): string {
  return `${label} ${suffix}`;
}

function createStation(random: () => number, id: string, name: string, kind: StationKind, orbitRadius: number): StationData {
  const angle = random() * Math.PI * 2;
  const borderRadius = kind === 'star' ? 772.8 : kind === 'asteroid' ? 764.44 : 767.1;
  return {
    id,
    name,
    kind,
    modelScale: 1,
    borderRadius,
    position: [Math.cos(angle) * orbitRadius, (random() - 0.5) * orbitRadius * 0.12, Math.sin(angle) * orbitRadius],
  };
}

function createPlanet(random: () => number, id: string, orbitRadius: number): PlanetData {
  const angle = random() * Math.PI * 2;
  const position: GalaxyVec3 = [Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius];
  const radius = 2_400_000 + Math.pow(random(), 0.62) * 68_000_000;
  const moonCount = buildMoonCount(random);
  const moonOrbits = buildMoonOrbits(random, moonCount, radius);

  const moons = moonOrbits.map((moonOrbit, index) => {
    const moonAngle = random() * Math.PI * 2;
    const moonRadius = clamp(radius * (0.08 + random() * 0.16), 120_000, 3_200_000);
    const moonId = `${id}-moon-${index + 1}`;
    
    // Moons now also get 2-4 stations, like close-moons
    const stationCount = 2 + Math.floor(random() * 3);
    const stations = Array.from({ length: stationCount }, (_, stationIndex) =>
      createStation(
        random,
        `${moonId}-station-${stationIndex + 1}`,
        buildStationName(`Moon ${index + 1} Station`, `${stationIndex + 1}`),
        'planet', // Use planet type to get identical mechanics/looks to a standard station
        moonRadius + 180_000_000 + random() * 120_000_000,
      )
    );

    return {
      id: moonId,
      name: `Moon ${index + 1}`,
      position: [Math.cos(moonAngle) * moonOrbit, 0, Math.sin(moonAngle) * moonOrbit] as GalaxyVec3,
      radius: moonRadius,
      color: pick(planetColors, random),
      stations,
    } satisfies MoonData;
  });

  // Planet gets 2-4 stations stationed away from surface like close-moons
  const stationCount = 2 + Math.floor(random() * 3);
  const stations = Array.from({ length: stationCount }, (_, stationIndex) =>
    createStation(
      random,
      `${id}-station-${stationIndex + 1}`,
      buildStationName(id.split('-').slice(-1)[0] ?? 'Planet', `Station ${stationIndex + 1}`),
      'planet',
      radius + 180_000_000 + random() * 120_000_000,
    )
  );

  return {
    id,
    name: `Planet ${id.split('-').slice(-1)[0]}`,
    position,
    radius,
    color: pick(planetColors, random),
    moons,
    stations,
  };
}

function createAsteroid(random: () => number, groupId: string, index: number, fieldRadius: number): AsteroidData {
  const angle = random() * Math.PI * 2;
  const radius = Math.pow(random(), 0.55) * fieldRadius;
  const size = buildAsteroidSize(random);
  const boring = size < LARGE_ASTEROID_THRESHOLD || random() > 0.42;
  const verticalSpread = Math.max(fieldRadius * 0.15, 300);

  if (boring) {
    const scale = size * (0.8 + random() * 0.2);
    return {
      id: `${groupId}-asteroid-${index}`,
      position: [Math.cos(angle) * radius, (random() - 0.5) * verticalSpread, Math.sin(angle) * radius],
      rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
      scale: [scale, scale, scale],
      size,
      shape: 'boring',
    };
  }

  return {
    id: `${groupId}-asteroid-${index}`,
    position: [Math.cos(angle) * radius, (random() - 0.5) * verticalSpread * 1.6, Math.sin(angle) * radius],
    rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
    scale: [size * (0.7 + random() * 0.7), size * (0.55 + random() * 0.9), size * (0.7 + random() * 0.8)],
    size,
    shape: 'abstract',
  };
}

function createAsteroidGroup(random: () => number, id: string): AsteroidGroupData {
  const orbitRadius = MIN_ASTEROID_GROUP_RADIUS + random() * (MAX_ASTEROID_GROUP_RADIUS - MIN_ASTEROID_GROUP_RADIUS);
  const angle = random() * Math.PI * 2;
  const asteroidCount = buildAsteroidCount(random);
  const radius = 2_000 + random() * 4_000;
  const dustCount = 1000;
  const dust: DustAsteroidData[] = Array.from({ length: dustCount }, () => {
    const dAngle = random() * Math.PI * 2;
    const dRadius = Math.pow(random(), 0.7) * radius * 1.2;
    return {
      position: [Math.cos(dAngle) * dRadius, (random() - 0.5) * Math.max(radius * 0.25, 400), Math.sin(dAngle) * dRadius],
      size: 1 + random() * 9,
      rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI],
    };
  });

  return {
    id,
    position: [Math.cos(angle) * orbitRadius, (random() - 0.5) * 8_000, Math.sin(angle) * orbitRadius],
    radius,
    asteroids: Array.from({ length: asteroidCount }, (_, index) => createAsteroid(random, id, index + 1, radius)),
    dust,
    station: createStation(
      random,
      `${id}-station`,
      buildStationName('Belt', 'Station'),
      'asteroid',
      radius + 400 + random() * 800,
    ),
  };
}

function createStarSystem(random: () => number, index: number, mapPosition: GalaxyVec3): StarSystemData {
  const planetCount = randomIntFromNormal(random, 2, 12, 6.2, 1.85);
  const planetOrbits = buildPlanetOrbits(random, planetCount);
  const asteroidGroupCount = randomIntFromNormal(random, 5, 15, 8.5, 2.25);
  const name = buildSystemName(index);
  const radius = 320_000_000 + Math.pow(random(), 0.55) * 1_050_000_000;

  return {
    id: `system-${index + 1}`,
    name,
    mapPosition,
    color: pick(starColors, random),
    radius,
    station: createStation(
      random,
      `system-${index + 1}-station`,
      buildStationName(name, 'Prime Station'),
      'star',
      radius + STAR_STATION_STANDOFF + random() * 900_000_000,
    ),
    planets: planetOrbits.map((orbitRadius, planetIndex) => createPlanet(random, `system-${index + 1}-planet-${planetIndex + 1}`, orbitRadius)),
    asteroidGroups: Array.from({ length: asteroidGroupCount }, (_, groupIndex) =>
      createAsteroidGroup(random, `system-${index + 1}-asteroid-group-${groupIndex + 1}`),
    ),
  };
}

export function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateGalaxy(seed: number): GalaxyData {
  void seed;
  return {
    systems: galaxyConfig.systems.map(buildConfiguredStarSystem),
  };
}

export function isLargeAsteroid(asteroid: AsteroidData): boolean {
  return asteroid.size >= LARGE_ASTEROID_THRESHOLD;
}
