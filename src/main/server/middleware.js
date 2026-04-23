const crypto = require('crypto');

// Nonce replay prevention — track used nonces, auto-cleanup expired ones
const usedNonces = new Set();
const NONCE_WINDOW_SEC = 300; // ±5 minutes

// Cleanup expired nonces every 60 seconds
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const nonce of usedNonces) {
    const ts = parseInt(nonce.split(':', 2)[0], 10);
    if (isNaN(ts) || Math.abs(now - ts) > NONCE_WINDOW_SEC + 60) {
      usedNonces.delete(nonce);
    }
  }
}, 60000).unref();

/**
 * Ed25519 agent auth middleware.
 * Verifies X-Agent-Id + X-Agent-Nonce + X-Agent-Signature headers.
 */
function agentAuthMiddleware(store) {
  return (req, res, next) => {
    const agentID = req.headers['x-agent-id'];
    const nonce = req.headers['x-agent-nonce'];
    const sigHex = req.headers['x-agent-signature'];

    if (!agentID || !nonce || !sigHex) {
      return res.status(401).json({ code: 'auth_required', message: 'Missing agent auth headers' });
    }

    // Check nonce freshness
    const parts = nonce.split(':', 2);
    if (parts.length !== 2) {
      return res.status(401).json({ code: 'invalid_nonce', message: 'Bad nonce format' });
    }
    const ts = parseInt(parts[0], 10);
    if (isNaN(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > NONCE_WINDOW_SEC) {
      return res.status(401).json({ code: 'nonce_expired', message: 'Nonce too old or too new' });
    }

    // Replay prevention — reject reused nonces
    if (usedNonces.has(nonce)) {
      return res.status(401).json({ code: 'nonce_reused', message: 'Nonce already used' });
    }

    const agent = store.agents.get(agentID);
    if (!agent) {
      return res.status(401).json({ code: 'agent_not_found', message: 'Unknown agent' });
    }
    if (agent.status === 'suspended' || agent.status === 'revoked') {
      return res.status(403).json({ code: 'agent_inactive', message: 'Agent is ' + agent.status });
    }

    // Verify Ed25519 signature
    try {
      const pubKeyBytes = Buffer.from(agent.public_key, 'hex');
      if (pubKeyBytes.length !== 32) {
        return res.status(401).json({ code: 'invalid_key', message: 'Bad public key' });
      }
      const sigBytes = Buffer.from(sigHex, 'hex');
      const ok = crypto.verify(null, Buffer.from(nonce), { key: createEd25519PubKey(pubKeyBytes), format: 'der', type: 'spki' }, sigBytes);
      if (!ok) {
        return res.status(401).json({ code: 'signature_invalid', message: 'Signature verification failed' });
      }
    } catch (e) {
      return res.status(401).json({ code: 'signature_error', message: 'Signature verification failed' });
    }

    // Mark nonce as used (after successful verification)
    usedNonces.add(nonce);

    req.agentID = agentID;
    next();
  };
}

/**
 * Create a DER-encoded Ed25519 SPKI public key from raw 32-byte key.
 */
function createEd25519PubKey(rawBytes) {
  // Ed25519 SPKI prefix (from RFC 8410)
  const prefix = Buffer.from('302a300506032b6570032100', 'hex');
  return Buffer.concat([prefix, rawBytes]);
}

/**
 * Session auth middleware — checks X-Session-Id.
 */
function sessionAuthMiddleware(store) {
  return (req, res, next) => {
    const sessionID = req.headers['x-session-id'];
    if (!sessionID) {
      return res.status(401).json({ code: 'session_required', message: 'Missing session' });
    }
    const sess = store.sessions.get(sessionID);
    if (!sess) {
      return res.status(401).json({ code: 'session_invalid', message: 'Invalid or expired session' });
    }
    req.ownerID = sess.owner_id;
    next();
  };
}

/**
 * Console token middleware — protects /api/internal/* routes.
 * Uses constant-time comparison to prevent timing attacks.
 */
function consoleTokenMiddleware(token) {
  const tokenBuf = Buffer.from(token);
  return (req, res, next) => {
    const t = req.headers['x-console-token'] || req.query.token;
    if (!t) {
      return res.status(403).json({ code: 'forbidden', message: 'Missing console token' });
    }
    // Constant-time comparison to prevent timing attacks
    const inputBuf = Buffer.from(String(t));
    if (inputBuf.length !== tokenBuf.length || !crypto.timingSafeEqual(inputBuf, tokenBuf)) {
      return res.status(403).json({ code: 'forbidden', message: 'Invalid console token' });
    }
    next();
  };
}

module.exports = { agentAuthMiddleware, sessionAuthMiddleware, consoleTokenMiddleware };
