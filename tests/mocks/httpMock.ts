/**
 * HTTP mocks for testing HTTP clients and API calls
 */

import nock from 'nock';
import { 
  mockUserProfile, 
  mockMessagesResponse, 
  mockGraphError401, 
  mockGraphError429,
  mockGraphError500,
  mockRateLimitHeaders,
  mockRateLimitExceededHeaders,
  createMockHeaders
} from '../fixtures/graphApiResponses.js';

/**
 * Mock HTTP response structure
 */
export interface MockHttpResponse {
  status: number;
  headers?: Record<string, string>;
  body?: any;
  delay?: number;
}

/**
 * HTTP Mock Manager for Graph API
 */
export class HttpMockManager {
  private baseUrl = 'https://graph.microsoft.com';
  private scopes: nock.Scope[] = [];

  /**
   * Mock successful GET request
   */
  mockGet(endpoint: string, response: MockHttpResponse): nock.Scope {
    const scope = nock(this.baseUrl)
      .get(endpoint)
      .reply(response.status, response.body, response.headers);
    
    if (response.delay) {
      scope.delay(response.delay);
    }
    
    this.scopes.push(scope);
    return scope;
  }

  /**
   * Mock successful POST request
   */
  mockPost(endpoint: string, requestBody: any, response: MockHttpResponse): nock.Scope {
    const scope = nock(this.baseUrl)
      .post(endpoint, requestBody)
      .reply(response.status, response.body, response.headers);
    
    if (response.delay) {
      scope.delay(response.delay);
    }
    
    this.scopes.push(scope);
    return scope;
  }

  /**
   * Mock successful PUT request
   */
  mockPut(endpoint: string, requestBody: any, response: MockHttpResponse): nock.Scope {
    const scope = nock(this.baseUrl)
      .put(endpoint, requestBody)
      .reply(response.status, response.body, response.headers);
    
    if (response.delay) {
      scope.delay(response.delay);
    }
    
    this.scopes.push(scope);
    return scope;
  }

  /**
   * Mock successful PATCH request
   */
  mockPatch(endpoint: string, requestBody: any, response: MockHttpResponse): nock.Scope {
    const scope = nock(this.baseUrl)
      .patch(endpoint, requestBody)
      .reply(response.status, response.body, response.headers);
    
    if (response.delay) {
      scope.delay(response.delay);
    }
    
    this.scopes.push(scope);
    return scope;
  }

  /**
   * Mock successful DELETE request
   */
  mockDelete(endpoint: string, response: MockHttpResponse): nock.Scope {
    const scope = nock(this.baseUrl)
      .delete(endpoint)
      .reply(response.status, response.body, response.headers);
    
    if (response.delay) {
      scope.delay(response.delay);
    }
    
    this.scopes.push(scope);
    return scope;
  }

  /**
   * Mock request with authentication header validation
   */
  mockAuthenticatedRequest(method: string, endpoint: string, response: MockHttpResponse, expectedToken?: string): nock.Scope {
    let scope = nock(this.baseUrl);
    
    if (expectedToken) {
      scope = scope.matchHeader('Authorization', `Bearer ${expectedToken}`);
    } else {
      scope = scope.matchHeader('Authorization', /Bearer .+/);
    }

    const methodMap: Record<string, any> = {
      GET: (url: string) => scope.get(url),
      POST: (url: string, body?: any) => scope.post(url, body),
      PUT: (url: string, body?: any) => scope.put(url, body),
      PATCH: (url: string, body?: any) => scope.patch(url, body),
      DELETE: (url: string) => scope.delete(url),
    };

    scope = methodMap[method.toUpperCase()](endpoint);
    scope.reply(response.status, response.body, response.headers);
    
    if (response.delay) {
      scope.delay(response.delay);
    }
    
    this.scopes.push(scope);
    return scope;
  }

  /**
   * Mock network timeout
   */
  mockTimeout(endpoint: string, timeoutMs: number = 30000): nock.Scope {
    const scope = nock(this.baseUrl)
      .get(endpoint)
      .delay(timeoutMs + 1000)
      .reply(200, {});
    
    this.scopes.push(scope);
    return scope;
  }

  /**
   * Mock network error
   */
  mockNetworkError(endpoint: string, errorCode: string = 'ECONNREFUSED'): nock.Scope {
    const scope = nock(this.baseUrl)
      .get(endpoint)
      .replyWithError({ code: errorCode, message: 'Network error' });
    
    this.scopes.push(scope);
    return scope;
  }

  /**
   * Mock rate limiting scenario
   */
  mockRateLimit(endpoint: string, retryAfterSeconds: number = 300): nock.Scope {
    const scope = nock(this.baseUrl)
      .get(endpoint)
      .reply(429, mockGraphError429, {
        ...mockRateLimitExceededHeaders,
        'retry-after': retryAfterSeconds.toString(),
      });
    
    this.scopes.push(scope);
    return scope;
  }

  /**
   * Mock server error with retries
   */
  mockServerErrorWithRetries(endpoint: string, failCount: number = 2): nock.Scope[] {
    const scopes: nock.Scope[] = [];
    
    // Mock failures
    for (let i = 0; i < failCount; i++) {
      const scope = nock(this.baseUrl)
        .get(endpoint)
        .reply(500, mockGraphError500);
      scopes.push(scope);
      this.scopes.push(scope);
    }
    
    // Mock final success
    const successScope = nock(this.baseUrl)
      .get(endpoint)
      .reply(200, mockUserProfile, createMockHeaders());
    scopes.push(successScope);
    this.scopes.push(successScope);
    
    return scopes;
  }

  /**
   * Mock batch request
   */
  mockBatch(requests: any[], responses: any[]): nock.Scope {
    const scope = nock(this.baseUrl)
      .post('/$batch', { requests })
      .reply(200, { responses }, createMockHeaders());
    
    this.scopes.push(scope);
    return scope;
  }

  /**
   * Mock paginated response
   */
  mockPaginatedResponse(baseEndpoint: string, pages: any[], pageSize: number = 10): nock.Scope[] {
    const scopes: nock.Scope[] = [];
    
    pages.forEach((pageData, index) => {
      const isLastPage = index === pages.length - 1;
      const endpoint = index === 0 ? baseEndpoint : `${baseEndpoint}?$skip=${index * pageSize}`;
      const nextLink = isLastPage ? undefined : `${this.baseUrl}${baseEndpoint}?$skip=${(index + 1) * pageSize}`;
      
      const response = {
        value: pageData,
        ...(nextLink && { '@odata.nextLink': nextLink }),
      };
      
      const scope = nock(this.baseUrl)
        .get(endpoint)
        .reply(200, response, createMockHeaders());
      
      scopes.push(scope);
      this.scopes.push(scope);
    });
    
    return scopes;
  }

  /**
   * Mock file upload session
   */
  mockFileUploadSession(sessionUrl: string, fileSize: number, chunkSize: number = 5 * 1024 * 1024): nock.Scope[] {
    const scopes: nock.Scope[] = [];
    const chunks = Math.ceil(fileSize / chunkSize);
    
    for (let i = 0; i < chunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, fileSize - 1);
      const isLastChunk = i === chunks - 1;
      
      const scope = nock(sessionUrl)
        .put('/')
        .matchHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
        .reply(isLastChunk ? 201 : 202, isLastChunk ? { id: 'uploaded-file-id' } : {});
      
      scopes.push(scope);
      this.scopes.push(scope);
    }
    
    return scopes;
  }

  /**
   * Clean up all mocks
   */
  cleanup(): void {
    nock.cleanAll();
    this.scopes = [];
  }

  /**
   * Verify all mocks were called
   */
  verifyAll(): void {
    this.scopes.forEach(scope => {
      if (!scope.isDone()) {
        throw new Error(`Mock not satisfied: ${scope.pendingMocks()}`);
      }
    });
  }

  /**
   * Get pending mocks
   */
  getPendingMocks(): string[] {
    return nock.pendingMocks();
  }
}

/**
 * Global HTTP mock manager instance
 */
export const httpMockManager = new HttpMockManager();

/**
 * Common mock scenarios
 */
export const httpMockScenarios = {
  /**
   * Successful Graph API requests
   */
  success: {
    userProfile: () => httpMockManager.mockGet('/v1.0/me', {
      status: 200,
      body: mockUserProfile,
      headers: createMockHeaders(),
    }),
    
    messages: () => httpMockManager.mockGet('/v1.0/me/messages', {
      status: 200,
      body: mockMessagesResponse,
      headers: createMockHeaders(),
    }),
  },

  /**
   * Authentication scenarios
   */
  auth: {
    validToken: (endpoint: string = '/v1.0/me', token: string = 'valid-token') =>
      httpMockManager.mockAuthenticatedRequest('GET', endpoint, {
        status: 200,
        body: mockUserProfile,
        headers: createMockHeaders(),
      }, token),
    
    invalidToken: (endpoint: string = '/v1.0/me') =>
      httpMockManager.mockGet(endpoint, {
        status: 401,
        body: mockGraphError401,
        headers: createMockHeaders(),
      }),
  },

  /**
   * Error scenarios
   */
  errors: {
    rateLimited: (endpoint: string = '/v1.0/me', retryAfter: number = 300) =>
      httpMockManager.mockRateLimit(endpoint, retryAfter),
    
    serverError: (endpoint: string = '/v1.0/me') =>
      httpMockManager.mockGet(endpoint, {
        status: 500,
        body: mockGraphError500,
        headers: createMockHeaders(),
      }),
    
    networkError: (endpoint: string = '/v1.0/me') =>
      httpMockManager.mockNetworkError(endpoint),
    
    timeout: (endpoint: string = '/v1.0/me', timeoutMs: number = 30000) =>
      httpMockManager.mockTimeout(endpoint, timeoutMs),
  },

  /**
   * Performance scenarios
   */
  performance: {
    slowResponse: (endpoint: string = '/v1.0/me', delayMs: number = 5000) =>
      httpMockManager.mockGet(endpoint, {
        status: 200,
        body: mockUserProfile,
        headers: createMockHeaders(),
        delay: delayMs,
      }),
    
    variableLatency: (endpoint: string = '/v1.0/me', delays: number[] = [100, 500, 1000]) => {
      return delays.map(delay =>
        httpMockManager.mockGet(endpoint, {
          status: 200,
          body: mockUserProfile,
          headers: createMockHeaders(),
          delay,
        })
      );
    },
  },

  /**
   * Resilience scenarios
   */
  resilience: {
    eventualSuccess: (endpoint: string = '/v1.0/me', failureCount: number = 2) =>
      httpMockManager.mockServerErrorWithRetries(endpoint, failureCount),
    
    intermittentFailures: (endpoint: string = '/v1.0/me') => {
      // Mock pattern: success, failure, success, failure
      return [
        httpMockManager.mockGet(endpoint, {
          status: 200,
          body: mockUserProfile,
          headers: createMockHeaders(),
        }),
        httpMockManager.mockGet(endpoint, {
          status: 500,
          body: mockGraphError500,
          headers: createMockHeaders(),
        }),
        httpMockManager.mockGet(endpoint, {
          status: 200,
          body: mockUserProfile,
          headers: createMockHeaders(),
        }),
        httpMockManager.mockGet(endpoint, {
          status: 500,
          body: mockGraphError500,
          headers: createMockHeaders(),
        }),
      ];
    },
  },
};

/**
 * Test utilities
 */
export const httpTestUtils = {
  setupSuccessfulApi: () => {
    httpMockScenarios.success.userProfile();
    httpMockScenarios.success.messages();
  },

  setupFailingApi: () => {
    httpMockScenarios.errors.serverError('/v1.0/me');
    httpMockScenarios.errors.serverError('/v1.0/me/messages');
  },

  setupRateLimitedApi: (retryAfter: number = 60) => {
    httpMockScenarios.errors.rateLimited('/v1.0/me', retryAfter);
  },

  expectRequest: (method: string, endpoint: string, expectedBody?: any) => {
    return new Promise((resolve) => {
      const scope = nock('https://graph.microsoft.com')
        [method.toLowerCase() as keyof nock.Interceptor](endpoint, expectedBody)
        .reply(function(uri, requestBody) {
          resolve({ uri, requestBody, headers: this.req.headers });
          return [200, {}];
        });
      httpMockManager.scopes.push(scope);
    });
  },

  cleanup: () => {
    httpMockManager.cleanup();
  },

  verifyAllCalled: () => {
    httpMockManager.verifyAll();
  },
};