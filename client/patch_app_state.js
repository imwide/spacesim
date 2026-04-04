const fs = require('fs');

const path = '/home/elian/spacesim/client/src/App.tsx';
let data = fs.readFileSync(path, 'utf8');

const stateRegex = /const \[tabletOpen, setTabletOpen\] = useState\(false\);/;
const stateReplacement = `const [tabletOpen, setTabletOpen] = useState(false);
  const [teleporting, setTeleporting] = useState(false);`;

data = data.replace(stateRegex, stateReplacement);

const domRegex = /<\/div>\s*\{tabletOpen \? \(/m;
const domReplacement = `</div>

        {teleporting && (
          <div className="teleport-overlay">
            <div className="teleport-glow" />
            <div className="teleport-text">INITIATING JUMP</div>
          </div>
        )}

        {tabletOpen ? (`;

data = data.replace(domRegex, domReplacement);

fs.writeFileSync(path, data);
