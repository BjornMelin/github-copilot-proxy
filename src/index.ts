import { app } from './server.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const host = config.server.host;
const port = config.server.port;

const startServer = () => {
  try {
    app.listen(port, host, () => {
      logger.info(`Server running at http://${host}:${port}/`);
      logger.info('Press CTRL-C to stop the server');
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
