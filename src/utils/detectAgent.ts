import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export enum AgentType {
  CURSOR = 'cursor',
  WINDSURF = 'windsurf',
  AIDER = 'aider',
  CODY = 'cody',
  CONTINUE = 'continue',
  CLAUDE_CODE = 'claude_code',
  COPILOT = 'copilot',
  CODIUM = 'codium',
  GHOSTWRITER = 'ghostwriter',
  UNKNOWN = 'unknown',
  NONE = 'none'
}

export interface AgentInfo {
  detected: boolean;
  type: AgentType;
  confidence: number; // 0-1 scale, how confident we are in the detection
  details?: string;   // Additional information about the detected agent
}

/**
 * Detects if the project is using an LLM coding agent
 * @param directory Current directory to check
 * @returns Information about detected agent
 */
export async function detectAgent(directory: string = process.cwd()): Promise<AgentInfo> {
  try {
    // 1. Check for agent-specific rules files
    const agentByRulesFile = await detectAgentByRulesFiles(directory);
    if (agentByRulesFile.detected) {
      return agentByRulesFile;
    }

    // 2. Check for agent-specific directories
    const agentByDirectories = await detectAgentByDirectories(directory);
    if (agentByDirectories.detected) {
      return agentByDirectories;
    }

    // 3. Check for git commit messages with agent signatures
    const agentByGitCommits = await detectAgentByGitCommits(directory);
    if (agentByGitCommits.detected) {
      return agentByGitCommits;
    }

    // 4. Check for environment variables
    const agentByEnvVars = detectAgentByEnvVars();
    if (agentByEnvVars.detected) {
      return agentByEnvVars;
    }

    // 5. Check for running processes
    const agentByProcesses = await detectAgentByProcesses();
    if (agentByProcesses.detected) {
      return agentByProcesses;
    }

    // No agent detected
    return {
      detected: false,
      type: AgentType.NONE,
      confidence: 1.0,
      details: 'No LLM coding agent detected'
    };
  } catch (error) {
    // If anything goes wrong, assume no agent
    console.error('Error detecting agent:', error);
    return {
      detected: false,
      type: AgentType.UNKNOWN,
      confidence: 0.5,
      details: 'Error during agent detection'
    };
  }
}

/**
 * Detects agent based on rules files in the project
 */
async function detectAgentByRulesFiles(directory: string): Promise<AgentInfo> {
  try {
    const files = await fs.readdir(directory);
    
    // Check for each agent's rules file
    if (files.includes('.clinerules') || files.includes('.cline.yaml')) {
      return {
        detected: true,
        type: AgentType.CLAUDE_CODE,
        confidence: 0.9,
        details: 'Found Claude Code rules file (.clinerules)'
      };
    }
    
    if (files.includes('.windsurfrules')) {
      return {
        detected: true,
        type: AgentType.WINDSURF,
        confidence: 0.9,
        details: 'Found Windsurf rules file (.windsurfrules)'
      };
    }
    
    if (files.includes('.cursorrules')) {
      return {
        detected: true,
        type: AgentType.CURSOR,
        confidence: 0.9,
        details: 'Found Cursor rules file (.cursorrules)'
      };
    }
    
    if (files.includes('.aiderrules') || files.includes('.aiderconfig') || files.includes('.aider-chat-config.json')) {
      return {
        detected: true,
        type: AgentType.AIDER,
        confidence: 0.9,
        details: 'Found Aider rules or config file'
      };
    }

    // Not detected by rules files
    return {
      detected: false,
      type: AgentType.UNKNOWN,
      confidence: 0
    };
  } catch (error) {
    return {
      detected: false,
      type: AgentType.UNKNOWN,
      confidence: 0
    };
  }
}

/**
 * Detects agent based on directories in the project
 */
async function detectAgentByDirectories(directory: string): Promise<AgentInfo> {
  try {
    const rootFiles = await fs.readdir(directory);

    // Check for agent-specific directories
    if (rootFiles.includes('.cursor')) {
      return {
        detected: true,
        type: AgentType.CURSOR,
        confidence: 0.8,
        details: 'Found Cursor directory (.cursor)'
      };
    }

    // Check for various Aider files and directories
    if (rootFiles.includes('.aider') || 
        rootFiles.some(file => file.startsWith('.aider.')) ||
        rootFiles.includes('aider.tags.cache.v3') ||
        rootFiles.some(file => file.includes('aider.chat.history'))) {
      return {
        detected: true,
        type: AgentType.AIDER,
        confidence: 0.9,
        details: 'Found Aider files or directories'
      };
    }

    // Check for other common agent directories/files
    if (rootFiles.includes('.continue')) {
      return {
        detected: true,
        type: AgentType.CONTINUE,
        confidence: 0.8,
        details: 'Found Continue.dev directory (.continue)'
      };
    }

    if (rootFiles.includes('.cody')) {
      return {
        detected: true,
        type: AgentType.CODY,
        confidence: 0.8,
        details: 'Found Cody directory (.cody)'
      };
    }

    // GitHub Copilot doesn't have a project directory, but may have config
    if (rootFiles.includes('.github') || rootFiles.includes('.vscode')) {
      try {
        // Check for Copilot config in .vscode
        const vscodeDir = path.join(directory, '.vscode');
        const vsFiles = await fs.readdir(vscodeDir);
        if (vsFiles.includes('settings.json')) {
          const settings = await fs.readFile(path.join(vscodeDir, 'settings.json'), 'utf-8');
          if (settings.includes('github.copilot')) {
            return {
              detected: true,
              type: AgentType.COPILOT,
              confidence: 0.7,
              details: 'Found GitHub Copilot configuration in VSCode settings'
            };
          }
        }
      } catch (error) {
        // Ignore errors reading .vscode directory
      }
    }

    // Not detected by directories
    return {
      detected: false,
      type: AgentType.UNKNOWN,
      confidence: 0
    };
  } catch (error) {
    return {
      detected: false,
      type: AgentType.UNKNOWN,
      confidence: 0
    };
  }
}

/**
 * Detects agent based on git commit messages
 */
async function detectAgentByGitCommits(directory: string): Promise<AgentInfo> {
  try {
    // Check if we're in a git repository
    try {
      await execAsync('git rev-parse --is-inside-work-tree', { cwd: directory });
    } catch (error) {
      // Not a git repository
      return {
        detected: false,
        type: AgentType.UNKNOWN,
        confidence: 0
      };
    }

    // Get recent git commit messages
    const { stdout } = await execAsync('git log -n 10 --pretty=format:"%s%n%b"', { cwd: directory });
    
    // Look for agent signatures in commit messages
    if (stdout.includes('🤖 Generated with [Claude Code]') || 
        stdout.includes('Co-Authored-By: Claude <noreply@anthropic.com>')) {
      return {
        detected: true,
        type: AgentType.CLAUDE_CODE,
        confidence: 0.9,
        details: 'Found Claude Code signature in recent git commits'
      };
    }
    
    if (stdout.includes('Co-authored-by: Cursor')) {
      return {
        detected: true,
        type: AgentType.CURSOR,
        confidence: 0.9,
        details: 'Found Cursor signature in recent git commits'
      };
    }
    
    if (stdout.includes('Co-authored-by: GitHub Copilot')) {
      return {
        detected: true,
        type: AgentType.COPILOT,
        confidence: 0.9,
        details: 'Found GitHub Copilot signature in recent git commits'
      };
    }

    if (stdout.includes('Co-authored-by: Aider')) {
      return {
        detected: true,
        type: AgentType.AIDER,
        confidence: 0.9,
        details: 'Found Aider signature in recent git commits'
      };
    }

    if (stdout.includes('Co-authored-by: Continue')) {
      return {
        detected: true,
        type: AgentType.CONTINUE,
        confidence: 0.9,
        details: 'Found Continue signature in recent git commits'
      };
    }

    // Not detected by git commits
    return {
      detected: false,
      type: AgentType.UNKNOWN,
      confidence: 0
    };
  } catch (error) {
    return {
      detected: false,
      type: AgentType.UNKNOWN,
      confidence: 0
    };
  }
}

/**
 * Detects agent based on environment variables
 */
function detectAgentByEnvVars(): AgentInfo {
  // Check for environment variables that indicate agent usage
  if (process.env.CURSOR_SESSION_ID || process.env.CURSOR_API_KEY) {
    return {
      detected: true,
      type: AgentType.CURSOR,
      confidence: 0.8,
      details: 'Found Cursor environment variables'
    };
  }

  if (process.env.AIDER_MODEL || process.env.AIDER_API_KEY) {
    return {
      detected: true,
      type: AgentType.AIDER,
      confidence: 0.8,
      details: 'Found Aider environment variables'
    };
  }

  if (process.env.ANTHROPIC_API_KEY && (process.env.CLAUDE_CODE || process.env.CLINE_SESSION)) {
    return {
      detected: true,
      type: AgentType.CLAUDE_CODE,
      confidence: 0.8,
      details: 'Found Claude Code environment variables'
    };
  }

  if (process.env.GHOSTWRITER_API_KEY || process.env.REPLIT_GHOSTWRITER) {
    return {
      detected: true,
      type: AgentType.GHOSTWRITER,
      confidence: 0.8,
      details: 'Found Ghostwriter environment variables'
    };
  }
  
  // Check Claude Code CLI environment variable specifically
  // This is a test to see if we're running in Claude Code CLI
  if (process.env.CLAUDE_CODE_CLI === 'true') {
    return {
      detected: true,
      type: AgentType.CLAUDE_CODE,
      confidence: 1.0,
      details: 'Running inside Claude Code CLI'
    };
  }

  // Not detected by environment variables
  return {
    detected: false,
    type: AgentType.UNKNOWN,
    confidence: 0
  };
}

/**
 * Detects agent based on running processes
 */
async function detectAgentByProcesses(): Promise<AgentInfo> {
  try {
    let psCommand: string;
    
    if (process.platform === 'win32') {
      psCommand = 'tasklist';
    } else {
      psCommand = 'ps aux';
    }
    
    const { stdout } = await execAsync(psCommand);
    
    // Check for agent processes
    if (stdout.includes('cursor-') || stdout.includes('cursor.exe')) {
      return {
        detected: true,
        type: AgentType.CURSOR,
        confidence: 0.7,
        details: 'Found Cursor process running'
      };
    }
    
    if (stdout.includes('aider') || stdout.includes('aider.exe')) {
      return {
        detected: true,
        type: AgentType.AIDER,
        confidence: 0.7,
        details: 'Found Aider process running'
      };
    }

    if (stdout.includes('continue') || stdout.includes('continue.exe')) {
      return {
        detected: true,
        type: AgentType.CONTINUE,
        confidence: 0.7,
        details: 'Found Continue process running'
      };
    }

    // Not detected by processes
    return {
      detected: false,
      type: AgentType.UNKNOWN,
      confidence: 0
    };
  } catch (error) {
    return {
      detected: false,
      type: AgentType.UNKNOWN,
      confidence: 0
    };
  }
}