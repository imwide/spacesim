const fs = require('fs');

const path = '/home/elian/spacesim/client/src/App.tsx';
let data = fs.readFileSync(path, 'utf8');

const regex = /const isAsteroid = obstacle\.kind === 'asteroid';\s+const anticipationBuffer = isAsteroid\s+\? Math\.max\(AUTOPILOT_AVOIDANCE_BUFFER_METERS \* 0\.8[\s\S]+?avoidance\.addScaledVector\(evasionDirection, normalizedSurfaceDistance \* normalizedSurfaceDistance \* closingBias \* kindWeight\);\s+\}\);/m;

const replacement = `const isAsteroid = obstacle.kind === 'asteroid';
    
    // Skip asteroids from steering evasion, we just push the ship away instead
    if (isAsteroid) return;

    const anticipationBuffer = Math.max(AUTOPILOT_AVOIDANCE_BUFFER_METERS * 20, currentSpeed * 1.5 + AUTOPILOT_AVOIDANCE_BUFFER_METERS * 5);
    const influenceRadius = obstacle.radius + anticipationBuffer;

    if (surfaceDistance >= anticipationBuffer || centerDistance >= influenceRadius) {
      return;
    }

    const awayDirection = centerDistance > 1e-5 ? awayFromObstacle.clone().multiplyScalar(1 / centerDistance) : targetDirection.clone().multiplyScalar(-1);
    const obstacleDirection = obstacleLocalPosition.clone().sub(state.shipPosition).normalize();
    
    let evasionDirection: THREE.Vector3;
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
    
    const closingBias = clamp((targetDirection.dot(obstacleDirection) + 1) * 0.5, 0.0, 1);
    // Smoothly scale the avoidance strength as we enter the anticipation zone
    const normalizedSurfaceDistance = Math.pow(clamp(1 - surfaceDistance / anticipationBuffer, 0, 1), 0.5);
    const kindWeight = obstacle.kind === 'star' ? 6.0 : obstacle.kind === 'planet' ? 4.5 : obstacle.kind === 'moon' ? 3.0 : 8.0;
    
    avoidance.addScaledVector(evasionDirection, normalizedSurfaceDistance * normalizedSurfaceDistance * closingBias * kindWeight);
  });`;

data = data.replace(regex, replacement);
fs.writeFileSync(path, data);
