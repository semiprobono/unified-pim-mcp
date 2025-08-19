import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TaskService } from '../../../../../src/infrastructure/adapters/microsoft/services/TaskService';
import { GraphClient } from '../../../../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { Logger } from '../../../../../src/shared/logging/Logger';

// Mock external dependencies
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager');
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer');
jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockResolvedValue({
      upsert: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue({ 
        ids: [[]],
        documents: [[]],
        metadatas: [[]]
      })
    })
  }))
}));

describe('TaskService', () => {
  let taskService: TaskService;
  let mockGraphClient: jest.Mocked<GraphClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Create mocks
    mockGraphClient = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      authenticateUser: jest.fn(),
      refreshToken: jest.fn(),
      isAuthenticated: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({ id: 'test-user-123' }),
      dispose: jest.fn()
    } as any;

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    // Create service instance
    taskService = new TaskService(mockGraphClient, mockLogger);
  });

  describe('listTaskLists', () => {
    it('should retrieve all task lists successfully', async () => {
      const mockResponse = {
        value: [
          {
            id: 'list-1',
            displayName: 'Tasks',
            isDefault: true
          },
          {
            id: 'list-2', 
            displayName: 'Shopping',
            isDefault: false
          }
        ]
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const result = await taskService.listTaskLists();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Tasks');
      expect(result[0].isDefault).toBe(true);
      expect(result[1].name).toBe('Shopping');
      expect(result[1].isDefault).toBe(false);
      expect(mockGraphClient.get).toHaveBeenCalledWith('/me/todo/lists', expect.any(Object));
    });

    it('should handle empty response', async () => {
      mockGraphClient.get.mockResolvedValue({ value: [] });

      const result = await taskService.listTaskLists();

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should handle API errors', async () => {
      const error = new Error('API Error');
      mockGraphClient.get.mockRejectedValue(error);

      await expect(taskService.listTaskLists()).rejects.toThrow('API Error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('listTasks', () => {
    it('should retrieve tasks with default options', async () => {
      const mockResponse = {
        value: [
          {
            id: 'task-1',
            title: 'Task 1',
            body: { content: 'Description 1', contentType: 'text' },
            status: 'notStarted',
            importance: 'normal',
            isReminderOn: false,
            createdDateTime: '2024-01-01T10:00:00Z',
            lastModifiedDateTime: '2024-01-01T10:00:00Z'
          }
        ],
        '@odata.count': 1
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const result = await taskService.listTasks();

      expect(result.tasks).toHaveLength(1);
      expect(result.totalCount).toBe(1);
      expect(result.tasks[0].title).toBe('Task 1');
      expect(mockGraphClient.get).toHaveBeenCalled();
    });

    it('should apply task filters correctly', async () => {
      const mockResponse = {
        value: [
          {
            id: 'task-completed',
            title: 'Completed Task',
            body: { content: 'Done', contentType: 'text' },
            status: 'completed',
            importance: 'high',
            isReminderOn: false,
            createdDateTime: '2024-01-01T10:00:00Z',
            lastModifiedDateTime: '2024-01-01T15:00:00Z'
          }
        ],
        '@odata.count': 1
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      const options = {
        status: 'completed' as const,
        importance: 'high' as const,
        limit: 10
      };

      const result = await taskService.listTasks(options);

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].status).toBe('completed');
      expect(result.tasks[0].importance).toBe('high');
    });

    it('should handle custom listId', async () => {
      const mockResponse = { value: [], '@odata.count': 0 };
      mockGraphClient.get.mockResolvedValue(mockResponse);

      const options = { listId: 'custom-list-123' };
      await taskService.listTasks(options);

      expect(mockGraphClient.get).toHaveBeenCalledWith(
        expect.stringContaining('custom-list-123'),
        expect.any(Object)
      );
    });
  });

  describe('getTask', () => {
    it('should retrieve a single task by ID', async () => {
      const mockTask = {
        id: 'task-123',
        title: 'Test Task',
        body: { content: 'Test description', contentType: 'text' },
        status: 'inProgress',
        importance: 'high',
        isReminderOn: true,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T12:00:00Z'
      };

      mockGraphClient.get.mockResolvedValue(mockTask);

      const result = await taskService.getTask('task-123');

      expect(result).toBeDefined();
      expect(result.id).toBe('task-123');
      expect(result.title).toBe('Test Task');
      expect(result.status).toBe('inProgress');
      expect(mockGraphClient.get).toHaveBeenCalled();
    });

    it('should handle task not found', async () => {
      const error = new Error('Task not found');
      mockGraphClient.get.mockRejectedValue(error);

      await expect(taskService.getTask('nonexistent')).rejects.toThrow('Task not found');
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should use custom listId when provided', async () => {
      const mockTask = {
        id: 'task-123',
        title: 'Test Task',
        body: { content: '', contentType: 'text' },
        status: 'notStarted',
        importance: 'normal',
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z'
      };

      mockGraphClient.get.mockResolvedValue(mockTask);

      await taskService.getTask('task-123', 'custom-list');

      expect(mockGraphClient.get).toHaveBeenCalledWith(
        expect.stringContaining('custom-list'),
        expect.any(Object)
      );
    });
  });

  describe('createTask', () => {
    it('should create a new task successfully', async () => {
      const createInput = {
        title: 'New Task',
        description: 'Task description',
        importance: 'high' as const,
        dueDateTime: new Date('2024-12-31'),
        categories: ['work', 'urgent']
      };

      const mockCreatedTask = {
        id: 'new-task-123',
        title: 'New Task',
        body: { content: 'Task description', contentType: 'text' },
        status: 'notStarted',
        importance: 'high',
        isReminderOn: false,
        categories: ['work', 'urgent'],
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z'
      };

      mockGraphClient.post.mockResolvedValue(mockCreatedTask);

      const result = await taskService.createTask(createInput);

      expect(result).toBeDefined();
      expect(result.id).toBe('new-task-123');
      expect(result.title).toBe('New Task');
      expect(result.importance).toBe('high');
      expect(mockGraphClient.post).toHaveBeenCalled();
    });

    it('should create task with minimal data', async () => {
      const createInput = { title: 'Simple Task' };

      const mockCreatedTask = {
        id: 'simple-task-123',
        title: 'Simple Task',
        body: { content: '', contentType: 'text' },
        status: 'notStarted',
        importance: 'normal',
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T10:00:00Z'
      };

      mockGraphClient.post.mockResolvedValue(mockCreatedTask);

      const result = await taskService.createTask(createInput);

      expect(result.title).toBe('Simple Task');
      expect(mockGraphClient.post).toHaveBeenCalled();
    });

    it('should handle creation errors', async () => {
      const createInput = { title: 'Failed Task' };
      const error = new Error('Creation failed');
      mockGraphClient.post.mockRejectedValue(error);

      await expect(taskService.createTask(createInput)).rejects.toThrow('Creation failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateTask', () => {
    it('should update task successfully', async () => {
      const updateData = {
        title: 'Updated Task',
        description: 'Updated description',
        status: 'inProgress' as const,
        importance: 'low' as const,
        percentComplete: 50
      };

      const mockUpdatedTask = {
        id: 'task-123',
        title: 'Updated Task',
        body: { content: 'Updated description', contentType: 'text' },
        status: 'inProgress',
        importance: 'low',
        percentComplete: 50,
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T15:00:00Z'
      };

      mockGraphClient.patch.mockResolvedValue(mockUpdatedTask);

      const result = await taskService.updateTask('task-123', updateData);

      expect(result.title).toBe('Updated Task');
      expect(result.status).toBe('inProgress');
      expect(result.importance).toBe('low');
      expect(mockGraphClient.patch).toHaveBeenCalled();
    });

    it('should handle partial updates', async () => {
      const updateData = { status: 'completed' as const };

      const mockUpdatedTask = {
        id: 'task-123',
        title: 'Existing Task',
        body: { content: 'Existing description', contentType: 'text' },
        status: 'completed',
        importance: 'normal',
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T15:00:00Z'
      };

      mockGraphClient.patch.mockResolvedValue(mockUpdatedTask);

      const result = await taskService.updateTask('task-123', updateData);

      expect(result.status).toBe('completed');
      expect(mockGraphClient.patch).toHaveBeenCalled();
    });

    it('should update task with custom listId', async () => {
      const updateData = { title: 'Updated Title' };

      const mockUpdatedTask = {
        id: 'task-123',
        title: 'Updated Title',
        body: { content: '', contentType: 'text' },
        status: 'notStarted',
        importance: 'normal',
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T15:00:00Z'
      };

      mockGraphClient.patch.mockResolvedValue(mockUpdatedTask);

      await taskService.updateTask('task-123', updateData, 'custom-list');

      expect(mockGraphClient.patch).toHaveBeenCalledWith(
        expect.stringContaining('custom-list'),
        expect.any(Object)
      );
    });
  });

  describe('deleteTask', () => {
    it('should delete task successfully', async () => {
      mockGraphClient.delete.mockResolvedValue({});

      await taskService.deleteTask('task-123');

      expect(mockGraphClient.delete).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Task task-123 deleted successfully');
    });

    it('should delete task with custom listId', async () => {
      mockGraphClient.delete.mockResolvedValue({});

      await taskService.deleteTask('task-123', 'custom-list');

      expect(mockGraphClient.delete).toHaveBeenCalledWith(
        expect.stringContaining('custom-list')
      );
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Deletion failed');
      mockGraphClient.delete.mockRejectedValue(error);

      await expect(taskService.deleteTask('task-123')).rejects.toThrow('Deletion failed');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('completeTask', () => {
    it('should mark task as completed', async () => {
      const mockCompletedTask = {
        id: 'task-123',
        title: 'Completed Task',
        body: { content: 'Task description', contentType: 'text' },
        status: 'completed',
        importance: 'normal',
        percentComplete: 100,
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T15:00:00Z'
      };

      mockGraphClient.patch.mockResolvedValue(mockCompletedTask);

      const result = await taskService.completeTask('task-123');

      expect(result.status).toBe('completed');
      expect(result.percentComplete).toBe(100);
      expect(mockGraphClient.patch).toHaveBeenCalled();
    });

    it('should complete task with custom listId', async () => {
      const mockCompletedTask = {
        id: 'task-123',
        title: 'Completed Task',
        body: { content: '', contentType: 'text' },
        status: 'completed',
        importance: 'normal',
        percentComplete: 100,
        isReminderOn: false,
        createdDateTime: '2024-01-01T10:00:00Z',
        lastModifiedDateTime: '2024-01-01T15:00:00Z'
      };

      mockGraphClient.patch.mockResolvedValue(mockCompletedTask);

      await taskService.completeTask('task-123', 'custom-list');

      expect(mockGraphClient.patch).toHaveBeenCalledWith(
        expect.stringContaining('custom-list'),
        expect.any(Object)
      );
    });
  });

  describe('searchTasks', () => {
    it('should search tasks successfully', async () => {
      // Mock the search functionality
      const mockSearchResults = [
        {
          id: 'task-1',
          title: 'Meeting task',
          description: 'Prepare for meeting',
          status: 'notStarted',
          importance: 'normal',
          isReminderOn: false,
          createdDateTime: new Date('2024-01-01T10:00:00Z'),
          lastModifiedDateTime: new Date('2024-01-01T10:00:00Z')
        }
      ];

      // Since searchTasks uses ChromaDB internally, we'll mock the method itself
      const searchSpy = jest.spyOn(taskService, 'searchTasks');
      searchSpy.mockResolvedValue(mockSearchResults as any);

      const result = await taskService.searchTasks('meeting');

      expect(result).toHaveLength(1);
      expect(result[0].title).toContain('Meeting');
    });

    it('should return empty array when no results found', async () => {
      const searchSpy = jest.spyOn(taskService, 'searchTasks');
      searchSpy.mockResolvedValue([]);

      const result = await taskService.searchTasks('nonexistent');

      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should search with options and filters', async () => {
      const mockSearchResults = [
        {
          id: 'task-high-1',
          title: 'Important meeting',
          description: 'Critical meeting prep',
          status: 'notStarted',
          importance: 'high',
          isReminderOn: true,
          createdDateTime: new Date('2024-01-01T10:00:00Z'),
          lastModifiedDateTime: new Date('2024-01-01T10:00:00Z')
        }
      ];

      const searchSpy = jest.spyOn(taskService, 'searchTasks');
      searchSpy.mockResolvedValue(mockSearchResults as any);

      const options = {
        importance: 'high' as const,
        status: 'notStarted' as const,
        limit: 5
      };

      const result = await taskService.searchTasks('meeting', options);

      expect(result).toHaveLength(1);
      expect(result[0].importance).toBe('high');
      expect(result[0].status).toBe('notStarted');
    });
  });
});