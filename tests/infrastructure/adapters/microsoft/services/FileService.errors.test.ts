// @ts-nocheck
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FileService } from '../../../../../src/infrastructure/adapters/microsoft/services/FileService';
import { GraphClient } from '../../../../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { CacheManager } from '../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager';
import { ChromaDbInitializer } from '../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer';
import { Logger } from '../../../../../src/shared/logging/Logger';
import { Readable } from 'stream';

// Mock external dependencies
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager');
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer');
jest.mock('chromadb');

global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('FileService Error Handling Tests', () => {
  let fileService: FileService;
  let mockGraphClient: jest.Mocked<GraphClient>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockChromaDb: jest.Mocked<ChromaDbInitializer>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockGraphClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      authenticateUser: jest.fn(),
      refreshToken: jest.fn(),
      isAuthenticated: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({ id: 'test-user-123' }),
      dispose: jest.fn()
    } as any;

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clearAll: jest.fn()
    } as any;

    mockChromaDb = {
      initialize: jest.fn(),
      dispose: jest.fn()
    } as any;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as any;

    fileService = new FileService(mockGraphClient, mockLogger);
  });

  describe('Graph API Error Handling', () => {
    it('should handle 401 Unauthorized errors', async () => {
      const unauthorizedError = new Error('Unauthorized');
      unauthorizedError.name = 'Unauthorized';
      (unauthorizedError as any).status = 401;
      
      mockGraphClient.get.mockRejectedValue(unauthorizedError);

      await expect(fileService.getFile('file-123')).rejects.toThrow('Unauthorized');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get file',
        { fileId: 'file-123', error: unauthorizedError }
      );
    });

    it('should handle 403 Forbidden errors with detailed context', async () => {
      const forbiddenError = new Error('Insufficient permissions to access this resource');
      forbiddenError.name = 'Forbidden';
      (forbiddenError as any).status = 403;
      (forbiddenError as any).code = 'accessDenied';
      
      mockGraphClient.delete.mockRejectedValue(forbiddenError);

      await expect(fileService.deleteFile('protected-file')).rejects.toThrow('Insufficient permissions');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to delete file',
        { fileId: 'protected-file', error: forbiddenError }
      );
    });

    it('should handle 404 Not Found errors', async () => {
      const notFoundError = new Error('The specified item was not found');
      notFoundError.name = 'NotFound';
      (notFoundError as any).status = 404;
      (notFoundError as any).code = 'itemNotFound';
      
      mockGraphClient.get.mockRejectedValue(notFoundError);

      await expect(fileService.getFile('nonexistent-file')).rejects.toThrow('The specified item was not found');
    });

    it('should handle 409 Conflict errors during upload', async () => {
      const conflictError = new Error('A file with this name already exists');
      conflictError.name = 'Conflict';
      (conflictError as any).status = 409;
      (conflictError as any).code = 'nameAlreadyExists';
      
      mockGraphClient.put.mockRejectedValue(conflictError);

      const fileContent = Buffer.from('Conflict test');
      const metadata = { filename: 'existing-file.txt', conflictBehavior: 'fail' as const };

      await expect(fileService.uploadFile(fileContent, metadata)).rejects.toThrow('A file with this name already exists');
    });

    it('should handle 413 Payload Too Large errors', async () => {
      const payloadTooLargeError = new Error('Request entity too large');
      payloadTooLargeError.name = 'PayloadTooLarge';
      (payloadTooLargeError as any).status = 413;
      (payloadTooLargeError as any).code = 'requestEntityTooLarge';
      
      mockGraphClient.put.mockRejectedValue(payloadTooLargeError);

      const largeContent = Buffer.alloc(3 * 1024 * 1024); // 3MB, but simulating too large
      const metadata = { filename: 'large-file.bin' };

      await expect(fileService.uploadFile(largeContent, metadata)).rejects.toThrow('Request entity too large');
    });

    it('should handle 429 Too Many Requests (rate limiting)', async () => {
      const rateLimitError = new Error('Too many requests');
      rateLimitError.name = 'TooManyRequests';
      (rateLimitError as any).status = 429;
      (rateLimitError as any).retryAfter = 60; // Retry after 60 seconds
      
      mockGraphClient.get.mockRejectedValue(rateLimitError);

      await expect(fileService.listFiles()).rejects.toThrow('Too many requests');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to list files',
        { error: rateLimitError }
      );
    });

    it('should handle 500 Internal Server Error', async () => {
      const serverError = new Error('Internal server error');
      serverError.name = 'InternalServerError';
      (serverError as any).status = 500;
      (serverError as any).code = 'internalServerError';
      
      mockGraphClient.post.mockRejectedValue(serverError);

      const permissions = { type: 'view' as const };
      await expect(fileService.shareFile('file-123', permissions)).rejects.toThrow('Internal server error');
    });

    it('should handle 502 Bad Gateway errors', async () => {
      const badGatewayError = new Error('Bad gateway');
      badGatewayError.name = 'BadGateway';
      (badGatewayError as any).status = 502;
      
      mockGraphClient.get.mockRejectedValue(badGatewayError);

      await expect(fileService.downloadFile('file-123')).rejects.toThrow('Bad gateway');
    });

    it('should handle 503 Service Unavailable errors', async () => {
      const serviceUnavailableError = new Error('Service temporarily unavailable');
      serviceUnavailableError.name = 'ServiceUnavailable';
      (serviceUnavailableError as any).status = 503;
      (serviceUnavailableError as any).retryAfter = 300;
      
      mockGraphClient.patch.mockRejectedValue(serviceUnavailableError);

      await expect(fileService.moveFile('file-123', 'folder-456')).rejects.toThrow('Service temporarily unavailable');
    });

    it('should handle network timeout errors', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      (timeoutError as any).code = 'ECONNABORTED';
      
      mockGraphClient.get.mockRejectedValue(timeoutError);

      await expect(fileService.getFile('file-123')).rejects.toThrow('Request timeout');
    });

    it('should handle network connectivity errors', async () => {
      const networkError = new Error('Network error: Connection refused');
      networkError.name = 'NetworkError';
      (networkError as any).code = 'ECONNREFUSED';
      
      mockGraphClient.get.mockRejectedValue(networkError);

      await expect(fileService.listFiles()).rejects.toThrow('Network error: Connection refused');
    });

    it('should handle malformed API responses', async () => {
      // Response missing required 'value' array
      const malformedResponse = {
        '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata',
        '@odata.count': 10
        // Missing 'value' array
      };
      
      mockGraphClient.get.mockResolvedValue(malformedResponse);

      await expect(fileService.listFiles()).rejects.toThrow();
    });

    it('should handle responses with invalid JSON', async () => {
      const invalidJsonError = new Error('Unexpected token in JSON');
      invalidJsonError.name = 'SyntaxError';
      
      mockGraphClient.get.mockRejectedValue(invalidJsonError);

      await expect(fileService.getFile('file-123')).rejects.toThrow('Unexpected token in JSON');
    });
  });

  describe('File Upload Error Scenarios', () => {
    it('should handle upload session creation failures', async () => {
      const sessionError = new Error('Failed to create upload session');
      sessionError.name = 'BadRequest';
      (sessionError as any).status = 400;
      
      mockGraphClient.post.mockRejectedValue(sessionError);

      const mockStream = new Readable({ read() { this.push(null); } });
      const metadata = { filename: 'test.zip' };

      await expect(fileService.uploadLargeFile(mockStream, metadata, 1000))
        .rejects.toThrow('Failed to create upload session');
    });

    it('should handle chunk upload failures with proper error details', async () => {
      const mockStream = new Readable({
        read() {
          this.push('test chunk data');
          this.push(null);
        }
      });

      const metadata = { filename: 'chunk-fail.zip' };
      const mockUploadSession = {
        uploadUrl: 'https://upload.example.com/session-fail',
        expirationDateTime: '2024-01-01T18:00:00Z'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockUploadSession);
      
      // Mock chunk upload failure
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue('Upload service temporarily unavailable')
      });

      await expect(fileService.uploadLargeFile(mockStream, metadata, 1000))
        .rejects.toThrow('Chunk upload failed: Internal Server Error');
    });

    it('should handle upload session expiration', async () => {
      const mockStream = new Readable({
        read() {
          // Simulate slow stream that causes session to expire
          setTimeout(() => {
            this.push('delayed chunk');
            this.push(null);
          }, 100);
        }
      });

      const metadata = { filename: 'expired-session.zip' };
      const expiredSession = {
        uploadUrl: 'https://upload.example.com/session-expired',
        expirationDateTime: new Date(Date.now() - 1000).toISOString() // Already expired
      };

      mockGraphClient.post.mockResolvedValueOnce(expiredSession);
      
      // Mock expired session response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 410,
        statusText: 'Gone',
        text: jest.fn().mockResolvedValue('Upload session has expired')
      });

      await expect(fileService.uploadLargeFile(mockStream, metadata, 1000))
        .rejects.toThrow('Chunk upload failed: Gone');
    });

    it('should handle corrupted file content during upload', async () => {
      const corruptedContent = Buffer.from('corrupted data that fails validation');
      const metadata = { filename: 'corrupted.txt' };

      const validationError = new Error('File content validation failed');
      validationError.name = 'BadRequest';
      (validationError as any).status = 400;
      (validationError as any).code = 'invalidFileContent';
      
      mockGraphClient.put.mockRejectedValue(validationError);

      await expect(fileService.uploadFile(corruptedContent, metadata))
        .rejects.toThrow('File content validation failed');
    });

    it('should handle storage quota exceeded errors', async () => {
      const quotaError = new Error('Storage quota exceeded');
      quotaError.name = 'InsufficientStorage';
      (quotaError as any).status = 507;
      (quotaError as any).code = 'quotaLimitReached';
      
      mockGraphClient.put.mockRejectedValue(quotaError);

      const largeContent = Buffer.alloc(1024 * 1024); // 1MB
      const metadata = { filename: 'quota-exceeded.bin' };

      await expect(fileService.uploadFile(largeContent, metadata))
        .rejects.toThrow('Storage quota exceeded');
    });

    it('should handle file type restrictions', async () => {
      const restrictionError = new Error('File type not allowed');
      restrictionError.name = 'BadRequest';
      (restrictionError as any).status = 400;
      (restrictionError as any).code = 'fileTypeNotAllowed';
      
      mockGraphClient.put.mockRejectedValue(restrictionError);

      const executableContent = Buffer.from('fake executable content');
      const metadata = { filename: 'malicious.exe', mimeType: 'application/x-msdownload' };

      await expect(fileService.uploadFile(executableContent, metadata))
        .rejects.toThrow('File type not allowed');
    });
  });

  describe('File Operation Error Scenarios', () => {
    it('should handle file locked errors during operations', async () => {
      const lockedError = new Error('File is currently locked by another user');
      lockedError.name = 'Locked';
      (lockedError as any).status = 423;
      (lockedError as any).code = 'resourceLocked';
      
      mockGraphClient.patch.mockRejectedValue(lockedError);

      await expect(fileService.moveFile('locked-file', 'new-location'))
        .rejects.toThrow('File is currently locked by another user');
    });

    it('should handle sync conflicts during file operations', async () => {
      const syncConflictError = new Error('Sync conflict detected');
      syncConflictError.name = 'Conflict';
      (syncConflictError as any).status = 409;
      (syncConflictError as any).code = 'syncConflict';
      
      mockGraphClient.patch.mockRejectedValue(syncConflictError);

      await expect(fileService.moveFile('file-123', 'destination'))
        .rejects.toThrow('Sync conflict detected');
    });

    it('should handle circular reference errors in move operations', async () => {
      const circularError = new Error('Cannot move folder into itself or its subfolder');
      circularError.name = 'BadRequest';
      (circularError as any).status = 400;
      (circularError as any).code = 'circularReference';
      
      mockGraphClient.patch.mockRejectedValue(circularError);

      await expect(fileService.moveFile('folder-123', 'subfolder-of-123'))
        .rejects.toThrow('Cannot move folder into itself or its subfolder');
    });

    it('should handle file size limit errors during download', async () => {
      const sizeLimitError = new Error('File too large to download');
      sizeLimitError.name = 'RequestEntityTooLarge';
      (sizeLimitError as any).status = 413;
      
      mockGraphClient.get.mockRejectedValue(sizeLimitError);

      await expect(fileService.downloadFile('huge-file-123'))
        .rejects.toThrow('File too large to download');
    });

    it('should handle corrupted file errors during download', async () => {
      const corruptionError = new Error('File data is corrupted');
      corruptionError.name = 'DataCorruption';
      (corruptionError as any).status = 422;
      
      mockGraphClient.get.mockRejectedValue(corruptionError);

      await expect(fileService.downloadFile('corrupted-file-123'))
        .rejects.toThrow('File data is corrupted');
    });

    it('should handle virus detection errors', async () => {
      const virusError = new Error('File contains malicious content');
      virusError.name = 'Forbidden';
      (virusError as any).status = 403;
      (virusError as any).code = 'virusDetected';
      
      mockGraphClient.get.mockRejectedValue(virusError);

      await expect(fileService.downloadFile('suspicious-file-123'))
        .rejects.toThrow('File contains malicious content');
    });
  });

  describe('Sharing and Permission Error Scenarios', () => {
    it('should handle sharing disabled by policy errors', async () => {
      const policyError = new Error('Sharing is disabled by organizational policy');
      policyError.name = 'Forbidden';
      (policyError as any).status = 403;
      (policyError as any).code = 'sharingDisabled';
      
      mockGraphClient.post.mockRejectedValue(policyError);

      const permissions = { type: 'view' as const };
      await expect(fileService.shareFile('policy-restricted-file', permissions))
        .rejects.toThrow('Sharing is disabled by organizational policy');
    });

    it('should handle external sharing restrictions', async () => {
      const externalSharingError = new Error('External sharing not allowed');
      externalSharingError.name = 'Forbidden';
      (externalSharingError as any).status = 403;
      (externalSharingError as any).code = 'externalSharingDisabled';
      
      mockGraphClient.post.mockRejectedValue(externalSharingError);

      const permissions = { 
        type: 'view' as const, 
        scope: 'anonymous' as const 
      };
      
      await expect(fileService.shareFile('internal-only-file', permissions))
        .rejects.toThrow('External sharing not allowed');
    });

    it('should handle invalid recipient errors', async () => {
      const invalidRecipientError = new Error('Invalid recipient email address');
      invalidRecipientError.name = 'BadRequest';
      (invalidRecipientError as any).status = 400;
      (invalidRecipientError as any).code = 'invalidRecipient';
      
      const permissions = {
        type: 'view' as const,
        sendInvitation: true,
        recipients: ['invalid-email-format']
      };

      const mockShareLink = {
        id: 'share-123',
        link: { webUrl: 'https://share.example.com/file-123', type: 'view' }
      };

      mockGraphClient.post
        .mockResolvedValueOnce(mockShareLink) // Share link creation succeeds
        .mockRejectedValueOnce(invalidRecipientError); // Invitation fails

      const result = await fileService.shareFile('file-123', permissions);
      
      // Should still return share link even if invitation fails
      expect(result.url).toBe('https://share.example.com/file-123');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to send share invitation',
        expect.objectContaining({ fileId: 'file-123' })
      );
    });

    it('should handle share link expiration errors', async () => {
      const expiredLinkError = new Error('Share link has expired');
      expiredLinkError.name = 'Gone';
      (expiredLinkError as any).status = 410;
      (expiredLinkError as any).code = 'linkExpired';
      
      mockGraphClient.post.mockRejectedValue(expiredLinkError);

      const permissions = { 
        type: 'view' as const,
        expirationDateTime: new Date('2020-01-01') // Past date
      };
      
      await expect(fileService.shareFile('file-123', permissions))
        .rejects.toThrow('Share link has expired');
    });

    it('should handle maximum share links exceeded', async () => {
      const maxLinksError = new Error('Maximum number of share links reached');
      maxLinksError.name = 'TooManyRequests';
      (maxLinksError as any).status = 429;
      (maxLinksError as any).code = 'tooManyShareLinks';
      
      mockGraphClient.post.mockRejectedValue(maxLinksError);

      const permissions = { type: 'edit' as const };
      await expect(fileService.shareFile('heavily-shared-file', permissions))
        .rejects.toThrow('Maximum number of share links reached');
    });
  });

  describe('Search and ChromaDB Error Scenarios', () => {
    it('should handle ChromaDB connection failures gracefully', async () => {
      const chromaError = new Error('ChromaDB connection failed');
      mockChromaDb.initialize.mockRejectedValue(chromaError);

      // Should fall back to Graph API search
      const mockSearchResponse = {
        value: [{
          id: 'fallback-result-1',
          name: 'fallback-file.txt',
          size: 1024,
          mimeType: 'text/plain',
          createdDateTime: '2024-01-01T10:00:00Z',
          lastModifiedDateTime: '2024-01-01T10:00:00Z',
          parentReference: { driveId: 'drive-1', id: 'folder-1' },
          file: { hashes: { sha256Hash: 'fallback123' } }
        }]
      };

      mockGraphClient.get.mockResolvedValue(mockSearchResponse);

      const results = await fileService.searchFiles('test query');

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('fallback-file.txt');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'ChromaDB not available, using Graph API search'
      );
    });

    it('should handle search query parsing errors', async () => {
      const queryError = new Error('Invalid search query syntax');
      queryError.name = 'BadRequest';
      (queryError as any).status = 400;
      (queryError as any).code = 'invalidQuery';
      
      mockGraphClient.get.mockRejectedValue(queryError);

      // ChromaDB not available, using Graph API
      (fileService as any).searchCollection = null;

      await expect(fileService.searchFiles('invalid query: [malformed]'))
        .rejects.toThrow('Invalid search query syntax');
    });

    it('should handle ChromaDB query timeout errors', async () => {
      const mockSearchCollection = {
        query: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn()
      };

      const timeoutError = new Error('Query timeout');
      timeoutError.name = 'TimeoutError';
      mockSearchCollection.query.mockRejectedValue(timeoutError);
      
      (fileService as any).searchCollection = mockSearchCollection;

      await expect(fileService.searchFiles('complex search query'))
        .rejects.toThrow('Query timeout');
    });

    it('should handle ChromaDB indexing failures during file operations', async () => {
      const mockSearchCollection = {
        query: jest.fn(),
        upsert: jest.fn().mockRejectedValue(new Error('Indexing failed')),
        delete: jest.fn()
      };
      
      (fileService as any).searchCollection = mockSearchCollection;

      const fileContent = Buffer.from('Test content');
      const metadata = { filename: 'index-fail-test.txt' };
      const mockUploadedFile = {
        id: 'index-fail-file',
        name: 'index-fail-test.txt',
        size: fileContent.length,
        mimeType: 'text/plain',
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z',
        parentReference: { driveId: 'drive-1', id: 'folder-1' },
        file: { hashes: { sha256Hash: 'indexfail123' } }
      };

      mockGraphClient.put.mockResolvedValue(mockUploadedFile);

      // Should complete upload despite indexing failure
      const result = await fileService.uploadFile(fileContent, metadata);

      expect(result).toBeDefined();
      expect(result.name).toBe('index-fail-test.txt');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to index files for search',
        { error: expect.any(Error) }
      );
    });

    it('should handle search result fetching failures', async () => {
      const mockSearchCollection = {
        query: jest.fn().mockResolvedValue({
          ids: [['valid-file', 'invalid-file', 'deleted-file']],
          documents: [['doc1', 'doc2', 'doc3']],
          metadatas: [[ 
            { fileId: 'valid-file' },
            { fileId: 'invalid-file' },
            { fileId: 'deleted-file' }
          ]],
          distances: [[0.1, 0.2, 0.3]]
        }),
        upsert: jest.fn(),
        delete: jest.fn()
      };
      
      (fileService as any).searchCollection = mockSearchCollection;

      // Mock file fetching: first succeeds, second fails, third fails
      mockGraphClient.get
        .mockResolvedValueOnce({
          id: 'valid-file',
          name: 'valid-file.txt',
          size: 1024,
          mimeType: 'text/plain',
          createdDateTime: '2024-01-01T10:00:00Z',
          lastModifiedDateTime: '2024-01-01T10:00:00Z',
          parentReference: { driveId: 'drive-1', id: 'folder-1' },
          file: { hashes: { sha256Hash: 'valid123' } }
        })
        .mockRejectedValueOnce(new Error('File not found'))
        .mockRejectedValueOnce(new Error('File has been deleted'));

      const results = await fileService.searchFiles('test search');

      // Should return only the valid result
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('valid-file.txt');
      
      // Should log warnings for failed fetches
      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch file from search result',
        { id: 'invalid-file', error: expect.any(Error) }
      );
    });
  });

  describe('Cache Error Scenarios', () => {
    it('should handle cache read failures gracefully', async () => {
      const cacheError = new Error('Cache read failed');
      mockCacheManager.get.mockRejectedValue(cacheError);

      const mockFile = {
        id: 'cache-fail-file',
        name: 'cache-test.txt',
        size: 1024,
        mimeType: 'text/plain',
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z',
        parentReference: { driveId: 'drive-1', id: 'folder-1' },
        file: { hashes: { sha256Hash: 'cachefail123' } }
      };

      mockGraphClient.get.mockResolvedValue(mockFile);

      // Should continue operation despite cache failure
      const result = await fileService.getFile('cache-fail-file');
      
      expect(result).toBeDefined();
      expect(result.name).toBe('cache-test.txt');
    });

    it('should handle cache write failures gracefully', async () => {
      const cacheWriteError = new Error('Cache write failed');
      mockCacheManager.set.mockRejectedValue(cacheWriteError);

      const mockResponse = {
        value: [{
          id: 'cache-write-fail',
          name: 'test.txt',
          size: 1024,
          mimeType: 'text/plain',
          createdDateTime: '2024-01-01T10:00:00Z',
          lastModifiedDateTime: '2024-01-01T10:00:00Z',
          parentReference: { driveId: 'drive-1', id: 'folder-1' },
          file: { hashes: { sha256Hash: 'cachewrite123' } }
        }],
        '@odata.count': 1
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      // Should complete operation despite cache write failure
      const result = await fileService.listFiles();
      
      expect(result.files).toHaveLength(1);
      expect(result.files[0].name).toBe('test.txt');
    });

    it('should handle cache invalidation failures', async () => {
      const cacheDeleteError = new Error('Cache delete failed');
      mockCacheManager.delete.mockRejectedValue(cacheDeleteError);

      mockGraphClient.delete.mockResolvedValue({});

      // Should complete delete operation despite cache invalidation failure
      await fileService.deleteFile('cache-delete-fail');
      
      expect(mockGraphClient.delete).toHaveBeenCalledWith('/me/drive/items/cache-delete-fail');
    });
  });

  describe('Resource Limit Error Scenarios', () => {
    it('should handle memory pressure during large operations', async () => {
      // Simulate memory pressure by creating large mock responses
      const largeResponse = {
        value: Array.from({ length: 10000 }, (_, i) => ({
          id: `memory-test-${i}`,
          name: `file-${i}.txt`,
          size: 1024,
          mimeType: 'text/plain',
          createdDateTime: '2024-01-01T10:00:00Z',
          lastModifiedDateTime: '2024-01-01T10:00:00Z',
          parentReference: { driveId: 'drive-1', id: 'folder-1' },
          file: { hashes: { sha256Hash: `hash${i}` } }
        })),
        '@odata.count': 10000
      };

      mockGraphClient.get.mockResolvedValue(largeResponse);

      const result = await fileService.listFiles({ limit: 10000 });
      
      expect(result.files).toHaveLength(10000);
      expect(result.totalCount).toBe(10000);
    });

    it('should handle concurrent operation limits', async () => {
      // Create many concurrent operations
      const concurrentCount = 100;
      const operations: Promise<any>[] = [];

      for (let i = 0; i < concurrentCount; i++) {
        mockGraphClient.get.mockResolvedValueOnce({
          id: `concurrent-${i}`,
          name: `file-${i}.txt`,
          size: 1024,
          mimeType: 'text/plain',
          createdDateTime: '2024-01-01T10:00:00Z',
          lastModifiedDateTime: '2024-01-01T10:00:00Z',
          parentReference: { driveId: 'drive-1', id: 'folder-1' },
          file: { hashes: { sha256Hash: `concurrent${i}` } }
        });

        operations.push(fileService.getFile(`concurrent-${i}`));
      }

      const results = await Promise.allSettled(operations);
      
      // All operations should complete successfully
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful).toHaveLength(concurrentCount);
    });

    it('should handle file descriptor limits during stream operations', async () => {
      const streamError = new Error('Too many open files');
      streamError.name = 'EMFILE';
      (streamError as any).code = 'EMFILE';
      
      const mockStream = new Readable({
        read() {
          // Simulate file descriptor exhaustion
          this.destroy(streamError);
        }
      });

      const metadata = { filename: 'fd-limit-test.zip' };
      
      await expect(fileService.uploadLargeFile(mockStream, metadata, 1000))
        .rejects.toThrow('Too many open files');
    });
  });

  describe('Data Integrity Error Scenarios', () => {
    it('should handle checksum mismatch errors', async () => {
      const checksumError = new Error('File checksum mismatch');
      checksumError.name = 'DataIntegrityError';
      (checksumError as any).status = 422;
      (checksumError as any).code = 'checksumMismatch';
      
      mockGraphClient.put.mockRejectedValue(checksumError);

      const fileContent = Buffer.from('Content with wrong checksum');
      const metadata = { filename: 'checksum-fail.txt' };

      await expect(fileService.uploadFile(fileContent, metadata))
        .rejects.toThrow('File checksum mismatch');
    });

    it('should handle partial data corruption', async () => {
      const partialContent = Buffer.from('Partial content');
      // Simulate truncated response
      partialContent[partialContent.length - 1] = 0; // Corrupt last byte
      
      mockGraphClient.get.mockResolvedValue(partialContent.buffer);

      const result = await fileService.downloadFile('potentially-corrupted-file');
      
      // Should return the data even if potentially corrupted
      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(partialContent.length);
    });

    it('should handle encoding errors in file names', async () => {
      const encodingError = new Error('Invalid character encoding in filename');
      encodingError.name = 'BadRequest';
      (encodingError as any).status = 400;
      (encodingError as any).code = 'invalidEncoding';
      
      mockGraphClient.put.mockRejectedValue(encodingError);

      const fileContent = Buffer.from('Test content');
      const metadata = { filename: 'file\\x00\\xFF\\x01.txt' }; // Invalid characters

      await expect(fileService.uploadFile(fileContent, metadata))
        .rejects.toThrow('Invalid character encoding in filename');
    });
  });
});