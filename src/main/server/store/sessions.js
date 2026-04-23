const crypto = require('crypto');

class SessionStore {
  constructor() {
    this.sessions = new Map();
  }

  create(ownerID) {
    const sessionID = 'sess_' + crypto.randomBytes(16).toString('hex');
    const sess = {
      session_id: sessionID,
      owner_id: ownerID,
      expires_at: new Date(Date.now() + 24 * 3600000).toISOString(),
    };
    this.sessions.set(sessionID, sess);
    return sess;
  }

  get(sessionID) {
    const sess = this.sessions.get(sessionID);
    if (!sess || new Date() > new Date(sess.expires_at)) return null;
    return sess;
  }

  delete(sessionID) { this.sessions.delete(sessionID); }
}

module.exports = SessionStore;
