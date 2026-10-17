import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAstraPolicy, isAstraTeamTask, canUsePaidInference } from '../server/astra-conway-policy.mjs';

test('Conway-inspired policy permits only bounded read-only zero-cost workflows', () => {
  for (const workflow of ['web_research', 'site_audit', 'lead_research']) {
    assert.deepEqual(evaluateAstraPolicy({workflow}), { action: 'allow', reason: 'READ_ONLY_ZERO_COST' });
  }
});

test('denies payments, autonomous replication, deployment and side effects', () => {
  assert.equal(evaluateAstraPolicy({workflow:'spawn_child'}).action, 'deny');
  assert.equal(evaluateAstraPolicy({workflow:'deploy'}).action, 'deny');
  assert.equal(evaluateAstraPolicy({workflow:'web_research', estimatedCostUSD: 0.01}).action, 'deny');
  assert.equal(evaluateAstraPolicy({workflow:'web_research', sideEffects:true}).action, 'deny');
  assert.equal(evaluateAstraPolicy({}).action, 'deny');
});

test('ASTRA team never consumes metered AI even when Gemini is globally configured', () => {
  const teamTask = {goal:'Check public URL [ASTRA_TEAM:team_123e4567-e89b-12d3-a456-426614174000:0]', noPaidAI:true};
  assert.equal(isAstraTeamTask(teamTask), true);
  assert.equal(canUsePaidInference(teamTask, 'gemini'), false);
  assert.equal(canUsePaidInference({goal:teamTask.goal}, 'gemini'), false); // Legacy persisted team tasks
  assert.equal(canUsePaidInference({goal:'Investigate public site', noPaidAI:true}, 'gemini'), false);
  assert.equal(canUsePaidInference({goal:'Investigate public site'}, 'gemini'), true); // Existing explicitly configured mode unaffected
  assert.equal(canUsePaidInference({goal:'Investigate public site'}, undefined), false);
});
