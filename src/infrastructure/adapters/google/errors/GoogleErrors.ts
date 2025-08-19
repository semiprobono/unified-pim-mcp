/**
 * Google API error codes
 */
export enum GoogleErrorCode {
  // Authentication errors
  INVALID_AUTH_TOKEN = 'invalid_grant',
  TOKEN_EXPIRED = 'invalid_token',
  INSUFFICIENT_PRIVILEGES = 'insufficient_scope',
  UNAUTHENTICATED = 'unauthenticated',

  // Request errors
  INVALID_REQUEST = 'badRequest',
  RESOURCE_NOT_FOUND = 'notFound',
  ITEM_NOT_FOUND = 'notFound',
  REQUEST_THROTTLED = 'rateLimitExceeded',
  QUOTA_EXCEEDED = 'quotaExceeded',

  // Conflict errors
  RESOURCE_MODIFIED = 'conditionNotMet',
  NAME_ALREADY_EXISTS = 'duplicate',
  CONFLICT = 'aborted',

  // Service errors
  SERVICE_UNAVAILABLE = 'backendError',
  INTERNAL_SERVER_ERROR = 'internalError',
  GATEWAY_TIMEOUT = 'deadline_exceeded',

  // Quota errors
  USER_RATE_LIMIT = 'userRateLimitExceeded',
  DAILY_LIMIT_EXCEEDED = 'dailyLimitExceeded',

  // Validation errors
  INVALID_PROPERTY = 'invalidParameter',
  PROPERTY_NOT_FOUND = 'required',
  INVALID_FILTER = 'invalidQuery',

  // Generic errors
  UNKNOWN_ERROR = 'unknownError',
  GENERAL_EXCEPTION = 'backendError',
}

/**
 * Google API error response structure
 */
export interface GoogleErrorResponse {
  error: {
    code: number;
    message: string;
    errors?: Array<{
      domain?: string;
      reason?: string;
      message?: string;
      locationType?: string;
      location?: string;
      date?: string;
      clientRequestId?: string;
    }>;
  };
}

/**
 * Custom Google API error class
 */
export class GoogleError extends Error {
  public readonly code: GoogleErrorCode | string;
  public readonly statusCode: number;
  public readonly requestId?: string;
  public readonly clientRequestId?: string;
  public readonly date?: string;
  public readonly innerError?: any;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    code: GoogleErrorCode | string,
    statusCode: number,
    innerError?: any,
    requestId?: string,
    clientRequestId?: string
  ) {
    super(message);
    this.name = 'GoogleError';
    this.code = code;
    this.statusCode = statusCode;
    this.innerError = innerError;
    this.requestId = requestId;
    this.clientRequestId = clientRequestId;
    this.date = new Date().toISOString();
    this.isRetryable = this.determineRetryability();

    // Maintain proper stack trace for where our error was thrown
    Error.captureStackTrace(this, GoogleError);
  }

  /**
   * Create GoogleError from axios error response
   */
  static fromAxiosError(error: any): GoogleError {
    if (error.response?.data?.error) {
      const googleError = error.response.data.error;
      return new GoogleError(
        googleError.message || 'Google API error',
        googleError.code || GoogleErrorCode.UNKNOWN_ERROR,
        error.response.status || 500,
        googleError.errors,
        googleError.errors?.[0]?.clientRequestId,
        googleError.errors?.[0]?.clientRequestId
      );
    }

    // Fallback for non-Google errors
    return new GoogleError(
      error.message || 'Unknown error',
      GoogleErrorCode.UNKNOWN_ERROR,
      error.response?.status || 500,
      error
    );
  }

  /**
   * Determine if the error is retryable
   */
  private determineRetryability(): boolean {
    // Retryable status codes
    const retryableStatusCodes = [429, 503, 504, 502, 500];
    if (retryableStatusCodes.includes(this.statusCode)) {
      return true;
    }

    // Retryable error codes
    const retryableErrorCodes = [
      GoogleErrorCode.REQUEST_THROTTLED,
      GoogleErrorCode.SERVICE_UNAVAILABLE,
      GoogleErrorCode.GATEWAY_TIMEOUT,
      GoogleErrorCode.INTERNAL_SERVER_ERROR,
    ];

    return retryableErrorCodes.includes(this.code as GoogleErrorCode);
  }

  /**
   * Get retry delay in milliseconds
   */
  getRetryDelay(): number {
    switch (this.code) {
      case GoogleErrorCode.REQUEST_THROTTLED:
        // Check for Retry-After header value
        return 60000; // Default 1 minute for throttling
      case GoogleErrorCode.SERVICE_UNAVAILABLE:
      case GoogleErrorCode.GATEWAY_TIMEOUT:
        return 30000; // 30 seconds for service issues
      default:
        return 5000; // 5 seconds default
    }
  }

  /**
   * Check if error is due to authentication issues
   */
  isAuthenticationError(): boolean {
    const authErrors = [
      GoogleErrorCode.INVALID_AUTH_TOKEN,
      GoogleErrorCode.TOKEN_EXPIRED,
      GoogleErrorCode.INSUFFICIENT_PRIVILEGES,
    ];

    return (
      authErrors.includes(this.code as GoogleErrorCode) ||
      this.statusCode === 401 ||
      this.statusCode === 403
    );
  }

  /**
   * Check if error is due to rate limiting
   */
  isRateLimitError(): boolean {
    return this.code === GoogleErrorCode.REQUEST_THROTTLED || this.statusCode === 429;
  }

  /**
   * Check if error is due to resource not found
   */
  isNotFoundError(): boolean {
    const notFoundErrors = [GoogleErrorCode.RESOURCE_NOT_FOUND, GoogleErrorCode.ITEM_NOT_FOUND];

    return notFoundErrors.includes(this.code as GoogleErrorCode) || this.statusCode === 404;
  }

  /**
   * Check if error is due to conflict
   */
  isConflictError(): boolean {
    const conflictErrors = [
      GoogleErrorCode.RESOURCE_MODIFIED,
      GoogleErrorCode.NAME_ALREADY_EXISTS,
      GoogleErrorCode.CONFLICT,
    ];

    return conflictErrors.includes(this.code as GoogleErrorCode) || this.statusCode === 409;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    switch (this.code) {
      case GoogleErrorCode.INVALID_AUTH_TOKEN:
      case GoogleErrorCode.TOKEN_EXPIRED:
        return 'Your session has expired. Please sign in again.';

      case GoogleErrorCode.INSUFFICIENT_PRIVILEGES:
        return 'You do not have permission to perform this action.';

      case GoogleErrorCode.REQUEST_THROTTLED:
        return 'Too many requests. Please wait a moment and try again.';

      case GoogleErrorCode.RESOURCE_NOT_FOUND:
      case GoogleErrorCode.ITEM_NOT_FOUND:
        return 'The requested item could not be found.';

      case GoogleErrorCode.SERVICE_UNAVAILABLE:
        return 'The service is temporarily unavailable. Please try again later.';

      case GoogleErrorCode.QUOTA_EXCEEDED:
      case GoogleErrorCode.DAILY_LIMIT_EXCEEDED:
        return 'Storage quota exceeded. Please free up some space.';

      case GoogleErrorCode.RESOURCE_MODIFIED:
        return 'The item has been modified by another user. Please refresh and try again.';

      case GoogleErrorCode.NAME_ALREADY_EXISTS:
        return 'An item with this name already exists.';

      default:
        return this.message || 'An unexpected error occurred.';
    }
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
      requestId: this.requestId,
      clientRequestId: this.clientRequestId,
      date: this.date,
      innerError: this.innerError,
      stack: this.stack,
    };
  }
}

/**
 * Error code mapping for common scenarios
 */
export const ERROR_CODE_MAP: Record<number, GoogleErrorCode> = {
  400: GoogleErrorCode.INVALID_REQUEST,
  401: GoogleErrorCode.INVALID_AUTH_TOKEN,
  403: GoogleErrorCode.INSUFFICIENT_PRIVILEGES,
  404: GoogleErrorCode.RESOURCE_NOT_FOUND,
  409: GoogleErrorCode.CONFLICT,
  429: GoogleErrorCode.REQUEST_THROTTLED,
  500: GoogleErrorCode.INTERNAL_SERVER_ERROR,
  502: GoogleErrorCode.SERVICE_UNAVAILABLE,
  503: GoogleErrorCode.SERVICE_UNAVAILABLE,
  504: GoogleErrorCode.GATEWAY_TIMEOUT,
};

/**
 * Helper to determine if an error should trigger a token refresh
 */
export function shouldRefreshToken(error: GoogleError): boolean {
  return (
    error.code === GoogleErrorCode.INVALID_AUTH_TOKEN ||
    error.code === GoogleErrorCode.TOKEN_EXPIRED ||
    (error.statusCode === 401 && !error.isRetryable)
  );
}

/**
 * Helper to extract error details from various error formats
 */
export function extractErrorDetails(error: any): {
  message: string;
  code: string;
  statusCode: number;
} {
  // Google API error format
  if (error.response?.data?.error) {
    const googleError = error.response.data.error;
    return {
      message: googleError.message || 'Unknown error',
      code: googleError.errors?.[0]?.reason || String(googleError.code) || GoogleErrorCode.UNKNOWN_ERROR,
      statusCode: error.response.status || 500,
    };
  }

  // Axios error format
  if (error.response) {
    return {
      message: error.response.statusText || error.message || 'Unknown error',
      code: ERROR_CODE_MAP[error.response.status] || GoogleErrorCode.UNKNOWN_ERROR,
      statusCode: error.response.status || 500,
    };
  }

  // Network or other errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return {
      message: 'Unable to connect to Google APIs',
      code: GoogleErrorCode.SERVICE_UNAVAILABLE,
      statusCode: 503,
    };
  }

  // Default
  return {
    message: error.message || 'Unknown error',
    code: GoogleErrorCode.UNKNOWN_ERROR,
    statusCode: 500,
  };
}
