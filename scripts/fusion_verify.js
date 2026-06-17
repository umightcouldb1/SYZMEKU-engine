const fs = require('fs');
const path = require('path');

const protocolPath = path.resolve(__dirname, '../identity/fusion_protocol.json');
const protocol = JSON.parse(fs.readFileSync(protocolPath, 'utf8'));

const requiredPersonas = ['Jarvis', 'Griot', 'SAM', 'Ironheart'];
const missing = requiredPersonas.filter((name) => !protocol.persona?.[name]);

if (missing.length) {
  console.error(JSON.stringify({ success: false, error: `Missing persona vectors: ${missing.join(', ')}` }));
  process.exit(1);
}

const vectors = requiredPersonas.map((name) => ({
  name,
  version: protocol.persona[name].version,
  weight: Number(protocol.persona[name].weight),
}));

const invalid = vectors.filter((vector) => vector.version !== '1.0' || vector.weight !== 1.0);

if (invalid.length || protocol.status !== 'FUSION_ACTIVE') {
  console.error(JSON.stringify({ success: false, status: protocol.status, invalid }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  success: true,
  status: protocol.status,
  protocol: protocol.protocol,
  theme: protocol.theme,
  persona: vectors.reduce((acc, vector) => {
    acc[vector.name] = `${vector.version}:${vector.weight.toFixed(1)}`;
    return acc;
  }, {}),
}, null, 2));
