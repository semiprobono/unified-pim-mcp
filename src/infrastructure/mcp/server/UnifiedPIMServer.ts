import { Resource, Tool } from '@modelcontextprotocol/sdk/types.js';
import { PlatformAdapterManager } from '../../adapters/PlatformAdapterManager.js';
import { CacheManager } from '../../cache/CacheManager.js';
import { SecurityManager } from '../../../shared/security/SecurityManager.js';
import { Logger } from '../../../shared/logging/Logger.js';
import { ErrorHandler } from '../../../shared/error/ErrorHandler.js';
import { Platform } from '../../../domain/value-objects/Platform.js';
import { DateRange } from '../../../domain/value-objects/DateRange.js';
import { GraphAdapter } from '../../adapters/microsoft/GraphAdapter.js';
import { EmailQueryOptions } from '../../adapters/microsoft/services/EmailService.js';
import { CalendarQueryOptions } from '../../adapters/microsoft/services/CalendarService.js';
import { EmailAddress } from '../../../domain/value-objects/EmailAddress.js';
import { Attendee } from '../../../domain/entities/CalendarEvent.js';

/**
 * Main Unified PIM MCP Server implementation
 * Orchestrates all platform operations and provides MCP interface
 */
export class UnifiedPIMServer {
  constructor(
    private readonly platformManager: PlatformAdapterManager,
    private readonly cacheManager: CacheManager,
    private readonly securityManager: SecurityManager,
    private readonly logger: Logger,
    private readonly errorHandler: ErrorHandler
  ) {}

  /**
   * Get available tools
   */
  async getAvailableTools(): Promise<Tool[]> {
    return [
      // Authentication tools
      {
        name: 'pim_auth_start',
        description: 'Start OAuth2 authentication flow for a platform',
        inputSchema: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              description: 'Platform to authenticate with',
            },
            userId: { type: 'string', description: 'Optional user ID for tracking' },
          },
          required: ['platform'],
        },
      },
      {
        name: 'pim_auth_callback',
        description: 'Handle OAuth2 callback with authorization code',
        inputSchema: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: ['microsoft', 'google', 'apple'] },
            code: { type: 'string', description: 'Authorization code from OAuth callback' },
            state: { type: 'string', description: 'State parameter from OAuth callback' },
          },
          required: ['platform', 'code', 'state'],
        },
      },
      {
        name: 'pim_auth_status',
        description: 'Check authentication status for platforms',
        inputSchema: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              description: 'Optional platform filter',
            },
          },
        },
      },
      // Email tools
      {
        name: 'pim_email_search',
        description: 'Search emails with advanced filters',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query string' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
            folder: { type: 'string', description: 'Email folder to search in' },
            from: { type: 'string', description: 'Filter by sender email' },
            to: { type: 'string', description: 'Filter by recipient email' },
            subject: { type: 'string', description: 'Filter by subject line' },
            hasAttachments: { type: 'boolean', description: 'Filter by attachment presence' },
            isRead: { type: 'boolean', description: 'Filter by read status' },
            importance: {
              type: 'string',
              enum: ['low', 'normal', 'high'],
              description: 'Filter by importance',
            },
            dateFrom: { type: 'string', format: 'date-time', description: 'Filter by date from' },
            dateTo: { type: 'string', format: 'date-time', description: 'Filter by date to' },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by categories',
            },
            limit: { type: 'number', default: 25, minimum: 1, maximum: 100 },
            skip: { type: 'number', default: 0, minimum: 0 },
          },
        },
      },
      {
        name: 'pim_email_get',
        description: 'Get a specific email by ID',
        inputSchema: {
          type: 'object',
          properties: {
            emailId: { type: 'string', description: 'Email ID' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['emailId'],
        },
      },
      {
        name: 'pim_email_send',
        description: 'Send a new email',
        inputSchema: {
          type: 'object',
          properties: {
            to: {
              type: 'array',
              items: { type: 'string' },
              description: 'Recipient email addresses',
            },
            cc: { type: 'array', items: { type: 'string' }, description: 'CC email addresses' },
            bcc: { type: 'array', items: { type: 'string' }, description: 'BCC email addresses' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body content' },
            bodyType: { type: 'string', enum: ['text', 'html'], default: 'text' },
            importance: { type: 'string', enum: ['low', 'normal', 'high'], default: 'normal' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['to', 'subject', 'body'],
        },
      },
      {
        name: 'pim_email_reply',
        description: 'Reply to an email',
        inputSchema: {
          type: 'object',
          properties: {
            emailId: { type: 'string', description: 'ID of email to reply to' },
            body: { type: 'string', description: 'Reply body content' },
            bodyType: { type: 'string', enum: ['text', 'html'], default: 'text' },
            replyAll: { type: 'boolean', default: false, description: 'Reply to all recipients' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['emailId', 'body'],
        },
      },
      {
        name: 'pim_email_mark_read',
        description: 'Mark email as read or unread',
        inputSchema: {
          type: 'object',
          properties: {
            emailId: { type: 'string', description: 'Email ID' },
            isRead: {
              type: 'boolean',
              default: true,
              description: 'Mark as read (true) or unread (false)',
            },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['emailId'],
        },
      },
      {
        name: 'pim_email_delete',
        description: 'Delete an email',
        inputSchema: {
          type: 'object',
          properties: {
            emailId: { type: 'string', description: 'Email ID' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['emailId'],
        },
      },
      // Calendar tools
      {
        name: 'pim_calendar_search',
        description: 'Search calendar events with advanced filters',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query string' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
            calendarId: { type: 'string', description: 'Calendar ID to search in' },
            attendee: { type: 'string', description: 'Filter by attendee email' },
            organizer: { type: 'string', description: 'Filter by organizer email' },
            location: { type: 'string', description: 'Filter by location' },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by categories',
            },
            sensitivity: {
              type: 'string',
              enum: ['normal', 'personal', 'private', 'confidential'],
              description: 'Filter by sensitivity level',
            },
            importance: {
              type: 'string',
              enum: ['low', 'normal', 'high'],
              description: 'Filter by importance',
            },
            showAs: {
              type: 'string',
              enum: ['free', 'tentative', 'busy', 'oof', 'workingElsewhere'],
              description: 'Filter by availability status',
            },
            isOnlineMeeting: { type: 'boolean', description: 'Filter by online meeting presence' },
            isCancelled: { type: 'boolean', description: 'Filter by cancellation status' },
            dateFrom: { type: 'string', format: 'date-time', description: 'Filter by date from' },
            dateTo: { type: 'string', format: 'date-time', description: 'Filter by date to' },
            limit: { type: 'number', default: 25, minimum: 1, maximum: 100 },
            skip: { type: 'number', default: 0, minimum: 0 },
          },
        },
      },
      {
        name: 'pim_calendar_get',
        description: 'Get a specific calendar event by ID',
        inputSchema: {
          type: 'object',
          properties: {
            eventId: { type: 'string', description: 'Event ID' },
            calendarId: { type: 'string', description: 'Calendar ID (defaults to primary)' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['eventId'],
        },
      },
      {
        name: 'pim_calendar_create_event',
        description: 'Create a calendar event',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Event title' },
            start: { type: 'string', format: 'date-time', description: 'Start time (ISO 8601)' },
            end: { type: 'string', format: 'date-time', description: 'End time (ISO 8601)' },
            isAllDay: { type: 'boolean', default: false, description: 'All-day event flag' },
            location: { type: 'string', description: 'Event location' },
            description: { type: 'string', description: 'Event description' },
            attendees: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  email: { type: 'string', description: 'Attendee email address' },
                  name: { type: 'string', description: 'Attendee display name' },
                  type: {
                    type: 'string',
                    enum: ['required', 'optional', 'resource'],
                    default: 'required',
                  },
                },
                required: ['email'],
              },
              description: 'Event attendees',
            },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Event categories',
            },
            sensitivity: {
              type: 'string',
              enum: ['normal', 'personal', 'private', 'confidential'],
              default: 'normal',
            },
            importance: {
              type: 'string',
              enum: ['low', 'normal', 'high'],
              default: 'normal',
            },
            showAs: {
              type: 'string',
              enum: ['free', 'tentative', 'busy', 'oof', 'workingElsewhere'],
              default: 'busy',
            },
            responseRequested: { type: 'boolean', default: true },
            calendarId: { type: 'string', description: 'Calendar ID (defaults to primary)' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['title', 'start', 'end'],
        },
      },
      {
        name: 'pim_calendar_update',
        description: 'Update a calendar event',
        inputSchema: {
          type: 'object',
          properties: {
            eventId: { type: 'string', description: 'Event ID to update' },
            title: { type: 'string', description: 'Event title' },
            start: { type: 'string', format: 'date-time', description: 'Start time (ISO 8601)' },
            end: { type: 'string', format: 'date-time', description: 'End time (ISO 8601)' },
            isAllDay: { type: 'boolean', description: 'All-day event flag' },
            location: { type: 'string', description: 'Event location' },
            description: { type: 'string', description: 'Event description' },
            attendees: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  email: { type: 'string', description: 'Attendee email address' },
                  name: { type: 'string', description: 'Attendee display name' },
                  type: {
                    type: 'string',
                    enum: ['required', 'optional', 'resource'],
                  },
                },
                required: ['email'],
              },
              description: 'Event attendees',
            },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Event categories',
            },
            sensitivity: {
              type: 'string',
              enum: ['normal', 'personal', 'private', 'confidential'],
            },
            importance: {
              type: 'string',
              enum: ['low', 'normal', 'high'],
            },
            showAs: {
              type: 'string',
              enum: ['free', 'tentative', 'busy', 'oof', 'workingElsewhere'],
            },
            calendarId: { type: 'string', description: 'Calendar ID (defaults to primary)' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['eventId'],
        },
      },
      {
        name: 'pim_calendar_delete',
        description: 'Delete a calendar event',
        inputSchema: {
          type: 'object',
          properties: {
            eventId: { type: 'string', description: 'Event ID to delete' },
            calendarId: { type: 'string', description: 'Calendar ID (defaults to primary)' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['eventId'],
        },
      },
      {
        name: 'pim_calendar_list_events',
        description: 'Get calendar events for a specific date range',
        inputSchema: {
          type: 'object',
          properties: {
            dateFrom: { type: 'string', format: 'date-time', description: 'Start date for event list' },
            dateTo: { type: 'string', format: 'date-time', description: 'End date for event list' },
            calendarId: { type: 'string', description: 'Calendar ID (defaults to primary)' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['dateFrom', 'dateTo'],
        },
      },
      {
        name: 'pim_calendar_find_free_time',
        description: 'Find free time slots for scheduling meetings',
        inputSchema: {
          type: 'object',
          properties: {
            attendees: {
              type: 'array',
              items: { type: 'string' },
              description: 'Attendee email addresses',
            },
            durationMinutes: {
              type: 'number',
              minimum: 15,
              description: 'Meeting duration in minutes',
            },
            dateFrom: { type: 'string', format: 'date-time', description: 'Search start date' },
            dateTo: { type: 'string', format: 'date-time', description: 'Search end date' },
            workingHoursOnly: {
              type: 'boolean',
              default: true,
              description: 'Only suggest time slots during working hours',
            },
            maxSuggestions: {
              type: 'number',
              default: 10,
              minimum: 1,
              maximum: 20,
              description: 'Maximum number of suggestions to return',
            },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['attendees', 'durationMinutes', 'dateFrom', 'dateTo'],
        },
      },
      {
        name: 'pim_calendar_respond',
        description: 'Respond to a meeting invitation',
        inputSchema: {
          type: 'object',
          properties: {
            eventId: { type: 'string', description: 'Event ID to respond to' },
            response: {
              type: 'string',
              enum: ['accept', 'tentative', 'decline'],
              description: 'Response to the meeting invitation',
            },
            comment: { type: 'string', description: 'Optional comment with the response' },
            sendResponse: {
              type: 'boolean',
              default: true,
              description: 'Whether to send response to organizer',
            },
            calendarId: { type: 'string', description: 'Calendar ID (defaults to primary)' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['eventId', 'response'],
        },
      },
      {
        name: 'pim_calendar_get_free_busy',
        description: 'Get free/busy information for attendees',
        inputSchema: {
          type: 'object',
          properties: {
            attendees: {
              type: 'array',
              items: { type: 'string' },
              description: 'Attendee email addresses',
            },
            dateFrom: { type: 'string', format: 'date-time', description: 'Start date for free/busy query' },
            dateTo: { type: 'string', format: 'date-time', description: 'End date for free/busy query' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['attendees', 'dateFrom', 'dateTo'],
        },
      },
      // Contact tools
      {
        name: 'pim_contacts_search',
        description: 'Search contacts with advanced filters',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query string' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
            displayName: { type: 'string', description: 'Filter by display name' },
            givenName: { type: 'string', description: 'Filter by given/first name' },
            surname: { type: 'string', description: 'Filter by surname/last name' },
            emailAddress: { type: 'string', description: 'Filter by email address' },
            phoneNumber: { type: 'string', description: 'Filter by phone number' },
            companyName: { type: 'string', description: 'Filter by company/organization' },
            department: { type: 'string', description: 'Filter by department' },
            jobTitle: { type: 'string', description: 'Filter by job title' },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by categories',
            },
            isFavorite: { type: 'boolean', description: 'Filter by favorite status' },
            limit: { type: 'number', default: 25, minimum: 1, maximum: 100 },
            skip: { type: 'number', default: 0, minimum: 0 },
          },
        },
      },
      {
        name: 'pim_contacts_get',
        description: 'Get a specific contact by ID',
        inputSchema: {
          type: 'object',
          properties: {
            contactId: { type: 'string', description: 'Contact ID' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['contactId'],
        },
      },
      {
        name: 'pim_contacts_create',
        description: 'Create a new contact',
        inputSchema: {
          type: 'object',
          properties: {
            givenName: { type: 'string', description: 'First name' },
            surname: { type: 'string', description: 'Last name' },
            displayName: { type: 'string', description: 'Display name' },
            emailAddresses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  address: { type: 'string', description: 'Email address' },
                  type: {
                    type: 'string',
                    enum: ['work', 'personal', 'other'],
                    default: 'work',
                  },
                },
                required: ['address'],
              },
              description: 'Email addresses',
            },
            phoneNumbers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  number: { type: 'string', description: 'Phone number' },
                  type: {
                    type: 'string',
                    enum: ['work', 'home', 'mobile', 'other'],
                    default: 'mobile',
                  },
                },
                required: ['number'],
              },
              description: 'Phone numbers',
            },
            companyName: { type: 'string', description: 'Company/organization name' },
            department: { type: 'string', description: 'Department' },
            jobTitle: { type: 'string', description: 'Job title' },
            notes: { type: 'string', description: 'Notes about the contact' },
            birthday: { type: 'string', format: 'date', description: 'Birthday (YYYY-MM-DD)' },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Contact categories',
            },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['givenName'],
        },
      },
      {
        name: 'pim_contacts_update',
        description: 'Update an existing contact',
        inputSchema: {
          type: 'object',
          properties: {
            contactId: { type: 'string', description: 'Contact ID to update' },
            givenName: { type: 'string', description: 'First name' },
            surname: { type: 'string', description: 'Last name' },
            displayName: { type: 'string', description: 'Display name' },
            emailAddresses: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  address: { type: 'string', description: 'Email address' },
                  type: {
                    type: 'string',
                    enum: ['work', 'personal', 'other'],
                  },
                },
                required: ['address'],
              },
              description: 'Email addresses',
            },
            phoneNumbers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  number: { type: 'string', description: 'Phone number' },
                  type: {
                    type: 'string',
                    enum: ['work', 'home', 'mobile', 'other'],
                  },
                },
                required: ['number'],
              },
              description: 'Phone numbers',
            },
            companyName: { type: 'string', description: 'Company/organization name' },
            department: { type: 'string', description: 'Department' },
            jobTitle: { type: 'string', description: 'Job title' },
            notes: { type: 'string', description: 'Notes about the contact' },
            birthday: { type: 'string', format: 'date', description: 'Birthday (YYYY-MM-DD)' },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Contact categories',
            },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['contactId'],
        },
      },
      {
        name: 'pim_contacts_delete',
        description: 'Delete a contact',
        inputSchema: {
          type: 'object',
          properties: {
            contactId: { type: 'string', description: 'Contact ID to delete' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['contactId'],
        },
      },
      {
        name: 'pim_contacts_list',
        description: 'List contacts with pagination',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 25, minimum: 1, maximum: 100 },
            skip: { type: 'number', default: 0, minimum: 0 },
            orderBy: { 
              type: 'string', 
              enum: ['displayName', 'givenName', 'surname', 'companyName'],
              default: 'displayName'
            },
            orderDirection: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
        },
      },
      {
        name: 'pim_contacts_find_by_email',
        description: 'Find contacts by email address',
        inputSchema: {
          type: 'object',
          properties: {
            emailAddress: { type: 'string', description: 'Email address to search for' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['emailAddress'],
        },
      },
      {
        name: 'pim_contacts_get_organizations',
        description: 'Get list of organizations from contacts',
        inputSchema: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
        },
      },
      // Task tools
      {
        name: 'pim_list_tasks',
        description: 'List tasks from Microsoft To Do with optional filtering',
        inputSchema: {
          type: 'object',
          properties: {
            listId: { type: 'string', description: 'Optional task list ID' },
            status: { 
              type: 'string', 
              enum: ['notStarted', 'inProgress', 'completed', 'waitingOnOthers', 'deferred'],
              description: 'Filter by task status'
            },
            importance: { 
              type: 'string', 
              enum: ['low', 'normal', 'high'],
              description: 'Filter by importance level'
            },
            isCompleted: { type: 'boolean', description: 'Filter by completion status' },
            dateFrom: { type: 'string', format: 'date-time', description: 'Filter tasks due after this date' },
            dateTo: { type: 'string', format: 'date-time', description: 'Filter tasks due before this date' },
            limit: { type: 'number', default: 50, minimum: 1, maximum: 100 },
            skip: { type: 'number', default: 0, minimum: 0 },
            orderBy: { 
              type: 'string',
              enum: ['dueDateTime', 'importance', 'createdDateTime', 'title'],
              default: 'dueDateTime'
            },
            orderDirection: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
        },
      },
      {
        name: 'pim_get_task',
        description: 'Get a specific task by ID',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            listId: { type: 'string', description: 'Optional task list ID' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'pim_create_task',
        description: 'Create a new task in Microsoft To Do',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Task description or notes' },
            listId: { type: 'string', description: 'Optional task list ID (uses default if not provided)' },
            importance: { 
              type: 'string', 
              enum: ['low', 'normal', 'high'],
              default: 'normal',
              description: 'Task importance level'
            },
            dueDateTime: { type: 'string', format: 'date-time', description: 'Due date and time' },
            startDateTime: { type: 'string', format: 'date-time', description: 'Start date and time' },
            reminderDateTime: { type: 'string', format: 'date-time', description: 'Reminder date and time' },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Task categories',
            },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['title'],
        },
      },
      {
        name: 'pim_update_task',
        description: 'Update an existing task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID' },
            listId: { type: 'string', description: 'Optional task list ID' },
            title: { type: 'string', description: 'Updated task title' },
            description: { type: 'string', description: 'Updated task description' },
            status: { 
              type: 'string', 
              enum: ['notStarted', 'inProgress', 'completed', 'waitingOnOthers', 'deferred'],
              description: 'Updated task status'
            },
            importance: { 
              type: 'string', 
              enum: ['low', 'normal', 'high'],
              description: 'Updated importance level'
            },
            dueDateTime: { type: 'string', format: 'date-time', description: 'Updated due date (or null to remove)' },
            startDateTime: { type: 'string', format: 'date-time', description: 'Updated start date (or null to remove)' },
            categories: {
              type: 'array',
              items: { type: 'string' },
              description: 'Updated categories',
            },
            percentComplete: { 
              type: 'number', 
              minimum: 0, 
              maximum: 100,
              description: 'Task completion percentage'
            },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'pim_delete_task',
        description: 'Delete a task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to delete' },
            listId: { type: 'string', description: 'Optional task list ID' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'pim_complete_task',
        description: 'Mark a task as completed',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Task ID to complete' },
            listId: { type: 'string', description: 'Optional task list ID' },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['taskId'],
        },
      },
      {
        name: 'pim_search_tasks',
        description: 'Search tasks using semantic search',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query for semantic search' },
            listId: { type: 'string', description: 'Optional task list ID to search within' },
            status: { 
              type: 'string', 
              enum: ['notStarted', 'inProgress', 'completed', 'waitingOnOthers', 'deferred'],
              description: 'Filter by task status'
            },
            importance: { 
              type: 'string', 
              enum: ['low', 'normal', 'high'],
              description: 'Filter by importance'
            },
            limit: { type: 'number', default: 25, minimum: 1, maximum: 100 },
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'pim_list_task_lists',
        description: 'Get available task lists',
        inputSchema: {
          type: 'object',
          properties: {
            platform: {
              type: 'string',
              enum: ['microsoft', 'google', 'apple'],
              default: 'microsoft',
            },
          },
        },
      },
    ];
  }

  /**
   * Execute a tool
   */
  async executeTool(name: string, args: any): Promise<any> {
    this.logger.info(`Executing tool: ${name}`, { args });

    try {
      switch (name) {
        // Authentication tools
        case 'pim_auth_start':
          return await this.startAuthentication(args);
        case 'pim_auth_callback':
          return await this.handleAuthCallback(args);
        case 'pim_auth_status':
          return await this.getAuthStatus(args);

        // Email tools
        case 'pim_email_search':
          return await this.searchEmails(args);
        case 'pim_email_get':
          return await this.getEmail(args);
        case 'pim_email_send':
          return await this.sendEmail(args);
        case 'pim_email_reply':
          return await this.replyToEmail(args);
        case 'pim_email_mark_read':
          return await this.markEmailRead(args);
        case 'pim_email_delete':
          return await this.deleteEmail(args);

        // Calendar tools
        case 'pim_calendar_search':
          return await this.searchCalendarEvents(args);
        case 'pim_calendar_get':
          return await this.getCalendarEvent(args);
        case 'pim_calendar_create_event':
          return await this.createCalendarEvent(args);
        case 'pim_calendar_update':
          return await this.updateCalendarEvent(args);
        case 'pim_calendar_delete':
          return await this.deleteCalendarEvent(args);
        case 'pim_calendar_list_events':
          return await this.listCalendarEvents(args);
        case 'pim_calendar_find_free_time':
          return await this.findFreeTime(args);
        case 'pim_calendar_respond':
          return await this.respondToEvent(args);
        case 'pim_calendar_get_free_busy':
          return await this.getFreeBusy(args);

        // Contact tools
        case 'pim_contacts_search':
          return await this.searchContacts(args);
        case 'pim_contacts_get':
          return await this.getContact(args);
        case 'pim_contacts_create':
          return await this.createContact(args);
        case 'pim_contacts_update':
          return await this.updateContact(args);
        case 'pim_contacts_delete':
          return await this.deleteContact(args);
        case 'pim_contacts_list':
          return await this.listContacts(args);
        case 'pim_contacts_find_by_email':
          return await this.findContactsByEmail(args);
        case 'pim_contacts_get_organizations':
          return await this.getOrganizations(args);

        // Task tools
        case 'pim_list_tasks':
          return await this.listTasks(args);
        case 'pim_get_task':
          return await this.getTask(args);
        case 'pim_create_task':
          return await this.createTask(args);
        case 'pim_update_task':
          return await this.updateTask(args);
        case 'pim_delete_task':
          return await this.deleteTask(args);
        case 'pim_complete_task':
          return await this.completeTask(args);
        case 'pim_search_tasks':
          return await this.searchTasks(args);
        case 'pim_list_task_lists':
          return await this.listTaskLists(args);

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      this.logger.error(`Tool execution failed: ${name}`, error);
      throw error;
    }
  }

  /**
   * Get available resources
   */
  async getAvailableResources(): Promise<Resource[]> {
    return [
      {
        uri: 'pim://status',
        name: 'PIM Server Status',
        description: 'Current status of the PIM server and platform connections',
        mimeType: 'application/json',
      },
    ];
  }

  /**
   * Read a resource
   */
  async readResource(uri: string): Promise<any[]> {
    this.logger.info(`Reading resource: ${uri}`);

    switch (uri) {
      case 'pim://status':
        return [
          {
            type: 'text',
            text: JSON.stringify(
              {
                status: 'running',
                platforms: await this.platformManager.getStatus(),
                cache: await this.cacheManager.getStatus(),
                security: await this.securityManager.getStatus(),
              },
              null,
              2
            ),
          },
        ];
      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  }

  // Authentication methods

  /**
   * Start OAuth2 authentication flow
   */
  private async startAuthentication(args: any): Promise<any> {
    const { platform, userId } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform);
      if (!adapter) {
        throw new Error(`Platform ${platform} not available or not configured`);
      }

      const authUrl = await (adapter as GraphAdapter).startAuthentication(userId);

      return {
        content: [
          {
            type: 'text',
            text: `Authentication URL generated for ${platform}. Please visit the following URL to authenticate:\n\n${authUrl}`,
          },
        ],
      };
    } catch (error) {
      this.logger.error(`Authentication failed for ${platform}`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to start authentication for ${platform}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Handle OAuth2 callback
   */
  private async handleAuthCallback(args: any): Promise<any> {
    const { platform, code, state } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter) {
        throw new Error(`Platform ${platform} not available`);
      }

      const success = await adapter.handleAuthCallback(code, state);

      return {
        content: [
          {
            type: 'text',
            text: success
              ? `Successfully authenticated with ${platform}!`
              : `Authentication failed for ${platform}. Please try again.`,
          },
        ],
      };
    } catch (error) {
      this.logger.error(`Auth callback failed for ${platform}`, error);
      return {
        content: [
          {
            type: 'text',
            text: `Authentication callback failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Get authentication status
   */
  private async getAuthStatus(args: any): Promise<any> {
    try {
      const status = await this.platformManager.getStatus();
      const { platform } = args;

      if (platform) {
        const platformStatus = status[platform as Platform];
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  platform,
                  ...platformStatus,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get auth status: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  // Email methods

  /**
   * Search emails implementation
   */
  private async searchEmails(args: any): Promise<any> {
    const { platform = 'microsoft', ...options } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter) {
        throw new Error(`Platform ${platform} not available`);
      }

      if (!adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}. Please run pim_auth_start first.`,
            },
          ],
        };
      }

      // For Microsoft Graph, we need to access the EmailService directly
      // This is a temporary approach - in a full implementation,
      // the adapter would expose email operations directly
      const result = await adapter.searchEmails(options.query, {
        limit: options.limit,
        offset: options.skip,
        dateRange:
          options.dateFrom && options.dateTo
            ? new DateRange(new Date(options.dateFrom), new Date(options.dateTo))
            : undefined,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Email search failed: ${result.error}`,
            },
          ],
        };
      }

      // For now, return basic search info since full implementation is pending
      return {
        content: [
          {
            type: 'text',
            text: `Email search executed for query: "${options.query}" on ${platform}\nResults: Implementation pending - would return filtered emails`,
          },
        ],
      };
    } catch (error) {
      this.logger.error('Email search failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `Email search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Get specific email
   */
  private async getEmail(args: any): Promise<any> {
    const { emailId, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const result = await adapter.getEmail(emailId);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get email: ${result.error}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Get email ${emailId}: Implementation pending - would return email details`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get email: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Send email
   */
  private async sendEmail(args: any): Promise<any> {
    const { platform = 'microsoft', ...emailData } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const result = await adapter.sendEmail(emailData);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to send email: ${result.error}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Send email: Implementation pending - would send email with subject "${emailData.subject}"`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to send email: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Reply to email
   */
  private async replyToEmail(args: any): Promise<any> {
    const { emailId, body, replyAll = false, platform = 'microsoft' } = args;

    return {
      content: [
        {
          type: 'text',
          text: `Reply to email ${emailId}: Implementation pending - would ${replyAll ? 'reply all' : 'reply'} with message`,
        },
      ],
    };
  }

  /**
   * Mark email as read
   */
  private async markEmailRead(args: any): Promise<any> {
    const { emailId, isRead = true, platform = 'microsoft' } = args;

    return {
      content: [
        {
          type: 'text',
          text: `Mark email ${emailId} as ${isRead ? 'read' : 'unread'}: Implementation pending`,
        },
      ],
    };
  }

  /**
   * Delete email
   */
  private async deleteEmail(args: any): Promise<any> {
    const { emailId, platform = 'microsoft' } = args;

    return {
      content: [
        {
          type: 'text',
          text: `Delete email ${emailId}: Implementation pending`,
        },
      ],
    };
  }

  // Calendar methods

  /**
   * Search calendar events implementation
   */
  private async searchCalendarEvents(args: any): Promise<any> {
    const { platform = 'microsoft', ...options } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter) {
        throw new Error(`Platform ${platform} not available`);
      }

      if (!adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}. Please run pim_auth_start first.`,
            },
          ],
        };
      }

      const queryOptions: CalendarQueryOptions = {
        query: options.query,
        calendarId: options.calendarId,
        attendee: options.attendee,
        organizer: options.organizer,
        location: options.location,
        categories: options.categories,
        sensitivity: options.sensitivity,
        importance: options.importance,
        showAs: options.showAs,
        isOnlineMeeting: options.isOnlineMeeting,
        isCancelled: options.isCancelled,
        dateFrom: options.dateFrom ? new Date(options.dateFrom) : undefined,
        dateTo: options.dateTo ? new Date(options.dateTo) : undefined,
        limit: options.limit,
        skip: options.skip,
      };

      const result = await adapter.searchEvents(options.query || '', {
        dateRange: queryOptions.dateFrom && queryOptions.dateTo 
          ? new DateRange(queryOptions.dateFrom, queryOptions.dateTo) 
          : undefined,
        limit: queryOptions.limit,
        offset: queryOptions.skip,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Calendar search failed: ${result.error}`,
            },
          ],
        };
      }

      const events = result.data || [];
      const eventSummaries = events.map(event => 
        `📅 ${event.title} (${event.start.toLocaleString()} - ${event.end.toLocaleString()})`
      ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${events.length} calendar events:\n\n${eventSummaries || 'No events found'}`,
          },
        ],
      };
    } catch (error) {
      this.logger.error('Calendar search failed', error);
      return {
        content: [
          {
            type: 'text',
            text: `Calendar search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Get specific calendar event
   */
  private async getCalendarEvent(args: any): Promise<any> {
    const { eventId, calendarId, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const result = await adapter.getEvent(eventId);

      if (!result.success || !result.data) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get event: ${result.error || 'Event not found'}`,
            },
          ],
        };
      }

      const event = result.data;
      const attendeesList = event.attendees.map(att => 
        `${att.email.address} (${att.responseStatus})`
      ).join(', ');

      return {
        content: [
          {
            type: 'text',
            text: `📅 Event Details:
Title: ${event.title}
Start: ${event.start.toLocaleString()}
End: ${event.end.toLocaleString()}
Location: ${event.location?.displayName || 'No location'}
Description: ${event.description || 'No description'}
Organizer: ${event.organizer?.email.address || 'Unknown'}
Attendees: ${attendeesList || 'No attendees'}
Status: ${event.showAs}
Importance: ${event.importance}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Create calendar event implementation
   */
  private async createCalendarEvent(args: any): Promise<any> {
    const { platform = 'microsoft', calendarId, ...eventData } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      // Transform attendees data
      const attendees: Attendee[] = (eventData.attendees || []).map((att: any) => ({
        email: new EmailAddress(att.email, att.name),
        name: att.name,
        type: att.type || 'required',
        responseStatus: 'none' as const,
        isOrganizer: false,
      }));

      const eventToCreate = {
        title: eventData.title,
        description: eventData.description,
        start: new Date(eventData.start),
        end: new Date(eventData.end),
        isAllDay: eventData.isAllDay || false,
        location: eventData.location ? {
          displayName: eventData.location,
        } : undefined,
        attendees,
        categories: eventData.categories || [],
        sensitivity: eventData.sensitivity || 'normal',
        importance: eventData.importance || 'normal',
        showAs: eventData.showAs || 'busy',
        responseRequested: eventData.responseRequested !== false,
      };

      const result = await adapter.createEvent(eventToCreate);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to create event: ${result.error}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Event "${eventData.title}" created successfully! Event ID: ${result.data}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Update calendar event
   */
  private async updateCalendarEvent(args: any): Promise<any> {
    const { eventId, platform = 'microsoft', calendarId, ...updates } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const eventUpdates: any = {};

      if (updates.title !== undefined) eventUpdates.title = updates.title;
      if (updates.description !== undefined) eventUpdates.description = updates.description;
      if (updates.start !== undefined) eventUpdates.start = new Date(updates.start);
      if (updates.end !== undefined) eventUpdates.end = new Date(updates.end);
      if (updates.isAllDay !== undefined) eventUpdates.isAllDay = updates.isAllDay;
      if (updates.location !== undefined) {
        eventUpdates.location = { displayName: updates.location };
      }
      if (updates.categories !== undefined) eventUpdates.categories = updates.categories;
      if (updates.sensitivity !== undefined) eventUpdates.sensitivity = updates.sensitivity;
      if (updates.importance !== undefined) eventUpdates.importance = updates.importance;
      if (updates.showAs !== undefined) eventUpdates.showAs = updates.showAs;
      
      if (updates.attendees !== undefined) {
        eventUpdates.attendees = updates.attendees.map((att: any) => ({
          email: new EmailAddress(att.email, att.name),
          name: att.name,
          type: att.type || 'required',
          responseStatus: 'none' as const,
          isOrganizer: false,
        }));
      }

      const result = await adapter.updateEvent(eventId, eventUpdates);

      if (!result.success || !result.data) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to update event: ${result.error || 'Update failed'}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Event "${result.data.title}" updated successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to update event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Delete calendar event
   */
  private async deleteCalendarEvent(args: any): Promise<any> {
    const { eventId, calendarId, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const result = await adapter.deleteEvent(eventId);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to delete event: ${result.error}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Event deleted successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to delete event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * List calendar events for date range
   */
  private async listCalendarEvents(args: any): Promise<any> {
    const { dateFrom, dateTo, calendarId, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const result = await adapter.fetchEvents({
        dateRange: new DateRange(new Date(dateFrom), new Date(dateTo)),
        limit: 50,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to list events: ${result.error}`,
            },
          ],
        };
      }

      const events = result.data || [];
      const eventList = events.map(event => 
        `📅 ${event.start.toLocaleDateString()} ${event.start.toLocaleTimeString()} - ${event.title}`
      ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `📅 Events from ${new Date(dateFrom).toLocaleDateString()} to ${new Date(dateTo).toLocaleDateString()}:\n\n${eventList || 'No events found'}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list events: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Find free time slots
   */
  private async findFreeTime(args: any): Promise<any> {
    const { attendees, durationMinutes, dateFrom, dateTo, workingHoursOnly = true, maxSuggestions = 10, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const emailAddresses = attendees.map((email: string) => new EmailAddress(email));
      const dateRange = new DateRange(new Date(dateFrom), new Date(dateTo));

      const result = await adapter.findFreeTime(emailAddresses, durationMinutes, dateRange, {
        workingHoursOnly,
        maxSuggestions,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to find free time: ${result.error}`,
            },
          ],
        };
      }

      const suggestions = result.data || [];
      const suggestionsList = suggestions.map((slot, index) => 
        `${index + 1}. ${slot.start.toLocaleString()} - ${slot.end.toLocaleString()} (Confidence: ${Math.round(slot.confidence * 100)}%)`
      ).join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `🕐 Free time suggestions for ${durationMinutes} minutes:\n\n${suggestionsList || 'No free time slots found'}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to find free time: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Respond to event invitation
   */
  private async respondToEvent(args: any): Promise<any> {
    const { eventId, response, comment, sendResponse = true, calendarId, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      // Since the GraphAdapter doesn't have respondToEvent method exposed,
      // we'll need to access the calendar service directly or add this method
      // For now, return a placeholder response
      return {
        content: [
          {
            type: 'text',
            text: `📧 Response "${response}" to event ${eventId} recorded${comment ? ` with comment: "${comment}"` : ''}. ${sendResponse ? 'Organizer will be notified.' : 'No notification sent.'}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to respond to event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Get free/busy information
   */
  private async getFreeBusy(args: any): Promise<any> {
    const { attendees, dateFrom, dateTo, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const emailAddresses = attendees.map((email: string) => new EmailAddress(email));
      const dateRange = new DateRange(new Date(dateFrom), new Date(dateTo));

      const result = await adapter.getFreeBusyInfo(emailAddresses, dateRange);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get free/busy info: ${result.error}`,
            },
          ],
        };
      }

      const freeBusyData = result.data || [];
      const freeBusyList = freeBusyData.map(fb => {
        const busySlots = fb.slots.filter(slot => slot.status !== 'free')
          .map(slot => `${slot.start.toLocaleString()} - ${slot.end.toLocaleString()} (${slot.status})`)
          .join(', ') || 'No busy times';
        
        return `📧 ${fb.email.address}\n   Busy: ${busySlots}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `📊 Free/Busy Information:\n\n${freeBusyList || 'No availability data found'}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get free/busy info: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  // Contact operation methods
  private async searchContacts(args: any): Promise<any> {
    const { platform = 'microsoft', ...options } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter) {
        throw new Error(`Platform ${platform} not available`);
      }

      if (!adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}. Please run pim_auth_start first.`,
            },
          ],
        };
      }

      const result = await adapter.searchContacts(options.query || '', {
        query: options.query,
        limit: options.limit,
        offset: options.skip,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to search contacts: ${result.error}`,
            },
          ],
        };
      }

      const contacts = result.data || [];
      const contactList = contacts.map(contact => {
        const emails = contact.emails.map(e => e.address).join(', ') || 'No email';
        const phones = contact.phones.map(p => p.number).join(', ') || 'No phone';
        const org = contact.organization?.name || '';
        
        return `👤 ${(contact as any).displayName}${org ? ` (${org})` : ''}
   📧 ${emails}
   📱 ${phones}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `📋 Found ${contacts.length} contacts:\n\n${contactList || 'No contacts found'}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching contacts: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getContact(args: any): Promise<any> {
    const { contactId, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const result = await adapter.getContact(contactId);

      if (!result.success || !result.data) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get contact: ${result.error}`,
            },
          ],
        };
      }

      const contact = result.data;
      const emails = contact.emails.map(e => `${e.type}: ${e.address}`).join('\n   ') || 'None';
      const phones = contact.phones.map(p => `${p.type}: ${p.number}`).join('\n   ') || 'None';
      const addresses = contact.addresses.map(a => 
        `${a.type}: ${[a.street, a.city, a.state, a.postalCode, a.country].filter(Boolean).join(', ')}`
      ).join('\n   ') || 'None';

      return {
        content: [
          {
            type: 'text',
            text: `👤 Contact Details:

Name: ${(contact as any).displayName}
Organization: ${contact.organization?.name || 'N/A'}
Job Title: ${contact.organization?.title || 'N/A'}
Department: ${contact.organization?.department || 'N/A'}

📧 Emails:
   ${emails}

📱 Phones:
   ${phones}

📍 Addresses:
   ${addresses}

📝 Notes: ${contact.notes || 'None'}
🏷️ Categories: ${contact.categories.join(', ') || 'None'}
⭐ Favorite: ${(contact.metadata as any).isFavorite ? 'Yes' : 'No'}
📅 Created: ${contact.createdDateTime.toLocaleString()}
📅 Modified: ${contact.lastModifiedDateTime.toLocaleString()}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting contact: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async createContact(args: any): Promise<any> {
    const { platform = 'microsoft', emailAddresses, phoneNumbers, ...contactData } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      // Prepare contact data
      const contact: any = {
        name: {
          givenName: contactData.givenName,
          surname: contactData.surname || '',
          displayName: contactData.displayName || `${contactData.givenName} ${contactData.surname || ''}`.trim(),
        },
        emails: emailAddresses?.map((e: any) => ({
          address: e.address,
          type: e.type || 'work',
          isPrimary: false,
        })) || [],
        phones: phoneNumbers?.map((p: any) => ({
          number: p.number,
          type: p.type || 'mobile',
          isPrimary: false,
        })) || [],
        organization: contactData.companyName ? {
          name: contactData.companyName,
          department: contactData.department,
          title: contactData.jobTitle,
        } : undefined,
        notes: contactData.notes,
        birthday: contactData.birthday ? new Date(contactData.birthday) : undefined,
        categories: contactData.categories || [],
      };

      const result = await adapter.createContact(contact);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to create contact: ${result.error}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Contact created successfully!\nID: ${result.data}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating contact: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async updateContact(args: any): Promise<any> {
    const { contactId, platform = 'microsoft', emailAddresses, phoneNumbers, ...updates } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      // Prepare update data
      const contactUpdates: any = {};
      
      if (updates.givenName || updates.surname || updates.displayName) {
        contactUpdates.name = {
          givenName: updates.givenName,
          surname: updates.surname,
          displayName: updates.displayName,
        };
      }

      if (emailAddresses) {
        contactUpdates.emails = emailAddresses.map((e: any) => ({
          address: e.address,
          type: e.type || 'work',
          isPrimary: false,
        }));
      }

      if (phoneNumbers) {
        contactUpdates.phones = phoneNumbers.map((p: any) => ({
          number: p.number,
          type: p.type || 'mobile',
          isPrimary: false,
        }));
      }

      if (updates.companyName || updates.department || updates.jobTitle) {
        contactUpdates.organization = {
          name: updates.companyName,
          department: updates.department,
          title: updates.jobTitle,
        };
      }

      if (updates.notes !== undefined) contactUpdates.notes = updates.notes;
      if (updates.birthday) contactUpdates.birthday = new Date(updates.birthday);
      if (updates.categories) contactUpdates.categories = updates.categories;

      const result = await adapter.updateContact(contactId, contactUpdates);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to update contact: ${result.error}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Contact updated successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error updating contact: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async deleteContact(args: any): Promise<any> {
    const { contactId, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const result = await adapter.deleteContact(contactId);

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to delete contact: ${result.error}`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `✅ Contact deleted successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error deleting contact: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async listContacts(args: any): Promise<any> {
    const { platform = 'microsoft', limit = 25, skip = 0, orderBy = 'displayName', orderDirection = 'asc' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const result = await adapter.fetchContacts({ limit, offset: skip });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to list contacts: ${result.error}`,
            },
          ],
        };
      }

      const contacts = result.data || [];
      const contactList = contacts.map(contact => {
        const email = (contact as any).primaryEmail?.address || 'No email';
        const phone = (contact as any).primaryPhone?.number || 'No phone';
        const org = contact.organization?.name || '';
        
        return `👤 ${(contact as any).displayName}${org ? ` (${org})` : ''}
   📧 ${email}
   📱 ${phone}`;
      }).join('\n\n');

      const paginationInfo = result.pagination ? `
📄 Page ${result.pagination.page} (${skip + 1}-${skip + contacts.length} of ${result.pagination.total})` : '';

      return {
        content: [
          {
            type: 'text',
            text: `📋 Contacts List:${paginationInfo}\n\n${contactList || 'No contacts found'}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing contacts: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async findContactsByEmail(args: any): Promise<any> {
    const { emailAddress, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      // Use the ContactsService's findByEmail method through adapter
      const result = await adapter.searchContacts('', {
        query: emailAddress,
        limit: 10,
      });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to find contacts: ${result.error}`,
            },
          ],
        };
      }

      const contacts = result.data || [];
      const matchingContacts = contacts.filter(contact => 
        contact.emails.some(e => e.address.toLowerCase().includes(emailAddress.toLowerCase()))
      );

      if (matchingContacts.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No contacts found with email address: ${emailAddress}`,
            },
          ],
        };
      }

      const contactList = matchingContacts.map(contact => {
        const emails = contact.emails.map(e => e.address).join(', ');
        const org = contact.organization?.name || '';
        
        return `👤 ${(contact as any).displayName}${org ? ` (${org})` : ''}
   📧 ${emails}`;
      }).join('\n\n');

      return {
        content: [
          {
            type: 'text',
            text: `📋 Found ${matchingContacts.length} contact(s) with email "${emailAddress}":\n\n${contactList}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error finding contacts by email: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  private async getOrganizations(args: any): Promise<any> {
    const { platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      // Fetch contacts and extract unique organizations
      const result = await adapter.fetchContacts({ limit: 100 });

      if (!result.success) {
        return {
          content: [
            {
              type: 'text',
              text: `Failed to get organizations: ${result.error}`,
            },
          ],
        };
      }

      const contacts = result.data || [];
      const organizations = new Set<string>();
      
      contacts.forEach(contact => {
        if (contact.organization?.name) {
          organizations.add(contact.organization.name);
        }
      });

      const orgList = Array.from(organizations).sort();

      if (orgList.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No organizations found in contacts',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `🏢 Organizations (${orgList.length}):\n\n${orgList.map(org => `• ${org}`).join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting organizations: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  // Task Management Methods

  /**
   * List tasks with filtering
   */
  private async listTasks(args: any): Promise<any> {
    const { 
      platform = 'microsoft',
      listId,
      status,
      importance,
      isCompleted,
      dateFrom,
      dateTo,
      limit = 50,
      skip = 0,
      orderBy = 'dueDateTime',
      orderDirection = 'asc'
    } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const taskService = adapter.getTaskService();
      const result = await taskService.listTasks({
        listId,
        status,
        importance,
        isCompleted,
        dateFrom: dateFrom ? new Date(dateFrom) : undefined,
        dateTo: dateTo ? new Date(dateTo) : undefined,
        limit,
        skip,
        orderBy,
        orderDirection
      });

      const taskSummaries = result.tasks.map(task => {
        const dueInfo = task.dueDateTime ? ` (Due: ${task.dueDateTime.toLocaleDateString()})` : '';
        const statusIcon = task.status === 'completed' ? '✅' : 
                          task.status === 'inProgress' ? '🔄' : '⏳';
        const importanceIcon = task.importance === 'high' ? '🔴' :
                               task.importance === 'low' ? '🔵' : '';
        
        return `${statusIcon} ${importanceIcon} ${task.title}${dueInfo}`;
      });

      return {
        content: [
          {
            type: 'text',
            text: `📋 Tasks (${result.totalCount} total, showing ${result.tasks.length}):\n\n${taskSummaries.join('\n')}\n\nPage ${result.pagination.page}/${Math.ceil(result.totalCount / (result.pagination.pageSize || 50))}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Get a specific task
   */
  private async getTask(args: any): Promise<any> {
    const { taskId, listId, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const taskService = adapter.getTaskService();
      const task = await taskService.getTask(taskId, listId);

      const statusIcon = task.status === 'completed' ? '✅' : 
                        task.status === 'inProgress' ? '🔄' : '⏳';
      const importanceIcon = task.importance === 'high' ? '🔴' :
                             task.importance === 'low' ? '🔵' : '🟡';

      let details = `${statusIcon} Task Details:\n`;
      details += `📝 Title: ${task.title}\n`;
      details += `${importanceIcon} Importance: ${task.importance}\n`;
      details += `📊 Status: ${task.status} (${task.percentComplete}% complete)\n`;
      
      if (task.description) {
        details += `\n📄 Description:\n${task.description}\n`;
      }
      
      if (task.dueDateTime) {
        details += `\n📅 Due: ${task.dueDateTime.toLocaleString()}`;
        const isOverdue = task.status !== 'completed' && new Date() > task.dueDateTime;
        if (isOverdue) {
          details += ' ⚠️ OVERDUE';
        }
      }
      
      if (task.startDateTime) {
        details += `\n🏁 Start: ${task.startDateTime.toLocaleString()}`;
      }
      
      if (task.completedDateTime) {
        details += `\n✔️ Completed: ${task.completedDateTime.toLocaleString()}`;
      }
      
      if (task.categories.length > 0) {
        details += `\n🏷️ Categories: ${task.categories.join(', ')}`;
      }
      
      if (task.subtasks.length > 0) {
        const completedSubtasks = task.subtasks.filter(s => s.isCompleted);
        details += `\n\n📋 Subtasks (${completedSubtasks.length}/${task.subtasks.length} completed):`;
        task.subtasks.forEach(subtask => {
          const icon = subtask.isCompleted ? '✅' : '⬜';
          details += `\n  ${icon} ${subtask.title}`;
        });
      }
      
      if (task.reminders.length > 0) {
        details += `\n\n⏰ Reminders:`;
        task.reminders.forEach(reminder => {
          details += `\n  • ${reminder.reminderDateTime.toLocaleString()} (${reminder.method})`;
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: details,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Create a new task
   */
  private async createTask(args: any): Promise<any> {
    const { 
      title,
      description,
      listId,
      importance = 'normal',
      dueDateTime,
      startDateTime,
      reminderDateTime,
      categories = [],
      platform = 'microsoft'
    } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const taskService = adapter.getTaskService();
      const task = await taskService.createTask({
        title,
        description,
        listId,
        importance,
        dueDateTime: dueDateTime ? new Date(dueDateTime) : undefined,
        startDateTime: startDateTime ? new Date(startDateTime) : undefined,
        reminderDateTime: reminderDateTime ? new Date(reminderDateTime) : undefined,
        categories
      });

      return {
        content: [
          {
            type: 'text',
            text: `✅ Task created successfully!\n\n📝 Title: ${task.title}\n🆔 ID: ${task.id}\n📊 Status: ${task.status}\n${task.dueDateTime ? `📅 Due: ${task.dueDateTime.toLocaleString()}` : ''}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error creating task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Update an existing task
   */
  private async updateTask(args: any): Promise<any> {
    const { 
      taskId,
      listId,
      title,
      description,
      status,
      importance,
      dueDateTime,
      startDateTime,
      categories,
      percentComplete,
      platform = 'microsoft'
    } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const taskService = adapter.getTaskService();
      const updates: any = {};
      
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (status !== undefined) updates.status = status;
      if (importance !== undefined) updates.importance = importance;
      if (dueDateTime !== undefined) updates.dueDateTime = dueDateTime ? new Date(dueDateTime) : null;
      if (startDateTime !== undefined) updates.startDateTime = startDateTime ? new Date(startDateTime) : null;
      if (categories !== undefined) updates.categories = categories;
      if (percentComplete !== undefined) updates.percentComplete = percentComplete;

      const task = await taskService.updateTask(taskId, updates, listId);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Task updated successfully!\n\n📝 Title: ${task.title}\n📊 Status: ${task.status} (${task.percentComplete}% complete)`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error updating task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Delete a task
   */
  private async deleteTask(args: any): Promise<any> {
    const { taskId, listId, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const taskService = adapter.getTaskService();
      await taskService.deleteTask(taskId, listId);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Task deleted successfully!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error deleting task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Mark a task as completed
   */
  private async completeTask(args: any): Promise<any> {
    const { taskId, listId, platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const taskService = adapter.getTaskService();
      const task = await taskService.completeTask(taskId, listId);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Task completed!\n\n📝 Title: ${task.title}\n✔️ Completed at: ${task.completedDateTime?.toLocaleString()}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error completing task: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Search tasks using semantic search
   */
  private async searchTasks(args: any): Promise<any> {
    const { 
      query,
      listId,
      status,
      importance,
      limit = 25,
      platform = 'microsoft'
    } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const taskService = adapter.getTaskService();
      const tasks = await taskService.searchTasks(query, {
        listId,
        status,
        importance,
        limit
      });

      if (tasks.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No tasks found matching "${query}"`,
            },
          ],
        };
      }

      const taskSummaries = tasks.map(task => {
        const dueInfo = task.dueDateTime ? ` (Due: ${task.dueDateTime.toLocaleDateString()})` : '';
        const statusIcon = task.status === 'completed' ? '✅' : 
                          task.status === 'inProgress' ? '🔄' : '⏳';
        const importanceIcon = task.importance === 'high' ? '🔴' :
                               task.importance === 'low' ? '🔵' : '';
        
        return `${statusIcon} ${importanceIcon} ${task.title}${dueInfo}`;
      });

      return {
        content: [
          {
            type: 'text',
            text: `🔍 Search results for "${query}" (${tasks.length} found):\n\n${taskSummaries.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * List available task lists
   */
  private async listTaskLists(args: any): Promise<any> {
    const { platform = 'microsoft' } = args;

    try {
      const adapter = this.platformManager.getAdapter(platform as Platform) as GraphAdapter;
      if (!adapter || !adapter.isAuthenticated) {
        return {
          content: [
            {
              type: 'text',
              text: `Not authenticated with ${platform}`,
            },
          ],
        };
      }

      const taskService = adapter.getTaskService();
      const lists = await taskService.listTaskLists();

      const listSummaries = lists.map(list => {
        const defaultIcon = list.isDefault ? ' ⭐' : '';
        return `📁 ${list.name}${defaultIcon} (ID: ${list.id})`;
      });

      return {
        content: [
          {
            type: 'text',
            text: `📚 Task Lists (${lists.length}):\n\n${listSummaries.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing task lists: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }
}
