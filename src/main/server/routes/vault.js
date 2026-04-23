const { Router } = require('express');

function vaultRoutes(store) {
  const router = Router();

  // GET /api/v1/vault/credentials (agent auth)
  router.listForAgent = (req, res) => {
    const agentID = req.agentID;
    const agent = store.agents.get(agentID);
    const ownerID = agent ? agent.owner_id : '';
    if (!ownerID) return res.status(403).json({ code: 'not_bound', message: 'Agent not bound to owner' });
    const creds = store.vault.listForAgent(agentID, ownerID);
    res.json(creds || []);
  };

  // POST /api/v1/vault/credentials/:id/use (agent auth)
  router.useForAgent = (req, res) => {
    const agentID = req.agentID;
    const credID = req.params.id;
    const taskSessionID = req.body.task_session_id;
    const agent = store.agents.get(agentID);
    const ownerID = agent ? agent.owner_id : '';

    // 1. Must have an active task
    if (!taskSessionID) {
      return res.status(400).json({ code: 'task_required', message: 'Must provide task_session_id. Start a task first.' });
    }
    const task = store.tasks.get(taskSessionID);
    if (!task) {
      return res.status(404).json({ code: 'task_not_found', message: 'Task not found' });
    }
    if (task.agent_id !== agentID) {
      return res.status(403).json({ code: 'task_mismatch', message: 'Task does not belong to this agent' });
    }
    if (task.status !== 'active') {
      return res.status(403).json({ code: 'task_not_active', message: 'Task is ' + task.status + '. Only active tasks can use credentials.' });
    }
    // Check task expiry
    if (task.expires_at && new Date() > new Date(task.expires_at)) {
      task.status = 'expired';
      return res.status(403).json({ code: 'task_expired', message: 'Task has expired' });
    }

    try {
      const data = store.vault.useCredential(credID, agentID, ownerID);
      const cred = store.vault.getCredential(credID);

      // 2. Increment task tool_calls_used
      task.tool_calls_used = (task.tool_calls_used || 0) + 1;

      store.audit.log(agentID, 'vault_use', credID, `task=${taskSessionID} purpose=${req.body.purpose || ''}`);
      res.json({
        credential_id: credID,
        credential_type: cred.credential_type,
        credential_data: data,
      });
    } catch (e) {
      res.status(403).json({ code: e.message, message: 'Vault access denied' });
    }
  };

  // POST /api/v1/vault/credentials (session auth)
  router.addCredential = (req, res) => {
    const ownerID = req.ownerID;
    try {
      const cred = store.vault.addCredential(ownerID, req.body);
      store.audit.log('owner:' + ownerID, 'vault_add', cred.credential_id, req.body.service_name);
      store.persist();
      res.status(201).json(cred);
    } catch (e) {
      res.status(500).json({ code: 'vault_error', message: e.message });
    }
  };

  // DELETE /api/v1/vault/credentials/:id (session auth)
  router.deleteCredential = (req, res) => {
    store.vault.deleteCredential(req.params.id);
    store.audit.log('owner:' + req.ownerID, 'vault_delete', req.params.id, '');
    store.persist();
    res.json({ status: 'deleted' });
  };

  return router;
}

module.exports = vaultRoutes;
