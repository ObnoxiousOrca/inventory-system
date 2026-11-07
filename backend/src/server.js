'use strict';

const app = require('./app');
const config = require('./config');
const logger = require('./config/logger');

const server = app.listen(config.port, '0.0.0.0', () => {
  logger.info({ port: config.port, env: config.env }, 'inventory backend listening');
});

// ECS sends SIGTERM when stopping/replacing a task: finish in-flight requests first.
function shutdown(signal) {
  logger.info({ signal }, 'shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandledRejection'));
