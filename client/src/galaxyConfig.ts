export interface GalaxyConfigOrbit {
  distanceKm: number;
  angleDeg: number;
  verticalOffsetKm?: number;
}

export type GalaxyConfigVec3 = [number, number, number];
export type GalaxyConfigStationKind = 'star' | 'planet' | 'asteroid';

export interface GalaxyConfigStation {
  id: string;
  name: string;
  kind: GalaxyConfigStationKind;
  orbit: GalaxyConfigOrbit;
}

export interface GalaxyConfigMoon {
  id: string;
  name: string;
  orbit: GalaxyConfigOrbit;
  radiusKm: number;
  color: string;
  stations: GalaxyConfigStation[];
}

export interface GalaxyConfigPlanet {
  id: string;
  name: string;
  orbit: GalaxyConfigOrbit;
  radiusKm: number;
  color: string;
  moons: GalaxyConfigMoon[];
  stations: GalaxyConfigStation[];
}

export interface GalaxyConfigAsteroidGroup {
  id: string;
  orbit: GalaxyConfigOrbit;
  radiusKm: number;
  asteroidCount: number;
  dustCount: number;
  layoutSeed: number;
  station: GalaxyConfigStation;
}

export interface GalaxyConfigSystem {
  id: string;
  name: string;
  mapPosition: GalaxyConfigVec3;
  color: string;
  radiusKm: number;
  station: GalaxyConfigStation;
  planets: GalaxyConfigPlanet[];
  asteroidGroups: GalaxyConfigAsteroidGroup[];
}

export interface GalaxySystemConfig {
  systems: GalaxyConfigSystem[];
}

// This file is the editable source of truth for the game's single star system.
//
// Orbital placement is expressed as:
// - `distanceKm`: orbital distance from the parent body in kilometers
// - `angleDeg`: orbit angle around the parent body on the XZ plane
// - `verticalOffsetKm`: optional vertical offset from the orbital plane
//
// Radii are also stored in kilometers to keep the file easy to edit.
// The values below were converted from the previous procedural generation using seed 42.
export const galaxyConfig: GalaxySystemConfig = {
  systems: [
    {
      id: 'system-1',
      name: 'SYS-01',
      mapPosition: [0, 0, 0],
      color: '#ffffff',
      radiusKm: 1289793.328364,
      station: {
        id: 'system-1-station',
        name: 'SYS-01 Prime Station',
        kind: 'star',
        orbit: {
          distanceKm: 1694724.689168,
          angleDeg: 317.54118,
          verticalOffsetKm: 49974.902212,
        },
      },
      planets: [
        {
          id: 'system-1-planet-1',
          name: 'Planet 1',
          orbit: {
            distanceKm: 182898804.30797,
            angleDeg: 110.520545,
          },
          radiusKm: 27255.625635,
          color: '#86efac',
          moons: [
            {
              id: 'system-1-planet-1-moon-1',
              name: 'Moon 1',
              orbit: {
                distanceKm: 330098.529091,
                angleDeg: 301.441473,
              },
              radiusKm: 2403.768545,
              color: '#86efac',
              stations: [
                {
                  id: 'system-1-planet-1-moon-1-station-1',
                  name: 'Moon 1 Station 1',
                  kind: 'planet',
                  orbit: {
                    distanceKm: 186188.323221,
                    angleDeg: 96.104155,
                    verticalOffsetKm: -9790.94253,
                  },
                },
                {
                  id: 'system-1-planet-1-moon-1-station-2',
                  name: 'Moon 1 Station 2',
                  kind: 'planet',
                  orbit: {
                    distanceKm: 204686.449405,
                    angleDeg: 282.077026,
                    verticalOffsetKm: 745.114506,
                  },
                },
                {
                  id: 'system-1-planet-1-moon-1-station-3',
                  name: 'Moon 1 Station 3',
                  kind: 'planet',
                  orbit: {
                    distanceKm: 185658.601664,
                    angleDeg: 62.281884,
                    verticalOffsetKm: 7634.759779,
                  },
                },
              ],
            },
          ],
          stations: [
            {
              id: 'system-1-planet-1-station-1',
              name: '1 Station 1',
              kind: 'planet',
              orbit: {
                distanceKm: 245591.035116,
                angleDeg: 161.962462,
                verticalOffsetKm: -13632.09388,
              },
            },
            {
              id: 'system-1-planet-1-station-2',
              name: '1 Station 2',
              kind: 'planet',
              orbit: {
                distanceKm: 213422.753777,
                angleDeg: 200.375921,
                verticalOffsetKm: 2477.313479,
              },
            },
            {
              id: 'system-1-planet-1-station-3',
              name: '1 Station 3',
              kind: 'planet',
              orbit: {
                distanceKm: 236676.58647,
                angleDeg: 232.449986,
                verticalOffsetKm: -8250.247914,
              },
            },
            {
              id: 'system-1-planet-1-station-4',
              name: '1 Station 4',
              kind: 'planet',
              orbit: {
                distanceKm: 243691.181768,
                angleDeg: 265.903694,
                verticalOffsetKm: 10489.76254,
              },
            },
          ],
        },
        {
          id: 'system-1-planet-2',
          name: 'Planet 2',
          orbit: {
            distanceKm: 436552923.905803,
            angleDeg: 73.508435,
          },
          radiusKm: 33571.841115,
          color: '#fdba74',
          moons: [
            {
              id: 'system-1-planet-2-moon-1',
              name: 'Moon 1',
              orbit: {
                distanceKm: 544902.665481,
                angleDeg: 334.022364,
              },
              radiusKm: 3158.267062,
              color: '#fca5a5',
              stations: [
                {
                  id: 'system-1-planet-2-moon-1-station-1',
                  name: 'Moon 1 Station 1',
                  kind: 'planet',
                  orbit: {
                    distanceKm: 234894.76671,
                    angleDeg: 339.226038,
                    verticalOffsetKm: -10223.604708,
                  },
                },
                {
                  id: 'system-1-planet-2-moon-1-station-2',
                  name: 'Moon 1 Station 2',
                  kind: 'planet',
                  orbit: {
                    distanceKm: 196471.446935,
                    angleDeg: 5.703446,
                    verticalOffsetKm: -3290.212562,
                  },
                },
                {
                  id: 'system-1-planet-2-moon-1-station-3',
                  name: 'Moon 1 Station 3',
                  kind: 'planet',
                  orbit: {
                    distanceKm: 240964.969178,
                    angleDeg: 220.291927,
                    verticalOffsetKm: 11553.536965,
                  },
                },
                {
                  id: 'system-1-planet-2-moon-1-station-4',
                  name: 'Moon 1 Station 4',
                  kind: 'planet',
                  orbit: {
                    distanceKm: 192468.155739,
                    angleDeg: 259.055285,
                    verticalOffsetKm: 10043.782844,
                  },
                },
              ],
            },
          ],
          stations: [
            {
              id: 'system-1-planet-2-station-1',
              name: '2 Station 1',
              kind: 'planet',
              orbit: {
                distanceKm: 235126.567403,
                angleDeg: 187.313887,
                verticalOffsetKm: 9082.2365,
              },
            },
            {
              id: 'system-1-planet-2-station-2',
              name: '2 Station 2',
              kind: 'planet',
              orbit: {
                distanceKm: 228042.949926,
                angleDeg: 358.429909,
                verticalOffsetKm: 1718.537544,
              },
            },
            {
              id: 'system-1-planet-2-station-3',
              name: '2 Station 3',
              kind: 'planet',
              orbit: {
                distanceKm: 323506.260891,
                angleDeg: 156.236533,
                verticalOffsetKm: 3045.60534,
              },
            },
            {
              id: 'system-1-planet-2-station-4',
              name: '2 Station 4',
              kind: 'planet',
              orbit: {
                distanceKm: 254007.290978,
                angleDeg: 214.646077,
                verticalOffsetKm: -5396.401302,
              },
            },
          ],
        },
        {
          id: 'system-1-planet-3',
          name: 'Planet 3',
          orbit: {
            distanceKm: 539766781.962942,
            angleDeg: 106.275124,
          },
          radiusKm: 43834.171994,
          color: '#7dd3fc',
          moons: [],
          stations: [
            {
              id: 'system-1-planet-3-station-1',
              name: '3 Station 1',
              kind: 'planet',
              orbit: {
                distanceKm: 330657.947642,
                angleDeg: 155.480929,
                verticalOffsetKm: 1794.009797,
              },
            },
            {
              id: 'system-1-planet-3-station-2',
              name: '3 Station 2',
              kind: 'planet',
              orbit: {
                distanceKm: 259345.713827,
                angleDeg: 36.315878,
                verticalOffsetKm: 6122.265726,
              },
            },
            {
              id: 'system-1-planet-3-station-3',
              name: '3 Station 3',
              kind: 'planet',
              orbit: {
                distanceKm: 261430.844423,
                angleDeg: 282.939329,
                verticalOffsetKm: 12698.495816,
              },
            },
            {
              id: 'system-1-planet-3-station-4',
              name: '3 Station 4',
              kind: 'planet',
              orbit: {
                distanceKm: 235071.133637,
                angleDeg: 171.141048,
                verticalOffsetKm: 9081.760954,
              },
            },
          ],
        },
        {
          id: 'system-1-planet-4',
          name: 'Planet 4',
          orbit: {
            distanceKm: 671527656.460621,
            angleDeg: 350.18871,
          },
          radiusKm: 25754.250819,
          color: '#93c5fd',
          moons: [],
          stations: [
            {
              id: 'system-1-planet-4-station-1',
              name: '4 Station 1',
              kind: 'planet',
              orbit: {
                distanceKm: 255297.681522,
                angleDeg: 58.837488,
                verticalOffsetKm: 4738.316473,
              },
            },
            {
              id: 'system-1-planet-4-station-2',
              name: '4 Station 2',
              kind: 'planet',
              orbit: {
                distanceKm: 246065.989435,
                angleDeg: 74.503484,
                verticalOffsetKm: 3806.248801,
              },
            },
          ],
        },
      ],
      asteroidGroups: [
        {
          id: 'system-1-asteroid-group-1',
          orbit: {
            distanceKm: 405987422.891611,
            angleDeg: 285.273831,
            verticalOffsetKm: -1.345105,
          },
          radiusKm: 5.454809,
          asteroidCount: 113,
          dustCount: 1000,
          layoutSeed: 3722968953,
          station: {
            id: 'system-1-asteroid-group-1-station',
            name: 'Belt Station',
            kind: 'asteroid',
            orbit: {
              distanceKm: 6.057438,
              angleDeg: 34.596131,
              verticalOffsetKm: -0.109642,
            },
          },
        },
        {
          id: 'system-1-asteroid-group-2',
          orbit: {
            distanceKm: 319585979.492369,
            angleDeg: 192.778846,
            verticalOffsetKm: -1.366824,
          },
          radiusKm: 3.703809,
          asteroidCount: 84,
          dustCount: 1000,
          layoutSeed: 2477747592,
          station: {
            id: 'system-1-asteroid-group-2-station',
            name: 'Belt Station',
            kind: 'asteroid',
            orbit: {
              distanceKm: 4.81743,
              angleDeg: 99.204438,
              verticalOffsetKm: -0.125155,
            },
          },
        },
        {
          id: 'system-1-asteroid-group-3',
          orbit: {
            distanceKm: 659904885.726718,
            angleDeg: 95.598892,
            verticalOffsetKm: 1.555984,
          },
          radiusKm: 3.772866,
          asteroidCount: 108,
          dustCount: 1000,
          layoutSeed: 3877505948,
          station: {
            id: 'system-1-asteroid-group-3-station',
            name: 'Belt Station',
            kind: 'asteroid',
            orbit: {
              distanceKm: 4.394509,
              angleDeg: 274.848105,
              verticalOffsetKm: 0.105948,
            },
          },
        },
        {
          id: 'system-1-asteroid-group-4',
          orbit: {
            distanceKm: 510952745.084343,
            angleDeg: 329.76345,
            verticalOffsetKm: 2.889818,
          },
          radiusKm: 4.544657,
          asteroidCount: 95,
          dustCount: 1000,
          layoutSeed: 724667621,
          station: {
            id: 'system-1-asteroid-group-4-station',
            name: 'Belt Station',
            kind: 'asteroid',
            orbit: {
              distanceKm: 5.400981,
              angleDeg: 337.921073,
              verticalOffsetKm: 0.14218,
            },
          },
        },
        {
          id: 'system-1-asteroid-group-5',
          orbit: {
            distanceKm: 357492178.616414,
            angleDeg: 255.047964,
            verticalOffsetKm: 0.397139,
          },
          radiusKm: 2.513144,
          asteroidCount: 99,
          dustCount: 1000,
          layoutSeed: 3689579367,
          station: {
            id: 'system-1-asteroid-group-5-station',
            name: 'Belt Station',
            kind: 'asteroid',
            orbit: {
              distanceKm: 3.262509,
              angleDeg: 69.153825,
              verticalOffsetKm: -0.110277,
            },
          },
        },
        {
          id: 'system-1-asteroid-group-6',
          orbit: {
            distanceKm: 567420545.265522,
            angleDeg: 352.891242,
            verticalOffsetKm: 2.284383,
          },
          radiusKm: 5.644902,
          asteroidCount: 71,
          dustCount: 1000,
          layoutSeed: 4128375487,
          station: {
            id: 'system-1-asteroid-group-6-station',
            name: 'Belt Station',
            kind: 'asteroid',
            orbit: {
              distanceKm: 6.600918,
              angleDeg: 9.801701,
              verticalOffsetKm: 0.128581,
            },
          },
        },
      ],
    },
  ],
};
