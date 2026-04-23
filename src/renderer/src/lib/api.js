const BASE = '/api/internal';

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function fetchJSON(path, options = {}) {
  const token = sessionStorage.getItem('ais-console-token') || '';
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', 'X-Console-Token': token, ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.message || `Request failed (${res.status})`, res.status, data.code);
  }
  return data;
}

export const api = {
  getAgents: () => fetchJSON('/agents'),
  registerAgent: (data) => fetchJSON('/agents', { method: 'POST', body: JSON.stringify(data) }),
  bindAgent: (id, claimToken) => fetchJSON(`/agents/${id}/bind`, { method: 'POST', body: JSON.stringify({ claim_token: claimToken }) }),
  suspendAgent: (id) => fetchJSON(`/agents/${id}/suspend`, { method: 'POST' }),
  activateAgent: (id) => fetchJSON(`/agents/${id}/activate`, { method: 'POST' }),
  deleteAgent: (id) => fetchJSON(`/agents/${id}`, { method: 'DELETE' }),
  updateCapabilities: (id, caps) => fetchJSON(`/agents/${id}/capabilities`, { method: 'PUT', body: JSON.stringify(caps) }),

  getTasks: () => fetchJSON('/tasks'),
  approveTask: (id) => fetchJSON(`/tasks/${id}/approve`, { method: 'POST' }),
  denyTask: (id) => fetchJSON(`/tasks/${id}/deny`, { method: 'POST' }),

  // Vault security
  vaultStatus: () => fetchJSON('/vault/status'),
  vaultInit: (password) => fetchJSON('/vault/init', { method: 'POST', body: JSON.stringify({ password }) }),
  vaultUnlock: (password) => fetchJSON('/vault/unlock', { method: 'POST', body: JSON.stringify({ password }) }),
  vaultLock: () => fetchJSON('/vault/lock', { method: 'POST' }),

  // Vault CRUD
  getVault: () => fetchJSON('/vault'),
  addCredential: (data) => fetchJSON('/vault', { method: 'POST', body: JSON.stringify(data) }),
  revealCredential: (id) => fetchJSON(`/vault/${id}/reveal`, { method: 'POST' }),
  suspendCredential: (id) => fetchJSON(`/vault/${id}/suspend`, { method: 'POST' }),
  activateCredential: (id) => fetchJSON(`/vault/${id}/activate`, { method: 'POST' }),
  deleteCredential: (id) => fetchJSON(`/vault/${id}`, { method: 'DELETE' }),
  updateCredential: (id, data) => fetchJSON(`/vault/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  getAudit: () => fetchJSON('/audit'),

  getPolicies: () => fetchJSON('/policies'),
  addPolicy: (data) => fetchJSON('/policies', { method: 'POST', body: JSON.stringify(data) }),
  updatePolicy: (id, data) => fetchJSON(`/policies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePolicy: (id) => fetchJSON(`/policies/${id}`, { method: 'DELETE' }),
  evaluatePolicy: (data) => fetchJSON('/policies/evaluate', { method: 'POST', body: JSON.stringify(data) }),
};
