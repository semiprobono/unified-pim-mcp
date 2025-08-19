import { Platform } from '../value-objects/Platform.js';

/**
 * Token types
 */
export type TokenType = 'access' | 'refresh' | 'id' | 'api_key' | 'session';

/**
 * Token information
 */
export interface TokenInfo {
  type: TokenType;
  token: string;
  expiresAt?: Date;
  issuedAt: Date;
  scope?: string[];
  audience?: string;
  issuer?: string;
  subject?: string;
  metadata?: Record<string, any>;
}

/**
 * Token storage entry
 */
export interface TokenStorageEntry {
  platform: Platform;
  tokenType: TokenType;
  encryptedToken: string;
  expiresAt?: Date;
  issuedAt: Date;
  lastRefreshed?: Date;
  refreshCount: number;
  metadata?: Record<string, any>;
}

/**
 * Authentication context
 */
export interface AuthContext {
  platform: Platform;
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  scopes: string[];
  authMethod: 'oauth2' | 'api_key' | 'basic' | 'certificate';
  isAuthenticated: boolean;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * OAuth configuration
 */
export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  tenantId?: string;
  authorizeUrl: string;
  tokenUrl: string;
  redirectUri: string;
  scopes: string[];
  responseType?: string;
  grantType?: string;
  pkce?: boolean;
  state?: string;
  customParameters?: Record<string, string>;
}

/**
 * Token manager interface
 */
export interface TokenManagerPort {
  // Token storage operations
  storeToken(
    platform: Platform,
    tokenType: TokenType,
    token: string,
    expiresAt?: Date
  ): Promise<void>;
  getToken(platform: Platform, tokenType: TokenType): Promise<string | null>;
  removeToken(platform: Platform, tokenType: TokenType): Promise<boolean>;
  removeAllTokens(platform: Platform): Promise<void>;

  // Token validation
  isTokenValid(platform: Platform, tokenType: TokenType): Promise<boolean>;
  getTokenExpiry(platform: Platform, tokenType: TokenType): Promise<Date | null>;
  isTokenExpired(platform: Platform, tokenType: TokenType): Promise<boolean>;
  isTokenExpiringSoon(
    platform: Platform,
    tokenType: TokenType,
    bufferMinutes?: number
  ): Promise<boolean>;

  // Token refresh
  refreshToken(platform: Platform): Promise<boolean>;
  refreshTokenIfNeeded(platform: Platform, bufferMinutes?: number): Promise<boolean>;

  // Token information
  getTokenInfo(platform: Platform, tokenType: TokenType): Promise<TokenStorageEntry | null>;
  listTokens(platform?: Platform): Promise<TokenStorageEntry[]>;

  // Health and maintenance
  cleanupExpiredTokens(): Promise<number>;
  getStats(): Promise<{
    totalTokens: number;
    expiredTokens: number;
    expiringTokens: number;
    byPlatform: Record<Platform, number>;
  }>;
}

/**
 * Encryption service interface
 */
export interface EncryptionPort {
  // Basic encryption/decryption
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;

  // Binary data encryption
  encryptBuffer(buffer: Buffer): Promise<Buffer>;
  decryptBuffer(buffer: Buffer): Promise<Buffer>;

  // Key management
  rotateKey(): Promise<void>;
  getKeyInfo(): Promise<{
    id: string;
    algorithm: string;
    createdAt: Date;
    rotatedAt?: Date;
  }>;

  // Hashing
  hash(data: string): Promise<string>;
  verifyHash(data: string, hash: string): Promise<boolean>;

  // Digital signatures
  sign(data: string): Promise<string>;
  verifySignature(data: string, signature: string): Promise<boolean>;

  // Random generation
  generateSecureRandom(length: number): Promise<string>;
  generateUUID(): Promise<string>;
}

/**
 * Encrypted storage interface
 */
export interface EncryptedStoragePort {
  // Basic operations
  set(key: string, value: any): Promise<void>;
  get<T>(key: string): Promise<T | null>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;

  // Batch operations
  setMany(entries: Record<string, any>): Promise<void>;
  getMany<T>(keys: string[]): Promise<(T | null)[]>;
  deleteMany(keys: string[]): Promise<number>;

  // Metadata
  keys(pattern?: string): Promise<string[]>;
  clear(): Promise<void>;
  size(): Promise<number>;

  // Security
  backup(path: string): Promise<void>;
  restore(path: string): Promise<void>;
  verifyIntegrity(): Promise<boolean>;

  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Authentication manager interface
 */
export interface AuthenticationManagerPort {
  // Authentication flow
  initiateAuth(
    platform: Platform,
    config: OAuthConfig
  ): Promise<{
    authUrl: string;
    state: string;
    codeVerifier?: string;
  }>;

  handleCallback(
    platform: Platform,
    code: string,
    state: string,
    codeVerifier?: string
  ): Promise<AuthContext>;

  // Token exchange
  exchangeCodeForTokens(
    platform: Platform,
    code: string,
    config: OAuthConfig,
    codeVerifier?: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    idToken?: string;
    expiresIn?: number;
    tokenType?: string;
    scope?: string;
  }>;

  // Authentication status
  isAuthenticated(platform: Platform): Promise<boolean>;
  getAuthContext(platform: Platform): Promise<AuthContext | null>;

  // Logout
  logout(platform: Platform): Promise<void>;
  logoutAll(): Promise<void>;

  // User information
  getUserInfo(platform: Platform): Promise<{
    id?: string;
    email?: string;
    name?: string;
    picture?: string;
    metadata?: Record<string, any>;
  } | null>;

  // Scope management
  hasScope(platform: Platform, scope: string): Promise<boolean>;
  getScopes(platform: Platform): Promise<string[]>;
  requestAdditionalScopes(platform: Platform, scopes: string[]): Promise<boolean>;
}

/**
 * Access control interface
 */
export interface AccessControlPort {
  // Permission checking
  hasPermission(context: AuthContext, resource: string, action: string): Promise<boolean>;

  // Role-based access control
  hasRole(context: AuthContext, role: string): Promise<boolean>;
  getRoles(context: AuthContext): Promise<string[]>;

  // Resource access
  canAccessResource(
    context: AuthContext,
    resourceType: 'email' | 'calendar' | 'contact' | 'task' | 'file',
    resourceId: string,
    action: 'read' | 'write' | 'delete' | 'share'
  ): Promise<boolean>;

  // Audit logging
  logAccess(
    context: AuthContext,
    resource: string,
    action: string,
    success: boolean,
    metadata?: Record<string, any>
  ): Promise<void>;

  // Security policies
  enforcePolicy(
    context: AuthContext,
    policyName: string,
    data?: any
  ): Promise<{
    allowed: boolean;
    reason?: string;
    modifications?: any;
  }>;
}

/**
 * Security audit interface
 */
export interface SecurityAuditPort {
  // Audit logging
  logEvent(event: {
    type: 'auth' | 'access' | 'data' | 'system';
    action: string;
    userId?: string;
    platform?: Platform;
    resource?: string;
    success: boolean;
    error?: string;
    metadata?: Record<string, any>;
    timestamp?: Date;
  }): Promise<void>;

  // Query audit logs
  queryLogs(criteria: {
    type?: string[];
    action?: string[];
    userId?: string;
    platform?: Platform;
    dateRange?: { start: Date; end: Date };
    success?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<
    Array<{
      id: string;
      type: string;
      action: string;
      userId?: string;
      platform?: Platform;
      resource?: string;
      success: boolean;
      error?: string;
      metadata?: Record<string, any>;
      timestamp: Date;
    }>
  >;

  // Security reports
  generateSecurityReport(options: {
    dateRange: { start: Date; end: Date };
    includeFailedLogins?: boolean;
    includePermissionDenials?: boolean;
    includeDataAccess?: boolean;
    format?: 'json' | 'csv';
  }): Promise<{
    summary: {
      totalEvents: number;
      successfulEvents: number;
      failedEvents: number;
      uniqueUsers: number;
      topActions: Array<{ action: string; count: number }>;
    };
    details?: any[];
  }>;

  // Anomaly detection
  detectAnomalies(
    userId?: string,
    platform?: Platform
  ): Promise<
    Array<{
      type:
        | 'unusual_access_time'
        | 'unusual_location'
        | 'excessive_requests'
        | 'permission_escalation';
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      userId?: string;
      platform?: Platform;
      timestamp: Date;
      metadata?: Record<string, any>;
    }>
  >;

  // Compliance
  getComplianceStatus(): Promise<{
    dataRetentionCompliant: boolean;
    encryptionCompliant: boolean;
    accessControlCompliant: boolean;
    auditTrailCompliant: boolean;
    issues: string[];
  }>;
}

/**
 * Security configuration
 */
export interface SecurityConfig {
  encryption: {
    algorithm: 'AES-256-GCM' | 'AES-256-CBC';
    keyRotationInterval?: number; // days
    keyDerivationIterations?: number;
  };

  tokenStorage: {
    storageType: 'file' | 'registry' | 'keyring';
    storagePath?: string;
    encryptionEnabled: boolean;
  };

  authentication: {
    tokenRefreshBuffer: number; // minutes
    maxTokenAge: number; // hours
    requireMFA?: boolean;
    allowedAuthMethods: ('oauth2' | 'api_key' | 'basic')[];
  };

  accessControl: {
    defaultDenyAll: boolean;
    roleBasedAccess: boolean;
    resourceBasedAccess: boolean;
    sessionTimeout: number; // minutes
  };

  audit: {
    enabled: boolean;
    retentionPeriod: number; // days
    logLevel: 'minimal' | 'standard' | 'detailed';
    realTimeAlerts: boolean;
  };

  compliance: {
    gdprCompliance: boolean;
    hipaaCompliance: boolean;
    soc2Compliance: boolean;
    dataResidency?: string; // country code
  };
}

/**
 * Security error types
 */
export enum SecurityErrorType {
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  AUTHORIZATION_DENIED = 'AUTHORIZATION_DENIED',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  ENCRYPTION_FAILED = 'ENCRYPTION_FAILED',
  DECRYPTION_FAILED = 'DECRYPTION_FAILED',
  KEY_ROTATION_FAILED = 'KEY_ROTATION_FAILED',
  STORAGE_ACCESS_DENIED = 'STORAGE_ACCESS_DENIED',
  POLICY_VIOLATION = 'POLICY_VIOLATION',
  AUDIT_FAILURE = 'AUDIT_FAILURE',
  UNKNOWN_SECURITY_ERROR = 'UNKNOWN_SECURITY_ERROR',
}

/**
 * Security error class
 */
export class SecurityError extends Error {
  constructor(
    public readonly type: SecurityErrorType,
    message: string,
    public readonly platform?: Platform,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Security event types
 */
export interface SecurityEvents {
  authSuccess: { platform: Platform; userId?: string };
  authFailure: { platform: Platform; error: string };
  tokenRefresh: { platform: Platform; success: boolean };
  tokenExpired: { platform: Platform; tokenType: TokenType };
  accessDenied: { platform: Platform; resource: string; action: string };
  policyViolation: { platform: Platform; policy: string; details: any };
  securityAnomaly: { type: string; severity: string; details: any };
  keyRotation: { success: boolean; error?: string };
  auditEvent: { type: string; details: any };
}

/**
 * Security event emitter interface
 */
export interface SecurityEventEmitter {
  on<K extends keyof SecurityEvents>(event: K, listener: (data: SecurityEvents[K]) => void): void;
  off<K extends keyof SecurityEvents>(event: K, listener: (data: SecurityEvents[K]) => void): void;
  emit<K extends keyof SecurityEvents>(event: K, data: SecurityEvents[K]): void;
}
