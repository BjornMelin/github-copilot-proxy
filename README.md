# GitHub Copilot Proxy for Cursor IDE

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18.0+-green.svg)](https://nodejs.org/)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)

A proxy server that enables Cursor IDE to use GitHub Copilot's API instead of Cursor's default AI services. This allows you to use your GitHub Copilot subscription with Cursor IDE, maximizing your resources by switching between services as needed.

## 🚀 Features

- **OpenAI API Compatibility**: Implements the OpenAI API format that Cursor IDE can use
- **GitHub Copilot Integration**: Connects to GitHub Copilot's backend services
- **Seamless Authentication**: Handles GitHub OAuth device flow authentication
- **Token Management**: Automatically refreshes Copilot tokens
- **Streaming Support**: Supports both streaming and non-streaming completions
- **Easy Configuration**: Simple setup with Cursor IDE
- **Cursor 3 Compatibility Improvements**: Supports larger request payloads, newer OpenAI-style message content, and broader model aliasing
- **Hybrid Provider Routing**: Routes text/code requests to Copilot and multimodal requests to an OpenAI-compatible vision backend

## 📋 Prerequisites

- Node.js 18.0 or higher
- GitHub Copilot subscription
- Cursor IDE

## 🔧 Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/ronnypark/github-copilot-proxy.git
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

## 🔌 Configuration with Cursor IDE

1. Open Cursor IDE
2. Open the OpenAI-compatible provider settings for your custom model endpoint
3. Set the base URL to:
   ```
   http://localhost:3000
   ```
4. Use any placeholder API key if Cursor requires one for saving the provider configuration
5. Go to http://localhost:3000 in your browser
6. Follow the authentication steps to connect to GitHub

## ✅ Current Cursor Support

- Supported today: `GET /v1/models`, `GET /v1/models/:model`, `POST /v1/chat/completions`
- Streaming is supported with OpenAI-style SSE chunks
- The proxy now accepts newer text-content arrays used by modern OpenAI-compatible clients
- Request bodies up to `10mb` are accepted by default, which is safer for larger Cursor prompts and code context
- Image requests can be routed to a separate OpenAI-compatible vision backend when configured

## 🔭 Vision Backend Setup

To enable real image support, configure an OpenAI-compatible multimodal backend:

```bash
VISION_BACKEND_NAME=openai-compatible-vision
VISION_BACKEND_BASE_URL=https://your-provider.example/v1
VISION_BACKEND_API_KEY=your_api_key
VISION_BACKEND_DEFAULT_MODEL=gpt-4o
VISION_BACKEND_MODELS=gpt-4o,gpt-4.1,claude-opus-4.1
```

Behavior:

- Requests containing `image_url` content parts are routed to the vision backend
- Requests that explicitly target a configured vision model are routed there even without images
- Standard Copilot-friendly text/code models continue to use the GitHub Copilot backend

## ⚠️ Current Limitations

- This proxy is still a chat-completions bridge. It does not implement `responses`, `embeddings`, audio, or image generation endpoints.
- Tool calling fields are accepted and ignored rather than executed.
- Authentication and usage tracking are in-memory only, so multi-instance deployments need shared state.
- Copilot backend behavior is still constrained by GitHub's internal API contracts, not Cursor's public model catalog.
- The vision backend must expose an OpenAI-compatible `/chat/completions` endpoint.

## 🔧 Recommended Environment Settings

```bash
HOST=0.0.0.0
PORT=3000
REQUEST_BODY_LIMIT=10mb
COPILOT_EDITOR_VERSION=Cursor/3.0.0
COPILOT_EDITOR_PLUGIN_VERSION=github-copilot-proxy/0.2.0
VISION_BACKEND_BASE_URL=
VISION_BACKEND_API_KEY=
```

Use `HOST=0.0.0.0` when running in Docker, Codespaces, or another remote environment where Cursor is connecting from outside the container.

## 💡 Usage

Once configured, you can use Cursor IDE as normal. All AI-powered features will now use your GitHub Copilot subscription instead of Cursor's API.

To switch back to Cursor's API:
1. Go to Settings > API Keys
2. Remove the Override OpenAI Base URL

## 🤔 How It Works

1. The proxy authenticates with GitHub using the OAuth device flow
2. GitHub provides a token that the proxy uses to obtain a Copilot token
3. Cursor sends requests to the proxy in OpenAI format
4. The proxy routes text and code requests to Copilot and multimodal requests to the configured vision backend
5. The proxy forwards responses back to Cursor in OpenAI format

## 🛠️ Development

### Running in development mode:
```bash
npm run dev
```

The development script now uses Node's ESM loader for `ts-node`, which is required by this project's `NodeNext` module configuration.

### Testing:
```bash
npm test
```

### Linting:
```bash
npm run lint
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using conventional commits (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
