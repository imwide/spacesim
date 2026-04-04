const fs = require('fs');

const path = '/home/elian/spacesim/client/src/App.tsx';
let data = fs.readFileSync(path, 'utf8');

const regex = /state\.shipPosition\.addScaledVector\(state\.shipVelocity, dt\);\s+state\.position\.copy\(state\.shipPosition\);\s+state\.velocity\.copy\(state\.shipVelocity\);/;

const replacement = `if (!isInterSystem) {
    const pushVelocity = new THREE.Vector3();
    obstacles.forEach((obstacle) => {
      if (obstacle.kind !== 'asteroid' || obstacle.id === destination.id) return;
      const obstacleLocalPosition = vectorFromTuple(toFrameLocalPosition(obstacle.position, frameOrigin));
      const away = state.shipPosition.clone().sub(obstacleLocalPosition);
      const dist = away.length();
      
      const forcefieldRadius = obstacle.radius * 2.0 + AUTOPILOT_AVOIDANCE_BUFFER_METERS * 0.5;
      if (dist < forcefieldRadius && dist > 1e-5) {
        const penetration = 1.0 - (dist / forcefieldRadius);
        // Apply an aggressive, quadratic force pushing the ship perfectly tangentially outward
        const strength = penetration * penetration * currentSpeed * 2.5; 
        
        // Push outward from the obstacle center
        const pushDir = away.normalize();
        pushVelocity.addScaledVector(pushDir, strength);
      }
    });
    state.shipVelocity.add(pushVelocity);
  }

  state.shipPosition.addScaledVector(state.shipVelocity, dt);
  state.position.copy(state.shipPosition);
  state.velocity.copy(state.shipVelocity);`;

data = data.replace(regex, replacement);
fs.writeFileSync(path, data);
