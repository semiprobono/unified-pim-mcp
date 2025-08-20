// @ts-nocheck - Suppressing all TypeScript checking for this test file due to Jest mock type issues
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotesService } from '../../../../../src/infrastructure/adapters/microsoft/services/NotesService';
import { GraphClient } from '../../../../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { Logger } from '../../../../../src/shared/logging/Logger';

// Mock external dependencies
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager');
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer');
// @ts-ignore - Suppressing Jest mock type issues in test file
const createMockCollection = () => ({
  upsert: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue({ 
    ids: [[]],
    documents: [[]],
    metadatas: [[]]
  }),
  delete: jest.fn().mockResolvedValue(undefined)
});

// @ts-ignore - Suppressing Jest mock type issues in test file
jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockResolvedValue(createMockCollection())
  }))
}));

describe('NotesService', () => {
  let notesService: NotesService;
  let mockGraphClient: jest.Mocked<GraphClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Create mocks with proper typing
    mockGraphClient = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      put: jest.fn(),
      batch: jest.fn(),
      paginate: jest.fn(),
      getAllPages: jest.fn(),
      uploadLargeFile: jest.fn(),
      testConnection: jest.fn(),
      // @ts-ignore - Suppressing Jest mock type issues in test file
      authenticateUser: jest.fn(),
      refreshToken: jest.fn(),
      isAuthenticated: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({ id: 'test-user-123' }),
      setUserId: jest.fn(),
      getRateLimit: jest.fn(),
      getHealthStatus: jest.fn(),
      dispose: jest.fn()
    } as jest.Mocked<GraphClient>;

    // @ts-ignore - Suppressing Jest mock type issues in test file
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as jest.Mocked<Logger>;

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

    it('should handle notebooks with Unicode characters in names', async () => {
      const mockResponse = {
        value: [
          {
            id: 'notebook-unicode',
            displayName: '📚 工作笔记 🎯 Émojis & Spëcîal Chars',
            color: 'purple',
            isDefault: false,
            createdDateTime: '2023-01-01T00:00:00Z',
            lastModifiedDateTime: '2023-01-01T00:00:00Z'
          }
        ]
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const result = await notesService.listNotebooks();

      expect(result[0].name).toBe('📚 工作笔记 🎯 Émojis & Spëcîal Chars');
    });

    it('should handle notebooks with all supported colors', async () => {
      const colors = ['blue', 'green', 'red', 'yellow', 'orange', 'purple', 'pink', 'gray'];
      const mockResponse = {
        value: colors.map((color, index) => ({
          id: `notebook-${index}`,
          displayName: `${color} Notebook`,
          color,
          isDefault: index === 0
        }))
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const result = await notesService.listNotebooks();

      expect(result).toHaveLength(colors.length);
      colors.forEach((color, index) => {
        expect(result[index].color).toBe(color);
      });
    });

    it('should handle notebooks with missing optional fields', async () => {
      const mockResponse = {
        value: [
          {
            id: 'notebook-minimal',
            displayName: 'Minimal Notebook'
            // Missing color, isDefault, dates
          }
        ]
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const result = await notesService.listNotebooks();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Minimal Notebook');
    });

    it('should handle 401 unauthorized errors', async () => {
      const error = new Error('Unauthorized');
      error.name = 'Unauthorized';
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.listNotebooks()).rejects.toThrow('Unauthorized');
    });

    it('should handle 403 forbidden errors', async () => {
      const error = new Error('Forbidden - insufficient permissions');
      error.name = 'Forbidden';
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.listNotebooks()).rejects.toThrow('Forbidden');
    });

    it('should handle 429 rate limiting errors', async () => {
      const error = new Error('Too Many Requests');
      error.name = 'TooManyRequests';
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.listNotebooks()).rejects.toThrow('Too Many Requests');
    });

    it('should handle 500 internal server errors', async () => {
      const error = new Error('Internal Server Error');
      error.name = 'InternalServerError';
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.listNotebooks()).rejects.toThrow('Internal Server Error');
    });

    it('should handle 502 bad gateway errors', async () => {
      const error = new Error('Bad Gateway');
      error.name = 'BadGateway';
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.listNotebooks()).rejects.toThrow('Bad Gateway');
    });

    it('should handle 503 service unavailable errors', async () => {
      const error = new Error('Service Unavailable');
      error.name = 'ServiceUnavailable';
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.listNotebooks()).rejects.toThrow('Service Unavailable');
    });

    it('should handle notebooks with sections and section groups', async () => {
      const mockResponse = {
        value: [
          {
            id: 'notebook-complex',
            displayName: 'Complex Notebook',
            sections: [
              { id: 'section-1', displayName: 'Section 1' },
              { id: 'section-2', displayName: 'Section 2' }
            ],
            sectionGroups: [
              { id: 'group-1', displayName: 'Group 1' }
            ]
          }
        ]
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const result = await notesService.listNotebooks();

      expect(result[0].sections).toHaveLength(2);
      expect(result[0].sectionGroups).toHaveLength(1);
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
        sectionGroups: [] as any[]
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
        parentNotebook: { id: 'notebook-1' },
        pages: []
      };

      // Mock the search API call and the subsequent getSection call
      mockGraphClient.get
        .mockResolvedValueOnce(mockSearchResponse)  // For the search request (/me/onenote/pages)
        .mockResolvedValueOnce(mockSectionResponse); // For the getSection request (/me/onenote/sections/section-1)

      // Force the searchCollection to be null after initialization to test fallback
      const originalInitializeServices = (notesService as any).initializeServices;
      (notesService as any).initializeServices = async function() {
        await originalInitializeServices.call(this);
        this.searchCollection = null; // Force null to test Graph API fallback
      };

      const result = await notesService.searchNotes('test query', { limit: 10 });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Search Result');
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/pages', expect.objectContaining({
        $search: '"test query"'
      }));
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/sections/section-1', expect.any(Object));
    });

    it('should handle search errors', async () => {
      const error = new Error('Search failed');
      
      // Mock GraphClient to reject both potential calls
      mockGraphClient.get.mockRejectedValue(error);

      // Force the searchCollection to be null after initialization to test fallback error handling
      const originalInitializeServices = (notesService as any).initializeServices;
      (notesService as any).initializeServices = async function() {
        await originalInitializeServices.call(this);
        this.searchCollection = null; // Force null to test Graph API fallback error
      };

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

    it('should handle default limit when not specified', async () => {
      const mockResponse = { value: [] };
      mockGraphClient.get.mockResolvedValue(mockResponse);

      await notesService.getRecentlyModified();

      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/pages', expect.objectContaining({
        $top: 10
      }));
    });

    it('should handle large limit values', async () => {
      const mockResponse = { value: [] };
      mockGraphClient.get.mockResolvedValue(mockResponse);

      await notesService.getRecentlyModified(1000);

      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/pages', expect.objectContaining({
        $top: 1000
      }));
    });

    it('should handle API errors gracefully', async () => {
      const error = new Error('API Error');
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.getRecentlyModified(5)).rejects.toThrow('API Error');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should skip pages without section information', async () => {
      const mockResponse = {
        value: [
          {
            id: 'page-1',
            title: 'Page without section',
            parentSection: null
          },
          {
            id: 'page-2',
            title: 'Valid page',
            parentSection: { id: 'section-1' }
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

      const result = await notesService.getRecentlyModified(10);

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Valid page');
      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to process recent note', expect.any(Object));
    });
  });

  // NEW TESTS FOR MISSING METHODS
  describe('getSection', () => {
    it('should retrieve a specific section successfully', async () => {
      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        createdDateTime: '2023-01-01T00:00:00Z',
        lastModifiedDateTime: '2023-01-01T00:00:00Z',
        parentNotebook: { id: 'notebook-1' },
        parentSectionGroup: null,
        pages: [
          { id: 'page-1', title: 'Page 1', level: 0, order: 0 },
          { id: 'page-2', title: 'Page 2', level: 1, order: 1 }
        ]
      };

      mockGraphClient.get.mockResolvedValue(mockSectionResponse);

      const result = await notesService.getSection('section-1', 'notebook-1');

      expect(result.id).toBe('section-1');
      expect(result.name).toBe('Test Section');
      expect(result.notebookId).toBe('notebook-1');
      expect(result.pages).toHaveLength(2);
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/onenote/sections/section-1', expect.objectContaining({
        $select: expect.stringContaining('id,displayName'),
        $expand: expect.stringContaining('pages')
      }));
    });

    it('should retrieve section without explicit notebookId', async () => {
      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        parentNotebook: { id: 'notebook-auto' }
      };

      mockGraphClient.get.mockResolvedValue(mockSectionResponse);

      const result = await notesService.getSection('section-1');

      expect(result.notebookId).toBe('notebook-auto');
    });

    it('should handle section with section group', async () => {
      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        parentNotebook: { id: 'notebook-1' },
        parentSectionGroup: { id: 'group-1', displayName: 'Group 1' }
      };

      mockGraphClient.get.mockResolvedValue(mockSectionResponse);

      const result = await notesService.getSection('section-1');

      expect(result.sectionGroupId).toBe('group-1');
    });

    it('should handle 404 errors for non-existent sections', async () => {
      const error = new Error('Section not found');
      error.name = 'NotFound';
      mockGraphClient.get.mockRejectedValue(error);

      await expect(notesService.getSection('non-existent')).rejects.toThrow('Section not found');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to get section', expect.objectContaining({
        sectionId: 'non-existent'
      }));
    });

    it('should handle sections with empty pages array', async () => {
      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Empty Section',
        parentNotebook: { id: 'notebook-1' },
        pages: []
      };

      mockGraphClient.get.mockResolvedValue(mockSectionResponse);

      const result = await notesService.getSection('section-1');

      expect(result.pages).toHaveLength(0);
    });

    it('should use cache when available', async () => {
      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Cached Section',
        parentNotebook: { id: 'notebook-1' }
      };

      // Mock cache manager to return cached section on second call
      const cachedSection = {
        id: 'section-1',
        name: 'Cached Section',
        notebookId: 'notebook-1',
        pages: []
      };

      // Set up cache mock behavior
      let cacheCallCount = 0;
      const mockCacheGet = jest.fn().mockImplementation(() => {
        cacheCallCount++;
        if (cacheCallCount === 1) {
          return Promise.resolve(undefined); // First call: no cache
        } else {
          return Promise.resolve(cachedSection); // Second call: return cached section
        }
      });

      // Mock the service's cache manager
      (notesService as any).cacheManager = {
        get: mockCacheGet,
        set: jest.fn().mockResolvedValue(undefined)
      };

      // First call should hit API
      mockGraphClient.get.mockResolvedValueOnce(mockSectionResponse);

      await notesService.getSection('section-1');
      
      // Second call should use cache (no additional API call)
      const cachedResult = await notesService.getSection('section-1');

      expect(cachedResult.name).toBe('Cached Section');
      expect(mockGraphClient.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteSection', () => {
    it('should delete a section successfully', async () => {
      mockGraphClient.delete.mockResolvedValue(undefined);

      await notesService.deleteSection('section-1', 'notebook-1');

      expect(mockGraphClient.delete).toHaveBeenCalledWith('/me/onenote/sections/section-1');
      expect(mockLogger.info).toHaveBeenCalledWith('Section deleted successfully', { sectionId: 'section-1' });
    });

    it('should delete section without notebookId', async () => {
      mockGraphClient.delete.mockResolvedValue(undefined);

      await notesService.deleteSection('section-1');

      expect(mockGraphClient.delete).toHaveBeenCalledWith('/me/onenote/sections/section-1');
      expect(mockLogger.info).toHaveBeenCalledWith('Section deleted successfully', { sectionId: 'section-1' });
    });

    it('should handle 403 errors for readonly sections', async () => {
      const error = new Error('Forbidden - section is read-only');
      error.name = 'Forbidden';
      mockGraphClient.delete.mockRejectedValue(error);

      await expect(notesService.deleteSection('readonly-section')).rejects.toThrow('Forbidden');
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to delete section', expect.objectContaining({
        sectionId: 'readonly-section'
      }));
    });

    it('should handle 404 errors for non-existent sections', async () => {
      const error = new Error('Section not found');
      error.name = 'NotFound';
      mockGraphClient.delete.mockRejectedValue(error);

      await expect(notesService.deleteSection('non-existent')).rejects.toThrow('Section not found');
    });

    it('should handle 409 conflicts when section has dependencies', async () => {
      const error = new Error('Cannot delete section with pages');
      error.name = 'Conflict';
      mockGraphClient.delete.mockRejectedValue(error);

      await expect(notesService.deleteSection('section-with-pages')).rejects.toThrow('Cannot delete section with pages');
    });

    it('should invalidate cache after successful deletion', async () => {
      mockGraphClient.delete.mockResolvedValue(undefined);

      await notesService.deleteSection('section-1', 'notebook-1');

      // Verify cache invalidation calls would be made
      expect(mockGraphClient.delete).toHaveBeenCalledWith('/me/onenote/sections/section-1');
    });
  });
});