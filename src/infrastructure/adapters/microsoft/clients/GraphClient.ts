import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { Logger } from '../../../../shared/logging/Logger.js';
import { MsalAuthProvider } from '../auth/MsalAuthProvider.js';
import { TokenRefreshService } from '../auth/TokenRefreshService.js';
import { RateLimiter, RateLimitConfig } from './RateLimiter.js';
import { CircuitBreaker, CircuitBreakerConfig } from './CircuitBreaker.js';
import { MsalConfig } from '../auth/MsalConfig.js';

/**
 * Graph API request options
 */
export interface GraphRequestOptions extends Omit<AxiosRequestConfig, 'url' | 'method'> {
  skipAuth?: boolean;
  skipRateLimit?: boolean;
  retries?: number;
  apiVersion?: 'v1.0' | 'beta';
}

/**
 * Batch request item
 */
export interface BatchRequestItem {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body?: any;
  headers?: Record<string, string>;
  dependsOn?: string[];
}

/**
 * Batch response item
 */
export interface BatchResponseItem {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Graph API client with rate limiting and circuit breaker
 */
export class GraphClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly logger: Logger;
  private readonly baseUrl: string;
  private readonly betaUrl: string;
  private userId: string | null = null;

  constructor(
    private readonly authProvider: MsalAuthProvider,
    private readonly tokenService: TokenRefreshService,
    private readonly rateLimiter: RateLimiter,
    private readonly circuitBreaker: CircuitBreaker,
    logger: Logger
  ) {
    this.logger = logger;
    this.baseUrl = MsalConfig.getGraphApiBaseUrl();
    this.betaUrl = MsalConfig.getGraphApiBetaUrl();

    // Create axios instance with defaults
    this.axiosInstance = axios.create({
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    // Set up interceptors
    this.setupInterceptors();
  }

  /**
   * Set up axios interceptors for request/response handling
   */
  private setupInterceptors(): void {
    // Request interceptor for authentication
    this.axiosInstance.interceptors.request.use(
      async (config) => {
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
        this.logger.debug(`Graph API Request: ${config.method?.toUpperCase()} ${config.url}`);

        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and rate limit updates
    this.axiosInstance.interceptors.response.use(
      (response) => {
        // Update rate limit status from response headers
        if (response.headers) {
          this.rateLimiter.updateRateLimitStatus(response.headers);
        }

        // Log successful response
        this.logger.debug(`Graph API Response: ${response.status} ${response.config.url}`);

        return response;
      },
      async (error) => {
        if (error.response) {
          const { status, data, headers } = error.response;

          // Update rate limit status
          if (headers) {
            this.rateLimiter.updateRateLimitStatus(headers);
          }

          // Log error
          this.logger.error(`Graph API Error: ${status} ${error.config?.url}`, data);

          // Handle specific error codes
          switch (status) {
            case 401:
              // Try to refresh token
              if (this.userId) {
                try {
                  await this.refreshToken();
                  // Retry the request with new token
                  const newToken = await this.getAccessToken();
                  error.config.headers['Authorization'] = `Bearer ${newToken}`;
                  return this.axiosInstance.request(error.config);
                } catch (refreshError) {
                  this.logger.error('Token refresh failed', refreshError);
                }
              }
              break;

            case 429:
              // Rate limit handled by rate limiter
              break;

            case 503:
            case 504:
              // Service unavailable - circuit breaker will handle
              break;
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Get access token
   */
  private async getAccessToken(): Promise<string | null> {
    if (!this.userId) {
      // Try to get from current account
      const account = this.authProvider.getCurrentAccount();
      if (account) {
        this.userId = account.homeAccountId;
      } else {
        return null;
      }
    }

    const tokens = await this.tokenService.retrieveTokens(this.userId);
    return tokens?.accessToken || null;
  }

  /**
   * Refresh access token
   */
  private async refreshToken(): Promise<void> {
    if (!this.userId) {
      throw new Error('No user ID available for token refresh');
    }

    const tokens = await this.tokenService.retrieveTokens(this.userId);
    if (tokens?.refreshToken) {
      const refreshed = await this.tokenService.refreshTokens(
        tokens.refreshToken,
        tokens.scopes
      );
      await this.tokenService.storeTokens(refreshed, this.userId);
    }
  }

  /**
   * Set the current user ID
   */
  setUserId(userId: string): void {
    this.userId = userId;
  }

  /**
   * Make a GET request to Graph API
   */
  async get<T = any>(endpoint: string, options?: GraphRequestOptions): Promise<T> {
    return this.request<T>('GET', endpoint, undefined, options);
  }

  /**
   * Make a POST request to Graph API
   */
  async post<T = any>(endpoint: string, data?: any, options?: GraphRequestOptions): Promise<T> {
    return this.request<T>('POST', endpoint, data, options);
  }

  /**
   * Make a PUT request to Graph API
   */
  async put<T = any>(endpoint: string, data?: any, options?: GraphRequestOptions): Promise<T> {
    return this.request<T>('PUT', endpoint, data, options);
  }

  /**
   * Make a PATCH request to Graph API
   */
  async patch<T = any>(endpoint: string, data?: any, options?: GraphRequestOptions): Promise<T> {
    return this.request<T>('PATCH', endpoint, data, options);
  }

  /**
   * Make a DELETE request to Graph API
   */
  async delete<T = any>(endpoint: string, options?: GraphRequestOptions): Promise<T> {
    return this.request<T>('DELETE', endpoint, undefined, options);
  }

  /**
   * Make a request to Graph API with rate limiting and circuit breaker
   */
  private async request<T>(
    method: string,
    endpoint: string,
    data?: any,
    options?: GraphRequestOptions
  ): Promise<T> {
    const baseUrl = options?.apiVersion === 'beta' ? this.betaUrl : this.baseUrl;
    const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

    const requestConfig: AxiosRequestConfig = {
      method,
      url,
      data,
      ...options,
      headers: {
        ...options?.headers,
        skipAuth: options?.skipAuth,
        skipRateLimit: options?.skipRateLimit,
      },
    };

    // Execute with rate limiting and circuit breaker
    const executeRequest = async () => {
      if (!options?.skipRateLimit) {
        return this.rateLimiter.executeWithRateLimit(
          () => this.circuitBreaker.execute(
            () => this.axiosInstance.request<T>(requestConfig)
          ),
          endpoint,
          options?.retries || 3
        );
      } else {
        return this.circuitBreaker.execute(
          () => this.axiosInstance.request<T>(requestConfig)
        );
      }
    };

    const response = await executeRequest();
    return response.data;
  }

  /**
   * Execute batch requests (up to 20 requests)
   */
  async batch(requests: BatchRequestItem[]): Promise<BatchResponseItem[]> {
    if (requests.length > 20) {
      throw new Error('Batch requests cannot exceed 20 items');
    }

    // Prepare batch request body
    const batchBody = {
      requests: requests.map(req => ({
        id: req.id,
        method: req.method,
        url: req.url.startsWith('/') ? req.url : `/${req.url}`,
        body: req.body,
        headers: req.headers,
        dependsOn: req.dependsOn,
      })),
    };

    // Execute batch request
    const response = await this.post<{ responses: BatchResponseItem[] }>(
      '/$batch',
      batchBody,
      { apiVersion: 'v1.0' }
    );

    return response.responses;
  }

  /**
   * Execute paginated requests
   */
  async *paginate<T>(
    endpoint: string,
    options?: GraphRequestOptions
  ): AsyncGenerator<T[], void, unknown> {
    let nextLink: string | null = endpoint;

    while (nextLink) {
      const response = await this.get<{
        value: T[];
        '@odata.nextLink'?: string;
      }>(nextLink, options);

      yield response.value;

      nextLink = response['@odata.nextLink'] || null;
    }
  }

  /**
   * Get all pages of a paginated endpoint
   */
  async getAllPages<T>(
    endpoint: string,
    options?: GraphRequestOptions,
    maxPages?: number
  ): Promise<T[]> {
    const results: T[] = [];
    let pageCount = 0;

    for await (const page of this.paginate<T>(endpoint, options)) {
      results.push(...page);
      pageCount++;

      if (maxPages && pageCount >= maxPages) {
        break;
      }
    }

    return results;
  }

  /**
   * Upload large file using resumable upload session
   */
  async uploadLargeFile(
    uploadUrl: string,
    file: Buffer | ArrayBuffer,
    onProgress?: (bytesUploaded: number, totalBytes: number) => void
  ): Promise<any> {
    const fileSize = file.byteLength;
    const chunkSize = 5 * 1024 * 1024; // 5MB chunks
    let uploadedBytes = 0;

    while (uploadedBytes < fileSize) {
      const chunk = file.slice(uploadedBytes, Math.min(uploadedBytes + chunkSize, fileSize));
      const contentRange = `bytes ${uploadedBytes}-${uploadedBytes + chunk.byteLength - 1}/${fileSize}`;

      const response = await this.axiosInstance.put(uploadUrl, chunk, {
        headers: {
          'Content-Range': contentRange,
          'Content-Type': 'application/octet-stream',
        },
      });

      uploadedBytes += chunk.byteLength;

      if (onProgress) {
        onProgress(uploadedBytes, fileSize);
      }

      // Check if upload is complete
      if (response.status === 201 || response.status === 200) {
        return response.data;
      }
    }
  }

  /**
   * Test connectivity to Graph API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.get('/me', { skipRateLimit: true });
      this.logger.info('Graph API connection test successful');
      return true;
    } catch (error) {
      this.logger.error('Graph API connection test failed', error);
      return false;
    }
  }

  /**
   * Get current user profile
   */
  async getCurrentUser(): Promise<any> {
    return this.get('/me');
  }

  /**
   * Get service health status
   */
  getHealthStatus(): {
    rateLimiter: any;
    circuitBreaker: any;
  } {
    return {
      rateLimiter: this.rateLimiter.getRateLimitStatus(),
      circuitBreaker: this.circuitBreaker.getStats(),
    };
  }
}