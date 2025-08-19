import { Logger } from '../logging/Logger.js';
import {
  SecurityAuditLogger,
  SecurityEventSeverity,
  SecurityEventType,
} from './SecurityAuditLogger.js';
import crypto from 'crypto';

/**
 * Error classification levels
 */
export enum ErrorClassification {
  PUBLIC = 'PUBLIC', // Safe to expose to users
  INTERNAL = 'INTERNAL', // Internal error, show generic message
  SENSITIVE = 'SENSITIVE', // Contains sensitive data, must be sanitized
  SECURITY = 'SECURITY', // Security-related error, requires audit
}

/**
 * Sanitized error response
 */
export interface SanitizedError {
  error_id: string;
  error_code: string;
  message: string;
  timestamp: string;
  request_id?: string;
  details?: Record<string, any>;
}

/**
 * Error handling configuration
 */
export interface SecureErrorConfig {
  expose_stack_traces: boolean;
  expose_internal_errors: boolean;
  log_sensitive_data: boolean;
  audit_all_errors: boolean;
  sanitize_error_messages: boolean;
  include_error_ids: boolean;
  rate_limit_error_logs: boolean;
}

/**
 * Pattern-based sensitive data detector
 */
interface SensitivePattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

/**
 * Secure error handler that prevents information disclosure
 * Implements OWASP error handling guidelines
 */
export class SecureErrorHandler {
  private readonly logger: Logger;
  private readonly auditLogger?: SecurityAuditLogger;
  private readonly config: SecureErrorConfig;
  private readonly errorCounts: Map<string, number> = new Map();
  private readonly sanitizationPatterns: SensitivePattern[];

  // Generic error messages for different classifications
  private readonly genericMessages = {
    [ErrorClassification.INTERNAL]: 'An internal error occurred. Please try again later.',
    [ErrorClassification.SENSITIVE]:
      'A processing error occurred. Please contact support if the issue persists.',
    [ErrorClassification.SECURITY]: 'Access denied. This incident has been logged.',
  };

  constructor(
    logger: Logger,
    auditLogger?: SecurityAuditLogger,
    config: Partial<SecureErrorConfig> = {}
  ) {
    this.logger = logger;
    this.auditLogger = auditLogger;
    this.config = {
      expose_stack_traces: process.env.NODE_ENV === 'development',
      expose_internal_errors: process.env.NODE_ENV === 'development',
      log_sensitive_data: false,
      audit_all_errors: true,
      sanitize_error_messages: true,
      include_error_ids: true,
      rate_limit_error_logs: true,
      ...config,
    };

    this.sanitizationPatterns = this.initializeSanitizationPatterns();
    this.startCleanupInterval();
  }

  /**
   * Initialize sensitive data sanitization patterns
   */
  private initializeSanitizationPatterns(): SensitivePattern[] {
    return [
      // Email addresses
      {
        name: 'email',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        replacement: '[EMAIL_REDACTED]',
      },
      // Phone numbers
      {
        name: 'phone',
        pattern: /(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
        replacement: '[PHONE_REDACTED]',
      },
      // Credit card numbers
      {
        name: 'credit_card',
        pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        replacement: '[CARD_REDACTED]',
      },
      // Social Security Numbers
      {
        name: 'ssn',
        pattern: /\b\d{3}-?\d{2}-?\d{4}\b/g,
        replacement: '[SSN_REDACTED]',
      },
      // Access tokens
      {
        name: 'access_token',
        pattern: /\b(access_token|bearer)\s*[=:]\s*([a-zA-Z0-9._-]{20,})/gi,
        replacement: '$1=[TOKEN_REDACTED]',
      },
      // API keys
      {
        name: 'api_key',
        pattern: /\b(api[_-]?key|apikey)\s*[=:]\s*([a-zA-Z0-9]{20,})/gi,
        replacement: '$1=[API_KEY_REDACTED]',
      },
      // Passwords
      {
        name: 'password',
        pattern: /\b(password|passwd|pwd)\s*[=:]\s*(\S+)/gi,
        replacement: '$1=[PASSWORD_REDACTED]',
      },
      // Database connection strings
      {
        name: 'db_connection',
        pattern: /(mongodb|postgres|mysql):\/\/[^:\s]+:[^@\s]+@[^\s]+/gi,
        replacement: '[DB_CONNECTION_REDACTED]',
      },
      // IP addresses (private ranges)
      {
        name: 'private_ip',
        pattern: /\b(?:10\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)\d{1,3}\.\d{1,3}\b/g,
        replacement: '[PRIVATE_IP_REDACTED]',
      },
      // File paths (Windows and Unix)
      {
        name: 'file_path',
        pattern: /(?:[A-Za-z]:\\|\/)[^\s<>"'|?*]+/g,
        replacement: '[FILE_PATH_REDACTED]',
      },
      // UUIDs
      {
        name: 'uuid',
        pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        replacement: '[UUID_REDACTED]',
      },
    ];
  }

  /**
   * Handle error with secure processing
   */
  async handleError(
    error: Error | unknown,
    context: {
      request_id?: string;
      user_id?: string;
      ip_address?: string;
      classification?: ErrorClassification;
      operation?: string;
      additional_context?: Record<string, any>;
    } = {}
  ): Promise<SanitizedError> {
    const errorId = this.generateErrorId();
    const timestamp = new Date().toISOString();

    // Extract error details
    const errorDetails = this.extractErrorDetails(error);
    const classification = context.classification || this.classifyError(errorDetails);

    // Rate limiting for error logging
    if (this.config.rate_limit_error_logs && this.isRateLimited(errorDetails.message)) {
      return this.createGenericError(errorId, timestamp, classification);
    }

    // Sanitize error message
    const sanitizedMessage = this.config.sanitize_error_messages
      ? this.sanitizeMessage(errorDetails.message)
      : errorDetails.message;

    // Log error securely
    await this.logError(errorDetails, context, errorId, classification);

    // Audit security-related errors
    if (classification === ErrorClassification.SECURITY && this.auditLogger) {
      await this.auditLogger.logSecurityEvent({
        eventType: SecurityEventType.SECURITY_VIOLATION,
        severity: SecurityEventSeverity.HIGH,
        userId: context.user_id,
        ipAddress: context.ip_address,
        outcome: 'FAILURE',
        message: `Security error: ${sanitizedMessage}`,
        details: {
          error_id: errorId,
          operation: context.operation,
          ...context.additional_context,
        },
      });
    }

    // Create sanitized response
    return this.createSanitizedResponse(
      errorDetails,
      classification,
      errorId,
      timestamp,
      context.request_id
    );
  }

  /**
   * Extract error details safely
   */
  private extractErrorDetails(error: Error | unknown): {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    status?: number;
  } {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
        status: (error as any).status || (error as any).statusCode,
      };
    }

    if (typeof error === 'string') {
      return {
        name: 'StringError',
        message: error,
      };
    }

    if (typeof error === 'object' && error !== null) {
      return {
        name: 'ObjectError',
        message: JSON.stringify(error),
      };
    }

    return {
      name: 'UnknownError',
      message: 'An unknown error occurred',
    };
  }

  /**
   * Classify error based on content and type
   */
  private classifyError(errorDetails: {
    name: string;
    message: string;
    code?: string;
  }): ErrorClassification {
    const message = errorDetails.message.toLowerCase();
    const errorName = errorDetails.name.toLowerCase();

    // Security-related errors
    const securityIndicators = [
      'unauthorized',
      'forbidden',
      'access denied',
      'permission',
      'authentication',
      'authorization',
      'csrf',
      'xss',
      'sql injection',
      'invalid token',
      'token expired',
      'signature',
      'certificate',
    ];

    if (
      securityIndicators.some(
        indicator => message.includes(indicator) || errorName.includes(indicator)
      )
    ) {
      return ErrorClassification.SECURITY;
    }

    // Sensitive data indicators
    const sensitiveIndicators = [
      'email',
      'password',
      'credit card',
      'ssn',
      'social security',
      'api key',
      'secret',
      'private key',
      'connection string',
    ];

    if (sensitiveIndicators.some(indicator => message.includes(indicator))) {
      return ErrorClassification.SENSITIVE;
    }

    // Internal system errors
    const internalIndicators = [
      'database',
      'connection',
      'timeout',
      'network',
      'file system',
      'memory',
      'null pointer',
      'reference',
      'module not found',
    ];

    if (internalIndicators.some(indicator => message.includes(indicator))) {
      return ErrorClassification.INTERNAL;
    }

    // Default to internal for unknown errors
    return ErrorClassification.INTERNAL;
  }

  /**
   * Sanitize error message to remove sensitive information
   */
  private sanitizeMessage(message: string): string {
    let sanitized = message;

    for (const pattern of this.sanitizationPatterns) {
      sanitized = sanitized.replace(pattern.pattern, pattern.replacement);
    }

    // Additional generic sanitization
    sanitized = sanitized
      .replace(/\b\d{13,19}\b/g, '[NUMERIC_ID_REDACTED]') // Long numeric IDs
      .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '[BASE64_DATA_REDACTED]') // Base64 data
      .replace(/\b0x[0-9a-fA-F]+\b/g, '[HEX_VALUE_REDACTED]'); // Hex values

    return sanitized;
  }

  /**
   * Check if error logging should be rate limited
   */
  private isRateLimited(errorMessage: string): boolean {
    if (!this.config.rate_limit_error_logs) {
      return false;
    }

    const errorKey = crypto
      .createHash('sha256')
      .update(errorMessage)
      .digest('hex')
      .substring(0, 16);
    const count = this.errorCounts.get(errorKey) || 0;

    if (count >= 10) {
      // Limit to 10 identical errors per hour
      return true;
    }

    this.errorCounts.set(errorKey, count + 1);
    return false;
  }

  /**
   * Log error securely
   */
  private async logError(
    errorDetails: any,
    context: any,
    errorId: string,
    classification: ErrorClassification
  ): Promise<void> {
    const logContext = {
      error_id: errorId,
      classification,
      request_id: context.request_id,
      user_id: context.user_id,
      operation: context.operation,
      error_name: errorDetails.name,
      error_code: errorDetails.code,
    };

    // Determine what to log based on configuration
    const messageToLog = this.config.log_sensitive_data
      ? errorDetails.message
      : this.sanitizeMessage(errorDetails.message);

    const stackToLog = this.config.expose_stack_traces ? errorDetails.stack : undefined;

    switch (classification) {
      case ErrorClassification.SECURITY:
        this.logger.error(`Security Error [${errorId}]: ${messageToLog}`, {
          ...logContext,
          stack: stackToLog,
        });
        break;

      case ErrorClassification.SENSITIVE:
        this.logger.error(`Sensitive Error [${errorId}]: Data processing error`, {
          ...logContext,
          // Don't log the actual message for sensitive errors
        });
        break;

      case ErrorClassification.INTERNAL:
        this.logger.error(`Internal Error [${errorId}]: ${messageToLog}`, {
          ...logContext,
          stack: stackToLog,
        });
        break;

      case ErrorClassification.PUBLIC:
        this.logger.warn(`Public Error [${errorId}]: ${messageToLog}`, logContext);
        break;
    }
  }

  /**
   * Create sanitized error response
   */
  private createSanitizedResponse(
    errorDetails: any,
    classification: ErrorClassification,
    errorId: string,
    timestamp: string,
    requestId?: string
  ): SanitizedError {
    let message: string;
    let errorCode: string;
    let details: Record<string, any> | undefined;

    switch (classification) {
      case ErrorClassification.PUBLIC:
        message = this.sanitizeMessage(errorDetails.message);
        errorCode = errorDetails.code || 'PUBLIC_ERROR';
        if (this.config.expose_internal_errors) {
          details = {
            error_name: errorDetails.name,
          };
        }
        break;

      case ErrorClassification.INTERNAL:
        message = this.config.expose_internal_errors
          ? this.sanitizeMessage(errorDetails.message)
          : this.genericMessages[classification];
        errorCode = 'INTERNAL_ERROR';
        break;

      case ErrorClassification.SENSITIVE:
        message = this.genericMessages[classification];
        errorCode = 'PROCESSING_ERROR';
        break;

      case ErrorClassification.SECURITY:
        message = this.genericMessages[classification];
        errorCode = 'ACCESS_DENIED';
        break;

      default:
        message = 'An error occurred';
        errorCode = 'UNKNOWN_ERROR';
    }

    const response: SanitizedError = {
      error_id: this.config.include_error_ids ? errorId : 'ERROR_' + Date.now(),
      error_code: errorCode,
      message,
      timestamp,
    };

    if (requestId) {
      response.request_id = requestId;
    }

    if (details) {
      response.details = details;
    }

    return response;
  }

  /**
   * Create generic error response
   */
  private createGenericError(
    errorId: string,
    timestamp: string,
    classification: ErrorClassification
  ): SanitizedError {
    return {
      error_id: errorId,
      error_code: 'RATE_LIMITED',
      message: 'Multiple similar errors detected. Please try again later.',
      timestamp,
    };
  }

  /**
   * Generate unique error ID
   */
  private generateErrorId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `ERR_${timestamp}_${random}`.toUpperCase();
  }

  /**
   * Start cleanup interval for rate limiting
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      this.errorCounts.clear();
    }, 3600000); // Clear every hour
  }

  /**
   * Create Express error middleware
   */
  createExpressErrorMiddleware() {
    return async (error: Error, req: any, res: any, next: any) => {
      const sanitizedError = await this.handleError(error, {
        request_id: req.id || req.headers['x-request-id'],
        user_id: req.user?.id,
        ip_address: req.ip || req.connection.remoteAddress,
        operation: `${req.method} ${req.path}`,
        additional_context: {
          user_agent: req.headers['user-agent'],
          referer: req.headers.referer,
        },
      });

      // Set appropriate HTTP status code
      const statusCode = this.getHttpStatusCode(error);
      res.status(statusCode).json(sanitizedError);
    };
  }

  /**
   * Get appropriate HTTP status code for error
   */
  private getHttpStatusCode(error: any): number {
    if (error.status || error.statusCode) {
      return error.status || error.statusCode;
    }

    if (error.name === 'ValidationError') return 400;
    if (error.name === 'UnauthorizedError') return 401;
    if (error.name === 'ForbiddenError') return 403;
    if (error.name === 'NotFoundError') return 404;
    if (error.name === 'RateLimitError') return 429;

    return 500; // Internal server error
  }

  /**
   * Get error handling statistics
   */
  getErrorStats(): {
    total_errors: number;
    errors_by_classification: Record<string, number>;
    rate_limited_errors: number;
    unique_error_patterns: number;
  } {
    const stats = {
      total_errors: 0,
      errors_by_classification: {} as Record<string, number>,
      rate_limited_errors: 0,
      unique_error_patterns: this.errorCounts.size,
    };

    for (const count of this.errorCounts.values()) {
      stats.total_errors += count;
      if (count >= 10) {
        stats.rate_limited_errors++;
      }
    }

    return stats;
  }

  /**
   * Dispose error handler
   */
  dispose(): void {
    this.errorCounts.clear();
  }
}
