import { exec } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

interface InstallOptions {
  saveDev?: boolean;
  global?: boolean;
  mcp?: boolean;
}

export async function install(packages: string[], options: InstallOptions): Promise<boolean> {
  const spinner = ora('Installing package(s)...').start();
  
  return new Promise((resolve) => {
    const packagesList = packages.join(' ');
    let command = `npm install ${packagesList}`;
    
    if (options.saveDev) {
      command += ' --save-dev';
    }
    
    if (options.global) {
      command += ' -g';
    }
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        spinner.fail(`Installation failed: ${error.message}`);
        resolve(false);
        return;
      }
      
      if (stderr && !stderr.includes('npm WARN')) {
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
  });
}