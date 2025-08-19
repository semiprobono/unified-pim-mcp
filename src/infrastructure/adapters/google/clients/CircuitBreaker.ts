import { Logger } from '../../../../shared/logging/Logger.js';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED', // Normal operation
  OPEN = 'OPEN', // Failing, reject requests
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes to close from half-open
  timeout: number; // Time to wait before half-open (ms)
  resetTimeout: number; // Time to reset failure count (ms)
  volumeThreshold?: number; // Minimum requests before opening
  errorThresholdPercentage?: number; // Error percentage threshold
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  totalRequests: number;
  failureRate: number;
  nextAttempt?: Date;
}

/**
 * Circuit breaker for Graph API resilience
 * Prevents cascading failures and gives the service time to recover
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextAttemptTime?: Date;
  private resetTimer?: NodeJS.Timeout;
  private readonly logger: Logger;
  private readonly requestWindow: number[] = []; // Sliding window for error rate

  constructor(
    private readonly config: CircuitBreakerConfig,
    logger: Logger
  ) {
    this.logger = logger;
    this.startResetTimer();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>, fallback?: () => T): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        const waitTime = this.nextAttemptTime
          ? Math.max(0, this.nextAttemptTime.getTime() - Date.now())
          : this.config.timeout;

        this.logger.warn(`Circuit breaker is OPEN. Next attempt in ${waitTime}ms`);

        if (fallback) {
          return fallback();
        }

        throw new Error(`Circuit breaker is OPEN. Service unavailable. Retry in ${waitTime}ms`);
      }
    }

    try {
      // Execute the function
      const result = await fn();

      // Record success
      this.onSuccess();

      return result;
    } catch (error) {
      // Record failure
      this.onFailure(error);

      // If we have a fallback, use it
      if (fallback && this.state === CircuitState.OPEN) {
        return fallback();
      }

      throw error;
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.totalRequests++;
    this.successes++;
    this.lastSuccessTime = new Date();
    this.updateRequestWindow(true);

    switch (this.state) {
      case CircuitState.HALF_OPEN:
        if (this.successes >= this.config.successThreshold) {
          this.transitionToClosed();
        }
        break;

      case CircuitState.CLOSED:
        // Reset failure count on success in closed state
        if (this.failures > 0) {
          this.failures = Math.max(0, this.failures - 1);
        }
        break;
    }

    this.logger.debug(
      `Circuit breaker success. State: ${this.state}, Successes: ${this.successes}`
    );
  }

  /**
   * Handle failed request
   */
  private onFailure(error: any): void {
    this.totalRequests++;
    this.failures++;
    this.lastFailureTime = new Date();
    this.updateRequestWindow(false);

    // Log the failure
    this.logger.warn(
      `Circuit breaker failure. State: ${this.state}, Failures: ${this.failures}`,
      error
    );

    switch (this.state) {
      case CircuitState.CLOSED:
        if (this.shouldOpen()) {
          this.transitionToOpen();
        }
        break;

      case CircuitState.HALF_OPEN:
        // Any failure in half-open state reopens the circuit
        this.transitionToOpen();
        break;
    }
  }

  /**
   * Check if circuit should open
   */
  private shouldOpen(): boolean {
    // Check volume threshold
    if (this.config.volumeThreshold && this.totalRequests < this.config.volumeThreshold) {
      return false;
    }

    // Check failure threshold
    if (this.failures >= this.config.failureThreshold) {
      return true;
    }

    // Check error percentage threshold
    if (this.config.errorThresholdPercentage) {
      const errorRate = this.calculateErrorRate();
      if (errorRate >= this.config.errorThresholdPercentage) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if should attempt reset from open state
   */
  private shouldAttemptReset(): boolean {
    if (!this.nextAttemptTime) {
      return true;
    }

    return Date.now() >= this.nextAttemptTime.getTime();
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = new Date(Date.now() + this.config.timeout);

    this.logger.error(
      `Circuit breaker OPENED. Will attempt reset at ${this.nextAttemptTime.toISOString()}`
    );

    // Reset counters
    this.successes = 0;
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.successes = 0;
    this.failures = 0;

    this.logger.info('Circuit breaker transitioned to HALF_OPEN. Testing service recovery...');
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.nextAttemptTime = undefined;

    this.logger.info('Circuit breaker CLOSED. Service recovered.');
  }

  /**
   * Update sliding window for error rate calculation
   */
  private updateRequestWindow(success: boolean): void {
    const now = Date.now();

    // Add current request
    this.requestWindow.push(success ? 0 : 1);

    // Remove old requests outside the window
    const windowSize = this.config.resetTimeout;
    while (this.requestWindow.length > 0) {
      const oldestTime = now - this.requestWindow.length * 100; // Approximate timing
      if (oldestTime > windowSize) {
        this.requestWindow.shift();
      } else {
        break;
      }
    }
  }

  /**
   * Calculate current error rate
   */
  private calculateErrorRate(): number {
    if (this.requestWindow.length === 0) {
      return 0;
    }

    const errors = this.requestWindow.reduce((sum, val) => sum + val, 0);
    return (errors / this.requestWindow.length) * 100;
  }

  /**
   * Start reset timer
   */
  private startResetTimer(): void {
    this.resetTimer = setInterval(() => {
      if (this.state === CircuitState.CLOSED && this.failures > 0) {
        const timeSinceLastFailure = this.lastFailureTime
          ? Date.now() - this.lastFailureTime.getTime()
          : Infinity;

        if (timeSinceLastFailure >= this.config.resetTimeout) {
          this.failures = 0;
          this.logger.debug('Circuit breaker failure count reset due to timeout');
        }
      }
    }, this.config.resetTimeout);
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      failureRate: this.calculateErrorRate(),
      nextAttempt: this.nextAttemptTime,
    };
  }

  /**
   * Force circuit to open (for testing or manual intervention)
   */
  forceOpen(): void {
    this.transitionToOpen();
  }

  /**
   * Force circuit to close (for testing or manual intervention)
   */
  forceClose(): void {
    this.transitionToClosed();
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextAttemptTime = undefined;
    this.requestWindow.length = 0;

    this.logger.info('Circuit breaker reset');
  }

  /**
   * Cleanup
   */
  dispose(): void {
    if (this.resetTimer) {
      clearInterval(this.resetTimer);
      this.resetTimer = undefined;
    }
  }
}
