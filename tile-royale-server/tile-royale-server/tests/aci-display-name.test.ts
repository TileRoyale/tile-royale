import assert from 'node:assert';
import fs from 'node:fs';

const indexSource = fs.readFileSync('src/index.ts', 'utf8');
const dbSource = fs.readFileSync('src/db.ts', 'utf8');

assert(
  indexSource.includes('[parsed.playerName, parsed.displayName, parsed.username, parsed.anglerName]'),
  'ACI score submission must read Patient Angler playerName before legacy name fields'
);
assert(
  dbSource.includes("s.save_json::jsonb->>'playerName'") &&
  dbSource.includes('LEFT JOIN pa_save_data s ON s.uid = r.uid'),
  'ACI leaderboard must hydrate existing Anonymous Angler rows from current cloud-save names'
);
assert(
  dbSource.includes("NULLIF(BTRIM(r.display_name), '')") &&
  dbSource.includes("'Anonymous Angler'"),
  'ACI leaderboard must retain safe fallbacks when a save has no player name'
);

console.log('aci-display-name.test.ts passed');
