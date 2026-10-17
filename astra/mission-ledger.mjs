import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export async function recordMission(file, mission) {
  if (!mission?.id || !mission?.idea || !mission?.result) throw new Error('id, idea and result required');
  const previous = await readFile(file, 'utf8').then(JSON.parse).catch(e => {
    if (e.code === 'ENOENT') return { schema: 1, missions: [] };
    throw e;
  });
  if (previous.missions.some(x => x.id === mission.id)) throw new Error('duplicate mission id');
  const entry = { ...mission, proofSha256: createHash('sha256').update(JSON.stringify(mission.result)).digest('hex') };
  const next = { ...previous, missions: [...previous.missions, entry] };
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(next, null, 2));
  await rename(temp, file);
  return entry;
}
