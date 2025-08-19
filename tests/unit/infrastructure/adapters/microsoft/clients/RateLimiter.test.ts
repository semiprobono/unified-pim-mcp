/**
 * Unit tests for RateLimiter
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  RateLimitConfig,
  RateLimiter,
  RateLimitStatus,
} from '../../../../../../src/infrastructure/adapters/microsoft/clients/RateLimiter';
import { Logger } from '../../../../../../src/shared/logging/Logger';
import {
  createMockLogger,
  sleep,
  TEST_ERRORS,
  TEST_RATE_LIMIT_CONFIG,
} from '../../../../../fixtures/testData';

// Mock p-queue
type MockQueueFunction = () => Promise<any>;

const mockQueue = {
  add: jest.fn(),
  size: 0,
  pending: 0,
  isPaused: false,
  pause: jest.fn(),
  start: jest.fn(),
  clear: jest.fn(),
  onIdle: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

jest.mock('p-queue', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => mockQueue),
}));

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: RateLimitConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    config = { ...TEST_RATE_LIMIT_CONFIG };
    
    // Reset mock queue
    mockQueue.add = jest.fn().mockImplementation((fn: MockQueueFunction) => fn());
    mockQueue.size = 0;
    mockQueue.pending = 0;
    mockQueue.isPaused = false;
    
    rateLimiter = new RateLimiter(config, mockLogger as unknown as Logger);
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(rateLimiter).toBeInstanceOf(RateLimiter);
    });

    it('should use default values for optional config', () => {
      const minimalConfig = { maxRequests: 100, windowMs: 60000 };
      const limiter = new RateLimiter(minimalConfig, mockLogger as unknown as Logger);

      expect(limiter).toBeInstanceOf(RateLimiter);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within limit', async () => {
      const canProceed = await rateLimiter.checkRateLimit('test-endpoint');

      expect(canProceed).toBe(true);
    });

    it('should block requests exceeding limit', async () => {
      const endpoint = 'test-endpoint';

      // Make requests up to the limit
      for (let i = 0; i < config.maxRequests; i++) {
        await rateLimiter.checkRateLimit(endpoint);
      }

      // Next request should be blocked
      const canProceed = await rateLimiter.checkRateLimit(endpoint);

      expect(canProceed).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit reached for test-endpoint')
      );
    });

    it('should reset counter after window expires', async () => {
      jest.useFakeTimers();

      const endpoint = 'test-endpoint';
      const shortConfig = { ...config, windowMs: 1000 }; // 1 second window
      const limiter = new RateLimiter(shortConfig, mockLogger as unknown as Logger);

      // Fill up the limit
      for (let i = 0; i < shortConfig.maxRequests; i++) {
        await limiter.checkRateLimit(endpoint);
      }

      // Should be blocked
      expect(await limiter.checkRateLimit(endpoint)).toBe(false);

      // Advance time past the window
      jest.advanceTimersByTime(1001);

      // Should now allow requests
      expect(await limiter.checkRateLimit(endpoint)).toBe(true);

      jest.useRealTimers();
    });

    it('should handle global rate limit status', async () => {
      // Simulate rate limit status from Graph API
      const rateLimitStatus: RateLimitStatus = {
        remaining: 0,
        reset: new Date(Date.now() + 300000), // 5 minutes from now
        limit: 10000,
        retryAfter: 300000,
      };

      rateLimiter.updateRateLimitStatus({
        'x-ratelimit-remaining': '0',
        'x-ratelimit-limit': '10000',
        'x-ratelimit-reset': Math.floor((Date.now() + 300000) / 1000).toString(),
      });

      const canProceed = await rateLimiter.checkRateLimit();

      expect(canProceed).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Global rate limit exceeded')
      );
    });

    it('should allow requests after global rate limit resets', async () => {
      jest.useFakeTimers();

      // Set up expired rate limit
      const pastReset = new Date(Date.now() - 1000); // 1 second ago
      rateLimiter.updateRateLimitStatus({
        'x-ratelimit-remaining': '0',
        'x-ratelimit-limit': '10000',
        'x-ratelimit-reset': Math.floor(pastReset.getTime() / 1000).toString(),
      });

      const canProceed = await rateLimiter.checkRateLimit();

      expect(canProceed).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('executeWithRateLimit', () => {
    it('should execute function when rate limit allows', async () => {
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');

      mockQueue.add = jest.fn().mockImplementation((fn: MockQueueFunction) => fn());

      const result = await rateLimiter.executeWithRateLimit(mockFn, 'test-endpoint');

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should queue function calls', async () => {
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');

      await rateLimiter.executeWithRateLimit(mockFn, 'test-endpoint');

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
    });

    it('should retry on rate limit errors', async () => {
      const mockFn = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce({
          response: {
            status: 429,
            headers: { 'retry-after': '1' },
          },
        })
        .mockResolvedValueOnce('success');

      mockQueue.add = jest.fn().mockImplementation((fn: MockQueueFunction) => fn());

      const result = await rateLimiter.executeWithRateLimit(mockFn, 'test-endpoint', 3);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Rate limit hit (429)'));
    });

    it('should use exponential backoff for non-rate-limit errors', async () => {
      const mockFn = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error('Server error'))
        .mockResolvedValueOnce('success');

      mockQueue.add = jest.fn().mockImplementation((fn: MockQueueFunction) => fn());

      const result = await rateLimiter.executeWithRateLimit(mockFn, 'test-endpoint', 3);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw error when all retries exhausted', async () => {
      const mockError = new Error('Persistent error');
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue(mockError);

      mockQueue.add = jest.fn().mockImplementation((fn: MockQueueFunction) => fn());

      await expect(rateLimiter.executeWithRateLimit(mockFn, 'test-endpoint', 2)).rejects.toThrow();
    });

    it('should handle 429 errors with retry-after header', async () => {
      const mockFn = jest
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce({
          response: {
            status: 429,
            headers: { 'retry-after': '60' }, // 60 seconds
          },
        })
        .mockResolvedValueOnce('success');

      mockQueue.add = jest.fn().mockImplementation((fn: MockQueueFunction) => fn());

      const result = await rateLimiter.executeWithRateLimit(mockFn, 'test-endpoint', 2);

      expect(result).toBe('success');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit hit (429). Retry after 60000ms')
      );
    });
  });

  describe('updateRateLimitStatus', () => {
    it('should parse rate limit headers correctly', () => {
      const headers = {
        'x-ratelimit-remaining': '9999',
        'x-ratelimit-limit': '10000',
        'x-ratelimit-reset': Math.floor((Date.now() + 600000) / 1000).toString(),
        'retry-after': '300',
      };

      rateLimiter.updateRateLimitStatus(headers);

      const status = rateLimiter.getRateLimitStatus();
      expect(status).toEqual({
        remaining: 9999,
        limit: 10000,
        reset: expect.any(Date),
        retryAfter: 300000, // Should be in milliseconds
      });

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Rate limit status updated: 9999/10000 remaining'
      );
    });

    it('should handle missing headers gracefully', () => {
      rateLimiter.updateRateLimitStatus({});

      // Should not crash
      expect(rateLimiter.getRateLimitStatus()).toBeNull();
    });

    it('should handle malformed headers', () => {
      const headers = {
        'x-ratelimit-remaining': 'invalid',
        'x-ratelimit-limit': 'invalid',
        'x-ratelimit-reset': 'invalid',
      };

      rateLimiter.updateRateLimitStatus(headers);

      const status = rateLimiter.getRateLimitStatus();
      expect(status?.remaining).toBe(0);
      expect(status?.limit).toBe(0);
    });
  });

  describe('parseRetryAfter', () => {
    it('should parse seconds format', () => {
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue({
        response: {
          status: 429,
          headers: { 'retry-after': '120' },
        },
      });

      mockQueue.add = jest.fn().mockImplementation((fn: MockQueueFunction) => fn());

      rateLimiter.executeWithRateLimit(mockFn, 'test', 1).catch(() => {});

      // Should parse 120 seconds as 120000 milliseconds
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('120000ms'));
    });

    it('should parse date format', () => {
      const futureDate = new Date(Date.now() + 180000); // 3 minutes from now
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue({
        response: {
          status: 429,
          headers: { 'retry-after': futureDate.toISOString() },
        },
      });

      mockQueue.add = jest.fn().mockImplementation((fn: MockQueueFunction) => fn());

      rateLimiter.executeWithRateLimit(mockFn, 'test', 1).catch(() => {});

      // Should calculate time difference
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('ms'));
    });

    it('should default to 60 seconds for malformed retry-after', () => {
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue({
        response: {
          status: 429,
          headers: { 'retry-after': 'invalid' },
        },
      });

      mockQueue.add = jest.fn().mockImplementation((fn: MockQueueFunction) => fn());

      rateLimiter.executeWithRateLimit(mockFn, 'test', 1).catch(() => {});

      // Should default to 60000ms (1 minute)
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('60000ms'));
    });
  });

  describe('queue management', () => {
    it('should return queue statistics', () => {
      mockQueue.size = 5;
      mockQueue.pending = 2;
      mockQueue.isPaused = false;

      const stats = rateLimiter.getQueueStats();

      expect(stats).toEqual({
        size: 5,
        pending: 2,
        isPaused: false,
      });
    });

    it('should pause the queue', () => {
      rateLimiter.pause();

      expect(mockQueue.pause).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Rate limiter paused');
    });

    it('should resume the queue', () => {
      rateLimiter.resume();

      expect(mockQueue.start).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Rate limiter resumed');
    });

    it('should clear the queue', () => {
      rateLimiter.clear();

      expect(mockQueue.clear).toHaveBeenCalledTimes(1);
      expect(mockLogger.info).toHaveBeenCalledWith('Rate limiter cleared');
    });

    it('should wait for idle queue', async () => {
      await rateLimiter.onIdle();

      expect(mockQueue.onIdle).toHaveBeenCalledTimes(1);
    });
  });

  describe('cleanup and memory management', () => {
    it('should clean up expired request counts', async () => {
      jest.useFakeTimers();

      const shortConfig = { ...config, windowMs: 1000 };
      const limiter = new RateLimiter(shortConfig, mockLogger as unknown as Logger);

      // Make some requests
      await limiter.checkRateLimit('endpoint1');
      await limiter.checkRateLimit('endpoint2');

      // Advance time to trigger cleanup (cleanup runs every minute)
      jest.advanceTimersByTime(61000);

      // Cleanup should have run
      expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Cleaned'));

      jest.useRealTimers();
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle undefined endpoint gracefully', async () => {
      const canProceed = await rateLimiter.checkRateLimit();

      expect(canProceed).toBe(true);
    });

    it('should handle very high request rates', async () => {
      const highVolumeConfig = { maxRequests: 1, windowMs: 100 };
      const limiter = new RateLimiter(highVolumeConfig, mockLogger as unknown as Logger);

      // Should handle rapid requests without crashing
      const promises = Array.from({ length: 10 }, () => limiter.checkRateLimit('high-volume'));

      const results = await Promise.all(promises);

      expect(results[0]).toBe(true); // First should succeed
      expect(results.slice(1).every(result => !result)).toBe(true); // Rest should fail
    });

    it('should handle concurrent requests to same endpoint', async () => {
      const promises = Array.from({ length: 5 }, () =>
        rateLimiter.checkRateLimit('concurrent-endpoint')
      );

      const results = await Promise.all(promises);

      // All should succeed if within limit
      results.forEach(result => expect(typeof result).toBe('boolean'));
    });

    it('should calculate wait time correctly', async () => {
      // Fill up the rate limit
      for (let i = 0; i < config.maxRequests; i++) {
        await rateLimiter.checkRateLimit('wait-time-test');
      }

      // Next request should be blocked and log wait time
      await rateLimiter.checkRateLimit('wait-time-test');

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Reset in'));
    });
  });

  describe('performance characteristics', () => {
    it('should handle burst requests efficiently', async () => {
      const startTime = Date.now();

      // Make burst of requests within limit
      const burstSize = Math.min(50, config.maxRequests);
      const promises = Array.from({ length: burstSize }, () =>
        rateLimiter.checkRateLimit('burst-test')
      );

      await Promise.all(promises);

      const duration = Date.now() - startTime;

      // Should complete reasonably quickly (under 1 second for 50 requests)
      expect(duration).toBeLessThan(1000);
    });

    it('should track multiple endpoints independently', async () => {
      const endpoint1Allowed = await rateLimiter.checkRateLimit('endpoint1');
      const endpoint2Allowed = await rateLimiter.checkRateLimit('endpoint2');

      expect(endpoint1Allowed).toBe(true);
      expect(endpoint2Allowed).toBe(true);

      // Fill limit for endpoint1
      for (let i = 1; i < config.maxRequests; i++) {
        await rateLimiter.checkRateLimit('endpoint1');
      }

      // endpoint1 should be blocked, endpoint2 should still work
      expect(await rateLimiter.checkRateLimit('endpoint1')).toBe(false);
      expect(await rateLimiter.checkRateLimit('endpoint2')).toBe(true);
    });
  });
});
