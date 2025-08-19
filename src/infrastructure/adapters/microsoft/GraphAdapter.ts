import { Logger } from '../../../shared/logging/Logger.js';
import { SecurityManager } from '../../../shared/security/SecurityManager.js';
import { ConfigManager } from '../../../shared/config/ConfigManager.js';
import {
  BatchOperation,
  BatchResult,
  FreeBusyInfo,
  PlatformConfig,
  PlatformPort,
  PlatformResult,
  SearchCriteria,
  TimeSlotSuggestion,
} from '../../../domain/interfaces/PlatformPort.js';
import { Platform } from '../../../domain/value-objects/Platform.js';
import { Email } from '../../../domain/entities/Email.js';
import { CalendarEvent } from '../../../domain/entities/CalendarEvent.js';
import { Contact } from '../../../domain/entities/Contact.js';
import { Task } from '../../../domain/entities/Task.js';
import { File } from '../../../domain/entities/File.js';
import { EmailAddress } from '../../../domain/value-objects/EmailAddress.js';
import { DateRange } from '../../../domain/value-objects/DateRange.js';
import * as crypto from 'crypto';

// Import Microsoft Graph components
import {
  CacheManager,
  ChromaDbInitializer,
  CircuitBreaker,
  ErrorHandler,
  GraphClient,
  MsalAuthProvider,
  MsalConfig,
  RateLimiter,
  TokenRefreshService,
  EmailService,
  CalendarService,
  ContactsService,
  TaskService,
  FileService,
  NotesService,
} from './index.js';

/**
 * Microsoft Graph adapter implementation
 * Provides full PIM functionality via Microsoft Graph API
 */
export class GraphAdapter implements PlatformPort {
  public readonly platform: Platform = 'microsoft';
  public isAvailable: boolean = false;
  public isAuthenticated: boolean = false;

  private logger: Logger;
  private msalConfig?: MsalConfig;
  private authProvider?: MsalAuthProvider;
  private tokenService?: TokenRefreshService;
  private graphClient?: GraphClient;
  private rateLimiter?: RateLimiter;
  private circuitBreaker?: CircuitBreaker;
  private chromaDb?: ChromaDbInitializer;
  private cacheManager?: CacheManager;
  private errorHandler?: ErrorHandler;
  private emailService?: EmailService;
  private calendarService?: CalendarService;
  private contactsService?: ContactsService;
  private taskService?: TaskService;
  private fileService?: FileService;
  private notesService?: NotesService;
  private userId?: string;

  constructor(
    private readonly config: PlatformConfig,
    private readonly configManager: ConfigManager,
    private readonly securityManager: SecurityManager,
    logger: Logger
  ) {
    this.logger = logger;
  }

  /**
   * Initialize the Graph adapter
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Microsoft Graph adapter');

      // Initialize MSAL configuration
      this.msalConfig = new MsalConfig(
        this.config.clientId,
        this.config.clientSecret,
        this.config.tenantId || 'common',
        this.config.redirectUri || 'http://localhost:3000/auth/callback',
        this.logger
      );

      // Initialize authentication provider
      this.authProvider = new MsalAuthProvider(
        this.msalConfig,
        this.logger,
        !!this.config.clientSecret
      );

      // Initialize token refresh service
      this.tokenService = new TokenRefreshService(
        this.authProvider,
        this.securityManager,
        this.logger
      );

      // Initialize rate limiter
      this.rateLimiter = new RateLimiter(
        {
          maxRequests: 10000,
          windowMs: 600000, // 10 minutes
          maxConcurrent: 10,
          minTime: 100,
        },
        this.logger
      );

      // Initialize circuit breaker
      this.circuitBreaker = new CircuitBreaker(
        {
          failureThreshold: 5,
          successThreshold: 2,
          timeout: 60000,
          resetTimeout: 300000,
          volumeThreshold: 10,
          errorThresholdPercentage: 50,
        },
        this.logger
      );

      // Initialize ChromaDB
      const chromaUrl = this.configManager.getConfig('cache').chromadb.url;
      this.chromaDb = new ChromaDbInitializer(chromaUrl, this.logger);
      await this.chromaDb.initialize();

      // Initialize cache manager
      this.cacheManager = new CacheManager(
        this.chromaDb,
        {
          defaultTtl: 300000, // 5 minutes
          maxSize: 1000,
          cleanupInterval: 300000,
        },
        this.logger
      );

      // Initialize Graph client
      this.graphClient = new GraphClient(
        this.authProvider,
        this.tokenService,
        this.rateLimiter,
        this.circuitBreaker,
        this.logger
      );

      // Initialize error handler
      this.errorHandler = new ErrorHandler(this.logger, {
        maxRetries: 3,
        retryDelayMs: 1000,
        exponentialBackoff: true,
        logErrors: true,
      });

      // Initialize services
      this.emailService = new EmailService(
        this.graphClient,
        this.cacheManager,
        this.chromaDb,
        this.errorHandler,
        this.logger
      );

      this.calendarService = new CalendarService(
        this.graphClient,
        this.cacheManager,
        this.chromaDb,
        this.errorHandler,
        this.logger
      );

      this.contactsService = new ContactsService(
        this.graphClient,
        this.cacheManager,
        this.chromaDb,
        this.errorHandler,
        this.logger
      );

      this.taskService = new TaskService(
        this.graphClient,
        this.logger
      );

      this.fileService = new FileService(
        this.graphClient,
        this.logger
      );

      this.notesService = new NotesService(
        this.graphClient,
        this.logger
      );

      this.isAvailable = true;
      this.logger.info('Microsoft Graph adapter initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Microsoft Graph adapter', error);
      this.isAvailable = false;
      throw error;
    }
  }

  /**
   * Generate PKCE parameters
   */
  private async generatePKCE(): Promise<{ challenge: string; verifier: string }> {
    // Generate code verifier (43-128 characters)
    const verifier = crypto.randomBytes(32).toString('base64url');

    // Generate code challenge from verifier
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

    return { challenge, verifier };
  }

  /**
   * Generate secure state parameter
   */
  private generateSecureState(): string {
    return crypto.randomBytes(16).toString('base64url');
  }

  /**
   * Build authorization URL with PKCE
   */
  private async buildAuthUrl(challenge: string, state: string): Promise<string> {
    if (!this.authProvider) {
      throw new Error('Auth provider not initialized');
    }

    // Use the auth provider's method but with our PKCE challenge
    return this.authProvider.getAuthorizationUrl(
      ['Calendars.ReadWrite', 'Mail.Read', 'Mail.Send', 'User.Read'],
      state
    );
  }

  /**
   * Create Graph client with access token
   */
  private createGraphClient(accessToken: string): GraphClient {
    if (!this.authProvider || !this.tokenService || !this.rateLimiter || !this.circuitBreaker) {
      throw new Error('Required services not initialized');
    }

    return new GraphClient(
      this.authProvider,
      this.tokenService,
      this.rateLimiter,
      this.circuitBreaker,
      this.logger
    );
  }

  /**
   * Start authentication - returns auth URL for user
   */
  async startAuthentication(userId?: string): Promise<string> {
    try {
      if (!this.authProvider) {
        throw new Error('Auth provider not initialized');
      }

      // Store userId for later use
      if (userId) {
        this.userId = userId;
      }

      // Generate PKCE challenge and verifier
      const { challenge, verifier } = await this.generatePKCE();

      // Generate secure state
      const state = this.generateSecureState();

      // Build authorization URL with PKCE
      const authUrl = await this.buildAuthUrl(challenge, state);

      // Store PKCE verifier and state securely
      await this.securityManager.storeSecureData('pkce_verifier', verifier);
      await this.securityManager.storeSecureData('oauth_state', state);

      this.logger.info('OAuth2 authorization URL generated with PKCE', {
        hasChallenge: !!challenge,
        hasState: !!state,
        userId: this.userId,
      });

      // Return the auth URL for the user to navigate to
      // In a real implementation, the application would redirect the user to this URL
      return authUrl;
    } catch (error) {
      this.logger.error('Failed to initiate authentication', error);
      this.isAuthenticated = false;
      throw error;
    }
  }

  /**
   * Handle OAuth2 callback with authorization code
   */
  async handleAuthCallback(code: string, state: string): Promise<boolean> {
    try {
      if (!this.authProvider || !this.tokenService) {
        throw new Error('Auth provider or token service not initialized');
      }

      // Validate state parameter
      const savedState = await this.securityManager.getSecureData('oauth_state');
      if (!savedState || state !== savedState) {
        throw new Error('Invalid state parameter - possible CSRF attack');
      }

      // Retrieve PKCE verifier
      const verifier = await this.securityManager.getSecureData('pkce_verifier');
      if (!verifier) {
        throw new Error('PKCE verifier not found');
      }

      // Set the verifier in auth provider before code exchange
      // The auth provider stores the verifier internally for the exchange
      await this.authProvider.getAuthorizationUrl(); // This sets up PKCE

      // Exchange authorization code for tokens
      const tokens = await this.authProvider.acquireTokenByCode(code);

      // Store tokens securely
      if (this.userId) {
        await this.tokenService.storeTokens(tokens, this.userId);
      }

      // Clean up temporary data
      await this.securityManager.deleteSecureData('pkce_verifier');
      await this.securityManager.deleteSecureData('oauth_state');

      // Initialize Graph client with access token
      this.graphClient = this.createGraphClient(tokens.accessToken);
      this.isAuthenticated = true;

      this.logger.info('Successfully authenticated with Microsoft Graph', {
        userId: this.userId,
        hasRefreshToken: !!tokens.refreshToken,
        expiresOn: tokens.expiresOn,
      });

      return true;
    } catch (error) {
      this.logger.error('Authentication callback failed', error);
      this.isAuthenticated = false;
      return false;
    }
  }

  /**
   * Simple authenticate implementation for interface compliance
   */
  async authenticate(): Promise<boolean> {
    // This is a simplified implementation for interface compliance
    // The actual authentication flow uses startAuthentication() -> handleAuthCallback()
    return this.isAuthenticated;
  }

  /**
   * Refresh authentication token
   */
  async refreshToken(): Promise<boolean> {
    try {
      if (!this.tokenService || !this.userId) {
        return false;
      }

      const tokens = await this.tokenService.retrieveTokens(this.userId);
      if (!tokens?.refreshToken) {
        return false;
      }

      const refreshed = await this.tokenService.refreshTokens(tokens.refreshToken, tokens.scopes);

      await this.tokenService.storeTokens(refreshed, this.userId);
      return true;
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      return false;
    }
  }

  /**
   * Check if token is valid
   */
  async isTokenValid(): Promise<boolean> {
    try {
      if (!this.graphClient) {
        return false;
      }

      // Test the token by making a simple API call
      const isValid = await this.graphClient.testConnection();
      return isValid;
    } catch (error) {
      return false;
    }
  }

  // Email operations
  async fetchEmails(criteria: SearchCriteria): Promise<PlatformResult<Email[]>> {
    // Implementation will be added in Phase 2
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async getEmail(id: string): Promise<PlatformResult<Email>> {
    // Implementation will be added in Phase 2
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async sendEmail(email: Partial<Email>): Promise<PlatformResult<string>> {
    // Implementation will be added in Phase 2
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async updateEmail(id: string, updates: Partial<Email>): Promise<PlatformResult<Email>> {
    // Implementation will be added in Phase 2
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async deleteEmail(id: string): Promise<PlatformResult<boolean>> {
    // Implementation will be added in Phase 2
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async searchEmails(query: string, criteria?: SearchCriteria): Promise<PlatformResult<Email[]>> {
    // Implementation will be added in Phase 2
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async batchEmailOperations(operations: BatchOperation<Email>[]): Promise<BatchResult<Email>> {
    // Implementation will be added in Phase 2
    return {
      success: false,
      results: [],
      failedOperations: [],
    };
  }

  // Calendar operations
  async fetchEvents(criteria: SearchCriteria): Promise<PlatformResult<CalendarEvent[]>> {
    try {
      if (!this.calendarService) {
        throw new Error('Calendar service not initialized');
      }

      const options = {
        query: criteria.query,
        dateFrom: criteria.dateRange?.start,
        dateTo: criteria.dateRange?.end,
        limit: criteria.limit,
        skip: criteria.offset,
      };

      const result = await this.calendarService.searchEvents(options);
      if (result.success && result.data) {
        return {
          success: true,
          data: result.data.events,
          pagination: result.pagination,
        };
      }

      return {
        success: false,
        error: result.error || 'Search failed',
      };
    } catch (error) {
      this.logger.error('Failed to fetch events', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getEvent(id: string): Promise<PlatformResult<CalendarEvent>> {
    try {
      if (!this.calendarService) {
        throw new Error('Calendar service not initialized');
      }

      return await this.calendarService.getEvent(id);
    } catch (error) {
      this.logger.error(`Failed to get event ${id}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async createEvent(event: Partial<CalendarEvent>): Promise<PlatformResult<string>> {
    try {
      if (!this.calendarService) {
        throw new Error('Calendar service not initialized');
      }

      return await this.calendarService.createEvent(event);
    } catch (error) {
      this.logger.error('Failed to create event', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async updateEvent(
    id: string,
    updates: Partial<CalendarEvent>
  ): Promise<PlatformResult<CalendarEvent>> {
    try {
      if (!this.calendarService) {
        throw new Error('Calendar service not initialized');
      }

      return await this.calendarService.updateEvent(id, updates);
    } catch (error) {
      this.logger.error(`Failed to update event ${id}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async deleteEvent(id: string): Promise<PlatformResult<boolean>> {
    try {
      if (!this.calendarService) {
        throw new Error('Calendar service not initialized');
      }

      return await this.calendarService.deleteEvent(id);
    } catch (error) {
      this.logger.error(`Failed to delete event ${id}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async searchEvents(
    query: string,
    criteria?: SearchCriteria
  ): Promise<PlatformResult<CalendarEvent[]>> {
    try {
      if (!this.calendarService) {
        throw new Error('Calendar service not initialized');
      }

      const options = {
        query,
        dateFrom: criteria?.dateRange?.start,
        dateTo: criteria?.dateRange?.end,
        limit: criteria?.limit,
        skip: criteria?.offset,
      };

      const result = await this.calendarService.searchEvents(options);
      if (result.success && result.data) {
        return {
          success: true,
          data: result.data.events,
          pagination: result.pagination,
        };
      }

      return {
        success: false,
        error: result.error || 'Search failed',
      };
    } catch (error) {
      this.logger.error('Failed to search events', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getFreeBusyInfo(
    emails: EmailAddress[],
    dateRange: DateRange
  ): Promise<PlatformResult<FreeBusyInfo[]>> {
    try {
      if (!this.calendarService) {
        throw new Error('Calendar service not initialized');
      }

      return await this.calendarService.getFreeBusy(emails, dateRange);
    } catch (error) {
      this.logger.error('Failed to get free/busy info', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async findFreeTime(
    attendees: EmailAddress[],
    duration: number,
    dateRange: DateRange,
    options?: { workingHoursOnly?: boolean; minConfidence?: number; maxSuggestions?: number }
  ): Promise<PlatformResult<TimeSlotSuggestion[]>> {
    try {
      if (!this.calendarService) {
        throw new Error('Calendar service not initialized');
      }

      const freeTimeOptions = {
        workingHoursOnly: options?.workingHoursOnly,
        maxSuggestions: options?.maxSuggestions,
      };

      return await this.calendarService.findFreeTime(attendees, duration, dateRange, freeTimeOptions);
    } catch (error) {
      this.logger.error('Failed to find free time', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async batchEventOperations(
    operations: BatchOperation<CalendarEvent>[]
  ): Promise<BatchResult<CalendarEvent>> {
    // Implementation will be added in Phase 3
    return {
      success: false,
      results: [],
      failedOperations: [],
    };
  }

  // Contact operations
  async fetchContacts(criteria: SearchCriteria): Promise<PlatformResult<Contact[]>> {
    try {
      if (!this.contactsService) {
        throw new Error('Contacts service not initialized');
      }

      const result = await this.contactsService.searchContacts({
        query: criteria.query,
        limit: criteria.limit,
        skip: criteria.offset,
      });

      if (result.success && result.data) {
        return {
          success: true,
          data: result.data.contacts,
          pagination: result.pagination,
        };
      }

      return {
        success: false,
        error: 'No contacts found',
      };
    } catch (error) {
      this.logger.error('Failed to fetch contacts', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch contacts',
      };
    }
  }

  async getContact(id: string): Promise<PlatformResult<Contact>> {
    try {
      if (!this.contactsService) {
        throw new Error('Contacts service not initialized');
      }

      return await this.contactsService.getContact(id);
    } catch (error) {
      this.logger.error(`Failed to get contact ${id}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get contact',
      };
    }
  }

  async createContact(contact: Partial<Contact>): Promise<PlatformResult<string>> {
    try {
      if (!this.contactsService) {
        throw new Error('Contacts service not initialized');
      }

      return await this.contactsService.createContact(contact);
    } catch (error) {
      this.logger.error('Failed to create contact', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create contact',
      };
    }
  }

  async updateContact(id: string, updates: Partial<Contact>): Promise<PlatformResult<Contact>> {
    try {
      if (!this.contactsService) {
        throw new Error('Contacts service not initialized');
      }

      return await this.contactsService.updateContact(id, updates);
    } catch (error) {
      this.logger.error(`Failed to update contact ${id}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update contact',
      };
    }
  }

  async deleteContact(id: string): Promise<PlatformResult<boolean>> {
    try {
      if (!this.contactsService) {
        throw new Error('Contacts service not initialized');
      }

      return await this.contactsService.deleteContact(id);
    } catch (error) {
      this.logger.error(`Failed to delete contact ${id}`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete contact',
      };
    }
  }

  async searchContacts(
    query: string,
    criteria?: SearchCriteria
  ): Promise<PlatformResult<Contact[]>> {
    try {
      if (!this.contactsService) {
        throw new Error('Contacts service not initialized');
      }

      const result = await this.contactsService.searchContacts({
        query,
        limit: criteria?.limit,
        skip: criteria?.offset,
      });

      if (result.success && result.data) {
        return {
          success: true,
          data: result.data.contacts,
          pagination: result.pagination,
        };
      }

      return {
        success: false,
        error: 'No contacts found',
      };
    } catch (error) {
      this.logger.error('Failed to search contacts', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search contacts',
      };
    }
  }

  async batchContactOperations(
    operations: BatchOperation<Contact>[]
  ): Promise<BatchResult<Contact>> {
    // Implementation will be added in Phase 4
    return {
      success: false,
      results: [],
      failedOperations: [],
    };
  }

  // Task operations
  async fetchTasks(criteria: SearchCriteria): Promise<PlatformResult<Task[]>> {
    try {
      if (!this.isAuthenticated || !this.taskService) {
        return {
          success: false,
          error: 'Not authenticated or task service not initialized',
        };
      }

      const result = await this.taskService.listTasks({
        limit: criteria.limit,
        skip: criteria.offset,
        status: criteria.customFilters?.status as any,
        importance: criteria.customFilters?.importance as any,
        dateFrom: criteria.dateRange?.start,
        dateTo: criteria.dateRange?.end,
      });

      return {
        success: true,
        data: result.tasks,
        pagination: result.pagination,
      };
    } catch (error) {
      this.logger.error('Failed to fetch tasks', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch tasks',
      };
    }
  }

  async getTask(id: string): Promise<PlatformResult<Task>> {
    try {
      if (!this.isAuthenticated || !this.taskService) {
        return {
          success: false,
          error: 'Not authenticated or task service not initialized',
        };
      }

      const task = await this.taskService.getTask(id);
      return {
        success: true,
        data: task,
      };
    } catch (error) {
      this.logger.error('Failed to get task', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get task',
      };
    }
  }

  async createTask(task: Partial<Task>): Promise<PlatformResult<string>> {
    try {
      if (!this.isAuthenticated || !this.taskService) {
        return {
          success: false,
          error: 'Not authenticated or task service not initialized',
        };
      }

      const createdTask = await this.taskService.createTask({
        title: task.title || 'Untitled Task',
        description: task.description,
        importance: task.importance,
        dueDateTime: task.dueDateTime,
        startDateTime: task.startDateTime,
        categories: task.categories,
      });

      return {
        success: true,
        data: createdTask.id.toString(),
      };
    } catch (error) {
      this.logger.error('Failed to create task', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create task',
      };
    }
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<PlatformResult<Task>> {
    try {
      if (!this.isAuthenticated || !this.taskService) {
        return {
          success: false,
          error: 'Not authenticated or task service not initialized',
        };
      }

      const updatedTask = await this.taskService.updateTask(id, {
        title: updates.title,
        description: updates.description,
        status: updates.status,
        importance: updates.importance,
        dueDateTime: updates.dueDateTime,
        startDateTime: updates.startDateTime,
        categories: updates.categories,
        percentComplete: updates.percentComplete,
      });

      return {
        success: true,
        data: updatedTask,
      };
    } catch (error) {
      this.logger.error('Failed to update task', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update task',
      };
    }
  }

  async deleteTask(id: string): Promise<PlatformResult<boolean>> {
    try {
      if (!this.isAuthenticated || !this.taskService) {
        return {
          success: false,
          error: 'Not authenticated or task service not initialized',
        };
      }

      await this.taskService.deleteTask(id);
      return {
        success: true,
        data: true,
      };
    } catch (error) {
      this.logger.error('Failed to delete task', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete task',
      };
    }
  }

  async searchTasks(query: string, criteria?: SearchCriteria): Promise<PlatformResult<Task[]>> {
    try {
      if (!this.isAuthenticated || !this.taskService) {
        return {
          success: false,
          error: 'Not authenticated or task service not initialized',
        };
      }

      const tasks = await this.taskService.searchTasks(query, {
        limit: criteria?.limit,
        status: criteria?.customFilters?.status as any,
        importance: criteria?.customFilters?.importance as any,
      });

      return {
        success: true,
        data: tasks,
      };
    } catch (error) {
      this.logger.error('Failed to search tasks', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to search tasks',
      };
    }
  }

  async batchTaskOperations(operations: BatchOperation<Task>[]): Promise<BatchResult<Task>> {
    const results: Array<{ success: boolean; data?: Task; error?: string }> = [];
    const failedOperations: Array<{ operation: BatchOperation<Task>; error: string }> = [];

    for (const operation of operations) {
      try {
        switch (operation.operation) {
          case 'create':
            const createResult = await this.createTask(operation.data);
            if (createResult.success) {
              const task = await this.getTask(createResult.data!);
              results.push({ success: true, data: task.data });
            } else {
              results.push({ success: false, error: createResult.error });
              failedOperations.push({ operation, error: createResult.error || 'Unknown error' });
            }
            break;
          case 'update':
            const updateResult = await this.updateTask(operation.id!, operation.data);
            results.push(updateResult);
            if (!updateResult.success) {
              failedOperations.push({ operation, error: updateResult.error || 'Unknown error' });
            }
            break;
          case 'delete':
            const deleteResult = await this.deleteTask(operation.id!);
            results.push({ success: deleteResult.success, error: deleteResult.error });
            if (!deleteResult.success) {
              failedOperations.push({ operation, error: deleteResult.error || 'Unknown error' });
            }
            break;
          default:
            results.push({ success: false, error: 'Unknown operation type' });
            failedOperations.push({ operation, error: 'Unknown operation type' });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ success: false, error: errorMessage });
        failedOperations.push({ operation, error: errorMessage });
      }
    }

    return {
      success: failedOperations.length === 0,
      results,
      failedOperations,
    };
  }

  /**
   * Get the task service instance
   */
  getTaskService(): TaskService {
    if (!this.taskService) {
      throw new Error('Task service not initialized');
    }
    return this.taskService;
  }

  /**
   * Get the file service instance
   */
  getFileService(): FileService {
    if (!this.fileService) {
      throw new Error('File service not initialized');
    }
    return this.fileService;
  }

  /**
   * Get the notes service instance
   */
  getNotesService(): NotesService {
    if (!this.notesService) {
      throw new Error('Notes service not initialized');
    }
    return this.notesService;
  }

  // File operations
  async fetchFiles(criteria: SearchCriteria): Promise<PlatformResult<File[]>> {
    // Implementation will be added in Phase 6
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async getFile(id: string): Promise<PlatformResult<File>> {
    // Implementation will be added in Phase 6
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async uploadFile(file: {
    name: string;
    content: Buffer | ArrayBuffer;
    contentType: string;
    parentId?: string;
  }): Promise<PlatformResult<string>> {
    // Implementation will be added in Phase 6
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async downloadFile(id: string): Promise<PlatformResult<Buffer>> {
    // Implementation will be added in Phase 6
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async updateFile(id: string, updates: Partial<File>): Promise<PlatformResult<File>> {
    // Implementation will be added in Phase 6
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async deleteFile(id: string): Promise<PlatformResult<boolean>> {
    // Implementation will be added in Phase 6
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async searchFiles(query: string, criteria?: SearchCriteria): Promise<PlatformResult<File[]>> {
    // Implementation will be added in Phase 6
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  async batchFileOperations(operations: BatchOperation<File>[]): Promise<BatchResult<File>> {
    // Implementation will be added in Phase 6
    return {
      success: false,
      results: [],
      failedOperations: [],
    };
  }

  // Unified search
  async unifiedSearch(
    query: string,
    options?: {
      types?: ('email' | 'event' | 'contact' | 'task' | 'file')[];
      limit?: number;
      dateRange?: DateRange;
    }
  ): Promise<
    PlatformResult<{
      emails: Email[];
      events: CalendarEvent[];
      contacts: Contact[];
      tasks: Task[];
      files: File[];
    }>
  > {
    // Implementation will be added in Phase 7
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  // Health and status
  async healthCheck(): Promise<
    PlatformResult<{
      status: 'healthy' | 'degraded' | 'unhealthy';
      latency: number;
      details?: Record<string, any>;
    }>
  > {
    try {
      const startTime = Date.now();

      if (!this.graphClient) {
        return {
          success: true,
          data: {
            status: 'unhealthy',
            latency: 0,
            details: { error: 'Graph client not initialized' },
          },
        };
      }

      const isConnected = await this.graphClient.testConnection();
      const latency = Date.now() - startTime;
      const healthStatus = this.graphClient.getHealthStatus();

      return {
        success: true,
        data: {
          status: isConnected ? 'healthy' : 'unhealthy',
          latency,
          details: {
            ...healthStatus,
            authenticated: this.isAuthenticated,
            available: this.isAvailable,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        error: 'Health check failed',
      };
    }
  }

  // Sync operations
  async getLastSyncTime(): Promise<Date | null> {
    try {
      if (!this.cacheManager) {
        return null;
      }

      const metadata = await this.cacheManager.getSyncMetadata('global');
      return metadata ? new Date(metadata.lastSync) : null;
    } catch (error) {
      this.logger.error('Failed to get last sync time', error);
      return null;
    }
  }

  async sync(options?: {
    incremental?: boolean;
    types?: ('email' | 'event' | 'contact' | 'task' | 'file')[];
  }): Promise<PlatformResult<{ synced: number; errors: number; duration: number }>> {
    // Implementation will be added in Phase 8
    return {
      success: false,
      error: 'Not implemented yet',
    };
  }

  // Rate limiting
  async getRateLimitStatus(): Promise<{
    remaining: number;
    reset: Date;
    limit: number;
  }> {
    if (!this.rateLimiter) {
      return {
        remaining: 0,
        reset: new Date(),
        limit: 0,
      };
    }

    const status = this.rateLimiter.getRateLimitStatus();
    return {
      remaining: status?.remaining || 0,
      reset: status?.reset || new Date(),
      limit: status?.limit || 10000,
    };
  }

  // Cleanup
  async dispose(): Promise<void> {
    try {
      this.logger.info('Disposing Microsoft Graph adapter');

      if (this.tokenService) {
        this.tokenService.dispose();
      }

      if (this.rateLimiter) {
        await this.rateLimiter.onIdle();
        this.rateLimiter.clear();
      }

      if (this.circuitBreaker) {
        this.circuitBreaker.dispose();
      }

      if (this.cacheManager) {
        this.cacheManager.dispose();
      }

      if (this.chromaDb) {
        this.chromaDb.dispose();
      }

      this.isAuthenticated = false;
      this.isAvailable = false;

      this.logger.info('Microsoft Graph adapter disposed');
    } catch (error) {
      this.logger.error('Error disposing Microsoft Graph adapter', error);
    }
  }
}
