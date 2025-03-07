import axios from 'axios';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProjectType } from './detectProjectType.js';
import { getPythonPackageInfo } from '../commands/pythonInstall.js';
import { getRubyGemInfo } from '../commands/rubyInstall.js';

const execAsync = promisify(exec);

interface PackageInfo {
  name: string;
  description?: string;
  version?: string;
  homepage?: string;
  repository?: {
    type?: string;
    url?: string;
  } | string;
  bugs?: {
    url?: string;
  } | string;
  license?: string;
  author?: string | {
    name?: string;
    email?: string;
    url?: string;
  };
  keywords?: string[];
  main?: string;
  types?: string;
  typings?: string;
  readme?: string;
  summary?: string; // For Python and Ruby
  authors?: string; // For Ruby
}

interface Research {
  packageInfo: PackageInfo;
  readme: string;
  exampleCode?: string[];
  apiDocs?: string;
  additionalResources?: string[];
  packageType: ProjectType;
}

export async function researchPackage(packageName: string, packageType: ProjectType = ProjectType.NODE): Promise<Research> {
  const spinner = ora(`Researching package: ${packageName}`).start();
  
  try {
    let packageInfo: PackageInfo = { name: packageName };
    let readme = '';
    let exampleCode: string[] = [];
    let apiDocs = '';
    let additionalResources: string[] = [];
    
    // Research based on package type
    if (packageType === ProjectType.NODE) {
      // Node.js (npm) package research
      const npmResult = await researchNpmPackage(packageName, spinner);
      packageInfo = npmResult.packageInfo;
      readme = npmResult.readme;
      exampleCode = npmResult.exampleCode || [];
      apiDocs = npmResult.apiDocs || '';
      additionalResources = npmResult.additionalResources || [];
    } else if (packageType === ProjectType.PYTHON) {
      // Python (pip) package research
      const pythonResult = await researchPythonPackage(packageName, spinner);
      packageInfo = pythonResult.packageInfo;
      readme = pythonResult.readme;
      exampleCode = pythonResult.exampleCode || [];
      apiDocs = pythonResult.apiDocs || '';
      additionalResources = pythonResult.additionalResources || [];
    } else if (packageType === ProjectType.RUBY) {
      // Ruby (gem) package research
      const rubyResult = await researchRubyPackage(packageName, spinner);
      packageInfo = rubyResult.packageInfo;
      readme = rubyResult.readme;
      exampleCode = rubyResult.exampleCode || [];
      apiDocs = rubyResult.apiDocs || '';
      additionalResources = rubyResult.additionalResources || [];
    } else {
      // Unknown package type, try npm as fallback
      spinner.text = `Unknown package type, trying npm for ${packageName}`;
      const npmResult = await researchNpmPackage(packageName, spinner);
      packageInfo = npmResult.packageInfo;
      readme = npmResult.readme;
      exampleCode = npmResult.exampleCode || [];
      apiDocs = npmResult.apiDocs || '';
      additionalResources = npmResult.additionalResources || [];
    }
    
    // Save research data to .gpm directory for future use
    spinner.text = `Saving research data for ${packageName}`;
    const research = {
      packageInfo,
      readme,
      exampleCode,
      apiDocs,
      additionalResources,
      packageType
    };
    
    await saveResearchData(packageName, research);
    
    spinner.succeed(`Research completed for ${packageName}`);
    
    return research;
  } catch (error) {
    spinner.fail(`Failed to research package: ${packageName}`);
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    }
    
    return {
      packageInfo: { name: packageName },
      readme: '',
      packageType
    };
  }
}

async function researchNpmPackage(packageName: string, spinner: ora.Ora): Promise<Research> {
  // Fetch package info from npm registry
  spinner.text = `Fetching npm registry data for ${packageName}`;
  const registryUrl = `https://registry.npmjs.org/${packageName}`;
  const response = await axios.get(registryUrl);
  const packageData = response.data;
  
  spinner.text = `Fetching README for ${packageName}`;
  
  let readme = '';
  if (packageData.readme) {
    readme = packageData.readme;
  } else {
    // Try to get README from GitHub if available
    const repoUrl = getRepoUrl(packageData);
    if (repoUrl && repoUrl.includes('github.com')) {
      try {
        const repoInfo = parseGitHubUrl(repoUrl);
        if (repoInfo) {
          const readmeResponse = await axios.get(
            `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/master/README.md`
          );
          readme = readmeResponse.data;
        }
      } catch (error) {
        console.log(chalk.yellow(`Could not fetch README from GitHub for ${packageName}`));
      }
    }
  }
  
  // Get example code if available (from readme or docs)
  spinner.text = `Extracting example code for ${packageName}`;
  const exampleCode = extractExampleCode(readme);
  
  // Try to get API docs or additional resources
  spinner.text = `Finding additional resources for ${packageName}`;
  let apiDocs = '';
  const additionalResources: string[] = [];
  
  if (packageData.homepage) {
    additionalResources.push(packageData.homepage);
  }
  
  if (packageData.bugs && packageData.bugs.url) {
    additionalResources.push(packageData.bugs.url);
  }
  
  return {
    packageInfo: {
      name: packageData.name,
      description: packageData.description,
      version: packageData.version,
      homepage: packageData.homepage,
      repository: packageData.repository,
      bugs: packageData.bugs,
      license: packageData.license,
      author: packageData.author,
      keywords: packageData.keywords,
      main: packageData.main,
      types: packageData.types || packageData.typings
    },
    readme,
    exampleCode,
    apiDocs,
    additionalResources,
    packageType: ProjectType.NODE
  };
}

async function researchPythonPackage(packageName: string, spinner: ora.Ora): Promise<Research> {
  spinner.text = `Fetching Python package info for ${packageName}`;
  
  try {
    // Try to get info from PyPI directly first, since this is more reliable
    // than depending on having the package installed locally
    try {
      const pypiUrl = `https://pypi.org/pypi/${packageName}/json`;
      const response = await axios.get(pypiUrl);
      const pypiData = response.data;
      
      let readme = '';
      if (pypiData.info && pypiData.info.description) {
        readme = pypiData.info.description;
      }
      
      // Add additional resources
      const additionalResources: string[] = [];
      
      if (pypiData.info.project_urls) {
        for (const [key, url] of Object.entries(pypiData.info.project_urls)) {
          additionalResources.push(`${key}: ${url}`);
        }
      }
      
      // Extract example code
      spinner.text = `Extracting example code for ${packageName}`;
      const exampleCode = extractExampleCode(readme);
      
      return {
        packageInfo: {
          name: packageName,
          version: pypiData.info.version,
          summary: pypiData.info.summary,
          homepage: pypiData.info.home_page || pypiData.info.project_url || pypiData.info.project_urls?.Homepage,
          author: pypiData.info.author,
          license: pypiData.info.license
        },
        readme,
        exampleCode,
        additionalResources,
        packageType: ProjectType.PYTHON
      };
    } catch (error) {
      // If PyPI JSON API fails, try to get package info using pip
      spinner.text = `PyPI API failed, trying pip for ${packageName}`;
      
      try {
        // Get package info using pip (only works if package is installed)
        const packageInfo = await getPythonPackageInfo(packageName);
        
        return {
          packageInfo,
          readme: '',
          packageType: ProjectType.PYTHON
        };
      } catch (pipError) {
        // If both PyPI and pip fail, try to scrape the PyPI page
        spinner.text = `Trying to scrape PyPI page for ${packageName}`;
        
        try {
          const pypiPageUrl = `https://pypi.org/project/${packageName}/`;
          const response = await axios.get(pypiPageUrl);
          const html = response.data;
          
          // Very basic scraping - extract description and metadata from HTML
          let description = '';
          const descMatch = html.match(/<div class="project-description"[^>]*>([^]*?)<\/div>/);
          if (descMatch && descMatch[1]) {
            description = descMatch[1].trim();
          }
          
          return {
            packageInfo: {
              name: packageName,
              description: description.substring(0, 200) + '...'
            },
            readme: description,
            packageType: ProjectType.PYTHON
          };
        } catch (scrapeError) {
          // All attempts failed
          spinner.warn(`All methods failed to get info for Python package ${packageName}`);
          
          return {
            packageInfo: { name: packageName },
            readme: '',
            packageType: ProjectType.PYTHON
          };
        }
      }
    }
  } catch (error) {
    spinner.warn(`Could not get detailed info for Python package ${packageName}`);
    
    // Return minimal info
    return {
      packageInfo: { name: packageName },
      readme: '',
      packageType: ProjectType.PYTHON
    };
  }
}

async function researchRubyPackage(packageName: string, spinner: ora.Ora): Promise<Research> {
  spinner.text = `Fetching Ruby gem info for ${packageName}`;
  
  try {
    // Get gem info
    const gemInfo = await getRubyGemInfo(packageName);
    
    // Try to get README from RubyGems.org API
    spinner.text = `Fetching README from RubyGems.org for ${packageName}`;
    let readme = '';
    
    try {
      const rubygemsUrl = `https://rubygems.org/api/v1/gems/${packageName}.json`;
      const response = await axios.get(rubygemsUrl);
      const gemData = response.data;
      
      // Add additional resources
      const additionalResources: string[] = [];
      
      if (gemData.source_code_uri) {
        additionalResources.push(`Source: ${gemData.source_code_uri}`);
      }
      
      if (gemData.homepage_uri) {
        additionalResources.push(`Homepage: ${gemData.homepage_uri}`);
      }
      
      if (gemData.documentation_uri) {
        additionalResources.push(`Documentation: ${gemData.documentation_uri}`);
      }
      
      // Try to get README from GitHub if available
      if (gemData.source_code_uri && gemData.source_code_uri.includes('github.com')) {
        try {
          const repoInfo = parseGitHubUrl(gemData.source_code_uri);
          if (repoInfo) {
            const readmeResponse = await axios.get(
              `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/master/README.md`
            );
            readme = readmeResponse.data;
          }
        } catch (error) {
          console.log(chalk.yellow(`Could not fetch README from GitHub for ${packageName}`));
        }
      }
      
      // Extract example code
      spinner.text = `Extracting example code for ${packageName}`;
      const exampleCode = extractExampleCode(readme);
      
      return {
        packageInfo: {
          name: gemInfo.name,
          version: gemInfo.version || gemData.version,
          summary: gemInfo.summary || gemData.info,
          homepage: gemInfo.homepage || gemData.homepage_uri,
          license: gemInfo.license,
          authors: gemInfo.authors
        },
        readme,
        exampleCode,
        additionalResources,
        packageType: ProjectType.RUBY
      };
    } catch (error) {
      // If RubyGems.org API fails, just use the gem info we have
      return {
        packageInfo: gemInfo,
        readme: '',
        packageType: ProjectType.RUBY
      };
    }
  } catch (error) {
    spinner.warn(`Could not get detailed info for Ruby gem ${packageName}`);
    
    // Try to get at least some information from RubyGems.org API
    try {
      const rubygemsUrl = `https://rubygems.org/api/v1/gems/${packageName}.json`;
      const response = await axios.get(rubygemsUrl);
      const gemData = response.data;
      
      return {
        packageInfo: {
          name: packageName,
          version: gemData.version,
          summary: gemData.info,
          homepage: gemData.homepage_uri
        },
        readme: '',
        packageType: ProjectType.RUBY
      };
    } catch (error) {
      // If all fails, return minimal info
      return {
        packageInfo: { name: packageName },
        readme: '',
        packageType: ProjectType.RUBY
      };
    }
  }
}

function getRepoUrl(packageData: any): string | null {
  if (packageData.repository) {
    if (typeof packageData.repository === 'string') {
      return packageData.repository;
    } else if (packageData.repository.url) {
      return packageData.repository.url;
    }
  }
  return null;
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  // Handle different GitHub URL formats
  const githubRegex = /github\.com[\/:]([^\/]+)\/([^\/\.]+)/;
  const match = url.match(githubRegex);
  
  if (match && match.length >= 3) {
    return {
      owner: match[1],
      repo: match[2].replace('.git', '')
    };
  }
  
  return null;
}

function extractExampleCode(readme: string): string[] {
  const examples: string[] = [];
  
  // Extract code blocks from markdown
  const codeBlockRegex = /\`\`\`(?:javascript|js|typescript|ts)?\s*([\s\S]*?)\`\`\`/g;
  let match;
  
  while ((match = codeBlockRegex.exec(readme)) !== null) {
    if (match[1] && match[1].trim().length > 0) {
      examples.push(match[1].trim());
    }
  }
  
  return examples;
}

async function saveResearchData(packageName: string, research: Research): Promise<void> {
  try {
    // Create .gpm directory if it doesn't exist
    const gpmDir = path.join(process.cwd(), '.gpm');
    await fs.mkdir(gpmDir, { recursive: true });
    
    // Create package directory
    const packageDir = path.join(gpmDir, packageName);
    await fs.mkdir(packageDir, { recursive: true });
    
    // Save research data
    await fs.writeFile(
      path.join(packageDir, 'research.json'),
      JSON.stringify(research, null, 2)
    );
    
    // Save README separately
    if (research.readme) {
      await fs.writeFile(
        path.join(packageDir, 'README.md'),
        research.readme
      );
    }
    
    // Save example code files
    if (research.exampleCode && research.exampleCode.length > 0) {
      const examplesDir = path.join(packageDir, 'examples');
      await fs.mkdir(examplesDir, { recursive: true });
      
      for (let i = 0; i < research.exampleCode.length; i++) {
        await fs.writeFile(
          path.join(examplesDir, `example-${i + 1}.js`),
          research.exampleCode[i]
        );
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error saving research data for ${packageName}`));
    if (error instanceof Error) {
      console.error(error.message);
    }
  }
}