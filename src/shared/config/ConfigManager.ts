import { config as dotenvConfig } from 'dotenv';

/**
 * Configuration manager handles loading and managing configuration from various sources
 */
export class ConfigManager {
  private config: Record<string, any> = {};
  private isInitialized = false;

  /**
   * Initialize configuration manager
   */
  async initialize(): Promise<void> {
    // Load environment variables
    dotenvConfig();

    // Load default configuration
    this.config = {
      logging: {
        level: process.env['LOG_LEVEL'] || 'info',
        format: 'json'
      },
      security: {
        encryption: {
          algorithm: 'AES-256-GCM',
          keyRotationInterval: 30
        },
        tokenStorage: {
          storageType: 'file',
          encryptionEnabled: true
        }
      },
      platforms: {
        microsoft: {
          enabled: process.env['ENABLE_MICROSOFT'] === 'true',
          clientId: process.env['MICROSOFT_CLIENT_ID'],
          clientSecret: process.env['MICROSOFT_CLIENT_SECRET'],
          tenantId: process.env['MICROSOFT_TENANT_ID']
        },
        google: {
          enabled: process.env['ENABLE_GOOGLE'] === 'true',
          clientId: process.env['GOOGLE_CLIENT_ID'],
          clientSecret: process.env['GOOGLE_CLIENT_SECRET']
        },
        apple: {
          enabled: process.env['ENABLE_APPLE'] === 'true',
          username: process.env['APPLE_USERNAME'],
          password: process.env['APPLE_APP_PASSWORD']
        }
      },
      cache: {
        memory: {
          ttl: 300000, // 5 minutes
          maxSize: 1000
        },
        chromadb: {
          ttl: 3600000, // 1 hour
          url: process.env['CHROMADB_URL'] || 'http://localhost:8000'
        },
        file: {
          ttl: 1800000, // 30 minutes
          path: process.env['CACHE_FILE_PATH'] || './cache'
        }
      },
      resilience: {
        circuitBreaker: {
          threshold: 5,
          timeout: 60000,
          resetTimeout: 300000
        },
        rateLimit: {
          requests: 100,
          window: 60000
        }
      }
    };

    this.isInitialized = true;
  }

  /**
   * Get configuration section
   */
  getConfig(section: string): any {
    return this.config[section] || {};
  }

  /**
   * Get full configuration
   */
  getAllConfig(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * Update configuration section
   */
  updateConfig(section: string, updates: any): void {
    this.config[section] = { ...this.config[section], ...updates };
  }

  /**
   * Check if configuration is valid
   */
  isValid(): boolean {
    return this.isInitialized;
  }
}