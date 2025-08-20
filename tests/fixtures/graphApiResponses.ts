/**
 * Mock Microsoft Graph API responses for testing
 */
// @ts-nocheck - Suppressing TypeScript checks for test fixtures

/**
 * User profile responses
 */
export const mockUserProfile = {
  '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users/$entity',
  id: 'test-user-id',
  displayName: 'Test User',
  givenName: 'Test',
  surname: 'User',
  mail: 'test@example.com',
  userPrincipalName: 'test@example.com',
  jobTitle: 'Test Engineer',
  officeLocation: 'Test Office',
  businessPhones: ['+1 555-0123'],
  mobilePhone: '+1 555-0124',
  preferredLanguage: 'en-US',
};

/**
 * Email/Messages responses
 */
export const mockMessage = {
  '@odata.context':
    "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/messages/$entity",
  id: 'test-message-id',
  createdDateTime: '2024-01-15T10:30:00Z',
  lastModifiedDateTime: '2024-01-15T10:30:00Z',
  changeKey: 'test-change-key',
  categories: [],
  receivedDateTime: '2024-01-15T10:30:00Z',
  sentDateTime: '2024-01-15T10:25:00Z',
  hasAttachments: false,
  internetMessageId: '<test-message@example.com>',
  subject: 'Test Email Subject',
  bodyPreview: 'This is a test email preview...',
  importance: 'normal',
  parentFolderId: 'inbox',
  conversationId: 'test-conversation-id',
  isDeliveryReceiptRequested: false,
  isReadReceiptRequested: false,
  isRead: false,
  isDraft: false,
  webLink: 'https://outlook.office365.com/owa/?ItemID=test-message-id',
  body: {
    contentType: 'html',
    content: '<html><body><p>This is a test email content.</p></body></html>',
  },
  from: {
    emailAddress: {
      name: 'Sender Name',
      address: 'sender@example.com',
    },
  },
  toRecipients: [
    {
      emailAddress: {
        name: 'Test User',
        address: 'test@example.com',
      },
    },
  ],
  ccRecipients: [],
  bccRecipients: [],
  replyTo: [],
  flag: {
    flagStatus: 'notFlagged',
  },
};

export const mockMessagesResponse = {
  '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/messages",
  '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/test-user-id/messages?$skip=10',
  value: [
    mockMessage,
    {
      ...mockMessage,
      id: 'test-message-id-2',
      subject: 'Second Test Email',
      isRead: true,
    },
  ],
};

/**
 * Calendar/Events responses
 */
export const mockCalendarEvent = {
  '@odata.context':
    "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/events/$entity",
  id: 'test-event-id',
  createdDateTime: '2024-01-15T09:00:00Z',
  lastModifiedDateTime: '2024-01-15T09:00:00Z',
  changeKey: 'test-event-change-key',
  categories: ['Business'],
  originalStartTimeZone: 'UTC',
  originalEndTimeZone: 'UTC',
  iCalUId: 'test-ical-uid',
  reminderMinutesBeforeStart: 15,
  isReminderOn: true,
  hasAttachments: false,
  subject: 'Test Meeting',
  bodyPreview: 'This is a test meeting...',
  importance: 'normal',
  sensitivity: 'normal',
  isAllDay: false,
  isCancelled: false,
  isOrganizer: true,
  responseRequested: true,
  seriesMasterId: null,
  showAs: 'busy',
  type: 'singleInstance',
  webLink: 'https://outlook.office365.com/owa/?itemid=test-event-id',
  onlineMeetingUrl: null,
  body: {
    contentType: 'html',
    content: '<html><body><p>Test meeting agenda</p></body></html>',
  },
  start: {
    dateTime: '2024-01-20T14:00:00.0000000',
    timeZone: 'UTC',
  },
  end: {
    dateTime: '2024-01-20T15:00:00.0000000',
    timeZone: 'UTC',
  },
  location: {
    displayName: 'Conference Room A',
    locationType: 'default',
  },
  locations: [
    {
      displayName: 'Conference Room A',
      locationType: 'default',
    },
  ],
  attendees: [
    {
      type: 'required',
      status: {
        response: 'none',
        time: '0001-01-01T00:00:00Z',
      },
      emailAddress: {
        name: 'Attendee Name',
        address: 'attendee@example.com',
      },
    },
  ],
  organizer: {
    emailAddress: {
      name: 'Test User',
      address: 'test@example.com',
    },
  },
  recurrence: null,
};

export const mockEventsResponse = {
  '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/events",
  value: [mockCalendarEvent],
};

/**
 * Contacts responses
 */
export const mockContact = {
  '@odata.context':
    "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/contacts/$entity",
  id: 'test-contact-id',
  createdDateTime: '2024-01-15T08:00:00Z',
  lastModifiedDateTime: '2024-01-15T08:00:00Z',
  changeKey: 'test-contact-change-key',
  categories: ['Business'],
  parentFolderId: 'contacts',
  displayName: 'Contact Name',
  givenName: 'Contact',
  surname: 'Name',
  middleName: null,
  nickName: null,
  title: 'Mr.',
  generation: null,
  emailAddresses: [
    {
      name: 'Contact Name',
      address: 'contact@example.com',
    },
  ],
  phones: [
    {
      type: 'business',
      number: '+1 555-0125',
    },
  ],
  postalAddresses: [
    {
      type: 'business',
      street: '123 Business St',
      city: 'Business City',
      state: 'BC',
      postalCode: '12345',
      countryOrRegion: 'USA',
    },
  ],
  birthday: null,
  personalNotes: 'Test contact notes',
  profession: 'Engineer',
  companyName: 'Test Company',
  department: 'Engineering',
  officeLocation: 'Office 123',
  manager: null,
  assistantName: null,
  children: [],
  spouseName: null,
  homePhones: [],
  businessPhones: ['+1 555-0125'],
  mobilePhone: '+1 555-0126',
  homeAddress: null,
  businessAddress: {
    street: '123 Business St',
    city: 'Business City',
    state: 'BC',
    postalCode: '12345',
    countryOrRegion: 'USA',
  },
  otherAddress: null,
};

export const mockContactsResponse = {
  '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/contacts",
  value: [mockContact],
};

/**
 * Files/Drive responses
 */
export const mockDriveItem = {
  '@odata.context':
    "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/drive/items/$entity",
  id: 'test-file-id',
  name: 'test-document.docx',
  createdDateTime: '2024-01-15T12:00:00Z',
  lastModifiedDateTime: '2024-01-15T13:00:00Z',
  size: 12345,
  webUrl: 'https://example.sharepoint.com/personal/test_example_com/Documents/test-document.docx',
  folder: null,
  file: {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    hashes: {
      quickXorHash: 'test-hash',
    },
  },
  parentReference: {
    driveId: 'test-drive-id',
    driveType: 'personal',
    id: 'test-parent-id',
    path: '/drive/root:',
  },
  createdBy: {
    user: {
      displayName: 'Test User',
      id: 'test-user-id',
    },
  },
  lastModifiedBy: {
    user: {
      displayName: 'Test User',
      id: 'test-user-id',
    },
  },
};

export const mockDriveItemsResponse = {
  '@odata.context': "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/drive/items",
  value: [mockDriveItem],
};

/**
 * Tasks/To-Do responses
 */
export const mockTodoTask = {
  '@odata.context':
    "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/todo/lists('test-list-id')/tasks/$entity",
  id: 'test-task-id',
  importance: 'normal',
  isReminderOn: false,
  status: 'notStarted',
  title: 'Test Task',
  createdDateTime: '2024-01-15T11:00:00Z',
  lastModifiedDateTime: '2024-01-15T11:00:00Z',
  hasAttachments: false,
  categories: ['Work'],
  body: {
    content: 'Test task description',
    contentType: 'text',
  },
  dueDateTime: {
    dateTime: '2024-01-25T17:00:00.0000000',
    timeZone: 'UTC',
  },
  reminderDateTime: null,
  recurrence: null,
  completedDateTime: null,
};

export const mockTodoTasksResponse = {
  '@odata.context':
    "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/todo/lists('test-list-id')/tasks",
  value: [mockTodoTask],
};

/**
 * Batch request/response
 */
export const mockBatchRequest = {
  requests: [
    {
      id: '1',
      method: 'GET',
      url: '/me',
    },
    {
      id: '2',
      method: 'GET',
      url: '/me/messages?$top=5',
    },
  ],
};

export const mockBatchResponse = {
  responses: [
    {
      id: '1',
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: mockUserProfile,
    },
    {
      id: '2',
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: {
        '@odata.context':
          "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/messages",
        value: [mockMessage],
      },
    },
  ],
};

/**
 * Error responses
 */
export const mockGraphError400 = {
  error: {
    code: 'BadRequest',
    message: 'Bad request',
    innerError: {
      'request-id': 'test-request-id',
      date: '2024-01-15T10:30:00Z',
    },
  },
};

export const mockGraphError401 = {
  error: {
    code: 'Unauthorized',
    message: 'Access token is empty.',
    innerError: {
      'request-id': 'test-request-id-401',
      date: '2024-01-15T10:30:00Z',
    },
  },
};

export const mockGraphError403 = {
  error: {
    code: 'Forbidden',
    message: 'Insufficient privileges to complete the operation.',
    innerError: {
      'request-id': 'test-request-id-403',
      date: '2024-01-15T10:30:00Z',
    },
  },
};

export const mockGraphError404 = {
  error: {
    code: 'NotFound',
    message: 'The requested resource was not found.',
    innerError: {
      'request-id': 'test-request-id-404',
      date: '2024-01-15T10:30:00Z',
    },
  },
};

export const mockGraphError429 = {
  error: {
    code: 'TooManyRequests',
    message: 'Too many requests',
    innerError: {
      'request-id': 'test-request-id-429',
      date: '2024-01-15T10:30:00Z',
    },
  },
};

export const mockGraphError500 = {
  error: {
    code: 'InternalServerError',
    message: 'Internal server error',
    innerError: {
      'request-id': 'test-request-id-500',
      date: '2024-01-15T10:30:00Z',
    },
  },
};

export const mockGraphError503 = {
  error: {
    code: 'ServiceUnavailable',
    message: 'Service unavailable',
    innerError: {
      'request-id': 'test-request-id-503',
      date: '2024-01-15T10:30:00Z',
    },
  },
};

/**
 * Rate limit headers
 */
export const mockRateLimitHeaders = {
  'x-ratelimit-remaining': '9999',
  'x-ratelimit-limit': '10000',
  'x-ratelimit-reset': Math.floor((Date.now() + 600000) / 1000).toString(), // 10 minutes from now
};

export const mockRateLimitExceededHeaders = {
  'x-ratelimit-remaining': '0',
  'x-ratelimit-limit': '10000',
  'x-ratelimit-reset': Math.floor((Date.now() + 600000) / 1000).toString(),
  'retry-after': '300', // 5 minutes
};

/**
 * Delta query responses
 */
export const mockDeltaResponse = {
  '@odata.context':
    "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/messages/delta",
  '@odata.deltaLink':
    'https://graph.microsoft.com/v1.0/users/test-user-id/messages/delta?$deltatoken=test-delta-token',
  value: [mockMessage],
};

export const mockDeltaResponseWithNextLink = {
  '@odata.context':
    "https://graph.microsoft.com/v1.0/$metadata#users('test-user-id')/messages/delta",
  '@odata.nextLink':
    'https://graph.microsoft.com/v1.0/users/test-user-id/messages/delta?$skiptoken=test-skip-token',
  value: [mockMessage],
};

/**
 * Helper functions for creating test data
 */
export function createMockMessage(overrides: Partial<typeof mockMessage>): typeof mockMessage {
  return {
    ...mockMessage,
    ...overrides,
  };
}

export function createMockEvent(
  overrides: Partial<typeof mockCalendarEvent>
): typeof mockCalendarEvent {
  return {
    ...mockCalendarEvent,
    ...overrides,
  };
}

export function createMockContact(overrides: Partial<typeof mockContact>): typeof mockContact {
  return {
    ...mockContact,
    ...overrides,
  };
}

export function createMockDriveItem(
  overrides: Partial<typeof mockDriveItem>
): typeof mockDriveItem {
  return {
    ...mockDriveItem,
    ...overrides,
  };
}

export function createMockTask(overrides: Partial<typeof mockTodoTask>): typeof mockTodoTask {
  return {
    ...mockTodoTask,
    ...overrides,
  };
}
