import { Logger } from '../../../../shared/logging/Logger.js';
import {
  extractErrorDetails,
  GraphError,
  GraphErrorCode,
  shouldRefreshToken,
} from './GraphErrors.js';

/**
 * Error handling configuration
 */
export interface ErrorHandlerConfig {
  maxRetries: number;
  retryDelayMs: number;
  exponentialBackoff: boolean;
  logErrors: boolean;
}

/**
 * Error handler for Microsoft Graph operations
 */
export class ErrorHandler {
  private readonly logger: Logger;
  private readonly defaultConfig: ErrorHandlerConfig = {
    maxRetries: 3,
    retryDelayMs: 1000,
    exponentialBackoff: true,
    logErrors: true,
  };

  constructor(
    logger: Logger,
    private readonly config: Partial<ErrorHandlerConfig> = {}
  ) {
    this.logger = logger;
    this.config = { ...this.defaultConfig, ...config };
  }

  /**
   * Handle Graph API errors with retry logic
   */
  async handleWithRetry<T>(
    operation: () => Promise<T>,
    context: string,
    onTokenRefresh?: () => Promise<void>
  ): Promise<T> {
    let lastError: GraphError | undefined;
    const maxRetries = this.config.maxRetries || this.defaultConfig.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.processError(error, context);

        // Log the error
        if (this.config.logErrors) {
          this.logError(lastError, attempt, maxRetries, context);
        }

        // Check if we should refresh token
        if (shouldRefreshToken(lastError) && onTokenRefresh && attempt === 0) {
          this.logger.info('Attempting token refresh due to authentication error');
          try {
            await onTokenRefresh();
            continue; // Retry with refreshed token
          } catch (refreshError) {
            this.logger.error('Token refresh failed', refreshError);
          }
        }

        // Check if error is retryable
        if (!lastError.isRetryable || attempt === maxRetries) {
          throw lastError;
        }

        // Calculate retry delay
        const delay = this.calculateRetryDelay(attempt, lastError);
        this.logger.debug(
          `Retrying operation "${context}" in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
        );

        await this.delay(delay);
      }
    }

    throw lastError || new Error('Operation failed after all retries');
  }

  /**
   * Process and convert errors to GraphError
   */
  processError(error: any, context: string): GraphError {
    if (error instanceof GraphError) {
      return error;
    }

    const details = extractErrorDetails(error);

    return new GraphError(
      `${context}: ${details.message}`,
      details.code,
      details.statusCode,
      error
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number, error: GraphError): number {
    // Use error-specific delay if available
    if (error.isRateLimitError()) {
      return error.getRetryDelay();
    }

    const baseDelay = this.config.retryDelayMs || this.defaultConfig.retryDelayMs;

    if (this.config.exponentialBackoff) {
      // Exponential backoff with jitter
      const exponentialDelay = baseDelay * Math.pow(2, attempt);
      const jitter = Math.random() * exponentialDelay * 0.1; // 10% jitter
      return Math.min(exponentialDelay + jitter, 60000); // Cap at 1 minute
    }

    return baseDelay;
  }

  /**
   * Log error with context
   */
  private logError(error: GraphError, attempt: number, maxRetries: number, context: string): void {
    const logData = {
      context,
      attempt: attempt + 1,
      maxRetries: maxRetries + 1,
      error: error.toJSON(),
    };

    if (error.isAuthenticationError()) {
      this.logger.warn('Authentication error occurred', logData);
    } else if (error.isRateLimitError()) {
      this.logger.warn('Rate limit exceeded', logData);
    } else if (error.isNotFoundError()) {
      this.logger.debug('Resource not found', logData);
    } else if (error.statusCode >= 500) {
      this.logger.error('Server error occurred', logData);
    } else {
      this.logger.warn('API error occurred', logData);
    }
  }

  /**
   * Handle batch operation errors
   */
  handleBatchErrors(
    responses: any[],
    operations: any[]
  ): {
    successful: any[];
    failed: Array<{ operation: any; error: GraphError }>;
  } {
    const successful: any[] = [];
    const failed: Array<{ operation: any; error: GraphError }> = [];

    responses.forEach((response, index) => {
      if (response.status >= 200 && response.status < 300) {
        successful.push(response);
      } else {
        const error = new GraphError(
          response.body?.error?.message || 'Batch operation failed',
          response.body?.error?.code || GraphErrorCode.UNKNOWN_ERROR,
          response.status,
          response.body?.error
        );

        failed.push({
          operation: operations[index],
          error,
        });

        if (this.config.logErrors) {
          this.logger.warn(`Batch operation ${index} failed`, error.toJSON());
        }
      }
    });

    return { successful, failed };
  }

  /**
   * Create user-friendly error response
   */
  createUserErrorResponse(error: GraphError): {
    error: string;
    message: string;
    code: string;
    retryable: boolean;
    details?: any;
  } {
    return {
      error: 'GraphAPIError',
      message: error.getUserMessage(),
      code: error.code,
      retryable: error.isRetryable,
      details:
        process.env.NODE_ENV === 'development'
          ? {
              originalMessage: error.message,
              statusCode: error.statusCode,
              requestId: error.requestId,
              timestamp: error.date,
            }
          : undefined,
    };
  }

  /**
   * Aggregate multiple errors
   */
  aggregateErrors(errors: GraphError[]): GraphError {
    if (errors.length === 0) {
      return new GraphError('No errors', GraphErrorCode.UNKNOWN_ERROR, 500);
    }

    if (errors.length === 1) {
      return errors[0];
    }

    // Find the most severe error
    const severityOrder = [
      GraphErrorCode.INTERNAL_SERVER_ERROR,
      GraphErrorCode.SERVICE_UNAVAILABLE,
      GraphErrorCode.INSUFFICIENT_PRIVILEGES,
      GraphErrorCode.INVALID_AUTH_TOKEN,
      GraphErrorCode.REQUEST_THROTTLED,
      GraphErrorCode.RESOURCE_NOT_FOUND,
      GraphErrorCode.INVALID_REQUEST,
    ];

    let mostSevere = errors[0];
    for (const error of errors) {
      const currentIndex = severityOrder.indexOf(error.code as GraphErrorCode);
      const mostSevereIndex = severityOrder.indexOf(mostSevere.code as GraphErrorCode);

      if (currentIndex !== -1 && (mostSevereIndex === -1 || currentIndex < mostSevereIndex)) {
        mostSevere = error;
      }
    }

    return new GraphError(
      `Multiple errors occurred (${errors.length} total). Most severe: ${mostSevere.message}`,
      mostSevere.code,
      mostSevere.statusCode,
      { errors: errors.map(e => e.toJSON()) }
    );
  }

  /**
   * Check if operation should be retried
   */
  shouldRetry(error: GraphError, attempt: number): boolean {
    if (attempt >= (this.config.maxRetries || this.defaultConfig.maxRetries)) {
      return false;
    }

    return error.isRetryable;
  }

  /**
   * Delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    config: ErrorHandlerConfig;
  } {
    return {
      config: { ...this.defaultConfig, ...this.config },
    };
  }
}
