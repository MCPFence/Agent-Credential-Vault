import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

function Badge({ status }) {
  const c = {
    active: 'bg-success/10 text-success',
    suspended: 'bg-warning/10 text-warning',
    expired: 'bg-error/10 text-error',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${c[status] || 'bg-bg4 text-text-dim'}`}>{status}</span>;
}

function TypeBadge({ type }) {
  const c = {
    oauth: 'bg-primary/10 text-primary',
    api_key: 'bg-cyan/10 text-cyan',
    cookie: 'bg-warning/10 text-warning',
    password: 'bg-purple/10 text-purple',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-mono font-semibold ${c[type] || 'bg-bg4 text-text-dim'}`}>{type}</span>;
}

function ExpiryBadge({ cred }) {
  if (!cred.expires_at) return null;
  if (cred.status === 'expired') return <span className="px-1.5 py-0.5 bg-error/10 text-error text-[10px] font-semibold rounded">Expired</span>;
  if (cred.expiry_warning != null) return <span className="px-1.5 py-0.5 bg-warning/10 text-warning text-[10px] font-semibold rounded">Expires in {cred.expiry_warning}d</span>;
  return null;
}

// ---- Lock Screen ----
function LockScreen({ status, onUnlock, onInit, toast }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [loading, setLoading] = useState(false);
  const inputCls = "w-full px-4 py-3 bg-input-bg border border-border-2 rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:border-primary";

  const handleInit = async () => {
    if (!pw || pw.length < 6) { toast.error('Master password must be at least 6 characters'); return; }
    if (pw !== pw2) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try { await onInit(pw); } catch (e) { toast.error(e.message); }
    setLoading(false);
  };

  const handleUnlock = async () => {
    if (!pw) return;
    setLoading(true);
    try { await onUnlock(pw); } catch (e) { toast.error(e.message); }
    setLoading(false);
    setPw('');
  };

  const isInit = !status.initialized;

  return (
    <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 200px)' }}>
      <div className="w-[400px] text-center">
        <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-bg3 border border-separator flex items-center justify-center">
          <span className="text-4xl">{isInit ? '\u{1F6E1}' : '\u{1F512}'}</span>
        </div>
        <h2 className="text-xl font-bold mb-2">{isInit ? 'Initialize Credential Vault' : 'Credential Vault Locked'}</h2>
        <p className="text-sm text-text-muted mb-6">
          {isInit
            ? 'Set a master password to protect your credentials. All credentials are encrypted with AES-256-GCM, key derived via PBKDF2.'
            : 'Enter master password to unlock the vault and manage credentials.'}
        </p>
        <div className="space-y-3">
          <input
            type="password" placeholder={isInit ? 'Set master password (min 6 chars)' : 'Enter master password'}
            value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !isInit && handleUnlock()}
            className={inputCls} autoFocus
          />
          {isInit && (
            <input
              type="password" placeholder="Confirm master password"
              value={pw2} onChange={e => setPw2(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleInit()}
              className={inputCls}
            />
          )}
          <button
            onClick={isInit ? handleInit : handleUnlock}
            disabled={loading}
            className="w-full py-3 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-dark transition disabled:opacity-50"
          >
            {loading ? 'Processing...' : isInit ? 'Initialize Vault' : 'Unlock'}
          </button>
        </div>
        <div className="mt-8 flex items-center justify-center gap-4 text-[11px] text-text-muted">
          <span className="flex items-center gap-1"><span className="text-success">{'\u2713'}</span> AES-256-GCM</span>
          <span className="flex items-center gap-1"><span className="text-success">{'\u2713'}</span> PBKDF2 100K rounds</span>
          <span className="flex items-center gap-1"><span className="text-success">{'\u2713'}</span> 30-min auto-lock</span>
        </div>
      </div>
    </div>
  );
}

// ---- Credential Detail Modal ----
function CredentialDetail({ cred, audit, onClose, toast }) {
  const [revealed, setRevealed] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef(null);

  const reveal = async () => {
    try {
      const data = await api.revealCredential(cred.credential_id);
      setRevealed(data.credential_data);
      setCountdown(30);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setRevealed(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (e) {
      toast.error(e.message);
    }
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const credAudit = audit.filter(e => e.resource_id === cred.credential_id).slice(0, 10);
  const usagePercent = cred.max_uses_per_hour > 0 ? Math.min(100, ((cred.uses_this_hour || 0) / cred.max_uses_per_hour) * 100) : 0;

  const renderField = (label, value) => {
    if (!value) return null;
    const masked = !revealed;
    const display = masked ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' : value;
    return (
      <div className="flex items-center justify-between py-1.5">
        <span className="text-xs text-text-muted w-28 shrink-0">{label}</span>
        <code className={`text-xs font-mono flex-1 truncate ${masked ? 'text-text-muted' : 'text-cyan'}`}>{display}</code>
      </div>
    );
  };

  const renderRevealed = () => {
    if (!revealed && !cred.credential_type) return null;
    const t = cred.credential_type;
    if (t === 'oauth') return <>{renderField('Access Token', revealed?.access_token || 'set')}{renderField('Refresh Token', revealed?.refresh_token)}{renderField('Token URL', revealed?.token_url)}</>;
    if (t === 'api_key') return <>{renderField('API Key', revealed?.api_key || 'set')}{renderField('API Secret', revealed?.api_secret)}</>;
    if (t === 'cookie') return <>{renderField('Domain', revealed?.domain || 'set')}{renderField('Path', revealed?.path)}{renderField('Cookie', revealed?.cookies || 'set')}</>;
    if (t === 'password') return <>{renderField('Username', revealed?.username || 'set')}{renderField('Password', revealed?.password || 'set')}</>;
    return null;
  };

  return (
    <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-bg2 border border-separator rounded-lg p-6 w-[550px] max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <TypeBadge type={cred.credential_type} />
            <h3 className="text-base font-semibold">{cred.service_name}</h3>
            <Badge status={cred.status} />
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text text-lg">&times;</button>
        </div>

        {/* Basic Info */}
        <div className="bg-bg border border-separator rounded p-4 space-y-1.5 text-[13px] mb-4">
          <Row label="ID" value={cred.credential_id} mono />
          <Row label="Created" value={new Date(cred.created_at).toLocaleString()} />
          {cred.expires_at && <Row label="Expires" value={new Date(cred.expires_at).toLocaleString()} />}
          <Row label="Allowed Agents" value={cred.allowed_agent_ids?.length > 0 ? cred.allowed_agent_ids.join(', ') : 'All'} />
        </div>

        {/* Credential Data — masked */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold">Credential Data</h4>
            {!revealed ? (
              <button onClick={reveal} className="px-3 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20 font-medium">
                Reveal
              </button>
            ) : (
              <span className="text-xs text-warning font-mono">Auto-hides in {countdown}s</span>
            )}
          </div>
          <div className="bg-bg border border-separator rounded p-3">
            {renderRevealed()}
          </div>
          {revealed && (
            <div className="mt-2 px-3 py-1.5 bg-warning/5 border border-warning/20 rounded text-[11px] text-warning">
              Credential plaintext is visible. Auto-hides in {countdown}s. Do not screenshot or copy to insecure locations.
            </div>
          )}
        </div>

        {/* Usage Stats */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold mb-2">Usage Stats</h4>
          <div className="bg-bg border border-separator rounded p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Total Uses</span>
              <span className="font-mono text-text">{cred.total_uses || 0}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Last Used</span>
              <span className="text-text">{cred.last_used_at ? new Date(cred.last_used_at).toLocaleString() : 'Never'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-muted">Last Used By</span>
              <span className="font-mono text-cyan text-xs">{cred.last_used_by || '—'}</span>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-text-muted">Hourly Rate</span>
                <span className="font-mono text-text-dim">{cred.uses_this_hour || 0} / {cred.max_uses_per_hour}</span>
              </div>
              <div className="w-full h-1.5 bg-bg3 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${usagePercent > 80 ? 'bg-error' : usagePercent > 50 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${usagePercent}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Per-credential audit */}
        <div>
          <h4 className="text-sm font-semibold mb-2">Access Log</h4>
          {credAudit.length === 0 && <span className="text-text-muted text-xs">No records</span>}
          <div className="space-y-0.5">
            {credAudit.map((e, i) => (
              <div key={i} className="text-xs font-mono text-text-dim py-0.5 flex gap-2">
                <span className="text-text-muted min-w-[130px]">{new Date(e.timestamp).toLocaleString()}</span>
                <span className={e.action.includes('reveal') ? 'text-warning' : 'text-text-dim'}>{e.action}</span>
                <span className="text-text-dim truncate">{e.detail}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex">
      <span className="text-text-muted w-24 shrink-0 text-xs">{label}:</span>
      <span className={mono ? 'font-mono text-xs text-cyan' : 'text-xs text-text'}>{value}</span>
    </div>
  );
}

// ---- OAuth Presets ----
const oauthPresets = [
  { id: '', label: '-- Select a template --' },
  { id: 'github_pat', label: 'GitHub Personal Access Token',
    service_name: 'github', token_url: 'https://github.com/login/oauth/access_token',
    oauth_scopes: 'repo, read:user, read:org',
    help: 'Create at GitHub → Settings → Developer settings → Personal access tokens. Select the required scopes.',
    placeholder_token: 'ghp_xxxxxxxxxxxxxxxxxxxx',
  },
  { id: 'github_oauth', label: 'GitHub OAuth App',
    service_name: 'github-oauth', token_url: 'https://github.com/login/oauth/access_token',
    oauth_scopes: 'repo, user, read:org',
    help: 'Create an OAuth App at GitHub → Settings → Developer settings → OAuth Apps. Get Client ID/Secret, complete OAuth flow, then paste the Access Token.',
    placeholder_token: 'gho_xxxxxxxxxxxxxxxxxxxx',
    needs_client: true,
  },
  { id: 'google_gmail', label: 'Google Gmail',
    service_name: 'google-gmail', token_url: 'https://oauth2.googleapis.com/token',
    oauth_scopes: 'https://www.googleapis.com/auth/gmail.readonly, https://www.googleapis.com/auth/gmail.send',
    help: 'Create OAuth 2.0 credentials in Google Cloud Console, enable Gmail API, complete authorization, then paste Access Token and Refresh Token.',
    placeholder_token: 'ya29.xxxxxxxxxxxxxxxxxxxx',
    needs_client: true,
  },
  { id: 'google_drive', label: 'Google Drive',
    service_name: 'google-drive', token_url: 'https://oauth2.googleapis.com/token',
    oauth_scopes: 'https://www.googleapis.com/auth/drive.readonly, https://www.googleapis.com/auth/drive.file',
    help: 'Create OAuth 2.0 credentials in Google Cloud Console, enable Drive API, complete authorization, then paste the Token.',
    placeholder_token: 'ya29.xxxxxxxxxxxxxxxxxxxx',
    needs_client: true,
  },
  { id: 'google_calendar', label: 'Google Calendar',
    service_name: 'google-calendar', token_url: 'https://oauth2.googleapis.com/token',
    oauth_scopes: 'https://www.googleapis.com/auth/calendar.readonly, https://www.googleapis.com/auth/calendar.events',
    help: 'Create OAuth 2.0 credentials in Google Cloud Console, enable Calendar API, complete authorization, then paste the Token.',
    placeholder_token: 'ya29.xxxxxxxxxxxxxxxxxxxx',
    needs_client: true,
  },
  { id: 'google_sheets', label: 'Google Sheets',
    service_name: 'google-sheets', token_url: 'https://oauth2.googleapis.com/token',
    oauth_scopes: 'https://www.googleapis.com/auth/spreadsheets',
    help: 'Create OAuth 2.0 credentials in Google Cloud Console, enable Sheets API, complete authorization, then paste the Token.',
    placeholder_token: 'ya29.xxxxxxxxxxxxxxxxxxxx',
    needs_client: true,
  },
  { id: 'notion', label: 'Notion Integration',
    service_name: 'notion', token_url: '',
    oauth_scopes: '',
    help: 'Create an Internal Integration at notion.so/my-integrations, then copy the Internal Integration Token as Access Token.',
    placeholder_token: 'secret_xxxxxxxxxxxxxxxxxxxx',
  },
  { id: 'slack', label: 'Slack Bot / User Token',
    service_name: 'slack', token_url: 'https://slack.com/api/oauth.v2.access',
    oauth_scopes: 'channels:read, chat:write, users:read',
    help: 'Create an App at api.slack.com/apps, add required Scopes, install to Workspace, then copy the Bot/User Token.',
    placeholder_token: 'xoxb-xxxxxxxxxxxxxxxxxxxx',
  },
];

// ---- Main VaultTab ----
const emptyForm = {
  service_name: '', credential_type: 'oauth',
  access_token: '', refresh_token: '', token_url: '',
  client_id: '', client_secret: '', oauth_scopes: '',
  api_key: '', api_secret: '',
  cookie_domain: '', cookie_path: '/', cookie_value: '',
  username: '', password: '',
  allowed_agent_ids: '', max_uses_per_hour: 60,
  expires_days: '', preset: '',
};

export default function VaultTab() {
  const [vaultStatus, setVaultStatus] = useState({ locked: true, initialized: false, credential_count: 0, auto_lock_remaining: 0 });
  const [creds, setCreds] = useState([]);
  const [audit, setAudit] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ ...emptyForm });
  const [selected, setSelected] = useState(null);
  const toast = useToast();

  const loadStatus = useCallback(() => api.vaultStatus().then(setVaultStatus).catch(() => {}), []);
  const loadCreds = useCallback(() => api.getVault().then(setCreds).catch(() => {}), []);
  const loadAudit = useCallback(() => api.getAudit().then(setAudit).catch(() => {}), []);

  const load = useCallback(() => { loadStatus(); loadCreds(); loadAudit(); }, [loadStatus, loadCreds, loadAudit]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [load]);

  const handleInit = async (pw) => {
    await api.vaultInit(pw);
    toast.success('Vault initialized');
    load();
  };
  const handleUnlock = async (pw) => {
    await api.vaultUnlock(pw);
    toast.success('Vault unlocked');
    load();
  };
  const handleLock = async () => {
    await api.vaultLock();
    toast.info('Vault locked');
    load();
  };

  if (!vaultStatus.initialized || vaultStatus.locked) {
    return <LockScreen status={vaultStatus} onUnlock={handleUnlock} onInit={handleInit} toast={toast} />;
  }

  const splitTrim = (s) => s ? s.split(',').map(x => x.trim()).filter(Boolean) : [];

  const buildCredData = () => {
    const t = form.credential_type;
    if (t === 'oauth') {
      const d = {};
      if (form.access_token) d.access_token = form.access_token;
      if (form.refresh_token) d.refresh_token = form.refresh_token;
      if (form.token_url) d.token_url = form.token_url;
      if (form.client_id) d.client_id = form.client_id;
      if (form.client_secret) d.client_secret = form.client_secret;
      if (form.oauth_scopes) d.scope = form.oauth_scopes;
      return d;
    }
    if (t === 'api_key') {
      const d = {};
      if (form.api_key) d.api_key = form.api_key;
      if (form.api_secret) d.api_secret = form.api_secret;
      return d;
    }
    if (t === 'cookie') return { domain: form.cookie_domain || '', path: form.cookie_path || '/', cookies: form.cookie_value || '' };
    if (t === 'password') return { username: form.username || '', password: form.password || '' };
    return {};
  };

  const add = async () => {
    if (!form.service_name) return;
    try {
      const body = {
        service_name: form.service_name,
        credential_type: form.credential_type,
        credential_data: buildCredData(),
        allowed_agent_ids: splitTrim(form.allowed_agent_ids),
        max_uses_per_hour: form.max_uses_per_hour || 60,
      };
      if (form.expires_days && parseInt(form.expires_days) > 0) {
        body.expires_at = new Date(Date.now() + parseInt(form.expires_days) * 86400000).toISOString();
      }
      await api.addCredential(body);
      setShowDialog(false);
      setForm({ ...emptyForm });
      toast.success(`Credential "${form.service_name}" encrypted and stored`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const openAdd = (type) => { setForm({ ...emptyForm, credential_type: type }); setShowDialog(true); };

  const suspendCred = async (c) => {
    try { await api.suspendCredential(c.credential_id); toast.success(`${c.service_name} suspended`); load(); } catch (e) { toast.error(e.message); }
  };
  const activateCred = async (c) => {
    try { await api.activateCredential(c.credential_id); toast.success(`${c.service_name} activated`); load(); } catch (e) { toast.error(e.message); }
  };
  const deleteCred = async (c) => {
    if (!confirm(`Delete ${c.service_name}?`)) return;
    try { await api.deleteCredential(c.credential_id); toast.success(`${c.service_name} deleted`); load(); } catch (e) { toast.error(e.message); }
  };

  const filtered = creds.filter(c => !filter || c.credential_type === filter);
  const activeCount = creds.filter(c => c.status === 'active').length;
  const suspendedCount = creds.filter(c => c.status === 'suspended').length;
  const expiredCount = creds.filter(c => c.status === 'expired').length;
  const expiringCount = creds.filter(c => c.expiry_warning != null).length;
  const noAgentLimit = creds.filter(c => c.status === 'active' && (!c.allowed_agent_ids || c.allowed_agent_ids.length === 0)).length;
  const autoLockMin = Math.ceil((vaultStatus.auto_lock_remaining || 0) / 60000);

  const inputCls = "w-full px-3 py-2 bg-input-bg border border-border-2 rounded text-sm text-text placeholder-text-muted focus:outline-none focus:border-primary";

  return (
    <div>
      {/* Security Status Panel */}
      <div className="bg-bg2 border border-separator rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{'\u{1F6E1}'}</span>
            <div>
              <div className="text-sm font-semibold flex items-center gap-2">
                Credential Vault
                <span className="px-2 py-0.5 bg-success/10 text-success text-[10px] font-semibold rounded-full">Unlocked</span>
              </div>
              <div className="text-[11px] text-text-muted">AES-256-GCM + PBKDF2-SHA512 | {autoLockMin > 0 ? `Auto-locks in ${autoLockMin} min` : 'Auto-locking soon'}</div>
            </div>
          </div>
          <button onClick={handleLock} className="px-3 py-1.5 bg-bg3 text-text-dim border border-border-2 rounded text-xs hover:bg-bg4 flex items-center gap-1.5">
            {'\u{1F512}'} Lock
          </button>
        </div>
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-bg border border-separator rounded p-2.5 text-center">
            <div className="text-lg font-bold text-success">{activeCount}</div>
            <div className="text-[10px] text-text-muted">Active</div>
          </div>
          <div className="bg-bg border border-separator rounded p-2.5 text-center">
            <div className="text-lg font-bold text-warning">{suspendedCount}</div>
            <div className="text-[10px] text-text-muted">Suspended</div>
          </div>
          <div className="bg-bg border border-separator rounded p-2.5 text-center">
            <div className="text-lg font-bold text-error">{expiredCount}</div>
            <div className="text-[10px] text-text-muted">Expired</div>
          </div>
          <div className="bg-bg border border-separator rounded p-2.5 text-center">
            <div className={`text-lg font-bold ${expiringCount > 0 ? 'text-warning' : 'text-text-dim'}`}>{expiringCount}</div>
            <div className="text-[10px] text-text-muted">Expiring Soon</div>
          </div>
          <div className="bg-bg border border-separator rounded p-2.5 text-center">
            <div className={`text-lg font-bold ${noAgentLimit > 0 ? 'text-warning' : 'text-text-dim'}`}>{noAgentLimit}</div>
            <div className="text-[10px] text-text-muted">No Agent Limit</div>
          </div>
        </div>
        {(expiringCount > 0 || noAgentLimit > 0) && (
          <div className="mt-3 space-y-1">
            {expiringCount > 0 && <div className="text-[11px] text-warning">{'\u26A0'} {expiringCount} credential(s) expiring within 7 days</div>}
            {noAgentLimit > 0 && <div className="text-[11px] text-text-muted">{'\u2139'} {noAgentLimit} credential(s) have no agent access restriction</div>}
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="px-3 py-1.5 bg-input-bg border border-border-2 rounded text-xs text-text focus:outline-none">
            <option value="">All Types</option>
            <option value="oauth">OAuth</option>
            <option value="cookie">Cookie</option>
            <option value="password">Password</option>
            <option value="api_key">API Key</option>
          </select>
          <span className="text-xs text-text-muted">{filtered.length} credential(s)</span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openAdd('oauth')} className="px-3 py-1.5 bg-primary text-white rounded text-xs font-medium hover:bg-primary-dark">+ OAuth</button>
          <button onClick={() => openAdd('cookie')} className="px-3 py-1.5 bg-bg3 text-text-dim border border-border-2 rounded text-xs hover:bg-bg4">+ Cookie</button>
          <button onClick={() => openAdd('password')} className="px-3 py-1.5 bg-bg3 text-text-dim border border-border-2 rounded text-xs hover:bg-bg4">+ Password</button>
          <button onClick={() => openAdd('api_key')} className="px-3 py-1.5 bg-bg3 text-text-dim border border-border-2 rounded text-xs hover:bg-bg4">+ API Key</button>
        </div>
      </div>

      {/* Credential Table */}
      <div className="bg-bg2 border border-separator rounded-lg overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Type</th>
              <th>Service</th>
              <th>Allowed Agents</th>
              <th>Uses</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-text-muted py-10">No credentials</td></tr>
            )}
            {filtered.map(c => (
              <tr key={c.credential_id} className="cursor-pointer" onClick={() => setSelected(c)}>
                <td><code className="font-mono text-xs text-cyan">{c.credential_id}</code></td>
                <td><TypeBadge type={c.credential_type} /></td>
                <td className="font-medium">
                  {c.service_name}
                  <ExpiryBadge cred={c} />
                </td>
                <td className="text-text-dim text-xs">{c.allowed_agent_ids?.length > 0 ? c.allowed_agent_ids.join(', ') : 'All'}</td>
                <td className="font-mono text-xs text-text-dim">{c.total_uses || 0}</td>
                <td><Badge status={c.status} /></td>
                <td onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1.5">
                    {c.status === 'active' && (
                      <button onClick={() => suspendCred(c)} className="px-2 py-1 text-xs bg-warning/10 text-warning rounded hover:bg-warning/20">Suspend</button>
                    )}
                    {c.status === 'suspended' && (
                      <button onClick={() => activateCred(c)} className="px-2 py-1 text-xs bg-success/10 text-success rounded hover:bg-success/20">Activate</button>
                    )}
                    <button onClick={() => deleteCred(c)} className="px-2 py-1 text-xs bg-error/10 text-error rounded hover:bg-error/20">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Credential Detail Modal */}
      {selected && (
        <CredentialDetail cred={selected} audit={audit} onClose={() => setSelected(null)} toast={toast} />
      )}

      {/* Add Credential Dialog */}
      {showDialog && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50" onClick={() => setShowDialog(false)}>
          <div className="bg-bg2 border border-separator rounded-lg p-6 w-[500px] max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold">Add Credential</h3>
              <button onClick={() => setShowDialog(false)} className="text-text-muted hover:text-text text-lg">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-dim mb-1.5">Service Name</label>
                <input placeholder="gmail, github, notion..." value={form.service_name} onChange={e => setForm({ ...form, service_name: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-dim mb-1.5">Credential Type</label>
                <select value={form.credential_type} onChange={e => setForm({ ...form, credential_type: e.target.value })} className={inputCls}>
                  <option value="oauth">OAuth</option>
                  <option value="api_key">API Key</option>
                  <option value="cookie">Cookie</option>
                  <option value="password">Password</option>
                </select>
              </div>

              {form.credential_type === 'oauth' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Quick Template</label>
                    <select value={form.preset} onChange={e => {
                      const p = oauthPresets.find(x => x.id === e.target.value);
                      if (p && p.id) {
                        setForm({ ...form, preset: p.id, service_name: p.service_name, token_url: p.token_url || '', oauth_scopes: p.oauth_scopes || '' });
                      } else {
                        setForm({ ...form, preset: '' });
                      }
                    }} className={inputCls}>
                      {oauthPresets.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                    {form.preset && (() => {
                      const p = oauthPresets.find(x => x.id === form.preset);
                      return p?.help ? <div className="mt-2 px-3 py-2 bg-primary/5 border border-primary/20 rounded text-[11px] text-text-dim leading-relaxed">{p.help}</div> : null;
                    })()}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Access Token</label>
                    <input placeholder={oauthPresets.find(x => x.id === form.preset)?.placeholder_token || 'gho_xxxx / ya29.xxxx'} value={form.access_token} onChange={e => setForm({ ...form, access_token: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Refresh Token <span className="text-text-muted font-normal">(optional, for auto-refresh)</span></label>
                    <input placeholder="For automatic token refresh on expiry" value={form.refresh_token} onChange={e => setForm({ ...form, refresh_token: e.target.value })} className={inputCls} />
                  </div>
                  {(form.preset ? oauthPresets.find(x => x.id === form.preset)?.needs_client : false) && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-text-dim mb-1.5">Client ID</label>
                        <input placeholder="OAuth Client ID" value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-dim mb-1.5">Client Secret</label>
                        <input type="password" placeholder="OAuth Client Secret" value={form.client_secret} onChange={e => setForm({ ...form, client_secret: e.target.value })} className={inputCls} />
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Scopes <span className="text-text-muted font-normal">(comma-separated)</span></label>
                    <input placeholder="repo, read:user, ..." value={form.oauth_scopes} onChange={e => setForm({ ...form, oauth_scopes: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Token URL <span className="text-text-muted font-normal">(optional)</span></label>
                    <input placeholder="https://oauth2.googleapis.com/token" value={form.token_url} onChange={e => setForm({ ...form, token_url: e.target.value })} className={inputCls} />
                  </div>
                </>
              )}
              {form.credential_type === 'api_key' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">API Key</label>
                    <input placeholder="sk-xxxx" value={form.api_key} onChange={e => setForm({ ...form, api_key: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">API Secret <span className="text-text-muted font-normal">(optional)</span></label>
                    <input placeholder="For dual-key authentication" value={form.api_secret} onChange={e => setForm({ ...form, api_secret: e.target.value })} className={inputCls} />
                  </div>
                </>
              )}
              {form.credential_type === 'cookie' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Target Domain</label>
                    <input placeholder=".notion.so, .github.com" value={form.cookie_domain} onChange={e => setForm({ ...form, cookie_domain: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Cookie Path</label>
                    <input placeholder="/ (default: all paths)" value={form.cookie_path} onChange={e => setForm({ ...form, cookie_path: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Cookie Content</label>
                    <textarea placeholder={'Paste browser cookie string, e.g.:\nsession_id=abc123; user_token=xyz789'} value={form.cookie_value}
                      onChange={e => setForm({ ...form, cookie_value: e.target.value })} rows={3} className={inputCls + ' font-mono'} />
                  </div>
                </>
              )}
              {form.credential_type === 'password' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Username</label>
                    <input placeholder="Login username or email" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Password</label>
                    <input type="password" placeholder="Login password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className={inputCls} />
                  </div>
                </>
              )}

              <div className="pt-2 border-t border-separator">
                <div className="text-xs font-semibold text-text-dim mb-3">Security Settings</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Validity <span className="text-text-muted font-normal">(days, leave empty = never expires)</span></label>
                    <input type="number" min={1} max={3650} placeholder="e.g. 30, 90, 365" value={form.expires_days} onChange={e => setForm({ ...form, expires_days: e.target.value })} className={inputCls + ' w-32'} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Allowed Agents <span className="text-text-muted font-normal">(comma-separated Agent IDs, empty = all)</span></label>
                    <input placeholder="agt_xxxx, agt_yyyy" value={form.allowed_agent_ids} onChange={e => setForm({ ...form, allowed_agent_ids: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Max Uses Per Hour</label>
                    <input type="number" min={1} max={9999} value={form.max_uses_per_hour} onChange={e => setForm({ ...form, max_uses_per_hour: parseInt(e.target.value) || 60 })} className={inputCls + ' w-32'} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-separator">
              <button onClick={() => setShowDialog(false)} className="px-4 py-2 text-text-dim text-sm hover:text-text">Cancel</button>
              <button onClick={add} className="px-4 py-2 bg-primary text-white rounded text-sm font-medium hover:bg-primary-dark">Encrypt & Store</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
