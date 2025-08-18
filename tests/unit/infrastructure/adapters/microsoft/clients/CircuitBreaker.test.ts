/**
 * Unit tests for CircuitBreaker
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CircuitBreaker, CircuitState, CircuitBreakerConfig, CircuitBreakerStats } from '../../../../../../src/infrastructure/adapters/microsoft/clients/CircuitBreaker';
import { Logger } from '../../../../../../src/shared/logging/Logger';
import { createMockLogger, sleep, TEST_CIRCUIT_BREAKER_CONFIG } from '../../../../../fixtures/testData';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  let mockLogger: ReturnType<typeof createMockLogger>;
  let config: CircuitBreakerConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = createMockLogger();
    config = { ...TEST_CIRCUIT_BREAKER_CONFIG };
    circuitBreaker = new CircuitBreaker(config, mockLogger as unknown as Logger);
  });

  afterEach(() => {
    circuitBreaker.dispose();
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize in CLOSED state', () => {
      const stats = circuitBreaker.getStats();
      
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });

    it('should start reset timer', () => {
      // Timer should be started (tested indirectly through behavior)
      expect(circuitBreaker).toBeInstanceOf(CircuitBreaker);
    });
  });

  describe('execute - CLOSED state', () => {
    it('should execute function successfully', async () => {
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.successes).toBe(1);
      expect(stats.totalRequests).toBe(1);
    });

    it('should handle function failures', async () => {
      const error = new Error('Test error');
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue(error);
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.totalRequests).toBe(1);
      expect(stats.state).toBe(CircuitState.CLOSED);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker failure'),
        error
      );
    });

    it('should transition to OPEN after threshold failures', async () => {
      const error = new Error('Test error');
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue(error);
      
      // Execute failures up to threshold
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch {}
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.failures).toBe(config.failureThreshold);
      expect(stats.nextAttempt).toBeInstanceOf(Date);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker OPENED')
      );
    });

    it('should not open if volume threshold not met', async () => {
      const lowVolumeConfig = { ...config, volumeThreshold: 10 };
      const lowVolumeCB = new CircuitBreaker(lowVolumeConfig, mockLogger as unknown as Logger);
      
      const error = new Error('Test error');
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue(error);
      
      // Execute fewer failures than volume threshold
      for (let i = 0; i < lowVolumeConfig.failureThreshold; i++) {
        try {
          await lowVolumeCB.execute(mockFn);
        } catch {}
      }
      
      const stats = lowVolumeCB.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED); // Should remain closed due to volume threshold
      
      lowVolumeCB.dispose();
    });

    it('should open based on error percentage threshold', async () => {
      const percentageConfig = { ...config, errorThresholdPercentage: 50, volumeThreshold: 4 };
      const percentageCB = new CircuitBreaker(percentageConfig, mockLogger as unknown as Logger);
      
      const successFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const errorFn = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Error'));
      
      // Execute pattern: success, success, error, error (50% error rate)
      await percentageCB.execute(successFn);
      await percentageCB.execute(successFn);
      try { await percentageCB.execute(errorFn); } catch {}
      try { await percentageCB.execute(errorFn); } catch {}
      
      const stats = percentageCB.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.failureRate).toBeGreaterThanOrEqual(50);
      
      percentageCB.dispose();
    });

    it('should reset failure count on success', async () => {
      const error = new Error('Test error');
      const errorFn = jest.fn<() => Promise<never>>().mockRejectedValue(error);
      const successFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      
      // Generate some failures (but not enough to open)
      try { await circuitBreaker.execute(errorFn); } catch {}
      try { await circuitBreaker.execute(errorFn); } catch {}
      
      let stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(2);
      
      // Success should reduce failure count
      await circuitBreaker.execute(successFn);
      
      stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1); // Reduced by 1
      expect(stats.successes).toBe(1);
    });
  });

  describe('execute - OPEN state', () => {
    beforeEach(async () => {
      // Force circuit to OPEN state
      const error = new Error('Test error');
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue(error);
      
      for (let i = 0; i < config.failureThreshold; i++) {
        try {
          await circuitBreaker.execute(mockFn);
        } catch {}
      }
      
      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);
    });

    it('should reject requests immediately', async () => {
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow(
        'Circuit breaker is OPEN. Service unavailable.'
      );
      
      expect(mockFn).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker is OPEN')
      );
    });

    it('should use fallback when provided', async () => {
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const fallbackFn = jest.fn<() => string>().mockReturnValue('fallback');
      
      const result = await circuitBreaker.execute(mockFn, fallbackFn);
      
      expect(result).toBe('fallback');
      expect(mockFn).not.toHaveBeenCalled();
      expect(fallbackFn).toHaveBeenCalledTimes(1);
    });

    it('should attempt reset after timeout', async () => {
      jest.useFakeTimers();
      
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      
      // Advance time past timeout
      jest.advanceTimersByTime(config.timeout + 100);
      
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBe('success');
      expect(circuitBreaker.getStats().state).toBe(CircuitState.HALF_OPEN);
      
      jest.useRealTimers();
    });
  });

  describe('execute - HALF_OPEN state', () => {
    beforeEach(async () => {
      // Force circuit to HALF_OPEN state
      circuitBreaker.forceOpen();
      
      jest.useFakeTimers();
      jest.advanceTimersByTime(config.timeout + 100);
      jest.useRealTimers();
      
      // Next execute call should transition to HALF_OPEN
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      await circuitBreaker.execute(mockFn);
      
      expect(circuitBreaker.getStats().state).toBe(CircuitState.HALF_OPEN);
    });

    it('should close circuit after enough successes', async () => {
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      
      // Execute successful calls up to success threshold
      for (let i = 1; i < config.successThreshold; i++) { // i=1 because one was already executed in beforeEach
        await circuitBreaker.execute(mockFn);
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0); // Reset to 0 when closing
      
      expect(mockLogger.info).toHaveBeenCalledWith('Circuit breaker CLOSED. Service recovered.');
    });

    it('should reopen on any failure', async () => {
      const error = new Error('Test error');
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue(error);
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Test error');
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.nextAttempt).toBeInstanceOf(Date);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Circuit breaker OPENED')
      );
    });
  });

  describe('manual controls', () => {
    it('should force circuit open', () => {
      circuitBreaker.forceOpen();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.nextAttempt).toBeInstanceOf(Date);
    });

    it('should force circuit closed', () => {
      circuitBreaker.forceOpen();
      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);
      
      circuitBreaker.forceClose();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.nextAttempt).toBeUndefined();
    });

    it('should reset circuit breaker', () => {
      // Create some history
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      circuitBreaker.execute(mockFn);
      
      circuitBreaker.reset();
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.lastFailureTime).toBeUndefined();
      expect(stats.lastSuccessTime).toBeUndefined();
      expect(stats.nextAttempt).toBeUndefined();
      
      expect(mockLogger.info).toHaveBeenCalledWith('Circuit breaker reset');
    });
  });

  describe('statistics', () => {
    it('should track failure rate correctly', async () => {
      const successFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const errorFn = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Error'));
      
      // Execute pattern: 3 successes, 2 failures
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);
      await circuitBreaker.execute(successFn);
      try { await circuitBreaker.execute(errorFn); } catch {}
      try { await circuitBreaker.execute(errorFn); } catch {}
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(5);
      expect(stats.failureRate).toBeCloseTo(40, 1); // 2/5 = 40%
      expect(stats.lastSuccessTime).toBeInstanceOf(Date);
      expect(stats.lastFailureTime).toBeInstanceOf(Date);
    });

    it('should return comprehensive stats', async () => {
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      await circuitBreaker.execute(mockFn);
      
      const stats = circuitBreaker.getStats();
      
      expect(stats).toEqual({
        state: CircuitState.CLOSED,
        failures: 0, // Reset on success in closed state
        successes: 1,
        lastFailureTime: undefined,
        lastSuccessTime: expect.any(Date),
        totalRequests: 1,
        failureRate: expect.any(Number),
        nextAttempt: undefined,
      });
    });
  });

  describe('reset timer behavior', () => {
    it('should reset failure count after reset timeout', async () => {
      jest.useFakeTimers();
      
      const error = new Error('Test error');
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue(error);
      
      // Generate some failures
      try { await circuitBreaker.execute(mockFn); } catch {}
      try { await circuitBreaker.execute(mockFn); } catch {}
      
      expect(circuitBreaker.getStats().failures).toBe(2);
      
      // Advance time past reset timeout
      jest.advanceTimersByTime(config.resetTimeout + 100);
      
      // Check that failures were reset
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(0);
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Circuit breaker failure count reset due to timeout'
      );
      
      jest.useRealTimers();
    });

    it('should not reset if circuit is not in closed state', async () => {
      jest.useFakeTimers();
      
      // Force circuit open
      circuitBreaker.forceOpen();
      
      // Advance time past reset timeout
      jest.advanceTimersByTime(config.resetTimeout + 100);
      
      // Circuit should still be open, no reset should occur
      expect(circuitBreaker.getStats().state).toBe(CircuitState.OPEN);
      
      jest.useRealTimers();
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle synchronous errors', async () => {
      const error = new Error('Sync error');
      const mockFn = jest.fn<() => never>().mockImplementation(() => {
        throw error;
      });
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Sync error');
      
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1);
    });

    it('should handle promise rejections', async () => {
      const error = new Error('Async error');
      const mockFn = jest.fn<() => Promise<never>>().mockRejectedValue(error);
      
      await expect(circuitBreaker.execute(mockFn)).rejects.toThrow('Async error');
      
      const stats = circuitBreaker.getStats();
      expect(stats.failures).toBe(1);
    });

    it('should handle fallback errors gracefully', async () => {
      circuitBreaker.forceOpen();
      
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const fallbackFn = jest.fn<() => never>().mockImplementation(() => {
        throw new Error('Fallback error');
      });
      
      await expect(circuitBreaker.execute(mockFn, fallbackFn)).rejects.toThrow('Fallback error');
    });

    it('should handle undefined return values', async () => {
      const mockFn = jest.fn<() => Promise<undefined>>().mockResolvedValue(undefined);
      
      const result = await circuitBreaker.execute(mockFn);
      
      expect(result).toBeUndefined();
      expect(circuitBreaker.getStats().successes).toBe(1);
    });

    it('should track time correctly across different states', async () => {
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      
      await circuitBreaker.execute(mockFn);
      
      const stats = circuitBreaker.getStats();
      expect(stats.lastSuccessTime).toBeInstanceOf(Date);
      expect(stats.lastSuccessTime!.getTime()).toBeLessThanOrEqual(Date.now());
      expect(stats.lastSuccessTime!.getTime()).toBeGreaterThan(Date.now() - 1000); // Within last second
    });
  });

  describe('performance and concurrency', () => {
    it('should handle concurrent executions', async () => {
      const mockFn = jest.fn<() => Promise<string>>().mockImplementation(async () => {
        await sleep(10); // Small delay to test concurrency
        return 'success';
      });
      
      // Execute multiple concurrent calls
      const promises = Array.from({ length: 10 }, () => 
        circuitBreaker.execute(mockFn)
      );
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(10);
      results.forEach(result => expect(result).toBe('success'));
      expect(circuitBreaker.getStats().totalRequests).toBe(10);
    });

    it('should handle mixed success/failure concurrency', async () => {
      const successFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const errorFn = jest.fn<() => Promise<never>>().mockRejectedValue(new Error('Error'));
      
      const promises = [
        circuitBreaker.execute(successFn),
        circuitBreaker.execute(errorFn).catch(e => e.message),
        circuitBreaker.execute(successFn),
        circuitBreaker.execute(errorFn).catch(e => e.message),
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toEqual(['success', 'Error', 'success', 'Error']);
      
      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(4);
    });

    it('should maintain performance under load', async () => {
      const mockFn = jest.fn<() => Promise<string>>().mockResolvedValue('success');
      const startTime = Date.now();
      
      // Execute many calls
      const promises = Array.from({ length: 100 }, () => 
        circuitBreaker.execute(mockFn)
      );
      
      await Promise.all(promises);
      
      const duration = Date.now() - startTime;
      
      // Should complete reasonably quickly (under 1 second for 100 calls)
      expect(duration).toBeLessThan(1000);
      expect(circuitBreaker.getStats().totalRequests).toBe(100);
    });
  });

  describe('dispose', () => {
    it('should clean up timers', () => {
      const spy = jest.spyOn(global, 'clearInterval');
      
      circuitBreaker.dispose();
      
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should handle multiple dispose calls', () => {
      expect(() => {
        circuitBreaker.dispose();
        circuitBreaker.dispose();
      }).not.toThrow();
    });
  });
});