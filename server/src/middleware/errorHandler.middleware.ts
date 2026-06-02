import { NextFunction, Request, Response } from 'express';
import { logFailure } from '../lib/observability';

type AppError = Error & {
  statusCode?: number;
  status?: string;
};

export const errorHandler = (
  error: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = error.statusCode || 500;
  const status = error.status || (statusCode >= 500 ? 'error' : 'fail');

  if (statusCode >= 500) {
    logFailure('http_request_failed', error, {
      method: req.method,
      path: req.originalUrl,
      statusCode,
    });
  }

  return res.status(statusCode).json({
    status,
    message: error.message || 'Internal server error',
  });
};
