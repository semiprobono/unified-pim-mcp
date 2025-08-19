import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FileService } from '../../../../../src/infrastructure/adapters/microsoft/services/FileService';
import { GraphClient } from '../../../../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { CacheManager } from '../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager';
import { ChromaDbInitializer } from '../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer';
import { ErrorHandler } from '../../../../../src/infrastructure/adapters/microsoft/errors/ErrorHandler';
import { Logger } from '../../../../../src/shared/logging/Logger';
import { Readable } from 'stream';

// Mock external dependencies
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager');
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer');
jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockResolvedValue({
      upsert: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue({ 
        ids: [[]],
        documents: [[]],
        metadatas: [[]]
      })
    })
  }))
}));

describe('FileService', () => {
  let fileService: FileService;
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
      authenticateUser: jest.fn(),
      refreshToken: jest.fn(),
      isAuthenticated: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({ id: 'test-user-123' }),
      dispose: jest.fn()
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
      handleGraphError: jest.fn(),
      isRetryableError: jest.fn(),
      getErrorCategory: jest.fn(),
      createClientError: jest.fn(),
      createServerError: jest.fn(),
      createNetworkError: jest.fn()
    } as any;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    // Create service instance
    fileService = new FileService(
      mockGraphClient,
      mockLogger
    );
  });

  describe('listFiles', () => {
    it('should retrieve files with default options', async () => {
      const mockResponse = {
        value: [
          {
            id: 'file-1',
            name: 'document.pdf',
            size: 1024,
            mimeType: 'application/pdf',
            createdDateTime: '2024-01-01T10:00:00Z',
            lastModifiedDateTime: '2024-01-01T10:00:00Z',
            parentReference: { driveId: 'drive-1', id: 'folder-1' },
            file: { hashes: { sha256Hash: 'abc123' } }
          },
          {
            id: 'file-2',
            name: 'image.jpg',
            size: 2048,
            mimeType: 'image/jpeg',
            createdDateTime: '2024-01-02T10:00:00Z',
            lastModifiedDateTime: '2024-01-02T10:00:00Z',
            parentReference: { driveId: 'drive-1', id: 'folder-1' },
            file: { hashes: { sha256Hash: 'def456' } }
          }
        ] as any[],
        '@odata.count': 2
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const result = await fileService.listFiles();

      expect(result.files).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.files[0].name).toBe('document.pdf');
      expect(result.files[1].name).toBe('image.jpg');
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/drive/root/children',
        expect.objectContaining({
          params: expect.objectContaining({
            $top: 25,
            $skip: 0,
            $count: true
          })
        })
      );
    });

    it('should apply file filters correctly', async () => {
      const mockResponse = {
        value: [
          {
            id: 'pdf-file',
            name: 'filtered.pdf',
            size: 1024,
            mimeType: 'application/pdf',
            createdDateTime: '2024-01-01T10:00:00Z',
            lastModifiedDateTime: '2024-01-01T10:00:00Z',
            parentReference: { driveId: 'drive-1', id: 'folder-1' },
            file: { hashes: { sha256Hash: 'filtered123' } }
          }
        ] as any[],
        '@odata.count': 1
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const options = {
        mimeType: 'application/pdf',
        minSize: 500,
        maxSize: 2000,
        limit: 10
      };

      const result = await fileService.listFiles(options);

      expect(result.files).toHaveLength(1);
      expect(result.files[0].mimeType).toBe('application/pdf');
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/drive/root/children',
        expect.objectContaining({
          params: expect.objectContaining({
            $top: 10,
            $filter: expect.stringContaining('size')
          })
        })
      );
    });

    it('should handle custom driveId and folderId', async () => {
      const mockResponse = { value: [] as any[], '@odata.count': 0 };
      mockGraphClient.get.mockResolvedValue(mockResponse);

      const options = {
        driveId: 'custom-drive',
        folderId: 'custom-folder'
      };

      await fileService.listFiles(options);

      expect(mockGraphClient.get).toHaveBeenCalledWith(
        expect.stringContaining('custom-drive'),
        expect.any(Object)
      );
    });
  });

  describe('getFile', () => {
    it('should retrieve a single file by ID', async () => {
      const mockFile = {
        id: 'file-123',
        name: 'test-file.docx',
        size: 4096,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z',
        parentReference: { driveId: 'drive-1', id: 'folder-1' },
        file: { hashes: { sha256Hash: 'test123' } }
      };

      mockGraphClient.get.mockResolvedValue(mockFile);

      const result = await fileService.getFile('file-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('file-123');
      expect(result.name).toBe('test-file.docx');
      expect(result.size).toBe(4096);
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/drive/items/file-123',
        expect.any(Object)
      );
    });

    it('should use custom driveId when provided', async () => {
      const mockFile = {
        id: 'file-123',
        name: 'test-file.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z',
        parentReference: { driveId: 'custom-drive', id: 'folder-1' },
        file: { hashes: { sha256Hash: 'custom123' } }
      };

      mockGraphClient.get.mockResolvedValue(mockFile);

      await fileService.getFile('file-123', 'custom-drive');

      expect(mockGraphClient.get).toHaveBeenCalledWith(
        expect.stringContaining('custom-drive'),
        expect.any(Object)
      );
    });

    it('should handle file not found error', async () => {
      const error = new Error('File not found');
      mockGraphClient.get.mockRejectedValue(error);

      await expect(fileService.getFile('nonexistent-file')).rejects.toThrow('File not found');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('uploadFile', () => {
    it('should upload a small file successfully', async () => {
      const fileContent = Buffer.from('Hello, World!', 'utf-8');
      const metadata = {
        filename: 'hello.txt',
        path: '/Documents',
        description: 'Test file',
        mimeType: 'text/plain'
      };

      const mockUploadedFile = {
        id: 'uploaded-file-123',
        name: 'hello.txt',
        size: fileContent.length,
        mimeType: 'text/plain',
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z',
        parentReference: { driveId: 'drive-1', id: 'folder-1' },
        file: { hashes: { sha256Hash: 'upload123' } }
      };

      mockGraphClient.post.mockResolvedValue(mockUploadedFile);

      const result = await fileService.uploadFile(fileContent, metadata);

      expect(result).toBeDefined();
      expect(result.id).toBe('uploaded-file-123');
      expect(result.name).toBe('hello.txt');
      expect(result.size).toBe(fileContent.length);
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        expect.stringContaining('hello.txt'),
        fileContent,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'text/plain'
          })
        })
      );
    });

    it('should handle upload conflicts with rename strategy', async () => {
      const fileContent = Buffer.from('Conflict test', 'utf-8');
      const metadata = {
        filename: 'existing.txt',
        conflictBehavior: 'rename' as const
      };

      const mockUploadedFile = {
        id: 'renamed-file-123',
        name: 'existing (1).txt',
        size: fileContent.length,
        mimeType: 'text/plain',
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z',
        parentReference: { driveId: 'drive-1', id: 'folder-1' },
        file: { hashes: { sha256Hash: 'rename123' } }
      };

      mockGraphClient.post.mockResolvedValue(mockUploadedFile);

      const result = await fileService.uploadFile(fileContent, metadata);

      expect(result.name).toBe('existing (1).txt');
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        expect.stringContaining('rename'),
        expect.any(Buffer),
        expect.any(Object)
      );
    });

    it('should handle upload errors', async () => {
      const fileContent = Buffer.from('Error test', 'utf-8');
      const metadata = { filename: 'error.txt' };
      const error = new Error('Upload failed');

      mockGraphClient.post.mockRejectedValue(error);

      await expect(fileService.uploadFile(fileContent, metadata)).rejects.toThrow('Upload failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('uploadLargeFile', () => {
    it('should create upload session for large files', async () => {
      const mockStream = new Readable({
        read() {
          this.push('chunk1');
          this.push('chunk2');
          this.push(null);
        }
      });

      const metadata = {
        filename: 'large-file.zip',
        mimeType: 'application/zip'
      };

      const mockUploadSession = {
        uploadUrl: 'https://upload.example.com/session-123',
        expirationDateTime: new Date('2024-01-01T18:00:00Z'),
        nextExpectedRanges: ['0-']
      };

      const mockUploadedFile = {
        id: 'large-file-123',
        name: 'large-file.zip',
        size: 1048576,
        mimeType: 'application/zip',
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z',
        parentReference: { driveId: 'drive-1', id: 'folder-1' },
        file: { hashes: { sha256Hash: 'large123' } }
      };

      mockGraphClient.post
        .mockResolvedValueOnce(mockUploadSession) // Create session
        .mockResolvedValueOnce(mockUploadedFile); // Upload chunks

      const result = await fileService.uploadLargeFile(mockStream, metadata, 1048576);

      expect(result).toBeDefined();
      expect(result.id).toBe('large-file-123');
      expect(result.name).toBe('large-file.zip');
      expect(mockGraphClient.post).toHaveBeenCalledTimes(2); // Session + upload
    });

    it('should handle large file upload errors', async () => {
      const mockStream = new Readable({
        read() { this.push(null); }
      });

      const metadata = { filename: 'error-large.zip' };
      const error = new Error('Large upload failed');

      mockGraphClient.post.mockRejectedValue(error);

      await expect(fileService.uploadLargeFile(mockStream, metadata, 1048576))
        .rejects.toThrow('Large upload failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('downloadFile', () => {
    it('should download file content', async () => {
      const mockFileContent = Buffer.from('Downloaded content', 'utf-8');

      mockGraphClient.get.mockResolvedValue(mockFileContent);

      const result = await fileService.downloadFile('file-123');

      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString('utf-8')).toBe('Downloaded content');
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/drive/items/file-123/content'
      );
    });

    it('should download with custom driveId', async () => {
      const mockFileContent = Buffer.from('Custom drive content', 'utf-8');

      mockGraphClient.get.mockResolvedValue(mockFileContent);

      await fileService.downloadFile('file-123', 'custom-drive');

      expect(mockGraphClient.get).toHaveBeenCalledWith(
        expect.stringContaining('custom-drive')
      );
    });

    it('should handle download errors', async () => {
      const error = new Error('Download failed');
      mockGraphClient.get.mockRejectedValue(error);

      await expect(fileService.downloadFile('file-123')).rejects.toThrow('Download failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete file to recycle bin by default', async () => {
      mockGraphClient.delete.mockResolvedValue({});

      await fileService.deleteFile('file-123');

      expect(mockGraphClient.delete).toHaveBeenCalledWith(
        '/me/drive/items/file-123'
      );
      expect(mockLogger.info).toHaveBeenCalledWith('File file-123 deleted successfully');
    });

    it('should permanently delete file when specified', async () => {
      mockGraphClient.delete.mockResolvedValue({});

      await fileService.deleteFile('file-123', undefined, true);

      expect(mockGraphClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('file-123'),
        expect.objectContaining({
          params: expect.objectContaining({
            permanent: true
          })
        })
      );
    });

    it('should delete with custom driveId', async () => {
      mockGraphClient.delete.mockResolvedValue({});

      await fileService.deleteFile('file-123', 'custom-drive');

      expect(mockGraphClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('custom-drive')
      );
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Deletion failed');
      mockGraphClient.delete.mockRejectedValue(error);

      await expect(fileService.deleteFile('file-123')).rejects.toThrow('Deletion failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('shareFile', () => {
    it('should create share link with view permissions', async () => {
      const permissions = {
        type: 'view' as const,
        scope: 'anonymous' as const,
        requireSignIn: false
      };

      const mockShareLink = {
        id: 'share-123',
        link: {
          webUrl: 'https://example.com/share/file-123',
          type: 'view'
        },
        expirationDateTime: null,
        hasPassword: false
      };

      mockGraphClient.post.mockResolvedValue(mockShareLink);

      const result = await fileService.shareFile('file-123', permissions);

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com/share/file-123');
      expect(result.permissions).toBe('view');
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        expect.stringContaining('file-123'),
        expect.objectContaining({
          type: 'view',
          scope: 'anonymous'
        })
      );
    });

    it('should create password-protected share link', async () => {
      const permissions = {
        type: 'edit' as const,
        scope: 'organization' as const,
        password: 'secure123',
        expirationDateTime: new Date('2024-12-31T23:59:59Z')
      };

      const mockShareLink = {
        id: 'secure-share-123',
        link: {
          webUrl: 'https://example.com/secure/file-123',
          type: 'edit'
        },
        expirationDateTime: '2024-12-31T23:59:59Z',
        hasPassword: true
      };

      mockGraphClient.post.mockResolvedValue(mockShareLink);

      const result = await fileService.shareFile('file-123', permissions);

      expect(result.password).toBeDefined();
      expect(result.expirationDateTime).toBeDefined();
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        expect.stringContaining('file-123'),
        expect.objectContaining({
          password: 'secure123'
        })
      );
    });

    it('should handle sharing errors', async () => {
      const permissions = { type: 'view' as const };
      const error = new Error('Sharing failed');
      mockGraphClient.post.mockRejectedValue(error);

      await expect(fileService.shareFile('file-123', permissions)).rejects.toThrow('Sharing failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('searchFiles', () => {
    it('should search files by query', async () => {
      const mockSearchResults = [
        {
          id: 'search-result-1',
          name: 'meeting-notes.docx',
          size: 2048,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          createdDateTime: '2024-01-01T10:00:00Z',
          lastModifiedDateTime: '2024-01-01T10:00:00Z',
          parentReference: { driveId: 'drive-1', id: 'folder-1' },
          file: { hashes: { sha256Hash: 'search123' } }
        }
      ];

      // Mock search functionality
      const searchSpy = jest.spyOn(fileService, 'searchFiles');
      searchSpy.mockResolvedValue(mockSearchResults as any);

      const result = await fileService.searchFiles('meeting');

      expect(result).toHaveLength(1);
      expect(result[0].name).toContain('meeting');
    });

    it('should search with filters', async () => {
      const mockSearchResults = [
        {
          id: 'filtered-search-1',
          name: 'presentation.pptx',
          size: 4096,
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          createdDateTime: '2024-01-01T10:00:00Z',
          lastModifiedDateTime: '2024-01-01T10:00:00Z',
          parentReference: { driveId: 'drive-1', id: 'folder-1' },
          file: { hashes: { sha256Hash: 'filtered123' } }
        }
      ];

      const searchSpy = jest.spyOn(fileService, 'searchFiles');
      searchSpy.mockResolvedValue(mockSearchResults as any);

      const options = {
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        minSize: 1000,
        limit: 5
      };

      const result = await fileService.searchFiles('presentation', options);

      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toContain('presentation');
    });

    it('should return empty array when no results found', async () => {
      const searchSpy = jest.spyOn(fileService, 'searchFiles');
      searchSpy.mockResolvedValue([]);

      const result = await fileService.searchFiles('nonexistent');

      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('moveFile', () => {
    it('should move file to different folder', async () => {
      const mockMovedFile = {
        id: 'file-123',
        name: 'moved-file.txt',
        size: 1024,
        mimeType: 'text/plain',
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T15:00:00Z',
        parentReference: { driveId: 'drive-1', id: 'new-folder-456' },
        file: { hashes: { sha256Hash: 'moved123' } }
      };

      mockGraphClient.patch.mockResolvedValue(mockMovedFile);

      const result = await fileService.moveFile('file-123', 'new-folder-456');

      expect(result).toBeDefined();
      expect(result.path).toContain('new-folder-456');
      expect(mockGraphClient.patch).toHaveBeenCalledWith(
        expect.stringContaining('file-123'),
        expect.objectContaining({
          parentReference: expect.objectContaining({
            id: 'new-folder-456'
          })
        })
      );
    });

    it('should handle move errors', async () => {
      const error = new Error('Move failed');
      mockGraphClient.patch.mockRejectedValue(error);

      await expect(fileService.moveFile('file-123', 'folder-456')).rejects.toThrow('Move failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('copyFile', () => {
    it('should copy file to target folder', async () => {
      const mockCopyOperation = {
        id: 'copy-operation-123',
        status: 'completed',
        resourceLocation: '/me/drive/items/copied-file-456'
      };

      mockGraphClient.post.mockResolvedValue(mockCopyOperation);

      const result = await fileService.copyFile('file-123', 'target-folder-789', 'copied-file.txt');

      expect(result).toBe('copied-file-456');
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        expect.stringContaining('file-123'),
        expect.objectContaining({
          parentReference: expect.objectContaining({
            id: 'target-folder-789'
          }),
          name: 'copied-file.txt'
        })
      );
    });

    it('should handle copy errors', async () => {
      const error = new Error('Copy failed');
      mockGraphClient.post.mockRejectedValue(error);

      await expect(fileService.copyFile('file-123', 'folder-789')).rejects.toThrow('Copy failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getFileMetadata', () => {
    it('should retrieve file metadata', async () => {
      const mockMetadata = {
        id: 'file-123',
        name: 'metadata-test.pdf',
        size: 2048,
        mimeType: 'application/pdf',
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z',
        createdBy: { user: { displayName: 'Test User' } },
        lastModifiedBy: { user: { displayName: 'Test User' } },
        file: {
          hashes: { sha256Hash: 'metadata123' }
        }
      };

      mockGraphClient.get.mockResolvedValue(mockMetadata);

      const result = await fileService.getFileMetadata('file-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('file-123');
      expect(result.name).toBe('metadata-test.pdf');
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        expect.stringContaining('file-123'),
        expect.objectContaining({
          params: expect.objectContaining({
            $select: expect.stringContaining('createdBy')
          })
        })
      );
    });

    it('should handle metadata errors', async () => {
      const error = new Error('Metadata failed');
      mockGraphClient.get.mockRejectedValue(error);

      await expect(fileService.getFileMetadata('file-123')).rejects.toThrow('Metadata failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});