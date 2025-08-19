import { NextFunction, Request, Response } from 'express';
import { Logger } from '../logging/Logger.js';

/**
 * Security headers configuration
 */
export interface SecurityHeadersConfig {
  hsts?: {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  contentSecurityPolicy?: {
    directives?: Record<string, string[]>;
    reportOnly?: boolean;
  };
  cors?: {
    origin?: string | string[];
    credentials?: boolean;
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    maxAge?: number;
  };
  rateLimiting?: {
    windowMs?: number;
    maxRequests?: number;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
  };
  customHeaders?: Record<string, string>;
}

/**
 * Security headers middleware for production-grade security
 * Implements OWASP security header recommendations
 */
export class SecurityHeaders {
  private readonly logger: Logger;
  private readonly config: SecurityHeadersConfig;
  private readonly requestCounts: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(config: SecurityHeadersConfig = {}, logger: Logger) {
    this.logger = logger;
    this.config = this.mergeWithDefaults(config);
  }

  /**
   * Merge user config with secure defaults
   */
  private mergeWithDefaults(config: SecurityHeadersConfig): SecurityHeadersConfig {
    return {
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
        ...config.hsts,
      },
      contentSecurityPolicy: {
        directives: {
          'default-src': ["'self'"],
          'script-src': ["'self'", "'unsafe-inline'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'font-src': ["'self'"],
          'connect-src': [
            "'self'",
            'https://graph.microsoft.com',
            'https://login.microsoftonline.com',
          ],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'object-src': ["'none'"],
          'upgrade-insecure-requests': [],
          ...config.contentSecurityPolicy?.directives,
        },
        reportOnly: config.contentSecurityPolicy?.reportOnly || false,
      },
      cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || [
          'http://localhost:3000',
          'https://localhost:3000',
        ],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
        exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
        maxAge: 86400, // 24 hours
        ...config.cors,
      },
      rateLimiting: {
        windowMs: 900000, // 15 minutes
        maxRequests: 1000,
        skipSuccessfulRequests: false,
        skipFailedRequests: false,
        ...config.rateLimiting,
      },
      customHeaders: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy':
          'geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()',
        'X-DNS-Prefetch-Control': 'off',
        'X-Download-Options': 'noopen',
        'X-Permitted-Cross-Domain-Policies': 'none',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Resource-Policy': 'same-site',
        ...config.customHeaders,
      },
    };
  }

  /**
   * Express middleware for security headers
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      try {
        this.applySecurityHeaders(req, res);
        this.applyCorsHeaders(req, res);
        this.applyRateLimiting(req, res, next);
      } catch (error) {
        this.logger.error('Error applying security headers', error);
        next(error);
      }
    };
  }

  /**
   * Apply security headers to response
   */
  private applySecurityHeaders(req: Request, res: Response): void {
    // HSTS (only over HTTPS)
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      const hstsValue = `max-age=${this.config.hsts!.maxAge}${
        this.config.hsts!.includeSubDomains ? '; includeSubDomains' : ''
      }${this.config.hsts!.preload ? '; preload' : ''}`;
      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // Content Security Policy
    const cspDirectives = this.config.contentSecurityPolicy!.directives!;
    const cspHeader = Object.entries(cspDirectives)
      .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
      .join('; ');

    const cspHeaderName = this.config.contentSecurityPolicy!.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';
    res.setHeader(cspHeaderName, cspHeader);

    // Apply custom headers
    Object.entries(this.config.customHeaders!).forEach(([name, value]) => {
      res.setHeader(name, value);
    });

    // Security-specific headers
    res.setHeader('Server', 'Unified-PIM-MCP'); // Hide server details
    res.removeHeader('X-Powered-By'); // Remove Express header
  }

  /**
   * Apply CORS headers
   */
  private applyCorsHeaders(req: Request, res: Response): void {
    const origin = req.headers.origin;
    const allowedOrigins = Array.isArray(this.config.cors!.origin)
      ? this.config.cors!.origin
      : [this.config.cors!.origin as string];

    if (origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }

    if (this.config.cors!.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', this.config.cors!.methods!.join(', '));
    res.setHeader('Access-Control-Allow-Headers', this.config.cors!.allowedHeaders!.join(', '));
    res.setHeader('Access-Control-Expose-Headers', this.config.cors!.exposedHeaders!.join(', '));
    res.setHeader('Access-Control-Max-Age', this.config.cors!.maxAge!.toString());
  }

  /**
   * Apply rate limiting
   */
  private applyRateLimiting(req: Request, res: Response, next: NextFunction): void {
    const clientId = this.getClientIdentifier(req);
    const now = Date.now();
    const windowMs = this.config.rateLimiting!.windowMs!;
    const maxRequests = this.config.rateLimiting!.maxRequests!;

    // Get or create request tracking for this client
    let requestData = this.requestCounts.get(clientId);
    if (!requestData || now > requestData.resetTime) {
      requestData = {
        count: 0,
        resetTime: now + windowMs,
      };
      this.requestCounts.set(clientId, requestData);
    }

    // Increment request count
    requestData.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - requestData.count).toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(requestData.resetTime / 1000).toString());

    // Check if rate limit exceeded
    if (requestData.count > maxRequests) {
      const retryAfter = Math.ceil((requestData.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfter.toString());

      this.logger.warn(`Rate limit exceeded for client ${clientId}`, {
        clientId,
        count: requestData.count,
        limit: maxRequests,
        retryAfter,
      });

      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
      });
      return;
    }

    next();
  }

  /**
   * Get client identifier for rate limiting
   */
  private getClientIdentifier(req: Request): string {
    // Use X-Forwarded-For if behind a proxy, otherwise use connection IP
    const ip =
      (req.headers['x-forwarded-for'] as string) ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown';

    // Include user agent for better client identification
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Create a hash of IP + User Agent for privacy
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(`${ip}:${userAgent}`).digest('hex').substring(0, 16);
  }

  /**
   * Clean up old rate limiting entries
   */
  private startCleanupInterval(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [clientId, data] of this.requestCounts.entries()) {
        if (now > data.resetTime) {
          this.requestCounts.delete(clientId);
        }
      }
    }, 300000); // Clean up every 5 minutes
  }

  /**
   * Get rate limiting statistics
   */
  getRateLimitStats(): {
    activeClients: number;
    totalRequests: number;
    averageRequestsPerClient: number;
  } {
    const now = Date.now();
    let totalRequests = 0;
    let activeClients = 0;

    for (const [, data] of this.requestCounts.entries()) {
      if (now <= data.resetTime) {
        activeClients++;
        totalRequests += data.count;
      }
    }

    return {
      activeClients,
      totalRequests,
      averageRequestsPerClient: activeClients > 0 ? totalRequests / activeClients : 0,
    };
  }

  /**
   * Security audit headers check
   */
  auditSecurityHeaders(res: Response): {
    score: number;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    const headers = res.getHeaders();

    // Check critical security headers
    const requiredHeaders = [
      'strict-transport-security',
      'content-security-policy',
      'x-content-type-options',
      'x-frame-options',
      'x-xss-protection',
      'referrer-policy',
    ];

    for (const header of requiredHeaders) {
      if (!headers[header]) {
        issues.push(`Missing security header: ${header}`);
        score -= 10;
      }
    }

    // Check CSP strength
    const csp = headers['content-security-policy'] as string;
    if (csp) {
      if (csp.includes("'unsafe-eval'")) {
        issues.push("CSP allows 'unsafe-eval' which is dangerous");
        score -= 15;
      }
      if (csp.includes('*') && !csp.includes("'self'")) {
        issues.push('CSP uses wildcard without self restriction');
        score -= 10;
      }
    }

    // Recommendations based on score
    if (score < 100) {
      recommendations.push('Implement all missing security headers');
      recommendations.push('Review and tighten Content Security Policy');
      recommendations.push('Consider implementing HPKP (HTTP Public Key Pinning)');
    }

    return { score, issues, recommendations };
  }

  /**
   * Initialize security headers middleware
   */
  static create(config?: SecurityHeadersConfig, logger?: Logger): SecurityHeaders {
    const defaultLogger =
      logger ||
      ({
        debug: console.debug,
        info: console.info,
        warn: console.warn,
        error: console.error,
      } as Logger);

    const securityHeaders = new SecurityHeaders(config, defaultLogger);
    securityHeaders.startCleanupInterval();
    return securityHeaders;
  }
}
