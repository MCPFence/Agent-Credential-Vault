import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

function Badge({ status }) {
  const c = {
    active: 'bg-success/10 text-success',
    disabled: 'bg-bg4 text-text-muted',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${c[status] || 'bg-bg4 text-text-dim'}`}>{status}</span>;
}

const emptyRule = () => ({ effect: 'deny', description: '', scopes: '', priority: 0, principal_types: '', agent_types: '', task_types: '' });

function RuleEditor({ rules, onChange }) {
  const addRule = () => onChange([...rules, emptyRule()]);
  const removeRule = (i) => onChange(rules.filter((_, idx) => idx !== i));
  const updateRule = (i, field, value) => {
    const next = [...rules];
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  };

  const inputCls = "w-full px-2 py-1.5 bg-input-bg border border-border-2 rounded text-xs text-text placeholder-text-muted focus:outline-none focus:border-primary";

  return (
    <div className="space-y-3">
      {rules.map((r, i) => (
        <div key={i} className={`p-3 rounded border ${r.effect === 'deny' ? 'border-error/30 bg-error/5' : 'border-success/30 bg-success/5'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-text-dim">Rule #{i + 1}</span>
            <button onClick={() => removeRule(i)} className="text-error text-xs hover:text-error/80">&times; Remove</button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Effect</label>
              <select value={r.effect} onChange={e => updateRule(i, 'effect', e.target.value)} className={inputCls}>
                <option value="deny">Deny</option>
                <option value="allow">Allow</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Priority</label>
              <input type="number" value={r.priority} onChange={e => updateRule(i, 'priority', parseInt(e.target.value) || 0)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Description</label>
              <input placeholder="Rule description" value={r.description} onChange={e => updateRule(i, 'description', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Scopes <span className="text-text-muted">(comma-separated, * wildcard)</span></label>
              <input placeholder="deploy:*, read:email" value={r.scopes} onChange={e => updateRule(i, 'scopes', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Task Types <span className="text-text-muted">(comma-separated)</span></label>
              <input placeholder="email_*, deploy_*" value={r.task_types} onChange={e => updateRule(i, 'task_types', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Principal Types <span className="text-text-muted">(comma-separated)</span></label>
              <input placeholder="user, enterprise" value={r.principal_types} onChange={e => updateRule(i, 'principal_types', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-[10px] text-text-muted mb-0.5">Agent Types <span className="text-text-muted">(comma-separated)</span></label>
              <input placeholder="assistive, autonomous" value={r.agent_types} onChange={e => updateRule(i, 'agent_types', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
      ))}
      <button onClick={addRule} className="w-full py-2 border border-dashed border-border-2 rounded text-xs text-text-dim hover:text-text hover:border-primary transition">
        + Add Rule
      </button>
    </div>
  );
}

function formRulesToAPI(rules) {
  return rules.map(r => ({
    effect: r.effect,
    description: r.description,
    priority: r.priority || 0,
    scopes: splitTrim(r.scopes),
    task_types: splitTrim(r.task_types),
    principal_types: splitTrim(r.principal_types),
    agent_types: splitTrim(r.agent_types),
  }));
}

function apiRulesToForm(rules) {
  return rules.map(r => ({
    effect: r.effect || 'deny',
    description: r.description || '',
    priority: r.priority || 0,
    scopes: (r.scopes || []).join(', '),
    task_types: (r.task_types || []).join(', '),
    principal_types: (r.principal_types || []).join(', '),
    agent_types: (r.agent_types || []).join(', '),
  }));
}

function splitTrim(s) {
  if (!s) return [];
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

export default function PoliciesTab() {
  const [policies, setPolicies] = useState([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', rules: [] });

  const [evalForm, setEvalForm] = useState({ principal_type: 'user', agent_type: 'assistive', scopes: '', task_type: '' });
  const [evalResult, setEvalResult] = useState(null);

  const load = () => api.getPolicies().then(setPolicies);
  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);
  const toast = useToast();

  const save = async () => {
    if (!form.name) return;
    const data = { name: form.name, description: form.description, rules: formRulesToAPI(form.rules) };
    try {
      if (editing) {
        await api.updatePolicy(editing, data);
        toast.success('Policy updated');
      } else {
        await api.addPolicy(data);
        toast.success('Policy created');
      }
      setShowDialog(false);
      setEditing(null);
      setForm({ name: '', description: '', rules: [] });
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const openEdit = (p) => {
    setEditing(p.policy_set_id);
    setForm({ name: p.name, description: p.description, rules: apiRulesToForm(p.rules) });
    setShowDialog(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', rules: [
      { effect: 'deny', description: 'Block deployments', scopes: 'deploy:*', priority: 10, principal_types: '', agent_types: '', task_types: '' },
      { effect: 'allow', description: 'Allow reads', scopes: 'read:*', priority: 1, principal_types: '', agent_types: '', task_types: '' },
    ]});
    setShowDialog(true);
  };

  const runEval = async () => {
    const scopes = splitTrim(evalForm.scopes);
    const result = await api.evaluatePolicy({
      principal_type: evalForm.principal_type,
      agent_type: evalForm.agent_type,
      requested_scopes: scopes,
      task_type: evalForm.task_type || undefined,
    });
    setEvalResult(result);
  };

  return (
    <div>
      <div className="px-4 py-3 bg-bg3 border border-separator rounded mb-4 text-xs text-text-dim leading-relaxed">
        Cedar-like policy engine: DENY rules match first → ALLOW rules → default deny (fail-closed). Rule conditions support glob pattern matching (e.g. <code className="text-cyan">read:*</code>, <code className="text-cyan">deploy:prod_*</code>).
      </div>

      <div className="flex justify-between items-center mb-4">
        <span className="text-xs text-text-muted">{policies.length} policy(ies)</span>
        <button onClick={openCreate} className="px-4 py-2 bg-primary text-white rounded text-[13px] font-medium hover:bg-primary-dark transition">
          + Create Policy
        </button>
      </div>

      <div className="bg-bg2 border border-separator rounded-lg overflow-hidden mb-6">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Description</th>
              <th>Rules</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {policies.length === 0 && (
              <tr><td colSpan={6} className="text-center text-text-muted py-10">No policies</td></tr>
            )}
            {policies.map(p => (
              <tr key={p.policy_set_id}>
                <td><code className="font-mono text-xs text-cyan">{p.policy_set_id}</code></td>
                <td className="font-medium">{p.name}</td>
                <td className="text-text-dim text-xs">{p.description || '—'}</td>
                <td className="font-mono text-xs text-text-dim">
                  {p.rules.length}
                  <span className="ml-2 text-[10px]">
                    (<span className="text-error">{p.rules.filter(r => r.effect === 'deny').length}D</span>
                    /<span className="text-success">{p.rules.filter(r => r.effect === 'allow').length}A</span>)
                  </span>
                </td>
                <td><Badge status={p.status} /></td>
                <td>
                  <div className="flex gap-1.5">
                    <button onClick={() => openEdit(p)} className="px-2 py-1 text-xs bg-primary/10 text-primary rounded hover:bg-primary/20">Edit</button>
                    <button onClick={() => { if (confirm(`Delete ${p.name}?`)) api.deletePolicy(p.policy_set_id).then(() => { toast.success('Deleted'); load(); }).catch(e => toast.error(e.message)); }} className="px-2 py-1 text-xs bg-error/10 text-error rounded hover:bg-error/20">Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dry-run evaluation */}
      <div className="bg-bg2 border border-separator rounded-lg p-5">
        <h3 className="text-sm font-semibold mb-4 text-text">Policy Dry Run</h3>
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div>
            <label className="block text-[11px] font-semibold text-text-dim mb-1">Principal Type</label>
            <select value={evalForm.principal_type} onChange={e => setEvalForm({...evalForm, principal_type: e.target.value})}
              className="w-full px-2 py-1.5 bg-input-bg border border-border-2 rounded text-xs text-text focus:outline-none">
              <option value="user">User</option>
              <option value="enterprise">Enterprise</option>
              <option value="merchant">Merchant</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-dim mb-1">Agent Type</label>
            <select value={evalForm.agent_type} onChange={e => setEvalForm({...evalForm, agent_type: e.target.value})}
              className="w-full px-2 py-1.5 bg-input-bg border border-border-2 rounded text-xs text-text focus:outline-none">
              <option value="assistive">Assistive</option>
              <option value="autonomous">Autonomous</option>
              <option value="tool">Tool</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-dim mb-1">Scopes (comma-separated)</label>
            <input placeholder="read:email, deploy:prod" value={evalForm.scopes}
              onChange={e => setEvalForm({...evalForm, scopes: e.target.value})}
              className="w-full px-2 py-1.5 bg-input-bg border border-border-2 rounded text-xs text-text placeholder-text-muted focus:outline-none" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-text-dim mb-1">Task Type</label>
            <input placeholder="email_summary" value={evalForm.task_type}
              onChange={e => setEvalForm({...evalForm, task_type: e.target.value})}
              className="w-full px-2 py-1.5 bg-input-bg border border-border-2 rounded text-xs text-text placeholder-text-muted focus:outline-none" />
          </div>
        </div>
        <button onClick={runEval} className="px-4 py-2 bg-cyan/10 text-cyan rounded text-xs font-semibold hover:bg-cyan/20 transition">
          Evaluate
        </button>

        {evalResult && (
          <div className="mt-4 p-4 bg-bg3 rounded border border-separator">
            <div className="mb-3">
              <span className="text-xs font-semibold text-text-dim">Granted Scopes:</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {evalResult.granted_scopes.length === 0 && <span className="text-text-muted text-xs">(none)</span>}
                {evalResult.granted_scopes.map(s => (
                  <span key={s} className="px-2 py-0.5 bg-success/10 text-success text-[11px] font-mono rounded">{s}</span>
                ))}
              </div>
            </div>
            <div className="mb-3">
              <span className="text-xs font-semibold text-text-dim">Denied Scopes:</span>
              <div className="mt-1 space-y-1">
                {evalResult.denied_scopes.length === 0 && <span className="text-text-muted text-xs">(none)</span>}
                {evalResult.denied_scopes.map((d, i) => (
                  <div key={i} className="text-xs">
                    <span className="px-2 py-0.5 bg-error/10 text-error font-mono rounded">{d.scope}</span>
                    <span className="text-text-muted ml-2">— {d.reason}</span>
                  </div>
                ))}
              </div>
            </div>
            {evalResult.warnings.length > 0 && (
              <div>
                <span className="text-xs font-semibold text-text-dim">Warnings:</span>
                {evalResult.warnings.map((w, i) => (
                  <div key={i} className="text-xs text-warning mt-0.5">{w}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showDialog && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50" onClick={() => { setShowDialog(false); setEditing(null); }}>
          <div className="bg-bg2 border border-separator rounded-lg p-6 w-[650px] max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold">{editing ? 'Edit Policy' : 'Create Policy'}</h3>
              <button onClick={() => { setShowDialog(false); setEditing(null); }} className="text-text-muted hover:text-text text-lg">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-dim mb-1.5">Policy Name</label>
                <input placeholder="e.g. Production Restrictions" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full px-3 py-2 bg-input-bg border border-border-2 rounded text-sm text-text placeholder-text-muted focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-dim mb-1.5">Description</label>
                <input placeholder="Optional description" value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  className="w-full px-3 py-2 bg-input-bg border border-border-2 rounded text-sm text-text placeholder-text-muted focus:outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-dim mb-2">Policy Rules</label>
                <RuleEditor rules={form.rules} onChange={rules => setForm({...form, rules})} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-separator">
              <button onClick={() => { setShowDialog(false); setEditing(null); }} className="px-4 py-2 text-text-dim text-sm hover:text-text">Cancel</button>
              <button onClick={save} className="px-4 py-2 bg-primary text-white rounded text-sm font-medium hover:bg-primary-dark">{editing ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
