import fs from 'fs/promises';
import path from 'path';

export enum ProjectType {
  NODE = 'node',
  PYTHON = 'python',
  RUBY = 'ruby',
  UNKNOWN = 'unknown'
}

export async function detectProjectType(directory: string = process.cwd()): Promise<ProjectType> {
  try {
    const files = await fs.readdir(directory);
    
    // Check for Node.js project
    if (
      files.includes('package.json') ||
      files.includes('package-lock.json') ||
      files.includes('node_modules')
    ) {
      return ProjectType.NODE;
    }
    
    // Check for Python project
    if (
      files.includes('requirements.txt') ||
      files.includes('setup.py') ||
      files.includes('Pipfile') ||
      files.includes('pyproject.toml') ||
      files.includes('poetry.lock') ||
      files.includes('.venv') ||
      files.includes('venv')
    ) {
      return ProjectType.PYTHON;
    }
    
    // Check for Ruby project
    if (
      files.includes('Gemfile') ||
      files.includes('Gemfile.lock') ||
      files.includes('.ruby-version') ||
      files.includes('.bundle')
    ) {
      return ProjectType.RUBY;
    }
    
    // If no specific project type is detected, look for language files
    const pyFiles = files.filter(file => file.endsWith('.py'));
    const jsFiles = files.filter(file => file.endsWith('.js') || file.endsWith('.ts'));
    const rbFiles = files.filter(file => file.endsWith('.rb'));
    
    if (pyFiles.length > jsFiles.length && pyFiles.length > rbFiles.length) {
      return ProjectType.PYTHON;
    } else if (rbFiles.length > jsFiles.length && rbFiles.length > pyFiles.length) {
      return ProjectType.RUBY;
    } else if (jsFiles.length > 0) {
      return ProjectType.NODE;
    }
    
    return ProjectType.UNKNOWN;
  } catch (error) {
    // If we can't access the directory, default to unknown
    return ProjectType.UNKNOWN;
  }
}