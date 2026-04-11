"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SMALL_ASTEROID_VISIBILITY_RANGE = exports.ASTEROID_GROUP_VISIBILITY_RANGE = exports.MOON_VISIBILITY_RANGE = exports.PLANET_VISIBILITY_RANGE = exports.STAR_LENS_FLARE_RANGE = exports.STAR_VISIBILITY_RANGE = exports.GALAXY_MAP_RADIUS = exports.GALAXY_MAP_SYSTEM_DISTANCE = void 0;
exports.createSeededRandom = createSeededRandom;
exports.generateGalaxy = generateGalaxy;
exports.isLargeAsteroid = isLargeAsteroid;
const METERS_PER_ASTRONOMICAL_UNIT = 149597870700;
exports.GALAXY_MAP_SYSTEM_DISTANCE = 420;
exports.GALAXY_MAP_RADIUS = 15000;
exports.STAR_VISIBILITY_RANGE = 10000;
exports.STAR_LENS_FLARE_RANGE = 2500000000000;
exports.PLANET_VISIBILITY_RANGE = 750000000000;
exports.MOON_VISIBILITY_RANGE = 40000000;
exports.ASTEROID_GROUP_VISIBILITY_RANGE = 3000000000;
exports.SMALL_ASTEROID_VISIBILITY_RANGE = 1200000000;
const STAR_COUNT = 1;
const MIN_PLANET_ORBIT_RADIUS = 0.38 * METERS_PER_ASTRONOMICAL_UNIT;
const MAX_PLANET_ORBIT_RADIUS = 5.2 * METERS_PER_ASTRONOMICAL_UNIT;
const MAX_MOON_ORBIT_RADIUS = 1600000000;
const MIN_ASTEROID_GROUP_RADIUS = 1.8 * METERS_PER_ASTRONOMICAL_UNIT;
const MAX_ASTEROID_GROUP_RADIUS = 4.6 * METERS_PER_ASTRONOMICAL_UNIT;
const PLANET_STATION_STANDOFF = 600000;
const ASTEROID_STATION_STANDOFF = 18000000;
const STAR_STATION_STANDOFF = 180000000;
const LARGE_ASTEROID_THRESHOLD = 80;
const starColors = ['#ffffff'];
const planetColors = ['#7dd3fc', '#fca5a5', '#c4b5fd', '#86efac', '#fcd34d', '#fdba74', '#93c5fd'];
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function pick(items, random) {
    return items[Math.floor(random() * items.length)] ?? items[0];
}
function tupleDistance(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
function gaussianRandom(random, mean, deviation) {
    const u1 = Math.max(random(), 1e-6);
    const u2 = Math.max(random(), 1e-6);
    const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + normal * deviation;
}
function randomIntFromNormal(random, minimum, maximum, mean, deviation) {
    return clamp(Math.round(gaussianRandom(random, mean, deviation)), minimum, maximum);
}
function randomRadialPosition(random, radius) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const distance = radius * Math.pow(random(), 1.75);
    return [
        distance * Math.sin(phi) * Math.cos(theta),
        distance * Math.cos(phi) * 0.45,
        distance * Math.sin(phi) * Math.sin(theta),
    ];
}
function sortIncreasing(values) {
    return [...values].sort((left, right) => left - right);
}
function buildPlanetOrbits(random, count) {
    const availableSpan = MAX_PLANET_ORBIT_RADIUS - MIN_PLANET_ORBIT_RADIUS;
    const raw = Array.from({ length: count }, () => MIN_PLANET_ORBIT_RADIUS + random() * availableSpan);
    const sorted = sortIncreasing(raw);
    return sorted.map((value, index) => {
        const minimum = MIN_PLANET_ORBIT_RADIUS + index * (0.28 * METERS_PER_ASTRONOMICAL_UNIT);
        return clamp(Math.max(value, minimum), minimum, MAX_PLANET_ORBIT_RADIUS - (count - index - 1) * (0.22 * METERS_PER_ASTRONOMICAL_UNIT));
    });
}
function buildMoonCount(random) {
    if (random() > 0.6) {
        return 0;
    }
    let count = randomIntFromNormal(random, 1, 5, 2, 1.5);
    return count;
}
function buildMoonOrbits(random, count, planetRadius) {
    // Start moons much further out so there's room for stations etc
    const start = planetRadius * 4 + 220000000 + random() * 280000000;
    return Array.from({ length: count }, (_, index) => clamp(start + index * (260000000 + random() * 320000000), planetRadius * 4 + 120000000, MAX_MOON_ORBIT_RADIUS * 5));
}
function buildAsteroidCount(random) {
    return randomIntFromNormal(random, 20, 150, 85, 30);
}
function buildAsteroidSize(random) {
    return 1 + Math.pow(random(), 2.8) * 249;
}
function buildSystemName(index) {
    return `SYS-${String(index + 1).padStart(2, '0')}`;
}
function buildStationName(label, suffix) {
    return `${label} ${suffix}`;
}
function createStation(random, id, name, kind, orbitRadius) {
    const angle = random() * Math.PI * 2;
    return {
        id,
        name,
        kind,
        position: [Math.cos(angle) * orbitRadius, (random() - 0.5) * orbitRadius * 0.12, Math.sin(angle) * orbitRadius],
    };
}
function createPlanet(random, id, orbitRadius) {
    const angle = random() * Math.PI * 2;
    const position = [Math.cos(angle) * orbitRadius, 0, Math.sin(angle) * orbitRadius];
    const radius = 2400000 + Math.pow(random(), 0.62) * 68000000;
    const moonCount = buildMoonCount(random);
    const moonOrbits = buildMoonOrbits(random, moonCount, radius);
    const moons = moonOrbits.map((moonOrbit, index) => {
        const moonAngle = random() * Math.PI * 2;
        const moonRadius = clamp(radius * (0.08 + random() * 0.16), 120000, 3200000);
        const moonId = `${id}-moon-${index + 1}`;
        // Moons now also get 2-4 stations, like close-moons
        const stationCount = 2 + Math.floor(random() * 3);
        const stations = Array.from({ length: stationCount }, (_, stationIndex) => createStation(random, `${moonId}-station-${stationIndex + 1}`, buildStationName(`Moon ${index + 1} Station`, `${stationIndex + 1}`), 'planet', // Use planet type to get identical mechanics/looks to a standard station
        moonRadius + 180000000 + random() * 120000000));
        return {
            id: moonId,
            name: `Moon ${index + 1}`,
            position: [Math.cos(moonAngle) * moonOrbit, 0, Math.sin(moonAngle) * moonOrbit],
            radius: moonRadius,
            color: pick(planetColors, random),
            stations,
        };
    });
    // Planet gets 2-4 stations stationed away from surface like close-moons
    const stationCount = 2 + Math.floor(random() * 3);
    const stations = Array.from({ length: stationCount }, (_, stationIndex) => createStation(random, `${id}-station-${stationIndex + 1}`, buildStationName(id.split('-').slice(-1)[0] ?? 'Planet', `Station ${stationIndex + 1}`), 'planet', radius + 180000000 + random() * 120000000));
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
function createAsteroid(random, groupId, index, fieldRadius) {
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
function createAsteroidGroup(random, id) {
    const orbitRadius = MIN_ASTEROID_GROUP_RADIUS + random() * (MAX_ASTEROID_GROUP_RADIUS - MIN_ASTEROID_GROUP_RADIUS);
    const angle = random() * Math.PI * 2;
    const asteroidCount = buildAsteroidCount(random);
    const radius = 2000 + random() * 4000;
    const dustCount = 1000;
    const dust = Array.from({ length: dustCount }, () => {
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
        position: [Math.cos(angle) * orbitRadius, (random() - 0.5) * 8000, Math.sin(angle) * orbitRadius],
        radius,
        asteroids: Array.from({ length: asteroidCount }, (_, index) => createAsteroid(random, id, index + 1, radius)),
        dust,
        station: createStation(random, `${id}-station`, buildStationName('Belt', 'Station'), 'asteroid', radius + 400 + random() * 800),
    };
}
function createStarSystem(random, index, mapPosition) {
    const planetCount = randomIntFromNormal(random, 2, 12, 6.2, 1.85);
    const planetOrbits = buildPlanetOrbits(random, planetCount);
    const asteroidGroupCount = randomIntFromNormal(random, 5, 15, 8.5, 2.25);
    const name = buildSystemName(index);
    const radius = 320000000 + Math.pow(random(), 0.55) * 1050000000;
    return {
        id: `system-${index + 1}`,
        name,
        mapPosition,
        color: pick(starColors, random),
        radius,
        station: createStation(random, `system-${index + 1}-station`, buildStationName(name, 'Prime Station'), 'star', radius + STAR_STATION_STANDOFF + random() * 900000000),
        planets: planetOrbits.map((orbitRadius, planetIndex) => createPlanet(random, `system-${index + 1}-planet-${planetIndex + 1}`, orbitRadius)),
        asteroidGroups: Array.from({ length: asteroidGroupCount }, (_, groupIndex) => createAsteroidGroup(random, `system-${index + 1}-asteroid-group-${groupIndex + 1}`)),
    };
}
function createSeededRandom(seed) {
    let value = seed >>> 0;
    return () => {
        value += 0x6d2b79f5;
        let next = value;
        next = Math.imul(next ^ (next >>> 15), next | 1);
        next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
}
function generateGalaxy(seed) {
    const random = createSeededRandom(seed);
    const systems = [];
    const homeSystemPosition = [0, 0, 0];
    systems.push(createStarSystem(random, 0, homeSystemPosition));
    let attempts = 0;
    while (systems.length < STAR_COUNT && attempts < STAR_COUNT * 120) {
        attempts += 1;
        const position = randomRadialPosition(random, exports.GALAXY_MAP_RADIUS);
        const farEnough = systems.every((system) => tupleDistance(system.mapPosition, position) >= exports.GALAXY_MAP_SYSTEM_DISTANCE);
        if (!farEnough) {
            continue;
        }
        systems.push(createStarSystem(random, systems.length, position));
    }
    return { systems };
}
function isLargeAsteroid(asteroid) {
    return asteroid.size >= LARGE_ASTEROID_THRESHOLD;
}
