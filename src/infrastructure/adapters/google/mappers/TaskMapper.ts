import { Task, TaskEntity, Subtask, TaskReminder } from '../../../../domain/entities/Task.js';
import { UnifiedId } from '../../../../domain/value-objects/UnifiedId.js';
import { TaskMetadataImpl } from '../../../../domain/value-objects/TaskMetadata.js';

/**
 * Maps Microsoft Graph To Do tasks to domain Task entities
 */
export class TaskMapper {
  /**
   * Map Microsoft Graph todoTask to domain Task entity
   */
  static fromGraphTask(graphTask: any, listId: string): Task {
    // Create unified ID
    const unifiedId = UnifiedId.create('microsoft', 'task');
    const platformIds = new Map();
    platformIds.set('microsoft', graphTask.id);

    // Map status
    const status = this.mapStatus(graphTask.status);

    // Map importance
    const importance = this.mapImportance(graphTask.importance);

    // Map dates
    const dueDateTime = graphTask.dueDateTime 
      ? new Date(graphTask.dueDateTime.dateTime)
      : undefined;

    const startDateTime = graphTask.startDateTime
      ? new Date(graphTask.startDateTime.dateTime)
      : undefined;

    const completedDateTime = graphTask.completedDateTime
      ? new Date(graphTask.completedDateTime.dateTime)
      : undefined;

    // Map reminders
    const reminders: TaskReminder[] = [];
    if (graphTask.reminderDateTime) {
      reminders.push({
        reminderDateTime: new Date(graphTask.reminderDateTime.dateTime),
        method: 'popup',
        isRelative: false
      });
    }

    // Map subtasks (checklistItems in Graph API)
    const subtasks: Subtask[] = [];
    if (graphTask.checklistItems && Array.isArray(graphTask.checklistItems)) {
      for (const item of graphTask.checklistItems) {
        subtasks.push({
          id: item.id,
          title: item.displayName,
          isCompleted: item.isChecked || false,
          createdDateTime: item.createdDateTime ? new Date(item.createdDateTime) : new Date(),
          completedDateTime: item.checkedDateTime ? new Date(item.checkedDateTime) : undefined
        });
      }
    }

    // Calculate percent complete
    const percentComplete = graphTask.percentComplete || (status === 'completed' ? 100 : 0);

    // Create metadata
    const metadata = TaskMetadataImpl.createMinimal(
      'microsoft',
      graphTask.id,
      listId,
      'user'
    );

    // Map priority (Graph API doesn't have direct priority, derive from importance)
    const priority = this.mapPriority(importance);

    // Create task entity
    return new TaskEntity(
      unifiedId,
      platformIds,
      graphTask.title || 'Untitled Task',
      status,
      importance,
      priority,
      graphTask.categories || [],
      [], // Tags not directly supported in Graph API
      subtasks,
      reminders,
      listId,
      percentComplete,
      new Date(graphTask.createdDateTime),
      new Date(graphTask.lastModifiedDateTime),
      metadata,
      graphTask.body?.content,
      dueDateTime,
      startDateTime,
      completedDateTime,
      undefined, // parentTaskId not directly supported
      undefined, // assignedTo not directly supported in personal tasks
      undefined, // estimatedHours not supported
      undefined  // actualHours not supported
    );
  }

  /**
   * Map domain Task to Graph API format
   */
  static toGraphTask(task: Task): any {
    const graphTask: any = {
      title: task.title,
      status: this.mapStatusToGraph(task.status),
      importance: this.mapImportanceToGraph(task.importance),
      categories: task.categories
    };

    // Add body if present
    if (task.description) {
      graphTask.body = {
        content: task.description,
        contentType: 'text'
      };
    }

    // Add dates
    if (task.dueDateTime) {
      graphTask.dueDateTime = {
        dateTime: task.dueDateTime.toISOString(),
        timeZone: 'UTC'
      };
    }

    if (task.startDateTime) {
      graphTask.startDateTime = {
        dateTime: task.startDateTime.toISOString(),
        timeZone: 'UTC'
      };
    }

    if (task.completedDateTime) {
      graphTask.completedDateTime = {
        dateTime: task.completedDateTime.toISOString(),
        timeZone: 'UTC'
      };
    }

    // Add reminder if present
    if (task.reminders.length > 0) {
      const firstReminder = task.reminders[0];
      graphTask.reminderDateTime = {
        dateTime: firstReminder.reminderDateTime.toISOString(),
        timeZone: 'UTC'
      };
      graphTask.isReminderOn = true;
    }

    // Add percent complete
    graphTask.percentComplete = task.percentComplete;

    return graphTask;
  }

  /**
   * Map Graph API status to domain status
   */
  private static mapStatus(graphStatus: string): 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred' {
    switch (graphStatus?.toLowerCase()) {
      case 'notstarted':
        return 'notStarted';
      case 'inprogress':
        return 'inProgress';
      case 'completed':
        return 'completed';
      case 'waitingonothers':
        return 'waitingOnOthers';
      case 'deferred':
        return 'deferred';
      default:
        return 'notStarted';
    }
  }

  /**
   * Map domain status to Graph API status
   */
  private static mapStatusToGraph(status: string): string {
    switch (status) {
      case 'notStarted':
        return 'notStarted';
      case 'inProgress':
        return 'inProgress';
      case 'completed':
        return 'completed';
      case 'waitingOnOthers':
        return 'waitingOnOthers';
      case 'deferred':
        return 'deferred';
      default:
        return 'notStarted';
    }
  }

  /**
   * Map Graph API importance to domain importance
   */
  private static mapImportance(graphImportance: string): 'low' | 'normal' | 'high' {
    switch (graphImportance?.toLowerCase()) {
      case 'low':
        return 'low';
      case 'high':
        return 'high';
      case 'normal':
      default:
        return 'normal';
    }
  }

  /**
   * Map domain importance to Graph API importance
   */
  private static mapImportanceToGraph(importance: string): string {
    switch (importance) {
      case 'low':
        return 'low';
      case 'high':
        return 'high';
      case 'normal':
      default:
        return 'normal';
    }
  }

  /**
   * Map importance to priority (1-10 scale)
   */
  private static mapPriority(importance: 'low' | 'normal' | 'high'): number {
    switch (importance) {
      case 'low':
        return 7;
      case 'normal':
        return 5;
      case 'high':
        return 2;
      default:
        return 5;
    }
  }

  /**
   * Create a partial update object for Graph API
   */
  static toGraphUpdate(updates: Partial<Task>): any {
    const graphUpdate: any = {};

    if (updates.title !== undefined) {
      graphUpdate.title = updates.title;
    }

    if (updates.description !== undefined) {
      graphUpdate.body = {
        content: updates.description,
        contentType: 'text'
      };
    }

    if (updates.status !== undefined) {
      graphUpdate.status = this.mapStatusToGraph(updates.status);
    }

    if (updates.importance !== undefined) {
      graphUpdate.importance = this.mapImportanceToGraph(updates.importance);
    }

    if (updates.dueDateTime !== undefined) {
      graphUpdate.dueDateTime = updates.dueDateTime ? {
        dateTime: updates.dueDateTime.toISOString(),
        timeZone: 'UTC'
      } : null;
    }

    if (updates.startDateTime !== undefined) {
      graphUpdate.startDateTime = updates.startDateTime ? {
        dateTime: updates.startDateTime.toISOString(),
        timeZone: 'UTC'
      } : null;
    }

    if (updates.percentComplete !== undefined) {
      graphUpdate.percentComplete = updates.percentComplete;
    }

    if (updates.categories !== undefined) {
      graphUpdate.categories = updates.categories;
    }

    return graphUpdate;
  }
}