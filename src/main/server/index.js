const express = require('express');
const Store = require('./store');
const { agentAuthMiddleware, sessionAuthMiddleware, consoleTokenMiddleware } = require('./middleware');
const agentsRoutes = require('./routes/agents');
const tasksRoutes = require('./routes/tasks');
const vaultRoutes = require('./routes/vault');

function createServer(dataDir, port = 8400, consoleToken = '') {
  const store = new Store(dataDir);
  store.agents.ensureOwner('admin', 'pro');

  const app = express();
  app.use(express.json());

  // CORS — restrict to localhost origins only
  app.use((req, res, next) => {
    const origin = req.headers.origin || '';
    // Allow same-origin (no Origin header) and localhost origins
    if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      res.header('Access-Control-Allow-Origin', origin || '*');
    }
    // Never set Allow-Origin for non-localhost external origins
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Id, X-Agent-Nonce, X-Agent-Signature, X-Session-Id, X-Console-Token');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  const agentAuth = agentAuthMiddleware(store);
  const agents = agentsRoutes(store);
  const tasks = tasksRoutes(store);
  const vault = vaultRoutes(store);

  // Health
  app.get('/health', (req, res) => res.json({ status: 'ok' }));

  // === Public agent routes ===
  app.use('/api/v1/agents', agents);

  // === Agent-authenticated routes ===
  app.get('/api/v1/agents/:id', agentAuth, agents.getAgent);
  app.post('/api/v1/tasks/', agentAuth, tasks.createTask);
  app.get('/api/v1/tasks/:id', agentAuth, tasks.getTask);
  app.post('/api/v1/tasks/:id/exchange', agentAuth, tasks.exchange);
  app.post('/api/v1/tasks/:id/release', agentAuth, tasks.release);
  app.post('/api/v1/tasks/:id/auth/request', agentAuth, tasks.authRequest);
  app.get('/api/v1/vault/credentials', agentAuth, vault.listForAgent);
  app.post('/api/v1/vault/credentials/:id/use', agentAuth, vault.useForAgent);

  // === Console token protection — ALL management routes below require console token ===
  const consoleAuth = consoleToken ? consoleTokenMiddleware(consoleToken) : (req, res, next) => next();
  app.use('/api/internal', consoleAuth);

  // --- Session management (protected by console token) ---
  app.post('/api/internal/login', (req, res) => {
    const ownerID = req.body.owner_id || 'admin';
    const tier = req.body.tier || 'pro';
    store.agents.ensureOwner(ownerID, tier);
    const sess = store.sessions.create(ownerID);
    res.json({ session_id: sess.session_id, owner_id: ownerID });
  });

  app.get('/api/internal/session', (req, res) => {
    const sess = store.sessions.create('admin');
    res.json({ session_id: sess.session_id, owner_id: 'admin' });
  });

  // --- Internal API for renderer ---
  app.get('/api/internal/agents', (req, res) => res.json(store.agents.list()));
  app.get('/api/internal/tasks', (req, res) => res.json(store.tasks.listAll()));
  app.get('/api/internal/audit', (req, res) => res.json(store.audit.recent(200)));

  app.post('/api/internal/agents', (req, res) => {
    const agent = store.agents.register(req.body);
    store.audit.log(agent.agent_id, 'register', '', 'registered via GUI: ' + (req.body.name || ''));
    store.persist();
    res.status(201).json(agent);
  });
  app.post('/api/internal/agents/:id/bind', (req, res) => {
    try {
      const claimToken = req.body.claim_token;
      if (!claimToken) return res.status(400).json({ code: 'bind_failed', message: 'Please enter a Claim Token' });
      store.agents.bind(req.params.id, 'admin', claimToken, null);
      store.agents.ensureOwner('admin', 'pro');
      store.audit.log(req.params.id, 'bind', '', 'bound via GUI');
      store.persist();
      res.json({ status: 'bound' });
    } catch (e) {
      res.status(400).json({ code: 'bind_failed', message: e.message });
    }
  });
  app.post('/api/internal/agents/:id/suspend', (req, res) => {
    const agent = store.agents.get(req.params.id);
    if (!agent) return res.status(404).json({ code: 'not_found' });
    agent.status = 'suspended';
    store.audit.log(req.params.id, 'suspend', '', 'via GUI');
    store.persist();
    res.json({ status: 'suspended' });
  });
  app.post('/api/internal/agents/:id/activate', (req, res) => {
    const agent = store.agents.get(req.params.id);
    if (!agent) return res.status(404).json({ code: 'not_found' });
    agent.status = 'active';
    store.persist();
    res.json({ status: 'active' });
  });
  app.delete('/api/internal/agents/:id', (req, res) => {
    store.agents.delete(req.params.id);
    store.persist();
    res.json({ status: 'deleted' });
  });
  app.put('/api/internal/agents/:id/capabilities', (req, res) => {
    try {
      const agent = store.agents.updateCapabilities(req.params.id, req.body);
      store.audit.log(req.params.id, 'capabilities_update', '', JSON.stringify(req.body));
      store.persist();
      res.json(agent);
    } catch (e) {
      res.status(400).json({ code: 'update_failed', message: e.message });
    }
  });

  // --- Vault security API ---
  app.get('/api/internal/vault/status', (req, res) => {
    res.json(store.vault.status());
  });
  app.post('/api/internal/vault/init', (req, res) => {
    try {
      store.vault.setMasterPassword(req.body.password);
      store.audit.log('owner:admin', 'vault_init', '', 'master password set');
      store.persist();
      res.json({ status: 'initialized' });
    } catch (e) {
      res.status(400).json({ code: 'vault_error', message: e.message });
    }
  });
  app.post('/api/internal/vault/unlock', (req, res) => {
    try {
      store.vault.unlock(req.body.password);
      store.audit.log('owner:admin', 'vault_unlock', '', '');
      res.json({ status: 'unlocked' });
    } catch (e) {
      res.status(403).json({ code: 'vault_error', message: e.message });
    }
  });
  app.post('/api/internal/vault/lock', (req, res) => {
    store.vault.lock();
    store.audit.log('owner:admin', 'vault_lock', '', '');
    res.json({ status: 'locked' });
  });

  // Vault CRUD
  app.get('/api/internal/vault', (req, res) => {
    res.json(store.vault.listAll());
  });
  app.post('/api/internal/vault', (req, res) => {
    try {
      const cred = store.vault.addCredential('admin', req.body);
      store.audit.log('owner:admin', 'vault_add', cred.credential_id, req.body.service_name);
      store.persist();
      res.status(201).json(cred);
    } catch (e) {
      if (e.message === 'vault_locked') return res.status(403).json({ code: 'vault_locked', message: 'Vault is locked' });
      res.status(500).json({ code: 'vault_error', message: e.message });
    }
  });
  app.post('/api/internal/vault/:id/reveal', (req, res) => {
    try {
      const data = store.vault.revealCredential(req.params.id);
      store.audit.log('owner:admin', 'vault_reveal', req.params.id, 'credential viewed');
      res.json({ credential_data: data });
    } catch (e) {
      if (e.message === 'vault_locked') return res.status(403).json({ code: 'vault_locked', message: 'Vault is locked' });
      res.status(400).json({ code: 'reveal_error', message: e.message });
    }
  });
  app.post('/api/internal/vault/:id/suspend', (req, res) => {
    store.vault.suspendCredential(req.params.id);
    store.audit.log('owner:admin', 'vault_suspend', req.params.id, '');
    store.persist();
    res.json({ status: 'suspended' });
  });
  app.post('/api/internal/vault/:id/activate', (req, res) => {
    store.vault.activateCredential(req.params.id);
    store.persist();
    res.json({ status: 'active' });
  });
  app.put('/api/internal/vault/:id', (req, res) => {
    const cred = store.vault.getCredential(req.params.id);
    if (!cred) return res.status(404).json({ code: 'not_found' });
    if (req.body.allowed_agent_ids !== undefined) cred.allowed_agent_ids = req.body.allowed_agent_ids;
    if (req.body.allowed_scopes !== undefined) cred.allowed_scopes = req.body.allowed_scopes;
    if (req.body.max_uses_per_hour !== undefined) cred.max_uses_per_hour = req.body.max_uses_per_hour;
    if (req.body.display_name !== undefined) cred.service_name = req.body.display_name;
    store.audit.log('owner:admin', 'vault_update', req.params.id, JSON.stringify(req.body));
    store.persist();
    res.json(cred);
  });
  app.delete('/api/internal/vault/:id', (req, res) => {
    store.vault.deleteCredential(req.params.id);
    store.audit.log('owner:admin', 'vault_delete', req.params.id, '');
    store.persist();
    res.json({ status: 'deleted' });
  });

  // --- Policy internal API ---
  app.get('/api/internal/policies', (req, res) => res.json(store.policies.list()));
  app.post('/api/internal/policies', (req, res) => {
    try {
      const ps = store.policies.add(req.body);
      store.audit.log('owner:admin', 'policy_add', ps.policy_set_id, req.body.name || '');
      store.persist();
      res.status(201).json(ps);
    } catch (e) {
      res.status(500).json({ code: 'policy_error', message: e.message });
    }
  });
  app.put('/api/internal/policies/:id', (req, res) => {
    const ps = store.policies.update(req.params.id, req.body);
    if (!ps) return res.status(404).json({ code: 'not_found' });
    store.audit.log('owner:admin', 'policy_update', req.params.id, ps.name);
    store.persist();
    res.json(ps);
  });
  app.delete('/api/internal/policies/:id', (req, res) => {
    store.policies.remove(req.params.id);
    store.audit.log('owner:admin', 'policy_delete', req.params.id, '');
    store.persist();
    res.json({ status: 'deleted' });
  });
  app.post('/api/internal/policies/evaluate', (req, res) => {
    const result = store.policies.evaluateScopes(req.body);
    res.json(result);
  });
  app.post('/api/internal/tasks/:id/approve', (req, res) => {
    const task = store.tasks.get(req.params.id);
    if (!task) return res.status(404).json({ code: 'not_found' });
    if (task.status !== 'auth_required') return res.status(400).json({ code: 'not_pending' });
    task.allowed_scopes = [...task.allowed_scopes, ...(task.pending_scopes || [])];
    task.granted_scopes = [...task.granted_scopes, ...(task.pending_scopes || [])];
    task.pending_scopes = [];
    task.status = 'active';
    store.audit.log(task.agent_id, 'auth_approve', req.params.id, 'approved via GUI');
    res.json({ status: 'approved' });
  });
  app.post('/api/internal/tasks/:id/deny', (req, res) => {
    const task = store.tasks.get(req.params.id);
    if (!task) return res.status(404).json({ code: 'not_found' });
    for (const s of (task.pending_scopes || [])) {
      task.denied_scopes.push({ scope: s, reason: 'owner_denied' });
    }
    task.pending_scopes = [];
    task.status = 'active';
    store.audit.log(task.agent_id, 'auth_deny', req.params.id, 'denied via GUI');
    res.json({ status: 'denied' });
  });

  let server;
  return {
    store,
    app,
    consoleToken,
    start() {
      return new Promise((resolve, reject) => {
        server = app.listen(port, () => {
          console.log(`Agent Credential Vault listening on :${port}`);
          resolve(server);
        });
        server.on('error', reject);
      });
    },
    stop() {
      if (server) server.close();
    },
  };
}

module.exports = createServer;
