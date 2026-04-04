const fs = require('fs');
let code = fs.readFileSync('client/src/styles.css', 'utf8');

const regex = /\.tablet-marker-system \.tablet-marker-core,[\s\S]*?\.tablet-marker-ship \.tablet-marker-core \{[\s\S]*?\}/;

const replacement = `.tablet-marker-system .tablet-marker-core,
.tablet-marker-star .tablet-marker-core {
  border: 0;
  background: #facc15;
  box-shadow: 0 0 12px rgba(250, 204, 21, 0.55), 0 0 0 6px rgba(250, 204, 21, 0.14);
}

.tablet-marker-planet .tablet-marker-core {
  border-color: rgba(156, 163, 175, 0.95);
  background: rgba(107, 114, 128, 0.95);
  box-shadow: 0 0 0 5px rgba(107, 114, 128, 0.12);
}

.tablet-marker-moon .tablet-marker-core {
  width: 16px;
  height: 16px;
  margin: auto;
  border-color: rgba(226, 232, 240, 0.88);
}

.tablet-marker-station .tablet-marker-core {
  border-radius: 7px;
  border-color: rgba(110, 231, 255, 0.95);
  background: linear-gradient(135deg, rgba(14, 165, 233, 0.85), rgba(96, 165, 250, 0.92));
  box-shadow: 0 0 0 5px rgba(14, 165, 233, 0.14);
}

.tablet-marker-asteroid-belt .tablet-marker-core {
  border: none;
  background: transparent;
  background-image: 
    radial-gradient(circle, rgba(156, 163, 175, 0.9) 2px, transparent 2.5px),
    radial-gradient(circle, rgba(156, 163, 175, 0.8) 1.5px, transparent 2px),
    radial-gradient(circle, rgba(156, 163, 175, 0.9) 2px, transparent 2.5px),
    radial-gradient(circle, rgba(156, 163, 175, 0.8) 1.5px, transparent 2px),
    radial-gradient(circle, rgba(156, 163, 175, 0.9) 1px, transparent 1.5px);
  background-position: 2px 2px, 14px 4px, 6px 14px, 16px 12px, 10px 8px;
  background-size: 24px 24px;
  background-repeat: no-repeat;
  box-shadow: none;
}

.tablet-marker-asteroid-object .tablet-marker-core {
  border-color: rgba(203, 213, 225, 0.9);
  background: rgba(100, 116, 139, 0.95);
}

.tablet-marker-asteroid-object {
  width: 14px;
  height: 14px;
}

.tablet-marker-ship {
  border-radius: 0;
}

.tablet-marker-ship .tablet-marker-core {
  border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  border: 2px solid rgba(110, 231, 255, 1);
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.95), rgba(59, 130, 246, 0.95));
  box-shadow: -2px 2px 8px rgba(34, 211, 238, 0.4);
}`;

code = code.replace(regex, replacement);
fs.writeFileSync('client/src/styles.css', code);
console.log(code.indexOf('transform: rotate(-45deg);') > -1 ? 'Success' : 'Failed');
