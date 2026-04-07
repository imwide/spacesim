const fs = require('fs');
let code = fs.readFileSync('client/src/App.tsx', 'utf8');

const target = `        // Orient ship toward target
        const decelRotation5 = createShipFacingQuaternion(driveDir5);
        state.shipAngularVelocity.set(0, 0, 0);
        state.shipRotation.rotateTowards(decelRotation5, 1.0 * dt);
        state.rotation.copy(state.shipRotation);
        state.autopilotDirection.copy(driveDir5);

        // Move
        state.shipVelocity.copy(driveDir5).multiplyScalar(driveSpeed5);`;

const replacement = `        // Orient ship toward target
        const decelRotation5 = createShipFacingQuaternion(driveDir5);

        // Turn ship horizontal relative to planet slowly during final 100km approach
        const isPlanetOrMoon = destination.kind === 'planet' || destination.kind === 'moon';
        if (isPlanetOrMoon && state.nearPlanetId === destination.id) {
            // Find direction to center of planet (gravity down)
            const toCenter = state.nearPlanetCenter.clone().sub(state.shipPosition).normalize();
            
            // We want nose to point forward, but 'down' of ship to point towards planet
            const fwd = driveDir5.clone();
            // Project fwd onto the tangent plane of the planet to keep it horizontal
            fwd.addScaledVector(toCenter, -fwd.dot(toCenter)).normalize();

            if (fwd.lengthSq() > 0.01) {
                // Build a matrix where Z is -fwd, Y is -toCenter (up), X is right
                const horizontalMatrix = new THREE.Matrix4().lookAt(
                    new THREE.Vector3(0, 0, 0),
                    fwd,
                    toCenter.clone().negate()
                );
                const horizontalQuat = new THREE.Quaternion().setFromRotationMatrix(horizontalMatrix);

                // Blend from nose-first (decelRotation5) to horizontal (horizontalQuat) based on elapsed time f5
                decelRotation5.slerp(horizontalQuat, f5);
            }
        }

        state.shipAngularVelocity.set(0, 0, 0);
        state.shipRotation.rotateTowards(decelRotation5, 1.0 * dt);
        state.rotation.copy(state.shipRotation);
        state.autopilotDirection.copy(driveDir5);

        // Enforce max speed of 5km/s during final 100km
        driveSpeed5 = Math.min(driveSpeed5, 5000);

        // Move
        state.shipVelocity.copy(driveDir5).multiplyScalar(driveSpeed5);`;

code = code.replace(target, replacement);
fs.writeFileSync('client/src/App.tsx', code);
