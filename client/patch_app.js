const fs = require('fs');

const path = '/home/elian/spacesim/client/src/App.tsx';
let data = fs.readFileSync(path, 'utf8');

const regex = /onEngageAutopilot=\{\(dest\) \=\> \{\s+let finalDest = dest;\s+if \(dest\.systemId \!\=\= activeSystemId\) \{[\s\S]+?\}\s+\}\s+setAutopilotDestination\(finalDest\);\s+setAutopilotEngaged\(true\);\s+setAutopilotReachedDestinationId\(''\);\s+setAutopilotStatus\(\`Autopilot engaged for \$\{dest\.name\}\.\`\);\s+setTabletOpen\(false\);\s+\}\}/m;

const replacement = `onEngageAutopilot={(dest) => {
            if (dest.systemId !== activeSystemId) {
              setTeleporting(true);
              setTimeout(() => {
                handleFastTravel(dest);
                setTimeout(() => setTeleporting(false), 2000);
              }, 1000); // Trigger travel when screen maxes out white
              setTabletOpen(false);
            } else {
              setAutopilotDestination(dest);
              setAutopilotEngaged(true);
              setAutopilotReachedDestinationId('');
              setAutopilotStatus(\`Autopilot engaged for \${dest.name}.\`);
              setTabletOpen(false);
            }
          }}`;

data = data.replace(regex, replacement);
fs.writeFileSync(path, data);
