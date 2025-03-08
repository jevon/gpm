import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { createMcpServer } from './createMcpServer.js';
import { detectAgent } from '../utils/detectAgent.js';
import { ProjectType, detectProjectType } from '../utils/detectProjectType.js';

/**
 * Start a unified MCP server that can dynamically research and provide context for any package
 */
export async function serveMcp(packageName?: string, port: number = 3000): Promise<void> {
  const spinner = ora(`Starting MCP server...`).start();
  const mcpDir = path.join(process.cwd(), '.gpm', 'unified-mcp');
  
  try {
    // Create the unified MCP directory if it doesn't exist
    await fs.mkdir(mcpDir, { recursive: true });
    
    // Create the unified server file
    await createUnifiedServerFile(mcpDir);
    
    // Create package.json for the unified server
    await createPackageJson(mcpDir);
    
    // Ensure dependencies are installed
    spinner.text = "Checking for required dependencies...";
    try {
      await fs.access(path.join(mcpDir, 'node_modules/express'), fs.constants.F_OK);
    } catch (error) {
      spinner.text = "Installing dependencies...";
      try {
        await new Promise((resolve, reject) => {
          const install = exec('npm install', { cwd: mcpDir });
          install.stdout?.on('data', data => console.log(chalk.gray(data.toString().trim())));
          install.stderr?.on('data', data => console.log(chalk.yellow(data.toString().trim())));
          install.on('close', code => {
            if (code === 0) resolve(null);
            else reject(new Error(`npm install failed with code ${code}`));
          });
        });
      } catch (installError) {
        spinner.fail(`Failed to install dependencies: ${installError.message}`);
        console.log(chalk.red("Cannot start server without required dependencies"));
        return;
      }
    }
    
    // Start the server
    spinner.succeed(`Starting unified MCP server on port ${port}`);
    
    const server = exec(`PORT=${port} node server.js`, { cwd: mcpDir });
    
    server.stdout?.on('data', (data) => {
      console.log(chalk.blue(data.toString().trim()));
    });
    
    server.stderr?.on('data', (data) => {
      console.error(chalk.red(data.toString().trim()));
    });
    
    // Handle Ctrl+C to gracefully shut down the server
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\nStopping MCP server...'));
      server.kill();
      process.exit(0);
    });
    
    // Keep the process running
    console.log(chalk.green('Press Ctrl+C to stop the server'));
    
  } catch (error) {
    spinner.fail(`Failed to start unified MCP server`);
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
  }
}

/**
 * Create the unified MCP server file
 */
async function createUnifiedServerFile(mcpDir: string): Promise<void> {
  const serverContent = `import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

// Cache for package research results
const packageCache = new Map();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Root path - provide info about available endpoints
app.get('/', (req, res) => {
  res.json({
    message: "Unified MCP Server",
    description: "Dynamic package research and context provider for AI coding assistants",
    endpoints: [
      '/api/packages',
      '/api/package/:packageName',
      '/api/search/:packageName',
      '/api/context/:packageName',
      '/api/examples/:packageName',
      '/api/agent-info'
    ],
    usage: "Send requests to specific endpoints with package names to get information"
  });
});

// Get detected agent information
app.get('/api/agent-info', async (req, res) => {
  try {
    const result = await detectAgent();
    res.json(result);
  } catch (error) {
    console.error('Error detecting agent:', error);
    res.status(500).json({ error: 'Failed to detect agent' });
  }
});

// Get list of installed packages
app.get('/api/packages', async (req, res) => {
  try {
    const type = req.query.type || 'all';
    const packages = await getInstalledPackages(type.toString());
    res.json(packages);
  } catch (error) {
    console.error('Error getting packages:', error);
    res.status(500).json({ error: 'Failed to get packages' });
  }
});

// Search for a package
app.get('/api/search/:packageName', async (req, res) => {
  const packageName = req.params.packageName;
  const type = req.query.type || 'all';
  
  try {
    const searchResults = await searchPackage(packageName, type.toString());
    res.json(searchResults);
  } catch (error) {
    console.error(\`Error searching for package \${packageName}:\`, error);
    res.status(500).json({ error: \`Failed to search for package \${packageName}\` });
  }
});

// Get detailed information about a specific package
app.get('/api/package/:packageName', async (req, res) => {
  const packageName = req.params.packageName;
  const type = req.query.type || 'auto';
  const forceRefresh = req.query.refresh === 'true';
  
  try {
    const packageInfo = await getPackageInfo(packageName, type.toString(), forceRefresh);
    res.json(packageInfo);
  } catch (error) {
    console.error(\`Error getting package info for \${packageName}:\`, error);
    res.status(500).json({ error: \`Failed to get package info for \${packageName}\` });
  }
});

// Get full context for a package (for LLMs)
app.get('/api/context/:packageName', async (req, res) => {
  const packageName = req.params.packageName;
  const type = req.query.type || 'auto';
  const forceRefresh = req.query.refresh === 'true';
  
  try {
    const packageInfo = await getPackageInfo(packageName, type.toString(), forceRefresh);
    
    // Get agent info
    const agentInfo = await detectAgent();
    
    // Create context with agent optimizations
    const contextData = {
      package: packageInfo.metadata || {},
      documentation: {
        readme: packageInfo.readme || '',
        examples: packageInfo.examples || [],
        apiDocs: packageInfo.apiDocs || ''
      },
      usage: {
        basicUsage: packageInfo.basicUsage || '',
        apiReference: packageInfo.apiReference || {}
      },
      environment: {
        languageType: packageInfo.type || 'unknown',
        framework: packageInfo.framework || 'unknown'
      }
    };
    
    // Add agent optimization if available
    if (agentInfo.detected) {
      contextData.agentMetadata = {
        detected: true,
        agentType: agentInfo.type,
        confidenceScore: agentInfo.confidence
      };
      
      // Add agent-specific optimizations
      const agentOptimizations = getAgentOptimizations(agentInfo.type);
      if (agentOptimizations) {
        contextData.agentOptimized = agentOptimizations;
      }
    }
    
    res.json(contextData);
  } catch (error) {
    console.error(\`Error getting context for \${packageName}:\`, error);
    res.status(500).json({ error: \`Failed to get context for \${packageName}\` });
  }
});

// Get examples for a package
app.get('/api/examples/:packageName', async (req, res) => {
  const packageName = req.params.packageName;
  const type = req.query.type || 'auto';
  
  try {
    const packageInfo = await getPackageInfo(packageName, type.toString());
    res.json({
      examples: packageInfo.examples || [],
      basicUsage: packageInfo.basicUsage || '',
      documentation: packageInfo.readme || ''
    });
  } catch (error) {
    console.error(\`Error getting examples for \${packageName}:\`, error);
    res.status(500).json({ error: \`Failed to get examples for \${packageName}\` });
  }
});

// Helper function to get package information (using cache)
async function getPackageInfo(packageName, type = 'auto', forceRefresh = false) {
  const cacheKey = \`\${packageName}:\${type}\`;
  
  // Check cache first (unless refresh is forced)
  if (!forceRefresh && packageCache.has(cacheKey)) {
    return packageCache.get(cacheKey);
  }
  
  // Research the package
  const result = await researchPackage(packageName, type);
  
  // Store in cache
  packageCache.set(cacheKey, result);
  
  return result;
}

// Helper function to research a package
async function researchPackage(packageName, type = 'auto') {
  console.log(\`Researching package: \${packageName} (type: \${type})\`);
  
  try {
    let packageType = type;
    
    // Auto-detect project type if set to auto
    if (type === 'auto') {
      packageType = await detectPackageType(packageName);
    }
    
    // Get package metadata based on type
    let metadata = {};
    let readme = '';
    let examples = [];
    let apiDocs = '';
    let apiReference = {};
    let basicUsage = '';
    let framework = 'unknown';
    
    switch (packageType) {
      case 'node':
        // Query npm registry
        const npmResult = await execAsync(\`npm view \${packageName} --json\`);
        metadata = JSON.parse(npmResult.stdout);
        
        // Get readme if available
        try {
          const readmeResult = await execAsync(\`npm view \${packageName} readme\`);
          readme = readmeResult.stdout;
        } catch (error) {
          console.log(\`No readme found for \${packageName}\`);
        }
        
        // Extract examples from readme
        examples = extractExamplesFromReadme(readme);
        
        // Generate API reference
        apiReference = await generateApiReference(packageName, 'node');
        
        // Extract basic usage
        basicUsage = examples.length > 0 ? examples[0] : '';
        break;
        
      case 'python':
        // Query PyPI
        const pypiResult = await execAsync(\`pip show \${packageName}\`);
        
        // Parse PyPI output
        const lines = pypiResult.stdout.split('\\n');
        for (const line of lines) {
          const [key, value] = line.split(': ');
          if (key && value) {
            metadata[key.toLowerCase()] = value.trim();
          }
        }
        
        // Get readme from PyPI (if available)
        try {
          const pythonReadme = await fetchPythonReadme(packageName);
          readme = pythonReadme;
        } catch (error) {
          console.log(\`No readme found for \${packageName}\`);
        }
        
        // Extract examples from readme
        examples = extractExamplesFromReadme(readme);
        
        // Generate API reference
        apiReference = await generateApiReference(packageName, 'python');
        
        // Extract basic usage
        basicUsage = examples.length > 0 ? examples[0] : '';
        break;
        
      case 'ruby':
        // Query RubyGems
        const gemResult = await execAsync(\`gem info \${packageName}\`);
        
        // Parse gem output
        const gemLines = gemResult.stdout.split('\\n');
        metadata.name = packageName;
        
        for (const line of gemLines) {
          if (line.includes('Version:')) {
            metadata.version = line.split('Version:')[1].trim();
          }
          if (line.includes('Summary:')) {
            metadata.description = line.split('Summary:')[1].trim();
          }
        }
        
        // Get readme from RubyGems
        try {
          const rubyReadme = await fetchRubyReadme(packageName);
          readme = rubyReadme;
        } catch (error) {
          console.log(\`No readme found for \${packageName}\`);
        }
        
        // Extract examples from readme
        examples = extractExamplesFromReadme(readme);
        
        // Generate API reference
        apiReference = await generateApiReference(packageName, 'ruby');
        
        // Extract basic usage
        basicUsage = examples.length > 0 ? examples[0] : '';
        break;
        
      default:
        throw new Error(\`Unsupported package type: \${packageType}\`);
    }
    
    return {
      metadata,
      readme,
      examples,
      apiDocs,
      apiReference,
      basicUsage,
      type: packageType,
      framework
    };
  } catch (error) {
    console.error(\`Error researching package \${packageName}:\`, error);
    throw error;
  }
}

// Helper function to detect package type
async function detectPackageType(packageName) {
  // Try npm first
  try {
    await execAsync(\`npm view \${packageName} name\`);
    return 'node';
  } catch (error) {
    // Not an npm package, try pip
    try {
      await execAsync(\`pip show \${packageName}\`);
      return 'python';
    } catch (error) {
      // Not a pip package, try gem
      try {
        await execAsync(\`gem info \${packageName}\`);
        return 'ruby';
      } catch (error) {
        // Default to node if can't determine
        return 'node';
      }
    }
  }
}

// Helper function to extract examples from readme
function extractExamplesFromReadme(readme) {
  if (!readme) return [];
  
  const examples = [];
  
  // Look for code blocks in the readme
  const codeBlockRegex = /\`\`\`(?:javascript|js|python|py|ruby|rb)?([\s\S]*?)\`\`\`/g;
  let match;
  
  while ((match = codeBlockRegex.exec(readme)) !== null) {
    if (match[1] && match[1].trim().length > 0) {
      examples.push(match[1].trim());
    }
  }
  
  return examples;
}

// Helper function to generate API reference
async function generateApiReference(packageName, type) {
  // This would be an extensive function to generate API reference
  // For now, return a placeholder
  return {
    methods: [],
    classes: [],
    interfaces: [],
    message: \`API reference for \${packageName} would be generated here\`
  };
}

// Helper function to get installed packages
async function getInstalledPackages(type = 'all') {
  const packages = {
    node: [],
    python: [],
    ruby: []
  };
  
  if (type === 'all' || type === 'node') {
    try {
      const { stdout } = await execAsync('npm list --json --depth=0');
      const npmPackages = JSON.parse(stdout);
      
      if (npmPackages && npmPackages.dependencies) {
        packages.node = Object.keys(npmPackages.dependencies).map(name => ({
          name,
          version: npmPackages.dependencies[name].version
        }));
      }
    } catch (error) {
      console.log('Error getting npm packages:', error);
    }
  }
  
  if (type === 'all' || type === 'python') {
    try {
      const { stdout } = await execAsync('pip list --format=json');
      const pipPackages = JSON.parse(stdout);
      
      packages.python = pipPackages.map(pkg => ({
        name: pkg.name,
        version: pkg.version
      }));
    } catch (error) {
      console.log('Error getting pip packages:', error);
    }
  }
  
  if (type === 'all' || type === 'ruby') {
    try {
      const { stdout } = await execAsync('gem list --local');
      const gemLines = stdout.split('\\n');
      
      for (const line of gemLines) {
        const match = line.match(/^(\\S+) \\(([^)]+)\\)/);
        if (match) {
          packages.ruby.push({
            name: match[1],
            version: match[2].split(',')[0].trim()
          });
        }
      }
    } catch (error) {
      console.log('Error getting gem packages:', error);
    }
  }
  
  return packages;
}

// Helper function to search for packages
async function searchPackage(query, type = 'all') {
  const results = {
    node: [],
    python: [],
    ruby: []
  };
  
  if (type === 'all' || type === 'node') {
    try {
      const { stdout } = await execAsync(\`npm search \${query} --json\`);
      results.node = JSON.parse(stdout).slice(0, 10);
    } catch (error) {
      console.log('Error searching npm packages:', error);
    }
  }
  
  if (type === 'all' || type === 'python') {
    try {
      const { stdout } = await execAsync(\`pip search "\${query}"\`);
      const lines = stdout.split('\\n');
      const pyResults = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(' - ')) {
          const [name, description] = line.split(' - ');
          pyResults.push({
            name: name.trim(),
            description: description.trim()
          });
        }
      }
      
      results.python = pyResults.slice(0, 10);
    } catch (error) {
      console.log('Error searching pip packages:', error);
    }
  }
  
  if (type === 'all' || type === 'ruby') {
    try {
      const { stdout } = await execAsync(\`gem search -r \${query}\`);
      const lines = stdout.split('\\n');
      const rubyResults = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes(' - ')) {
          const [name, description] = line.split(' - ');
          rubyResults.push({
            name: name.trim(),
            description: description.trim()
          });
        }
      }
      
      results.ruby = rubyResults.slice(0, 10);
    } catch (error) {
      console.log('Error searching gem packages:', error);
    }
  }
  
  return results;
}

// Helper function to fetch Python package readme from PyPI
async function fetchPythonReadme(packageName) {
  // This would use fetch to get the readme from PyPI
  // For this example, return a placeholder
  return \`Placeholder readme for Python package \${packageName}\`;
}

// Helper function to fetch Ruby gem readme from RubyGems
async function fetchRubyReadme(packageName) {
  // This would use fetch to get the readme from RubyGems
  // For this example, return a placeholder
  return \`Placeholder readme for Ruby gem \${packageName}\`;
}

// Helper function for agent-specific optimizations
function getAgentOptimizations(agentType) {
  switch (agentType) {
    case 'claude_code':
      return {
        formatHint: "Use markdown code blocks with explicit language tags",
        contextUsage: "Prioritize usage examples and type definitions for Claude",
        exampleStyle: "Provide complete, runnable examples with imports",
        preferredCommentStyle: "Use /** JSDoc style */ comments for functions"
      };
    case 'cursor':
      return {
        formatHint: "Cursor works best with explicit types and object structures",
        contextUsage: "Cursor benefits from comprehensive API examples",
        exampleStyle: "Show full application context in examples",
        preferredCommentStyle: "Use inline comments to explain logic"
      };
    case 'copilot':
      return {
        formatHint: "Copilot benefits from concise examples",
        contextUsage: "Prioritize minimal examples for Copilot",
        exampleStyle: "Focus on short, focused code snippets",
        preferredCommentStyle: "Minimal comments focused on intent"
      };
    case 'aider':
      return {
        formatHint: "Aider works well with clear step-by-step instructions",
        contextUsage: "Provide detailed API documentation for Aider",
        exampleStyle: "Include test cases alongside implementation examples",
        preferredCommentStyle: "Use clear, substantial comments before functions"
      };
    default:
      return null;
  }
}

// Helper function to detect agent type
async function detectAgent() {
  // This would use the detectAgent utility
  // For now, return a basic implementation
  return {
    detected: process.env.CLAUDE_CODE_CLI === 'true',
    type: process.env.CLAUDE_CODE_CLI === 'true' ? 'claude_code' : 'unknown',
    confidence: process.env.CLAUDE_CODE_CLI === 'true' ? 1.0 : 0.0
  };
}

app.listen(PORT, () => {
  console.log(\`Unified MCP server running at http://localhost:\${PORT}\`);
});`;

  await fs.writeFile(path.join(mcpDir, 'server.js'), serverContent);
}

/**
 * Create package.json for the unified MCP server
 */
async function createPackageJson(mcpDir: string): Promise<void> {
  const packageJsonContent = {
    name: 'gpm-unified-mcp-server',
    version: '1.0.0',
    description: 'Unified MCP server for dynamic package research',
    main: 'server.js',
    type: 'module',
    scripts: {
      start: 'node server.js'
    },
    dependencies: {
      express: '^4.18.2',
      cors: '^2.8.5'
    }
  };
  
  await fs.writeFile(
    path.join(mcpDir, 'package.json'),
    JSON.stringify(packageJsonContent, null, 2)
  );
}