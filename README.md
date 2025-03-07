# GPM: Generative Package Manager

<div align="center">
[![npm version](https://img.shields.io/npm/v/gpm)](https://www.npmjs.com/package/gpm)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/your-repo/gpm)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/your-repo/gpm/blob/main/CONTRIBUTING.md)

**Supercharge your development workflow with AI-enhanced package management**

[Installation](#installation) •
[Features](#features) •
[Quick Start](#quick-start) •
[Documentation](#documentation) •
[Examples](#examples) •
[Contributing](#contributing)

</div>

## 🌟 Overview

GPM is an enhanced package manager that bridges the gap between traditional package managers and AI coding assistants. It automatically creates MCP (Model Context Protocol) servers for your installed packages, giving LLMs rich, structured context about their functionality and APIs.

## 🎯 Features

- **Multi-language support**: Works with Node.js (npm), Python (pip), and Ruby (gem/bundler)
- **Seamless integration**: Drop-in replacement for existing package managers
- **Project type detection**: Auto-detects project type based on your codebase
- **AI agent awareness**: Detects and optimizes for popular AI coding assistants
- **Package research**: Automatically researches packages from official registries
- **MCP server generation**: Creates context-rich servers for each package
- **API endpoints**: Serves structured data that LLMs can use to understand packages
- **Agent-specific optimization**: Tailors output for different AI coding tools

## 🚀 Why GPM?

GPM helps AI coding assistants understand your dependencies better, resulting in:

- **More accurate code completions**
- **Fewer hallucinations** about API functionality
- **Reduced debugging time** from incorrect AI suggestions
- **Better documentation accessibility** within your workflow
- **Streamlined development** across multiple languages

## 📦 Installation

```bash
npm install -g gpm
```

## 🏁 Quick Start

### Search for packages:

```bash
# Auto-detects project type and searches the appropriate registry
gpm search express
```

### Install packages:

```bash
# Install with automatic MCP server generation
gpm install express

# Install multiple packages
gpm install lodash axios chalk
```

### Start an MCP server:

```bash
# Serve context for an installed package
gpm serve-mcp express
```

## 🧠 AI Agent Integration

GPM detects and optimizes for popular LLM coding agents:

- **Claude Code** - Anthropic's CLI coding assistant
- **Cursor** - AI-powered code editor
- **Aider** - Chat-based coding assistant
- **Copilot** - GitHub's AI pair programmer
- **Continue** - Open-source coding assistant
- **Windsurf** - AI development environment

No configuration needed - GPM automatically detects your AI tools through files, environment variables, processes, and git signatures.

## 📚 Documentation

### Package Search

```bash
# Search with auto-detection
gpm search express

# Force specific registry
gpm search --npm lodash
gpm search --pip pandas
gpm search --gem nokogiri

# Limit results
gpm search react --limit 5
```

### Package Installation

```bash
# Auto-detect and install
gpm install express

# Specify registry
gpm install --npm express
gpm install --pip requests
gpm install --gem rails

# Development dependencies
gpm install --save-dev jest

# Skip MCP server creation
gpm install lodash --no-mcp
```

### MCP Server Management

```bash
# Generate MCP server for existing package
gpm gen-mcp express

# List all packages with MCP servers
gpm list-mcp

# Start MCP server
gpm serve-mcp express

# Custom port
gpm serve-mcp express -p 5000
```

## 🔍 How It Works

When you install a package with GPM:

1. Your project type is detected (Node.js, Python, or Ruby)
2. GPM checks if you're using an AI coding assistant
3. The package is installed using the appropriate package manager
4. GPM researches the package from official registries and GitHub
5. Examples and patterns are extracted from documentation
6. A structured context is created in `.gpm/<package>/research.json`
7. Context is optimized for your AI coding assistant
8. An Express server is generated with API endpoints
9. The MCP server is created in `.gpm/<package>/mcp/`

The MCP server provides these endpoints:

- `/api/context` - Complete context data
- `/api/package` - Package metadata
- `/api/documentation` - Documentation including README
- `/api/examples` - Code examples
- `/api/usage` - Usage patterns
- `/api/reference` - API reference
- `/api/agent-info` - Information about detected AI coding assistant

## 🌈 Examples

### Using GPM with Claude Code

```bash
# Install a package
gpm install express

# Start the MCP server
gpm serve-mcp express

# Now Claude Code can access enhanced context
claude code "Using express, create a simple API server with two endpoints"
```

### Multi-language Project Example

```bash
# In a project with both JavaScript and Python
gpm install axios --npm
gpm install pandas --pip

# Start MCP servers for both
gpm serve-mcp axios
gpm serve-mcp pandas
```

## 🛠️ Contributing

Contributions are welcome! Please check out our [contributing guidelines](CONTRIBUTING.md).

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

<div align="center">
  Made with ❤️ for the AI-assisted development community
</div>
