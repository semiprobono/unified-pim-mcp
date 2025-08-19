import { GoogleAuthProvider, GoogleTokenCacheEntry } from './GoogleAuthProvider.js';
import { Logger } from '../../../../shared/logging/Logger.js';
import { Credentials } from 'google-auth-library';

/**
 * Token refresh configuration
 */
interface TokenRefreshConfig {
  refreshBeforeExpiryMs?: number; // Refresh tokens this many ms before expiry
  maxRetries?: number;
  retryDelayMs?: number;
  enableAutoRefresh?: boolean;
}

/**
 * Google Token Refresh Service
 * Handles automatic token refresh and lifecycle management
 */
export class TokenRefreshService {
  private readonly logger: Logger;
  private refreshTimer?: NodeJS.Timeout;
  private readonly config: Required<TokenRefreshConfig>;
  private tokenCache: Map<string, GoogleTokenCacheEntry> = new Map();
  private refreshPromises: Map<string, Promise<GoogleTokenCacheEntry>> = new Map();

  constructor(
    private readonly authProvider: GoogleAuthProvider,
    logger: Logger,
    config?: TokenRefreshConfig
  ) {
    this.logger = logger;
    this.config = {
      refreshBeforeExpiryMs: config?.refreshBeforeExpiryMs ?? 5 * 60 * 1000, // 5 minutes
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 1000,
      enableAutoRefresh: config?.enableAutoRefresh ?? true,
    };
  }

  /**
   * Start automatic token refresh
   */
  startAutoRefresh(token: GoogleTokenCacheEntry): void {
    if (!this.config.enableAutoRefresh) {
      return;
    }

    this.stopAutoRefresh();

    const cacheKey = this.getCacheKey(token.scopes);
    this.tokenCache.set(cacheKey, token);

    if (token.refreshToken) {
      this.scheduleRefresh(token);
    }
  }

  /**
   * Stop automatic token refresh
   */
  stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  /**
   * Get or refresh token
   */
  async getOrRefreshToken(
    scopes: string[],
    refreshToken?: string
  ): Promise<GoogleTokenCacheEntry | null> {
    const cacheKey = this.getCacheKey(scopes);
    const cached = this.tokenCache.get(cacheKey);

    // Check if we have a valid cached token
    if (cached && this.isTokenValid(cached)) {
      return cached;
    }

    // Check if a refresh is already in progress
    const existingRefresh = this.refreshPromises.get(cacheKey);
    if (existingRefresh) {
      return existingRefresh;
    }

    // No valid token and no refresh token provided
    if (!refreshToken && (!cached || !cached.refreshToken)) {
      return null;
    }

    // Start refresh process
    const refreshPromise = this.refreshTokenWithRetry(
      refreshToken || cached!.refreshToken!,
      scopes
    );

    this.refreshPromises.set(cacheKey, refreshPromise);

    try {
      const newToken = await refreshPromise;
      this.tokenCache.set(cacheKey, newToken);
      
      if (this.config.enableAutoRefresh) {
        this.scheduleRefresh(newToken);
      }

      return newToken;
    } finally {
      this.refreshPromises.delete(cacheKey);
    }
  }

  /**
   * Refresh token with retry logic
   */
  private async refreshTokenWithRetry(
    refreshToken: string,
    scopes: string[],
    attempt: number = 1
  ): Promise<GoogleTokenCacheEntry> {
    try {
      this.logger.debug(`Refreshing token (attempt ${attempt}/${this.config.maxRetries})`);
      
      const newToken = await this.authProvider.acquireTokenSilent(refreshToken, scopes);
      
      this.logger.info('Token refreshed successfully');
      return newToken;
    } catch (error) {
      if (attempt < this.config.maxRetries) {
        this.logger.warn(
          `Token refresh failed (attempt ${attempt}/${this.config.maxRetries}), retrying...`,
          error
        );

        await this.delay(this.config.retryDelayMs * attempt);
        return this.refreshTokenWithRetry(refreshToken, scopes, attempt + 1);
      }

      this.logger.error('Token refresh failed after all retries', error);
      throw error;
    }
  }

  /**
   * Schedule next token refresh
   */
  private scheduleRefresh(token: GoogleTokenCacheEntry): void {
    if (!token.refreshToken) {
      return;
    }

    const now = Date.now();
    const expiresAt = token.expiresOn.getTime();
    const refreshAt = expiresAt - this.config.refreshBeforeExpiryMs;
    const delay = Math.max(refreshAt - now, 0);

    this.logger.debug(
      `Scheduling token refresh in ${Math.round(delay / 1000)}s ` +
      `(expires at ${token.expiresOn.toISOString()})`
    );

    this.refreshTimer = setTimeout(async () => {
      try {
        const cacheKey = this.getCacheKey(token.scopes);
        const newToken = await this.refreshTokenWithRetry(
          token.refreshToken!,
          token.scopes
        );

        this.tokenCache.set(cacheKey, newToken);
        this.scheduleRefresh(newToken);
      } catch (error) {
        this.logger.error('Scheduled token refresh failed', error);
      }
    }, delay);
  }

  /**
   * Check if token is valid
   */
  private isTokenValid(token: GoogleTokenCacheEntry): boolean {
    const now = Date.now();
    const expiresAt = token.expiresOn.getTime();
    const bufferMs = 60 * 1000; // 1 minute buffer

    return now < (expiresAt - bufferMs);
  }

  /**
   * Get cache key for scopes
   */
  private getCacheKey(scopes: string[]): string {
    return scopes.sort().join(' ');
  }

  /**
   * Clear token cache
   */
  clearCache(): void {
    this.stopAutoRefresh();
    this.tokenCache.clear();
    this.refreshPromises.clear();
    this.logger.info('Token cache cleared');
  }

  /**
   * Get cached token
   */
  getCachedToken(scopes: string[]): GoogleTokenCacheEntry | null {
    const cacheKey = this.getCacheKey(scopes);
    const cached = this.tokenCache.get(cacheKey);

    if (cached && this.isTokenValid(cached)) {
      return cached;
    }

    return null;
  }

  /**
   * Update cached token
   */
  updateCachedToken(token: GoogleTokenCacheEntry): void {
    const cacheKey = this.getCacheKey(token.scopes);
    this.tokenCache.set(cacheKey, token);

    if (this.config.enableAutoRefresh && token.refreshToken) {
      this.scheduleRefresh(token);
    }
  }

  /**
   * Helper to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get token statistics
   */
  getTokenStats(): {
    cachedTokens: number;
    activeRefreshes: number;
    autoRefreshEnabled: boolean;
  } {
    return {
      cachedTokens: this.tokenCache.size,
      activeRefreshes: this.refreshPromises.size,
      autoRefreshEnabled: this.config.enableAutoRefresh,
    };
  }
}