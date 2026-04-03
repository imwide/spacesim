const fs = require('fs');
let code = fs.readFileSync('client/src/App.tsx', 'utf-8');

const oldLine = 'targetSpeed = AUTOPILOT_MAX_SPEED_METERS_PER_SECOND * Math.pow(distanceRatio, 0.85);';
const newLine = 'targetSpeed = AUTOPILOT_MAX_SPEED_METERS_PER_SECOND * Math.pow(distanceRatio, 1.1);';

if (code.includes(oldLine)) {
  code = code.replace(oldLine, newLine);
  fs.writeFileSync('client/src/App.tsx', code);
  console.log("Patched successfully");
} else {
  console.log("Could not find the math line.");
}
