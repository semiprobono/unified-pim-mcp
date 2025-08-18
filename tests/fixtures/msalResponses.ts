import { AuthenticationResult, AccountInfo } from '@azure/msal-node';

/**
 * Mock MSAL authentication responses for testing
 */

export const mockAccountInfo: AccountInfo = {
  homeAccountId: 'test-home-account-id',
  environment: 'login.microsoftonline.com',
  tenantId: 'test-tenant-id',
  username: 'test@example.com',
  localAccountId: 'test-local-account-id',
  name: 'Test User',
  idTokenClaims: {
    aud: 'test-client-id',
    iss: 'https://login.microsoftonline.com/test-tenant-id/v2.0',
    iat: 1640995200,
    nbf: 1640995200,
    exp: 1640998800,
    preferred_username: 'test@example.com',
    name: 'Test User',
    oid: 'test-object-id',
    sub: 'test-subject-id',
    tid: 'test-tenant-id',
    upn: 'test@example.com',
    ver: '2.0',
  },
};

export const mockAuthenticationResult: AuthenticationResult = {
  authority: 'https://login.microsoftonline.com/test-tenant-id',
  uniqueId: 'test-unique-id',
  tenantId: 'test-tenant-id',
  scopes: ['https://graph.microsoft.com/User.Read', 'https://graph.microsoft.com/Mail.Read'],
  account: mockAccountInfo,
  idToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.test-id-token.signature',
  idTokenClaims: mockAccountInfo.idTokenClaims,
  accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.test-access-token.signature',
  fromCache: false,
  expiresOn: new Date(Date.now() + 3600000), // 1 hour from now
  extExpiresOn: new Date(Date.now() + 7200000), // 2 hours from now
  refreshToken: 'test-refresh-token',
  familyId: undefined,
  tokenType: 'Bearer',
  state: 'test-state',
  cloudGraphHostName: 'graph.microsoft.com',
  msGraphHost: 'https://graph.microsoft.com',
  code: 'test-auth-code',
  fromNativeBroker: false,
};

export const mockExpiredAuthenticationResult: AuthenticationResult = {
  ...mockAuthenticationResult,
  expiresOn: new Date(Date.now() - 3600000), // 1 hour ago (expired)
  extExpiresOn: new Date(Date.now() - 1800000), // 30 minutes ago (expired)
};

export const mockRefreshTokenResult: AuthenticationResult = {
  ...mockAuthenticationResult,
  accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.refreshed-access-token.signature',
  refreshToken: 'new-refresh-token',
  fromCache: false,
  expiresOn: new Date(Date.now() + 3600000),
  extExpiresOn: new Date(Date.now() + 7200000),
};

export const mockSilentTokenResult: AuthenticationResult = {
  ...mockAuthenticationResult,
  accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.silent-access-token.signature',
  fromCache: true,
  refreshToken: undefined, // Silent requests might not return refresh token
};

/**
 * Mock PKCE values
 */
export const mockPKCE = {
  verifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
};

/**
 * Mock MSAL configuration
 */
export const mockMsalConfig = {
  auth: {
    clientId: 'test-client-id',
    authority: 'https://login.microsoftonline.com/test-tenant-id',
    redirectUri: 'http://localhost:3000/auth/callback',
  },
  cache: {
    cacheLocation: 'memory',
  },
  system: {
    loggerOptions: {
      loggerCallback: jest.fn(),
      logLevel: 3,
      piiLoggingEnabled: false,
    },
  },
};

/**
 * Mock authorization URL
 */
export const mockAuthorizationUrl = 'https://login.microsoftonline.com/test-tenant-id/oauth2/v2.0/authorize?client_id=test-client-id&response_type=code&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback&response_mode=query&scope=https%3A%2F%2Fgraph.microsoft.com%2FUser.Read%20https%3A%2F%2Fgraph.microsoft.com%2FMail.Read&state=test-state&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&prompt=select_account';

/**
 * Mock error responses
 */
export const mockInteractionRequiredError = {
  name: 'InteractionRequiredAuthError',
  message: 'Interaction required',
  errorCode: 'interaction_required',
  errorMessage: 'AADSTS50076: Due to a configuration change made by your administrator, or because you moved to a new location, you must use multi-factor authentication to access.',
  correlationId: 'test-correlation-id',
  subError: 'basic_action',
};

export const mockInvalidGrantError = {
  name: 'ServerError',
  message: 'Invalid grant',
  errorCode: 'invalid_grant',
  errorMessage: 'AADSTS70008: The provided authorization code or refresh token is expired or revoked.',
  correlationId: 'test-correlation-id',
};

export const mockNetworkError = {
  name: 'NetworkError',
  message: 'Network request failed',
  errorCode: 'network_error',
  errorMessage: 'Unable to connect to the authentication server.',
};

/**
 * Mock token cache entries
 */
export const mockTokenCacheEntry = {
  accessToken: mockAuthenticationResult.accessToken,
  refreshToken: mockAuthenticationResult.refreshToken,
  expiresOn: mockAuthenticationResult.expiresOn!,
  scopes: mockAuthenticationResult.scopes,
  account: mockAuthenticationResult.account,
};

export const mockExpiredTokenCacheEntry = {
  ...mockTokenCacheEntry,
  accessToken: 'expired-access-token',
  expiresOn: new Date(Date.now() - 3600000), // 1 hour ago
};

/**
 * Mock scopes
 */
export const mockDefaultScopes = [
  'https://graph.microsoft.com/User.Read',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Calendars.Read',
  'https://graph.microsoft.com/Contacts.Read',
];

export const mockExtendedScopes = [
  ...mockDefaultScopes,
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/Files.Read',
  'https://graph.microsoft.com/Tasks.ReadWrite',
];

/**
 * Mock multi-tenant scenarios
 */
export const mockTenantSpecificAccount: AccountInfo = {
  ...mockAccountInfo,
  tenantId: 'specific-tenant-id',
  homeAccountId: 'specific-home-account-id',
  environment: 'login.microsoftonline.com',
};

export const mockPersonalAccount: AccountInfo = {
  ...mockAccountInfo,
  tenantId: '9188040d-6c67-4c5b-b112-36a304b66dad', // MSA tenant
  homeAccountId: 'personal-home-account-id',
  username: 'personal@outlook.com',
};

/**
 * Helper function to create mock authentication result with custom properties
 */
export function createMockAuthResult(overrides: Partial<AuthenticationResult>): AuthenticationResult {
  return {
    ...mockAuthenticationResult,
    ...overrides,
  };
}

/**
 * Helper function to create mock account with custom properties
 */
export function createMockAccount(overrides: Partial<AccountInfo>): AccountInfo {
  return {
    ...mockAccountInfo,
    ...overrides,
    idTokenClaims: {
      ...mockAccountInfo.idTokenClaims,
      ...overrides.idTokenClaims,
    },
  };
}