const fs = require('fs');
let code = fs.readFileSync('client/src/App.tsx', 'utf-8');

const startIndex = code.indexOf('function getAutopilotTargetSpeed');
const endIndexStr = 'return clamp(targetSpeed, 0, AUTOPILOT_MAX_SPEED_METERS_PER_SECOND);\n}';
const endIndex = code.indexOf(endIndexStr, startIndex) + endIndexStr.length;
console.log(code.substring(startIndex, endIndex));
