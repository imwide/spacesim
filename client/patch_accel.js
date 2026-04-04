const fs = require('fs');

const path = '/home/elian/spacesim/client/src/App.tsx';
let data = fs.readFileSync(path, 'utf8');

const accelRegex = /function getAutopilotAcceleration\(isInterSystem\: boolean\)\: number \{\s+if \(\!isInterSystem\) \{\s+\/\/ Local travel uses the proportional formula[\s\S]+?return AUTOPILOT_LOCAL_CRUISE_SPEED;\s+\}\s+\/\/ Interstellar\: kinematic ramp[\s\S]+?return AUTOPILOT_INTERSTELLAR_CRUISE_SPEED \/ AUTOPILOT_ACCEL_TIME_SECONDS;\s+\}/m;

const replacement = `function getAutopilotAcceleration(isInterSystem: boolean): number {
  if (!isInterSystem) {
    // Provide a smooth cinematic ramp up so we don't 'teleport' away from local stations
    // It will take roughly AUTOPILOT_ACCEL_TIME_SECONDS to reach max speed, giving time to see the departure
    return AUTOPILOT_LOCAL_CRUISE_SPEED / AUTOPILOT_ACCEL_TIME_SECONDS;
  }
  // Interstellar: kinematic ramp — 0 → cruise in exactly AUTOPILOT_ACCEL_TIME_SECONDS
  return AUTOPILOT_INTERSTELLAR_CRUISE_SPEED / AUTOPILOT_ACCEL_TIME_SECONDS;
}`;

data = data.replace(accelRegex, replacement);
fs.writeFileSync(path, data);
