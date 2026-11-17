/**
 * PM2 process definitions for BUIDCO Dashboard.
 *
 * Run everything:   pm2 start ecosystem.config.cjs
 * Single service:   pm2 start ecosystem.config.cjs --only buidco-backend
 * Logs (live):      pm2 logs buidco-backend
 * Status:           pm2 status
 * Stop / delete:    pm2 stop all   |   pm2 delete all
 *
 * The backend runs its pre-built dist/server.js — remember to
 * `npm run build` in ./backend after any TS change.
 * The frontend serves the built ./dist via `vite preview` on port 5173
 * (matches the backend's CORS_ALLOWED_ORIGINS whitelist). Requests to
 * /api are proxied to the backend by vite preview (see vite.config.ts).
 */

const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'buidco-backend',
      cwd: path.resolve(__dirname, 'backend'),
      script: 'dist/server.js',
      interpreter: 'node',
      env: {
        // Required: the API refuses to start without NODE_ENV (finding S-05).
        NODE_ENV: 'production',
      },
      // env.ts loads .env.local from cwd; PM2 doesn't need to duplicate it.
      // With more than one instance, set RATE_LIMIT_STORE=postgres so the
      // login limits are shared (finding S-14).
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      // Logs (finding S-11). The API writes one JSON object per line and
      // stamps its own time, so PM2's time prefix is off: a log shipper can
      // forward each line as-is to the central log store. Keep these files
      // for at least 180 days (CERT-In), e.g. with pm2-logrotate:
      //   pm2 install pm2-logrotate
      //   pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
      //   pm2 set pm2-logrotate:retain 180
      //   pm2 set pm2-logrotate:compress true
      // or with the host's logrotate / journald policy.
      out_file: path.resolve(__dirname, 'backend/.pm2-out.log'),
      error_file: path.resolve(__dirname, 'backend/.pm2-err.log'),
      merge_logs: true,
      time: false,
    },
    {
      name: 'buidco-frontend',
      cwd: path.resolve(__dirname, 'frontend'),
      // `vite preview` serves the ./dist build with the preview.proxy config
      // (see vite.config.ts) that forwards /api to the backend.
      script: 'node_modules/vite/bin/vite.js',
      args: 'preview --host 127.0.0.1 --port 5173',
      interpreter: 'node',
      env: {
        NODE_ENV: 'production',
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      out_file: path.resolve(__dirname, 'frontend/.pm2-out.log'),
      error_file: path.resolve(__dirname, 'frontend/.pm2-err.log'),
      merge_logs: true,
      time: true,
    },
  ],
};
