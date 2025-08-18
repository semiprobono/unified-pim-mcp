/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  displayName: 'Integration Tests',
  
  // Test file patterns
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.integration.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  
  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        strict: false,
        noImplicitReturns: false,
        strictNullChecks: false,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        target: 'ES2020',
        moduleResolution: 'node'
      }
    }]
  },
  
  // Module resolution
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@domain/(.*)$': '<rootDir>/src/domain/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/tests/jest.setup.ts',
    '<rootDir>/tests/integration/setup.integration.ts'
  ],
  
  // Test environment setup
  globalSetup: '<rootDir>/tests/integration/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/integration/globalTeardown.ts',
  
  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Test execution configuration
  verbose: true,
  testTimeout: 60000, // 60 seconds for integration tests
  maxWorkers: 2, // Limit parallelism for external service integration
  clearMocks: true,
  restoreMocks: true,
  
  // Reporters
  reporters: [
    'default',
    ['jest-html-reporters', {
      publicPath: './coverage/integration',
      filename: 'integration-test-report.html',
      expand: true,
      includeFailureMsg: true
    }],
    ['jest-junit', {
      outputDirectory: './coverage/integration',
      outputName: 'integration-junit.xml',
      suiteName: 'Integration Tests'
    }]
  ],
  
  // Error handling
  errorOnDeprecated: true,
  bail: false, // Continue running tests even if some fail
  
  // Watch mode configuration
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
    'jest-watch-select-projects'
  ],
  
  // Test environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test'
  },
  
  // Force exit after tests complete
  forceExit: true,
  detectOpenHandles: true
};