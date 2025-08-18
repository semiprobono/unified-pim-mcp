import nock from 'nock';
import { EventEmitter } from 'events';
import { jest } from '@jest/globals';
import { 
  EmailDataGenerator, 
  CalendarEventDataGenerator, 
  TestEmailData, 
  TestCalendarEventData 
} from '../fixtures/testDataGenerator.js';

/**
 * Advanced Mock Strategies for External APIs
 * 
 * Provides sophisticated mocking for:
 * - Microsoft Graph API with realistic responses
 * - ChromaDB with vector search simulation
 * - MSAL authentication flows
 * - Network conditions and failures
 * - Rate limiting and throttling
 * - Cache behavior simulation
 */

export interface MockScenario {
  name: string;
  description: string;
  setup(): Promise<void>;
  teardown(): Promise<void>;
}

export interface NetworkCondition {
  latency: number; // ms
  errorRate: number; // 0.0 to 1.0
  timeoutRate: number; // 0.0 to 1.0
  bandwidthLimit?: number; // bytes/second
}

/**
 * Microsoft Graph API Mock Strategy
 */
export class GraphApiMockStrategy {
  private baseUrl = 'https://graph.microsoft.com';
  private authUrl = 'https://login.microsoftonline.com';
  private interceptors: nock.Interceptor[] = [];
  private requestLog: Array<{ url: string; method: string; timestamp: number }> = [];
  private networkCondition: NetworkCondition = { latency: 0, errorRate: 0, timeoutRate: 0 };

  constructor(private options: {
    enableLogging?: boolean;
    persistData?: boolean;
    simulateRateLimit?: boolean;
  } = {}) {}

  /**
   * Setup comprehensive Graph API mocking
   */
  async setup(): Promise<void> {
    this.setupAuthenticationMocks();
    this.setupUserMocks();
    this.setupEmailMocks();
    this.setupCalendarMocks();
    this.setupContactMocks();
    this.setupBatchMocks();
    this.setupErrorScenarios();

    if (this.options.simulateRateLimit) {
      this.setupRateLimitingMocks();
    }
  }

  /**
   * Cleanup all mocks
   */
  async teardown(): Promise<void> {
    nock.cleanAll();
    this.interceptors = [];
    this.requestLog = [];
  }

  /**
   * Set network conditions for testing resilience
   */
  setNetworkConditions(condition: NetworkCondition): void {
    this.networkCondition = condition;
  }

  /**
   * Get request statistics
   */
  getRequestStats(): {
    totalRequests: number;
    requestsByEndpoint: Record<string, number>;
    averageLatency: number;
  } {
    const requestsByEndpoint: Record<string, number> = {};
    this.requestLog.forEach(req => {
      const endpoint = req.url.split('?')[0];
      requestsByEndpoint[endpoint] = (requestsByEndpoint[endpoint] || 0) + 1;
    });

    return {
      totalRequests: this.requestLog.length,
      requestsByEndpoint,
      averageLatency: this.networkCondition.latency
    };
  }

  private setupAuthenticationMocks(): void {
    // OAuth2 token endpoint
    nock(this.authUrl)
      .persist()
      .post(/\/.*\/oauth2\/v2\.0\/token/)
      .delay(this.networkCondition.latency)
      .reply((uri, requestBody) => {
        this.logRequest(uri, 'POST');
        
        if (Math.random() < this.networkCondition.errorRate) {
          return [500, { error: 'server_error', error_description: 'Simulated server error' }];
        }

        return [200, {
          token_type: 'Bearer',
          scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send',
          expires_in: 3600,
          access_token: `mock_access_token_${Date.now()}`,
          refresh_token: `mock_refresh_token_${Date.now()}`,
          id_token: 'mock_id_token'
        }];
      });

    // Authorization endpoint
    nock(this.authUrl)
      .persist()
      .get(/\/.*\/oauth2\/v2\.0\/authorize/)
      .delay(this.networkCondition.latency)
      .reply(302, '', {
        'Location': 'http://localhost:3000/auth/callback?code=mock_auth_code&state=mock_state'
      });
  }

  private setupUserMocks(): void {
    // Get user profile
    nock(this.baseUrl)
      .persist()
      .get('/v1.0/me')
      .delay(this.networkCondition.latency)
      .reply((uri) => {
        this.logRequest(uri, 'GET');
        
        if (Math.random() < this.networkCondition.errorRate) {
          return [500, { error: { code: 'InternalServerError', message: 'Simulated error' } }];
        }

        return [200, {
          id: 'mock-user-12345',
          displayName: 'Test User',
          givenName: 'Test',
          surname: 'User',
          userPrincipalName: 'test.user@company.com',
          mail: 'test.user@company.com',
          mobilePhone: '+1-555-0123',
          officeLocation: 'Building A, Floor 2',
          jobTitle: 'Software Engineer',
          department: 'Engineering'
        }];
      });
  }

  private setupEmailMocks(): void {
    // List emails with realistic pagination
    nock(this.baseUrl)
      .persist()
      .get('/v1.0/me/messages')
      .query(true)
      .delay(this.networkCondition.latency)
      .reply((uri) => {
        this.logRequest(uri, 'GET');
        
        if (Math.random() < this.networkCondition.timeoutRate) {
          throw new Error('Request timeout');
        }

        if (Math.random() < this.networkCondition.errorRate) {
          return [500, { error: { code: 'InternalServerError', message: 'Simulated error' } }];
        }

        const url = new URL(uri, this.baseUrl);
        const top = parseInt(url.searchParams.get('$top') || '10');
        const skip = parseInt(url.searchParams.get('$skip') || '0');
        const filter = url.searchParams.get('$filter');
        const search = url.searchParams.get('$search');

        let emails = EmailDataGenerator.generateEmails(top + skip + 10);

        // Apply filtering
        if (filter) {
          emails = this.applyEmailFilters(emails, filter);
        }

        if (search) {
          emails = this.applyEmailSearch(emails, search);
        }

        const pagedEmails = emails.slice(skip, skip + top);
        const hasMore = emails.length > skip + top;

        const response: any = {
          '@odata.context': `${this.baseUrl}/v1.0/$metadata#users('test.user%40company.com')/messages`,
          '@odata.count': emails.length,
          value: pagedEmails
        };

        if (hasMore) {
          response['@odata.nextLink'] = `${this.baseUrl}/v1.0/me/messages?$skip=${skip + top}&$top=${top}`;
        }

        return [200, response];
      });

    // Get individual email
    nock(this.baseUrl)
      .persist()
      .get(/\/v1\.0\/me\/messages\/.*/)
      .delay(this.networkCondition.latency)
      .reply((uri) => {
        this.logRequest(uri, 'GET');
        
        const emailId = uri.split('/').pop();
        
        if (emailId === 'non-existent-email') {
          return [404, {
            error: {
              code: 'ErrorItemNotFound',
              message: 'The specified object was not found in the store.'
            }
          }];
        }

        if (Math.random() < this.networkCondition.errorRate) {
          return [500, { error: { code: 'InternalServerError' } }];
        }

        const email = EmailDataGenerator.generateEmail({ id: emailId });
        return [200, email];
      });

    // Send email
    nock(this.baseUrl)
      .persist()
      .post('/v1.0/me/sendMail')
      .delay(this.networkCondition.latency)
      .reply((uri, requestBody: any) => {
        this.logRequest(uri, 'POST');
        
        if (Math.random() < this.networkCondition.errorRate) {
          return [400, {
            error: {
              code: 'ErrorInvalidRecipients',
              message: 'One or more recipients are invalid.'
            }
          }];
        }

        // Validate request body
        if (!requestBody.message || !requestBody.message.toRecipients || requestBody.message.toRecipients.length === 0) {
          return [400, {
            error: {
              code: 'ErrorInvalidRequest',
              message: 'Invalid request body'
            }
          }];
        }

        return [202, ''];
      });

    // Reply to email
    nock(this.baseUrl)
      .persist()
      .post(/\/v1\.0\/me\/messages\/.*\/reply(All)?/)
      .delay(this.networkCondition.latency)
      .reply((uri, requestBody: any) => {
        this.logRequest(uri, 'POST');
        return [202, ''];
      });

    // Update email (mark read/unread)
    nock(this.baseUrl)
      .persist()
      .patch(/\/v1\.0\/me\/messages\/.*/)
      .delay(this.networkCondition.latency)
      .reply((uri, requestBody: any) => {
        this.logRequest(uri, 'PATCH');
        return [200, { isRead: requestBody.isRead }];
      });

    // Delete email
    nock(this.baseUrl)
      .persist()
      .delete(/\/v1\.0\/me\/messages\/.*/)
      .delay(this.networkCondition.latency)
      .reply((uri) => {
        this.logRequest(uri, 'DELETE');
        
        const emailId = uri.split('/').pop();
        if (emailId === 'already-deleted-email') {
          return [404, {
            error: {
              code: 'ErrorItemNotFound',
              message: 'The item was not found.'
            }
          }];
        }

        return [204, ''];
      });

    // Get email attachments
    nock(this.baseUrl)
      .persist()
      .get(/\/v1\.0\/me\/messages\/.*\/attachments/)
      .delay(this.networkCondition.latency)
      .reply((uri) => {
        this.logRequest(uri, 'GET');
        
        const attachments = Array.from({ length: 2 }, (_, i) => ({
          id: `attachment-${i + 1}`,
          name: `document-${i + 1}.pdf`,
          contentType: 'application/pdf',
          size: 1024 * (i + 1),
          isInline: false,
          lastModifiedDateTime: new Date().toISOString()
        }));

        return [200, { value: attachments }];
      });
  }

  private setupCalendarMocks(): void {
    // List calendar events
    nock(this.baseUrl)
      .persist()
      .get('/v1.0/me/events')
      .query(true)
      .delay(this.networkCondition.latency)
      .reply((uri) => {
        this.logRequest(uri, 'GET');
        
        const url = new URL(uri, this.baseUrl);
        const top = parseInt(url.searchParams.get('$top') || '10');
        const events = CalendarEventDataGenerator.generateEvents(top);

        return [200, {
          '@odata.context': `${this.baseUrl}/v1.0/$metadata#users('test.user%40company.com')/events`,
          value: events
        }];
      });

    // Create calendar event
    nock(this.baseUrl)
      .persist()
      .post('/v1.0/me/events')
      .delay(this.networkCondition.latency)
      .reply((uri, requestBody: any) => {
        this.logRequest(uri, 'POST');
        
        if (!requestBody.subject || !requestBody.start || !requestBody.end) {
          return [400, {
            error: {
              code: 'ErrorInvalidRequest',
              message: 'Required fields missing'
            }
          }];
        }

        const event = CalendarEventDataGenerator.generateEvent({
          ...requestBody,
          id: `created-event-${Date.now()}`
        });

        return [201, event];
      });
  }

  private setupContactMocks(): void {
    // List contacts
    nock(this.baseUrl)
      .persist()
      .get('/v1.0/me/contacts')
      .query(true)
      .delay(this.networkCondition.latency)
      .reply((uri) => {
        this.logRequest(uri, 'GET');
        return [200, { value: [] }]; // Simplified for now
      });
  }

  private setupBatchMocks(): void {
    // Batch requests
    nock(this.baseUrl)
      .persist()
      .post('/$batch')
      .delay(this.networkCondition.latency)
      .reply((uri, requestBody: any) => {
        this.logRequest(uri, 'POST');
        
        const requests = requestBody.requests || [];
        const responses = requests.map((req: any, index: number) => ({
          id: req.id || index.toString(),
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: this.generateBatchResponseBody(req)
        }));

        return [200, { responses }];
      });
  }

  private setupRateLimitingMocks(): void {
    let requestCount = 0;
    const rateLimitWindow = 60000; // 1 minute
    const maxRequestsPerWindow = 100;

    // Intercept all requests to simulate rate limiting
    nock(this.baseUrl)
      .persist()
      .intercept(/.*/, 'GET')
      .delay(() => {
        requestCount++;
        if (requestCount > maxRequestsPerWindow) {
          return 0; // Return rate limit error immediately
        }
        return this.networkCondition.latency;
      })
      .reply(() => {
        if (requestCount > maxRequestsPerWindow) {
          return [429, {
            error: {
              code: 'TooManyRequests',
              message: 'Request rate limit exceeded'
            }
          }, {
            'Retry-After': '60'
          }];
        }
        return [200, {}];
      });

    // Reset counter periodically
    setInterval(() => {
      requestCount = 0;
    }, rateLimitWindow);
  }

  private setupErrorScenarios(): void {
    // Simulate various error conditions
    const errorScenarios = [
      {
        pattern: '/v1.0/me/messages/error-401',
        status: 401,
        error: { code: 'InvalidAuthenticationToken', message: 'Access token has expired' }
      },
      {
        pattern: '/v1.0/me/messages/error-403',
        status: 403,
        error: { code: 'Forbidden', message: 'Insufficient privileges' }
      },
      {
        pattern: '/v1.0/me/messages/error-429',
        status: 429,
        error: { code: 'TooManyRequests', message: 'Rate limit exceeded' }
      },
      {
        pattern: '/v1.0/me/messages/error-500',
        status: 500,
        error: { code: 'InternalServerError', message: 'Internal server error' }
      },
      {
        pattern: '/v1.0/me/messages/error-503',
        status: 503,
        error: { code: 'ServiceUnavailable', message: 'Service temporarily unavailable' }
      }
    ];

    errorScenarios.forEach(scenario => {
      nock(this.baseUrl)
        .persist()
        .get(scenario.pattern)
        .delay(this.networkCondition.latency)
        .reply(scenario.status, { error: scenario.error });
    });
  }

  private applyEmailFilters(emails: TestEmailData[], filter: string): TestEmailData[] {
    // Simplified filter parsing - in real implementation would be more sophisticated
    if (filter.includes('isRead eq true')) {
      emails = emails.filter(e => e.isRead);
    }
    if (filter.includes('isRead eq false')) {
      emails = emails.filter(e => !e.isRead);
    }
    if (filter.includes('hasAttachments eq true')) {
      emails = emails.filter(e => e.hasAttachments);
    }
    if (filter.includes('importance eq high')) {
      emails = emails.filter(e => e.importance === 'high');
    }
    return emails;
  }

  private applyEmailSearch(emails: TestEmailData[], search: string): TestEmailData[] {
    return emails.filter(email => 
      email.subject.toLowerCase().includes(search.toLowerCase()) ||
      email.body.content.toLowerCase().includes(search.toLowerCase()) ||
      email.from.emailAddress.name.toLowerCase().includes(search.toLowerCase())
    );
  }

  private generateBatchResponseBody(request: any): any {
    // Generate appropriate response based on request
    if (request.url.includes('/messages')) {
      return EmailDataGenerator.generateEmail();
    }
    if (request.url.includes('/events')) {
      return CalendarEventDataGenerator.generateEvent();
    }
    return {};
  }

  private logRequest(url: string, method: string): void {
    if (this.options.enableLogging) {
      this.requestLog.push({
        url,
        method,
        timestamp: Date.now()
      });
    }
  }
}

/**
 * ChromaDB Mock Strategy
 */
export class ChromaDbMockStrategy {
  private collections: Map<string, any[]> = new Map();
  private embeddingDimensions = 384; // Default OpenAI embedding size

  async setup(): Promise<void> {
    // Mock ChromaDB client
    jest.mock('chromadb', () => ({
      ChromaApi: jest.fn(() => this.createMockClient()),
      OpenAIEmbeddingFunction: jest.fn(() => this.createMockEmbeddingFunction())
    }));
  }

  async teardown(): Promise<void> {
    this.collections.clear();
    jest.restoreAllMocks();
  }

  private createMockClient() {
    return {
      reset: jest.fn(async () => {
        this.collections.clear();
        return true;
      }),

      createCollection: jest.fn(async ({ name, embeddingFunction }: any) => {
        this.collections.set(name, []);
        return this.createMockCollection(name);
      }),

      getCollection: jest.fn(async ({ name }: any) => {
        if (!this.collections.has(name)) {
          throw new Error(`Collection ${name} does not exist`);
        }
        return this.createMockCollection(name);
      }),

      deleteCollection: jest.fn(async ({ name }: any) => {
        this.collections.delete(name);
        return true;
      }),

      listCollections: jest.fn(async () => {
        return Array.from(this.collections.keys()).map(name => ({ name }));
      }),

      heartbeat: jest.fn(async () => {
        return { status: 'ok' };
      })
    };
  }

  private createMockCollection(name: string) {
    return {
      name,
      
      add: jest.fn(async ({ ids, documents, metadatas, embeddings }: any) => {
        const collection = this.collections.get(name) || [];
        
        for (let i = 0; i < ids.length; i++) {
          collection.push({
            id: ids[i],
            document: documents[i],
            metadata: metadatas?.[i] || {},
            embedding: embeddings?.[i] || this.generateMockEmbedding()
          });
        }
        
        this.collections.set(name, collection);
        return true;
      }),

      query: jest.fn(async ({ queryTexts, queryEmbeddings, nResults = 10, where }: any) => {
        const collection = this.collections.get(name) || [];
        
        if (collection.length === 0) {
          return {
            ids: [[]],
            distances: [[]],
            documents: [[]],
            metadatas: [[]]
          };
        }

        // Simulate semantic search with mock scoring
        const queryEmbedding = queryEmbeddings?.[0] || this.generateMockEmbedding();
        
        let results = collection.map(item => ({
          ...item,
          distance: this.calculateMockDistance(queryEmbedding, item.embedding, queryTexts?.[0])
        }));

        // Apply filters
        if (where) {
          results = results.filter(item => this.matchesFilter(item.metadata, where));
        }

        // Sort by distance and limit results
        results = results
          .sort((a, b) => a.distance - b.distance)
          .slice(0, nResults);

        return {
          ids: [results.map(r => r.id)],
          distances: [results.map(r => r.distance)],
          documents: [results.map(r => r.document)],
          metadatas: [results.map(r => r.metadata)]
        };
      }),

      get: jest.fn(async ({ ids, where }: any) => {
        const collection = this.collections.get(name) || [];
        
        let results = collection;
        
        if (ids) {
          results = results.filter(item => ids.includes(item.id));
        }
        
        if (where) {
          results = results.filter(item => this.matchesFilter(item.metadata, where));
        }

        return {
          ids: results.map(r => r.id),
          documents: results.map(r => r.document),
          metadatas: results.map(r => r.metadata)
        };
      }),

      count: jest.fn(async () => {
        return this.collections.get(name)?.length || 0;
      }),

      delete: jest.fn(async ({ ids, where }: any) => {
        let collection = this.collections.get(name) || [];
        
        if (ids) {
          collection = collection.filter(item => !ids.includes(item.id));
        }
        
        if (where) {
          collection = collection.filter(item => !this.matchesFilter(item.metadata, where));
        }
        
        this.collections.set(name, collection);
        return true;
      }),

      update: jest.fn(async ({ ids, documents, metadatas }: any) => {
        const collection = this.collections.get(name) || [];
        
        for (let i = 0; i < ids.length; i++) {
          const itemIndex = collection.findIndex(item => item.id === ids[i]);
          if (itemIndex >= 0) {
            if (documents?.[i]) collection[itemIndex].document = documents[i];
            if (metadatas?.[i]) collection[itemIndex].metadata = { ...collection[itemIndex].metadata, ...metadatas[i] };
          }
        }
        
        this.collections.set(name, collection);
        return true;
      })
    };
  }

  private createMockEmbeddingFunction() {
    return {
      generate: jest.fn(async (texts: string[]) => {
        return texts.map(() => this.generateMockEmbedding());
      })
    };
  }

  private generateMockEmbedding(): number[] {
    return Array.from({ length: this.embeddingDimensions }, () => Math.random() * 2 - 1);
  }

  private calculateMockDistance(embedding1: number[], embedding2: number[], queryText?: string): number {
    // Simple mock distance calculation with some intelligence
    let baseDistance = Math.random() * 0.5 + 0.1; // Random distance between 0.1 and 0.6
    
    // If query text provided, try to make distance more realistic
    if (queryText) {
      // Simulate better matches for certain keywords
      const keywords = ['project', 'meeting', 'update', 'important', 'urgent'];
      const hasKeyword = keywords.some(keyword => 
        queryText.toLowerCase().includes(keyword.toLowerCase())
      );
      
      if (hasKeyword) {
        baseDistance *= 0.7; // Better match
      }
    }
    
    return baseDistance;
  }

  private matchesFilter(metadata: any, filter: any): boolean {
    // Simple filter matching implementation
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Seed collection with test data
   */
  async seedCollection(name: string, documents: Array<{ id: string; text: string; metadata?: any }>): Promise<void> {
    const collection = this.createMockCollection(name);
    
    await collection.add({
      ids: documents.map(d => d.id),
      documents: documents.map(d => d.text),
      metadatas: documents.map(d => d.metadata || {}),
      embeddings: documents.map(() => this.generateMockEmbedding())
    });
  }
}

/**
 * Network Failure Simulator
 */
export class NetworkFailureSimulator extends EventEmitter {
  private isActive = false;
  private failureTimer?: NodeJS.Timeout;

  async simulateIntermittentFailures(options: {
    duration: number; // ms
    failureInterval: number; // ms
    failureRate: number; // 0.0 to 1.0
  }): Promise<void> {
    this.isActive = true;
    
    const endTime = Date.now() + options.duration;
    
    const scheduleFailure = () => {
      if (!this.isActive || Date.now() > endTime) {
        this.isActive = false;
        return;
      }

      if (Math.random() < options.failureRate) {
        this.emit('failure', 'Network failure simulated');
        
        // Mock network outage
        nock.disableNetConnect();
        
        setTimeout(() => {
          nock.enableNetConnect();
          this.emit('recovery', 'Network recovered');
        }, 1000);
      }

      this.failureTimer = setTimeout(scheduleFailure, options.failureInterval);
    };

    scheduleFailure();
  }

  stop(): void {
    this.isActive = false;
    if (this.failureTimer) {
      clearTimeout(this.failureTimer);
    }
    nock.enableNetConnect();
  }
}

/**
 * Mock Scenario Manager
 */
export class MockScenarioManager {
  private strategies: Map<string, MockScenario> = new Map();
  private activeScenarios: Set<string> = new Set();

  registerScenario(scenario: MockScenario): void {
    this.strategies.set(scenario.name, scenario);
  }

  async activateScenario(name: string): Promise<void> {
    const scenario = this.strategies.get(name);
    if (!scenario) {
      throw new Error(`Scenario ${name} not found`);
    }

    await scenario.setup();
    this.activeScenarios.add(name);
  }

  async deactivateScenario(name: string): Promise<void> {
    const scenario = this.strategies.get(name);
    if (!scenario) {
      throw new Error(`Scenario ${name} not found`);
    }

    await scenario.teardown();
    this.activeScenarios.delete(name);
  }

  async deactivateAllScenarios(): Promise<void> {
    const promises = Array.from(this.activeScenarios).map(name => 
      this.deactivateScenario(name)
    );
    await Promise.all(promises);
  }

  getActiveScenarios(): string[] {
    return Array.from(this.activeScenarios);
  }
}

// Export all mock strategies
export {
  GraphApiMockStrategy,
  ChromaDbMockStrategy,
  NetworkFailureSimulator,
  MockScenarioManager
};