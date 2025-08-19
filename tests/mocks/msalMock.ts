/**
 * Mock implementations for MSAL components
 */

import {
  AccountInfo,
  AuthenticationResult,
  ConfidentialClientApplication,
  InteractionRequiredAuthError,
  PublicClientApplication,
} from '@azure/msal-node';
import {
  mockAccountInfo,
  mockAuthenticationResult,
  mockInteractionRequiredError,
  mockInvalidGrantError,
  mockNetworkError,
  mockRefreshTokenResult,
  mockSilentTokenResult,
} from '../fixtures/msalResponses.js';

/**
 * Mock MSAL Client Application
 */
export class MockMsalClientApplication {
  private mockAccounts: AccountInfo[] = [];
  private shouldFailSilent = false;
  private shouldFailRefresh = false;
  private shouldFailAuthCode = false;
  private networkError = false;

  async getAuthCodeUrl(request: any): Promise<string> {
    if (this.networkError) {
      throw mockNetworkError;
    }
    return 'https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize?test=true';
  }

  async acquireTokenByCode(request: any): Promise<AuthenticationResult> {
    if (this.networkError) {
      throw mockNetworkError;
    }
    if (this.shouldFailAuthCode) {
      throw mockInvalidGrantError;
    }

    // Add account to cache
    if (mockAuthenticationResult.account) {
      this.mockAccounts.push(mockAuthenticationResult.account);
    }

    return mockAuthenticationResult;
  }

  async acquireTokenSilent(request: any): Promise<AuthenticationResult> {
    if (this.networkError) {
      throw mockNetworkError;
    }
    if (this.shouldFailSilent) {
      throw new InteractionRequiredAuthError(
        'interaction_required',
        mockInteractionRequiredError.errorMessage
      );
    }
    return mockSilentTokenResult;
  }

  async acquireTokenByRefreshToken(request: any): Promise<AuthenticationResult> {
    if (this.networkError) {
      throw mockNetworkError;
    }
    if (this.shouldFailRefresh) {
      throw mockInvalidGrantError;
    }
    return mockRefreshTokenResult;
  }

  getTokenCache() {
    return {
      getAllAccounts: jest.fn().mockResolvedValue(this.mockAccounts),
      removeAccount: jest.fn().mockResolvedValue(undefined),
    };
  }

  // Test utilities
  setShouldFailSilent(fail: boolean): void {
    this.shouldFailSilent = fail;
  }

  setShouldFailRefresh(fail: boolean): void {
    this.shouldFailRefresh = fail;
  }

  setShouldFailAuthCode(fail: boolean): void {
    this.shouldFailAuthCode = fail;
  }

  setNetworkError(error: boolean): void {
    this.networkError = error;
  }

  setMockAccounts(accounts: AccountInfo[]): void {
    this.mockAccounts = accounts;
  }

  addMockAccount(account: AccountInfo): void {
    this.mockAccounts.push(account);
  }

  clearMockAccounts(): void {
    this.mockAccounts = [];
  }
}

/**
 * Mock ConfidentialClientApplication
 */
export const mockConfidentialClientApplication =
  new MockMsalClientApplication() as unknown as ConfidentialClientApplication;

/**
 * Mock PublicClientApplication
 */
export const mockPublicClientApplication =
  new MockMsalClientApplication() as unknown as PublicClientApplication;

/**
 * Factory function to create fresh mock client
 */
export const createMockMsalClient = (type: 'confidential' | 'public' = 'confidential') => {
  const mockClient = new MockMsalClientApplication();
  return mockClient as unknown as ConfidentialClientApplication | PublicClientApplication;
};

/**
 * Jest mock for MSAL module
 */
export const msalNodeMock = {
  ConfidentialClientApplication: jest
    .fn()
    .mockImplementation(() => mockConfidentialClientApplication),
  PublicClientApplication: jest.fn().mockImplementation(() => mockPublicClientApplication),
  InteractionRequiredAuthError: jest.fn().mockImplementation((message: string) => ({
    name: 'InteractionRequiredAuthError',
    message,
    errorCode: 'interaction_required',
  })),
};

/**
 * Mock PKCE utilities
 */
export const mockPKCEUtils = {
  generateCodeVerifier: jest.fn().mockReturnValue('mock-code-verifier'),
  generateCodeChallenge: jest.fn().mockReturnValue('mock-code-challenge'),
};

/**
 * Mock crypto functions used in MSAL
 */
export const mockCrypto = {
  randomBytes: jest.fn().mockImplementation((size: number) => ({
    toString: jest.fn().mockImplementation((encoding: string) => {
      if (encoding === 'base64url') {
        return 'mock-base64url-string';
      }
      return 'mock-string';
    }),
  })),
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mock-hash-digest'),
  }),
};

/**
 * Helper to reset all mocks
 */
export const resetMsalMocks = () => {
  jest.clearAllMocks();
  (mockConfidentialClientApplication as unknown as MockMsalClientApplication).clearMockAccounts();
  (mockPublicClientApplication as unknown as MockMsalClientApplication).clearMockAccounts();
  (mockConfidentialClientApplication as unknown as MockMsalClientApplication).setShouldFailSilent(
    false
  );
  (mockConfidentialClientApplication as unknown as MockMsalClientApplication).setShouldFailRefresh(
    false
  );
  (mockConfidentialClientApplication as unknown as MockMsalClientApplication).setShouldFailAuthCode(
    false
  );
  (mockConfidentialClientApplication as unknown as MockMsalClientApplication).setNetworkError(
    false
  );
};

/**
 * Test scenarios helpers
 */
export const msalTestScenarios = {
  success: () => {
    resetMsalMocks();
    (mockConfidentialClientApplication as unknown as MockMsalClientApplication).addMockAccount(
      mockAccountInfo
    );
  },

  networkFailure: () => {
    resetMsalMocks();
    (mockConfidentialClientApplication as unknown as MockMsalClientApplication).setNetworkError(
      true
    );
  },

  interactionRequired: () => {
    resetMsalMocks();
    (mockConfidentialClientApplication as unknown as MockMsalClientApplication).setShouldFailSilent(
      true
    );
  },

  refreshTokenExpired: () => {
    resetMsalMocks();
    (
      mockConfidentialClientApplication as unknown as MockMsalClientApplication
    ).setShouldFailRefresh(true);
  },

  invalidAuthCode: () => {
    resetMsalMocks();
    (
      mockConfidentialClientApplication as unknown as MockMsalClientApplication
    ).setShouldFailAuthCode(true);
  },
};

/**
 * Mock token cache
 */
export const mockTokenCache = {
  getAllAccounts: jest.fn().mockResolvedValue([mockAccountInfo]),
  removeAccount: jest.fn().mockResolvedValue(undefined),
  getAccount: jest.fn().mockResolvedValue(mockAccountInfo),
};

/**
 * Performance test helpers
 */
export const msalPerformanceHelpers = {
  simulateSlowResponse: (delayMs: number = 1000) => {
    const originalAcquireToken = (mockConfidentialClientApplication as any).acquireTokenSilent;
    (mockConfidentialClientApplication as any).acquireTokenSilent = jest
      .fn()
      .mockImplementation(async (request: any) => {
        await new Promise(resolve => setTimeout(resolve, delayMs));
        return originalAcquireToken.call(mockConfidentialClientApplication, request);
      });
  },

  simulateRateLimitedResponse: () => {
    (mockConfidentialClientApplication as any).acquireTokenSilent = jest.fn().mockRejectedValue({
      name: 'ServerError',
      message: 'Rate limit exceeded',
      errorCode: 'rate_limit_exceeded',
    });
  },
};
