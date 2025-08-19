import { Note, NoteEntity, Notebook, Section, Page, NoteContent, NoteAttachment } from '../../../../domain/entities/Note.js';
import { UnifiedId } from '../../../../domain/value-objects/UnifiedId.js';
import { NoteMetadataImpl } from '../../../../domain/value-objects/NoteMetadata.js';

/**
 * Maps Microsoft Graph OneNote data to domain Note entities
 */
export class NotesMapper {
  /**
   * Map Microsoft Graph notebook to domain Notebook entity
   */
  static fromGraphNotebook(graphNotebook: any): Notebook {
    return {
      id: graphNotebook.id,
      name: graphNotebook.displayName || graphNotebook.name || 'Untitled Notebook',
      color: graphNotebook.color,
      isDefault: graphNotebook.isDefault || false,
      sectionGroups: graphNotebook.sectionGroups?.map((sg: any) => this.fromGraphSectionGroup(sg, graphNotebook.id)) || [],
      sections: graphNotebook.sections?.map((s: any) => this.fromGraphSection(s, graphNotebook.id)) || []
    };
  }

  /**
   * Map Microsoft Graph section group to domain SectionGroup entity
   */
  static fromGraphSectionGroup(graphSectionGroup: any, notebookId: string): any {
    return {
      id: graphSectionGroup.id,
      name: graphSectionGroup.displayName || graphSectionGroup.name || 'Untitled Section Group',
      notebookId,
      sections: graphSectionGroup.sections?.map((s: any) => this.fromGraphSection(s, notebookId, graphSectionGroup.id)) || [],
      parentSectionGroupId: graphSectionGroup.parentSectionGroup?.id
    };
  }

  /**
   * Map Microsoft Graph section to domain Section entity
   */
  static fromGraphSection(graphSection: any, notebookId: string, sectionGroupId?: string): Section {
    return {
      id: graphSection.id,
      name: graphSection.displayName || graphSection.name || 'Untitled Section',
      notebookId,
      sectionGroupId,
      pages: graphSection.pages?.map((p: any) => this.fromGraphPage(p, graphSection.id)) || []
    };
  }

  /**
   * Map Microsoft Graph page to domain Page entity
   */
  static fromGraphPage(graphPage: any, sectionId: string): Page {
    return {
      id: graphPage.id,
      title: graphPage.title || 'Untitled Page',
      sectionId,
      level: graphPage.level || 0,
      parentPageId: graphPage.parentSection?.id,
      order: graphPage.order || 0,
      contentUrl: graphPage.contentUrl,
      contentPreview: this.extractContentPreview(graphPage.content),
      hasSubPages: (graphPage.pages && graphPage.pages.length > 0) || false
    };
  }

  /**
   * Map Microsoft Graph page to domain Note entity
   */
  static fromGraphNote(graphPage: any, sectionId: string, notebookId: string): Note {
    // Create unified ID
    const unifiedId = UnifiedId.create('microsoft', 'note');
    const platformIds = new Map();
    platformIds.set('microsoft', graphPage.id);

    // Map content
    const content = this.mapContent(graphPage);

    // Map attachments
    const attachments = this.mapAttachments(graphPage);

    // Map tags (OneNote uses 'tags' property)
    const tags = graphPage.tags || [];

    // Map dates
    const createdDateTime = graphPage.createdDateTime 
      ? new Date(graphPage.createdDateTime)
      : new Date();

    const lastModifiedDateTime = graphPage.lastModifiedDateTime
      ? new Date(graphPage.lastModifiedDateTime)
      : new Date();

    const lastViewedDateTime = graphPage.lastViewedDateTime
      ? new Date(graphPage.lastViewedDateTime)
      : undefined;

    // Determine level and parent page
    const level = graphPage.level || 0;
    const parentPageId = level > 0 ? graphPage.parentSection?.id : undefined;
    const order = graphPage.order || 0;

    // Create metadata
    const metadata = NoteMetadataImpl.createMinimal(
      'microsoft',
      graphPage.id,
      notebookId,
      sectionId,
      level,
      order,
      'user'
    );

    // Check if read-only
    const isReadOnly = graphPage.isReadOnly || false;

    // Check if has sub-pages
    const hasSubPages = (graphPage.pages && graphPage.pages.length > 0) || false;

    // Create note entity
    return new NoteEntity(
      unifiedId,
      platformIds,
      graphPage.title || 'Untitled Page',
      content,
      notebookId,
      sectionId,
      level,
      order,
      tags,
      attachments,
      isReadOnly,
      hasSubPages,
      createdDateTime,
      lastModifiedDateTime,
      metadata,
      graphPage.id, // pageId
      parentPageId,
      graphPage.contentUrl,
      graphPage.links?.oneNoteWebUrl?.href || graphPage.webUrl,
      lastViewedDateTime
    );
  }

  /**
   * Map content from Graph page
   */
  private static mapContent(graphPage: any): NoteContent {
    const htmlContent = graphPage.content || '';
    const textContent = this.stripHtml(htmlContent);
    const wordCount = this.countWords(textContent);
    const characterCount = textContent.length;
    const estimatedReadingTime = Math.ceil(wordCount / 200); // 200 words per minute

    return {
      htmlContent,
      textContent,
      contentType: 'text/html' as const,
      wordCount,
      characterCount,
      estimatedReadingTime
    };
  }

  /**
   * Map attachments from Graph page
   */
  private static mapAttachments(graphPage: any): NoteAttachment[] {
    if (!graphPage.attachments) return [];

    return graphPage.attachments.map((att: any) => ({
      id: att.id,
      name: att.name || att.displayName || 'Untitled Attachment',
      mimeType: att.contentType || 'application/octet-stream',
      size: att.size || 0,
      downloadUrl: att.sourceUrl || att.downloadUrl,
      thumbnailUrl: att.thumbnailUrl
    }));
  }

  /**
   * Extract content preview from full content
   */
  private static extractContentPreview(content: string, maxLength: number = 200): string {
    if (!content) return '';
    
    const textContent = this.stripHtml(content);
    if (textContent.length <= maxLength) return textContent;
    
    return textContent.substring(0, maxLength).trim() + '...';
  }

  /**
   * Strip HTML tags to get plain text
   */
  private static stripHtml(html: string): string {
    if (!html) return '';
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&[^;]+;/g, ' ') // Replace HTML entities with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Count words in text
   */
  private static countWords(text: string): number {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Map domain Note entity to Graph API format for creation
   */
  static toGraphPageForCreation(note: Note): any {
    return {
      title: note.title,
      content: note.content.htmlContent,
      tags: note.tags,
      level: note.level,
      order: note.order
    };
  }

  /**
   * Map domain Note entity to Graph API format for updates
   */
  static toGraphPageForUpdate(updates: {
    title?: string;
    content?: NoteContent;
    tags?: string[];
    order?: number;
  }): any {
    const body: any = {};

    if (updates.title !== undefined) {
      body.title = updates.title;
    }

    if (updates.content !== undefined) {
      body.content = updates.content.htmlContent;
    }

    if (updates.tags !== undefined) {
      body.tags = updates.tags;
    }

    if (updates.order !== undefined) {
      body.order = updates.order;
    }

    return body;
  }

  /**
   * Map domain Notebook creation input to Graph API format
   */
  static toGraphNotebookForCreation(input: {
    name: string;
    color?: string;
    isDefault?: boolean;
  }): any {
    return {
      displayName: input.name,
      color: input.color,
      isDefault: input.isDefault || false
    };
  }

  /**
   * Map domain Section creation input to Graph API format
   */
  static toGraphSectionForCreation(input: {
    name: string;
    notebookId: string;
    sectionGroupId?: string;
  }): any {
    return {
      displayName: input.name
    };
  }

  /**
   * Map OneNote search results to domain entities
   */
  static fromGraphSearchResults(searchResults: any, notebookId: string, sectionId: string): Note[] {
    if (!searchResults.value || !Array.isArray(searchResults.value)) {
      return [];
    }

    return searchResults.value.map((result: any) => 
      this.fromGraphNote(result, sectionId, notebookId)
    );
  }

  /**
   * Create a minimal Note entity for list operations (without full content)
   */
  static fromGraphNoteMetadata(graphPage: any, sectionId: string, notebookId: string): Note {
    // Create unified ID
    const unifiedId = UnifiedId.create('microsoft', 'note');
    const platformIds = new Map();
    platformIds.set('microsoft', graphPage.id);

    // Create minimal content
    const content: NoteContent = {
      htmlContent: '', // Empty for metadata-only
      textContent: graphPage.title || '',
      contentType: 'text/html' as const,
      wordCount: 0,
      characterCount: 0,
      estimatedReadingTime: 0
    };

    // Map basic properties
    const level = graphPage.level || 0;
    const order = graphPage.order || 0;
    const tags = graphPage.tags || [];
    const attachments: NoteAttachment[] = [];

    // Map dates
    const createdDateTime = graphPage.createdDateTime 
      ? new Date(graphPage.createdDateTime)
      : new Date();

    const lastModifiedDateTime = graphPage.lastModifiedDateTime
      ? new Date(graphPage.lastModifiedDateTime)
      : new Date();

    // Create metadata
    const metadata = NoteMetadataImpl.createMinimal(
      'microsoft',
      graphPage.id,
      notebookId,
      sectionId,
      level,
      order,
      'user'
    );

    // Create note entity with minimal data
    return new NoteEntity(
      unifiedId,
      platformIds,
      graphPage.title || 'Untitled Page',
      content,
      notebookId,
      sectionId,
      level,
      order,
      tags,
      attachments,
      graphPage.isReadOnly || false,
      (graphPage.pages && graphPage.pages.length > 0) || false,
      createdDateTime,
      lastModifiedDateTime,
      metadata,
      graphPage.id,
      level > 0 ? graphPage.parentSection?.id : undefined,
      graphPage.contentUrl,
      graphPage.links?.oneNoteWebUrl?.href || graphPage.webUrl
    );
  }

  /**
   * Validate OneNote API response structure
   */
  static validateGraphResponse(response: any, operation: string): boolean {
    if (!response) {
      throw new Error(`Invalid OneNote API response for ${operation}: Response is null or undefined`);
    }

    // Validate based on operation type
    switch (operation) {
      case 'notebook':
        if (!response.id || !response.displayName) {
          throw new Error(`Invalid notebook response: Missing required fields (id, displayName)`);
        }
        break;
      
      case 'section':
        if (!response.id || !response.displayName) {
          throw new Error(`Invalid section response: Missing required fields (id, displayName)`);
        }
        break;
      
      case 'page':
        if (!response.id || !response.title) {
          throw new Error(`Invalid page response: Missing required fields (id, title)`);
        }
        break;
      
      case 'search':
        if (!response.value || !Array.isArray(response.value)) {
          throw new Error(`Invalid search response: Missing or invalid 'value' array`);
        }
        break;
      
      default:
        // Basic validation for unknown operations
        if (!response.id) {
          throw new Error(`Invalid OneNote API response for ${operation}: Missing 'id' field`);
        }
    }

    return true;
  }

  /**
   * Extract error information from Graph API error response
   */
  static extractErrorInfo(error: any): { code: string; message: string; details?: any } {
    if (error?.response?.data?.error) {
      const graphError = error.response.data.error;
      return {
        code: graphError.code || 'UnknownError',
        message: graphError.message || 'An unknown error occurred',
        details: graphError.details || graphError.innerError
      };
    }

    if (error?.message) {
      return {
        code: error.code || 'UnknownError',
        message: error.message
      };
    }

    return {
      code: 'UnknownError',
      message: 'An unknown error occurred while processing OneNote data'
    };
  }

  /**
   * Build OData query parameters for OneNote API
   */
  static buildODataQuery(options: {
    select?: string[];
    filter?: string[];
    orderBy?: string;
    orderDirection?: 'asc' | 'desc';
    top?: number;
    skip?: number;
    expand?: string[];
    search?: string;
  }): Record<string, any> {
    const params: Record<string, any> = {};

    if (options.select && options.select.length > 0) {
      params.$select = options.select.join(',');
    }

    if (options.filter && options.filter.length > 0) {
      params.$filter = options.filter.join(' and ');
    }

    if (options.orderBy) {
      const direction = options.orderDirection === 'desc' ? ' desc' : '';
      params.$orderby = `${options.orderBy}${direction}`;
    }

    if (options.top !== undefined) {
      params.$top = options.top;
    }

    if (options.skip !== undefined) {
      params.$skip = options.skip;
    }

    if (options.expand && options.expand.length > 0) {
      params.$expand = options.expand.join(',');
    }

    if (options.search) {
      params.$search = `"${options.search}"`;
    }

    return params;
  }
}