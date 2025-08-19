import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { google } from 'googleapis';
import { Logger } from '../../../../shared/logging/Logger.js';
import { GoogleAuthProvider } from '../auth/GoogleAuthProvider.js';
import { TokenRefreshService } from '../auth/TokenRefreshService.js';
import { RateLimitConfig, RateLimiter } from './RateLimiter.js';
import { CircuitBreaker, CircuitBreakerConfig } from './CircuitBreaker.js';
import { GoogleAuthConfig } from '../auth/GoogleAuthConfig.js';

/**
 * Google API request options
 */
export interface GoogleRequestOptions extends Omit<AxiosRequestConfig, 'url' | 'method'> {
  skipAuth?: boolean;
  skipRateLimit?: boolean;
  retries?: number;
  apiVersion?: string;
}

/**
 * Batch request item for Google APIs
 */
export interface BatchRequestItem {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body?: any;
  headers?: Record<string, string>;
}

/**
 * Batch response item for Google APIs
 */
export interface BatchResponseItem {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Google API client with rate limiting and circuit breaker
 */
export class GoogleClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly logger: Logger;
  private readonly apiEndpoints: ReturnType<typeof GoogleAuthConfig.getApiEndpoints>;
  private userId: string = 'me'; // Default to 'me' for current user
  
  // Google API service clients
  public readonly gmail: any;
  public readonly calendar: any;
  public readonly people: any;
  public readonly tasks: any;
  public readonly drive: any;

  constructor(
    private readonly authProvider: GoogleAuthProvider,
    private readonly tokenService: TokenRefreshService,
    private readonly rateLimiter: RateLimiter,
    private readonly circuitBreaker: CircuitBreaker,
    logger: Logger
  ) {
    this.logger = logger;
    this.apiEndpoints = GoogleAuthConfig.getApiEndpoints();

    // Create axios instance with defaults
    this.axiosInstance = axios.create({
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Initialize Google API service clients
    const auth = this.authProvider.getOAuth2Client();
    this.gmail = google.gmail({ version: 'v1', auth });
    this.calendar = google.calendar({ version: 'v3', auth });
    this.people = google.people({ version: 'v1', auth });
    this.tasks = google.tasks({ version: 'v1', auth });
    this.drive = google.drive({ version: 'v3', auth });

    // Set up interceptors
    this.setupInterceptors();
  }

  /**
   * Set up axios interceptors for request/response handling
   */
  private setupInterceptors(): void {
    // Request interceptor for authentication
    this.axiosInstance.interceptors.request.use(
      async config => {
        // Add authentication header if not skipped
        if (!config.headers['skipAuth']) {
          const token = await this.getAccessToken();
          if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
          }
        }

        // Remove custom headers
        delete config.headers['skipAuth'];
        delete config.headers['skipRateLimit'];

        // Log request
        this.logger.debug(`Google API Request: ${config.method?.toUpperCase()} ${config.url}`);

        return config;
      },
      error => {
        this.logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and rate limit updates
    this.axiosInstance.interceptors.response.use(
      response => {
        // Update rate limit status from response headers
        if (response.headers) {
          const headers: Record<string, string> = {};
          Object.keys(response.headers).forEach(key => {
            const value = response.headers[key];
            if (typeof value === 'string') {
              headers[key] = value;
            }
          });
          this.rateLimiter.updateRateLimitStatus(headers);
        }

        // Log successful response
        this.logger.debug(`Google API Response: ${response.status} ${response.config.url}`);

        return response;
      },
      async error => {
        if (error.response) {
          const { status, data, headers } = error.response;

          // Update rate limit status
          if (headers) {
            this.rateLimiter.updateRateLimitStatus(headers);
          }

          // Log error
          this.logger.error(`Google API Error: ${status} ${error.config?.url}`, data);

          // Handle specific error codes
          switch (status) {
            case 401:
              // Try to refresh token
              try {
                await this.refreshToken();
                // Retry the request with new token
                const newToken = await this.getAccessToken();
                error.config.headers['Authorization'] = `Bearer ${newToken}`;
                return this.axiosInstance.request(error.config);
              } catch (refreshError) {
                this.logger.error('Token refresh failed', refreshError);
              }
              break;

            case 429:
              // Rate limit exceeded - handled by rate limiter
              this.logger.warn('Rate limit exceeded', data);
              break;

            case 503:
            case 502:
            case 504:
              // Service unavailable - circuit breaker should handle
              this.logger.warn('Service temporarily unavailable', data);
              break;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Get access token from auth provider
   */
  private async getAccessToken(): Promise<string | null> {
    try {
      return await this.authProvider.getAccessToken();
    } catch (error) {
      this.logger.error('Failed to get access token', error);
      return null;
    }
  }

  /**
   * Refresh access token
   */
  private async refreshToken(): Promise<void> {
    const cachedToken = this.tokenService.getCachedToken(GoogleAuthConfig.getDefaultScopes());
    if (cachedToken?.refreshToken) {
      const newToken = await this.tokenService.getOrRefreshToken(
        GoogleAuthConfig.getDefaultScopes(),
        cachedToken.refreshToken
      );
      if (newToken) {
        this.tokenService.updateCachedToken(newToken);
      }
    }
  }

  /**
   * Make a GET request to Google API
   */
  async get<T = any>(
    endpoint: string,
    options: GoogleRequestOptions = {}
  ): Promise<AxiosResponse<T>> {
    // Check rate limit
    if (!options.skipRateLimit) {
      await this.rateLimiter.checkRateLimit();
    }

    // Execute with circuit breaker
    return this.circuitBreaker.execute(async () => {
      const url = this.buildUrl(endpoint);
      return this.axiosInstance.get<T>(url, {
        ...options,
        headers: {
          ...options.headers,
          skipAuth: options.skipAuth,
          skipRateLimit: options.skipRateLimit,
        },
      });
    });
  }

  /**
   * Make a POST request to Google API
   */
  async post<T = any>(
    endpoint: string,
    data?: any,
    options: GoogleRequestOptions = {}
  ): Promise<AxiosResponse<T>> {
    // Check rate limit
    if (!options.skipRateLimit) {
      await this.rateLimiter.checkRateLimit();
    }

    // Execute with circuit breaker
    return this.circuitBreaker.execute(async () => {
      const url = this.buildUrl(endpoint);
      return this.axiosInstance.post<T>(url, data, {
        ...options,
        headers: {
          ...options.headers,
          skipAuth: options.skipAuth,
          skipRateLimit: options.skipRateLimit,
        },
      });
    });
  }

  /**
   * Make a PUT request to Google API
   */
  async put<T = any>(
    endpoint: string,
    data?: any,
    options: GoogleRequestOptions = {}
  ): Promise<AxiosResponse<T>> {
    // Check rate limit
    if (!options.skipRateLimit) {
      await this.rateLimiter.checkRateLimit();
    }

    // Execute with circuit breaker
    return this.circuitBreaker.execute(async () => {
      const url = this.buildUrl(endpoint);
      return this.axiosInstance.put<T>(url, data, {
        ...options,
        headers: {
          ...options.headers,
          skipAuth: options.skipAuth,
          skipRateLimit: options.skipRateLimit,
        },
      });
    });
  }

  /**
   * Make a PATCH request to Google API
   */
  async patch<T = any>(
    endpoint: string,
    data?: any,
    options: GoogleRequestOptions = {}
  ): Promise<AxiosResponse<T>> {
    // Check rate limit
    if (!options.skipRateLimit) {
      await this.rateLimiter.checkRateLimit();
    }

    // Execute with circuit breaker
    return this.circuitBreaker.execute(async () => {
      const url = this.buildUrl(endpoint);
      return this.axiosInstance.patch<T>(url, data, {
        ...options,
        headers: {
          ...options.headers,
          skipAuth: options.skipAuth,
          skipRateLimit: options.skipRateLimit,
        },
      });
    });
  }

  /**
   * Make a DELETE request to Google API
   */
  async delete<T = any>(
    endpoint: string,
    options: GoogleRequestOptions = {}
  ): Promise<AxiosResponse<T>> {
    // Check rate limit
    if (!options.skipRateLimit) {
      await this.rateLimiter.checkRateLimit();
    }

    // Execute with circuit breaker
    return this.circuitBreaker.execute(async () => {
      const url = this.buildUrl(endpoint);
      return this.axiosInstance.delete<T>(url, {
        ...options,
        headers: {
          ...options.headers,
          skipAuth: options.skipAuth,
          skipRateLimit: options.skipRateLimit,
        },
      });
    });
  }

  /**
   * Execute batch requests (Google Batch API)
   */
  async batch(requests: BatchRequestItem[]): Promise<BatchResponseItem[]> {
    // Google uses multipart/mixed for batch requests
    const boundary = `batch_${Date.now()}`;
    const batchBody = this.buildBatchBody(requests, boundary);

    const response = await this.post(
      '/batch',
      batchBody,
      {
        headers: {
          'Content-Type': `multipart/mixed; boundary=${boundary}`,
        },
      }
    );

    return this.parseBatchResponse(response.data, boundary);
  }

  /**
   * Build batch request body
   */
  private buildBatchBody(requests: BatchRequestItem[], boundary: string): string {
    let body = '';

    for (const request of requests) {
      body += `--${boundary}\n`;
      body += 'Content-Type: application/http\n';
      body += `Content-ID: ${request.id}\n\n`;
      body += `${request.method} ${request.url} HTTP/1.1\n`;
      
      if (request.headers) {
        for (const [key, value] of Object.entries(request.headers)) {
          body += `${key}: ${value}\n`;
        }
      }

      if (request.body) {
        body += 'Content-Type: application/json\n\n';
        body += JSON.stringify(request.body);
      }

      body += '\n';
    }

    body += `--${boundary}--`;
    return body;
  }

  /**
   * Parse batch response
   */
  private parseBatchResponse(responseData: string, boundary: string): BatchResponseItem[] {
    const responses: BatchResponseItem[] = [];
    const parts = responseData.split(`--${boundary}`);

    for (const part of parts) {
      if (part.includes('Content-ID:')) {
        const idMatch = part.match(/Content-ID: (.+)/);
        const statusMatch = part.match(/HTTP\/1.1 (\d+)/);
        const bodyMatch = part.match(/\r?\n\r?\n(.+)$/s);

        if (idMatch && statusMatch) {
          responses.push({
            id: idMatch[1].trim(),
            status: parseInt(statusMatch[1]),
            body: bodyMatch ? JSON.parse(bodyMatch[1]) : undefined,
          });
        }
      }
    }

    return responses;
  }

  /**
   * Build full URL for endpoint
   */
  private buildUrl(endpoint: string): string {
    // Determine which API base URL to use
    if (endpoint.startsWith('http')) {
      return endpoint; // Already a full URL
    }

    // Route to appropriate service
    if (endpoint.includes('/gmail/')) {
      return `${this.apiEndpoints.gmail}${endpoint}`;
    } else if (endpoint.includes('/calendar/')) {
      return `${this.apiEndpoints.calendar}${endpoint}`;
    } else if (endpoint.includes('/people/')) {
      return `${this.apiEndpoints.people}${endpoint}`;
    } else if (endpoint.includes('/tasks/')) {
      return `${this.apiEndpoints.tasks}${endpoint}`;
    } else if (endpoint.includes('/drive/')) {
      return `${this.apiEndpoints.drive}${endpoint}`;
    }

    // Default to Gmail API
    return `${this.apiEndpoints.gmail}${endpoint}`;
  }

  /**
   * Set user ID for requests
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Get current user ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Get rate limiter status
   */
  getRateLimitStatus() {
    return this.rateLimiter.getRateLimitStatus();
  }

  /**
   * Get circuit breaker stats
   */
  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }
}