/**
 * General test data and utilities for testing
 */

import crypto from 'crypto';

/**
 * Test configuration constants
 */
export const TEST_CONFIG = {
  AZURE_CLIENT_ID: 'test-client-id',
  AZURE_TENANT_ID: 'test-tenant-id',
  AZURE_CLIENT_SECRET: 'test-client-secret',
  REDIRECT_URI: 'http://localhost:3000/auth/callback',
  GRAPH_API_BASE_URL: 'https://graph.microsoft.com/v1.0',
  GRAPH_API_BETA_URL: 'https://graph.microsoft.com/beta',
  CHROMADB_HOST: 'localhost',
  CHROMADB_PORT: 8000,
};

/**
 * Test user data
 */
export const TEST_USER = {
  id: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  homeAccountId: 'test-home-account-id',
  tenantId: 'test-tenant-id',
};

/**
 * Test timestamps (predictable for testing)
 */
export const TEST_TIMESTAMPS = {
  NOW: new Date('2024-01-15T10:30:00.000Z'),
  ONE_HOUR_AGO: new Date('2024-01-15T09:30:00.000Z'),
  ONE_HOUR_LATER: new Date('2024-01-15T11:30:00.000Z'),
  ONE_DAY_AGO: new Date('2024-01-14T10:30:00.000Z'),
  ONE_DAY_LATER: new Date('2024-01-16T10:30:00.000Z'),
  EXPIRED_TOKEN: new Date('2024-01-15T08:30:00.000Z'), // 2 hours ago
  FUTURE_TOKEN: new Date('2024-01-15T12:30:00.000Z'), // 2 hours later
};

/**
 * Test scopes for different Graph API permissions
 */
export const TEST_SCOPES = {
  BASIC: ['https://graph.microsoft.com/User.Read'],
  EMAIL_READ: ['https://graph.microsoft.com/Mail.Read'],
  EMAIL_WRITE: ['https://graph.microsoft.com/Mail.ReadWrite'],
  CALENDAR_READ: ['https://graph.microsoft.com/Calendars.Read'],
  CALENDAR_WRITE: ['https://graph.microsoft.com/Calendars.ReadWrite'],
  CONTACTS_READ: ['https://graph.microsoft.com/Contacts.Read'],
  CONTACTS_WRITE: ['https://graph.microsoft.com/Contacts.ReadWrite'],
  FILES_READ: ['https://graph.microsoft.com/Files.Read'],
  FILES_WRITE: ['https://graph.microsoft.com/Files.ReadWrite'],
  TASKS_READ: ['https://graph.microsoft.com/Tasks.Read'],
  TASKS_WRITE: ['https://graph.microsoft.com/Tasks.ReadWrite'],
  ALL: [
    'https://graph.microsoft.com/User.Read',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/Calendars.ReadWrite',
    'https://graph.microsoft.com/Contacts.ReadWrite',
    'https://graph.microsoft.com/Files.ReadWrite',
    'https://graph.microsoft.com/Tasks.ReadWrite',
  ],
};

/**
 * Cache configuration for testing
 */
export const TEST_CACHE_CONFIG = {
  DEFAULT_TTL: 300000, // 5 minutes
  MAX_SIZE: 100,
  CLEANUP_INTERVAL: 60000, // 1 minute
};

/**
 * Rate limiter configuration for testing
 */
export const TEST_RATE_LIMIT_CONFIG = {
  maxRequests: 100,
  windowMs: 60000, // 1 minute
  maxConcurrent: 5,
  minTime: 100,
};

/**
 * Circuit breaker configuration for testing
 */
export const TEST_CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 5000, // 5 seconds
  resetTimeout: 10000, // 10 seconds
  volumeThreshold: 5,
  errorThresholdPercentage: 50,
};

/**
 * ChromaDB test collections
 */
export const TEST_COLLECTIONS = {
  CACHE: 'test-graph-api-cache',
  SEARCH: 'test-graph-search-index',
  METADATA: 'test-graph-metadata',
};

/**
 * Test endpoints for Graph API
 */
export const TEST_ENDPOINTS = {
  ME: '/me',
  MESSAGES: '/me/messages',
  EVENTS: '/me/events',
  CONTACTS: '/me/contacts',
  DRIVE_ITEMS: '/me/drive/items',
  TODO_TASKS: '/me/todo/lists/tasks',
  BATCH: '/$batch',
};

/**
 * Mock HTTP response headers
 */
export const createMockHeaders = (
  overrides: Record<string, string> = {}
): Record<string, string> => ({
  'content-type': 'application/json',
  'x-ratelimit-remaining': '9999',
  'x-ratelimit-limit': '10000',
  'x-ratelimit-reset': Math.floor((Date.now() + 600000) / 1000).toString(),
  'request-id': 'test-request-id',
  ...overrides,
});

/**
 * Generate test IDs
 */
export const generateTestId = (prefix: string = 'test'): string => {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
};

/**
 * Generate test email address
 */
export const generateTestEmail = (domain: string = 'example.com'): string => {
  const username = crypto.randomBytes(4).toString('hex');
  return `test-${username}@${domain}`;
};

/**
 * Generate test JWT token (not cryptographically valid, just for structure)
 */
export const generateTestJWT = (payload: Record<string, any> = {}): string => {
  const header = {
    typ: 'JWT',
    alg: 'RS256',
    kid: 'test-key-id',
  };

  const defaultPayload = {
    aud: 'test-client-id',
    iss: 'https://login.microsoftonline.com/test-tenant-id/v2.0',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    preferred_username: 'test@example.com',
    oid: 'test-object-id',
    tid: 'test-tenant-id',
    ...payload,
  };

  // Base64 encode (not cryptographically signed, just for testing)
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(defaultPayload)).toString('base64url');
  const signature = 'test-signature';

  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

/**
 * Test error scenarios
 */
export const TEST_ERRORS = {
  NETWORK_ERROR: new Error('Network request failed'),
  TIMEOUT_ERROR: new Error('Request timeout'),
  INVALID_TOKEN: new Error('Invalid access token'),
  RATE_LIMIT_ERROR: Object.assign(new Error('Rate limit exceeded'), {
    response: {
      status: 429,
      headers: { 'retry-after': '300' },
    },
  }),
  SERVER_ERROR: Object.assign(new Error('Internal server error'), {
    response: {
      status: 500,
    },
  }),
  SERVICE_UNAVAILABLE: Object.assign(new Error('Service unavailable'), {
    response: {
      status: 503,
    },
  }),
};

/**
 * Sleep utility for tests
 */
export const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create mock cache entry
 */
export const createMockCacheEntry = (overrides: Record<string, any> = {}) => ({
  id: generateTestId('cache'),
  endpoint: '/me/messages',
  method: 'GET',
  data: { value: [] as any[] },
  timestamp: Date.now(),
  ttl: TEST_CACHE_CONFIG.DEFAULT_TTL,
  metadata: {},
  ...overrides,
});

/**
 * Create mock search entry
 */
export const createMockSearchEntry = (overrides: Record<string, any> = {}) => ({
  id: generateTestId('search'),
  type: 'email' as const,
  content: 'Test email content for search indexing',
  metadata: {
    subject: 'Test Email',
    from: 'test@example.com',
    timestamp: Date.now(),
  },
  timestamp: Date.now(),
  ...overrides,
});

/**
 * Create mock sync metadata
 */
export const createMockSyncMetadata = (overrides: Record<string, any> = {}) => ({
  id: generateTestId('sync'),
  resource: 'messages',
  deltaToken: 'test-delta-token',
  lastSync: Date.now(),
  syncState: {
    lastFullSync: Date.now() - 86400000, // 24 hours ago
    itemCount: 100,
  },
  ...overrides,
});

/**
 * Performance test data generators
 */
export const generateLargeDataset = (
  size: number,
  type: 'messages' | 'events' | 'contacts' = 'messages'
) => {
  const items = [];
  for (let i = 0; i < size; i++) {
    switch (type) {
      case 'messages':
        items.push({
          id: generateTestId('msg'),
          subject: `Test Message ${i}`,
          from: generateTestEmail(),
          receivedDateTime: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
          isRead: Math.random() > 0.5,
        });
        break;
      case 'events':
        items.push({
          id: generateTestId('evt'),
          subject: `Test Event ${i}`,
          start: { dateTime: new Date(Date.now() + Math.random() * 86400000 * 30).toISOString() },
          end: {
            dateTime: new Date(Date.now() + Math.random() * 86400000 * 30 + 3600000).toISOString(),
          },
          isOrganizer: Math.random() > 0.5,
        });
        break;
      case 'contacts':
        items.push({
          id: generateTestId('contact'),
          displayName: `Test Contact ${i}`,
          emailAddresses: [{ address: generateTestEmail() }],
          createdDateTime: new Date(Date.now() - Math.random() * 86400000 * 365).toISOString(),
        });
        break;
    }
  }
  return items;
};

/**
 * Test utilities for async operations
 */
export const waitFor = async (
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000
): Promise<void> => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(50);
  }
  throw new Error(`Condition not met within ${timeout}ms`);
};

/**
 * Mock environment variables
 */
export const mockEnvVars = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'error',
  AZURE_CLIENT_ID: TEST_CONFIG.AZURE_CLIENT_ID,
  AZURE_TENANT_ID: TEST_CONFIG.AZURE_TENANT_ID,
  AZURE_CLIENT_SECRET: TEST_CONFIG.AZURE_CLIENT_SECRET,
  CHROMADB_HOST: TEST_CONFIG.CHROMADB_HOST,
  CHROMADB_PORT: TEST_CONFIG.CHROMADB_PORT.toString(),
};

/**
 * Test data validation utilities
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isValidUUID = (uuid: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
};

export const isValidJWT = (token: string): boolean => {
  const parts = token.split('.');
  return parts.length === 3;
};

/**
 * Mock logger for tests
 */
export const createMockLogger = () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});
