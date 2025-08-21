#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { UnifiedPIMServer } from './infrastructure/mcp/server/UnifiedPIMServer.js';
import { ConfigManager } from './shared/config/ConfigManager.js';
import { Logger } from './shared/logging/Logger.js';
import { ErrorHandler } from './shared/error/ErrorHandler.js';
import { HealthMonitor } from './shared/monitoring/HealthMonitor.js';
import { PlatformAdapterManager } from './infrastructure/adapters/PlatformAdapterManager.js';
import { CacheManager } from '@infrastructure/cache/CacheManager.js';
import { ChromaClient } from 'chromadb';
import { SecurityManager } from './shared/security/SecurityManager.js';
import { ResilienceManager } from './shared/resilience/ResilienceManager.js';

/**
 * Unified PIM MCP Server Entry Point
 *
 * This server provides comprehensive CRUD operations for email, calendar,
 * contacts, tasks, and files across Microsoft, Google, and Apple platforms.
 */
class UnifiedPIMMain {
  private server?: Server;
  private pimServer?: UnifiedPIMServer;
  private logger?: Logger;
  private configManager?: ConfigManager;
  private errorHandler?: ErrorHandler;
  private healthMonitor?: HealthMonitor;
  private platformManager?: PlatformAdapterManager;
  private cacheManager?: CacheManager;
  private securityManager?: SecurityManager;
  private resilienceManager?: ResilienceManager;

  /**
   * Initializes and starts the MCP server
   */
  async main(): Promise<void> {
    try {
      // Initialize core services
      await this.initializeServices();

      // Create and configure MCP server
      await this.createMCPServer();

      // Setup signal handlers
      this.setupSignalHandlers();

      // Start health monitoring
      await this.startHealthMonitoring();

      // Start the server
      await this.startServer();

      this.logger?.info('Unified PIM MCP Server started successfully');
    } catch (error) {
      const logger = this.logger || console;
      logger.error('Failed to start Unified PIM MCP Server:', error);
      process.exit(1);
    }
  }

  /**
   * Initialize core services
   */
  private async initializeServices(): Promise<void> {
    // Configuration Manager
    this.configManager = new ConfigManager();
    await this.configManager.initialize();

    // Logger
    this.logger = new Logger(this.configManager.getConfig('logging'));
    await this.logger.initialize();

    // Error Handler
    this.errorHandler = new ErrorHandler(this.logger);

    // Security Manager
    this.securityManager = new SecurityManager(
      this.configManager.getConfig('security'),
      this.logger
    );
    await this.securityManager.initialize();

    // Resilience Manager
    this.resilienceManager = new ResilienceManager(
      this.configManager.getConfig('resilience'),
      this.logger
    );
    await this.resilienceManager.initialize();

    // Cache Manager
    const cacheConfig = this.configManager.getConfig('cache');
    const chromaClient = new ChromaClient({
      path: `http://${cacheConfig.chromadb?.host || 'localhost'}:${cacheConfig.chromadb?.port || 8000}`
    });
    this.cacheManager = new CacheManager(chromaClient);
    await this.cacheManager.initialize();

    // Platform Adapter Manager
    this.platformManager = new PlatformAdapterManager(
      this.configManager.getConfig('platforms'),
      this.securityManager,
      this.resilienceManager,
      this.cacheManager,
      this.logger,
      this.configManager
    );
    await this.platformManager.initialize();

    // Health Monitor
    this.healthMonitor = new HealthMonitor(
      {
        platformManager: this.platformManager,
        cacheManager: this.cacheManager,
        securityManager: this.securityManager,
      },
      this.logger
    );

    this.logger.info('Core services initialized successfully');
  }

  /**
   * Create and configure the MCP server
   */
  private async createMCPServer(): Promise<void> {
    if (
      !this.configManager ||
      !this.logger ||
      !this.errorHandler ||
      !this.platformManager ||
      !this.cacheManager ||
      !this.securityManager
    ) {
      throw new Error('Services not initialized');
    }

    // Create MCP server instance
    this.server = new Server(
      {
        name: 'unified-pim-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Create Unified PIM Server
    this.pimServer = new UnifiedPIMServer(
      this.platformManager,
      this.cacheManager,
      this.securityManager,
      this.logger,
      this.errorHandler
    );

    // Register handlers
    await this.registerMCPHandlers();

    this.logger.info('MCP server created and configured');
  }

  /**
   * Register MCP handlers
   */
  private async registerMCPHandlers(): Promise<void> {
    if (!this.server || !this.pimServer) {
      throw new Error('Server not initialized');
    }

    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const tools = await this.pimServer!.getAvailableTools();
        return { tools };
      } catch (error) {
        this.logger?.error('Failed to list tools:', error);
        throw new McpError(ErrorCode.InternalError, 'Failed to list tools');
      }
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      try {
        const { name, arguments: args } = request.params;
        const result = await this.pimServer!.executeTool(name, args || {});
        return result;
      } catch (error) {
        this.logger?.error(`Failed to execute tool ${request.params.name}:`, error);

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to execute tool: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const resources = await this.pimServer!.getAvailableResources();
        return { resources };
      } catch (error) {
        this.logger?.error('Failed to list resources:', error);
        throw new McpError(ErrorCode.InternalError, 'Failed to list resources');
      }
    });

    // Read resource handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      try {
        const { uri } = request.params;
        const contents = await this.pimServer!.readResource(uri);
        return { contents };
      } catch (error) {
        this.logger?.error(`Failed to read resource ${request.params.uri}:`, error);

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Failed to read resource: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });

    this.logger?.info('MCP handlers registered successfully');
  }

  /**
   * Start the MCP server
   */
  private async startServer(): Promise<void> {
    if (!this.server) {
      throw new Error('Server not created');
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    this.logger?.info('MCP server connected via stdio transport');
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const gracefulShutdown = async (signal: string) => {
      this.logger?.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop health monitoring
        if (this.healthMonitor) {
          await this.healthMonitor.stop();
        }

        // Close platform adapters
        if (this.platformManager) {
          await this.platformManager.dispose();
        }

        // Close cache connections
        if (this.cacheManager) {
          await this.cacheManager.dispose();
        }

        // Close security services
        if (this.securityManager) {
          await this.securityManager.dispose();
        }

        // Close resilience services
        if (this.resilienceManager) {
          await this.resilienceManager.dispose();
        }

        // Close logger
        if (this.logger) {
          await this.logger.dispose();
        }

        this.logger?.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', error => {
      this.logger?.error('Uncaught exception:', error);
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      this.logger?.error('Unhandled promise rejection:', { reason, promise });
      gracefulShutdown('unhandledRejection');
    });
  }

  /**
   * Start health monitoring
   */
  private async startHealthMonitoring(): Promise<void> {
    if (!this.healthMonitor) {
      return;
    }

    // Start periodic health checks
    await this.healthMonitor.start();

    // Log health status periodically
    this.healthMonitor.on('healthCheck', status => {
      if (status.isHealthy) {
        this.logger?.debug('Health check passed', status);
      } else {
        this.logger?.warn('Health check failed', status);
      }
    });

    this.logger?.info('Health monitoring started');
  }
}

/**
 * Application entry point
 */
async function startServer(): Promise<void> {
  const app = new UnifiedPIMMain();
  await app.main();
}

// Start the server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { UnifiedPIMMain, startServer };
