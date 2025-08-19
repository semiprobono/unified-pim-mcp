import { Logger } from '../logging/Logger.js';
import {
  SecurityAuditLogger,
  SecurityEventSeverity,
  SecurityEventType,
} from './SecurityAuditLogger.js';

/**
 * Azure AD security configuration validation
 */
export interface AzureSecurityConfig {
  clientId: string;
  tenantId: string;
  authority: string;
  redirectUri: string;
  clientSecret?: string;
  scopes: string[];
  environment: 'development' | 'staging' | 'production';
}

/**
 * Security validation result
 */
export interface SecurityValidationResult {
  valid: boolean;
  score: number;
  issues: SecurityIssue[];
  recommendations: SecurityRecommendation[];
  compliance: ComplianceStatus;
}

/**
 * Security issue details
 */
export interface SecurityIssue {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  description: string;
  fix: string;
  impact: string;
}

/**
 * Security recommendation
 */
export interface SecurityRecommendation {
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  category: string;
  description: string;
  implementation: string;
  benefit: string;
}

/**
 * Compliance status
 */
export interface ComplianceStatus {
  owasp: { score: number; issues: string[] };
  nist: { score: number; issues: string[] };
  gdpr: { score: number; issues: string[] };
  hipaa: { score: number; issues: string[] };
}

/**
 * Azure AD security configuration validator
 * Implements security best practices and compliance checks
 */
export class AzureSecurityValidator {
  private readonly logger: Logger;
  private readonly auditLogger?: SecurityAuditLogger;

  constructor(logger: Logger, auditLogger?: SecurityAuditLogger) {
    this.logger = logger;
    this.auditLogger = auditLogger;
  }

  /**
   * Validate Azure AD security configuration
   */
  async validateAzureConfiguration(config: AzureSecurityConfig): Promise<SecurityValidationResult> {
    const issues: SecurityIssue[] = [];
    const recommendations: SecurityRecommendation[] = [];
    let score = 100;

    // Log security validation start
    if (this.auditLogger) {
      await this.auditLogger.logSecurityEvent({
        eventType: SecurityEventType.CONFIG_CHANGE,
        severity: SecurityEventSeverity.INFO,
        outcome: 'SUCCESS',
        message: 'Azure AD security configuration validation started',
        details: { environment: config.environment },
      });
    }

    // 1. Validate Client ID
    const clientIdValidation = this.validateClientId(config.clientId);
    if (!clientIdValidation.valid) {
      issues.push({
        severity: 'CRITICAL',
        category: 'Authentication',
        description: 'Invalid or missing Azure Client ID',
        fix: 'Configure a valid GUID for AZURE_CLIENT_ID',
        impact: 'Authentication will fail completely',
      });
      score -= 25;
    }

    // 2. Validate Tenant ID
    const tenantValidation = this.validateTenantId(config.tenantId);
    if (!tenantValidation.valid) {
      issues.push({
        severity: 'CRITICAL',
        category: 'Authentication',
        description: 'Invalid or missing Azure Tenant ID',
        fix: 'Configure a valid GUID or "common" for AZURE_TENANT_ID',
        impact: 'Authentication will fail or use incorrect tenant',
      });
      score -= 25;
    } else if (config.tenantId === 'common' && config.environment === 'production') {
      issues.push({
        severity: 'HIGH',
        category: 'Security',
        description: 'Using "common" tenant in production',
        fix: 'Use specific tenant ID for production environments',
        impact: 'Allows users from any Azure AD tenant',
      });
      score -= 15;
    }

    // 3. Validate Authority URL
    const authorityValidation = this.validateAuthority(config.authority, config.tenantId);
    if (!authorityValidation.valid) {
      issues.push({
        severity: 'HIGH',
        category: 'Authentication',
        description: 'Invalid authority URL',
        fix: 'Use https://login.microsoftonline.com/{tenantId}',
        impact: 'Authentication may fail or be redirected incorrectly',
      });
      score -= 15;
    }

    // 4. Validate Redirect URI
    const redirectValidation = this.validateRedirectUri(config.redirectUri, config.environment);
    if (!redirectValidation.valid) {
      issues.push({
        severity: 'HIGH',
        category: 'Security',
        description: redirectValidation.reason || 'Invalid redirect URI',
        fix: 'Use HTTPS in production and whitelist specific URIs',
        impact: 'Potential security vulnerability or authentication failure',
      });
      score -= 15;
    }

    // 5. Validate Client Secret (if provided)
    if (config.clientSecret) {
      const secretValidation = this.validateClientSecret(config.clientSecret);
      if (!secretValidation.valid) {
        issues.push({
          severity: 'CRITICAL',
          category: 'Security',
          description: 'Weak or invalid client secret',
          fix: 'Generate a strong client secret (min 32 characters)',
          impact: 'Authentication security compromised',
        });
        score -= 20;
      }
    } else if (config.environment === 'production') {
      recommendations.push({
        priority: 'HIGH',
        category: 'Security',
        description: 'Consider using confidential client flow',
        implementation: 'Configure client secret for enhanced security',
        benefit: 'Improved authentication security and audit trail',
      });
    }

    // 6. Validate Scopes
    const scopeValidation = this.validateScopes(config.scopes);
    if (!scopeValidation.valid) {
      issues.push({
        severity: 'MEDIUM',
        category: 'Authorization',
        description: 'Invalid or excessive scopes requested',
        fix: 'Follow principle of least privilege for scopes',
        impact: 'Over-privileged access or authentication failure',
      });
      score -= 10;
    }

    // 7. Environment-specific validations
    const envValidation = this.validateEnvironmentSecurity(config);
    issues.push(...envValidation.issues);
    recommendations.push(...envValidation.recommendations);
    score -= envValidation.scoreDeduction;

    // 8. Generate compliance status
    const compliance = this.assessCompliance(issues, config);

    // 9. Add general security recommendations
    this.addGeneralRecommendations(recommendations, config);

    const result: SecurityValidationResult = {
      valid: issues.filter(i => i.severity === 'CRITICAL').length === 0,
      score: Math.max(0, score),
      issues,
      recommendations,
      compliance,
    };

    // Log validation result
    if (this.auditLogger) {
      await this.auditLogger.logSecurityEvent({
        eventType: SecurityEventType.CONFIG_CHANGE,
        severity: result.score >= 90 ? SecurityEventSeverity.INFO : SecurityEventSeverity.MEDIUM,
        outcome: result.valid ? 'SUCCESS' : 'FAILURE',
        message: `Azure AD security validation completed with score ${result.score}/100`,
        details: {
          score: result.score,
          issues_count: issues.length,
          critical_issues: issues.filter(i => i.severity === 'CRITICAL').length,
          environment: config.environment,
        },
      });
    }

    this.logger.info(`Azure AD security validation completed: ${result.score}/100`, {
      valid: result.valid,
      issues: issues.length,
      recommendations: recommendations.length,
    });

    return result;
  }

  /**
   * Validate Client ID format
   */
  private validateClientId(clientId: string): { valid: boolean; reason?: string } {
    if (!clientId) {
      return { valid: false, reason: 'Client ID is required' };
    }

    // GUID format validation
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(clientId)) {
      return { valid: false, reason: 'Client ID must be a valid GUID' };
    }

    return { valid: true };
  }

  /**
   * Validate Tenant ID format
   */
  private validateTenantId(tenantId: string): { valid: boolean; reason?: string } {
    if (!tenantId) {
      return { valid: false, reason: 'Tenant ID is required' };
    }

    // Common tenant identifiers
    const commonTenants = ['common', 'organizations', 'consumers'];
    if (commonTenants.includes(tenantId)) {
      return { valid: true };
    }

    // GUID format validation
    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(tenantId)) {
      return { valid: false, reason: 'Tenant ID must be a valid GUID or common identifier' };
    }

    return { valid: true };
  }

  /**
   * Validate Authority URL
   */
  private validateAuthority(
    authority: string,
    tenantId: string
  ): { valid: boolean; reason?: string } {
    if (!authority) {
      return { valid: false, reason: 'Authority URL is required' };
    }

    // Must use HTTPS
    if (!authority.startsWith('https://')) {
      return { valid: false, reason: 'Authority must use HTTPS' };
    }

    // Must be Microsoft authority
    const validAuthorities = ['https://login.microsoftonline.com', 'https://login.windows.net'];

    const baseAuthority = authority.split('/').slice(0, 3).join('/');
    if (!validAuthorities.includes(baseAuthority)) {
      return { valid: false, reason: 'Authority must be a valid Microsoft endpoint' };
    }

    // Should match tenant ID
    const expectedAuthority = `https://login.microsoftonline.com/${tenantId}`;
    if (authority !== expectedAuthority) {
      return { valid: false, reason: `Authority should be ${expectedAuthority}` };
    }

    return { valid: true };
  }

  /**
   * Validate Redirect URI
   */
  private validateRedirectUri(
    redirectUri: string,
    environment: string
  ): { valid: boolean; reason?: string } {
    if (!redirectUri) {
      return { valid: false, reason: 'Redirect URI is required' };
    }

    try {
      const url = new URL(redirectUri);

      // Production must use HTTPS
      if (environment === 'production' && url.protocol !== 'https:') {
        return { valid: false, reason: 'Production redirect URI must use HTTPS' };
      }

      // Localhost only allowed in development
      if (url.hostname === 'localhost' && environment === 'production') {
        return { valid: false, reason: 'Localhost redirect URI not allowed in production' };
      }

      // Check for common security issues
      if (url.pathname.includes('..')) {
        return { valid: false, reason: 'Redirect URI contains path traversal' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'Invalid redirect URI format' };
    }
  }

  /**
   * Validate Client Secret strength
   */
  private validateClientSecret(clientSecret: string): { valid: boolean; reason?: string } {
    if (!clientSecret) {
      return { valid: false, reason: 'Client secret is required for confidential clients' };
    }

    if (clientSecret.length < 32) {
      return { valid: false, reason: 'Client secret should be at least 32 characters' };
    }

    // Check for weak patterns
    if (/^[a-zA-Z]+$/.test(clientSecret) || /^[0-9]+$/.test(clientSecret)) {
      return { valid: false, reason: 'Client secret should contain mixed characters' };
    }

    return { valid: true };
  }

  /**
   * Validate OAuth scopes
   */
  private validateScopes(scopes: string[]): { valid: boolean; reason?: string } {
    if (!scopes || scopes.length === 0) {
      return { valid: false, reason: 'At least one scope is required' };
    }

    // Check for valid Microsoft Graph scopes
    const validPrefixes = [
      'https://graph.microsoft.com/',
      'User.',
      'Mail.',
      'Calendars.',
      'Contacts.',
      'Files.',
      'Tasks.',
      'offline_access',
    ];

    for (const scope of scopes) {
      const isValid = validPrefixes.some(prefix => scope === prefix || scope.startsWith(prefix));

      if (!isValid) {
        return { valid: false, reason: `Invalid scope: ${scope}` };
      }
    }

    // Check for over-privileged scopes
    const dangerousScopes = [
      'https://graph.microsoft.com/.default',
      'Directory.ReadWrite.All',
      'User.ReadWrite.All',
    ];

    const hasDangerousScopes = scopes.some(scope =>
      dangerousScopes.some(dangerous => scope.includes(dangerous))
    );

    if (hasDangerousScopes) {
      return { valid: false, reason: 'Over-privileged scopes detected' };
    }

    return { valid: true };
  }

  /**
   * Validate environment-specific security requirements
   */
  private validateEnvironmentSecurity(config: AzureSecurityConfig): {
    issues: SecurityIssue[];
    recommendations: SecurityRecommendation[];
    scoreDeduction: number;
  } {
    const issues: SecurityIssue[] = [];
    const recommendations: SecurityRecommendation[] = [];
    let scoreDeduction = 0;

    switch (config.environment) {
      case 'production':
        // Production-specific validations
        if (config.redirectUri.includes('localhost')) {
          issues.push({
            severity: 'CRITICAL',
            category: 'Security',
            description: 'Localhost redirect URI in production',
            fix: 'Use production domain for redirect URI',
            impact: 'Security vulnerability and functionality failure',
          });
          scoreDeduction += 20;
        }

        if (!config.clientSecret) {
          recommendations.push({
            priority: 'HIGH',
            category: 'Security',
            description: 'Use confidential client flow in production',
            implementation: 'Configure client secret',
            benefit: 'Enhanced security and compliance',
          });
        }

        break;

      case 'development':
        // Development-specific recommendations
        recommendations.push({
          priority: 'MEDIUM',
          category: 'Development',
          description: 'Enable detailed logging in development',
          implementation: 'Set LOG_LEVEL=debug',
          benefit: 'Better debugging and troubleshooting',
        });

        break;

      case 'staging':
        // Staging should mirror production security
        if (config.redirectUri.includes('localhost')) {
          issues.push({
            severity: 'HIGH',
            category: 'Security',
            description: 'Localhost redirect URI in staging',
            fix: 'Use staging domain for redirect URI',
            impact: 'Testing environment does not match production',
          });
          scoreDeduction += 10;
        }

        break;
    }

    return { issues, recommendations, scoreDeduction };
  }

  /**
   * Assess compliance with security standards
   */
  private assessCompliance(issues: SecurityIssue[], config: AzureSecurityConfig): ComplianceStatus {
    const compliance: ComplianceStatus = {
      owasp: { score: 100, issues: [] },
      nist: { score: 100, issues: [] },
      gdpr: { score: 100, issues: [] },
      hipaa: { score: 100, issues: [] },
    };

    for (const issue of issues) {
      const deduction = this.getComplianceDeduction(issue.severity);

      switch (issue.category) {
        case 'Authentication':
          compliance.owasp.score -= deduction;
          compliance.nist.score -= deduction;
          compliance.owasp.issues.push(`A07:2021 - ${issue.description}`);
          compliance.nist.issues.push(`IA-2 - ${issue.description}`);
          break;

        case 'Authorization':
          compliance.owasp.score -= deduction;
          compliance.nist.score -= deduction;
          compliance.owasp.issues.push(`A01:2021 - ${issue.description}`);
          compliance.nist.issues.push(`AC-3 - ${issue.description}`);
          break;

        case 'Security':
          compliance.owasp.score -= deduction;
          compliance.nist.score -= deduction;
          compliance.gdpr.score -= deduction;
          compliance.hipaa.score -= deduction;
          compliance.owasp.issues.push(`A02:2021 - ${issue.description}`);
          compliance.nist.issues.push(`SC-8 - ${issue.description}`);
          compliance.gdpr.issues.push(`Art 32 - ${issue.description}`);
          compliance.hipaa.issues.push(`164.312(a)(1) - ${issue.description}`);
          break;
      }
    }

    // Ensure scores don't go below 0
    compliance.owasp.score = Math.max(0, compliance.owasp.score);
    compliance.nist.score = Math.max(0, compliance.nist.score);
    compliance.gdpr.score = Math.max(0, compliance.gdpr.score);
    compliance.hipaa.score = Math.max(0, compliance.hipaa.score);

    return compliance;
  }

  /**
   * Get compliance score deduction based on severity
   */
  private getComplianceDeduction(severity: string): number {
    switch (severity) {
      case 'CRITICAL':
        return 25;
      case 'HIGH':
        return 15;
      case 'MEDIUM':
        return 10;
      case 'LOW':
        return 5;
      default:
        return 0;
    }
  }

  /**
   * Add general security recommendations
   */
  private addGeneralRecommendations(
    recommendations: SecurityRecommendation[],
    config: AzureSecurityConfig
  ): void {
    recommendations.push(
      {
        priority: 'HIGH',
        category: 'Monitoring',
        description: 'Implement comprehensive audit logging',
        implementation: 'Enable Azure AD sign-in logs and audit logs',
        benefit: 'Compliance and security monitoring',
      },
      {
        priority: 'HIGH',
        category: 'Security',
        description: 'Enable Conditional Access policies',
        implementation: 'Configure MFA and device compliance requirements',
        benefit: 'Enhanced authentication security',
      },
      {
        priority: 'MEDIUM',
        category: 'Security',
        description: 'Implement certificate pinning',
        implementation: 'Pin Microsoft Graph API certificates',
        benefit: 'Protection against man-in-the-middle attacks',
      },
      {
        priority: 'MEDIUM',
        category: 'Compliance',
        description: 'Regular security assessments',
        implementation: 'Schedule quarterly security reviews',
        benefit: 'Maintain security posture over time',
      }
    );
  }

  /**
   * Generate security configuration template
   */
  generateSecureConfigTemplate(
    environment: 'development' | 'staging' | 'production'
  ): AzureSecurityConfig {
    const baseConfig: AzureSecurityConfig = {
      clientId: '00000000-0000-0000-0000-000000000000', // Replace with actual client ID
      tenantId: environment === 'production' ? '00000000-0000-0000-0000-000000000000' : 'common',
      authority: `https://login.microsoftonline.com/${environment === 'production' ? '00000000-0000-0000-0000-000000000000' : 'common'}`,
      redirectUri:
        environment === 'production'
          ? 'https://your-domain.com/auth/callback'
          : environment === 'staging'
            ? 'https://staging.your-domain.com/auth/callback'
            : 'http://localhost:3000/auth/callback',
      scopes: [
        'https://graph.microsoft.com/User.Read',
        'https://graph.microsoft.com/Mail.ReadWrite',
        'https://graph.microsoft.com/Calendars.ReadWrite',
        'https://graph.microsoft.com/Contacts.ReadWrite',
        'offline_access',
      ],
      environment,
    };

    if (environment !== 'development') {
      baseConfig.clientSecret = 'REPLACE_WITH_SECURE_CLIENT_SECRET';
    }

    return baseConfig;
  }
}
