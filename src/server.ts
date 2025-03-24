import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { authRoutes } from './routes/auth.js';
import { openaiRoutes } from './routes/openai.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize express app
export const app = express();

// Apply middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', version: config.version });
});

// Routes
app.use('/auth', authRoutes);
app.use('/v1', openaiRoutes);

// Home page - redirect to auth page
app.get('/', (req, res) => {
  res.redirect('/auth.html');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler
app.use(errorHandler);
