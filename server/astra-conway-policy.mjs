/**
 * ASTRA Ω execution policy — adapted from Conway Automaton's hierarchical
 * policy architecture, without Conway Cloud, wallets, payments or replication.
 *
 * Invariants: internal ASTRA team steps are read-only, zero-cost, and never
 * allowed to invoke a potentially metered model.
 * Reference: https://github.com/Conway-Research/automaton (MIT).
 */
const WORKFLOWS = new Set(['web_research', 'site_audit', 'lead_research']);
const TEAM_TAG = /\[ASTRA_TEAM:team_[0-9a-f-]+:\d+\]/;

function deny(reason) {
  return Object.freeze({ action: 'deny', reason });
}

export function evaluateAstraPolicy({ workflow, estimatedCostUSD = 0, sideEffects = false } = {}) {
  if (!WORKFLOWS.has(workflow)) return deny('WORKFLOW_NOT_ALLOWED');
  if (sideEffects !== false) return deny('SIDE_EFFECTS_BLOCKED');
  if (estimatedCostUSD !== 0) return deny('NONZERO_COST_BLOCKED');
  return Object.freeze({ action: 'allow', reason: 'READ_ONLY_ZERO_COST' });
}

export function isAstraTeamTask(task) {
  return task?.noPaidAI === true ||
    (typeof task?.goal === 'string' && TEAM_TAG.test(task.goal));
}

export function canUsePaidInference(task, providerMode) {
  return providerMode === 'gemini' && !isAstraTeamTask(task);
}
