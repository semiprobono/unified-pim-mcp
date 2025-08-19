import { Platform } from '../../domain/value-objects/Platform.js';
import { PlatformPort } from '../../domain/interfaces/PlatformPort.js';
import { SecurityManager } from '../../shared/security/SecurityManager.js';
import { ResilienceManager } from '../../shared/resilience/ResilienceManager.js';
import { CacheManager } from '../cache/CacheManager.js';
import { Logger } from '../../shared/logging/Logger.js';
import { ConfigManager } from '../../shared/config/ConfigManager.js';
import { GraphAdapter } from './microsoft/GraphAdapter.js';

/**
 * Manages platform adapters and provides unified access to all platforms
 */
export class PlatformAdapterManager {
  private adapters = new Map<Platform, PlatformPort>();
  private isInitialized = false;

  constructor(
    private readonly config: any,
    private readonly securityManager: SecurityManager,
    private readonly resilienceManager: ResilienceManager,
    private readonly cacheManager: CacheManager,
    private readonly logger: Logger,
    private readonly configManager: ConfigManager
  ) {}

  /**
   * Initialize all platform adapters
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing platform adapter manager');

    try {
      // Initialize Microsoft Graph adapter if configured
      if (this.config.microsoft?.enabled) {
        const graphAdapter = new GraphAdapter(
          this.config.microsoft,
          this.configManager,
          this.securityManager,
          this.logger
        );

        await graphAdapter.initialize();
        this.adapters.set('microsoft', graphAdapter);
        this.logger.info('Microsoft Graph adapter initialized and registered');
      }

      // Google and Apple adapters would be initialized here when implemented
      // if (this.config.google?.enabled) { ... }
      // if (this.config.apple?.enabled) { ... }

      this.isInitialized = true;
      this.logger.info('Platform adapter manager initialized', {
        adaptersCount: this.adapters.size,
        platforms: Array.from(this.adapters.keys()),
      });
    } catch (error) {
      this.logger.error('Failed to initialize platform adapters', error);
      throw error;
    }
  }

  /**
   * Get platform adapter
   */
  getAdapter(platform: Platform): PlatformPort | undefined {
    return this.adapters.get(platform);
  }

  /**
   * Get status of all platforms
   */
  async getStatus(): Promise<Record<Platform, any>> {
    const status: any = {};

    for (const [platform, adapter] of this.adapters) {
      try {
        const health = await adapter.healthCheck();
        const lastSync = await adapter.getLastSyncTime();

        status[platform] = {
          available: adapter.isAvailable,
          authenticated: adapter.isAuthenticated,
          lastSync: lastSync?.toISOString() || null,
          health: health.success ? health.data : null,
        };
      } catch (error) {
        status[platform] = {
          available: false,
          authenticated: false,
          lastSync: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    // Add status for non-initialized platforms
    for (const platform of ['microsoft', 'google', 'apple'] as Platform[]) {
      if (!status[platform]) {
        status[platform] = {
          available: false,
          authenticated: false,
          lastSync: null,
          initialized: false,
        };
      }
    }

    return status;
  }

  /**
   * Dispose of all adapters
   */
  async dispose(): Promise<void> {
    this.logger.info('Disposing platform adapter manager');

    for (const [platform, adapter] of this.adapters) {
      try {
        await adapter.dispose();
      } catch (error) {
        this.logger.error(`Failed to dispose ${platform} adapter:`, error);
      }
    }

    this.adapters.clear();
    this.isInitialized = false;
  }
}
