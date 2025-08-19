import { UnifiedId } from '../value-objects/UnifiedId.js';
import { Platform } from '../value-objects/Platform.js';
import { NoteMetadata } from '../value-objects/NoteMetadata.js';

export interface Notebook {
  id: string;
  name: string;
  color?: string;
  isDefault: boolean;
  sectionGroups?: SectionGroup[];
  sections?: Section[];
}

export interface SectionGroup {
  id: string;
  name: string;
  notebookId: string;
  sections: Section[];
  parentSectionGroupId?: string;
}

export interface Section {
  id: string;
  name: string;
  notebookId: string;
  sectionGroupId?: string;
  pages?: Page[];
}

export interface Page {
  id: string;
  title: string;
  sectionId: string;
  level: number;
  parentPageId?: string;
  order: number;
  contentUrl?: string;
  contentPreview?: string;
  hasSubPages: boolean;
}

export interface NoteAttachment {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  downloadUrl?: string;
  thumbnailUrl?: string;
}

export interface NoteContent {
  htmlContent: string;
  textContent?: string;
  contentType: 'text/html' | 'text/plain';
  wordCount?: number;
  characterCount?: number;
  estimatedReadingTime?: number; // in minutes
}

export interface Note {
  readonly id: UnifiedId;
  readonly platformIds: Map<Platform, string>;
  readonly title: string;
  readonly content: NoteContent;
  readonly notebookId: string;
  readonly sectionId: string;
  readonly pageId?: string;
  readonly parentPageId?: string;
  readonly level: number;
  readonly order: number;
  readonly tags: string[];
  readonly attachments: NoteAttachment[];
  readonly isReadOnly: boolean;
  readonly hasSubPages: boolean;
  readonly contentUrl?: string;
  readonly webUrl?: string;
  readonly createdDateTime: Date;
  readonly lastModifiedDateTime: Date;
  readonly lastViewedDateTime?: Date;
  readonly metadata: NoteMetadata;
  
  // Computed properties
  readonly hasAttachments: boolean;
  readonly wordCount: number;
  readonly characterCount: number;
  readonly estimatedReadingTime: number;
  readonly isRootPage: boolean;
  readonly isSubPage: boolean;
  readonly isRecentlyModified: boolean;
  readonly isRecentlyViewed: boolean;
}

export class NoteEntity implements Note {
  constructor(
    public readonly id: UnifiedId,
    public readonly platformIds: Map<Platform, string>,
    public readonly title: string,
    public readonly content: NoteContent,
    public readonly notebookId: string,
    public readonly sectionId: string,
    public readonly level: number,
    public readonly order: number,
    public readonly tags: string[],
    public readonly attachments: NoteAttachment[],
    public readonly isReadOnly: boolean,
    public readonly hasSubPages: boolean,
    public readonly createdDateTime: Date,
    public readonly lastModifiedDateTime: Date,
    public readonly metadata: NoteMetadata,
    public readonly pageId?: string,
    public readonly parentPageId?: string,
    public readonly contentUrl?: string,
    public readonly webUrl?: string,
    public readonly lastViewedDateTime?: Date
  ) {
    // Validate level
    if (level < 0 || level > 3) {
      throw new Error('Note level must be between 0 and 3');
    }

    // Validate order
    if (order < 0) {
      throw new Error('Note order must be non-negative');
    }

    // Validate parent-child relationship
    if (parentPageId && level === 0) {
      throw new Error('Root level notes cannot have parent pages');
    }
  }

  /**
   * Checks if this is a root-level page
   */
  get isRootPage(): boolean {
    return this.level === 0 && !this.parentPageId;
  }

  /**
   * Checks if this is a sub-page
   */
  get isSubPage(): boolean {
    return this.level > 0 && this.parentPageId !== undefined;
  }

  /**
   * Checks if this note has attachments
   */
  get hasAttachments(): boolean {
    return this.attachments.length > 0;
  }

  /**
   * Gets the word count from content
   */
  get wordCount(): number {
    return this.content.wordCount || this.estimateWordCount();
  }

  /**
   * Gets the character count from content
   */
  get characterCount(): number {
    return this.content.characterCount || this.content.textContent?.length || 0;
  }

  /**
   * Gets estimated reading time in minutes
   */
  get estimatedReadingTime(): number {
    return this.content.estimatedReadingTime || Math.ceil(this.wordCount / 200); // 200 words per minute
  }

  /**
   * Checks if the note was recently modified (within last 24 hours)
   */
  get isRecentlyModified(): boolean {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.lastModifiedDateTime > twentyFourHoursAgo;
  }

  /**
   * Checks if the note was recently viewed (within last 7 days)
   */
  get isRecentlyViewed(): boolean {
    if (!this.lastViewedDateTime) return false;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return this.lastViewedDateTime > sevenDaysAgo;
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
   * Gets image attachments
   */
  get imageAttachments(): NoteAttachment[] {
    return this.attachments.filter(att => att.mimeType.startsWith('image/'));
  }

  /**
   * Gets document attachments
   */
  get documentAttachments(): NoteAttachment[] {
    return this.attachments.filter(att => 
      att.mimeType.includes('pdf') || 
      att.mimeType.includes('document') || 
      att.mimeType.includes('text') ||
      att.mimeType.includes('spreadsheet') ||
      att.mimeType.includes('presentation')
    );
  }

  /**
   * Gets the total size of all attachments in bytes
   */
  get totalAttachmentSize(): number {
    return this.attachments.reduce((total, att) => total + att.size, 0);
  }

  /**
   * Gets the total size of all attachments in human-readable format
   */
  get totalAttachmentSizeFormatted(): string {
    const bytes = this.totalAttachmentSize;
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  /**
   * Estimates word count from HTML content if not provided
   */
  private estimateWordCount(): number {
    if (!this.content.textContent && !this.content.htmlContent) return 0;
    
    const text = this.content.textContent || this.stripHtml(this.content.htmlContent);
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Strips HTML tags to get plain text
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
  }

  /**
   * Updates the note content
   */
  updateContent(newContent: NoteContent): NoteEntity {
    return new NoteEntity(
      this.id,
      this.platformIds,
      this.title,
      {
        ...newContent,
        wordCount: newContent.wordCount || this.estimateWordCountFromContent(newContent),
        characterCount: newContent.characterCount || newContent.textContent?.length || 0,
        estimatedReadingTime: newContent.estimatedReadingTime || Math.ceil((newContent.wordCount || this.estimateWordCountFromContent(newContent)) / 200)
      },
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      this.tags,
      this.attachments,
      this.isReadOnly,
      this.hasSubPages,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.pageId,
      this.parentPageId,
      this.contentUrl,
      this.webUrl,
      this.lastViewedDateTime
    );
  }

  /**
   * Updates the note title
   */
  updateTitle(newTitle: string): NoteEntity {
    return new NoteEntity(
      this.id,
      this.platformIds,
      newTitle,
      this.content,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      this.tags,
      this.attachments,
      this.isReadOnly,
      this.hasSubPages,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.pageId,
      this.parentPageId,
      this.contentUrl,
      this.webUrl,
      this.lastViewedDateTime
    );
  }

  /**
   * Adds tags to the note
   */
  addTags(newTags: string[]): NoteEntity {
    const updatedTags = [...new Set([...this.tags, ...newTags])];

    return new NoteEntity(
      this.id,
      this.platformIds,
      this.title,
      this.content,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      updatedTags,
      this.attachments,
      this.isReadOnly,
      this.hasSubPages,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.pageId,
      this.parentPageId,
      this.contentUrl,
      this.webUrl,
      this.lastViewedDateTime
    );
  }

  /**
   * Removes tags from the note
   */
  removeTags(tagsToRemove: string[]): NoteEntity {
    const updatedTags = this.tags.filter(tag => !tagsToRemove.includes(tag));

    return new NoteEntity(
      this.id,
      this.platformIds,
      this.title,
      this.content,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      updatedTags,
      this.attachments,
      this.isReadOnly,
      this.hasSubPages,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.pageId,
      this.parentPageId,
      this.contentUrl,
      this.webUrl,
      this.lastViewedDateTime
    );
  }

  /**
   * Adds an attachment to the note
   */
  addAttachment(attachment: NoteAttachment): NoteEntity {
    const updatedAttachments = [...this.attachments, attachment];

    return new NoteEntity(
      this.id,
      this.platformIds,
      this.title,
      this.content,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      this.tags,
      updatedAttachments,
      this.isReadOnly,
      this.hasSubPages,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.pageId,
      this.parentPageId,
      this.contentUrl,
      this.webUrl,
      this.lastViewedDateTime
    );
  }

  /**
   * Removes an attachment from the note
   */
  removeAttachment(attachmentId: string): NoteEntity {
    const updatedAttachments = this.attachments.filter(att => att.id !== attachmentId);

    return new NoteEntity(
      this.id,
      this.platformIds,
      this.title,
      this.content,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      this.tags,
      updatedAttachments,
      this.isReadOnly,
      this.hasSubPages,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.pageId,
      this.parentPageId,
      this.contentUrl,
      this.webUrl,
      this.lastViewedDateTime
    );
  }

  /**
   * Updates the last viewed time
   */
  markAsViewed(): NoteEntity {
    return new NoteEntity(
      this.id,
      this.platformIds,
      this.title,
      this.content,
      this.notebookId,
      this.sectionId,
      this.level,
      this.order,
      this.tags,
      this.attachments,
      this.isReadOnly,
      this.hasSubPages,
      this.createdDateTime,
      this.lastModifiedDateTime,
      this.metadata,
      this.pageId,
      this.parentPageId,
      this.contentUrl,
      this.webUrl,
      new Date() // Update lastViewedDateTime
    );
  }

  /**
   * Moves the note to a different section
   */
  moveToSection(newSectionId: string): NoteEntity {
    return new NoteEntity(
      this.id,
      this.platformIds,
      this.title,
      this.content,
      this.notebookId,
      newSectionId,
      this.level,
      this.order,
      this.tags,
      this.attachments,
      this.isReadOnly,
      this.hasSubPages,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.pageId,
      this.parentPageId,
      this.contentUrl,
      this.webUrl,
      this.lastViewedDateTime
    );
  }

  /**
   * Changes the note's order
   */
  changeOrder(newOrder: number): NoteEntity {
    if (newOrder < 0) {
      throw new Error('Note order must be non-negative');
    }

    return new NoteEntity(
      this.id,
      this.platformIds,
      this.title,
      this.content,
      this.notebookId,
      this.sectionId,
      this.level,
      newOrder,
      this.tags,
      this.attachments,
      this.isReadOnly,
      this.hasSubPages,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.pageId,
      this.parentPageId,
      this.contentUrl,
      this.webUrl,
      this.lastViewedDateTime
    );
  }

  /**
   * Helper method to estimate word count from content
   */
  private estimateWordCountFromContent(content: NoteContent): number {
    if (!content.textContent && !content.htmlContent) return 0;
    
    const text = content.textContent || this.stripHtml(content.htmlContent);
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id.toString(),
      platformIds: Object.fromEntries(this.platformIds),
      title: this.title,
      content: {
        ...this.content,
        wordCount: this.wordCount,
        characterCount: this.characterCount,
        estimatedReadingTime: this.estimatedReadingTime
      },
      notebookId: this.notebookId,
      sectionId: this.sectionId,
      pageId: this.pageId,
      parentPageId: this.parentPageId,
      level: this.level,
      levelDescription: this.levelDescription,
      order: this.order,
      tags: this.tags,
      attachments: this.attachments,
      isReadOnly: this.isReadOnly,
      hasSubPages: this.hasSubPages,
      hasAttachments: this.hasAttachments,
      contentUrl: this.contentUrl,
      webUrl: this.webUrl,
      createdDateTime: this.createdDateTime.toISOString(),
      lastModifiedDateTime: this.lastModifiedDateTime.toISOString(),
      lastViewedDateTime: this.lastViewedDateTime?.toISOString(),
      isRootPage: this.isRootPage,
      isSubPage: this.isSubPage,
      isRecentlyModified: this.isRecentlyModified,
      isRecentlyViewed: this.isRecentlyViewed,
      imageAttachments: this.imageAttachments.length,
      documentAttachments: this.documentAttachments.length,
      totalAttachmentSize: this.totalAttachmentSize,
      totalAttachmentSizeFormatted: this.totalAttachmentSizeFormatted,
      metadata: this.metadata,
    };
  }
}