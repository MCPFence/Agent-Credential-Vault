import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';

function StatCard({ label, value, sub, color }) {
  const colors = {
    blue: 'text-primary',
    green: 'text-success',
    purple: 'text-purple',
    cyan: 'text-cyan',
    warning: 'text-warning',
  };
  return (
    <div className="bg-bg2 border border-separator rounded-lg p-5">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={`text-3xl font-bold ${colors[color]}`}>{value}</div>
      <div className="text-[11px] text-text-muted mt-1">{sub}</div>
    </div>
  );
}

export default function DashboardTab({ goTo }) {
  const [agents, setAgents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [vault, setVault] = useState([]);
  const [audit, setAudit] = useState([]);
  const toast = useToast();

  const load = () => {
    Promise.all([api.getAgents(), api.getTasks(), api.getVault(), api.getAudit()]).then(([a, t, v, au]) => {
      setAgents(a); setTasks(t); setVault(v); setAudit(au);
    });
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, []);

  const active = agents.filter(a => a.status === 'active').length;
  const pendingAuth = tasks.filter(t => t.status === 'auth_required');
  const recent = audit.slice(0, 10);

  // Vault type stats
  const vaultByType = {};
  vault.forEach(c => { vaultByType[c.credential_type] = (vaultByType[c.credential_type] || 0) + 1; });
  const vaultActive = vault.filter(c => c.status === 'active').length;
  const vaultSuspended = vault.filter(c => c.status === 'suspended').length;
  const vaultExpired = vault.filter(c => c.status === 'expired').length;
  const vaultExpiring = vault.filter(c => c.expiry_warning != null).length;

  const actionColors = {
    register: 'bg-success/10 text-success',
    bind: 'bg-success/10 text-success',
    start_task: 'bg-cyan/10 text-cyan',
    exchange: 'bg-cyan/10 text-cyan',
    finish_task: 'bg-text-muted/20 text-text-dim',
    vault_add: 'bg-purple/10 text-purple',
    vault_use: 'bg-purple/10 text-purple',
    suspend: 'bg-warning/10 text-warning',
    auth_request: 'bg-warning/10 text-warning',
    auth_approve: 'bg-success/10 text-success',
    auth_deny: 'bg-error/10 text-error',
  };

  const typeLabels = { oauth: 'OAuth', api_key: 'API Key', cookie: 'Cookie', password: 'Password' };
  const typeColors = { oauth: 'text-primary', api_key: 'text-cyan', cookie: 'text-warning', password: 'text-purple' };

  const approveTask = async (id) => {
    try { await api.approveTask(id); toast.success('Approved'); load(); } catch (e) { toast.error(e.message); }
  };
  const denyTask = async (id) => {
    try { await api.denyTask(id); toast.success('Denied'); load(); } catch (e) { toast.error(e.message); }
  };

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <StatCard label="Total Agents" value={agents.length} sub={`${active} active`} color="blue" />
        <StatCard label="Active Agents" value={active} sub="Currently running" color="green" />
        <StatCard label="Tasks" value={tasks.length} sub={`${pendingAuth.length} pending approval`} color="purple" />
        <StatCard label="Credentials" value={vault.length} sub={`${vaultActive} active / ${vaultExpired} expired`} color="cyan" />
        <StatCard label="Audit Events" value={audit.length} sub="Total events" color="warning" />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Pending Auth Tasks */}
        <div className="col-span-2 bg-bg2 border border-separator rounded-lg">
          <div className="px-5 py-4 border-b border-separator flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Pending Approval
              {pendingAuth.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-warning/15 text-warning text-[11px] font-bold">{pendingAuth.length}</span>
              )}
            </h3>
            <button onClick={() => goTo && goTo('tasks')} className="text-xs text-primary hover:text-primary-dark">View All</button>
          </div>
          <div>
            {pendingAuth.length === 0 && (
              <div className="text-center py-8 text-text-muted text-sm">No pending tasks</div>
            )}
            {pendingAuth.slice(0, 5).map(t => (
              <div key={t.task_id} className="flex items-center gap-3 px-5 py-3 border-b border-separator last:border-0 hover:bg-bg3">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{t.task_type}</div>
                  <div className="text-xs text-text-muted font-mono">{t.agent_id}</div>
                </div>
                <div className="flex flex-wrap gap-1 max-w-[200px]">
                  {(t.pending_scopes || []).slice(0, 3).map(s => (
                    <span key={s} className="px-1.5 py-0.5 bg-warning/10 text-warning text-[10px] font-mono rounded">{s}</span>
                  ))}
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => approveTask(t.task_id)} className="px-2.5 py-1 text-xs bg-success/10 text-success rounded hover:bg-success/20 font-medium">Approve</button>
                  <button onClick={() => denyTask(t.task_id)} className="px-2.5 py-1 text-xs bg-error/10 text-error rounded hover:bg-error/20 font-medium">Deny</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Vault Overview */}
        <div className="bg-bg2 border border-separator rounded-lg">
          <div className="px-5 py-4 border-b border-separator flex items-center justify-between">
            <h3 className="text-sm font-semibold">Vault Overview</h3>
            <button onClick={() => goTo && goTo('vault')} className="text-xs text-primary hover:text-primary-dark">Manage</button>
          </div>
          <div className="p-5">
            <div className="space-y-3">
              {Object.entries(typeLabels).map(([type, label]) => {
                const count = vaultByType[type] || 0;
                return (
                  <div key={type} className="flex items-center justify-between">
                    <span className={`text-[13px] font-medium ${typeColors[type]}`}>{label}</span>
                    <span className="text-[13px] font-mono text-text-dim">{count}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-3 border-t border-separator flex items-center justify-between text-xs">
              <span className="text-text-muted">Total</span>
              <span className="text-text font-semibold">{vault.length}</span>
            </div>
            {(vaultExpiring > 0 || vaultExpired > 0) && (
              <div className="mt-3 space-y-1">
                {vaultExpiring > 0 && <div className="text-[11px] text-warning">{'\u26A0'} {vaultExpiring} credential(s) expiring soon</div>}
                {vaultExpired > 0 && <div className="text-[11px] text-error">{'\u2717'} {vaultExpired} credential(s) expired</div>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-bg2 border border-separator rounded-lg">
        <div className="px-5 py-4 border-b border-separator flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent Activity</h3>
          <button onClick={() => goTo && goTo('logs')} className="text-xs text-primary hover:text-primary-dark">View All</button>
        </div>
        <div>
          {recent.length === 0 && (
            <div className="text-center py-12 text-text-muted text-sm">No activity yet</div>
          )}
          {recent.map((e, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-2.5 border-b border-separator last:border-0 hover:bg-bg3 text-[13px]">
              <span className="font-mono text-[11px] text-text-muted min-w-[130px]">
                {new Date(e.timestamp).toLocaleString()}
              </span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded min-w-[90px] text-center ${actionColors[e.action] || 'bg-bg4 text-text-dim'}`}>
                {e.action}
              </span>
              <span className="font-mono text-xs text-text-dim">{e.agent_id}</span>
              <span className="text-text-dim flex-1 truncate">{e.detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
