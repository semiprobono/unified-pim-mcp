import { Logger } from '../../../../shared/logging/Logger.js';
import { CalendarEvent, CalendarEventEntity } from '../../../../domain/entities/CalendarEvent.js';
import {
  PaginationInfo,
  PlatformResult,
  SearchCriteria,
  FreeBusyInfo,
  TimeSlotSuggestion,
} from '../../../../domain/interfaces/PlatformPort.js';
import { EmailAddress } from '../../../../domain/value-objects/EmailAddress.js';
import { DateRange } from '../../../../domain/value-objects/DateRange.js';
import { GoogleClient } from '../clients/GoogleClient.js';
import { CacheManager } from '../cache/CacheManager.js';
import { ChromaDbInitializer } from '../cache/ChromaDbInitializer.js';
import { CalendarMapper } from '../mappers/CalendarMapper.js';
import { ErrorHandler } from '../errors/ErrorHandler.js';

/**
 * Calendar event query options for searching
 */
export interface CalendarQueryOptions {
  query?: string;
  calendarId?: string;
  attendee?: string;
  location?: string;
  categories?: string[];
  organizer?: string;
  sensitivity?: 'normal' | 'personal' | 'private' | 'confidential';
  importance?: 'low' | 'normal' | 'high';
  showAs?: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere';
  isOnlineMeeting?: boolean;
  isCancelled?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  startTimeFrom?: string; // Time of day filter (e.g., "09:00")
  startTimeTo?: string;
  durationMinutes?: number;
  limit?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  includeRecurring?: boolean;
  includeSeriesMaster?: boolean;
}

/**
 * Calendar event search result with pagination
 */
export interface CalendarSearchResult {
  events: CalendarEvent[];
  pagination: PaginationInfo;
  totalCount: number;
  nextPageToken?: string;
}

/**
 * Free/busy time slot
 */
export interface FreeTimeSlot {
  start: Date;
  end: Date;
  duration: number; // in minutes
}

/**
 * Free time search options
 */
export interface FreeTimeOptions {
  workingHoursOnly?: boolean;
  workingHours?: {
    start: string; // "09:00"
    end: string; // "17:00"
  };
  excludeWeekends?: boolean;
  minDuration?: number; // minimum slot duration in minutes
  maxSuggestions?: number;
  preferredTimes?: string[]; // preferred start times
}

/**
 * Microsoft Graph Calendar Service
 * Implements calendar operations using Graph API
 */
export class CalendarService {
  private readonly logger: Logger;
  private readonly cacheKeyPrefix = 'graph:calendar:';

  constructor(
    private readonly graphClient: GoogleClient,
    private readonly cacheManager: CacheManager,
    private readonly chromaDb: ChromaDbInitializer,
    private readonly errorHandler: ErrorHandler,
    logger: Logger
  ) {
    this.logger = logger;
  }

  /**
   * Get a single calendar event by ID
   */
  async getEvent(id: string, calendarId: string = 'primary'): Promise<PlatformResult<CalendarEvent>> {
    try {
      // Check cache first
      const cacheKey = `${this.cacheKeyPrefix}${calendarId}:${id}`;
      const cached = await this.cacheManager.get(cacheKey);

      if (cached) {
        this.logger.debug(`Event ${id} retrieved from cache`);
        return {
          success: true,
          data: cached,
        };
      }

      // Fetch from Graph API
      const endpoint = calendarId === 'primary' 
        ? `/me/events/${id}`
        : `/me/calendars/${calendarId}/events/${id}`;

      const response = await this.graphClient.get<any>(endpoint, {
        params: {
          $expand: 'attachments',
          $select: [
            'id', 'subject', 'body', 'bodyPreview', 'start', 'end', 'isAllDay',
            'location', 'attendees', 'organizer', 'recurrence', 'categories',
            'showAs', 'sensitivity', 'importance', 'responseRequested',
            'createdDateTime', 'lastModifiedDateTime', 'isCancelled',
            'onlineMeeting', 'isOnlineMeeting', 'onlineMeetingProvider',
            'onlineMeetingUrl', 'seriesMasterId', 'parentFolderId',
            'webLink', '@odata.etag'
          ].join(','),
        },
      });

      // Map to domain entity
      const event = CalendarMapper.toDomainEvent(response);

      // Cache the result
      await (this.cacheManager as any).set(cacheKey, event, 3600); // Cache for 1 hour

      // Index in ChromaDB for search
      await this.indexEvent(event);

      return {
        success: true,
        data: event,
      };
    } catch (error) {
      this.logger.error(`Failed to get event ${id}`, error);
      throw error;
    }
  }

  /**
   * Search calendar events with filters and pagination
   */
  async searchEvents(
    options: CalendarQueryOptions,
    calendarId: string = 'primary'
  ): Promise<PlatformResult<CalendarSearchResult>> {
    try {
      // Build filter query
      const filter = this.buildFilterQuery(options);

      // Build request parameters
      const params: any = {
        $top: options.limit || 25,
        $skip: options.skip || 0,
        $count: true,
        $select: [
          'id', 'subject', 'body', 'bodyPreview', 'start', 'end', 'isAllDay',
          'location', 'attendees', 'organizer', 'categories', 'showAs',
          'sensitivity', 'importance', 'createdDateTime', 'lastModifiedDateTime',
          'isCancelled', 'responseRequested', 'onlineMeeting', 'isOnlineMeeting'
        ].join(','),
      };

      if (filter) {
        params['$filter'] = filter;
      }

      if (options.orderBy) {
        params['$orderby'] = `${options.orderBy} ${options.orderDirection || 'asc'}`;
      } else {
        params['$orderby'] = 'start/dateTime asc';
      }

      if (options.query) {
        params['$search'] = `"${options.query}"`;
      }

      // Determine endpoint
      const endpoint = calendarId === 'primary' 
        ? '/me/events'
        : `/me/calendars/${calendarId}/events`;

      // Execute search
      const response = await this.graphClient.get<any>(endpoint, { params });

      // Map events
      const events = CalendarMapper.toDomainEvents(response.value || []);

      // Index events for future searches
      await Promise.all(events.map(event => this.indexEvent(event)));

      // Build pagination info
      const totalCount = response['@odata.count'] || events.length;
      const currentPage = Math.floor((options.skip || 0) / (options.limit || 25)) + 1;
      const pageSize = options.limit || 25;
      const hasNextPage = (options.skip || 0) + events.length < totalCount;
      const hasPreviousPage = (options.skip || 0) > 0;

      const result: CalendarSearchResult = {
        events,
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
      this.logger.error('Failed to search calendar events', error);
      throw error;
    }
  }

  /**
   * Create a new calendar event
   */
  async createEvent(
    event: Partial<CalendarEvent>,
    calendarId: string = 'primary'
  ): Promise<PlatformResult<string>> {
    try {
      // Convert to Graph format
      const graphEvent = CalendarMapper.toGraphEvent(event);

      // Determine endpoint
      const endpoint = calendarId === 'primary' 
        ? '/me/events'
        : `/me/calendars/${calendarId}/events`;

      // Create via Graph API
      const response = await this.graphClient.post<any>(endpoint, graphEvent);

      const eventId = response.id;
      this.logger.info(`Event created successfully: ${eventId}`);

      // Cache the created event
      const domainEvent = CalendarMapper.toDomainEvent(response);
      await (this.cacheManager as any).set(`${this.cacheKeyPrefix}${calendarId}:${eventId}`, domainEvent, 3600);

      // Index in ChromaDB
      await this.indexEvent(domainEvent);

      return {
        success: true,
        data: eventId,
      };
    } catch (error) {
      this.logger.error('Failed to create event', error);
      throw error;
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(
    eventId: string,
    updates: Partial<CalendarEvent>,
    calendarId: string = 'primary'
  ): Promise<PlatformResult<CalendarEvent>> {
    try {
      const graphUpdate = CalendarMapper.toGraphUpdate(updates);

      // Determine endpoint
      const endpoint = calendarId === 'primary' 
        ? `/me/events/${eventId}`
        : `/me/calendars/${calendarId}/events/${eventId}`;

      const response = await this.graphClient.patch<any>(endpoint, graphUpdate);

      const updatedEvent = CalendarMapper.toDomainEvent(response);

      // Update cache
      await (this.cacheManager as any).set(`${this.cacheKeyPrefix}${calendarId}:${eventId}`, updatedEvent, 3600);

      // Update ChromaDB index
      await this.indexEvent(updatedEvent);

      return {
        success: true,
        data: updatedEvent,
      };
    } catch (error) {
      this.logger.error(`Failed to update event ${eventId}`, error);
      throw error;
    }
  }

  /**
   * Delete a calendar event
   */
  async deleteEvent(
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<PlatformResult<boolean>> {
    try {
      // Determine endpoint
      const endpoint = calendarId === 'primary' 
        ? `/me/events/${eventId}`
        : `/me/calendars/${calendarId}/events/${eventId}`;

      await this.graphClient.delete(endpoint);

      // Remove from cache
      await this.cacheManager.delete(`${this.cacheKeyPrefix}${calendarId}:${eventId}`);

      // Remove from ChromaDB index
      // TODO: Implement event deletion from vector store
      // await this.chromaDb.deleteDocuments({
      //   collection: 'graph-search-index',
      //   ids: [`event_${eventId}`]
      // });

      this.logger.info(`Event ${eventId} deleted successfully`);

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      this.logger.error(`Failed to delete event ${eventId}`, error);
      throw error;
    }
  }

  /**
   * Get free/busy information for attendees
   */
  async getFreeBusy(
    attendees: EmailAddress[],
    dateRange: DateRange
  ): Promise<PlatformResult<FreeBusyInfo[]>> {
    try {
      const schedules = attendees.map(attendee => attendee.address);

      const requestBody = {
        schedules,
        startTime: {
          dateTime: dateRange.start.toISOString(),
          timeZone: 'UTC',
        },
        endTime: {
          dateTime: dateRange.end.toISOString(),
          timeZone: 'UTC',
        },
        availabilityViewInterval: 15, // 15-minute intervals
      };

      const response = await this.graphClient.post<any>('/me/calendar/getSchedule', requestBody);

      const freeBusyInfo: FreeBusyInfo[] = response.value.map((schedule: any, index: number) => ({
        email: attendees[index],
        slots: schedule.busyTimes?.map((busyTime: any) => ({
          start: new Date(busyTime.start.dateTime),
          end: new Date(busyTime.end.dateTime),
          status: busyTime.status || 'busy',
        })) || [],
        workingHours: schedule.workingHours ? {
          start: schedule.workingHours.startTime,
          end: schedule.workingHours.endTime,
          timezone: schedule.workingHours.timeZone,
        } : undefined,
      }));

      return {
        success: true,
        data: freeBusyInfo,
      };
    } catch (error) {
      this.logger.error('Failed to get free/busy information', error);
      throw error;
    }
  }

  /**
   * Find free time slots for scheduling meetings
   */
  async findFreeTime(
    attendees: EmailAddress[],
    durationMinutes: number,
    dateRange: DateRange,
    options: FreeTimeOptions = {}
  ): Promise<PlatformResult<TimeSlotSuggestion[]>> {
    try {
      const requestBody = {
        schedules: attendees.map(attendee => attendee.address),
        startTime: {
          dateTime: dateRange.start.toISOString(),
          timeZone: 'UTC',
        },
        endTime: {
          dateTime: dateRange.end.toISOString(),
          timeZone: 'UTC',
        },
        meetingDuration: `PT${durationMinutes}M`, // ISO 8601 duration format
        maxCandidates: options.maxSuggestions || 20,
        isOrganizerOptional: false,
        returnSuggestionReasons: true,
        activityDomain: options.workingHoursOnly ? 'work' : 'unrestricted',
      };

      const response = await this.graphClient.post<any>('/me/calendar/findMeetingTimes', requestBody);

      const suggestions: TimeSlotSuggestion[] = response.meetingTimeSuggestions?.map((suggestion: any) => ({
        start: new Date(suggestion.meetingTimeSlot.start.dateTime),
        end: new Date(suggestion.meetingTimeSlot.end.dateTime),
        confidence: this.mapConfidenceLevel(suggestion.confidence),
        score: suggestion.suggestionReason?.score || 0,
        attendeeAvailability: suggestion.attendeeAvailability?.map((availability: any) => ({
          email: new EmailAddress(availability.attendee.emailAddress.address),
          availability: availability.availability,
        })) || [],
        locations: suggestion.locations || [],
        suggestionReason: suggestion.suggestionReason?.suggestionReason,
      })) || [];

      return {
        success: true,
        data: suggestions,
      };
    } catch (error) {
      this.logger.error('Failed to find free time', error);
      throw error;
    }
  }

  /**
   * Get calendar list
   */
  async getCalendars(): Promise<PlatformResult<any[]>> {
    try {
      const response = await this.graphClient.get<any>('/me/calendars', {
        params: {
          $select: 'id,name,color,isDefaultCalendar,canEdit,canShare,canViewPrivateItems,owner',
        },
      });

      return {
        success: true,
        data: response.value || [],
      };
    } catch (error) {
      this.logger.error('Failed to get calendars', error);
      throw error;
    }
  }

  /**
   * Get events for a specific date range
   */
  async getEventsInRange(
    dateRange: DateRange,
    calendarId: string = 'primary'
  ): Promise<PlatformResult<CalendarEvent[]>> {
    const options: CalendarQueryOptions = {
      dateFrom: dateRange.start,
      dateTo: dateRange.end,
      orderBy: 'start/dateTime',
      orderDirection: 'asc',
      limit: 100, // Reasonable limit for date range queries
    };

    const result = await this.searchEvents(options, calendarId);
    
    if (result.success && result.data) {
      return {
        success: true,
        data: result.data.events,
      };
    }

    return {
      success: false,
      error: result.error || 'Failed to get events in range',
    };
  }

  /**
   * Respond to a meeting invitation
   */
  async respondToEvent(
    eventId: string,
    response: 'accept' | 'tentative' | 'decline',
    comment?: string,
    sendResponse: boolean = true,
    calendarId: string = 'primary'
  ): Promise<PlatformResult<boolean>> {
    try {
      const endpoint = calendarId === 'primary'
        ? `/me/events/${eventId}/${response}`
        : `/me/calendars/${calendarId}/events/${eventId}/${response}`;

      const requestBody = {
        comment: comment || '',
        sendResponse,
      };

      await this.graphClient.post(endpoint, requestBody);

      // Invalidate cache
      await this.cacheManager.delete(`${this.cacheKeyPrefix}${calendarId}:${eventId}`);

      this.logger.info(`Responded to event ${eventId} with ${response}`);

      return {
        success: true,
        data: true,
      };
    } catch (error) {
      this.logger.error(`Failed to respond to event ${eventId}`, error);
      throw error;
    }
  }

  /**
   * Index event in ChromaDB for semantic search
   */
  private async indexEvent(event: CalendarEvent): Promise<void> {
    try {
      // TODO: Implement event indexing in vector store
      // await this.chromaDb.addDocuments({
      //   collection: 'graph-search-index',
      //   documents: [{
      //     id: `event_${event.id}`,
      //     content: `${event.title} ${event.description || ''} ${event.location?.displayName || ''}`,
      //     metadata: {
      //       type: 'event',
      //       title: event.title,
      //       start: event.start.toISOString(),
      //       end: event.end.toISOString(),
      //       isAllDay: event.isAllDay,
      //       location: event.location?.displayName || '',
      //       organizer: event.organizer?.email.toString() || '',
      //       attendees: event.attendees.map(att => att.email.toString()).join(', '),
      //       categories: event.categories.join(', '),
      //       importance: event.importance,
      //       sensitivity: event.sensitivity,
      //       showAs: event.showAs,
      //       isOnlineMeeting: event.metadata.isOnlineMeeting,
      //       isCancelled: event.isCancelled,
      //       calendarId: event.calendarId
      //     }
      //   }]
      // });
    } catch (error) {
      this.logger.warn(`Failed to index event ${event.id} in ChromaDB`, error);
      // Don't fail the operation if indexing fails
    }
  }

  /**
   * Build OData filter query from options
   */
  private buildFilterQuery(options: CalendarQueryOptions): string {
    const filters: string[] = [];

    if (options.attendee) {
      filters.push(`attendees/any(a: a/emailAddress/address eq '${options.attendee}')`);
    }

    if (options.organizer) {
      filters.push(`organizer/emailAddress/address eq '${options.organizer}'`);
    }

    if (options.location) {
      filters.push(`contains(location/displayName, '${options.location}')`);
    }

    if (options.sensitivity) {
      filters.push(`sensitivity eq '${options.sensitivity}'`);
    }

    if (options.importance) {
      filters.push(`importance eq '${options.importance}'`);
    }

    if (options.showAs) {
      filters.push(`showAs eq '${options.showAs}'`);
    }

    if (options.isOnlineMeeting !== undefined) {
      filters.push(`isOnlineMeeting eq ${options.isOnlineMeeting}`);
    }

    if (options.isCancelled !== undefined) {
      filters.push(`isCancelled eq ${options.isCancelled}`);
    }

    if (options.dateFrom) {
      filters.push(`start/dateTime ge '${options.dateFrom.toISOString()}'`);
    }

    if (options.dateTo) {
      filters.push(`end/dateTime le '${options.dateTo.toISOString()}'`);
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
   * Map confidence level from Graph API to domain
   */
  private mapConfidenceLevel(graphConfidence?: string): number {
    switch (graphConfidence?.toLowerCase()) {
      case 'high': return 0.9;
      case 'medium': return 0.6;
      case 'low': return 0.3;
      default: return 0.5;
    }
  }
}