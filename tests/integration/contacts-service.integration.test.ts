import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { ContactsService } from '../../src/infrastructure/adapters/microsoft/services/ContactsService';
import { GraphClient } from '../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { CacheManager } from '../../src/infrastructure/cache/CacheManager';
import { ChromaDbInitializer } from '../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer';
import { ErrorHandler } from '../../src/infrastructure/adapters/microsoft/errors/ErrorHandler';
import { Logger } from '../../src/shared/logging/Logger';
import { Contact } from '../../src/domain/entities/Contact';
import { EmailAddress } from '../../src/domain/value-objects/EmailAddress';
import { PhoneNumber } from '../../src/domain/value-objects/PhoneNumber';
import { PersonName } from '../../src/domain/value-objects/PersonName';
import nock from 'nock';

/**
 * Contacts Service Integration Tests
 * 
 * Tests the ContactsService functionality including:
 * - Contact CRUD operations
 * - Contact searching and filtering
 * - Email-based contact lookup
 * - Contact folder management
 * - Graph API integration
 * - Caching and ChromaDB integration
 */
describe('ContactsService Integration Tests', () => {
  let contactsService: ContactsService;
  let mockGraphClient: jest.Mocked<GraphClient>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockChromaDb: jest.Mocked<ChromaDbInitializer>;
  let mockErrorHandler: jest.Mocked<ErrorHandler>;
  let mockLogger: jest.Mocked<Logger>;

  // Test data
  const testContactId = 'test-contact-123';
  const testUserId = 'test-user-789';
  const testFolderId = 'test-folder-456';

  const sampleContact: Contact = {
    id: testContactId,
    name: PersonName.create('John', 'Doe', 'Michael'),
    displayName: 'John Doe',
    emailAddresses: [
      EmailAddress.work('john.doe@company.com'),
      EmailAddress.personal('john@personal.email')
    ],
    phoneNumbers: [
      PhoneNumber.work('+1-555-123-4567'),
      PhoneNumber.mobile('+1-555-987-6543')
    ],
    addresses: [
      {
        type: 'business',
        street: '123 Business Ave',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'USA'
      },
      {
        type: 'home',
        street: '456 Home St',
        city: 'Brooklyn',
        state: 'NY',
        postalCode: '11201',
        country: 'USA'
      }
    ],
    organization: {
      company: 'Test Company Inc.',
      department: 'Engineering',
      title: 'Senior Developer',
      office: 'NYC Office'
    },
    personalInfo: {
      birthday: new Date('1990-05-15'),
      anniversary: new Date('2015-06-20'),
      spouse: 'Jane Doe',
      children: ['Child 1', 'Child 2']
    },
    socialProfiles: [
      {
        platform: 'LinkedIn',
        url: 'https://linkedin.com/in/johndoe',
        username: 'johndoe'
      },
      {
        platform: 'Twitter',
        url: 'https://twitter.com/johndoe',
        username: '@johndoe'
      }
    ],
    notes: 'Important client contact',
    categories: ['VIP', 'Client', 'Engineering'],
    isFavorite: true,
    metadata: {
      changeKey: 'test-change-key',
      createdDateTime: new Date('2024-01-15T10:00:00Z'),
      lastModifiedDateTime: new Date('2024-11-01T14:30:00Z'),
      etag: 'test-etag',
      parentFolderId: testFolderId,
      flag: {
        flagStatus: 'complete',
        completedDateTime: new Date('2024-10-15T16:00:00Z'),
        dueDateTime: new Date('2024-10-20T17:00:00Z')
      }
    }
  };

  const sampleGraphContact = {
    id: testContactId,
    givenName: 'John',
    surname: 'Doe',
    middleName: 'Michael',
    displayName: 'John Doe',
    nickName: 'Johnny',
    title: 'Mr.',
    emailAddresses: [
      {
        address: 'john.doe@company.com',
        name: 'John Doe',
        type: 'work'
      },
      {
        address: 'john@personal.email',
        name: 'John Doe',
        type: 'personal'
      }
    ],
    businessPhones: ['+1-555-123-4567'],
    homePhones: ['+1-555-111-2222'],
    mobilePhone: '+1-555-987-6543',
    otherPhones: ['+1-555-333-4444'],
    businessAddress: {
      street: '123 Business Ave',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      countryOrRegion: 'USA'
    },
    homeAddress: {
      street: '456 Home St',
      city: 'Brooklyn',
      state: 'NY',
      postalCode: '11201',
      countryOrRegion: 'USA'
    },
    companyName: 'Test Company Inc.',
    department: 'Engineering',
    jobTitle: 'Senior Developer',
    officeLocation: 'NYC Office',
    birthday: '1990-05-15T00:00:00.000Z',
    anniversary: '2015-06-20T00:00:00.000Z',
    personalNotes: 'Important client contact',
    categories: ['VIP', 'Client', 'Engineering'],
    imAddresses: [
      {
        address: 'johndoe@teams.microsoft.com',
        type: 'skype'
      }
    ],
    isFavorite: true,
    parentFolderId: testFolderId,
    changeKey: 'test-change-key',
    createdDateTime: '2024-01-15T10:00:00.000Z',
    lastModifiedDateTime: '2024-11-01T14:30:00.000Z',
    '@odata.etag': 'W/"test-etag"',
    flag: {
      flagStatus: 'complete',
      completedDateTime: '2024-10-15T16:00:00.000Z',
      dueDateTime: '2024-10-20T17:00:00.000Z'
    }
  };

  beforeAll(async () => {
    // Setup nock to intercept HTTP requests
    nock.disableNetConnect();
    nock.enableNetConnect('localhost');
  });

  afterAll(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  beforeEach(() => {
    // Create mocks
    mockGraphClient = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      authenticateUser: jest.fn(),
      refreshToken: jest.fn(),
      isAuthenticated: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({ id: testUserId }),
      dispose: jest.fn()
    } as jest.Mocked<GraphClient>;

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
      has: jest.fn(),
      keys: jest.fn(),
      size: jest.fn(),
      dispose: jest.fn()
    } as jest.Mocked<CacheManager>;

    mockChromaDb = {
      initialize: jest.fn(),
      ensureCollection: jest.fn(),
      addDocuments: jest.fn(),
      searchDocuments: jest.fn(),
      updateDocuments: jest.fn(),
      deleteDocuments: jest.fn(),
      dispose: jest.fn()
    } as jest.Mocked<ChromaDbInitializer>;

    mockErrorHandler = {
      handleGraphError: jest.fn(),
      isRetryableError: jest.fn(),
      getErrorCategory: jest.fn(),
      createClientError: jest.fn(),
      createServerError: jest.fn(),
      createNetworkError: jest.fn()
    } as jest.Mocked<ErrorHandler>;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as jest.Mocked<Logger>;

    // Create service instance
    contactsService = new ContactsService(
      mockGraphClient,
      mockCacheManager,
      mockChromaDb,
      mockErrorHandler,
      mockLogger
    );

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Contact CRUD Operations', () => {
    test('should retrieve a contact by ID', async () => {
      // Mock cache miss
      mockCacheManager.get.mockResolvedValue(null);
      
      // Mock successful Graph API response
      mockGraphClient.get.mockResolvedValue({
        data: sampleGraphContact,
        status: 200,
        headers: {}
      });

      const result = await contactsService.getContact(testContactId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(testContactId);
      expect(result.data!.displayName).toBe('John Doe');
      expect(result.data!.name.first).toBe('John');
      expect(result.data!.name.last).toBe('Doe');
      
      // Verify Graph API was called
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        `/me/contacts/${testContactId}`,
        expect.objectContaining({
          params: expect.objectContaining({
            $select: expect.stringContaining('givenName,surname')
          })
        })
      );

      // Verify caching
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    test('should return cached contact when available', async () => {
      // Mock cache hit
      mockCacheManager.get.mockResolvedValue(sampleContact);

      const result = await contactsService.getContact(testContactId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleContact);
      
      // Verify Graph API was NOT called
      expect(mockGraphClient.get).not.toHaveBeenCalled();
      
      // Verify cache was checked
      expect(mockCacheManager.get).toHaveBeenCalledWith(
        expect.stringContaining(testContactId)
      );
    });

    test('should create a new contact', async () => {
      const newContact = {
        ...sampleContact,
        id: undefined // New contact has no ID
      };

      // Mock successful creation
      mockGraphClient.post.mockResolvedValue({
        data: sampleGraphContact,
        status: 201,
        headers: {}
      });

      const result = await contactsService.createContact(newContact);

      expect(result.success).toBe(true);
      expect(result.data).toBe(testContactId);
      
      // Verify Graph API was called
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        '/me/contacts',
        expect.objectContaining({
          givenName: 'John',
          surname: 'Doe',
          displayName: 'John Doe'
        })
      );

      // Verify ChromaDB indexing
      expect(mockChromaDb.addDocuments).toHaveBeenCalled();
    });

    test('should update an existing contact', async () => {
      const updates = {
        displayName: 'John Michael Doe',
        jobTitle: 'Lead Developer'
      };

      // Mock successful update
      mockGraphClient.patch.mockResolvedValue({
        data: { 
          ...sampleGraphContact, 
          displayName: 'John Michael Doe',
          jobTitle: 'Lead Developer'
        },
        status: 200,
        headers: {}
      });

      const result = await contactsService.updateContact(testContactId, updates);

      expect(result.success).toBe(true);
      expect(result.data!.displayName).toBe('John Michael Doe');
      
      // Verify Graph API was called
      expect(mockGraphClient.patch).toHaveBeenCalledWith(
        `/me/contacts/${testContactId}`,
        expect.objectContaining({
          displayName: 'John Michael Doe',
          jobTitle: 'Lead Developer'
        })
      );

      // Verify cache invalidation
      expect(mockCacheManager.delete).toHaveBeenCalled();
    });

    test('should delete a contact', async () => {
      // Mock successful deletion
      mockGraphClient.delete.mockResolvedValue({
        data: null,
        status: 204,
        headers: {}
      });

      const result = await contactsService.deleteContact(testContactId);

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
      
      // Verify Graph API was called
      expect(mockGraphClient.delete).toHaveBeenCalledWith(
        `/me/contacts/${testContactId}`
      );

      // Verify cleanup
      expect(mockCacheManager.delete).toHaveBeenCalled();
      expect(mockChromaDb.deleteDocuments).toHaveBeenCalled();
    });
  });

  describe('Contact Search and Filtering', () => {
    test('should search contacts with query parameters', async () => {
      const searchOptions = {
        query: 'John',
        company: 'Test Company',
        limit: 10
      };

      // Mock search results
      mockGraphClient.get.mockResolvedValue({
        data: {
          value: [sampleGraphContact],
          '@odata.nextLink': null
        },
        status: 200,
        headers: {}
      });

      const result = await contactsService.searchContacts(searchOptions);

      expect(result.success).toBe(true);
      expect(result.data.contacts).toHaveLength(1);
      expect(result.data.contacts[0].displayName).toBe('John Doe');
      
      // Verify Graph API was called with search parameters
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/contacts',
        expect.objectContaining({
          params: expect.objectContaining({
            $search: '"John"',
            $top: 10
          })
        })
      );
    });

    test('should filter contacts by email address', async () => {
      const emailAddress = 'john.doe@company.com';

      mockGraphClient.get.mockResolvedValue({
        data: {
          value: [sampleGraphContact]
        },
        status: 200,
        headers: {}
      });

      const result = await contactsService.findByEmail(emailAddress);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].displayName).toBe('John Doe');
      
      // Verify filtering was applied
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/contacts',
        expect.objectContaining({
          params: expect.objectContaining({
            $filter: expect.stringContaining(emailAddress)
          })
        })
      );
    });

    test('should search contacts by company', async () => {
      const searchOptions = {
        company: 'Test Company',
        limit: 5
      };

      mockGraphClient.get.mockResolvedValue({
        data: {
          value: [sampleGraphContact],
          '@odata.nextLink': null
        },
        status: 200,
        headers: {}
      });

      const result = await contactsService.searchContacts(searchOptions);

      expect(result.success).toBe(true);
      expect(result.data.contacts).toHaveLength(1);
      
      // Verify company filtering
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/contacts',
        expect.objectContaining({
          params: expect.objectContaining({
            $filter: expect.stringContaining('companyName')
          })
        })
      );
    });

    test('should search contacts by job title', async () => {
      const searchOptions = {
        jobTitle: 'Developer',
        limit: 20
      };

      mockGraphClient.get.mockResolvedValue({
        data: {
          value: [sampleGraphContact],
          '@odata.nextLink': null
        },
        status: 200,
        headers: {}
      });

      const result = await contactsService.searchContacts(searchOptions);

      expect(result.success).toBe(true);
      expect(result.data.contacts).toHaveLength(1);
      
      // Verify job title filtering
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        '/me/contacts',
        expect.objectContaining({
          params: expect.objectContaining({
            $filter: expect.stringContaining('jobTitle')
          })
        })
      );
    });
  });

  describe('Contact Folder Management', () => {
    test('should list contact folders', async () => {
      const mockFolders = [
        {
          id: 'folder-1',
          displayName: 'Contacts',
          parentFolderId: null,
          totalItemCount: 150,
          childFolderCount: 2,
          unreadItemCount: 0
        },
        {
          id: 'folder-2',
          displayName: 'VIP Contacts',
          parentFolderId: 'folder-1',
          totalItemCount: 25,
          childFolderCount: 0,
          unreadItemCount: 0
        }
      ];

      mockGraphClient.get.mockResolvedValue({
        data: { value: mockFolders },
        status: 200,
        headers: {}
      });

      const result = await contactsService.getContactFolders();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].displayName).toBe('Contacts');
      expect(result.data[1].displayName).toBe('VIP Contacts');
      
      // Verify Graph API was called
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/contactFolders');
    });

    test('should get contacts in a specific folder', async () => {
      const searchOptions = {
        limit: 50,
        orderBy: 'displayName',
        orderDirection: 'asc' as const
      };

      mockGraphClient.get.mockResolvedValue({
        data: {
          value: [sampleGraphContact],
          '@odata.nextLink': null
        },
        status: 200,
        headers: {}
      });

      const result = await contactsService.getContactsInFolder(testFolderId, searchOptions);

      expect(result.success).toBe(true);
      expect(result.data.contacts).toHaveLength(1);
      
      // Verify Graph API was called with folder ID
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        `/me/contactFolders/${testFolderId}/contacts`,
        expect.objectContaining({
          params: expect.objectContaining({
            $top: 50,
            $orderby: 'displayName asc'
          })
        })
      );
    });
  });

  describe('Organization and Business Logic', () => {
    test('should get unique organizations from contacts', async () => {
      const mockContacts = [
        { ...sampleGraphContact, companyName: 'Company A' },
        { ...sampleGraphContact, id: 'contact-2', companyName: 'Company B' },
        { ...sampleGraphContact, id: 'contact-3', companyName: 'Company A' },
        { ...sampleGraphContact, id: 'contact-4', companyName: 'Company C' }
      ];

      mockGraphClient.get.mockResolvedValue({
        data: { value: mockContacts },
        status: 200,
        headers: {}
      });

      const result = await contactsService.getOrganizations();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['Company A', 'Company B', 'Company C']);
      
      // Should only contain unique companies
      expect(new Set(result.data).size).toBe(result.data.length);
    });

    test('should handle contacts without company information', async () => {
      const mockContacts = [
        { ...sampleGraphContact, companyName: 'Company A' },
        { ...sampleGraphContact, id: 'contact-2', companyName: null },
        { ...sampleGraphContact, id: 'contact-3', companyName: '' },
        { ...sampleGraphContact, id: 'contact-4', companyName: 'Company B' }
      ];

      mockGraphClient.get.mockResolvedValue({
        data: { value: mockContacts },
        status: 200,
        headers: {}
      });

      const result = await contactsService.getOrganizations();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(['Company A', 'Company B']);
      
      // Should filter out null and empty company names
      expect(result.data).not.toContain(null);
      expect(result.data).not.toContain('');
    });
  });

  describe('Error Handling', () => {
    test('should handle Graph API errors gracefully', async () => {
      const error = new Error('Graph API Error');
      mockGraphClient.get.mockRejectedValue(error);

      const result = await contactsService.getContact(testContactId);

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get contact'),
        error
      );
    });

    test('should handle authentication errors', async () => {
      mockGraphClient.isAuthenticated.mockReturnValue(false);

      const result = await contactsService.getContact(testContactId);

      expect(result.success).toBe(false);
    });

    test('should handle network timeouts', async () => {
      const timeoutError = new Error('Network timeout');
      mockGraphClient.get.mockRejectedValue(timeoutError);

      const result = await contactsService.searchContacts({ query: 'test' });

      expect(result.success).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    test('should handle invalid contact data', async () => {
      const invalidContact = {
        // Missing required fields
        emailAddresses: []
      };

      const result = await contactsService.createContact(invalidContact as any);

      expect(result.success).toBe(false);
    });
  });

  describe('Performance and Caching', () => {
    test('should cache frequently accessed contacts', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockGraphClient.get.mockResolvedValue({
        data: sampleGraphContact,
        status: 200,
        headers: {}
      });

      await contactsService.getContact(testContactId);

      // Verify caching occurred
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining(testContactId),
        expect.any(Object),
        3600 // 1 hour cache
      );
    });

    test('should batch multiple contact requests efficiently', async () => {
      const contactIds = ['contact-1', 'contact-2', 'contact-3'];
      
      mockCacheManager.get.mockResolvedValue(null);
      mockGraphClient.get.mockResolvedValue({
        data: sampleGraphContact,
        status: 200,
        headers: {}
      });

      // Simulate concurrent requests
      const promises = contactIds.map(id => 
        contactsService.getContact(id)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    test('should handle pagination in search results', async () => {
      const searchOptions = { limit: 2 };
      
      // Mock paginated response
      mockGraphClient.get.mockResolvedValue({
        data: {
          value: [sampleGraphContact, { ...sampleGraphContact, id: 'contact-2' }],
          '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/contacts?$skip=2'
        },
        status: 200,
        headers: {}
      });

      const result = await contactsService.searchContacts(searchOptions);

      expect(result.success).toBe(true);
      expect(result.data.contacts).toHaveLength(2);
      expect(result.data.pagination).toBeDefined();
      expect(result.data.pagination.hasMore).toBe(true);
    });
  });

  describe('ChromaDB Integration', () => {
    test('should index contacts for semantic search', async () => {
      const newContact = { ...sampleContact, id: undefined };
      
      mockGraphClient.post.mockResolvedValue({
        data: sampleGraphContact,
        status: 201,
        headers: {}
      });

      await contactsService.createContact(newContact);

      // Verify ChromaDB indexing
      expect(mockChromaDb.addDocuments).toHaveBeenCalledWith(
        'graph-search-index',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'contact',
            name: 'John Doe'
          })
        ]),
        expect.any(Array),
        expect.any(Array)
      );
    });

    test('should update ChromaDB when contacts are modified', async () => {
      const updates = { displayName: 'John Michael Doe' };
      
      mockGraphClient.patch.mockResolvedValue({
        data: { ...sampleGraphContact, displayName: 'John Michael Doe' },
        status: 200,
        headers: {}
      });

      await contactsService.updateContact(testContactId, updates);

      // Verify ChromaDB update
      expect(mockChromaDb.updateDocuments).toHaveBeenCalledWith(
        'graph-search-index',
        expect.arrayContaining([testContactId]),
        expect.arrayContaining([
          expect.objectContaining({
            name: 'John Michael Doe'
          })
        ])
      );
    });

    test('should support semantic search queries', async () => {
      const searchOptions = {
        query: 'software engineer at tech company',
        useSemanticSearch: true
      };

      // Mock ChromaDB semantic search
      mockChromaDb.searchDocuments.mockResolvedValue([
        {
          id: testContactId,
          metadata: { type: 'contact' },
          distance: 0.8
        }
      ]);

      mockGraphClient.get.mockResolvedValue({
        data: sampleGraphContact,
        status: 200,
        headers: {}
      });

      const result = await contactsService.searchContacts(searchOptions);

      expect(result.success).toBe(true);
      expect(mockChromaDb.searchDocuments).toHaveBeenCalledWith(
        'graph-search-index',
        'software engineer at tech company',
        expect.any(Number),
        expect.objectContaining({
          where: { type: 'contact' }
        })
      );
    });
  });
});