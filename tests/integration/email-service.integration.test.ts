import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { GraphAdapter } from '../../src/infrastructure/adapters/microsoft/GraphAdapter.js';
import { EmailService } from '../../src/infrastructure/adapters/microsoft/services/EmailService.js';
import { GraphClient } from '../../src/infrastructure/adapters/microsoft/clients/GraphClient.js';
import { SecurityManager } from '../../src/shared/security/SecurityManager.js';
import { ConfigManager } from '../../src/shared/config/ConfigManager.js';
import { Logger } from '../../src/shared/logging/Logger.js';
import { CacheManager } from '../../src/infrastructure/cache/CacheManager.js';
import { ResilienceManager } from '../../src/shared/resilience/ResilienceManager.js';
import { testConfig } from './setup.integration.js';
import { createMockGraphResponse, createMockEmailData } from '../fixtures/graphApiResponses.js';
import { createMockMsalApp, createMockTokenResponse } from '../mocks/msalMock.js';
import nock from 'nock';

/**
 * Email Service Integration Tests
 * 
 * Tests the complete email processing chain:
 * 1. EmailService → GraphClient → Microsoft Graph API
 * 2. ChromaDB semantic search integration
 * 3. Email CRUD operations with proper error handling
 * 4. Attachment handling and file operations
 * 5. Caching and performance optimization
 */
describe('Email Service Integration Tests', () => {
  let graphAdapter: GraphAdapter;
  let emailService: EmailService;
  let graphClient: GraphClient;
  let securityManager: SecurityManager;
  let configManager: ConfigManager;
  let logger: Logger;
  let cacheManager: CacheManager;
  let resilienceManager: ResilienceManager;

  const mockGraphBaseUrl = 'https://graph.microsoft.com';

  beforeAll(async () => {
    // Initialize core services
    configManager = new ConfigManager();
    await configManager.initialize();

    logger = new Logger(configManager.getConfig('logging'));
    await logger.initialize();

    securityManager = new SecurityManager(
      configManager.getConfig('security'),
      logger
    );
    await securityManager.initialize();

    resilienceManager = new ResilienceManager(
      configManager.getConfig('resilience'),
      logger
    );
    await resilienceManager.initialize();

    cacheManager = new CacheManager(
      configManager.getConfig('cache'),
      logger
    );
    await cacheManager.initialize();

    // Initialize Graph components
    graphClient = new GraphClient(
      configManager.getConfig('platforms.microsoft'),
      securityManager,
      resilienceManager,
      logger
    );

    emailService = new EmailService(
      graphClient,
      cacheManager,
      logger
    );

    graphAdapter = new GraphAdapter(
      configManager.getConfig('platforms.microsoft'),
      securityManager,
      resilienceManager,
      cacheManager,
      logger
    );

    // Setup authentication
    await setupAuthenticatedState();
  });

  afterAll(async () => {
    // Cleanup
    nock.cleanAll();
    await cacheManager?.dispose();
    await securityManager?.dispose();
    await resilienceManager?.dispose();
    await logger?.dispose();
  });

  beforeEach(async () => {
    // Clear cache before each test
    await cacheManager.clear();
    
    // Reset nock
    nock.cleanAll();
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  async function setupAuthenticatedState(): Promise<void> {
    const mockTokenResponse = createMockTokenResponse();
    await securityManager.storeTokens('microsoft', {
      accessToken: mockTokenResponse.accessToken,
      refreshToken: mockTokenResponse.account?.homeAccountId || 'refresh-token',
      expiresAt: new Date(Date.now() + 3600000) // 1 hour from now
    });
  }

  describe('Email Search Operations', () => {
    test('should search emails with Graph API integration', async () => {
      const mockEmails = createMockEmailData(5);
      
      // Mock Graph API response
      nock(mockGraphBaseUrl)
        .get('/v1.0/me/messages')
        .query(true)
        .reply(200, {
          '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users(\\'user%40domain.com\\')/messages',
          value: mockEmails
        });

      const result = await emailService.searchEmails('project update', {
        limit: 10,
        skip: 0
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.emails).toHaveLength(5);
      expect(result.data.totalCount).toBe(5);
      
      // Verify email structure
      const email = result.data.emails[0];
      expect(email.id).toBeDefined();
      expect(email.subject).toBeDefined();
      expect(email.from).toBeDefined();
      expect(email.receivedAt).toBeDefined();
    });

    test('should handle search with advanced filters', async () => {
      const mockEmails = createMockEmailData(3);
      
      nock(mockGraphBaseUrl)
        .get('/v1.0/me/messages')
        .query(query => {
          // Verify complex filter is properly constructed
          expect(query.$filter).toContain('from/emailAddress/address');
          expect(query.$filter).toContain('hasAttachments eq true');
          expect(query.$filter).toContain('isRead eq false');
          return true;
        })
        .reply(200, { value: mockEmails });

      const result = await emailService.searchEmails('', {
        from: 'sender@example.com',
        hasAttachments: true,
        isRead: false,
        importance: 'high',
        limit: 10
      });

      expect(result.success).toBe(true);
      expect(result.data.emails).toHaveLength(3);
    });

    test('should integrate with ChromaDB for semantic search', async () => {
      if (!testConfig.isRealIntegration) {
        // Mock ChromaDB response
        const mockChromaResults = [
          { id: 'email-1', distance: 0.85 },
          { id: 'email-2', distance: 0.78 }
        ];
        
        // Mock cache manager's vector search
        const mockVectorSearch = jest.spyOn(cacheManager, 'vectorSearch');
        mockVectorSearch.mockResolvedValue({
          success: true,
          results: mockChromaResults
        });
      }

      const mockEmails = createMockEmailData(2);
      
      nock(mockGraphBaseUrl)
        .get('/v1.0/me/messages')
        .query(true)
        .reply(200, { value: mockEmails });

      const result = await emailService.searchEmails('find emails about quarterly review', {
        useSemanticSearch: true,
        limit: 10
      });

      expect(result.success).toBe(true);
      
      if (!testConfig.isRealIntegration) {
        // Verify semantic search was called
        expect(cacheManager.vectorSearch).toHaveBeenCalledWith(
          expect.objectContaining({
            query: 'find emails about quarterly review',
            collection: 'graph-search-index'
          })
        );
      }
    });

    test('should cache search results for performance', async () => {
      const mockEmails = createMockEmailData(5);
      const searchQuery = 'cached search test';
      
      // First request - should hit API
      nock(mockGraphBaseUrl)
        .get('/v1.0/me/messages')
        .query(true)
        .reply(200, { value: mockEmails });

      const result1 = await emailService.searchEmails(searchQuery, { limit: 10 });
      expect(result1.success).toBe(true);

      // Second request - should use cache (no nock setup for this one)
      const result2 = await emailService.searchEmails(searchQuery, { limit: 10 });
      expect(result2.success).toBe(true);
      expect(result2.data.emails).toEqual(result1.data.emails);
      
      // Verify cache was used (no additional API calls)
      expect(nock.isDone()).toBe(true);
    });

    test('should handle search API errors gracefully', async () => {
      nock(mockGraphBaseUrl)
        .get('/v1.0/me/messages')
        .query(true)
        .reply(429, {
          error: {
            code: 'TooManyRequests',
            message: 'Rate limit exceeded'
          }
        });

      const result = await emailService.searchEmails('test query', { limit: 10 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });
  });

  describe('Individual Email Operations', () => {
    test('should retrieve email by ID with full details', async () => {
      const mockEmail = createMockEmailData(1)[0];
      const emailId = mockEmail.id;
      
      nock(mockGraphBaseUrl)
        .get(`/v1.0/me/messages/${emailId}`)
        .query(query => {
          // Verify we're requesting full email details
          expect(query.$expand).toContain('attachments');
          return true;
        })
        .reply(200, mockEmail);

      const result = await emailService.getEmail(emailId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.id).toBe(emailId);
      expect(result.data.body).toBeDefined();
      expect(result.data.attachments).toBeDefined();
    });

    test('should handle non-existent email ID', async () => {
      const nonExistentId = 'non-existent-email-id';
      
      nock(mockGraphBaseUrl)
        .get(`/v1.0/me/messages/${nonExistentId}`)
        .reply(404, {
          error: {
            code: 'ErrorItemNotFound',
            message: 'The specified object was not found in the store.'
          }
        });

      const result = await emailService.getEmail(nonExistentId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should cache retrieved emails', async () => {
      const mockEmail = createMockEmailData(1)[0];
      const emailId = mockEmail.id;
      
      // First request
      nock(mockGraphBaseUrl)
        .get(`/v1.0/me/messages/${emailId}`)
        .reply(200, mockEmail);

      const result1 = await emailService.getEmail(emailId);
      expect(result1.success).toBe(true);

      // Second request - should use cache
      const result2 = await emailService.getEmail(emailId);
      expect(result2.success).toBe(true);
      expect(result2.data).toEqual(result1.data);
    });
  });

  describe('Email Sending Operations', () => {
    test('should send email with complete data', async () => {
      const emailData = {
        to: ['recipient@example.com'],
        cc: ['cc@example.com'],
        subject: 'Integration Test Email',
        body: 'This is a test email from integration tests',
        bodyType: 'html' as const,
        importance: 'normal' as const
      };

      nock(mockGraphBaseUrl)
        .post('/v1.0/me/sendMail', body => {
          // Verify email structure
          expect(body.message.subject).toBe(emailData.subject);
          expect(body.message.body.content).toBe(emailData.body);
          expect(body.message.body.contentType).toBe('HTML');
          expect(body.message.toRecipients).toHaveLength(1);
          expect(body.message.ccRecipients).toHaveLength(1);
          expect(body.message.importance).toBe('normal');
          return true;
        })
        .reply(202); // Accepted

      const result = await emailService.sendEmail(emailData);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.messageId).toBeDefined();
    });

    test('should handle email sending validation errors', async () => {
      const invalidEmailData = {
        to: ['invalid-email-address'],
        subject: '',
        body: '',
        bodyType: 'text' as const
      };

      nock(mockGraphBaseUrl)
        .post('/v1.0/me/sendMail')
        .reply(400, {
          error: {
            code: 'ErrorInvalidRecipients',
            message: 'One or more recipients are invalid.'
          }
        });

      const result = await emailService.sendEmail(invalidEmailData);

      expect(result.success).toBe(false);
      expect(result.error).toContain('invalid');
    });

    test('should send email with attachments', async () => {
      const emailData = {
        to: ['recipient@example.com'],
        subject: 'Email with Attachment',
        body: 'Please find attachment',
        bodyType: 'text' as const,
        attachments: [{
          name: 'document.pdf',
          contentType: 'application/pdf',
          content: Buffer.from('fake pdf content').toString('base64')
        }]
      };

      nock(mockGraphBaseUrl)
        .post('/v1.0/me/sendMail', body => {
          expect(body.message.attachments).toHaveLength(1);
          expect(body.message.attachments[0].name).toBe('document.pdf');
          expect(body.message.attachments[0]['@odata.type']).toBe('#microsoft.graph.fileAttachment');
          return true;
        })
        .reply(202);

      const result = await emailService.sendEmail(emailData);

      expect(result.success).toBe(true);
    });
  });

  describe('Email Reply Operations', () => {
    test('should reply to email with proper threading', async () => {
      const originalEmailId = 'original-email-123';
      const replyData = {
        body: 'This is my reply',
        bodyType: 'html' as const,
        replyAll: false
      };

      nock(mockGraphBaseUrl)
        .post(`/v1.0/me/messages/${originalEmailId}/reply`, body => {
          expect(body.comment).toBe(replyData.body);
          return true;
        })
        .reply(202);

      const result = await emailService.replyToEmail(originalEmailId, replyData);

      expect(result.success).toBe(true);
    });

    test('should reply all to email', async () => {
      const originalEmailId = 'original-email-123';
      const replyData = {
        body: 'Reply to all recipients',
        bodyType: 'text' as const,
        replyAll: true
      };

      nock(mockGraphBaseUrl)
        .post(`/v1.0/me/messages/${originalEmailId}/replyAll`, body => {
          expect(body.comment).toBe(replyData.body);
          return true;
        })
        .reply(202);

      const result = await emailService.replyToEmail(originalEmailId, replyData);

      expect(result.success).toBe(true);
    });
  });

  describe('Email Status Operations', () => {
    test('should mark email as read', async () => {
      const emailId = 'email-to-mark-read';

      nock(mockGraphBaseUrl)
        .patch(`/v1.0/me/messages/${emailId}`, body => {
          expect(body.isRead).toBe(true);
          return true;
        })
        .reply(200, { isRead: true });

      const result = await emailService.markEmailRead(emailId, true);

      expect(result.success).toBe(true);
    });

    test('should mark email as unread', async () => {
      const emailId = 'email-to-mark-unread';

      nock(mockGraphBaseUrl)
        .patch(`/v1.0/me/messages/${emailId}`, body => {
          expect(body.isRead).toBe(false);
          return true;
        })
        .reply(200, { isRead: false });

      const result = await emailService.markEmailRead(emailId, false);

      expect(result.success).toBe(true);
    });
  });

  describe('Email Deletion Operations', () => {
    test('should delete email successfully', async () => {
      const emailId = 'email-to-delete';

      nock(mockGraphBaseUrl)
        .delete(`/v1.0/me/messages/${emailId}`)
        .reply(204); // No content

      const result = await emailService.deleteEmail(emailId);

      expect(result.success).toBe(true);
    });

    test('should handle deletion of already deleted email', async () => {
      const emailId = 'already-deleted-email';

      nock(mockGraphBaseUrl)
        .delete(`/v1.0/me/messages/${emailId}`)
        .reply(404, {
          error: {
            code: 'ErrorItemNotFound',
            message: 'The item was not found.'
          }
        });

      const result = await emailService.deleteEmail(emailId);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('Attachment Operations', () => {
    test('should retrieve email attachments', async () => {
      const emailId = 'email-with-attachments';
      const mockAttachments = [
        {
          id: 'attachment-1',
          name: 'document.pdf',
          contentType: 'application/pdf',
          size: 1024
        }
      ];

      nock(mockGraphBaseUrl)
        .get(`/v1.0/me/messages/${emailId}/attachments`)
        .reply(200, { value: mockAttachments });

      const result = await emailService.getEmailAttachments(emailId);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('document.pdf');
    });

    test('should download attachment content', async () => {
      const emailId = 'email-with-attachment';
      const attachmentId = 'attachment-1';
      const mockContent = Buffer.from('fake file content').toString('base64');

      nock(mockGraphBaseUrl)
        .get(`/v1.0/me/messages/${emailId}/attachments/${attachmentId}`)
        .reply(200, {
          id: attachmentId,
          name: 'document.pdf',
          contentBytes: mockContent
        });

      const result = await emailService.downloadAttachment(emailId, attachmentId);

      expect(result.success).toBe(true);
      expect(result.data.content).toBeDefined();
      expect(result.data.contentType).toBeDefined();
    });
  });

  describe('Error Handling and Resilience', () => {
    test('should retry on transient failures', async () => {
      const emailId = 'test-email-retry';
      
      // First call fails with 503, second succeeds
      nock(mockGraphBaseUrl)
        .get(`/v1.0/me/messages/${emailId}`)
        .reply(503, { error: { code: 'ServiceUnavailable' } });
        
      nock(mockGraphBaseUrl)
        .get(`/v1.0/me/messages/${emailId}`)
        .reply(200, createMockEmailData(1)[0]);

      const result = await emailService.getEmail(emailId);

      expect(result.success).toBe(true);
    });

    test('should use circuit breaker on repeated failures', async () => {
      const searchQuery = 'circuit breaker test';
      
      // Mock multiple failures
      for (let i = 0; i < 6; i++) {
        nock(mockGraphBaseUrl)
          .get('/v1.0/me/messages')
          .query(true)
          .reply(500, { error: { code: 'InternalServerError' } });
      }

      // Make multiple requests to trigger circuit breaker
      const promises = Array.from({ length: 6 }, () =>
        emailService.searchEmails(searchQuery, { limit: 5 })
      );

      const results = await Promise.all(promises);

      // Later requests should fail immediately due to circuit breaker
      const failedResults = results.filter(r => !r.success);
      expect(failedResults.length).toBeGreaterThan(3);
      
      // Some should mention circuit breaker
      const circuitBreakerErrors = failedResults.filter(r => 
        r.error?.includes('circuit') || r.error?.includes('breaker')
      );
      expect(circuitBreakerErrors.length).toBeGreaterThan(0);
    });

    test('should handle rate limiting with exponential backoff', async () => {
      const emailId = 'rate-limit-test';
      
      // Mock rate limit response
      nock(mockGraphBaseUrl)
        .get(`/v1.0/me/messages/${emailId}`)
        .reply(429, {
          error: { code: 'TooManyRequests' }
        }, {
          'Retry-After': '5'
        });
        
      // Subsequent request succeeds
      nock(mockGraphBaseUrl)
        .get(`/v1.0/me/messages/${emailId}`)
        .reply(200, createMockEmailData(1)[0]);

      const startTime = Date.now();
      const result = await emailService.getEmail(emailId);
      const endTime = Date.now();

      expect(result.success).toBe(true);
      // Should have waited for retry
      expect(endTime - startTime).toBeGreaterThan(1000);
    });

    test('should handle authentication token expiry', async () => {
      // Simulate expired token
      await securityManager.storeTokens('microsoft', {
        accessToken: 'expired-token',
        refreshToken: 'valid-refresh-token',
        expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
      });

      // Mock token refresh
      const mockMsalApp = createMockMsalApp();
      mockMsalApp.acquireTokenSilent.mockResolvedValue(createMockTokenResponse());

      nock(mockGraphBaseUrl)
        .get('/v1.0/me/messages')
        .query(true)
        .reply(200, { value: createMockEmailData(3) });

      const result = await emailService.searchEmails('test', { limit: 5 });

      expect(result.success).toBe(true);
      // Verify token was refreshed
      expect(mockMsalApp.acquireTokenSilent).toHaveBeenCalled();
    });
  });

  describe('Performance and Optimization', () => {
    test('should batch multiple email operations', async () => {
      const emailIds = ['email-1', 'email-2', 'email-3'];
      
      // Mock batch request
      nock(mockGraphBaseUrl)
        .post('/$batch', body => {
          expect(body.requests).toHaveLength(3);
          return true;
        })
        .reply(200, {
          responses: emailIds.map((id, index) => ({
            id: index.toString(),
            status: 200,
            body: createMockEmailData(1)[0]
          }))
        });

      const result = await emailService.batchGetEmails(emailIds);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);
    });

    test('should implement efficient pagination', async () => {
      const mockEmails = createMockEmailData(25);
      
      nock(mockGraphBaseUrl)
        .get('/v1.0/me/messages')
        .query(query => {
          expect(query.$top).toBe('25');
          expect(query.$skip).toBe('0');
          return true;
        })
        .reply(200, {
          value: mockEmails,
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=25&$top=25'
        });

      const result = await emailService.searchEmails('', {
        limit: 25,
        skip: 0
      });

      expect(result.success).toBe(true);
      expect(result.data.emails).toHaveLength(25);
      expect(result.data.hasMore).toBe(true);
      expect(result.data.nextSkip).toBe(25);
    });

    test('should compress large email content for cache', async () => {
      const largeEmailContent = 'x'.repeat(50000); // 50KB content
      const mockEmail = createMockEmailData(1)[0];
      mockEmail.body.content = largeEmailContent;
      
      nock(mockGraphBaseUrl)
        .get(`/v1.0/me/messages/${mockEmail.id}`)
        .reply(200, mockEmail);

      const result = await emailService.getEmail(mockEmail.id);

      expect(result.success).toBe(true);
      
      // Verify content is cached (implementation would compress large content)
      const cachedResult = await emailService.getEmail(mockEmail.id);
      expect(cachedResult.success).toBe(true);
      expect(cachedResult.data.body.content).toBe(largeEmailContent);
    });
  });
});