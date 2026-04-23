import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
  }, []);

  const ctx = {
    success: (msg) => show(msg, 'success'),
    error: (msg) => show(msg, 'error'),
    info: (msg) => show(msg, 'info'),
  };

  const colors = {
    success: 'bg-success/15 border-success/30 text-success',
    error: 'bg-error/15 border-error/30 text-error',
    info: 'bg-primary/15 border-primary/30 text-primary',
  };

  const icons = { success: '\u2713', error: '\u2717', info: '\u25CF' };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`toast-enter pointer-events-auto px-4 py-2.5 rounded-lg border text-[13px] font-medium shadow-lg flex items-center gap-2 ${colors[t.type]}`}>
            <span className="text-base">{icons[t.type]}</span>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
