const crypto = require('crypto');

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;
const PBKDF2_DIGEST = 'sha512';
const AUTO_LOCK_MS = 30 * 60 * 1000; // 30 minutes

class VaultStore {
  constructor() {
    this.credentials = new Map();
    this.secrets = new Map();     // secretRef → encrypted Buffer
    this.vaultKey = null;         // AES key — only in memory when unlocked
    this.locked = true;
    this.initialized = false;
    this.salt = null;             // PBKDF2 salt — persisted
    this.verifyHash = null;       // hash of derived key — persisted for password verification
    this.autoLockTimer = null;
    this.lastActivity = Date.now();
  }

  // --- Key derivation ---

  _deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST);
  }

  _verifyToken(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  // --- Master password lifecycle ---

  setMasterPassword(password) {
    if (this.initialized) throw new Error('vault_already_initialized');
    this.salt = crypto.randomBytes(32);
    this.vaultKey = this._deriveKey(password, this.salt);
    this.verifyHash = this._verifyToken(this.vaultKey);
    this.initialized = true;
    this.locked = false;
    this.lastActivity = Date.now();
    this._startAutoLock();
  }

  unlock(password) {
    if (!this.initialized) throw new Error('vault_not_initialized');
    if (!this.locked) return true;
    const key = this._deriveKey(password, this.salt);
    const hash = this._verifyToken(key);
    if (hash !== this.verifyHash) throw new Error('invalid_password');
    this.vaultKey = key;
    this.locked = false;
    this.lastActivity = Date.now();
    this._startAutoLock();
    return true;
  }

  lock() {
    this.vaultKey = null;
    this.locked = true;
    this._stopAutoLock();
  }

  _touch() {
    this.lastActivity = Date.now();
  }

  _startAutoLock() {
    this._stopAutoLock();
    this.autoLockTimer = setInterval(() => {
      if (Date.now() - this.lastActivity > AUTO_LOCK_MS) {
        this.lock();
      }
    }, 60000); // check every minute
    if (this.autoLockTimer.unref) this.autoLockTimer.unref();
  }

  _stopAutoLock() {
    if (this.autoLockTimer) {
      clearInterval(this.autoLockTimer);
      this.autoLockTimer = null;
    }
  }

  _ensureUnlocked() {
    if (!this.initialized) throw new Error('vault_not_initialized');
    if (this.locked || !this.vaultKey) throw new Error('vault_locked');
    this._touch();
  }

  // --- Encryption ---

  encrypt(plaintext) {
    this._ensureUnlocked();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.vaultKey, iv);
    const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, enc, tag]);
  }

  decrypt(ciphertext) {
    this._ensureUnlocked();
    const buf = Buffer.from(ciphertext);
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(buf.length - 16);
    const data = buf.subarray(12, buf.length - 16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.vaultKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }

  // --- Credential CRUD ---

  addCredential(ownerID, req) {
    this._ensureUnlocked();
    const credID = 'vcred_' + crypto.randomBytes(8).toString('hex');
    const secretRef = 'secret_' + crypto.randomBytes(8).toString('hex');
    const dataStr = typeof req.credential_data === 'string'
      ? req.credential_data
      : JSON.stringify(req.credential_data || {});
    this.secrets.set(secretRef, this.encrypt(Buffer.from(dataStr)));

    const cred = {
      credential_id: credID,
      owner_id: ownerID,
      service_name: req.service_name,
      credential_type: req.credential_type,
      status: 'active',
      allowed_agent_ids: req.allowed_agent_ids || [],
      allowed_scopes: req.allowed_scopes || [],
      max_uses_per_hour: req.max_uses_per_hour || 60,
      uses_this_hour: 0,
      hour_reset_at: new Date(Date.now() + 3600000).toISOString(),
      total_uses: 0,
      last_used_at: null,
      last_used_by: null,
      expires_at: req.expires_at || null,
      secret_ref: secretRef,
      created_at: new Date().toISOString(),
      // Non-sensitive metadata extracted from credential_data for agent visibility
      metadata: this._extractMetadata(req.credential_type, req.credential_data),
    };
    this.credentials.set(credID, cred);
    return cred;
  }

  useCredential(credID, agentID, ownerID) {
    this._ensureUnlocked();
    const cred = this.credentials.get(credID);
    if (!cred) throw new Error('credential_not_found');
    if (cred.status === 'suspended') throw new Error('credential_inactive');
    if (cred.owner_id !== ownerID) throw new Error('owner_mismatch');

    // Check expiry
    if (cred.expires_at && new Date() > new Date(cred.expires_at)) {
      cred.status = 'expired';
      throw new Error('credential_expired');
    }
    if (cred.status !== 'active') throw new Error('credential_inactive');

    if (cred.allowed_agent_ids && cred.allowed_agent_ids.length > 0) {
      if (!cred.allowed_agent_ids.includes(agentID)) throw new Error('agent_not_allowed');
    }

    const now = new Date();
    if (now > new Date(cred.hour_reset_at)) {
      cred.uses_this_hour = 0;
      cred.hour_reset_at = new Date(now.getTime() + 3600000).toISOString();
    }
    if (cred.uses_this_hour >= cred.max_uses_per_hour) throw new Error('rate_limit_exceeded');
    cred.uses_this_hour++;

    // Usage tracking
    cred.total_uses = (cred.total_uses || 0) + 1;
    cred.last_used_at = now.toISOString();
    cred.last_used_by = agentID;

    const encrypted = this.secrets.get(cred.secret_ref);
    if (!encrypted) throw new Error('secret_not_found');
    return JSON.parse(this.decrypt(encrypted).toString());
  }

  revealCredential(credID) {
    this._ensureUnlocked();
    const cred = this.credentials.get(credID);
    if (!cred) throw new Error('credential_not_found');
    const encrypted = this.secrets.get(cred.secret_ref);
    if (!encrypted) throw new Error('secret_not_found');
    return JSON.parse(this.decrypt(encrypted).toString());
  }

  getCredential(credID) { return this.credentials.get(credID) || null; }

  listForAgent(agentID, ownerID) {
    return [...this.credentials.values()]
      .filter(c => {
        if (c.owner_id !== ownerID || c.status !== 'active') return false;
        if (c.allowed_agent_ids.length > 0 && !c.allowed_agent_ids.includes(agentID)) return false;
        return true;
      })
      .map(c => ({
        credential_id: c.credential_id,
        service_name: c.service_name,
        credential_type: c.credential_type,
        status: c.status,
        allowed_scopes: c.allowed_scopes,
        allowed_agent_ids: c.allowed_agent_ids,
        max_uses_per_hour: c.max_uses_per_hour,
        expires_at: c.expires_at,
        created_at: c.created_at,
        total_uses: c.total_uses,
        last_used_at: c.last_used_at,
        metadata: c.metadata || {},
      }));
  }

  listAll() {
    const now = new Date();
    const sevenDays = 7 * 24 * 3600000;
    return [...this.credentials.values()].map(c => {
      // Auto-expire check
      if (c.expires_at && c.status === 'active' && now > new Date(c.expires_at)) {
        c.status = 'expired';
      }
      // Compute expiry warning
      let expiry_warning = null;
      if (c.expires_at && c.status === 'active') {
        const remaining = new Date(c.expires_at).getTime() - now.getTime();
        if (remaining < sevenDays) {
          expiry_warning = Math.ceil(remaining / (24 * 3600000));
        }
      }
      return { ...c, expiry_warning };
    });
  }

  putCredential(cred) { this.credentials.set(cred.credential_id, cred); }
  putSecret(ref, data) { this.secrets.set(ref, data); }

  deleteCredential(credID) {
    const c = this.credentials.get(credID);
    if (c) this.secrets.delete(c.secret_ref);
    this.credentials.delete(credID);
  }

  suspendCredential(credID) {
    const c = this.credentials.get(credID);
    if (c) c.status = 'suspended';
  }

  activateCredential(credID) {
    const c = this.credentials.get(credID);
    if (c) c.status = 'active';
  }

  // --- Extract non-sensitive metadata from credential_data ---
  // Agent can see domain/path/username etc. but never the actual secret values

  _extractMetadata(credentialType, credentialData) {
    const data = typeof credentialData === 'string' ? JSON.parse(credentialData) : (credentialData || {});
    switch (credentialType) {
      case 'cookie':
        return { domain: data.domain || '', path: data.path || '/', cookie_count: Array.isArray(data.cookies) ? data.cookies.length : (data.cookies ? 1 : 0) };
      case 'oauth':
        return { token_type: data.token_type || 'bearer', scope: data.scope || '', has_refresh: !!data.refresh_token, has_client: !!data.client_id };
      case 'api_key':
        return { key_prefix: typeof data.api_key === 'string' ? data.api_key.substring(0, 4) + '****' : '' };
      case 'password':
        return { username: data.username || '' };
      default:
        return {};
    }
  }

  // --- Status ---

  status() {
    return {
      locked: this.locked,
      initialized: this.initialized,
      credential_count: this.credentials.size,
      auto_lock_remaining: this.locked ? 0 : Math.max(0, AUTO_LOCK_MS - (Date.now() - this.lastActivity)),
    };
  }

  // --- Persistence helpers ---

  getVaultMeta() {
    return {
      salt: this.salt ? this.salt.toString('hex') : null,
      verifyHash: this.verifyHash,
      initialized: this.initialized,
    };
  }

  loadVaultMeta(meta) {
    if (meta && meta.salt && meta.verifyHash) {
      this.salt = Buffer.from(meta.salt, 'hex');
      this.verifyHash = meta.verifyHash;
      this.initialized = true;
      this.locked = true; // always start locked
    }
  }

  // Export secrets as hex for persistence (still encrypted)
  exportSecrets() {
    const out = {};
    for (const [ref, buf] of this.secrets.entries()) {
      out[ref] = Buffer.from(buf).toString('hex');
    }
    return out;
  }

  importSecrets(data) {
    if (!data) return;
    for (const [ref, hex] of Object.entries(data)) {
      this.secrets.set(ref, Buffer.from(hex, 'hex'));
    }
  }
}

module.exports = VaultStore;
