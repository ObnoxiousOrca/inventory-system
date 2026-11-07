'use strict';

const { AppError } = require('../utils/AppError');

// validate(schema, 'body' | 'params' | 'query') -> replaces req[source] with the parsed data.
const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    const err = new AppError(400, 'Validation failed', 'VALIDATION_ERROR');
    err.details = details;
    return next(err);
  }
  req[source] = result.data;
  return next();
};

module.exports = { validate };
