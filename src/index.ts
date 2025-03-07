#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { install } from './commands/install.js';
import { pythonInstall } from './commands/pythonInstall.js';
import { rubyInstall } from './commands/rubyInstall.js';
import { createMcpServer } from './commands/createMcpServer.js';
import { researchPackage } from './utils/researchPackage.js';
import { serveMcp } from './commands/serveMcp.js';
import { searchPackages } from './commands/search.js';
import { detectProjectType, ProjectType } from './utils/detectProjectType.js';
import { promisify } from 'util';
import { exec as execCb } from 'child_process';

const execAsync = promisify(execCb);

const program = new Command();

// Set up the basic program info
program
  .name('gpm')
  .description('Generative Package Manager - multi-language package manager with AI context protocol')
  .version('0.2.0');

// Add --help examples
program.addHelpText('after', `
Examples:
  # Auto-detect project type and install packages
  $ gpm install express         # Node.js projects
  $ gpm install requests        # Python projects
  $ gpm install nokogiri        # Ruby projects

  # Force specific package manager
  $ gpm install --npm lodash
  $ gpm install --pip pandas
  $ gpm install --gem rails

  # Create MCP server for existing packages
  $ gpm gen-mcp express
  $ gpm serve-mcp express

  # MCP servers support all language ecosystems
  $ gpm gen-mcp --pip requests
  $ gpm gen-mcp --gem nokogiri

Features:
  • Auto-detects LLM coding agents (Cursor, Claude Code, Aider, etc.)
  • Optimizes context for your specific AI assistant
  • Creates Model Context Protocol servers for any package

For more information, see: https://github.com/yourusername/gpm
`);

// Detect project type
async function installByProjectType(packages: string[], options: any) {
  const projectType = await detectProjectType();
  console.log(chalk.blue(`Detected project type: ${projectType}`));
  
  if (!packages || packages.length === 0) {
    // If no packages provided, behave like regular install based on project type
    if (projectType === ProjectType.NODE) {
      await install([], options);
    } else if (projectType === ProjectType.PYTHON) {
      await pythonInstall([], options);
    } else if (projectType === ProjectType.RUBY) {
      await rubyInstall([], options);
    } else {
      // Default to npm if unknown
      console.log(chalk.yellow('Unknown project type, defaulting to npm'));
      await install([], options);
    }
    return;
  }
  
  for (const pkg of packages) {
    console.log(chalk.green(`Installing ${pkg}...`));
    
    let success = false;
    
    if (projectType === ProjectType.NODE) {
      success = await install([pkg], options);
    } else if (projectType === ProjectType.PYTHON) {
      success = await pythonInstall([pkg], options);
    } else if (projectType === ProjectType.RUBY) {
      success = await rubyInstall([pkg], options);
    } else {
      // Default to npm if unknown
      console.log(chalk.yellow('Unknown project type, defaulting to npm'));
      success = await install([pkg], options);
    }
    
    if (success && options.mcp !== false) {
      console.log(chalk.blue(`Researching ${pkg} for MCP context...`));
      const research = await researchPackage(pkg, projectType);
      console.log(chalk.blue(`Creating MCP server for ${pkg}...`));
      await createMcpServer(pkg, research);
    }
  }
}

// Install command
program
  .command('install [packages...]')
  .alias('i')
  .description('Install a package and generate MCP server for it')
  .option('-D, --save-dev', 'Save package as a development dependency')
  .option('-g, --global', 'Install globally')
  .option('--no-mcp', 'Skip MCP server creation')
  .option('--npm', 'Force using npm (Node.js) regardless of project type')
  .option('--pip', 'Force using pip (Python) regardless of project type')
  .option('--gem', 'Force using gem (Ruby) regardless of project type')
  .option('--user', 'Install to the user site-packages directory (Python only)')
  .option('--virtualenv <path>', 'Use specific virtualenv (Python only)')
  .action(async (packages, options) => {
    // Determine which package manager to use based on options or auto-detect
    if (options.npm) {
      if (!packages || packages.length === 0) {
        await install([], options);
      } else {
        for (const pkg of packages) {
          console.log(chalk.green(`Installing ${pkg} with npm...`));
          const success = await install([pkg], options);
          
          if (success && options.mcp !== false) {
            console.log(chalk.blue(`Researching ${pkg} for MCP context...`));
            const research = await researchPackage(pkg, ProjectType.NODE);
            console.log(chalk.blue(`Creating MCP server for ${pkg}...`));
            await createMcpServer(pkg, research);
          }
        }
      }
    } else if (options.pip) {
      if (!packages || packages.length === 0) {
        await pythonInstall([], options);
      } else {
        for (const pkg of packages) {
          console.log(chalk.green(`Installing ${pkg} with pip...`));
          const success = await pythonInstall([pkg], options);
          
          if (success && options.mcp !== false) {
            console.log(chalk.blue(`Researching ${pkg} for MCP context...`));
            const research = await researchPackage(pkg, ProjectType.PYTHON);
            console.log(chalk.blue(`Creating MCP server for ${pkg}...`));
            await createMcpServer(pkg, research);
          }
        }
      }
    } else if (options.gem) {
      if (!packages || packages.length === 0) {
        await rubyInstall([], options);
      } else {
        for (const pkg of packages) {
          console.log(chalk.green(`Installing ${pkg} with gem...`));
          const success = await rubyInstall([pkg], options);
          
          if (success && options.mcp !== false) {
            console.log(chalk.blue(`Researching ${pkg} for MCP context...`));
            const research = await researchPackage(pkg, ProjectType.RUBY);
            console.log(chalk.blue(`Creating MCP server for ${pkg}...`));
            await createMcpServer(pkg, research);
          }
        }
      }
    } else {
      // Auto-detect project type
      await installByProjectType(packages, options);
    }
  });

// Add command (alias for install)
program
  .command('add [packages...]')
  .description('Add a package (alias for install)')
  .option('-D, --save-dev', 'Save package as a development dependency')
  .option('-g, --global', 'Install globally')
  .option('--no-mcp', 'Skip MCP server creation')
  .option('--npm', 'Force using npm (Node.js) regardless of project type')
  .option('--pip', 'Force using pip (Python) regardless of project type')
  .option('--gem', 'Force using gem (Ruby) regardless of project type')
  .option('--user', 'Install to the user site-packages directory (Python only)')
  .option('--virtualenv <path>', 'Use specific virtualenv (Python only)')
  .action(async (packages, options) => {
    if (!packages || packages.length === 0) {
      console.log(chalk.yellow('No packages specified'));
      return;
    }
    
    // Use the same logic as the install command
    const installCmd = program.commands.find(cmd => cmd.name() === 'install');
    if (installCmd) {
      // We need to manually call the action with the arguments
      await installByProjectType(packages, options);
    }
  });

// Generate MCP context for an existing package
program
  .command('gen-mcp <package>')
  .description('Generate MCP server for an existing package')
  .option('--npm', 'Force using npm (Node.js) package info')
  .option('--pip', 'Force using pip (Python) package info')
  .option('--gem', 'Force using gem (Ruby) package info')
  .action(async (pkg, options) => {
    console.log(chalk.blue(`Researching ${pkg} for MCP context...`));
    
    let packageType: ProjectType;
    
    if (options.npm) {
      packageType = ProjectType.NODE;
    } else if (options.pip) {
      packageType = ProjectType.PYTHON;
    } else if (options.gem) {
      packageType = ProjectType.RUBY;
    } else {
      // Auto-detect
      packageType = await detectProjectType();
      console.log(chalk.blue(`Detected project type: ${packageType}`));
    }
    
    const research = await researchPackage(pkg, packageType);
    console.log(chalk.blue(`Creating MCP server for ${pkg}...`));
    await createMcpServer(pkg, research);
  });

// Serve MCP for a package
program
  .command('serve-mcp <package>')
  .description('Start MCP server for a package')
  .option('-p, --port <port>', 'Port to run the server on', (value) => parseInt(value, 10))
  .action(async (pkg, options) => {
    await serveMcp(pkg, options.port);
  });

// List MCP servers
program
  .command('list-mcp')
  .description('List all packages with MCP servers')
  .action(async () => {
    const { readdir } = await import('fs/promises');
    const { join } = await import('path');
    
    try {
      const gpmDir = join(process.cwd(), '.gpm');
      const packages = await readdir(gpmDir);
      
      if (packages.length === 0) {
        console.log(chalk.yellow('No MCP servers available'));
        return;
      }
      
      console.log(chalk.blue('Packages with MCP servers:'));
      
      for (const pkg of packages) {
        if (pkg === 'deps') continue; // Skip the deps directory
        
        try {
          const mcpDir = join(gpmDir, pkg, 'mcp');
          await readdir(mcpDir);
          console.log(chalk.green(`- ${pkg}`));
        } catch (error) {
          // Skip packages without MCP servers
        }
      }
    } catch (error) {
      console.log(chalk.yellow('No MCP servers available'));
    }
  });

// Search for packages
program
  .command('search <query>')
  .description('Search for packages in npm, PyPI, or RubyGems')
  .option('-n, --npm', 'Force search in npm registry')
  .option('-p, --pip', 'Force search in PyPI')
  .option('-g, --gem', 'Force search in RubyGems')
  .option('-l, --limit <number>', 'Limit the number of results', '10')
  .action(async (query, options) => {
    let projectType: ProjectType;
    
    if (options.npm) {
      projectType = ProjectType.NODE;
    } else if (options.pip) {
      projectType = ProjectType.PYTHON;
    } else if (options.gem) {
      projectType = ProjectType.RUBY;
    } else {
      // Auto-detect project type
      projectType = await detectProjectType();
      console.log(chalk.blue(`Detected project type: ${projectType}`));
    }
    
    await searchPackages(query, projectType, parseInt(options.limit));
  });

// Passthrough for other commands
program
  .command('*', { isDefault: true, hidden: true })
  .allowUnknownOption()
  .action(async (cmd) => {
    // For any other command, pass through to the appropriate package manager
    const projectType = await detectProjectType();
    let packageManager = 'npm';  // Default
    
    if (projectType === ProjectType.PYTHON) {
      packageManager = 'pip';
    } else if (projectType === ProjectType.RUBY) {
      // Check if bundler is available
      try {
        await execAsync('bundle -v');
        packageManager = 'bundle';
      } catch (error) {
        packageManager = 'gem';
      }
    }
    
    console.log(chalk.yellow(`Detected project type: ${projectType}`));
    console.log(chalk.yellow(`Passing through to ${packageManager}: ${cmd}`));
    
    const { exec } = await import('child_process');
    let command = '';
    
    if (packageManager === 'npm') {
      command = `npm ${process.argv.slice(2).join(' ')}`;
    } else if (packageManager === 'pip') {
      command = `pip ${process.argv.slice(2).join(' ')}`;
    } else if (packageManager === 'bundle') {
      command = `bundle ${process.argv.slice(2).join(' ')}`;
    } else if (packageManager === 'gem') {
      command = `gem ${process.argv.slice(2).join(' ')}`;
    }
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(chalk.red(`Error: ${error.message}`));
        return;
      }
      if (stderr) console.error(chalk.yellow(stderr));
      console.log(stdout);
    });
  });

program.parse(process.argv);