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
import os from 'os';
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
  console.log(`Performing deep research on package: ${packageName} (type: ${type})`);
  
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
    let dependencies = [];
    let popularityMetrics = {};
    let codeAnalysis = {};
    let usagePatterns = [];
    
    switch (packageType) {
      case 'node':
        console.log(`Deep research for Node.js package: ${packageName}`);
        
        // Query npm registry for detailed information
        const npmResult = await execAsync(`npm view ${packageName} --json`);
        metadata = JSON.parse(npmResult.stdout);
        
        // Get readme if available
        try {
          const readmeResult = await execAsync(`npm view ${packageName} readme`);
          readme = readmeResult.stdout;
        } catch (error) {
          console.log(`No readme found for ${packageName}`);
        }
        
        // Extract examples from readme
        examples = extractExamplesFromReadme(readme);
        
        // Generate API reference
        apiReference = await generateApiReference(packageName, 'node');
        
        // Extract basic usage
        basicUsage = examples.length > 0 ? examples[0] : '';
        
        // Get dependencies
        if (metadata.dependencies) {
          dependencies = Object.keys(metadata.dependencies).map(dep => ({
            name: dep,
            version: metadata.dependencies[dep]
          }));
        }
        
        // Get popularity metrics
        try {
          const { stdout: downloadsStdout } = await execAsync(`npm view ${packageName} downloads`);
          if (downloadsStdout) {
            const downloadsMatch = downloadsStdout.match(/last month:\s*([0-9,]+)/i);
            if (downloadsMatch && downloadsMatch[1]) {
              popularityMetrics.monthlyDownloads = downloadsMatch[1].replace(/,/g, '');
            }
          }
          
          // Check if this is a framework or library
          if (metadata.keywords) {
            const frameworkKeywords = ['framework', 'react', 'vue', 'angular', 'next', 'express'];
            const isFramework = metadata.keywords.some(keyword => 
              frameworkKeywords.some(fw => keyword.toLowerCase().includes(fw))
            );
            framework = isFramework ? 'framework' : 'library';
          }
          
          // See if there's a GitHub repository
          if (metadata.repository && metadata.repository.url && metadata.repository.url.includes('github.com')) {
            const repoUrl = metadata.repository.url;
            const githubMatch = repoUrl.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
            
            if (githubMatch && githubMatch.length >= 3) {
              const owner = githubMatch[1];
              const repo = githubMatch[2].replace('.git', '');
              
              try {
                // Get GitHub stars
                const repoInfoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
                if (repoInfoResponse.ok) {
                  const repoInfo = await repoInfoResponse.json();
                  popularityMetrics.stars = repoInfo.stargazers_count;
                  popularityMetrics.forks = repoInfo.forks_count;
                  popularityMetrics.openIssues = repoInfo.open_issues_count;
                }
              } catch (error) {
                console.log(`Error fetching GitHub data for ${packageName}`);
              }
            }
          }
        } catch (error) {
          console.log(`Error fetching popularity metrics for ${packageName}`);
        }
        
        // Perform deeper code analysis for npm packages
        try {
          // Create a temporary directory to install the package for analysis
          const tempDir = path.join(os.tmpdir(), `gpm-research-${packageName}-${Date.now()}`);
          await fs.mkdir(tempDir, { recursive: true });
          
          // Install the package
          await execAsync(`cd ${tempDir} && npm init -y && npm install ${packageName} --no-save`, { timeout: 60000 });
          
          // Find the main file
          const packageJsonPath = path.join(tempDir, 'node_modules', packageName, 'package.json');
          const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
          const mainFile = packageJson.main || 'index.js';
          const mainFilePath = path.join(tempDir, 'node_modules', packageName, mainFile);
          
          // Check if file exists
          try {
            await fs.access(mainFilePath);
            
            // Read file content
            const fileContent = await fs.readFile(mainFilePath, 'utf-8');
            
            // Detect usage patterns
            const importPattern = /(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
            const imports = new Set();
            let match;
            
            while ((match = importPattern.exec(fileContent)) !== null) {
              if (match[1] && !match[1].startsWith('.')) {
                imports.add(match[1]);
              }
            }
            
            codeAnalysis.imports = Array.from(imports);
            
            // Detect common patterns
            const patterns = [];
            
            // Async pattern
            if (fileContent.includes('async') && fileContent.includes('await')) {
              patterns.push('Uses async/await pattern');
            }
            
            // Promise pattern
            if (fileContent.includes('new Promise') || fileContent.includes('.then(')) {
              patterns.push('Uses Promise-based patterns');
            }
            
            // Event emitter
            if (fileContent.includes('EventEmitter') || 
                fileContent.includes('.on(') || 
                fileContent.includes('.emit(')) {
              patterns.push('Uses event-driven programming');
            }
            
            // Stream pattern
            if (fileContent.includes('Stream') || 
                fileContent.includes('.pipe(') || 
                fileContent.includes('Readable') || 
                fileContent.includes('Writable')) {
              patterns.push('Uses Node.js streams');
            }
            
            codeAnalysis.patterns = patterns;
            
            // Count exported items
            const exportMatches = fileContent.match(/(?:module\.)?exports(?:\.([a-zA-Z_$][a-zA-Z0-9_$]*)|\[['"](.*?)['"]\])\s*=/g) || [];
            codeAnalysis.exportCount = exportMatches.length;
            
            // Determine if it's a class-based or function-based package
            const classMatches = fileContent.match(/class\s+[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
            const functionMatches = fileContent.match(/function\s+[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
            
            codeAnalysis.style = classMatches.length > functionMatches.length ? 'class-based' : 'function-based';
            
            // Extract usage patterns from examples
            usagePatterns = examples.map(example => {
              const lines = example.split('\n');
              // Get the first few lines that show how to use the package
              return lines.slice(0, Math.min(5, lines.length)).join('\n');
            });
          } catch (error) {
            console.log(`Error reading main file for ${packageName}`);
          }
          
          // Clean up temp directory
          await execAsync(`rm -rf ${tempDir}`);
        } catch (error) {
          console.log(`Error performing deep code analysis for ${packageName}:`, error);
        }
        break;
        
      case 'python':
        console.log(`Deep research for Python package: ${packageName}`);
        
        // Query PyPI
        try {
          // Try PyPI JSON API first for richer data
          const pypiResponse = await fetch(`https://pypi.org/pypi/${packageName}/json`);
          
          if (pypiResponse.ok) {
            const pypiData = await pypiResponse.json();
            
            metadata = {
              name: pypiData.info.name,
              version: pypiData.info.version,
              description: pypiData.info.summary,
              author: pypiData.info.author,
              authorEmail: pypiData.info.author_email,
              homepage: pypiData.info.home_page || pypiData.info.project_url,
              license: pypiData.info.license,
              keywords: pypiData.info.keywords
            };
            
            // Get dependencies
            if (pypiData.info.requires_dist) {
              dependencies = pypiData.info.requires_dist.map(dep => {
                const parts = dep.split(' ');
                return { name: parts[0], version: parts.slice(1).join(' ') };
              });
            }
            
            // Get download stats from PyPI API
            try {
              const statsResponse = await fetch(`https://pypistats.org/api/packages/${packageName}/recent`);
              if (statsResponse.ok) {
                const statsData = await statsResponse.json();
                popularityMetrics.monthlyDownloads = statsData.data.last_month;
              }
            } catch (error) {
              console.log(`Error fetching PyPI stats for ${packageName}`);
            }
          } else {
            // Fall back to pip show
            const pypiResult = await execAsync(`pip show ${packageName}`);
            
            // Parse PyPI output
            const lines = pypiResult.stdout.split('\\n');
            for (const line of lines) {
              const [key, value] = line.split(': ');
              if (key && value) {
                metadata[key.toLowerCase()] = value.trim();
              }
            }
            
            // Get dependencies from requires
            if (metadata.requires) {
              dependencies = metadata.requires.split(', ').map(dep => ({ name: dep }));
            }
          }
        } catch (error) {
          console.log(`Error fetching PyPI data for ${packageName}`);
          
          // Try pip show as fallback
          try {
            const pypiResult = await execAsync(`pip show ${packageName}`);
            
            // Parse PyPI output
            const lines = pypiResult.stdout.split('\\n');
            for (const line of lines) {
              const [key, value] = line.split(': ');
              if (key && value) {
                metadata[key.toLowerCase()] = value.trim();
              }
            }
          } catch (pipError) {
            console.log(`Error running pip show for ${packageName}`);
          }
        }
        
        // Get readme from PyPI
        try {
          const pythonReadme = await fetchPythonReadme(packageName);
          readme = pythonReadme;
        } catch (error) {
          console.log(`No readme found for ${packageName}`);
        }
        
        // Extract examples from readme
        examples = extractExamplesFromReadme(readme);
        
        // Generate API reference
        apiReference = await generateApiReference(packageName, 'python');
        
        // Extract basic usage
        basicUsage = examples.length > 0 ? examples[0] : '';
        
        // Try to determine if it's a framework or library
        if (metadata.keywords) {
          const frameworkKeywords = ['framework', 'django', 'flask', 'web', 'api'];
          const isFramework = frameworkKeywords.some(keyword => 
            metadata.keywords.toLowerCase().includes(keyword)
          );
          framework = isFramework ? 'framework' : 'library';
        } else if (packageName.toLowerCase().includes('django') || 
                 packageName.toLowerCase().includes('flask') || 
                 packageName.toLowerCase().includes('web')) {
          framework = 'framework';
        } else {
          framework = 'library';
        }
        
        // Try to analyze locally installed package
        try {
          const { stdout } = await execAsync(`pip show -f ${packageName}`);
          const filesSection = stdout.split('Files:')[1];
          
          if (filesSection) {
            const files = filesSection.trim().split('\\n').map(f => f.trim());
            
            // Count .py files
            const pyFiles = files.filter(f => f.endsWith('.py'));
            codeAnalysis.fileCount = pyFiles.length;
            
            // Try to determine if it's class-based or function-based
            // This is a simplistic approach, would need actual code analysis for better results
            const initFile = files.find(f => f.endsWith('__init__.py'));
            
            if (initFile) {
              const locationMatch = stdout.match(/Location: (.+)/);
              if (locationMatch && locationMatch[1]) {
                const packagePath = locationMatch[1].trim();
                const initPath = path.join(packagePath, packageName, '__init__.py');
                
                try {
                  const initContent = await fs.readFile(initPath, 'utf-8');
                  
                  // Count classes and functions
                  const classCount = (initContent.match(/class\s+[A-Za-z0-9_]+/g) || []).length;
                  const functionCount = (initContent.match(/def\s+[A-Za-z0-9_]+/g) || []).length;
                  
                  codeAnalysis.style = classCount > functionCount ? 'class-based' : 'function-based';
                  
                  // Check for common Python patterns
                  const patterns = [];
                  
                  if (initContent.includes('__all__')) {
                    patterns.push('Uses __all__ for explicit exports');
                  }
                  
                  if (initContent.includes('import abc') || initContent.includes('from abc import')) {
                    patterns.push('Uses abstract base classes');
                  }
                  
                  if (initContent.includes('async def')) {
                    patterns.push('Uses asynchronous programming');
                  }
                  
                  if (initContent.includes('@')) {
                    patterns.push('Uses decorators');
                  }
                  
                  codeAnalysis.patterns = patterns;
                } catch (error) {
                  console.log(`Error reading __init__.py for ${packageName}`);
                }
              }
            }
          }
        } catch (error) {
          console.log(`Error analyzing files for ${packageName}`);
        }
        
        // Extract usage patterns from examples
        usagePatterns = examples.map(example => {
          const lines = example.split('\n');
          // Get the first few lines that show how to use the package
          return lines.slice(0, Math.min(5, lines.length)).join('\n');
        });
        break;
        
      case 'ruby':
        console.log(`Deep research for Ruby gem: ${packageName}`);
        
        // Query RubyGems.org API
        try {
          const rubygemsResponse = await fetch(`https://rubygems.org/api/v1/gems/${packageName}.json`);
          
          if (rubygemsResponse.ok) {
            const rubygemsData = await rubygemsResponse.json();
            
            metadata = {
              name: rubygemsData.name,
              version: rubygemsData.version,
              description: rubygemsData.info,
              authors: rubygemsData.authors,
              homepage: rubygemsData.homepage_uri,
              documentation: rubygemsData.documentation_uri,
              sourceCode: rubygemsData.source_code_uri,
              downloads: rubygemsData.downloads
            };
            
            // Popularity metrics
            popularityMetrics.totalDownloads = rubygemsData.downloads;
            popularityMetrics.versionDownloads = rubygemsData.version_downloads;
          } else {
            // Fall back to gem info command
            const gemResult = await execAsync(`gem info ${packageName}`);
            
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
          }
        } catch (error) {
          console.log(`Error fetching RubyGems.org data for ${packageName}`);
          
          // Fall back to gem info command
          try {
            const gemResult = await execAsync(`gem info ${packageName}`);
            
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
          } catch (gemError) {
            console.log(`Error running gem info for ${packageName}`);
          }
        }
        
        // Get readme from RubyGems
        try {
          const rubyReadme = await fetchRubyReadme(packageName);
          readme = rubyReadme;
        } catch (error) {
          console.log(`No readme found for ${packageName}`);
        }
        
        // Extract examples from readme
        examples = extractExamplesFromReadme(readme);
        
        // Generate API reference
        apiReference = await generateApiReference(packageName, 'ruby');
        
        // Extract basic usage
        basicUsage = examples.length > 0 ? examples[0] : '';
        
        // Try to determine if it's a framework or library
        if (packageName.toLowerCase().includes('rails') || 
           packageName.toLowerCase().includes('sinatra') || 
           metadata.description?.toLowerCase().includes('framework')) {
          framework = 'framework';
        } else {
          framework = 'library';
        }
        
        // Get dependencies
        try {
          const { stdout } = await execAsync(`gem dependency ${packageName} --pipe`);
          dependencies = stdout.split('|').map(dep => {
            const parts = dep.trim().split(' ');
            return { name: parts[0], version: parts.slice(1).join(' ') };
          });
        } catch (error) {
          console.log(`Error getting dependencies for ${packageName}`);
        }
        
        // Try to analyze local gem
        try {
          const { stdout } = await execAsync(`gem specification ${packageName} --yaml`);
          
          // This is a very basic approach - a real implementation would parse the YAML
          
          // Try to get gem path
          const gemPathResult = await execAsync(`gem which ${packageName} 2>/dev/null || echo "not found"`);
          const gemPath = gemPathResult.stdout.trim();
          
          if (gemPath && gemPath !== "not found") {
            // Try to read the main gem file
            try {
              const mainRbPath = gemPath.replace(/\/lib\/.*$/, '/lib/' + packageName + '.rb');
              const fileContent = await fs.readFile(mainRbPath, 'utf-8');
              
              // Count classes, modules and methods
              const classCount = (fileContent.match(/class\s+[A-Z][A-Za-z0-9_]*/g) || []).length;
              const moduleCount = (fileContent.match(/module\s+[A-Z][A-Za-z0-9_]*/g) || []).length;
              const methodCount = (fileContent.match(/def\s+[a-z_][A-Za-z0-9_]*/g) || []).length;
              
              codeAnalysis.classCount = classCount;
              codeAnalysis.moduleCount = moduleCount;
              codeAnalysis.methodCount = methodCount;
              codeAnalysis.style = classCount > methodCount ? 'class-based' : 'method-based';
              
              // Check for common Ruby patterns
              const patterns = [];
              
              if (fileContent.includes('extend ')) {
                patterns.push('Uses module extension');
              }
              
              if (fileContent.includes('include ')) {
                patterns.push('Uses module inclusion');
              }
              
              if (fileContent.includes('attr_accessor') || 
                 fileContent.includes('attr_reader') || 
                 fileContent.includes('attr_writer')) {
                patterns.push('Uses attribute accessors');
              }
              
              if (fileContent.includes('yield') || fileContent.includes('block_given?')) {
                patterns.push('Uses block-based programming');
              }
              
              codeAnalysis.patterns = patterns;
            } catch (error) {
              console.log(`Error reading main file for gem ${packageName}`);
            }
          }
        } catch (error) {
          console.log(`Error analyzing gem ${packageName}`);
        }
        
        // Extract usage patterns from examples
        usagePatterns = examples.map(example => {
          const lines = example.split('\n');
          // Get the first few lines that show how to use the package
          return lines.slice(0, Math.min(5, lines.length)).join('\n');
        });
        break;
        
      default:
        throw new Error(`Unsupported package type: ${packageType}`);
    }
    
    // Return comprehensive research results
    return {
      metadata,
      readme,
      examples,
      apiDocs,
      apiReference,
      basicUsage,
      type: packageType,
      framework,
      dependencies,
      popularityMetrics,
      codeAnalysis,
      usagePatterns,
      researchTimestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error researching package ${packageName}:`, error);
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
  try {
    console.log(`Generating API reference for ${packageName} (${type})`);
    
    if (type === 'node') {
      // For Node.js packages
      try {
        // Try to get types information if available
        const { stdout: typesOutput } = await execAsync(`npm view ${packageName} types typings --json`);
        const typesInfo = JSON.parse(typesOutput || '{}');
        const hasTypes = typesInfo.types || typesInfo.typings;
        
        // If package has TypeScript definitions, try to extract API info from them
        if (hasTypes) {
          console.log(`${packageName} has TypeScript definitions`);
          
          // Get package files to analyze
          let packageFiles = [];
          try {
            // Create a temporary directory to install the package
            const tempDir = path.join(os.tmpdir(), `gpm-api-${packageName}-${Date.now()}`);
            await fs.mkdir(tempDir, { recursive: true });
            
            // Install the package in the temp directory
            await execAsync(`cd ${tempDir} && npm init -y && npm install ${packageName} --no-save`, { timeout: 60000 });
            
            // Get main file
            const { stdout: packageJson } = await execAsync(`npm view ${packageName} main --json`);
            const mainFile = JSON.parse(packageJson || '""');
            
            // Find the installed package directory
            const packagePath = path.join(tempDir, 'node_modules', packageName);
            const mainFilePath = path.join(packagePath, mainFile || 'index.js');
            
            // Analyze the main file for exports
            const { stdout: fileContent } = await execAsync(`cat ${mainFilePath}`);
            
            // Basic regex extraction of methods and classes
            const methodRegex = /(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
            const classRegex = /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
            
            const methods = [];
            const classes = [];
            
            let match;
            while ((match = methodRegex.exec(fileContent)) !== null) {
              if (match[1] && !methods.includes(match[1])) {
                methods.push(match[1]);
              }
            }
            
            while ((match = classRegex.exec(fileContent)) !== null) {
              if (match[1] && !classes.includes(match[1])) {
                classes.push(match[1]);
              }
            }
            
            // Extract exports
            const exportRegex = /(?:module\.)?exports(?:\.([a-zA-Z_$][a-zA-Z0-9_$]*)|\[['"](.*?)['"]\])\s*=/g;
            const exports = [];
            
            while ((match = exportRegex.exec(fileContent)) !== null) {
              if (match[1] && !exports.includes(match[1])) {
                exports.push(match[1]);
              }
              if (match[2] && !exports.includes(match[2])) {
                exports.push(match[2]);
              }
            }
            
            // Clean up temporary directory
            await execAsync(`rm -rf ${tempDir}`);
            
            return {
              methods,
              classes,
              exports,
              interfaces: [],
              hasTypes: true,
              typesFile: hasTypes
            };
          } catch (error) {
            console.error(`Error analyzing package files for ${packageName}:`, error);
          }
        }
        
        // Fall back to extracting from npm registry information
        const { stdout: packageInfoJson } = await execAsync(`npm view ${packageName} --json`);
        const packageInfo = JSON.parse(packageInfoJson);
        
        return {
          methods: [],
          classes: [],
          interfaces: [],
          hasTypes: Boolean(hasTypes),
          packageInfo: {
            main: packageInfo.main,
            bin: packageInfo.bin,
            dependencies: packageInfo.dependencies,
            peerDependencies: packageInfo.peerDependencies
          }
        };
      } catch (error) {
        console.error(`Error generating API reference for ${packageName}:`, error);
        return {
          methods: [],
          classes: [],
          interfaces: [],
          error: error.message
        };
      }
    } else if (type === 'python') {
      // For Python packages
      try {
        // Get package information
        const { stdout } = await execAsync(`pip show ${packageName}`);
        
        // Try to get package location
        const locationMatch = stdout.match(/Location: (.+)/);
        let packagePath = null;
        
        if (locationMatch && locationMatch[1]) {
          packagePath = path.join(locationMatch[1].trim(), packageName);
          
          // Check if the directory exists
          try {
            await fs.access(packagePath);
            
            // Look for __init__.py or primary module files
            const initFile = path.join(packagePath, '__init__.py');
            try {
              const fileContent = await fs.readFile(initFile, 'utf-8');
              
              // Extract classes
              const classRegex = /class\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
              const classes = [];
              
              let match;
              while ((match = classRegex.exec(fileContent)) !== null) {
                if (match[1] && !classes.includes(match[1])) {
                  classes.push(match[1]);
                }
              }
              
              // Extract functions
              const funcRegex = /def\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
              const functions = [];
              
              while ((match = funcRegex.exec(fileContent)) !== null) {
                if (match[1] && !functions.includes(match[1]) && !match[1].startsWith('_')) {
                  functions.push(match[1]);
                }
              }
              
              return {
                methods: functions,
                classes,
                modules: [],
                packagePath
              };
            } catch (error) {
              console.log(`No __init__.py found for ${packageName}`);
            }
          } catch (error) {
            console.log(`Package directory not found for ${packageName}`);
          }
        }
        
        // Fall back to generic information
        return {
          methods: [],
          classes: [],
          modules: [],
          summary: "API reference information could not be extracted automatically"
        };
      } catch (error) {
        console.error(`Error generating API reference for Python package ${packageName}:`, error);
        return {
          methods: [],
          classes: [],
          modules: [],
          error: error.message
        };
      }
    } else if (type === 'ruby') {
      // For Ruby gems
      try {
        // Try to get gem documentation
        const { stdout } = await execAsync(`gem specification ${packageName} --yaml`);
        
        // Parse YAML output
        const moduleRegex = /module\s+([A-Z][a-zA-Z0-9_]*)/g;
        const classRegex = /class\s+([A-Z][a-zA-Z0-9_]*)/g;
        const methodRegex = /def\s+([a-z_][a-zA-Z0-9_]*)/g;
        
        const modules = [];
        const classes = [];
        const methods = [];
        
        // Get gem path
        const gemPathResult = await execAsync(`gem which ${packageName} 2>/dev/null || echo "not found"`);
        const gemPath = gemPathResult.stdout.trim();
        
        if (gemPath !== "not found") {
          // Try to read the main gem file
          try {
            const mainRbPath = gemPath.replace(/\/lib\/.*$/, '/lib/' + packageName + '.rb');
            const fileContent = await fs.readFile(mainRbPath, 'utf-8');
            
            let match;
            while ((match = moduleRegex.exec(fileContent)) !== null) {
              if (match[1] && !modules.includes(match[1])) {
                modules.push(match[1]);
              }
            }
            
            while ((match = classRegex.exec(fileContent)) !== null) {
              if (match[1] && !classes.includes(match[1])) {
                classes.push(match[1]);
              }
            }
            
            while ((match = methodRegex.exec(fileContent)) !== null) {
              if (match[1] && !methods.includes(match[1]) && !match[1].startsWith('_')) {
                methods.push(match[1]);
              }
            }
          } catch (error) {
            console.log(`Could not read main file for gem ${packageName}`);
          }
        }
        
        return {
          modules,
          classes,
          methods,
          gemPath: gemPath !== "not found" ? gemPath : null
        };
      } catch (error) {
        console.error(`Error generating API reference for Ruby gem ${packageName}:`, error);
        return {
          modules: [],
          classes: [],
          methods: [],
          error: error.message
        };
      }
    }
    
    // Default fallback
    return {
      methods: [],
      classes: [],
      interfaces: [],
      message: `API reference generation not implemented for type: ${type}`
    };
  } catch (error) {
    console.error(`Error in generateApiReference for ${packageName}:`, error);
    return {
      methods: [],
      classes: [],
      interfaces: [],
      error: error.message
    };
  }
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
  console.log(`Fetching README for Python package: ${packageName}`);
  
  try {
    // Try PyPI JSON API first
    const response = await fetch(`https://pypi.org/pypi/${packageName}/json`);
    
    if (response.ok) {
      const data = await response.json();
      
      // Check if description is available
      if (data.info && data.info.description) {
        return data.info.description;
      }
      
      // If no description in JSON, try to get README from the package's homepage
      if (data.info && data.info.project_urls) {
        // Check for GitHub repository links
        let githubUrl = null;
        
        // Look for GitHub links in project_urls
        for (const [key, url] of Object.entries(data.info.project_urls)) {
          if (typeof url === 'string' && url.includes('github.com')) {
            githubUrl = url;
            break;
          }
        }
        
        // If found GitHub URL, try to get README
        if (githubUrl) {
          // Parse GitHub URL to get owner and repo
          const githubMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
          
          if (githubMatch && githubMatch.length >= 3) {
            const owner = githubMatch[1];
            const repo = githubMatch[2].replace('.git', '');
            
            // Try different README filenames
            const readmeFilenames = ['README.md', 'README.rst', 'README.txt', 'README'];
            
            for (const filename of readmeFilenames) {
              try {
                const readmeResponse = await fetch(
                  `https://raw.githubusercontent.com/${owner}/${repo}/master/${filename}`
                );
                
                if (readmeResponse.ok) {
                  return await readmeResponse.text();
                }
              } catch (error) {
                console.log(`Error fetching ${filename} from GitHub for ${packageName}`);
              }
            }
          }
        }
      }
      
      // If we still don't have a README, try to scrape PyPI webpage
      const htmlResponse = await fetch(`https://pypi.org/project/${packageName}/`);
      
      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        
        // Extract description section from HTML
        const descriptionMatch = html.match(/<div[^>]+class="[^"]*project-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        
        if (descriptionMatch && descriptionMatch[1]) {
          // Simple HTML cleanup
          return descriptionMatch[1]
            .replace(/<\/?[^>]+(>|$)/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ')         // Replace non-breaking spaces
            .replace(/&lt;/g, '<')           // Replace special characters
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')            // Normalize whitespace
            .trim();
        }
      }
    }
    
    // If all else fails, fall back to pip show description
    try {
      const { stdout } = await execAsync(`pip show ${packageName}`);
      const summaryMatch = stdout.match(/Summary: (.*)/);
      
      if (summaryMatch && summaryMatch[1]) {
        return `${summaryMatch[1]}\n\nNote: Full README could not be retrieved. This is the package summary.`;
      }
    } catch (error) {
      console.error(`Error running pip show for ${packageName}:`, error);
    }
    
    return `No README found for Python package ${packageName}`;
  } catch (error) {
    console.error(`Error fetching README for Python package ${packageName}:`, error);
    return `Error fetching README for Python package ${packageName}: ${error.message}`;
  }
}

// Helper function to fetch Ruby gem readme from RubyGems
async function fetchRubyReadme(packageName) {
  console.log(`Fetching README for Ruby gem: ${packageName}`);
  
  try {
    // Try RubyGems.org API first
    const response = await fetch(`https://rubygems.org/api/v1/gems/${packageName}.json`);
    
    if (response.ok) {
      const data = await response.json();
      
      // Look for GitHub repository URL
      let githubUrl = null;
      
      // Check various possible repository URLs in the gem data
      const possibleRepoUrls = [
        data.source_code_uri,
        data.homepage_uri,
        data.project_uri
      ];
      
      for (const url of possibleRepoUrls) {
        if (url && url.includes('github.com')) {
          githubUrl = url;
          break;
        }
      }
      
      // If found GitHub URL, try to get README
      if (githubUrl) {
        console.log(`Found GitHub URL for ${packageName}: ${githubUrl}`);
        
        // Parse GitHub URL to get owner and repo
        const githubMatch = githubUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
        
        if (githubMatch && githubMatch.length >= 3) {
          const owner = githubMatch[1];
          const repo = githubMatch[2].replace('.git', '');
          
          // Try different README filenames
          const readmeFilenames = ['README.md', 'README.rdoc', 'README.textile', 'README.txt', 'README'];
          
          for (const filename of readmeFilenames) {
            try {
              console.log(`Trying to fetch ${filename} from GitHub for ${packageName}`);
              
              const readmeResponse = await fetch(
                `https://raw.githubusercontent.com/${owner}/${repo}/master/${filename}`
              );
              
              if (readmeResponse.ok) {
                const content = await readmeResponse.text();
                console.log(`Successfully fetched ${filename} from GitHub for ${packageName}`);
                return content;
              }
            } catch (error) {
              console.log(`Error fetching ${filename} from GitHub for ${packageName}`);
            }
          }
        }
      }
      
      // If we couldn't get README from GitHub, try to use the gem description
      if (data.info) {
        return `${data.info}\n\nNote: This is the gem summary. Full README could not be retrieved.`;
      }
    }
    
    // If RubyGems.org API fails, try to scrape the gem page
    try {
      console.log(`Trying to scrape RubyGems.org page for ${packageName}`);
      const htmlResponse = await fetch(`https://rubygems.org/gems/${packageName}`);
      
      if (htmlResponse.ok) {
        const html = await htmlResponse.text();
        
        // Extract description section from HTML
        const descriptionMatch = html.match(/<div[^>]+class="[^"]*gem__desc[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        
        if (descriptionMatch && descriptionMatch[1]) {
          // Simple HTML cleanup
          return descriptionMatch[1]
            .replace(/<\/?[^>]+(>|$)/g, '') // Remove HTML tags
            .replace(/&nbsp;/g, ' ')         // Replace non-breaking spaces
            .replace(/&lt;/g, '<')           // Replace special characters
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')            // Normalize whitespace
            .trim();
        }
      }
    } catch (error) {
      console.error(`Error scraping RubyGems.org page for ${packageName}:`, error);
    }
    
    // If all else fails, try to get information from locally installed gem
    try {
      console.log(`Trying to get README from locally installed gem ${packageName}`);
      const { stdout } = await execAsync(`gem specification ${packageName} description -l`);
      
      if (stdout.trim()) {
        return stdout.trim();
      }
    } catch (error) {
      console.error(`Error getting local gem specification for ${packageName}:`, error);
    }
    
    return `No README found for Ruby gem ${packageName}`;
  } catch (error) {
    console.error(`Error fetching README for Ruby gem ${packageName}:`, error);
    return `Error fetching README for Ruby gem ${packageName}: ${error.message}`;
  }
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