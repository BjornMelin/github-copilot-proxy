import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { authRoutes } from './routes/auth.js';
import { openaiRoutes } from './routes/openai.js';

// Initialize express app
export const app = express();

// Apply middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', version: config.version });
});

// Routes
app.use('/auth', authRoutes);
app.use('/v1', openaiRoutes);

// Home page
app.get('/', (req, res) => {
  res.status(200).send(`
    <html>
      <head>
        <title>GitHub Copilot Proxy for Cursor IDE</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; }
          h1 { color: #0366d6; }
          code { background-color: #f6f8fa; padding: 0.2em 0.4em; border-radius: 3px; }
          pre { background-color: #f6f8fa; padding: 1em; border-radius: 6px; overflow-x: auto; }
        </style>
      </head>
      <body>
        <h1>GitHub Copilot Proxy for Cursor IDE</h1>
        <p>This server enables Cursor IDE to use GitHub Copilot's API service.</p>
        <h2>Status</h2>
        <p>Server is running. API version: ${config.version}</p>
        <h2>Configuration</h2>
        <p>To use with Cursor IDE:</p>
        <ol>
          <li>In Cursor, go to Settings &gt; API Keys</li>
          <li>Under "Override OpenAI Base URL", enter: <code>http://${config.server.host}:${config.server.port}</code></li>
          <li>Complete authorization at <a href="/auth/login">/auth/login</a></li>
        </ol>
      </body>
    </html>
  `);
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use(errorHandler);
