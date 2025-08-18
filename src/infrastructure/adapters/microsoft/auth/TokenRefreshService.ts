import { Logger } from '../../../../shared/logging/Logger.js';
import { MsalAuthProvider, TokenCacheEntry } from './MsalAuthProvider.js';
import { SecurityManager } from '../../../../shared/security/SecurityManager.js';

/**
 * Token refresh service that integrates MSAL with secure token storage
 * Handles automatic token refresh with configurable buffer time
 */
export class TokenRefreshService {
  private readonly logger: Logger;
  private refreshTimer: NodeJS.Timeout | null = null;
  private readonly TOKEN_REFRESH_BUFFER_MINUTES = 5;

  constructor(
    private readonly authProvider: MsalAuthProvider,
    private readonly securityManager: SecurityManager,
    logger: Logger
  ) {
    this.logger = logger;
  }

  /**
   * Store tokens securely
   */
  async storeTokens(tokens: TokenCacheEntry, userId: string): Promise<void> {
    try {
      // Prepare token data with metadata
      const tokenData = {
        ...tokens,
        userId,
        storedAt: new Date().toISOString(),
        platform: 'microsoft',
        expiresOn: tokens.expiresOn.toISOString() // Convert Date to string for storage
      };
      
      // Store using the security manager
      const storageKey = this.getStorageKey(userId);
      await this.securityManager.storeSecureData(storageKey, tokenData);
      
      // Schedule automatic refresh
      this.scheduleTokenRefresh(tokens, userId);
      
      this.logger.info(`Tokens stored securely for user: ${userId}`);
    } catch (error) {
      this.logger.error('Failed to store tokens', error);
      throw error;
    }
  }

  /**
   * Retrieve tokens securely
   */
  async retrieveTokens(userId: string): Promise<TokenCacheEntry | null> {
    try {
      const storageKey = this.getStorageKey(userId);
      const tokenData = await this.securityManager.getSecureData(storageKey);
      
      if (!tokenData) {
        return null;
      }

      // Extract token information
      const tokens: TokenCacheEntry = {
        accessToken: tokenData.accessToken,
        refreshToken: tokenData.refreshToken,
        expiresOn: new Date(tokenData.expiresOn),
        scopes: tokenData.scopes,
        account: tokenData.account
      };
      
      // Check if token needs refresh
      if (this.authProvider.isTokenExpired(tokens.expiresOn, this.TOKEN_REFRESH_BUFFER_MINUTES)) {
        this.logger.info('Token expired or expiring soon, refreshing...');
        
        if (tokens.refreshToken) {
          const refreshedTokens = await this.refreshTokens(tokens.refreshToken, tokens.scopes);
          await this.storeTokens(refreshedTokens, userId);
          return refreshedTokens;
        }
      }
      
      // Reschedule refresh for existing tokens
      this.scheduleTokenRefresh(tokens, userId);
      
      return tokens;
    } catch (error) {
      this.logger.error('Failed to retrieve tokens', error);
      return null;
    }
  }

  /**
   * Refresh tokens using refresh token
   */
  async refreshTokens(refreshToken: string, scopes: string[]): Promise<TokenCacheEntry> {
    try {
      const refreshedTokens = await this.authProvider.refreshAccessToken(refreshToken, scopes);
      this.logger.info('Tokens refreshed successfully');
      return refreshedTokens;
    } catch (error) {
      this.logger.error('Failed to refresh tokens', error);
      throw error;
    }
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleTokenRefresh(tokens: TokenCacheEntry, userId: string): void {
    // Clear any existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (!tokens.refreshToken) {
      this.logger.warn('No refresh token available, cannot schedule automatic refresh');
      return;
    }

    // Calculate time until refresh (5 minutes before expiration)
    const now = Date.now();
    const expiresAt = tokens.expiresOn.getTime();
    const refreshAt = expiresAt - (this.TOKEN_REFRESH_BUFFER_MINUTES * 60 * 1000);
    const timeUntilRefresh = refreshAt - now;

    if (timeUntilRefresh <= 0) {
      // Token already needs refresh
      this.performTokenRefresh(userId, tokens.refreshToken, tokens.scopes);
    } else {
      // Schedule refresh
      this.refreshTimer = setTimeout(() => {
        this.performTokenRefresh(userId, tokens.refreshToken!, tokens.scopes);
      }, timeUntilRefresh);

      const refreshTime = new Date(refreshAt);
      this.logger.info(`Token refresh scheduled for: ${refreshTime.toISOString()}`);
    }
  }

  /**
   * Perform token refresh
   */
  private async performTokenRefresh(userId: string, refreshToken: string, scopes: string[]): Promise<void> {
    try {
      this.logger.info('Performing scheduled token refresh');
      const refreshedTokens = await this.refreshTokens(refreshToken, scopes);
      await this.storeTokens(refreshedTokens, userId);
    } catch (error) {
      this.logger.error('Scheduled token refresh failed', error);
      // Emit event or notification for token refresh failure
      this.handleTokenRefreshFailure(userId, error);
    }
  }

  /**
   * Handle token refresh failure
   */
  private handleTokenRefreshFailure(userId: string, error: any): void {
    // Clear stored tokens as they're no longer valid
    this.clearTokens(userId);
    
    // Log the failure
    this.logger.error(`Token refresh failed for user ${userId}. User must re-authenticate.`, error);
    
    // Could emit an event here for the application to handle
    // For example: this.eventEmitter.emit('token-refresh-failed', { userId, error });
  }

  /**
   * Clear stored tokens
   */
  async clearTokens(userId: string): Promise<void> {
    try {
      const storageKey = this.getStorageKey(userId);
      await this.securityManager.deleteSecureData(storageKey);
      
      // Clear refresh timer
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
      
      this.logger.info(`Tokens cleared for user: ${userId}`);
    } catch (error) {
      this.logger.error('Failed to clear tokens', error);
    }
  }

  /**
   * Revoke tokens (call Graph API to revoke refresh token)
   */
  async revokeTokens(userId: string): Promise<void> {
    try {
      // First clear local tokens
      await this.clearTokens(userId);
      
      // Sign out from MSAL
      await this.authProvider.signOut();
      
      this.logger.info(`Tokens revoked for user: ${userId}`);
    } catch (error) {
      this.logger.error('Failed to revoke tokens', error);
      throw error;
    }
  }

  /**
   * Rotate tokens (implement token rotation mechanism)
   */
  async rotateTokens(userId: string): Promise<TokenCacheEntry | null> {
    try {
      const currentTokens = await this.retrieveTokens(userId);
      
      if (!currentTokens || !currentTokens.refreshToken) {
        this.logger.warn('Cannot rotate tokens: no refresh token available');
        return null;
      }

      // Use refresh token to get new tokens
      const newTokens = await this.refreshTokens(currentTokens.refreshToken, currentTokens.scopes);
      
      // Store new tokens
      await this.storeTokens(newTokens, userId);
      
      this.logger.info(`Tokens rotated successfully for user: ${userId}`);
      return newTokens;
    } catch (error) {
      this.logger.error('Failed to rotate tokens', error);
      return null;
    }
  }

  /**
   * Get storage key for user tokens
   */
  private getStorageKey(userId: string): string {
    return `microsoft_tokens_${userId}`;
  }


  /**
   * Cleanup service
   */
  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}