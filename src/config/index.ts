import dotenv from 'dotenv';
import { z } from 'zod';
import pkg from '../../package.json' with { type: 'json' };

// Load environment variables
dotenv.config();

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

// Schema for env validation
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3000'),
  HOST: z.string().default('localhost'),
  REQUEST_BODY_LIMIT: z.string().default('10mb'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  GITHUB_COPILOT_CLIENT_ID: z.string().default('Iv1.b507a08c87ecfe98'),
  COPILOT_USER_AGENT: z.string().default(`github-copilot-proxy/${pkg.version}`),
  COPILOT_EDITOR_VERSION: z.string().default('Cursor/3.0.0'),
  COPILOT_EDITOR_PLUGIN_VERSION: z.string().default(`github-copilot-proxy/${pkg.version}`),
  COPILOT_DEFAULT_MODEL: z.string().default('gpt-4.1'),
  COPILOT_MODELS: z.string().default('gpt-4.1,gpt-4.1-mini,gpt-4o,gpt-4o-mini,gpt-4-turbo,gpt-4,gpt-3.5-turbo'),
  VISION_BACKEND_NAME: z.string().default('vision-backend'),
  VISION_BACKEND_BASE_URL: z.string().default(''),
  VISION_BACKEND_API_KEY: z.string().default(''),
  VISION_BACKEND_DEFAULT_MODEL: z.string().default('gpt-4o'),
  VISION_BACKEND_MODELS: z.string().default(''),
  // Rate limiting settings (requests per minute)
  RATE_LIMIT_DEFAULT: z.string().default('60'),
  RATE_LIMIT_CHAT_COMPLETIONS: z.string().default('20'),
});

// Parse and validate environment variables
const env = envSchema.parse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  HOST: process.env.HOST,
  REQUEST_BODY_LIMIT: process.env.REQUEST_BODY_LIMIT,
  LOG_LEVEL: process.env.LOG_LEVEL,
  GITHUB_COPILOT_CLIENT_ID: process.env.GITHUB_COPILOT_CLIENT_ID,
  COPILOT_USER_AGENT: process.env.COPILOT_USER_AGENT,
  COPILOT_EDITOR_VERSION: process.env.COPILOT_EDITOR_VERSION,
  COPILOT_EDITOR_PLUGIN_VERSION: process.env.COPILOT_EDITOR_PLUGIN_VERSION,
  COPILOT_DEFAULT_MODEL: process.env.COPILOT_DEFAULT_MODEL,
  COPILOT_MODELS: process.env.COPILOT_MODELS,
  VISION_BACKEND_NAME: process.env.VISION_BACKEND_NAME,
  VISION_BACKEND_BASE_URL: process.env.VISION_BACKEND_BASE_URL,
  VISION_BACKEND_API_KEY: process.env.VISION_BACKEND_API_KEY,
  VISION_BACKEND_DEFAULT_MODEL: process.env.VISION_BACKEND_DEFAULT_MODEL,
  VISION_BACKEND_MODELS: process.env.VISION_BACKEND_MODELS,
  RATE_LIMIT_DEFAULT: process.env.RATE_LIMIT_DEFAULT,
  RATE_LIMIT_CHAT_COMPLETIONS: process.env.RATE_LIMIT_CHAT_COMPLETIONS,
});

const copilotModels = parseCsv(env.COPILOT_MODELS);
const visionModels = parseCsv(env.VISION_BACKEND_MODELS);
const visionBaseUrl = env.VISION_BACKEND_BASE_URL.replace(/\/$/, '');

// API endpoints
const API_ENDPOINTS = {
  GITHUB_COPILOT_TOKEN: 'https://api.github.com/copilot_internal/v2/token',
  GITHUB_COPILOT_COMPLETIONS: 'https://copilot-proxy.githubusercontent.com/v1/engines/copilot-codex/completions',
};

// Configuration object
export const config = {
  version: pkg.version,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  server: {
    port: parseInt(env.PORT, 10),
    host: env.HOST,
    requestBodyLimit: env.REQUEST_BODY_LIMIT,
  },
  logging: {
    level: env.LOG_LEVEL,
  },
  github: {
    copilot: {
      clientId: env.GITHUB_COPILOT_CLIENT_ID,
      defaultModel: env.COPILOT_DEFAULT_MODEL,
      models: copilotModels,
      apiEndpoints: API_ENDPOINTS,
      clientHeaders: {
        userAgent: env.COPILOT_USER_AGENT,
        editorVersion: env.COPILOT_EDITOR_VERSION,
        editorPluginVersion: env.COPILOT_EDITOR_PLUGIN_VERSION,
        openAIOrganization: 'github-copilot',
        openAIIntent: 'copilot-ghost',
      },
    }
  },
  providers: {
    vision: {
      enabled: Boolean(visionBaseUrl),
      name: env.VISION_BACKEND_NAME,
      baseUrl: visionBaseUrl,
      apiKey: env.VISION_BACKEND_API_KEY,
      defaultModel: env.VISION_BACKEND_DEFAULT_MODEL,
      models: visionModels,
    }
  },
  rateLimits: {
    default: parseInt(env.RATE_LIMIT_DEFAULT, 10),
    chatCompletions: parseInt(env.RATE_LIMIT_CHAT_COMPLETIONS, 10),
    // Token usage thresholds
    maxTokensPerRequest: 4000,
    maxTokensPerMinute: 20000,
    tokenRateLimitResetTime: 60 * 1000, // 1 minute in ms
  }
};
