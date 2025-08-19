import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { CalendarService } from '../../src/infrastructure/adapters/microsoft/services/CalendarService';
import { GraphClient } from '../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { CacheManager } from '../../src/infrastructure/cache/CacheManager';
import { ChromaDbInitializer } from '../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer';
import { ErrorHandler } from '../../src/infrastructure/adapters/microsoft/errors/ErrorHandler';
import { Logger } from '../../src/shared/logging/Logger';
import { CalendarEvent } from '../../src/domain/entities/CalendarEvent';
import { EmailAddress } from '../../src/domain/value-objects/EmailAddress';
import { DateRange } from '../../src/domain/value-objects/DateRange';
import nock from 'nock';

/**
 * Calendar Service Integration Tests
 * 
 * Tests the CalendarService functionality including:
 * - Calendar event CRUD operations
 * - Event searching and filtering
 * - Free/busy time queries
 * - Calendar management
 * - Graph API integration
 * - Caching and ChromaDB integration
 */
describe('CalendarService Integration Tests', () => {
  let calendarService: CalendarService;
  let mockGraphClient: jest.Mocked<GraphClient>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockChromaDb: jest.Mocked<ChromaDbInitializer>;
  let mockErrorHandler: jest.Mocked<ErrorHandler>;
  let mockLogger: jest.Mocked<Logger>;

  // Test data
  const testCalendarId = 'test-calendar-123';
  const testEventId = 'test-event-456';
  const testUserId = 'test-user-789';

  const sampleEvent: CalendarEvent = {
    id: testEventId,
    subject: 'Test Meeting',
    start: new Date('2024-12-01T10:00:00Z'),
    end: new Date('2024-12-01T11:00:00Z'),
    location: 'Conference Room A',
    organizer: EmailAddress.create('organizer@example.com'),
    attendees: [
      EmailAddress.create('attendee1@example.com'),
      EmailAddress.create('attendee2@example.com')
    ],
    body: 'This is a test meeting',
    importance: 'normal',
    sensitivity: 'normal',
    showAs: 'busy',
    isOnlineMeeting: false,
    categories: ['work', 'meeting'],
    recurrence: null,
    metadata: {
      calendarId: testCalendarId,
      etag: 'test-etag',
      changeKey: 'test-change-key',
      createdDateTime: new Date('2024-11-01T09:00:00Z'),
      lastModifiedDateTime: new Date('2024-11-01T09:00:00Z'),
      reminderMinutesBeforeStart: 15,
      isReminderOn: true,
      hasAttachments: false,
      isCancelled: false,
      isOrganizer: true,
      responseRequested: true,
      seriesMasterId: null,
      type: 'singleInstance'
    }
  };

  const sampleGraphEvent = {
    id: testEventId,
    subject: 'Test Meeting',
    start: {
      dateTime: '2024-12-01T10:00:00.0000000',
      timeZone: 'UTC'
    },
    end: {
      dateTime: '2024-12-01T11:00:00.0000000',
      timeZone: 'UTC'
    },
    location: {
      displayName: 'Conference Room A'
    },
    organizer: {
      emailAddress: {
        address: 'organizer@example.com',
        name: 'Organizer'
      }
    },
    attendees: [
      {
        emailAddress: {
          address: 'attendee1@example.com',
          name: 'Attendee 1'
        },
        status: {
          response: 'accepted',
          time: '2024-11-01T09:30:00Z'
        }
      },
      {
        emailAddress: {
          address: 'attendee2@example.com',
          name: 'Attendee 2'
        },
        status: {
          response: 'tentativelyAccepted',
          time: '2024-11-01T09:45:00Z'
        }
      }
    ],
    body: {
      contentType: 'text',
      content: 'This is a test meeting'
    },
    importance: 'normal',
    sensitivity: 'normal',
    showAs: 'busy',
    isOnlineMeeting: false,
    categories: ['work', 'meeting'],
    '@odata.etag': 'W/"test-etag"',
    changeKey: 'test-change-key',
    createdDateTime: '2024-11-01T09:00:00.0000000Z',
    lastModifiedDateTime: '2024-11-01T09:00:00.0000000Z',
    reminderMinutesBeforeStart: 15,
    isReminderOn: true,
    hasAttachments: false,
    isCancelled: false,
    isOrganizer: true,
    responseRequested: true,
    seriesMasterId: null,
    type: 'singleInstance'
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
    calendarService = new CalendarService(
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

  describe('Calendar Event CRUD Operations', () => {
    test('should retrieve a calendar event by ID', async () => {
      // Mock cache miss
      mockCacheManager.get.mockResolvedValue(null);
      
      // Mock successful Graph API response
      mockGraphClient.get.mockResolvedValue({
        data: sampleGraphEvent,
        status: 200,
        headers: {}
      });

      const result = await calendarService.getEvent(testEventId, testCalendarId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(testEventId);
      expect(result.data!.subject).toBe('Test Meeting');
      
      // Verify Graph API was called
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        `/calendars/${testCalendarId}/events/${testEventId}`,
        expect.any(Object)
      );

      // Verify caching
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    test('should return cached event when available', async () => {
      // Mock cache hit
      mockCacheManager.get.mockResolvedValue(sampleEvent);

      const result = await calendarService.getEvent(testEventId, testCalendarId);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(sampleEvent);
      
      // Verify Graph API was NOT called
      expect(mockGraphClient.get).not.toHaveBeenCalled();
      
      // Verify cache was checked
      expect(mockCacheManager.get).toHaveBeenCalledWith(
        expect.stringContaining(testEventId)
      );
    });

    test('should create a new calendar event', async () => {
      const newEvent = {
        ...sampleEvent,
        id: undefined // New event has no ID
      };

      // Mock successful creation
      mockGraphClient.post.mockResolvedValue({
        data: sampleGraphEvent,
        status: 201,
        headers: {}
      });

      const result = await calendarService.createEvent(newEvent, testCalendarId);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.id).toBe(testEventId);
      
      // Verify Graph API was called
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        `/calendars/${testCalendarId}/events`,
        expect.any(Object),
        expect.any(Object)
      );

      // Verify ChromaDB indexing
      expect(mockChromaDb.addDocuments).toHaveBeenCalled();
    });

    test('should update an existing calendar event', async () => {
      const updatedEvent = {
        ...sampleEvent,
        subject: 'Updated Meeting Title'
      };

      // Mock successful update
      mockGraphClient.patch.mockResolvedValue({
        data: { ...sampleGraphEvent, subject: 'Updated Meeting Title' },
        status: 200,
        headers: {}
      });

      const result = await calendarService.updateEvent(testEventId, updatedEvent, testCalendarId);

      expect(result.success).toBe(true);
      expect(result.data!.subject).toBe('Updated Meeting Title');
      
      // Verify Graph API was called
      expect(mockGraphClient.patch).toHaveBeenCalledWith(
        `/calendars/${testCalendarId}/events/${testEventId}`,
        expect.any(Object),
        expect.any(Object)
      );

      // Verify cache invalidation
      expect(mockCacheManager.delete).toHaveBeenCalled();
    });

    test('should delete a calendar event', async () => {
      // Mock successful deletion
      mockGraphClient.delete.mockResolvedValue({
        data: null,
        status: 204,
        headers: {}
      });

      const result = await calendarService.deleteEvent(testEventId, testCalendarId);

      expect(result.success).toBe(true);
      
      // Verify Graph API was called
      expect(mockGraphClient.delete).toHaveBeenCalledWith(
        `/calendars/${testCalendarId}/events/${testEventId}`
      );

      // Verify cleanup
      expect(mockCacheManager.delete).toHaveBeenCalled();
      expect(mockChromaDb.deleteDocuments).toHaveBeenCalled();
    });
  });

  describe('Calendar Event Search and Filtering', () => {
    test('should search events with query parameters', async () => {
      const searchOptions = {
        query: 'meeting',
        dateFrom: new Date('2024-12-01'),
        dateTo: new Date('2024-12-31'),
        limit: 10
      };

      // Mock search results
      mockGraphClient.get.mockResolvedValue({
        data: {
          value: [sampleGraphEvent],
          '@odata.nextLink': null
        },
        status: 200,
        headers: {}
      });

      const result = await calendarService.searchEvents(searchOptions, testCalendarId);

      expect(result.success).toBe(true);
      expect(result.data.events).toHaveLength(1);
      expect(result.data.events[0].subject).toBe('Test Meeting');
      
      // Verify Graph API was called with search parameters
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        expect.stringContaining(`/calendars/${testCalendarId}/events`),
        expect.objectContaining({
          params: expect.objectContaining({
            $search: 'meeting',
            $top: 10
          })
        })
      );
    });

    test('should filter events by attendee', async () => {
      const searchOptions = {
        attendee: 'attendee1@example.com',
        limit: 5
      };

      mockGraphClient.get.mockResolvedValue({
        data: {
          value: [sampleGraphEvent],
          '@odata.nextLink': null
        },
        status: 200,
        headers: {}
      });

      const result = await calendarService.searchEvents(searchOptions, testCalendarId);

      expect(result.success).toBe(true);
      expect(result.data.events).toHaveLength(1);
      
      // Verify filtering was applied
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/events'),
        expect.objectContaining({
          params: expect.objectContaining({
            $filter: expect.stringContaining('attendee1@example.com')
          })
        })
      );
    });

    test('should get events in a date range', async () => {
      const dateRange = new DateRange(
        new Date('2024-12-01'),
        new Date('2024-12-07')
      );

      mockGraphClient.get.mockResolvedValue({
        data: {
          value: [sampleGraphEvent],
          '@odata.nextLink': null
        },
        status: 200,
        headers: {}
      });

      const result = await calendarService.getEventsInRange(dateRange, testCalendarId);

      expect(result.success).toBe(true);
      expect(result.data.events).toHaveLength(1);
      
      // Verify date filtering
      expect(mockGraphClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/calendarView'),
        expect.objectContaining({
          params: expect.objectContaining({
            startDateTime: expect.any(String),
            endDateTime: expect.any(String)
          })
        })
      );
    });
  });

  describe('Free/Busy and Time Management', () => {
    test('should get free/busy information for users', async () => {
      const attendees = [
        EmailAddress.create('user1@example.com'),
        EmailAddress.create('user2@example.com')
      ];
      const timeRange = new DateRange(
        new Date('2024-12-01T09:00:00Z'),
        new Date('2024-12-01T17:00:00Z')
      );

      // Mock free/busy response
      mockGraphClient.post.mockResolvedValue({
        data: {
          value: [
            {
              schedules: [
                {
                  availabilityView: '222000000',
                  freeBusyViewType: 'freeBusy',
                  workingHours: {
                    daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
                    startTime: '09:00:00.0000000',
                    endTime: '17:00:00.0000000',
                    timeZone: { name: 'UTC' }
                  }
                }
              ]
            }
          ]
        },
        status: 200,
        headers: {}
      });

      const result = await calendarService.getFreeBusy(attendees, timeRange);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      
      // Verify Graph API was called
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        '/me/calendar/getSchedule',
        expect.objectContaining({
          Schedules: expect.arrayContaining(['user1@example.com', 'user2@example.com'])
        })
      );
    });

    test('should find free time slots', async () => {
      const attendees = [EmailAddress.create('user1@example.com')];
      const duration = 60; // 1 hour
      const timeRange = new DateRange(
        new Date('2024-12-01T09:00:00Z'),
        new Date('2024-12-01T17:00:00Z')
      );

      // Mock free time response
      mockGraphClient.post.mockResolvedValue({
        data: {
          value: [
            {
              schedules: [
                {
                  availabilityView: '000000000', // All free
                  freeBusyViewType: 'freeBusy'
                }
              ]
            }
          ]
        },
        status: 200,
        headers: {}
      });

      const result = await calendarService.findFreeTime(attendees, duration, timeRange);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('Calendar Management', () => {
    test('should list user calendars', async () => {
      const mockCalendars = [
        {
          id: 'calendar-1',
          name: 'Primary Calendar',
          color: 'auto',
          isDefaultCalendar: true,
          canEdit: true,
          canShare: true,
          canViewPrivateItems: true,
          owner: {
            name: 'Test User',
            address: 'test@example.com'
          }
        },
        {
          id: 'calendar-2',
          name: 'Work Calendar',
          color: 'blue',
          isDefaultCalendar: false,
          canEdit: true,
          canShare: false,
          canViewPrivateItems: true,
          owner: {
            name: 'Test User',
            address: 'test@example.com'
          }
        }
      ];

      mockGraphClient.get.mockResolvedValue({
        data: { value: mockCalendars },
        status: 200,
        headers: {}
      });

      const result = await calendarService.getCalendars();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Primary Calendar');
      expect(result.data[1].name).toBe('Work Calendar');
      
      // Verify Graph API was called
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/calendars');
    });
  });

  describe('Error Handling', () => {
    test('should handle Graph API errors gracefully', async () => {
      const error = new Error('Graph API Error');
      mockGraphClient.get.mockRejectedValue(error);
      mockErrorHandler.handleGraphError.mockResolvedValue({
        success: false,
        error: {
          code: 'GRAPH_API_ERROR',
          message: 'Failed to retrieve calendar event',
          details: error
        }
      });

      const result = await calendarService.getEvent(testEventId, testCalendarId);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(mockErrorHandler.handleGraphError).toHaveBeenCalledWith(error);
    });

    test('should handle authentication errors', async () => {
      mockGraphClient.isAuthenticated.mockReturnValue(false);

      const result = await calendarService.getEvent(testEventId, testCalendarId);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('AUTHENTICATION_REQUIRED');
    });

    test('should handle network timeouts', async () => {
      const timeoutError = new Error('Network timeout');
      mockGraphClient.get.mockRejectedValue(timeoutError);
      mockErrorHandler.handleGraphError.mockResolvedValue({
        success: false,
        error: {
          code: 'NETWORK_TIMEOUT',
          message: 'Request timed out',
          details: timeoutError
        }
      });

      const result = await calendarService.getEvent(testEventId, testCalendarId);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_TIMEOUT');
    });
  });

  describe('Performance and Caching', () => {
    test('should cache frequently accessed events', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockGraphClient.get.mockResolvedValue({
        data: sampleGraphEvent,
        status: 200,
        headers: {}
      });

      await calendarService.getEvent(testEventId, testCalendarId);

      // Verify caching occurred
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        expect.stringContaining(testEventId),
        expect.any(Object),
        expect.any(Number)
      );
    });

    test('should batch multiple calendar requests', async () => {
      const eventIds = ['event-1', 'event-2', 'event-3'];
      
      mockCacheManager.get.mockResolvedValue(null);
      mockGraphClient.get.mockResolvedValue({
        data: sampleGraphEvent,
        status: 200,
        headers: {}
      });

      // Simulate concurrent requests
      const promises = eventIds.map(id => 
        calendarService.getEvent(id, testCalendarId)
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('ChromaDB Integration', () => {
    test('should index calendar events for semantic search', async () => {
      const newEvent = { ...sampleEvent, id: undefined };
      
      mockGraphClient.post.mockResolvedValue({
        data: sampleGraphEvent,
        status: 201,
        headers: {}
      });

      await calendarService.createEvent(newEvent, testCalendarId);

      // Verify ChromaDB indexing
      expect(mockChromaDb.addDocuments).toHaveBeenCalledWith(
        'graph-search-index',
        expect.arrayContaining([
          expect.objectContaining({
            type: 'calendar_event',
            title: 'Test Meeting'
          })
        ]),
        expect.any(Array),
        expect.any(Array)
      );
    });

    test('should update ChromaDB when events are modified', async () => {
      const updatedEvent = { ...sampleEvent, subject: 'Updated Meeting' };
      
      mockGraphClient.patch.mockResolvedValue({
        data: { ...sampleGraphEvent, subject: 'Updated Meeting' },
        status: 200,
        headers: {}
      });

      await calendarService.updateEvent(testEventId, updatedEvent, testCalendarId);

      // Verify ChromaDB update
      expect(mockChromaDb.updateDocuments).toHaveBeenCalledWith(
        'graph-search-index',
        expect.arrayContaining([testEventId]),
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Updated Meeting'
          })
        ])
      );
    });
  });
});