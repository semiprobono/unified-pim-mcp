import { Logger } from '../../../../shared/logging/Logger.js';
import { File, FileEntity, FilePermissions, ShareLink } from '../../../../domain/entities/File.js';
import { PaginationInfo } from '../../../../domain/interfaces/PlatformPort.js';
import { GoogleClient } from '../clients/GoogleClient.js';
import { CacheManager } from '../cache/CacheManager.js';
import { ChromaDbInitializer } from '../cache/ChromaDbInitializer.js';
import { FileMapper } from '../mappers/FileMapper.js';
import { ErrorHandler } from '../errors/ErrorHandler.js';
import { ChromaClient } from 'chromadb';
import { GraphRequestOptions } from '../clients/GoogleClient.js';
import { Readable } from 'stream';

/**
 * File query options for searching
 */
export interface FileQueryOptions {
  folderId?: string;
  driveId?: string;
  mimeType?: string;
  extension?: string;
  minSize?: number;
  maxSize?: number;
  modifiedAfter?: Date;
  modifiedBefore?: Date;
  createdAfter?: Date;
  createdBefore?: Date;
  searchQuery?: string;
  includeDeleted?: boolean;
  sharedWithMe?: boolean;
  ownedByMe?: boolean;
  limit?: number;
  skip?: number;
  orderBy?: 'name' | 'size' | 'lastModifiedDateTime' | 'createdDateTime';
  orderDirection?: 'asc' | 'desc';
}

/**
 * File search result with pagination
 */
export interface FileSearchResult {
  files: File[];
  pagination: PaginationInfo;
  totalCount: number;
  nextPageToken?: string;
}

/**
 * File metadata for upload
 */
export interface FileMetadataInput {
  filename: string;
  path?: string;
  parentId?: string;
  description?: string;
  mimeType?: string;
  tags?: string[];
  conflictBehavior?: 'rename' | 'replace' | 'fail';
}

/**
 * Share permissions configuration
 */
export interface SharePermissionsInput {
  type: 'view' | 'edit' | 'embed';
  scope?: 'anonymous' | 'organization' | 'users';
  password?: string;
  expirationDateTime?: Date;
  requireSignIn?: boolean;
  recipients?: string[];
  message?: string;
  sendInvitation?: boolean;
}

/**
 * Upload session for large files
 */
interface UploadSession {
  uploadUrl: string;
  expirationDateTime: Date;
  nextExpectedRanges?: string[];
}

/**
 * Microsoft Graph File Service
 * Implements file operations using Graph API (OneDrive/SharePoint)
 */
export class FileService {
  private readonly logger: Logger;
  private cacheManager: CacheManager | null = null;
  private chromaService: ChromaDbInitializer | null = null;
  private chromaClient: ChromaClient | null = null;
  private searchCollection: any = null;
  private readonly CACHE_TTL = 300; // 5 minutes
  private readonly CHUNK_SIZE = 10 * 1024 * 1024; // 10MB chunks for large files
  private readonly MAX_CHUNK_SIZE = 60 * 1024 * 1024; // 60MB max chunk size

  constructor(
    private readonly graphClient: GoogleClient,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('FileService');
  }

  /**
   * Initialize ChromaDB and cache
   */
  private async initializeServices(): Promise<void> {
    if (!this.chromaService) {
      this.chromaService = new ChromaDbInitializer('http://localhost:8000', this.logger);
      await this.chromaService.initialize();
      
      // Create file metadata search collection
      try {
        const chromaClient = new ChromaClient({ path: 'http://localhost:8000' });
        this.chromaClient = chromaClient;
        this.searchCollection = await chromaClient.getOrCreateCollection({
          name: 'file-metadata-index',
          metadata: { 
            description: 'Semantic search index for files',
            'hnsw:space': 'cosine'
          }
        });
        this.logger.info('File metadata collection initialized');
      } catch (error) {
        this.logger.error('Failed to initialize file metadata collection', { error });
      }
    }

    if (!this.cacheManager) {
      this.cacheManager = new CacheManager(this.chromaService!, { defaultTtl: this.CACHE_TTL }, this.logger);
    }
  }

  /**
   * List files in a folder or drive
   */
  async listFiles(options?: FileQueryOptions): Promise<FileSearchResult> {
    try {
      await this.initializeServices();

      // Build endpoint
      let endpoint = '/me/drive/root/children';
      if (options?.folderId) {
        endpoint = `/me/drive/items/${options.folderId}/children`;
      } else if (options?.driveId) {
        endpoint = `/drives/${options.driveId}/root/children`;
      }

      // Build query parameters
      const params: any = {
        $select: 'id,name,size,mimeType,file,folder,parentReference,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,webUrl,@microsoft.graph.downloadUrl,thumbnails,permissions,shared',
        $top: options?.limit || 50,
        $skip: options?.skip || 0,
        $count: true
      };

      // Add filters
      const filters: string[] = [];
      if (options?.mimeType) {
        filters.push(`file/mimeType eq '${options.mimeType}'`);
      }
      if (options?.minSize) {
        filters.push(`size ge ${options.minSize}`);
      }
      if (options?.maxSize) {
        filters.push(`size le ${options.maxSize}`);
      }
      if (options?.modifiedAfter) {
        filters.push(`lastModifiedDateTime ge '${options.modifiedAfter.toISOString()}'`);
      }
      if (options?.modifiedBefore) {
        filters.push(`lastModifiedDateTime le '${options.modifiedBefore.toISOString()}'`);
      }

      if (filters.length > 0) {
        params.$filter = filters.join(' and ');
      }

      // Add search query
      if (options?.searchQuery) {
        params.$search = `"${options.searchQuery}"`;
      }

      // Add ordering
      if (options?.orderBy) {
        const direction = options.orderDirection === 'desc' ? ' desc' : '';
        params.$orderby = `${options.orderBy}${direction}`;
      }

      // Check cache
      const cacheKey = `files:list:${JSON.stringify(options)}`;
      const cached = await this.cacheManager?.get(cacheKey) as FileSearchResult | undefined;
      if (cached) {
        this.logger.debug('Returning cached file list');
        return cached;
      }

      // Fetch from Graph API
      const response = await this.graphClient.get(endpoint, params);

      // Map to domain entities
      const files = response.value.map((item: any) => FileMapper.fromGraphDriveItem(item));

      // Index files in ChromaDB for search
      if (this.searchCollection && files.length > 0) {
        await this.indexFilesForSearch(files);
      }

      const result: FileSearchResult = {
        files,
        pagination: {
          total: response['@odata.count'] || files.length,
          page: Math.floor((options?.skip || 0) / (options?.limit || 50)) + 1,
          pageSize: options?.limit || 50,
          hasNextPage: response['@odata.nextLink'] !== undefined,
          hasPreviousPage: (options?.skip || 0) > 0
        },
        totalCount: response['@odata.count'] || files.length,
        nextPageToken: response['@odata.nextLink']
      };

      // Cache the result
      await this.cacheManager?.set(cacheKey, result, endpoint, 'GET', this.CACHE_TTL);

      return result;
    } catch (error) {
      this.logger.error('Failed to list files', { error });
      throw error;
    }
  }

  /**
   * Get a specific file by ID
   */
  async getFile(fileId: string, driveId?: string): Promise<File> {
    try {
      await this.initializeServices();

      // Check cache first
      const cacheKey = `file:${fileId}`;
      const cached = await this.cacheManager?.get(cacheKey) as File | undefined;
      if (cached) {
        this.logger.debug('Returning cached file', { fileId });
        return cached;
      }

      // Build endpoint
      const endpoint = driveId 
        ? `/drives/${driveId}/items/${fileId}`
        : `/me/drive/items/${fileId}`;

      const params: Record<string, any> = {
        $select: 'id,name,size,mimeType,file,folder,parentReference,createdDateTime,lastModifiedDateTime,createdBy,lastModifiedBy,webUrl,@microsoft.graph.downloadUrl,thumbnails,permissions,shared,versions'
      };
      
      const response = await this.graphClient.get(endpoint, params as GraphRequestOptions);
      const file = FileMapper.fromGraphDriveItem(response);

      // Cache the result
      await this.cacheManager?.set(cacheKey, file, endpoint, 'GET', this.CACHE_TTL);

      return file;
    } catch (error) {
      this.logger.error('Failed to get file', { fileId, error });
      throw error;
    }
  }

  /**
   * Upload a small file (<4MB)
   */
  async uploadFile(content: Buffer, metadata: FileMetadataInput): Promise<File> {
    try {
      await this.initializeServices();

      // Validate size
      if (content.length > 4 * 1024 * 1024) {
        throw new Error('File too large for simple upload. Use uploadLargeFile for files > 4MB');
      }

      // Build endpoint
      let endpoint = `/me/drive/root:/${metadata.filename}:/content`;
      if (metadata.parentId) {
        endpoint = `/me/drive/items/${metadata.parentId}:/${metadata.filename}:/content`;
      } else if (metadata.path) {
        endpoint = `/me/drive/root:${metadata.path}/${metadata.filename}:/content`;
      }

      // Set conflict behavior
      const params: any = {};
      if (metadata.conflictBehavior) {
        params['@microsoft.graph.conflictBehavior'] = metadata.conflictBehavior;
      }

      // Upload file
      const response = await this.graphClient.put(endpoint, content, {
        headers: {
          'Content-Type': metadata.mimeType || 'application/octet-stream'
        },
        ...params
      });

      const file = FileMapper.fromGraphDriveItem(response);

      // Update metadata if provided
      if (metadata.description || metadata.tags) {
        await this.updateFileMetadata(file.id.toString(), {
          description: metadata.description,
          tags: metadata.tags
        });
      }

      // Index in ChromaDB
      if (this.searchCollection) {
        await this.indexFilesForSearch([file]);
      }

      // Invalidate parent folder cache
      if (metadata.parentId) {
        await this.cacheManager?.delete(`files:list:${metadata.parentId}`);
      }

      this.logger.info('File uploaded successfully', { fileId: file.id.toString(), filename: metadata.filename });
      return file;
    } catch (error) {
      this.logger.error('Failed to upload file', { error });
      throw error;
    }
  }

  /**
   * Upload a large file (>4MB) using resumable upload session
   */
  async uploadLargeFile(stream: Readable, metadata: FileMetadataInput, totalSize: number): Promise<File> {
    try {
      await this.initializeServices();

      // Create upload session
      let endpoint = `/me/drive/root:/${metadata.filename}:/createUploadSession`;
      if (metadata.parentId) {
        endpoint = `/me/drive/items/${metadata.parentId}:/${metadata.filename}:/createUploadSession`;
      } else if (metadata.path) {
        endpoint = `/me/drive/root:${metadata.path}/${metadata.filename}:/createUploadSession`;
      }

      const sessionBody = {
        item: {
          '@microsoft.graph.conflictBehavior': metadata.conflictBehavior || 'rename',
          name: metadata.filename,
          description: metadata.description
        }
      };

      const sessionResponse = await this.graphClient.post(endpoint, sessionBody);
      const uploadSession: UploadSession = {
        uploadUrl: sessionResponse.uploadUrl,
        expirationDateTime: new Date(sessionResponse.expirationDateTime),
        nextExpectedRanges: sessionResponse.nextExpectedRanges
      };

      // Upload file in chunks
      let uploadedBytes = 0;
      let chunkNumber = 0;
      const chunks: Buffer[] = [];

      // Collect chunks from stream
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }

      const fullBuffer = Buffer.concat(chunks);
      const actualTotalSize = fullBuffer.length;

      // Upload chunks
      while (uploadedBytes < actualTotalSize) {
        const chunkSize = Math.min(this.CHUNK_SIZE, actualTotalSize - uploadedBytes);
        const chunk = fullBuffer.slice(uploadedBytes, uploadedBytes + chunkSize);
        const contentRange = `bytes ${uploadedBytes}-${uploadedBytes + chunkSize - 1}/${actualTotalSize}`;

        this.logger.debug('Uploading chunk', { 
          chunkNumber, 
          contentRange, 
          chunkSize 
        });

        try {
          const chunkResponse = await fetch(uploadSession.uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': chunkSize.toString(),
              'Content-Range': contentRange
            },
            body: chunk
          });

          if (!chunkResponse.ok && chunkResponse.status !== 202) {
            throw new Error(`Chunk upload failed: ${chunkResponse.statusText}`);
          }

          let result: any = null;
          
          if (chunkResponse.status === 200 || chunkResponse.status === 201) {
            result = await chunkResponse.json();
            
            // Check if upload is complete
            if (result.id) {
              const file = FileMapper.fromGraphDriveItem(result);

              // Index in ChromaDB
              if (this.searchCollection) {
                await this.indexFilesForSearch([file]);
              }

              this.logger.info('Large file uploaded successfully', { 
                fileId: file.id.toString(), 
                filename: metadata.filename,
                totalChunks: chunkNumber + 1
              });
              return file;
            }
          } else if (chunkResponse.status === 202) {
            // Upload continues
            result = await chunkResponse.json();
            
            // Update progress
            if (result && result.nextExpectedRanges) {
              uploadSession.nextExpectedRanges = result.nextExpectedRanges;
            }
          }

        } catch (error) {
          this.logger.error('Chunk upload failed', { chunkNumber, error });
          // Implement retry logic here if needed
          throw error;
        }

        uploadedBytes += chunkSize;
        chunkNumber++;
      }

      throw new Error('Upload completed but no file ID returned');
    } catch (error) {
      this.logger.error('Failed to upload large file', { error });
      throw error;
    }
  }

  /**
   * Download a file
   */
  async downloadFile(fileId: string, driveId?: string): Promise<Buffer> {
    try {
      await this.initializeServices();

      // Build endpoint
      const endpoint = driveId 
        ? `/drives/${driveId}/items/${fileId}/content`
        : `/me/drive/items/${fileId}/content`;

      // Download file content
      const response = await this.graphClient.get(endpoint, {
        responseType: 'arraybuffer'
      });

      this.logger.info('File downloaded successfully', { fileId });
      return Buffer.from(response);
    } catch (error) {
      this.logger.error('Failed to download file', { fileId, error });
      throw error;
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: string, driveId?: string, permanent?: boolean): Promise<void> {
    try {
      await this.initializeServices();

      // Build endpoint
      const endpoint = driveId 
        ? `/drives/${driveId}/items/${fileId}`
        : `/me/drive/items/${fileId}`;

      await this.graphClient.delete(endpoint);

      // Remove from cache
      await this.cacheManager?.delete(`file:${fileId}`);

      // Remove from ChromaDB
      if (this.searchCollection) {
        try {
          await this.searchCollection.delete({
            ids: [fileId]
          });
        } catch (error) {
          this.logger.warn('Failed to remove file from search index', { fileId, error });
        }
      }

      this.logger.info('File deleted successfully', { fileId, permanent });
    } catch (error) {
      this.logger.error('Failed to delete file', { fileId, error });
      throw error;
    }
  }

  /**
   * Share a file
   */
  async shareFile(fileId: string, permissions: SharePermissionsInput, driveId?: string): Promise<ShareLink> {
    try {
      await this.initializeServices();

      // Build endpoint
      const endpoint = driveId 
        ? `/drives/${driveId}/items/${fileId}/createLink`
        : `/me/drive/items/${fileId}/createLink`;

      // Build request body
      const body: any = {
        type: permissions.type,
        scope: permissions.scope || 'anonymous'
      };

      if (permissions.password) {
        body.password = permissions.password;
      }

      if (permissions.expirationDateTime) {
        body.expirationDateTime = permissions.expirationDateTime.toISOString();
      }

      // Create share link
      const response = await this.graphClient.post(endpoint, body);

      const shareLink: ShareLink = {
        id: response.id,
        url: response.link.webUrl,
        type: permissions.type,
        expirationDateTime: permissions.expirationDateTime,
        requiresSignIn: permissions.requireSignIn || false,
        password: permissions.password,
        createdDateTime: new Date(),
        createdBy: 'user'
      };

      // Send invitation if requested
      if (permissions.sendInvitation && permissions.recipients) {
        await this.sendShareInvitation(fileId, permissions.recipients, permissions.message, driveId);
      }

      this.logger.info('File shared successfully', { fileId, shareType: permissions.type });
      return shareLink;
    } catch (error) {
      this.logger.error('Failed to share file', { fileId, error });
      throw error;
    }
  }

  /**
   * Search files using semantic search
   */
  async searchFiles(query: string, options?: FileQueryOptions): Promise<File[]> {
    try {
      await this.initializeServices();

      if (!this.searchCollection) {
        // Fallback to Graph API search
        this.logger.warn('ChromaDB not available, using Graph API search');
        const endpoint = '/me/drive/search(q=\'' + encodeURIComponent(query) + '\')';
        
        const params: any = {
          $select: 'id,name,size,mimeType,file,folder,parentReference,createdDateTime,lastModifiedDateTime,webUrl',
          $top: options?.limit || 25
        };

        const response = await this.graphClient.get(endpoint, params);
        return response.value.map((item: any) => FileMapper.fromGraphDriveItem(item));
      }

      // Perform semantic search
      const searchResults = await this.searchCollection.query({
        queryTexts: [query],
        nResults: options?.limit || 25,
        where: this.buildChromaWhereClause(options)
      });

      if (!searchResults.ids[0] || searchResults.ids[0].length === 0) {
        return [];
      }

      // Fetch full file details
      const files: File[] = [];
      for (const id of searchResults.ids[0]) {
        try {
          const file = await this.getFile(id as string, options?.driveId);
          files.push(file);
        } catch (error) {
          this.logger.warn('Failed to fetch file from search result', { id, error });
        }
      }

      return files;
    } catch (error) {
      this.logger.error('Failed to search files', { query, error });
      throw error;
    }
  }

  /**
   * Move a file to a new location
   */
  async moveFile(fileId: string, newParentId: string, driveId?: string): Promise<File> {
    try {
      await this.initializeServices();

      // Build endpoint
      const endpoint = driveId 
        ? `/drives/${driveId}/items/${fileId}`
        : `/me/drive/items/${fileId}`;

      // Build update body
      const body = {
        parentReference: {
          id: newParentId
        }
      };

      const response = await this.graphClient.patch(endpoint, body);
      const file = FileMapper.fromGraphDriveItem(response);

      // Update cache
      await this.cacheManager?.set(`file:${fileId}`, file, endpoint, 'PATCH', this.CACHE_TTL);

      // Re-index in ChromaDB
      if (this.searchCollection) {
        await this.indexFilesForSearch([file]);
      }

      this.logger.info('File moved successfully', { fileId, newParentId });
      return file;
    } catch (error) {
      this.logger.error('Failed to move file', { fileId, error });
      throw error;
    }
  }

  /**
   * Copy a file to a new location
   */
  async copyFile(fileId: string, targetFolderId: string, newName?: string, driveId?: string): Promise<string> {
    try {
      await this.initializeServices();

      // Build endpoint
      const endpoint = driveId 
        ? `/drives/${driveId}/items/${fileId}/copy`
        : `/me/drive/items/${fileId}/copy`;

      // Build request body
      const body: any = {
        parentReference: {
          id: targetFolderId
        }
      };

      if (newName) {
        body.name = newName;
      }

      // Copy is an async operation, returns Location header
      const response = await this.graphClient.post(endpoint, body);
      
      // The response includes a Location header with monitor URL
      // For simplicity, we'll return a success message
      // In production, you'd want to monitor the async operation
      
      this.logger.info('File copy initiated', { fileId, targetFolderId });
      return 'copy-operation-initiated';
    } catch (error) {
      this.logger.error('Failed to copy file', { fileId, error });
      throw error;
    }
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileId: string, driveId?: string): Promise<any> {
    try {
      await this.initializeServices();

      const file = await this.getFile(fileId, driveId);
      
      // Get additional metadata
      const endpoint = driveId 
        ? `/drives/${driveId}/items/${fileId}`
        : `/me/drive/items/${fileId}`;

      const params: Record<string, any> = {
        $expand: 'thumbnails,permissions,versions,activities'
      };
      
      const response = await this.graphClient.get(endpoint, params as GraphRequestOptions);

      return {
        basic: file,
        thumbnails: response.thumbnails,
        permissions: response.permissions,
        versions: response.versions,
        activities: response.activities
      };
    } catch (error) {
      this.logger.error('Failed to get file metadata', { fileId, error });
      throw error;
    }
  }

  /**
   * Update file metadata
   */
  private async updateFileMetadata(fileId: string, metadata: { description?: string; tags?: string[] }): Promise<void> {
    try {
      const endpoint = `/me/drive/items/${fileId}`;
      const body: any = {};

      if (metadata.description) {
        body.description = metadata.description;
      }

      // Note: Tags are not directly supported in Graph API
      // You might need to use custom properties or a different approach

      if (Object.keys(body).length > 0) {
        await this.graphClient.patch(endpoint, body);
      }
    } catch (error) {
      this.logger.warn('Failed to update file metadata', { fileId, error });
    }
  }

  /**
   * Send share invitation
   */
  private async sendShareInvitation(fileId: string, recipients: string[], message?: string, driveId?: string): Promise<void> {
    try {
      const endpoint = driveId 
        ? `/drives/${driveId}/items/${fileId}/invite`
        : `/me/drive/items/${fileId}/invite`;

      const body = {
        recipients: recipients.map(email => ({
          email
        })),
        message: message || 'A file has been shared with you',
        requireSignIn: true,
        sendInvitation: true,
        roles: ['read']
      };

      await this.graphClient.post(endpoint, body);
      this.logger.info('Share invitation sent', { fileId, recipientCount: recipients.length });
    } catch (error) {
      this.logger.warn('Failed to send share invitation', { fileId, error });
    }
  }

  /**
   * Index files in ChromaDB for semantic search
   */
  private async indexFilesForSearch(files: File[]): Promise<void> {
    if (!this.searchCollection || files.length === 0) return;

    try {
      const documents = files.map(file => 
        `${file.name} ${file.path} ${file.description || ''} ${file.tags.join(' ')} ${file.mimeType}`
      );

      const metadatas = files.map(file => ({
        fileId: file.id.toString(),
        name: file.name,
        path: file.path,
        mimeType: file.mimeType,
        size: file.size,
        extension: file.extension || '',
        parentId: file.parentId || '',
        createdDate: file.createdDateTime.toISOString(),
        modifiedDate: file.lastModifiedDateTime.toISOString(),
        isFolder: file.isFolder
      }));

      const ids = files.map(file => file.id.toString());

      await this.searchCollection.upsert({
        ids,
        documents,
        metadatas
      });

      this.logger.debug('Files indexed for search', { count: files.length });
    } catch (error) {
      this.logger.error('Failed to index files for search', { error });
    }
  }

  /**
   * Build ChromaDB where clause from query options
   */
  private buildChromaWhereClause(options?: FileQueryOptions): any {
    const where: any = {};

    if (options?.mimeType) {
      where.mimeType = options.mimeType;
    }
    if (options?.extension) {
      where.extension = options.extension;
    }
    if (options?.folderId) {
      where.parentId = options.folderId;
    }

    return Object.keys(where).length > 0 ? where : undefined;
  }
}