const crypto = require('crypto');

class AgentStore {
  constructor() {
    this.agents = new Map();
    this.owners = new Map();
  }

  get(agentID) { return this.agents.get(agentID) || null; }
  put(agent) { this.agents.set(agent.agent_id, agent); }
  delete(agentID) { this.agents.delete(agentID); }
  list() { return [...this.agents.values()]; }

  getOwner(ownerID) { return this.owners.get(ownerID) || null; }
  putOwner(owner) { this.owners.set(owner.owner_id, owner); }
  listOwners() { return [...this.owners.values()]; }

  ensureOwner(ownerID, tier) {
    if (this.owners.has(ownerID)) return this.owners.get(ownerID);
    const ceilings = {
      free: ['chat:*', 'search:web', 'summarize:*', 'read:own_*'],
      pro: ['chat:*', 'search:*', 'summarize:*', 'read:*', 'write:own_*', 'execute:workflow_*'],
    };
    const owner = { owner_id: ownerID, tier, scope_ceiling: ceilings[tier] || ceilings.pro };
    this.owners.set(ownerID, owner);
    return owner;
  }

  register(req) {
    const agentID = 'agt_' + crypto.randomBytes(8).toString('hex');
    const claimToken = 'claim_' + crypto.randomBytes(16).toString('hex');
    const agent = {
      agent_id: agentID,
      name: req.name || req.agent_name || '',
      description: req.description || '',
      agent_type: req.agent_type || 'assistive',
      status: 'pending',
      owner_id: '',
      public_key: req.public_key || '',
      capabilities: null,
      claim_token: claimToken,
      created_at: new Date().toISOString(),
    };
    this.put(agent);
    return agent;
  }

  bind(agentID, ownerID, claimToken, tools) {
    const agent = this.get(agentID);
    if (!agent) throw new Error('agent not found');
    if (agent.status !== 'pending') throw new Error('agent not in pending state');
    if (!claimToken || agent.claim_token !== claimToken) throw new Error('invalid claim token');
    agent.owner_id = ownerID;
    agent.status = 'active';
    agent.capabilities = { allowed_tools: tools || ['*'] };
    agent.claim_token = ''; // 绑定后清除 claim_token
  }

  updateCapabilities(agentID, capabilities) {
    const agent = this.get(agentID);
    if (!agent) throw new Error('agent not found');
    if (!agent.capabilities) agent.capabilities = {};
    if (capabilities.allowed_tools !== undefined) agent.capabilities.allowed_tools = capabilities.allowed_tools;
    if (capabilities.allowed_audiences !== undefined) agent.capabilities.allowed_audiences = capabilities.allowed_audiences;
    if (capabilities.max_delegation_depth !== undefined) agent.capabilities.max_delegation_depth = capabilities.max_delegation_depth;
    return agent;
  }

  findByClaimToken(token) {
    for (const a of this.agents.values()) {
      if (a.claim_token === token) return a;
    }
    return null;
  }
}

module.exports = AgentStore;
