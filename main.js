const createServer = require('./src/main/server');
const { exec, execSync } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const port = process.env.AIS_PORT || 8400;
const consoleToken = crypto.randomBytes(32).toString('hex');

const dataDir = process.env.AIS_DATA_DIR || path.join(__dirname, 'data');
const server = createServer(dataDir, port, consoleToken);

// Product website — public, no auth required
server.app.use('/website', require('express').static(path.join(__dirname, 'website')));

// Skill download — public, packages skill/ directory as zip
server.app.get('/api/v1/skill/download', (req, res) => {
  const skillDir = path.join(__dirname, 'skill');
  if (!fs.existsSync(skillDir)) {
    return res.status(404).json({ code: 'not_found', message: 'Skill directory not found' });
  }
  const zipPath = path.join(__dirname, '.skill-download.zip');
  try {
    // Clean up any stale zip
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execSync(`cd "${__dirname}" && zip -r "${zipPath}" skill/ -x "*.DS_Store"`, { stdio: 'ignore' });
    res.download(zipPath, 'ais-agent-auth-skill.zip', () => {
      try { fs.unlinkSync(zipPath); } catch {}
    });
  } catch (e) {
    res.status(500).json({ code: 'zip_error', message: 'Failed to package skill' });
  }
});

// Root redirect to product page
server.app.get('/', (req, res, next) => {
  if (req.query.token) return next(); // has token → go to console
  res.redirect('/website/');
});

// Console static files — guard with token check
const expressStatic = require('express').static(path.join(__dirname, 'dist/renderer'));
server.app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/website')) return next();
  // Allow if ?token= matches
  if (req.query.token === consoleToken) return next();
  // Allow static assets (js/css/images) — they are loaded by the authenticated page
  if (/\.(js|css|svg|png|ico|woff2?|ttf|map)$/i.test(req.path)) return next();
  return res.status(403).send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Access Denied</title></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0f;color:#e8e8f0"><div style="text-align:center"><h1 style="color:#e17055">403 Access Denied</h1><p>Please use the link printed in the terminal to access the console.</p></div></body></html>');
});
server.app.use(expressStatic);

// Console SPA fallback — token required
server.app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/website')) return next();
  if (req.query.token !== consoleToken) {
    return res.status(403).send('Access Denied');
  }
  res.sendFile(path.join(__dirname, 'dist/renderer/index.html'));
});

server.start().then(() => {
  console.log(`\nAgent Credential Vault running at http://localhost:${port}`);
  console.log(`\nAccess Token: ${consoleToken}`);
  console.log(`\nOpen http://localhost:${port} and enter the token above to access the console.\n`);

  // Auto-open browser to product page
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "http://localhost:${port}/website/login.html"`);
});

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.stop();
  process.exit(0);
});
process.on('SIGTERM', () => {
  server.stop();
  process.exit(0);
});
