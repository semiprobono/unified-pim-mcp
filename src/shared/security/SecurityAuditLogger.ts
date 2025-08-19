import { Logger } from '../logging/Logger.js';
import { SecurityManager } from './SecurityManager.js';
import crypto from 'crypto';

/**
 * Security event types for audit logging
 */
export enum SecurityEventType {
  // Authentication Events
  AUTH_SUCCESS = 'AUTH_SUCCESS',
  AUTH_FAILURE = 'AUTH_FAILURE',
  AUTH_TOKEN_REFRESH = 'AUTH_TOKEN_REFRESH',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_LOGOUT = 'AUTH_LOGOUT',

  // Authorization Events
  AUTHZ_SUCCESS = 'AUTHZ_SUCCESS',
  AUTHZ_FAILURE = 'AUTHZ_FAILURE',
  AUTHZ_PRIVILEGE_ESCALATION = 'AUTHZ_PRIVILEGE_ESCALATION',

  // Data Access Events
  DATA_ACCESS = 'DATA_ACCESS',
  DATA_MODIFICATION = 'DATA_MODIFICATION',
  DATA_DELETION = 'DATA_DELETION',
  DATA_EXPORT = 'DATA_EXPORT',

  // Security Events
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  CSRF_ATTACK_DETECTED = 'CSRF_ATTACK_DETECTED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',

  // System Events
  SYSTEM_STARTUP = 'SYSTEM_STARTUP',
  SYSTEM_SHUTDOWN = 'SYSTEM_SHUTDOWN',
  CONFIG_CHANGE = 'CONFIG_CHANGE',
  KEY_ROTATION = 'KEY_ROTATION',

  // Error Events
  ENCRYPTION_FAILURE = 'ENCRYPTION_FAILURE',
  DECRYPTION_FAILURE = 'DECRYPTION_FAILURE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
}

/**
 * Security event severity levels
 */
export enum SecurityEventSeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  INFO = 'INFO',
}

/**
 * Security audit event structure
 */
export interface SecurityAuditEvent {
  eventId: string;
  timestamp: Date;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  userId?: string;
  sessionId?: string;
  clientId?: string;
  ipAddress?: string;
  userAgent?: string;
  resource?: string;
  action?: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'UNKNOWN';
  message: string;
  details?: Record<string, any>;
  riskScore?: number;
  correlationId?: string;
}

/**
 * Security audit configuration
 */
export interface SecurityAuditConfig {
  enabled: boolean;
  logLevel: SecurityEventSeverity;
  retentionDays: number;
  encryptLogs: boolean;
  realTimeAlerts: boolean;
  anomalyDetection: boolean;
  exportEnabled: boolean;
}

/**
 * Comprehensive security audit logging system
 * Implements OWASP audit logging guidelines
 */
export class SecurityAuditLogger {
  private readonly logger: Logger;
  private readonly securityManager: SecurityManager;
  private readonly config: SecurityAuditConfig;
  private readonly auditEvents: SecurityAuditEvent[] = [];
  private readonly eventCounts: Map<string, number> = new Map();
  private readonly suspiciousPatterns: Map<string, number> = new Map();

  constructor(
    logger: Logger,
    securityManager: SecurityManager,
    config: Partial<SecurityAuditConfig> = {}
  ) {
    this.logger = logger;
    this.securityManager = securityManager;
    this.config = {
      enabled: true,
      logLevel: SecurityEventSeverity.INFO,
      retentionDays: 365,
      encryptLogs: true,
      realTimeAlerts: true,
      anomalyDetection: true,
      exportEnabled: false,
      ...config,
    };

    this.startCleanupInterval();
    this.startAnomalyDetection();
  }

  /**
   * Log a security audit event
   */
  async logSecurityEvent(event: Omit<SecurityAuditEvent, 'eventId' | 'timestamp'>): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // Filter by severity level
    if (!this.shouldLogEvent(event.severity)) {
      return;
    }

    const auditEvent: SecurityAuditEvent = {
      eventId: this.generateEventId(),
      timestamp: new Date(),
      ...event,
    };

    try {
      // Calculate risk score
      auditEvent.riskScore = this.calculateRiskScore(auditEvent);

      // Store in memory for analysis
      this.auditEvents.push(auditEvent);

      // Update event counts for anomaly detection
      this.updateEventCounts(auditEvent);

      // Log to standard logger
      this.logToLogger(auditEvent);

      // Store encrypted audit log
      if (this.config.encryptLogs) {
        await this.storeEncryptedEvent(auditEvent);
      }

      // Real-time alerting
      if (this.config.realTimeAlerts && this.isHighRiskEvent(auditEvent)) {
        await this.sendRealTimeAlert(auditEvent);
      }

      // Anomaly detection
      if (this.config.anomalyDetection) {
        await this.detectAnomalies(auditEvent);
      }
    } catch (error) {
      this.logger.error('Failed to log security event', error);
    }
  }

  /**
   * Log authentication success
   */
  async logAuthSuccess(userId: string, context: Record<string, any> = {}): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.AUTH_SUCCESS,
      severity: SecurityEventSeverity.INFO,
      userId,
      outcome: 'SUCCESS',
      message: 'User authentication successful',
      details: context,
      ...this.extractRequestContext(context),
    });
  }

  /**
   * Log authentication failure
   */
  async logAuthFailure(
    userId: string,
    reason: string,
    context: Record<string, any> = {}
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.AUTH_FAILURE,
      severity: SecurityEventSeverity.HIGH,
      userId,
      outcome: 'FAILURE',
      message: `Authentication failed: ${reason}`,
      details: { reason, ...context },
      ...this.extractRequestContext(context),
    });
  }

  /**
   * Log rate limit exceeded
   */
  async logRateLimitExceeded(clientId: string, context: Record<string, any> = {}): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
      severity: SecurityEventSeverity.MEDIUM,
      clientId,
      outcome: 'FAILURE',
      message: 'Rate limit exceeded',
      details: context,
      ...this.extractRequestContext(context),
    });
  }

  /**
   * Log CSRF attack detection
   */
  async logCSRFAttack(context: Record<string, any> = {}): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.CSRF_ATTACK_DETECTED,
      severity: SecurityEventSeverity.CRITICAL,
      outcome: 'FAILURE',
      message: 'Possible CSRF attack detected',
      details: context,
      ...this.extractRequestContext(context),
    });
  }

  /**
   * Log suspicious activity
   */
  async logSuspiciousActivity(
    description: string,
    context: Record<string, any> = {}
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
      severity: SecurityEventSeverity.HIGH,
      outcome: 'UNKNOWN',
      message: `Suspicious activity detected: ${description}`,
      details: context,
      ...this.extractRequestContext(context),
    });
  }

  /**
   * Log data access
   */
  async logDataAccess(
    userId: string,
    resource: string,
    action: string,
    context: Record<string, any> = {}
  ): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.DATA_ACCESS,
      severity: SecurityEventSeverity.INFO,
      userId,
      resource,
      action,
      outcome: 'SUCCESS',
      message: `Data access: ${action} on ${resource}`,
      details: context,
      ...this.extractRequestContext(context),
    });
  }

  /**
   * Log key rotation event
   */
  async logKeyRotation(context: Record<string, any> = {}): Promise<void> {
    await this.logSecurityEvent({
      eventType: SecurityEventType.KEY_ROTATION,
      severity: SecurityEventSeverity.HIGH,
      outcome: 'SUCCESS',
      message: 'Encryption key rotation performed',
      details: context,
    });
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(6).toString('hex');
    return `${timestamp}-${random}`;
  }

  /**
   * Check if event should be logged based on severity
   */
  private shouldLogEvent(severity: SecurityEventSeverity): boolean {
    const severityLevels = [
      SecurityEventSeverity.CRITICAL,
      SecurityEventSeverity.HIGH,
      SecurityEventSeverity.MEDIUM,
      SecurityEventSeverity.LOW,
      SecurityEventSeverity.INFO,
    ];

    const configLevel = severityLevels.indexOf(this.config.logLevel);
    const eventLevel = severityLevels.indexOf(severity);

    return eventLevel <= configLevel;
  }

  /**
   * Calculate risk score for an event
   */
  private calculateRiskScore(event: SecurityAuditEvent): number {
    let score = 0;

    // Base score by event type
    const eventTypeScores: Record<SecurityEventType, number> = {
      [SecurityEventType.AUTH_FAILURE]: 30,
      [SecurityEventType.AUTHZ_FAILURE]: 25,
      [SecurityEventType.CSRF_ATTACK_DETECTED]: 90,
      [SecurityEventType.RATE_LIMIT_EXCEEDED]: 20,
      [SecurityEventType.SUSPICIOUS_ACTIVITY]: 50,
      [SecurityEventType.AUTHZ_PRIVILEGE_ESCALATION]: 80,
      [SecurityEventType.DATA_DELETION]: 40,
      [SecurityEventType.ENCRYPTION_FAILURE]: 60,
      [SecurityEventType.AUTH_SUCCESS]: 0,
      [SecurityEventType.AUTH_TOKEN_REFRESH]: 5,
      [SecurityEventType.AUTH_TOKEN_EXPIRED]: 10,
      [SecurityEventType.AUTH_LOGOUT]: 0,
      [SecurityEventType.AUTHZ_SUCCESS]: 0,
      [SecurityEventType.DATA_ACCESS]: 5,
      [SecurityEventType.DATA_MODIFICATION]: 15,
      [SecurityEventType.DATA_EXPORT]: 25,
      [SecurityEventType.SECURITY_VIOLATION]: 70,
      [SecurityEventType.SYSTEM_STARTUP]: 5,
      [SecurityEventType.SYSTEM_SHUTDOWN]: 10,
      [SecurityEventType.CONFIG_CHANGE]: 30,
      [SecurityEventType.KEY_ROTATION]: 10,
      [SecurityEventType.DECRYPTION_FAILURE]: 40,
      [SecurityEventType.NETWORK_ERROR]: 15,
      [SecurityEventType.API_ERROR]: 10,
    };

    score += eventTypeScores[event.eventType] || 0;

    // Severity multiplier
    const severityMultipliers: Record<SecurityEventSeverity, number> = {
      [SecurityEventSeverity.CRITICAL]: 2.0,
      [SecurityEventSeverity.HIGH]: 1.5,
      [SecurityEventSeverity.MEDIUM]: 1.0,
      [SecurityEventSeverity.LOW]: 0.7,
      [SecurityEventSeverity.INFO]: 0.3,
    };

    score *= severityMultipliers[event.severity];

    // Outcome adjustment
    if (event.outcome === 'FAILURE') {
      score *= 1.5;
    }

    // Repeated events from same source increase risk
    const eventKey = `${event.eventType}-${event.clientId || event.ipAddress}`;
    const count = this.eventCounts.get(eventKey) || 0;
    if (count > 5) {
      score *= 1.2; // 20% increase for repeated events
    }

    return Math.min(100, Math.max(0, score));
  }

  /**
   * Check if event is high risk requiring immediate attention
   */
  private isHighRiskEvent(event: SecurityAuditEvent): boolean {
    return Boolean(event.riskScore && event.riskScore >= 70);
  }

  /**
   * Extract request context from event details
   */
  private extractRequestContext(context: Record<string, any>): Partial<SecurityAuditEvent> {
    return {
      ipAddress: context.ipAddress || context.ip,
      userAgent: context.userAgent,
      sessionId: context.sessionId,
      correlationId: context.correlationId,
    };
  }

  /**
   * Update event counts for anomaly detection
   */
  private updateEventCounts(event: SecurityAuditEvent): void {
    const eventKey = `${event.eventType}-${event.clientId || event.ipAddress}`;
    const currentCount = this.eventCounts.get(eventKey) || 0;
    this.eventCounts.set(eventKey, currentCount + 1);
  }

  /**
   * Log event to standard logger
   */
  private logToLogger(event: SecurityAuditEvent): void {
    const logMessage = `[SECURITY] ${event.eventType}: ${event.message}`;
    const logContext = {
      eventId: event.eventId,
      severity: event.severity,
      outcome: event.outcome,
      riskScore: event.riskScore,
      userId: event.userId,
      ipAddress: event.ipAddress,
    };

    switch (event.severity) {
      case SecurityEventSeverity.CRITICAL:
        this.logger.error(logMessage, logContext);
        break;
      case SecurityEventSeverity.HIGH:
        this.logger.error(logMessage, logContext);
        break;
      case SecurityEventSeverity.MEDIUM:
        this.logger.warn(logMessage, logContext);
        break;
      case SecurityEventSeverity.LOW:
        this.logger.info(logMessage, logContext);
        break;
      case SecurityEventSeverity.INFO:
        this.logger.debug(logMessage, logContext);
        break;
    }
  }

  /**
   * Store encrypted audit event
   */
  private async storeEncryptedEvent(event: SecurityAuditEvent): Promise<void> {
    const storageKey = `audit_${event.eventId}`;
    await this.securityManager.storeSecureData(storageKey, event);
  }

  /**
   * Send real-time alert for high-risk events
   */
  private async sendRealTimeAlert(event: SecurityAuditEvent): Promise<void> {
    // Implementation would integrate with alerting system (email, Slack, etc.)
    this.logger.error(`[SECURITY ALERT] High-risk event detected: ${event.message}`, {
      eventId: event.eventId,
      riskScore: event.riskScore,
      eventType: event.eventType,
    });
  }

  /**
   * Detect anomalies in security events
   */
  private async detectAnomalies(event: SecurityAuditEvent): Promise<void> {
    // Simple pattern-based anomaly detection
    const patternKey = `${event.eventType}-${event.userId || event.clientId}`;
    const patternCount = this.suspiciousPatterns.get(patternKey) || 0;

    // Check for suspicious patterns
    if (event.eventType === SecurityEventType.AUTH_FAILURE && patternCount > 5) {
      await this.logSuspiciousActivity('Multiple authentication failures', {
        pattern: patternKey,
        count: patternCount,
        threshold: 5,
      });
    }

    this.suspiciousPatterns.set(patternKey, patternCount + 1);
  }

  /**
   * Start cleanup interval for old events
   */
  private startCleanupInterval(): void {
    setInterval(
      () => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

        // Remove old events from memory
        const eventsToKeep = this.auditEvents.filter(event => event.timestamp > cutoffDate);
        this.auditEvents.length = 0;
        this.auditEvents.push(...eventsToKeep);

        // Clear old event counts
        for (const [key, _] of this.eventCounts.entries()) {
          // Reset counts daily
          if (Math.random() < 0.1) {
            // 10% chance to reset any given counter
            this.eventCounts.delete(key);
          }
        }
      },
      24 * 60 * 60 * 1000
    ); // Daily cleanup
  }

  /**
   * Start anomaly detection background process
   */
  private startAnomalyDetection(): void {
    if (!this.config.anomalyDetection) {
      return;
    }

    setInterval(
      () => {
        // Reset suspicious patterns periodically
        for (const [key, count] of this.suspiciousPatterns.entries()) {
          if (count > 0) {
            this.suspiciousPatterns.set(key, Math.max(0, count - 1));
          }
        }
      },
      60 * 60 * 1000
    ); // Hourly decay
  }

  /**
   * Get audit statistics
   */
  getAuditStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    highRiskEvents: number;
    averageRiskScore: number;
  } {
    const stats = {
      totalEvents: this.auditEvents.length,
      eventsByType: {} as Record<string, number>,
      eventsBySeverity: {} as Record<string, number>,
      highRiskEvents: 0,
      averageRiskScore: 0,
    };

    let totalRiskScore = 0;

    for (const event of this.auditEvents) {
      // Count by type
      stats.eventsByType[event.eventType] = (stats.eventsByType[event.eventType] || 0) + 1;

      // Count by severity
      stats.eventsBySeverity[event.severity] = (stats.eventsBySeverity[event.severity] || 0) + 1;

      // High risk events
      if (event.riskScore && event.riskScore >= 70) {
        stats.highRiskEvents++;
      }

      // Risk score calculation
      totalRiskScore += event.riskScore || 0;
    }

    stats.averageRiskScore = stats.totalEvents > 0 ? totalRiskScore / stats.totalEvents : 0;

    return stats;
  }

  /**
   * Export audit logs (for compliance)
   */
  async exportAuditLogs(startDate: Date, endDate: Date): Promise<SecurityAuditEvent[]> {
    if (!this.config.exportEnabled) {
      throw new Error('Audit log export is disabled');
    }

    return this.auditEvents.filter(
      event => event.timestamp >= startDate && event.timestamp <= endDate
    );
  }

  /**
   * Dispose audit logger
   */
  dispose(): void {
    this.auditEvents.length = 0;
    this.eventCounts.clear();
    this.suspiciousPatterns.clear();
  }
}
