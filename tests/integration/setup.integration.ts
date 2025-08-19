import { jest } from '@jest/globals';
import { config } from 'dotenv';
import path from 'path';

// Load test environment variables
config({ path: path.join(process.cwd(), '.env.test') });

// Global test configuration
jest.setTimeout(60000); // 60 seconds for integration tests

// Mock external services if not in real integration mode
const isRealIntegration = process.env.REAL_INTEGRATION === 'true';

if (!isRealIntegration) {
  // Mock ChromaDB
  jest.mock('chromadb', () => ({
    ChromaApi: jest.fn(() => ({
      reset: jest.fn(),
      createCollection: jest.fn(),
      getCollection: jest.fn(),
      deleteCollection: jest.fn(),
      heartbeat: jest.fn(),
    })),
    OpenAIEmbeddingFunction: jest.fn(),
  }));

  // Mock MSAL Node
  jest.mock('@azure/msal-node', () => ({
    ConfidentialClientApplication: jest.fn(() => ({
      getAuthCodeUrl: jest.fn(),
      acquireTokenByCode: jest.fn(),
      acquireTokenSilent: jest.fn(),
    })),
    AuthenticationResult: jest.fn(),
    TokenCacheContext: jest.fn(),
  }));

  // Mock node-fetch for HTTP requests
  jest.mock('node-fetch', () => jest.fn());
}

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveValidAuthResponse(): R;
      toHaveValidEmailResponse(): R;
      toHaveValidMCPResponse(): R;
    }
  }
}

// Custom matchers
expect.extend({
  toHaveValidAuthResponse(received: any) {
    const pass =
      received &&
      typeof received.success === 'boolean' &&
      (received.success === false || received.authUrl);

    if (pass) {
      return {
        message: () => `Expected ${received} not to be a valid auth response`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `Expected ${received} to be a valid auth response with success boolean and authUrl if successful`,
        pass: false,
      };
    }
  },

  toHaveValidEmailResponse(received: any) {
    const pass =
      received &&
      typeof received.success === 'boolean' &&
      (received.success === false || received.data);

    if (pass) {
      return {
        message: () => `Expected ${received} not to be a valid email response`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `Expected ${received} to be a valid email response with success boolean and data if successful`,
        pass: false,
      };
    }
  },

  toHaveValidMCPResponse(received: any) {
    const pass =
      received &&
      received.content &&
      Array.isArray(received.content) &&
      received.content.length > 0;

    if (pass) {
      return {
        message: () => `Expected ${received} not to be a valid MCP response`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received} to be a valid MCP response with content array`,
        pass: false,
      };
    }
  },
});

// Global test hooks
beforeAll(async () => {
  // Global setup for all integration tests
  console.log('🧪 Starting Integration Test Suite');
  console.log(`Mode: ${isRealIntegration ? 'Real Integration' : 'Mocked'}`);
});

afterAll(async () => {
  // Global cleanup
  console.log('🏁 Integration Test Suite Complete');

  // Force garbage collection
  if (global.gc) {
    global.gc();
  }
});

// Export test configuration
export const testConfig = {
  isRealIntegration,
  timeout: 60000,
  retries: 2,
  platforms: ['microsoft'] as const,
  mockData: {
    userId: 'test-user-123',
    clientId: 'test-client-id',
    tenantId: 'test-tenant-id',
  },
};
