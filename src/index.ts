import { app } from './server.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { isTokenValid, hasGithubToken } from './services/auth-service.js';
import { exec } from 'child_process';
import { platform } from 'os';

/**
 * Opens a URL in the default browser
 */
function openBrowser(url: string): void {
  const command = platform() === 'win32' 
    ? `start "" "${url}"` 
    : platform() === 'darwin' 
      ? `open "${url}"` 
      : `xdg-open "${url}"`;
  
  exec(command, (error) => {
    if (error) {
      logger.warn('Could not open browser automatically. Please visit:', url);
    }
  });
}

const startServer = () => {
  const port = config.server.port;
  const host = config.server.host;

  try {
    app.listen(port, () => {
      const serverUrl = `http://${host}:${port}`;
      logger.info(`Server running at ${serverUrl}/`);
      logger.info('Press CTRL-C to stop the server');
      
      // Auto-open appropriate page based on authentication status
      if (!isTokenValid() && !hasGithubToken()) {
        logger.info('No valid authentication found. Opening auth page...');
        openBrowser(`${serverUrl}/auth.html`);
      } else {
        logger.info('Authentication tokens found. Opening setup page...');
        openBrowser(`${serverUrl}/setup.html`);
      }
    });
  } catch (error) {
    logger.error('Error starting server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
const shutdown = () => {
  logger.info('Shutting down server...');
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  shutdown();
});

// Start server
startServer();
