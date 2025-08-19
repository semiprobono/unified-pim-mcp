import {
  Attendee,
  CalendarEvent,
  CalendarEventEntity,
  Location,
  RecurrenceRule,
} from '../../../../domain/entities/CalendarEvent.js';
import { EmailAddress } from '../../../../domain/value-objects/EmailAddress.js';
import { UnifiedId } from '../../../../domain/value-objects/UnifiedId.js';
import { Platform } from '../../../../domain/value-objects/Platform.js';
import {
  EventMetadata,
  EventMetadataImpl,
} from '../../../../domain/value-objects/EventMetadata.js';

/**
 * Maps between Microsoft Graph calendar event format and domain CalendarEvent entity
 */
export class CalendarMapper {
  /**
   * Transforms Graph API event response to domain CalendarEvent entity
   */
  static toDomainEvent(graphEvent: any, userEmail?: string): CalendarEvent {
    // Extract attendees
    const attendees = this.toAttendees(graphEvent.attendees || []);
    
    // Find organizer
    const organizer = this.findOrganizer(graphEvent.organizer, attendees);
    
    // Extract location
    const location = this.toLocation(graphEvent.location);
    
    // Extract recurrence
    const recurrence = this.toRecurrenceRule(graphEvent.recurrence);
    
    // Map show as (free/busy status)
    const showAs = this.mapShowAs(graphEvent.showAs);
    
    // Map sensitivity
    const sensitivity = this.mapSensitivity(graphEvent.sensitivity);
    
    // Map importance
    const importance = this.mapImportance(graphEvent.importance);
    
    // Create unified ID
    const unifiedId = UnifiedId.fromString(`microsoft_event_${graphEvent.id}`);
    
    // Create platform IDs map
    const platformIds = new Map<Platform, string>();
    platformIds.set('microsoft', graphEvent.id);
    
    // Create metadata
    const metadata = this.createEventMetadata(graphEvent, userEmail);
    
    // Extract dates
    const start = this.parseDateTime(graphEvent.start);
    const end = this.parseDateTime(graphEvent.end);
    const isAllDay = graphEvent.isAllDay || false;
    
    return new CalendarEventEntity(
      unifiedId,
      platformIds,
      graphEvent.subject || '',
      start,
      end,
      isAllDay,
      attendees,
      graphEvent.categories || [],
      showAs,
      sensitivity,
      importance,
      graphEvent.parentFolderId || 'default',
      new Date(graphEvent.createdDateTime || Date.now()),
      new Date(graphEvent.lastModifiedDateTime || Date.now()),
      graphEvent.isCancelled || false,
      graphEvent.responseRequested !== false, // Default to true
      metadata,
      graphEvent.body?.content || graphEvent.bodyPreview,
      location,
      organizer,
      recurrence,
      graphEvent.seriesMasterId
    );
  }

  /**
   * Transform domain CalendarEvent to Graph API format for creation/update
   */
  static toGraphEvent(domainEvent: Partial<CalendarEvent>): any {
    const graphEvent: any = {
      subject: domainEvent.title,
      body: domainEvent.description
        ? {
            contentType: 'HTML',
            content: domainEvent.description,
          }
        : undefined,
      start: domainEvent.start
        ? {
            dateTime: domainEvent.start.toISOString(),
            timeZone: 'UTC',
          }
        : undefined,
      end: domainEvent.end
        ? {
            dateTime: domainEvent.end.toISOString(),
            timeZone: 'UTC',
          }
        : undefined,
      isAllDay: domainEvent.isAllDay || false,
      location: domainEvent.location ? this.toGraphLocation(domainEvent.location) : undefined,
      attendees: domainEvent.attendees ? domainEvent.attendees.map(this.toGraphAttendee) : [],
      categories: domainEvent.categories || [],
      showAs: domainEvent.showAs ? this.mapShowAsToGraph(domainEvent.showAs) : 'busy',
      sensitivity: domainEvent.sensitivity ? this.mapSensitivityToGraph(domainEvent.sensitivity) : 'normal',
      importance: domainEvent.importance ? this.mapImportanceToGraph(domainEvent.importance) : 'normal',
      responseRequested: domainEvent.responseRequested !== false,
      recurrence: domainEvent.recurrence ? this.toGraphRecurrence(domainEvent.recurrence) : undefined,
    };

    // Remove undefined values
    Object.keys(graphEvent).forEach(key => {
      if (graphEvent[key] === undefined) {
        delete graphEvent[key];
      }
    });

    return graphEvent;
  }

  /**
   * Convert Graph attendees to domain Attendee array
   */
  private static toAttendees(graphAttendees: any[]): Attendee[] {
    return graphAttendees.map(attendee => ({
      email: new EmailAddress(
        attendee.emailAddress?.address || 'unknown@unknown.com',
        attendee.emailAddress?.name
      ),
      name: attendee.emailAddress?.name,
      responseStatus: this.mapResponseStatus(attendee.status?.response),
      type: this.mapAttendeeType(attendee.type),
      isOrganizer: false, // Will be set separately for organizer
    }));
  }

  /**
   * Find and mark organizer in attendee list
   */
  private static findOrganizer(graphOrganizer: any, attendees: Attendee[]): Attendee | undefined {
    if (!graphOrganizer?.emailAddress?.address) {
      return undefined;
    }

    const organizerEmail = new EmailAddress(
      graphOrganizer.emailAddress.address,
      graphOrganizer.emailAddress.name
    );

    // Find organizer in attendees list and mark them
    const organizer = attendees.find(attendee => 
      attendee.email.equals(organizerEmail)
    );

    if (organizer) {
      return {
        ...organizer,
        isOrganizer: true,
      };
    }

    // If organizer not in attendees, create new attendee entry
    return {
      email: organizerEmail,
      name: graphOrganizer.emailAddress.name,
      responseStatus: 'accepted',
      type: 'required',
      isOrganizer: true,
    };
  }

  /**
   * Convert Graph location to domain Location
   */
  private static toLocation(graphLocation: any): Location | undefined {
    if (!graphLocation) return undefined;

    return {
      displayName: graphLocation.displayName || '',
      address: graphLocation.address?.street ? 
        `${graphLocation.address.street}, ${graphLocation.address.city}, ${graphLocation.address.state} ${graphLocation.address.postalCode}` :
        undefined,
      coordinates: graphLocation.coordinates ? {
        latitude: graphLocation.coordinates.latitude,
        longitude: graphLocation.coordinates.longitude,
      } : undefined,
      locationUri: graphLocation.locationUri,
    };
  }

  /**
   * Convert Graph recurrence to domain RecurrenceRule
   */
  private static toRecurrenceRule(graphRecurrence: any): RecurrenceRule | undefined {
    if (!graphRecurrence?.pattern) return undefined;

    const pattern = graphRecurrence.pattern;
    const range = graphRecurrence.range;

    return {
      frequency: this.mapRecurrenceFrequency(pattern.type),
      interval: pattern.interval || 1,
      daysOfWeek: pattern.daysOfWeek,
      dayOfMonth: pattern.dayOfMonth,
      monthOfYear: pattern.month,
      count: range?.numberOfOccurrences,
      until: range?.endDate ? new Date(range.endDate) : undefined,
    };
  }

  /**
   * Parse Graph DateTime object to Date
   */
  private static parseDateTime(graphDateTime: any): Date {
    if (!graphDateTime) return new Date();
    
    if (graphDateTime.dateTime) {
      return new Date(graphDateTime.dateTime);
    }
    
    return new Date(graphDateTime);
  }

  /**
   * Create EventMetadata from Graph event
   */
  private static createEventMetadata(graphEvent: any, userEmail?: string): EventMetadata {
    const isOnlineMeeting = !!(graphEvent.onlineMeeting || graphEvent.isOnlineMeeting);
    const onlineMeetingProvider = this.mapOnlineMeetingProvider(graphEvent.onlineMeetingProvider);
    
    const metadata = new EventMetadataImpl(
      'microsoft',
      graphEvent.parentFolderId || 'default',
      graphEvent.id,
      0, // sequence - Graph doesn't expose this directly
      isOnlineMeeting,
      graphEvent.sensitivity === 'private',
      !graphEvent.disallowNewTimeProposals,
      false, // hideAttendees - would need to be derived from permissions
      graphEvent.responseRequested !== false,
      graphEvent.disallowNewTimeProposals || false,
      new Date(), // lastSyncTime
      undefined, // calendarName
      graphEvent.webLink,
      graphEvent['@odata.etag'],
      graphEvent['@odata.etag'],
      graphEvent.seriesMasterId,
      graphEvent.originalStartTime ? new Date(graphEvent.originalStartTime.dateTime) : undefined,
      onlineMeetingProvider,
      graphEvent.onlineMeeting?.joinUrl || graphEvent.onlineMeetingUrl,
      graphEvent.onlineMeeting ? {
        conferenceId: graphEvent.onlineMeeting.conferenceId,
        dialInNumber: graphEvent.onlineMeeting.dialInNumber,
        passcode: graphEvent.onlineMeeting.passcode,
        quickDial: graphEvent.onlineMeeting.quickDial,
        tollNumber: graphEvent.onlineMeeting.tollNumber,
        tollFreeNumbers: graphEvent.onlineMeeting.tollFreeNumbers,
      } : undefined
    );

    return metadata;
  }

  /**
   * Convert domain Location to Graph format
   */
  private static toGraphLocation(location: Location): any {
    return {
      displayName: location.displayName,
      address: location.address ? {
        street: location.address,
      } : undefined,
      coordinates: location.coordinates ? {
        latitude: location.coordinates.latitude,
        longitude: location.coordinates.longitude,
      } : undefined,
      locationUri: location.locationUri,
    };
  }

  /**
   * Convert domain Attendee to Graph format
   */
  private static toGraphAttendee(attendee: Attendee): any {
    return {
      type: this.mapAttendeeTypeToGraph(attendee.type),
      emailAddress: {
        address: attendee.email.address,
        name: attendee.name || attendee.email.displayName,
      },
    };
  }

  /**
   * Convert domain RecurrenceRule to Graph format
   */
  private static toGraphRecurrence(recurrence: RecurrenceRule): any {
    return {
      pattern: {
        type: this.mapRecurrenceFrequencyToGraph(recurrence.frequency),
        interval: recurrence.interval,
        daysOfWeek: recurrence.daysOfWeek,
        dayOfMonth: recurrence.dayOfMonth,
        month: recurrence.monthOfYear,
      },
      range: {
        type: recurrence.count ? 'numbered' : recurrence.until ? 'endDate' : 'noEnd',
        numberOfOccurrences: recurrence.count,
        endDate: recurrence.until?.toISOString().split('T')[0],
      },
    };
  }

  // Mapping helper methods
  private static mapResponseStatus(graphStatus?: string): 'none' | 'accepted' | 'tentative' | 'declined' {
    switch (graphStatus?.toLowerCase()) {
      case 'accepted': return 'accepted';
      case 'tentative': return 'tentative';
      case 'declined': return 'declined';
      default: return 'none';
    }
  }

  private static mapAttendeeType(graphType?: string): 'required' | 'optional' | 'resource' {
    switch (graphType?.toLowerCase()) {
      case 'optional': return 'optional';
      case 'resource': return 'resource';
      default: return 'required';
    }
  }

  private static mapAttendeeTypeToGraph(type: 'required' | 'optional' | 'resource'): string {
    switch (type) {
      case 'optional': return 'optional';
      case 'resource': return 'resource';
      default: return 'required';
    }
  }

  private static mapShowAs(graphShowAs?: string): 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' {
    switch (graphShowAs?.toLowerCase()) {
      case 'free': return 'free';
      case 'tentative': return 'tentative';
      case 'oof': return 'oof';
      case 'workingelsewhere': return 'workingElsewhere';
      default: return 'busy';
    }
  }

  private static mapShowAsToGraph(showAs: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere'): string {
    switch (showAs) {
      case 'free': return 'free';
      case 'tentative': return 'tentative';
      case 'oof': return 'oof';
      case 'workingElsewhere': return 'workingElsewhere';
      default: return 'busy';
    }
  }

  private static mapSensitivity(graphSensitivity?: string): 'normal' | 'personal' | 'private' | 'confidential' {
    switch (graphSensitivity?.toLowerCase()) {
      case 'personal': return 'personal';
      case 'private': return 'private';
      case 'confidential': return 'confidential';
      default: return 'normal';
    }
  }

  private static mapSensitivityToGraph(sensitivity: 'normal' | 'personal' | 'private' | 'confidential'): string {
    switch (sensitivity) {
      case 'personal': return 'personal';
      case 'private': return 'private';
      case 'confidential': return 'confidential';
      default: return 'normal';
    }
  }

  private static mapImportance(graphImportance?: string): 'low' | 'normal' | 'high' {
    switch (graphImportance?.toLowerCase()) {
      case 'low': return 'low';
      case 'high': return 'high';
      default: return 'normal';
    }
  }

  private static mapImportanceToGraph(importance: 'low' | 'normal' | 'high'): string {
    switch (importance) {
      case 'low': return 'low';
      case 'high': return 'high';
      default: return 'normal';
    }
  }

  private static mapRecurrenceFrequency(graphType?: string): 'daily' | 'weekly' | 'monthly' | 'yearly' {
    switch (graphType?.toLowerCase()) {
      case 'daily': return 'daily';
      case 'weekly': return 'weekly';
      case 'absolutemonthly':
      case 'relativemonthly': return 'monthly';
      case 'absoluteyearly':
      case 'relativeyearly': return 'yearly';
      default: return 'daily';
    }
  }

  private static mapRecurrenceFrequencyToGraph(frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'): string {
    switch (frequency) {
      case 'daily': return 'daily';
      case 'weekly': return 'weekly';
      case 'monthly': return 'absoluteMonthly';
      case 'yearly': return 'absoluteYearly';
      default: return 'daily';
    }
  }

  private static mapOnlineMeetingProvider(
    graphProvider?: string
  ): 'teamsForBusiness' | 'skypeForBusiness' | 'skypeForConsumer' | 'zoom' | 'webex' | 'other' | undefined {
    switch (graphProvider?.toLowerCase()) {
      case 'teamsforbusiness': return 'teamsForBusiness';
      case 'skypeforbusiness': return 'skypeForBusiness';
      case 'skypeforconsumer': return 'skypeForConsumer';
      case 'zoom': return 'zoom';
      case 'webex': return 'webex';
      default: return graphProvider ? 'other' : undefined;
    }
  }

  /**
   * Convert batch of Graph events to domain events
   */
  static toDomainEvents(graphEvents: any[], userEmail?: string): CalendarEvent[] {
    return graphEvents.map(event => this.toDomainEvent(event, userEmail));
  }

  /**
   * Create update payload for Graph API from partial calendar event
   */
  static toGraphUpdate(updates: Partial<CalendarEvent>): any {
    const graphUpdate: any = {};

    if (updates.title !== undefined) {
      graphUpdate.subject = updates.title;
    }

    if (updates.description !== undefined) {
      graphUpdate.body = {
        contentType: 'HTML',
        content: updates.description,
      };
    }

    if (updates.start !== undefined) {
      graphUpdate.start = {
        dateTime: updates.start.toISOString(),
        timeZone: 'UTC',
      };
    }

    if (updates.end !== undefined) {
      graphUpdate.end = {
        dateTime: updates.end.toISOString(),
        timeZone: 'UTC',
      };
    }

    if (updates.isAllDay !== undefined) {
      graphUpdate.isAllDay = updates.isAllDay;
    }

    if (updates.location !== undefined) {
      graphUpdate.location = this.toGraphLocation(updates.location);
    }

    if (updates.attendees !== undefined) {
      graphUpdate.attendees = updates.attendees.map(this.toGraphAttendee);
    }

    if (updates.categories !== undefined) {
      graphUpdate.categories = updates.categories;
    }

    if (updates.showAs !== undefined) {
      graphUpdate.showAs = this.mapShowAsToGraph(updates.showAs);
    }

    if (updates.sensitivity !== undefined) {
      graphUpdate.sensitivity = this.mapSensitivityToGraph(updates.sensitivity);
    }

    if (updates.importance !== undefined) {
      graphUpdate.importance = this.mapImportanceToGraph(updates.importance);
    }

    if (updates.responseRequested !== undefined) {
      graphUpdate.responseRequested = updates.responseRequested;
    }

    if (updates.recurrence !== undefined) {
      graphUpdate.recurrence = this.toGraphRecurrence(updates.recurrence);
    }

    return graphUpdate;
  }
}