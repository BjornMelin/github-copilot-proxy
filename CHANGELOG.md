# Changelog

## [v0.2.0] - 2026-04-05

### Added
- Hybrid provider routing that keeps text/code requests on GitHub Copilot and sends image or vision-model requests to a configurable OpenAI-compatible vision backend
- Vision backend configuration via environment variables for base URL, API key, default model, and supported model list
- Provider routing tests covering image detection, model routing, and merged model discovery

### Changed
- Expanded OpenAI-compatible request handling to accept newer message content arrays, model aliases, and `max_completion_tokens`
- Improved `/v1/models` and `/v1/models/:model` to return models from all configured providers
- Increased request body parsing limits to better handle larger Cursor prompts and multimodal payloads
- Updated streaming handling to emit more Cursor-friendly SSE chunks and proxy streaming responses from the vision backend
- Modernized development and test scripts for the current NodeNext and ESM toolchain
- Updated authentication, Copilot request headers, and documentation for current Cursor compatibility expectations

## [v0.1.0] - 2025-03-24

### Added
- Initial release of GitHub Copilot Proxy
- OAuth Device Flow Authentication with GitHub
- OpenAI-Compatible API endpoints (`/v1/models` and `/v1/chat/completions`)
- Token management with automatic refresh and validation
- Streaming support for real-time completions
- Rate limiting based on requests and token usage
- Usage monitoring and metrics dashboard
- Web-based authentication UI
- Environment variable configuration with Zod validation
- Enhanced .gitignore with additional standard entries

