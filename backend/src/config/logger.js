'use strict';

const pino = require('pino');
const config = require('./index');

// JSON logs go to stdout; on ECS/Fargate the awslogs driver ships them to CloudWatch.
const logger = pino({
  level: config.logLevel,
  base: { service: 'inventory-backend' },
  // Never write secrets or auth headers to the logs.
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});

module.exports = logger;
