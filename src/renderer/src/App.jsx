import React, { useState } from 'react';
import { ToastProvider } from './components/Toast';
import DashboardTab from './components/DashboardTab';
import AgentsTab from './components/AgentsTab';
import TasksTab from './components/TasksTab';
import VaultTab from './components/VaultTab';
import PoliciesTab from './components/PoliciesTab';
import LogsTab from './components/LogsTab';

const navGroups = [
  { label: 'Overview', items: [
    { id: 'dashboard', label: 'Dashboard', icon: '▪' },
  ]},
  { label: 'Agent Management', items: [
    { id: 'agents', label: 'Agents', icon: '●' },
    { id: 'tasks', label: 'Tasks', icon: '▶' },
  ]},
  { label: 'Credentials', items: [
    { id: 'vault', label: 'Vault', icon: '🛡' },
  ]},
  { label: 'System', items: [
    { id: 'policies', label: 'Policies', icon: '⚙' },
    { id: 'logs', label: 'Audit Logs', icon: '📋' },
  ]},
];

const pageTitle = {
  dashboard: 'Dashboard',
  agents: 'Agents',
  tasks: 'Tasks',
  vault: 'Vault',
  policies: 'Policies',
  logs: 'Audit Logs',
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const goTo = (tab) => setActiveTab(tab);

  return (
    <ToastProvider>
    <div className="h-screen flex bg-bg">
      {/* Sidebar */}
      <aside className="w-[240px] bg-bg2 border-r border-separator flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-separator flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-purple flex items-center justify-center text-white text-[9px] font-bold">ACV</div>
          <div>
            <h1 className="text-sm font-bold text-text">Agent Credential Vault</h1>
            <span className="text-[11px] text-text-muted">Credentials & Policies</span>
          </div>
        </div>
        <nav className="flex-1 p-3 overflow-y-auto">
          {navGroups.map(g => (
            <div key={g.label} className="mb-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-3 py-2">{g.label}</div>
              {g.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded text-[13px] font-medium transition-colors ${
                    activeTab === item.id
                      ? 'bg-primary/15 text-primary'
                      : 'text-text-dim hover:bg-bg3 hover:text-text'
                  }`}
                >
                  <span className="w-5 text-center text-base">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-separator">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse-slow" />
            <span className="text-xs text-text-dim">ACV :8400 connected</span>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="h-14 border-b border-separator flex items-center justify-between px-6 bg-bg2 shrink-0">
          <h2 className="text-[15px] font-semibold text-text">{pageTitle[activeTab]}</h2>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>admin</span>
            <span className="text-cyan font-semibold">PRO</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'dashboard' && <DashboardTab goTo={goTo} />}
          {activeTab === 'agents' && <AgentsTab />}
          {activeTab === 'tasks' && <TasksTab />}
          {activeTab === 'vault' && <VaultTab />}
          {activeTab === 'policies' && <PoliciesTab />}
          {activeTab === 'logs' && <LogsTab />}
        </div>
      </div>
    </div>
    </ToastProvider>
  );
}
