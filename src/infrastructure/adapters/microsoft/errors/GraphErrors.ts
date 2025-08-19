/**
 * Microsoft Graph API error codes
 */
export enum GraphErrorCode {
  // Authentication errors
  INVALID_AUTH_TOKEN = 'InvalidAuthenticationToken',
  TOKEN_EXPIRED = 'TokenExpired',
  INSUFFICIENT_PRIVILEGES = 'Authorization_RequestDenied',

  // Request errors
  INVALID_REQUEST = 'InvalidRequest',
  RESOURCE_NOT_FOUND = 'ResourceNotFound',
  ITEM_NOT_FOUND = 'ItemNotFound',
  REQUEST_THROTTLED = 'TooManyRequests',

  // Conflict errors
  RESOURCE_MODIFIED = 'ResourceModified',
  NAME_ALREADY_EXISTS = 'NameAlreadyExists',
  CONFLICT = 'Conflict',

  // Service errors
  SERVICE_UNAVAILABLE = 'ServiceUnavailable',
  INTERNAL_SERVER_ERROR = 'InternalServerError',
  GATEWAY_TIMEOUT = 'GatewayTimeout',

  // Quota errors
  QUOTA_EXCEEDED = 'QuotaExceeded',
  MAILBOX_QUOTA_EXCEEDED = 'MailboxQuotaExceeded',

  // Validation errors
  INVALID_PROPERTY = 'InvalidProperty',
  PROPERTY_NOT_FOUND = 'PropertyNotFound',
  INVALID_FILTER = 'InvalidFilter',

  // Generic errors
  UNKNOWN_ERROR = 'UnknownError',
  GENERAL_EXCEPTION = 'GeneralException',
}

/**
 * Graph API error response structure
 */
export interface GraphErrorResponse {
  error: {
    code: string;
    message: string;
    innerError?: {
      code?: string;
      message?: string;
      requestId?: string;
      date?: string;
      clientRequestId?: string;
    };
  };
}

/**
 * Custom Graph API error class
 */
export class GraphError extends Error {
  public readonly code: GraphErrorCode | string;
  public readonly statusCode: number;
  public readonly requestId?: string;
  public readonly clientRequestId?: string;
  public readonly date?: string;
  public readonly innerError?: any;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    code: GraphErrorCode | string,
    statusCode: number,
    innerError?: any,
    requestId?: string,
    clientRequestId?: string
  ) {
    super(message);
    this.name = 'GraphError';
    this.code = code;
    this.statusCode = statusCode;
    this.innerError = innerError;
    this.requestId = requestId;
    this.clientRequestId = clientRequestId;
    this.date = new Date().toISOString();
    this.isRetryable = this.determineRetryability();

    // Maintain proper stack trace for where our error was thrown
    Error.captureStackTrace(this, GraphError);
  }

  /**
   * Create GraphError from axios error response
   */
  static fromAxiosError(error: any): GraphError {
    if (error.response?.data?.error) {
      const graphError = error.response.data.error;
      return new GraphError(
        graphError.message || 'Graph API error',
        graphError.code || GraphErrorCode.UNKNOWN_ERROR,
        error.response.status || 500,
        graphError.innerError,
        graphError.innerError?.requestId,
        graphError.innerError?.clientRequestId
      );
    }

    // Fallback for non-Graph errors
    return new GraphError(
      error.message || 'Unknown error',
      GraphErrorCode.UNKNOWN_ERROR,
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
      GraphErrorCode.REQUEST_THROTTLED,
      GraphErrorCode.SERVICE_UNAVAILABLE,
      GraphErrorCode.GATEWAY_TIMEOUT,
      GraphErrorCode.INTERNAL_SERVER_ERROR,
    ];

    return retryableErrorCodes.includes(this.code as GraphErrorCode);
  }

  /**
   * Get retry delay in milliseconds
   */
  getRetryDelay(): number {
    switch (this.code) {
      case GraphErrorCode.REQUEST_THROTTLED:
        // Check for Retry-After header value
        return 60000; // Default 1 minute for throttling
      case GraphErrorCode.SERVICE_UNAVAILABLE:
      case GraphErrorCode.GATEWAY_TIMEOUT:
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
      GraphErrorCode.INVALID_AUTH_TOKEN,
      GraphErrorCode.TOKEN_EXPIRED,
      GraphErrorCode.INSUFFICIENT_PRIVILEGES,
    ];

    return (
      authErrors.includes(this.code as GraphErrorCode) ||
      this.statusCode === 401 ||
      this.statusCode === 403
    );
  }

  /**
   * Check if error is due to rate limiting
   */
  isRateLimitError(): boolean {
    return this.code === GraphErrorCode.REQUEST_THROTTLED || this.statusCode === 429;
  }

  /**
   * Check if error is due to resource not found
   */
  isNotFoundError(): boolean {
    const notFoundErrors = [GraphErrorCode.RESOURCE_NOT_FOUND, GraphErrorCode.ITEM_NOT_FOUND];

    return notFoundErrors.includes(this.code as GraphErrorCode) || this.statusCode === 404;
  }

  /**
   * Check if error is due to conflict
   */
  isConflictError(): boolean {
    const conflictErrors = [
      GraphErrorCode.RESOURCE_MODIFIED,
      GraphErrorCode.NAME_ALREADY_EXISTS,
      GraphErrorCode.CONFLICT,
    ];

    return conflictErrors.includes(this.code as GraphErrorCode) || this.statusCode === 409;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(): string {
    switch (this.code) {
      case GraphErrorCode.INVALID_AUTH_TOKEN:
      case GraphErrorCode.TOKEN_EXPIRED:
        return 'Your session has expired. Please sign in again.';

      case GraphErrorCode.INSUFFICIENT_PRIVILEGES:
        return 'You do not have permission to perform this action.';

      case GraphErrorCode.REQUEST_THROTTLED:
        return 'Too many requests. Please wait a moment and try again.';

      case GraphErrorCode.RESOURCE_NOT_FOUND:
      case GraphErrorCode.ITEM_NOT_FOUND:
        return 'The requested item could not be found.';

      case GraphErrorCode.SERVICE_UNAVAILABLE:
        return 'The service is temporarily unavailable. Please try again later.';

      case GraphErrorCode.QUOTA_EXCEEDED:
      case GraphErrorCode.MAILBOX_QUOTA_EXCEEDED:
        return 'Storage quota exceeded. Please free up some space.';

      case GraphErrorCode.RESOURCE_MODIFIED:
        return 'The item has been modified by another user. Please refresh and try again.';

      case GraphErrorCode.NAME_ALREADY_EXISTS:
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
export const ERROR_CODE_MAP: Record<number, GraphErrorCode> = {
  400: GraphErrorCode.INVALID_REQUEST,
  401: GraphErrorCode.INVALID_AUTH_TOKEN,
  403: GraphErrorCode.INSUFFICIENT_PRIVILEGES,
  404: GraphErrorCode.RESOURCE_NOT_FOUND,
  409: GraphErrorCode.CONFLICT,
  429: GraphErrorCode.REQUEST_THROTTLED,
  500: GraphErrorCode.INTERNAL_SERVER_ERROR,
  502: GraphErrorCode.SERVICE_UNAVAILABLE,
  503: GraphErrorCode.SERVICE_UNAVAILABLE,
  504: GraphErrorCode.GATEWAY_TIMEOUT,
};

/**
 * Helper to determine if an error should trigger a token refresh
 */
export function shouldRefreshToken(error: GraphError): boolean {
  return (
    error.code === GraphErrorCode.INVALID_AUTH_TOKEN ||
    error.code === GraphErrorCode.TOKEN_EXPIRED ||
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
  // Graph API error format
  if (error.response?.data?.error) {
    const graphError = error.response.data.error;
    return {
      message: graphError.message || 'Unknown error',
      code: graphError.code || GraphErrorCode.UNKNOWN_ERROR,
      statusCode: error.response.status || 500,
    };
  }

  // Axios error format
  if (error.response) {
    return {
      message: error.response.statusText || error.message || 'Unknown error',
      code: ERROR_CODE_MAP[error.response.status] || GraphErrorCode.UNKNOWN_ERROR,
      statusCode: error.response.status || 500,
    };
  }

  // Network or other errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return {
      message: 'Unable to connect to Microsoft Graph API',
      code: GraphErrorCode.SERVICE_UNAVAILABLE,
      statusCode: 503,
    };
  }

  // Default
  return {
    message: error.message || 'Unknown error',
    code: GraphErrorCode.UNKNOWN_ERROR,
    statusCode: 500,
  };
}
