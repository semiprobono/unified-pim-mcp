import { Note, Notebook, Section, Page, NoteContent } from '../entities/Note.js';
import { PaginationInfo } from '../interfaces/PlatformPort.js';

/**
 * Note query options for searching and filtering
 */
export interface NoteQueryOptions {
  notebookId?: string;
  sectionId?: string;
  parentPageId?: string;
  level?: number;
  tags?: string[];
  hasAttachments?: boolean;
  isReadOnly?: boolean;
  modifiedAfter?: Date;
  modifiedBefore?: Date;
  createdAfter?: Date;
  createdBefore?: Date;
  searchQuery?: string;
  includeContent?: boolean;
  includeAttachments?: boolean;
  limit?: number;
  skip?: number;
  orderBy?: 'title' | 'lastModifiedDateTime' | 'createdDateTime' | 'order';
  orderDirection?: 'asc' | 'desc';
}

/**
 * Note search result with pagination
 */
export interface NoteSearchResult {
  notes: Note[];
  pagination: PaginationInfo;
  totalCount: number;
  nextPageToken?: string;
}

/**
 * Notebook creation input
 */
export interface CreateNotebookInput {
  name: string;
  color?: string;
  isDefault?: boolean;
}

/**
 * Section creation input
 */
export interface CreateSectionInput {
  name: string;
  notebookId: string;
  sectionGroupId?: string;
}

/**
 * Page creation input
 */
export interface CreatePageInput {
  title: string;
  content: NoteContent;
  sectionId: string;
  parentPageId?: string;
  level?: number;
  order?: number;
  tags?: string[];
}

/**
 * Note update input
 */
export interface UpdateNoteInput {
  title?: string;
  content?: NoteContent;
  tags?: string[];
  order?: number;
}

/**
 * Repository interface for Note operations
 * Defines the contract for note data access across platforms
 */
export interface INoteRepository {
  // Notebook operations
  /**
   * List all notebooks
   */
  listNotebooks(): Promise<Notebook[]>;

  /**
   * Get a specific notebook by ID
   */
  getNotebook(notebookId: string): Promise<Notebook>;

  /**
   * Create a new notebook
   */
  createNotebook(data: CreateNotebookInput): Promise<Notebook>;

  /**
   * Delete a notebook
   */
  deleteNotebook(notebookId: string): Promise<void>;

  // Section operations
  /**
   * List sections in a notebook
   */
  listSections(notebookId: string): Promise<Section[]>;

  /**
   * Get a specific section by ID
   */
  getSection(sectionId: string, notebookId?: string): Promise<Section>;

  /**
   * Create a new section
   */
  createSection(data: CreateSectionInput): Promise<Section>;

  /**
   * Delete a section
   */
  deleteSection(sectionId: string, notebookId?: string): Promise<void>;

  // Page operations
  /**
   * List pages in a section
   */
  listPages(sectionId: string, options?: NoteQueryOptions): Promise<NoteSearchResult>;

  /**
   * Get a specific page by ID
   */
  getPage(pageId: string, sectionId?: string, includeContent?: boolean): Promise<Note>;

  /**
   * Create a new page
   */
  createPage(data: CreatePageInput): Promise<Note>;

  /**
   * Update an existing page
   */
  updatePage(pageId: string, updates: UpdateNoteInput, sectionId?: string): Promise<Note>;

  /**
   * Delete a page
   */
  deletePage(pageId: string, sectionId?: string): Promise<void>;

  // Search operations
  /**
   * Search notes across all notebooks
   */
  searchNotes(query: string, options?: NoteQueryOptions): Promise<Note[]>;

  /**
   * Search notes within a specific notebook
   */
  searchNotesInNotebook(notebookId: string, query: string, options?: NoteQueryOptions): Promise<Note[]>;

  /**
   * Search notes within a specific section
   */
  searchNotesInSection(sectionId: string, query: string, options?: NoteQueryOptions): Promise<Note[]>;

  // Hierarchical operations
  /**
   * Get sub-pages of a specific page
   */
  getSubPages(parentPageId: string, sectionId?: string): Promise<Note[]>;

  /**
   * Move a page to a different section
   */
  movePage(pageId: string, targetSectionId: string, newOrder?: number): Promise<Note>;

  /**
   * Copy a page to a different section
   */
  copyPage(pageId: string, targetSectionId: string, newTitle?: string): Promise<Note>;

  // Bulk operations
  /**
   * Get multiple pages by IDs
   */
  getPagesByIds(pageIds: string[], includeContent?: boolean): Promise<Note[]>;

  /**
   * Update multiple pages
   */
  updatePages(updates: Array<{ pageId: string; updates: UpdateNoteInput }>): Promise<Note[]>;

  /**
   * Delete multiple pages
   */
  deletePages(pageIds: string[]): Promise<void>;

  // Content operations
  /**
   * Get page content only (optimized for large content)
   */
  getPageContent(pageId: string, sectionId?: string): Promise<NoteContent>;

  /**
   * Update page content only
   */
  updatePageContent(pageId: string, content: NoteContent, sectionId?: string): Promise<Note>;

  // Metadata operations
  /**
   * Get page metadata without content
   */
  getPageMetadata(pageId: string, sectionId?: string): Promise<Omit<Note, 'content'>>;

  /**
   * Update page order within section
   */
  updatePageOrder(pageId: string, newOrder: number, sectionId?: string): Promise<Note>;

  // Tag operations
  /**
   * Get all unique tags across notes
   */
  getAllTags(): Promise<string[]>;

  /**
   * Get notes by tags
   */
  getNotesByTags(tags: string[], options?: NoteQueryOptions): Promise<Note[]>;

  /**
   * Add tags to a page
   */
  addTags(pageId: string, tags: string[], sectionId?: string): Promise<Note>;

  /**
   * Remove tags from a page
   */
  removeTags(pageId: string, tags: string[], sectionId?: string): Promise<Note>;

  // Recent operations
  /**
   * Get recently modified notes
   */
  getRecentlyModified(limit?: number): Promise<Note[]>;

  /**
   * Get recently viewed notes
   */
  getRecentlyViewed(limit?: number): Promise<Note[]>;

  /**
   * Mark a page as viewed
   */
  markPageAsViewed(pageId: string, sectionId?: string): Promise<Note>;
}