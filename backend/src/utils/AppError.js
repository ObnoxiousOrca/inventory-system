'use strict';

// Small error type so services/controllers can signal HTTP status codes cleanly.
class AppError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code || 'APP_ERROR';
  }
}

module.exports = { AppError };
