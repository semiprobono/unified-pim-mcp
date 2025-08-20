// @ts-nocheck - Suppressing all TypeScript checking for this test file due to Jest mock type issues
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotesService } from '../../../../../src/infrastructure/adapters/microsoft/services/NotesService';
import { GraphClient } from '../../../../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { Logger } from '../../../../../src/shared/logging/Logger';

// Mock external dependencies
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager');
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer');

// Create comprehensive ChromaDB collection mock
const createDetailedMockCollection = () => {
  const mockData = {
    documents: [],
    metadatas: [],
    ids: []
  };

  return {
    upsert: jest.fn().mockImplementation(({ ids, documents, metadatas }) => {
      // Simulate upserting data
      ids.forEach((id, index) => {
        const existingIndex = mockData.ids.indexOf(id);
        if (existingIndex >= 0) {
          // Update existing
          mockData.documents[existingIndex] = documents[index];
          mockData.metadatas[existingIndex] = metadatas[index];
        } else {
          // Add new
          mockData.ids.push(id);
          mockData.documents.push(documents[index]);
          mockData.metadatas.push(metadatas[index]);
        }
      });
      return Promise.resolve();
    }),
    query: jest.fn().mockImplementation(({ queryTexts, nResults = 10, where }) => {
      // Simulate semantic search with filtering
      let filteredIndices = Array.from({ length: mockData.ids.length }, (_, i) => i);
      
      // Apply where clause filtering
      if (where) {
        filteredIndices = filteredIndices.filter(i => {
          const metadata = mockData.metadatas[i];
          return Object.entries(where).every(([key, value]) => metadata[key] === value);
        });
      }

      // Simulate relevance-based ordering (simple text matching)
      const queryText = queryTexts[0].toLowerCase();
      const results = filteredIndices
        .map(i => ({
          index: i,
          relevance: mockData.documents[i].toLowerCase().includes(queryText) ? 1.0 : 0.5
        }))
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, nResults);

      return Promise.resolve({
        ids: [results.map(r => mockData.ids[r.index])],
        documents: [results.map(r => mockData.documents[r.index])],
        metadatas: [results.map(r => mockData.metadatas[r.index])],
        distances: [results.map(r => 1.0 - r.relevance)]
      });
    }),
    delete: jest.fn().mockImplementation(({ ids }) => {
      // Remove specified IDs
      ids.forEach(id => {
        const index = mockData.ids.indexOf(id);
        if (index >= 0) {
          mockData.ids.splice(index, 1);
          mockData.documents.splice(index, 1);
          mockData.metadatas.splice(index, 1);
        }
      });
      return Promise.resolve();
    }),
    count: jest.fn().mockImplementation(() => {
      return Promise.resolve(mockData.ids.length);
    }),
    peek: jest.fn().mockImplementation(() => {
      return Promise.resolve({
        ids: mockData.ids.slice(0, 10),
        documents: mockData.documents.slice(0, 10),
        metadatas: mockData.metadatas.slice(0, 10)
      });
    }),
    // Test helper to access internal state
    _getInternalData: () => mockData
  };
};

// @ts-ignore - Suppressing Jest mock type issues in test file
jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockResolvedValue(createDetailedMockCollection())
  }))
}));

describe('NotesService ChromaDB Integration Tests', () => {
  let notesService: NotesService;
  let mockGraphClient: jest.Mocked<GraphClient>;
  let mockLogger: jest.Mocked<Logger>;
  let mockCollection: any;

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
    
    // Create fresh collection mock for each test
    mockCollection = createDetailedMockCollection();
    
    // Set up default Graph API responses
    mockGraphClient.get.mockImplementation((endpoint: string) => {
      if (endpoint === '/me/onenote/notebooks') {
        return Promise.resolve({
          value: [
            {
              id: 'notebook-1',
              displayName: 'Test Notebook',
              createdDateTime: '2023-01-01T00:00:00Z',
              lastModifiedDateTime: '2023-01-01T00:00:00Z'
            }
          ]
        });
      }
      return Promise.resolve({ value: [] });
    });
  });

  describe('ChromaDB Collection Initialization', () => {
    it('should initialize ChromaDB collection with correct configuration', async () => {
      const ChromaClient = require('chromadb').ChromaClient;
      const mockChromaClient = new ChromaClient();

      // Override the initialization to capture collection creation
      const originalInitializeServices = (notesService as any).initializeServices;
      (notesService as any).initializeServices = async function() {
        await originalInitializeServices.call(this);
        this.searchCollection = mockCollection;
      };

      // Trigger initialization
      await notesService.listNotebooks();

      expect(mockChromaClient.getOrCreateCollection).toHaveBeenCalledWith({
        name: 'notes-search-index',
        metadata: {
          description: 'Semantic search index for notes',
          'hnsw:space': 'cosine'
        }
      });
    });

    it('should handle ChromaDB initialization failures gracefully', async () => {
      const ChromaClient = require('chromadb').ChromaClient;
      ChromaClient.mockImplementationOnce(() => ({
        getOrCreateCollection: jest.fn().mockRejectedValue(new Error('ChromaDB connection failed'))
      }));

      // Should not throw, but should log error
      await notesService.listNotebooks();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize notes search collection',
        expect.objectContaining({
          error: expect.any(Error)
        })
      );
    });

    it('should handle ChromaDB service unavailable', async () => {
      const originalInitializeServices = (notesService as any).initializeServices;
      (notesService as any).initializeServices = async function() {
        await originalInitializeServices.call(this);
        this.searchCollection = null; // Simulate ChromaDB unavailable
      };

      const mockSearchResponse = {
        value: [
          {
            id: 'fallback-page',
            title: 'Fallback Search Result',
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
      expect(results[0].title).toBe('Fallback Search Result');
      expect(mockLogger.warn).toHaveBeenCalledWith('ChromaDB not available, using Graph API search');
    });
  });

  describe('Document Indexing Operations', () => {
    beforeEach(() => {
      // Set up collection for indexing tests
      const originalInitializeServices = (notesService as any).initializeServices;
      (notesService as any).initializeServices = async function() {
        await originalInitializeServices.call(this);
        this.searchCollection = mockCollection;
      };
    });

    it('should index notes with complete metadata', async () => {
      // Ensure searchCollection is properly set up
      (notesService as any).searchCollection = mockCollection;
      
      const mockNotes = [
        {
          id: 'note-1',
          title: 'Research Project Notes',
          content: {
            textContent: 'Artificial intelligence and machine learning research findings',
            htmlContent: '<p>AI and ML research</p>',
            contentType: 'text/html' as const
          },
          tags: ['research', 'ai', 'ml'],
          notebookId: 'notebook-research',
          sectionId: 'section-ai',
          pageId: 'page-1',
          level: 0,
          isReadOnly: false,
          hasAttachments: true,
          createdDateTime: new Date('2023-01-01T00:00:00Z'),
          lastModifiedDateTime: new Date('2023-01-02T00:00:00Z'),
          wordCount: 150,
          characterCount: 900
        },
        {
          id: 'note-2',
          title: 'Project Meeting Notes',
          content: {
            textContent: 'Team discussion about project milestones and deliverables',
            htmlContent: '<p>Meeting notes</p>',
            contentType: 'text/html' as const
          },
          tags: ['meeting', 'project'],
          notebookId: 'notebook-work',
          sectionId: 'section-meetings',
          pageId: 'page-2',
          level: 1,
          isReadOnly: false,
          hasAttachments: false,
          createdDateTime: new Date('2023-01-03T00:00:00Z'),
          lastModifiedDateTime: new Date('2023-01-03T01:00:00Z'),
          wordCount: 75,
          characterCount: 450
        }
      ];

      await (notesService as any).indexNotesForSearch(mockNotes);

      expect(mockCollection.upsert).toHaveBeenCalledWith({
        ids: ['note-1', 'note-2'],
        documents: [
          'Research Project Notes Artificial intelligence and machine learning research findings research ai ml',
          'Project Meeting Notes Team discussion about project milestones and deliverables meeting project'
        ],
        metadatas: [
          {
            noteId: 'note-1',
            notebookId: 'notebook-research',
            sectionId: 'section-ai',
            pageId: 'page-1',
            title: 'Research Project Notes',
            level: 0,
            isReadOnly: false,
            hasAttachments: true,
            createdDate: '2023-01-01T00:00:00.000Z',
            modifiedDate: '2023-01-02T00:00:00.000Z',
            tags: 'research,ai,ml',
            wordCount: 150,
            characterCount: 900
          },
          {
            noteId: 'note-2',
            notebookId: 'notebook-work',
            sectionId: 'section-meetings',
            pageId: 'page-2',
            title: 'Project Meeting Notes',
            level: 1,
            isReadOnly: false,
            hasAttachments: false,
            createdDate: '2023-01-03T00:00:00.000Z',
            modifiedDate: '2023-01-03T01:00:00.000Z',
            tags: 'meeting,project',
            wordCount: 75,
            characterCount: 450
          }
        ]
      });
    });

    it('should handle indexing of notes with special characters and Unicode', async () => {
      // Ensure searchCollection is properly set up
      (notesService as any).searchCollection = mockCollection;
      
      const mockNote = {
        id: 'unicode-note',
        title: '🚀 研究项目 - Spéçial Chäractërs & Émojis',
        content: {
          textContent: 'Content with 中文字符 and ñoël français 🎯',
          htmlContent: '<p>Unicode content</p>',
          contentType: 'text/html' as const
        },
        tags: ['unicode', '研究', 'français'],
        notebookId: 'notebook-international',
        sectionId: 'section-unicode',
        pageId: 'page-unicode',
        level: 0,
        isReadOnly: false,
        hasAttachments: false,
        createdDateTime: new Date('2023-01-01T00:00:00Z'),
        lastModifiedDateTime: new Date('2023-01-01T00:00:00Z'),
        wordCount: 20,
        characterCount: 100
      };

      await (notesService as any).indexNotesForSearch([mockNote]);

      expect(mockCollection.upsert).toHaveBeenCalledWith({
        ids: ['unicode-note'],
        documents: ['🚀 研究项目 - Spéçial Chäractërs & Émojis Content with 中文字符 and ñoël français 🎯 unicode 研究 français'],
        metadatas: [{
          noteId: 'unicode-note',
          notebookId: 'notebook-international',
          sectionId: 'section-unicode',
          pageId: 'page-unicode',
          title: '🚀 研究项目 - Spéçial Chäractërs & Émojis',
          level: 0,
          isReadOnly: false,
          hasAttachments: false,
          createdDate: '2023-01-01T00:00:00.000Z',
          modifiedDate: '2023-01-01T00:00:00.000Z',
          tags: 'unicode,研究,français',
          wordCount: 20,
          characterCount: 100
        }]
      });
    });

    it('should handle indexing of empty notes gracefully', async () => {
      const emptyNotes = [];
      
      await (notesService as any).indexNotesForSearch(emptyNotes);

      // Should not call upsert for empty array
      expect(mockCollection.upsert).not.toHaveBeenCalled();
    });

    it('should handle indexing errors gracefully', async () => {
      // Ensure searchCollection is properly set up
      (notesService as any).searchCollection = mockCollection;
      mockCollection.upsert.mockRejectedValueOnce(new Error('ChromaDB indexing failed'));

      const mockNote = {
        id: 'error-note',
        title: 'Error Test Note',
        content: { textContent: 'Error content', htmlContent: '<p>Error</p>', contentType: 'text/html' as const },
        tags: [],
        notebookId: 'notebook-1',
        sectionId: 'section-1',
        pageId: 'page-1',
        level: 0,
        isReadOnly: false,
        hasAttachments: false,
        createdDateTime: new Date(),
        lastModifiedDateTime: new Date(),
        wordCount: 10,
        characterCount: 50
      };

      // Should not throw, but should log error
      await (notesService as any).indexNotesForSearch([mockNote]);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to index notes for search',
        expect.objectContaining({
          error: expect.any(Error)
        })
      );
    });

    it('should update existing documents during re-indexing', async () => {
      // Ensure searchCollection is properly set up
      (notesService as any).searchCollection = mockCollection;
      
      // First indexing
      const originalNote = {
        id: 'update-note',
        title: 'Original Title',
        content: { textContent: 'Original content', htmlContent: '<p>Original</p>', contentType: 'text/html' as const },
        tags: ['original'],
        notebookId: 'notebook-1',
        sectionId: 'section-1',
        pageId: 'page-1',
        level: 0,
        isReadOnly: false,
        hasAttachments: false,
        createdDateTime: new Date('2023-01-01T00:00:00Z'),
        lastModifiedDateTime: new Date('2023-01-01T00:00:00Z'),
        wordCount: 20,
        characterCount: 100
      };

      await (notesService as any).indexNotesForSearch([originalNote]);

      // Update the same note
      const updatedNote = {
        ...originalNote,
        title: 'Updated Title',
        content: { textContent: 'Updated content', htmlContent: '<p>Updated</p>', contentType: 'text/html' as const },
        tags: ['updated'],
        lastModifiedDateTime: new Date('2023-01-02T00:00:00Z')
      };

      await (notesService as any).indexNotesForSearch([updatedNote]);

      // Should have been called twice
      expect(mockCollection.upsert).toHaveBeenCalledTimes(2);
      
      // Verify updated content
      const internalData = mockCollection._getInternalData();
      expect(internalData.ids).toContain('update-note');
      expect(internalData.documents[0]).toContain('Updated Title');
      expect(internalData.documents[0]).toContain('Updated content');
    });
  });

  describe('Semantic Search Operations', () => {
    beforeEach(() => {
      // Set up collection with pre-indexed data
      const originalInitializeServices = (notesService as any).initializeServices;
      (notesService as any).initializeServices = async function() {
        await originalInitializeServices.call(this);
        this.searchCollection = mockCollection;
      };

      // Pre-populate collection with test data
      mockCollection.upsert({
        ids: ['search-note-1', 'search-note-2', 'search-note-3'],
        documents: [
          'Machine learning algorithms and artificial intelligence research',
          'Project management meeting notes and team coordination',
          'Web development frontend frameworks and JavaScript libraries'
        ],
        metadatas: [
          {
            noteId: 'search-note-1',
            notebookId: 'notebook-ai',
            sectionId: 'section-research',
            title: 'AI Research Notes',
            tags: 'ai,ml,research'
          },
          {
            noteId: 'search-note-2',
            notebookId: 'notebook-work',
            sectionId: 'section-meetings',
            title: 'Project Meeting',
            tags: 'meeting,project'
          },
          {
            noteId: 'search-note-3',
            notebookId: 'notebook-dev',
            sectionId: 'section-frontend',
            title: 'Web Development',
            tags: 'web,frontend,javascript'
          }
        ]
      });
    });

    it('should perform semantic search with relevance ranking', async () => {
      // Ensure searchCollection is properly set up
      (notesService as any).searchCollection = mockCollection;
      // Mock page retrieval for search results
      mockGraphClient.get
        .mockResolvedValueOnce({
          id: 'search-note-1',
          title: 'AI Research Notes',
          parentSection: { id: 'section-research' },
          content: { htmlContent: '<p>ML content</p>' }
        })
        .mockResolvedValueOnce({
          id: 'search-note-3',
          title: 'Web Development',
          parentSection: { id: 'section-frontend' },
          content: { htmlContent: '<p>JS content</p>' }
        });

      const results = await notesService.searchNotes('machine learning', { limit: 10 });

      expect(mockCollection.query).toHaveBeenCalledWith({
        queryTexts: ['machine learning'],
        nResults: 10,
        where: undefined
      });

      // Should return results ordered by relevance
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('AI Research Notes'); // Most relevant
    });

    it('should apply filtering conditions in search', async () => {
      mockGraphClient.get.mockResolvedValueOnce({
        id: 'search-note-2',
        title: 'Project Meeting',
        parentSection: { id: 'section-meetings' },
        content: { htmlContent: '<p>Meeting content</p>' }
      });

      const results = await notesService.searchNotes('project', {
        notebookId: 'notebook-work',
        limit: 5
      });

      expect(mockCollection.query).toHaveBeenCalledWith({
        queryTexts: ['project'],
        nResults: 5,
        where: { notebookId: 'notebook-work' }
      });

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Project Meeting');
    });

    it('should handle complex filtering with multiple conditions', async () => {
      const searchOptions = {
        notebookId: 'notebook-ai',
        sectionId: 'section-research',
        level: 0,
        isReadOnly: false,
        hasAttachments: true,
        limit: 25
      };

      await notesService.searchNotes('artificial intelligence', searchOptions);

      expect(mockCollection.query).toHaveBeenCalledWith({
        queryTexts: ['artificial intelligence'],
        nResults: 25,
        where: {
          notebookId: 'notebook-ai',
          sectionId: 'section-research',
          level: 0,
          isReadOnly: false,
          hasAttachments: true
        }
      });
    });

    it('should handle empty search results gracefully', async () => {
      // Mock empty search results
      mockCollection.query.mockResolvedValueOnce({
        ids: [[]],
        documents: [[]],
        metadatas: [[]],
        distances: [[]]
      });

      const results = await notesService.searchNotes('nonexistent query');

      expect(results).toHaveLength(0);
      expect(mockGraphClient.get).not.toHaveBeenCalled(); // No pages to fetch
    });

    it('should handle search errors with fallback to Graph API', async () => {
      // Ensure searchCollection is properly set up
      (notesService as any).searchCollection = mockCollection;
      mockCollection.query.mockRejectedValueOnce(new Error('ChromaDB search failed'));

      const mockGraphSearchResponse = {
        value: [
          {
            id: 'fallback-result',
            title: 'Fallback Search Result',
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
        .mockResolvedValueOnce(mockGraphSearchResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const results = await notesService.searchNotes('test query');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Fallback Search Result');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to search notes',
        expect.objectContaining({
          query: 'test query'
        })
      );
    });

    it('should handle individual page retrieval failures during search', async () => {
      // Ensure searchCollection is properly set up
      (notesService as any).searchCollection = mockCollection;
      // Mock search results with some failed page retrievals
      mockCollection.query.mockResolvedValueOnce({
        ids: [['valid-note', 'invalid-note', 'another-valid-note']],
        documents: [['doc1', 'doc2', 'doc3']],
        metadatas: [[
          { sectionId: 'section-1' },
          { sectionId: 'section-2' },
          { sectionId: 'section-3' }
        ]]
      });

      mockGraphClient.get
        .mockResolvedValueOnce({
          id: 'valid-note',
          title: 'Valid Note',
          parentSection: { id: 'section-1' }
        })
        .mockRejectedValueOnce(new Error('Page not found'))
        .mockResolvedValueOnce({
          id: 'another-valid-note',
          title: 'Another Valid Note',
          parentSection: { id: 'section-3' }
        });

      const results = await notesService.searchNotes('test query');

      expect(results).toHaveLength(2); // Only successful retrievals
      expect(results[0].title).toBe('Valid Note');
      expect(results[1].title).toBe('Another Valid Note');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to fetch note from search result',
        expect.objectContaining({
          id: 'invalid-note'
        })
      );
    });
  });

  describe('Document Deletion Operations', () => {
    beforeEach(() => {
      const originalInitializeServices = (notesService as any).initializeServices;
      (notesService as any).initializeServices = async function() {
        await originalInitializeServices.call(this);
        this.searchCollection = mockCollection;
      };
    });

    it('should remove documents from search index when pages are deleted', async () => {
      // Pre-populate index
      await mockCollection.upsert({
        ids: ['delete-test-page'],
        documents: ['Document to be deleted'],
        metadatas: [{ noteId: 'delete-test-page', title: 'Delete Test' }]
      });

      mockGraphClient.delete.mockResolvedValueOnce(undefined);

      await notesService.deletePage('delete-test-page', 'section-1');

      expect(mockCollection.delete).toHaveBeenCalledWith({
        ids: ['delete-test-page']
      });

      expect(mockGraphClient.delete).toHaveBeenCalledWith('/me/onenote/pages/delete-test-page');
    });

    it('should handle ChromaDB deletion errors gracefully', async () => {
      mockCollection.delete.mockRejectedValueOnce(new Error('ChromaDB deletion failed'));
      mockGraphClient.delete.mockResolvedValueOnce(undefined);

      // Should not throw error
      await notesService.deletePage('error-page', 'section-1');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to remove page from search index',
        expect.objectContaining({
          pageId: 'error-page'
        })
      );
    });

    it('should handle deletion of non-existent documents', async () => {
      mockGraphClient.delete.mockResolvedValueOnce(undefined);

      // Should not cause errors
      await notesService.deletePage('non-existent-page', 'section-1');

      expect(mockCollection.delete).toHaveBeenCalledWith({
        ids: ['non-existent-page']
      });
    });
  });

  describe('Vector Embeddings and Similarity', () => {
    it('should handle documents with similar semantic meaning', async () => {
      // Ensure searchCollection is properly set up
      (notesService as any).searchCollection = mockCollection;
      const originalInitializeServices = (notesService as any).initializeServices;
      (notesService as any).initializeServices = async function() {
        await originalInitializeServices.call(this);
        this.searchCollection = mockCollection;
      };

      // Index semantically similar documents
      await mockCollection.upsert({
        ids: ['similar-1', 'similar-2', 'different-1'],
        documents: [
          'Machine learning and artificial intelligence concepts',
          'AI and ML algorithms for data processing',
          'Cooking recipes and culinary techniques'
        ],
        metadatas: [
          { noteId: 'similar-1', title: 'ML Concepts', sectionId: 'section-ai' },
          { noteId: 'similar-2', title: 'AI Algorithms', sectionId: 'section-ai' },
          { noteId: 'different-1', title: 'Cooking Guide', sectionId: 'section-food' }
        ]
      });

      // Mock the collection to return semantically similar results
      mockCollection.query.mockResolvedValueOnce({
        ids: [['similar-1', 'similar-2']],
        documents: [
          ['Machine learning and artificial intelligence concepts', 'AI and ML algorithms for data processing']
        ],
        metadatas: [[
          { noteId: 'similar-1', title: 'ML Concepts', sectionId: 'section-ai' },
          { noteId: 'similar-2', title: 'AI Algorithms', sectionId: 'section-ai' }
        ]],
        distances: [[0.1, 0.15]] // Low distances indicate high similarity
      });

      mockGraphClient.get
        .mockResolvedValueOnce({
          id: 'similar-1',
          title: 'ML Concepts',
          parentSection: { id: 'section-ai' }
        })
        .mockResolvedValueOnce({
          id: 'similar-2',
          title: 'AI Algorithms',
          parentSection: { id: 'section-ai' }
        });

      const results = await notesService.searchNotes('neural networks');

      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('ML Concepts');
      expect(results[1].title).toBe('AI Algorithms');
    });

    it('should handle multilingual semantic search', async () => {
      // Ensure searchCollection is properly set up  
      (notesService as any).searchCollection = mockCollection;

      // Index multilingual documents
      await mockCollection.upsert({
        ids: ['english-note', 'spanish-note', 'chinese-note'],
        documents: [
          'Machine learning artificial intelligence technology',
          'Aprendizaje automático inteligencia artificial tecnología',
          '机器学习 人工智能 技术'
        ],
        metadatas: [
          { noteId: 'english-note', title: 'AI in English', sectionId: 'section-en' },
          { noteId: 'spanish-note', title: 'IA en Español', sectionId: 'section-es' },
          { noteId: 'chinese-note', title: '中文AI笔记', sectionId: 'section-zh' }
        ]
      });

      mockCollection.query.mockResolvedValueOnce({
        ids: [['english-note', 'spanish-note', 'chinese-note']],
        documents: [
          ['English doc', 'Spanish doc', 'Chinese doc']
        ],
        metadatas: [[
          { noteId: 'english-note', title: 'AI in English', sectionId: 'section-en' },
          { noteId: 'spanish-note', title: 'IA en Español', sectionId: 'section-es' },
          { noteId: 'chinese-note', title: '中文AI笔记', sectionId: 'section-zh' }
        ]]
      });

      // Mock Graph API responses for getPage calls
      mockGraphClient.get.mockImplementation((endpoint: string) => {
        if (endpoint === '/me/onenote/pages/english-note') {
          return Promise.resolve({
            id: 'english-note',
            title: 'AI in English',
            parentSection: { id: 'section-en' },
            level: 0,
            order: 0,
            createdDateTime: '2023-01-01T00:00:00Z',
            lastModifiedDateTime: '2023-01-01T00:00:00Z'
          });
        }
        if (endpoint === '/me/onenote/pages/spanish-note') {
          return Promise.resolve({
            id: 'spanish-note', 
            title: 'IA en Español',
            parentSection: { id: 'section-es' },
            level: 0,
            order: 1,
            createdDateTime: '2023-01-01T00:00:00Z',
            lastModifiedDateTime: '2023-01-01T00:00:00Z'
          });
        }
        if (endpoint === '/me/onenote/pages/chinese-note') {
          return Promise.resolve({
            id: 'chinese-note',
            title: '中文AI笔记',
            parentSection: { id: 'section-zh' },
            level: 0,
            order: 2,
            createdDateTime: '2023-01-01T00:00:00Z',
            lastModifiedDateTime: '2023-01-01T00:00:00Z'
          });
        }
        if (endpoint.startsWith('/me/onenote/sections/section-')) {
          const sectionId = endpoint.split('/').pop();
          return Promise.resolve({
            id: sectionId,
            displayName: `Section ${sectionId}`,
            parentNotebook: { id: 'notebook-1' }
          });
        }
        return Promise.resolve({ value: [] });
      });

      const results = await notesService.searchNotes('artificial intelligence');

      expect(results).toHaveLength(3);
      expect(results.some(r => r.title === 'AI in English')).toBe(true);
      expect(results.some(r => r.title === 'IA en Español')).toBe(true);
      expect(results.some(r => r.title === '中文AI笔记')).toBe(true);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large-scale indexing efficiently', async () => {
      // Ensure searchCollection is properly set up
      (notesService as any).searchCollection = mockCollection;

      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        id: `large-note-${i}`,
        title: `Large Note ${i}`,
        content: {
          textContent: `Content for large note ${i} with some keywords and phrases`,
          htmlContent: `<p>Content ${i}</p>`,
          contentType: 'text/html' as const
        },
        tags: [`tag-${i % 100}`, 'large-dataset'],
        notebookId: `notebook-${Math.floor(i / 1000)}`,
        sectionId: `section-${Math.floor(i / 100)}`,
        pageId: `page-${i}`,
        level: i % 5,
        isReadOnly: false,
        hasAttachments: i % 50 === 0,
        createdDateTime: new Date(`2023-${String(Math.floor(i / 100) % 12 + 1).padStart(2, '0')}-01T00:00:00Z`),
        lastModifiedDateTime: new Date(`2023-${String(Math.floor(i / 100) % 12 + 1).padStart(2, '0')}-01T01:00:00Z`),
        wordCount: 50 + (i % 100),
        characterCount: 300 + (i % 500)
      }));

      const startTime = Date.now();

      await (notesService as any).indexNotesForSearch(largeDataset);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(mockCollection.upsert).toHaveBeenCalledWith({
        ids: largeDataset.map(note => note.id),
        documents: largeDataset.map(note => 
          `${note.title} ${note.content.textContent} ${note.tags.join(' ')}`
        ),
        metadatas: expect.any(Array)
      });

      // Should complete large indexing within reasonable time
      expect(executionTime).toBeLessThan(5000);
    });

    it('should handle concurrent search operations', async () => {
      // Ensure searchCollection is properly set up
      (notesService as any).searchCollection = mockCollection;

      const concurrentSearches = 20;
      const searchQueries = Array.from({ length: concurrentSearches }, (_, i) => 
        `search query ${i}`
      );

      // Clear any previous mock calls
      mockCollection.query.mockClear();

      // Mock concurrent search results - return a different result for each call
      let callCount = 0;
      mockCollection.query.mockImplementation(({ queryTexts }) => {
        const currentCall = callCount++;
        return Promise.resolve({
          ids: [[`concurrent-result-${currentCall}`]],
          documents: [[`Result for ${queryTexts[0]}`]],
          metadatas: [[{ 
            noteId: `concurrent-result-${currentCall}`,
            title: `Result ${currentCall}`,
            sectionId: 'section-concurrent'
          }]]
        });
      });

      // Mock page retrievals for all concurrent searches
      mockGraphClient.get.mockImplementation((endpoint: string) => {
        if (endpoint.startsWith('/me/onenote/pages/concurrent-result-')) {
          const resultIndex = endpoint.split('-').pop();
          return Promise.resolve({
            id: `concurrent-result-${resultIndex}`,
            title: `Result ${resultIndex}`,
            parentSection: { id: 'section-concurrent' },
            level: 0,
            order: parseInt(resultIndex || '0'),
            createdDateTime: '2023-01-01T00:00:00Z',
            lastModifiedDateTime: '2023-01-01T00:00:00Z'
          });
        }
        if (endpoint === '/me/onenote/sections/section-concurrent') {
          return Promise.resolve({
            id: 'section-concurrent',
            displayName: 'Concurrent Section',
            parentNotebook: { id: 'notebook-1' }
          });
        }
        return Promise.resolve({ value: [] });
      });

      const startTime = Date.now();

      const searchPromises = searchQueries.map(query => 
        notesService.searchNotes(query, { limit: 5 })
      );

      const results = await Promise.all(searchPromises);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(results).toHaveLength(concurrentSearches);
      expect(mockCollection.query).toHaveBeenCalledTimes(concurrentSearches);
      
      // Concurrent searches should complete efficiently
      expect(executionTime).toBeLessThan(3000);
    });
  });
});