import { exec } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';

interface GemInstallOptions {
  dev?: boolean;
  user?: boolean;
  global?: boolean;
  mcp?: boolean;
}

export async function rubyInstall(packages: string[], options: GemInstallOptions): Promise<boolean> {
  const spinner = ora('Installing Ruby gem(s)...').start();
  
  return new Promise((resolve) => {
    const packagesList = packages.join(' ');
    let command = `gem install ${packagesList}`;
    
    if (options.dev) {
      // For development gems in Ruby
      command += ' --development';
    }
    
    if (options.user) {
      command += ' --user-install';
    }
    
    if (options.global) {
      // In Ruby, the default is global, so we don't need to add anything
    }
    
    // Check if Bundler is being used
    const useBundler = async (): Promise<boolean> => {
      return new Promise((resolve) => {
        exec('bundle -v', (error) => {
          if (error) {
            resolve(false);
          } else {
            // Check if Gemfile exists
            exec('test -f Gemfile', (error) => {
              resolve(!error);
            });
          }
        });
      });
    };
    
    useBundler().then(hasBundler => {
      if (hasBundler) {
        // If Bundler is used, we need to add the gem to the Gemfile
        spinner.text = 'Adding gem to Gemfile...';
        
        for (const pkg of packages) {
          // Try to add to Gemfile
          exec(`bundle add ${pkg}${options.dev ? ' --group="development"' : ''}`, (error, stdout, stderr) => {
            if (error) {
              spinner.fail(`Failed to add ${pkg} to Gemfile: ${error.message}`);
              resolve(false);
              return;
            }
            
            spinner.succeed(`Added ${pkg} to Gemfile and installed via Bundler`);
            
            if (stdout) {
              console.log(stdout);
            }
            
            if (stderr) {
              console.log(chalk.yellow(stderr));
            }
            
            resolve(true);
          });
        }
      } else {
        // If no Bundler, use regular gem install
        exec(command, (error, stdout, stderr) => {
          if (error) {
            spinner.fail(`Installation failed: ${error.message}`);
            resolve(false);
            return;
          }
          
          if (stderr && !stderr.includes('WARNING')) {
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
    });
  });
}

export async function getRubyGemInfo(gemName: string): Promise<any> {
  return new Promise((resolve, reject) => {
    exec(`gem info ${gemName} --remote`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`Failed to get gem info: ${error.message}`));
        return;
      }
      
      if (!stdout || stdout.includes('ERROR')) {
        reject(new Error(`Gem ${gemName} not found`));
        return;
      }
      
      // Parse the gem info output
      const info: any = {
        name: gemName
      };
      
      // Extract version
      const versionMatch = stdout.match(/\(([^)]+)\)/);
      if (versionMatch) {
        info.version = versionMatch[1].split(',')[0].trim();
      }
      
      // Extract summary
      const summaryMatch = stdout.match(/\n\s+(.*)/);
      if (summaryMatch) {
        info.summary = summaryMatch[1].trim();
      }
      
      // Get more detailed info
      exec(`gem specification ${gemName}`, (error, stdout) => {
        if (!error && stdout) {
          try {
            // Extract homepage
            const homepageMatch = stdout.match(/homepage:(.+)/);
            if (homepageMatch) {
              info.homepage = homepageMatch[1].trim();
            }
            
            // Extract authors
            const authorsMatch = stdout.match(/authors:(.+)/);
            if (authorsMatch) {
              info.authors = authorsMatch[1].trim();
            }
            
            // Extract license
            const licenseMatch = stdout.match(/licenses:(.+)/);
            if (licenseMatch) {
              info.license = licenseMatch[1].trim();
            }
          } catch (e) {
            // If parsing fails, just return what we have
          }
        }
        
        resolve(info);
      });
    });
  });
}