import { describe, expect, it } from '@jest/globals';
import { TaskMapper } from '../../../../../src/infrastructure/adapters/microsoft/mappers/TaskMapper';
import { Task, Subtask, TaskReminder } from '../../../../../src/domain/entities/Task';

describe('TaskMapper', () => {
  describe('fromGraphTask', () => {
    it('should map basic Graph task to domain Task', () => {
      const graphTask = {
        id: 'graph-task-123',
        title: 'Complete project',
        body: {
          content: 'Finish the quarterly project',
          contentType: 'text'
        },
        status: 'notStarted',
        importance: 'normal',
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z'
      };

      const result = TaskMapper.fromGraphTask(graphTask, 'list-123');

      expect(result).toBeDefined();
      expect(result.title).toBe('Complete project');
      expect(result.description).toBe('Finish the quarterly project');
      expect(result.status).toBe('notStarted');
      expect(result.importance).toBe('normal');
      expect(result.taskListId).toBe('list-123');
      expect(result.createdDateTime).toEqual(new Date('2024-01-01T10:00:00Z'));
      expect(result.lastModifiedDateTime).toEqual(new Date('2024-01-01T12:00:00Z'));
    });

    it('should map Graph task with due date and start date', () => {
      const graphTask = {
        id: 'task-with-dates',
        title: 'Scheduled task',
        body: { content: 'Task with dates', contentType: 'text' },
        status: 'inProgress',
        importance: 'high',
        dueDateTime: {
          dateTime: '2024-12-31T23:59:00.0000000',
          timeZone: 'UTC'
        },
        startDateTime: {
          dateTime: '2024-01-01T09:00:00.0000000',
          timeZone: 'UTC'
        },
        isReminderOn: false,
        createdDateTime: '2024-01-01T08:00:00Z',
        lastModifiedDateTime: '2024-01-01T08:00:00Z'
      };

      const result = TaskMapper.fromGraphTask(graphTask, 'list-456');

      expect(result.status).toBe('inProgress');
      expect(result.importance).toBe('high');
      expect(result.dueDateTime).toEqual(new Date('2024-12-31T23:59:00.0000000'));
      expect(result.startDateTime).toEqual(new Date('2024-01-01T09:00:00.0000000'));
    });

    it('should map Graph task with completed status and date', () => {
      const graphTask = {
        id: 'completed-task',
        title: 'Finished task',
        body: { content: 'This task is done', contentType: 'text' },
        status: 'completed',
        importance: 'normal',
        completedDateTime: {
          dateTime: '2024-01-15T14:30:00.0000000',
          timeZone: 'UTC'
        },
        percentComplete: 100,
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-15T14:30:00Z'
      };

      const result = TaskMapper.fromGraphTask(graphTask, 'list-789');

      expect(result.status).toBe('completed');
      expect(result.completedDateTime).toEqual(new Date('2024-01-15T14:30:00.0000000'));
      expect(result.percentComplete).toBe(100);
    });

    it('should map Graph task with reminder', () => {
      const graphTask = {
        id: 'task-with-reminder',
        title: 'Important reminder task',
        body: { content: 'Don\'t forget this', contentType: 'text' },
        status: 'notStarted',
        importance: 'high',
        isReminderOn: true,
        reminderDateTime: {
          dateTime: '2024-06-15T09:00:00.0000000',
          timeZone: 'UTC'
        },
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z'
      };

      const result = TaskMapper.fromGraphTask(graphTask, 'list-reminder');

      expect(result.reminders).toHaveLength(1);
      expect(result.reminders[0].reminderDateTime).toEqual(new Date('2024-06-15T09:00:00.0000000'));
      expect(result.reminders[0].method).toBe('popup');
      expect(result.reminders[0].isRelative).toBe(false);
    });

    it('should map Graph task with subtasks (checklistItems)', () => {
      const graphTask = {
        id: 'task-with-subtasks',
        title: 'Project with steps',
        body: { content: 'Multi-step project', contentType: 'text' },
        status: 'inProgress',
        importance: 'normal',
        checklistItems: [
          {
            id: 'subtask-1',
            displayName: 'Step 1: Planning',
            isChecked: true,
            createdDateTime: '2024-01-01T10:00:00Z'
          },
          {
            id: 'subtask-2',
            displayName: 'Step 2: Implementation',
            isChecked: false,
            createdDateTime: '2024-01-01T11:00:00Z'
          },
          {
            id: 'subtask-3',
            displayName: 'Step 3: Testing',
            isChecked: false,
            createdDateTime: '2024-01-01T12:00:00Z'
          }
        ],
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z'
      };

      const result = TaskMapper.fromGraphTask(graphTask, 'list-project');

      expect(result.subtasks).toHaveLength(3);
      expect(result.subtasks[0].title).toBe('Step 1: Planning');
      expect(result.subtasks[0].isCompleted).toBe(true);
      expect(result.subtasks[1].title).toBe('Step 2: Implementation');
      expect(result.subtasks[1].isCompleted).toBe(false);
      expect(result.subtasks[2].title).toBe('Step 3: Testing');
      expect(result.subtasks[2].isCompleted).toBe(false);
    });

    it('should map Graph task with categories', () => {
      const graphTask = {
        id: 'task-with-categories',
        title: 'Categorized task',
        body: { content: 'Task with multiple categories', contentType: 'text' },
        status: 'notStarted',
        importance: 'normal',
        categories: ['Work', 'Project', 'Urgent'],
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z'
      };

      const result = TaskMapper.fromGraphTask(graphTask, 'list-categories');

      expect(result.categories).toEqual(['Work', 'Project', 'Urgent']);
      expect(result.tags).toEqual(['Work', 'Project', 'Urgent']);
    });

    it('should handle minimal Graph task data', () => {
      const graphTask = {
        id: 'minimal-task',
        title: 'Minimal task',
        status: 'notStarted',
        importance: 'normal',
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z'
      };

      const result = TaskMapper.fromGraphTask(graphTask, 'list-minimal');

      expect(result.title).toBe('Minimal task');
      expect(result.description).toBeUndefined();
      expect(result.status).toBe('notStarted');
      expect(result.importance).toBe('normal');
      expect(result.dueDateTime).toBeUndefined();
      expect(result.startDateTime).toBeUndefined();
      expect(result.completedDateTime).toBeUndefined();
      expect(result.reminders).toHaveLength(0);
      expect(result.subtasks).toHaveLength(0);
      expect(result.categories).toHaveLength(0);
    });

    it('should map different status values correctly', () => {
      const statusMappings = [
        { graph: 'notStarted', domain: 'notStarted' },
        { graph: 'inProgress', domain: 'inProgress' },
        { graph: 'completed', domain: 'completed' },
        { graph: 'waitingOnOthers', domain: 'waitingOnOthers' },
        { graph: 'deferred', domain: 'deferred' }
      ];

      statusMappings.forEach(({ graph, domain }) => {
        const graphTask = {
          id: `task-${graph}`,
          title: `Task with ${graph} status`,
          status: graph,
          importance: 'normal',
          isReminderOn: false,
          createdDateTime: '2024-01-01T10:00:00Z',
          lastModifiedDateTime: '2024-01-01T10:00:00Z'
        };

        const result = TaskMapper.fromGraphTask(graphTask, 'list-status');
        expect(result.status).toBe(domain);
      });
    });

    it('should map different importance values correctly', () => {
      const importanceMappings = [
        { graph: 'low', domain: 'low' },
        { graph: 'normal', domain: 'normal' },
        { graph: 'high', domain: 'high' }
      ];

      importanceMappings.forEach(({ graph, domain }) => {
        const graphTask = {
          id: `task-${graph}`,
          title: `Task with ${graph} importance`,
          status: 'notStarted',
          importance: graph,
          isReminderOn: false,
          createdDateTime: '2024-01-01T10:00:00Z',
          lastModifiedDateTime: '2024-01-01T10:00:00Z'
        };

        const result = TaskMapper.fromGraphTask(graphTask, 'list-importance');
        expect(result.importance).toBe(domain);
      });
    });
  });

  describe('toGraphTask', () => {
    it('should map domain Task to Graph task format', () => {
      // Create a mock domain Task (this would normally be created through proper constructors)
      const domainTask = {
        id: 'unified-id-123',
        platformIds: new Map([['microsoft', 'graph-id-123']]),
        title: 'Domain task',
        description: 'Task from domain',
        status: 'inProgress' as const,
        importance: 'high' as const,
        priority: 1,
        dueDateTime: new Date('2024-12-31T23:59:00Z'),
        startDateTime: new Date('2024-01-01T09:00:00Z'),
        completedDateTime: undefined,
        categories: ['Work', 'Important'],
        tags: ['urgent', 'project'],
        subtasks: [
          {
            id: 'subtask-1',
            title: 'First step',
            isCompleted: true,
            createdDateTime: new Date('2024-01-01T10:00:00Z'),
            completedDateTime: new Date('2024-01-01T11:00:00Z')
          },
          {
            id: 'subtask-2',
            title: 'Second step',
            isCompleted: false,
            createdDateTime: new Date('2024-01-01T12:00:00Z')
          }
        ] as Subtask[],
        reminders: [
          {
            reminderDateTime: new Date('2024-06-15T09:00:00Z'),
            method: 'popup' as const,
            isRelative: false
          }
        ] as TaskReminder[],
        taskListId: 'domain-list-123',
        parentTaskId: undefined,
        assignedTo: undefined,
        estimatedHours: 8,
        actualHours: 6,
        percentComplete: 75,
        createdDateTime: new Date('2024-01-01T08:00:00Z'),
        lastModifiedDateTime: new Date('2024-01-01T15:00:00Z'),
        metadata: {} as any
      } as Task;

      const result = TaskMapper.toGraphTask(domainTask);

      expect(result.title).toBe('Domain task');
      expect(result.body.content).toBe('Task from domain');
      expect(result.body.contentType).toBe('text');
      expect(result.status).toBe('inProgress');
      expect(result.importance).toBe('high');
      expect(result.categories).toEqual(['Work', 'Important']);
      expect(result.percentComplete).toBe(75);
    });

    it('should map domain Task with dates to Graph format', () => {
      const domainTask = {
        id: 'task-with-dates',
        platformIds: new Map([['microsoft', 'graph-dates-123']]),
        title: 'Task with dates',
        description: 'Testing date mapping',
        status: 'notStarted' as const,
        importance: 'normal' as const,
        priority: 5,
        dueDateTime: new Date('2024-12-31T17:00:00Z'),
        startDateTime: new Date('2024-06-01T09:30:00Z'),
        completedDateTime: undefined,
        categories: [],
        tags: [],
        subtasks: [],
        reminders: [],
        taskListId: 'list-dates',
        percentComplete: 0,
        createdDateTime: new Date('2024-01-01T10:00:00Z'),
        lastModifiedDateTime: new Date('2024-01-01T10:00:00Z'),
        metadata: {} as any
      } as Task;

      const result = TaskMapper.toGraphTask(domainTask);

      expect(result.dueDateTime).toEqual({
        dateTime: '2024-12-31T17:00:00.000Z',
        timeZone: 'UTC'
      });
      expect(result.startDateTime).toEqual({
        dateTime: '2024-06-01T09:30:00.000Z',
        timeZone: 'UTC'
      });
    });

    it('should map completed domain Task with completion date', () => {
      const domainTask = {
        id: 'completed-task',
        platformIds: new Map([['microsoft', 'graph-completed-123']]),
        title: 'Completed task',
        description: 'This is done',
        status: 'completed' as const,
        importance: 'normal' as const,
        priority: 5,
        dueDateTime: new Date('2024-06-01T17:00:00Z'),
        startDateTime: new Date('2024-05-01T09:00:00Z'),
        completedDateTime: new Date('2024-05-15T16:30:00Z'),
        categories: ['Finished'],
        tags: [],
        subtasks: [],
        reminders: [],
        taskListId: 'list-completed',
        percentComplete: 100,
        createdDateTime: new Date('2024-05-01T08:00:00Z'),
        lastModifiedDateTime: new Date('2024-05-15T16:30:00Z'),
        metadata: {} as any
      } as Task;

      const result = TaskMapper.toGraphTask(domainTask);

      expect(result.status).toBe('completed');
      expect(result.percentComplete).toBe(100);
      expect(result.completedDateTime).toEqual({
        dateTime: '2024-05-15T16:30:00.000Z',
        timeZone: 'UTC'
      });
    });

    it('should handle domain Task with minimal data', () => {
      const domainTask = {
        id: 'minimal-domain-task',
        platformIds: new Map([['microsoft', 'graph-minimal-123']]),
        title: 'Minimal domain task',
        status: 'notStarted' as const,
        importance: 'normal' as const,
        priority: 5,
        categories: [],
        tags: [],
        subtasks: [],
        reminders: [],
        taskListId: 'list-minimal',
        percentComplete: 0,
        createdDateTime: new Date('2024-01-01T10:00:00Z'),
        lastModifiedDateTime: new Date('2024-01-01T10:00:00Z'),
        metadata: {} as any
      } as Task;

      const result = TaskMapper.toGraphTask(domainTask);

      expect(result.title).toBe('Minimal domain task');
      expect(result.status).toBe('notStarted');
      expect(result.importance).toBe('normal');
      expect(result.body.content).toBe('');
      expect(result.dueDateTime).toBeUndefined();
      expect(result.startDateTime).toBeUndefined();
      expect(result.completedDateTime).toBeUndefined();
    });
  });

  describe('toGraphUpdate', () => {
    it('should map partial Task updates to Graph format', () => {
      const updates = {
        title: 'Updated title',
        description: 'Updated description',
        status: 'inProgress' as const,
        importance: 'high' as const,
        percentComplete: 50
      };

      const result = TaskMapper.toGraphUpdate(updates);

      expect(result.title).toBe('Updated title');
      expect(result.body.content).toBe('Updated description');
      expect(result.body.contentType).toBe('text');
      expect(result.status).toBe('inProgress');
      expect(result.importance).toBe('high');
      expect(result.percentComplete).toBe(50);
    });

    it('should map due date update to Graph format', () => {
      const updates = {
        dueDateTime: new Date('2024-08-15T14:00:00Z')
      };

      const result = TaskMapper.toGraphUpdate(updates);

      expect(result.dueDateTime).toEqual({
        dateTime: '2024-08-15T14:00:00.000Z',
        timeZone: 'UTC'
      });
    });

    it('should map completion update to Graph format', () => {
      const updates = {
        status: 'completed' as const,
        completedDateTime: new Date('2024-03-15T18:00:00Z'),
        percentComplete: 100
      };

      const result = TaskMapper.toGraphUpdate(updates);

      expect(result.status).toBe('completed');
      expect(result.percentComplete).toBe(100);
      expect(result.completedDateTime).toEqual({
        dateTime: '2024-03-15T18:00:00.000Z',
        timeZone: 'UTC'
      });
    });

    it('should handle clearing dates in updates', () => {
      const updates = {
        dueDateTime: null,
        startDateTime: null
      };

      const result = TaskMapper.toGraphUpdate(updates);

      expect(result.dueDateTime).toBeNull();
      expect(result.startDateTime).toBeNull();
    });

    it('should handle empty updates', () => {
      const updates = {};

      const result = TaskMapper.toGraphUpdate(updates);

      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should map categories update to Graph format', () => {
      const updates = {
        categories: ['Updated', 'Categories', 'List']
      };

      const result = TaskMapper.toGraphUpdate(updates);

      expect(result.categories).toEqual(['Updated', 'Categories', 'List']);
    });
  });
});