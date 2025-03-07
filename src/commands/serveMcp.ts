import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';

export async function serveMcp(packageName: string, port?: number): Promise<void> {
  const spinner = ora(`Starting MCP server for ${packageName}...`).start();
  
  try {
    // Check if MCP server exists for the package
    const mcpDir = path.join(process.cwd(), '.gpm', packageName, 'mcp');
    
    try {
      await fs.access(mcpDir);
    } catch (error) {
      spinner.fail(`No MCP server found for ${packageName}`);
      console.log(chalk.yellow(`Run 'gpm gen-mcp ${packageName}' to create an MCP server for this package.`));
      return;
    }
    
    // Check if server.js exists
    const serverPath = path.join(mcpDir, 'server.js');
    try {
      await fs.access(serverPath);
    } catch (error) {
      spinner.fail(`Server file not found for ${packageName}`);
      console.log(chalk.yellow(`Run 'gpm gen-mcp ${packageName}' to recreate the MCP server.`));
      return;
    }
    
    // Set port if provided
    let env = '';
    if (port) {
      env = `PORT=${port} `;
    }
    
    // Make sure the server file exists and has proper permissions
    try {
      const stats = await fs.stat(serverPath);
      if (!stats.isFile()) {
        spinner.fail(`Server file for ${packageName} is not a regular file`);
        console.log(chalk.yellow(`Run 'gpm gen-mcp ${packageName}' to recreate the MCP server.`));
        return;
      }
    } catch (error) {
      spinner.fail(`Could not access server file for ${packageName}`);
      console.log(chalk.yellow(`Run 'gpm gen-mcp ${packageName}' to recreate the MCP server.`));
      return;
    }
    
    // Start the server
    spinner.succeed(`Starting MCP server for ${packageName}`);
    
    // Ensure dependencies are installed
    try {
      console.log(chalk.blue("Checking for required dependencies..."));
      await fs.access(path.join(mcpDir, 'node_modules/express'), fs.constants.F_OK);
    } catch (error) {
      console.log(chalk.yellow("Dependencies missing, installing..."));
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
        console.log(chalk.green("Dependencies installed successfully"));
      } catch (installError) {
        spinner.fail(`Failed to install dependencies: ${installError.message}`);
        console.log(chalk.red("Cannot start server without required dependencies"));
        return;
      }
    }
    
    const server = exec(`${env}node ${serverPath}`, { cwd: mcpDir });
    
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
    spinner.fail(`Failed to start MCP server for ${packageName}`);
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
  }
}