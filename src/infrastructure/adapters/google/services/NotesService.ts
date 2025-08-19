import { Logger } from '../../../../shared/logging/Logger.js';
import { Note, NoteEntity, Notebook, Section, Page, NoteContent, NoteAttachment } from '../../../../domain/entities/Note.js';
import { PaginationInfo } from '../../../../domain/interfaces/PlatformPort.js';
import { GoogleClient } from '../clients/GoogleClient.js';
import { CacheManager } from '../cache/CacheManager.js';
import { ChromaDbInitializer } from '../cache/ChromaDbInitializer.js';
import { NotesMapper } from '../mappers/NotesMapper.js';
import { ErrorHandler } from '../errors/ErrorHandler.js';
import { ChromaClient } from 'chromadb';
import { GraphRequestOptions } from '../clients/GoogleClient.js';

/**
 * Note query options for searching
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
 * Create notebook input
 */
export interface CreateNotebookInput {
  name: string;
  color?: string;
  isDefault?: boolean;
}

/**
 * Create section input
 */
export interface CreateSectionInput {
  name: string;
  notebookId: string;
  sectionGroupId?: string;
}

/**
 * Create page input
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
 * Update note input
 */
export interface UpdateNoteInput {
  title?: string;
  content?: NoteContent;
  tags?: string[];
  order?: number;
}

/**
 * Microsoft Graph Notes Service
 * Implements note operations using Graph API (OneNote)
 */
export class NotesService {
  private readonly logger: Logger;
  private cacheManager: CacheManager | null = null;
  private chromaService: ChromaDbInitializer | null = null;
  private chromaClient: ChromaClient | null = null;
  private searchCollection: any = null;
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly graphClient: GoogleClient,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('NotesService');
  }

  /**
   * Initialize ChromaDB and cache
   */
  private async initializeServices(): Promise<void> {
    if (!this.chromaService) {
      this.chromaService = new ChromaDbInitializer('http://localhost:8000', this.logger);
      await this.chromaService.initialize();
      
      // Create notes search collection - use ChromaClient directly
      try {
        const chromaClient = new ChromaClient({ path: 'http://localhost:8000' });
        this.chromaClient = chromaClient;
        this.searchCollection = await chromaClient.getOrCreateCollection({
          name: 'notes-search-index',
          metadata: { 
            description: 'Semantic search index for notes',
            'hnsw:space': 'cosine'
          }
        });
        this.logger.info('Notes search collection initialized');
      } catch (error) {
        this.logger.error('Failed to initialize notes search collection', { error });
      }
    }

    if (!this.cacheManager) {
      this.cacheManager = new CacheManager(this.chromaService!, { defaultTtl: this.CACHE_TTL }, this.logger);
    }
  }

  /**
   * List all notebooks
   */
  async listNotebooks(): Promise<Notebook[]> {
    try {
      await this.initializeServices();

      // Check cache first
      const cacheKey = 'notebooks';
      const cached = await this.cacheManager?.get(cacheKey) as Notebook[] | undefined;
      if (cached) {
        this.logger.debug('Returning cached notebooks');
        return cached;
      }

      // Fetch from Graph API
      const params: Record<string, any> = {
        $select: 'id,displayName,color,isDefault,createdDateTime,lastModifiedDateTime',
        $orderby: 'displayName',
        $expand: 'sections($select=id,displayName)'
      };
      const response = await this.graphClient.get('/me/onenote/notebooks', params as GraphRequestOptions);

      const notebooks: Notebook[] = response.value.map((notebook: any) => 
        NotesMapper.fromGraphNotebook(notebook)
      );

      // Cache the result
      await this.cacheManager?.set(cacheKey, notebooks, '/me/onenote/notebooks', 'GET', this.CACHE_TTL);

      return notebooks;
    } catch (error) {
      this.logger.error('Failed to list notebooks', { error });
      throw error;
    }
  }

  /**
   * Get a specific notebook by ID
   */
  async getNotebook(notebookId: string): Promise<Notebook> {
    try {
      await this.initializeServices();

      // Check cache first
      const cacheKey = `notebook:${notebookId}`;
      const cached = await this.cacheManager?.get(cacheKey) as Notebook | undefined;
      if (cached) {
        this.logger.debug('Returning cached notebook', { notebookId });
        return cached;
      }

      const endpoint = `/me/onenote/notebooks/${notebookId}`;
      const params: Record<string, any> = {
        $select: 'id,displayName,color,isDefault,createdDateTime,lastModifiedDateTime',
        $expand: 'sections($select=id,displayName),sectionGroups($select=id,displayName)'
      };
      
      const response = await this.graphClient.get(endpoint, params as GraphRequestOptions);
      const notebook = NotesMapper.fromGraphNotebook(response);

      // Cache the result
      await this.cacheManager?.set(cacheKey, notebook, endpoint, 'GET', this.CACHE_TTL);

      return notebook;
    } catch (error) {
      this.logger.error('Failed to get notebook', { notebookId, error });
      throw error;
    }
  }

  /**
   * Create a new notebook
   */
  async createNotebook(data: CreateNotebookInput): Promise<Notebook> {
    try {
      await this.initializeServices();

      const endpoint = '/me/onenote/notebooks';
      const body = NotesMapper.toGraphNotebookForCreation(data);

      const response = await this.graphClient.post(endpoint, body);
      const notebook = NotesMapper.fromGraphNotebook(response);

      // Invalidate notebooks cache
      await this.cacheManager?.delete('notebooks');

      this.logger.info('Notebook created successfully', { notebookId: notebook.id });
      return notebook;
    } catch (error) {
      this.logger.error('Failed to create notebook', { error });
      throw error;
    }
  }

  /**
   * Delete a notebook
   */
  async deleteNotebook(notebookId: string): Promise<void> {
    try {
      await this.initializeServices();

      const endpoint = `/me/onenote/notebooks/${notebookId}`;
      await this.graphClient.delete(endpoint);

      // Remove from cache
      await this.cacheManager?.delete(`notebook:${notebookId}`);
      await this.cacheManager?.delete('notebooks');

      this.logger.info('Notebook deleted successfully', { notebookId });
    } catch (error) {
      this.logger.error('Failed to delete notebook', { notebookId, error });
      throw error;
    }
  }

  /**
   * List sections in a notebook
   */
  async listSections(notebookId: string): Promise<Section[]> {
    try {
      await this.initializeServices();

      // Check cache first
      const cacheKey = `sections:${notebookId}`;
      const cached = await this.cacheManager?.get(cacheKey) as Section[] | undefined;
      if (cached) {
        this.logger.debug('Returning cached sections', { notebookId });
        return cached;
      }

      const endpoint = `/me/onenote/notebooks/${notebookId}/sections`;
      const params: Record<string, any> = {
        $select: 'id,displayName,createdDateTime,lastModifiedDateTime',
        $orderby: 'displayName'
      };

      const response = await this.graphClient.get(endpoint, params);
      const sections: Section[] = response.value.map((section: any) => 
        NotesMapper.fromGraphSection(section, notebookId)
      );

      // Cache the result
      await this.cacheManager?.set(cacheKey, sections, endpoint, 'GET', this.CACHE_TTL);

      return sections;
    } catch (error) {
      this.logger.error('Failed to list sections', { notebookId, error });
      throw error;
    }
  }

  /**
   * Get a specific section by ID
   */
  async getSection(sectionId: string, notebookId?: string): Promise<Section> {
    try {
      await this.initializeServices();

      // Check cache first
      const cacheKey = `section:${sectionId}`;
      const cached = await this.cacheManager?.get(cacheKey) as Section | undefined;
      if (cached) {
        this.logger.debug('Returning cached section', { sectionId });
        return cached;
      }

      const endpoint = `/me/onenote/sections/${sectionId}`;
      const params: Record<string, any> = {
        $select: 'id,displayName,createdDateTime,lastModifiedDateTime,parentNotebook,parentSectionGroup',
        $expand: 'pages($select=id,title,level,order)'
      };

      const response = await this.graphClient.get(endpoint, params as GraphRequestOptions);
      const actualNotebookId = notebookId || response.parentNotebook?.id;
      const section = NotesMapper.fromGraphSection(response, actualNotebookId);

      // Cache the result
      await this.cacheManager?.set(cacheKey, section, endpoint, 'GET', this.CACHE_TTL);

      return section;
    } catch (error) {
      this.logger.error('Failed to get section', { sectionId, error });
      throw error;
    }
  }

  /**
   * Create a new section
   */
  async createSection(data: CreateSectionInput): Promise<Section> {
    try {
      await this.initializeServices();

      const endpoint = `/me/onenote/notebooks/${data.notebookId}/sections`;
      const body = NotesMapper.toGraphSectionForCreation(data);

      const response = await this.graphClient.post(endpoint, body);
      const section = NotesMapper.fromGraphSection(response, data.notebookId, data.sectionGroupId);

      // Invalidate sections cache
      await this.cacheManager?.delete(`sections:${data.notebookId}`);

      this.logger.info('Section created successfully', { sectionId: section.id, notebookId: data.notebookId });
      return section;
    } catch (error) {
      this.logger.error('Failed to create section', { error });
      throw error;
    }
  }

  /**
   * Delete a section
   */
  async deleteSection(sectionId: string, notebookId?: string): Promise<void> {
    try {
      await this.initializeServices();

      const endpoint = `/me/onenote/sections/${sectionId}`;
      await this.graphClient.delete(endpoint);

      // Remove from cache
      await this.cacheManager?.delete(`section:${sectionId}`);
      if (notebookId) {
        await this.cacheManager?.delete(`sections:${notebookId}`);
      }

      this.logger.info('Section deleted successfully', { sectionId });
    } catch (error) {
      this.logger.error('Failed to delete section', { sectionId, error });
      throw error;
    }
  }

  /**
   * List pages in a section
   */
  async listPages(sectionId: string, options?: NoteQueryOptions): Promise<NoteSearchResult> {
    try {
      await this.initializeServices();

      // Build query parameters
      const params: any = {
        $select: 'id,title,createdDateTime,lastModifiedDateTime,level,order,contentUrl,links',
        $top: options?.limit || 50,
        $skip: options?.skip || 0,
        $count: true
      };

      // Add filters
      const filters: string[] = [];
      if (options?.level !== undefined) {
        filters.push(`level eq ${options.level}`);
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

      // Add ordering
      if (options?.orderBy) {
        const direction = options.orderDirection === 'desc' ? ' desc' : '';
        params.$orderby = `${options.orderBy}${direction}`;
      } else {
        params.$orderby = 'order asc';
      }

      const endpoint = `/me/onenote/sections/${sectionId}/pages`;

      // Check cache for section metadata to get notebookId
      const section = await this.getSection(sectionId);
      const notebookId = section.notebookId;

      // Fetch from Graph API
      const response = await this.graphClient.get(endpoint, params);

      // Map to domain entities
      const notes = response.value.map((page: any) => {
        if (options?.includeContent) {
          return NotesMapper.fromGraphNote(page, sectionId, notebookId);
        } else {
          return NotesMapper.fromGraphNoteMetadata(page, sectionId, notebookId);
        }
      });

      // Index notes in ChromaDB for search
      if (this.searchCollection && notes.length > 0) {
        await this.indexNotesForSearch(notes);
      }

      return {
        notes,
        pagination: {
          total: response['@odata.count'] || notes.length,
          page: Math.floor((options?.skip || 0) / (options?.limit || 50)) + 1,
          pageSize: options?.limit || 50,
          hasNextPage: response['@odata.nextLink'] !== undefined,
          hasPreviousPage: (options?.skip || 0) > 0
        },
        totalCount: response['@odata.count'] || notes.length,
        nextPageToken: response['@odata.nextLink']
      };
    } catch (error) {
      this.logger.error('Failed to list pages', { sectionId, error });
      throw error;
    }
  }

  /**
   * Get a specific page by ID
   */
  async getPage(pageId: string, sectionId?: string, includeContent: boolean = true): Promise<Note> {
    try {
      await this.initializeServices();

      // Check cache first
      const cacheKey = `page:${pageId}:${includeContent ? 'full' : 'meta'}`;
      const cached = await this.cacheManager?.get(cacheKey) as Note | undefined;
      if (cached) {
        this.logger.debug('Returning cached page', { pageId });
        return cached;
      }

      const endpoint = `/me/onenote/pages/${pageId}`;
      const params: Record<string, any> = {
        $select: 'id,title,createdDateTime,lastModifiedDateTime,level,order,contentUrl,links,parentSection'
      };

      if (includeContent) {
        params.$expand = 'content';
      }

      const response = await this.graphClient.get(endpoint, params as GraphRequestOptions);
      
      // Get section and notebook info
      const actualSectionId = sectionId || response.parentSection?.id;
      if (!actualSectionId) {
        throw new Error(`Could not determine section ID for page ${pageId}`);
      }
      
      const section = await this.getSection(actualSectionId);
      const notebookId = section.notebookId;

      // Get full content if requested and not already included
      if (includeContent && !response.content) {
        const contentResponse = await this.graphClient.get(`${endpoint}/content`, {
          headers: { 'Accept': 'text/html' }
        });
        response.content = contentResponse;
      }

      const note = includeContent 
        ? NotesMapper.fromGraphNote(response, actualSectionId, notebookId)
        : NotesMapper.fromGraphNoteMetadata(response, actualSectionId, notebookId);

      // Cache the result
      await this.cacheManager?.set(cacheKey, note, endpoint, 'GET', this.CACHE_TTL);

      return note;
    } catch (error) {
      this.logger.error('Failed to get page', { pageId, error });
      throw error;
    }
  }

  /**
   * Create a new page
   */
  async createPage(data: CreatePageInput): Promise<Note> {
    try {
      await this.initializeServices();

      const endpoint = `/me/onenote/sections/${data.sectionId}/pages`;
      
      // OneNote requires HTML content for page creation
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>${data.title}</title>
          </head>
          <body>
            ${data.content.htmlContent || '<p></p>'}
          </body>
        </html>
      `;

      const response = await this.graphClient.post(endpoint, htmlContent, {
        headers: {
          'Content-Type': 'text/html'
        }
      });

      // Get the created page with full details
      const createdPageId = response.id;
      const note = await this.getPage(createdPageId, data.sectionId, true);

      // Index in ChromaDB
      if (this.searchCollection) {
        await this.indexNotesForSearch([note]);
      }

      // Invalidate section cache
      await this.cacheManager?.delete(`pages:${data.sectionId}`);

      this.logger.info('Page created successfully', { pageId: note.id.toString(), sectionId: data.sectionId });
      return note;
    } catch (error) {
      this.logger.error('Failed to create page', { error });
      throw error;
    }
  }

  /**
   * Update an existing page
   */
  async updatePage(pageId: string, updates: UpdateNoteInput, sectionId?: string): Promise<Note> {
    try {
      await this.initializeServices();

      // OneNote uses PATCH for content updates
      const endpoint = `/me/onenote/pages/${pageId}/content`;
      
      // Build PATCH operations for OneNote
      const patchOperations: any[] = [];

      if (updates.title) {
        patchOperations.push({
          target: 'title',
          action: 'replace',
          content: updates.title
        });
      }

      if (updates.content) {
        patchOperations.push({
          target: 'body',
          action: 'replace',
          content: updates.content.htmlContent
        });
      }

      if (patchOperations.length > 0) {
        await this.graphClient.patch(endpoint, patchOperations, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }

      // Get the updated page
      const note = await this.getPage(pageId, sectionId, true);

      // Update cache
      await this.cacheManager?.set(`page:${pageId}:full`, note, endpoint, 'PATCH', this.CACHE_TTL);

      // Re-index in ChromaDB
      if (this.searchCollection) {
        await this.indexNotesForSearch([note]);
      }

      this.logger.info('Page updated successfully', { pageId });
      return note;
    } catch (error) {
      this.logger.error('Failed to update page', { pageId, error });
      throw error;
    }
  }

  /**
   * Delete a page
   */
  async deletePage(pageId: string, sectionId?: string): Promise<void> {
    try {
      await this.initializeServices();

      const endpoint = `/me/onenote/pages/${pageId}`;
      await this.graphClient.delete(endpoint);

      // Remove from cache
      await this.cacheManager?.delete(`page:${pageId}:full`);
      await this.cacheManager?.delete(`page:${pageId}:meta`);

      // Remove from ChromaDB
      if (this.searchCollection) {
        try {
          await this.searchCollection.delete({
            ids: [pageId]
          });
        } catch (error) {
          this.logger.warn('Failed to remove page from search index', { pageId, error });
        }
      }

      this.logger.info('Page deleted successfully', { pageId });
    } catch (error) {
      this.logger.error('Failed to delete page', { pageId, error });
      throw error;
    }
  }

  /**
   * Search notes using semantic search
   */
  async searchNotes(query: string, options?: NoteQueryOptions): Promise<Note[]> {
    try {
      await this.initializeServices();

      if (!this.searchCollection) {
        // Fallback to Graph API search
        this.logger.warn('ChromaDB not available, using Graph API search');
        const endpoint = `/me/onenote/pages`;
        const params: any = {
          $search: `"${query}"`,
          $select: 'id,title,createdDateTime,lastModifiedDateTime,level,order,contentUrl,links,parentSection',
          $top: options?.limit || 25
        };

        const response = await this.graphClient.get(endpoint, params);
        
        // Need to resolve section/notebook info for each result
        const notes: Note[] = [];
        for (const page of response.value) {
          try {
            const sectionId = page.parentSection?.id;
            if (sectionId) {
              const section = await this.getSection(sectionId);
              const note = NotesMapper.fromGraphNoteMetadata(page, sectionId, section.notebookId);
              notes.push(note);
            }
          } catch (error) {
            this.logger.warn('Failed to process search result', { pageId: page.id, error });
          }
        }

        return notes;
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

      // Fetch full note details
      const notes: Note[] = [];
      for (const id of searchResults.ids[0]) {
        try {
          const metadata = searchResults.metadatas[0][searchResults.ids[0].indexOf(id)];
          const note = await this.getPage(id as string, metadata?.sectionId as string, false);
          notes.push(note);
        } catch (error) {
          this.logger.warn('Failed to fetch note from search result', { id, error });
        }
      }

      return notes;
    } catch (error) {
      this.logger.error('Failed to search notes', { query, error });
      throw error;
    }
  }

  /**
   * Get page content only
   */
  async getPageContent(pageId: string, sectionId?: string): Promise<NoteContent> {
    try {
      await this.initializeServices();

      const endpoint = `/me/onenote/pages/${pageId}/content`;
      const response = await this.graphClient.get(endpoint, {
        headers: { 'Accept': 'text/html' }
      });

      return NotesMapper['mapContent']({ content: response });
    } catch (error) {
      this.logger.error('Failed to get page content', { pageId, error });
      throw error;
    }
  }

  /**
   * Get recently modified notes
   */
  async getRecentlyModified(limit: number = 10): Promise<Note[]> {
    try {
      await this.initializeServices();

      const endpoint = '/me/onenote/pages';
      const params: any = {
        $select: 'id,title,createdDateTime,lastModifiedDateTime,level,order,contentUrl,links,parentSection',
        $orderby: 'lastModifiedDateTime desc',
        $top: limit
      };

      const response = await this.graphClient.get(endpoint, params);
      
      const notes: Note[] = [];
      for (const page of response.value) {
        try {
          const sectionId = page.parentSection?.id;
          if (sectionId) {
            const section = await this.getSection(sectionId);
            const note = NotesMapper.fromGraphNoteMetadata(page, sectionId, section.notebookId);
            notes.push(note);
          }
        } catch (error) {
          this.logger.warn('Failed to process recent note', { pageId: page.id, error });
        }
      }

      return notes;
    } catch (error) {
      this.logger.error('Failed to get recently modified notes', { error });
      throw error;
    }
  }

  /**
   * Index notes in ChromaDB for semantic search
   */
  private async indexNotesForSearch(notes: Note[]): Promise<void> {
    if (!this.searchCollection || notes.length === 0) return;

    try {
      const documents = notes.map(note => 
        `${note.title} ${note.content.textContent || ''} ${note.tags.join(' ')}`
      );

      const metadatas = notes.map(note => ({
        noteId: note.id.toString(),
        notebookId: note.notebookId,
        sectionId: note.sectionId,
        pageId: note.pageId || '',
        title: note.title,
        level: note.level,
        isReadOnly: note.isReadOnly,
        hasAttachments: note.hasAttachments,
        createdDate: note.createdDateTime.toISOString(),
        modifiedDate: note.lastModifiedDateTime.toISOString(),
        tags: note.tags.join(','),
        wordCount: note.wordCount,
        characterCount: note.characterCount
      }));

      const ids = notes.map(note => note.id.toString());

      await this.searchCollection.upsert({
        ids,
        documents,
        metadatas
      });

      this.logger.debug('Notes indexed for search', { count: notes.length });
    } catch (error) {
      this.logger.error('Failed to index notes for search', { error });
    }
  }

  /**
   * Build ChromaDB where clause from query options
   */
  private buildChromaWhereClause(options?: NoteQueryOptions): any {
    const where: any = {};

    if (options?.notebookId) {
      where.notebookId = options.notebookId;
    }
    if (options?.sectionId) {
      where.sectionId = options.sectionId;
    }
    if (options?.level !== undefined) {
      where.level = options.level;
    }
    if (options?.isReadOnly !== undefined) {
      where.isReadOnly = options.isReadOnly;
    }
    if (options?.hasAttachments !== undefined) {
      where.hasAttachments = options.hasAttachments;
    }

    return Object.keys(where).length > 0 ? where : undefined;
  }
}