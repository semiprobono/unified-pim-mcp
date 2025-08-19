import { Platform } from './Platform.js';

export interface TaskMetadata {
  readonly platform: Platform;
  readonly taskId: string;
  readonly taskListId: string;
  readonly taskListName?: string | undefined;
  readonly parentTaskId?: string | undefined;
  readonly webLink?: string | undefined;
  readonly changeKey?: string | undefined;
  readonly etag?: string | undefined;
  readonly position?: string | undefined; // For ordering tasks
  readonly isHidden: boolean;
  readonly hasSubtasks: boolean;
  readonly completedSubtasks: number;
  readonly totalSubtasks: number;
  readonly createdBy?: string | undefined;
  readonly lastModifiedBy?: string | undefined;
  readonly assignedBy?: string | undefined;
  readonly creationTime: Date;
  readonly lastModifiedTime: Date;
  readonly lastSyncTime: Date;
  readonly isReadOnly: boolean;
  readonly source: 'user' | 'imported' | 'template' | 'recurring' | 'system';
  readonly recurrence?: {
    pattern: 'daily' | 'weekly' | 'monthly' | 'yearly';
    interval: number;
    endDate?: Date;
    count?: number;
  };
  readonly timeTracking?: {
    estimatedMinutes?: number;
    actualMinutes?: number;
    lastTrackedDate?: Date;
    trackingEntries?: Array<{
      date: Date;
      minutes: number;
      description?: string | undefined;
    }>;
  };
  readonly customProperties?: Record<string, any> | undefined;
  readonly extensions?: Array<{
    extensionName: string;
    id: string;
    data: Record<string, any>;
  }>;
}

export class TaskMetadataImpl implements TaskMetadata {
  constructor(
    public readonly platform: Platform,
    public readonly taskId: string,
    public readonly taskListId: string,
    public readonly isHidden: boolean,
    public readonly hasSubtasks: boolean,
    public readonly completedSubtasks: number,
    public readonly totalSubtasks: number,
    public readonly creationTime: Date,
    public readonly lastModifiedTime: Date,
    public readonly lastSyncTime: Date,
    public readonly isReadOnly: boolean,
    public readonly source: 'user' | 'imported' | 'template' | 'recurring' | 'system',
    public readonly taskListName?: string,
    public readonly parentTaskId?: string,
    public readonly webLink?: string,
    public readonly changeKey?: string,
    public readonly etag?: string,
    public readonly position?: string,
    public readonly createdBy?: string,
    public readonly lastModifiedBy?: string,
    public readonly assignedBy?: string,
    public readonly recurrence?: {
      pattern: 'daily' | 'weekly' | 'monthly' | 'yearly';
      interval: number;
      endDate?: Date;
      count?: number;
    },
    public readonly timeTracking?: {
      estimatedMinutes?: number;
      actualMinutes?: number;
      lastTrackedDate?: Date;
      trackingEntries?: Array<{
        date: Date;
        minutes: number;
        description?: string | undefined;
      }>;
    },
    public readonly customProperties?: Record<string, any>,
    public readonly extensions?: Array<{
      extensionName: string;
      id: string;
      data: Record<string, any>;
    }>
  ) {}

  /**
   * Creates minimal metadata for a new task
   */
  static createMinimal(
    platform: Platform,
    taskId: string,
    taskListId: string,
    source: 'user' | 'imported' | 'template' | 'recurring' | 'system' = 'user'
  ): TaskMetadataImpl {
    const now = new Date();
    return new TaskMetadataImpl(
      platform,
      taskId,
      taskListId,
      false, // isHidden
      false, // hasSubtasks
      0, // completedSubtasks
      0, // totalSubtasks
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      false, // isReadOnly
      source
    );
  }

  /**
   * Creates metadata for a recurring task
   */
  static createRecurring(
    platform: Platform,
    taskId: string,
    taskListId: string,
    recurrencePattern: 'daily' | 'weekly' | 'monthly' | 'yearly',
    interval: number = 1,
    endDate?: Date,
    count?: number
  ): TaskMetadataImpl {
    const now = new Date();
    return new TaskMetadataImpl(
      platform,
      taskId,
      taskListId,
      false, // isHidden
      false, // hasSubtasks
      0, // completedSubtasks
      0, // totalSubtasks
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      false, // isReadOnly
      'recurring',
      undefined, // taskListName
      undefined, // parentTaskId
      undefined, // webLink
      undefined, // changeKey
      undefined, // etag
      undefined, // position
      undefined, // createdBy
      undefined, // lastModifiedBy
      undefined, // assignedBy
      {
        pattern: recurrencePattern,
        interval,
        endDate,
        count,
      }
    );
  }

  /**
   * Creates metadata for a subtask
   */
  static createSubtask(
    platform: Platform,
    taskId: string,
    taskListId: string,
    parentTaskId: string
  ): TaskMetadataImpl {
    const now = new Date();
    return new TaskMetadataImpl(
      platform,
      taskId,
      taskListId,
      false, // isHidden
      false, // hasSubtasks (subtasks don't have their own subtasks in this model)
      0, // completedSubtasks
      0, // totalSubtasks
      now, // creationTime
      now, // lastModifiedTime
      now, // lastSyncTime
      false, // isReadOnly
      'user',
      undefined, // taskListName
      parentTaskId
    );
  }

  /**
   * Checks if this is a subtask
   */
  get isSubtask(): boolean {
    return this.parentTaskId !== undefined;
  }

  /**
   * Checks if this is a parent task
   */
  get isParentTask(): boolean {
    return this.hasSubtasks && !this.isSubtask;
  }

  /**
   * Checks if this is a recurring task
   */
  get isRecurring(): boolean {
    return this.recurrence !== undefined;
  }

  /**
   * Gets subtask completion percentage
   */
  get subtaskCompletionPercentage(): number {
    if (this.totalSubtasks === 0) return 0;
    return Math.round((this.completedSubtasks / this.totalSubtasks) * 100);
  }

  /**
   * Gets pending subtasks count
   */
  get pendingSubtasks(): number {
    return this.totalSubtasks - this.completedSubtasks;
  }

  /**
   * Checks if all subtasks are completed
   */
  get allSubtasksCompleted(): boolean {
    return this.totalSubtasks > 0 && this.completedSubtasks === this.totalSubtasks;
  }

  /**
   * Gets time since last sync
   */
  get timeSinceSync(): number {
    return Date.now() - this.lastSyncTime.getTime();
  }

  /**
   * Checks if sync is stale (more than 30 minutes old for tasks)
   */
  get isSyncStale(): boolean {
    return this.timeSinceSync > 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Gets time since last modification
   */
  get timeSinceModified(): number {
    return Date.now() - this.lastModifiedTime.getTime();
  }

  /**
   * Checks if task was recently modified (within last 10 minutes)
   */
  get isRecentlyModified(): boolean {
    return this.timeSinceModified < 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Checks if this is a user-created task
   */
  get isUserCreated(): boolean {
    return this.source === 'user';
  }

  /**
   * Checks if this is a system-generated task
   */
  get isSystemGenerated(): boolean {
    return this.source === 'system';
  }

  /**
   * Gets estimated time in human-readable format
   */
  get estimatedTimeFormatted(): string {
    if (!this.timeTracking?.estimatedMinutes) return 'Not estimated';

    const hours = Math.floor(this.timeTracking.estimatedMinutes / 60);
    const minutes = this.timeTracking.estimatedMinutes % 60;

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Gets actual time in human-readable format
   */
  get actualTimeFormatted(): string {
    if (!this.timeTracking?.actualMinutes) return 'No time logged';

    const hours = Math.floor(this.timeTracking.actualMinutes / 60);
    const minutes = this.timeTracking.actualMinutes % 60;

    if (hours > 0 && minutes > 0) {
      return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h`;
    } else {
      return `${minutes}m`;
    }
  }

  /**
   * Checks if task is over time estimate
   */
  get isOverEstimate(): boolean {
    if (!this.timeTracking?.estimatedMinutes || !this.timeTracking?.actualMinutes) {
      return false;
    }
    return this.timeTracking.actualMinutes > this.timeTracking.estimatedMinutes;
  }

  /**
   * Gets time variance (actual - estimated)
   */
  get timeVariance(): number {
    if (!this.timeTracking?.estimatedMinutes || !this.timeTracking?.actualMinutes) {
      return 0;
    }
    return this.timeTracking.actualMinutes - this.timeTracking.estimatedMinutes;
  }

  /**
   * Updates the last sync time
   */
  withUpdatedSync(): TaskMetadataImpl {
    return new TaskMetadataImpl(
      this.platform,
      this.taskId,
      this.taskListId,
      this.isHidden,
      this.hasSubtasks,
      this.completedSubtasks,
      this.totalSubtasks,
      this.creationTime,
      this.lastModifiedTime,
      new Date(), // Update sync time
      this.isReadOnly,
      this.source,
      this.taskListName,
      this.parentTaskId,
      this.webLink,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      this.assignedBy,
      this.recurrence,
      this.timeTracking,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates subtask counts
   */
  withSubtaskCounts(completed: number, total: number): TaskMetadataImpl {
    return new TaskMetadataImpl(
      this.platform,
      this.taskId,
      this.taskListId,
      this.isHidden,
      total > 0, // hasSubtasks
      completed,
      total,
      this.creationTime,
      new Date(), // Update modified time
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.taskListName,
      this.parentTaskId,
      this.webLink,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      this.assignedBy,
      this.recurrence,
      this.timeTracking,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Updates time tracking information
   */
  withTimeTracking(timeTracking: {
    estimatedMinutes?: number;
    actualMinutes?: number;
    lastTrackedDate?: Date;
    trackingEntries?: Array<{
      date: Date;
      minutes: number;
      description?: string | undefined;
    }>;
  }): TaskMetadataImpl {
    return new TaskMetadataImpl(
      this.platform,
      this.taskId,
      this.taskListId,
      this.isHidden,
      this.hasSubtasks,
      this.completedSubtasks,
      this.totalSubtasks,
      this.creationTime,
      new Date(), // Update modified time
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.taskListName,
      this.parentTaskId,
      this.webLink,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      this.assignedBy,
      this.recurrence,
      timeTracking,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Adds time tracking entry
   */
  withTimeEntry(minutes: number, description?: string): TaskMetadataImpl {
    const currentTracking = this.timeTracking || {};
    const currentEntries = currentTracking.trackingEntries || [];

    const newEntry = {
      date: new Date(),
      minutes,
      description,
    };

    const newTimeTracking = {
      ...currentTracking,
      actualMinutes: (currentTracking.actualMinutes || 0) + minutes,
      lastTrackedDate: new Date(),
      trackingEntries: [...currentEntries, newEntry],
    };

    return this.withTimeTracking(newTimeTracking);
  }

  /**
   * Updates visibility
   */
  withVisibility(isHidden: boolean): TaskMetadataImpl {
    return new TaskMetadataImpl(
      this.platform,
      this.taskId,
      this.taskListId,
      isHidden,
      this.hasSubtasks,
      this.completedSubtasks,
      this.totalSubtasks,
      this.creationTime,
      new Date(), // Update modified time
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.taskListName,
      this.parentTaskId,
      this.webLink,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      this.assignedBy,
      this.recurrence,
      this.timeTracking,
      this.customProperties,
      this.extensions
    );
  }

  /**
   * Adds custom property
   */
  withCustomProperty(key: string, value: any): TaskMetadataImpl {
    const newCustomProperties = {
      ...this.customProperties,
      [key]: value,
    };

    return new TaskMetadataImpl(
      this.platform,
      this.taskId,
      this.taskListId,
      this.isHidden,
      this.hasSubtasks,
      this.completedSubtasks,
      this.totalSubtasks,
      this.creationTime,
      this.lastModifiedTime,
      this.lastSyncTime,
      this.isReadOnly,
      this.source,
      this.taskListName,
      this.parentTaskId,
      this.webLink,
      this.changeKey,
      this.etag,
      this.position,
      this.createdBy,
      this.lastModifiedBy,
      this.assignedBy,
      this.recurrence,
      this.timeTracking,
      newCustomProperties,
      this.extensions
    );
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      platform: this.platform,
      taskId: this.taskId,
      taskListId: this.taskListId,
      taskListName: this.taskListName,
      parentTaskId: this.parentTaskId,
      webLink: this.webLink,
      changeKey: this.changeKey,
      etag: this.etag,
      position: this.position,
      isHidden: this.isHidden,
      hasSubtasks: this.hasSubtasks,
      completedSubtasks: this.completedSubtasks,
      totalSubtasks: this.totalSubtasks,
      subtaskCompletionPercentage: this.subtaskCompletionPercentage,
      pendingSubtasks: this.pendingSubtasks,
      allSubtasksCompleted: this.allSubtasksCompleted,
      createdBy: this.createdBy,
      lastModifiedBy: this.lastModifiedBy,
      assignedBy: this.assignedBy,
      creationTime: this.creationTime.toISOString(),
      lastModifiedTime: this.lastModifiedTime.toISOString(),
      lastSyncTime: this.lastSyncTime.toISOString(),
      timeSinceSync: this.timeSinceSync,
      isSyncStale: this.isSyncStale,
      timeSinceModified: this.timeSinceModified,
      isRecentlyModified: this.isRecentlyModified,
      isReadOnly: this.isReadOnly,
      source: this.source,
      isSubtask: this.isSubtask,
      isParentTask: this.isParentTask,
      isRecurring: this.isRecurring,
      isUserCreated: this.isUserCreated,
      isSystemGenerated: this.isSystemGenerated,
      recurrence: this.recurrence
        ? {
            ...this.recurrence,
            endDate: this.recurrence.endDate?.toISOString(),
          }
        : undefined,
      timeTracking: this.timeTracking
        ? {
            ...this.timeTracking,
            lastTrackedDate: this.timeTracking.lastTrackedDate?.toISOString(),
            trackingEntries: this.timeTracking.trackingEntries?.map(entry => ({
              ...entry,
              date: entry.date.toISOString(),
            })),
          }
        : undefined,
      estimatedTimeFormatted: this.estimatedTimeFormatted,
      actualTimeFormatted: this.actualTimeFormatted,
      isOverEstimate: this.isOverEstimate,
      timeVariance: this.timeVariance,
      customProperties: this.customProperties,
      extensions: this.extensions,
    };
  }

  /**
   * Creates metadata from JSON object
   */
  static fromJSON(json: any): TaskMetadataImpl {
    return new TaskMetadataImpl(
      json.platform,
      json.taskId,
      json.taskListId,
      json.isHidden,
      json.hasSubtasks,
      json.completedSubtasks,
      json.totalSubtasks,
      new Date(json.creationTime),
      new Date(json.lastModifiedTime),
      new Date(json.lastSyncTime),
      json.isReadOnly,
      json.source,
      json.taskListName,
      json.parentTaskId,
      json.webLink,
      json.changeKey,
      json.etag,
      json.position,
      json.createdBy,
      json.lastModifiedBy,
      json.assignedBy,
      json.recurrence
        ? {
            ...json.recurrence,
            endDate: json.recurrence.endDate ? new Date(json.recurrence.endDate) : undefined,
          }
        : undefined,
      json.timeTracking
        ? {
            ...json.timeTracking,
            lastTrackedDate: json.timeTracking.lastTrackedDate
              ? new Date(json.timeTracking.lastTrackedDate)
              : undefined,
            trackingEntries: json.timeTracking.trackingEntries?.map((entry: any) => ({
              ...entry,
              date: new Date(entry.date),
            })),
          }
        : undefined,
      json.customProperties,
      json.extensions
    );
  }
}
