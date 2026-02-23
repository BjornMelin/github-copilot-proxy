# GitHub Copilot Proxy - Universal OpenAI-Compatible Gateway

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22.0+-green.svg)](https://nodejs.org/)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-Supported-orange.svg)](https://github.com/openclaw/openclaw)
[![OpenAI Compatible](https://img.shields.io/badge/OpenAI-Compatible-green.svg)](https://platform.openai.com/docs/api-reference)

A powerful proxy server that exposes GitHub Copilot's AI capabilities through a fully OpenAI-compatible API. Use your GitHub Copilot subscription with **any** application that supports the OpenAI API format - including Cursor IDE, OpenClaw, Continue, Aider, LangChain, and more.

## 🚀 Features

### Core API Support
- **OpenAI Chat Completions API**: Full `/v1/chat/completions` endpoint with streaming
- **OpenAI Responses API**: Support for the newer `/v1/responses` endpoint format
- **OpenAI Models API**: `/v1/models` endpoint for model discovery
- **SSE Streaming**: Real-time Server-Sent Events streaming for all completions

### GitHub Copilot Integration
- **Multi-Model Access**: Access Claude, GPT, Gemini, and reasoning models through your Copilot subscription
- **OAuth Device Flow**: Secure browser-based GitHub authentication
- **Token Persistence**: Tokens stored in `.tokens.json` survive server restarts
- **Auto Token Refresh**: Automatically refreshes expired Copilot tokens

### Supported AI Models

| Provider | Models |
|----------|--------|
| **Anthropic Claude** | `claude-opus-4.5`, `claude-sonnet-4.5`, `claude-sonnet-4`, `claude-haiku-4.5` |
| **OpenAI GPT** | `gpt-5.2`, `gpt-5-codex`, `gpt-5.1-codex-max`, `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4`, `gpt-3.5-turbo` |
| **Google Gemini** | `gemini-2.5-pro`, `gemini-3-pro-preview`, `gemini-3-flash-preview` |
| **Reasoning** | `o1-preview`, `o1-mini`, `o3-mini` |

### Smart Model Mapping
Automatically translates common model name variations:
- `claude-4.5-opus` → `claude-opus-4.5`
- `claude-4.5-sonnet` → `claude-sonnet-4.5`
- `gpt-4-turbo` → `gpt-4-0125-preview`
- `gemini-3-pro` → `gemini-3-pro-preview`

### Framework & Tool Integration
- **OpenClaw**: Full integration with multi-agent AI workflows
- **Cursor IDE**: Drop-in replacement for Cursor's AI backend
- **Continue**: VS Code AI assistant extension
- **Aider**: AI pair programming in your terminal
- **LangChain/LlamaIndex**: LLM orchestration frameworks
- **Any OpenAI SDK**: Works with official SDKs in Python, Node.js, Go, etc.

## 📋 Prerequisites

- Node.js 22.0 or higher
- GitHub Copilot subscription (Individual, Business, or Enterprise)

## 🔧 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/bjornmelin/github-copilot-proxy.git
   cd github-copilot-proxy
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```

4. Build the project:
   ```bash
   npm run build
   ```

5. Start the proxy server:
   ```bash
   npm start
   ```

   Or run with verbose logging:
   ```bash
   npm run start:verbose
   ```

## 🔌 Configuration with Cursor IDE

1. Open Cursor IDE
2. Go to Settings > API Keys
3. In the "Override OpenAI Base URL" section, enter:
   ```
   http://localhost:3000/v1
   ```
4. Go to http://localhost:3000/auth.html in your browser
5. Follow the authentication steps to connect to GitHub

## 🐾 OpenClaw Integration

This proxy fully supports [OpenClaw](https://github.com/openclaw/openclaw), an AI agent framework that enables building sophisticated multi-agent workflows.

### Quick Start with OpenClaw

1. Install OpenClaw CLI globally:
   ```bash
   npm install -g openclaw
   ```

2. Start the proxy with OpenClaw gateway:
   ```bash
   npm run start:openclaw
   ```

3. Configure OpenClaw to use the proxy:
   ```yaml
   # openclaw.config.yaml
   provider:
     type: openai
     baseUrl: http://localhost:3000/v1
   ```

3. Authenticate at `http://localhost:3000/auth.html`

### OpenClaw Agent Categories

| Category | Description | Recommended Models |
|----------|-------------|-------------------|
| **Workflow** | Orchestration and task management | GPT-4o, Claude Sonnet 4.5 |
| **Processing** | Data transformation and analysis | GPT-4o-mini, Claude Haiku 4.5 |
| **Integration** | External service connections | GPT-4, Gemini 2.5 Pro |
| **Worker** | Background task execution | GPT-3.5-turbo, o3-mini |
| **Sub-agent** | Specialized nested agents | Any supported model |

## 🔧 Other Compatible Applications

### Continue (VS Code Extension)
```json
// ~/.continue/config.json
{
  "models": [{
    "title": "GitHub Copilot via Proxy",
    "provider": "openai",
    "model": "gpt-4o",
    "apiBase": "http://localhost:3000/v1",
    "apiKey": "dummy"
  }]
}
```

### Aider (AI Pair Programming)
```bash
# Set environment variables
export OPENAI_API_BASE=http://localhost:3000/v1
export OPENAI_API_KEY=dummy

# Run Aider with any supported model
aider --model gpt-4o
aider --model claude-sonnet-4.5
```

### LangChain (Python)
```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="gpt-4o",
    base_url="http://localhost:3000/v1",
    api_key="dummy"  # Not validated, but required
)

response = llm.invoke("Hello, how are you?")
```

### LlamaIndex (Python)
```python
from llama_index.llms.openai import OpenAI

llm = OpenAI(
    model="claude-sonnet-4.5",
    api_base="http://localhost:3000/v1",
    api_key="dummy"
)
```

### OpenAI Python SDK
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="dummy"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
    stream=True
)

for chunk in response:
    print(chunk.choices[0].delta.content, end="")
```

### OpenAI Node.js SDK
```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'dummy'
});

const stream = await openai.chat.completions.create({
  model: 'claude-opus-4.5',
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: true
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || '');
}
```

### cURL / REST API
```bash
# List available models
curl http://localhost:3000/v1/models

# Chat completion
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": false
  }'

# Responses API (newer format)
curl http://localhost:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4.5",
    "input": "Explain quantum computing",
    "stream": false
  }'
```

## 🌐 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/models` | GET | List all available models |
| `/v1/completions` | POST | Legacy completions API (for Cursor tab autocomplete) |
| `/v1/chat/completions` | POST | Chat completions (OpenAI format, streaming supported) |
| `/v1/responses` | POST | Responses API (newer OpenAI format, streaming supported) |
| `/auth/status` | GET | Check authentication status |
| `/auth/login` | POST | Initiate GitHub device flow |
| `/auth/logout` | POST | Clear authentication tokens |
| `/auth.html` | GET | Browser-based authentication UI |
| `/usage.html` | GET | Token usage tracking dashboard |

## 💡 Usage Examples

### Basic Chat Completion
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is the capital of France?"}
    ]
  }'
```

### Streaming Response
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4.5",
    "messages": [{"role": "user", "content": "Write a haiku about coding"}],
    "stream": true
  }'
```

### Responses API Format
```bash
curl -X POST http://localhost:3000/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-2.5-pro",
    "input": "Explain machine learning in simple terms",
    "instructions": "Be concise and use analogies"
  }'
```

## 🤔 How It Works

1. The proxy authenticates with GitHub using the OAuth device flow
2. GitHub provides a token that the proxy uses to obtain a Copilot token
3. Tokens are persisted to `.tokens.json` and auto-refresh when expired
4. Your application sends requests to the proxy in OpenAI format
5. The proxy maps model names and converts requests to GitHub Copilot Chat API format
6. The proxy forwards responses back in OpenAI format (with SSE streaming)

## 🎯 Model Mapping

The proxy automatically translates model names to Copilot's format:

| You Request | Copilot Receives |
|-------------|------------------|
| `claude-4.5-opus` | `claude-opus-4.5` |
| `claude-4.5-sonnet` | `claude-sonnet-4.5` |
| `claude-3.5-sonnet` | `claude-sonnet-4` |
| `claude-3-opus` | `claude-opus-4.5` |
| `gpt-4-turbo` | `gpt-4-0125-preview` |
| `gemini-3-pro` | `gemini-3-pro-preview` |
| `gemini-3-flash` | `gemini-3-flash-preview` |
| `o1` | `o1-preview` |

You can use either format - the proxy handles the translation automatically.

## 🛠️ Development

### Available Scripts
```bash
npm run build          # Build the TypeScript project
npm start              # Start the server
npm run start:verbose  # Start with debug logging
npm run start:openclaw # Build and run with OpenClaw gateway (requires: npm i -g openclaw)
npm run dev            # Run in development mode with ts-node
npm test               # Run tests
npm run lint           # Run linting
```

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `HOST` | `localhost` | Server host |
| `LOG_LEVEL` | `info` | Logging level (`error`, `warn`, `info`, `debug`) |

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Applications                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────────────┐ │
│  │ Cursor  │  │OpenClaw │  │Continue │  │ LangChain/Aider │ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────────┬────────┘ │
└───────┼────────────┼────────────┼────────────────┼──────────┘
        │            │            │                │
        └────────────┴─────┬──────┴────────────────┘
                           │
                    OpenAI API Format
                           │
                           ▼
          ┌────────────────────────────────┐
          │   GitHub Copilot Proxy         │
          │   http://localhost:3000/v1    │
          │                                │
          │  • /v1/chat/completions        │
          │  • /v1/responses               │
          │  • /v1/models                  │
          │  • Model name mapping          │
          │  • Token management            │
          │  • SSE streaming               │
          └───────────────┬────────────────┘
                          │
                   GitHub Copilot API
                          │
                          ▼
          ┌────────────────────────────────┐
          │      GitHub Copilot            │
          │                                │
          │  Claude • GPT • Gemini • o1/o3 │
          └────────────────────────────────┘
```

## 🔒 Security Notes

- Tokens are stored locally in `.tokens.json` - **do not commit this file**
- The proxy requires a valid GitHub Copilot subscription
- API key parameter is ignored (authentication via GitHub OAuth)
- Recommended: Run on localhost only in production

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using conventional commits (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## ❓ FAQ

**Q: Do I need to provide an API key?**
A: No. The proxy uses GitHub OAuth device flow for authentication. Any `apiKey` parameter is ignored.

**Q: Which models are available?**
A: All models available through your GitHub Copilot subscription, including Claude, GPT, Gemini, and reasoning models.

**Q: Does streaming work?**
A: Yes! Both `/v1/chat/completions` and `/v1/responses` support SSE streaming.

**Q: Can I use this with other tools?**
A: Yes! Any tool that supports the OpenAI API format can use this proxy - Cursor, OpenClaw, Continue, Aider, LangChain, LlamaIndex, and more.
