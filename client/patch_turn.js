const fs = require('fs');

const path = '/home/elian/spacesim/client/src/App.tsx';
let data = fs.readFileSync(path, 'utf8');

data = data.replace(
  "const AUTOPILOT_TURN_RESPONSE = 0.15;",
  "const AUTOPILOT_TURN_RESPONSE = 0.025;"
);

data = data.replace(
  "state.shipRotation.rotateTowards(desiredRotation, 0.5 * dt);",
  "state.shipRotation.rotateTowards(desiredRotation, 0.02 * dt);"
);

fs.writeFileSync(path, data);
