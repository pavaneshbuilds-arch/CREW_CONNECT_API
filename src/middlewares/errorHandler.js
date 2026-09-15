import pkg from '@prisma/client';
import ApiError from '../utils/apiError.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';

const { Prisma } = pkg;

// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  let statusCode = 500;
  let message = 'Internal server error';
  let code;
  let details;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (err && err.isJoi) {
    statusCode = 400;
    message = 'Validation failed';
    code = 'VALIDATION_ERROR';
    details = err.details?.map((d) => ({ path: d.path.join('.'), message: d.message }));
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      statusCode = 409;
      message = 'A record with these details already exists';
      code = 'UNIQUE_CONSTRAINT';
      details = { fields: err.meta?.target };
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'Record not found';
      code = 'NOT_FOUND';
    } else {
      statusCode = 400;
      message = 'Database request error';
      code = err.code;
    }
  } else if (err && (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')) {
    statusCode = 401;
    message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    code = 'INVALID_TOKEN';
  } else if (err && typeof err.statusCode === 'number') {
    statusCode = err.statusCode;
    message = err.message || message;
  }

  if (statusCode >= 500) {
    logger.error('Unhandled error', {
      message: err?.message,
      stack: err?.stack,
      path: req.originalUrl,
      method: req.method,
    });
  }

  const body = { success: false, error: { message, code } };
  if (details) body.error.details = details;
  if (!config.isProduction && statusCode >= 500) body.error.stack = err?.stack;

  res.status(statusCode).json(body);
}
