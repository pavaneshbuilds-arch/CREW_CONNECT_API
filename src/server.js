import app from './app.js';
import config from './config/env.js';
import logger from './utils/logger.js';
import { connectPostgres, disconnectPostgres } from './config/prisma.js';

let server;

async function start() {
  await connectPostgres();

  server = app.listen(config.port, () => {
    logger.info(`Crew Connect API listening on port ${config.port}`, {
      env: config.nodeEnv,
      apiPrefix: config.apiPrefix,
    });
  });
}

async function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  if (server) await new Promise((resolve) => server.close(resolve));
  await disconnectPostgres();
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason?.message || String(reason) });
});

start().catch((err) => {
  logger.error('Failed to start server', { message: err.message, stack: err.stack });
  process.exit(1);
});
