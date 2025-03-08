# GPM: Generative Package Manager

<div align="center">
**Write Better Code, Faster, With AI That Truly Understands Your Dependencies**

[Installation](#installation) •
[Features](#features) •
[Quick Start](#quick-start) •
[Documentation](#documentation) •
[Examples](#examples) •
[Contributing](#contributing)

</div>

## 🌟 Overview

GPM is an enhanced package manager that bridges the gap between traditional package managers and AI coding assistants. It provides dynamic, intelligent context about your dependencies to LLMs, helping them truly understand the packages you're using.

## 🎯 Features

- **Multi-language support**: Works with Node.js (npm), Python (pip), and Ruby (gem/bundler)
- **Seamless integration**: Drop-in replacement for existing package managers
- **Project type detection**: Auto-detects project type based on your codebase
- **AI agent awareness**: Detects and optimizes for popular AI coding assistants
- **Dynamic package research**: Researches any package on-demand with real-time context
- **Unified MCP server**: Single server that provides context for all your dependencies
- **Rich API endpoints**: Serves structured data that LLMs can use to understand packages
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

### Start the unified MCP server:

```bash
# Start the dynamic unified server for all packages
gpm serve

# Access information about any package via REST API
curl http://localhost:3000/api/package/express
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

### Unified MCP Server

```bash
# Start the unified dynamic server
gpm serve

# Start on a specific port
gpm serve -p 5000

# You can also use the traditional command without specifying a package
gpm serve-mcp
```

### Legacy Package-Specific MCP Servers

```bash
# Generate MCP server for existing package
gpm gen-mcp express

# List all packages with MCP servers
gpm list-mcp

# Start MCP server for a specific package
gpm serve-mcp express
```

## 🔍 How It Works

### The Unified MCP Server

The unified MCP server provides dynamic, on-demand package context:

1. Start the server with `gpm serve`
2. The server exposes REST API endpoints for package research
3. AI assistants can query any package without pre-generation
4. Information is researched in real-time and cached for performance
5. Results are optimized based on the detected AI agent

Available endpoints:

- `/api/packages` - List all installed packages
- `/api/package/:packageName` - Get detailed info about a specific package
- `/api/search/:packageName` - Search for packages across registries
- `/api/context/:packageName` - Get full LLM context for a package
- `/api/examples/:packageName` - Get code examples for a package
- `/api/agent-info` - Get info about the detected AI agent

### Traditional Package Installation

When you install a package with GPM:

1. Your project type is detected (Node.js, Python, or Ruby)
2. GPM checks if you're using an AI coding assistant
3. The package is installed using the appropriate package manager
4. Research data is stored for future use by the unified server
5. Legacy package-specific MCP servers can still be generated if needed

## 🌈 Examples

### Using the Unified MCP Server

```bash
# Start the unified server
gpm serve

# Now AI assistants can dynamically research any package
# without requiring pre-generation of server files
```

### Integration with AI Tools

```bash
# Start the unified MCP server
gpm serve

# AI assistants can now request context about any package:
# curl http://localhost:3000/api/context/express
# curl http://localhost:3000/api/examples/react
# curl http://localhost:3000/api/package/pandas
```

### Multi-language Support

```bash
# The unified server works with any language
# without needing separate servers for each

# Query a Node.js package
curl http://localhost:3000/api/context/express

# Query a Python package
curl http://localhost:3000/api/context/pandas

# Query a Ruby gem
curl http://localhost:3000/api/context/rails
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
