import { Logger } from '../../../../shared/logging/Logger.js';
import { Contact, ContactEntity } from '../../../../domain/entities/Contact.js';
import {
  PaginationInfo,
  PlatformResult,
  SearchCriteria,
} from '../../../../domain/interfaces/PlatformPort.js';
import { GraphClient } from '../clients/GraphClient.js';
import { CacheManager } from '@infrastructure/cache/CacheManager.js';
import { ChromaDbInitializer } from '@infrastructure/cache/ChromaDbInitializer.js';
import { ContactsMapper } from '../mappers/ContactsMapper.js';
import { ErrorHandler } from '../errors/ErrorHandler.js';

/**
 * Contact query options for searching
 */
export interface ContactQueryOptions {
  query?: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  emailAddress?: string;
  phoneNumber?: string;
  companyName?: string;
  department?: string;
  jobTitle?: string;
  categories?: string[];
  isFavorite?: boolean;
  hasPhoto?: boolean;
  limit?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Contact search result with pagination
 */
export interface ContactSearchResult {
  contacts: Contact[];
  pagination: PaginationInfo;
  totalCount: number;
  nextPageToken?: string;
}

/**
 * Microsoft Graph Contacts Service
 * Implements contact operations using Graph API
 */
export class ContactsService {
  private readonly logger: Logger;
  private readonly cacheKeyPrefix = 'graph:contact:';

  constructor(
    private readonly graphClient: GraphClient,
    private readonly cacheManager: CacheManager,
    private readonly chromaDb: ChromaDbInitializer,
    private readonly errorHandler: ErrorHandler,
    logger: Logger
  ) {
    this.logger = logger;
  }

  /**
   * Get a single contact by ID
   */
  async getContact(id: string): Promise<PlatformResult<Contact>> {
    try {
      // Check cache first
      const cacheKey = `${this.cacheKeyPrefix}${id}`;
      const cached = await this.cacheManager.get(cacheKey);

      if (cached) {
        this.logger.debug(`Contact ${id} retrieved from cache`);
        return {
          success: true,
          data: cached as Contact,
        };
      }

      // Fetch from Graph API
      const response = await this.graphClient.get<any>(`/me/contacts/${id}`, {
        params: {
          $select: [
            'id', 'givenName', 'surname', 'middleName', 'displayName', 'nickName', 'title',
            'emailAddresses', 'businessPhones', 'homePhones', 'mobilePhone', 'otherPhones',
            'businessAddress', 'homeAddress', 'otherAddress',
            'companyName', 'department', 'jobTitle', 'officeLocation',
            'birthday', 'anniversary', 'personalNotes', 'categories',
            'imAddresses', 'isFavorite', 'flag', 'parentFolderId', 'changeKey',
            'createdDateTime', 'lastModifiedDateTime', '@odata.etag', 'webUrl'
          ].join(','),
        },
      });

      // Map to domain entity
      const contact = ContactsMapper.toDomainContact(response);

      // Cache the result
      await (this.cacheManager as any).set(cacheKey, contact, 3600); // Cache for 1 hour

      // Index in ChromaDB for search
      await this.indexContact(contact);

      return {
        success: true,
        data: contact,
      };
    } catch (error) {
      this.logger.error(`Failed to get contact ${id}`, error);
      throw error;
    }
  }

  /**
   * Search contacts with filters and pagination
   */
  async searchContacts(options: ContactQueryOptions): Promise<PlatformResult<ContactSearchResult>> {
    try {
      // Build filter query
      const filter = this.buildFilterQuery(options);

      // Build request parameters
      const params: any = {
        $top: options.limit || 25,
        $skip: options.skip || 0,
        $count: true,
        $select: [
          'id', 'givenName', 'surname', 'middleName', 'displayName', 'nickName',
          'emailAddresses', 'businessPhones', 'mobilePhone',
          'companyName', 'department', 'jobTitle',
          'categories', 'isFavorite', 'parentFolderId',
          'createdDateTime', 'lastModifiedDateTime'
        ].join(','),
      };

      if (filter) {
        params['$filter'] = filter;
      }

      if (options.orderBy) {
        params['$orderby'] = `${options.orderBy} ${options.orderDirection || 'asc'}`;
      } else {
        params['$orderby'] = 'displayName asc';
      }

      if (options.query) {
        params['$search'] = `"${options.query}"`;
      }

      // Execute search
      const response = await this.graphClient.get<any>('/me/contacts', { params });

      // Map contacts
      const contacts = ContactsMapper.toDomainContacts(response.value || []);

      // Index contacts for future searches
      await Promise.all(contacts.map(contact => this.indexContact(contact)));

      // Build pagination info
      const totalCount = response['@odata.count'] || contacts.length;
      const currentPage = Math.floor((options.skip || 0) / (options.limit || 25)) + 1;
      const pageSize = options.limit || 25;
      const hasNextPage = (options.skip || 0) + contacts.length < totalCount;
      const hasPreviousPage = (options.skip || 0) > 0;

      const result: ContactSearchResult = {
        contacts,
        totalCount,
        pagination: {
          total: totalCount,
          page: currentPage,
          pageSize,
          hasNextPage,
          hasPreviousPage,
          nextCursor: response['@odata.nextLink']
            ? this.extractNextPageToken(response['@odata.nextLink'])
            : undefined,
        },
        nextPageToken: response['@odata.nextLink']
          ? this.extractNextPageToken(response['@odata.nextLink'])
          : undefined,
      };

      return {
        success: true,
        data: result,
        pagination: result.pagination,
      };
    } catch (error) {
      this.logger.error('Failed to search contacts', error);
      throw error;
    }
  }

  /**
   * Create a new contact
   */
  async createContact(contact: Partial<Contact>): Promise<PlatformResult<string>> {
    try {
      // Convert to Graph format
      const graphContact = ContactsMapper.toGraphContact(contact);

      // Create via Graph API
      const response = await this.graphClient.post<any>('/me/contacts', graphContact);

      const contactId = response.id;
      this.logger.info(`Contact created successfully: ${contactId}`);

      // Cache the created contact
      const domainContact = ContactsMapper.toDomainContact(response);
      await (this.cacheManager as any).set(`${this.cacheKeyPrefix}${contactId}`, domainContact, 3600);

      // Index in ChromaDB
      await this.indexContact(domainContact);

      return {
        success: true,
        data: contactId,
      };
    } catch (error) {
      this.logger.error('Failed to create contact', error);
      throw error;
    }
  }

  /**
   * Update an existing contact
   */
  async updateContact(contactId: string, updates: Partial<Contact>): Promise<PlatformResult<Contact>> {
    try {
      const graphUpdate = ContactsMapper.toGraphUpdate(updates);

      const response = await this.graphClient.patch<any>(`/me/contacts/${contactId}`, graphUpdate);

      const updatedContact = ContactsMapper.toDomainContact(response);

      // Update cache
      await (this.cacheManager as any).set(`${this.cacheKeyPrefix}${contactId}`, updatedContact, 3600);

      // Update ChromaDB index
      await this.indexContact(updatedContact);

      return {
        success: true,
        data: updatedContact,
      };
    } catch (error) {
      this.logger.error(`Failed to update contact ${contactId}`, error);
      throw error;
    }
  }

  /**
   * Delete a contact
   */
  async deleteContact(contactId: string): Promise<PlatformResult<boolean>> {
    try {
      await this.graphClient.delete(`/me/contacts/${contactId}`);

      // Remove from cache
      await this.cacheManager.delete(`${this.cacheKeyPrefix}${contactId}`);

      // Remove from ChromaDB index
      // TODO: Implement contact deletion from vector store
      // await this.chromaDb.deleteDocuments({
      //   collection: 'graph-search-index',
      //   ids: [`contact_${contactId}`]
      // });

      this.logger.info(`Contact ${contactId} deleted successfully`);

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      this.logger.error(`Failed to delete contact ${contactId}`, error);
      throw error;
    }
  }

  /**
   * Get contact by email address
   */
  async findByEmail(emailAddress: string): Promise<PlatformResult<Contact[]>> {
    try {
      const options: ContactQueryOptions = {
        emailAddress,
        limit: 10,
      };

      const result = await this.searchContacts(options);

      if (result.success && result.data) {
        return {
          success: true,
          data: result.data.contacts,
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to find contacts by email',
      };
    } catch (error) {
      this.logger.error(`Failed to find contacts by email ${emailAddress}`, error);
      throw error;
    }
  }

  /**
   * Get contact folders
   */
  async getContactFolders(): Promise<PlatformResult<any[]>> {
    try {
      const response = await this.graphClient.get<any>('/me/contactFolders');
      return {
        success: true,
        data: response.value || [],
      };
    } catch (error) {
      this.logger.error('Failed to get contact folders', error);
      throw error;
    }
  }

  /**
   * Get contacts in a specific folder
   */
  async getContactsInFolder(folderId: string, options: ContactQueryOptions = {}): Promise<PlatformResult<ContactSearchResult>> {
    try {
      // Build request parameters
      const params: any = {
        $top: options.limit || 25,
        $skip: options.skip || 0,
        $count: true,
        $select: [
          'id', 'givenName', 'surname', 'displayName',
          'emailAddresses', 'businessPhones', 'mobilePhone',
          'companyName', 'jobTitle', 'categories'
        ].join(','),
      };

      if (options.orderBy) {
        params['$orderby'] = `${options.orderBy} ${options.orderDirection || 'asc'}`;
      } else {
        params['$orderby'] = 'displayName asc';
      }

      // Execute search
      const response = await this.graphClient.get<any>(`/me/contactFolders/${folderId}/contacts`, { params });

      // Map contacts
      const contacts = ContactsMapper.toDomainContacts(response.value || []);

      // Build pagination info
      const totalCount = response['@odata.count'] || contacts.length;
      const currentPage = Math.floor((options.skip || 0) / (options.limit || 25)) + 1;
      const pageSize = options.limit || 25;
      const hasNextPage = (options.skip || 0) + contacts.length < totalCount;
      const hasPreviousPage = (options.skip || 0) > 0;

      const result: ContactSearchResult = {
        contacts,
        totalCount,
        pagination: {
          total: totalCount,
          page: currentPage,
          pageSize,
          hasNextPage,
          hasPreviousPage,
          nextCursor: response['@odata.nextLink']
            ? this.extractNextPageToken(response['@odata.nextLink'])
            : undefined,
        },
        nextPageToken: response['@odata.nextLink']
          ? this.extractNextPageToken(response['@odata.nextLink'])
          : undefined,
      };

      return {
        success: true,
        data: result,
        pagination: result.pagination,
      };
    } catch (error) {
      this.logger.error(`Failed to get contacts in folder ${folderId}`, error);
      throw error;
    }
  }

  /**
   * Get organizations from contacts
   */
  async getOrganizations(): Promise<PlatformResult<string[]>> {
    try {
      // Query contacts with company names
      const params = {
        $select: 'companyName',
        $filter: 'companyName ne null',
        $top: 100,
      };

      const response = await this.graphClient.get<any>('/me/contacts', { params });

      // Extract unique organization names
      const organizations = new Set<string>();
      response.value?.forEach((contact: any) => {
        if (contact.companyName) {
          organizations.add(contact.companyName);
        }
      });

      return {
        success: true,
        data: Array.from(organizations).sort(),
      };
    } catch (error) {
      this.logger.error('Failed to get organizations', error);
      throw error;
    }
  }

  /**
   * Get contacts by organization
   */
  async getContactsByOrganization(organizationName: string): Promise<PlatformResult<Contact[]>> {
    try {
      const options: ContactQueryOptions = {
        companyName: organizationName,
        limit: 50,
      };

      const result = await this.searchContacts(options);

      if (result.success && result.data) {
        return {
          success: true,
          data: result.data.contacts,
        };
      }

      return {
        success: false,
        error: result.error || 'Failed to get contacts by organization',
      };
    } catch (error) {
      this.logger.error(`Failed to get contacts for organization ${organizationName}`, error);
      throw error;
    }
  }

  /**
   * Get contact photo
   */
  async getContactPhoto(contactId: string): Promise<PlatformResult<Buffer>> {
    try {
      const response = await this.graphClient.get<any>(
        `/me/contacts/${contactId}/photo/$value`,
        { responseType: 'arraybuffer' }
      );

      return {
        success: true,
        data: Buffer.from(response),
      };
    } catch (error) {
      // Photo might not exist, which is normal
      if ((error as any).response?.status === 404) {
        return {
          success: false,
          error: 'Contact photo not found',
        };
      }
      this.logger.error(`Failed to get photo for contact ${contactId}`, error);
      throw error;
    }
  }

  /**
   * Update contact photo
   */
  async updateContactPhoto(contactId: string, photoData: Buffer, contentType: string = 'image/jpeg'): Promise<PlatformResult<boolean>> {
    try {
      await this.graphClient.patch(
        `/me/contacts/${contactId}/photo/$value`,
        photoData,
        {
          headers: {
            'Content-Type': contentType,
          },
        }
      );

      // Invalidate cache
      await this.cacheManager.delete(`${this.cacheKeyPrefix}${contactId}`);

      this.logger.info(`Photo updated for contact ${contactId}`);

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      this.logger.error(`Failed to update photo for contact ${contactId}`, error);
      throw error;
    }
  }

  /**
   * Mark contact as favorite
   */
  async markAsFavorite(contactId: string, isFavorite: boolean = true): Promise<PlatformResult<boolean>> {
    try {
      await this.graphClient.patch(`/me/contacts/${contactId}`, { isFavorite });

      // Invalidate cache
      await this.cacheManager.delete(`${this.cacheKeyPrefix}${contactId}`);

      this.logger.debug(`Contact ${contactId} marked as ${isFavorite ? 'favorite' : 'not favorite'}`);

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      this.logger.error(`Failed to mark contact ${contactId} as favorite`, error);
      throw error;
    }
  }

  /**
   * Add categories to contact
   */
  async addCategories(contactId: string, categories: string[]): Promise<PlatformResult<Contact>> {
    try {
      // Get current contact to preserve existing categories
      const currentResult = await this.getContact(contactId);
      if (!currentResult.success || !currentResult.data) {
        throw new Error('Failed to get current contact');
      }

      const currentContact = currentResult.data;
      const updatedCategories = [...new Set([...currentContact.categories, ...categories])];

      return await this.updateContact(contactId, { categories: updatedCategories });
    } catch (error) {
      this.logger.error(`Failed to add categories to contact ${contactId}`, error);
      throw error;
    }
  }

  /**
   * Index contact in ChromaDB for semantic search
   */
  private async indexContact(contact: Contact): Promise<void> {
    try {
      // TODO: Implement contact indexing in vector store
      // await this.chromaDb.addDocuments({
      //   collection: 'graph-search-index',
      //   documents: [{
      //     id: `contact_${contact.id}`,
      //     content: `${contact.displayName} ${contact.organization?.name || ''} ${contact.notes || ''}`,
      //     metadata: {
      //       type: 'contact',
      //       displayName: contact.displayName,
      //       givenName: contact.name.givenName,
      //       surname: contact.name.surname,
      //       organization: contact.organization?.name || '',
      //       jobTitle: contact.organization?.title || '',
      //       department: contact.organization?.department || '',
      //       emails: contact.emails.map(e => e.address).join(', '),
      //       phones: contact.phones.map(p => p.number).join(', '),
      //       categories: contact.categories.join(', '),
      //       isFavorite: contact.metadata.isFavorite,
      //       createdDateTime: contact.createdDateTime.toISOString(),
      //       lastModifiedDateTime: contact.lastModifiedDateTime.toISOString()
      //     }
      //   }]
      // });
    } catch (error) {
      this.logger.warn(`Failed to index contact ${contact.id} in ChromaDB`, error);
      // Don't fail the operation if indexing fails
    }
  }

  /**
   * Build OData filter query from options
   */
  private buildFilterQuery(options: ContactQueryOptions): string {
    const filters: string[] = [];

    if (options.displayName) {
      filters.push(`contains(displayName, '${options.displayName}')`);
    }

    if (options.givenName) {
      filters.push(`contains(givenName, '${options.givenName}')`);
    }

    if (options.surname) {
      filters.push(`contains(surname, '${options.surname}')`);
    }

    if (options.emailAddress) {
      filters.push(`emailAddresses/any(e: e/address eq '${options.emailAddress}')`);
    }

    if (options.phoneNumber) {
      // Check all phone number fields
      const phoneFilter = [
        `businessPhones/any(p: contains(p, '${options.phoneNumber}'))`,
        `contains(mobilePhone, '${options.phoneNumber}')`,
        `homePhones/any(p: contains(p, '${options.phoneNumber}'))`
      ].join(' or ');
      filters.push(`(${phoneFilter})`);
    }

    if (options.companyName) {
      filters.push(`contains(companyName, '${options.companyName}')`);
    }

    if (options.department) {
      filters.push(`contains(department, '${options.department}')`);
    }

    if (options.jobTitle) {
      filters.push(`contains(jobTitle, '${options.jobTitle}')`);
    }

    if (options.isFavorite !== undefined) {
      filters.push(`isFavorite eq ${options.isFavorite}`);
    }

    if (options.categories && options.categories.length > 0) {
      const categoryFilters = options.categories.map(cat => `categories/any(c: c eq '${cat}')`);
      filters.push(`(${categoryFilters.join(' or ')})`);
    }

    return filters.length > 0 ? filters.join(' and ') : '';
  }

  /**
   * Extract next page token from OData next link
   */
  private extractNextPageToken(nextLink: string): string {
    try {
      const url = new URL(nextLink);
      return url.searchParams.get('$skiptoken') || '';
    } catch {
      return '';
    }
  }
}