/**
 * Unit tests for MsalAuthProvider
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { InteractionRequiredAuthError } from '@azure/msal-node';
import { MsalAuthProvider, TokenCacheEntry } from '../../../../../../src/infrastructure/adapters/microsoft/auth/MsalAuthProvider';
import { MsalConfig } from '../../../../../../src/infrastructure/adapters/microsoft/auth/MsalConfig';
import { Logger } from '../../../../../../src/shared/logging/Logger';
import {
  mockAuthenticationResult,
  mockAccountInfo,
  mockExpiredAuthenticationResult,
  mockRefreshTokenResult,
  mockSilentTokenResult,
  mockInteractionRequiredError,
  mockInvalidGrantError,
  mockNetworkError,
  mockPKCE,
  mockDefaultScopes,
  mockExtendedScopes,
  createMockAuthResult,
  createMockAccount,
} from '../../../../../fixtures/msalResponses';
import { 
  mockConfidentialClientApplication,
  MockMsalClientApplication,
  msalTestScenarios,
  resetMsalMocks,
} from '../../../../../mocks/msalMock';
import { createMockLogger } from '../../../../../fixtures/testData';

// Mock the MSAL module
jest.mock('@azure/msal-node', () => ({
  ConfidentialClientApplication: jest.fn().mockImplementation(() => mockConfidentialClientApplication),
  PublicClientApplication: jest.fn().mockImplementation(() => mockConfidentialClientApplication),
  InteractionRequiredAuthError: jest.fn().mockImplementation((message: string) => ({
    name: 'InteractionRequiredAuthError',
    message,
    errorCode: 'interaction_required',
  })),
}));

// Mock crypto
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockImplementation((size: number) => ({
    toString: jest.fn().mockImplementation((encoding: string) => {
      if (encoding === 'base64url') {
        return size === 32 ? mockPKCE.verifier : 'mock-base64url-string';
      }
      return 'mock-string';
    }),
  })),
  createHash: jest.fn().mockReturnValue({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue(mockPKCE.challenge),
  }),
}));

// Mock MsalConfig
jest.mock('../../../../../../src/infrastructure/adapters/microsoft/auth/MsalConfig', () => ({
  MsalConfig: {
    getConfiguration: jest.fn().mockReturnValue({
      auth: {
        clientId: 'test-client-id',
        authority: 'https://login.microsoftonline.com/test-tenant-id',
        redirectUri: 'http://localhost:3000/auth/callback',
      },
    }),
    getDefaultScopes: jest.fn().mockReturnValue(mockDefaultScopes),
    getRedirectUri: jest.fn().mockReturnValue('http://localhost:3000/auth/callback'),
    getGraphApiBaseUrl: jest.fn().mockReturnValue('https://graph.microsoft.com/v1.0'),
    getGraphApiBetaUrl: jest.fn().mockReturnValue('https://graph.microsoft.com/beta'),
  },
}));

describe('MsalAuthProvider', () => {
  let authProvider: MsalAuthProvider;
  let mockConfig: MsalConfig;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    resetMsalMocks();
    mockConfig = {} as MsalConfig; // Mock will be used
    mockLogger = createMockLogger();
    authProvider = new MsalAuthProvider(mockConfig, mockLogger as unknown as Logger, true);
  });

  afterEach(() => {
    resetMsalMocks();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create confidential client by default', () => {
      expect(authProvider).toBeInstanceOf(MsalAuthProvider);
      expect(mockLogger.info).not.toHaveBeenCalled(); // No initialization logging in constructor
    });

    it('should create public client when specified', () => {
      const publicAuthProvider = new MsalAuthProvider(mockConfig, mockLogger as unknown as Logger, false);
      expect(publicAuthProvider).toBeInstanceOf(MsalAuthProvider);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('should generate authorization URL with PKCE', async () => {
      msalTestScenarios.success();
      
      const authUrl = await authProvider.getAuthorizationUrl(mockDefaultScopes, 'test-state');
      
      expect(authUrl).toBe('https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize?test=true');
      expect(mockLogger.info).toHaveBeenCalledWith('Generated authorization URL with PKCE');
    });

    it('should generate state parameter if not provided', async () => {
      msalTestScenarios.success();
      
      const authUrl = await authProvider.getAuthorizationUrl(mockDefaultScopes);
      
      expect(authUrl).toBe('https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize?test=true');
    });

    it('should use default scopes if not provided', async () => {
      msalTestScenarios.success();
      
      const authUrl = await authProvider.getAuthorizationUrl();
      
      expect(authUrl).toBe('https://login.microsoftonline.com/test-tenant/oauth2/v2.0/authorize?test=true');
    });

    it('should handle network errors', async () => {
      msalTestScenarios.networkFailure();
      
      await expect(authProvider.getAuthorizationUrl()).rejects.toThrow('Network request failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to generate authorization URL', expect.any(Object));
    });
  });

  describe('acquireTokenByCode', () => {
    it('should exchange authorization code for tokens', async () => {
      msalTestScenarios.success();
      
      // First generate auth URL to create PKCE values
      await authProvider.getAuthorizationUrl();
      
      const tokenEntry = await authProvider.acquireTokenByCode('test-auth-code', mockDefaultScopes);
      
      expect(tokenEntry).toEqual({
        accessToken: mockAuthenticationResult.accessToken,
        refreshToken: (mockAuthenticationResult as any).refreshToken,
        expiresOn: mockAuthenticationResult.expiresOn,
        scopes: mockAuthenticationResult.scopes,
        account: mockAuthenticationResult.account,
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully acquired tokens by authorization code');
    });

    it('should throw error if PKCE verifier is missing', async () => {
      msalTestScenarios.success();
      
      await expect(authProvider.acquireTokenByCode('test-auth-code')).rejects.toThrow(
        'PKCE verifier not found. Please call getAuthorizationUrl first.'
      );
    });

    it('should store account for future requests', async () => {
      msalTestScenarios.success();
      
      await authProvider.getAuthorizationUrl();
      await authProvider.acquireTokenByCode('test-auth-code');
      
      expect(authProvider.getCurrentAccount()).toEqual(mockAccountInfo);
    });

    it('should clear PKCE values after successful exchange', async () => {
      msalTestScenarios.success();
      
      await authProvider.getAuthorizationUrl();
      await authProvider.acquireTokenByCode('test-auth-code');
      
      // Should be able to get auth URL again (PKCE values cleared)
      const authUrl = await authProvider.getAuthorizationUrl();
      expect(authUrl).toBeTruthy();
    });

    it('should handle invalid grant errors', async () => {
      msalTestScenarios.invalidAuthCode();
      
      await authProvider.getAuthorizationUrl();
      
      await expect(authProvider.acquireTokenByCode('invalid-code')).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to acquire token by code', expect.any(Object));
    });
  });

  describe('acquireTokenSilent', () => {
    beforeEach(() => {
      // Set up provider with an account
      authProvider.setCurrentAccount(mockAccountInfo);
    });

    it('should acquire token silently from cache', async () => {
      msalTestScenarios.success();
      
      const tokenEntry = await authProvider.acquireTokenSilent(mockDefaultScopes);
      
      expect(tokenEntry).toEqual({
        accessToken: mockSilentTokenResult.accessToken,
        refreshToken: (mockSilentTokenResult as any).refreshToken,
        expiresOn: mockSilentTokenResult.expiresOn,
        scopes: mockSilentTokenResult.scopes,
        account: mockSilentTokenResult.account,
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully acquired token silently');
    });

    it('should use provided account over current account', async () => {
      msalTestScenarios.success();
      const customAccount = createMockAccount({ username: 'custom@example.com' });
      
      const tokenEntry = await authProvider.acquireTokenSilent(mockDefaultScopes, customAccount);
      
      expect(tokenEntry).toBeTruthy();
    });

    it('should throw error if no account is available', async () => {
      authProvider.setCurrentAccount(null as any);
      
      await expect(authProvider.acquireTokenSilent()).rejects.toThrow(
        'No account found. User must authenticate first.'
      );
    });

    it('should handle interaction required errors', async () => {
      msalTestScenarios.interactionRequired();
      
      await expect(authProvider.acquireTokenSilent()).rejects.toThrow(
        'User interaction required. Please re-authenticate.'
      );
      expect(mockLogger.warn).toHaveBeenCalledWith('Silent token acquisition failed, interaction required');
    });

    it('should handle other errors', async () => {
      msalTestScenarios.networkFailure();
      
      await expect(authProvider.acquireTokenSilent()).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to acquire token silently', expect.any(Object));
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token using refresh token', async () => {
      msalTestScenarios.success();
      
      const tokenEntry = await authProvider.refreshAccessToken('test-refresh-token', mockDefaultScopes);
      
      expect(tokenEntry).toEqual({
        accessToken: mockRefreshTokenResult.accessToken,
        refreshToken: (mockRefreshTokenResult as any).refreshToken,
        expiresOn: mockRefreshTokenResult.expiresOn,
        scopes: mockRefreshTokenResult.scopes,
        account: mockRefreshTokenResult.account,
      });
      expect(mockLogger.info).toHaveBeenCalledWith('Successfully refreshed access token');
    });

    it('should update current account from refresh response', async () => {
      msalTestScenarios.success();
      
      await authProvider.refreshAccessToken('test-refresh-token');
      
      expect(authProvider.getCurrentAccount()).toEqual(mockRefreshTokenResult.account);
    });

    it('should handle expired refresh token', async () => {
      msalTestScenarios.refreshTokenExpired();
      
      await expect(authProvider.refreshAccessToken('expired-refresh-token')).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to refresh access token', expect.any(Object));
    });
  });

  describe('getToken', () => {
    it('should try silent acquisition first', async () => {
      msalTestScenarios.success();
      authProvider.setCurrentAccount(mockAccountInfo);
      
      const tokenEntry = await authProvider.getToken();
      
      expect(tokenEntry.accessToken).toBe(mockSilentTokenResult.accessToken);
    });

    it('should fall back to refresh token if silent fails', async () => {
      msalTestScenarios.interactionRequired();
      
      const tokenEntry = await authProvider.getToken(mockDefaultScopes, 'test-refresh-token');
      
      expect(tokenEntry.accessToken).toBe(mockRefreshTokenResult.accessToken);
      expect(mockLogger.warn).toHaveBeenCalledWith('Silent token acquisition failed, attempting refresh');
    });

    it('should throw error if no account and no refresh token', async () => {
      msalTestScenarios.success();
      
      await expect(authProvider.getToken()).rejects.toThrow(
        'Unable to acquire token. User must re-authenticate.'
      );
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid token', () => {
      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      
      expect(authProvider.isTokenExpired(futureDate)).toBe(false);
    });

    it('should return true for expired token', () => {
      const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
      
      expect(authProvider.isTokenExpired(pastDate)).toBe(true);
    });

    it('should return true for token expiring within buffer', () => {
      const soonExpiring = new Date(Date.now() + 240000); // 4 minutes from now (default buffer is 5 minutes)
      
      expect(authProvider.isTokenExpired(soonExpiring)).toBe(true);
    });

    it('should use custom buffer time', () => {
      const soonExpiring = new Date(Date.now() + 120000); // 2 minutes from now
      
      expect(authProvider.isTokenExpired(soonExpiring, 1)).toBe(false); // 1 minute buffer
      expect(authProvider.isTokenExpired(soonExpiring, 3)).toBe(true); // 3 minute buffer
    });
  });

  describe('signOut', () => {
    beforeEach(() => {
      authProvider.setCurrentAccount(mockAccountInfo);
    });

    it('should sign out current user', async () => {
      msalTestScenarios.success();
      
      await authProvider.signOut();
      
      expect(authProvider.getCurrentAccount()).toBeNull();
      expect(mockLogger.info).toHaveBeenCalledWith('User signed out successfully');
    });

    it('should sign out specific account', async () => {
      msalTestScenarios.success();
      const customAccount = createMockAccount({ username: 'custom@example.com' });
      
      await authProvider.signOut(customAccount);
      
      expect(authProvider.getCurrentAccount()).toBeNull();
    });

    it('should handle errors during sign out', async () => {
      msalTestScenarios.networkFailure();
      
      await expect(authProvider.signOut()).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to sign out user', expect.any(Object));
    });
  });

  describe('hasRequiredScopes', () => {
    it('should return true when all required scopes are present', () => {
      const tokenScopes = ['https://graph.microsoft.com/User.Read', 'https://graph.microsoft.com/Mail.Read'];
      const requiredScopes = ['https://graph.microsoft.com/User.Read'];
      
      expect(authProvider.hasRequiredScopes(tokenScopes, requiredScopes)).toBe(true);
    });

    it('should return false when required scopes are missing', () => {
      const tokenScopes = ['https://graph.microsoft.com/User.Read'];
      const requiredScopes = ['https://graph.microsoft.com/Mail.Read'];
      
      expect(authProvider.hasRequiredScopes(tokenScopes, requiredScopes)).toBe(false);
    });

    it('should be case insensitive', () => {
      const tokenScopes = ['https://graph.microsoft.com/user.read'];
      const requiredScopes = ['https://graph.microsoft.com/User.Read'];
      
      expect(authProvider.hasRequiredScopes(tokenScopes, requiredScopes)).toBe(true);
    });
  });

  describe('getLogoutUrl', () => {
    it('should generate logout URL without redirect', () => {
      const logoutUrl = authProvider.getLogoutUrl();
      
      expect(logoutUrl).toContain('/oauth2/v2.0/logout');
    });

    it('should generate logout URL with post-logout redirect', () => {
      const redirectUri = 'http://localhost:3000/logged-out';
      const logoutUrl = authProvider.getLogoutUrl(redirectUri);
      
      expect(logoutUrl).toContain('/oauth2/v2.0/logout');
      expect(logoutUrl).toContain('post_logout_redirect_uri=' + encodeURIComponent(redirectUri));
    });
  });

  describe('getCachedAccounts', () => {
    it('should return cached accounts', async () => {
      msalTestScenarios.success();
      
      const accounts = await authProvider.getCachedAccounts();
      
      expect(accounts).toEqual([mockAccountInfo]);
    });

    it('should return empty array on error', async () => {
      msalTestScenarios.networkFailure();
      
      const accounts = await authProvider.getCachedAccounts();
      
      expect(accounts).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get cached accounts', expect.any(Object));
    });
  });

  describe('error scenarios', () => {
    it('should handle malformed authentication results', async () => {
      msalTestScenarios.success();
      const malformedResult = createMockAuthResult({ accessToken: null as any });
      (mockConfidentialClientApplication as any).acquireTokenByCode = jest.fn<() => Promise<any>>().mockResolvedValue(malformedResult);
      
      await authProvider.getAuthorizationUrl();
      
      await expect(authProvider.acquireTokenByCode('test-code')).rejects.toThrow('No access token in response');
    });
  });

  describe('edge cases', () => {
    it('should handle missing expiration date', async () => {
      msalTestScenarios.success();
      const resultWithoutExpiry = createMockAuthResult({ expiresOn: null });
      (mockConfidentialClientApplication as any).acquireTokenByCode = jest.fn<() => Promise<any>>().mockResolvedValue(resultWithoutExpiry);
      
      await authProvider.getAuthorizationUrl();
      const tokenEntry = await authProvider.acquireTokenByCode('test-code');
      
      // Should default to 1 hour expiry
      expect(tokenEntry.expiresOn).toBeInstanceOf(Date);
    });

    it('should handle empty scopes array', async () => {
      msalTestScenarios.success();
      
      await authProvider.getAuthorizationUrl([]);
      const tokenEntry = await authProvider.acquireTokenByCode('test-code', []);
      
      expect(tokenEntry).toBeTruthy();
    });
  });
});