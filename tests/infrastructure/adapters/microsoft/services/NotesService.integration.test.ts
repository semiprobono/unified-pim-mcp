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

describe('NotesService Integration Tests', () => {
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

  describe('Complete Notebook Lifecycle', () => {
    it('should create, populate, and delete a complete notebook workflow', async () => {
      // Step 1: Create notebook
      const mockCreateNotebookResponse = {
        id: 'notebook-lifecycle',
        displayName: 'Lifecycle Test Notebook',
        color: 'blue',
        isDefault: false,
        createdDateTime: '2023-01-01T00:00:00Z',
        lastModifiedDateTime: '2023-01-01T00:00:00Z'
      };

      // Step 2: Create sections
      const mockCreateSectionResponse = {
        id: 'section-lifecycle',
        displayName: 'Test Section',
        createdDateTime: '2023-01-01T01:00:00Z',
        lastModifiedDateTime: '2023-01-01T01:00:00Z'
      };

      // Step 3: Create pages
      const mockCreatePageResponse = {
        id: 'page-lifecycle'
      };

      const mockGetPageResponse = {
        id: 'page-lifecycle',
        title: 'Test Page',
        parentSection: { id: 'section-lifecycle' },
        level: 0,
        order: 0,
        content: '<html><body><p>Test content</p></body></html>'
      };

      const mockSectionResponse = {
        id: 'section-lifecycle',
        displayName: 'Test Section',
        notebookId: 'notebook-lifecycle'
      };

      // Mock all API calls
      mockGraphClient.post
        .mockResolvedValueOnce(mockCreateNotebookResponse) // Create notebook
        .mockResolvedValueOnce(mockCreateSectionResponse)  // Create section
        .mockResolvedValueOnce(mockCreatePageResponse);    // Create page

      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)        // Get created page
        .mockResolvedValueOnce(mockSectionResponse);       // Get section for page

      mockGraphClient.delete
        .mockResolvedValueOnce(undefined)                  // Delete page
        .mockResolvedValueOnce(undefined)                  // Delete section
        .mockResolvedValueOnce(undefined);                 // Delete notebook

      // Execute workflow
      const notebook = await notesService.createNotebook({
        name: 'Lifecycle Test Notebook',
        color: 'blue'
      });

      const section = await notesService.createSection({
        name: 'Test Section',
        notebookId: notebook.id
      });

      const page = await notesService.createPage({
        title: 'Test Page',
        content: {
          htmlContent: '<p>Test content</p>',
          textContent: 'Test content',
          contentType: 'text/html' as const
        },
        sectionId: section.id
      });

      // Clean up
      await notesService.deletePage(page.id.toString());
      await notesService.deleteSection(section.id);
      await notesService.deleteNotebook(notebook.id);

      // Verify the complete workflow
      expect(notebook.name).toBe('Lifecycle Test Notebook');
      expect(section.name).toBe('Test Section');
      expect(page.title).toBe('Test Page');

      // Verify all API calls were made
      expect(mockGraphClient.post).toHaveBeenCalledTimes(3);
      expect(mockGraphClient.get).toHaveBeenCalledTimes(2);
      expect(mockGraphClient.delete).toHaveBeenCalledTimes(3);
    });

    it('should handle complex notebook with multiple sections and hierarchical pages', async () => {
      const notebookResponse = {
        id: 'complex-notebook',
        displayName: 'Complex Notebook'
      };

      const sectionsResponses = [
        { id: 'section-1', displayName: 'Section 1' },
        { id: 'section-2', displayName: 'Section 2' },
        { id: 'section-3', displayName: 'Section 3' }
      ];

      const pagesResponses = [
        { id: 'page-1-1' }, { id: 'page-1-2' }, { id: 'page-1-3' },
        { id: 'page-2-1' }, { id: 'page-2-2' },
        { id: 'page-3-1' }
      ];

      const mockGetPageResponses = pagesResponses.map((page, index) => ({
        id: page.id,
        title: `Page ${page.id}`,
        parentSection: { id: sectionsResponses[Math.floor(index / 3)].id },
        level: index % 3,
        order: index,
        content: `<html><body><p>Content for ${page.id}</p></body></html>`
      }));

      const mockSectionDetailsResponses = sectionsResponses.map(section => ({
        id: section.id,
        displayName: section.displayName,
        notebookId: 'complex-notebook'
      }));

      // Mock notebook creation
      mockGraphClient.post.mockResolvedValueOnce(notebookResponse);

      // Mock section creations
      sectionsResponses.forEach(section => {
        mockGraphClient.post.mockResolvedValueOnce(section);
      });

      // Mock page creations
      pagesResponses.forEach(page => {
        mockGraphClient.post.mockResolvedValueOnce(page);
      });

      // Mock page retrievals
      mockGetPageResponses.forEach(page => {
        mockGraphClient.get.mockResolvedValueOnce(page);
      });

      // Mock section details for each page
      mockSectionDetailsResponses.forEach(section => {
        mockGraphClient.get.mockResolvedValueOnce(section);
      });

      // Create complex structure
      const notebook = await notesService.createNotebook({
        name: 'Complex Notebook'
      });

      const sections = [];
      for (const sectionData of sectionsResponses) {
        const section = await notesService.createSection({
          name: sectionData.displayName,
          notebookId: notebook.id
        });
        sections.push(section);
      }

      const pages = [];
      let pageIndex = 0;
      for (const section of sections) {
        const pagesInSection = pageIndex < 3 ? 3 : pageIndex < 5 ? 2 : 1;
        for (let i = 0; i < pagesInSection; i++) {
          const page = await notesService.createPage({
            title: `Page ${pagesResponses[pageIndex].id}`,
            content: {
              htmlContent: `<p>Content for ${pagesResponses[pageIndex].id}</p>`,
              textContent: `Content for ${pagesResponses[pageIndex].id}`,
              contentType: 'text/html' as const
            },
            sectionId: section.id,
            level: i
          });
          pages.push(page);
          pageIndex++;
        }
      }

      // Verify structure
      expect(sections).toHaveLength(3);
      expect(pages).toHaveLength(6);
      expect(pages.filter(p => p.level === 0)).toHaveLength(3);
      expect(pages.filter(p => p.level === 1)).toHaveLength(2);
      expect(pages.filter(p => p.level === 2)).toHaveLength(1);
    });
  });

  describe('Cross-Service Integration', () => {
    it('should integrate with file attachments workflow', async () => {
      // This simulates integration with FileService for attachments
      const mockPageWithAttachment = {
        id: 'page-with-attachment',
        title: 'Page with File',
        parentSection: { id: 'section-1' },
        content: '<html><body><p>Content with <a href="attachment.pdf">attachment</a></p></body></html>',
        attachments: [
          {
            id: 'attachment-1',
            name: 'document.pdf',
            contentType: 'application/pdf',
            size: 1024000
          }
        ]
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Section with Files',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce({ id: 'page-with-attachment' });
      mockGraphClient.get
        .mockResolvedValueOnce(mockPageWithAttachment)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Page with File',
        content: {
          htmlContent: '<p>Content with <a href="attachment.pdf">attachment</a></p>',
          textContent: 'Content with attachment',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      expect(page.hasAttachments).toBe(true);
      expect(page.attachments).toHaveLength(1);
      expect(page.attachments[0].name).toBe('document.pdf');
    });

    it('should integrate with task management workflow', async () => {
      // This simulates integration with TaskService for OneNote todos
      const mockPageWithTodos = {
        id: 'page-with-todos',
        title: 'Task List',
        parentSection: { id: 'section-1' },
        content: `
          <html>
            <body>
              <p>My Tasks:</p>
              <p><input type="checkbox" /> Complete project proposal</p>
              <p><input type="checkbox" checked /> Review documents</p>
              <p><input type="checkbox" /> Send follow-up email</p>
            </body>
          </html>
        `,
        tags: ['tasks', 'todo', 'project']
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Task Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce({ id: 'page-with-todos' });
      mockGraphClient.get
        .mockResolvedValueOnce(mockPageWithTodos)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Task List',
        content: {
          htmlContent: mockPageWithTodos.content,
          textContent: 'My Tasks: Complete project proposal Review documents Send follow-up email',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1',
        tags: ['tasks', 'todo', 'project']
      });

      expect(page.tags).toContain('tasks');
      expect(page.tags).toContain('todo');
      expect(page.content.htmlContent).toContain('checkbox');
    });
  });

  describe('Search and Indexing Workflows', () => {
    it('should index pages across multiple notebooks for unified search', async () => {
      // Force Graph API fallback (no ChromaDB)
      (notesService as any).searchCollection = null;
      
      const mockSearchResponse = {
        value: [
          {
            id: 'page-1',
            title: 'Search Result 1',
            parentSection: { id: 'section-1' }
          },
          {
            id: 'page-2', 
            title: 'Search Result 2',
            parentSection: { id: 'section-2' }
          }
        ]
      };

      const mockSectionResponses = [
        { id: 'section-1', displayName: 'Section 1', parentNotebook: { id: 'notebook-1' } },
        { id: 'section-2', displayName: 'Section 2', parentNotebook: { id: 'notebook-2' } }
      ];

      mockGraphClient.get
        .mockResolvedValueOnce(mockSearchResponse)
        .mockResolvedValueOnce(mockSectionResponses[0])
        .mockResolvedValueOnce(mockSectionResponses[1]);

      const results = await notesService.searchNotes('project management', { limit: 25 });

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Search Result 1');
      expect(results[1].title).toBe('Search Result 2');
      expect(results[0].notebookId).toBe('notebook-1');
      expect(results[1].notebookId).toBe('notebook-2');
    });

    it('should handle semantic search with ChromaDB integration', async () => {
      // Set up ChromaDB collection for this test
      const mockCollection = createMockCollection();
      mockCollection.query.mockResolvedValue({
        ids: [['page-semantic-1', 'page-semantic-2']],
        documents: [['document 1', 'document 2']],
        metadatas: [[
          { sectionId: 'section-1', notebookId: 'notebook-1' },
          { sectionId: 'section-2', notebookId: 'notebook-2' }
        ]]
      });
      
      (notesService as any).searchCollection = mockCollection;

      const mockPageResponses = [
        {
          id: 'page-semantic-1',
          title: 'Semantic Result 1',
          parentSection: { id: 'section-1' },
          level: 0,
          order: 0,
          createdDateTime: '2023-01-01T00:00:00Z',
          lastModifiedDateTime: '2023-01-01T00:00:00Z',
          contentUrl: 'test-content-url-1'
        },
        {
          id: 'page-semantic-2',
          title: 'Semantic Result 2', 
          parentSection: { id: 'section-2' },
          level: 0,
          order: 1,
          createdDateTime: '2023-01-01T00:00:00Z',
          lastModifiedDateTime: '2023-01-01T00:00:00Z',
          contentUrl: 'test-content-url-2'
        }
      ];

      // Mock GraphClient getPage calls and section calls
      mockGraphClient.get.mockImplementation((endpoint: string) => {
        if (endpoint === '/me/onenote/pages/page-semantic-1') {
          return Promise.resolve(mockPageResponses[0]);
        }
        if (endpoint === '/me/onenote/pages/page-semantic-2') {
          return Promise.resolve(mockPageResponses[1]);
        }
        if (endpoint === '/me/onenote/sections/section-1') {
          return Promise.resolve({
            id: 'section-1',
            displayName: 'Section 1',
            parentNotebook: { id: 'notebook-1' }
          });
        }
        if (endpoint === '/me/onenote/sections/section-2') {
          return Promise.resolve({
            id: 'section-2',
            displayName: 'Section 2',
            parentNotebook: { id: 'notebook-2' }
          });
        }
        return Promise.resolve({ value: [] });
      });

      const results = await notesService.searchNotes('artificial intelligence', { limit: 10 });

      expect(mockCollection.query).toHaveBeenCalledWith({
        queryTexts: ['artificial intelligence'],
        nResults: 10,
        where: undefined
      });
      expect(results).toHaveLength(2);
    });
  });

  describe('Batch Operations and Performance', () => {
    it('should handle concurrent page operations efficiently', async () => {
      const numberOfPages = 10;
      const mockPages = Array.from({ length: numberOfPages }, (_, i) => ({
        id: `concurrent-page-${i}`,
        title: `Concurrent Page ${i}`,
        parentSection: { id: 'section-concurrent' },
        content: `<html><body><p>Content ${i}</p></body></html>`
      }));

      const mockSectionResponse = {
        id: 'section-concurrent',
        displayName: 'Concurrent Section',
        notebookId: 'notebook-concurrent'
      };

      // Mock page creations
      mockPages.forEach(page => {
        mockGraphClient.post.mockResolvedValueOnce({ id: page.id });
        mockGraphClient.get
          .mockResolvedValueOnce(page)
          .mockResolvedValueOnce(mockSectionResponse);
      });

      // Create pages concurrently
      const createPromises = mockPages.map((_, i) => 
        notesService.createPage({
          title: `Concurrent Page ${i}`,
          content: {
            htmlContent: `<p>Content ${i}</p>`,
            textContent: `Content ${i}`,
            contentType: 'text/html' as const
          },
          sectionId: 'section-concurrent'
        })
      );

      const results = await Promise.all(createPromises);

      expect(results).toHaveLength(numberOfPages);
      results.forEach((page, i) => {
        expect(page.title).toBe(`Concurrent Page ${i}`);
      });
    });

    it('should handle large section with pagination', async () => {
      const totalPages = 150;
      const pageSize = 50;
      const mockPagesPage1 = Array.from({ length: pageSize }, (_, i) => ({
        id: `large-page-${i}`,
        title: `Large Page ${i}`,
        level: 0,
        order: i
      }));

      const mockPagesPage2 = Array.from({ length: pageSize }, (_, i) => ({
        id: `large-page-${i + pageSize}`,
        title: `Large Page ${i + pageSize}`,
        level: 0,
        order: i + pageSize
      }));

      const mockPagesPage3 = Array.from({ length: totalPages - 2 * pageSize }, (_, i) => ({
        id: `large-page-${i + 2 * pageSize}`,
        title: `Large Page ${i + 2 * pageSize}`,
        level: 0,
        order: i + 2 * pageSize
      }));

      const mockSectionResponse = {
        id: 'large-section',
        displayName: 'Large Section',
        notebookId: 'notebook-large'
      };

      mockGraphClient.get
        .mockResolvedValueOnce(mockSectionResponse) // For first page request
        .mockResolvedValueOnce({
          value: mockPagesPage1,
          '@odata.count': totalPages,
          '@odata.nextLink': 'next-page-url'
        })
        .mockResolvedValueOnce(mockSectionResponse) // For second page request
        .mockResolvedValueOnce({
          value: mockPagesPage2,
          '@odata.count': totalPages,
          '@odata.nextLink': 'next-page-url-2'
        })
        .mockResolvedValueOnce(mockSectionResponse) // For third page request
        .mockResolvedValueOnce({
          value: mockPagesPage3,
          '@odata.count': totalPages
        });

      // Get first page
      const result1 = await notesService.listPages('large-section', { limit: pageSize, skip: 0 });
      expect(result1.notes).toHaveLength(pageSize);
      expect(result1.totalCount).toBe(totalPages);
      expect(result1.pagination.hasNextPage).toBe(true);

      // Get second page
      const result2 = await notesService.listPages('large-section', { limit: pageSize, skip: pageSize });
      expect(result2.notes).toHaveLength(pageSize);
      expect(result2.pagination.hasNextPage).toBe(true);

      // Get third page
      const result3 = await notesService.listPages('large-section', { limit: pageSize, skip: 2 * pageSize });
      expect(result3.notes).toHaveLength(totalPages - 2 * pageSize);
      expect(result3.pagination.hasNextPage).toBe(false);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle partial failure in batch operations', async () => {
      const mockCreateResponses = [
        { id: 'page-success-1' },
        new Error('Creation failed'),
        { id: 'page-success-2' }
      ];

      const mockGetResponses = [
        {
          id: 'page-success-1',
          title: 'Success Page 1',
          parentSection: { id: 'section-1' }
        },
        {
          id: 'page-success-2',
          title: 'Success Page 2',
          parentSection: { id: 'section-1' }
        }
      ];

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post
        .mockResolvedValueOnce(mockCreateResponses[0])
        .mockRejectedValueOnce(mockCreateResponses[1])
        .mockResolvedValueOnce(mockCreateResponses[2]);

      mockGraphClient.get
        .mockResolvedValueOnce(mockGetResponses[0])
        .mockResolvedValueOnce(mockSectionResponse)
        .mockResolvedValueOnce(mockGetResponses[1])
        .mockResolvedValueOnce(mockSectionResponse);

      const createPromises = [
        notesService.createPage({
          title: 'Success Page 1',
          content: { htmlContent: '<p>Content 1</p>', textContent: 'Content 1', contentType: 'text/html' as const },
          sectionId: 'section-1'
        }),
        notesService.createPage({
          title: 'Failed Page',
          content: { htmlContent: '<p>Content Failed</p>', textContent: 'Content Failed', contentType: 'text/html' as const },
          sectionId: 'section-1'
        }).catch(error => ({ error: error.message })),
        notesService.createPage({
          title: 'Success Page 2',
          content: { htmlContent: '<p>Content 2</p>', textContent: 'Content 2', contentType: 'text/html' as const },
          sectionId: 'section-1'
        })
      ];

      const results = await Promise.all(createPromises);

      expect(results[0].title).toBe('Success Page 1');
      expect(results[1].error).toBe('Creation failed');
      expect(results[2].title).toBe('Success Page 2');
    });

    it('should gracefully handle service unavailability with fallbacks', async () => {
      // Test ChromaDB unavailable scenario
      mockGraphClient.get.mockRejectedValueOnce(new Error('Service temporarily unavailable'));

      const originalInitializeServices = (notesService as any).initializeServices;
      (notesService as any).initializeServices = async function() {
        await originalInitializeServices.call(this);
        this.searchCollection = null; // Simulate ChromaDB unavailable
      };

      const mockSearchResponse = {
        value: [
          {
            id: 'fallback-page',
            title: 'Fallback Result',
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
        .mockResolvedValueOnce(mockSearchResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const results = await notesService.searchNotes('test query');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fallback Result');
      expect(mockLogger.warn).toHaveBeenCalledWith('ChromaDB not available, using Graph API search');
    });
  });
});