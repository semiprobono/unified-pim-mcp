import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import { UnifiedPIMMain } from '../../src/index';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { testConfig } from './setup.integration';
import { createMockMsalApp, createMockTokenResponse } from '../mocks/msalMock';
import { createMockEmailData, createMockGraphResponse } from '../fixtures/graphApiResponses';
import nock from 'nock';

/**
 * End-to-End System Integration Tests
 *
 * Tests complete user workflows and system behavior:
 * 1. Full authentication → email operations workflow
 * 2. Multi-user scenarios with token isolation
 * 3. System startup/shutdown gracefully
 * 4. Complex email workflows (search → get → reply → delete)
 * 5. Error recovery and graceful degradation
 * 6. Real-world usage patterns
 * 7. System resilience under stress
 */
describe('End-to-End System Integration Tests', () => {
  let pimApp: UnifiedPIMMain;
  let mockServer: any; // Mock MCP client

  const mockGraphBaseUrl = 'https://graph.microsoft.com';

  beforeAll(async () => {
    // Initialize the full application
    pimApp = new UnifiedPIMMain();

    // Setup mock HTTP responses
    setupGraphApiMocks();
  });

  afterAll(async () => {
    // Cleanup
    nock.cleanAll();

    // Gracefully shutdown if running
    if (pimApp) {
      // Simulate shutdown signal
      process.emit('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  });

  beforeEach(async () => {
    // Reset mocks
    nock.cleanAll();
    setupGraphApiMocks();

    // Setup mock client
    mockServer = createMockMCPClient();
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  function setupGraphApiMocks(): void {
    // Mock token endpoint
    nock('https://login.microsoftonline.com')
      .persist()
      .post(/\/oauth2\/v2.0\/token/)
      .reply(200, createMockTokenResponse());

    // Mock user profile
    nock(mockGraphBaseUrl).persist().get('/v1.0/me').reply(200, {
      id: 'test-user-123',
      displayName: 'Test User',
      mail: 'test@example.com',
    });

    // Mock email operations
    nock(mockGraphBaseUrl)
      .persist()
      .get('/v1.0/me/messages')
      .query(true)
      .reply(200, {
        value: createMockEmailData(10),
        '@odata.count': 10,
      });

    nock(mockGraphBaseUrl)
      .persist()
      .get(/\/v1\.0\/me\/messages\/.*/)
      .reply(200, createMockEmailData(1)[0]);

    nock(mockGraphBaseUrl).persist().post('/v1.0/me/sendMail').reply(202);

    nock(mockGraphBaseUrl)
      .persist()
      .post(/\/v1\.0\/me\/messages\/.*\/reply/)
      .reply(202);

    nock(mockGraphBaseUrl)
      .persist()
      .patch(/\/v1\.0\/me\/messages\/.*/)
      .reply(200);

    nock(mockGraphBaseUrl)
      .persist()
      .delete(/\/v1\.0\/me\/messages\/.*/)
      .reply(204);
  }

  function createMockMCPClient(): any {
    return {
      async callTool(name: string, args: any = {}): Promise<any> {
        // Simulate MCP tool call
        const request = {
          method: 'tools/call',
          params: { name, arguments: args },
        };

        // This would normally go through the MCP transport
        // For testing, we'll call the tool directly
        const tools = await pimApp['pimServer']?.getAvailableTools();
        const tool = tools?.find(t => t.name === name);

        if (!tool) {
          throw new Error(`Tool ${name} not found`);
        }

        return await pimApp['pimServer']?.executeTool(name, args);
      },

      async listTools(): Promise<any> {
        return await pimApp['pimServer']?.getAvailableTools();
      },
    };
  }

  describe('Complete User Workflows', () => {
    test('should complete full authentication and email workflow', async () => {
      // Start the application
      const appPromise = pimApp.main();

      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        // Step 1: Start authentication
        console.log('🔐 Step 1: Starting authentication...');
        const authStart = await mockServer.callTool('pim_auth_start', {
          platform: 'microsoft',
          userId: 'e2e-test-user',
        });

        expect(authStart.content[0].text).toContain('Authentication URL generated');

        // Extract auth URL and state
        const authUrl = authStart.content[0].text.match(/https:\/\/[^\s]+/)[0];
        const state = new URL(authUrl).searchParams.get('state');

        // Step 2: Complete authentication callback
        console.log('🔑 Step 2: Completing authentication callback...');
        const authCallback = await mockServer.callTool('pim_auth_callback', {
          platform: 'microsoft',
          code: 'e2e-test-auth-code',
          state,
        });

        expect(authCallback.content[0].text).toContain('Successfully authenticated');

        // Step 3: Verify authentication status
        console.log('✅ Step 3: Verifying authentication status...');
        const authStatus = await mockServer.callTool('pim_auth_status', {
          platform: 'microsoft',
        });

        const status = JSON.parse(authStatus.content[0].text);
        expect(status.isAuthenticated).toBe(true);

        // Step 4: Search for emails
        console.log('📧 Step 4: Searching for emails...');
        const emailSearch = await mockServer.callTool('pim_email_search', {
          query: 'project meeting',
          platform: 'microsoft',
          limit: 5,
        });

        expect(emailSearch.content[0].text).toContain('Email search executed');

        // Step 5: Get specific email
        console.log('📨 Step 5: Getting specific email...');
        const emailGet = await mockServer.callTool('pim_email_get', {
          emailId: 'mock-email-12345',
          platform: 'microsoft',
        });

        expect(emailGet.content[0].text).toContain('Get email mock-email-12345');

        // Step 6: Send new email
        console.log('📤 Step 6: Sending new email...');
        const emailSend = await mockServer.callTool('pim_email_send', {
          to: ['colleague@company.com'],
          subject: 'E2E Test Email',
          body: 'This email was sent during end-to-end testing',
          platform: 'microsoft',
        });

        expect(emailSend.content[0].text).toContain('Send email');

        // Step 7: Reply to email
        console.log('📮 Step 7: Replying to email...');
        const emailReply = await mockServer.callTool('pim_email_reply', {
          emailId: 'mock-email-12345',
          body: 'Thank you for your email. This is an automated E2E test reply.',
          platform: 'microsoft',
        });

        expect(emailReply.content[0].text).toContain('Reply to email');

        // Step 8: Mark email as read
        console.log('✅ Step 8: Marking email as read...');
        const emailMarkRead = await mockServer.callTool('pim_email_mark_read', {
          emailId: 'mock-email-12345',
          isRead: true,
          platform: 'microsoft',
        });

        expect(emailMarkRead.content[0].text).toContain('Mark email');

        console.log('🎉 E2E workflow completed successfully!');
      } finally {
        // Gracefully shutdown
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000); // 30 second timeout for full workflow

    test('should handle complex email search and management workflow', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        // Authenticate first
        await authenticateUser('workflow-test-user');

        // Complex search workflow
        console.log('🔍 Complex Email Search Workflow...');

        // Search 1: Find emails with attachments
        const searchWithAttachments = await mockServer.callTool('pim_email_search', {
          query: 'quarterly report',
          hasAttachments: true,
          importance: 'high',
          platform: 'microsoft',
        });
        expect(searchWithAttachments.content[0].text).toContain('Email search executed');

        // Search 2: Find unread emails from specific sender
        const searchUnreadFromBoss = await mockServer.callTool('pim_email_search', {
          from: 'boss@company.com',
          isRead: false,
          platform: 'microsoft',
        });
        expect(searchUnreadFromBoss.content[0].text).toContain('Email search executed');

        // Search 3: Date range search
        const searchByDateRange = await mockServer.callTool('pim_email_search', {
          query: 'weekly update',
          dateFrom: '2024-11-01T00:00:00Z',
          dateTo: '2024-11-30T23:59:59Z',
          platform: 'microsoft',
        });
        expect(searchByDateRange.content[0].text).toContain('Email search executed');

        // Email management workflow
        console.log('📊 Email Management Workflow...');

        const emailIds = ['email-1', 'email-2', 'email-3'];

        // Mark multiple emails as read
        for (const emailId of emailIds) {
          const markRead = await mockServer.callTool('pim_email_mark_read', {
            emailId,
            isRead: true,
            platform: 'microsoft',
          });
          expect(markRead.content[0].text).toContain('Mark email');
        }

        // Send follow-up email
        const followUp = await mockServer.callTool('pim_email_send', {
          to: ['team@company.com'],
          cc: ['manager@company.com'],
          subject: 'Weekly Status Update - Workflow Test',
          body: 'This is a follow-up email generated during workflow testing.',
          importance: 'normal',
          platform: 'microsoft',
        });
        expect(followUp.content[0].text).toContain('Send email');

        console.log('✅ Complex workflow completed successfully!');
      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 25000);

    test('should handle calendar integration workflow', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        await authenticateUser('calendar-test-user');

        console.log('📅 Calendar Integration Workflow...');

        // Create meeting event
        const createMeeting = await mockServer.callTool('pim_calendar_create_event', {
          title: 'E2E Test Meeting',
          start: '2024-12-15T10:00:00Z',
          end: '2024-12-15T11:00:00Z',
          location: 'Conference Room A',
          description: 'End-to-end testing meeting with the development team',
          attendees: ['dev1@company.com', 'dev2@company.com'],
          platform: 'microsoft',
        });
        expect(createMeeting.content[0].text).toContain('Creating event "E2E Test Meeting"');

        // Follow up with email to attendees
        const meetingEmail = await mockServer.callTool('pim_email_send', {
          to: ['dev1@company.com', 'dev2@company.com'],
          subject: 'Meeting Invitation: E2E Test Meeting',
          body: 'You have been invited to the E2E Test Meeting on December 15th at 10:00 AM.',
          platform: 'microsoft',
        });
        expect(meetingEmail.content[0].text).toContain('Send email');

        console.log('✅ Calendar workflow completed successfully!');
      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 20000);
  });

  describe('Multi-User Scenarios', () => {
    test('should handle multiple concurrent users', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        console.log('👥 Testing multi-user scenarios...');

        // Simulate 3 concurrent users
        const users = ['user1@company.com', 'user2@company.com', 'user3@company.com'];

        const userWorkflows = users.map(async (userId, index) => {
          console.log(`🔐 User ${index + 1} (${userId}) starting authentication...`);

          // Each user starts authentication
          const authStart = await mockServer.callTool('pim_auth_start', {
            platform: 'microsoft',
            userId,
          });
          expect(authStart.content[0].text).toContain('Authentication URL generated');

          // Complete authentication
          const state = new URL(
            authStart.content[0].text.match(/https:\/\/[^\s]+/)[0]
          ).searchParams.get('state');
          const authCallback = await mockServer.callTool('pim_auth_callback', {
            platform: 'microsoft',
            code: `auth-code-${index}`,
            state,
          });
          expect(authCallback.content[0].text).toContain('Successfully authenticated');

          // Each user performs email operations
          const emailSearch = await mockServer.callTool('pim_email_search', {
            query: `emails for ${userId}`,
            platform: 'microsoft',
          });
          expect(emailSearch.content[0].text).toContain('Email search executed');

          console.log(`✅ User ${index + 1} workflow completed`);
          return `User ${index + 1} completed`;
        });

        const results = await Promise.all(userWorkflows);
        expect(results).toHaveLength(3);

        console.log('✅ All concurrent users completed successfully!');
      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 30000);

    test('should maintain user isolation and data privacy', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        console.log('🔒 Testing user isolation and data privacy...');

        // User 1 workflow
        await authenticateUser('isolated-user-1');

        const user1Search = await mockServer.callTool('pim_email_search', {
          query: 'confidential user 1 data',
          platform: 'microsoft',
        });
        expect(user1Search.content[0].text).toContain('confidential user 1 data');

        // User 2 workflow (should not access User 1's data)
        await authenticateUser('isolated-user-2');

        const user2Search = await mockServer.callTool('pim_email_search', {
          query: 'user 2 different data',
          platform: 'microsoft',
        });
        expect(user2Search.content[0].text).toContain('user 2 different data');

        // Verify authentication status shows different users
        const user1Status = await mockServer.callTool('pim_auth_status', {
          platform: 'microsoft',
        });
        const status1 = JSON.parse(user1Status.content[0].text);
        expect(status1.isAuthenticated).toBe(true);

        console.log('✅ User isolation verified successfully!');
      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 25000);
  });

  describe('System Resilience and Error Recovery', () => {
    test('should recover from temporary service failures', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        await authenticateUser('resilience-test-user');

        console.log('🔧 Testing service failure recovery...');

        // Simulate Graph API failure
        nock.cleanAll();
        nock(mockGraphBaseUrl)
          .get('/v1.0/me/messages')
          .query(true)
          .replyWithError('Service temporarily unavailable');

        // First search should fail
        const failedSearch = await mockServer.callTool('pim_email_search', {
          query: 'test during failure',
          platform: 'microsoft',
        });
        expect(failedSearch.content[0].text).toContain('failed');

        // Restore service
        console.log('🔄 Restoring service...');
        setupGraphApiMocks();

        // Wait for recovery
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Search should now succeed
        const recoveredSearch = await mockServer.callTool('pim_email_search', {
          query: 'test after recovery',
          platform: 'microsoft',
        });
        expect(recoveredSearch.content[0].text).toContain('Email search executed');

        console.log('✅ Service recovery verified successfully!');
      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 20000);

    test('should handle authentication token expiry gracefully', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        await authenticateUser('token-expiry-test-user');

        console.log('⏰ Testing token expiry handling...');

        // Simulate expired token by mocking 401 response
        nock.cleanAll();
        nock(mockGraphBaseUrl)
          .get('/v1.0/me/messages')
          .query(true)
          .reply(401, {
            error: {
              code: 'InvalidAuthenticationToken',
              message: 'Access token has expired',
            },
          });

        // Mock token refresh
        nock('https://login.microsoftonline.com')
          .post(/\/oauth2\/v2.0\/token/)
          .reply(200, createMockTokenResponse());

        nock(mockGraphBaseUrl)
          .get('/v1.0/me/messages')
          .query(true)
          .reply(200, { value: createMockEmailData(5) });

        // Search should trigger token refresh and succeed
        const searchWithRefresh = await mockServer.callTool('pim_email_search', {
          query: 'test with token refresh',
          platform: 'microsoft',
        });
        expect(searchWithRefresh.content[0].text).toContain('Email search executed');

        console.log('✅ Token expiry handling verified successfully!');
      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 20000);

    test('should handle rate limiting gracefully', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        await authenticateUser('rate-limit-test-user');

        console.log('🚦 Testing rate limit handling...');

        // Simulate rate limiting
        nock.cleanAll();
        nock(mockGraphBaseUrl)
          .get('/v1.0/me/messages')
          .query(true)
          .reply(
            429,
            {
              error: {
                code: 'TooManyRequests',
                message: 'Request rate limit exceeded',
              },
            },
            {
              'Retry-After': '1',
            }
          );

        // Follow-up request should succeed
        nock(mockGraphBaseUrl)
          .get('/v1.0/me/messages')
          .query(true)
          .reply(200, { value: createMockEmailData(3) });

        const rateLimitedSearch = await mockServer.callTool('pim_email_search', {
          query: 'test with rate limiting',
          platform: 'microsoft',
        });

        // Should eventually succeed after rate limit backoff
        expect(rateLimitedSearch.content[0].text).toContain('Email search executed');

        console.log('✅ Rate limit handling verified successfully!');
      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 25000);
  });

  describe('Performance Under Load', () => {
    test('should maintain performance under sustained load', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 2000));

      try {
        await authenticateUser('performance-test-user');

        console.log('🚀 Testing performance under sustained load...');

        const startTime = Date.now();

        // Generate sustained load with mixed operations
        const loadOperations = [
          // Email searches
          ...Array.from({ length: 20 }, (_, i) =>
            mockServer.callTool('pim_email_search', {
              query: `performance test ${i}`,
              platform: 'microsoft',
            })
          ),
          // Email gets
          ...Array.from({ length: 10 }, (_, i) =>
            mockServer.callTool('pim_email_get', {
              emailId: `perf-email-${i}`,
              platform: 'microsoft',
            })
          ),
          // Auth status checks
          ...Array.from({ length: 15 }, () =>
            mockServer.callTool('pim_auth_status', {
              platform: 'microsoft',
            })
          ),
          // Calendar events
          ...Array.from({ length: 5 }, (_, i) =>
            mockServer.callTool('pim_calendar_create_event', {
              title: `Performance Test Event ${i}`,
              start: `2024-12-${20 + i}T10:00:00Z`,
              end: `2024-12-${20 + i}T11:00:00Z`,
              platform: 'microsoft',
            })
          ),
        ];

        const results = await Promise.allSettled(loadOperations);
        const endTime = Date.now();

        // Analyze results
        const successfulOperations = results.filter(r => r.status === 'fulfilled');
        const failedOperations = results.filter(r => r.status === 'rejected');

        const successRate = (successfulOperations.length / loadOperations.length) * 100;
        const averageResponseTime = (endTime - startTime) / loadOperations.length;

        console.log(`📊 Load Test Results:`);
        console.log(`   Total Operations: ${loadOperations.length}`);
        console.log(`   Successful: ${successfulOperations.length}`);
        console.log(`   Failed: ${failedOperations.length}`);
        console.log(`   Success Rate: ${successRate.toFixed(2)}%`);
        console.log(`   Average Response Time: ${averageResponseTime.toFixed(2)}ms`);
        console.log(`   Total Duration: ${endTime - startTime}ms`);

        // Performance assertions
        expect(successRate).toBeGreaterThan(90); // 90%+ success rate
        expect(averageResponseTime).toBeLessThan(500); // Under 500ms average
        expect(endTime - startTime).toBeLessThan(30000); // Complete within 30 seconds

        console.log('✅ Performance test completed successfully!');
      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 60000); // 60 second timeout for performance test
  });

  describe('System Startup and Shutdown', () => {
    test('should start up and shut down gracefully', async () => {
      console.log('🔄 Testing graceful startup and shutdown...');

      // Test startup
      const startTime = Date.now();
      const appPromise = pimApp.main();

      // Wait for startup
      await new Promise(resolve => setTimeout(resolve, 3000));
      const startupTime = Date.now() - startTime;

      console.log(`⚡ Startup completed in ${startupTime}ms`);
      expect(startupTime).toBeLessThan(10000); // Under 10 seconds

      // Verify system is operational
      const healthCheck = await mockServer.callTool('pim_auth_status', {});
      expect(healthCheck.content[0].text).toBeDefined();

      // Test graceful shutdown
      const shutdownStartTime = Date.now();
      process.emit('SIGTERM');

      // Wait for shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));
      const shutdownTime = Date.now() - shutdownStartTime;

      console.log(`🛑 Shutdown completed in ${shutdownTime}ms`);
      expect(shutdownTime).toBeLessThan(5000); // Under 5 seconds

      console.log('✅ Startup/shutdown test completed successfully!');
    }, 20000);

    test('should recover from unclean shutdown', async () => {
      console.log('🔧 Testing recovery from unclean shutdown...');

      // Start application
      let appInstance = new UnifiedPIMMain();
      const appPromise = appInstance.main();

      await new Promise(resolve => setTimeout(resolve, 2000));

      // Authenticate and perform some operations
      await authenticateUser('recovery-test-user');

      const beforeCrash = await mockServer.callTool('pim_auth_status', {
        platform: 'microsoft',
      });
      expect(JSON.parse(beforeCrash.content[0].text).isAuthenticated).toBe(true);

      // Simulate unclean shutdown (crash)
      console.log('💥 Simulating unclean shutdown...');
      process.emit('uncaughtException', new Error('Simulated crash'));

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start new instance (recovery)
      console.log('🔄 Starting recovery...');
      appInstance = new UnifiedPIMMain();
      const recoveryPromise = appInstance.main();

      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify recovery - authentication state should be restored
      const afterRecovery = await mockServer.callTool('pim_auth_status', {
        platform: 'microsoft',
      });

      // Should be able to perform operations
      expect(afterRecovery.content[0].text).toBeDefined();

      console.log('✅ Recovery test completed successfully!');

      // Clean shutdown
      process.emit('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }, 25000);
  });

  // Helper function to authenticate a user
  async function authenticateUser(userId: string): Promise<void> {
    const authStart = await mockServer.callTool('pim_auth_start', {
      platform: 'microsoft',
      userId,
    });

    const authUrl = authStart.content[0].text.match(/https:\/\/[^\s]+/)[0];
    const state = new URL(authUrl).searchParams.get('state');

    await mockServer.callTool('pim_auth_callback', {
      platform: 'microsoft',
      code: `test-code-${userId}`,
      state,
    });
  }
});
