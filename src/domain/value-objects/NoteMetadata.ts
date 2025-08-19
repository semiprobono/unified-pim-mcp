import { Platform } from './Platform.js';

export interface NoteMetadata {
  readonly platform: Platform;
  readonly noteId: string;
  readonly notebookId: string;
  readonly notebookName?: string;
  readonly sectionId: string;
  readonly sectionName?: string;
  readonly pageId?: string;
  readonly parentPageId?: string;
  readonly webLink?: string;
  readonly contentUrl?: string;
  readonly changeKey?: string;
  readonly etag?: string;
  readonly position?: string; // For ordering pages
  readonly isHidden: boolean;
  readonly hasSubPages: boolean;
  readonly subPageCount: number;
  readonly level: number;
  readonly order: number;
  readonly createdBy?: string;
  readonly lastModifiedBy?: string;
  readonly creationTime: Date;
  readonly lastModifiedTime: Date;
  readonly lastViewedTime?: Date;
  readonly lastSyncTime: Date;
  readonly isReadOnly: boolean;
  readonly source: 'user' | 'imported' | 'template' | 'system' | 'shared';
  readonly contentInfo?: {
    wordCount?: number;
    characterCount?: number;
    estimatedReadingTime?: number;
    hasImages?: boolean;
    hasAttachments?: boolean;
    attachmentCount?: number;
    lastContentUpdate?: Date;
  };
  readonly collaborationInfo?: {
    isShared?: boolean;
    sharedWith?: string[];
    permissions?: 'read' | 'edit' | 'owner';
    lastCollaboratorAccess?: Date;
    collaboratorCount?: number;
  };
  readonly customProperties?: Record<string, any>;
  readonly extensions?: Array<{
    extensionName: string;
    id: string;
    data: Record<string, any>;
  }>;
}

export class NoteMetadataImpl implements NoteMetadata {
  constructor(
    public readonly platform: Platform,
    public readonly noteId: string,
    public readonly notebookId: string,
    public readonly sectionId: string,
    public readonly level: number,
    public readonly order: number,
    public readonly isHidden: boolean,
    public readonly hasSubPages: boolean,
    public readonly subPageCount: number,
    public readonly creationTime: Date,
    public readonly lastModifiedTime: Date,
    public readonly lastSyncTime: Date,
    public readonly isReadOnly: boolean,
    public readonly source: 'user' | 'imported' | 'template' | 'system' | 'shared',
    public readonly notebookName?: string,
    public readonly sectionName?: string,
    public readonly pageId?: string,
    public readonly parentPageId?: string,
    public readonly webLink?: string,
    public readonly contentUrl?: string,
    public readonly changeKey?: string,
    public readonly etag?: string,
    public readonly position?: string,
    public readonly createdBy?: string,
    public readonly lastModifiedBy?: string,
    public readonly lastViewedTime?: Date,
    public readonly contentInfo?: {
      wordCount?: number;
      characterCount?: number;
      estimatedReadingTime?: number;
      hasImages?: boolean;
      hasAttachments?: boolean;
      attachmentCount?: number;
      lastContentUpdate?: Date;
    },
    public readonly collaborationInfo?: {
      isShared?: boolean;
      sharedWith?: string[];
      permissions?: 'read' | 'edit' | 'owner';
      lastCollaboratorAccess?: Date;
      collaboratorCount?: number;
    },
    public readonly customProperties?: Record<string, any>,
    public readonly extensions?: Array<{
      extensionName: string;
      id: string;
      data: Record<string, any>;
    }>
  ) {}

  /**
   * Creates minimal metadata for a new note
   */
  static createMinimal(
    platform: Platform,
    noteId: string,
    notebookId: string,
    sectionId: string,
    level: number = 0,
    order: number = 0,
    source: 'user' | 'imported' | 'template' | 'system' | 'shared' = 'user'
  ): NoteMetadataImpl {
    const now = new Date();
    return new NoteMetadataImpl(
      platform,
      noteId,
      notebookId,
      sectionId,
      level,
      order,
      false, // isHidden
      false, // hasSubPages
      0, // subPageCount
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      false, // isReadOnly
      source
    );
  }

  /**
   * Creates metadata for a sub-page
   */
  static createSubPage(
    platform: Platform,
    noteId: string,
    notebookId: string,
    sectionId: string,
    parentPageId: string,
    level: number,
    order: number = 0
  ): NoteMetadataImpl {
    const now = new Date();
    return new NoteMetadataImpl(
      platform,
      noteId,
      notebookId,
      sectionId,
      level,
      order,
      false, // isHidden
      false, // hasSubPages
      0, // subPageCount
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      false, // isReadOnly
      'user',
      undefined, // notebookName
      undefined, // sectionName
      undefined, // pageId
      parentPageId
    );
  }

  /**
   * Creates metadata for a shared note
   */
  static createShared(
    platform: Platform,
    noteId: string,
    notebookId: string,
    sectionId: string,
    permissions: 'read' | 'edit' | 'owner',
    sharedWith: string[] = []
  ): NoteMetadataImpl {
    const now = new Date();
    return new NoteMetadataImpl(
      platform,
      noteId,
      notebookId,
      sectionId,
      0, // level
      0, // order
      false, // isHidden
      false, // hasSubPages
      0, // subPageCount
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      permissions === 'read', // isReadOnly
      'shared',
      undefined, // notebookName
      undefined, // sectionName
      undefined, // pageId
      undefined, // parentPageId
      undefined, // webLink
      undefined, // contentUrl
      undefined, // changeKey
      undefined, // etag
      undefined, // position
      undefined, // createdBy
      undefined, // lastModifiedBy
      undefined, // lastViewedTime
      undefined, // contentInfo
      {
        isShared: true,
        sharedWith,
        permissions,
        collaboratorCount: sharedWith.length
      }
    );
  }

  /**
   * Checks if this is a sub-page
   */
  get isSubPage(): boolean {
    return this.parentPageId !== undefined && this.level > 0;
  }

  /**
   * Checks if this is a root page
   */
  get isRootPage(): boolean {
    return this.parentPageId === undefined && this.level === 0;
  }

  /**
   * Checks if this is a shared note
   */
  get isShared(): boolean {
    return this.collaborationInfo?.isShared || false;
  }

  /**
   * Checks if this is a parent page
   */
  get isParentPage(): boolean {
    return this.hasSubPages && this.subPageCount > 0;
  }

  /**
   * Gets the depth level as text
   */
  get levelDescription(): string {
    switch (this.level) {
      case 0:
        return 'Page';
      case 1:
        return 'Sub-page';
      case 2:
        return 'Sub-sub-page';
      case 3:
        return 'Level 4 page';
      default:
        return `Level ${this.level + 1} page`;
    }
  }

  /**
   * Gets time since last sync
   */
  get timeSinceSync(): number {
    return Date.now() - this.lastSyncTime.getTime();
  }

  /**
   * Checks if sync is stale (more than 15 minutes old for notes)
   */
  get isSyncStale(): boolean {
    return this.timeSinceSync > 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Gets time since last modification
   */
  get timeSinceModified(): number {
    return Date.now() - this.lastModifiedTime.getTime();
  }

  /**
   * Checks if note was recently modified (within last 5 minutes)
   */
  get isRecentlyModified(): boolean {
    return this.timeSinceModified < 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Gets time since last viewed
   */
  get timeSinceViewed(): number {
    if (!this.lastViewedTime) return Infinity;
    return Date.now() - this.lastViewedTime.getTime();
  }

  /**
   * Checks if note was recently viewed (within last 24 hours)
   */
  get isRecentlyViewed(): boolean {
    if (!this.lastViewedTime) return false;
    return this.timeSinceViewed < 24 * 60 * 60 * 1000; // 24 hours
  }

  /**
   * Checks if this is a user-created note
   */
  get isUserCreated(): boolean {
    return this.source === 'user';
  }

  /**
   * Checks if this is a system-generated note
   */
  get isSystemGenerated(): boolean {
    return this.source === 'system';
  }

  /**
   * Checks if this note has content information
   */
  get hasContentInfo(): boolean {
    return this.contentInfo !== undefined;
  }

  /**
   * Gets estimated reading time in human-readable format
   */
  get estimatedReadingTimeFormatted(): string {
    if (!this.contentInfo?.estimatedReadingTime) return 'Unknown';
    
    const minutes = this.contentInfo.estimatedReadingTime;
    if (minutes < 1) return 'Less than 1 minute';
    if (minutes === 1) return '1 minute';
    if (minutes < 60) return `${minutes} minutes`;
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return hours === 1 ? '1 hour' : `${hours} hours`;
    }
    
    return `${hours}h ${remainingMinutes}m`;
  }

  /**
   * Gets word count in human-readable format
   */
  get wordCountFormatted(): string {
    if (!this.contentInfo?.wordCount) return 'No content';
    
    const count = this.contentInfo.wordCount;
    if (count < 1000) return `${count} words`;
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K words`;
    return `${(count / 1000000).toFixed(1)}M words`;
  }

  /**
   * Gets character count in human-readable format
   */
  get characterCountFormatted(): string {
    if (!this.contentInfo?.characterCount) return 'No content';
    
    const count = this.contentInfo.characterCount;
    if (count < 1000) return `${count} characters`;
    if (count < 1000000) return `${(count / 1000).toFixed(1)}K characters`;
    return `${(count / 1000000).toFixed(1)}M characters`;
  }

  /**
   * Gets collaboration status
   */
  get collaborationStatus(): string {
    if (!this.isShared) return 'Private';
    
    const count = this.collaborationInfo?.collaboratorCount || 0;
    if (count === 0) return 'Shared (no collaborators)';
    if (count === 1) return 'Shared with 1 person';
    return `Shared with ${count} people`;
  }

  /**
   * Updates the last sync time
   */
  withUpdatedSync(): NoteMetadataImpl {
    return new NoteMetadataImpl(
      this.platform,
      this.noteId,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      this.isHidden,
      this.hasSubPages,
      this.subPageCount,
      this.creationTime,
      this.lastModifiedTime,
      new Date(), // Update sync time
      this.isReadOnly,
      this.source,
      this.notebookName,
      this.sectionName,
      this.pageId,
      this.parentPageId,
      this.webLink,
      this.contentUrl,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      this.lastViewedTime,
      this.contentInfo,
      this.collaborationInfo,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates sub-page counts
   */
  withSubPageCounts(count: number): NoteMetadataImpl {
    return new NoteMetadataImpl(
      this.platform,
      this.noteId,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      this.isHidden,
      count > 0, // hasSubPages
      count,
      this.creationTime,
      new Date(), // Update modified time
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.notebookName,
      this.sectionName,
      this.pageId,
      this.parentPageId,
      this.webLink,
      this.contentUrl,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      this.lastViewedTime,
      this.contentInfo,
      this.collaborationInfo,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates content information
   */
  withContentInfo(contentInfo: {
    wordCount?: number;
    characterCount?: number;
    estimatedReadingTime?: number;
    hasImages?: boolean;
    hasAttachments?: boolean;
    attachmentCount?: number;
    lastContentUpdate?: Date;
  }): NoteMetadataImpl {
    return new NoteMetadataImpl(
      this.platform,
      this.noteId,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      this.isHidden,
      this.hasSubPages,
      this.subPageCount,
      this.creationTime,
      new Date(), // Update modified time
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.notebookName,
      this.sectionName,
      this.pageId,
      this.parentPageId,
      this.webLink,
      this.contentUrl,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      this.lastViewedTime,
      {
        ...this.contentInfo,
        ...contentInfo,
        lastContentUpdate: contentInfo.lastContentUpdate || new Date()
      },
      this.collaborationInfo,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates the last viewed time
   */
  withViewedTime(viewedTime: Date = new Date()): NoteMetadataImpl {
    return new NoteMetadataImpl(
      this.platform,
      this.noteId,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      this.isHidden,
      this.hasSubPages,
      this.subPageCount,
      this.creationTime,
      this.lastModifiedTime,
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.notebookName,
      this.sectionName,
      this.pageId,
      this.parentPageId,
      this.webLink,
      this.contentUrl,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      viewedTime,
      this.contentInfo,
      this.collaborationInfo,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates visibility
   */
  withVisibility(isHidden: boolean): NoteMetadataImpl {
    return new NoteMetadataImpl(
      this.platform,
      this.noteId,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      isHidden,
      this.hasSubPages,
      this.subPageCount,
      this.creationTime,
      new Date(), // Update modified time
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.notebookName,
      this.sectionName,
      this.pageId,
      this.parentPageId,
      this.webLink,
      this.contentUrl,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      this.lastViewedTime,
      this.contentInfo,
      this.collaborationInfo,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Adds custom property
   */
  withCustomProperty(key: string, value: any): NoteMetadataImpl {
    const newCustomProperties = {
      ...this.customProperties,
      [key]: value,
    };

    return new NoteMetadataImpl(
      this.platform,
      this.noteId,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      this.isHidden,
      this.hasSubPages,
      this.subPageCount,
      this.creationTime,
      this.lastModifiedTime,
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.notebookName,
      this.sectionName,
      this.pageId,
      this.parentPageId,
      this.webLink,
      this.contentUrl,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      this.lastViewedTime,
      this.contentInfo,
      this.collaborationInfo,
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
      noteId: this.noteId,
      notebookId: this.notebookId,
      notebookName: this.notebookName,
      sectionId: this.sectionId,
      sectionName: this.sectionName,
      pageId: this.pageId,
      parentPageId: this.parentPageId,
      webLink: this.webLink,
      contentUrl: this.contentUrl,
      changeKey: this.changeKey,
      etag: this.etag,
      position: this.position,
      level: this.level,
      levelDescription: this.levelDescription,
      order: this.order,
      isHidden: this.isHidden,
      hasSubPages: this.hasSubPages,
      subPageCount: this.subPageCount,
      createdBy: this.createdBy,
      lastModifiedBy: this.lastModifiedBy,
      creationTime: this.creationTime.toISOString(),
      lastModifiedTime: this.lastModifiedTime.toISOString(),
      lastViewedTime: this.lastViewedTime?.toISOString(),
      lastSyncTime: this.lastSyncTime.toISOString(),
      timeSinceSync: this.timeSinceSync,
      isSyncStale: this.isSyncStale,
      timeSinceModified: this.timeSinceModified,
      isRecentlyModified: this.isRecentlyModified,
      timeSinceViewed: this.timeSinceViewed,
      isRecentlyViewed: this.isRecentlyViewed,
      isReadOnly: this.isReadOnly,
      source: this.source,
      isSubPage: this.isSubPage,
      isRootPage: this.isRootPage,
      isShared: this.isShared,
      isParentPage: this.isParentPage,
      isUserCreated: this.isUserCreated,
      isSystemGenerated: this.isSystemGenerated,
      hasContentInfo: this.hasContentInfo,
      estimatedReadingTimeFormatted: this.estimatedReadingTimeFormatted,
      wordCountFormatted: this.wordCountFormatted,
      characterCountFormatted: this.characterCountFormatted,
      collaborationStatus: this.collaborationStatus,
      contentInfo: this.contentInfo
        ? {
            ...this.contentInfo,
            lastContentUpdate: this.contentInfo.lastContentUpdate?.toISOString(),
          }
        : undefined,
      collaborationInfo: this.collaborationInfo
        ? {
            ...this.collaborationInfo,
            lastCollaboratorAccess: this.collaborationInfo.lastCollaboratorAccess?.toISOString(),
          }
        : undefined,
      customProperties: this.customProperties,
      extensions: this.extensions,
    };
  }

  /**
   * Creates metadata from JSON object
   */
  static fromJSON(json: any): NoteMetadataImpl {
    return new NoteMetadataImpl(
      json.platform,
      json.noteId,
      json.notebookId,
      json.sectionId,
      json.level,
      json.order,
      json.isHidden,
      json.hasSubPages,
      json.subPageCount,
      new Date(json.creationTime),
      new Date(json.lastModifiedTime),
      new Date(json.lastSyncTime),
      json.isReadOnly,
      json.source,
      json.notebookName,
      json.sectionName,
      json.pageId,
      json.parentPageId,
      json.webLink,
      json.contentUrl,
      json.changeKey,
      json.etag,
      json.position,
      json.createdBy,
      json.lastModifiedBy,
      json.lastViewedTime ? new Date(json.lastViewedTime) : undefined,
      json.contentInfo
        ? {
            ...json.contentInfo,
            lastContentUpdate: json.contentInfo.lastContentUpdate
              ? new Date(json.contentInfo.lastContentUpdate)
              : undefined,
          }
        : undefined,
      json.collaborationInfo
        ? {
            ...json.collaborationInfo,
            lastCollaboratorAccess: json.collaborationInfo.lastCollaboratorAccess
              ? new Date(json.collaborationInfo.lastCollaboratorAccess)
              : undefined,
          }
        : undefined,
      json.customProperties,
      json.extensions
    );
  }
}