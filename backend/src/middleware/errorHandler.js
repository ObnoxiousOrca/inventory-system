'use strict';

const logger = require('../config/logger');

function notFound(req, res) {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.name === 'AppError') {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
  }
  // Unexpected: log full detail (goes to CloudWatch), return a generic message.
  logger.error({ err }, 'unhandled error');
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
}

module.exports = { notFound, errorHandler };
