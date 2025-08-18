import { Configuration, LogLevel } from '@azure/msal-node';
import { Logger } from '../../../../shared/logging/Logger.js';

/**
 * MSAL configuration for Microsoft Graph authentication
 * Implements OAuth2 authorization code flow with PKCE
 */
export class MsalConfig {
  private readonly logger: Logger;
  private config: Configuration;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string | undefined,
    private readonly tenantId: string,
    private readonly redirectUri: string,
    logger: Logger
  ) {
    this.logger = logger;
    this.config = this.createConfiguration();
  }

  /**
   * Creates MSAL configuration with PKCE support
   */
  private createConfiguration(): Configuration {
    const auth = this.clientSecret ? {
      clientId: this.clientId,
      authority: `https://login.microsoftonline.com/${this.tenantId}`,
      clientSecret: this.clientSecret,
    } : {
      clientId: this.clientId,
      authority: `https://login.microsoftonline.com/${this.tenantId}`,
    };

    return {
      auth,
      system: {
        loggerOptions: {
          loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
            if (containsPii) {
              return;
            }
            switch (level) {
              case LogLevel.Error:
                this.logger.error(`MSAL: ${message}`);
                break;
              case LogLevel.Warning:
                this.logger.warn(`MSAL: ${message}`);
                break;
              case LogLevel.Info:
                this.logger.info(`MSAL: ${message}`);
                break;
              case LogLevel.Verbose:
                this.logger.debug(`MSAL: ${message}`);
                break;
            }
          },
          piiLoggingEnabled: false,
          logLevel: LogLevel.Info,
        },
        networkClient: undefined, // Will use default
        proxyUrl: process.env.HTTPS_PROXY || undefined,
      },
      cache: {
        cachePlugin: undefined, // We'll handle caching externally via TokenManager
      },
    };
  }

  /**
   * Get the MSAL configuration
   */
  getConfiguration(): Configuration {
    return this.config;
  }

  /**
   * Get default Graph API scopes
   */
  static getDefaultScopes(): string[] {
    return [
      'https://graph.microsoft.com/User.Read',
      'https://graph.microsoft.com/Mail.ReadWrite',
      'https://graph.microsoft.com/Mail.Send',
      'https://graph.microsoft.com/Calendars.ReadWrite',
      'https://graph.microsoft.com/Contacts.ReadWrite',
      'https://graph.microsoft.com/Tasks.ReadWrite',
      'https://graph.microsoft.com/Files.ReadWrite.All',
      'offline_access', // Required for refresh tokens
    ];
  }

  /**
   * Get scope URL for specific permissions
   */
  static getScopeUrl(permission: string): string {
    if (permission.startsWith('https://')) {
      return permission;
    }
    return `https://graph.microsoft.com/${permission}`;
  }

  /**
   * Validate tenant ID format
   */
  static isValidTenantId(tenantId: string): boolean {
    // Common tenant IDs
    if (['common', 'organizations', 'consumers'].includes(tenantId)) {
      return true;
    }
    // GUID format validation
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return guidRegex.test(tenantId);
  }

  /**
   * Get redirect URI for different environments
   */
  static getRedirectUri(environment: 'development' | 'production' = 'development'): string {
    if (environment === 'production') {
      return process.env.AZURE_REDIRECT_URI || 'https://localhost:3000/auth/callback';
    }
    return process.env.AZURE_REDIRECT_URI || 'http://localhost:3000/auth/callback';
  }

  /**
   * Get the Graph API base URL
   */
  static getGraphApiBaseUrl(): string {
    return process.env.GRAPH_API_BASE_URL || 'https://graph.microsoft.com/v1.0';
  }

  /**
   * Get the beta Graph API base URL for features not in v1.0
   */
  static getGraphApiBetaUrl(): string {
    return process.env.GRAPH_API_BETA_URL || 'https://graph.microsoft.com/beta';
  }
}