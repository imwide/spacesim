const fs = require('fs');

const path = '/home/elian/spacesim/client/src/App.tsx';
let data = fs.readFileSync(path, 'utf8');

const regex = /handleFastTravel\(dest\);/;

const replacement = `const fullDest = stationNetwork.find(n => n.id === dest.id);
                if (fullDest) handleFastTravel(fullDest);`;

data = data.replace(regex, replacement);
fs.writeFileSync(path, data);
