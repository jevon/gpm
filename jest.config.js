export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  verbose: true,
  transformIgnorePatterns: [
    "/node_modules/(?!axios|chalk|ora|inquirer)"
  ],
  automock: false,
  resetMocks: true,
  setupFilesAfterEnv: ['./src/__tests__/setup.ts']
};