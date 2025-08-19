import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { UnifiedPIMMain } from '../../src/index';
import { PlatformAdapterManager } from '../../src/infrastructure/adapters/PlatformAdapterManager';
import { GraphAdapter } from '../../src/infrastructure/adapters/microsoft/GraphAdapter';
import { SecurityManager } from '../../src/shared/security/SecurityManager';
import { ConfigManager } from '../../src/shared/config/ConfigManager';
import { Logger } from '../../src/shared/logging/Logger';
import { CacheManager } from '../../src/infrastructure/cache/CacheManager';
import { ResilienceManager } from '../../src/shared/resilience/ResilienceManager';
import { testConfig } from './setup.integration';
import { createMockMsalApp, createMockTokenResponse } from '../mocks/msalMock.js';

/**
 * Authentication Integration Tests
 *
 * Tests the complete OAuth2 PKCE authentication flow:
 * 1. Authentication URL generation with PKCE
 * 2. Authorization code exchange
 * 3. Token storage and encryption
 * 4. Token refresh mechanisms
 * 5. Authentication state management
 */
describe('Authentication Integration Tests', () => {
  let platformManager: PlatformAdapterManager;
  let graphAdapter: GraphAdapter;
  let securityManager: SecurityManager;
  let configManager: ConfigManager;
  let logger: Logger;
  let cacheManager: CacheManager;
  let resilienceManager: ResilienceManager;

  beforeAll(async () => {
    // Initialize core services
    configManager = new ConfigManager();
    await configManager.initialize();

    logger = new Logger(configManager.getConfig('logging'));
    await logger.initialize();

    securityManager = new SecurityManager(configManager.getConfig('security'), logger);
    await securityManager.initialize();

    resilienceManager = new ResilienceManager(configManager.getConfig('resilience'), logger);
    await resilienceManager.initialize();

    cacheManager = new CacheManager(configManager.getConfig('cache'), logger);
    await cacheManager.initialize();

    platformManager = new PlatformAdapterManager(
      configManager.getConfig('platforms'),
      securityManager,
      resilienceManager,
      cacheManager,
      logger,
      configManager
    );
    await platformManager.initialize();

    graphAdapter = platformManager.getAdapter('microsoft') as GraphAdapter;
  });

  afterAll(async () => {
    // Cleanup services
    await platformManager?.dispose();
    await cacheManager?.dispose();
    await securityManager?.dispose();
    await resilienceManager?.dispose();
    await logger?.dispose();
  });

  beforeEach(async () => {
    // Reset authentication state
    await securityManager.clearTokens('microsoft');
  });

  afterEach(async () => {
    // Cleanup after each test
    jest.clearAllMocks();
  });

  describe('OAuth2 PKCE Flow Initiation', () => {
    test('should generate authentication URL with valid PKCE parameters', async () => {
      const userId = testConfig.mockData.userId;

      const result = await graphAdapter.startAuthentication(userId);

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      // Verify PKCE parameters in URL
      const url = new URL(result);
      expect(url.searchParams.get('code_challenge')).toBeDefined();
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('state')).toBeDefined();
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBeDefined();

      // Verify redirect URI is configured
      expect(url.searchParams.get('redirect_uri')).toBeDefined();

      // Verify scope includes necessary permissions
      const scope = url.searchParams.get('scope');
      expect(scope).toBeDefined();
      expect(scope).toContain('https://graph.microsoft.com/Mail.Read');
      expect(scope).toContain('https://graph.microsoft.com/Mail.Send');
    });

    test('should handle authentication initiation failure gracefully', async () => {
      // Mock MSAL failure
      const mockMsalApp = createMockMsalApp();
      mockMsalApp.getAuthCodeUrl.mockRejectedValue(new Error('MSAL configuration error'));

      try {
        await graphAdapter.startAuthentication('invalid-user');
        fail('Expected authentication to throw an error');
      } catch (error: any) {
        expect(error.message).toContain('MSAL configuration error');
      }
    });

    test('should generate different PKCE parameters for each request', async () => {
      const result1 = await graphAdapter.startAuthentication('user1');
      const result2 = await graphAdapter.startAuthentication('user2');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      const url1 = new URL(result1.authUrl);
      const url2 = new URL(result2.authUrl);

      // PKCE challenge should be different
      expect(url1.searchParams.get('code_challenge')).not.toBe(
        url2.searchParams.get('code_challenge')
      );

      // State should be different
      expect(url1.searchParams.get('state')).not.toBe(url2.searchParams.get('state'));
    });
  });

  describe('OAuth2 Callback Handling', () => {
    let authUrl: string;
    let state: string;
    let codeChallenge: string;

    beforeEach(async () => {
      // Start authentication to get state and challenge
      const authResult = await graphAdapter.startAuthentication(testConfig.mockData.userId);
      authUrl = authResult.authUrl;
      const url = new URL(authUrl);
      state = url.searchParams.get('state')!;
      codeChallenge = url.searchParams.get('code_challenge')!;
    });

    test('should successfully handle valid authorization callback', async () => {
      const authCode = 'test-auth-code-12345';

      // Mock successful token exchange
      const mockTokenResponse = createMockTokenResponse();
      const mockMsalApp = createMockMsalApp();
      mockMsalApp.acquireTokenByCode.mockResolvedValue(mockTokenResponse);

      const result = await graphAdapter.handleAuthCallback(authCode, state);

      expect(result).toBe(true);

      // Verify adapter is now authenticated
      expect(graphAdapter.isAuthenticated).toBe(true);

      // Verify tokens are stored securely
      const storedTokens = await securityManager.getTokens('microsoft');
      expect(storedTokens).toBeDefined();
      expect(storedTokens.accessToken).toBeDefined();
      expect(storedTokens.refreshToken).toBeDefined();
    });

    test('should reject callback with invalid state parameter', async () => {
      const authCode = 'test-auth-code-12345';
      const invalidState = 'invalid-state-parameter';

      const result = await graphAdapter.handleAuthCallback(authCode, invalidState);

      expect(result).toBe(false);
      expect(graphAdapter.isAuthenticated).toBe(false);
    });

    test('should handle token exchange failure', async () => {
      const authCode = 'invalid-auth-code';

      // Mock token exchange failure
      const mockMsalApp = createMockMsalApp();
      mockMsalApp.acquireTokenByCode.mockRejectedValue(new Error('Invalid authorization code'));

      const result = await graphAdapter.handleAuthCallback(authCode, state);

      expect(result).toBe(false);
      expect(graphAdapter.isAuthenticated).toBe(false);
    });

    test('should validate PKCE code verifier during token exchange', async () => {
      const authCode = 'test-auth-code-12345';

      const mockMsalApp = createMockMsalApp();
      mockMsalApp.acquireTokenByCode.mockImplementation(request => {
        // Verify PKCE code verifier is present
        expect(request.codeVerifier).toBeDefined();
        expect(typeof request.codeVerifier).toBe('string');
        expect(request.codeVerifier.length).toBeGreaterThan(43);

        return Promise.resolve(createMockTokenResponse());
      });

      await graphAdapter.handleAuthCallback(authCode, state);

      expect(mockMsalApp.acquireTokenByCode).toHaveBeenCalledWith(
        expect.objectContaining({
          code: authCode,
          codeVerifier: expect.any(String),
        })
      );
    });
  });

  describe('Token Management', () => {
    beforeEach(async () => {
      // Setup authenticated state
      const authResult = await graphAdapter.startAuthentication(testConfig.mockData.userId);
      const url = new URL(authResult.authUrl);
      const state = url.searchParams.get('state')!;

      const mockMsalApp = createMockMsalApp();
      mockMsalApp.acquireTokenByCode.mockResolvedValue(createMockTokenResponse());

      await graphAdapter.handleAuthCallback('test-auth-code', state);
    });

    test('should store tokens with encryption', async () => {
      const storedTokens = await securityManager.getTokens('microsoft');

      expect(storedTokens).toBeDefined();
      expect(storedTokens.accessToken).toBeDefined();
      expect(storedTokens.refreshToken).toBeDefined();
      expect(storedTokens.expiresAt).toBeDefined();

      // Verify token is encrypted (should not be plain text)
      expect(storedTokens.accessToken).not.toContain('Bearer');
      expect(storedTokens.accessToken.length).toBeGreaterThan(50);
    });

    test('should refresh tokens when expired', async () => {
      // Simulate expired token
      const expiredTokens = {
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      };

      await securityManager.storeTokens('microsoft', expiredTokens);

      // Mock successful token refresh
      const mockMsalApp = createMockMsalApp();
      const newTokenResponse = createMockTokenResponse();
      mockMsalApp.acquireTokenSilent.mockResolvedValue(newTokenResponse);

      // Trigger token refresh by making authenticated request
      const result = await graphAdapter.getEmail('test-email-id');

      // Verify token was refreshed
      expect(mockMsalApp.acquireTokenSilent).toHaveBeenCalled();

      // Verify new tokens are stored
      const updatedTokens = await securityManager.getTokens('microsoft');
      expect(updatedTokens.accessToken).not.toBe(expiredTokens.accessToken);
    });

    test('should handle token refresh failure', async () => {
      // Simulate expired token
      const expiredTokens = {
        accessToken: 'expired-token',
        refreshToken: 'invalid-refresh-token',
        expiresAt: new Date(Date.now() - 3600000),
      };

      await securityManager.storeTokens('microsoft', expiredTokens);

      // Mock failed token refresh
      const mockMsalApp = createMockMsalApp();
      mockMsalApp.acquireTokenSilent.mockRejectedValue(new Error('Refresh token expired'));

      // Should clear authentication state on refresh failure
      const result = await graphAdapter.getEmail('test-email-id');

      expect(result.success).toBe(false);
      expect(graphAdapter.isAuthenticated).toBe(false);
    });

    test('should clear tokens on logout', async () => {
      // Clear tokens to simulate logout
      await securityManager.clearTokens('microsoft');
      
      // Verify authentication status is now false
      expect(graphAdapter.isAuthenticated).toBe(false);
    });
  });

  describe('Authentication State Management', () => {
    test('should correctly report authentication status', async () => {
      // Initially not authenticated
      expect(graphAdapter.isAuthenticated).toBe(false);

      // Authenticate
      const authResult = await graphAdapter.startAuthentication(testConfig.mockData.userId);
      const url = new URL(authResult.authUrl);
      const state = url.searchParams.get('state')!;

      const mockMsalApp = createMockMsalApp();
      mockMsalApp.acquireTokenByCode.mockResolvedValue(createMockTokenResponse());

      await graphAdapter.handleAuthCallback('test-auth-code', state);

      // Should be authenticated
      expect(graphAdapter.isAuthenticated).toBe(true);

      // Logout
      await graphAdapter.logout();

      // Should not be authenticated
      expect(graphAdapter.isAuthenticated).toBe(false);
    });

    test('should persist authentication across adapter restarts', async () => {
      // Authenticate with first adapter instance
      const authResult = await graphAdapter.startAuthentication(testConfig.mockData.userId);
      const url = new URL(authResult.authUrl);
      const state = url.searchParams.get('state')!;

      const mockMsalApp = createMockMsalApp();
      mockMsalApp.acquireTokenByCode.mockResolvedValue(createMockTokenResponse());

      await graphAdapter.handleAuthCallback('test-auth-code', state);
      expect(graphAdapter.isAuthenticated).toBe(true);

      // Create new adapter instance (simulating restart)
      const newPlatformManager = new PlatformAdapterManager(
        configManager.getConfig('platforms'),
        securityManager,
        resilienceManager,
        cacheManager,
        logger,
        configManager
      );
      await newPlatformManager.initialize();

      const newGraphAdapter = newPlatformManager.getAdapter('microsoft') as GraphAdapter;

      // Should restore authentication state
      expect(newGraphAdapter.isAuthenticated).toBe(true);

      await newPlatformManager.dispose();
    });

    test('should handle multiple concurrent authentication attempts', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        graphAdapter.startAuthentication(`user-${i}`)
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result).toBeDefined();
      });

      // All should have unique state parameters
      const states = results.map(result => {
        const url = new URL(result);
        return url.searchParams.get('state');
      });

      const uniqueStates = new Set(states);
      expect(uniqueStates.size).toBe(states.length);
    });
  });

  describe('Error Scenarios and Edge Cases', () => {
    test('should handle network failures during authentication', async () => {
      // Mock network failure
      const mockMsalApp = createMockMsalApp();
      mockMsalApp.getAuthCodeUrl.mockRejectedValue(new Error('Network request failed'));

      const result = await graphAdapter.startAuthentication(testConfig.mockData.userId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network request failed');
    });

    test('should handle malformed callback parameters', async () => {
      const testCases = [
        { code: '', state: 'valid-state' },
        { code: 'valid-code', state: '' },
        { code: null, state: 'valid-state' },
        { code: 'valid-code', state: null },
      ];

      for (const testCase of testCases) {
        const result = await graphAdapter.handleAuthCallback(
          testCase.code as any,
          testCase.state as any
        );
        expect(result).toBe(false);
      }
    });

    test('should timeout on slow authentication requests', async () => {
      // Mock slow response
      const mockMsalApp = createMockMsalApp();
      mockMsalApp.getAuthCodeUrl.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 70000)) // 70 seconds
      );

      const startTime = Date.now();
      const result = await graphAdapter.startAuthentication(testConfig.mockData.userId);
      const endTime = Date.now();

      expect(result.success).toBe(false);
      expect(endTime - startTime).toBeLessThan(65000); // Should timeout before 65 seconds
    });

    test('should rate limit authentication attempts', async () => {
      // Make many rapid authentication attempts
      const promises = Array.from({ length: 20 }, () =>
        graphAdapter.startAuthentication(testConfig.mockData.userId)
      );

      const results = await Promise.all(promises);

      // Some should be rate limited
      const rateLimitedResults = results.filter(
        result => !result.success && result.error?.includes('rate limit')
      );

      expect(rateLimitedResults.length).toBeGreaterThan(0);
    });
  });
});
