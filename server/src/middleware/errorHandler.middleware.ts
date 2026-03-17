import { NextFunction, Request, Response } from 'express';

type AppError = Error & {
  statusCode?: number;
  status?: string;
};

export const errorHandler = (
  error: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  const statusCode = error.statusCode || 500;
  const status = error.status || (statusCode >= 500 ? 'error' : 'fail');

  return res.status(statusCode).json({
    status,
    message: error.message || 'Internal server error',
  });
};
