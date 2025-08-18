import { UnifiedId } from '../value-objects/UnifiedId.js';
import { Platform } from '../value-objects/Platform.js';
import { FileMetadata } from '../value-objects/FileMetadata.js';

export interface FileVersion {
  id: string;
  createdDateTime: Date;
  lastModifiedDateTime: Date;
  size: number;
  versionLabel?: string;
  comment?: string;
  createdBy?: string;
  downloadUrl?: string;
}

export interface FilePermissions {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canShare: boolean;
  canDownload: boolean;
  inheritedFrom?: string;
}

export interface ShareLink {
  id: string;
  url: string;
  type: 'view' | 'edit' | 'embed';
  expirationDateTime?: Date;
  requiresSignIn: boolean;
  password?: string;
  createdDateTime: Date;
  createdBy: string;
}

export interface FileActivity {
  id: string;
  action: 'created' | 'modified' | 'deleted' | 'restored' | 'moved' | 'copied' | 'shared' | 'downloaded';
  actor: string;
  timestamp: Date;
  details?: Record<string, any>;
}

export interface File {
  readonly id: UnifiedId;
  readonly platformIds: Map<Platform, string>;
  readonly name: string;
  readonly displayName: string;
  readonly mimeType: string;
  readonly size: number;
  readonly path: string;
  readonly parentId?: string | undefined;
  readonly isFolder: boolean;
  readonly createdDateTime: Date;
  readonly lastModifiedDateTime: Date;
  readonly lastAccessedDateTime?: Date | undefined;
  readonly createdBy?: string | undefined;
  readonly lastModifiedBy?: string | undefined;
  readonly downloadUrl?: string | undefined;
  readonly previewUrl?: string | undefined;
  readonly thumbnailUrl?: string | undefined;
  readonly webUrl?: string | undefined;
  readonly hash?: string | undefined;
  readonly tags: string[];
  readonly categories: string[];
  readonly description?: string | undefined;
  readonly versions: FileVersion[];
  readonly permissions: FilePermissions;
  readonly shareLinks: ShareLink[];
  readonly activities: FileActivity[];
  readonly isDeleted: boolean;
  readonly deletedDateTime?: Date | undefined;
  readonly deletedBy?: string | undefined;
  readonly metadata: FileMetadata;
}

export class FileEntity implements File {
  constructor(
    public readonly id: UnifiedId,
    public readonly platformIds: Map<Platform, string>,
    public readonly name: string,
    public readonly displayName: string,
    public readonly mimeType: string,
    public readonly size: number,
    public readonly path: string,
    public readonly isFolder: boolean,
    public readonly createdDateTime: Date,
    public readonly lastModifiedDateTime: Date,
    public readonly tags: string[],
    public readonly categories: string[],
    public readonly versions: FileVersion[],
    public readonly permissions: FilePermissions,
    public readonly shareLinks: ShareLink[],
    public readonly activities: FileActivity[],
    public readonly isDeleted: boolean,
    public readonly metadata: FileMetadata,
    public readonly parentId?: string,
    public readonly lastAccessedDateTime?: Date,
    public readonly createdBy?: string,
    public readonly lastModifiedBy?: string,
    public readonly downloadUrl?: string,
    public readonly previewUrl?: string,
    public readonly thumbnailUrl?: string,
    public readonly webUrl?: string,
    public readonly hash?: string,
    public readonly description?: string,
    public readonly deletedDateTime?: Date,
    public readonly deletedBy?: string
  ) {}

  /**
   * Gets the file extension
   */
  get extension(): string {
    const lastDot = this.name.lastIndexOf('.');
    return lastDot === -1 ? '' : this.name.substring(lastDot + 1).toLowerCase();
  }

  /**
   * Gets the file name without extension
   */
  get nameWithoutExtension(): string {
    const lastDot = this.name.lastIndexOf('.');
    return lastDot === -1 ? this.name : this.name.substring(0, lastDot);
  }

  /**
   * Gets the file type category
   */
  get fileType(): 'document' | 'image' | 'video' | 'audio' | 'archive' | 'code' | 'other' {
    const ext = this.extension;
    
    // Document types
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp'].includes(ext)) {
      return 'document';
    }
    
    // Image types
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'tiff', 'ico'].includes(ext)) {
      return 'image';
    }
    
    // Video types
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v'].includes(ext)) {
      return 'video';
    }
    
    // Audio types
    if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'].includes(ext)) {
      return 'audio';
    }
    
    // Archive types
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) {
      return 'archive';
    }
    
    // Code types
    if (['js', 'ts', 'py', 'java', 'c', 'cpp', 'cs', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'html', 'css', 'json', 'xml', 'yaml', 'yml'].includes(ext)) {
      return 'code';
    }
    
    return 'other';
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
   * Gets the latest version
   */
  get latestVersion(): FileVersion {
    return this.versions.sort((a, b) => b.lastModifiedDateTime.getTime() - a.lastModifiedDateTime.getTime())[0];
  }

  /**
   * Checks if file is shared
   */
  get isShared(): boolean {
    return this.shareLinks.length > 0;
  }

  /**
   * Checks if file has active share links
   */
  get hasActiveShareLinks(): boolean {
    const now = new Date();
    return this.shareLinks.some(link => 
      !link.expirationDateTime || link.expirationDateTime > now
    );
  }

  /**
   * Gets recent activities (last 10)
   */
  get recentActivities(): FileActivity[] {
    return this.activities
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 10);
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
   * Moves file to a new parent folder
   */
  moveTo(newParentId: string, newPath: string): FileEntity {
    return new FileEntity(
      this.id,
      this.platformIds,
      this.name,
      this.displayName,
      this.mimeType,
      this.size,
      newPath,
      this.isFolder,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.tags,
      this.categories,
      this.versions,
      this.permissions,
      this.shareLinks,
      [...this.activities, {
        id: `activity_${Date.now()}`,
        action: 'moved',
        actor: 'system',
        timestamp: new Date(),
        details: { oldPath: this.path, newPath, oldParentId: this.parentId, newParentId }
      }],
      this.isDeleted,
      this.metadata,
      newParentId,
      this.lastAccessedDateTime,
      this.createdBy,
      this.lastModifiedBy,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.webUrl,
      this.hash,
      this.description,
      this.deletedDateTime,
      this.deletedBy
    );
  }

  /**
   * Renames the file
   */
  rename(newName: string): FileEntity {
    const newDisplayName = this.displayName === this.name ? newName : this.displayName;
    
    return new FileEntity(
      this.id,
      this.platformIds,
      newName,
      newDisplayName,
      this.mimeType,
      this.size,
      this.path.replace(this.name, newName),
      this.isFolder,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.tags,
      this.categories,
      this.versions,
      this.permissions,
      this.shareLinks,
      [...this.activities, {
        id: `activity_${Date.now()}`,
        action: 'modified',
        actor: 'system',
        timestamp: new Date(),
        details: { oldName: this.name, newName, action: 'rename' }
      }],
      this.isDeleted,
      this.metadata,
      this.parentId,
      this.lastAccessedDateTime,
      this.createdBy,
      'system', // Update lastModifiedBy
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.webUrl,
      this.hash,
      this.description,
      this.deletedDateTime,
      this.deletedBy
    );
  }

  /**
   * Adds tags to the file
   */
  addTags(newTags: string[]): FileEntity {
    const updatedTags = [...new Set([...this.tags, ...newTags])];
    
    return new FileEntity(
      this.id,
      this.platformIds,
      this.name,
      this.displayName,
      this.mimeType,
      this.size,
      this.path,
      this.isFolder,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      updatedTags,
      this.categories,
      this.versions,
      this.permissions,
      this.shareLinks,
      this.activities,
      this.isDeleted,
      this.metadata,
      this.parentId,
      this.lastAccessedDateTime,
      this.createdBy,
      this.lastModifiedBy,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.webUrl,
      this.hash,
      this.description,
      this.deletedDateTime,
      this.deletedBy
    );
  }

  /**
   * Creates a share link
   */
  createShareLink(type: 'view' | 'edit' | 'embed', expirationDateTime?: Date): FileEntity {
    const newShareLink: ShareLink = {
      id: `sharelink_${Date.now()}`,
      url: `https://share.platform.com/${this.id}`,
      type,
      expirationDateTime,
      requiresSignIn: false,
      createdDateTime: new Date(),
      createdBy: 'system'
    };

    const updatedShareLinks = [...this.shareLinks, newShareLink];
    
    return new FileEntity(
      this.id,
      this.platformIds,
      this.name,
      this.displayName,
      this.mimeType,
      this.size,
      this.path,
      this.isFolder,
      this.createdDateTime,
      this.lastModifiedDateTime,
      this.tags,
      this.categories,
      this.versions,
      this.permissions,
      updatedShareLinks,
      [...this.activities, {
        id: `activity_${Date.now()}`,
        action: 'shared',
        actor: 'system',
        timestamp: new Date(),
        details: { shareType: type, linkId: newShareLink.id }
      }],
      this.isDeleted,
      this.metadata,
      this.parentId,
      this.lastAccessedDateTime,
      this.createdBy,
      this.lastModifiedBy,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.webUrl,
      this.hash,
      this.description,
      this.deletedDateTime,
      this.deletedBy
    );
  }

  /**
   * Marks file as deleted (soft delete)
   */
  delete(deletedBy: string): FileEntity {
    return new FileEntity(
      this.id,
      this.platformIds,
      this.name,
      this.displayName,
      this.mimeType,
      this.size,
      this.path,
      this.isFolder,
      this.createdDateTime,
      this.lastModifiedDateTime,
      this.tags,
      this.categories,
      this.versions,
      this.permissions,
      this.shareLinks,
      [...this.activities, {
        id: `activity_${Date.now()}`,
        action: 'deleted',
        actor: deletedBy,
        timestamp: new Date(),
        details: { softDelete: true }
      }],
      true, // Mark as deleted
      this.metadata,
      this.parentId,
      this.lastAccessedDateTime,
      this.createdBy,
      this.lastModifiedBy,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.webUrl,
      this.hash,
      this.description,
      new Date(), // Set deleted date
      deletedBy
    );
  }

  /**
   * Restores a deleted file
   */
  restore(): FileEntity {
    return new FileEntity(
      this.id,
      this.platformIds,
      this.name,
      this.displayName,
      this.mimeType,
      this.size,
      this.path,
      this.isFolder,
      this.createdDateTime,
      this.lastModifiedDateTime,
      this.tags,
      this.categories,
      this.versions,
      this.permissions,
      this.shareLinks,
      [...this.activities, {
        id: `activity_${Date.now()}`,
        action: 'restored',
        actor: 'system',
        timestamp: new Date(),
        details: { restoredFrom: 'deleted' }
      }],
      false, // Mark as not deleted
      this.metadata,
      this.parentId,
      this.lastAccessedDateTime,
      this.createdBy,
      this.lastModifiedBy,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.webUrl,
      this.hash,
      this.description,
      undefined, // Clear deleted date
      undefined // Clear deleted by
    );
  }

  /**
   * Records an access to the file
   */
  recordAccess(): FileEntity {
    return new FileEntity(
      this.id,
      this.platformIds,
      this.name,
      this.displayName,
      this.mimeType,
      this.size,
      this.path,
      this.isFolder,
      this.createdDateTime,
      this.lastModifiedDateTime,
      this.tags,
      this.categories,
      this.versions,
      this.permissions,
      this.shareLinks,
      this.activities,
      this.isDeleted,
      this.metadata,
      this.parentId,
      new Date(), // Update lastAccessedDateTime
      this.createdBy,
      this.lastModifiedBy,
      this.downloadUrl,
      this.previewUrl,
      this.thumbnailUrl,
      this.webUrl,
      this.hash,
      this.description,
      this.deletedDateTime,
      this.deletedBy
    );
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id.toString(),
      platformIds: Object.fromEntries(this.platformIds),
      name: this.name,
      displayName: this.displayName,
      mimeType: this.mimeType,
      size: this.size,
      humanReadableSize: this.humanReadableSize,
      path: this.path,
      parentId: this.parentId,
      isFolder: this.isFolder,
      extension: this.extension,
      nameWithoutExtension: this.nameWithoutExtension,
      fileType: this.fileType,
      createdDateTime: this.createdDateTime.toISOString(),
      lastModifiedDateTime: this.lastModifiedDateTime.toISOString(),
      lastAccessedDateTime: this.lastAccessedDateTime?.toISOString(),
      createdBy: this.createdBy,
      lastModifiedBy: this.lastModifiedBy,
      downloadUrl: this.downloadUrl,
      previewUrl: this.previewUrl,
      thumbnailUrl: this.thumbnailUrl,
      webUrl: this.webUrl,
      hash: this.hash,
      tags: this.tags,
      categories: this.categories,
      description: this.description,
      versions: this.versions.map(v => ({
        ...v,
        createdDateTime: v.createdDateTime.toISOString(),
        lastModifiedDateTime: v.lastModifiedDateTime.toISOString()
      })),
      permissions: this.permissions,
      shareLinks: this.shareLinks.map(link => ({
        ...link,
        createdDateTime: link.createdDateTime.toISOString(),
        expirationDateTime: link.expirationDateTime?.toISOString()
      })),
      recentActivities: this.recentActivities.map(activity => ({
        ...activity,
        timestamp: activity.timestamp.toISOString()
      })),
      isDeleted: this.isDeleted,
      deletedDateTime: this.deletedDateTime?.toISOString(),
      deletedBy: this.deletedBy,
      isShared: this.isShared,
      hasActiveShareLinks: this.hasActiveShareLinks,
      canPreview: this.canPreview,
      hasThumbnail: this.hasThumbnail,
      metadata: this.metadata
    };
  }
}