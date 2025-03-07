import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProjectType } from '../utils/detectProjectType.js';
import { detectAgent, AgentType } from '../utils/detectAgent.js';

const execAsync = promisify(exec);

interface PackageInfo {
  name: string;
  description?: string;
  version?: string;
  homepage?: string;
  repository?: any;
  bugs?: any;
  license?: string;
  author?: any;
  keywords?: string[];
  main?: string;
  types?: string;
}

interface Research {
  packageInfo: PackageInfo;
  readme: string;
  exampleCode?: string[];
  apiDocs?: string;
  additionalResources?: string[];
  packageType: ProjectType;
}

interface LlmAgentMetadata {
  detected: boolean;
  agentType: AgentType;
  adaptedOutput?: boolean;
  confidenceScore: number;
}

export async function createMcpServer(packageName: string, research: Research): Promise<void> {
  const packageType = research.packageType;
  const spinner = ora(`Creating MCP server for ${packageName}...`).start();
  
  try {
    // Create MCP server directory if it doesn't exist
    const mcpDir = path.join(process.cwd(), '.gpm', packageName, 'mcp');
    await fs.mkdir(mcpDir, { recursive: true });
    
    // Create MCP context file
    spinner.text = `Generating context file for ${packageName}`;
    
    const contextData = await generateContextData(packageName, research);
    await fs.writeFile(
      path.join(mcpDir, 'context.json'),
      JSON.stringify(contextData, null, 2)
    );
    
    // Create MCP server file
    spinner.text = `Creating server file for ${packageName}`;
    await createServerFile(packageName, mcpDir);
    
    // Install required dependencies
    spinner.text = `Installing dependencies for MCP server`;
    await installMcpDependencies(mcpDir);
    
    spinner.succeed(`MCP server created for ${packageName}`);
    console.log(chalk.green(`\nTo start the MCP server, run: gpm serve-mcp ${packageName}`));
    
  } catch (error) {
    spinner.fail(`Failed to create MCP server for ${packageName}`);
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
  }
}

async function generateContextData(packageName: string, research: Research): Promise<any> {
  // Check for LLM coding agent
  const agentInfo = await detectAgent();
  let agentMetadata: LlmAgentMetadata | null = null;
  
  if (agentInfo.detected) {
    console.log(chalk.blue(`Detected LLM coding agent: ${agentInfo.type} (confidence: ${agentInfo.confidence})`));
    agentMetadata = {
      detected: true,
      agentType: agentInfo.type,
      adaptedOutput: true,
      confidenceScore: agentInfo.confidence
    };
  }
  
  // Create a structured context for the package
  const contextData: any = {
    package: {
      name: packageName,
      version: research.packageInfo.version || 'unknown',
      description: research.packageInfo.description || '',
      homepage: research.packageInfo.homepage || '',
      repository: research.packageInfo.repository || '',
      license: research.packageInfo.license || '',
      author: research.packageInfo.author || '',
      keywords: research.packageInfo.keywords || [],
      main: research.packageInfo.main || '',
      types: research.packageInfo.types || ''
    },
    documentation: {
      readme: research.readme || '',
      examples: research.exampleCode || [],
      apiDocs: research.apiDocs || '',
      additionalResources: research.additionalResources || []
    },
    usage: {
      basicUsage: extractBasicUsage(research),
      commonPatterns: extractCommonPatterns(research),
      apiReference: generateApiReference(research)
    },
    environment: {
      languageType: research.packageType,
      packageManager: getPackageManagerForType(research.packageType)
    }
  };
  
  // Add agent metadata if detected
  if (agentMetadata) {
    contextData.agentMetadata = agentMetadata;
    
    // Add agent-specific optimizations
    if (agentMetadata.agentType === AgentType.CLAUDE_CODE) {
      contextData.agentOptimized = {
        formatHint: "Use markdown code blocks with explicit language tags",
        contextUsage: "Prioritize usage examples and type definitions for Claude",
        exampleStyle: "Provide complete, runnable examples with imports",
        preferredCommentStyle: "Use /** JSDoc style */ comments for functions"
      };
    } else if (agentMetadata.agentType === AgentType.CURSOR) {
      contextData.agentOptimized = {
        formatHint: "Cursor works best with explicit types and object structures",
        contextUsage: "Cursor benefits from comprehensive API examples",
        exampleStyle: "Show full application context in examples",
        preferredCommentStyle: "Use inline comments to explain logic"
      };
    } else if (agentMetadata.agentType === AgentType.COPILOT) {
      contextData.agentOptimized = {
        formatHint: "Copilot benefits from concise examples",
        contextUsage: "Prioritize minimal examples for Copilot",
        exampleStyle: "Focus on short, focused code snippets",
        preferredCommentStyle: "Minimal comments focused on intent"
      };
    } else if (agentMetadata.agentType === AgentType.AIDER) {
      contextData.agentOptimized = {
        formatHint: "Aider works well with clear step-by-step instructions",
        contextUsage: "Provide detailed API documentation for Aider",
        exampleStyle: "Include test cases alongside implementation examples",
        preferredCommentStyle: "Use clear, substantial comments before functions"
      };
    }
  }
  
  return contextData;
}

function getPackageManagerForType(projectType: ProjectType): string {
  switch (projectType) {
    case ProjectType.NODE:
      return 'npm';
    case ProjectType.PYTHON:
      return 'pip';
    case ProjectType.RUBY:
      return 'gem';
    default:
      return 'unknown';
  }
}

async function createServerFile(packageName: string, mcpDir: string): Promise<void> {
  const serverContent = `import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Get MCP context
app.get('/api/context', (req, res) => {
  try {
    const contextPath = path.join(__dirname, 'context.json');
    console.log('Attempting to load context from:', contextPath);
    
    if (!fs.existsSync(contextPath)) {
      console.error('Context file does not exist at path:', contextPath);
      return res.status(404).json({ error: 'Context file not found' });
    }
    
    const contextData = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
    if (!contextData) {
      console.error('Context data is empty or invalid');
      return res.status(500).json({ error: 'Context data is empty or invalid' });
    }
    
    console.log('Context loaded successfully');
    res.json(contextData);
  } catch (error) {
    console.error('Failed to load context data:', error);
    res.status(500).json({ error: 'Failed to load context data', details: error.message });
  }
});

// Get LLM agent metadata if available
app.get('/api/agent-info', (req, res) => {
  try {
    const contextPath = path.join(__dirname, 'context.json');
    console.log('Loading agent info from:', contextPath);
    
    if (!fs.existsSync(contextPath)) {
      console.error('Context file not found for agent info');
      return res.status(404).json({ error: 'Context file not found' });
    }
    
    const contextData = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
    
    if (contextData.agentMetadata) {
      res.json(contextData.agentMetadata);
    } else {
      res.json({ detected: false, message: 'No LLM agent detected' });
    }
  } catch (error) {
    console.error('Failed to load agent data:', error);
    res.status(500).json({ error: 'Failed to load agent data', details: error.message });
  }
});

// Get package info
app.get('/api/package', (req, res) => {
  try {
    const contextPath = path.join(__dirname, 'context.json');
    console.log('Loading package info from:', contextPath);
    
    if (!fs.existsSync(contextPath)) {
      console.error('Context file not found for package info');
      return res.status(404).json({ error: 'Context file not found' });
    }
    
    const contextData = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
    if (!contextData.package) {
      console.error('Package information not found in context');
      return res.status(404).json({ error: 'Package information not found in context' });
    }
    
    res.json(contextData.package);
  } catch (error) {
    console.error('Failed to load package data:', error);
    res.status(500).json({ error: 'Failed to load package data', details: error.message });
  }
});

// Get documentation
app.get('/api/documentation', (req, res) => {
  try {
    const contextPath = path.join(__dirname, 'context.json');
    console.log('Loading documentation from:', contextPath);
    
    if (!fs.existsSync(contextPath)) {
      console.error('Context file not found for documentation');
      return res.status(404).json({ error: 'Context file not found' });
    }
    
    const contextData = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
    if (!contextData.documentation) {
      console.error('Documentation not found in context');
      return res.status(404).json({ error: 'Documentation not found in context' });
    }
    
    res.json(contextData.documentation);
  } catch (error) {
    console.error('Failed to load documentation:', error);
    res.status(500).json({ error: 'Failed to load documentation', details: error.message });
  }
});

// Get examples
app.get('/api/examples', (req, res) => {
  try {
    const contextPath = path.join(__dirname, 'context.json');
    console.log('Loading examples from:', contextPath);
    
    if (!fs.existsSync(contextPath)) {
      console.error('Context file not found for examples');
      return res.status(404).json({ error: 'Context file not found' });
    }
    
    const contextData = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
    if (!contextData.documentation || !contextData.documentation.examples) {
      console.log('Examples not found in context, returning empty array');
      return res.json([]);
    }
    
    res.json(contextData.documentation.examples);
  } catch (error) {
    console.error('Failed to load examples:', error);
    res.status(500).json({ error: 'Failed to load examples', details: error.message });
  }
});

// Get usage information
app.get('/api/usage', (req, res) => {
  try {
    const contextPath = path.join(__dirname, 'context.json');
    console.log('Loading usage info from:', contextPath);
    
    if (!fs.existsSync(contextPath)) {
      console.error('Context file not found for usage info');
      return res.status(404).json({ error: 'Context file not found' });
    }
    
    const contextData = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
    if (!contextData.usage) {
      console.error('Usage information not found in context');
      return res.status(404).json({ error: 'Usage information not found in context' });
    }
    
    res.json(contextData.usage);
  } catch (error) {
    console.error('Failed to load usage information:', error);
    res.status(500).json({ error: 'Failed to load usage information', details: error.message });
  }
});

// API Reference
app.get('/api/reference', (req, res) => {
  try {
    const contextPath = path.join(__dirname, 'context.json');
    console.log('Loading API reference from:', contextPath);
    
    if (!fs.existsSync(contextPath)) {
      console.error('Context file not found for API reference');
      return res.status(404).json({ error: 'Context file not found' });
    }
    
    const contextData = JSON.parse(fs.readFileSync(contextPath, 'utf8'));
    if (!contextData.usage || !contextData.usage.apiReference) {
      console.error('API reference not found in context');
      return res.status(404).json({ error: 'API reference not found in context' });
    }
    
    res.json(contextData.usage.apiReference);
  } catch (error) {
    console.error('Failed to load API reference:', error);
    res.status(500).json({ error: 'Failed to load API reference', details: error.message });
  }
});

// Root path - provide info about available endpoints
app.get('/', (req, res) => {
  res.json({
    message: `MCP Server for ${packageName}`,
    endpoints: [
      '/api/context',
      '/api/package',
      '/api/documentation',
      '/api/examples',
      '/api/usage',
      '/api/reference', 
      '/api/agent-info'
    ],
    description: 'Model Context Protocol server providing structured information about this package'
  });
});

app.listen(PORT, () => {
  console.log(\`MCP server for ${packageName} running at http://localhost:\${PORT}\`);
});`;

  await fs.writeFile(path.join(mcpDir, 'server.js'), serverContent);
  
  // Create a package.json for the MCP server
  const packageJsonContent = {
    name: `gpm-mcp-${packageName}`,
    version: '1.0.0',
    description: `MCP server for ${packageName}`,
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

async function installMcpDependencies(mcpDir: string): Promise<void> {
  try {
    // Install the dependencies directly in the MCP server directory
    // This ensures each MCP server has its own dependencies
    await execAsync('npm install', { cwd: mcpDir });
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to install MCP dependencies: ${error.message}`);
    }
  }
}

function extractBasicUsage(research: Research): string {
  // Extract basic usage information from readme or examples
  if (research.exampleCode && research.exampleCode.length > 0) {
    return research.exampleCode[0];
  }
  
  return 'See examples for usage information.';
}

function extractCommonPatterns(research: Research): string[] {
  // Extract common usage patterns
  const patterns: string[] = [];
  
  if (research.readme) {
    // Look for sections in the readme that might contain common patterns
    const sections = research.readme.split(/#{2,3}\s+/);
    
    for (const section of sections) {
      const lowerSection = section.toLowerCase();
      if (
        lowerSection.includes('usage') ||
        lowerSection.includes('example') ||
        lowerSection.includes('common') ||
        lowerSection.includes('pattern') ||
        lowerSection.includes('how to')
      ) {
        patterns.push(section.trim());
      }
    }
  }
  
  return patterns;
}

function generateApiReference(research: Research): any {
  // Generate a simple API reference
  const apiRef: any = {
    methods: [],
    classes: [],
    interfaces: []
  };
  
  // Try to extract API information from types
  if (research.packageInfo.types) {
    // In a real implementation, we would parse the type definitions
    // For now, just note that types are available
    apiRef.hasTypes = true;
    apiRef.typesPath = research.packageInfo.types;
  }
  
  // Try to extract methods and classes from example code
  if (research.exampleCode) {
    for (const example of research.exampleCode) {
      // Extract method calls
      const methodCalls = example.match(/\b\w+\((?:[^)(]|\([^)(]*\))*\)/g);
      if (methodCalls) {
        for (const call of methodCalls) {
          const methodName = call.split('(')[0];
          if (!apiRef.methods.includes(methodName)) {
            apiRef.methods.push(methodName);
          }
        }
      }
      
      // Extract class instantiations
      const classInst = example.match(/new\s+(\w+)/g);
      if (classInst) {
        for (const inst of classInst) {
          const className = inst.split(/\s+/)[1];
          if (!apiRef.classes.includes(className)) {
            apiRef.classes.push(className);
          }
        }
      }
    }
  }
  
  return apiRef;
}