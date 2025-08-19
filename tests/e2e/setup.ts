import { jest } from '@jest/globals';

// E2E test setup
beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';

  // Disable real external services in E2E tests
  process.env.MOCK_PLATFORMS = 'true';
  process.env.CACHE_MEMORY_TTL = '1000'; // Short TTL for tests

  // Wait for any async setup to complete
  await new Promise(resolve => setTimeout(resolve, 1000));
});

afterAll(async () => {
  // Clean up after E2E tests
  await new Promise(resolve => setTimeout(resolve, 1000));
});

// Increase timeout for E2E tests
jest.setTimeout(30000);
