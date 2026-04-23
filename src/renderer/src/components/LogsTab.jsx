import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';

const actionColors = {
  register: 'bg-success/10 text-success',
  bind: 'bg-success/10 text-success',
  start_task: 'bg-cyan/10 text-cyan',
  exchange: 'bg-cyan/10 text-cyan',
  finish_task: 'bg-bg4 text-text-muted',
  vault_add: 'bg-purple/10 text-purple',
  vault_use: 'bg-purple/10 text-purple',
  vault_delete: 'bg-error/10 text-error',
  suspend: 'bg-warning/10 text-warning',
  auth_request: 'bg-warning/10 text-warning',
  auth_approve: 'bg-success/10 text-success',
  auth_deny: 'bg-error/10 text-error',
  policy_add: 'bg-primary/10 text-primary',
  policy_update: 'bg-primary/10 text-primary',
  policy_delete: 'bg-error/10 text-error',
};

export default function LogsTab() {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState('');

  const load = () => api.getAudit().then(setEntries);
  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const actions = [...new Set(entries.map(e => e.action))].sort();
  const filtered = entries.filter(e => !filter || e.action === filter);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="px-3 py-1.5 bg-input-bg border border-border-2 rounded text-xs text-text focus:outline-none" style={{minWidth: 150}}>
            <option value="">All Actions</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="text-xs text-text-muted">{filtered.length} record(s)</span>
        </div>
      </div>

      <div className="bg-bg2 border border-separator rounded-lg overflow-hidden">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-text-muted text-sm">No audit events</div>
        )}
        {filtered.map((e, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-separator last:border-0 hover:bg-bg3 text-[13px]">
            <span className="font-mono text-[11px] text-text-muted min-w-[140px]">
              {new Date(e.timestamp).toLocaleString()}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded min-w-[100px] text-center ${actionColors[e.action] || 'bg-bg4 text-text-dim'}`}>
              {e.action}
            </span>
            <span className="font-mono text-xs text-text-dim min-w-[160px] truncate">{e.agent_id}</span>
            <span className="text-text-dim flex-1 truncate">
              {[e.resource_id, e.detail].filter(Boolean).join(' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
