/**
 * Jest Global Setup File
 *
 * This file runs before any tests and sets up the global test environment.
 * It's loaded before setupFilesAfterEnv and runs once per test run.
 */

import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.CACHE_TTL = '60'; // Short TTL for tests
process.env.ENABLE_METRICS = 'false';
process.env.ENABLE_TRACING = 'false';

// Mock external services for tests
process.env.MOCK_EXTERNAL_SERVICES = 'true';
process.env.CHROMADB_URL = 'http://localhost:8000';
process.env.REDIS_URL = 'redis://localhost:6379';

// Increase timeout for async operations in tests
jest.setTimeout(30000);

// Configure global mocks
global.console = {
  ...console,
  // Suppress console.log in tests unless explicitly enabled
  log: process.env.JEST_VERBOSE === 'true' ? console.log : jest.fn(),
  debug: process.env.JEST_VERBOSE === 'true' ? console.debug : jest.fn(),
  info: process.env.JEST_VERBOSE === 'true' ? console.info : jest.fn(),
  warn: console.warn,
  error: console.error,
};

// Mock timers configuration
jest.useFakeTimers({
  advanceTimers: false,
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUnifiedId(): R;
      toBeValidEmail(): R;
      toMatchPlatformSchema(platform: string): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toBeValidUnifiedId(received: unknown) {
    const pass =
      typeof received === 'object' &&
      received !== null &&
      'platform' in received &&
      'platformId' in received &&
      'entityType' in received;

    return {
      message: () =>
        pass
          ? `Expected ${received} not to be a valid UnifiedId`
          : `Expected ${received} to be a valid UnifiedId`,
      pass,
    };
  },

  toBeValidEmail(received: string) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pass = emailRegex.test(received);

    return {
      message: () =>
        pass
          ? `Expected ${received} not to be a valid email`
          : `Expected ${received} to be a valid email`,
      pass,
    };
  },

  toMatchPlatformSchema(received: unknown, platform: string) {
    // This would implement platform-specific schema validation
    // For now, just check if it's an object
    const pass = typeof received === 'object' && received !== null;

    return {
      message: () =>
        pass
          ? `Expected ${received} not to match ${platform} schema`
          : `Expected ${received} to match ${platform} schema`,
      pass,
    };
  },
});

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Clean up after tests
afterAll(async () => {
  // Clean up any global resources
  jest.useRealTimers();
});
