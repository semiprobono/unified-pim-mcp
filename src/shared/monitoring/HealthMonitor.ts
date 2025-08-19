import { Logger } from '../logging/Logger.js';
import { EventEmitter } from 'events';

/**
 * Health monitor for system components
 */
export class HealthMonitor extends EventEmitter {
  private intervalId?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private readonly services: Record<string, any>,
    private readonly logger: Logger,
    private readonly checkInterval = 30000 // 30 seconds
  ) {
    super();
  }

  /**
   * Start health monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.performHealthCheck();
    }, this.checkInterval);

    // Perform initial check
    await this.performHealthCheck();
  }

  /**
   * Stop health monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      const status = {
        timestamp: new Date(),
        isHealthy: true,
        services: {} as Record<string, any>,
      };

      // Check each service
      for (const [name, service] of Object.entries(this.services)) {
        try {
          const serviceStatus = await this.checkService(service);
          status.services[name] = serviceStatus;

          if (!serviceStatus.isHealthy) {
            status.isHealthy = false;
          }
        } catch (error) {
          status.services[name] = {
            isHealthy: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
          status.isHealthy = false;
        }
      }

      this.emit('healthCheck', status);
    } catch (error) {
      this.logger.error('Health check failed:', error);
    }
  }

  /**
   * Check individual service health
   */
  private async checkService(service: any): Promise<any> {
    if (typeof service.getStatus === 'function') {
      const status = await service.getStatus();
      return {
        isHealthy: true,
        ...status,
      };
    }

    return { isHealthy: true, status: 'unknown' };
  }
}
