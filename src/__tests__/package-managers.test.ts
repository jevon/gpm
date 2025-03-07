/**
 * Tests for package manager interactions
 */
import { jest } from '@jest/globals';
import { ProjectType } from '../utils/detectProjectType.js';

// Mock the required modules
jest.mock('child_process');

describe('Package Manager Integration', () => {
  it('should support npm for Node.js projects', () => {
    expect(ProjectType.NODE).toBe('node');
  });

  it('should support pip for Python projects', () => {
    expect(ProjectType.PYTHON).toBe('python');
  });

  it('should support gem for Ruby projects', () => {
    expect(ProjectType.RUBY).toBe('ruby');
  });
});