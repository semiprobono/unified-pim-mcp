import { Tool, Resource } from '@modelcontextprotocol/sdk/types.js';
import { PlatformAdapterManager } from '../../adapters/PlatformAdapterManager.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { SecurityManager } from '../../../shared/security/SecurityManager.js';
import { Logger } from '../../../shared/logging/Logger.js';
import { ErrorHandler } from '../../../shared/error/ErrorHandler.js';
import { Platform } from '../../../domain/value-objects/Platform.js';
import { GraphAdapter } from '../../adapters/microsoft/GraphAdapter.js';
import { EmailQueryOptions } from '../../adapters/microsoft/services/EmailService.js';

/**
 * Main Unified PIM MCP Server implementation
 * Orchestrates all platform operations and provides MCP interface
 */
export class UnifiedPIMServer {
  constructor(
    private readonly platformManager: PlatformAdapterManager,
    private readonly cacheManager: CacheManager,
    private readonly securityManager: SecurityManager,
    private readonly logger: Logger,
    private readonly errorHandler: ErrorHandler
  ) {}

  /**
   * Get available tools
   */
  async getAvailableTools(): Promise<Tool[]> {
    return [
      // Authentication tools
      {
        name: 'pim_auth_start',
        description: 'Start OAuth2 authentication flow for a platform',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'], description: 'Platform to authenticate with' },
            userId: { type: 'string', description: 'Optional user ID for tracking' }
          },
          required: ['platform']
        }
      },
      {
        name: 'pim_auth_callback',
        description: 'Handle OAuth2 callback with authorization code',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'] },
            code: { type: 'string', description: 'Authorization code from OAuth callback' },
            state: { type: 'string', description: 'State parameter from OAuth callback' }
          },
          required: ['platform', 'code', 'state']
        }
      },
      {
        name: 'pim_auth_status',
        description: 'Check authentication status for platforms',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'], description: 'Optional platform filter' }
          }
        }
      },
      // Email tools
      {
        name: 'pim_email_search',
        description: 'Search emails with advanced filters',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query string' },
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'], default: 'microsoft' },
            folder: { type: 'string', description: 'Email folder to search in' },
            from: { type: 'string', description: 'Filter by sender email' },
            to: { type: 'string', description: 'Filter by recipient email' },
            subject: { type: 'string', description: 'Filter by subject line' },
            hasAttachments: { type: 'boolean', description: 'Filter by attachment presence' },
            isRead: { type: 'boolean', description: 'Filter by read status' },
            importance: { type: 'string', enum: ['low', 'normal', 'high'], description: 'Filter by importance' },
            dateFrom: { type: 'string', format: 'date-time', description: 'Filter by date from' },
            dateTo: { type: 'string', format: 'date-time', description: 'Filter by date to' },
            categories: { type: 'array', items: { type: 'string' }, description: 'Filter by categories' },
            limit: { type: 'number', default: 25, minimum: 1, maximum: 100 },
            skip: { type: 'number', default: 0, minimum: 0 }
          }
        }
      },
      {
        name: 'pim_email_get',
        description: 'Get a specific email by ID',
        inputSchema: {
          type: 'object',
          properties: {
            emailId: { type: 'string', description: 'Email ID' },
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'], default: 'microsoft' }
          },
          required: ['emailId']
        }
      },
      {
        name: 'pim_email_send',
        description: 'Send a new email',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'array', items: { type: 'string' }, description: 'Recipient email addresses' },
            cc: { type: 'array', items: { type: 'string' }, description: 'CC email addresses' },
            bcc: { type: 'array', items: { type: 'string' }, description: 'BCC email addresses' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body content' },
            bodyType: { type: 'string', enum: ['text', 'html'], default: 'text' },
            importance: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal' },
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'], default: 'microsoft' }
          },
          required: ['to', 'subject', 'body']
        }
      },
      {
        name: 'pim_email_reply',
        description: 'Reply to an email',
        inputSchema: {
          type: 'object',
          properties: {
            emailId: { type: 'string', description: 'ID of email to reply to' },
            body: { type: 'string', description: 'Reply body content' },
            bodyType: { type: 'string', enum: ['text', 'html'], default: 'text' },
            replyAll: { type: 'boolean', default: false, description: 'Reply to all recipients' },
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'], default: 'microsoft' }
          },
          required: ['emailId', 'body']
        }
      },
      {
        name: 'pim_email_mark_read',
        description: 'Mark email as read or unread',
        inputSchema: {
          type: 'object',
          properties: {
            emailId: { type: 'string', description: 'Email ID' },
            isRead: { type: 'boolean', default: true, description: 'Mark as read (true) or unread (false)' },
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'], default: 'microsoft' }
          },
          required: ['emailId']
        }
      },
      {
        name: 'pim_email_delete',
        description: 'Delete an email',
        inputSchema: {
          type: 'object',
          properties: {
            emailId: { type: 'string', description: 'Email ID' },
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'], default: 'microsoft' }
          },
          required: ['emailId']
        }
      },
      // Calendar tools (placeholder)
      {
        name: 'pim_calendar_create_event',
        description: 'Create a calendar event',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title' },
            start: { type: 'string', format: 'date-time', description: 'Start time (ISO 8601)' },
            end: { type: 'string', format: 'date-time', description: 'End time (ISO 8601)' },
            location: { type: 'string', description: 'Event location' },
            description: { type: 'string', description: 'Event description' },
            attendees: { type: 'array', items: { type: 'string' }, description: 'Attendee email addresses' },
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'], default: 'microsoft' }
          },
          required: ['title', 'start', 'end']
        }
      }
    ];
  }

  /**
   * Execute a tool
   */
  async executeTool(name: string, args: any): Promise<any> {
    this.logger.info(`Executing tool: ${name}`, { args });
    
    try {
      switch (name) {
        // Authentication tools
        case 'pim_auth_start':
          return await this.startAuthentication(args);
        case 'pim_auth_callback':
          return await this.handleAuthCallback(args);
        case 'pim_auth_status':
          return await this.getAuthStatus(args);
          
        // Email tools
        case 'pim_email_search':
          return await this.searchEmails(args);
        case 'pim_email_get':
          return await this.getEmail(args);
        case 'pim_email_send':
          return await this.sendEmail(args);
        case 'pim_email_reply':
          return await this.replyToEmail(args);
        case 'pim_email_mark_read':
          return await this.markEmailRead(args);
        case 'pim_email_delete':
          return await this.deleteEmail(args);
          
        // Calendar tools
        case 'pim_calendar_create_event':
          return await this.createCalendarEvent(args);
          
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Tool execution failed: ${name}`, error);
      throw error;
    }
  }

  /**
   * Get available resources
   */
  async getAvailableResources(): Promise<Resource[]> {
    return [
      {
        uri: 'pim://status',
        name: 'PIM Server Status',
        description: 'Current status of the PIM server and platform connections',
        mimeType: 'application/json'
      }
    ];
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<any[]> {
    this.logger.info(`Reading resource: ${uri}`);
    
    switch (uri) {
      case 'pim://status':
        return [{
          type: 'text',
          text: JSON.stringify({
            status: 'running',
            platforms: await this.platformManager.getStatus(),
            cache: await this.cacheManager.getStatus(),
            security: await this.securityManager.getStatus()
          }, null, 2)
        }];
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  // Authentication methods
  
  /**
   * Start OAuth2 authentication flow
   */
  private async startAuthentication(args: any): Promise<any> {
    const { platform, userId } = args;
    
    try {
      const adapter = this.platformManager.getAdapter(platform as Platform);
      if (!adapter) {
        throw new Error(`Platform ${platform} not available or not configured`);
      }

      const authUrl = await (adapter as GraphAdapter).startAuthentication(userId);
      
      return {
        content: [{
          type: 'text',
          text: `Authentication URL generated for ${platform}. Please visit the following URL to authenticate:\n\n${authUrl}`
        }]
      };
    } catch (error) {
      this.logger.error(`Authentication failed for ${platform}`, error);
      return {
        content: [{
          type: 'text',
          text: `Failed to start authentication for ${platform}: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  /**
   * Handle OAuth2 callback
   */
  private async handleAuthCallback(args: any): Promise<any> {
    const { platform, code, state } = args;
    
    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter) {
        throw new Error(`Platform ${platform} not available`);
      }

      const success = await adapter.handleAuthCallback(code, state);
      
      return {
        content: [{
          type: 'text',
          text: success ? 
            `Successfully authenticated with ${platform}!` : 
            `Authentication failed for ${platform}. Please try again.`
        }]
      };
    } catch (error) {
      this.logger.error(`Auth callback failed for ${platform}`, error);
      return {
        content: [{
          type: 'text',
          text: `Authentication callback failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  /**
   * Get authentication status
   */
  private async getAuthStatus(args: any): Promise<any> {
    try {
      const status = await this.platformManager.getStatus();
      const { platform } = args;
      
      if (platform) {
        const platformStatus = status[platform as Platform];
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              platform,
              ...platformStatus
            }, null, 2)
          }]
        };
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(status, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to get auth status: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  // Email methods

  /**
   * Search emails implementation
   */
  private async searchEmails(args: any): Promise<any> {
    const { platform = 'microsoft', ...options } = args;
    
    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter) {
        throw new Error(`Platform ${platform} not available`);
      }

      if (!adapter.isAuthenticated) {
        return {
          content: [{
            type: 'text',
            text: `Not authenticated with ${platform}. Please run pim_auth_start first.`
          }]
        };
      }

      // For Microsoft Graph, we need to access the EmailService directly
      // This is a temporary approach - in a full implementation, 
      // the adapter would expose email operations directly
      const result = await adapter.searchEmails(options.query, {
        limit: options.limit,
        skip: options.skip,
        dateRange: options.dateFrom && options.dateTo ? {
          start: new Date(options.dateFrom),
          end: new Date(options.dateTo)
        } : undefined
      });

      if (!result.success) {
        return {
          content: [{
            type: 'text',
            text: `Email search failed: ${result.error}`
          }]
        };
      }

      // For now, return basic search info since full implementation is pending
      return {
        content: [{
          type: 'text',
          text: `Email search executed for query: "${options.query}" on ${platform}\nResults: Implementation pending - would return filtered emails`
        }]
      };
      
    } catch (error) {
      this.logger.error('Email search failed', error);
      return {
        content: [{
          type: 'text',
          text: `Email search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  /**
   * Get specific email
   */
  private async getEmail(args: any): Promise<any> {
    const { emailId, platform = 'microsoft' } = args;
    
    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [{
            type: 'text',
            text: `Not authenticated with ${platform}`
          }]
        };
      }

      const result = await adapter.getEmail(emailId);
      
      if (!result.success) {
        return {
          content: [{
            type: 'text',
            text: `Failed to get email: ${result.error}`
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Get email ${emailId}: Implementation pending - would return email details`
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to get email: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  /**
   * Send email
   */
  private async sendEmail(args: any): Promise<any> {
    const { platform = 'microsoft', ...emailData } = args;
    
    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [{
            type: 'text',
            text: `Not authenticated with ${platform}`
          }]
        };
      }

      const result = await adapter.sendEmail(emailData);
      
      if (!result.success) {
        return {
          content: [{
            type: 'text',
            text: `Failed to send email: ${result.error}`
          }]
        };
      }

      return {
        content: [{
          type: 'text',
          text: `Send email: Implementation pending - would send email with subject "${emailData.subject}"`
        }]
      };
      
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  /**
   * Reply to email
   */
  private async replyToEmail(args: any): Promise<any> {
    const { emailId, body, replyAll = false, platform = 'microsoft' } = args;
    
    return {
      content: [{
        type: 'text',
        text: `Reply to email ${emailId}: Implementation pending - would ${replyAll ? 'reply all' : 'reply'} with message`
      }]
    };
  }

  /**
   * Mark email as read
   */
  private async markEmailRead(args: any): Promise<any> {
    const { emailId, isRead = true, platform = 'microsoft' } = args;
    
    return {
      content: [{
        type: 'text',
        text: `Mark email ${emailId} as ${isRead ? 'read' : 'unread'}: Implementation pending`
      }]
    };
  }

  /**
   * Delete email
   */
  private async deleteEmail(args: any): Promise<any> {
    const { emailId, platform = 'microsoft' } = args;
    
    return {
      content: [{
        type: 'text',
        text: `Delete email ${emailId}: Implementation pending`
      }]
    };
  }

  /**
   * Create calendar event implementation
   */
  private async createCalendarEvent(args: any): Promise<any> {
    const { platform = 'microsoft', ...eventData } = args;
    
    return {
      content: [{
        type: 'text',
        text: `Creating event "${eventData.title}" from ${eventData.start} to ${eventData.end}: Implementation pending`
      }]
    };
  }
}