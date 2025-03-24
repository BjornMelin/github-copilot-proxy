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

## 📋 Prerequisites

- Node.js 18.0 or higher
- GitHub Copilot subscription
- Cursor IDE

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

## 🔌 Configuration with Cursor IDE

1. Open Cursor IDE
2. Go to Settings > API Keys
3. In the "Override OpenAI Base URL" section, enter:
   ```
   http://localhost:3000
   ```
4. Go to http://localhost:3000 in your browser
5. Follow the authentication steps to connect to GitHub

## 💡 Usage

Once configured, you can use Cursor IDE as normal. All AI-powered features will now use your GitHub Copilot subscription instead of Cursor's API.

To switch back to Cursor's API:
1. Go to Settings > API Keys
2. Remove the Override OpenAI Base URL

## 🤔 How It Works

1. The proxy authenticates with GitHub using the OAuth device flow
2. GitHub provides a token that the proxy uses to obtain a Copilot token
3. Cursor sends requests to the proxy in OpenAI format
4. The proxy converts these requests to GitHub Copilot's format
5. The proxy forwards responses back to Cursor in OpenAI format

## 🛠️ Development

### Running in development mode:
```bash
npm run dev
```

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
