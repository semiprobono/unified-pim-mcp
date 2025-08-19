import { Platform } from './Platform.js';

export interface EventMetadata {
  readonly platform: Platform;
  readonly calendarId: string;
  readonly calendarName?: string | undefined;
  readonly eventId: string;
  readonly webLink?: string | undefined;
  readonly changeKey?: string | undefined;
  readonly etag?: string | undefined;
  readonly sequence: number;
  readonly recurringEventId?: string | undefined;
  readonly originalStartTime?: Date | undefined;
  readonly isOnlineMeeting: boolean;
  readonly onlineMeetingProvider?:
    | 'teamsForBusiness'
    | 'skypeForBusiness'
    | 'skypeForConsumer'
    | 'zoom'
    | 'webex'
    | 'other'
    | undefined;
  readonly onlineMeetingUrl?: string | undefined;
  readonly joinInformation?: {
    conferenceId?: string;
    dialInNumber?: string;
    passcode?: string;
    quickDial?: string;
    tollNumber?: string;
    tollFreeNumbers?: string[];
  };
  readonly isPrivate: boolean;
  readonly allowNewTimeProposals: boolean;
  readonly hideAttendees: boolean;
  readonly responseRequested: boolean;
  readonly disallowNewTimeProposals: boolean;
  readonly lastSyncTime: Date;
  readonly customProperties?: Record<string, any> | undefined;
  readonly extensions?: Array<{
    extensionName: string;
    id: string;
    data: Record<string, any>;
  }>;
}

export class EventMetadataImpl implements EventMetadata {
  constructor(
    public readonly platform: Platform,
    public readonly calendarId: string,
    public readonly eventId: string,
    public readonly sequence: number,
    public readonly isOnlineMeeting: boolean,
    public readonly isPrivate: boolean,
    public readonly allowNewTimeProposals: boolean,
    public readonly hideAttendees: boolean,
    public readonly responseRequested: boolean,
    public readonly disallowNewTimeProposals: boolean,
    public readonly lastSyncTime: Date,
    public readonly calendarName?: string,
    public readonly webLink?: string,
    public readonly changeKey?: string,
    public readonly etag?: string,
    public readonly recurringEventId?: string,
    public readonly originalStartTime?: Date,
    public readonly onlineMeetingProvider?:
      | 'teamsForBusiness'
      | 'skypeForBusiness'
      | 'skypeForConsumer'
      | 'zoom'
      | 'webex'
      | 'other',
    public readonly onlineMeetingUrl?: string,
    public readonly joinInformation?: {
      conferenceId?: string;
      dialInNumber?: string;
      passcode?: string;
      quickDial?: string;
      tollNumber?: string;
      tollFreeNumbers?: string[];
    },
    public readonly customProperties?: Record<string, any>,
    public readonly extensions?: Array<{
      extensionName: string;
      id: string;
      data: Record<string, any>;
    }>
  ) {}

  /**
   * Creates minimal metadata for a new event
   */
  static createMinimal(platform: Platform, calendarId: string, eventId: string): EventMetadataImpl {
    return new EventMetadataImpl(
      platform,
      calendarId,
      eventId,
      0, // sequence
      false, // isOnlineMeeting
      false, // isPrivate
      true, // allowNewTimeProposals
      false, // hideAttendees
      true, // responseRequested
      false, // disallowNewTimeProposals
      new Date() // lastSyncTime
    );
  }

  /**
   * Creates metadata for an online meeting
   */
  static createOnlineMeeting(
    platform: Platform,
    calendarId: string,
    eventId: string,
    provider:
      | 'teamsForBusiness'
      | 'skypeForBusiness'
      | 'skypeForConsumer'
      | 'zoom'
      | 'webex'
      | 'other',
    meetingUrl: string
  ): EventMetadataImpl {
    return new EventMetadataImpl(
      platform,
      calendarId,
      eventId,
      0, // sequence
      true, // isOnlineMeeting
      false, // isPrivate
      true, // allowNewTimeProposals
      false, // hideAttendees
      true, // responseRequested
      false, // disallowNewTimeProposals
      new Date(), // lastSyncTime
      undefined, // calendarName
      undefined, // webLink
      undefined, // changeKey
      undefined, // etag
      undefined, // recurringEventId
      undefined, // originalStartTime
      provider,
      meetingUrl
    );
  }

  /**
   * Creates metadata for a recurring event instance
   */
  static createRecurringInstance(
    platform: Platform,
    calendarId: string,
    eventId: string,
    recurringEventId: string,
    originalStartTime: Date,
    sequence: number = 0
  ): EventMetadataImpl {
    return new EventMetadataImpl(
      platform,
      calendarId,
      eventId,
      sequence,
      false, // isOnlineMeeting
      false, // isPrivate
      true, // allowNewTimeProposals
      false, // hideAttendees
      true, // responseRequested
      false, // disallowNewTimeProposals
      new Date(), // lastSyncTime
      undefined, // calendarName
      undefined, // webLink
      undefined, // changeKey
      undefined, // etag
      recurringEventId,
      originalStartTime
    );
  }

  /**
   * Checks if this is a recurring event instance
   */
  get isRecurringInstance(): boolean {
    return this.recurringEventId !== undefined;
  }

  /**
   * Checks if this is a master recurring event
   */
  get isRecurringMaster(): boolean {
    return this.recurringEventId === this.eventId;
  }

  /**
   * Checks if attendee responses are hidden
   */
  get areAttendeesHidden(): boolean {
    return this.hideAttendees;
  }

  /**
   * Gets time since last sync
   */
  get timeSinceSync(): number {
    return Date.now() - this.lastSyncTime.getTime();
  }

  /**
   * Checks if sync is stale (more than 15 minutes old for events)
   */
  get isSyncStale(): boolean {
    return this.timeSinceSync > 15 * 60 * 1000; // 15 minutes
  }

  /**
   * Gets the meeting provider display name
   */
  get meetingProviderName(): string {
    if (!this.onlineMeetingProvider) return 'No Online Meeting';

    const providerNames = {
      teamsForBusiness: 'Microsoft Teams',
      skypeForBusiness: 'Skype for Business',
      skypeForConsumer: 'Skype',
      zoom: 'Zoom',
      webex: 'Webex',
      other: 'Online Meeting',
    };

    return providerNames[this.onlineMeetingProvider];
  }

  /**
   * Checks if this event supports time proposals
   */
  get supportsTimeProposals(): boolean {
    return this.allowNewTimeProposals && !this.disallowNewTimeProposals;
  }

  /**
   * Updates the last sync time
   */
  withUpdatedSync(): EventMetadataImpl {
    return new EventMetadataImpl(
      this.platform,
      this.calendarId,
      this.eventId,
      this.sequence,
      this.isOnlineMeeting,
      this.isPrivate,
      this.allowNewTimeProposals,
      this.hideAttendees,
      this.responseRequested,
      this.disallowNewTimeProposals,
      new Date(), // Update sync time
      this.calendarName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.recurringEventId,
      this.originalStartTime,
      this.onlineMeetingProvider,
      this.onlineMeetingUrl,
      this.joinInformation,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Increments the sequence number (for updates)
   */
  withIncrementedSequence(): EventMetadataImpl {
    return new EventMetadataImpl(
      this.platform,
      this.calendarId,
      this.eventId,
      this.sequence + 1,
      this.isOnlineMeeting,
      this.isPrivate,
      this.allowNewTimeProposals,
      this.hideAttendees,
      this.responseRequested,
      this.disallowNewTimeProposals,
      new Date(), // Update sync time
      this.calendarName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.recurringEventId,
      this.originalStartTime,
      this.onlineMeetingProvider,
      this.onlineMeetingUrl,
      this.joinInformation,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates online meeting information
   */
  withOnlineMeeting(
    provider:
      | 'teamsForBusiness'
      | 'skypeForBusiness'
      | 'skypeForConsumer'
      | 'zoom'
      | 'webex'
      | 'other',
    url: string,
    joinInfo?: {
      conferenceId?: string;
      dialInNumber?: string;
      passcode?: string;
      quickDial?: string;
      tollNumber?: string;
      tollFreeNumbers?: string[];
    }
  ): EventMetadataImpl {
    return new EventMetadataImpl(
      this.platform,
      this.calendarId,
      this.eventId,
      this.sequence,
      true, // isOnlineMeeting
      this.isPrivate,
      this.allowNewTimeProposals,
      this.hideAttendees,
      this.responseRequested,
      this.disallowNewTimeProposals,
      new Date(), // Update sync time
      this.calendarName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.recurringEventId,
      this.originalStartTime,
      provider,
      url,
      joinInfo,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Removes online meeting information
   */
  withoutOnlineMeeting(): EventMetadataImpl {
    return new EventMetadataImpl(
      this.platform,
      this.calendarId,
      this.eventId,
      this.sequence,
      false, // isOnlineMeeting
      this.isPrivate,
      this.allowNewTimeProposals,
      this.hideAttendees,
      this.responseRequested,
      this.disallowNewTimeProposals,
      new Date(), // Update sync time
      this.calendarName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.recurringEventId,
      this.originalStartTime,
      undefined, // onlineMeetingProvider
      undefined, // onlineMeetingUrl
      undefined, // joinInformation
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates privacy setting
   */
  withPrivacy(isPrivate: boolean): EventMetadataImpl {
    return new EventMetadataImpl(
      this.platform,
      this.calendarId,
      this.eventId,
      this.sequence,
      this.isOnlineMeeting,
      isPrivate,
      this.allowNewTimeProposals,
      this.hideAttendees,
      this.responseRequested,
      this.disallowNewTimeProposals,
      this.lastSyncTime,
      this.calendarName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.recurringEventId,
      this.originalStartTime,
      this.onlineMeetingProvider,
      this.onlineMeetingUrl,
      this.joinInformation,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Adds custom property
   */
  withCustomProperty(key: string, value: any): EventMetadataImpl {
    const newCustomProperties = {
      ...this.customProperties,
      [key]: value,
    };

    return new EventMetadataImpl(
      this.platform,
      this.calendarId,
      this.eventId,
      this.sequence,
      this.isOnlineMeeting,
      this.isPrivate,
      this.allowNewTimeProposals,
      this.hideAttendees,
      this.responseRequested,
      this.disallowNewTimeProposals,
      this.lastSyncTime,
      this.calendarName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.recurringEventId,
      this.originalStartTime,
      this.onlineMeetingProvider,
      this.onlineMeetingUrl,
      this.joinInformation,
      newCustomProperties,
      this.extensions
    );
  }

  /**
   * Adds extension
   */
  withExtension(extensionName: string, id: string, data: Record<string, any>): EventMetadataImpl {
    const newExtensions = [...(this.extensions || []), { extensionName, id, data }];

    return new EventMetadataImpl(
      this.platform,
      this.calendarId,
      this.eventId,
      this.sequence,
      this.isOnlineMeeting,
      this.isPrivate,
      this.allowNewTimeProposals,
      this.hideAttendees,
      this.responseRequested,
      this.disallowNewTimeProposals,
      this.lastSyncTime,
      this.calendarName,
      this.webLink,
      this.changeKey,
      this.etag,
      this.recurringEventId,
      this.originalStartTime,
      this.onlineMeetingProvider,
      this.onlineMeetingUrl,
      this.joinInformation,
      this.customProperties,
      newExtensions
    );
  }

  /**
   * Gets specific extension data
   */
  getExtension(extensionName: string, id: string): Record<string, any> | undefined {
    return this.extensions?.find(ext => ext.extensionName === extensionName && ext.id === id)?.data;
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      platform: this.platform,
      calendarId: this.calendarId,
      calendarName: this.calendarName,
      eventId: this.eventId,
      webLink: this.webLink,
      changeKey: this.changeKey,
      etag: this.etag,
      sequence: this.sequence,
      recurringEventId: this.recurringEventId,
      originalStartTime: this.originalStartTime?.toISOString(),
      isOnlineMeeting: this.isOnlineMeeting,
      onlineMeetingProvider: this.onlineMeetingProvider,
      onlineMeetingUrl: this.onlineMeetingUrl,
      meetingProviderName: this.meetingProviderName,
      joinInformation: this.joinInformation,
      isPrivate: this.isPrivate,
      allowNewTimeProposals: this.allowNewTimeProposals,
      hideAttendees: this.hideAttendees,
      responseRequested: this.responseRequested,
      disallowNewTimeProposals: this.disallowNewTimeProposals,
      supportsTimeProposals: this.supportsTimeProposals,
      isRecurringInstance: this.isRecurringInstance,
      isRecurringMaster: this.isRecurringMaster,
      areAttendeesHidden: this.areAttendeesHidden,
      lastSyncTime: this.lastSyncTime.toISOString(),
      timeSinceSync: this.timeSinceSync,
      isSyncStale: this.isSyncStale,
      customProperties: this.customProperties,
      extensions: this.extensions,
    };
  }

  /**
   * Creates metadata from JSON object
   */
  static fromJSON(json: any): EventMetadataImpl {
    return new EventMetadataImpl(
      json.platform,
      json.calendarId,
      json.eventId,
      json.sequence,
      json.isOnlineMeeting,
      json.isPrivate,
      json.allowNewTimeProposals,
      json.hideAttendees,
      json.responseRequested,
      json.disallowNewTimeProposals,
      new Date(json.lastSyncTime),
      json.calendarName,
      json.webLink,
      json.changeKey,
      json.etag,
      json.recurringEventId,
      json.originalStartTime ? new Date(json.originalStartTime) : undefined,
      json.onlineMeetingProvider,
      json.onlineMeetingUrl,
      json.joinInformation,
      json.customProperties,
      json.extensions
    );
  }
}
