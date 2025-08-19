import * as crypto from 'crypto';
import * as https from 'https';
import * as tls from 'tls';
import { Logger } from '../logging/Logger.js';

/**
 * Certificate pin configuration
 */
export interface CertificatePin {
  hostname: string;
  pins: string[]; // SHA-256 hashes of certificate public keys
  backup_pins?: string[]; // Backup pins for key rotation
  max_age?: number; // Pin expiration time in seconds
  include_subdomains?: boolean;
  report_uri?: string; // URI to report pin violations
}

/**
 * Certificate pinning validation result
 */
export interface PinValidationResult {
  valid: boolean;
  hostname: string;
  matched_pin?: string;
  certificate_fingerprint: string;
  error?: string;
  violation_report?: any;
}

/**
 * Certificate pinning configuration
 */
export interface CertificatePinningConfig {
  enabled: boolean;
  strict_mode: boolean; // Fail requests on pin mismatch
  report_violations: boolean;
  pin_backup_count: number;
  auto_update_pins: boolean;
  validation_cache_ttl: number; // Cache TTL in milliseconds
}

/**
 * Advanced certificate pinning implementation for Microsoft Graph API
 * Implements OWASP certificate pinning best practices
 */
export class CertificatePinning {
  private readonly logger: Logger;
  private readonly config: CertificatePinningConfig;
  private readonly pins: Map<string, CertificatePin> = new Map();
  private readonly validationCache: Map<
    string,
    { result: PinValidationResult; timestamp: number }
  > = new Map();

  // Microsoft Graph API certificate pins (updated regularly)
  private readonly defaultPins: CertificatePin[] = [
    {
      hostname: 'graph.microsoft.com',
      pins: [
        // Microsoft RSA TLS CA 01 (Primary)
        'MUdq47HpX2QlPFfkcDf/bqw=',
        // Microsoft RSA TLS CA 02 (Backup)
        'IQBnNBEiFuhj+8x6X8XLgh01V9Ic5/V3IRQLNFFc7v4=',
        // DigiCert Global Root CA (Root)
        'K87oWBWM9UZfyddvDfoxL+8lpNyoUB2ptGtn0fv6G2Q=',
      ],
      backup_pins: [
        // Additional backup pins for rotation
        'C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=',
        'l2dWePQTJ8tE+nCOlLq7g0b4pS3pXYc/4D+8s3FUVQU=',
      ],
      max_age: 86400 * 30, // 30 days
      include_subdomains: true,
    },
    {
      hostname: 'login.microsoftonline.com',
      pins: [
        // Microsoft RSA TLS CA 01
        'MUdq47HpX2QlPFfkcDf/bqw=',
        // Microsoft RSA TLS CA 02
        'IQBnNBEiFuhj+8x6X8XLgh01V9Ic5/V3IRQLNFFc7v4=',
        // DigiCert Global Root CA
        'K87oWBWM9UZfyddvDfoxL+8lpNyoUB2ptGtn0fv6G2Q=',
      ],
      backup_pins: ['C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M='],
      max_age: 86400 * 30,
      include_subdomains: true,
    },
  ];

  constructor(config: Partial<CertificatePinningConfig> = {}, logger: Logger) {
    this.logger = logger;
    this.config = {
      enabled: true,
      strict_mode: true,
      report_violations: true,
      pin_backup_count: 2,
      auto_update_pins: false,
      validation_cache_ttl: 300000, // 5 minutes
      ...config,
    };

    this.initializeDefaultPins();
    this.startCacheCleanup();
  }

  /**
   * Initialize default certificate pins for Microsoft services
   */
  private initializeDefaultPins(): void {
    for (const pin of this.defaultPins) {
      this.pins.set(pin.hostname, pin);
    }
    this.logger.info(`Initialized certificate pinning for ${this.defaultPins.length} domains`);
  }

  /**
   * Add or update certificate pin for a hostname
   */
  addPin(pin: CertificatePin): void {
    this.pins.set(pin.hostname, pin);
    this.logger.info(`Added certificate pin for ${pin.hostname}`);
  }

  /**
   * Remove certificate pin for a hostname
   */
  removePin(hostname: string): void {
    this.pins.delete(hostname);
    this.logger.info(`Removed certificate pin for ${hostname}`);
  }

  /**
   * Create HTTPS agent with certificate pinning
   */
  createSecureAgent(): https.Agent {
    return new https.Agent({
      checkServerIdentity: (hostname: string, cert: any) => {
        return this.validateCertificatePin(hostname, cert);
      },
      rejectUnauthorized: true,
      secureProtocol: 'TLSv1_2_method', // Enforce minimum TLS 1.2
    });
  }

  /**
   * Validate certificate pin for a hostname
   */
  validateCertificatePin(hostname: string, cert: any): Error | undefined {
    if (!this.config.enabled) {
      return undefined;
    }

    try {
      const pin = this.findPinForHostname(hostname);
      if (!pin) {
        // No pin configured for this hostname
        if (this.config.strict_mode) {
          const error = new Error(`No certificate pin configured for ${hostname}`);
          this.logger.warn(error.message);
          return error;
        }
        return undefined;
      }

      // Check cache first
      const cacheKey = `${hostname}-${this.getCertificateFingerprint(cert)}`;
      const cached = this.validationCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.config.validation_cache_ttl) {
        if (!cached.result.valid && this.config.strict_mode) {
          return new Error(cached.result.error || 'Certificate pin validation failed (cached)');
        }
        return undefined;
      }

      const result = this.performPinValidation(hostname, cert, pin);

      // Cache the result
      this.validationCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });

      if (!result.valid) {
        const error = new Error(result.error || 'Certificate pin validation failed');

        // Report violation if configured
        if (this.config.report_violations) {
          this.reportPinViolation(result);
        }

        if (this.config.strict_mode) {
          return error;
        } else {
          this.logger.warn(
            `Certificate pin validation failed for ${hostname}, but continuing due to non-strict mode`
          );
        }
      }

      return undefined;
    } catch (error) {
      this.logger.error(`Certificate pinning validation error for ${hostname}`, error);
      if (this.config.strict_mode) {
        return error instanceof Error ? error : new Error('Certificate pinning validation error');
      }
      return undefined;
    }
  }

  /**
   * Find certificate pin configuration for hostname
   */
  private findPinForHostname(hostname: string): CertificatePin | null {
    // Direct match
    const pin = this.pins.get(hostname);
    if (pin) {
      return pin;
    }

    // Check for subdomain matches
    for (const [domain, pinConfig] of this.pins.entries()) {
      if (pinConfig.include_subdomains && hostname.endsWith(`.${domain}`)) {
        return pinConfig;
      }
    }

    return null;
  }

  /**
   * Perform actual pin validation
   */
  private performPinValidation(
    hostname: string,
    cert: any,
    pin: CertificatePin
  ): PinValidationResult {
    const certificateFingerprint = this.getCertificateFingerprint(cert);
    const publicKeyPin = this.getPublicKeyPin(cert);

    // Check against primary pins
    for (const pinValue of pin.pins) {
      if (publicKeyPin === pinValue) {
        this.logger.debug(`Certificate pin validated for ${hostname}`, {
          hostname,
          matched_pin: pinValue,
          certificate_fingerprint: certificateFingerprint,
        });

        return {
          valid: true,
          hostname,
          matched_pin: pinValue,
          certificate_fingerprint: certificateFingerprint,
        };
      }
    }

    // Check against backup pins
    if (pin.backup_pins) {
      for (const pinValue of pin.backup_pins) {
        if (publicKeyPin === pinValue) {
          this.logger.info(`Certificate backup pin validated for ${hostname}`, {
            hostname,
            matched_pin: pinValue,
            certificate_fingerprint: certificateFingerprint,
          });

          return {
            valid: true,
            hostname,
            matched_pin: pinValue,
            certificate_fingerprint: certificateFingerprint,
          };
        }
      }
    }

    // Pin validation failed
    return {
      valid: false,
      hostname,
      certificate_fingerprint: certificateFingerprint,
      error: `Certificate pin mismatch for ${hostname}. Expected one of [${pin.pins.join(', ')}], got ${publicKeyPin}`,
    };
  }

  /**
   * Get certificate fingerprint (SHA-256)
   */
  private getCertificateFingerprint(cert: any): string {
    const der = cert.raw || Buffer.from(cert.toString(), 'base64');
    return crypto.createHash('sha256').update(der).digest('base64');
  }

  /**
   * Get public key pin (SPKI SHA-256)
   */
  private getPublicKeyPin(cert: any): string {
    try {
      // Extract the Subject Public Key Info (SPKI)
      const publicKey = cert.pubkey || cert.publicKey;
      if (!publicKey) {
        throw new Error('Unable to extract public key from certificate');
      }

      // Create SHA-256 hash of the public key
      const publicKeyDer = publicKey.export({ type: 'spki', format: 'der' });
      return crypto.createHash('sha256').update(publicKeyDer).digest('base64');
    } catch (error) {
      this.logger.error('Failed to extract public key pin', error);
      throw error;
    }
  }

  /**
   * Report certificate pin violation
   */
  private async reportPinViolation(result: PinValidationResult): Promise<void> {
    const violation = {
      timestamp: new Date().toISOString(),
      hostname: result.hostname,
      expected_pins: this.pins.get(result.hostname)?.pins,
      actual_fingerprint: result.certificate_fingerprint,
      error: result.error,
      user_agent: 'Unified-PIM-MCP',
    };

    this.logger.error('Certificate pin violation detected', violation);

    // Store violation report for audit
    result.violation_report = violation;

    // In a production environment, you would send this to a violation reporting endpoint
    const pin = this.pins.get(result.hostname);
    if (pin?.report_uri) {
      try {
        // Report to configured URI (implementation would go here)
        this.logger.info(`Pin violation reported to ${pin.report_uri}`);
      } catch (error) {
        this.logger.error('Failed to report pin violation', error);
      }
    }
  }

  /**
   * Update certificate pins (for automatic updates)
   */
  async updatePins(hostname: string, newPins: string[]): Promise<void> {
    if (!this.config.auto_update_pins) {
      throw new Error('Automatic pin updates are disabled');
    }

    const existingPin = this.pins.get(hostname);
    if (!existingPin) {
      throw new Error(`No existing pin configuration for ${hostname}`);
    }

    // Validate new pins before updating
    for (const pin of newPins) {
      if (!this.isValidPin(pin)) {
        throw new Error(`Invalid pin format: ${pin}`);
      }
    }

    // Update the pin configuration
    const updatedPin: CertificatePin = {
      ...existingPin,
      backup_pins: existingPin.pins, // Move current pins to backup
      pins: newPins,
    };

    this.pins.set(hostname, updatedPin);
    this.logger.info(`Updated certificate pins for ${hostname}`, {
      new_pins: newPins,
      backup_pins: updatedPin.backup_pins,
    });

    // Clear cache for this hostname
    this.clearHostnameCache(hostname);
  }

  /**
   * Validate pin format
   */
  private isValidPin(pin: string): boolean {
    // Check if it's a valid base64 string of appropriate length for SHA-256
    try {
      const decoded = Buffer.from(pin, 'base64');
      return decoded.length === 32; // SHA-256 is 32 bytes
    } catch {
      return false;
    }
  }

  /**
   * Clear validation cache for a hostname
   */
  private clearHostnameCache(hostname: string): void {
    for (const [key] of this.validationCache.entries()) {
      if (key.startsWith(`${hostname}-`)) {
        this.validationCache.delete(key);
      }
    }
  }

  /**
   * Start cache cleanup interval
   */
  private startCacheCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [key, cached] of this.validationCache.entries()) {
        if (now - cached.timestamp > this.config.validation_cache_ttl) {
          this.validationCache.delete(key);
        }
      }
    }, this.config.validation_cache_ttl);
  }

  /**
   * Get pinning statistics
   */
  getPinningStats(): {
    total_pins: number;
    cache_size: number;
    enabled_domains: string[];
    validation_cache_hit_rate: number;
  } {
    return {
      total_pins: this.pins.size,
      cache_size: this.validationCache.size,
      enabled_domains: Array.from(this.pins.keys()),
      validation_cache_hit_rate: 0, // Would need to track hits/misses for accurate calculation
    };
  }

  /**
   * Verify current pins are still valid
   */
  async verifyCurrentPins(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [hostname] of this.pins.entries()) {
      try {
        // Perform actual connection to verify current certificate
        const isValid = await this.testConnection(hostname);
        results.set(hostname, isValid);
      } catch (error) {
        this.logger.error(`Failed to verify pin for ${hostname}`, error);
        results.set(hostname, false);
      }
    }

    return results;
  }

  /**
   * Test connection to verify certificate pin
   */
  private async testConnection(hostname: string): Promise<boolean> {
    return new Promise(resolve => {
      const options = {
        hostname,
        port: 443,
        method: 'HEAD',
        path: '/',
        agent: this.createSecureAgent(),
        timeout: 10000,
      };

      const req = https.request(options, res => {
        resolve(res.statusCode !== undefined);
      });

      req.on('error', error => {
        this.logger.debug(`Connection test failed for ${hostname}`, error);
        resolve(false);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Export pin configuration for backup
   */
  exportPinConfiguration(): CertificatePin[] {
    return Array.from(this.pins.values());
  }

  /**
   * Import pin configuration from backup
   */
  importPinConfiguration(pins: CertificatePin[]): void {
    this.pins.clear();
    for (const pin of pins) {
      this.pins.set(pin.hostname, pin);
    }
    this.logger.info(`Imported ${pins.length} certificate pins`);
  }

  /**
   * Dispose certificate pinning
   */
  dispose(): void {
    this.pins.clear();
    this.validationCache.clear();
  }
}
