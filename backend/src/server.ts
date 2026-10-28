import { createApp } from './app.js';
import { env } from './env.js';
import { startKeepAlive } from './lib/keepAlive.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  const banner = `BUIDCO API listening on http://localhost:${env.PORT} [${env.NODE_ENV}]`;
  process.stdout.write(`${banner}\n`);
});

// Stops the free-tier instance idling itself to sleep. No-op off Render.
const keepAlive = startKeepAlive();
if (keepAlive) {
  process.stdout.write('keep-alive ping active (every 10 min)\n');
}

function shutdown(signal: NodeJS.Signals): void {
  process.stdout.write(`Received ${signal}, shutting down\n`);
  keepAlive?.stop();
  server.close((err) => {
    if (err) {
      process.stderr.write(`Error during shutdown: ${err.message}\n`);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
