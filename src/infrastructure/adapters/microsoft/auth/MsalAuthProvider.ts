import {
  ConfidentialClientApplication,
  PublicClientApplication,
  AuthorizationCodeRequest,
  AuthorizationUrlRequest,
  RefreshTokenRequest,
  SilentFlowRequest,
  AccountInfo,
  AuthenticationResult,
  InteractionRequiredAuthError,
} from '@azure/msal-node';
import { Logger } from '../../../../shared/logging/Logger';
import { MsalConfig } from './MsalConfig';
import crypto from 'crypto';

/**
 * Token cache entry structure
 */
export interface TokenCacheEntry {
  accessToken: string;
  refreshToken?: string;
  expiresOn: Date;
  scopes: string[];
  account?: AccountInfo;
}

/**
 * MSAL Authentication Provider
 * Handles OAuth2 authorization code flow with PKCE for Microsoft Graph
 */
export class MsalAuthProvider {
  private msalClient: ConfidentialClientApplication | PublicClientApplication;
  private readonly logger: Logger;
  private currentAccount: AccountInfo | null = null;
  private pkceVerifier: string | null = null;
  private pkceChallenge: string | null = null;

  constructor(
    private readonly config: MsalConfig,
    logger: Logger,
    private readonly isConfidentialClient: boolean = true
  ) {
    this.logger = logger;
    
    // Initialize MSAL client based on type
    if (this.isConfidentialClient) {
      this.msalClient = new ConfidentialClientApplication(config.getConfiguration());
    } else {
      this.msalClient = new PublicClientApplication(config.getConfiguration());
    }
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): { verifier: string; challenge: string } {
    // Generate code verifier (43-128 characters)
    const verifier = crypto.randomBytes(32).toString('base64url');
    
    // Generate code challenge from verifier
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');

    this.pkceVerifier = verifier;
    this.pkceChallenge = challenge;

    return { verifier, challenge };
  }

  /**
   * Get authorization URL for user login
   */
  async getAuthorizationUrl(
    scopes: string[] = MsalConfig.getDefaultScopes(),
    state?: string
  ): Promise<string> {
    try {
      const { challenge } = this.generatePKCE();

      const authUrlRequest: AuthorizationUrlRequest = {
        scopes,
        redirectUri: MsalConfig.getRedirectUri(),
        responseMode: 'query',
        codeChallenge: challenge,
        codeChallengeMethod: 'S256',
        state: state || crypto.randomBytes(16).toString('base64url'),
        prompt: 'select_account',
      };

      const authUrl = await this.msalClient.getAuthCodeUrl(authUrlRequest);
      this.logger.info('Generated authorization URL with PKCE');
      
      return authUrl;
    } catch (error) {
      this.logger.error('Failed to generate authorization URL', error);
      throw error;
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  async acquireTokenByCode(
    code: string,
    scopes: string[] = MsalConfig.getDefaultScopes()
  ): Promise<TokenCacheEntry> {
    try {
      if (!this.pkceVerifier) {
        throw new Error('PKCE verifier not found. Please call getAuthorizationUrl first.');
      }

      const tokenRequest: AuthorizationCodeRequest = {
        code,
        scopes,
        redirectUri: MsalConfig.getRedirectUri(),
        codeVerifier: this.pkceVerifier,
      };

      const response = await this.msalClient.acquireTokenByCode(tokenRequest);
      
      // Store the account for future silent requests
      if (response.account) {
        this.currentAccount = response.account;
      }

      // Clear PKCE values after successful exchange
      this.pkceVerifier = null;
      this.pkceChallenge = null;

      this.logger.info('Successfully acquired tokens by authorization code');

      return this.formatTokenResponse(response);
    } catch (error) {
      this.logger.error('Failed to acquire token by code', error);
      throw error;
    }
  }

  /**
   * Acquire token silently (from cache or using refresh token)
   */
  async acquireTokenSilent(
    scopes: string[] = MsalConfig.getDefaultScopes(),
    account?: AccountInfo
  ): Promise<TokenCacheEntry> {
    try {
      const targetAccount = account || this.currentAccount;
      
      if (!targetAccount) {
        throw new Error('No account found. User must authenticate first.');
      }

      const silentRequest: SilentFlowRequest = {
        account: targetAccount,
        scopes,
        forceRefresh: false,
      };

      const response = await this.msalClient.acquireTokenSilent(silentRequest);
      
      this.logger.info('Successfully acquired token silently');
      
      return this.formatTokenResponse(response);
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        this.logger.warn('Silent token acquisition failed, interaction required');
        throw new Error('User interaction required. Please re-authenticate.');
      }
      
      this.logger.error('Failed to acquire token silently', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
    scopes: string[] = MsalConfig.getDefaultScopes()
  ): Promise<TokenCacheEntry> {
    try {
      const refreshTokenRequest: RefreshTokenRequest = {
        refreshToken,
        scopes,
      };

      const response = await this.msalClient.acquireTokenByRefreshToken(refreshTokenRequest);
      
      // Update current account if provided
      if (response.account) {
        this.currentAccount = response.account;
      }

      this.logger.info('Successfully refreshed access token');
      
      return this.formatTokenResponse(response);
    } catch (error) {
      this.logger.error('Failed to refresh access token', error);
      throw error;
    }
  }

  /**
   * Get token with automatic refresh if needed
   */
  async getToken(
    scopes: string[] = MsalConfig.getDefaultScopes(),
    refreshToken?: string
  ): Promise<TokenCacheEntry> {
    try {
      // Try silent acquisition first
      if (this.currentAccount) {
        try {
          return await this.acquireTokenSilent(scopes, this.currentAccount);
        } catch (silentError) {
          this.logger.warn('Silent token acquisition failed, attempting refresh');
        }
      }

      // Try refresh token if available
      if (refreshToken) {
        return await this.refreshAccessToken(refreshToken, scopes);
      }

      // If all else fails, user needs to re-authenticate
      throw new Error('Unable to acquire token. User must re-authenticate.');
    } catch (error) {
      this.logger.error('Failed to get token', error);
      throw error;
    }
  }

  /**
   * Check if token is expired or about to expire
   */
  isTokenExpired(expiresOn: Date, bufferMinutes: number = 5): boolean {
    const now = new Date();
    const bufferMs = bufferMinutes * 60 * 1000;
    const expirationWithBuffer = new Date(expiresOn.getTime() - bufferMs);
    
    return now >= expirationWithBuffer;
  }

  /**
   * Sign out user and clear tokens
   */
  async signOut(account?: AccountInfo): Promise<void> {
    try {
      const targetAccount = account || this.currentAccount;
      
      if (targetAccount) {
        // Clear account from MSAL cache
        const accounts = await this.msalClient.getTokenCache().getAllAccounts();
        const msalAccount = accounts.find(acc => acc.homeAccountId === targetAccount.homeAccountId);
        
        if (msalAccount) {
          await this.msalClient.getTokenCache().removeAccount(msalAccount);
        }
      }

      this.currentAccount = null;
      this.pkceVerifier = null;
      this.pkceChallenge = null;
      
      this.logger.info('User signed out successfully');
    } catch (error) {
      this.logger.error('Failed to sign out user', error);
      throw error;
    }
  }

  /**
   * Get the current authenticated account
   */
  getCurrentAccount(): AccountInfo | null {
    return this.currentAccount;
  }

  /**
   * Set the current account (useful when restoring session)
   */
  setCurrentAccount(account: AccountInfo): void {
    this.currentAccount = account;
  }

  /**
   * Get all cached accounts
   */
  async getCachedAccounts(): Promise<AccountInfo[]> {
    try {
      return await this.msalClient.getTokenCache().getAllAccounts();
    } catch (error) {
      this.logger.error('Failed to get cached accounts', error);
      return [];
    }
  }

  /**
   * Format MSAL authentication response to TokenCacheEntry
   */
  private formatTokenResponse(response: AuthenticationResult): TokenCacheEntry {
    if (!response.accessToken) {
      throw new Error('No access token in response');
    }

    return {
      accessToken: response.accessToken,
      refreshToken: (response as any).refreshToken || undefined,
      expiresOn: response.expiresOn || new Date(Date.now() + 3600000), // Default 1 hour
      scopes: response.scopes,
      account: response.account || undefined,
    };
  }

  /**
   * Validate token scopes
   */
  hasRequiredScopes(tokenScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.every(scope => 
      tokenScopes.some(tokenScope => 
        tokenScope.toLowerCase() === scope.toLowerCase()
      )
    );
  }

  /**
   * Get logout URL for redirect
   */
  getLogoutUrl(postLogoutRedirectUri?: string): string {
    const config = this.config.getConfiguration();
    const logoutUrl = new URL(`${config.auth.authority}/oauth2/v2.0/logout`);
    
    if (postLogoutRedirectUri) {
      logoutUrl.searchParams.append('post_logout_redirect_uri', postLogoutRedirectUri);
    }
    
    return logoutUrl.toString();
  }
}