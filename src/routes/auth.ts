import express from 'express';
import { 
  initiateDeviceFlow, 
  checkDeviceFlowAuth, 
  isTokenValid, 
  clearTokens,
  getCopilotToken,
  refreshCopilotToken
} from '../services/auth-service.js';
import { logger } from '../utils/logger.js';

export const authRoutes = express.Router();

// Get authentication status
authRoutes.get('/status', async (req, res, next) => {
  try {
    // If token exists and is valid
    if (isTokenValid()) {
      const token = getCopilotToken();
      return res.json({ 
        status: 'authenticated', 
        expiresAt: token?.expires_at 
      });
    }
    
    // Try to refresh token if we have one but it's expired
    if (getCopilotToken() && !isTokenValid()) {
      try {
        const token = await refreshCopilotToken();
        return res.json({ 
          status: 'authenticated', 
          expiresAt: token.expires_at 
        });
      } catch (error) {
        logger.error('Token refresh failed:', error);
        clearTokens();
        return res.json({ 
          status: 'unauthenticated', 
          error: 'Token refresh failed' 
        });
      }
    }
    
    // No token exists
    return res.json({ status: 'unauthenticated' });
  } catch (error) {
    next(error);
  }
});

// Initiate login process
authRoutes.post('/login', async (req, res, next) => {
  try {
    // If already authenticated, just return success
    if (isTokenValid()) {
      return res.json({ status: 'authenticated' });
    }
    
    // Start device flow
    const verification = await initiateDeviceFlow();
    
    // Return the device flow information
    return res.json(verification);
  } catch (error) {
    next(error);
  }
});

// Check if login is complete
authRoutes.post('/check', async (req, res, next) => {
  try {
    // If already authenticated, just return success
    if (isTokenValid()) {
      return res.json({ status: 'authenticated' });
    }
    
    // Check if auth is complete
    const success = await checkDeviceFlowAuth();
    
    if (success) {
      return res.json({ status: 'authenticated' });
    } else {
      return res.json({ status: 'pending_verification' });
    }
  } catch (error) {
    logger.error('Auth check error:', error);
    
    // If it's a pending authorization, that's expected behavior
    if (error instanceof Error && error.message.includes('authorization_pending')) {
      return res.json({ status: 'pending_verification' });
    }
    
    next(error);
  }
});

// Logout
authRoutes.post('/logout', (req, res) => {
  clearTokens();
  res.json({ status: 'logged_out' });
});
