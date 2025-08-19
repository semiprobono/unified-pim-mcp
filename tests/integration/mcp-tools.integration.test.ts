import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { UnifiedPIMServer } from '../../src/infrastructure/mcp/server/UnifiedPIMServer';
import { PlatformAdapterManager } from '../../src/infrastructure/adapters/PlatformAdapterManager';
import { CacheManager } from '../../src/infrastructure/cache/CacheManager';
import { SecurityManager } from '../../src/shared/security/SecurityManager';
import { Logger } from '../../src/shared/logging/Logger';
import { ErrorHandler } from '../../src/shared/error/ErrorHandler';
import { GraphAdapter } from '../../src/infrastructure/adapters/microsoft/GraphAdapter';
import nock from 'nock';

/**
 * MCP Tools Integration Tests
 * 
 * Tests all 17 MCP tools functionality:
 * 
 * Calendar Tools (9):
 * - pim_calendar_search
 * - pim_calendar_get  
 * - pim_calendar_create_event
 * - pim_calendar_update
 * - pim_calendar_delete
 * - pim_calendar_list_events
 * - pim_calendar_find_free_time
 * - pim_calendar_respond
 * - pim_calendar_get_free_busy
 * 
 * Contacts Tools (8):
 * - pim_contacts_search
 * - pim_contacts_get
 * - pim_contacts_create
 * - pim_contacts_update
 * - pim_contacts_delete
 * - pim_contacts_list
 * - pim_contacts_find_by_email
 * - pim_contacts_get_organizations
 */
describe('MCP Tools Integration Tests', () => {
  let pimServer: UnifiedPIMServer;
  let mockPlatformManager: jest.Mocked<PlatformAdapterManager>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockSecurityManager: jest.Mocked<SecurityManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockErrorHandler: jest.Mocked<ErrorHandler>;
  let mockGraphAdapter: jest.Mocked<GraphAdapter>;

  // Test data
  const sampleCalendarEvent = {
    id: 'cal-event-123',
    subject: 'Test Meeting',
    start: new Date('2024-12-01T10:00:00Z'),
    end: new Date('2024-12-01T11:00:00Z'),
    location: 'Conference Room A',
    organizer: { address: 'organizer@example.com' },
    attendees: [
      { address: 'attendee1@example.com' },
      { address: 'attendee2@example.com' }
    ]
  };

  const sampleContact = {
    id: 'contact-123',
    displayName: 'John Doe',
    givenName: 'John',
    surname: 'Doe',
    emails: [{ address: 'john.doe@company.com', type: 'work' }],
    phones: [{ number: '+1-555-123-4567', type: 'mobile' }],
    organization: { name: 'Test Company', title: 'Developer' }
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
    mockGraphAdapter = {
      isAvailable: jest.fn().mockReturnValue(true),
      initialize: jest.fn(),
      dispose: jest.fn(),
      searchEvents: jest.fn(),
      getEvent: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      listEvents: jest.fn(),
      findFreeTime: jest.fn(),
      respondToEvent: jest.fn(),
      getFreeBusy: jest.fn(),
      searchContacts: jest.fn(),
      getContact: jest.fn(),
      createContact: jest.fn(),
      updateContact: jest.fn(),
      deleteContact: jest.fn(),
      fetchContacts: jest.fn(),
      findContactsByEmail: jest.fn()
    } as jest.Mocked<GraphAdapter>;

    mockPlatformManager = {
      getAdapter: jest.fn().mockReturnValue(mockGraphAdapter),
      initialize: jest.fn(),
      dispose: jest.fn(),
      getAvailableAdapters: jest.fn().mockReturnValue(['microsoft']),
      authenticateUser: jest.fn(),
      isUserAuthenticated: jest.fn().mockReturnValue(true)
    } as jest.Mocked<PlatformAdapterManager>;

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

    mockSecurityManager = {
      validateRequest: jest.fn().mockReturnValue(true),
      encryptData: jest.fn(),
      decryptData: jest.fn(),
      hashPassword: jest.fn(),
      verifyPassword: jest.fn(),
      generateToken: jest.fn(),
      verifyToken: jest.fn(),
      dispose: jest.fn()
    } as jest.Mocked<SecurityManager>;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    } as jest.Mocked<Logger>;

    mockErrorHandler = {
      handleError: jest.fn(),
      logError: jest.fn(),
      createErrorResponse: jest.fn()
    } as jest.Mocked<ErrorHandler>;

    // Create PIM server instance
    pimServer = new UnifiedPIMServer(
      mockPlatformManager,
      mockCacheManager,
      mockSecurityManager,
      mockLogger,
      mockErrorHandler
    );

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Calendar Tools', () => {
    test('pim_calendar_search - should search calendar events', async () => {
      // Mock successful search
      mockGraphAdapter.searchEvents.mockResolvedValue({
        success: true,
        data: {
          events: [sampleCalendarEvent],
          pagination: { hasMore: false, total: 1 }
        }
      });

      const result = await pimServer.executeTool('pim_calendar_search', {
        query: 'meeting',
        platform: 'microsoft',
        limit: 10
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.searchEvents).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          query: 'meeting',
          limit: 10
        })
      );
    });

    test('pim_calendar_get - should get specific calendar event', async () => {
      // Mock successful get
      mockGraphAdapter.getEvent.mockResolvedValue({
        success: true,
        data: sampleCalendarEvent
      });

      const result = await pimServer.executeTool('pim_calendar_get', {
        eventId: 'cal-event-123',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.getEvent).toHaveBeenCalledWith('cal-event-123', 'primary');
    });

    test('pim_calendar_create_event - should create calendar event', async () => {
      // Mock successful creation
      mockGraphAdapter.createEvent.mockResolvedValue({
        success: true,
        data: sampleCalendarEvent
      });

      const result = await pimServer.executeTool('pim_calendar_create_event', {
        subject: 'Test Meeting',
        start: '2024-12-01T10:00:00Z',
        end: '2024-12-01T11:00:00Z',
        location: 'Conference Room A',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.createEvent).toHaveBeenCalled();
    });

    test('pim_calendar_update - should update calendar event', async () => {
      // Mock successful update
      mockGraphAdapter.updateEvent.mockResolvedValue({
        success: true,
        data: { ...sampleCalendarEvent, subject: 'Updated Meeting' }
      });

      const result = await pimServer.executeTool('pim_calendar_update', {
        eventId: 'cal-event-123',
        subject: 'Updated Meeting',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.updateEvent).toHaveBeenCalledWith(
        'cal-event-123',
        expect.objectContaining({ subject: 'Updated Meeting' }),
        'primary'
      );
    });

    test('pim_calendar_delete - should delete calendar event', async () => {
      // Mock successful deletion
      mockGraphAdapter.deleteEvent.mockResolvedValue({
        success: true,
        data: true
      });

      const result = await pimServer.executeTool('pim_calendar_delete', {
        eventId: 'cal-event-123',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.deleteEvent).toHaveBeenCalledWith(
        'cal-event-123',
        'primary'
      );
    });

    test('pim_calendar_list_events - should list events in date range', async () => {
      // Mock successful list
      mockGraphAdapter.listEvents.mockResolvedValue({
        success: true,
        data: {
          events: [sampleCalendarEvent],
          pagination: { hasMore: false, total: 1 }
        }
      });

      const result = await pimServer.executeTool('pim_calendar_list_events', {
        dateFrom: '2024-12-01',
        dateTo: '2024-12-07',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.listEvents).toHaveBeenCalled();
    });

    test('pim_calendar_find_free_time - should find free time slots', async () => {
      // Mock successful free time search
      mockGraphAdapter.findFreeTime.mockResolvedValue({
        success: true,
        data: [
          {
            start: new Date('2024-12-01T14:00:00Z'),
            end: new Date('2024-12-01T15:00:00Z'),
            duration: 60
          }
        ]
      });

      const result = await pimServer.executeTool('pim_calendar_find_free_time', {
        attendees: ['user1@example.com', 'user2@example.com'],
        durationMinutes: 60,
        dateFrom: '2024-12-01',
        dateTo: '2024-12-07',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.findFreeTime).toHaveBeenCalled();
    });

    test('pim_calendar_respond - should respond to calendar event', async () => {
      // Mock successful response
      mockGraphAdapter.respondToEvent.mockResolvedValue({
        success: true,
        data: true
      });

      const result = await pimServer.executeTool('pim_calendar_respond', {
        eventId: 'cal-event-123',
        response: 'accepted',
        comment: 'Looking forward to the meeting',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.respondToEvent).toHaveBeenCalled();
    });

    test('pim_calendar_get_free_busy - should get free/busy information', async () => {
      // Mock successful free/busy query
      mockGraphAdapter.getFreeBusy.mockResolvedValue({
        success: true,
        data: {
          schedules: [
            {
              availabilityView: '222000000',
              freeBusyViewType: 'freeBusy'
            }
          ]
        }
      });

      const result = await pimServer.executeTool('pim_calendar_get_free_busy', {
        attendees: ['user1@example.com'],
        dateFrom: '2024-12-01T09:00:00Z',
        dateTo: '2024-12-01T17:00:00Z',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.getFreeBusy).toHaveBeenCalled();
    });
  });

  describe('Contacts Tools', () => {
    test('pim_contacts_search - should search contacts', async () => {
      // Mock successful search
      mockGraphAdapter.searchContacts.mockResolvedValue({
        success: true,
        data: [sampleContact]
      });

      const result = await pimServer.executeTool('pim_contacts_search', {
        query: 'John',
        platform: 'microsoft',
        limit: 10
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.searchContacts).toHaveBeenCalledWith(
        'John',
        expect.objectContaining({
          query: 'John',
          limit: 10
        })
      );
    });

    test('pim_contacts_get - should get specific contact', async () => {
      // Mock successful get
      mockGraphAdapter.getContact.mockResolvedValue({
        success: true,
        data: sampleContact
      });

      const result = await pimServer.executeTool('pim_contacts_get', {
        contactId: 'contact-123',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.getContact).toHaveBeenCalledWith('contact-123');
    });

    test('pim_contacts_create - should create contact', async () => {
      // Mock successful creation
      mockGraphAdapter.createContact.mockResolvedValue({
        success: true,
        data: 'contact-456'
      });

      const result = await pimServer.executeTool('pim_contacts_create', {
        givenName: 'Jane',
        surname: 'Smith',
        displayName: 'Jane Smith',
        emailAddresses: [{ address: 'jane.smith@example.com', type: 'work' }],
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.createContact).toHaveBeenCalled();
    });

    test('pim_contacts_update - should update contact', async () => {
      // Mock successful update
      mockGraphAdapter.updateContact.mockResolvedValue({
        success: true,
        data: { ...sampleContact, displayName: 'John Michael Doe' }
      });

      const result = await pimServer.executeTool('pim_contacts_update', {
        contactId: 'contact-123',
        displayName: 'John Michael Doe',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.updateContact).toHaveBeenCalledWith(
        'contact-123',
        expect.objectContaining({ displayName: 'John Michael Doe' })
      );
    });

    test('pim_contacts_delete - should delete contact', async () => {
      // Mock successful deletion
      mockGraphAdapter.deleteContact.mockResolvedValue({
        success: true,
        data: true
      });

      const result = await pimServer.executeTool('pim_contacts_delete', {
        contactId: 'contact-123',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.deleteContact).toHaveBeenCalledWith('contact-123');
    });

    test('pim_contacts_list - should list contacts with pagination', async () => {
      // Mock successful list
      mockGraphAdapter.fetchContacts.mockResolvedValue({
        success: true,
        data: [sampleContact],
        pagination: { hasMore: false, total: 1 }
      });

      const result = await pimServer.executeTool('pim_contacts_list', {
        limit: 25,
        skip: 0,
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.fetchContacts).toHaveBeenCalledWith({
        limit: 25,
        offset: 0
      });
    });

    test('pim_contacts_find_by_email - should find contacts by email', async () => {
      // Mock successful email search
      mockGraphAdapter.searchContacts.mockResolvedValue({
        success: true,
        data: [sampleContact]
      });

      const result = await pimServer.executeTool('pim_contacts_find_by_email', {
        emailAddress: 'john.doe@company.com',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.searchContacts).toHaveBeenCalledWith(
        '',
        expect.objectContaining({
          query: 'john.doe@company.com'
        })
      );
    });

    test('pim_contacts_get_organizations - should get unique organizations', async () => {
      // Mock successful contacts fetch
      mockGraphAdapter.fetchContacts.mockResolvedValue({
        success: true,
        data: [
          { ...sampleContact, organization: { name: 'Company A' } },
          { ...sampleContact, id: 'contact-2', organization: { name: 'Company B' } },
          { ...sampleContact, id: 'contact-3', organization: { name: 'Company A' } }
        ]
      });

      const result = await pimServer.executeTool('pim_contacts_get_organizations', {
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(mockGraphAdapter.fetchContacts).toHaveBeenCalledWith({ limit: 100 });
    });
  });

  describe('Tool Discovery and Validation', () => {
    test('should list all 17 available tools', async () => {
      const tools = await pimServer.getAvailableTools();

      expect(tools).toHaveLength(19); // 17 + 2 auth tools (pim_auth_start, pim_auth_status)

      // Verify all calendar tools are present
      const calendarTools = [
        'pim_calendar_search',
        'pim_calendar_get',
        'pim_calendar_create_event',
        'pim_calendar_update',
        'pim_calendar_delete',
        'pim_calendar_list_events',
        'pim_calendar_find_free_time',
        'pim_calendar_respond',
        'pim_calendar_get_free_busy'
      ];

      calendarTools.forEach(toolName => {
        expect(tools.some(tool => tool.name === toolName)).toBe(true);
      });

      // Verify all contacts tools are present
      const contactsTools = [
        'pim_contacts_search',
        'pim_contacts_get',
        'pim_contacts_create',
        'pim_contacts_update',
        'pim_contacts_delete',
        'pim_contacts_list',
        'pim_contacts_find_by_email',
        'pim_contacts_get_organizations'
      ];

      contactsTools.forEach(toolName => {
        expect(tools.some(tool => tool.name === toolName)).toBe(true);
      });
    });

    test('should have proper input schemas for all tools', async () => {
      const tools = await pimServer.getAvailableTools();

      tools.forEach(tool => {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });

    test('should handle invalid tool names gracefully', async () => {
      const result = await pimServer.executeTool('invalid_tool_name', {});

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Unknown tool');
    });
  });

  describe('Error Handling', () => {
    test('should handle platform adapter errors', async () => {
      // Mock adapter failure
      mockGraphAdapter.searchEvents.mockResolvedValue({
        success: false,
        error: 'Graph API error'
      });

      const result = await pimServer.executeTool('pim_calendar_search', {
        query: 'test',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('Failed to search');
    });

    test('should handle missing required parameters', async () => {
      const result = await pimServer.executeTool('pim_calendar_get', {
        // Missing eventId
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    test('should handle authentication failures', async () => {
      // Mock authentication failure
      mockPlatformManager.isUserAuthenticated.mockReturnValue(false);

      const result = await pimServer.executeTool('pim_calendar_search', {
        query: 'test',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle concurrent tool executions', async () => {
      // Mock successful responses
      mockGraphAdapter.getEvent.mockResolvedValue({
        success: true,
        data: sampleCalendarEvent
      });

      mockGraphAdapter.getContact.mockResolvedValue({
        success: true,
        data: sampleContact
      });

      // Execute multiple tools concurrently
      const promises = [
        pimServer.executeTool('pim_calendar_get', { eventId: 'event-1', platform: 'microsoft' }),
        pimServer.executeTool('pim_calendar_get', { eventId: 'event-2', platform: 'microsoft' }),
        pimServer.executeTool('pim_contacts_get', { contactId: 'contact-1', platform: 'microsoft' }),
        pimServer.executeTool('pim_contacts_get', { contactId: 'contact-2', platform: 'microsoft' })
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.content).toBeDefined();
      });
    });

    test('should maintain performance under load', async () => {
      // Mock responses
      mockGraphAdapter.searchEvents.mockResolvedValue({
        success: true,
        data: { events: [sampleCalendarEvent], pagination: { hasMore: false, total: 1 } }
      });

      const startTime = Date.now();

      // Execute multiple searches
      const promises = Array.from({ length: 10 }, () =>
        pimServer.executeTool('pim_calendar_search', {
          query: 'test',
          platform: 'microsoft'
        })
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Tool Integration Scenarios', () => {
    test('should support calendar and contacts workflow', async () => {
      // Mock responses for a complete workflow
      mockGraphAdapter.searchContacts.mockResolvedValue({
        success: true,
        data: [sampleContact]
      });

      mockGraphAdapter.createEvent.mockResolvedValue({
        success: true,
        data: sampleCalendarEvent
      });

      // Step 1: Find contacts for meeting
      const contactResult = await pimServer.executeTool('pim_contacts_find_by_email', {
        emailAddress: 'john.doe@company.com',
        platform: 'microsoft'
      });

      expect(contactResult.content[0].text).toContain('Found');

      // Step 2: Create meeting with found contacts
      const eventResult = await pimServer.executeTool('pim_calendar_create_event', {
        subject: 'Meeting with John',
        start: '2024-12-01T10:00:00Z',
        end: '2024-12-01T11:00:00Z',
        attendees: ['john.doe@company.com'],
        platform: 'microsoft'
      });

      expect(eventResult.content[0].text).toContain('created');
    });

    test('should validate tool parameters correctly', async () => {
      const tools = await pimServer.getAvailableTools();
      const calendarSearchTool = tools.find(t => t.name === 'pim_calendar_search');

      expect(calendarSearchTool).toBeDefined();
      expect(calendarSearchTool!.inputSchema.properties).toHaveProperty('query');
      expect(calendarSearchTool!.inputSchema.properties).toHaveProperty('platform');
      expect(calendarSearchTool!.inputSchema.properties).toHaveProperty('limit');
    });
  });
});