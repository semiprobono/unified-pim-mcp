/**
 * Google OAuth2 Configuration
 * Manages Google authentication settings and scopes
 */
export class GoogleAuthConfig {
  private readonly clientId: string;
  private readonly clientSecret?: string;
  private readonly redirectUri: string;
  private readonly scopes: string[];

  constructor() {
    // Load Google OAuth2 configuration from environment
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';

    // Define required scopes for all Google services
    this.scopes = [
      // Gmail scopes
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.send',
      
      // Calendar scopes
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      
      // People/Contacts scopes
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
      
      // Tasks scopes
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/tasks.readonly',
      
      // Drive scopes
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      
      // OpenID Connect
      'openid',
      'profile',
      'email',
    ];

    this.validateConfiguration();
  }

  /**
   * Validate configuration
   */
  private validateConfiguration(): void {
    if (!this.clientId) {
      throw new Error('GOOGLE_CLIENT_ID is required but not configured');
    }

    if (!this.redirectUri) {
      throw new Error('GOOGLE_REDIRECT_URI is required but not configured');
    }
  }

  /**
   * Get client ID
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Get client secret
   */
  getClientSecret(): string | undefined {
    return this.clientSecret;
  }

  /**
   * Get redirect URI
   */
  getRedirectUri(): string {
    return this.redirectUri;
  }

  /**
   * Get configured scopes
   */
  getScopes(): string[] {
    return [...this.scopes];
  }

  /**
   * Get default scopes
   */
  static getDefaultScopes(): string[] {
    return [
      'openid',
      'profile',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/drive.file',
    ];
  }

  /**
   * Get Gmail-specific scopes
   */
  static getGmailScopes(): string[] {
    return [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.send',
    ];
  }

  /**
   * Get Calendar-specific scopes
   */
  static getCalendarScopes(): string[] {
    return [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];
  }

  /**
   * Get People/Contacts-specific scopes
   */
  static getPeopleScopes(): string[] {
    return [
      'https://www.googleapis.com/auth/contacts',
      'https://www.googleapis.com/auth/contacts.readonly',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ];
  }

  /**
   * Get Tasks-specific scopes
   */
  static getTasksScopes(): string[] {
    return [
      'https://www.googleapis.com/auth/tasks',
      'https://www.googleapis.com/auth/tasks.readonly',
    ];
  }

  /**
   * Get Drive-specific scopes
   */
  static getDriveScopes(): string[] {
    return [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ];
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  /**
   * Get API endpoints
   */
  static getApiEndpoints() {
    return {
      gmail: 'https://gmail.googleapis.com/gmail/v1',
      calendar: 'https://www.googleapis.com/calendar/v3',
      people: 'https://people.googleapis.com/v1',
      tasks: 'https://tasks.googleapis.com/tasks/v1',
      drive: 'https://www.googleapis.com/drive/v3',
      oauth2: 'https://oauth2.googleapis.com',
    };
  }
}