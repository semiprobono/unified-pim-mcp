import PQueue from 'p-queue';
import { Logger } from '../../../../shared/logging/Logger';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  maxRequests: number; // Maximum requests allowed
  windowMs: number; // Time window in milliseconds
  maxConcurrent?: number; // Maximum concurrent requests
  minTime?: number; // Minimum time between requests in ms
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  remaining: number;
  reset: Date;
  limit: number;
  retryAfter?: number;
}

/**
 * Rate limiter for Graph API requests
 * Implements token bucket algorithm with sliding window
 */
export class RateLimiter {
  private readonly logger: Logger;
  private readonly queue: PQueue;
  private requestCounts: Map<string, { count: number; windowStart: number }>;
  private readonly DEFAULT_WINDOW_MS = 600000; // 10 minutes (Graph API default)
  private readonly DEFAULT_MAX_REQUESTS = 10000; // Graph API default limit
  private globalRateLimitStatus: RateLimitStatus | null = null;

  constructor(
    private readonly config: RateLimitConfig,
    logger: Logger
  ) {
    this.logger = logger;

    // Initialize p-queue for request queuing
    this.queue = new PQueue({
      concurrency: config.maxConcurrent || 10,
      interval: config.minTime || 100,
      intervalCap: 1,
    });

    // Initialize request tracking
    this.requestCounts = new Map();

    // Set up cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Check if request can proceed or should be rate limited
   */
  async checkRateLimit(endpoint: string = 'global'): Promise<boolean> {
    const now = Date.now();
    const windowMs = this.config.windowMs || this.DEFAULT_WINDOW_MS;
    const maxRequests = this.config.maxRequests || this.DEFAULT_MAX_REQUESTS;

    // Check global rate limit status from Graph API response headers
    if (this.globalRateLimitStatus) {
      if (this.globalRateLimitStatus.remaining <= 0) {
        const resetTime = this.globalRateLimitStatus.reset.getTime();
        if (now < resetTime) {
          this.logger.warn(
            `Global rate limit exceeded. Reset at: ${this.globalRateLimitStatus.reset}`
          );
          return false;
        } else {
          // Reset time has passed, clear the status
          this.globalRateLimitStatus = null;
        }
      }
    }

    // Get or create request count for endpoint
    let requestData = this.requestCounts.get(endpoint);

    if (!requestData) {
      requestData = { count: 0, windowStart: now };
      this.requestCounts.set(endpoint, requestData);
    }

    // Check if we're still in the same window
    if (now - requestData.windowStart >= windowMs) {
      // New window, reset counter
      requestData.count = 0;
      requestData.windowStart = now;
    }

    // Check if we've exceeded the limit
    if (requestData.count >= maxRequests) {
      const timeUntilReset = windowMs - (now - requestData.windowStart);
      this.logger.warn(`Rate limit reached for ${endpoint}. Reset in ${timeUntilReset}ms`);
      return false;
    }

    // Increment counter
    requestData.count++;

    return true;
  }

  /**
   * Execute a request with rate limiting
   */
  async executeWithRateLimit<T>(
    fn: () => Promise<T>,
    endpoint: string = 'global',
    retries: number = 3
  ): Promise<T> {
    return this.queue.add(async () => {
      let lastError: Error | undefined;

      for (let attempt = 0; attempt < retries; attempt++) {
        // Check rate limit
        const canProceed = await this.checkRateLimit(endpoint);

        if (!canProceed) {
          // Calculate wait time
          const waitTime = this.calculateWaitTime(endpoint);
          this.logger.info(`Rate limited. Waiting ${waitTime}ms before retry`);
          await this.delay(waitTime);
          continue;
        }

        try {
          // Execute the function
          const result = await fn();

          // Reset consecutive failures on success
          this.resetFailureCount(endpoint);

          return result;
        } catch (error: any) {
          lastError = error;

          // Check if it's a rate limit error (429)
          if (error.response?.status === 429) {
            this.handleRateLimitResponse(error.response);

            const retryAfter = this.parseRetryAfter(error.response.headers);
            this.logger.warn(`Rate limit hit (429). Retry after ${retryAfter}ms`);

            if (attempt < retries - 1) {
              await this.delay(retryAfter);
              continue;
            }
          }

          // For other errors, use exponential backoff
          if (attempt < retries - 1) {
            const backoffTime = this.calculateExponentialBackoff(attempt);
            this.logger.debug(`Request failed. Retrying in ${backoffTime}ms`);
            await this.delay(backoffTime);
            continue;
          }
        }
      }

      // All retries exhausted
      throw lastError || new Error('Rate limit exceeded and all retries exhausted');
    }) as Promise<T>;
  }

  /**
   * Update rate limit status from response headers
   */
  updateRateLimitStatus(headers: Record<string, string>): void {
    const remaining = parseInt(headers['x-ratelimit-remaining'] || '0', 10);
    const limit = parseInt(headers['x-ratelimit-limit'] || '10000', 10);
    const reset = parseInt(headers['x-ratelimit-reset'] || '0', 10);
    const retryAfter = parseInt(headers['retry-after'] || '0', 10);

    if (limit > 0) {
      this.globalRateLimitStatus = {
        remaining,
        limit,
        reset: new Date(reset * 1000),
        retryAfter: retryAfter > 0 ? retryAfter * 1000 : undefined,
      };

      this.logger.debug(`Rate limit status updated: ${remaining}/${limit} remaining`);
    }
  }

  /**
   * Handle 429 rate limit response
   */
  private handleRateLimitResponse(response: any): void {
    if (response.headers) {
      this.updateRateLimitStatus(response.headers);
    }
  }

  /**
   * Parse Retry-After header
   */
  private parseRetryAfter(headers: Record<string, string>): number {
    const retryAfter = headers['retry-after'];

    if (!retryAfter) {
      return 60000; // Default to 1 minute
    }

    // Check if it's a number (seconds) or a date
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }

    // Try to parse as date
    const retryDate = new Date(retryAfter);
    if (!isNaN(retryDate.getTime())) {
      return Math.max(0, retryDate.getTime() - Date.now());
    }

    return 60000; // Default to 1 minute
  }

  /**
   * Calculate wait time based on current rate limit status
   */
  private calculateWaitTime(endpoint: string): number {
    const requestData = this.requestCounts.get(endpoint);

    if (!requestData) {
      return 1000; // Default 1 second
    }

    const windowMs = this.config.windowMs || this.DEFAULT_WINDOW_MS;
    const now = Date.now();
    const timeUntilReset = windowMs - (now - requestData.windowStart);

    // Add some jitter to prevent thundering herd
    const jitter = Math.random() * 1000;

    return Math.max(1000, timeUntilReset + jitter);
  }

  /**
   * Calculate exponential backoff time
   */
  private calculateExponentialBackoff(attempt: number): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 60000; // 1 minute

    // Calculate delay with exponential backoff and jitter
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    const jitter = Math.random() * delay * 0.1; // 10% jitter

    return delay + jitter;
  }

  /**
   * Reset failure count for endpoint
   */
  private resetFailureCount(endpoint: string): void {
    // This could be expanded to track consecutive failures per endpoint
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Start cleanup interval to remove old request counts
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      const windowMs = this.config.windowMs || this.DEFAULT_WINDOW_MS;

      // Remove entries older than the window
      for (const [endpoint, data] of this.requestCounts.entries()) {
        if (now - data.windowStart > windowMs * 2) {
          this.requestCounts.delete(endpoint);
        }
      }
    }, 60000); // Cleanup every minute
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus | null {
    return this.globalRateLimitStatus;
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): {
    size: number;
    pending: number;
    isPaused: boolean;
  } {
    return {
      size: this.queue.size,
      pending: this.queue.pending,
      isPaused: this.queue.isPaused,
    };
  }

  /**
   * Pause request processing
   */
  pause(): void {
    this.queue.pause();
    this.logger.info('Rate limiter paused');
  }

  /**
   * Resume request processing
   */
  resume(): void {
    this.queue.start();
    this.logger.info('Rate limiter resumed');
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue.clear();
    this.requestCounts.clear();
    this.globalRateLimitStatus = null;
    this.logger.info('Rate limiter cleared');
  }

  /**
   * Wait for all queued requests to complete
   */
  async onIdle(): Promise<void> {
    await this.queue.onIdle();
  }
}
