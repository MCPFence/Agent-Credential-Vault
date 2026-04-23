const crypto = require('crypto');

class TaskStore {
  constructor() {
    this.tasks = new Map();
  }

  get(taskID) { return this.tasks.get(taskID) || null; }
  put(task) { this.tasks.set(task.task_id, task); }
  delete(taskID) { this.tasks.delete(taskID); }

  listByAgent(agentID) {
    return [...this.tasks.values()].filter(t => t.agent_id === agentID);
  }

  listActive() {
    return [...this.tasks.values()].filter(t => t.status === 'active' || t.status === 'auth_required');
  }

  listAll() { return [...this.tasks.values()]; }

  create(agentID, req, granted, denied, deniedReasons) {
    const taskID = 'task_' + crypto.randomBytes(8).toString('hex');
    const deniedScopes = denied.map(scope => ({
      scope,
      reason: deniedReasons[scope] || 'not_permitted',
    }));
    const task = {
      task_id: taskID,
      agent_id: agentID,
      task_type: req.task_type || req.taskType || '',
      status: 'active',
      granted_scopes: granted,
      denied_scopes: deniedScopes,
      allowed_scopes: granted,
      description: req.description || req.task_description || '',
      tool_call_budget: 100,
      tool_calls_used: 0,
      expires_at: new Date(Date.now() + 30 * 60000).toISOString(),
      created_at: new Date().toISOString(),
      pending_scopes: [],
    };
    this.put(task);
    return task;
  }
}

module.exports = TaskStore;
