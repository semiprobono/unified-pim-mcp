import { google } from 'googleapis';
import type { OAuth2Client, Credentials } from 'google-auth-library';
import { Logger } from '../../../../shared/logging/Logger.js';
import { GoogleAuthConfig } from './GoogleAuthConfig.js';
import crypto from 'crypto';

/**
 * Token cache entry structure for Google
 */
export interface GoogleTokenCacheEntry {
  accessToken: string;
  refreshToken?: string;
  expiresOn: Date;
  scopes: string[];
  idToken?: string;
  tokenType?: string;
}

export interface TokenInfo {
  iss?: string;
  sub?: string;
  azp?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  email?: string;
  email_verified?: boolean;
  scopes?: string[];
  expiry_date?: number;
}

/**
 * Google OAuth2 Authentication Provider
 * Handles OAuth2 authorization code flow with PKCE for Google APIs
 */
export class GoogleAuthProvider {
  private oauth2Client: any; // Using any to avoid type conflicts between google-auth-library and googleapis
  private readonly logger: Logger;
  private currentTokens: Credentials | null = null;
  private pkceVerifier: string | null = null;
  private pkceChallenge: string | null = null;

  constructor(
    private readonly config: GoogleAuthConfig,
    logger: Logger
  ) {
    this.logger = logger;

    // Initialize OAuth2 client
    this.oauth2Client = new google.auth.OAuth2(
      config.getClientId(),
      config.getClientSecret(),
      config.getRedirectUri()
    );
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private generatePKCE(): { verifier: string; challenge: string } {
    // Generate code verifier (43-128 characters)
    const verifier = crypto.randomBytes(32).toString('base64url');

    // Generate code challenge from verifier
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    this.pkceVerifier = verifier;
    this.pkceChallenge = challenge;

    return { verifier, challenge };
  }

  /**
   * Get authorization URL for user login
   */
  async getAuthorizationUrl(
    scopes: string[] = GoogleAuthConfig.getDefaultScopes(),
    state?: string
  ): Promise<string> {
    try {
      const { challenge } = this.generatePKCE();

      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'select_account',
        state: state || crypto.randomBytes(16).toString('base64url'),
        code_challenge: challenge,
        code_challenge_method: 'S256' as any,
      });

      this.logger.info('Generated Google authorization URL with PKCE');
      return authUrl;
    } catch (error) {
      this.logger.error('Failed to generate Google authorization URL', error);
      throw error;
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  async acquireTokenByCode(
    code: string,
    scopes: string[] = GoogleAuthConfig.getDefaultScopes()
  ): Promise<GoogleTokenCacheEntry> {
    try {
      if (!this.pkceVerifier) {
        throw new Error('PKCE verifier not found. Must call getAuthorizationUrl first.');
      }

      const { tokens } = await this.oauth2Client.getToken({
        code,
        codeVerifier: this.pkceVerifier,
      } as any);

      this.oauth2Client.setCredentials(tokens);
      this.currentTokens = tokens;

      // Clear PKCE values after use
      this.pkceVerifier = null;
      this.pkceChallenge = null;

      this.logger.info('Successfully exchanged authorization code for tokens');

      return this.tokensToCache(tokens, scopes);
    } catch (error) {
      this.logger.error('Failed to exchange authorization code', error);
      throw error;
    }
  }

  /**
   * Acquire token silently using refresh token
   */
  async acquireTokenSilent(
    refreshToken: string,
    scopes: string[] = GoogleAuthConfig.getDefaultScopes()
  ): Promise<GoogleTokenCacheEntry> {
    try {
      this.oauth2Client.setCredentials({ refresh_token: refreshToken });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      this.currentTokens = credentials;

      this.logger.debug('Successfully refreshed access token');

      return this.tokensToCache(credentials, scopes);
    } catch (error) {
      this.logger.error('Failed to refresh token silently', error);
      throw error;
    }
  }

  /**
   * Get current access token
   */
  async getAccessToken(): Promise<string | null> {
    if (!this.currentTokens || !this.currentTokens.access_token) {
      return null;
    }

    // Check if token is expired
    if (this.currentTokens.expiry_date && Date.now() >= this.currentTokens.expiry_date) {
      if (this.currentTokens.refresh_token) {
        try {
          const refreshed = await this.acquireTokenSilent(
            this.currentTokens.refresh_token,
            GoogleAuthConfig.getDefaultScopes()
          );
          return refreshed.accessToken;
        } catch (error) {
          this.logger.error('Token refresh failed', error);
          return null;
        }
      }
      return null;
    }

    return this.currentTokens.access_token;
  }

  /**
   * Verify ID token
   */
  async verifyIdToken(idToken: string): Promise<TokenInfo | null> {
    try {
      const ticket = await this.oauth2Client.verifyIdToken({
        idToken,
        audience: this.config.getClientId(),
      });

      const payload = ticket.getPayload();
      if (!payload) return null;
      
      return {
        ...payload,
        scopes: [],
        expiry_date: payload.exp ? payload.exp * 1000 : undefined
      } as TokenInfo;
    } catch (error) {
      this.logger.error('Failed to verify ID token', error);
      return null;
    }
  }

  /**
   * Clear cached tokens
   */
  clearTokenCache(): void {
    this.currentTokens = null;
    this.oauth2Client.setCredentials({});
    this.logger.info('Token cache cleared');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentTokens !== null && 
           this.currentTokens.access_token !== undefined &&
           (this.currentTokens.expiry_date === undefined || 
            Date.now() < this.currentTokens.expiry_date!);
  }

  /**
   * Get OAuth2 client instance
   */
  getOAuth2Client(): any {
    return this.oauth2Client;
  }

  /**
   * Convert Google credentials to cache entry
   */
  private tokensToCache(
    tokens: Credentials,
    scopes: string[]
  ): GoogleTokenCacheEntry {
    const expiresOn = tokens.expiry_date 
      ? new Date(tokens.expiry_date)
      : new Date(Date.now() + 3600 * 1000); // Default 1 hour

    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token || undefined,
      expiresOn,
      scopes,
      idToken: tokens.id_token || undefined,
      tokenType: tokens.token_type || 'Bearer',
    };
  }

  /**
   * Set credentials directly (for testing or manual configuration)
   */
  setCredentials(tokens: Credentials): void {
    this.oauth2Client.setCredentials(tokens);
    this.currentTokens = tokens;
  }
}