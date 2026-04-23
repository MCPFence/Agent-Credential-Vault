class AuditLog {
  constructor() {
    this.entries = [];
  }

  log(agentID, action, resourceID, detail) {
    this.entries.push({
      timestamp: new Date().toISOString(),
      agent_id: agentID,
      action,
      resource_id: resourceID || '',
      detail: detail || '',
    });
  }

  recent(n) {
    const total = this.entries.length;
    const count = Math.min(n, total);
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push(this.entries[total - 1 - i]);
    }
    return result;
  }

  all() { return this.recent(this.entries.length); }

  byResource(resourceID) {
    return this.entries.filter(e => e.resource_id === resourceID).reverse();
  }

  byAgent(agentID) {
    return this.entries.filter(e => e.agent_id === agentID).reverse();
  }
}

module.exports = AuditLog;
