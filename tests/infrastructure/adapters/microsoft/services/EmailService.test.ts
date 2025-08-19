import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EmailService } from '../../../../../src/infrastructure/adapters/microsoft/services/EmailService';
import { GraphClient } from '../../../../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { CacheManager } from '../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager';
import { ChromaDbInitializer } from '../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer';
import { ErrorHandler } from '../../../../../src/infrastructure/adapters/microsoft/errors/ErrorHandler';
import { Logger } from '../../../../../src/shared/logging/Logger';
import { EmailMapper } from '../../../../../src/infrastructure/adapters/microsoft/mappers/EmailMapper';

describe('EmailService', () => {
  let emailService: EmailService;
  let mockGraphClient: jest.Mocked<GraphClient>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockChromaDb: jest.Mocked<ChromaDbInitializer>;
  let mockErrorHandler: jest.Mocked<ErrorHandler>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Create mocks
    mockGraphClient = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockCacheManager = {
      generateCacheKey: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clearEndpoint: jest.fn(),
      clearAll: jest.fn(),
      indexForSearch: jest.fn(),
      search: jest.fn(),
      storeSyncMetadata: jest.fn(),
      getSyncMetadata: jest.fn(),
      cacheApiResponse: jest.fn(),
      getCachedApiResponse: jest.fn(),
      batchSet: jest.fn(),
      getStats: jest.fn(),
      dispose: jest.fn(),
    } as any;

    mockChromaDb = {
      initialize: jest.fn(),
      ensureCollection: jest.fn(),
      addDocuments: jest.fn(),
      deleteDocuments: jest.fn(),
      updateDocuments: jest.fn(),
      searchDocuments: jest.fn(),
      getCollection: jest.fn(),
      storeCacheEntry: jest.fn(),
      getCacheEntry: jest.fn(),
      deleteCacheEntry: jest.fn(),
      storeSearchEntry: jest.fn(),
      search: jest.fn(),
      storeSyncMetadata: jest.fn(),
      getSyncMetadata: jest.fn(),
      clearExpiredCache: jest.fn(),
      getStats: jest.fn(),
      reset: jest.fn(),
      dispose: jest.fn(),
    } as any;

    mockErrorHandler = {
      handleError: jest.fn(),
    } as any;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    // Create service instance
    emailService = new EmailService(
      mockGraphClient,
      mockCacheManager,
      mockChromaDb,
      mockErrorHandler,
      mockLogger
    );
  });

  describe('getEmail', () => {
    it('should retrieve email from cache if available', async () => {
      const mockEmail = {
        id: 'test-id',
        subject: 'Test Email',
        // ... other email properties
      };

      mockCacheManager.get.mockResolvedValue(mockEmail);

      const result = await emailService.getEmail('test-id');

      expect(result.success).toBe(true);
      expect(result.data).toBe(mockEmail);
      expect(mockGraphClient.get).not.toHaveBeenCalled();
      expect(mockCacheManager.get).toHaveBeenCalledWith('graph:email:test-id');
    });

    it('should fetch email from Graph API if not in cache', async () => {
      const mockGraphResponse = {
        id: 'test-id',
        subject: 'Test Email',
        body: { content: 'Test content', contentType: 'Text' },
        from: {
          emailAddress: {
            address: 'sender@example.com',
            name: 'Sender',
          },
        },
        toRecipients: [
          {
            emailAddress: {
              address: 'recipient@example.com',
              name: 'Recipient',
            },
          },
        ],
        receivedDateTime: '2024-01-01T12:00:00Z',
        isRead: false,
        isDraft: false,
        importance: 'Normal',
        hasAttachments: false,
        categories: [] as string[],
      };

      mockCacheManager.get.mockResolvedValue(null);
      mockGraphClient.get.mockResolvedValue(mockGraphResponse);
      // Note: addDocuments is currently commented out in the service
      // mockChromaDb.addDocuments.mockResolvedValue(undefined);

      const result = await emailService.getEmail('test-id');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/messages/test-id',
        expect.objectContaining({
          params: expect.objectContaining({
            $expand: 'attachments',
          }),
        })
      );
      expect(mockCacheManager.set).toHaveBeenCalled();
      // Note: addDocuments is currently commented out in the service
      // expect(mockChromaDb.addDocuments).toHaveBeenCalled();
    });
  });

  describe('searchEmails', () => {
    it('should search emails with filters', async () => {
      const mockResponse = {
        value: [
          {
            id: 'email-1',
            subject: 'Email 1',
            body: { content: 'Content 1', contentType: 'Text' },
            from: {
              emailAddress: {
                address: 'sender@example.com',
                name: 'Sender',
              },
            },
            toRecipients: [
              {
                emailAddress: {
                  address: 'recipient@example.com',
                },
              },
            ],
            receivedDateTime: '2024-01-01T12:00:00Z',
          },
        ],
        '@odata.count': 1,
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);
      // Note: addDocuments is currently commented out in the service
      // mockChromaDb.addDocuments.mockResolvedValue(undefined);

      const result = await emailService.searchEmails({
        query: 'test',
        isRead: false,
        limit: 25,
      });

      expect(result.success).toBe(true);
      expect(result.data?.emails).toHaveLength(1);
      expect(result.data?.totalCount).toBe(1);
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/messages',
        expect.objectContaining({
          params: expect.objectContaining({
            $top: 25,
            $skip: 0,
            $count: true,
            $search: '"test"',
            $filter: 'isRead eq false',
          }),
        })
      );
    });
  });

  describe('sendEmail', () => {
    it('should send an email successfully', async () => {
      const email = {
        subject: 'Test Email',
        body: {
          content: 'Test content',
          contentType: 'text' as const,
        },
        to: [
          {
            address: 'recipient@example.com',
            displayName: 'Recipient',
          },
        ],
      };

      mockGraphClient.post.mockResolvedValue({ id: 'sent-id' });

      const result = await emailService.sendEmail(email as any);

      expect(result.success).toBe(true);
      expect(result.data).toBe('sent-id');
      expect(mockGraphClient.post).toHaveBeenCalledWith('/me/sendMail', expect.any(Object));
    });
  });

  describe('markAsRead', () => {
    it('should mark email as read', async () => {
      mockGraphClient.patch.mockResolvedValue({});
      mockCacheManager.delete.mockResolvedValue(undefined);

      const result = await emailService.markAsRead('email-id', true);

      expect(result.success).toBe(true);
      expect(mockGraphClient.patch).toHaveBeenCalledWith('/me/messages/email-id', { isRead: true });
      expect(mockCacheManager.delete).toHaveBeenCalledWith('graph:email:email-id');
    });
  });

  describe('deleteEmail', () => {
    it('should delete an email', async () => {
      mockGraphClient.delete.mockResolvedValue({});
      mockCacheManager.delete.mockResolvedValue(undefined);
      // Note: deleteDocuments is currently commented out in the service
      // mockChromaDb.deleteDocuments.mockResolvedValue(undefined);

      const result = await emailService.deleteEmail('email-id');

      expect(result.success).toBe(true);
      expect(mockGraphClient.delete).toHaveBeenCalledWith('/me/messages/email-id');
      expect(mockCacheManager.delete).toHaveBeenCalledWith('graph:email:email-id');
      // Note: deleteDocuments is currently commented out in the service
      // expect(mockChromaDb.deleteDocuments).toHaveBeenCalledWith({
      //   collection: 'graph-search-index',
      //   ids: ['email_email-id'],
      // });
    });
  });

  describe('moveToFolder', () => {
    it('should move email to a folder', async () => {
      mockGraphClient.post.mockResolvedValue({});
      mockCacheManager.delete.mockResolvedValue(undefined);

      const result = await emailService.moveToFolder('email-id', 'folder-id');

      expect(result.success).toBe(true);
      expect(mockGraphClient.post).toHaveBeenCalledWith('/me/messages/email-id/move', {
        destinationId: 'folder-id',
      });
      expect(mockCacheManager.delete).toHaveBeenCalledWith('graph:email:email-id');
    });
  });

  describe('createDraft', () => {
    it('should create a draft email', async () => {
      const draft = {
        subject: 'Draft Email',
        body: {
          content: 'Draft content',
          contentType: 'text' as const,
        },
      };

      const mockResponse = {
        id: 'draft-id',
        ...draft,
        isDraft: true,
        from: { emailAddress: { address: 'me@example.com' } },
        toRecipients: [] as any[],
        receivedDateTime: '2024-01-01T12:00:00Z',
      };

      mockGraphClient.post.mockResolvedValue(mockResponse);
      mockCacheManager.set.mockResolvedValue(undefined);

      const result = await emailService.createDraft(draft as any);

      expect(result.success).toBe(true);
      expect(mockGraphClient.post).toHaveBeenCalledWith('/me/messages', expect.any(Object));
    });
  });

  describe('replyToEmail', () => {
    it('should reply to an email', async () => {
      const reply = {
        body: {
          content: 'Reply content',
          contentType: 'text' as const,
        },
      };

      mockGraphClient.post.mockResolvedValue({});

      const result = await emailService.replyToEmail('email-id', reply as any, false);

      expect(result.success).toBe(true);
      expect(result.data).toBe('replied');
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        '/me/messages/email-id/reply',
        expect.any(Object)
      );
    });

    it('should reply all to an email', async () => {
      const reply = {
        body: {
          content: 'Reply all content',
          contentType: 'text' as const,
        },
      };

      mockGraphClient.post.mockResolvedValue({});

      const result = await emailService.replyToEmail('email-id', reply as any, true);

      expect(result.success).toBe(true);
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        '/me/messages/email-id/replyAll',
        expect.any(Object)
      );
    });
  });

  describe('forwardEmail', () => {
    it('should forward an email', async () => {
      const forward = {
        to: [
          {
            address: 'forward@example.com',
            displayName: 'Forward Recipient',
          },
        ],
        body: {
          content: 'Forward message',
          contentType: 'text' as const,
        },
      };

      mockGraphClient.post.mockResolvedValue({});

      const result = await emailService.forwardEmail('email-id', forward as any);

      expect(result.success).toBe(true);
      expect(result.data).toBe('forwarded');
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        '/me/messages/email-id/forward',
        expect.any(Object)
      );
    });
  });

  describe('getFolders', () => {
    it('should get email folders', async () => {
      const mockFolders = {
        value: [
          { id: 'inbox', displayName: 'Inbox' },
          { id: 'sent', displayName: 'Sent Items' },
        ],
      };

      mockGraphClient.get.mockResolvedValue(mockFolders);

      const result = await emailService.getFolders();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockFolders.value);
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/mailFolders');
    });
  });
});
