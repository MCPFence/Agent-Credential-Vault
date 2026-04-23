import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

function Badge({ status }) {
  const c = {
    active: 'bg-success/10 text-success',
    auth_required: 'bg-warning/10 text-warning',
    completed: 'bg-bg4 text-text-muted',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold ${c[status] || 'bg-bg4 text-text-dim'}`}>{status}</span>;
}

export default function TasksTab() {
  const [tasks, setTasks] = useState([]);
  const [agents, setAgents] = useState({});
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [audit, setAudit] = useState([]);
  const toast = useToast();

  const load = async () => {
    const [t, a, au] = await Promise.all([api.getTasks(), api.getAgents(), api.getAudit()]);
    setTasks(t);
    const map = {}; a.forEach(ag => { map[ag.agent_id] = ag; }); setAgents(map);
    setAudit(au);
  };
  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const filtered = tasks.filter(t => {
    if (!filter) return true;
    return t.status === filter;
  });

  const approve = async (id) => {
    try { await api.approveTask(id); toast.success('Approved'); load(); } catch (e) { toast.error(e.message); }
  };
  const deny = async (id) => {
    try { await api.denyTask(id); toast.success('Denied'); load(); } catch (e) { toast.error(e.message); }
  };

  const taskAudit = selected ? audit.filter(e => e.resource_id === selected.task_id) : [];

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="px-3 py-1.5 bg-input-bg border border-border-2 rounded text-xs text-text focus:outline-none">
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="auth_required">Auth Required</option>
            <option value="completed">Completed</option>
          </select>
          <span className="text-xs text-text-muted">{filtered.length} task(s)</span>
        </div>
      </div>

      <div className="bg-bg2 border border-separator rounded-lg overflow-hidden">
        <table>
          <thead>
            <tr>
              <th>Task ID</th>
              <th>Agent</th>
              <th>Type</th>
              <th>Scopes</th>
              <th>Tool Calls</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-text-muted py-10">No tasks</td></tr>
            )}
            {filtered.map(t => (
              <tr key={t.task_id} className="cursor-pointer" onClick={() => setSelected(t)}>
                <td><code className="font-mono text-xs text-cyan">{t.task_id}</code></td>
                <td className="text-text-dim">{agents[t.agent_id]?.name || t.agent_id}</td>
                <td className="font-medium">{t.task_type}</td>
                <td>
                  <div className="flex flex-wrap gap-1">
                    {(t.granted_scopes || []).slice(0, 3).map(s => (
                      <span key={s} className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-mono rounded">{s}</span>
                    ))}
                    {(t.granted_scopes || []).length > 3 && <span className="text-[10px] text-text-muted">+{t.granted_scopes.length - 3}</span>}
                  </div>
                </td>
                <td className="text-text-dim font-mono text-xs">{t.tool_calls_used}/{t.tool_call_budget}</td>
                <td><Badge status={t.status} /></td>
                <td>
                  {t.status === 'auth_required' && (
                    <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => approve(t.task_id)} className="px-2 py-1 text-xs bg-success/10 text-success rounded hover:bg-success/20">Approve</button>
                      <button onClick={() => deny(t.task_id)} className="px-2 py-1 text-xs bg-error/10 text-error rounded hover:bg-error/20">Deny</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 modal-backdrop flex items-center justify-center z-50" onClick={() => setSelected(null)}>
          <div className="bg-bg2 border border-separator rounded-lg p-6 w-[600px] max-h-[80vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold">{selected.task_type}</h3>
              <div className="flex items-center gap-3">
                <Badge status={selected.status} />
                <button onClick={() => setSelected(null)} className="text-text-muted hover:text-text text-lg">&times;</button>
              </div>
            </div>

            <div className="bg-bg border border-separator rounded p-4 space-y-2 text-[13px] mb-4">
              <Row label="Task ID" value={selected.task_id} mono />
              <Row label="Agent" value={(agents[selected.agent_id]?.name || '') + ' (' + selected.agent_id + ')'} />
              {selected.description && <Row label="Description" value={selected.description} />}
              <Row label="Created" value={new Date(selected.created_at).toLocaleString()} />
              <Row label="Expires" value={new Date(selected.expires_at).toLocaleString()} />
              <Row label="Tool Calls" value={`${selected.tool_calls_used} / ${selected.tool_call_budget}`} />
            </div>

            <div className="mb-4">
              <h4 className="text-success font-semibold text-xs mb-2">Granted Scopes</h4>
              <div className="flex flex-wrap gap-1">
                {(selected.granted_scopes || []).map(s => (
                  <span key={s} className="px-2 py-0.5 bg-success/10 text-success text-[11px] font-mono rounded">{s}</span>
                ))}
                {!(selected.granted_scopes || []).length && <span className="text-text-muted text-xs">(none)</span>}
              </div>
            </div>

            {(selected.denied_scopes || []).length > 0 && (
              <div className="mb-4">
                <h4 className="text-error font-semibold text-xs mb-2">Denied Scopes</h4>
                {selected.denied_scopes.map((d, i) => (
                  <div key={i} className="text-xs"><code className="text-text-dim font-mono">{d.scope}</code> <span className="text-error">— {d.reason}</span></div>
                ))}
              </div>
            )}

            {selected.status === 'auth_required' && (selected.pending_scopes || []).length > 0 && (
              <div className="mb-4">
                <h4 className="text-warning font-semibold text-xs mb-2">Pending Scopes</h4>
                <div className="flex flex-wrap gap-1 mb-2">
                  {selected.pending_scopes.map(s => (
                    <span key={s} className="px-2 py-0.5 bg-warning/10 text-warning text-[11px] font-mono rounded">{s}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { approve(selected.task_id); setSelected(null); }}
                    className="px-3 py-1.5 bg-primary text-white rounded text-xs font-medium">Approve</button>
                  <button onClick={() => { deny(selected.task_id); setSelected(null); }}
                    className="px-3 py-1.5 bg-error/10 text-error rounded text-xs font-medium">Deny</button>
                </div>
              </div>
            )}

            <div>
              <h4 className="text-primary font-semibold text-xs mb-2">Activity Log</h4>
              {taskAudit.length === 0 && <span className="text-text-muted text-xs">No activity</span>}
              {taskAudit.map((e, i) => (
                <div key={i} className="text-xs font-mono text-text-dim py-0.5">
                  {new Date(e.timestamp).toLocaleTimeString()} &nbsp; {e.action} &nbsp; {e.detail}
                </div>
              ))}
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
      <span className="text-text-muted w-24 shrink-0 text-xs">{label}:</span>
      <span className={mono ? 'font-mono text-xs text-cyan' : 'text-sm'}>{value}</span>
    </div>
  );
}
