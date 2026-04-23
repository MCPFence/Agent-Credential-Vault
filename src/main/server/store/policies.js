const crypto = require('crypto');

// Simple glob match (fnmatch-style: * matches anything)
function globMatch(pattern, value) {
  if (pattern === '*') return true;
  const regex = new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
  return regex.test(value);
}

function matchAny(patterns, value) {
  if (!patterns || patterns.length === 0) return true; // empty = wildcard
  return patterns.some(p => globMatch(p, value));
}

function ruleMatches(rule, ctx) {
  if (rule.principal_types && rule.principal_types.length > 0) {
    if (!ctx.principal_type || !rule.principal_types.includes(ctx.principal_type)) return false;
  }
  if (rule.agent_types && rule.agent_types.length > 0) {
    if (!ctx.agent_type || !rule.agent_types.includes(ctx.agent_type)) return false;
  }
  if (rule.resource_ids && rule.resource_ids.length > 0) {
    if (!ctx.resource_id || !matchAny(rule.resource_ids, ctx.resource_id)) return false;
  }
  if (rule.task_types && rule.task_types.length > 0) {
    if (!ctx.task_type) return false;
    if (!matchAny(rule.task_types, ctx.task_type)) return false;
  }
  // Scopes: rule matches if ANY requested scope matches ANY rule scope pattern
  if (rule.scopes && rule.scopes.length > 0 && ctx.requested_scopes && ctx.requested_scopes.length > 0) {
    const scopeMatch = ctx.requested_scopes.some(s => rule.scopes.some(p => globMatch(p, s)));
    if (!scopeMatch) return false;
  }
  return true;
}

class PolicyStore {
  constructor() {
    this._policies = new Map(); // policy_set_id → PolicySet
  }

  add(data) {
    const id = 'pset_' + crypto.randomBytes(4).toString('hex');
    const rules = (data.rules || []).map(r => ({
      rule_id: r.rule_id || 'rule_' + crypto.randomBytes(4).toString('hex'),
      effect: r.effect || 'deny',
      description: r.description || '',
      priority: r.priority || 0,
      principal_types: r.principal_types || [],
      agent_types: r.agent_types || [],
      task_types: r.task_types || [],
      scopes: r.scopes || [],
      resource_ids: r.resource_ids || [],
    }));
    const ps = {
      policy_set_id: id,
      name: data.name || 'Unnamed Policy',
      description: data.description || '',
      rules,
      status: data.status || 'active',
      created_at: new Date().toISOString(),
    };
    this._policies.set(id, ps);
    return ps;
  }

  get(id) { return this._policies.get(id) || null; }

  list() { return Array.from(this._policies.values()); }

  remove(id) {
    const existed = this._policies.has(id);
    this._policies.delete(id);
    return existed;
  }

  update(id, data) {
    const ps = this._policies.get(id);
    if (!ps) return null;
    if (data.name !== undefined) ps.name = data.name;
    if (data.description !== undefined) ps.description = data.description;
    if (data.status !== undefined) ps.status = data.status;
    if (data.rules !== undefined) {
      ps.rules = data.rules.map(r => ({
        rule_id: r.rule_id || 'rule_' + crypto.randomBytes(4).toString('hex'),
        effect: r.effect || 'deny',
        description: r.description || '',
        priority: r.priority || 0,
        principal_types: r.principal_types || [],
        agent_types: r.agent_types || [],
        task_types: r.task_types || [],
        scopes: r.scopes || [],
        resource_ids: r.resource_ids || [],
      }));
    }
    return ps;
  }

  putFromJSON(data) {
    if (data.policy_set_id) {
      this._policies.set(data.policy_set_id, data);
    }
  }

  // Cedar-like evaluation: DENY first → ALLOW → default DENY
  evaluate(ctx) {
    const denyRules = [];
    const allowRules = [];

    for (const ps of this._policies.values()) {
      if (ps.status !== 'active') continue;
      for (const rule of ps.rules) {
        if (rule.effect === 'deny') denyRules.push(rule);
        else allowRules.push(rule);
      }
    }

    denyRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    allowRules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Phase 1: DENY rules
    for (const rule of denyRules) {
      if (ruleMatches(rule, ctx)) {
        return {
          effect: 'deny',
          matched_rules: [rule.rule_id],
          denied_reasons: [rule.description || `Denied by ${rule.rule_id}`],
          warnings: [],
        };
      }
    }

    // Phase 2: No policies at all → legacy allow
    if (allowRules.length === 0 && denyRules.length === 0) {
      return { effect: 'allow', matched_rules: [], denied_reasons: [], warnings: ['No policies defined — allowing by default'] };
    }
    if (allowRules.length === 0) {
      return { effect: 'allow', matched_rules: [], denied_reasons: [], warnings: ['No ALLOW rules, but no DENY matched'] };
    }

    // Phase 3: ALLOW rules
    for (const rule of allowRules) {
      if (ruleMatches(rule, ctx)) {
        return { effect: 'allow', matched_rules: [rule.rule_id], denied_reasons: [], warnings: [] };
      }
    }

    // Phase 4: Default DENY
    return { effect: 'deny', matched_rules: [], denied_reasons: ['No ALLOW rule matched (default deny)'], warnings: [] };
  }

  // Per-scope partial grant
  evaluateScopes(ctx) {
    const scopes = ctx.requested_scopes || [];
    if (scopes.length === 0) {
      const d = this.evaluate(ctx);
      return { granted_scopes: [], denied_scopes: [], applied_rules: d.matched_rules, warnings: d.warnings };
    }

    const granted = [];
    const denied = [];
    const appliedRules = [];
    const warnings = [];

    for (const scope of scopes) {
      const singleCtx = { ...ctx, requested_scopes: [scope] };
      const d = this.evaluate(singleCtx);
      appliedRules.push(...d.matched_rules);
      warnings.push(...d.warnings);
      if (d.effect === 'allow') {
        granted.push(scope);
      } else {
        denied.push({
          scope,
          reason: d.denied_reasons.join('; ') || 'Policy denied',
          rule_id: d.matched_rules[0] || '',
        });
      }
    }

    return {
      granted_scopes: granted,
      denied_scopes: denied,
      applied_rules: [...new Set(appliedRules)],
      warnings: [...new Set(warnings)],
    };
  }
}

module.exports = PolicyStore;
