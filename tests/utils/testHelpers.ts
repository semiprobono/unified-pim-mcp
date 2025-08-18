/**
 * Test utilities and helpers for Microsoft Graph adapter testing
 */

import { Logger } from '../../src/shared/logging/Logger.js';
import { 
  createMockLogger, 
  sleep, 
  waitFor, 
  generateTestId,
  generateTestEmail,
  generateTestJWT,
  TEST_CONFIG,
  TEST_TIMESTAMPS
} from '../fixtures/testData.js';

/**
 * Test environment setup helpers
 */
export class TestEnvironment {
  private static originalEnv: Record<string, string | undefined> = {};

  /**
   * Setup test environment variables
   */
  static setup(overrides: Record<string, string> = {}): void {
    const testEnv = {
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
      CHROMADB_HOST: 'localhost',
      CHROMADB_PORT: '8000',
      AZURE_CLIENT_ID: TEST_CONFIG.AZURE_CLIENT_ID,
      AZURE_TENANT_ID: TEST_CONFIG.AZURE_TENANT_ID,
      AZURE_CLIENT_SECRET: TEST_CONFIG.AZURE_CLIENT_SECRET,
      ...overrides
    };

    // Save original values
    Object.keys(testEnv).forEach(key => {
      if (!(key in this.originalEnv)) {
        this.originalEnv[key] = process.env[key];
      }
      process.env[key] = testEnv[key];
    });
  }

  /**
   * Restore original environment variables
   */
  static teardown(): void {
    Object.keys(this.originalEnv).forEach(key => {
      if (this.originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = this.originalEnv[key];
      }
    });
    this.originalEnv = {};
  }

  /**
   * Get test-specific configuration
   */
  static getConfig() {
    return {
      chromaDbUrl: `http://${process.env.CHROMADB_HOST}:${process.env.CHROMADB_PORT}`,
      azureClientId: process.env.AZURE_CLIENT_ID!,
      azureTenantId: process.env.AZURE_TENANT_ID!,
      graphApiUrl: 'https://graph.microsoft.com/v1.0',
      logLevel: process.env.LOG_LEVEL || 'error',
    };
  }
}

/**
 * Test data generators with realistic patterns
 */
export class TestDataGenerator {
  private static counter = 0;

  /**
   * Generate realistic test user data
   */
  static createTestUser(overrides: Partial<any> = {}) {
    const id = generateTestId('user');
    const firstName = `TestUser${++this.counter}`;
    const lastName = 'Generated';
    const email = generateTestEmail();
    
    return {
      id,
      displayName: `${firstName} ${lastName}`,
      givenName: firstName,
      surname: lastName,
      mail: email,
      userPrincipalName: email,
      jobTitle: 'Test Engineer',
      officeLocation: 'Test Office',
      businessPhones: ['+1 555-0123'],
      mobilePhone: '+1 555-0124',
      preferredLanguage: 'en-US',
      ...overrides
    };
  }

  /**
   * Generate test email messages
   */
  static createTestMessages(count: number = 5) {
    return Array.from({ length: count }, (_, i) => ({
      id: generateTestId('msg'),
      subject: `Test Email ${i + 1}`,
      from: {
        emailAddress: {
          name: `Sender ${i + 1}`,
          address: generateTestEmail()
        }
      },
      toRecipients: [{
        emailAddress: {
          name: 'Test User',
          address: generateTestEmail()
        }
      }],
      receivedDateTime: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      isRead: Math.random() > 0.5,
      hasAttachments: Math.random() > 0.7,
      bodyPreview: `This is test email ${i + 1} preview...`,
      importance: Math.random() > 0.8 ? 'high' : 'normal'
    }));
  }

  /**
   * Generate test calendar events
   */
  static createTestEvents(count: number = 3) {
    return Array.from({ length: count }, (_, i) => {
      const startTime = new Date(Date.now() + Math.random() * 86400000 * 7); // Next 7 days
      const endTime = new Date(startTime.getTime() + 3600000); // 1 hour duration
      
      return {
        id: generateTestId('evt'),
        subject: `Test Meeting ${i + 1}`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'UTC'
        },
        end: {
          dateTime: endTime.toISOString(), 
          timeZone: 'UTC'
        },
        location: {
          displayName: `Conference Room ${i + 1}`
        },
        attendees: [{
          type: 'required',
          status: {
            response: 'none',
            time: '0001-01-01T00:00:00Z'
          },
          emailAddress: {
            name: `Attendee ${i + 1}`,
            address: generateTestEmail()
          }
        }],
        isOrganizer: true,
        importance: 'normal',
        sensitivity: 'normal'
      };
    });
  }

  /**
   * Generate test contacts
   */
  static createTestContacts(count: number = 3) {
    return Array.from({ length: count }, (_, i) => ({
      id: generateTestId('contact'),
      displayName: `Test Contact ${i + 1}`,
      givenName: `Contact${i + 1}`,
      surname: 'Generated',
      emailAddresses: [{
        name: `Contact ${i + 1}`,
        address: generateTestEmail()
      }],
      businessPhones: [`+1 555-${String(i + 1).padStart(4, '0')}`],
      companyName: `Test Company ${i + 1}`,
      jobTitle: `Position ${i + 1}`,
      department: 'Test Department'
    }));
  }

  /**
   * Generate test tasks
   */
  static createTestTasks(count: number = 4) {
    return Array.from({ length: count }, (_, i) => {
      const dueDate = new Date(Date.now() + Math.random() * 86400000 * 14); // Next 14 days
      
      return {
        id: generateTestId('task'),
        title: `Test Task ${i + 1}`,
        status: ['notStarted', 'inProgress', 'completed'][Math.floor(Math.random() * 3)],
        importance: Math.random() > 0.7 ? 'high' : 'normal',
        dueDateTime: {
          dateTime: dueDate.toISOString(),
          timeZone: 'UTC'
        },
        body: {
          content: `This is the description for test task ${i + 1}`,
          contentType: 'text'
        },
        categories: ['Work', 'Personal'][Math.floor(Math.random() * 2)]
      };
    });
  }

  /**
   * Generate test files/drive items
   */
  static createTestFiles(count: number = 3) {
    const fileTypes = [
      { name: 'document.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { name: 'spreadsheet.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { name: 'presentation.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
      { name: 'image.png', mimeType: 'image/png' },
      { name: 'document.pdf', mimeType: 'application/pdf' }
    ];

    return Array.from({ length: count }, (_, i) => {
      const fileType = fileTypes[i % fileTypes.length];
      const size = Math.floor(Math.random() * 1000000) + 1000; // 1KB to 1MB
      
      return {
        id: generateTestId('file'),
        name: `test-${i + 1}-${fileType.name}`,
        size,
        createdDateTime: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
        lastModifiedDateTime: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        webUrl: `https://example.sharepoint.com/test-${i + 1}-${fileType.name}`,
        file: {
          mimeType: fileType.mimeType,
          hashes: {
            quickXorHash: generateTestId('hash')
          }
        },
        parentReference: {
          driveId: generateTestId('drive'),
          driveType: 'personal',
          id: generateTestId('folder'),
          path: '/drive/root:'
        }
      };
    });
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestUtils {
  /**
   * Measure execution time of a function
   */
  static async measureTime<T>(fn: () => Promise<T> | T): Promise<{ result: T; duration: number }> {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    
    return { result, duration };
  }

  /**
   * Run performance benchmark
   */
  static async runBenchmark<T>(
    name: string,
    fn: () => Promise<T> | T,
    iterations: number = 100
  ): Promise<{ name: string; stats: PerformanceStats }> {
    const times: number[] = [];
    
    console.log(`Running benchmark: ${name} (${iterations} iterations)`);
    
    for (let i = 0; i < iterations; i++) {
      const { duration } = await this.measureTime(fn);
      times.push(duration);
      
      if (i % Math.max(1, Math.floor(iterations / 10)) === 0) {
        console.log(`Progress: ${Math.round((i / iterations) * 100)}%`);
      }
    }
    
    const stats = this.calculateStats(times);
    console.log(`Completed: ${name}`, stats);
    
    return { name, stats };
  }

  /**
   * Calculate performance statistics
   */
  private static calculateStats(times: number[]): PerformanceStats {
    const sorted = times.sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    
    return {
      min: Math.min(...times),
      max: Math.max(...times),
      mean: sum / times.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      stdDev: Math.sqrt(times.map(x => Math.pow(x - (sum / times.length), 2)).reduce((a, b) => a + b, 0) / times.length)
    };
  }

  /**
   * Memory usage monitoring
   */
  static getMemoryUsage() {
    const usage = process.memoryUsage();
    return {
      rss: Math.round(usage.rss / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      external: Math.round(usage.external / 1024 / 1024), // MB
    };
  }

  /**
   * Monitor memory usage over time
   */
  static async monitorMemory(durationMs: number = 10000, intervalMs: number = 1000): Promise<MemorySnapshot[]> {
    const snapshots: MemorySnapshot[] = [];
    const startTime = Date.now();
    
    const interval = setInterval(() => {
      const timestamp = Date.now() - startTime;
      const memory = this.getMemoryUsage();
      snapshots.push({ timestamp, ...memory });
    }, intervalMs);
    
    await sleep(durationMs);
    clearInterval(interval);
    
    return snapshots;
  }
}

/**
 * Test assertion helpers
 */
export class TestAssertions {
  /**
   * Assert that a function completes within a time limit
   */
  static async assertCompletesWithin<T>(
    fn: () => Promise<T> | T,
    maxTimeMs: number,
    message?: string
  ): Promise<T> {
    const { result, duration } = await PerformanceTestUtils.measureTime(fn);
    
    if (duration > maxTimeMs) {
      throw new Error(message || `Function took ${duration}ms, expected <${maxTimeMs}ms`);
    }
    
    return result;
  }

  /**
   * Assert that memory usage doesn't exceed a limit
   */
  static assertMemoryUsageBelow(limitMB: number, message?: string): void {
    const usage = PerformanceTestUtils.getMemoryUsage();
    
    if (usage.heapUsed > limitMB) {
      throw new Error(message || `Heap usage ${usage.heapUsed}MB exceeds limit ${limitMB}MB`);
    }
  }

  /**
   * Assert that an operation has acceptable performance characteristics
   */
  static assertPerformanceAcceptable(stats: PerformanceStats, thresholds: PerformanceThresholds): void {
    const failures: string[] = [];
    
    if (thresholds.maxMean && stats.mean > thresholds.maxMean) {
      failures.push(`Mean time ${stats.mean.toFixed(2)}ms > ${thresholds.maxMean}ms`);
    }
    
    if (thresholds.maxP95 && stats.p95 > thresholds.maxP95) {
      failures.push(`P95 time ${stats.p95.toFixed(2)}ms > ${thresholds.maxP95}ms`);
    }
    
    if (thresholds.maxP99 && stats.p99 > thresholds.maxP99) {
      failures.push(`P99 time ${stats.p99.toFixed(2)}ms > ${thresholds.maxP99}ms`);
    }
    
    if (failures.length > 0) {
      throw new Error(`Performance thresholds exceeded:\n${failures.join('\n')}`);
    }
  }
}

/**
 * Mock factory for consistent test mocks
 */
export class MockFactory {
  /**
   * Create a mock logger with consistent behavior
   */
  static createLogger(): Logger {
    return createMockLogger() as unknown as Logger;
  }

  /**
   * Create mock HTTP responses
   */
  static createHttpResponse(status: number = 200, data: any = {}, headers: Record<string, string> = {}) {
    return {
      status,
      statusText: status >= 200 && status < 300 ? 'OK' : 'Error',
      data,
      headers: {
        'content-type': 'application/json',
        'x-ratelimit-remaining': '9999',
        'x-ratelimit-limit': '10000',
        'x-ratelimit-reset': Math.floor((Date.now() + 600000) / 1000).toString(),
        ...headers
      },
      config: {
        url: '/test-endpoint',
        method: 'GET'
      }
    };
  }

  /**
   * Create mock authentication tokens
   */
  static createAuthTokens(overrides: Partial<any> = {}) {
    return {
      accessToken: generateTestJWT({
        aud: TEST_CONFIG.AZURE_CLIENT_ID,
        iss: `https://login.microsoftonline.com/${TEST_CONFIG.AZURE_TENANT_ID}/v2.0`,
        preferred_username: generateTestEmail(),
        ...overrides.claims
      }),
      refreshToken: generateTestId('refresh'),
      expiresOn: new Date(Date.now() + 3600000), // 1 hour
      scopes: ['https://graph.microsoft.com/User.Read'],
      ...overrides
    };
  }
}

/**
 * Test cleanup utilities
 */
export class TestCleanup {
  private static cleanupTasks: Array<() => Promise<void> | void> = [];

  /**
   * Register a cleanup task
   */
  static register(task: () => Promise<void> | void): void {
    this.cleanupTasks.push(task);
  }

  /**
   * Execute all cleanup tasks
   */
  static async executeAll(): Promise<void> {
    const tasks = [...this.cleanupTasks];
    this.cleanupTasks.length = 0;

    for (const task of tasks.reverse()) {
      try {
        await task();
      } catch (error) {
        console.error('Cleanup task failed:', error);
      }
    }
  }

  /**
   * Clear all registered tasks
   */
  static clear(): void {
    this.cleanupTasks.length = 0;
  }
}

/**
 * Type definitions for test utilities
 */
export interface PerformanceStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stdDev: number;
}

export interface PerformanceThresholds {
  maxMean?: number;
  maxP95?: number;
  maxP99?: number;
}

export interface MemorySnapshot {
  timestamp: number;
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
}

/**
 * Common test patterns and scenarios
 */
export const TestScenarios = {
  /**
   * OAuth flow test scenario
   */
  oauthFlow: {
    validCredentials: () => ({
      clientId: TEST_CONFIG.AZURE_CLIENT_ID,
      tenantId: TEST_CONFIG.AZURE_TENANT_ID,
      redirectUri: 'http://localhost:3000/auth/callback'
    }),
    
    invalidCredentials: () => ({
      clientId: 'invalid-client-id',
      tenantId: 'invalid-tenant-id',
      redirectUri: 'http://localhost:3000/auth/callback'
    })
  },

  /**
   * API request scenarios
   */
  apiRequests: {
    success: { status: 200, delay: 100 },
    rateLimited: { status: 429, delay: 0, retryAfter: 60 },
    serverError: { status: 500, delay: 200 },
    timeout: { status: 0, delay: 35000 }, // Longer than typical timeout
    networkError: { error: 'ECONNREFUSED' }
  },

  /**
   * Performance scenarios
   */
  performance: {
    baseline: { iterations: 100, concurrent: 1 },
    load: { iterations: 1000, concurrent: 10 },
    stress: { iterations: 5000, concurrent: 50 }
  }
};

// Export test utilities
export {
  createMockLogger,
  sleep,
  waitFor,
  generateTestId,
  generateTestEmail,
  generateTestJWT,
  TEST_CONFIG,
  TEST_TIMESTAMPS
};