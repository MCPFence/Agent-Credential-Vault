/**
 * Scope verification — checks requested scopes against agent capabilities and owner ceiling.
 * Ports Go's verifier.go logic.
 */

function matchPattern(pattern, value) {
  // Simple glob: only * is special
  const re = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return re.test(value);
}

function matchesAny(scope, patterns) {
  for (const pattern of patterns) {
    if (matchPattern(pattern, scope)) return true;
    // Handle "action:resource" style
    if (pattern.includes(':') && scope.includes(':')) {
      const [pa, pr] = pattern.split(':', 2);
      const [sa, sr] = scope.split(':', 2);
      if (matchPattern(pa, sa) && matchPattern(pr, sr)) return true;
    }
  }
  return false;
}

function verifyScopes(store, agentID, requestedScopes) {
  const granted = [];
  const denied = [];
  const reasons = {};

  const agent = store.agents.get(agentID);
  if (!agent) {
    for (const s of requestedScopes) { denied.push(s); reasons[s] = 'agent_not_found'; }
    return { granted, denied, reasons };
  }

  let ceiling = null;
  if (agent.owner_id) {
    const owner = store.agents.getOwner(agent.owner_id);
    if (owner) ceiling = owner.scope_ceiling;
  }

  const allowedTools = (agent.capabilities && agent.capabilities.allowed_tools) || ['*'];

  for (const scope of requestedScopes) {
    if (!matchesAny(scope, allowedTools)) {
      denied.push(scope); reasons[scope] = 'not_in_capabilities'; continue;
    }
    if (ceiling && !matchesAny(scope, ceiling)) {
      denied.push(scope); reasons[scope] = 'exceeds_ceiling'; continue;
    }
    granted.push(scope);
  }
  return { granted, denied, reasons };
}

function verifyScopesInTask(store, agentID, taskID, requestedScopes) {
  const result = verifyScopes(store, agentID, requestedScopes);
  const task = store.tasks.get(taskID);
  if (!task) return result;

  const finalGranted = [];
  for (const scope of result.granted) {
    if (matchesAny(scope, task.allowed_scopes)) {
      finalGranted.push(scope);
    } else {
      result.denied.push(scope);
      result.reasons[scope] = 'outside_task_boundary';
    }
  }
  result.granted = finalGranted;
  return result;
}

module.exports = { verifyScopes, verifyScopesInTask, matchesAny };
