import { exec } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';

interface PipInstallOptions {
  dev?: boolean;
  user?: boolean;
  global?: boolean;
  mcp?: boolean;
  virtualenv?: string;
}

export async function pythonInstall(packages: string[], options: PipInstallOptions): Promise<boolean> {
  const spinner = ora('Installing Python package(s)...').start();
  
  return new Promise((resolve) => {
    const packagesList = packages.join(' ');
    
    // Determine pip command - use pip3 if available, otherwise pip
    const pipCmd = 'pip3';
    
    let command = `${pipCmd} install ${packagesList}`;
    
    if (options.dev) {
      // For development packages in Python
      command += ' --dev';
    }
    
    if (options.user) {
      command += ' --user';
    }
    
    if (options.global) {
      // Global install in Python usually means --user
      command += ' --user';
    }
    
    // Check for virtualenv
    if (options.virtualenv) {
      // If specific virtualenv is provided, use it
      command = `source ${options.virtualenv}/bin/activate && ${command}`;
    } else {
      // Check for common virtual environment paths
      const checkVenvs = async () => {
        for (const venvPath of ['.venv', 'venv', 'env']) {
          try {
            const activatePath = path.join(process.cwd(), venvPath, 'bin', 'activate');
            await fs.access(activatePath);
            return venvPath;
          } catch (err) {
            // Virtual environment not found, continue checking
          }
        }
        return null;
      };
      
      checkVenvs().then(venvPath => {
        if (venvPath) {
          command = `source ${venvPath}/bin/activate && ${command}`;
        }
        
        // Execute the pip command
        executeCommand(command, spinner, resolve);
      });
      return;
    }
    
    // If no virtualenv check is needed, execute directly
    executeCommand(command, spinner, resolve);
  });
}

function executeCommand(command: string, spinner: ora.Ora, resolve: (value: boolean) => void) {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      spinner.fail(`Installation failed: ${error.message}`);
      resolve(false);
      return;
    }
    
    if (stderr && !stderr.includes('WARNING:')) {
      spinner.warn('Installation completed with warnings');
      console.log(chalk.yellow(stderr));
    } else {
      spinner.succeed('Installation completed successfully');
    }
    
    if (stdout) {
      console.log(stdout);
    }
    
    resolve(true);
  });
}

export async function getPythonPackageInfo(packageName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    exec(`pip show ${packageName}`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Failed to get package info: ${error.message}`));
        return;
      }
      
      if (!stdout) {
        reject(new Error(`Package ${packageName} not found`));
        return;
      }
      
      // Parse the pip show output into an object
      const info: Record<string, string> = {};
      const lines = stdout.split('\n');
      
      for (const line of lines) {
        const [key, value] = line.split(': ');
        if (key && value) {
          info[key.trim()] = value.trim();
        }
      }
      
      resolve({
        name: info.Name,
        version: info.Version,
        summary: info.Summary,
        homepage: info['Home-page'],
        author: info.Author,
        authorEmail: info['Author-email'],
        license: info.License,
        location: info.Location,
        requires: info.Requires ? info.Requires.split(', ') : []
      });
    });
  });
}