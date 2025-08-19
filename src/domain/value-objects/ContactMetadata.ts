import { Platform } from './Platform.js';

export interface ContactMetadata {
  readonly platform: Platform;
  readonly contactId: string;
  readonly parentFolderId?: string | undefined;
  readonly folderName?: string | undefined;
  readonly webLink?: string | undefined;
  readonly changeKey?: string | undefined;
  readonly etag?: string | undefined;
  readonly personalNotes?: string | undefined;
  readonly children?: string[] | undefined;
  readonly profession?: string | undefined;
  readonly spouseName?: string | undefined;
  readonly manager?: string | undefined;
  readonly assistantName?: string | undefined;
  readonly department?: string | undefined;
  readonly officeLocation?: string | undefined;
  readonly companyName?: string | undefined;
  readonly businessHomePage?: string | undefined;
  readonly generation?: string | undefined;
  readonly nickName?: string | undefined;
  readonly middleName?: string | undefined;
  readonly fileAs?: string | undefined;
  readonly displayName?: string | undefined;
  readonly creationTime: Date;
  readonly lastModifiedTime: Date;
  readonly lastSyncTime: Date;
  readonly isReadOnly: boolean;
  readonly source: 'user' | 'directory' | 'facebook' | 'gmail' | 'outlook' | 'linkedIn' | 'other';
  readonly confidence?: number | undefined; // For ML-detected contacts
  readonly duplicateContacts?: string[] | undefined; // IDs of potential duplicates
  readonly customProperties?: Record<string, any> | undefined;
  readonly extensions?: Array<{
    extensionName: string;
    id: string;
    data: Record<string, any>;
  }>;
}

export class ContactMetadataImpl implements ContactMetadata {
  constructor(
    public readonly platform: Platform,
    public readonly contactId: string,
    public readonly creationTime: Date,
    public readonly lastModifiedTime: Date,
    public readonly lastSyncTime: Date,
    public readonly isReadOnly: boolean,
    public readonly source:
      | 'user'
      | 'directory'
      | 'facebook'
      | 'gmail'
      | 'outlook'
      | 'linkedIn'
      | 'other',
    public readonly parentFolderId?: string,
    public readonly folderName?: string,
    public readonly webLink?: string,
    public readonly changeKey?: string,
    public readonly etag?: string,
    public readonly personalNotes?: string,
    public readonly children?: string[],
    public readonly profession?: string,
    public readonly spouseName?: string,
    public readonly manager?: string,
    public readonly assistantName?: string,
    public readonly department?: string,
    public readonly officeLocation?: string,
    public readonly companyName?: string,
    public readonly businessHomePage?: string,
    public readonly generation?: string,
    public readonly nickName?: string,
    public readonly middleName?: string,
    public readonly fileAs?: string,
    public readonly displayName?: string,
    public readonly confidence?: number,
    public readonly duplicateContacts?: string[],
    public readonly customProperties?: Record<string, any>,
    public readonly extensions?: Array<{
      extensionName: string;
      id: string;
      data: Record<string, any>;
    }>
  ) {}

  /**
   * Creates minimal metadata for a new contact
   */
  static createMinimal(
    platform: Platform,
    contactId: string,
    source: 'user' | 'directory' | 'facebook' | 'gmail' | 'outlook' | 'linkedIn' | 'other' = 'user'
  ): ContactMetadataImpl {
    const now = new Date();
    return new ContactMetadataImpl(
      platform,
      contactId,
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      false, // isReadOnly
      source
    );
  }

  /**
   * Creates metadata for a directory contact (read-only)
   */
  static createDirectory(
    platform: Platform,
    contactId: string,
    displayName?: string,
    companyName?: string
  ): ContactMetadataImpl {
    const now = new Date();
    return new ContactMetadataImpl(
      platform,
      contactId,
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      true, // isReadOnly (directory contacts are read-only)
      'directory',
      undefined, // parentFolderId
      undefined, // folderName
      undefined, // webLink
      undefined, // changeKey
      undefined, // etag
      undefined, // personalNotes
      undefined, // children
      undefined, // profession
      undefined, // spouseName
      undefined, // manager
      undefined, // assistantName
      undefined, // department
      undefined, // officeLocation
      companyName,
      undefined, // businessHomePage
      undefined, // generation
      undefined, // nickName
      undefined, // middleName
      undefined, // fileAs
      displayName
    );
  }

  /**
   * Creates metadata for a social platform contact
   */
  static createSocial(
    platform: Platform,
    contactId: string,
    source: 'facebook' | 'gmail' | 'outlook' | 'linkedIn',
    displayName?: string,
    confidence?: number
  ): ContactMetadataImpl {
    const now = new Date();
    return new ContactMetadataImpl(
      platform,
      contactId,
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      false, // isReadOnly
      source,
      undefined, // parentFolderId
      undefined, // folderName
      undefined, // webLink
      undefined, // changeKey
      undefined, // etag
      undefined, // personalNotes
      undefined, // children
      undefined, // profession
      undefined, // spouseName
      undefined, // manager
      undefined, // assistantName
      undefined, // department
      undefined, // officeLocation
      undefined, // companyName
      undefined, // businessHomePage
      undefined, // generation
      undefined, // nickName
      undefined, // middleName
      undefined, // fileAs
      displayName,
      confidence
    );
  }

  /**
   * Checks if this is a user-created contact
   */
  get isUserCreated(): boolean {
    return this.source === 'user';
  }

  /**
   * Checks if this is from a directory service
   */
  get isFromDirectory(): boolean {
    return this.source === 'directory';
  }

  /**
   * Checks if this is from a social platform
   */
  get isFromSocial(): boolean {
    return ['facebook', 'gmail', 'outlook', 'linkedIn'].includes(this.source);
  }

  /**
   * Gets time since last sync
   */
  get timeSinceSync(): number {
    return Date.now() - this.lastSyncTime.getTime();
  }

  /**
   * Checks if sync is stale (more than 1 hour old for contacts)
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
   * Checks if contact was recently modified (within last hour)
   */
  get isRecentlyModified(): boolean {
    return this.timeSinceModified < 60 * 60 * 1000; // 1 hour
  }

  /**
   * Gets the confidence level description
   */
  get confidenceLevel(): 'high' | 'medium' | 'low' | undefined {
    if (this.confidence === undefined) return undefined;

    if (this.confidence >= 0.8) return 'high';
    if (this.confidence >= 0.5) return 'medium';
    return 'low';
  }

  /**
   * Checks if this contact has potential duplicates
   */
  get hasPotentialDuplicates(): boolean {
    return (this.duplicateContacts?.length || 0) > 0;
  }

  /**
   * Gets the number of potential duplicates
   */
  get duplicateCount(): number {
    return this.duplicateContacts?.length || 0;
  }

  /**
   * Checks if contact has business information
   */
  get hasBusinessInfo(): boolean {
    return !!(
      this.companyName ||
      this.department ||
      this.officeLocation ||
      this.profession ||
      this.manager ||
      this.assistantName ||
      this.businessHomePage
    );
  }

  /**
   * Checks if contact has personal information
   */
  get hasPersonalInfo(): boolean {
    return !!(this.spouseName || this.children?.length || this.personalNotes || this.nickName);
  }

  /**
   * Updates the last sync time
   */
  withUpdatedSync(): ContactMetadataImpl {
    return new ContactMetadataImpl(
      this.platform,
      this.contactId,
      this.creationTime,
      this.lastModifiedTime,
      new Date(), // Update sync time
      this.isReadOnly,
      this.source,
      this.parentFolderId,
      this.folderName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.personalNotes,
      this.children,
      this.profession,
      this.spouseName,
      this.manager,
      this.assistantName,
      this.department,
      this.officeLocation,
      this.companyName,
      this.businessHomePage,
      this.generation,
      this.nickName,
      this.middleName,
      this.fileAs,
      this.displayName,
      this.confidence,
      this.duplicateContacts,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates the last modified time
   */
  withUpdatedModified(): ContactMetadataImpl {
    return new ContactMetadataImpl(
      this.platform,
      this.contactId,
      this.creationTime,
      new Date(), // Update modified time
      new Date(), // Also update sync time
      this.isReadOnly,
      this.source,
      this.parentFolderId,
      this.folderName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.personalNotes,
      this.children,
      this.profession,
      this.spouseName,
      this.manager,
      this.assistantName,
      this.department,
      this.officeLocation,
      this.companyName,
      this.businessHomePage,
      this.generation,
      this.nickName,
      this.middleName,
      this.fileAs,
      this.displayName,
      this.confidence,
      this.duplicateContacts,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates business information
   */
  withBusinessInfo(businessInfo: {
    companyName?: string;
    department?: string;
    officeLocation?: string;
    profession?: string;
    manager?: string;
    assistantName?: string;
    businessHomePage?: string;
  }): ContactMetadataImpl {
    return new ContactMetadataImpl(
      this.platform,
      this.contactId,
      this.creationTime,
      new Date(), // Update modified time
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.parentFolderId,
      this.folderName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.personalNotes,
      this.children,
      businessInfo.profession ?? this.profession,
      this.spouseName,
      businessInfo.manager ?? this.manager,
      businessInfo.assistantName ?? this.assistantName,
      businessInfo.department ?? this.department,
      businessInfo.officeLocation ?? this.officeLocation,
      businessInfo.companyName ?? this.companyName,
      businessInfo.businessHomePage ?? this.businessHomePage,
      this.generation,
      this.nickName,
      this.middleName,
      this.fileAs,
      this.displayName,
      this.confidence,
      this.duplicateContacts,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates personal notes
   */
  withPersonalNotes(notes: string): ContactMetadataImpl {
    return new ContactMetadataImpl(
      this.platform,
      this.contactId,
      this.creationTime,
      new Date(), // Update modified time
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.parentFolderId,
      this.folderName,
      this.webLink,
      this.changeKey,
      this.etag,
      notes,
      this.children,
      this.profession,
      this.spouseName,
      this.manager,
      this.assistantName,
      this.department,
      this.officeLocation,
      this.companyName,
      this.businessHomePage,
      this.generation,
      this.nickName,
      this.middleName,
      this.fileAs,
      this.displayName,
      this.confidence,
      this.duplicateContacts,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates duplicate contacts list
   */
  withDuplicates(duplicateIds: string[]): ContactMetadataImpl {
    return new ContactMetadataImpl(
      this.platform,
      this.contactId,
      this.creationTime,
      this.lastModifiedTime,
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.parentFolderId,
      this.folderName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.personalNotes,
      this.children,
      this.profession,
      this.spouseName,
      this.manager,
      this.assistantName,
      this.department,
      this.officeLocation,
      this.companyName,
      this.businessHomePage,
      this.generation,
      this.nickName,
      this.middleName,
      this.fileAs,
      this.displayName,
      this.confidence,
      duplicateIds,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Adds custom property
   */
  withCustomProperty(key: string, value: any): ContactMetadataImpl {
    const newCustomProperties = {
      ...this.customProperties,
      [key]: value,
    };

    return new ContactMetadataImpl(
      this.platform,
      this.contactId,
      this.creationTime,
      this.lastModifiedTime,
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.parentFolderId,
      this.folderName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.personalNotes,
      this.children,
      this.profession,
      this.spouseName,
      this.manager,
      this.assistantName,
      this.department,
      this.officeLocation,
      this.companyName,
      this.businessHomePage,
      this.generation,
      this.nickName,
      this.middleName,
      this.fileAs,
      this.displayName,
      this.confidence,
      this.duplicateContacts,
      newCustomProperties,
      this.extensions
    );
  }

  /**
   * Gets specific extension data
   */
  getExtension(extensionName: string, id: string): Record<string, any> | undefined {
    return this.extensions?.find(ext => ext.extensionName === extensionName && ext.id === id)?.data;
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      platform: this.platform,
      contactId: this.contactId,
      parentFolderId: this.parentFolderId,
      folderName: this.folderName,
      webLink: this.webLink,
      changeKey: this.changeKey,
      etag: this.etag,
      personalNotes: this.personalNotes,
      children: this.children,
      profession: this.profession,
      spouseName: this.spouseName,
      manager: this.manager,
      assistantName: this.assistantName,
      department: this.department,
      officeLocation: this.officeLocation,
      companyName: this.companyName,
      businessHomePage: this.businessHomePage,
      generation: this.generation,
      nickName: this.nickName,
      middleName: this.middleName,
      fileAs: this.fileAs,
      displayName: this.displayName,
      creationTime: this.creationTime.toISOString(),
      lastModifiedTime: this.lastModifiedTime.toISOString(),
      lastSyncTime: this.lastSyncTime.toISOString(),
      isReadOnly: this.isReadOnly,
      source: this.source,
      confidence: this.confidence,
      confidenceLevel: this.confidenceLevel,
      duplicateContacts: this.duplicateContacts,
      duplicateCount: this.duplicateCount,
      hasPotentialDuplicates: this.hasPotentialDuplicates,
      timeSinceSync: this.timeSinceSync,
      isSyncStale: this.isSyncStale,
      timeSinceModified: this.timeSinceModified,
      isRecentlyModified: this.isRecentlyModified,
      isUserCreated: this.isUserCreated,
      isFromDirectory: this.isFromDirectory,
      isFromSocial: this.isFromSocial,
      hasBusinessInfo: this.hasBusinessInfo,
      hasPersonalInfo: this.hasPersonalInfo,
      customProperties: this.customProperties,
      extensions: this.extensions,
    };
  }

  /**
   * Creates metadata from JSON object
   */
  static fromJSON(json: any): ContactMetadataImpl {
    return new ContactMetadataImpl(
      json.platform,
      json.contactId,
      new Date(json.creationTime),
      new Date(json.lastModifiedTime),
      new Date(json.lastSyncTime),
      json.isReadOnly,
      json.source,
      json.parentFolderId,
      json.folderName,
      json.webLink,
      json.changeKey,
      json.etag,
      json.personalNotes,
      json.children,
      json.profession,
      json.spouseName,
      json.manager,
      json.assistantName,
      json.department,
      json.officeLocation,
      json.companyName,
      json.businessHomePage,
      json.generation,
      json.nickName,
      json.middleName,
      json.fileAs,
      json.displayName,
      json.confidence,
      json.duplicateContacts,
      json.customProperties,
      json.extensions
    );
  }
}
