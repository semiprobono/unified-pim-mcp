import { Platform } from './Platform.js';

export interface FileMetadata {
  readonly platform: Platform;
  readonly fileId: string;
  readonly driveId?: string | undefined;
  readonly driveName?: string | undefined;
  readonly parentId?: string | undefined;
  readonly parentPath?: string | undefined;
  readonly webUrl?: string | undefined;
  readonly downloadUrl?: string | undefined;
  readonly previewUrl?: string | undefined;
  readonly thumbnailUrl?: string | undefined;
  readonly shareUrl?: string | undefined;
  readonly changeKey?: string | undefined;
  readonly etag?: string | undefined;
  readonly version?: string | undefined;
  readonly checksum?: string | undefined;
  readonly contentType: string;
  readonly size: number;
  readonly createdBy?: string | undefined;
  readonly lastModifiedBy?: string | undefined;
  readonly ownedBy?: string | undefined;
  readonly creationTime: Date;
  readonly lastModifiedTime: Date;
  readonly lastAccessedTime?: Date | undefined;
  readonly lastSyncTime: Date;
  readonly isReadOnly: boolean;
  readonly isShared: boolean;
  readonly sharingScope: 'private' | 'internal' | 'public' | 'anonymous';
  readonly permissions: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    canShare: boolean;
    canDownload: boolean;
    canPrint?: boolean;
    canCopy?: boolean;
  };
  readonly virusStatus?: 'clean' | 'infected' | 'scanning' | 'unknown' | undefined;
  readonly scanTime?: Date | undefined;
  readonly classification?: 'public' | 'internal' | 'confidential' | 'restricted' | undefined;
  readonly retention?: {
    retainUntil?: Date;
    legalHold: boolean;
    policyName?: string;
  };
  readonly source: 'upload' | 'sync' | 'share' | 'import' | 'system';
  readonly uploadSession?: {
    sessionId: string;
    status: 'active' | 'completed' | 'failed' | 'cancelled';
    bytesUploaded: number;
    totalBytes: number;
    expirationTime: Date;
  };
  readonly customProperties?: Record<string, any> | undefined;
  readonly extensions?: Array<{
    extensionName: string;
    id: string;
    data: Record<string, any>;
  }>;
}

export class FileMetadataImpl implements FileMetadata {
  constructor(
    public readonly platform: Platform,
    public readonly fileId: string,
    public readonly contentType: string,
    public readonly size: number,
    public readonly creationTime: Date,
    public readonly lastModifiedTime: Date,
    public readonly lastSyncTime: Date,
    public readonly isReadOnly: boolean,
    public readonly isShared: boolean,
    public readonly sharingScope: 'private' | 'internal' | 'public' | 'anonymous',
    public readonly permissions: {
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
      canShare: boolean;
      canDownload: boolean;
      canPrint?: boolean;
      canCopy?: boolean;
    },
    public readonly source: 'upload' | 'sync' | 'share' | 'import' | 'system',
    public readonly driveId?: string,
    public readonly driveName?: string,
    public readonly parentId?: string,
    public readonly parentPath?: string,
    public readonly webUrl?: string,
    public readonly downloadUrl?: string,
    public readonly previewUrl?: string,
    public readonly thumbnailUrl?: string,
    public readonly shareUrl?: string,
    public readonly changeKey?: string,
    public readonly etag?: string,
    public readonly version?: string,
    public readonly checksum?: string,
    public readonly createdBy?: string,
    public readonly lastModifiedBy?: string,
    public readonly ownedBy?: string,
    public readonly lastAccessedTime?: Date,
    public readonly virusStatus?: 'clean' | 'infected' | 'scanning' | 'unknown',
    public readonly scanTime?: Date,
    public readonly classification?: 'public' | 'internal' | 'confidential' | 'restricted',
    public readonly retention?: {
      retainUntil?: Date;
      legalHold: boolean;
      policyName?: string;
    },
    public readonly uploadSession?: {
      sessionId: string;
      status: 'active' | 'completed' | 'failed' | 'cancelled';
      bytesUploaded: number;
      totalBytes: number;
      expirationTime: Date;
    },
    public readonly customProperties?: Record<string, any>,
    public readonly extensions?: Array<{
      extensionName: string;
      id: string;
      data: Record<string, any>;
    }>
  ) {}

  /**
   * Creates minimal metadata for a new file
   */
  static createMinimal(
    platform: Platform,
    fileId: string,
    contentType: string,
    size: number,
    source: 'upload' | 'sync' | 'share' | 'import' | 'system' = 'upload'
  ): FileMetadataImpl {
    const now = new Date();
    return new FileMetadataImpl(
      platform,
      fileId,
      contentType,
      size,
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      false, // isReadOnly
      false, // isShared
      'private', // sharingScope
      {
        canRead: true,
        canWrite: true,
        canDelete: true,
        canShare: true,
        canDownload: true,
        canPrint: true,
        canCopy: true
      },
      source
    );
  }

  /**
   * Creates metadata for a shared file
   */
  static createShared(
    platform: Platform,
    fileId: string,
    contentType: string,
    size: number,
    sharingScope: 'internal' | 'public' | 'anonymous',
    shareUrl: string
  ): FileMetadataImpl {
    const now = new Date();
    return new FileMetadataImpl(
      platform,
      fileId,
      contentType,
      size,
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      false, // isReadOnly
      true, // isShared
      sharingScope,
      {
        canRead: true,
        canWrite: false, // Shared files typically read-only by default
        canDelete: false,
        canShare: true,
        canDownload: true,
        canPrint: sharingScope !== 'anonymous',
        canCopy: sharingScope !== 'anonymous'
      },
      'share',
      undefined, // driveId
      undefined, // driveName
      undefined, // parentId
      undefined, // parentPath
      undefined, // webUrl
      undefined, // downloadUrl
      undefined, // previewUrl
      undefined, // thumbnailUrl
      shareUrl
    );
  }

  /**
   * Creates metadata for an upload session
   */
  static createUploadSession(
    platform: Platform,
    fileId: string,
    contentType: string,
    totalBytes: number,
    sessionId: string,
    expirationTime: Date
  ): FileMetadataImpl {
    const now = new Date();
    return new FileMetadataImpl(
      platform,
      fileId,
      contentType,
      totalBytes,
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      false, // isReadOnly
      false, // isShared
      'private', // sharingScope
      {
        canRead: true,
        canWrite: true,
        canDelete: true,
        canShare: true,
        canDownload: true
      },
      'upload',
      undefined, // driveId
      undefined, // driveName
      undefined, // parentId
      undefined, // parentPath
      undefined, // webUrl
      undefined, // downloadUrl
      undefined, // previewUrl
      undefined, // thumbnailUrl
      undefined, // shareUrl
      undefined, // changeKey
      undefined, // etag
      undefined, // version
      undefined, // checksum
      undefined, // createdBy
      undefined, // lastModifiedBy
      undefined, // ownedBy
      undefined, // lastAccessedTime
      undefined, // virusStatus
      undefined, // scanTime
      undefined, // classification
      undefined, // retention
      {
        sessionId,
        status: 'active',
        bytesUploaded: 0,
        totalBytes,
        expirationTime
      }
    );
  }

  /**
   * Gets human-readable file size
   */
  get humanReadableSize(): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = this.size;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(unitIndex > 0 ? 1 : 0)} ${units[unitIndex]}`;
  }

  /**
   * Gets time since last sync
   */
  get timeSinceSync(): number {
    return Date.now() - this.lastSyncTime.getTime();
  }

  /**
   * Checks if sync is stale (more than 1 hour old for files)
   */
  get isSyncStale(): boolean {
    return this.timeSinceSync > 60 * 60 * 1000; // 1 hour
  }

  /**
   * Gets time since last modification
   */
  get timeSinceModified(): number {
    return Date.now() - this.lastModifiedTime.getTime();
  }

  /**
   * Checks if file was recently modified (within last hour)
   */
  get isRecentlyModified(): boolean {
    return this.timeSinceModified < 60 * 60 * 1000; // 1 hour
  }

  /**
   * Checks if file was recently accessed
   */
  get isRecentlyAccessed(): boolean {
    if (!this.lastAccessedTime) return false;
    const timeSinceAccess = Date.now() - this.lastAccessedTime.getTime();
    return timeSinceAccess < 60 * 60 * 1000; // 1 hour
  }

  /**
   * Checks if file can be previewed
   */
  get canPreview(): boolean {
    return this.previewUrl !== undefined;
  }

  /**
   * Checks if file has thumbnail
   */
  get hasThumbnail(): boolean {
    return this.thumbnailUrl !== undefined;
  }

  /**
   * Checks if upload is in progress
   */
  get isUploading(): boolean {
    return this.uploadSession?.status === 'active';
  }

  /**
   * Gets upload progress percentage
   */
  get uploadProgress(): number {
    if (!this.uploadSession) return 0;
    if (this.uploadSession.totalBytes === 0) return 0;
    return Math.round((this.uploadSession.bytesUploaded / this.uploadSession.totalBytes) * 100);
  }

  /**
   * Checks if upload session is expired
   */
  get isUploadExpired(): boolean {
    if (!this.uploadSession) return false;
    return new Date() > this.uploadSession.expirationTime;
  }

  /**
   * Checks if file is under legal hold
   */
  get isLegalHold(): boolean {
    return this.retention?.legalHold ?? false;
  }

  /**
   * Checks if retention period has expired
   */
  get isRetentionExpired(): boolean {
    if (!this.retention?.retainUntil) return false;
    return new Date() > this.retention.retainUntil;
  }

  /**
   * Checks if virus scan is clean
   */
  get isVirusClean(): boolean {
    return this.virusStatus === 'clean';
  }

  /**
   * Checks if virus scan is pending
   */
  get isVirusScanPending(): boolean {
    return this.virusStatus === 'scanning' || this.virusStatus === 'unknown';
  }

  /**
   * Gets file type category
   */
  get fileCategory(): 'document' | 'image' | 'video' | 'audio' | 'archive' | 'code' | 'other' {
    const type = this.contentType.toLowerCase();
    
    if (type.includes('document') || type.includes('pdf') || type.includes('word') || 
        type.includes('excel') || type.includes('powerpoint') || type.includes('text')) {
      return 'document';
    }
    
    if (type.startsWith('image/')) {
      return 'image';
    }
    
    if (type.startsWith('video/')) {
      return 'video';
    }
    
    if (type.startsWith('audio/')) {
      return 'audio';
    }
    
    if (type.includes('zip') || type.includes('archive') || type.includes('compressed')) {
      return 'archive';
    }
    
    if (type.includes('javascript') || type.includes('typescript') || type.includes('json') ||
        type.includes('xml') || type.includes('html') || type.includes('css')) {
      return 'code';
    }
    
    return 'other';
  }

  /**
   * Updates the last sync time
   */
  withUpdatedSync(): FileMetadataImpl {
    return new FileMetadataImpl(
      this.platform,
      this.fileId,
      this.contentType,
      this.size,
      this.creationTime,
      this.lastModifiedTime,
      new Date(), // Update sync time
      this.isReadOnly,
      this.isShared,
      this.sharingScope,
      this.permissions,
      this.source,
      this.driveId,
      this.driveName,
      this.parentId,
      this.parentPath,
      this.webUrl,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.shareUrl,
      this.changeKey,
      this.etag,
      this.version,
      this.checksum,
      this.createdBy,
      this.lastModifiedBy,
      this.ownedBy,
      this.lastAccessedTime,
      this.virusStatus,
      this.scanTime,
      this.classification,
      this.retention,
      this.uploadSession,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates the last accessed time
   */
  withAccess(): FileMetadataImpl {
    return new FileMetadataImpl(
      this.platform,
      this.fileId,
      this.contentType,
      this.size,
      this.creationTime,
      this.lastModifiedTime,
      this.lastSyncTime,
      this.isReadOnly,
      this.isShared,
      this.sharingScope,
      this.permissions,
      this.source,
      this.driveId,
      this.driveName,
      this.parentId,
      this.parentPath,
      this.webUrl,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.shareUrl,
      this.changeKey,
      this.etag,
      this.version,
      this.checksum,
      this.createdBy,
      this.lastModifiedBy,
      this.ownedBy,
      new Date(), // Update access time
      this.virusStatus,
      this.scanTime,
      this.classification,
      this.retention,
      this.uploadSession,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates sharing settings
   */
  withSharing(
    isShared: boolean,
    sharingScope: 'private' | 'internal' | 'public' | 'anonymous',
    shareUrl?: string
  ): FileMetadataImpl {
    return new FileMetadataImpl(
      this.platform,
      this.fileId,
      this.contentType,
      this.size,
      this.creationTime,
      new Date(), // Update modified time
      this.lastSyncTime,
      this.isReadOnly,
      isShared,
      sharingScope,
      this.permissions,
      this.source,
      this.driveId,
      this.driveName,
      this.parentId,
      this.parentPath,
      this.webUrl,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      shareUrl ?? this.shareUrl,
      this.changeKey,
      this.etag,
      this.version,
      this.checksum,
      this.createdBy,
      this.lastModifiedBy,
      this.ownedBy,
      this.lastAccessedTime,
      this.virusStatus,
      this.scanTime,
      this.classification,
      this.retention,
      this.uploadSession,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates virus scan status
   */
  withVirusScan(
    status: 'clean' | 'infected' | 'scanning' | 'unknown',
    scanTime: Date = new Date()
  ): FileMetadataImpl {
    return new FileMetadataImpl(
      this.platform,
      this.fileId,
      this.contentType,
      this.size,
      this.creationTime,
      this.lastModifiedTime,
      this.lastSyncTime,
      this.isReadOnly,
      this.isShared,
      this.sharingScope,
      this.permissions,
      this.source,
      this.driveId,
      this.driveName,
      this.parentId,
      this.parentPath,
      this.webUrl,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.shareUrl,
      this.changeKey,
      this.etag,
      this.version,
      this.checksum,
      this.createdBy,
      this.lastModifiedBy,
      this.ownedBy,
      this.lastAccessedTime,
      status,
      scanTime,
      this.classification,
      this.retention,
      this.uploadSession,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates upload session progress
   */
  withUploadProgress(bytesUploaded: number, status?: 'active' | 'completed' | 'failed' | 'cancelled'): FileMetadataImpl {
    if (!this.uploadSession) return this;

    const newUploadSession = {
      ...this.uploadSession,
      bytesUploaded,
      status: status ?? this.uploadSession.status
    };

    return new FileMetadataImpl(
      this.platform,
      this.fileId,
      this.contentType,
      this.size,
      this.creationTime,
      this.lastModifiedTime,
      this.lastSyncTime,
      this.isReadOnly,
      this.isShared,
      this.sharingScope,
      this.permissions,
      this.source,
      this.driveId,
      this.driveName,
      this.parentId,
      this.parentPath,
      this.webUrl,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.shareUrl,
      this.changeKey,
      this.etag,
      this.version,
      this.checksum,
      this.createdBy,
      this.lastModifiedBy,
      this.ownedBy,
      this.lastAccessedTime,
      this.virusStatus,
      this.scanTime,
      this.classification,
      this.retention,
      newUploadSession,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Adds custom property
   */
  withCustomProperty(key: string, value: any): FileMetadataImpl {
    const newCustomProperties = {
      ...this.customProperties,
      [key]: value
    };

    return new FileMetadataImpl(
      this.platform,
      this.fileId,
      this.contentType,
      this.size,
      this.creationTime,
      this.lastModifiedTime,
      this.lastSyncTime,
      this.isReadOnly,
      this.isShared,
      this.sharingScope,
      this.permissions,
      this.source,
      this.driveId,
      this.driveName,
      this.parentId,
      this.parentPath,
      this.webUrl,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.shareUrl,
      this.changeKey,
      this.etag,
      this.version,
      this.checksum,
      this.createdBy,
      this.lastModifiedBy,
      this.ownedBy,
      this.lastAccessedTime,
      this.virusStatus,
      this.scanTime,
      this.classification,
      this.retention,
      this.uploadSession,
      newCustomProperties,
      this.extensions
    );
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      platform: this.platform,
      fileId: this.fileId,
      driveId: this.driveId,
      driveName: this.driveName,
      parentId: this.parentId,
      parentPath: this.parentPath,
      webUrl: this.webUrl,
      downloadUrl: this.downloadUrl,
      previewUrl: this.previewUrl,
      thumbnailUrl: this.thumbnailUrl,
      shareUrl: this.shareUrl,
      changeKey: this.changeKey,
      etag: this.etag,
      version: this.version,
      checksum: this.checksum,
      contentType: this.contentType,
      size: this.size,
      humanReadableSize: this.humanReadableSize,
      fileCategory: this.fileCategory,
      createdBy: this.createdBy,
      lastModifiedBy: this.lastModifiedBy,
      ownedBy: this.ownedBy,
      creationTime: this.creationTime.toISOString(),
      lastModifiedTime: this.lastModifiedTime.toISOString(),
      lastAccessedTime: this.lastAccessedTime?.toISOString(),
      lastSyncTime: this.lastSyncTime.toISOString(),
      timeSinceSync: this.timeSinceSync,
      isSyncStale: this.isSyncStale,
      timeSinceModified: this.timeSinceModified,
      isRecentlyModified: this.isRecentlyModified,
      isRecentlyAccessed: this.isRecentlyAccessed,
      isReadOnly: this.isReadOnly,
      isShared: this.isShared,
      sharingScope: this.sharingScope,
      permissions: this.permissions,
      canPreview: this.canPreview,
      hasThumbnail: this.hasThumbnail,
      virusStatus: this.virusStatus,
      scanTime: this.scanTime?.toISOString(),
      isVirusClean: this.isVirusClean,
      isVirusScanPending: this.isVirusScanPending,
      classification: this.classification,
      retention: this.retention ? {
        ...this.retention,
        retainUntil: this.retention.retainUntil?.toISOString()
      } : undefined,
      isLegalHold: this.isLegalHold,
      isRetentionExpired: this.isRetentionExpired,
      source: this.source,
      uploadSession: this.uploadSession ? {
        ...this.uploadSession,
        expirationTime: this.uploadSession.expirationTime.toISOString()
      } : undefined,
      isUploading: this.isUploading,
      uploadProgress: this.uploadProgress,
      isUploadExpired: this.isUploadExpired,
      customProperties: this.customProperties,
      extensions: this.extensions
    };
  }

  /**
   * Creates metadata from JSON object
   */
  static fromJSON(json: any): FileMetadataImpl {
    return new FileMetadataImpl(
      json.platform,
      json.fileId,
      json.contentType,
      json.size,
      new Date(json.creationTime),
      new Date(json.lastModifiedTime),
      new Date(json.lastSyncTime),
      json.isReadOnly,
      json.isShared,
      json.sharingScope,
      json.permissions,
      json.source,
      json.driveId,
      json.driveName,
      json.parentId,
      json.parentPath,
      json.webUrl,
      json.downloadUrl,
      json.previewUrl,
      json.thumbnailUrl,
      json.shareUrl,
      json.changeKey,
      json.etag,
      json.version,
      json.checksum,
      json.createdBy,
      json.lastModifiedBy,
      json.ownedBy,
      json.lastAccessedTime ? new Date(json.lastAccessedTime) : undefined,
      json.virusStatus,
      json.scanTime ? new Date(json.scanTime) : undefined,
      json.classification,
      json.retention ? {
        ...json.retention,
        retainUntil: json.retention.retainUntil ? new Date(json.retention.retainUntil) : undefined
      } : undefined,
      json.uploadSession ? {
        ...json.uploadSession,
        expirationTime: new Date(json.uploadSession.expirationTime)
      } : undefined,
      json.customProperties,
      json.extensions
    );
  }
}