import { describe, expect, it } from '@jest/globals';
import { NotesMapper } from '../../../../../src/infrastructure/adapters/microsoft/mappers/NotesMapper';
import { Note, Notebook, Section, NoteContent } from '../../../../../src/domain/entities/Note';

describe('NotesMapper', () => {
  describe('fromGraphNotebook', () => {
    it('should map basic Graph notebook to domain Notebook', () => {
      const graphNotebook = {
        id: 'notebook-123',
        displayName: 'Work Notes',
        color: 'blue',
        isDefault: true,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z',
        sections: [] as any[],
        sectionGroups: [] as any[] as any[]
      };

      const result = NotesMapper.fromGraphNotebook(graphNotebook);

      expect(result).toBeDefined();
      expect(result.id).toBe('notebook-123');
      expect(result.name).toBe('Work Notes');
      expect(result.color).toBe('blue');
      expect(result.isDefault).toBe(true);
      expect(result.sections).toEqual([]);
      expect(result.sectionGroups).toEqual([]);
    });

    it('should handle notebook with sections', () => {
      const graphNotebook = {
        id: 'notebook-456',
        displayName: 'Personal Notes',
        isDefault: false,
        sections: [
          {
            id: 'section-1',
            displayName: 'Meeting Notes'
          },
          {
            id: 'section-2',
            displayName: 'Ideas'
          }
        ],
        sectionGroups: [] as any[]
      };

      const result = NotesMapper.fromGraphNotebook(graphNotebook);

      expect(result.name).toBe('Personal Notes');
      expect(result.isDefault).toBe(false);
      expect(result.sections).toHaveLength(2);
      expect(result.sections?.[0].name).toBe('Meeting Notes');
      expect(result.sections?.[1].name).toBe('Ideas');
    });

    it('should handle missing displayName with fallback', () => {
      const graphNotebook = {
        id: 'notebook-789',
        name: 'Legacy Name',
        isDefault: false
      };

      const result = NotesMapper.fromGraphNotebook(graphNotebook);

      expect(result.name).toBe('Legacy Name');
    });

    it('should handle completely missing name with fallback', () => {
      const graphNotebook = {
        id: 'notebook-unnamed',
        isDefault: false
      };

      const result = NotesMapper.fromGraphNotebook(graphNotebook);

      expect(result.name).toBe('Untitled Notebook');
    });
  });

  describe('fromGraphSection', () => {
    it('should map basic Graph section to domain Section', () => {
      const graphSection = {
        id: 'section-123',
        displayName: 'Meeting Notes',
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z',
        pages: [] as any[]
      };

      const result = NotesMapper.fromGraphSection(graphSection, 'notebook-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('section-123');
      expect(result.name).toBe('Meeting Notes');
      expect(result.notebookId).toBe('notebook-123');
      expect(result.pages).toEqual([]);
    });

    it('should handle section with pages', () => {
      const graphSection = {
        id: 'section-456',
        displayName: 'Project Plans',
        pages: [
          {
            id: 'page-1',
            title: 'Q1 Planning',
            level: 0,
            order: 0
          },
          {
            id: 'page-2',
            title: 'Resource Allocation',
            level: 1,
            order: 1
          }
        ]
      };

      const result = NotesMapper.fromGraphSection(graphSection, 'notebook-456', 'group-123');

      expect(result.name).toBe('Project Plans');
      expect(result.notebookId).toBe('notebook-456');
      expect(result.sectionGroupId).toBe('group-123');
      expect(result.pages).toHaveLength(2);
      expect(result.pages?.[0].title).toBe('Q1 Planning');
      expect(result.pages?.[1].title).toBe('Resource Allocation');
    });
  });

  describe('fromGraphPage', () => {
    it('should map basic Graph page to domain Page', () => {
      const graphPage = {
        id: 'page-123',
        title: 'Meeting Notes 2024-01-01',
        level: 0,
        order: 0,
        contentUrl: 'https://graph.microsoft.com/v1.0/pages/page-123/content',
        content: '<html><body><p>Meeting content</p></body></html>'
      };

      const result = NotesMapper.fromGraphPage(graphPage, 'section-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('page-123');
      expect(result.title).toBe('Meeting Notes 2024-01-01');
      expect(result.sectionId).toBe('section-123');
      expect(result.level).toBe(0);
      expect(result.order).toBe(0);
      expect(result.contentUrl).toBe('https://graph.microsoft.com/v1.0/pages/page-123/content');
      expect(result.hasSubPages).toBe(false);
    });

    it('should handle page with sub-pages', () => {
      const graphPage = {
        id: 'page-parent',
        title: 'Parent Page',
        level: 0,
        order: 0,
        pages: [
          { id: 'subpage-1', title: 'Sub Page 1' },
          { id: 'subpage-2', title: 'Sub Page 2' }
        ]
      };

      const result = NotesMapper.fromGraphPage(graphPage, 'section-456');

      expect(result.title).toBe('Parent Page');
      expect(result.hasSubPages).toBe(true);
    });

    it('should handle missing title with fallback', () => {
      const graphPage = {
        id: 'page-untitled',
        level: 0,
        order: 0
      };

      const result = NotesMapper.fromGraphPage(graphPage, 'section-789');

      expect(result.title).toBe('Untitled Page');
    });
  });

  describe('fromGraphNote', () => {
    it('should map complete Graph page to domain Note entity', () => {
      const graphPage = {
        id: 'page-note-123',
        title: 'Important Meeting',
        content: '<html><body><h1>Meeting Notes</h1><p>Discussion points</p></body></html>',
        level: 0,
        order: 0,
        tags: ['work', 'meeting', 'important'],
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z',
        lastViewedDateTime: '2024-01-01T14:00:00Z',
        contentUrl: 'https://graph.microsoft.com/content',
        links: {
          oneNoteWebUrl: {
            href: 'https://onenote.com/page'
          }
        },
        isReadOnly: false,
        attachments: [] as any[]
      };

      const result = NotesMapper.fromGraphNote(graphPage, 'section-123', 'notebook-456');

      expect(result).toBeDefined();
      expect(result.title).toBe('Important Meeting');
      expect(result.notebookId).toBe('notebook-456');
      expect(result.sectionId).toBe('section-123');
      expect(result.level).toBe(0);
      expect(result.order).toBe(0);
      expect(result.tags).toEqual(['work', 'meeting', 'important']);
      expect(result.createdDateTime).toEqual(new Date('2024-01-01T10:00:00Z'));
      expect(result.lastModifiedDateTime).toEqual(new Date('2024-01-01T12:00:00Z'));
      expect(result.lastViewedDateTime).toEqual(new Date('2024-01-01T14:00:00Z'));
      expect(result.contentUrl).toBe('https://graph.microsoft.com/content');
      expect(result.webUrl).toBe('https://onenote.com/page');
      expect(result.isReadOnly).toBe(false);
      expect(result.hasSubPages).toBe(false);
      
      // Check content mapping
      expect(result.content.htmlContent).toContain('<h1>Meeting Notes</h1>');
      expect(result.content.textContent).toContain('Meeting Notes');
      expect(result.content.contentType).toBe('text/html');
      expect(result.content.wordCount).toBeGreaterThan(0);
      expect(result.content.characterCount).toBeGreaterThan(0);
      expect(result.content.estimatedReadingTime).toBeGreaterThan(0);
    });

    it('should handle page with attachments', () => {
      const graphPage = {
        id: 'page-with-attachments',
        title: 'Page with Files',
        content: '<html><body><p>See attached files</p></body></html>',
        level: 0,
        order: 0,
        attachments: [
          {
            id: 'attachment-1',
            name: 'document.pdf',
            contentType: 'application/pdf',
            size: 102400,
            sourceUrl: 'https://graph.microsoft.com/attachment-1'
          },
          {
            id: 'attachment-2',
            displayName: 'image.jpg',
            contentType: 'image/jpeg',
            size: 51200,
            thumbnailUrl: 'https://graph.microsoft.com/thumbnail-2'
          }
        ],
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z'
      };

      const result = NotesMapper.fromGraphNote(graphPage, 'section-789', 'notebook-101');

      expect(result.attachments).toHaveLength(2);
      expect(result.attachments[0].id).toBe('attachment-1');
      expect(result.attachments[0].name).toBe('document.pdf');
      expect(result.attachments[0].mimeType).toBe('application/pdf');
      expect(result.attachments[0].size).toBe(102400);
      expect(result.attachments[0].downloadUrl).toBe('https://graph.microsoft.com/attachment-1');
      
      expect(result.attachments[1].id).toBe('attachment-2');
      expect(result.attachments[1].name).toBe('image.jpg');
      expect(result.attachments[1].mimeType).toBe('image/jpeg');
      expect(result.attachments[1].thumbnailUrl).toBe('https://graph.microsoft.com/thumbnail-2');
    });

    it('should handle sub-page with parent reference', () => {
      const graphPage = {
        id: 'subpage-123',
        title: 'Sub Page',
        content: '<html><body><p>Sub content</p></body></html>',
        level: 1,
        order: 1,
        parentSection: {
          id: 'parent-page-456'
        },
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z'
      };

      const result = NotesMapper.fromGraphNote(graphPage, 'section-123', 'notebook-456');

      expect(result.level).toBe(1);
      expect(result.parentPageId).toBe('parent-page-456');
      expect(result.isSubPage).toBe(true);
      expect(result.isRootPage).toBe(false);
    });

    it('should handle missing content gracefully', () => {
      const graphPage = {
        id: 'empty-page',
        title: 'Empty Page',
        level: 0,
        order: 0,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z'
      };

      const result = NotesMapper.fromGraphNote(graphPage, 'section-123', 'notebook-456');

      expect(result.content.htmlContent).toBe('');
      expect(result.content.textContent).toBe('');
      expect(result.content.wordCount).toBe(0);
      expect(result.content.characterCount).toBe(0);
      expect(result.content.estimatedReadingTime).toBe(0);
    });
  });

  describe('toGraphPageForCreation', () => {
    it('should map domain Note to Graph API creation format', () => {
      const mockNote = {
        title: 'New Page',
        content: {
          htmlContent: '<html><body><p>New content</p></body></html>',
          textContent: 'New content',
          contentType: 'text/html' as const
        },
        level: 0,
        order: 0,
        tags: ['new', 'test']
      } as any;

      const result = NotesMapper.toGraphPageForCreation(mockNote);

      expect(result).toEqual({
        title: 'New Page',
        content: '<html><body><p>New content</p></body></html>',
        tags: ['new', 'test'],
        level: 0,
        order: 0
      });
    });
  });

  describe('toGraphPageForUpdate', () => {
    it('should map update input to Graph API update format', () => {
      const updateInput = {
        title: 'Updated Title',
        content: {
          htmlContent: '<html><body><p>Updated content</p></body></html>',
          textContent: 'Updated content',
          contentType: 'text/html' as const
        },
        tags: ['updated'],
        order: 5
      };

      const result = NotesMapper.toGraphPageForUpdate(updateInput);

      expect(result).toEqual({
        title: 'Updated Title',
        content: '<html><body><p>Updated content</p></body></html>',
        tags: ['updated'],
        order: 5
      });
    });

    it('should handle partial updates', () => {
      const updateInput = {
        title: 'Only Title Update'
      };

      const result = NotesMapper.toGraphPageForUpdate(updateInput);

      expect(result).toEqual({
        title: 'Only Title Update'
      });
    });
  });

  describe('toGraphNotebookForCreation', () => {
    it('should map notebook creation input to Graph API format', () => {
      const input = {
        name: 'New Notebook',
        color: 'purple',
        isDefault: true
      };

      const result = NotesMapper.toGraphNotebookForCreation(input);

      expect(result).toEqual({
        displayName: 'New Notebook',
        color: 'purple',
        isDefault: true
      });
    });

    it('should handle minimal notebook creation', () => {
      const input = {
        name: 'Simple Notebook'
      };

      const result = NotesMapper.toGraphNotebookForCreation(input);

      expect(result).toEqual({
        displayName: 'Simple Notebook',
        color: undefined,
        isDefault: false
      });
    });
  });

  describe('toGraphSectionForCreation', () => {
    it('should map section creation input to Graph API format', () => {
      const input = {
        name: 'New Section',
        notebookId: 'notebook-123',
        sectionGroupId: 'group-456'
      };

      const result = NotesMapper.toGraphSectionForCreation(input);

      expect(result).toEqual({
        displayName: 'New Section'
      });
    });
  });

  describe('fromGraphSearchResults', () => {
    it('should map search results to domain Note entities', () => {
      const searchResults = {
        value: [
          {
            id: 'search-result-1',
            title: 'Search Hit 1',
            content: '<p>Search content 1</p>',
            level: 0,
            order: 0,
            createdDateTime: '2024-01-01T10:00:00Z',
            lastModifiedDateTime: '2024-01-01T12:00:00Z'
          },
          {
            id: 'search-result-2',
            title: 'Search Hit 2',
            content: '<p>Search content 2</p>',
            level: 1,
            order: 1,
            createdDateTime: '2024-01-02T10:00:00Z',
            lastModifiedDateTime: '2024-01-02T12:00:00Z'
          }
        ]
      };

      const result = NotesMapper.fromGraphSearchResults(searchResults, 'notebook-123', 'section-456');

      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Search Hit 1');
      expect(result[0].notebookId).toBe('notebook-123');
      expect(result[0].sectionId).toBe('section-456');
      expect(result[1].title).toBe('Search Hit 2');
      expect(result[1].level).toBe(1);
    });

    it('should handle empty search results', () => {
      const searchResults = {
        value: [] as any[]
      };

      const result = NotesMapper.fromGraphSearchResults(searchResults, 'notebook-123', 'section-456');

      expect(result).toHaveLength(0);
    });

    it('should handle invalid search results', () => {
      const searchResults = {};

      const result = NotesMapper.fromGraphSearchResults(searchResults, 'notebook-123', 'section-456');

      expect(result).toHaveLength(0);
    });
  });

  describe('fromGraphNoteMetadata', () => {
    it('should create minimal Note entity for list operations', () => {
      const graphPage = {
        id: 'metadata-page',
        title: 'Metadata Only Page',
        level: 1,
        order: 2,
        tags: ['metadata'],
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z',
        isReadOnly: true,
        pages: [] as any[]
      };

      const result = NotesMapper.fromGraphNoteMetadata(graphPage, 'section-123', 'notebook-456');

      expect(result.title).toBe('Metadata Only Page');
      expect(result.level).toBe(1);
      expect(result.order).toBe(2);
      expect(result.tags).toEqual(['metadata']);
      expect(result.isReadOnly).toBe(true);
      expect(result.hasSubPages).toBe(false);
      
      // Content should be minimal
      expect(result.content.htmlContent).toBe('');
      expect(result.content.textContent).toBe('Metadata Only Page');
      expect(result.content.wordCount).toBe(0);
      expect(result.content.characterCount).toBe(0);
    });
  });

  describe('validateGraphResponse', () => {
    it('should validate notebook response successfully', () => {
      const response = {
        id: 'notebook-123',
        displayName: 'Valid Notebook'
      };

      expect(() => NotesMapper.validateGraphResponse(response, 'notebook')).not.toThrow();
    });

    it('should validate section response successfully', () => {
      const response = {
        id: 'section-123',
        displayName: 'Valid Section'
      };

      expect(() => NotesMapper.validateGraphResponse(response, 'section')).not.toThrow();
    });

    it('should validate page response successfully', () => {
      const response = {
        id: 'page-123',
        title: 'Valid Page'
      };

      expect(() => NotesMapper.validateGraphResponse(response, 'page')).not.toThrow();
    });

    it('should validate search response successfully', () => {
      const response = {
        value: [
          { id: 'result-1', title: 'Result 1' }
        ]
      };

      expect(() => NotesMapper.validateGraphResponse(response, 'search')).not.toThrow();
    });

    it('should throw error for invalid notebook response', () => {
      const response = {
        id: 'notebook-123'
        // Missing displayName
      };

      expect(() => NotesMapper.validateGraphResponse(response, 'notebook')).toThrow('Invalid notebook response');
    });

    it('should throw error for invalid search response', () => {
      const response = {
        // Missing value array
      };

      expect(() => NotesMapper.validateGraphResponse(response, 'search')).toThrow('Invalid search response');
    });

    it('should throw error for null response', () => {
      expect(() => NotesMapper.validateGraphResponse(null, 'notebook')).toThrow('Response is null or undefined');
    });
  });

  describe('extractErrorInfo', () => {
    it('should extract error info from Graph API error response', () => {
      const error = {
        response: {
          data: {
            error: {
              code: 'NotFound',
              message: 'The specified object was not found',
              details: ['Additional error details']
            }
          }
        }
      };

      const result = NotesMapper.extractErrorInfo(error);

      expect(result.code).toBe('NotFound');
      expect(result.message).toBe('The specified object was not found');
      expect(result.details).toEqual(['Additional error details']);
    });

    it('should handle simple error with message', () => {
      const error = {
        code: 'ValidationError',
        message: 'Invalid input provided'
      };

      const result = NotesMapper.extractErrorInfo(error);

      expect(result.code).toBe('ValidationError');
      expect(result.message).toBe('Invalid input provided');
    });

    it('should handle unknown error format', () => {
      const error = {};

      const result = NotesMapper.extractErrorInfo(error);

      expect(result.code).toBe('UnknownError');
      expect(result.message).toBe('An unknown error occurred while processing OneNote data');
    });
  });

  describe('buildODataQuery', () => {
    it('should build complete OData query parameters', () => {
      const options = {
        select: ['id', 'title', 'content'],
        filter: ['level eq 0', 'isReadOnly eq false'],
        orderBy: 'lastModifiedDateTime',
        orderDirection: 'desc' as const,
        top: 50,
        skip: 10,
        expand: ['pages', 'attachments'],
        search: 'meeting notes'
      };

      const result = NotesMapper.buildODataQuery(options);

      expect(result).toEqual({
        $select: 'id,title,content',
        $filter: 'level eq 0 and isReadOnly eq false',
        $orderby: 'lastModifiedDateTime desc',
        $top: 50,
        $skip: 10,
        $expand: 'pages,attachments',
        $search: '"meeting notes"'
      });
    });

    it('should build minimal OData query', () => {
      const options = {
        top: 25
      };

      const result = NotesMapper.buildODataQuery(options);

      expect(result).toEqual({
        $top: 25
      });
    });

    it('should handle empty options', () => {
      const options = {};

      const result = NotesMapper.buildODataQuery(options);

      expect(result).toEqual({});
    });

    it('should default to ascending order when no direction specified', () => {
      const options = {
        orderBy: 'title'
      };

      const result = NotesMapper.buildODataQuery(options);

      expect(result).toEqual({
        $orderby: 'title'
      });
    });
  });
});