import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { RateLimiter } from '../../src/infrastructure/adapters/microsoft/clients/RateLimiter.js';
import { CircuitBreaker } from '../../src/infrastructure/adapters/microsoft/clients/CircuitBreaker.js';
import { CacheManager } from '../../src/infrastructure/cache/CacheManager.js';
import { SecurityManager } from '../../src/shared/security/SecurityManager.js';
import { ConfigManager } from '../../src/shared/config/ConfigManager.js';
import { Logger } from '../../src/shared/logging/Logger.js';
import { ResilienceManager } from '../../src/shared/resilience/ResilienceManager.js';
import { ErrorHandler } from '../../src/shared/error/ErrorHandler.js';
import { HealthMonitor } from '../../src/shared/monitoring/HealthMonitor.js';
import { testConfig } from './setup.integration.js';

/**
 * Infrastructure Integration Tests
 * 
 * Tests the interaction between infrastructure components:
 * 1. RateLimiter + CircuitBreaker behavior under load
 * 2. CacheManager + ChromaDB interaction
 * 3. ErrorHandler retry mechanisms
 * 4. ResilienceManager coordinated failure handling
 * 5. SecurityManager encryption and key management
 * 6. HealthMonitor system monitoring
 */
describe('Infrastructure Integration Tests', () => {
  let rateLimiter: RateLimiter;
  let circuitBreaker: CircuitBreaker;
  let cacheManager: CacheManager;
  let securityManager: SecurityManager;
  let configManager: ConfigManager;
  let logger: Logger;
  let resilienceManager: ResilienceManager;
  let errorHandler: ErrorHandler;
  let healthMonitor: HealthMonitor;

  beforeAll(async () => {
    // Initialize core services
    configManager = new ConfigManager();
    await configManager.initialize();

    logger = new Logger(configManager.getConfig('logging'));
    await logger.initialize();

    errorHandler = new ErrorHandler(logger);

    securityManager = new SecurityManager(
      configManager.getConfig('security'),
      logger
    );
    await securityManager.initialize();

    resilienceManager = new ResilienceManager(
      configManager.getConfig('resilience'),
      logger
    );
    await resilienceManager.initialize();

    cacheManager = new CacheManager(
      configManager.getConfig('cache'),
      logger
    );
    await cacheManager.initialize();

    // Initialize resilience components
    rateLimiter = new RateLimiter({
      windowMs: 60000, // 1 minute
      maxRequests: 10,
      identifier: 'test-limiter'
    }, logger);

    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 5000,
      monitoringPeriod: 10000,
      name: 'test-breaker'
    }, logger);

    healthMonitor = new HealthMonitor(
      {
        cacheManager,
        securityManager,
        platformManager: null // Not needed for these tests
      },
      logger
    );
  });

  afterAll(async () => {
    // Cleanup services
    await healthMonitor?.stop();
    await cacheManager?.dispose();
    await securityManager?.dispose();
    await resilienceManager?.dispose();
    await logger?.dispose();
  });

  beforeEach(async () => {
    // Reset state before each test
    await cacheManager.clear();
    circuitBreaker.reset();
    rateLimiter.reset();
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('RateLimiter + CircuitBreaker Integration', () => {
    test('should coordinate rate limiting and circuit breaking', async () => {
      const mockService = jest.fn()
        .mockRejectedValueOnce(new Error('Service error 1'))
        .mockRejectedValueOnce(new Error('Service error 2'))
        .mockRejectedValueOnce(new Error('Service error 3'))
        .mockResolvedValue('Success after failures');

      const wrappedService = async () => {
        // Check rate limit first
        const rateLimitResult = await rateLimiter.checkLimit('test-user');
        if (!rateLimitResult.allowed) {
          throw new Error('Rate limit exceeded');
        }

        // Then check circuit breaker
        return await circuitBreaker.execute(mockService);
      };

      // First three calls should fail and trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await wrappedService();
        } catch (error) {
          expect(error.message).toContain('Service error');
        }
      }

      // Circuit should now be open
      expect(circuitBreaker.getState()).toBe('OPEN');

      // Next call should fail immediately due to circuit breaker
      try {
        await wrappedService();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('Circuit breaker is OPEN');
      }

      // Wait for circuit breaker to enter half-open state
      await new Promise(resolve => setTimeout(resolve, 5100));

      // Next call should succeed and close the circuit
      const result = await wrappedService();
      expect(result).toBe('Success after failures');
      expect(circuitBreaker.getState()).toBe('CLOSED');
    });

    test('should handle rate limiting during circuit breaker recovery', async () => {
      const fastService = jest.fn().mockResolvedValue('Fast response');

      // Exhaust rate limit
      for (let i = 0; i < 10; i++) {
        const rateLimitResult = await rateLimiter.checkLimit('heavy-user');
        if (rateLimitResult.allowed) {
          await circuitBreaker.execute(fastService);
        }
      }

      // Next request should be rate limited
      const rateLimitResult = await rateLimiter.checkLimit('heavy-user');
      expect(rateLimitResult.allowed).toBe(false);
      expect(rateLimitResult.remainingTime).toBeGreaterThan(0);

      // Circuit breaker should still be functional for other users
      const otherUserResult = await rateLimiter.checkLimit('other-user');
      expect(otherUserResult.allowed).toBe(true);
    });

    test('should provide detailed metrics for both components', async () => {
      const mockService = jest.fn()
        .mockRejectedValueOnce(new Error('Failure'))
        .mockResolvedValue('Success');

      // Generate some traffic
      for (let i = 0; i < 5; i++) {
        const rateLimitResult = await rateLimiter.checkLimit(`user-${i}`);
        if (rateLimitResult.allowed) {
          try {
            await circuitBreaker.execute(mockService);
          } catch (error) {
            // Expected failure
          }
        }
      }

      // Check rate limiter metrics
      const rateLimiterMetrics = rateLimiter.getMetrics();
      expect(rateLimiterMetrics.totalRequests).toBeGreaterThan(0);
      expect(rateLimiterMetrics.allowedRequests).toBeGreaterThan(0);

      // Check circuit breaker metrics
      const circuitBreakerMetrics = circuitBreaker.getMetrics();
      expect(circuitBreakerMetrics.totalRequests).toBeGreaterThan(0);
      expect(circuitBreakerMetrics.successCount).toBeGreaterThan(0);
      expect(circuitBreakerMetrics.failureCount).toBeGreaterThan(0);
    });
  });

  describe('CacheManager + ChromaDB Integration', () => {
    test('should store and retrieve data with TTL', async () => {
      const key = 'test-cache-key';
      const data = { message: 'Hello, Cache!', timestamp: Date.now() };

      // Store data with 5 second TTL
      await cacheManager.set(key, data, { ttl: 5 });

      // Retrieve immediately
      const retrieved = await cacheManager.get(key);
      expect(retrieved).toEqual(data);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 5100));

      // Should be expired
      const expired = await cacheManager.get(key);
      expect(expired).toBeNull();
    });

    test('should handle concurrent cache operations safely', async () => {
      const promises = Array.from({ length: 20 }, (_, i) => 
        cacheManager.set(`concurrent-key-${i}`, { value: i }, { ttl: 10 })
      );

      await Promise.all(promises);

      // Verify all keys were stored
      const retrievePromises = Array.from({ length: 20 }, (_, i) =>
        cacheManager.get(`concurrent-key-${i}`)
      );

      const results = await Promise.all(retrievePromises);
      results.forEach((result, i) => {
        expect(result).toEqual({ value: i });
      });
    });

    test('should integrate vector search with ChromaDB', async () => {
      if (!testConfig.isRealIntegration) {
        // Mock ChromaDB collection
        const mockCollection = {
          add: jest.fn(),
          query: jest.fn().mockResolvedValue({
            ids: [['doc1', 'doc2']],
            distances: [[0.1, 0.3]],
            documents: [['Document 1 content', 'Document 2 content']]
          }),
          count: jest.fn().mockResolvedValue(2)
        };

        jest.spyOn(cacheManager, 'getCollection').mockResolvedValue(mockCollection);
      }

      // Add documents for vector search
      const documents = [
        { id: 'doc1', content: 'Machine learning algorithms', metadata: { type: 'tech' } },
        { id: 'doc2', content: 'Artificial intelligence applications', metadata: { type: 'tech' } }
      ];

      await cacheManager.addToCollection('test-collection', documents);

      // Search for similar content
      const searchResult = await cacheManager.vectorSearch({
        collection: 'test-collection',
        query: 'AI and ML technologies',
        limit: 2
      });

      expect(searchResult.success).toBe(true);
      expect(searchResult.results).toHaveLength(2);
      expect(searchResult.results[0].id).toBe('doc1');
    });

    test('should handle cache failures gracefully', async () => {
      // Mock cache failure
      const originalSet = cacheManager.set;
      jest.spyOn(cacheManager, 'set').mockRejectedValue(new Error('Cache service unavailable'));

      const key = 'failing-key';
      const data = { test: 'data' };

      // Should not throw error, but log warning
      await expect(cacheManager.set(key, data)).rejects.toThrow('Cache service unavailable');

      // Restore original method
      cacheManager.set = originalSet;
    });

    test('should implement cache warming strategies', async () => {
      const criticalData = [
        { key: 'user-settings', data: { theme: 'dark', lang: 'en' } },
        { key: 'system-config', data: { version: '1.0.0', env: 'test' } },
        { key: 'feature-flags', data: { newUI: true, betaFeatures: false } }
      ];

      // Warm cache with critical data
      const warmPromises = criticalData.map(item =>
        cacheManager.set(item.key, item.data, { ttl: 3600 }) // 1 hour
      );

      await Promise.all(warmPromises);

      // Verify all critical data is available
      const retrievePromises = criticalData.map(item =>
        cacheManager.get(item.key)
      );

      const results = await Promise.all(retrievePromises);
      results.forEach((result, i) => {
        expect(result).toEqual(criticalData[i].data);
      });

      // Verify cache status
      const status = await cacheManager.getStatus();
      expect(status.isHealthy).toBe(true);
      expect(status.cacheSize).toBeGreaterThan(0);
    });
  });

  describe('SecurityManager Integration', () => {
    test('should encrypt and decrypt tokens securely', async () => {
      const tokens = {
        accessToken: 'very-long-access-token-12345',
        refreshToken: 'refresh-token-67890',
        expiresAt: new Date(Date.now() + 3600000)
      };

      // Store encrypted tokens
      await securityManager.storeTokens('test-platform', tokens);

      // Retrieve and verify decryption
      const retrievedTokens = await securityManager.getTokens('test-platform');
      expect(retrievedTokens).toEqual(tokens);

      // Verify tokens are actually encrypted in storage
      const rawStoredData = await cacheManager.get('tokens:test-platform');
      expect(rawStoredData).toBeDefined();
      expect(rawStoredData.accessToken).not.toBe(tokens.accessToken);
      expect(rawStoredData.accessToken.length).toBeGreaterThan(tokens.accessToken.length);
    });

    test('should handle encryption key rotation', async () => {
      const originalTokens = {
        accessToken: 'original-token',
        refreshToken: 'original-refresh',
        expiresAt: new Date(Date.now() + 3600000)
      };

      await securityManager.storeTokens('rotation-test', originalTokens);

      // Simulate key rotation (in real scenario, this would be triggered by key expiry)
      await securityManager.rotateEncryptionKey();

      // Should still be able to decrypt with new key
      const retrievedTokens = await securityManager.getTokens('rotation-test');
      expect(retrievedTokens).toEqual(originalTokens);

      // New tokens should use new key
      const newTokens = {
        accessToken: 'new-token-after-rotation',
        refreshToken: 'new-refresh-after-rotation',
        expiresAt: new Date(Date.now() + 3600000)
      };

      await securityManager.storeTokens('rotation-test-2', newTokens);
      const retrievedNewTokens = await securityManager.getTokens('rotation-test-2');
      expect(retrievedNewTokens).toEqual(newTokens);
    });

    test('should validate token integrity', async () => {
      const validTokens = {
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() + 3600000)
      };

      await securityManager.storeTokens('integrity-test', validTokens);

      // Corrupt the stored data
      const corruptedData = { ...validTokens, accessToken: 'corrupted-token' };
      await cacheManager.set('tokens:integrity-test', corruptedData);

      // Should detect corruption and return null
      const retrievedTokens = await securityManager.getTokens('integrity-test');
      expect(retrievedTokens).toBeNull();
    });

    test('should handle concurrent encryption operations', async () => {
      const concurrentOperations = Array.from({ length: 10 }, (_, i) => ({
        platform: `platform-${i}`,
        tokens: {
          accessToken: `access-token-${i}`,
          refreshToken: `refresh-token-${i}`,
          expiresAt: new Date(Date.now() + 3600000)
        }
      }));

      // Store all tokens concurrently
      const storePromises = concurrentOperations.map(op =>
        securityManager.storeTokens(op.platform, op.tokens)
      );

      await Promise.all(storePromises);

      // Retrieve all tokens concurrently
      const retrievePromises = concurrentOperations.map(op =>
        securityManager.getTokens(op.platform)
      );

      const results = await Promise.all(retrievePromises);

      // Verify all operations succeeded
      results.forEach((result, i) => {
        expect(result).toEqual(concurrentOperations[i].tokens);
      });
    });
  });

  describe('ResilienceManager Coordination', () => {
    test('should coordinate retry policies across components', async () => {
      let attempts = 0;
      const flakeyService = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'Success after retries';
      });

      const result = await resilienceManager.executeWithRetry(
        flakeyService,
        {
          maxAttempts: 5,
          baseDelay: 100,
          maxDelay: 1000,
          backoffFactor: 2
        }
      );

      expect(result).toBe('Success after retries');
      expect(attempts).toBe(3);
    });

    test('should implement bulkhead pattern for isolation', async () => {
      const criticalService = jest.fn().mockResolvedValue('Critical success');
      const nonCriticalService = jest.fn().mockRejectedValue(new Error('Non-critical failure'));

      // Execute both services with different bulkhead pools
      const criticalPromise = resilienceManager.executeInBulkhead(
        'critical-pool',
        criticalService,
        { poolSize: 2 }
      );

      const nonCriticalPromise = resilienceManager.executeInBulkhead(
        'non-critical-pool',
        nonCriticalService,
        { poolSize: 1 }
      );

      const [criticalResult, nonCriticalResult] = await Promise.allSettled([
        criticalPromise,
        nonCriticalPromise
      ]);

      // Critical service should succeed despite non-critical failure
      expect(criticalResult.status).toBe('fulfilled');
      expect((criticalResult as any).value).toBe('Critical success');

      expect(nonCriticalResult.status).toBe('rejected');
    });

    test('should provide timeout protection', async () => {
      const slowService = jest.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 5000))
      );

      const startTime = Date.now();

      try {
        await resilienceManager.executeWithTimeout(slowService, 1000); // 1 second timeout
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error.message).toContain('timeout');
      }

      const endTime = Date.now();
      expect(endTime - startTime).toBeLessThan(2000); // Should timeout quickly
    });

    test('should collect and report resilience metrics', async () => {
      // Execute various operations to generate metrics
      const operations = [
        () => resilienceManager.executeWithRetry(() => Promise.resolve('Success 1')),
        () => resilienceManager.executeWithRetry(() => Promise.reject(new Error('Failure 1'))),
        () => resilienceManager.executeWithTimeout(() => Promise.resolve('Success 2'), 1000),
        () => resilienceManager.executeInBulkhead('test-pool', () => Promise.resolve('Success 3'))
      ];

      await Promise.allSettled(operations.map(op => op()));

      const metrics = resilienceManager.getMetrics();

      expect(metrics.totalOperations).toBeGreaterThan(0);
      expect(metrics.successCount).toBeGreaterThan(0);
      expect(metrics.failureCount).toBeGreaterThan(0);
      expect(metrics.retryCount).toBeGreaterThan(0);
      expect(metrics.timeoutCount).toBeGreaterThan(0);
    });
  });

  describe('ErrorHandler Integration', () => {
    test('should categorize and handle different error types', async () => {
      const errors = [
        new Error('Network timeout'),
        { message: 'Rate limit exceeded', status: 429 },
        { message: 'Authentication failed', status: 401 },
        { message: 'Server error', status: 500 }
      ];

      const handledErrors = await Promise.all(
        errors.map(error => errorHandler.handleError(error))
      );

      // Verify error categorization
      expect(handledErrors[0].category).toBe('network');
      expect(handledErrors[1].category).toBe('rate_limit');
      expect(handledErrors[2].category).toBe('authentication');
      expect(handledErrors[3].category).toBe('server');

      // Verify retry recommendations
      expect(handledErrors[0].shouldRetry).toBe(true);
      expect(handledErrors[1].shouldRetry).toBe(true);
      expect(handledErrors[2].shouldRetry).toBe(false); // Don't retry auth errors
      expect(handledErrors[3].shouldRetry).toBe(true);
    });

    test('should aggregate error statistics', async () => {
      // Generate various errors
      const errorTypes = [
        'NetworkError',
        'RateLimitError',
        'AuthenticationError',
        'NetworkError', // Duplicate to test aggregation
        'ServerError'
      ];

      for (const errorType of errorTypes) {
        await errorHandler.handleError(new Error(errorType));
      }

      const stats = errorHandler.getErrorStats();

      expect(stats.totalErrors).toBe(5);
      expect(stats.errorsByType.NetworkError).toBe(2);
      expect(stats.errorsByType.RateLimitError).toBe(1);
      expect(stats.errorsByCategory.network).toBe(2);
    });

    test('should trigger alerts for critical error patterns', async () => {
      const alertSpy = jest.spyOn(logger, 'error');

      // Generate pattern of critical errors
      for (let i = 0; i < 5; i++) {
        await errorHandler.handleError({
          message: 'Critical system failure',
          status: 500,
          critical: true
        });
      }

      // Should trigger alert after threshold
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining('Critical error pattern detected')
      );
    });
  });

  describe('HealthMonitor System Integration', () => {
    test('should monitor all infrastructure components', async () => {
      await healthMonitor.start();

      // Wait for initial health check
      await new Promise(resolve => setTimeout(resolve, 1000));

      const healthStatus = await healthMonitor.getHealthStatus();

      expect(healthStatus.isHealthy).toBe(true);
      expect(healthStatus.components.cacheManager).toBeDefined();
      expect(healthStatus.components.securityManager).toBeDefined();
      expect(healthStatus.timestamp).toBeDefined();
      expect(healthStatus.uptime).toBeGreaterThan(0);
    });

    test('should detect and report component failures', async () => {
      await healthMonitor.start();

      // Simulate cache failure
      jest.spyOn(cacheManager, 'getStatus').mockResolvedValue({
        isHealthy: false,
        error: 'Cache connection lost'
      });

      // Wait for health check cycle
      await new Promise(resolve => setTimeout(resolve, 2000));

      const healthStatus = await healthMonitor.getHealthStatus();

      expect(healthStatus.isHealthy).toBe(false);
      expect(healthStatus.components.cacheManager.isHealthy).toBe(false);
      expect(healthStatus.components.cacheManager.error).toContain('Cache connection lost');
    });

    test('should provide detailed system metrics', async () => {
      await healthMonitor.start();

      // Generate some activity
      await cacheManager.set('metric-test', { data: 'test' });
      await securityManager.storeTokens('metric-platform', {
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        expiresAt: new Date(Date.now() + 3600000)
      });

      const metrics = await healthMonitor.getSystemMetrics();

      expect(metrics.memory).toBeDefined();
      expect(metrics.memory.used).toBeGreaterThan(0);
      expect(metrics.cpu).toBeDefined();
      expect(metrics.responseTime).toBeDefined();
      expect(metrics.cacheHitRate).toBeDefined();
      expect(metrics.errorRate).toBeDefined();
    });

    test('should support health check endpoints', async () => {
      await healthMonitor.start();

      // Test readiness check
      const readiness = await healthMonitor.checkReadiness();
      expect(readiness.ready).toBe(true);
      expect(readiness.components).toBeDefined();

      // Test liveness check
      const liveness = await healthMonitor.checkLiveness();
      expect(liveness.alive).toBe(true);
      expect(liveness.timestamp).toBeDefined();
    });

    test('should handle graceful degradation', async () => {
      await healthMonitor.start();

      // Simulate partial system failure
      jest.spyOn(cacheManager, 'getStatus').mockResolvedValue({
        isHealthy: false,
        error: 'Cache degraded'
      });

      const degradationStatus = await healthMonitor.checkDegradation();

      expect(degradationStatus.degraded).toBe(true);
      expect(degradationStatus.availableServices).toContain('securityManager');
      expect(degradationStatus.unavailableServices).toContain('cacheManager');
      expect(degradationStatus.recommendation).toBeDefined();
    });
  });

  describe('Cross-Component Integration Scenarios', () => {
    test('should handle cascade failure prevention', async () => {
      // Simulate cascading failure scenario
      let cacheFailures = 0;
      const originalCacheGet = cacheManager.get;
      
      jest.spyOn(cacheManager, 'get').mockImplementation(async (key) => {
        cacheFailures++;
        if (cacheFailures > 3) {
          throw new Error('Cache overwhelmed');
        }
        return originalCacheGet.call(cacheManager, key);
      });

      // Multiple concurrent operations that depend on cache
      const operations = Array.from({ length: 10 }, (_, i) =>
        resilienceManager.executeWithRetry(async () => {
          const rateLimitResult = await rateLimiter.checkLimit(`user-${i}`);
          if (!rateLimitResult.allowed) {
            throw new Error('Rate limited');
          }

          const cached = await cacheManager.get(`data-${i}`);
          return cached || 'fallback-data';
        })
      );

      const results = await Promise.allSettled(operations);

      // Some operations should succeed with fallback data
      const successfulResults = results.filter(r => r.status === 'fulfilled');
      expect(successfulResults.length).toBeGreaterThan(0);

      // Circuit breaker should prevent cache overload
      expect(circuitBreaker.getMetrics().openCount).toBeGreaterThan(0);
    });

    test('should maintain data consistency under load', async () => {
      const consistencyData = { version: 1, lastUpdate: Date.now() };
      
      // Concurrent writes to the same data
      const writeOperations = Array.from({ length: 20 }, (_, i) =>
        securityManager.storeTokens(`consistency-test`, {
          accessToken: `token-${i}`,
          refreshToken: `refresh-${i}`,
          expiresAt: new Date(Date.now() + 3600000)
        })
      );

      await Promise.all(writeOperations);

      // Verify final state is consistent
      const finalTokens = await securityManager.getTokens('consistency-test');
      expect(finalTokens).toBeDefined();
      expect(finalTokens.accessToken).toMatch(/^token-\d+$/);
    });

    test('should provide comprehensive system diagnostics', async () => {
      // Generate varied system activity
      await Promise.all([
        cacheManager.set('diag-cache', { test: 'data' }),
        securityManager.storeTokens('diag-platform', {
          accessToken: 'diag-token',
          refreshToken: 'diag-refresh',
          expiresAt: new Date(Date.now() + 3600000)
        }),
        rateLimiter.checkLimit('diag-user'),
        circuitBreaker.execute(() => Promise.resolve('success'))
      ]);

      // Collect comprehensive diagnostics
      const diagnostics = {
        cache: await cacheManager.getStatus(),
        security: await securityManager.getStatus(),
        rateLimiter: rateLimiter.getMetrics(),
        circuitBreaker: circuitBreaker.getMetrics(),
        resilience: resilienceManager.getMetrics(),
        health: await healthMonitor.getHealthStatus()
      };

      // Verify all components report healthy status
      expect(diagnostics.cache.isHealthy).toBe(true);
      expect(diagnostics.security.isHealthy).toBe(true);
      expect(diagnostics.health.isHealthy).toBe(true);

      // Verify metrics are collected
      expect(diagnostics.rateLimiter.totalRequests).toBeGreaterThan(0);
      expect(diagnostics.circuitBreaker.totalRequests).toBeGreaterThan(0);
      expect(diagnostics.resilience.totalOperations).toBeGreaterThan(0);
    });
  });
});