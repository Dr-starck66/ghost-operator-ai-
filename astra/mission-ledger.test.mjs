import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordMission } from './mission-ledger.mjs';
test('mission result persists on disk and duplicate IDs are rejected', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'astra-'));
 const file = join(dir, 'data', 'missions.json');
 const mission = { id: 'demo-001', idea: 'Convert an idea to a verifiable asset', result: { status: 'PASS', artifact: 'demo' } };
 const entry = await recordMission(file, mission);
 assert.match(entry.proofSha256, /^[a-f0-9]{64}$/);
 const persisted = JSON.parse(await readFile(file, 'utf8'));
 assert.equal(persisted.missions[0].result.artifact, 'demo');
 await assert.rejects(recordMission(file, mission), /duplicate mission id/);
});
