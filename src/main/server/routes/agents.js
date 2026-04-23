const { Router } = require('express');
const crypto = require('crypto');

function agentsRoutes(store) {
  const router = Router();

  // POST /api/v1/agents/self-register (public)
  router.post('/self-register', (req, res) => {
    const { name, agent_name, public_key, description, agent_type, protocols } = req.body;
    const agentName = agent_name || name;
    if (!agentName) {
      return res.status(400).json({ code: 'bad_request', message: 'name required' });
    }

    // Generate Ed25519 keypair if not provided
    let pubKeyHex = public_key;
    let privKeyB64, pubKeyB64;
    if (!pubKeyHex) {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
      const pubRaw = publicKey.export({ type: 'spki', format: 'der' }).subarray(12); // strip DER prefix
      const privRaw = privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(16); // strip DER prefix
      pubKeyHex = pubRaw.toString('hex');
      // Return base64url for CLI compatibility
      pubKeyB64 = pubRaw.toString('base64url');
      privKeyB64 = privRaw.toString('base64url');
    }

    const agent = store.agents.register({
      name: agentName, agent_name: agentName, public_key: pubKeyHex, description, agent_type,
    });
    store.audit.log(agent.agent_id, 'register', '', 'self-register: ' + agentName);

    const resp = {
      agent_id: agent.agent_id,
      agent_name: agentName,
      claim_token: agent.claim_token,
      status: agent.status,
    };
    // Include keys if server-generated
    if (pubKeyB64) {
      resp.public_key = pubKeyB64;
      resp.private_key = privKeyB64;
    }
    res.status(201).json(resp);
  });

  // GET /api/v1/agents/:id/public-status (public)
  router.get('/:id/public-status', (req, res) => {
    const agent = store.agents.get(req.params.id);
    if (!agent) return res.status(404).json({ code: 'not_found', message: 'Agent not found' });
    res.json({ agent_id: agent.agent_id, status: agent.status, bound: !!agent.owner_id });
  });

  // GET /api/v1/agents/:id (agent auth — registered directly on app)
  router.getAgent = (req, res) => {
    const agentID = req.params.id;
    if (agentID !== req.agentID) {
      return res.status(403).json({ code: 'forbidden', message: 'Can only view own identity' });
    }
    const agent = store.agents.get(agentID);
    if (!agent) return res.status(404).json({ code: 'not_found', message: 'Agent not found' });
    const resp = { ...agent, claim_token: undefined };
    res.json(resp);
  };

  // POST /api/v1/agents/:id/bind (session auth)
  router.bindAgent = (req, res) => {
    const agentID = req.params.id;
    const ownerID = req.body.owner_id || req.ownerID;
    const claimToken = req.body.claim_token;
    try {
      store.agents.bind(agentID, ownerID, claimToken, req.body.allowed_tools);
      store.agents.ensureOwner(ownerID, 'pro');
      store.audit.log(agentID, 'bind', '', 'bound to ' + ownerID);
      store.persist();
      res.json({ status: 'bound' });
    } catch (e) {
      res.status(400).json({ code: 'bind_failed', message: e.message });
    }
  };

  // POST /api/v1/agents/:id/suspend (session auth)
  router.suspendAgent = (req, res) => {
    const agent = store.agents.get(req.params.id);
    if (!agent) return res.status(404).json({ code: 'not_found' });
    agent.status = 'suspended';
    store.audit.log(agent.agent_id, 'suspend', '', '');
    store.persist();
    res.json({ status: 'suspended' });
  };

  return router;
}

module.exports = agentsRoutes;
