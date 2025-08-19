import { Platform } from './Platform.js';

export interface EmailMetadata {
  readonly platform: Platform;
  readonly folderId?: string | undefined;
  readonly folderName?: string | undefined;
  readonly threadId?: string | undefined;
  readonly messageId: string;
  readonly parentFolderId?: string | undefined;
  readonly webLink?: string | undefined;
  readonly changeKey?: string | undefined;
  readonly bodyPreview?: string | undefined;
  readonly flag?: {
    flagStatus: 'notFlagged' | 'complete' | 'flagged';
    startDate?: Date;
    dueDate?: Date;
    completedDate?: Date;
  };
  readonly classification?: string | undefined;
  readonly size: number;
  readonly isFromMe: boolean;
  readonly isDraft: boolean;
  readonly isRead: boolean;
  readonly hasAttachments: boolean;
  readonly internetMessageHeaders?: Array<{
    name: string;
    value: string;
  }>;
  readonly sensitivity: 'normal' | 'personal' | 'private' | 'confidential';
  readonly deliveryReceiptRequested?: boolean | undefined;
  readonly readReceiptRequested?: boolean | undefined;
  readonly lastSyncTime: Date;
  readonly customProperties?: Record<string, any> | undefined;
}

export class EmailMetadataImpl implements EmailMetadata {
  constructor(
    public readonly platform: Platform,
    public readonly messageId: string,
    public readonly size: number,
    public readonly isFromMe: boolean,
    public readonly isDraft: boolean,
    public readonly isRead: boolean,
    public readonly hasAttachments: boolean,
    public readonly sensitivity: 'normal' | 'personal' | 'private' | 'confidential',
    public readonly lastSyncTime: Date,
    public readonly folderId?: string,
    public readonly folderName?: string,
    public readonly threadId?: string,
    public readonly parentFolderId?: string,
    public readonly webLink?: string,
    public readonly changeKey?: string,
    public readonly bodyPreview?: string,
    public readonly flag?: {
      flagStatus: 'notFlagged' | 'complete' | 'flagged';
      startDate?: Date;
      dueDate?: Date;
      completedDate?: Date;
    },
    public readonly classification?: string,
    public readonly internetMessageHeaders?: Array<{
      name: string;
      value: string;
    }>,
    public readonly deliveryReceiptRequested?: boolean,
    public readonly readReceiptRequested?: boolean,
    public readonly customProperties?: Record<string, any>
  ) {}

  /**
   * Creates minimal metadata for a new email
   */
  static createMinimal(
    platform: Platform,
    messageId: string,
    size: number = 0,
    isFromMe: boolean = false
  ): EmailMetadataImpl {
    return new EmailMetadataImpl(
      platform,
      messageId,
      size,
      isFromMe,
      false, // isDraft
      true, // isRead (assume read when created)
      false, // hasAttachments
      'normal', // sensitivity
      new Date() // lastSyncTime
    );
  }

  /**
   * Creates metadata for a draft email
   */
  static createDraft(platform: Platform, messageId: string, size: number = 0): EmailMetadataImpl {
    return new EmailMetadataImpl(
      platform,
      messageId,
      size,
      true, // isFromMe (drafts are from user)
      true, // isDraft
      true, // isRead
      false, // hasAttachments
      'normal', // sensitivity
      new Date() // lastSyncTime
    );
  }

  /**
   * Checks if the email is flagged
   */
  get isFlagged(): boolean {
    return this.flag?.flagStatus === 'flagged';
  }

  /**
   * Checks if the flag is completed
   */
  get isFlagCompleted(): boolean {
    return this.flag?.flagStatus === 'complete';
  }

  /**
   * Gets a human-readable size
   */
  get humanReadableSize(): string {
    const units = ['B', 'KB', 'MB', 'GB'];
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
   * Checks if sync is stale (more than 5 minutes old)
   */
  get isSyncStale(): boolean {
    return this.timeSinceSync > 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Updates the last sync time
   */
  withUpdatedSync(): EmailMetadataImpl {
    return new EmailMetadataImpl(
      this.platform,
      this.messageId,
      this.size,
      this.isFromMe,
      this.isDraft,
      this.isRead,
      this.hasAttachments,
      this.sensitivity,
      new Date(), // Update sync time
      this.folderId,
      this.folderName,
      this.threadId,
      this.parentFolderId,
      this.webLink,
      this.changeKey,
      this.bodyPreview,
      this.flag,
      this.classification,
      this.internetMessageHeaders,
      this.deliveryReceiptRequested,
      this.readReceiptRequested,
      this.customProperties
    );
  }

  /**
   * Updates the read status
   */
  withReadStatus(isRead: boolean): EmailMetadataImpl {
    return new EmailMetadataImpl(
      this.platform,
      this.messageId,
      this.size,
      this.isFromMe,
      this.isDraft,
      isRead,
      this.hasAttachments,
      this.sensitivity,
      new Date(), // Update sync time when status changes
      this.folderId,
      this.folderName,
      this.threadId,
      this.parentFolderId,
      this.webLink,
      this.changeKey,
      this.bodyPreview,
      this.flag,
      this.classification,
      this.internetMessageHeaders,
      this.deliveryReceiptRequested,
      this.readReceiptRequested,
      this.customProperties
    );
  }

  /**
   * Updates the flag status
   */
  withFlag(flag: {
    flagStatus: 'notFlagged' | 'complete' | 'flagged';
    startDate?: Date;
    dueDate?: Date;
    completedDate?: Date;
  }): EmailMetadataImpl {
    return new EmailMetadataImpl(
      this.platform,
      this.messageId,
      this.size,
      this.isFromMe,
      this.isDraft,
      this.isRead,
      this.hasAttachments,
      this.sensitivity,
      new Date(), // Update sync time when flag changes
      this.folderId,
      this.folderName,
      this.threadId,
      this.parentFolderId,
      this.webLink,
      this.changeKey,
      this.bodyPreview,
      flag,
      this.classification,
      this.internetMessageHeaders,
      this.deliveryReceiptRequested,
      this.readReceiptRequested,
      this.customProperties
    );
  }

  /**
   * Adds custom property
   */
  withCustomProperty(key: string, value: any): EmailMetadataImpl {
    const newCustomProperties = {
      ...this.customProperties,
      [key]: value,
    };

    return new EmailMetadataImpl(
      this.platform,
      this.messageId,
      this.size,
      this.isFromMe,
      this.isDraft,
      this.isRead,
      this.hasAttachments,
      this.sensitivity,
      this.lastSyncTime,
      this.folderId,
      this.folderName,
      this.threadId,
      this.parentFolderId,
      this.webLink,
      this.changeKey,
      this.bodyPreview,
      this.flag,
      this.classification,
      this.internetMessageHeaders,
      this.deliveryReceiptRequested,
      this.readReceiptRequested,
      newCustomProperties
    );
  }

  /**
   * Gets specific internet message header
   */
  getHeader(name: string): string | undefined {
    return this.internetMessageHeaders?.find(
      header => header.name.toLowerCase() === name.toLowerCase()
    )?.value;
  }

  /**
   * Checks if email has specific header
   */
  hasHeader(name: string): boolean | undefined {
    return this.getHeader(name) !== undefined;
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      platform: this.platform,
      messageId: this.messageId,
      size: this.size,
      humanReadableSize: this.humanReadableSize,
      isFromMe: this.isFromMe,
      isDraft: this.isDraft,
      isRead: this.isRead,
      hasAttachments: this.hasAttachments,
      sensitivity: this.sensitivity,
      lastSyncTime: this.lastSyncTime.toISOString(),
      timeSinceSync: this.timeSinceSync,
      isSyncStale: this.isSyncStale,
      folderId: this.folderId,
      folderName: this.folderName,
      threadId: this.threadId,
      parentFolderId: this.parentFolderId,
      webLink: this.webLink,
      changeKey: this.changeKey,
      bodyPreview: this.bodyPreview,
      flag: this.flag
        ? {
            ...this.flag,
            startDate: this.flag.startDate?.toISOString(),
            dueDate: this.flag.dueDate?.toISOString(),
            completedDate: this.flag.completedDate?.toISOString(),
          }
        : undefined,
      isFlagged: this.isFlagged,
      isFlagCompleted: this.isFlagCompleted,
      classification: this.classification,
      internetMessageHeaders: this.internetMessageHeaders,
      deliveryReceiptRequested: this.deliveryReceiptRequested,
      readReceiptRequested: this.readReceiptRequested,
      customProperties: this.customProperties,
    };
  }

  /**
   * Creates metadata from JSON object
   */
  static fromJSON(json: any): EmailMetadataImpl {
    return new EmailMetadataImpl(
      json.platform,
      json.messageId,
      json.size,
      json.isFromMe,
      json.isDraft,
      json.isRead,
      json.hasAttachments,
      json.sensitivity,
      new Date(json.lastSyncTime),
      json.folderId,
      json.folderName,
      json.threadId,
      json.parentFolderId,
      json.webLink,
      json.changeKey,
      json.bodyPreview,
      json.flag
        ? {
            flagStatus: json.flag.flagStatus,
            startDate: json.flag.startDate ? new Date(json.flag.startDate) : undefined,
            dueDate: json.flag.dueDate ? new Date(json.flag.dueDate) : undefined,
            completedDate: json.flag.completedDate ? new Date(json.flag.completedDate) : undefined,
          }
        : undefined,
      json.classification,
      json.internetMessageHeaders,
      json.deliveryReceiptRequested,
      json.readReceiptRequested,
      json.customProperties
    );
  }
}
