import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotesService } from '../../../../../src/infrastructure/adapters/microsoft/services/NotesService';
import { GraphClient } from '../../../../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { Logger } from '../../../../../src/shared/logging/Logger';

// Mock external dependencies
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager');
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer');
jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockResolvedValue({
      upsert: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue({ 
        ids: [[] as any[]],
        documents: [[] as any[]],
        metadatas: [[] as any[]]
      }),
      delete: jest.fn().mockResolvedValue(undefined)
    } as any)
  } as any))
}));

describe('NotesService', () => {
  let notesService: NotesService;
  let mockGraphClient: jest.Mocked<GraphClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Create mocks
    mockGraphClient = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      put: jest.fn(),
      authenticateUser: jest.fn(),
      refreshToken: jest.fn(),
      isAuthenticated: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({ id: 'test-user-123' }),
      dispose: jest.fn()
    } as any;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    // Create service instance
    notesService = new NotesService(mockGraphClient, mockLogger);
  });

  describe('listNotebooks', () => {
    it('should retrieve all notebooks successfully', async () => {
      const mockResponse = {
        value: [
          {
            id: 'notebook-1',
            displayName: 'Work Notes',
            color: 'blue',
            isDefault: true,
            createdDateTime: '2023-01-01T00:00:00Z',
            lastModifiedDateTime: '2023-01-01T00:00:00Z'
          },
          {
            id: 'notebook-2', 
            displayName: 'Personal Notes',
            color: 'green',
            isDefault: false,
            createdDateTime: '2023-01-02T00:00:00Z',
            lastModifiedDateTime: '2023-01-02T00:00:00Z'
          }
        ]
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const result = await notesService.listNotebooks();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Work Notes');
      expect(result[0].isDefault).toBe(true);
      expect(result[1].name).toBe('Personal Notes');
      expect(result[1].isDefault).toBe(false);
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/notebooks', expect.any(Object));
    });

    it('should handle empty response', async () => {
      mockGraphClient.get.mockResolvedValue({ value: [] });

      const result = await notesService.listNotebooks();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should handle API errors', async () => {
      const error = new Error('API Error');
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.listNotebooks()).rejects.toThrow('API Error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getNotebook', () => {
    it('should retrieve a specific notebook successfully', async () => {
      const mockResponse = {
        id: 'notebook-1',
        displayName: 'Work Notes',
        color: 'blue',
        isDefault: true,
        sections: [
          { id: 'section-1', displayName: 'Meeting Notes' }
        ],
        sectionGroups: []
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const result = await notesService.getNotebook('notebook-1');

      expect(result.name).toBe('Work Notes');
      expect(result.isDefault).toBe(true);
      expect(result.sections).toHaveLength(1);
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/notebooks/notebook-1', expect.any(Object));
    });

    it('should handle API errors', async () => {
      const error = new Error('Notebook not found');
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.getNotebook('invalid-id')).rejects.toThrow('Notebook not found');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createNotebook', () => {
    it('should create a new notebook successfully', async () => {
      const mockResponse = {
        id: 'notebook-new',
        displayName: 'New Notebook',
        color: 'red',
        isDefault: false
      };

      mockGraphClient.post.mockResolvedValue(mockResponse);

      const createData = {
        name: 'New Notebook',
        color: 'red',
        isDefault: false
      };

      const result = await notesService.createNotebook(createData);

      expect(result.name).toBe('New Notebook');
      expect(result.color).toBe('red');
      expect(mockGraphClient.post).toHaveBeenCalledWith('/me/onenote/notebooks', expect.objectContaining({
        displayName: 'New Notebook',
        color: 'red',
        isDefault: false
      }));
      expect(mockLogger.info).toHaveBeenCalledWith('Notebook created successfully', expect.any(Object));
    });

    it('should handle creation errors', async () => {
      const error = new Error('Creation failed');
      mockGraphClient.post.mockRejectedValue(error);

      const createData = {
        name: 'Test Notebook'
      };

      await expect(notesService.createNotebook(createData)).rejects.toThrow('Creation failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('deleteNotebook', () => {
    it('should delete a notebook successfully', async () => {
      mockGraphClient.delete.mockResolvedValue(undefined);

      await notesService.deleteNotebook('notebook-1');

      expect(mockGraphClient.delete).toHaveBeenCalledWith('/me/onenote/notebooks/notebook-1');
      expect(mockLogger.info).toHaveBeenCalledWith('Notebook deleted successfully', expect.any(Object));
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Deletion failed');
      mockGraphClient.delete.mockRejectedValue(error);

      await expect(notesService.deleteNotebook('notebook-1')).rejects.toThrow('Deletion failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('listSections', () => {
    it('should retrieve sections for a notebook successfully', async () => {
      const mockResponse = {
        value: [
          {
            id: 'section-1',
            displayName: 'Meeting Notes',
            createdDateTime: '2023-01-01T00:00:00Z',
            lastModifiedDateTime: '2023-01-01T00:00:00Z'
          },
          {
            id: 'section-2',
            displayName: 'Project Plans',
            createdDateTime: '2023-01-02T00:00:00Z',
            lastModifiedDateTime: '2023-01-02T00:00:00Z'
          }
        ]
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const result = await notesService.listSections('notebook-1');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Meeting Notes');
      expect(result[1].name).toBe('Project Plans');
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/notebooks/notebook-1/sections', expect.any(Object));
    });

    it('should handle empty sections response', async () => {
      mockGraphClient.get.mockResolvedValue({ value: [] });

      const result = await notesService.listSections('notebook-1');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('createSection', () => {
    it('should create a new section successfully', async () => {
      const mockResponse = {
        id: 'section-new',
        displayName: 'New Section'
      };

      mockGraphClient.post.mockResolvedValue(mockResponse);

      const createData = {
        name: 'New Section',
        notebookId: 'notebook-1'
      };

      const result = await notesService.createSection(createData);

      expect(result.name).toBe('New Section');
      expect(mockGraphClient.post).toHaveBeenCalledWith('/me/onenote/notebooks/notebook-1/sections', expect.objectContaining({
        displayName: 'New Section'
      }));
      expect(mockLogger.info).toHaveBeenCalledWith('Section created successfully', expect.any(Object));
    });
  });

  describe('listPages', () => {
    it('should retrieve pages for a section successfully', async () => {
      // Mock the getSection call first
      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        parentNotebook: { id: 'notebook-1' }
      };
      
      const mockPagesResponse = {
        value: [
          {
            id: 'page-1',
            title: 'Meeting Notes',
            level: 0,
            order: 0,
            createdDateTime: '2023-01-01T00:00:00Z',
            lastModifiedDateTime: '2023-01-01T00:00:00Z',
            contentUrl: 'https://example.com/page1'
          },
          {
            id: 'page-2',
            title: 'Action Items',
            level: 1,
            order: 1,
            createdDateTime: '2023-01-02T00:00:00Z',
            lastModifiedDateTime: '2023-01-02T00:00:00Z',
            contentUrl: 'https://example.com/page2'
          }
        ],
        '@odata.count': 2
      };

      // First call for getSection, second call for listPages
      mockGraphClient.get
        .mockResolvedValueOnce(mockSectionResponse)
        .mockResolvedValueOnce(mockPagesResponse);

      const result = await notesService.listPages('section-1', { limit: 10 });

      expect(result.notes).toHaveLength(2);
      expect(result.notes[0].title).toBe('Meeting Notes');
      expect(result.notes[1].title).toBe('Action Items');
      expect(result.totalCount).toBe(2);
      expect(result.pagination.total).toBe(2);
    });

    it('should handle empty pages response', async () => {
      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        parentNotebook: { id: 'notebook-1' }
      };

      mockGraphClient.get
        .mockResolvedValueOnce(mockSectionResponse)
        .mockResolvedValueOnce({ value: [], '@odata.count': 0 });

      const result = await notesService.listPages('section-1');

      expect(result.notes).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });
  });

  describe('getPage', () => {
    it('should retrieve a specific page successfully', async () => {
      const mockPageResponse = {
        id: 'page-1',
        title: 'Test Page',
        parentSection: { id: 'section-1' },
        level: 0,
        order: 0,
        createdDateTime: '2023-01-01T00:00:00Z',
        lastModifiedDateTime: '2023-01-01T00:00:00Z',
        content: '<html><body><p>Test content</p></body></html>'
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        notebookId: 'notebook-1'
      };

      // Mock both the page fetch and section fetch
      mockGraphClient.get
        .mockResolvedValueOnce(mockPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const result = await notesService.getPage('page-1', 'section-1', true);

      expect(result.title).toBe('Test Page');
      expect(result.content.htmlContent).toContain('Test content');
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/pages/page-1', expect.any(Object));
    });

    it('should handle page not found errors', async () => {
      const error = new Error('Page not found');
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.getPage('invalid-page')).rejects.toThrow('Page not found');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('createPage', () => {
    it('should create a new page successfully', async () => {
      const mockCreateResponse = {
        id: 'page-new'
      };

      const mockGetPageResponse = {
        id: 'page-new',
        title: 'New Page',
        parentSection: { id: 'section-1' },
        level: 0,
        order: 0,
        createdDateTime: '2023-01-01T00:00:00Z',
        lastModifiedDateTime: '2023-01-01T00:00:00Z',
        content: '<html><body><p>New content</p></body></html>'
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValue(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const createData = {
        title: 'New Page',
        content: {
          htmlContent: '<p>New content</p>',
          textContent: 'New content',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      };

      const result = await notesService.createPage(createData);

      expect(result.title).toBe('New Page');
      expect(mockGraphClient.post).toHaveBeenCalledWith('/me/onenote/sections/section-1/pages', expect.any(String), expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'text/html'
        })
      }));
      expect(mockLogger.info).toHaveBeenCalledWith('Page created successfully', expect.any(Object));
    });

    it('should handle page creation errors', async () => {
      const error = new Error('Creation failed');
      mockGraphClient.post.mockRejectedValue(error);

      const createData = {
        title: 'Test Page',
        content: {
          htmlContent: '<p>Test</p>',
          textContent: 'Test',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      };

      await expect(notesService.createPage(createData)).rejects.toThrow('Creation failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updatePage', () => {
    it('should update a page successfully', async () => {
      const mockUpdatedPageResponse = {
        id: 'page-1',
        title: 'Updated Page',
        parentSection: { id: 'section-1' },
        level: 0,
        order: 0,
        createdDateTime: '2023-01-01T00:00:00Z',
        lastModifiedDateTime: '2023-01-01T01:00:00Z',
        content: '<html><body><p>Updated content</p></body></html>'
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.patch.mockResolvedValue(undefined);
      mockGraphClient.get
        .mockResolvedValueOnce(mockUpdatedPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const updateData = {
        title: 'Updated Page',
        content: {
          htmlContent: '<p>Updated content</p>',
          textContent: 'Updated content',
          contentType: 'text/html' as const
        }
      };

      const result = await notesService.updatePage('page-1', updateData, 'section-1');

      expect(result.title).toBe('Updated Page');
      expect(mockGraphClient.patch).toHaveBeenCalledWith('/me/onenote/pages/page-1/content', expect.any(Array), expect.any(Object));
      expect(mockLogger.info).toHaveBeenCalledWith('Page updated successfully', expect.any(Object));
    });
  });

  describe('deletePage', () => {
    it('should delete a page successfully', async () => {
      mockGraphClient.delete.mockResolvedValue(undefined);

      await notesService.deletePage('page-1', 'section-1');

      expect(mockGraphClient.delete).toHaveBeenCalledWith('/me/onenote/pages/page-1');
      expect(mockLogger.info).toHaveBeenCalledWith('Page deleted successfully', expect.any(Object));
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Deletion failed');
      mockGraphClient.delete.mockRejectedValue(error);

      await expect(notesService.deletePage('page-1')).rejects.toThrow('Deletion failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('searchNotes', () => {
    it('should search notes using Graph API fallback when ChromaDB unavailable', async () => {
      const mockSearchResponse = {
        value: [
          {
            id: 'page-1',
            title: 'Search Result',
            parentSection: { id: 'section-1' },
            level: 0,
            order: 0,
            createdDateTime: '2023-01-01T00:00:00Z',
            lastModifiedDateTime: '2023-01-01T00:00:00Z'
          }
        ]
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.get
        .mockResolvedValueOnce(mockSearchResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const result = await notesService.searchNotes('test query', { limit: 10 });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Search Result');
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/pages', expect.objectContaining({
        $search: '"test query"'
      }));
    });

    it('should handle search errors', async () => {
      const error = new Error('Search failed');
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.searchNotes('test query')).rejects.toThrow('Search failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getPageContent', () => {
    it('should retrieve page content successfully', async () => {
      const mockContentResponse = '<html><body><p>Page content</p></body></html>';

      mockGraphClient.get.mockResolvedValue(mockContentResponse);

      const result = await notesService.getPageContent('page-1', 'section-1');

      expect(result.htmlContent).toBe(mockContentResponse);
      expect(result.textContent).toBe('Page content');
      expect(result.contentType).toBe('text/html');
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/pages/page-1/content', expect.objectContaining({
        headers: { 'Accept': 'text/html' }
      }));
    });
  });

  describe('getRecentlyModified', () => {
    it('should retrieve recently modified notes successfully', async () => {
      const mockResponse = {
        value: [
          {
            id: 'page-1',
            title: 'Recent Page',
            parentSection: { id: 'section-1' },
            level: 0,
            order: 0,
            lastModifiedDateTime: '2023-01-01T00:00:00Z'
          }
        ]
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.get
        .mockResolvedValueOnce(mockResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const result = await notesService.getRecentlyModified(5);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Recent Page');
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/pages', expect.objectContaining({
        $orderby: 'lastModifiedDateTime desc',
        $top: 5
      }));
    });
  });
});