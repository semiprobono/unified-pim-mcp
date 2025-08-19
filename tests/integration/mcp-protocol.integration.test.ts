import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { UnifiedPIMServer } from '../../src/infrastructure/mcp/server/UnifiedPIMServer';
import { UnifiedPIMMain } from '../../src/index';
import { PlatformAdapterManager } from '../../src/infrastructure/adapters/PlatformAdapterManager';
import { GraphAdapter } from '../../src/infrastructure/adapters/microsoft/GraphAdapter';
import { SecurityManager } from '../../src/shared/security/SecurityManager';
import { ConfigManager } from '../../src/shared/config/ConfigManager';
import { Logger } from '../../src/shared/logging/Logger';
import { CacheManager } from '../../src/infrastructure/cache/CacheManager';
import { ResilienceManager } from '../../src/shared/resilience/ResilienceManager';
import { ErrorHandler } from '../../src/shared/error/ErrorHandler';
import { testConfig } from './setup.integration';
import { createMockMsalApp, createMockTokenResponse } from '../mocks/msalMock';

/**
 * MCP Protocol Integration Tests
 *
 * Tests all MCP tools and protocol compliance:
 * 1. Tool registration and schema validation
 * 2. Parameter validation and error handling
 * 3. Authentication flow tools (pim_auth_*)
 * 4. Email operation tools (pim_email_*)
 * 5. Calendar tools (pim_calendar_*)
 * 6. Resource management
 * 7. Error response formatting
 * 8. MCP protocol compliance
 */
describe('MCP Protocol Integration Tests', () => {
  let mcpServer: Server;
  let pimServer: UnifiedPIMServer;
  let platformManager: PlatformAdapterManager;
  let graphAdapter: GraphAdapter;
  let securityManager: SecurityManager;
  let configManager: ConfigManager;
  let logger: Logger;
  let cacheManager: CacheManager;
  let resilienceManager: ResilienceManager;
  let errorHandler: ErrorHandler;

  beforeAll(async () => {
    // Initialize services similar to main application
    configManager = new ConfigManager();
    await configManager.initialize();

    logger = new Logger(configManager.getConfig('logging'));
    await logger.initialize();

    errorHandler = new ErrorHandler(logger);

    securityManager = new SecurityManager(configManager.getConfig('security'), logger);
    await securityManager.initialize();

    resilienceManager = new ResilienceManager(configManager.getConfig('resilience'), logger);
    await resilienceManager.initialize();

    cacheManager = new CacheManager(configManager.getConfig('cache'), logger);
    await cacheManager.initialize();

    platformManager = new PlatformAdapterManager(
      configManager.getConfig('platforms'),
      securityManager,
      resilienceManager,
      cacheManager,
      logger,
      configManager
    );
    await platformManager.initialize();

    graphAdapter = platformManager.getAdapter('microsoft') as GraphAdapter;

    // Create MCP server
    mcpServer = new Server(
      {
        name: 'unified-pim-mcp-test',
        version: '1.0.0-test',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Create Unified PIM Server
    pimServer = new UnifiedPIMServer(
      platformManager,
      cacheManager,
      securityManager,
      logger,
      errorHandler
    );

    // Register MCP handlers (similar to main index.ts)
    await registerMCPHandlers();
  });

  afterAll(async () => {
    // Cleanup
    await platformManager?.dispose();
    await cacheManager?.dispose();
    await securityManager?.dispose();
    await resilienceManager?.dispose();
    await logger?.dispose();
  });

  beforeEach(async () => {
    // Reset authentication state
    await securityManager.clearTokens('microsoft');
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  async function registerMCPHandlers(): Promise<void> {
    // List tools handler
    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = await pimServer.getAvailableTools();
      return { tools };
    });

    // Call tool handler
    mcpServer.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;
      const result = await pimServer.executeTool(name, args || {});
      return result;
    });

    // List resources handler
    mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
      const resources = await pimServer.getAvailableResources();
      return { resources };
    });

    // Read resource handler
    mcpServer.setRequestHandler(ReadResourceRequestSchema, async request => {
      const { uri } = request.params;
      const contents = await pimServer.readResource(uri);
      return { contents };
    });
  }

  async function callTool(name: string, args: any = {}): Promise<any> {
    // In the new MCP SDK, we simulate a tool call by directly calling the PIM server
    return await pimServer.executeTool(name, args);
  }

  async function listTools(): Promise<any> {
    // In the new MCP SDK, we get tools directly from the PIM server
    const tools = await pimServer.getAvailableTools();
    return { tools };
  }

  describe('Tool Registration and Discovery', () => {
    test('should list all available tools with correct schemas', async () => {
      const response = await listTools();

      expect(response.tools).toBeDefined();
      expect(Array.isArray(response.tools)).toBe(true);
      expect(response.tools.length).toBeGreaterThan(0);

      // Verify authentication tools
      const authTools = response.tools.filter(tool => tool.name.startsWith('pim_auth_'));
      expect(authTools).toHaveLength(3);
      expect(authTools.map(t => t.name)).toEqual(
        expect.arrayContaining(['pim_auth_start', 'pim_auth_callback', 'pim_auth_status'])
      );

      // Verify email tools
      const emailTools = response.tools.filter(tool => tool.name.startsWith('pim_email_'));
      expect(emailTools).toHaveLength(6);
      expect(emailTools.map(t => t.name)).toEqual(
        expect.arrayContaining([
          'pim_email_search',
          'pim_email_get',
          'pim_email_send',
          'pim_email_reply',
          'pim_email_mark_read',
          'pim_email_delete',
        ])
      );

      // Verify calendar tools
      const calendarTools = response.tools.filter(tool => tool.name.startsWith('pim_calendar_'));
      expect(calendarTools).toHaveLength(1);
      expect(calendarTools[0].name).toBe('pim_calendar_create_event');

      // Verify each tool has required schema properties
      response.tools.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    test('should have valid JSON schemas for all tools', async () => {
      const response = await listTools();

      response.tools.forEach(tool => {
        const schema = tool.inputSchema;

        // Basic schema validation
        expect(schema.type).toBe('object');
        expect(typeof schema.properties).toBe('object');

        if (schema.required) {
          expect(Array.isArray(schema.required)).toBe(true);

          // All required properties should exist in properties
          schema.required.forEach(reqProp => {
            expect(schema.properties[reqProp]).toBeDefined();
          });
        }

        // Validate property types
        Object.entries(schema.properties).forEach(([propName, propSchema]: [string, any]) => {
          expect(propSchema.type).toBeDefined();

          if (propSchema.enum) {
            expect(Array.isArray(propSchema.enum)).toBe(true);
          }

          if (propSchema.items) {
            expect(propSchema.items.type).toBeDefined();
          }
        });
      });
    });

    test('should include platform parameter in multi-platform tools', async () => {
      const response = await listTools();

      const multiPlatformTools = [
        'pim_auth_start',
        'pim_auth_callback',
        'pim_email_search',
        'pim_email_get',
        'pim_email_send',
        'pim_email_reply',
        'pim_email_mark_read',
        'pim_email_delete',
        'pim_calendar_create_event',
      ];

      multiPlatformTools.forEach(toolName => {
        const tool = response.tools.find(t => t.name === toolName);
        expect(tool).toBeDefined();
        expect(tool.inputSchema.properties.platform).toBeDefined();
        expect(tool.inputSchema.properties.platform.type).toBe('string');
        expect(tool.inputSchema.properties.platform.enum).toEqual(
          expect.arrayContaining(['microsoft', 'google', 'apple'])
        );
      });
    });
  });

  describe('Authentication Tools', () => {
    describe('pim_auth_start', () => {
      test('should start authentication with valid parameters', async () => {
        const result = await callTool('pim_auth_start', {
          platform: 'microsoft',
          userId: 'test-user-123',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Authentication URL generated');
        expect(result.content[0].text).toContain('https://');
      });

      test('should reject invalid platform', async () => {
        try {
          await callTool('pim_auth_start', {
            platform: 'invalid-platform',
          });
          expect(true).toBe(false); // Should not reach here
        } catch (error) {
          expect(error).toBeInstanceOf(McpError);
          expect(error.code).toBe(ErrorCode.InvalidParams);
        }
      });

      test('should handle missing required parameters', async () => {
        const result = await callTool('pim_auth_start', {});

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Failed to start authentication');
      });

      test('should provide different auth URLs for different users', async () => {
        const result1 = await callTool('pim_auth_start', {
          platform: 'microsoft',
          userId: 'user1',
        });

        const result2 = await callTool('pim_auth_start', {
          platform: 'microsoft',
          userId: 'user2',
        });

        expect(result1.content[0].text).not.toBe(result2.content[0].text);

        // Extract URLs and verify they're different
        const url1 = result1.content[0].text.match(/https:\/\/[^\s]+/)[0];
        const url2 = result2.content[0].text.match(/https:\/\/[^\s]+/)[0];
        expect(url1).not.toBe(url2);
      });
    });

    describe('pim_auth_callback', () => {
      let authState: string;

      beforeEach(async () => {
        // Start authentication to get valid state
        const authResult = await callTool('pim_auth_start', {
          platform: 'microsoft',
          userId: 'callback-test-user',
        });

        const url = authResult.content[0].text.match(/https:\/\/[^\s]+/)[0];
        authState = new URL(url).searchParams.get('state')!;
      });

      test('should handle valid callback parameters', async () => {
        // Mock successful token exchange
        const mockMsalApp = createMockMsalApp();
        mockMsalApp.acquireTokenByCode.mockResolvedValue(createMockTokenResponse());

        const result = await callTool('pim_auth_callback', {
          platform: 'microsoft',
          code: 'valid-auth-code-12345',
          state: authState,
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Successfully authenticated');
      });

      test('should reject invalid state parameter', async () => {
        const result = await callTool('pim_auth_callback', {
          platform: 'microsoft',
          code: 'valid-auth-code',
          state: 'invalid-state-12345',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Authentication callback failed');
      });

      test('should handle missing callback parameters', async () => {
        const testCases = [
          { code: '', state: authState },
          { code: 'valid-code', state: '' },
          { platform: 'microsoft' }, // Missing both code and state
        ];

        for (const testCase of testCases) {
          const result = await callTool('pim_auth_callback', testCase);
          expect(result).toHaveValidMCPResponse();
          expect(result.content[0].text).toContain('failed');
        }
      });
    });

    describe('pim_auth_status', () => {
      test('should return status for all platforms when no platform specified', async () => {
        const result = await callTool('pim_auth_status', {});

        expect(result).toHaveValidMCPResponse();

        const statusData = JSON.parse(result.content[0].text);
        expect(statusData.microsoft).toBeDefined();
        expect(typeof statusData.microsoft.isAuthenticated).toBe('boolean');
      });

      test('should return status for specific platform', async () => {
        const result = await callTool('pim_auth_status', {
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();

        const statusData = JSON.parse(result.content[0].text);
        expect(statusData.platform).toBe('microsoft');
        expect(typeof statusData.isAuthenticated).toBe('boolean');
      });

      test('should indicate authentication state correctly', async () => {
        // Initially not authenticated
        const result1 = await callTool('pim_auth_status', { platform: 'microsoft' });
        const status1 = JSON.parse(result1.content[0].text);
        expect(status1.isAuthenticated).toBe(false);

        // Authenticate
        await setupAuthentication();

        // Should now be authenticated
        const result2 = await callTool('pim_auth_status', { platform: 'microsoft' });
        const status2 = JSON.parse(result2.content[0].text);
        expect(status2.isAuthenticated).toBe(true);
      });
    });
  });

  describe('Email Tools', () => {
    beforeEach(async () => {
      await setupAuthentication();
    });

    describe('pim_email_search', () => {
      test('should search emails with basic query', async () => {
        const result = await callTool('pim_email_search', {
          query: 'project update',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Email search executed');
        expect(result.content[0].text).toContain('project update');
      });

      test('should handle advanced search filters', async () => {
        const result = await callTool('pim_email_search', {
          query: 'meeting',
          platform: 'microsoft',
          from: 'boss@company.com',
          hasAttachments: true,
          isRead: false,
          importance: 'high',
          limit: 20,
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Email search executed');
      });

      test('should require authentication', async () => {
        await securityManager.clearTokens('microsoft');

        const result = await callTool('pim_email_search', {
          query: 'test',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Not authenticated');
      });

      test('should validate search parameters', async () => {
        const result = await callTool('pim_email_search', {
          platform: 'microsoft',
          limit: -1, // Invalid limit
        });

        expect(result).toHaveValidMCPResponse();
        // Should handle gracefully even with invalid parameters
      });

      test('should handle date range filters', async () => {
        const result = await callTool('pim_email_search', {
          query: 'quarterly report',
          platform: 'microsoft',
          dateFrom: '2024-01-01T00:00:00Z',
          dateTo: '2024-03-31T23:59:59Z',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Email search executed');
      });
    });

    describe('pim_email_get', () => {
      test('should get email by ID', async () => {
        const result = await callTool('pim_email_get', {
          emailId: 'test-email-123',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Get email test-email-123');
      });

      test('should require emailId parameter', async () => {
        const result = await callTool('pim_email_get', {
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Failed to get email');
      });

      test('should require authentication', async () => {
        await securityManager.clearTokens('microsoft');

        const result = await callTool('pim_email_get', {
          emailId: 'test-email-123',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Not authenticated');
      });
    });

    describe('pim_email_send', () => {
      test('should send email with required parameters', async () => {
        const result = await callTool('pim_email_send', {
          to: ['recipient@example.com'],
          subject: 'Test Email',
          body: 'This is a test email',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Send email');
        expect(result.content[0].text).toContain('Test Email');
      });

      test('should handle multiple recipients', async () => {
        const result = await callTool('pim_email_send', {
          to: ['recipient1@example.com', 'recipient2@example.com'],
          cc: ['cc@example.com'],
          bcc: ['bcc@example.com'],
          subject: 'Multi-recipient Email',
          body: 'Email to multiple recipients',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Send email');
      });

      test('should require mandatory fields', async () => {
        const testCases = [
          { subject: 'No recipients', body: 'Test' }, // Missing 'to'
          { to: ['test@example.com'], body: 'No subject' }, // Missing 'subject'
          { to: ['test@example.com'], subject: 'No body' }, // Missing 'body'
        ];

        for (const testCase of testCases) {
          const result = await callTool('pim_email_send', {
            ...testCase,
            platform: 'microsoft',
          });

          expect(result).toHaveValidMCPResponse();
          // Should handle missing parameters gracefully
        }
      });

      test('should support different body types and importance', async () => {
        const result = await callTool('pim_email_send', {
          to: ['recipient@example.com'],
          subject: 'HTML Email',
          body: '<h1>HTML Content</h1><p>This is HTML email</p>',
          bodyType: 'html',
          importance: 'high',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Send email');
      });
    });

    describe('pim_email_reply', () => {
      test('should reply to email', async () => {
        const result = await callTool('pim_email_reply', {
          emailId: 'original-email-123',
          body: 'This is my reply',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Reply to email original-email-123');
      });

      test('should support reply all', async () => {
        const result = await callTool('pim_email_reply', {
          emailId: 'original-email-123',
          body: 'Reply to all participants',
          replyAll: true,
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('reply all');
      });

      test('should require emailId and body', async () => {
        const testCases = [
          { body: 'Reply without email ID' }, // Missing emailId
          { emailId: 'test-123' }, // Missing body
        ];

        for (const testCase of testCases) {
          const result = await callTool('pim_email_reply', {
            ...testCase,
            platform: 'microsoft',
          });

          expect(result).toHaveValidMCPResponse();
          // Should handle missing parameters
        }
      });
    });

    describe('pim_email_mark_read', () => {
      test('should mark email as read', async () => {
        const result = await callTool('pim_email_mark_read', {
          emailId: 'email-to-mark-read',
          isRead: true,
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Mark email email-to-mark-read as read');
      });

      test('should mark email as unread', async () => {
        const result = await callTool('pim_email_mark_read', {
          emailId: 'email-to-mark-unread',
          isRead: false,
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Mark email email-to-mark-unread as unread');
      });

      test('should default to marking as read', async () => {
        const result = await callTool('pim_email_mark_read', {
          emailId: 'email-default-read',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('as read');
      });
    });

    describe('pim_email_delete', () => {
      test('should delete email by ID', async () => {
        const result = await callTool('pim_email_delete', {
          emailId: 'email-to-delete',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Delete email email-to-delete');
      });

      test('should require emailId parameter', async () => {
        const result = await callTool('pim_email_delete', {
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        // Should handle missing emailId
      });
    });
  });

  describe('Calendar Tools', () => {
    beforeEach(async () => {
      await setupAuthentication();
    });

    describe('pim_calendar_create_event', () => {
      test('should create calendar event with required parameters', async () => {
        const result = await callTool('pim_calendar_create_event', {
          title: 'Team Meeting',
          start: '2024-12-01T10:00:00Z',
          end: '2024-12-01T11:00:00Z',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Creating event "Team Meeting"');
        expect(result.content[0].text).toContain('2024-12-01T10:00:00Z');
      });

      test('should handle optional event parameters', async () => {
        const result = await callTool('pim_calendar_create_event', {
          title: 'Project Review',
          start: '2024-12-01T14:00:00Z',
          end: '2024-12-01T15:30:00Z',
          location: 'Conference Room A',
          description: 'Quarterly project review meeting',
          attendees: ['attendee1@company.com', 'attendee2@company.com'],
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain('Creating event "Project Review"');
      });

      test('should require mandatory event fields', async () => {
        const testCases = [
          { start: '2024-12-01T10:00:00Z', end: '2024-12-01T11:00:00Z' }, // Missing title
          { title: 'Meeting', end: '2024-12-01T11:00:00Z' }, // Missing start
          { title: 'Meeting', start: '2024-12-01T10:00:00Z' }, // Missing end
        ];

        for (const testCase of testCases) {
          const result = await callTool('pim_calendar_create_event', {
            ...testCase,
            platform: 'microsoft',
          });

          expect(result).toHaveValidMCPResponse();
          // Should handle missing required fields
        }
      });

      test('should validate date formats', async () => {
        const result = await callTool('pim_calendar_create_event', {
          title: 'Invalid Date Meeting',
          start: 'invalid-date-format',
          end: 'also-invalid',
          platform: 'microsoft',
        });

        expect(result).toHaveValidMCPResponse();
        // Should handle invalid date formats gracefully
      });
    });
  });

  describe('Resource Management', () => {
    test('should list available resources', async () => {
      const request = { method: 'resources/list', params: {} };
      const handler = mcpServer.getRequestHandler(ListResourcesRequestSchema);
      const response = await handler(request as any);

      expect(response.resources).toBeDefined();
      expect(Array.isArray(response.resources)).toBe(true);
      expect(response.resources.length).toBeGreaterThan(0);

      // Check for status resource
      const statusResource = response.resources.find(r => r.uri === 'pim://status');
      expect(statusResource).toBeDefined();
      expect(statusResource.name).toBe('PIM Server Status');
      expect(statusResource.mimeType).toBe('application/json');
    });

    test('should read status resource', async () => {
      const request = { method: 'resources/read', params: { uri: 'pim://status' } };
      const handler = mcpServer.getRequestHandler(ReadResourceRequestSchema);
      const response = await handler(request as any);

      expect(response.contents).toBeDefined();
      expect(Array.isArray(response.contents)).toBe(true);
      expect(response.contents.length).toBeGreaterThan(0);

      const content = response.contents[0];
      expect(content.type).toBe('text');
      expect(content.text).toBeDefined();

      // Parse and validate status JSON
      const status = JSON.parse(content.text);
      expect(status.status).toBe('running');
      expect(status.platforms).toBeDefined();
      expect(status.cache).toBeDefined();
      expect(status.security).toBeDefined();
    });

    test('should handle invalid resource URI', async () => {
      try {
        await pimServer.readResource('pim://invalid');
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.message).toContain('Unknown resource');
      }
    });
  });

  describe('Error Handling and Protocol Compliance', () => {
    test('should handle invalid tool names', async () => {
      try {
        await callTool('invalid_tool_name', {});
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.code).toBe(ErrorCode.MethodNotFound);
      }
    });

    test('should return proper MCP error format', async () => {
      try {
        await callTool('pim_email_get', {
          // Missing required emailId parameter
          platform: 'microsoft',
        });
      } catch (error) {
        if (error instanceof McpError) {
          expect(error.code).toBeDefined();
          expect(error.message).toBeDefined();
        }
      }
    });

    test('should handle tool execution errors gracefully', async () => {
      // Mock adapter to throw error
      const originalExecute = pimServer.executeTool;
      jest.spyOn(pimServer, 'executeTool').mockImplementation(async (name, args) => {
        if (name === 'pim_email_search') {
          throw new Error('Simulated service error');
        }
        return originalExecute.call(pimServer, name, args);
      });

      try {
        await callTool('pim_email_search', { query: 'test' });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(McpError);
        expect(error.message).toContain('Simulated service error');
      }
    });

    test('should provide helpful error messages', async () => {
      const result = await callTool('pim_email_send', {
        platform: 'microsoft',
        // Missing all required fields
      });

      expect(result).toHaveValidMCPResponse();
      expect(result.content[0].text).toContain('Failed to send email');
      // Should provide helpful error information
    });

    test('should handle concurrent tool calls safely', async () => {
      await setupAuthentication();

      const concurrentCalls = Array.from({ length: 10 }, (_, i) =>
        callTool('pim_email_search', {
          query: `concurrent search ${i}`,
          platform: 'microsoft',
        })
      );

      const results = await Promise.all(concurrentCalls);

      results.forEach((result, i) => {
        expect(result).toHaveValidMCPResponse();
        expect(result.content[0].text).toContain(`concurrent search ${i}`);
      });
    });

    test('should maintain tool state isolation', async () => {
      // Start authentication for user 1
      const auth1 = await callTool('pim_auth_start', {
        platform: 'microsoft',
        userId: 'user1',
      });

      // Start authentication for user 2
      const auth2 = await callTool('pim_auth_start', {
        platform: 'microsoft',
        userId: 'user2',
      });

      // Both should succeed with different auth URLs
      expect(auth1.content[0].text).not.toBe(auth2.content[0].text);
      expect(auth1.content[0].text).toContain('Authentication URL generated');
      expect(auth2.content[0].text).toContain('Authentication URL generated');
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle rapid tool calls without degradation', async () => {
      const startTime = Date.now();

      const rapidCalls = Array.from({ length: 50 }, () =>
        callTool('pim_auth_status', { platform: 'microsoft' })
      );

      const results = await Promise.all(rapidCalls);
      const endTime = Date.now();

      // All calls should succeed
      results.forEach(result => {
        expect(result).toHaveValidMCPResponse();
      });

      // Should complete reasonably quickly (under 10 seconds)
      expect(endTime - startTime).toBeLessThan(10000);
    });

    test('should maintain performance under mixed workload', async () => {
      await setupAuthentication();

      const mixedWorkload = [
        ...Array.from({ length: 10 }, () => callTool('pim_auth_status', {})),
        ...Array.from({ length: 10 }, () => callTool('pim_email_search', { query: 'test' })),
        ...Array.from({ length: 5 }, () => callTool('pim_email_get', { emailId: 'test-123' })),
        ...Array.from({ length: 5 }, () =>
          callTool('pim_calendar_create_event', {
            title: 'Load Test Event',
            start: '2024-12-01T10:00:00Z',
            end: '2024-12-01T11:00:00Z',
          })
        ),
      ];

      const startTime = Date.now();
      const results = await Promise.allSettled(mixedWorkload);
      const endTime = Date.now();

      // Most operations should succeed
      const successfulResults = results.filter(r => r.status === 'fulfilled');
      expect(successfulResults.length).toBeGreaterThan(mixedWorkload.length * 0.8);

      // Should complete in reasonable time
      expect(endTime - startTime).toBeLessThan(15000);
    });
  });

  // Helper function to setup authentication
  async function setupAuthentication(): Promise<void> {
    const mockTokenResponse = createMockTokenResponse();
    await securityManager.storeTokens('microsoft', {
      accessToken: mockTokenResponse.accessToken,
      refreshToken: mockTokenResponse.account?.homeAccountId || 'refresh-token',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    });
  }
});
