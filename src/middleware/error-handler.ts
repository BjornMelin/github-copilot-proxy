import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export interface AppError extends Error {
  status?: number;
  code?: string;
}

/**
 * Global error handler middleware for Express
 */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || 'INTERNAL_ERROR';
  
  // Log error details
  logger.error(`${status} - ${message} - ${req.originalUrl} - ${req.method} - ${req.ip}`, {
    error: err.stack,
    body: req.body,
    params: req.params,
  });

  // Send response to client
  res.status(status).json({
    error: {
      message,
      code,
      status,
    }
  });
}
