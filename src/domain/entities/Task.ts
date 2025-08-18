import { UnifiedId } from '../value-objects/UnifiedId.js';
import { Platform } from '../value-objects/Platform.js';
import { TaskMetadata } from '../value-objects/TaskMetadata.js';

export interface TaskList {
  id: string;
  name: string;
  color?: string;
  isDefault: boolean;
}

export interface Subtask {
  id: string;
  title: string;
  isCompleted: boolean;
  createdDateTime: Date;
  completedDateTime?: Date;
}

export interface TaskReminder {
  reminderDateTime: Date;
  method: 'email' | 'popup' | 'sms';
  isRelative: boolean;
  offsetMinutes?: number  | undefined; // For relative reminders
}

export interface Task {
  readonly id: UnifiedId;
  readonly platformIds: Map<Platform, string>;
  readonly title: string;
  readonly description?: string | undefined;
  readonly status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred';
  readonly importance: 'low' | 'normal' | 'high';
  readonly priority: number  | undefined; // 1-10 scale
  readonly dueDateTime?: Date | undefined;
  readonly startDateTime?: Date | undefined;
  readonly completedDateTime?: Date | undefined;
  readonly categories: string[];
  readonly tags: string[];
  readonly subtasks: Subtask[];
  readonly reminders: TaskReminder[];
  readonly taskListId: string;
  readonly parentTaskId?: string | undefined;
  readonly assignedTo?: string | undefined;
  readonly estimatedHours?: number | undefined;
  readonly actualHours?: number | undefined;
  readonly percentComplete: number;
  readonly createdDateTime: Date;
  readonly lastModifiedDateTime: Date;
  readonly metadata: TaskMetadata;
}

export class TaskEntity implements Task {
  constructor(
    public readonly id: UnifiedId,
    public readonly platformIds: Map<Platform, string>,
    public readonly title: string,
    public readonly status: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred',
    public readonly importance: 'low' | 'normal' | 'high',
    public readonly priority: number,
    public readonly categories: string[],
    public readonly tags: string[],
    public readonly subtasks: Subtask[],
    public readonly reminders: TaskReminder[],
    public readonly taskListId: string,
    public readonly percentComplete: number,
    public readonly createdDateTime: Date,
    public readonly lastModifiedDateTime: Date,
    public readonly metadata: TaskMetadata,
    public readonly description?: string,
    public readonly dueDateTime?: Date,
    public readonly startDateTime?: Date,
    public readonly completedDateTime?: Date,
    public readonly parentTaskId?: string,
    public readonly assignedTo?: string,
    public readonly estimatedHours?: number,
    public readonly actualHours?: number
  ) {
    // Validate priority range
    if (priority < 1 || priority > 10) {
      throw new Error('Priority must be between 1 and 10');
    }
    
    // Validate percent complete
    if (percentComplete < 0 || percentComplete > 100) {
      throw new Error('Percent complete must be between 0 and 100');
    }
  }

  /**
   * Checks if the task is completed
   */
  get isCompleted(): boolean | undefined {
    return this.status === 'completed' && this.percentComplete === 100;
  }

  /**
   * Checks if the task is overdue
   */
  get isOverdue(): boolean | undefined {
    if (!this.dueDateTime || this.isCompleted) {
      return false;
    }
    return new Date() > this.dueDateTime;
  }

  /**
   * Gets the number of days until due (negative if overdue)
   */
  get daysUntilDue(): number | null {
    if (!this.dueDateTime) {
      return null;
    }
    
    const now = new Date();
    const diffTime = this.dueDateTime.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Gets completed subtasks
   */
  get completedSubtasks(): Subtask[] {
    return this.subtasks.filter(subtask => subtask.isCompleted);
  }

  /**
   * Gets pending subtasks
   */
  get pendingSubtasks(): Subtask[] {
    return this.subtasks.filter(subtask => !subtask.isCompleted);
  }

  /**
   * Gets subtask completion percentage
   */
  get subtaskCompletionPercentage(): number | undefined {
    if (this.subtasks.length === 0) {
      return 0;
    }
    return Math.round((this.completedSubtasks.length / this.subtasks.length) * 100);
  }

  /**
   * Checks if this is a parent task (has subtasks)
   */
  get isParentTask(): boolean | undefined {
    return this.subtasks.length > 0;
  }

  /**
   * Checks if this is a subtask (has parent)
   */
  get isSubtask(): boolean | undefined {
    return this.parentTaskId !== undefined;
  }

  /**
   * Gets active reminders (not past)
   */
  get activeReminders(): TaskReminder[] {
    const now = new Date();
    return this.reminders.filter(reminder => reminder.reminderDateTime > now);
  }

  /**
   * Marks the task as completed
   */
  complete(): TaskEntity | undefined {
    return new TaskEntity(
      this.id,
      this.platformIds,
      this.title,
      'completed',
      this.importance,
      this.priority,
      this.categories,
      this.tags,
      this.subtasks,
      this.reminders,
      this.taskListId,
      100, // Set to 100% complete
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.description,
      this.dueDateTime,
      this.startDateTime,
      new Date(), // Set completed date
      this.parentTaskId,
      this.assignedTo,
      this.estimatedHours,
      this.actualHours
    );
  }

  /**
   * Updates the task status
   */
  updateStatus(newStatus: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred'): TaskEntity | undefined {
    const completedDateTime = newStatus === 'completed' ? new Date() : undefined;
    
    const percentComplete = newStatus === 'completed' ? 100 : 
                           (newStatus === 'notStarted' ? 0 : this.percentComplete);

    return new TaskEntity(
      this.id,
      this.platformIds,
      this.title,
      newStatus,
      this.importance,
      this.priority,
      this.categories,
      this.tags,
      this.subtasks,
      this.reminders,
      this.taskListId,
      percentComplete,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.description,
      this.dueDateTime,
      this.startDateTime,
      completedDateTime,
      this.parentTaskId,
      this.assignedTo,
      this.estimatedHours,
      this.actualHours
    );
  }

  /**
   * Updates the percent complete
   */
  updateProgress(percentComplete: number): TaskEntity | undefined {
    if (percentComplete < 0 || percentComplete > 100) {
      throw new Error('Percent complete must be between 0 and 100');
    }

    const newStatus = percentComplete === 100 ? 'completed' : 
                     (percentComplete > 0 ? 'inProgress' : this.status);
    
    const completedDateTime = percentComplete === 100 ? new Date() : 
                            (percentComplete < 100 ? undefined : this.completedDateTime);

    return new TaskEntity(
      this.id,
      this.platformIds,
      this.title,
      newStatus,
      this.importance,
      this.priority,
      this.categories,
      this.tags,
      this.subtasks,
      this.reminders,
      this.taskListId,
      percentComplete,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.description,
      this.dueDateTime,
      this.startDateTime,
      completedDateTime,
      this.parentTaskId,
      this.assignedTo,
      this.estimatedHours,
      this.actualHours
    );
  }

  /**
   * Adds a subtask
   */
  addSubtask(title: string): TaskEntity | undefined {
    const newSubtask: Subtask = {
      id: `subtask_${Date.now()}`,
      title,
      isCompleted: false,
      createdDateTime: new Date()
    };

    const updatedSubtasks = [...this.subtasks, newSubtask];
    
    return new TaskEntity(
      this.id,
      this.platformIds,
      this.title,
      this.status,
      this.importance,
      this.priority,
      this.categories,
      this.tags,
      updatedSubtasks,
      this.reminders,
      this.taskListId,
      this.percentComplete,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.description,
      this.dueDateTime,
      this.startDateTime,
      this.completedDateTime,
      this.parentTaskId,
      this.assignedTo,
      this.estimatedHours,
      this.actualHours
    );
  }

  /**
   * Completes a subtask
   */
  completeSubtask(subtaskId: string): TaskEntity | undefined {
    const updatedSubtasks = this.subtasks.map(subtask =>
      subtask.id === subtaskId 
        ? { ...subtask, isCompleted: true, completedDateTime: new Date() }
        : subtask
    );

    return new TaskEntity(
      this.id,
      this.platformIds,
      this.title,
      this.status,
      this.importance,
      this.priority,
      this.categories,
      this.tags,
      updatedSubtasks,
      this.reminders,
      this.taskListId,
      this.percentComplete,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.description,
      this.dueDateTime,
      this.startDateTime,
      this.completedDateTime,
      this.parentTaskId,
      this.assignedTo,
      this.estimatedHours,
      this.actualHours
    );
  }

  /**
   * Adds tags to the task
   */
  addTags(newTags: string[]): TaskEntity | undefined {
    const updatedTags = [...new Set([...this.tags, ...newTags])];
    
    return new TaskEntity(
      this.id,
      this.platformIds,
      this.title,
      this.status,
      this.importance,
      this.priority,
      this.categories,
      updatedTags,
      this.subtasks,
      this.reminders,
      this.taskListId,
      this.percentComplete,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.description,
      this.dueDateTime,
      this.startDateTime,
      this.completedDateTime,
      this.parentTaskId,
      this.assignedTo,
      this.estimatedHours,
      this.actualHours
    );
  }

  /**
   * Sets the due date
   */
  setDueDate(dueDateTime: Date): TaskEntity | undefined {
    return new TaskEntity(
      this.id,
      this.platformIds,
      this.title,
      this.status,
      this.importance,
      this.priority,
      this.categories,
      this.tags,
      this.subtasks,
      this.reminders,
      this.taskListId,
      this.percentComplete,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.description,
      dueDateTime,
      this.startDateTime,
      this.completedDateTime,
      this.parentTaskId,
      this.assignedTo,
      this.estimatedHours,
      this.actualHours
    );
  }

  /**
   * Adds a reminder
   */
  addReminder(reminder: TaskReminder): TaskEntity | undefined {
    const updatedReminders = [...this.reminders, reminder];
    
    return new TaskEntity(
      this.id,
      this.platformIds,
      this.title,
      this.status,
      this.importance,
      this.priority,
      this.categories,
      this.tags,
      this.subtasks,
      updatedReminders,
      this.taskListId,
      this.percentComplete,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.description,
      this.dueDateTime,
      this.startDateTime,
      this.completedDateTime,
      this.parentTaskId,
      this.assignedTo,
      this.estimatedHours,
      this.actualHours
    );
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
      status: this.status,
      importance: this.importance,
      priority: this.priority,
      dueDateTime: this.dueDateTime?.toISOString(),
      startDateTime: this.startDateTime?.toISOString(),
      completedDateTime: this.completedDateTime?.toISOString(),
      categories: this.categories,
      tags: this.tags,
      subtasks: this.subtasks,
      reminders: this.reminders.map(r => ({
        ...r,
        reminderDateTime: r.reminderDateTime.toISOString()
      })),
      taskListId: this.taskListId,
      parentTaskId: this.parentTaskId,
      assignedTo: this.assignedTo,
      estimatedHours: this.estimatedHours,
      actualHours: this.actualHours,
      percentComplete: this.percentComplete,
      createdDateTime: this.createdDateTime.toISOString(),
      lastModifiedDateTime: this.lastModifiedDateTime.toISOString(),
      isCompleted: this.isCompleted,
      isOverdue: this.isOverdue,
      daysUntilDue: this.daysUntilDue,
      subtaskCompletionPercentage: this.subtaskCompletionPercentage,
      isParentTask: this.isParentTask,
      isSubtask: this.isSubtask,
      activeReminders: this.activeReminders.length,
      metadata: this.metadata
    };
  }
}