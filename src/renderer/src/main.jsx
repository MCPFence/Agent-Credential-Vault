import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// Extract console token from URL and persist in sessionStorage
const params = new URLSearchParams(window.location.search);
const token = params.get('token');
if (token) {
  sessionStorage.setItem('ais-console-token', token);
  // Clean URL — remove ?token= to avoid leaking in bookmarks/history
  const clean = window.location.pathname + window.location.hash;
  window.history.replaceState({}, '', clean);
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
