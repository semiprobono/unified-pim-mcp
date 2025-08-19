import { UnifiedId } from '../value-objects/UnifiedId.js';
import { Platform } from '../value-objects/Platform.js';
import { EmailAddress } from '../value-objects/EmailAddress.js';
import { DateRange } from '../value-objects/DateRange.js';
import { EventMetadata } from '../value-objects/EventMetadata.js';

export interface Attendee {
  email: EmailAddress;
  name?: string;
  responseStatus: 'none' | 'accepted' | 'tentative' | 'declined';
  type: 'required' | 'optional' | 'resource';
  isOrganizer?: boolean;
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: string[];
  dayOfMonth?: number;
  monthOfYear?: number;
  count?: number;
  until?: Date;
}

export interface Location {
  displayName: string;
  address?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  locationUri?: string;
}

export interface CalendarEvent {
  readonly id: UnifiedId;
  readonly platformIds: Map<Platform, string>;
  readonly title: string;
  readonly description?: string | undefined;
  readonly start: Date;
  readonly end: Date;
  readonly isAllDay: boolean;
  readonly location?: Location | undefined;
  readonly attendees: Attendee[];
  readonly organizer?: Attendee | undefined;
  readonly recurrence?: RecurrenceRule | undefined;
  readonly categories: string[];
  readonly showAs: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere';
  readonly sensitivity: 'normal' | 'personal' | 'private' | 'confidential';
  readonly importance: 'low' | 'normal' | 'high';
  readonly calendarId: string;
  readonly createdDateTime: Date;
  readonly lastModifiedDateTime: Date;
  readonly isCancelled: boolean;
  readonly responseRequested: boolean;
  readonly seriesMasterId?: string | undefined;
  readonly metadata: EventMetadata;
}

export class CalendarEventEntity implements CalendarEvent {
  constructor(
    public readonly id: UnifiedId,
    public readonly platformIds: Map<Platform, string>,
    public readonly title: string,
    public readonly start: Date,
    public readonly end: Date,
    public readonly isAllDay: boolean,
    public readonly attendees: Attendee[],
    public readonly categories: string[],
    public readonly showAs: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere',
    public readonly sensitivity: 'normal' | 'personal' | 'private' | 'confidential',
    public readonly importance: 'low' | 'normal' | 'high',
    public readonly calendarId: string,
    public readonly createdDateTime: Date,
    public readonly lastModifiedDateTime: Date,
    public readonly isCancelled: boolean,
    public readonly responseRequested: boolean,
    public readonly metadata: EventMetadata,
    public readonly description?: string,
    public readonly location?: Location,
    public readonly organizer?: Attendee,
    public readonly recurrence?: RecurrenceRule,
    public readonly seriesMasterId?: string
  ) {}

  /**
   * Gets the date range for this event
   */
  get dateRange(): DateRange {
    return new DateRange(this.start, this.end);
  }

  /**
   * Gets the duration in minutes
   */
  get durationMinutes(): number {
    return Math.round((this.end.getTime() - this.start.getTime()) / (1000 * 60));
  }

  /**
   * Checks if event conflicts with another event
   */
  conflictsWith(other: CalendarEvent): boolean {
    return this.dateRange.overlaps(new DateRange(other.start, other.end));
  }

  /**
   * Checks if the current user is the organizer
   */
  isUserOrganizer(userEmail: EmailAddress): boolean {
    return this.organizer?.email.equals(userEmail) ?? false;
  }

  /**
   * Gets attendee by email address
   */
  getAttendee(email: EmailAddress): Attendee | undefined {
    return this.attendees.find(attendee => attendee.email.equals(email));
  }

  /**
   * Gets required attendees
   */
  get requiredAttendees(): Attendee[] {
    return this.attendees.filter(attendee => attendee.type === 'required');
  }

  /**
   * Gets optional attendees
   */
  get optionalAttendees(): Attendee[] {
    return this.attendees.filter(attendee => attendee.type === 'optional');
  }

  /**
   * Gets resource attendees (rooms, equipment)
   */
  get resourceAttendees(): Attendee[] {
    return this.attendees.filter(attendee => attendee.type === 'resource');
  }

  /**
   * Updates attendee response status
   */
  updateAttendeeResponse(
    email: EmailAddress,
    response: 'accepted' | 'tentative' | 'declined'
  ): CalendarEventEntity {
    const updatedAttendees = this.attendees.map(attendee =>
      attendee.email.equals(email) ? { ...attendee, responseStatus: response } : attendee
    );

    return new CalendarEventEntity(
      this.id,
      this.platformIds,
      this.title,
      this.start,
      this.end,
      this.isAllDay,
      updatedAttendees,
      this.categories,
      this.showAs,
      this.sensitivity,
      this.importance,
      this.calendarId,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.isCancelled,
      this.responseRequested,
      this.metadata,
      this.description,
      this.location,
      this.organizer,
      this.recurrence,
      this.seriesMasterId
    );
  }

  /**
   * Reschedules the event to a new time
   */
  reschedule(newStart: Date, newEnd: Date): CalendarEventEntity {
    return new CalendarEventEntity(
      this.id,
      this.platformIds,
      this.title,
      newStart,
      newEnd,
      this.isAllDay,
      this.attendees,
      this.categories,
      this.showAs,
      this.sensitivity,
      this.importance,
      this.calendarId,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.isCancelled,
      this.responseRequested,
      this.metadata,
      this.description,
      this.location,
      this.organizer,
      this.recurrence,
      this.seriesMasterId
    );
  }

  /**
   * Cancels the event
   */
  cancel(): CalendarEventEntity {
    return new CalendarEventEntity(
      this.id,
      this.platformIds,
      this.title,
      this.start,
      this.end,
      this.isAllDay,
      this.attendees,
      this.categories,
      this.showAs,
      this.sensitivity,
      this.importance,
      this.calendarId,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      true, // Mark as cancelled
      this.responseRequested,
      this.metadata,
      this.description,
      this.location,
      this.organizer,
      this.recurrence,
      this.seriesMasterId
    );
  }

  /**
   * Checks if this is a recurring event
   */
  get isRecurring(): boolean {
    return this.recurrence !== undefined;
  }

  /**
   * Checks if this is part of a recurring series
   */
  get isPartOfSeries(): boolean {
    return this.seriesMasterId !== undefined;
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id.toString(),
      platformIds: Object.fromEntries(this.platformIds),
      title: this.title,
      description: this.description,
      start: this.start.toISOString(),
      end: this.end.toISOString(),
      isAllDay: this.isAllDay,
      location: this.location,
      attendees: this.attendees.map(attendee => ({
        ...attendee,
        email: attendee.email.toJSON(),
      })),
      organizer: this.organizer
        ? {
            ...this.organizer,
            email: this.organizer.email.toJSON(),
          }
        : undefined,
      recurrence: this.recurrence,
      categories: this.categories,
      showAs: this.showAs,
      sensitivity: this.sensitivity,
      importance: this.importance,
      calendarId: this.calendarId,
      createdDateTime: this.createdDateTime.toISOString(),
      lastModifiedDateTime: this.lastModifiedDateTime.toISOString(),
      isCancelled: this.isCancelled,
      responseRequested: this.responseRequested,
      seriesMasterId: this.seriesMasterId,
      durationMinutes: this.durationMinutes,
      isRecurring: this.isRecurring,
      isPartOfSeries: this.isPartOfSeries,
      metadata: this.metadata,
    };
  }
}
