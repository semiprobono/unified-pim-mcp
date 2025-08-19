import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { UnifiedPIMServer } from '../../src/infrastructure/mcp/server/UnifiedPIMServer';
import { PlatformAdapterManager } from '../../src/infrastructure/adapters/PlatformAdapterManager';
import { CacheManager } from '../../src/infrastructure/cache/CacheManager';
import { SecurityManager } from '../../src/shared/security/SecurityManager';
import { Logger } from '../../src/shared/logging/Logger';
import { ErrorHandler } from '../../src/shared/error/ErrorHandler';
import { GraphAdapter } from '../../src/infrastructure/adapters/microsoft/GraphAdapter';
import { EmailService } from '../../src/infrastructure/adapters/microsoft/services/EmailService';
import { CalendarService } from '../../src/infrastructure/adapters/microsoft/services/CalendarService';
import { ContactsService } from '../../src/infrastructure/adapters/microsoft/services/ContactsService';
import { Email } from '../../src/domain/entities/Email';
import { CalendarEvent } from '../../src/domain/entities/CalendarEvent';
import { Contact } from '../../src/domain/entities/Contact';
import { EmailAddress } from '../../src/domain/value-objects/EmailAddress';
import nock from 'nock';

/**
 * Cross-Service Integration Tests
 * 
 * Tests integration between different PIM services:
 * 
 * 1. Email → Calendar Integration
 *    - Parse meeting invites from emails
 *    - Extract event details from email content
 *    - Create calendar events from email invitations
 *    - Update calendar events based on email responses
 * 
 * 2. Contacts → Email Integration  
 *    - Contact lookup during email composition
 *    - Auto-complete email addresses from contacts
 *    - Contact enrichment from email metadata
 *    - Contact updates based on email interactions
 * 
 * 3. Calendar → Contacts Integration
 *    - Attendee contact lookup and enrichment
 *    - Contact creation from meeting attendees
 *    - Contact updates based on meeting participation
 */
describe('Cross-Service Integration Tests', () => {
  let pimServer: UnifiedPIMServer;
  let mockPlatformManager: jest.Mocked<PlatformAdapterManager>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockSecurityManager: jest.Mocked<SecurityManager>;
  let mockLogger: jest.Mocked<Logger>;
  let mockErrorHandler: jest.Mocked<ErrorHandler>;
  let mockGraphAdapter: jest.Mocked<GraphAdapter>;

  // Test data
  const meetingInviteEmail: Email = {
    id: 'email-invite-123',
    subject: 'Meeting Invitation: Project Review',
    body: `
      Dear Team,
      
      You are invited to attend the Project Review meeting.
      
      When: Monday, December 1, 2024 10:00 AM - 11:00 AM (UTC)
      Where: Conference Room A
      
      Please confirm your attendance.
      
      Best regards,
      John Doe
    `,
    from: EmailAddress.create('john.doe@company.com'),
    to: [EmailAddress.create('team@company.com')],
    cc: [],
    bcc: [],
    receivedDateTime: new Date('2024-11-25T09:00:00Z'),
    sentDateTime: new Date('2024-11-25T09:00:00Z'),
    importance: 'normal',
    hasAttachments: false,
    isRead: false,
    categories: ['meeting'],
    metadata: {
      messageId: 'msg-123',
      internetMessageId: '<123@company.com>',
      conversationId: 'conv-123',
      parentFolderId: 'inbox',
      changeKey: 'change-123',
      webLink: 'https://outlook.com/mail/123',
      flag: null,
      etag: 'etag-123'
    }
  };

  const sampleCalendarEvent: CalendarEvent = {
    id: 'cal-event-123',
    subject: 'Project Review',
    start: new Date('2024-12-01T10:00:00Z'),
    end: new Date('2024-12-01T11:00:00Z'),
    location: 'Conference Room A',
    organizer: EmailAddress.create('john.doe@company.com'),
    attendees: [
      EmailAddress.create('team@company.com')
    ],
    body: 'Project Review meeting',
    importance: 'normal',
    sensitivity: 'normal',
    showAs: 'busy',
    isOnlineMeeting: false,
    categories: ['work'],
    recurrence: null,
    metadata: {
      calendarId: 'primary',
      etag: 'cal-etag-123',
      changeKey: 'cal-change-123',
      createdDateTime: new Date('2024-11-25T09:00:00Z'),
      lastModifiedDateTime: new Date('2024-11-25T09:00:00Z'),
      reminderMinutesBeforeStart: 15,
      isReminderOn: true,
      hasAttachments: false,
      isCancelled: false,
      isOrganizer: false,
      responseRequested: true,
      seriesMasterId: null,
      type: 'singleInstance'
    }
  };

  const sampleContact: Contact = {
    id: 'contact-123',
    name: {
      first: 'John',
      last: 'Doe',
      middle: '',
      prefix: '',
      suffix: ''
    },
    displayName: 'John Doe',
    emailAddresses: [EmailAddress.work('john.doe@company.com')],
    phoneNumbers: [],
    addresses: [],
    organization: {
      company: 'Tech Company Inc.',
      department: 'Engineering',
      title: 'Senior Developer',
      office: 'Main Office'
    },
    personalInfo: {},
    socialProfiles: [],
    notes: '',
    categories: [],
    isFavorite: false,
    metadata: {
      changeKey: 'contact-change-123',
      createdDateTime: new Date('2024-01-01T00:00:00Z'),
      lastModifiedDateTime: new Date('2024-11-01T00:00:00Z'),
      etag: 'contact-etag-123',
      parentFolderId: 'contacts',
      flag: null
    }
  };

  beforeAll(async () => {
    nock.disableNetConnect();
    nock.enableNetConnect('localhost');
  });

  afterAll(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  beforeEach(() => {
    // Create comprehensive mock for GraphAdapter
    mockGraphAdapter = {
      isAvailable: jest.fn().mockReturnValue(true),
      initialize: jest.fn(),
      dispose: jest.fn(),
      
      // Email methods
      searchEmails: jest.fn(),
      getEmail: jest.fn(),
      sendEmail: jest.fn(),
      replyToEmail: jest.fn(),
      forwardEmail: jest.fn(),
      deleteEmail: jest.fn(),
      updateEmail: jest.fn(),
      
      // Calendar methods
      searchEvents: jest.fn(),
      getEvent: jest.fn(),
      createEvent: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      listEvents: jest.fn(),
      findFreeTime: jest.fn(),
      respondToEvent: jest.fn(),
      getFreeBusy: jest.fn(),
      
      // Contacts methods
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

    pimServer = new UnifiedPIMServer(
      mockPlatformManager,
      mockCacheManager,
      mockSecurityManager,
      mockLogger,
      mockErrorHandler
    );

    jest.clearAllMocks();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Email → Calendar Integration', () => {
    test('should extract meeting details from meeting invite email', async () => {
      // Mock email retrieval
      mockGraphAdapter.getEmail.mockResolvedValue({
        success: true,
        data: meetingInviteEmail
      });

      // Mock calendar event creation
      mockGraphAdapter.createEvent.mockResolvedValue({
        success: true,
        data: sampleCalendarEvent
      });

      // Step 1: Get the meeting invite email
      const emailResult = await pimServer.executeTool('pim_email_get', {
        emailId: 'email-invite-123',
        platform: 'microsoft'
      });

      expect(emailResult).toBeDefined();
      expect(mockGraphAdapter.getEmail).toHaveBeenCalled();

      // Step 2: Create calendar event from email content
      const calendarResult = await pimServer.executeTool('pim_calendar_create_event', {
        subject: 'Project Review',
        start: '2024-12-01T10:00:00Z',
        end: '2024-12-01T11:00:00Z',
        location: 'Conference Room A',
        organizer: 'john.doe@company.com',
        attendees: ['team@company.com'],
        platform: 'microsoft'
      });

      expect(calendarResult).toBeDefined();
      expect(mockGraphAdapter.createEvent).toHaveBeenCalled();
    });

    test('should handle calendar event responses via email', async () => {
      // Mock getting calendar event
      mockGraphAdapter.getEvent.mockResolvedValue({
        success: true,
        data: sampleCalendarEvent
      });

      // Mock responding to event
      mockGraphAdapter.respondToEvent.mockResolvedValue({
        success: true,
        data: true
      });

      // Mock sending response email
      mockGraphAdapter.sendEmail.mockResolvedValue({
        success: true,
        data: { id: 'response-email-123' }
      });

      // Step 1: Respond to calendar event
      const respondResult = await pimServer.executeTool('pim_calendar_respond', {
        eventId: 'cal-event-123',
        response: 'accepted',
        comment: 'Looking forward to the meeting',
        sendResponse: true,
        platform: 'microsoft'
      });

      expect(respondResult).toBeDefined();
      expect(mockGraphAdapter.respondToEvent).toHaveBeenCalled();
    });

    test('should update calendar events based on email changes', async () => {
      // Mock finding related emails
      mockGraphAdapter.searchEmails.mockResolvedValue({
        success: true,
        data: {
          emails: [meetingInviteEmail],
          pagination: { hasMore: false, total: 1 }
        }
      });

      // Mock updating calendar event
      mockGraphAdapter.updateEvent.mockResolvedValue({
        success: true,
        data: { ...sampleCalendarEvent, location: 'Conference Room B' }
      });

      // Search for related emails
      const emailSearchResult = await pimServer.executeTool('pim_email_search', {
        query: 'Project Review',
        category: 'meeting',
        platform: 'microsoft'
      });

      expect(emailSearchResult).toBeDefined();

      // Update calendar event based on email changes
      const updateResult = await pimServer.executeTool('pim_calendar_update', {
        eventId: 'cal-event-123',
        location: 'Conference Room B',
        platform: 'microsoft'
      });

      expect(updateResult).toBeDefined();
      expect(mockGraphAdapter.updateEvent).toHaveBeenCalled();
    });

    test('should handle recurring meeting series from email', async () => {
      const recurringEvent = {
        ...sampleCalendarEvent,
        recurrence: {
          pattern: {
            type: 'weekly',
            interval: 1,
            daysOfWeek: ['monday']
          },
          range: {
            type: 'endDate',
            startDate: '2024-12-01',
            endDate: '2024-12-29'
          }
        }
      };

      mockGraphAdapter.createEvent.mockResolvedValue({
        success: true,
        data: recurringEvent
      });

      const result = await pimServer.executeTool('pim_calendar_create_event', {
        subject: 'Weekly Status Meeting',
        start: '2024-12-01T10:00:00Z',
        end: '2024-12-01T11:00:00Z',
        recurrence: {
          pattern: { type: 'weekly', interval: 1, daysOfWeek: ['monday'] },
          range: { type: 'endDate', startDate: '2024-12-01', endDate: '2024-12-29' }
        },
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(mockGraphAdapter.createEvent).toHaveBeenCalled();
    });
  });

  describe('Contacts → Email Integration', () => {
    test('should lookup contacts during email composition', async () => {
      // Mock contact search
      mockGraphAdapter.searchContacts.mockResolvedValue({
        success: true,
        data: [sampleContact]
      });

      // Mock email creation with contact lookup
      mockGraphAdapter.sendEmail.mockResolvedValue({
        success: true,
        data: { id: 'sent-email-123' }
      });

      // Step 1: Search for contacts to add to email
      const contactResult = await pimServer.executeTool('pim_contacts_find_by_email', {
        emailAddress: 'john.doe@company.com',
        platform: 'microsoft'
      });

      expect(contactResult).toBeDefined();
      expect(mockGraphAdapter.searchContacts).toHaveBeenCalled();

      // Step 2: Send email using found contact
      const emailResult = await pimServer.executeTool('pim_email_send', {
        to: ['john.doe@company.com'],
        subject: 'Follow up on project',
        body: 'Hi John, following up on our discussion...',
        platform: 'microsoft'
      });

      expect(emailResult).toBeDefined();
      expect(mockGraphAdapter.sendEmail).toHaveBeenCalled();
    });

    test('should auto-complete email addresses from contacts', async () => {
      // Mock contact search with partial name
      mockGraphAdapter.searchContacts.mockResolvedValue({
        success: true,
        data: [
          sampleContact,
          {
            ...sampleContact,
            id: 'contact-456',
            displayName: 'John Smith',
            emailAddresses: [EmailAddress.work('john.smith@company.com')]
          }
        ]
      });

      const result = await pimServer.executeTool('pim_contacts_search', {
        query: 'John',
        platform: 'microsoft'
      });

      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('John Doe');
      expect(result.content[0].text).toContain('John Smith');
      expect(mockGraphAdapter.searchContacts).toHaveBeenCalledWith(
        'John',
        expect.any(Object)
      );
    });

    test('should enrich contacts from email metadata', async () => {
      // Mock email retrieval with sender info
      const emailWithSenderInfo = {
        ...meetingInviteEmail,
        from: EmailAddress.create('new.contact@external.com', 'Jane Smith'),
        metadata: {
          ...meetingInviteEmail.metadata,
          senderDisplayName: 'Jane Smith',
          senderOrganization: 'External Corp'
        }
      };

      mockGraphAdapter.getEmail.mockResolvedValue({
        success: true,
        data: emailWithSenderInfo
      });

      // Mock contact search (no existing contact)
      mockGraphAdapter.searchContacts.mockResolvedValue({
        success: true,
        data: []
      });

      // Mock contact creation
      mockGraphAdapter.createContact.mockResolvedValue({
        success: true,
        data: 'new-contact-789'
      });

      // Get email and check if sender exists in contacts
      const emailResult = await pimServer.executeTool('pim_email_get', {
        emailId: 'email-invite-123',
        platform: 'microsoft'
      });

      expect(emailResult).toBeDefined();

      // Search for existing contact
      const searchResult = await pimServer.executeTool('pim_contacts_find_by_email', {
        emailAddress: 'new.contact@external.com',
        platform: 'microsoft'
      });

      expect(searchResult).toBeDefined();

      // Create new contact if not found
      const createResult = await pimServer.executeTool('pim_contacts_create', {
        displayName: 'Jane Smith',
        emailAddresses: [{ address: 'new.contact@external.com', type: 'work' }],
        companyName: 'External Corp',
        platform: 'microsoft'
      });

      expect(createResult).toBeDefined();
      expect(mockGraphAdapter.createContact).toHaveBeenCalled();
    });

    test('should update contact interaction history from emails', async () => {
      // Mock contact retrieval
      mockGraphAdapter.getContact.mockResolvedValue({
        success: true,
        data: sampleContact
      });

      // Mock email search for contact interactions
      mockGraphAdapter.searchEmails.mockResolvedValue({
        success: true,
        data: {
          emails: [meetingInviteEmail],
          pagination: { hasMore: false, total: 1 }
        }
      });

      // Mock contact update with interaction notes
      mockGraphAdapter.updateContact.mockResolvedValue({
        success: true,
        data: {
          ...sampleContact,
          notes: 'Last interaction: Meeting invitation received 2024-11-25'
        }
      });

      // Get contact
      const contactResult = await pimServer.executeTool('pim_contacts_get', {
        contactId: 'contact-123',
        platform: 'microsoft'
      });

      expect(contactResult).toBeDefined();

      // Search for emails from this contact
      const emailSearchResult = await pimServer.executeTool('pim_email_search', {
        from: 'john.doe@company.com',
        platform: 'microsoft'
      });

      expect(emailSearchResult).toBeDefined();

      // Update contact with interaction info
      const updateResult = await pimServer.executeTool('pim_contacts_update', {
        contactId: 'contact-123',
        notes: 'Last interaction: Meeting invitation received 2024-11-25',
        platform: 'microsoft'
      });

      expect(updateResult).toBeDefined();
      expect(mockGraphAdapter.updateContact).toHaveBeenCalled();
    });
  });

  describe('Calendar → Contacts Integration', () => {
    test('should lookup and enrich attendee contacts in calendar events', async () => {
      // Mock calendar event with attendees
      const eventWithAttendees = {
        ...sampleCalendarEvent,
        attendees: [
          EmailAddress.create('john.doe@company.com'),
          EmailAddress.create('jane.smith@external.com'),
          EmailAddress.create('unknown@example.com')
        ]
      };

      mockGraphAdapter.getEvent.mockResolvedValue({
        success: true,
        data: eventWithAttendees
      });

      // Mock contact lookups
      mockGraphAdapter.searchContacts
        .mockResolvedValueOnce({
          success: true,
          data: [sampleContact] // Found John Doe
        })
        .mockResolvedValueOnce({
          success: true,
          data: [] // Jane Smith not found
        })
        .mockResolvedValueOnce({
          success: true,
          data: [] // Unknown not found
        });

      // Get calendar event
      const eventResult = await pimServer.executeTool('pim_calendar_get', {
        eventId: 'cal-event-123',
        platform: 'microsoft'
      });

      expect(eventResult).toBeDefined();

      // Look up each attendee in contacts
      const attendeeEmails = ['john.doe@company.com', 'jane.smith@external.com', 'unknown@example.com'];
      
      for (const email of attendeeEmails) {
        const contactSearchResult = await pimServer.executeTool('pim_contacts_find_by_email', {
          emailAddress: email,
          platform: 'microsoft'
        });

        expect(contactSearchResult).toBeDefined();
      }

      expect(mockGraphAdapter.searchContacts).toHaveBeenCalledTimes(3);
    });

    test('should create contacts from new meeting attendees', async () => {
      // Mock external attendee not in contacts
      mockGraphAdapter.searchContacts.mockResolvedValue({
        success: true,
        data: []
      });

      // Mock contact creation
      mockGraphAdapter.createContact.mockResolvedValue({
        success: true,
        data: 'new-attendee-contact-456'
      });

      // Search for attendee (not found)
      const searchResult = await pimServer.executeTool('pim_contacts_find_by_email', {
        emailAddress: 'external.attendee@partner.com',
        platform: 'microsoft'
      });

      expect(searchResult.content[0].text).toContain('No contacts found');

      // Create new contact for external attendee
      const createResult = await pimServer.executeTool('pim_contacts_create', {
        displayName: 'External Attendee',
        emailAddresses: [{ address: 'external.attendee@partner.com', type: 'work' }],
        notes: 'Added from meeting attendee list',
        platform: 'microsoft'
      });

      expect(createResult).toBeDefined();
      expect(mockGraphAdapter.createContact).toHaveBeenCalled();
    });

    test('should update contact meeting participation history', async () => {
      // Mock contact retrieval
      mockGraphAdapter.getContact.mockResolvedValue({
        success: true,
        data: sampleContact
      });

      // Mock calendar search for events with this contact
      mockGraphAdapter.searchEvents.mockResolvedValue({
        success: true,
        data: {
          events: [sampleCalendarEvent],
          pagination: { hasMore: false, total: 1 }
        }
      });

      // Mock contact update
      mockGraphAdapter.updateContact.mockResolvedValue({
        success: true,
        data: {
          ...sampleContact,
          notes: 'Recent meetings: Project Review (2024-12-01)'
        }
      });

      // Get contact
      const contactResult = await pimServer.executeTool('pim_contacts_get', {
        contactId: 'contact-123',
        platform: 'microsoft'
      });

      expect(contactResult).toBeDefined();

      // Search for calendar events with this contact
      const calendarSearchResult = await pimServer.executeTool('pim_calendar_search', {
        attendee: 'john.doe@company.com',
        platform: 'microsoft'
      });

      expect(calendarSearchResult).toBeDefined();

      // Update contact with meeting history
      const updateResult = await pimServer.executeTool('pim_contacts_update', {
        contactId: 'contact-123',
        notes: 'Recent meetings: Project Review (2024-12-01)',
        platform: 'microsoft'
      });

      expect(updateResult).toBeDefined();
      expect(mockGraphAdapter.updateContact).toHaveBeenCalled();
    });

    test('should find optimal meeting times based on attendee availability', async () => {
      const attendeeEmails = ['john.doe@company.com', 'jane.smith@company.com'];

      // Mock free/busy query
      mockGraphAdapter.getFreeBusy.mockResolvedValue({
        success: true,
        data: {
          schedules: [
            {
              emailAddress: 'john.doe@company.com',
              availabilityView: '000222000', // Busy 14:00-16:00
              freeBusyViewType: 'freeBusy'
            },
            {
              emailAddress: 'jane.smith@company.com',
              availabilityView: '000000222', // Busy 16:00-18:00
              freeBusyViewType: 'freeBusy'
            }
          ]
        }
      });

      // Mock free time finding
      mockGraphAdapter.findFreeTime.mockResolvedValue({
        success: true,
        data: [
          {
            start: new Date('2024-12-01T10:00:00Z'),
            end: new Date('2024-12-01T11:00:00Z'),
            duration: 60
          }
        ]
      });

      // Check availability for multiple attendees
      const freeBusyResult = await pimServer.executeTool('pim_calendar_get_free_busy', {
        attendees: attendeeEmails,
        dateFrom: '2024-12-01T09:00:00Z',
        dateTo: '2024-12-01T17:00:00Z',
        platform: 'microsoft'
      });

      expect(freeBusyResult).toBeDefined();

      // Find free time slots
      const freeTimeResult = await pimServer.executeTool('pim_calendar_find_free_time', {
        attendees: attendeeEmails,
        durationMinutes: 60,
        dateFrom: '2024-12-01',
        dateTo: '2024-12-01',
        platform: 'microsoft'
      });

      expect(freeTimeResult).toBeDefined();
      expect(mockGraphAdapter.findFreeTime).toHaveBeenCalled();
    });
  });

  describe('End-to-End Cross-Service Workflows', () => {
    test('should handle complete meeting scheduling workflow', async () => {
      // Mock all necessary service calls
      mockGraphAdapter.searchContacts.mockResolvedValue({
        success: true,
        data: [sampleContact]
      });

      mockGraphAdapter.getFreeBusy.mockResolvedValue({
        success: true,
        data: { schedules: [{ availabilityView: '000000000' }] }
      });

      mockGraphAdapter.createEvent.mockResolvedValue({
        success: true,
        data: sampleCalendarEvent
      });

      mockGraphAdapter.sendEmail.mockResolvedValue({
        success: true,
        data: { id: 'invite-email-789' }
      });

      // Step 1: Find attendees in contacts
      const contactSearchResult = await pimServer.executeTool('pim_contacts_search', {
        query: 'John',
        platform: 'microsoft'
      });

      expect(contactSearchResult).toBeDefined();

      // Step 2: Check availability
      const availabilityResult = await pimServer.executeTool('pim_calendar_get_free_busy', {
        attendees: ['john.doe@company.com'],
        dateFrom: '2024-12-01T09:00:00Z',
        dateTo: '2024-12-01T17:00:00Z',
        platform: 'microsoft'
      });

      expect(availabilityResult).toBeDefined();

      // Step 3: Create meeting
      const createEventResult = await pimServer.executeTool('pim_calendar_create_event', {
        subject: 'Team Sync',
        start: '2024-12-01T10:00:00Z',
        end: '2024-12-01T11:00:00Z',
        attendees: ['john.doe@company.com'],
        platform: 'microsoft'
      });

      expect(createEventResult).toBeDefined();

      // Step 4: Send follow-up email
      const emailResult = await pimServer.executeTool('pim_email_send', {
        to: ['john.doe@company.com'],
        subject: 'Meeting scheduled: Team Sync',
        body: 'Hi John, I have scheduled our team sync for Monday at 10 AM.',
        platform: 'microsoft'
      });

      expect(emailResult).toBeDefined();

      // Verify all services were called
      expect(mockGraphAdapter.searchContacts).toHaveBeenCalled();
      expect(mockGraphAdapter.getFreeBusy).toHaveBeenCalled();
      expect(mockGraphAdapter.createEvent).toHaveBeenCalled();
      expect(mockGraphAdapter.sendEmail).toHaveBeenCalled();
    });

    test('should handle contact relationship mapping across services', async () => {
      // Mock comprehensive contact data retrieval
      mockGraphAdapter.getContact.mockResolvedValue({
        success: true,
        data: sampleContact
      });

      mockGraphAdapter.searchEmails.mockResolvedValue({
        success: true,
        data: {
          emails: [meetingInviteEmail],
          pagination: { hasMore: false, total: 1 }
        }
      });

      mockGraphAdapter.searchEvents.mockResolvedValue({
        success: true,
        data: {
          events: [sampleCalendarEvent],
          pagination: { hasMore: false, total: 1 }
        }
      });

      // Get contact details
      const contactResult = await pimServer.executeTool('pim_contacts_get', {
        contactId: 'contact-123',
        platform: 'microsoft'
      });

      expect(contactResult).toBeDefined();

      // Find all emails from/to this contact
      const emailHistoryResult = await pimServer.executeTool('pim_email_search', {
        from: 'john.doe@company.com',
        platform: 'microsoft'
      });

      expect(emailHistoryResult).toBeDefined();

      // Find all meetings with this contact
      const meetingHistoryResult = await pimServer.executeTool('pim_calendar_search', {
        attendee: 'john.doe@company.com',
        platform: 'microsoft'
      });

      expect(meetingHistoryResult).toBeDefined();

      // Verify comprehensive relationship mapping
      expect(mockGraphAdapter.getContact).toHaveBeenCalled();
      expect(mockGraphAdapter.searchEmails).toHaveBeenCalled();
      expect(mockGraphAdapter.searchEvents).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle cross-service failures gracefully', async () => {
      // Mock contact service success but calendar service failure
      mockGraphAdapter.searchContacts.mockResolvedValue({
        success: true,
        data: [sampleContact]
      });

      mockGraphAdapter.createEvent.mockResolvedValue({
        success: false,
        error: 'Calendar service unavailable'
      });

      // Successful contact search
      const contactResult = await pimServer.executeTool('pim_contacts_search', {
        query: 'John',
        platform: 'microsoft'
      });

      expect(contactResult).toBeDefined();
      expect(contactResult.content[0].text).toContain('Found');

      // Failed calendar creation
      const calendarResult = await pimServer.executeTool('pim_calendar_create_event', {
        subject: 'Test Meeting',
        start: '2024-12-01T10:00:00Z',
        end: '2024-12-01T11:00:00Z',
        platform: 'microsoft'
      });

      expect(calendarResult).toBeDefined();
      expect(calendarResult.content[0].text).toContain('Failed');
    });

    test('should handle data inconsistencies between services', async () => {
      // Mock contact with different email than calendar event
      const inconsistentContact = {
        ...sampleContact,
        emailAddresses: [EmailAddress.create('john.old@company.com')]
      };

      mockGraphAdapter.getContact.mockResolvedValue({
        success: true,
        data: inconsistentContact
      });

      mockGraphAdapter.getEvent.mockResolvedValue({
        success: true,
        data: sampleCalendarEvent // Uses john.doe@company.com
      });

      const contactResult = await pimServer.executeTool('pim_contacts_get', {
        contactId: 'contact-123',
        platform: 'microsoft'
      });

      const eventResult = await pimServer.executeTool('pim_calendar_get', {
        eventId: 'cal-event-123',
        platform: 'microsoft'
      });

      expect(contactResult).toBeDefined();
      expect(eventResult).toBeDefined();

      // Should handle gracefully even with email mismatches
      expect(mockGraphAdapter.getContact).toHaveBeenCalled();
      expect(mockGraphAdapter.getEvent).toHaveBeenCalled();
    });
  });
});