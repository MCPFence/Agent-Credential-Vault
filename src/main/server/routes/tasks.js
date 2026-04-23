const crypto = require('crypto');
const { verifyScopes, verifyScopesInTask } = require('../verifier');

function tasksRoutes(store) {
  const handlers = {};

  handlers.createTask = (req, res) => {
    const agentID = req.agentID;
    const body = req.body;
    const scopes = body.requested_scopes || body.scopes || [];
    const { granted, denied, reasons } = verifyScopes(store, agentID, scopes);
    const task = store.tasks.create(agentID, body, granted, denied, reasons);
    store.audit.log(agentID, 'start_task', task.task_id, `type=${body.task_type} scopes=${scopes}`);
    res.status(201).json(task);
  };

  handlers.getTask = (req, res) => {
    const task = store.tasks.get(req.params.id);
    if (!task) return res.status(404).json({ code: 'not_found', message: 'Task not found' });
    res.json(task);
  };

  handlers.exchange = (req, res) => {
    const agentID = req.agentID;
    const task = store.tasks.get(req.params.id);
    if (!task || task.agent_id !== agentID) {
      return res.status(404).json({ code: 'not_found', message: 'Task not found' });
    }
    if (task.status !== 'active') {
      return res.status(400).json({ code: 'task_not_active', message: 'Task is ' + task.status });
    }
    const scopes = req.body.requested_scopes || req.body.scopes || [];
    const { granted, denied, reasons } = verifyScopesInTask(store, agentID, req.params.id, scopes);
    if (granted.length === 0) {
      return res.status(403).json({ code: 'scope_denied', message: `denied: ${JSON.stringify(reasons)}` });
    }
    const token = crypto.randomBytes(32).toString('hex');
    task.tool_calls_used++;
    store.audit.log(agentID, 'exchange', req.params.id, `resource=${req.body.resource_id || ''} scopes=${granted}`);
    res.json({ token, expires_in: 900, resource: req.body.resource_id || req.body.resource || '' });
  };

  handlers.release = (req, res) => {
    const agentID = req.agentID;
    const task = store.tasks.get(req.params.id);
    if (!task || task.agent_id !== agentID) {
      return res.status(404).json({ code: 'not_found' });
    }
    task.status = 'completed';
    store.audit.log(agentID, 'finish_task', req.params.id, '');
    res.json({ status: 'completed' });
  };

  handlers.authRequest = (req, res) => {
    const agentID = req.agentID;
    const task = store.tasks.get(req.params.id);
    if (!task || task.agent_id !== agentID) {
      return res.status(404).json({ code: 'not_found' });
    }
    const scopes = req.body.required_scopes || req.body.scopes || [];
    task.status = 'auth_required';
    task.pending_scopes = scopes;
    store.audit.log(agentID, 'auth_request', req.params.id, `scopes=${scopes} reason=${req.body.reason || ''}`);
    res.json({ status: 'auth_required', message: 'Waiting for owner approval' });
  };

  handlers.approveAuth = (req, res) => {
    const task = store.tasks.get(req.params.id);
    if (!task) return res.status(404).json({ code: 'not_found' });
    if (task.status !== 'auth_required') {
      return res.status(400).json({ code: 'not_pending', message: 'No pending auth request' });
    }
    task.allowed_scopes = [...task.allowed_scopes, ...task.pending_scopes];
    task.granted_scopes = [...task.granted_scopes, ...task.pending_scopes];
    task.pending_scopes = [];
    task.status = 'active';
    task.expires_at = new Date(Date.now() + 30 * 60000).toISOString();
    store.audit.log(task.agent_id, 'auth_approve', req.params.id, '');
    res.json({ status: 'approved' });
  };

  return handlers;
}

module.exports = tasksRoutes;
