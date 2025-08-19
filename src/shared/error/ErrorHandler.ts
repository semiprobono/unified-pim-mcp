import { Logger } from '../logging/Logger.js';

/**
 * Global error handler for the application
 */
export class ErrorHandler {
  constructor(private readonly logger: Logger) {}

  /**
   * Handle application error
   */
  handleError(error: any, context?: string): void {
    this.logger.error(`Error in ${context || 'application'}:`, error);
  }

  /**
   * Handle async error
   */
  async handleAsyncError(error: any, context?: string): Promise<void> {
    this.handleError(error, context);
  }
}
