// @ts-nocheck
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FileService, FileQueryOptions, FileMetadataInput } from '../../../../../src/infrastructure/adapters/microsoft/services/FileService';
import { GraphClient } from '../../../../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { CacheManager } from '../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager';
import { ChromaDbInitializer } from '../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer';
import { Logger } from '../../../../../src/shared/logging/Logger';
import { File } from '../../../../../src/domain/entities/File';
import { Readable } from 'stream';

// Mock external dependencies
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager');
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer');
jest.mock('chromadb');

global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('FileService Integration Tests', () => {
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

  // Test utilities
  const createMockOneDriveFile = (overrides: any = {}) => ({
    id: 'onedrive-file-123',
    name: 'onedrive-document.docx',
    size: 2048,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    createdDateTime: '2024-01-01T10:00:00Z',
    lastModifiedDateTime: '2024-01-01T10:00:00Z',
    parentReference: { 
      driveId: 'personal-onedrive-drive',
      driveType: 'personal',
      id: 'personal-folder-1',
      path: '/drive/root:/Documents'
    },
    file: { hashes: { sha256Hash: 'onedrive123' } },
    webUrl: 'https://onedrive.live.com/file-123',
    '@microsoft.graph.downloadUrl': 'https://api.onedrive.live.com/download/file-123',
    ...overrides
  });

  const createMockSharePointFile = (overrides: any = {}) => ({
    id: 'sharepoint-file-456',
    name: 'sharepoint-document.xlsx',
    size: 4096,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    createdDateTime: '2024-01-01T11:00:00Z',
    lastModifiedDateTime: '2024-01-01T11:00:00Z',
    parentReference: {
      driveId: 'sharepoint-site-drive',
      driveType: 'documentLibrary',
      id: 'sharepoint-folder-1',
      path: '/drives/sharepoint-site-drive/root:/Shared Documents',
      siteId: 'company.sharepoint.com,site-123,web-456'
    },
    file: { hashes: { sha256Hash: 'sharepoint456' } },
    webUrl: 'https://company.sharepoint.com/sites/team/document.xlsx',
    '@microsoft.graph.downloadUrl': 'https://company.sharepoint.com/download/file-456',
    ...overrides
  });

  const createMockTeamsFile = (overrides: any = {}) => ({
    id: 'teams-file-789',
    name: 'teams-meeting-notes.onenb',
    size: 1024,
    mimeType: 'application/onenote',
    createdDateTime: '2024-01-01T12:00:00Z',
    lastModifiedDateTime: '2024-01-01T12:00:00Z',
    parentReference: {
      driveId: 'teams-channel-drive',
      driveType: 'documentLibrary',
      id: 'teams-folder-1',
      path: '/drives/teams-channel-drive/root:/General',
      siteId: 'company.sharepoint.com,teams-site-789,web-012'
    },
    file: { hashes: { sha256Hash: 'teams789' } },
    webUrl: 'https://teams.microsoft.com/file/teams-file-789',
    '@microsoft.graph.downloadUrl': 'https://teams.microsoft.com/download/file-789',
    ...overrides
  });

  describe('OneDrive vs SharePoint Drive Operations', () => {
    it('should handle OneDrive personal files correctly', async () => {
      const mockOneDriveFile = createMockOneDriveFile();
      mockGraphClient.get.mockResolvedValue(mockOneDriveFile);

      const result = await fileService.getFile('onedrive-file-123');

      expect(result).toBeDefined();
      expect(result.name).toBe('onedrive-document.docx');
      expect(result.webUrl).toContain('onedrive.live.com');
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/drive/items/onedrive-file-123',
        expect.any(Object)
      );
    });

    it('should handle SharePoint document library files correctly', async () => {
      const mockSharePointFile = createMockSharePointFile();
      mockGraphClient.get.mockResolvedValue(mockSharePointFile);

      const result = await fileService.getFile('sharepoint-file-456', 'sharepoint-site-drive');

      expect(result).toBeDefined();
      expect(result.name).toBe('sharepoint-document.xlsx');
      expect(result.webUrl).toContain('sharepoint.com');
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/drives/sharepoint-site-drive/items/sharepoint-file-456',
        expect.any(Object)
      );
    });

    it('should handle Microsoft Teams channel files correctly', async () => {
      const mockTeamsFile = createMockTeamsFile();
      mockGraphClient.get.mockResolvedValue(mockTeamsFile);

      const result = await fileService.getFile('teams-file-789', 'teams-channel-drive');

      expect(result).toBeDefined();
      expect(result.name).toBe('teams-meeting-notes.onenb');
      expect(result.webUrl).toContain('teams.microsoft.com');
    });

    it('should list files from different drive types with proper endpoints', async () => {
      const mockOneDriveResponse = {
        value: [createMockOneDriveFile()],
        '@odata.count': 1
      };
      
      const mockSharePointResponse = {
        value: [createMockSharePointFile()],
        '@odata.count': 1
      };

      // Test OneDrive listing (no driveId)
      mockGraphClient.get.mockResolvedValueOnce(mockOneDriveResponse);
      const oneDriveResult = await fileService.listFiles();
      
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/drive/root/children',
        expect.any(Object)
      );

      // Test SharePoint listing (with driveId)
      mockGraphClient.get.mockResolvedValueOnce(mockSharePointResponse);
      const sharePointResult = await fileService.listFiles({ driveId: 'sharepoint-site-drive' });
      
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/drives/sharepoint-site-drive/root/children',
        expect.any(Object)
      );

      expect(oneDriveResult.files[0].webUrl).toContain('onedrive.live.com');
      expect(sharePointResult.files[0].webUrl).toContain('sharepoint.com');
    });

    it('should handle drive-specific upload paths correctly', async () => {
      const fileContent = Buffer.from('Test content');
      
      // OneDrive upload (no driveId specified)
      const oneDriveMetadata = { filename: 'onedrive-test.txt' };
      const mockOneDriveFile = createMockOneDriveFile({ name: 'onedrive-test.txt' });
      mockGraphClient.put.mockResolvedValueOnce(mockOneDriveFile);

      await fileService.uploadFile(fileContent, oneDriveMetadata);
      
      expect(mockGraphClient.put).toHaveBeenCalledWith(
        '/me/drive/root:/onedrive-test.txt:/content',
        fileContent,
        expect.any(Object)
      );

      // SharePoint upload would need drive-specific handling in the service
      // This demonstrates the need for drive-aware upload logic
    });

    it('should handle cross-drive file operations', async () => {
      // Move file from OneDrive to SharePoint (would require special handling)
      const oneDriveFile = createMockOneDriveFile();
      const sharePointFolder = 'sharepoint-target-folder';
      
      // This would typically fail in real scenarios as you can't move across drives
      // But the service should handle the error gracefully
      const crossDriveError = new Error('Cannot move files across different drives');
      crossDriveError.name = 'InvalidRequest';
      mockGraphClient.patch.mockRejectedValue(crossDriveError);

      await expect(
        fileService.moveFile('onedrive-file-123', sharePointFolder, 'sharepoint-site-drive')
      ).rejects.toThrow('Cannot move files across different drives');
    });

    it('should handle drive-specific sharing permissions', async () => {
      const permissions = { type: 'view' as const, scope: 'organization' as const };
      
      // OneDrive sharing (personal)
      const oneDriveShareLink = {
        id: 'onedrive-share-123',
        link: { webUrl: 'https://onedrive.live.com/share/file-123', type: 'view' }
      };
      
      // SharePoint sharing (organizational)
      const sharePointShareLink = {
        id: 'sharepoint-share-456',
        link: { webUrl: 'https://company.sharepoint.com/share/file-456', type: 'view' }
      };

      mockGraphClient.post
        .mockResolvedValueOnce(oneDriveShareLink)
        .mockResolvedValueOnce(sharePointShareLink);

      // OneDrive sharing
      const oneDriveResult = await fileService.shareFile('onedrive-file-123', permissions);
      expect(oneDriveResult.url).toContain('onedrive.live.com');

      // SharePoint sharing
      const sharePointResult = await fileService.shareFile('sharepoint-file-456', permissions, 'sharepoint-site-drive');
      expect(sharePointResult.url).toContain('sharepoint.com');
    });

    it('should handle drive type-specific search contexts', async () => {
      // Mock ChromaDB not available, testing Graph API search
      (fileService as any).searchCollection = null;
      
      const oneDriveSearchResponse = {
        value: [createMockOneDriveFile({ name: 'onedrive-search-result.docx' })]
      };
      
      const sharePointSearchResponse = {
        value: [createMockSharePointFile({ name: 'sharepoint-search-result.xlsx' })]
      };

      // OneDrive search
      mockGraphClient.get.mockResolvedValueOnce(oneDriveSearchResponse);
      const oneDriveResults = await fileService.searchFiles('quarterly report');
      
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        "/me/drive/search(q='quarterly%20report')",
        expect.any(Object)
      );

      // SharePoint search with drive context
      mockGraphClient.get.mockResolvedValueOnce(sharePointSearchResponse);
      const sharePointResults = await fileService.searchFiles('quarterly report', { driveId: 'sharepoint-site-drive' });
      
      // Note: This would need to be implemented in the service to use drive-specific search
      expect(oneDriveResults[0].webUrl).toContain('onedrive.live.com');
    });
  });

  describe('File Lifecycle Integration Workflows', () => {
    it('should complete full file lifecycle: upload → update → move → share → delete', async () => {
      const fileContent = Buffer.from('Initial content');
      const metadata = { filename: 'lifecycle-test.txt', description: 'Test file' };
      
      // 1. Upload
      const mockUploadedFile = createMockOneDriveFile({ 
        id: 'lifecycle-file-123',
        name: 'lifecycle-test.txt'
      });
      mockGraphClient.put.mockResolvedValueOnce(mockUploadedFile);
      
      const uploadedFile = await fileService.uploadFile(fileContent, metadata);
      expect(uploadedFile.name).toBe('lifecycle-test.txt');
      
      // 2. Update metadata
      mockGraphClient.patch.mockResolvedValueOnce({
        ...mockUploadedFile,
        description: 'Updated description'
      });
      
      // 3. Move to different folder
      const mockMovedFile = {
        ...mockUploadedFile,
        parentReference: { 
          ...mockUploadedFile.parentReference,
          id: 'target-folder-456',
          path: '/drive/root:/Archive'
        }
      };
      mockGraphClient.patch.mockResolvedValueOnce(mockMovedFile);
      
      const movedFile = await fileService.moveFile('lifecycle-file-123', 'target-folder-456');
      expect(movedFile.parentId).toBe('target-folder-456');
      
      // 4. Share with permissions
      const sharePermissions = { type: 'view' as const, scope: 'anonymous' as const };
      const mockShareLink = {
        id: 'share-123',
        link: { webUrl: 'https://share.example.com/file-123', type: 'view' }
      };
      mockGraphClient.post.mockResolvedValueOnce(mockShareLink);
      
      const shareResult = await fileService.shareFile('lifecycle-file-123', sharePermissions);
      expect(shareResult.url).toBe('https://share.example.com/file-123');
      
      // 5. Delete
      mockGraphClient.delete.mockResolvedValueOnce({});
      
      await fileService.deleteFile('lifecycle-file-123');
      expect(mockGraphClient.delete).toHaveBeenCalledWith('/me/drive/items/lifecycle-file-123');
      
      // Verify all operations were logged
      expect(mockLogger.info).toHaveBeenCalledWith('File uploaded successfully', expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith('File moved successfully', expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith('File shared successfully', expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith('File deleted successfully', expect.any(Object));
    });

    it('should handle large file upload and chunked streaming workflow', async () => {
      const largeContentSize = 50 * 1024 * 1024; // 50MB
      const chunks: Buffer[] = [];
      
      // Create stream with multiple chunks
      const chunkSize = 10 * 1024 * 1024; // 10MB chunks
      for (let i = 0; i < largeContentSize; i += chunkSize) {
        const actualChunkSize = Math.min(chunkSize, largeContentSize - i);
        chunks.push(Buffer.alloc(actualChunkSize, 'x'));
      }

      const mockStream = new Readable({
        read() {
          const chunk = chunks.shift();
          this.push(chunk || null);
        }
      });

      const metadata = { filename: 'large-workflow.zip', mimeType: 'application/zip' };
      
      // 1. Create upload session
      const mockUploadSession = {
        uploadUrl: 'https://upload.example.com/session-large',
        expirationDateTime: '2024-01-01T18:00:00Z'
      };
      mockGraphClient.post.mockResolvedValueOnce(mockUploadSession);
      
      // 2. Mock chunk uploads
      const mockFinalFile = createMockOneDriveFile({
        id: 'large-file-456',
        name: 'large-workflow.zip',
        size: largeContentSize,
        mimeType: 'application/zip'
      });
      
      // Mock successful chunk uploads
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({ ok: true, status: 202, json: jest.fn().mockResolvedValue({}) }) // Chunk 1
        .mockResolvedValueOnce({ ok: true, status: 202, json: jest.fn().mockResolvedValue({}) }) // Chunk 2
        .mockResolvedValueOnce({ ok: true, status: 202, json: jest.fn().mockResolvedValue({}) }) // Chunk 3
        .mockResolvedValueOnce({ ok: true, status: 202, json: jest.fn().mockResolvedValue({}) }) // Chunk 4
        .mockResolvedValueOnce({ ok: true, status: 201, json: jest.fn().mockResolvedValue(mockFinalFile) }); // Final chunk
      
      const result = await fileService.uploadLargeFile(mockStream, metadata, largeContentSize);
      
      expect(result.name).toBe('large-workflow.zip');
      expect(result.size).toBe(largeContentSize);
      expect(global.fetch).toHaveBeenCalledTimes(5); // 5 chunks total
      
      // Verify upload session was created
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        '/me/drive/root:/large-workflow.zip:/createUploadSession',
        expect.any(Object)
      );
    });

    it('should handle folder organization workflow with nested operations', async () => {
      // 1. Create main folder
      const mainFolderData = { name: 'Project Alpha', folder: {} };
      const mockMainFolder = createMockOneDriveFile({
        id: 'main-folder-123',
        name: 'Project Alpha',
        folder: { childCount: 0 },
        file: undefined
      });
      
      mockGraphClient.post.mockResolvedValueOnce(mockMainFolder);
      
      // 2. Create subfolders
      const subfolderNames = ['Documents', 'Presentations', 'Spreadsheets'];
      const mockSubfolders = subfolderNames.map((name, index) => 
        createMockOneDriveFile({
          id: `subfolder-${index}`,
          name,
          folder: { childCount: 0 },
          file: undefined,
          parentReference: { id: 'main-folder-123' }
        })
      );
      
      mockGraphClient.post
        .mockResolvedValueOnce(mockSubfolders[0])
        .mockResolvedValueOnce(mockSubfolders[1])
        .mockResolvedValueOnce(mockSubfolders[2]);
      
      // 3. Upload files to different subfolders
      const testFiles = [
        { content: Buffer.from('Document content'), metadata: { filename: 'doc.docx', parentId: 'subfolder-0' } },
        { content: Buffer.from('Presentation content'), metadata: { filename: 'pres.pptx', parentId: 'subfolder-1' } },
        { content: Buffer.from('Spreadsheet content'), metadata: { filename: 'data.xlsx', parentId: 'subfolder-2' } }
      ];
      
      const mockUploadedFiles = testFiles.map((file, index) =>
        createMockOneDriveFile({
          id: `file-${index}`,
          name: file.metadata.filename,
          parentReference: { id: file.metadata.parentId }
        })
      );
      
      mockGraphClient.put
        .mockResolvedValueOnce(mockUploadedFiles[0])
        .mockResolvedValueOnce(mockUploadedFiles[1])
        .mockResolvedValueOnce(mockUploadedFiles[2]);
      
      // Execute workflow
      for (const file of testFiles) {
        await fileService.uploadFile(file.content, file.metadata);
      }
      
      // 4. List folder contents to verify organization
      const mockFolderContents = {
        value: [...mockSubfolders, ...mockUploadedFiles],
        '@odata.count': 6
      };
      
      mockGraphClient.get.mockResolvedValueOnce(mockFolderContents);
      
      const folderContents = await fileService.listFiles({ folderId: 'main-folder-123' });
      
      const folders = folderContents.files.filter(f => f.isFolder);
      const files = folderContents.files.filter(f => !f.isFolder);
      
      expect(folders).toHaveLength(3);
      expect(files).toHaveLength(3);
      expect(folderContents.totalCount).toBe(6);
    });

    it('should handle collaborative sharing workflow with multiple permission levels', async () => {
      const fileId = 'collaborative-file-123';
      
      // 1. Create view-only share link for external reviewers
      const viewSharePermissions = { 
        type: 'view' as const, 
        scope: 'anonymous' as const,
        expirationDateTime: new Date('2024-12-31T23:59:59Z')
      };
      
      const mockViewShareLink = {
        id: 'view-share-123',
        link: { webUrl: 'https://share.example.com/view/file-123', type: 'view' },
        expirationDateTime: '2024-12-31T23:59:59Z'
      };
      
      mockGraphClient.post.mockResolvedValueOnce(mockViewShareLink);
      
      const viewShare = await fileService.shareFile(fileId, viewSharePermissions);
      expect(viewShare.type).toBe('view');
      expect(viewShare.expirationDateTime).toBeDefined();
      
      // 2. Create edit share link for team members
      const editSharePermissions = {
        type: 'edit' as const,
        scope: 'organization' as const,
        sendInvitation: true,
        recipients: ['team1@company.com', 'team2@company.com'],
        message: 'Collaborate on this document'
      };
      
      const mockEditShareLink = {
        id: 'edit-share-456',
        link: { webUrl: 'https://share.example.com/edit/file-123', type: 'edit' }
      };
      
      mockGraphClient.post
        .mockResolvedValueOnce(mockEditShareLink) // Create link
        .mockResolvedValueOnce({}); // Send invitations
      
      const editShare = await fileService.shareFile(fileId, editSharePermissions);
      expect(editShare.type).toBe('edit');
      
      // Verify invitation was sent
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        `/me/drive/items/${fileId}/invite`,
        expect.objectContaining({
          recipients: [{ email: 'team1@company.com' }, { email: 'team2@company.com' }],
          message: 'Collaborate on this document'
        })
      );
      
      // 3. Create password-protected share for sensitive access
      const secureSharePermissions = {
        type: 'view' as const,
        scope: 'users' as const,
        password: 'SecurePass123!',
        requireSignIn: true
      };
      
      const mockSecureShareLink = {
        id: 'secure-share-789',
        link: { webUrl: 'https://share.example.com/secure/file-123', type: 'view' },
        hasPassword: true
      };
      
      mockGraphClient.post.mockResolvedValueOnce(mockSecureShareLink);
      
      const secureShare = await fileService.shareFile(fileId, secureSharePermissions);
      expect(secureShare.password).toBe('SecurePass123!');
      expect(secureShare.requiresSignIn).toBe(true);
    });

    it('should handle file conflict resolution during bulk operations', async () => {
      const conflictingFiles = [
        { content: Buffer.from('Version 1'), metadata: { filename: 'conflict.txt', conflictBehavior: 'rename' as const } },
        { content: Buffer.from('Version 2'), metadata: { filename: 'conflict.txt', conflictBehavior: 'replace' as const } },
        { content: Buffer.from('Version 3'), metadata: { filename: 'conflict.txt', conflictBehavior: 'fail' as const } }
      ];
      
      // 1. First upload succeeds
      const mockFile1 = createMockOneDriveFile({ 
        id: 'conflict-file-1',
        name: 'conflict.txt'
      });
      mockGraphClient.put.mockResolvedValueOnce(mockFile1);
      
      const result1 = await fileService.uploadFile(conflictingFiles[0].content, conflictingFiles[0].metadata);
      expect(result1.name).toBe('conflict.txt');
      
      // 2. Second upload with rename strategy
      const mockFile2 = createMockOneDriveFile({ 
        id: 'conflict-file-2',
        name: 'conflict (1).txt'  // Auto-renamed
      });
      mockGraphClient.put.mockResolvedValueOnce(mockFile2);
      
      const result2 = await fileService.uploadFile(conflictingFiles[1].content, conflictingFiles[1].metadata);
      expect(result2.name).toBe('conflict (1).txt');
      
      // 3. Third upload with fail strategy should throw
      const conflictError = new Error('File already exists');
      conflictError.name = 'Conflict';
      mockGraphClient.put.mockRejectedValueOnce(conflictError);
      
      await expect(
        fileService.uploadFile(conflictingFiles[2].content, conflictingFiles[2].metadata)
      ).rejects.toThrow('File already exists');
    });

    it('should handle file versioning and rollback workflow', async () => {
      const fileId = 'versioned-file-123';
      
      // 1. Get file with version history
      const mockFileWithVersions = createMockOneDriveFile({
        id: fileId,
        name: 'versioned-document.docx',
        versions: [
          {
            id: 'v1',
            lastModifiedDateTime: '2024-01-01T10:00:00Z',
            size: 1024,
            comment: 'Initial version'
          },
          {
            id: 'v2', 
            lastModifiedDateTime: '2024-01-02T10:00:00Z',
            size: 1124,
            comment: 'Added introduction'
          },
          {
            id: 'v3',
            lastModifiedDateTime: '2024-01-03T10:00:00Z',
            size: 1200,
            comment: 'Current version'
          }
        ]
      });
      
      const mockExtendedMetadata = {
        ...mockFileWithVersions,
        versions: mockFileWithVersions.versions
      };
      
      mockGraphClient.get
        .mockResolvedValueOnce(mockFileWithVersions) // Basic file
        .mockResolvedValueOnce(mockExtendedMetadata); // Extended metadata
      
      const metadata = await fileService.getFileMetadata(fileId);
      
      expect(metadata.basic.name).toBe('versioned-document.docx');
      expect(metadata.versions).toHaveLength(3);
      expect(metadata.versions[2].comment).toBe('Current version');
      
      // 2. Download specific version (would need additional API support)
      const versionContent = Buffer.from('Version 2 content');
      mockGraphClient.get.mockResolvedValueOnce(versionContent.buffer);
      
      // This would require version-specific download endpoint
      // const versionData = await fileService.downloadFileVersion(fileId, 'v2');
      // expect(versionData.toString()).toBe('Version 2 content');
    });
  });

  describe('Performance and Stress Testing', () => {
    it('should handle concurrent file operations without race conditions', async () => {
      const concurrentOperations = 20;
      const operations: Promise<any>[] = [];
      
      // Create mock responses for concurrent operations
      for (let i = 0; i < concurrentOperations; i++) {
        const mockFile = createMockOneDriveFile({
          id: `concurrent-file-${i}`,
          name: `file-${i}.txt`
        });
        
        // Add various operations
        if (i % 4 === 0) {
          // Upload operation
          mockGraphClient.put.mockResolvedValueOnce(mockFile);
          operations.push(fileService.uploadFile(
            Buffer.from(`Content ${i}`),
            { filename: `file-${i}.txt` }
          ));
        } else if (i % 4 === 1) {
          // Get operation
          mockGraphClient.get.mockResolvedValueOnce(mockFile);
          operations.push(fileService.getFile(`concurrent-file-${i}`));
        } else if (i % 4 === 2) {
          // List operation
          mockGraphClient.get.mockResolvedValueOnce({
            value: [mockFile],
            '@odata.count': 1
          });
          operations.push(fileService.listFiles({ limit: 1 }));
        } else {
          // Download operation
          mockGraphClient.get.mockResolvedValueOnce(Buffer.from(`Downloaded content ${i}`).buffer);
          operations.push(fileService.downloadFile(`concurrent-file-${i}`));
        }
      }
      
      const results = await Promise.allSettled(operations);
      
      // All operations should complete successfully
      const successful = results.filter(r => r.status === 'fulfilled');
      expect(successful).toHaveLength(concurrentOperations);
      
      // Verify no race conditions in logging
      expect(mockLogger.info).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should handle large batch file listing with proper memory management', async () => {
      const batchSize = 1000;
      const totalFiles = 5000;
      
      // Create large file list response
      const createBatchResponse = (offset: number, count: number) => ({
        value: Array.from({ length: count }, (_, i) =>
          createMockOneDriveFile({
            id: `batch-file-${offset + i}`,
            name: `batch-file-${offset + i}.txt`
          })
        ),
        '@odata.count': totalFiles,
        '@odata.nextLink': offset + count < totalFiles ? 
          `https://graph.microsoft.com/next?skip=${offset + count}` : undefined
      });
      
      mockGraphClient.get.mockResolvedValue(createBatchResponse(0, batchSize));
      
      const result = await fileService.listFiles({ limit: batchSize });
      
      expect(result.files).toHaveLength(batchSize);
      expect(result.totalCount).toBe(totalFiles);
      expect(result.pagination.hasNextPage).toBe(true);
      
      // Verify memory usage doesn't grow unbounded
      const memoryBefore = process.memoryUsage().heapUsed;
      
      // Process multiple pages
      for (let i = 1; i < 3; i++) {
        mockGraphClient.get.mockResolvedValue(createBatchResponse(i * batchSize, batchSize));
        await fileService.listFiles({ limit: batchSize, skip: i * batchSize });
      }
      
      const memoryAfter = process.memoryUsage().heapUsed;
      const memoryGrowth = memoryAfter - memoryBefore;
      
      // Memory growth should be reasonable (less than 100MB for test data)
      expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024);
    });

    it('should handle search operations across large datasets efficiently', async () => {
      const mockSearchCollection = {
        query: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn()
      };
      
      (fileService as any).searchCollection = mockSearchCollection;
      
      // Mock search results with varying relevance scores
      const mockSearchResults = {
        ids: [Array.from({ length: 100 }, (_, i) => `search-result-${i}`)],
        documents: [Array.from({ length: 100 }, (_, i) => `Document ${i} content`)],
        metadatas: [Array.from({ length: 100 }, (_, i) => ({ 
          fileId: `search-result-${i}`,
          name: `result-${i}.txt`,
          relevanceScore: 1 - (i * 0.01) // Decreasing relevance
        }))],
        distances: [Array.from({ length: 100 }, (_, i) => i * 0.01)] // Increasing distance
      };
      
      mockSearchCollection.query.mockResolvedValue(mockSearchResults);
      
      // Mock file fetching for search results
      mockGraphClient.get.mockImplementation((endpoint) => {
        const fileId = endpoint.match(/items\/([^\/]+)/)?.[1];
        if (fileId?.startsWith('search-result-')) {
          return Promise.resolve(createMockOneDriveFile({
            id: fileId,
            name: `${fileId}.txt`
          }));
        }
        return Promise.reject(new Error('File not found'));
      });
      
      const searchQueries = [
        'important project documents',
        'quarterly financial reports',
        'meeting notes 2024',
        'presentation templates'
      ];
      
      // Execute multiple searches concurrently
      const searchPromises = searchQueries.map(query =>
        fileService.searchFiles(query, { limit: 25 })
      );
      
      const searchResults = await Promise.all(searchPromises);
      
      // Verify all searches completed successfully
      expect(searchResults).toHaveLength(4);
      searchResults.forEach(results => {
        expect(results).toHaveLength(25); // Limited to 25 results
      });
      
      // Verify search collection was called efficiently
      expect(mockSearchCollection.query).toHaveBeenCalledTimes(4);
      
      // Verify file fetching was called for each result
      expect(mockGraphClient.get).toHaveBeenCalledTimes(100); // 4 searches * 25 results
    });
  });
});