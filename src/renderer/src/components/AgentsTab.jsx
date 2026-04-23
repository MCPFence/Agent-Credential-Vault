import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

function Badge({ status }) {
  const c = {
    active: 'bg-success/10 text-success',
    pending: 'bg-warning/10 text-warning',
    suspended: 'bg-error/10 text-error',
    revoked: 'bg-error/10 text-error',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${c[status] || 'bg-bg4 text-text-dim'}`}>{status}</span>;
}

export default function AgentsTab() {
  const [agents, setAgents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [audit, setAudit] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [bindTarget, setBindTarget] = useState(null);
  const [claimToken, setClaimToken] = useState('');
  const [selected, setSelected] = useState(null);
  const [editCaps, setEditCaps] = useState(null);
  const [vaultCreds, setVaultCreds] = useState([]);
  const [vaultBindings, setVaultBindings] = useState({});
  const [form, setForm] = useState({ name: '', description: '', agent_type: 'assistive', allowed_tools: '', allowed_audiences: '', max_delegation_depth: 1 });
  const toast = useToast();

  const load = async () => {
    const [a, t, au] = await Promise.all([api.getAgents(), api.getTasks(), api.getAudit()]);
    setAgents(a);
    setTasks(t);
    setAudit(au);
  };
  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const splitTrim = (s) => s ? s.split(',').map(x => x.trim()).filter(Boolean) : [];

  const register = async () => {
    if (!form.name) return;
    try {
      await api.registerAgent({
        name: form.name,
        public_key: 'placeholder',
        description: form.description,
        agent_type: form.agent_type,
        capabilities: {
          allowed_tools: splitTrim(form.allowed_tools),
          allowed_audiences: splitTrim(form.allowed_audiences),
          max_delegation_depth: form.max_delegation_depth,
        },
      });
      setShowDialog(false);
      setForm({ name: '', description: '', agent_type: 'assistive', allowed_tools: '', allowed_audiences: '', max_delegation_depth: 1 });
      toast.success(`Agent "${form.name}" registered`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const bind = async (a) => {
    setBindTarget(a);
    setClaimToken('');
  };
  const confirmBind = async () => {
    if (!claimToken.trim()) return;
    try {
      await api.bindAgent(bindTarget.agent_id, claimToken.trim());
      toast.success(`${bindTarget.name} bound`);
      setBindTarget(null);
      setClaimToken('');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const suspend = async (a) => {
    try { await api.suspendAgent(a.agent_id); toast.success(`${a.name} suspended`); load(); } catch (e) { toast.error(e.message); }
  };
  const activate = async (a) => {
    try { await api.activateAgent(a.agent_id); toast.success(`${a.name} activated`); load(); } catch (e) { toast.error(e.message); }
  };
  const del = async (a) => {
    if (!confirm(`Delete ${a.name}?`)) return;
    try { await api.deleteAgent(a.agent_id); toast.success(`${a.name} deleted`); load(); setSelected(null); } catch (e) { toast.error(e.message); }
  };

  const startEditCaps = async (a) => {
    setEditCaps({
      allowed_tools: (a.capabilities?.allowed_tools || []).join(', '),
      allowed_audiences: (a.capabilities?.allowed_audiences || []).join(', '),
      max_delegation_depth: a.capabilities?.max_delegation_depth ?? 1,
    });
    try {
      const creds = await api.getVault();
      setVaultCreds(creds);
      const bindings = {};
      for (const c of creds) {
        bindings[c.credential_id] = !c.allowed_agent_ids?.length || c.allowed_agent_ids.includes(a.agent_id);
      }
      setVaultBindings(bindings);
    } catch (e) {
      setVaultCreds([]);
      setVaultBindings({});
    }
  };
  const saveCaps = async () => {
    if (!selected || !editCaps) return;
    try {
      await api.updateCapabilities(selected.agent_id, {
        allowed_tools: splitTrim(editCaps.allowed_tools),
        allowed_audiences: splitTrim(editCaps.allowed_audiences),
        max_delegation_depth: editCaps.max_delegation_depth,
      });

      for (const cred of vaultCreds) {
        const wasOpen = !cred.allowed_agent_ids?.length;
        const wasBound = wasOpen || cred.allowed_agent_ids.includes(selected.agent_id);
        const nowBound = !!vaultBindings[cred.credential_id];

        if (wasBound === nowBound) continue;

        let newList;
        if (wasOpen && !nowBound) {
          newList = agents
            .filter(a => a.agent_id !== selected.agent_id && a.status === 'active')
            .map(a => a.agent_id);
        } else if (!wasOpen && nowBound) {
          newList = [...(cred.allowed_agent_ids || []), selected.agent_id];
        } else if (!wasOpen && !nowBound) {
          newList = (cred.allowed_agent_ids || []).filter(id => id !== selected.agent_id);
        } else {
          continue;
        }
        await api.updateCredential(cred.credential_id, { allowed_agent_ids: newList });
      }

      toast.success('Capabilities and credential bindings updated');
      setEditCaps(null);
      setVaultCreds([]);
      setVaultBindings({});
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const agentTasks = selected ? tasks.filter(t => t.agent_id === selected.agent_id) : [];
  const agentAudit = selected ? audit.filter(e => e.agent_id === selected.agent_id).slice(0, 15) : [];

  const inputCls = "w-full px-3 py-2 bg-input-bg border border-border-2 rounded text-sm text-text placeholder-text-muted focus:outline-none focus:border-primary";

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="text-xs text-text-muted">{agents.length} agent(s)</div>
        <button onClick={() => setShowDialog(true)} className="px-4 py-2 bg-primary text-white rounded text-[13px] font-medium hover:bg-primary-dark transition">
          + Register Agent
        </button>
      </div>

      <div className="bg-bg2 border border-separator rounded-lg overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>Agent ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Owner</th>
              <th>Capabilities</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 && (
              <tr><td colSpan={7} className="text-center text-text-muted py-10">No agents</td></tr>
            )}
            {agents.map(a => (
              <tr key={a.agent_id} className="cursor-pointer" onClick={() => { setSelected(a); setEditCaps(null); }}>
                <td><code className="font-mono text-xs text-cyan">{a.agent_id}</code></td>
                <td className="font-medium">{a.name}</td>
                <td className="text-text-dim">{a.agent_type || 'agent'}</td>
                <td className="text-text-dim">{a.owner_id || <span className="text-text-muted italic">Unbound</span>}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {(a.capabilities?.allowed_tools || []).slice(0, 3).map(t => (
                      <span key={t} className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-mono rounded">{t}</span>
                    ))}
                    {(a.capabilities?.allowed_tools || []).length > 3 && <span className="text-[10px] text-text-muted">+{a.capabilities.allowed_tools.length - 3}</span>}
                    {!(a.capabilities?.allowed_tools || []).length && <span className="text-[10px] text-text-muted">—</span>}
                  </div>
                </td>
                <td><Badge status={a.status} /></td>
                <td onClick={e => e.stopPropagation()}>
                  <div className="flex gap-1.5">
                    {a.status === 'pending' && (
                      <button onClick={() => bind(a)} className="px-2 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20">Bind</button>
                    )}
                    {a.status === 'active' && (
                      <button onClick={() => suspend(a)} className="px-2 py-1 text-xs bg-warning/10 text-warning rounded hover:bg-warning/20">Suspend</button>
                    )}
                    {a.status === 'suspended' && (
                      <button onClick={() => activate(a)} className="px-2 py-1 text-xs bg-success/10 text-success rounded hover:bg-success/20">Activate</button>
                    )}
                    <button onClick={() => del(a)} className="px-2 py-1 text-xs bg-error/10 text-error rounded hover:bg-error/20">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Agent Detail Panel */}
      {selected && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-bg2 border border-separator rounded-lg p-6 w-[600px] max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-semibold">{selected.name}</h3>
                <Badge status={selected.status} />
              </div>
              <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text text-lg">&times;</button>
            </div>

            <div className="bg-bg border border-separator rounded p-4 space-y-2 text-[13px] mb-4">
              <Row label="Agent ID" value={selected.agent_id} mono />
              <Row label="Type" value={selected.agent_type || 'agent'} />
              <Row label="Owner" value={selected.owner_id || 'Unbound'} />
              {selected.description && <Row label="Description" value={selected.description} />}
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-primary font-semibold text-xs">Capabilities</h4>
                {selected.status !== 'pending' && !editCaps && (
                  <button onClick={() => startEditCaps(selected)} className="px-2 py-1 text-[11px] bg-primary/10 text-primary rounded hover:bg-primary/20">Edit</button>
                )}
              </div>
              {editCaps ? (
                <div className="bg-bg border border-primary/30 rounded p-3 space-y-3 text-[13px]">
                  <div>
                    <label className="block text-text-muted text-xs mb-1">Allowed Tools <span className="text-text-muted font-normal">(comma-separated, * wildcard)</span></label>
                    <input value={editCaps.allowed_tools} onChange={e => setEditCaps({...editCaps, allowed_tools: e.target.value})} className={inputCls} placeholder="read:*, write:own_*, chat:*" />
                  </div>
                  <div>
                    <label className="block text-text-muted text-xs mb-1">Allowed Audiences <span className="text-text-muted font-normal">(comma-separated)</span></label>
                    <input value={editCaps.allowed_audiences} onChange={e => setEditCaps({...editCaps, allowed_audiences: e.target.value})} className={inputCls} placeholder="*.google.com, *.slack.com" />
                  </div>
                  <div>
                    <label className="block text-text-muted text-xs mb-1">Max Delegation Depth</label>
                    <input type="number" min={0} max={5} value={editCaps.max_delegation_depth} onChange={e => setEditCaps({...editCaps, max_delegation_depth: parseInt(e.target.value) || 0})} className={inputCls + ' w-24'} />
                  </div>
                  {/* Vault credential bindings */}
                  {vaultCreds.length > 0 && (
                    <div className="pt-3 mt-2 border-t border-separator">
                      <label className="block text-text-muted text-xs mb-2 font-semibold">Vault Credential Bindings <span className="font-normal">(credentials this agent can use)</span></label>
                      <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                        {vaultCreds.filter(c => c.status === 'active').map(c => {
                          const typeIcons = { oauth: '\uD83D\uDD17', cookie: '\uD83C\uDF6A', password: '\uD83D\uDD10', api_key: '\uD83D\uDD11' };
                          const open = !c.allowed_agent_ids?.length;
                          return (
                            <label key={c.credential_id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!vaultBindings[c.credential_id]}
                                onChange={e => setVaultBindings({...vaultBindings, [c.credential_id]: e.target.checked})}
                                className="accent-primary"
                              />
                              <span className="text-sm">{typeIcons[c.credential_type] || ''}</span>
                              <span className="text-xs font-medium text-text">{c.service_name}</span>
                              <code className="text-[10px] font-mono text-text-muted">{c.credential_id}</code>
                              {open && <span className="text-[9px] px-1 py-0.5 bg-warning/10 text-warning rounded">Open</span>}
                            </label>
                          );
                        })}
                      </div>
                      {vaultCreds.filter(c => c.status === 'active').length === 0 && (
                        <span className="text-text-muted text-xs">No active credentials in vault</span>
                      )}
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setEditCaps(null)} className="px-3 py-1.5 text-text-dim text-xs hover:text-text">Cancel</button>
                    <button onClick={saveCaps} className="px-3 py-1.5 bg-primary text-white rounded text-xs font-medium hover:bg-primary-dark">Save</button>
                  </div>
                </div>
              ) : (
                <div className="bg-bg border border-separator rounded p-3 space-y-2 text-[13px]">
                  <div>
                    <span className="text-text-muted text-xs">Allowed Tools:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(selected.capabilities?.allowed_tools || []).map(t => (
                        <span key={t} className="px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-mono rounded">{t}</span>
                      ))}
                      {!(selected.capabilities?.allowed_tools || []).length && <span className="text-text-muted text-xs">(not set)</span>}
                    </div>
                  </div>
                  <div>
                    <span className="text-text-muted text-xs">Allowed Audiences:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(selected.capabilities?.allowed_audiences || []).map(t => (
                        <span key={t} className="px-2 py-0.5 bg-cyan/10 text-cyan text-[11px] font-mono rounded">{t}</span>
                      ))}
                      {!(selected.capabilities?.allowed_audiences || []).length && <span className="text-text-muted text-xs">(not set)</span>}
                    </div>
                  </div>
                  <Row label="Max Delegation Depth" value={selected.capabilities?.max_delegation_depth ?? '—'} />
                </div>
              )}
            </div>

            {agentTasks.length > 0 && (
              <div className="mb-4">
                <h4 className="text-success font-semibold text-xs mb-2">Related Tasks ({agentTasks.length})</h4>
                <div className="space-y-1">
                  {agentTasks.slice(0, 5).map(t => (
                    <div key={t.task_id} className="flex items-center gap-2 text-xs">
                      <code className="font-mono text-cyan">{t.task_id}</code>
                      <span className="text-text-dim">{t.task_type}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        t.status === 'active' ? 'bg-success/10 text-success' :
                        t.status === 'auth_required' ? 'bg-warning/10 text-warning' :
                        'bg-bg4 text-text-muted'
                      }`}>{t.status}</span>
                    </div>
                  ))}
                  {agentTasks.length > 5 && <span className="text-[10px] text-text-muted">...and {agentTasks.length - 5} more</span>}
                </div>
              </div>
            )}

            <div>
              <h4 className="text-purple font-semibold text-xs mb-2">Recent Audit</h4>
              {agentAudit.length === 0 && <span className="text-text-muted text-xs">No activity</span>}
              {agentAudit.map((e, i) => (
                <div key={i} className="text-xs font-mono text-text-dim py-0.5">
                  {new Date(e.timestamp).toLocaleTimeString()} &nbsp; {e.action} &nbsp; {e.detail}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bind Dialog */}
      {bindTarget && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50" onClick={() => setBindTarget(null)}>
          <div className="bg-bg2 border border-separator rounded-lg p-6 w-[450px] shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold">Bind Agent</h3>
              <button onClick={() => setBindTarget(null)} className="text-text-muted hover:text-text text-lg">&times;</button>
            </div>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-text-muted text-xs">Agent:</span>
                <span className="font-medium text-sm">{bindTarget.name}</span>
                <code className="font-mono text-[11px] text-cyan">{bindTarget.agent_id}</code>
              </div>
              <label className="block text-xs font-semibold text-text-dim mb-1.5">Claim Token</label>
              <input
                placeholder="Paste the claim_token from agent registration"
                value={claimToken}
                onChange={e => setClaimToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmBind()}
                className={inputCls}
                autoFocus
              />
              <p className="text-[11px] text-text-muted mt-1.5">The agent outputs a claim_token during registration. Paste it here to complete binding.</p>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t border-separator">
              <button onClick={() => setBindTarget(null)} className="px-4 py-2 text-text-dim text-sm hover:text-text">Cancel</button>
              <button onClick={confirmBind} className="px-4 py-2 bg-primary text-white rounded text-sm font-medium hover:bg-primary-dark">Confirm Bind</button>
            </div>
          </div>
        </div>
      )}

      {/* Register Dialog */}
      {showDialog && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50" onClick={() => setShowDialog(false)}>
          <div className="bg-bg2 border border-separator rounded-lg p-6 w-[550px] max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold">Register New Agent</h3>
              <button onClick={() => setShowDialog(false)} className="text-text-muted hover:text-text text-lg">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-dim mb-1.5">Agent Name</label>
                <input placeholder="e.g. doc-summarizer" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-dim mb-1.5">Description</label>
                <input placeholder="Optional description" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-dim mb-1.5">Agent Type</label>
                <select value={form.agent_type} onChange={e => setForm({...form, agent_type: e.target.value})} className={inputCls}>
                  <option value="assistive">Assistive</option>
                  <option value="autonomous">Autonomous</option>
                  <option value="tool">Tool</option>
                </select>
              </div>
              <div className="pt-2 border-t border-separator">
                <div className="text-xs font-semibold text-text-dim mb-3">Capabilities</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Allowed Tools <span className="text-text-muted font-normal">(comma-separated, * wildcard)</span></label>
                    <input placeholder="read:email, chat:*, write:own_*" value={form.allowed_tools} onChange={e => setForm({...form, allowed_tools: e.target.value})} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Allowed Audiences <span className="text-text-muted font-normal">(comma-separated)</span></label>
                    <input placeholder="*.google.com, *.slack.com" value={form.allowed_audiences} onChange={e => setForm({...form, allowed_audiences: e.target.value})} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-dim mb-1.5">Max Delegation Depth</label>
                    <input type="number" min={0} max={5} value={form.max_delegation_depth} onChange={e => setForm({...form, max_delegation_depth: parseInt(e.target.value) || 0})} className={inputCls + ' w-24'} />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-separator">
              <button onClick={() => setShowDialog(false)} className="px-4 py-2 text-text-dim text-sm hover:text-text">Cancel</button>
              <button onClick={register} className="px-4 py-2 bg-primary text-white rounded text-sm font-medium hover:bg-primary-dark">Register</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }) {
  return (
    <div className="flex">
      <span className="text-text-muted w-28 shrink-0 text-xs">{label}:</span>
      <span className={mono ? 'font-mono text-xs text-cyan' : 'text-sm'}>{value}</span>
    </div>
  );
}
