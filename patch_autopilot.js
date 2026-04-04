const fs = require('fs');
let code = fs.readFileSync('client/src/App.tsx', 'utf8');

const regex1 = /const selectedCanAutopilot = Boolean\([\s\S]*?selectedMarker &&\n\s*selectedMarker\.kind !== 'system' &&\n\s*selectedMarker\.kind !== 'ship' &&\n\s*selectedMarker\.systemId === activeSystemId &&\n\s*selectedMarker\.localPosition &&\n\s*hudMode !== 'space',\n\s*\);/;

const replacement1 = `const selectedCanAutopilot = Boolean(
    selectedMarker &&
      (selectedMarker.kind === 'station' || selectedMarker.kind === 'asteroid-object') &&
      selectedMarker.systemId === activeSystemId &&
      selectedMarker.localPosition &&
      hudMode !== 'space',
  );`;

code = code.replace(regex1, replacement1);

const regex2 = /const canAutopilot = Boolean\(marker\.kind !== 'system' && hudMode !== 'space' && marker\.systemId === activeSystemId && typeof markerDistance === 'number' && markerDistance > 50\);/;
const replacement2 = `const canAutopilot = Boolean((marker.kind === 'station' || marker.kind === 'asteroid-object') && hudMode !== 'space' && marker.systemId === activeSystemId && typeof markerDistance === 'number' && markerDistance > 50);`;

code = code.replace(regex2, replacement2);

fs.writeFileSync('client/src/App.tsx', code);
console.log(code.indexOf("(marker.kind === 'station' || marker.kind === 'asteroid-object')") > -1 ? 'Success' : 'Failed');
