import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Middleware to log HTTP requests
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const { method, url } = req;
  
  // Log request start
  logger.debug(`${method} ${url} - Request received`);
  
  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const { statusCode } = res;
    
    // Log based on status code
    if (statusCode >= 500) {
      logger.error(`${method} ${url} - ${statusCode} - ${duration}ms`);
    } else if (statusCode >= 400) {
      logger.warn(`${method} ${url} - ${statusCode} - ${duration}ms`);
    } else {
      logger.info(`${method} ${url} - ${statusCode} - ${duration}ms`);
    }
  });
  
  next();
}
