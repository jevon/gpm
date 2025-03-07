import axios from 'axios';
import chalk from 'chalk';
import ora from 'ora';
import { ProjectType } from '../utils/detectProjectType.js';

/**
 * Search for packages across different registries
 */
export async function searchPackages(
  query: string, 
  projectType: ProjectType,
  limit: number = 10
): Promise<void> {
  const spinner = ora(`Searching for packages matching "${query}"...`).start();
  
  try {
    switch (projectType) {
      case ProjectType.NODE:
        await searchNpmPackages(query, limit, spinner);
        break;
      case ProjectType.PYTHON:
        await searchPyPIPackages(query, limit, spinner);
        break;
      case ProjectType.RUBY:
        await searchRubyGems(query, limit, spinner);
        break;
      default:
        spinner.warn(`Unknown project type. Searching npm registry by default.`);
        await searchNpmPackages(query, limit, spinner);
    }
  } catch (error) {
    spinner.fail(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Search for packages in the npm registry
 */
async function searchNpmPackages(query: string, limit: number, spinner: ora.Ora): Promise<void> {
  try {
    spinner.text = `Searching npm registry for "${query}"...`;
    
    // Using the npm registry API
    const response = await axios.get(
      `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`
    );
    
    spinner.succeed(`Found ${response.data.objects.length} npm packages matching "${query}"`);
    
    if (response.data.objects.length === 0) {
      console.log(chalk.yellow('No packages found.'));
      return;
    }
    
    // Display the results
    console.log('\n' + chalk.bold('NPM Packages:'));
    response.data.objects.forEach((pkg: any, index: number) => {
      console.log(`${chalk.green(index + 1 + '.')} ${chalk.bold(pkg.package.name)} ${chalk.gray('v' + pkg.package.version)}`);
      console.log(`   ${pkg.package.description || 'No description'}`);
      console.log(`   ${chalk.blue(pkg.package.links?.npm || '')}`);
      console.log(`   ${chalk.yellow('Downloads:')} ${pkg.score?.detail?.popularity?.toFixed(2) || 'N/A'}`);
      console.log('');
    });
    
    console.log(`Install with: ${chalk.cyan('gpm install <package-name>')}`);
  } catch (error) {
    spinner.fail(`npm search failed: ${error instanceof Error ? error.message : String(error)}`);
    console.log(chalk.yellow('Use the npm website to search for packages: https://www.npmjs.com/search?q=' + encodeURIComponent(query)));
  }
}

/**
 * Search for packages in PyPI (Python Package Index)
 */
async function searchPyPIPackages(query: string, limit: number, spinner: ora.Ora): Promise<void> {
  try {
    spinner.text = `Searching PyPI for "${query}"...`;
    
    // Using the PyPI JSON API 
    const response = await axios.get(
      `https://pypi.org/pypi/${encodeURIComponent(query)}/json`
    );
    
    // If we get here, there's an exact match package
    spinner.succeed(`Found exact match for "${query}" on PyPI`);
    
    const pkg = response.data;
    console.log('\n' + chalk.bold('Python Package:'));
    console.log(`${chalk.green('1.')} ${chalk.bold(pkg.info.name)} ${chalk.gray('v' + pkg.info.version)}`);
    console.log(`   ${pkg.info.summary || 'No description'}`);
    console.log(`   ${chalk.blue('https://pypi.org/project/' + pkg.info.name)}`);
    console.log('');
    
    console.log(`Install with: ${chalk.cyan('gpm install ' + pkg.info.name)}`);
  } catch (error) {
    // No exact match, try searching with the PyPI Simple API
    try {
      spinner.text = `No exact match, searching PyPI for packages containing "${query}"...`;
      
      // Use a fuzzy search with the PyPI JSON API
      const searchResponse = await axios.get(
        `https://pypi.org/search/?q=${encodeURIComponent(query)}`
      );
      
      // Extract package names from the HTML response (this is a bit hacky but works)
      const html = searchResponse.data;
      const packageMatches = html.match(/\/project\/([^/]+)\//g);
      
      if (!packageMatches) {
        spinner.info(`No Python packages found matching "${query}"`);
        console.log(chalk.yellow('Use PyPI to search: https://pypi.org/search/?q=' + encodeURIComponent(query)));
        return;
      }
      
      // Extract unique package names
      const uniquePackages = Array.from(new Set(
        packageMatches.map((match: string) => match.split('/')[2])
      )).slice(0, limit);
      
      spinner.succeed(`Found ${uniquePackages.length} Python packages matching "${query}"`);
      
      console.log('\n' + chalk.bold('Python Packages:'));
      for (let i = 0; i < uniquePackages.length; i++) {
        try {
          const pkgInfo = await axios.get(`https://pypi.org/pypi/${uniquePackages[i]}/json`);
          console.log(`${chalk.green(i + 1 + '.')} ${chalk.bold(pkgInfo.data.info.name)} ${chalk.gray('v' + pkgInfo.data.info.version)}`);
          console.log(`   ${pkgInfo.data.info.summary || 'No description'}`);
          console.log(`   ${chalk.blue('https://pypi.org/project/' + pkgInfo.data.info.name)}`);
          console.log('');
        } catch (e) {
          console.log(`${chalk.green(i + 1 + '.')} ${chalk.bold(uniquePackages[i])}`);
          console.log('');
        }
      }
      
      console.log(`Install with: ${chalk.cyan('gpm install <package-name>')}`);
    } catch (searchError) {
      spinner.fail(`PyPI search failed: ${searchError instanceof Error ? searchError.message : String(searchError)}`);
      console.log(chalk.yellow('Use PyPI to search for packages: https://pypi.org/search/?q=' + encodeURIComponent(query)));
    }
  }
}

/**
 * Search for Ruby gems
 */
async function searchRubyGems(query: string, limit: number, spinner: ora.Ora): Promise<void> {
  try {
    spinner.text = `Searching RubyGems for "${query}"...`;
    
    // Using the RubyGems API
    const response = await axios.get(
      `https://rubygems.org/api/v1/search.json?query=${encodeURIComponent(query)}&page=1&per_page=${limit}`
    );
    
    spinner.succeed(`Found ${response.data.length} Ruby gems matching "${query}"`);
    
    if (response.data.length === 0) {
      console.log(chalk.yellow('No gems found.'));
      return;
    }
    
    // Display the results
    console.log('\n' + chalk.bold('Ruby Gems:'));
    response.data.forEach((gem: any, index: number) => {
      console.log(`${chalk.green(index + 1 + '.')} ${chalk.bold(gem.name)} ${chalk.gray('v' + gem.version)}`);
      console.log(`   ${gem.info || 'No description'}`);
      console.log(`   ${chalk.blue('https://rubygems.org/gems/' + gem.name)}`);
      console.log(`   ${chalk.yellow('Downloads:')} ${gem.downloads.toLocaleString()}`);
      console.log('');
    });
    
    console.log(`Install with: ${chalk.cyan('gpm install <gem-name>')}`);
  } catch (error) {
    spinner.fail(`RubyGems search failed: ${error instanceof Error ? error.message : String(error)}`);
    console.log(chalk.yellow('Use RubyGems to search for gems: https://rubygems.org/search?query=' + encodeURIComponent(query)));
  }
}