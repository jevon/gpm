import { jest } from '@jest/globals';

// Set up global test configuration
jest.setTimeout(10000); // 10 seconds

// Mock console methods to avoid cluttering test output
global.console.log = jest.fn();
global.console.error = jest.fn();
global.console.warn = jest.fn();
global.console.info = jest.fn();