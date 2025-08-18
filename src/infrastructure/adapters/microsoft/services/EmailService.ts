import { Logger } from '../../../../shared/logging/Logger.js';
import { Email, EmailEntity } from '../../../../domain/entities/Email.js';
import { 
  PlatformResult, 
  SearchCriteria, 
  PaginationInfo 
} from '../../../../domain/interfaces/PlatformPort.js';
import { GraphClient } from '../clients/GraphClient.js';
import { CacheManager } from '../cache/CacheManager.js';
import { ChromaDbInitializer } from '../cache/ChromaDbInitializer.js';
import { EmailMapper } from '../mappers/EmailMapper.js';
import { ErrorHandler } from '../errors/ErrorHandler.js';

/**
 * Email query options for searching
 */
export interface EmailQueryOptions {
  query?: string;
  folder?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachments?: boolean;
  isRead?: boolean;
  importance?: 'low' | 'normal' | 'high';
  dateFrom?: Date;
  dateTo?: Date;
  categories?: string[];
  limit?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  includeAttachments?: boolean;
}

/**
 * Email search result with pagination
 */
export interface EmailSearchResult {
  emails: Email[];
  pagination: PaginationInfo;
  totalCount: number;
  nextPageToken?: string;
}

/**
 * Microsoft Graph Email Service
 * Implements email operations using Graph API
 */
export class EmailService {
  private readonly logger: Logger;
  private readonly cacheKeyPrefix = 'graph:email:';

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
   * Get a single email by ID
   */
  async getEmail(id: string): Promise<PlatformResult<Email>> {
    try {
      // Check cache first
      const cacheKey = `${this.cacheKeyPrefix}${id}`;
      const cached = await this.cacheManager.get<Email>(cacheKey);
      
      if (cached) {
        this.logger.debug(`Email ${id} retrieved from cache`);
        return {
          success: true,
          data: cached
        };
      }

      // Fetch from Graph API
      const response = await this.graphClient.get<any>(
        `/me/messages/${id}`,
        {
          params: {
            '$expand': 'attachments',
            '$select': 'id,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,replyTo,receivedDateTime,sentDateTime,isRead,isDraft,importance,hasAttachments,conversationId,internetMessageId,categories,attachments'
          }
        }
      );

      // Map to domain entity
      const email = EmailMapper.toDomainEmail(response);

      // Cache the result
      await this.cacheManager.set(cacheKey, email, 3600); // Cache for 1 hour

      // Index in ChromaDB for search
      await this.indexEmail(email);

      return {
        success: true,
        data: email
      };
    } catch (error) {
      this.logger.error(`Failed to get email ${id}`, error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Search emails with filters and pagination
   */
  async searchEmails(options: EmailQueryOptions): Promise<PlatformResult<EmailSearchResult>> {
    try {
      // Build filter query
      const filter = this.buildFilterQuery(options);
      
      // Build request parameters
      const params: any = {
        '$top': options.limit || 25,
        '$skip': options.skip || 0,
        '$count': true,
        '$select': 'id,subject,body,bodyPreview,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,sentDateTime,isRead,isDraft,importance,hasAttachments,conversationId,categories'
      };

      if (filter) {
        params['$filter'] = filter;
      }

      if (options.orderBy) {
        params['$orderby'] = `${options.orderBy} ${options.orderDirection || 'desc'}`;
      } else {
        params['$orderby'] = 'receivedDateTime desc';
      }

      if (options.includeAttachments) {
        params['$expand'] = 'attachments';
      }

      if (options.query) {
        params['$search'] = `"${options.query}"`;
      }

      // Execute search
      const response = await this.graphClient.get<any>('/me/messages', { params });

      // Map emails
      const emails = EmailMapper.toDomainEmails(response.value || []);

      // Index emails for future searches
      await Promise.all(emails.map(email => this.indexEmail(email)));

      // Build pagination info
      const totalCount = response['@odata.count'] || emails.length;
      const currentPage = Math.floor((options.skip || 0) / (options.limit || 25)) + 1;
      const pageSize = options.limit || 25;
      const hasNextPage = (options.skip || 0) + emails.length < totalCount;
      const hasPreviousPage = (options.skip || 0) > 0;

      const result: EmailSearchResult = {
        emails,
        totalCount,
        pagination: {
          total: totalCount,
          page: currentPage,
          pageSize,
          hasNextPage,
          hasPreviousPage,
          nextCursor: response['@odata.nextLink'] ? this.extractNextPageToken(response['@odata.nextLink']) : undefined
        },
        nextPageToken: response['@odata.nextLink'] ? this.extractNextPageToken(response['@odata.nextLink']) : undefined
      };

      return {
        success: true,
        data: result,
        pagination: result.pagination
      };
    } catch (error) {
      this.logger.error('Failed to search emails', error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Send an email
   */
  async sendEmail(email: Partial<Email>): Promise<PlatformResult<string>> {
    try {
      // Convert to Graph format
      const graphEmail = EmailMapper.toGraphEmail(email);

      // Send via Graph API
      const response = await this.graphClient.post<any>(
        '/me/sendMail',
        graphEmail
      );

      // Get the sent message ID from the response headers or body
      const messageId = response?.id || 'sent';

      this.logger.info(`Email sent successfully: ${messageId}`);

      return {
        success: true,
        data: messageId
      };
    } catch (error) {
      this.logger.error('Failed to send email', error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Mark email as read
   */
  async markAsRead(emailId: string, isRead: boolean = true): Promise<PlatformResult<boolean>> {
    try {
      await this.graphClient.patch(
        `/me/messages/${emailId}`,
        { isRead }
      );

      // Invalidate cache
      await this.cacheManager.delete(`${this.cacheKeyPrefix}${emailId}`);

      this.logger.debug(`Email ${emailId} marked as ${isRead ? 'read' : 'unread'}`);

      return {
        success: true,
        data: true
      };
    } catch (error) {
      this.logger.error(`Failed to mark email ${emailId} as read`, error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Delete an email
   */
  async deleteEmail(emailId: string): Promise<PlatformResult<boolean>> {
    try {
      await this.graphClient.delete(`/me/messages/${emailId}`);

      // Remove from cache
      await this.cacheManager.delete(`${this.cacheKeyPrefix}${emailId}`);

      // Remove from ChromaDB index
      await this.chromaDb.deleteDocuments({
        collection: 'graph-search-index',
        ids: [`email_${emailId}`]
      });

      this.logger.info(`Email ${emailId} deleted successfully`);

      return {
        success: true,
        data: true
      };
    } catch (error) {
      this.logger.error(`Failed to delete email ${emailId}`, error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Move email to folder
   */
  async moveToFolder(emailId: string, folderId: string): Promise<PlatformResult<boolean>> {
    try {
      await this.graphClient.post(
        `/me/messages/${emailId}/move`,
        { destinationId: folderId }
      );

      // Invalidate cache
      await this.cacheManager.delete(`${this.cacheKeyPrefix}${emailId}`);

      this.logger.debug(`Email ${emailId} moved to folder ${folderId}`);

      return {
        success: true,
        data: true
      };
    } catch (error) {
      this.logger.error(`Failed to move email ${emailId} to folder ${folderId}`, error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Copy email to folder
   */
  async copyToFolder(emailId: string, folderId: string): Promise<PlatformResult<string>> {
    try {
      const response = await this.graphClient.post<any>(
        `/me/messages/${emailId}/copy`,
        { destinationId: folderId }
      );

      const newEmailId = response.id;
      this.logger.debug(`Email ${emailId} copied to folder ${folderId}, new ID: ${newEmailId}`);

      return {
        success: true,
        data: newEmailId
      };
    } catch (error) {
      this.logger.error(`Failed to copy email ${emailId} to folder ${folderId}`, error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Update email properties
   */
  async updateEmail(emailId: string, updates: Partial<Email>): Promise<PlatformResult<Email>> {
    try {
      const graphUpdate = EmailMapper.toGraphUpdate(updates);
      
      const response = await this.graphClient.patch<any>(
        `/me/messages/${emailId}`,
        graphUpdate
      );

      const updatedEmail = EmailMapper.toDomainEmail(response);

      // Update cache
      await this.cacheManager.set(`${this.cacheKeyPrefix}${emailId}`, updatedEmail, 3600);

      // Update ChromaDB index
      await this.indexEmail(updatedEmail);

      return {
        success: true,
        data: updatedEmail
      };
    } catch (error) {
      this.logger.error(`Failed to update email ${emailId}`, error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Create a draft email
   */
  async createDraft(email: Partial<Email>): Promise<PlatformResult<Email>> {
    try {
      const graphEmail = EmailMapper.toGraphEmail({ ...email, isDraft: true });
      
      const response = await this.graphClient.post<any>(
        '/me/messages',
        graphEmail.message
      );

      const draft = EmailMapper.toDomainEmail(response);

      // Cache the draft
      await this.cacheManager.set(`${this.cacheKeyPrefix}${draft.id}`, draft, 3600);

      return {
        success: true,
        data: draft
      };
    } catch (error) {
      this.logger.error('Failed to create draft', error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Reply to an email
   */
  async replyToEmail(emailId: string, reply: Partial<Email>, replyAll: boolean = false): Promise<PlatformResult<string>> {
    try {
      const endpoint = replyAll ? `/me/messages/${emailId}/replyAll` : `/me/messages/${emailId}/reply`;
      
      const replyData = {
        message: {
          body: reply.body,
          attachments: reply.attachments ? reply.attachments.map(att => EmailMapper['toGraphAttachment'](att)) : undefined
        }
      };

      await this.graphClient.post(endpoint, replyData);

      return {
        success: true,
        data: 'replied'
      };
    } catch (error) {
      this.logger.error(`Failed to reply to email ${emailId}`, error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Forward an email
   */
  async forwardEmail(emailId: string, forward: Partial<Email>): Promise<PlatformResult<string>> {
    try {
      const forwardData = {
        message: {
          toRecipients: forward.to?.map(addr => EmailMapper['toGraphEmailAddress'](addr)),
          body: forward.body,
          comment: forward.body?.content
        }
      };

      await this.graphClient.post(`/me/messages/${emailId}/forward`, forwardData);

      return {
        success: true,
        data: 'forwarded'
      };
    } catch (error) {
      this.logger.error(`Failed to forward email ${emailId}`, error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Index email in ChromaDB for semantic search
   */
  private async indexEmail(email: Email): Promise<void> {
    try {
      await this.chromaDb.addDocuments({
        collection: 'graph-search-index',
        documents: [{
          id: `email_${email.id}`,
          content: `${email.subject} ${email.body.content}`,
          metadata: {
            type: 'email',
            from: email.from.toString(),
            to: email.to.map(addr => addr.toString()).join(', '),
            subject: email.subject,
            date: email.receivedDateTime.toISOString(),
            hasAttachments: email.hasAttachments,
            isRead: email.isRead,
            isDraft: email.isDraft,
            importance: email.importance,
            categories: email.categories.join(', ')
          }
        }]
      });
    } catch (error) {
      this.logger.warn(`Failed to index email ${email.id} in ChromaDB`, error);
      // Don't fail the operation if indexing fails
    }
  }

  /**
   * Build OData filter query from options
   */
  private buildFilterQuery(options: EmailQueryOptions): string {
    const filters: string[] = [];

    if (options.folder) {
      filters.push(`parentFolderId eq '${options.folder}'`);
    }

    if (options.from) {
      filters.push(`from/emailAddress/address eq '${options.from}'`);
    }

    if (options.to) {
      filters.push(`toRecipients/any(r: r/emailAddress/address eq '${options.to}')`);
    }

    if (options.subject) {
      filters.push(`contains(subject, '${options.subject}')`);
    }

    if (options.hasAttachments !== undefined) {
      filters.push(`hasAttachments eq ${options.hasAttachments}`);
    }

    if (options.isRead !== undefined) {
      filters.push(`isRead eq ${options.isRead}`);
    }

    if (options.importance) {
      filters.push(`importance eq '${options.importance}'`);
    }

    if (options.dateFrom) {
      filters.push(`receivedDateTime ge ${options.dateFrom.toISOString()}`);
    }

    if (options.dateTo) {
      filters.push(`receivedDateTime le ${options.dateTo.toISOString()}`);
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

  /**
   * Get email folders
   */
  async getFolders(): Promise<PlatformResult<any[]>> {
    try {
      const response = await this.graphClient.get<any>('/me/mailFolders');
      return {
        success: true,
        data: response.value || []
      };
    } catch (error) {
      this.logger.error('Failed to get email folders', error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Get email attachments
   */
  async getAttachments(emailId: string): Promise<PlatformResult<any[]>> {
    try {
      const response = await this.graphClient.get<any>(`/me/messages/${emailId}/attachments`);
      return {
        success: true,
        data: response.value || []
      };
    } catch (error) {
      this.logger.error(`Failed to get attachments for email ${emailId}`, error);
      return this.errorHandler.handleError(error);
    }
  }

  /**
   * Download attachment content
   */
  async downloadAttachment(emailId: string, attachmentId: string): Promise<PlatformResult<Buffer>> {
    try {
      const response = await this.graphClient.get<any>(
        `/me/messages/${emailId}/attachments/${attachmentId}`,
        { responseType: 'arraybuffer' }
      );

      return {
        success: true,
        data: Buffer.from(response)
      };
    } catch (error) {
      this.logger.error(`Failed to download attachment ${attachmentId} from email ${emailId}`, error);
      return this.errorHandler.handleError(error);
    }
  }
}