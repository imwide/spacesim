const fs = require('fs');
let code = fs.readFileSync('client/src/noise.ts', 'utf8');

const target = `  // Large continental features
  const continentalScale = 2.5;
  const continental = noise.fbm(
    nx * continentalScale,
    ny * continentalScale,
    nz * continentalScale,
    4, 2.1, 0.48,
  );

  // Medium mountain ridges
  const ridgeScale = 8;
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
  const detailScale = 32;
  const detail = noise.fbm(
    nx * detailScale,
    ny * detailScale,
    nz * detailScale,
    3, 2.0, 0.45,
  );

  // Micro detail (large hills to small slopes, approx 1-10km scale)
  const microScale = 256;
  const micro = noise.fbm(
    nx * microScale,
    ny * microScale,
    nz * microScale,
    4, 2.0, 0.4,
  );

  // Nano detail (bumpy noise for immediate surroundings up to 10-100m)
  const nanoScale = 65536;`;

const replacement = `  // Large continental features
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
  const nanoScale = 655360;`;

code = code.replace(target, replacement);
fs.writeFileSync('client/src/noise.ts', code);
