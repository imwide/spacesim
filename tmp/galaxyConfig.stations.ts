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
  modelPath?: string;
  borderRadiusKm: number;
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
// Station-specific options:
// - `name`: station display name
// - `modelPath`: GLB path to render for that station
// - `borderRadiusKm`: outer safe-zone / speed-limit radius in kilometers
//
// Radii are stored in kilometers to keep the file easy to edit.
// The values below were converted from the previous procedural generation using seed 42.
export const galaxyConfig: GalaxySystemConfig = {
  systems: [
    {
      id: "system-1",
      name: "SYS-01",
      mapPosition: [0, 0, 0],
      color: "#ffffff",
      radiusKm: 1289793.3283638412,
      station: {
        id: "system-1-station",
        name: "SYS-01 Prime Station",
        kind: "star",
        modelPath: "/models/station1.glb",
        borderRadiusKm: 0.7728,
        orbit: {
          distanceKm: 1694724.6891683168,
          angleDeg: 317.54118005745113,
          verticalOffsetKm: 49974.902211904
        }
      },
      planets: [
        {
          id: "system-1-planet-1",
          name: "Planet 1",
          orbit: {
            distanceKm: 182898804.30797032,
            angleDeg: 110.52054483443499
          },
          radiusKm: 27255.625635253167,
          color: "#86efac",
          moons: [
            {
              id: "system-1-planet-1-moon-1",
              name: "Moon 1",
              orbit: {
                distanceKm: 330098.52909057547,
                angleDeg: 301.4414733275771
              },
              radiusKm: 2403.768545422041,
              color: "#86efac",
              stations: [
                {
                  id: "system-1-planet-1-moon-1-station-1",
                  name: "Moon 1 Station 1",
                  kind: "planet",
                  modelPath: "/models/station1.glb",
                  borderRadiusKm: 0.7671,
                  orbit: {
                    distanceKm: 186188.32322064348,
                    angleDeg: 96.10415526665747,
                    verticalOffsetKm: -9790.942529643791
                  }
                },
                {
                  id: "system-1-planet-1-moon-1-station-2",
                  name: "Moon 1 Station 2",
                  kind: "planet",
                  modelPath: "/models/station1.glb",
                  borderRadiusKm: 0.7671,
                  orbit: {
                    distanceKm: 204686.4494052113,
                    angleDeg: 282.07702553831035,
                    verticalOffsetKm: 745.1145055047247
                  }
                },
                {
                  id: "system-1-planet-1-moon-1-station-3",
                  name: "Moon 1 Station 3",
                  kind: "planet",
                  modelPath: "/models/station1.glb",
                  borderRadiusKm: 0.7671,
                  orbit: {
                    distanceKm: 185658.6016644121,
                    angleDeg: 62.28188440203667,
                    verticalOffsetKm: 7634.75977858877
                  }
                }
              ]
            }
          ],
          stations: [
            {
              id: "system-1-planet-1-station-1",
              name: "1 Station 1",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 245591.0351163315,
                angleDeg: 161.9624623004347,
                verticalOffsetKm: -13632.093880343753
              }
            },
            {
              id: "system-1-planet-1-station-2",
              name: "1 Station 2",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 213422.75377722256,
                angleDeg: 200.37592054344714,
                verticalOffsetKm: 2477.3134789937917
              }
            },
            {
              id: "system-1-planet-1-station-3",
              name: "1 Station 3",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 236676.58646950297,
                angleDeg: 232.44998565874994,
                verticalOffsetKm: -8250.247913657242
              }
            },
            {
              id: "system-1-planet-1-station-4",
              name: "1 Station 4",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 243691.18176759954,
                angleDeg: 265.90369418263435,
                verticalOffsetKm: 10489.762539699272
              }
            }
          ]
        },
        {
          id: "system-1-planet-2",
          name: "Planet 2",
          orbit: {
            distanceKm: 436552923.90580344,
            angleDeg: 73.508435273543
          },
          radiusKm: 33571.84111513508,
          color: "#fdba74",
          moons: [
            {
              id: "system-1-planet-2-moon-1",
              name: "Moon 1",
              orbit: {
                distanceKm: 544902.6654809837,
                angleDeg: 334.0223641321063
              },
              radiusKm: 3158.267061738517,
              color: "#fca5a5",
              stations: [
                {
                  id: "system-1-planet-2-moon-1-station-1",
                  name: "Moon 1 Station 1",
                  kind: "planet",
                  modelPath: "/models/station1.glb",
                  borderRadiusKm: 0.7671,
                  orbit: {
                    distanceKm: 234894.76671027974,
                    angleDeg: 339.2260382976383,
                    verticalOffsetKm: -10223.604708160565
                  }
                },
                {
                  id: "system-1-planet-2-moon-1-station-2",
                  name: "Moon 1 Station 2",
                  kind: "planet",
                  modelPath: "/models/station1.glb",
                  borderRadiusKm: 0.7671,
                  orbit: {
                    distanceKm: 196471.44693466858,
                    angleDeg: 5.7034458965063095,
                    verticalOffsetKm: -3290.2125616514036
                  }
                },
                {
                  id: "system-1-planet-2-moon-1-station-3",
                  name: "Moon 1 Station 3",
                  kind: "planet",
                  modelPath: "/models/station1.glb",
                  borderRadiusKm: 0.7671,
                  orbit: {
                    distanceKm: 240964.96917824284,
                    angleDeg: 220.2919268980622,
                    verticalOffsetKm: 11553.53696532992
                  }
                },
                {
                  id: "system-1-planet-2-moon-1-station-4",
                  name: "Moon 1 Station 4",
                  kind: "planet",
                  modelPath: "/models/station1.glb",
                  borderRadiusKm: 0.7671,
                  orbit: {
                    distanceKm: 192468.15573941008,
                    angleDeg: 259.0552854258567,
                    verticalOffsetKm: 10043.782844096242
                  }
                }
              ]
            }
          ],
          stations: [
            {
              id: "system-1-planet-2-station-1",
              name: "2 Station 1",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 235126.56740285765,
                angleDeg: 187.31388743966815,
                verticalOffsetKm: 9082.236499592029
              }
            },
            {
              id: "system-1-planet-2-station-2",
              name: "2 Station 2",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 228042.9499261112,
                angleDeg: 358.4299086034298,
                verticalOffsetKm: 1718.537543913842
              }
            },
            {
              id: "system-1-planet-2-station-3",
              name: "2 Station 3",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 323506.26089051674,
                angleDeg: 156.2365331221372,
                verticalOffsetKm: 3045.605339829589
              }
            },
            {
              id: "system-1-planet-2-station-4",
              name: "2 Station 4",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 254007.29097798775,
                angleDeg: 214.64607733301818,
                verticalOffsetKm: -5396.401302244098
              }
            }
          ]
        },
        {
          id: "system-1-planet-3",
          name: "Planet 3",
          orbit: {
            distanceKm: 539766781.9629418,
            angleDeg: 106.27512420527637
          },
          radiusKm: 43834.17199446722,
          color: "#7dd3fc",
          moons: [],
          stations: [
            {
              id: "system-1-planet-3-station-1",
              name: "3 Station 1",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 330657.9476416753,
                angleDeg: 155.48092919401824,
                verticalOffsetKm: 1794.009797067414
              }
            },
            {
              id: "system-1-planet-3-station-2",
              name: "3 Station 2",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 259345.7138267057,
                angleDeg: 36.31587825715542,
                verticalOffsetKm: 6122.265725726335
              }
            },
            {
              id: "system-1-planet-3-station-3",
              name: "3 Station 3",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 261430.8444232391,
                angleDeg: 282.9393293336034,
                verticalOffsetKm: 12698.49581648775
              }
            },
            {
              id: "system-1-planet-3-station-4",
              name: "3 Station 4",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 235071.13363674746,
                angleDeg: 171.14104751497507,
                verticalOffsetKm: 9081.760954439516
              }
            }
          ]
        },
        {
          id: "system-1-planet-4",
          name: "Planet 4",
          orbit: {
            distanceKm: 671527656.460621,
            angleDeg: 350.18870992586017
          },
          radiusKm: 25754.250818954806,
          color: "#93c5fd",
          moons: [],
          stations: [
            {
              id: "system-1-planet-4-station-1",
              name: "4 Station 1",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 255297.68152171563,
                angleDeg: 58.837487725540996,
                verticalOffsetKm: 4738.316472899759
              }
            },
            {
              id: "system-1-planet-4-station-2",
              name: "4 Station 2",
              kind: "planet",
              modelPath: "/models/station1.glb",
              borderRadiusKm: 0.7671,
              orbit: {
                distanceKm: 246065.98943481033,
                angleDeg: 74.50348427519202,
                verticalOffsetKm: 3806.2488008915916
              }
            }
          ]
        }
      ],
      asteroidGroups: [
        {
          id: "system-1-asteroid-group-1",
          orbit: {
            distanceKm: 405987422.8916109,
            angleDeg: 285.2738308534026,
            verticalOffsetKm: -1.345104718580842
          },
          radiusKm: 5.454808757640421,
          asteroidCount: 113,
          dustCount: 1000,
          layoutSeed: 3722968953,
          station: {
            id: "system-1-asteroid-group-1-station",
            name: "Belt Station",
            kind: "asteroid",
            modelPath: "/models/station1.glb",
            borderRadiusKm: 0.76444,
            orbit: {
              distanceKm: 6.057438397593796,
              angleDeg: 34.59613066166639,
              verticalOffsetKm: -0.10964171434598624
            }
          }
        },
        {
          id: "system-1-asteroid-group-2",
          orbit: {
            distanceKm: 319585979.4923692,
            angleDeg: 192.7788463141769,
            verticalOffsetKm: -1.3668237570673227
          },
          radiusKm: 3.7038088580593467,
          asteroidCount: 84,
          dustCount: 1000,
          layoutSeed: 2477747592,
          station: {
            id: "system-1-asteroid-group-2-station",
            name: "Belt Station",
            kind: "asteroid",
            modelPath: "/models/station1.glb",
            borderRadiusKm: 0.76444,
            orbit: {
              distanceKm: 4.817429885454476,
              angleDeg: 99.2044376861304,
              verticalOffsetKm: -0.1251550124914917
            }
          }
        },
        {
          id: "system-1-asteroid-group-3",
          orbit: {
            distanceKm: 659904885.726718,
            angleDeg: 95.5988917965442,
            verticalOffsetKm: 1.555983955040574
          },
          radiusKm: 3.772866314277053,
          asteroidCount: 108,
          dustCount: 1000,
          layoutSeed: 3877505948,
          station: {
            id: "system-1-asteroid-group-3-station",
            name: "Belt Station",
            kind: "asteroid",
            modelPath: "/models/station1.glb",
            borderRadiusKm: 0.76444,
            orbit: {
              distanceKm: 4.394508589804173,
              angleDeg: 274.8481046129018,
              verticalOffsetKm: 0.1059477634021517
            }
          }
        },
        {
          id: "system-1-asteroid-group-4",
          orbit: {
            distanceKm: 510952745.0843431,
            angleDeg: 329.7634496446699,
            verticalOffsetKm: 2.889817910268903
          },
          radiusKm: 4.544656756334007,
          asteroidCount: 95,
          dustCount: 1000,
          layoutSeed: 724667621,
          station: {
            id: "system-1-asteroid-group-4-station",
            name: "Belt Station",
            kind: "asteroid",
            modelPath: "/models/station1.glb",
            borderRadiusKm: 0.76444,
            orbit: {
              distanceKm: 5.400981434434652,
              angleDeg: 337.9210726171732,
              verticalOffsetKm: 0.14218017869837601
            }
          }
        },
        {
          id: "system-1-asteroid-group-5",
          orbit: {
            distanceKm: 357492178.6164136,
            angleDeg: 255.04796415567392,
            verticalOffsetKm: 0.3971389941871166
          },
          radiusKm: 2.5131436567753553,
          asteroidCount: 99,
          dustCount: 1000,
          layoutSeed: 3689579367,
          station: {
            id: "system-1-asteroid-group-5-station",
            name: "Belt Station",
            kind: "asteroid",
            modelPath: "/models/station1.glb",
            borderRadiusKm: 0.76444,
            orbit: {
              distanceKm: 3.262509375810623,
              angleDeg: 69.15382459759712,
              verticalOffsetKm: -0.11027739146547469
            }
          }
        },
        {
          id: "system-1-asteroid-group-6",
          orbit: {
            distanceKm: 567420545.2655222,
            angleDeg: 352.89124203845853,
            verticalOffsetKm: 2.2843834441155195
          },
          radiusKm: 5.644901596009731,
          asteroidCount: 71,
          dustCount: 1000,
          layoutSeed: 4128375487,
          station: {
            id: "system-1-asteroid-group-6-station",
            name: "Belt Station",
            kind: "asteroid",
            modelPath: "/models/station1.glb",
            borderRadiusKm: 0.76444,
            orbit: {
              distanceKm: 6.600918193161488,
              angleDeg: 9.801701260730624,
              verticalOffsetKm: 0.12858083111206256
            }
          }
        }
      ]
    }
  ]
};
