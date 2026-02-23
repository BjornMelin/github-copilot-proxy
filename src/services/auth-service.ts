import { createOAuthDeviceAuth } from '@octokit/auth-oauth-device';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../config/index.js';
import { CopilotToken, VerificationResponse } from '../types/github.js';
import { logger } from '../utils/logger.js';

// Get directory for token storage
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TOKEN_FILE_PATH = path.join(__dirname, '..', '..', '.tokens.json');

// Token storage interface
interface StoredTokens {
  githubToken: string | null;
  copilotToken: CopilotToken | null;
  savedAt: number;
}

// In-memory token storage
let githubToken: string | null = null;
let copilotToken: CopilotToken | null = null;

// Store verification info for later retrieval
let pendingVerification: VerificationResponse | null = null;

/**
 * Load tokens from file on startup
 */
function loadTokensFromFile(): void {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      const data = fs.readFileSync(TOKEN_FILE_PATH, 'utf-8');
      const stored: StoredTokens = JSON.parse(data);
      
      githubToken = stored.githubToken;
      copilotToken = stored.copilotToken;
      
      logger.info('Tokens loaded from file', { 
        hasGithubToken: !!githubToken,
        hasCopilotToken: !!copilotToken,
        savedAt: new Date(stored.savedAt).toISOString()
      });
    }
  } catch (error) {
    logger.error('Error loading tokens from file:', error);
  }
}

/**
 * Save tokens to file for persistence
 */
function saveTokensToFile(): void {
  try {
    const data: StoredTokens = {
      githubToken,
      copilotToken,
      savedAt: Date.now()
    };
    fs.writeFileSync(TOKEN_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    logger.debug('Tokens saved to file');
  } catch (error) {
    logger.error('Error saving tokens to file:', error);
  }
}

/**
 * Delete token file
 */
function deleteTokenFile(): void {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      fs.unlinkSync(TOKEN_FILE_PATH);
      logger.debug('Token file deleted');
    }
  } catch (error) {
    logger.error('Error deleting token file:', error);
  }
}

// Load tokens on module initialization
loadTokensFromFile();

/**
 * Initialize the OAuth device flow for GitHub authentication
 * @returns Promise<VerificationResponse> Device verification info
 */
export async function initiateDeviceFlow(): Promise<VerificationResponse> {
  return new Promise((resolve, reject) => {
    const auth = createOAuthDeviceAuth({
      clientType: "oauth-app",
      clientId: config.github.copilot.clientId,
      scopes: ["read:user"],
      onVerification(verification) {
        logger.info('Device verification initiated', { 
          verification_uri: verification.verification_uri,
          user_code: verification.user_code 
        });
        
        // Store and return the verification info
        pendingVerification = {
          verification_uri: verification.verification_uri,
          user_code: verification.user_code,
          expires_in: verification.expires_in,
          interval: verification.interval,
          status: 'pending_verification'
        };
        
        resolve(pendingVerification);
      },
    });

    // Start the device authorization flow - this will trigger onVerification
    auth({ type: "oauth" }).then((tokenAuth) => {
      // Token received means user completed authorization
      if (tokenAuth.token) {
        githubToken = tokenAuth.token;
        saveTokensToFile();
        refreshCopilotToken().catch(err => {
          logger.error('Error refreshing copilot token after auth:', err);
        });
      }
    }).catch((error) => {
      // If we already resolved with verification info, ignore pending errors
      if (!pendingVerification) {
        logger.error('Failed to initiate device flow:', error);
        reject(new Error('Failed to initiate GitHub authentication'));
      }
    });
  });
}

/**
 * Check if the user has completed the device flow authorization
 * @returns Promise<boolean> Whether authentication was successful
 */
export async function checkDeviceFlowAuth(): Promise<boolean> {
  // If already authenticated, return true
  if (githubToken && copilotToken) {
    return true;
  }

  const auth = createOAuthDeviceAuth({
    clientType: "oauth-app",
    clientId: config.github.copilot.clientId,
    scopes: ["read:user"],
    onVerification(verification) {
      // This is called when verification is needed
      logger.debug('Verification check', { user_code: verification.user_code });
    },
  });

  try {
    // This will throw if the user hasn't authorized yet
    const tokenAuth = await auth({ type: "oauth" });
    
    if (tokenAuth.token) {
      // Successfully authenticated
      githubToken = tokenAuth.token;
      saveTokensToFile();
      
      // Get Copilot token using GitHub token
      await refreshCopilotToken();
      
      return true;
    }
    
    return false;
  } catch (error: any) {
    // If it's a pending authorization, that's expected
    if (error.message && error.message.includes('authorization_pending')) {
      return false;
    }
    
    // Log other errors
    logger.error('Error checking device flow auth:', error);
    throw error;
  }
}

/**
 * Refresh the Copilot token using the GitHub token
 * @returns Promise<CopilotToken> The refreshed Copilot token
 */
export async function refreshCopilotToken(): Promise<CopilotToken> {
  if (!githubToken) {
    throw new Error('GitHub token is required for refresh');
  }

  try {
    const response = await fetch(config.github.copilot.apiEndpoints.GITHUB_COPILOT_TOKEN, {
      method: 'GET',
      headers: {
        'Authorization': `token ${githubToken}`,
        'Editor-Version': 'vscode/1.96.0',
        'Editor-Plugin-Version': 'copilot-chat/0.22.2',
        'User-Agent': 'GitHubCopilotChat/0.22.2'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get Copilot token: ${response.status} ${response.statusText}`);
    }

    copilotToken = await response.json() as CopilotToken;
    saveTokensToFile();
    logger.info('Copilot token refreshed', { 
      expires_at: new Date(copilotToken.expires_at * 1000).toISOString() 
    });
    
    return copilotToken;
  } catch (error) {
    logger.error('Error refreshing Copilot token:', error);
    throw error;
  }
}

/**
 * Get the current Copilot token
 * @returns CopilotToken | null The current token or null if not authenticated
 */
export function getCopilotToken(): CopilotToken | null {
  return copilotToken;
}

/**
 * Check if we have a GitHub token for refreshing
 * @returns boolean Whether a GitHub token exists
 */
export function hasGithubToken(): boolean {
  return !!githubToken;
}

/**
 * Check if the current token is valid and not expired
 * @returns boolean Whether the token is valid
 */
export function isTokenValid(): boolean {
  if (!copilotToken || !copilotToken.token) {
    return false;
  }
  
  const now = Math.floor(Date.now() / 1000);
  // Add a small buffer to ensure we don't use tokens that are about to expire
  return now < (copilotToken.expires_at - 60);
}

/**
 * Clear all authentication tokens
 */
export function clearTokens(): void {
  githubToken = null;
  copilotToken = null;
  deleteTokenFile();
  logger.info('Authentication tokens cleared');
}
