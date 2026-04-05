import { Request, Response, NextFunction } from 'express';
import { checkRateLimit, getTokenUsageInWindow, getUsage } from '../services/usage-service.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import crypto from 'crypto';

interface RateLimitMessage {
  content: unknown;
}

function estimateMessageTokens(content: unknown): number {
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }

  if (!Array.isArray(content)) {
    return 0;
  }

  return content.reduce((total, part) => {
    if (!part || typeof part !== 'object' || !('type' in part)) {
      return total;
    }

    if (part.type === 'text' && 'text' in part && typeof part.text === 'string') {
      return total + Math.ceil(part.text.length / 4);
    }

    return total;
  }, 0);
}

// Route-specific rate limits
const ROUTE_RATE_LIMITS: Record<string, number> = {
  '/v1/chat/completions': config.rateLimits.chatCompletions,
  // Add more route-specific limits as needed
};

/**
 * Middleware to implement rate limiting
 * @param maxRequestsPerMinute Optional override for max requests per minute
 * @returns Express middleware function
 */
export function rateLimiter(maxRequestsPerMinute?: number) {
  return function(req: Request, res: Response, next: NextFunction) {
    // Determine rate limit based on route
    const route = req.path;
    const routeLimit = ROUTE_RATE_LIMITS[route];
    const effectiveLimit = maxRequestsPerMinute || routeLimit || config.rateLimits.default;

    // Get session identifier - use token hash if available, or IP address
    const authorizationHeader = req.get('Authorization') || '';
    const token = res.locals.token || authorizationHeader.replace(/^Bearer\s+/i, '').trim();
    const ipAddress = req.ip || req.socket.remoteAddress || '';
    const sessionId = token
      ? crypto.createHash('sha256').update(token).digest('hex')
      : crypto.createHash('sha256').update(ipAddress).digest('hex');

    // Check request-based rate limit
    const { limited, retryAfter } = checkRateLimit(sessionId, effectiveLimit);

    if (limited) {
      logger.warn(`Rate limit exceeded for session: ${sessionId.substring(0, 8)}...`);
      
      res.setHeader('Retry-After', retryAfter.toString());
      res.status(429).json({
        error: {
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          type: 'rate_limit_exceeded',
          code: 429
        }
      });
      return;
    }

    // Check token-based rate limit if this is a chat completion request
    if (route === '/v1/chat/completions') {
      const usage = getUsage(sessionId);
      
      // If we have usage data, check token limits
      if (usage) {
        // Get token usage for the past minute
        const tokensPastMinute = getTokenUsageInWindow(sessionId, 60 * 1000);
        
        if (tokensPastMinute > config.rateLimits.maxTokensPerMinute) {
          logger.warn(`Token rate limit exceeded for session: ${sessionId.substring(0, 8)}...`);
          
          // Calculate when they can try again based on token usage
          const tokenRetryAfter = 60; // Default to 1 minute
          
          res.setHeader('Retry-After', tokenRetryAfter.toString());
          res.status(429).json({
            error: {
              message: `Token usage rate limit exceeded. Try again in ${tokenRetryAfter} seconds.`,
              type: 'token_rate_limit_exceeded',
              code: 429
            }
          });
          return;
        }
        
        // Check if this particular request might exceed per-request token limits
        // This is a rough estimate based on request body size
        if (req.body && req.body.messages) {
          const messages = req.body.messages as RateLimitMessage[];
          const estimatedTokens = messages.reduce((total: number, msg) => {
            return total + estimateMessageTokens(msg.content);
          }, 0);
          
          if (estimatedTokens > config.rateLimits.maxTokensPerRequest) {
            logger.warn(`Request exceeds max tokens (est. ${estimatedTokens}) for session: ${sessionId.substring(0, 8)}...`);
            
            res.status(429).json({
              error: {
                message: `Request exceeds maximum token limit. Please reduce the size of your messages.`,
                type: 'max_tokens_exceeded',
                code: 429
              }
            });
            return;
          }
        }
      }
    }

    // Store session ID for usage tracking in route handlers
    res.locals.sessionId = sessionId;
    next();
  };
}
