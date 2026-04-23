const fs = require('fs');
const path = require('path');
const AgentStore = require('./agents');
const TaskStore = require('./tasks');
const VaultStore = require('./vault');
const SessionStore = require('./sessions');
const AuditLog = require('./audit');
const PolicyStore = require('./policies');

class Store {
  constructor(dataDir) {
    this.agents = new AgentStore();
    this.tasks = new TaskStore();
    this.vault = new VaultStore();
    this.sessions = new SessionStore();
    this.audit = new AuditLog();
    this.policies = new PolicyStore();
    this.dataDir = dataDir || '';

    if (this.dataDir) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      this.loadFromDisk();
    }
  }

  persist() {
    if (!this.dataDir) return;
    const write = (name, data) => {
      fs.writeFileSync(path.join(this.dataDir, name), JSON.stringify(data, null, 2));
    };
    write('agents.json', this.agents.list());
    write('vault.json', this.vault.listAll());
    write('vault_secrets.json', this.vault.exportSecrets());
    write('vault_meta.json', this.vault.getVaultMeta());
    write('owners.json', this.agents.listOwners());
    write('policies.json', this.policies.list());
    write('audit.json', this.audit.entries);
  }

  loadFromDisk() {
    const read = (name) => {
      try { return JSON.parse(fs.readFileSync(path.join(this.dataDir, name), 'utf-8')); }
      catch { return null; }
    };
    const agents = read('agents.json');
    if (agents) agents.forEach(a => this.agents.put(a));
    const creds = read('vault.json');
    if (creds) creds.forEach(c => this.vault.putCredential(c));
    const secrets = read('vault_secrets.json');
    if (secrets) this.vault.importSecrets(secrets);
    const vaultMeta = read('vault_meta.json');
    if (vaultMeta) this.vault.loadVaultMeta(vaultMeta);
    const owners = read('owners.json');
    if (owners) owners.forEach(o => this.agents.putOwner(o));
    const policies = read('policies.json');
    if (policies) policies.forEach(p => this.policies.putFromJSON(p));
    const auditEntries = read('audit.json');
    if (auditEntries && Array.isArray(auditEntries)) this.audit.entries = auditEntries;
  }
}

module.exports = Store;
