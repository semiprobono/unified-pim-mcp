// @ts-nocheck
import { jest } from '@jest/globals';
import { File, FilePermissions, ShareLink, FileVersion, FileActivity } from '../../../../../src/domain/entities/File';
import { UnifiedId } from '../../../../../src/domain/value-objects/UnifiedId';
import { Platform } from '../../../../../src/domain/value-objects/Platform';

/**
 * Test utilities for FileService testing
 */
export class FileServiceTestUtils {
  /**
   * Create a mock OneDrive file with realistic Graph API structure
   */
  static createMockOneDriveFile(overrides: any = {}) {
    return {
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
      file: { 
        hashes: { 
          sha256Hash: 'onedrive123',
          sha1Hash: 'od456',
          quickXorHash: 'od789'
        },
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      },
      webUrl: 'https://onedrive.live.com/file-123',
      '@microsoft.graph.downloadUrl': 'https://api.onedrive.live.com/download/file-123',
      createdBy: { user: { displayName: 'John Doe', email: 'john@personal.com' } },
      lastModifiedBy: { user: { displayName: 'John Doe', email: 'john@personal.com' } },
      thumbnails: [
        {
          large: { url: 'https://thumb-large-od.jpg', width: 800, height: 600 },
          medium: { url: 'https://thumb-medium-od.jpg', width: 400, height: 300 },
          small: { url: 'https://thumb-small-od.jpg', width: 200, height: 150 }
        }
      ],
      ...overrides
    };
  }

  /**
   * Create a mock SharePoint file with realistic Graph API structure
   */
  static createMockSharePointFile(overrides: any = {}) {
    return {
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
      file: { 
        hashes: { 
          sha256Hash: 'sharepoint456',
          sha1Hash: 'sp789',
          quickXorHash: 'sp012'
        },
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      },
      webUrl: 'https://company.sharepoint.com/sites/team/document.xlsx',
      '@microsoft.graph.downloadUrl': 'https://company.sharepoint.com/download/file-456',
      createdBy: { user: { displayName: 'Alice Johnson', email: 'alice@company.com' } },
      lastModifiedBy: { user: { displayName: 'Bob Smith', email: 'bob@company.com' } },
      shared: {
        sharedBy: { user: { displayName: 'Alice Johnson', email: 'alice@company.com' } },
        sharedDateTime: '2024-01-02T10:00:00Z',
        scope: 'organization'
      },
      permissions: [
        {
          id: 'perm-1',
          roles: ['read', 'write'],
          grantedTo: { user: { displayName: 'Team Members' } },
          link: null
        }
      ],
      ...overrides
    };
  }

  /**
   * Create a mock Teams file with realistic Graph API structure
   */
  static createMockTeamsFile(overrides: any = {}) {
    return {
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
      file: { 
        hashes: { 
          sha256Hash: 'teams789',
          sha1Hash: 'tm012',
          quickXorHash: 'tm345'
        },
        mimeType: 'application/onenote'
      },
      webUrl: 'https://teams.microsoft.com/file/teams-file-789',
      '@microsoft.graph.downloadUrl': 'https://teams.microsoft.com/download/file-789',
      createdBy: { user: { displayName: 'Carol Wilson', email: 'carol@company.com' } },
      lastModifiedBy: { user: { displayName: 'David Brown', email: 'david@company.com' } },
      ...overrides
    };
  }

  /**
   * Create a mock folder with realistic Graph API structure
   */
  static createMockFolder(overrides: any = {}) {
    return {
      id: 'folder-123',
      name: 'Test Folder',
      size: 0,
      createdDateTime: '2024-01-01T10:00:00Z',
      lastModifiedDateTime: '2024-01-01T10:00:00Z',
      parentReference: { 
        driveId: 'drive-1', 
        id: 'root', 
        path: '/drive/root:' 
      },
      folder: { 
        childCount: 5,
        view: {
          viewType: 'thumbnails',
          sortBy: 'name',
          sortOrder: 'ascending'
        }
      },
      webUrl: 'https://onedrive.com/folder-123',
      createdBy: { user: { displayName: 'Test User', email: 'test@example.com' } },
      lastModifiedBy: { user: { displayName: 'Test User', email: 'test@example.com' } },
      ...overrides
    };
  }

  /**
   * Create a mock file with specific file type characteristics
   */
  static createMockFileByType(fileType: 'document' | 'image' | 'video' | 'audio' | 'archive' | 'code', overrides: any = {}) {
    const baseFile = this.createMockOneDriveFile();
    
    const typeConfigs = {
      document: {
        name: 'document.pdf',
        mimeType: 'application/pdf',
        size: 2048576, // 2MB
        file: {
          hashes: baseFile.file.hashes,
          mimeType: 'application/pdf',
          processingMetadata: {
            pageCount: 25,
            wordCount: 1500
          }
        }
      },
      image: {
        name: 'image.jpg',
        mimeType: 'image/jpeg',
        size: 5242880, // 5MB
        file: {
          hashes: baseFile.file.hashes,
          mimeType: 'image/jpeg'
        },
        image: {
          width: 1920,
          height: 1080
        },
        thumbnails: [
          {
            large: { url: 'https://thumb-large.jpg', width: 800, height: 600 },
            medium: { url: 'https://thumb-medium.jpg', width: 400, height: 300 },
            small: { url: 'https://thumb-small.jpg', width: 200, height: 150 }
          }
        ]
      },
      video: {
        name: 'video.mp4',
        mimeType: 'video/mp4',
        size: 104857600, // 100MB
        file: {
          hashes: baseFile.file.hashes,
          mimeType: 'video/mp4'
        },
        video: {
          duration: 3600000, // 1 hour
          bitrate: 2000000,
          width: 1920,
          height: 1080
        }
      },
      audio: {
        name: 'audio.mp3',
        mimeType: 'audio/mpeg',
        size: 10485760, // 10MB
        file: {
          hashes: baseFile.file.hashes,
          mimeType: 'audio/mpeg'
        },
        audio: {
          duration: 240000, // 4 minutes
          bitrate: 320000,
          album: 'Test Album',
          artist: 'Test Artist'
        }
      },
      archive: {
        name: 'archive.zip',
        mimeType: 'application/zip',
        size: 52428800, // 50MB
        file: {
          hashes: baseFile.file.hashes,
          mimeType: 'application/zip'
        },
        package: {
          type: 'zip'
        }
      },
      code: {
        name: 'script.ts',
        mimeType: 'text/typescript',
        size: 4096,
        file: {
          hashes: baseFile.file.hashes,
          mimeType: 'text/typescript'
        }
      }
    };

    return {
      ...baseFile,
      ...typeConfigs[fileType],
      ...overrides
    };
  }

  /**
   * Create a mock file with version history
   */
  static createMockFileWithVersions(overrides: any = {}) {
    const baseFile = this.createMockOneDriveFile();
    
    return {
      ...baseFile,
      versions: [
        {
          id: 'v1.0',
          lastModifiedDateTime: '2024-01-01T10:00:00Z',
          lastModifiedBy: { user: { displayName: 'John Doe' } },
          size: 1024,
          '@microsoft.graph.downloadUrl': 'https://download.example.com/v1'
        },
        {
          id: 'v1.1',
          lastModifiedDateTime: '2024-01-02T10:00:00Z',
          lastModifiedBy: { user: { displayName: 'Jane Smith' } },
          size: 1124,
          '@microsoft.graph.downloadUrl': 'https://download.example.com/v1.1'
        },
        {
          id: 'v2.0',
          lastModifiedDateTime: '2024-01-03T10:00:00Z',
          lastModifiedBy: { user: { displayName: 'Bob Johnson' } },
          size: 1200,
          '@microsoft.graph.downloadUrl': 'https://download.example.com/v2'
        }
      ],
      ...overrides
    };
  }

  /**
   * Create a mock file with sharing permissions
   */
  static createMockFileWithSharing(overrides: any = {}) {
    const baseFile = this.createMockOneDriveFile();
    
    return {
      ...baseFile,
      shared: {
        sharedBy: { user: { displayName: 'Alice Johnson' } },
        sharedDateTime: '2024-01-02T10:00:00Z',
        scope: 'users'
      },
      permissions: [
        {
          id: 'perm-view-123',
          roles: ['read'],
          link: {
            type: 'view',
            scope: 'anonymous',
            webUrl: 'https://share.example.com/view/file-123'
          },
          grantedTo: null,
          createdDateTime: '2024-01-02T10:00:00Z'
        },
        {
          id: 'perm-edit-456',
          roles: ['write'],
          link: {
            type: 'edit',
            scope: 'organization',
            webUrl: 'https://share.example.com/edit/file-123'
          },
          grantedTo: null,
          createdDateTime: '2024-01-02T11:00:00Z',
          expirationDateTime: '2024-12-31T23:59:59Z'
        },
        {
          id: 'perm-user-789',
          roles: ['read', 'write'],
          link: null,
          grantedTo: { user: { displayName: 'Carol Wilson', email: 'carol@company.com' } },
          createdDateTime: '2024-01-02T12:00:00Z'
        }
      ],
      ...overrides
    };
  }

  /**
   * Create a mock ChromaDB search collection
   */
  static createMockSearchCollection() {
    return {
      upsert: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue({ 
        ids: [[]],
        documents: [[]],
        metadatas: [[]],
        distances: [[]]
      }),
      delete: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue({ ids: [], documents: [], metadatas: [] }),
      peek: jest.fn().mockResolvedValue({ ids: [], documents: [], metadatas: [] }),
      count: jest.fn().mockResolvedValue(0)
    };
  }

  /**
   * Create mock Graph API error responses
   */
  static createGraphApiError(statusCode: number, errorCode?: string, message?: string) {
    const errorMessages = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      409: 'Conflict',
      413: 'Payload Too Large',
      423: 'Locked',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable'
    };

    const error = new Error(message || errorMessages[statusCode as keyof typeof errorMessages] || 'Unknown Error');
    (error as any).status = statusCode;
    (error as any).code = errorCode;
    
    switch (statusCode) {
      case 401:
        error.name = 'Unauthorized';
        break;
      case 403:
        error.name = 'Forbidden';
        break;
      case 404:
        error.name = 'NotFound';
        break;
      case 409:
        error.name = 'Conflict';
        break;
      case 413:
        error.name = 'PayloadTooLarge';
        break;
      case 423:
        error.name = 'Locked';
        break;
      case 429:
        error.name = 'TooManyRequests';
        (error as any).retryAfter = 60;
        break;
      case 500:
        error.name = 'InternalServerError';
        break;
      case 502:
        error.name = 'BadGateway';
        break;
      case 503:
        error.name = 'ServiceUnavailable';
        (error as any).retryAfter = 300;
        break;
      default:
        error.name = 'GraphApiError';
    }

    return error;
  }

  /**
   * Create mock upload session for large file uploads
   */
  static createMockUploadSession(overrides: any = {}) {
    return {
      uploadUrl: 'https://upload.example.com/session-123',
      expirationDateTime: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      nextExpectedRanges: ['0-'],
      ...overrides
    };
  }

  /**
   * Create mock share link response
   */
  static createMockShareLink(type: 'view' | 'edit' | 'embed' = 'view', overrides: any = {}) {
    return {
      id: `share-${type}-123`,
      link: {
        webUrl: `https://share.example.com/${type}/file-123`,
        type: type,
        scope: 'anonymous'
      },
      grantedTo: null,
      createdDateTime: new Date().toISOString(),
      expirationDateTime: null,
      hasPassword: false,
      ...overrides
    };
  }

  /**
   * Create realistic file list response for different scenarios
   */
  static createMockFileListResponse(scenario: 'empty' | 'small' | 'large' | 'mixed' = 'small', overrides: any = {}) {
    const scenarios = {
      empty: {
        value: [],
        '@odata.count': 0
      },
      small: {
        value: [
          this.createMockOneDriveFile({ id: 'file-1', name: 'document1.pdf' }),
          this.createMockOneDriveFile({ id: 'file-2', name: 'image1.jpg' }),
          this.createMockFolder({ id: 'folder-1', name: 'My Folder' })
        ],
        '@odata.count': 3
      },
      large: {
        value: Array.from({ length: 1000 }, (_, i) => 
          this.createMockOneDriveFile({ 
            id: `large-file-${i}`, 
            name: `file-${i}.txt`,
            size: Math.floor(Math.random() * 10485760) // Random size up to 10MB
          })
        ),
        '@odata.count': 5000,
        '@odata.nextLink': 'https://graph.microsoft.com/next-page'
      },
      mixed: {
        value: [
          this.createMockFileByType('document', { id: 'doc-1', name: 'report.pdf' }),
          this.createMockFileByType('image', { id: 'img-1', name: 'photo.jpg' }),
          this.createMockFileByType('video', { id: 'vid-1', name: 'presentation.mp4' }),
          this.createMockFileByType('archive', { id: 'arch-1', name: 'backup.zip' }),
          this.createMockFolder({ id: 'folder-1', name: 'Documents' }),
          this.createMockFolder({ id: 'folder-2', name: 'Media' })
        ],
        '@odata.count': 6
      }
    };

    return {
      ...scenarios[scenario],
      ...overrides
    };
  }

  /**
   * Create performance test data for stress testing
   */
  static createPerformanceTestData(fileCount: number = 1000) {
    const files = Array.from({ length: fileCount }, (_, i) => {
      const fileTypes = ['document', 'image', 'video', 'audio', 'archive', 'code'] as const;
      const randomType = fileTypes[i % fileTypes.length];
      
      return this.createMockFileByType(randomType, {
        id: `perf-file-${i}`,
        name: `performance-test-${i}.${this.getExtensionForType(randomType)}`,
        size: Math.floor(Math.random() * 104857600) // Random size up to 100MB
      });
    });

    return {
      value: files,
      '@odata.count': fileCount,
      '@odata.nextLink': fileCount > 1000 ? 'https://graph.microsoft.com/next-page' : undefined
    };
  }

  /**
   * Get file extension for a given type
   */
  private static getExtensionForType(type: string): string {
    const extensions = {
      document: 'pdf',
      image: 'jpg',
      video: 'mp4',
      audio: 'mp3',
      archive: 'zip',
      code: 'ts'
    };
    return extensions[type as keyof typeof extensions] || 'txt';
  }

  /**
   * Create mock fetch responses for chunked uploads
   */
  static createMockChunkUploadResponses(chunkCount: number, finalFile: any) {
    const responses: any[] = [];
    
    // All chunks except the last return 202 Accepted
    for (let i = 0; i < chunkCount - 1; i++) {
      responses.push({
        ok: true,
        status: 202,
        json: jest.fn().mockResolvedValue({
          nextExpectedRanges: [`${(i + 1) * 10485760}-`] // Next 10MB chunk
        })
      });
    }
    
    // Last chunk returns 201 Created with final file
    responses.push({
      ok: true,
      status: 201,
      json: jest.fn().mockResolvedValue(finalFile)
    });
    
    return responses;
  }

  /**
   * Assert file entity properties
   */
  static assertFileEntityProperties(file: File, expectedProps: Partial<any>) {
    if (expectedProps.name) {
      expect(file.name).toBe(expectedProps.name);
    }
    if (expectedProps.size !== undefined) {
      expect(file.size).toBe(expectedProps.size);
    }
    if (expectedProps.mimeType) {
      expect(file.mimeType).toBe(expectedProps.mimeType);
    }
    if (expectedProps.isFolder !== undefined) {
      expect(file.isFolder).toBe(expectedProps.isFolder);
    }
    if (expectedProps.extension) {
      expect(file.extension).toBe(expectedProps.extension);
    }
    if (expectedProps.fileType) {
      expect(file.fileType).toBe(expectedProps.fileType);
    }
  }

  /**
   * Create a complete test scenario with setup and assertions
   */
  static createTestScenario(name: string, setup: () => any, assertions: (result: any) => void) {
    return {
      name,
      setup,
      assertions
    };
  }

  /**
   * Wait for async operations to complete
   */
  static async waitForAsyncOperations(timeout: number = 1000): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, timeout));
  }

  /**
   * Create mock logger with tracking capabilities
   */
  static createMockLogger() {
    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      getLogEntries: function(level?: string) {
        if (level) {
          return (this as any)[level].mock.calls;
        }
        return [
          ...this.debug.mock.calls.map((call: any) => ({ level: 'debug', args: call })),
          ...this.info.mock.calls.map((call: any) => ({ level: 'info', args: call })),
          ...this.warn.mock.calls.map((call: any) => ({ level: 'warn', args: call })),
          ...this.error.mock.calls.map((call: any) => ({ level: 'error', args: call }))
        ];
      },
      hasLoggedError: function(message?: string) {
        if (!message) return this.error.mock.calls.length > 0;
        return this.error.mock.calls.some((call: any) => 
          call[0] && call[0].includes(message)
        );
      },
      hasLoggedWarning: function(message?: string) {
        if (!message) return this.warn.mock.calls.length > 0;
        return this.warn.mock.calls.some((call: any) => 
          call[0] && call[0].includes(message)
        );
      }
    };
  }
}