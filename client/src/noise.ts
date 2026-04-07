/**
 * Simplex noise implementation for procedural terrain generation.
 * Based on Stefan Gustavson's simplex noise algorithm.
 */

const GRAD3: [number, number, number][] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

function buildPermutation(seed: number): Uint8Array {
  const perm = new Uint8Array(512);
  const source = new Uint8Array(256);
  for (let i = 0; i < 256; i++) source[i] = i;

  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  for (let i = 255; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const tmp = source[i];
    source[i] = source[j];
    source[j] = tmp;
  }

  for (let i = 0; i < 256; i++) {
    perm[i] = source[i];
    perm[i + 256] = source[i];
  }

  return perm;
}

function dot3(g: [number, number, number], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z;
}

const F3 = 1 / 3;
const G3 = 1 / 6;

export class SimplexNoise {
  private perm: Uint8Array;

  constructor(seed: number) {
    this.perm = buildPermutation(seed);
  }

  noise3D(x: number, y: number, z: number): number {
    const perm = this.perm;
    const s = (x + y + z) * F3;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;

    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      t0 *= t0;
      const gi0 = perm[ii + perm[jj + perm[kk]]] % 12;
      n0 = t0 * t0 * dot3(GRAD3[gi0], x0, y0, z0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      t1 *= t1;
      const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1]]] % 12;
      n1 = t1 * t1 * dot3(GRAD3[gi1], x1, y1, z1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      t2 *= t2;
      const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2]]] % 12;
      n2 = t2 * t2 * dot3(GRAD3[gi2], x2, y2, z2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      t3 *= t3;
      const gi3 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1]]] % 12;
      n3 = t3 * t3 * dot3(GRAD3[gi3], x3, y3, z3);
    }

    return 32 * (n0 + n1 + n2 + n3);
  }

  /**
   * Fractal Brownian Motion — layered noise for natural terrain.
   */
  fbm(x: number, y: number, z: number, octaves: number, lacunarity: number, persistence: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxAmplitude;
  }
}

/**
 * Compute terrain height at a point on a planet surface.
 * Uses the planet's 3D position on the unit sphere to generate consistent terrain
 * regardless of which direction you approach from.
 *
 * @param nx - normalized x on unit sphere
 * @param ny - normalized y on unit sphere
 * @param nz - normalized z on unit sphere
 * @param noise - SimplexNoise instance
 * @param planetRadius - radius of the planet in world units
 * @returns height offset from planet radius (can be negative for valleys)
 */
export function getTerrainHeight(
  nx: number,
  ny: number,
  nz: number,
  noise: SimplexNoise,
  planetRadius: number,
): number {
  // Scale factor: larger planets get proportionally taller terrain features
  // but capped to avoid absurd mountains
  const heightScale = Math.min(planetRadius * 0.008, 80_000);

  // Large continental features
  const continentalScale = 25;
  const continental = noise.fbm(
    nx * continentalScale,
    ny * continentalScale,
    nz * continentalScale,
    4, 2.1, 0.48,
  );

  // Medium mountain ridges
  const ridgeScale = 80;
  const ridgeNoise = noise.fbm(
    nx * ridgeScale,
    ny * ridgeScale,
    nz * ridgeScale,
    5, 2.2, 0.5,
  );
  // Create ridged noise by folding
  const ridge = 1 - Math.abs(ridgeNoise);
  const ridgeSquared = ridge * ridge;

  // Fine detail
  const detailScale = 320;
  const detail = noise.fbm(
    nx * detailScale,
    ny * detailScale,
    nz * detailScale,
    3, 2.0, 0.45,
  );

  // Micro detail (large hills to small slopes, approx 1-10km scale)
  const microScale = 2560;
  const micro = noise.fbm(
    nx * microScale,
    ny * microScale,
    nz * microScale,
    4, 2.0, 0.4,
  );

  // Nano detail (bumpy noise for immediate surroundings up to 10-100m)
  const nanoScale = 655360;
  const nano = noise.fbm(
    nx * nanoScale,
    ny * nanoScale,
    nz * nanoScale,
    3, 2.1, 0.45,
  );

  // Combine layers
  let height = (continental * 0.5 + ridgeSquared * 0.35 + detail * 0.15) * heightScale;
  
  // Apply the very localized frequency based on a small absolute height scale
  // so the player can actually tell they are moving on uneven "terrain".
  height += micro * 800.0;
  height += nano * 35.0;

  return height;
}
