import express from 'express';
import { getAllUsage, getUsageSummary, resetUsage } from '../services/usage-service.js';
import { isTokenValid } from '../services/auth-service.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/error-handler.js';

export const usageRoutes = express.Router();

// Authentication middleware
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!isTokenValid()) {
    const error = new Error('Authentication required') as AppError;
    error.status = 401;
    error.code = 'authentication_required';
    return next(error);
  }
  next();
};

// Get usage summary
usageRoutes.get('/summary', requireAuth, (req, res) => {
  const summary = getUsageSummary();
  res.json({
    ...summary,
    // Format for better readability
    averageTokensPerRequest: Math.round(summary.averageTokensPerRequest * 100) / 100
  });
});

// Get all usage details
usageRoutes.get('/details', requireAuth, (req, res) => {
  const allUsage = getAllUsage();
  
  // Transform to array and add session IDs
  const usageArray = Object.entries(allUsage).map(([sessionId, metrics]) => ({
    sessionId: sessionId.substring(0, 8) + '...',
    startTime: new Date(metrics.startTime).toISOString(),
    lastRequestTime: new Date(metrics.lastRequestTime).toISOString(),
    requestCount: metrics.requestCount,
    tokenCount: metrics.tokenCount,
    // Calculate usage duration
    duration: Math.round((Date.now() - metrics.startTime) / 1000 / 60) + ' minutes'
  }));
  
  res.json(usageArray);
});

// Reset usage for a specific session
usageRoutes.post('/reset/:sessionId', requireAuth, (req, res) => {
  const { sessionId } = req.params;
  
  // Get full session ID from partial
  const allUsage = getAllUsage();
  const fullSessionId = Object.keys(allUsage).find(id => id.startsWith(sessionId));
  
  if (!fullSessionId) {
    return res.status(404).json({
      error: {
        message: 'Session ID not found',
        code: 'session_not_found'
      }
    });
  }
  
  resetUsage(fullSessionId);
  logger.info(`Usage reset for session: ${sessionId}`);
  
  res.json({
    success: true,
    message: `Usage reset for session: ${sessionId}`
  });
});

// Reset all usage metrics
usageRoutes.post('/reset-all', requireAuth, (req, res) => {
  const allUsage = getAllUsage();
  
  Object.keys(allUsage).forEach(sessionId => {
    resetUsage(sessionId);
  });
  
  logger.info('All usage metrics reset');
  
  res.json({
    success: true,
    message: 'All usage metrics reset'
  });
});
