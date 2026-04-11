import type { GalaxySystemConfig } from './galaxyConfigTypes';

export const galaxyConfig: GalaxySystemConfig = {
  systems: [
    {
      id: "system-1",
      name: "SYS-01",
      mapPosition: [0, 0, 0],
      color: "#ffffff",
      radius: 1289793328.363841,
      station: {
        id: "system-1-station",
        name: "SYS-01 Prime Station",
        kind: "star",
        position: [1250304682.2009313, 49974902.211904004, -1144041071.7028809]
      },
      planets: [
        {
          id: "system-1-planet-1",
          name: "Planet 1",
          position: [-64113936888.76279, 0, 171293244799.4052],
          radius: 27255625.63525317,
          color: "#86efac",
          moons: [
            {
              id: "system-1-planet-1-moon-1",
              name: "Moon 1",
              position: [172188415.9262924, 0, -281631298.5599357],
              radius: 2403768.545422041,
              color: "#86efac",
              stations: [
                {
                  id: "system-1-planet-1-moon-1-station-1",
                  name: "Moon 1 Station 1",
                  kind: "planet",
                  position: [-19798555.705676176, -9790942.52964379, 185132679.16735837]
                },
                {
                  id: "system-1-planet-1-moon-1-station-2",
                  name: "Moon 1 Station 2",
                  kind: "planet",
                  position: [42825824.19515171, 745114.5055047247, -200156167.40964562]
                },
                {
                  id: "system-1-planet-1-moon-1-station-3",
                  name: "Moon 1 Station 3",
                  kind: "planet",
                  position: [86353893.33486156, 7634759.77858877, 164353647.5953491]
                }
              ]
            }
          ],
          stations: [
            {
              id: "system-1-planet-1-station-1",
              name: "1 Station 1",
              kind: "planet",
              position: [-233521183.16213506, -13632093.880343754, 76044812.73609498]
            },
            {
              id: "system-1-planet-1-station-2",
              name: "1 Station 2",
              kind: "planet",
              position: [-200068550.51685622, 2477313.4789937916, -74309130.82479925]
            },
            {
              id: "system-1-planet-1-station-3",
              name: "1 Station 3",
              kind: "planet",
              position: [-144243427.7086172, -8250247.913657242, -187642319.70886806]
            },
            {
              id: "system-1-planet-1-station-4",
              name: "1 Station 4",
              kind: "planet",
              position: [-17407624.730008982, 10489762.539699271, -243068646.00879404]
            }
          ]
        },
        {
          id: "system-1-planet-2",
          name: "Planet 2",
          position: [123926103747.48697, 0, 418593808101.2109],
          radius: 33571841.11513508,
          color: "#fdba74",
          moons: [
            {
              id: "system-1-planet-2-moon-1",
              name: "Moon 1",
              position: [489848471.6694825, 0, -238678423.09549692],
              radius: 3158267.061738517,
              color: "#fca5a5",
              stations: [
                {
                  id: "system-1-planet-2-moon-1-station-1",
                  name: "Moon 1 Station 1",
                  kind: "planet",
                  position: [219623543.76294765, -10223604.708160564, -83312966.895204]
                },
                {
                  id: "system-1-planet-2-moon-1-station-2",
                  name: "Moon 1 Station 2",
                  kind: "planet",
                  position: [195498833.6718232, -3290212.5616514036, 19525252.714346427]
                },
                {
                  id: "system-1-planet-2-moon-1-station-3",
                  name: "Moon 1 Station 3",
                  kind: "planet",
                  position: [-183798308.86177048, 11553536.96532992, -155827783.24363324]
                },
                {
                  id: "system-1-planet-2-moon-1-station-4",
                  name: "Moon 1 Station 4",
                  kind: "planet",
                  position: [-36542335.5079471, 10043782.844096242, -188967321.74996406]
                }
              ]
            }
          ],
          stations: [
            {
              id: "system-1-planet-2-station-1",
              name: "2 Station 1",
              kind: "planet",
              position: [-233213487.20612615, 9082236.499592029, -29932792.783310406]
            },
            {
              id: "system-1-planet-2-station-2",
              name: "2 Station 2",
              kind: "planet",
              position: [227957332.1229932, 1718537.543913842, -6248339.1689502485]
            },
            {
              id: "system-1-planet-2-station-3",
              name: "2 Station 3",
              kind: "planet",
              position: [-296078362.1897345, 3045605.339829589, 130360669.98296487]
            },
            {
              id: "system-1-planet-2-station-4",
              name: "2 Station 4",
              kind: "planet",
              position: [-208966576.35519344, -5396401.302244098, -144404549.22323346]
            }
          ]
        },
        {
          id: "system-1-planet-3",
          name: "Planet 3",
          position: [-151269623953.0558, 0, 518136738496.4426],
          radius: 43834171.99446722,
          color: "#7dd3fc",
          moons: [],
          stations: [
            {
              id: "system-1-planet-3-station-1",
              name: "3 Station 1",
              kind: "planet",
              position: [-300840268.8904657, 1794009.797067414, 137221758.3057337]
            },
            {
              id: "system-1-planet-3-station-2",
              name: "3 Station 2",
              kind: "planet",
              position: [208971488.5008343, 6122265.725726335, 153593998.17059648]
            },
            {
              id: "system-1-planet-3-station-3",
              name: "3 Station 3",
              kind: "planet",
              position: [58539376.42642399, 12698495.81648775, -254792519.1669749]
            },
            {
              id: "system-1-planet-3-station-4",
              name: "3 Station 4",
              kind: "planet",
              position: [-232266840.54904506, 9081760.954439517, 36201555.91449152]
            }
          ]
        },
        {
          id: "system-1-planet-4",
          name: "Planet 4",
          position: [661706121106.6996, 0, -114430776810.34749],
          radius: 25754250.818954807,
          color: "#93c5fd",
          moons: [],
          stations: [
            {
              id: "system-1-planet-4-station-1",
              name: "4 Station 1",
              kind: "planet",
              position: [132108188.46792611, 4738316.472899759, 218458995.53482854]
            },
            {
              id: "system-1-planet-4-station-2",
              name: "4 Station 2",
              kind: "planet",
              position: [65743855.7458852, 3806248.8008915917, 237120679.37697133]
            }
          ]
        }
      ],
      asteroidGroups: [
        {
          id: "system-1-asteroid-group-1",
          position: [106950270678.19678, -1345.104718580842, -391647069627.7864],
          radius: 5454.808757640421,
          asteroidCount: 113,
          dustCount: 1000,
          layoutSeed: 3722968953,
          station: {
            id: "system-1-asteroid-group-1-station",
            name: "Belt Station",
            kind: "asteroid",
            position: [4986.330124601549, -109.64171434598624, 3439.3417726557504]
          }
        },
        {
          id: "system-1-asteroid-group-2",
          position: [-311670181170.8836, -1366.8237570673227, -70688729349.20813],
          radius: 3703.8088580593467,
          asteroidCount: 84,
          dustCount: 1000,
          layoutSeed: 2477747592,
          station: {
            id: "system-1-asteroid-group-2-station",
            name: "Belt Station",
            kind: "asteroid",
            position: [-770.5847303796187, -125.1550124914917, 4755.40007513308]
          }
        },
        {
          id: "system-1-asteroid-group-3",
          position: [-64382729470.94584, 1555.983955040574, 656756669057.7748],
          radius: 3772.866314277053,
          asteroidCount: 108,
          dustCount: 1000,
          layoutSeed: 3877505948,
          station: {
            id: "system-1-asteroid-group-3-station",
            name: "Belt Station",
            kind: "asteroid",
            position: [371.3994900376801, 105.94776340215171, -4378.786151967507]
          }
        },
        {
          id: "system-1-asteroid-group-4",
          position: [441439533852.70667, 2889.817910268903, -257301079790.05988],
          radius: 4544.656756334007,
          asteroidCount: 95,
          dustCount: 1000,
          layoutSeed: 724667621,
          station: {
            id: "system-1-asteroid-group-4-station",
            name: "Belt Station",
            kind: "asteroid",
            position: [5004.910930358179, 142.180178698376, -2030.1396588138998]
          }
        },
        {
          id: "system-1-asteroid-group-5",
          position: [-92236680934.73576, 397.1389941871166, -345388263353.07556],
          radius: 2513.1436567753553,
          asteroidCount: 99,
          dustCount: 1000,
          layoutSeed: 3689579367,
          station: {
            id: "system-1-asteroid-group-5-station",
            name: "Belt Station",
            kind: "asteroid",
            position: [1160.9973531323997, -110.2773914654747, 3048.942861595111]
          }
        },
        {
          id: "system-1-asteroid-group-6",
          position: [563058802347.6534, 2284.3834441155195, -70220084649.96844],
          radius: 5644.901596009731,
          asteroidCount: 71,
          dustCount: 1000,
          layoutSeed: 4128375487,
          station: {
            id: "system-1-asteroid-group-6-station",
            name: "Belt Station",
            kind: "asteroid",
            position: [6504.563561122473, 128.58083111206255, 1123.732117601009]
          }
        }
      ]
    }
  ]
};
