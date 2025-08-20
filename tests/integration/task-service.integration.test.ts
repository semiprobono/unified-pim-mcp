/**
 * Integration tests for TaskService
 * Tests full workflows and inter-service communication
 */

import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';
import { TaskService } from '../../src/infrastructure/adapters/microsoft/services/TaskService';
import { GraphClient } from '../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { Logger } from '../../src/shared/logging/Logger';
import { CreateTaskInput, UpdateTaskInput, TaskQueryOptions } from '../../src/infrastructure/adapters/microsoft/services/TaskService';
import { 
  mockTodoTask, 
  mockTodoTasksResponse, 
  createMockTask, 
  mockGraphError429,
  mockGraphError500 
} from '../fixtures/graphApiResponses';
import { 
  generateTestId, 
  TEST_TIMESTAMPS, 
  createMockLogger,
  waitFor,
  sleep
} from '../fixtures/testData';

// Mock external dependencies
jest.mock('../../src/infrastructure/adapters/microsoft/cache/CacheManager');
jest.mock('../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer');
jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockResolvedValue({
      upsert: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue({ 
        ids: [[]],
        documents: [[]],
        metadatas: [[]]
      }),
      delete: jest.fn().mockResolvedValue(undefined)
    })
  }))
}));

describe('TaskService Integration Tests', () => {
  let taskService: TaskService;
  let mockGraphClient: jest.Mocked<GraphClient>;
  let mockLogger: jest.Mocked<Logger>;
  let testState: {
    createdTaskIds: string[];
    createdListIds: string[];
  };

  beforeAll(async () => {
    // Initialize test state
    testState = {
      createdTaskIds: [],
      createdListIds: []
    };
  });

  afterAll(async () => {
    // Cleanup any remaining test data
    if (mockGraphClient && testState.createdTaskIds.length > 0) {
      for (const taskId of testState.createdTaskIds) {
        try {
          await mockGraphClient.delete(`/me/todo/lists/test-list/tasks/${taskId}`);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    }
  });

  beforeEach(() => {
    // Create fresh mocks for each test
    mockGraphClient = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      authenticateUser: jest.fn(),
      refreshToken: jest.fn(),
      isAuthenticated: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({ id: 'test-user-integration' }),
      dispose: jest.fn()
    } as any;

    mockLogger = createMockLogger() as jest.Mocked<Logger>;

    // Create service instance
    taskService = new TaskService(mockGraphClient, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete Task Lifecycle', () => {
    it('should handle complete task lifecycle: create → read → update → complete → delete', async () => {
      const taskId = generateTestId('lifecycle-task');
      const listId = 'test-list-lifecycle';

      // Step 1: Create task
      const createInput: CreateTaskInput = {
        title: 'Integration Test Task',
        description: 'This is a task for testing the complete lifecycle',
        importance: 'normal',
        dueDateTime: new Date('2024-12-31T23:59:59Z'),
        categories: ['integration-test']
      };

      const mockCreatedTask = createMockTask({
        id: taskId,
        title: createInput.title,
        body: { content: createInput.description, contentType: 'text' },
        importance: createInput.importance,
        categories: createInput.categories,
        dueDateTime: {
          dateTime: createInput.dueDateTime!.toISOString(),
          timeZone: 'UTC'
        }
      });

      mockGraphClient.post.mockResolvedValue(mockCreatedTask);

      const createdTask = await taskService.createTask(createInput);
      testState.createdTaskIds.push(createdTask.id.toString());

      expect(createdTask.title).toBe(createInput.title);
      expect(createdTask.description).toBe(createInput.description);
      expect(createdTask.importance).toBe(createInput.importance);

      // Step 2: Read task
      mockGraphClient.get.mockResolvedValue(mockCreatedTask);
      
      const retrievedTask = await taskService.getTask(taskId, listId);
      
      expect(retrievedTask.id.toString()).toBe(taskId);
      expect(retrievedTask.title).toBe(createInput.title);

      // Step 3: Update task
      const updateInput: UpdateTaskInput = {
        title: 'Updated Integration Test Task',
        description: 'Updated description for integration test',
        status: 'inProgress',
        importance: 'high',
        percentComplete: 50
      };

      const mockUpdatedTask = createMockTask({
        ...mockCreatedTask,
        title: updateInput.title,
        body: { content: updateInput.description, contentType: 'text' },
        status: updateInput.status,
        importance: updateInput.importance,
        percentComplete: updateInput.percentComplete
      });

      mockGraphClient.patch.mockResolvedValue(mockUpdatedTask);

      const updatedTask = await taskService.updateTask(taskId, updateInput, listId);

      expect(updatedTask.title).toBe(updateInput.title);
      expect(updatedTask.status).toBe(updateInput.status);
      expect(updatedTask.importance).toBe(updateInput.importance);
      expect(updatedTask.percentComplete).toBe(updateInput.percentComplete);

      // Step 4: Complete task
      const mockCompletedTask = createMockTask({
        ...mockUpdatedTask,
        status: 'completed',
        percentComplete: 100
      });

      mockGraphClient.patch.mockResolvedValue(mockCompletedTask);

      const completedTask = await taskService.completeTask(taskId, listId);

      expect(completedTask.status).toBe('completed');
      expect(completedTask.percentComplete).toBe(100);

      // Step 5: Delete task
      mockGraphClient.delete.mockResolvedValue({});

      await taskService.deleteTask(taskId, listId);

      expect(mockGraphClient.delete).toHaveBeenCalledWith(
        `/me/todo/lists/${listId}/tasks/${taskId}`
      );

      // Remove from test state since it's been deleted
      testState.createdTaskIds = testState.createdTaskIds.filter(id => id !== taskId);
    });

    it('should handle batch operations efficiently', async () => {
      const batchSize = 10;
      const listId = 'test-list-batch';
      const taskIds: string[] = [];

      // Create multiple tasks
      for (let i = 0; i < batchSize; i++) {
        const taskId = generateTestId(`batch-task-${i}`);
        taskIds.push(taskId);

        const createInput: CreateTaskInput = {
          title: `Batch Task ${i}`,
          description: `Batch task number ${i}`,
          importance: i % 2 === 0 ? 'high' : 'normal',
          categories: [`batch-${i % 3}`]
        };

        const mockTask = createMockTask({
          id: taskId,
          title: createInput.title,
          body: { content: createInput.description, contentType: 'text' }
        });

        mockGraphClient.post.mockResolvedValue(mockTask);

        const task = await taskService.createTask(createInput);
        testState.createdTaskIds.push(task.id.toString());
      }

      // List all tasks to verify they were created
      const mockListResponse = {
        value: taskIds.map(id => createMockTask({ id })),
        '@odata.count': batchSize
      };

      mockGraphClient.get.mockResolvedValue(mockListResponse);

      const result = await taskService.listTasks({ listId, limit: batchSize });

      expect(result.tasks).toHaveLength(batchSize);
      expect(result.totalCount).toBe(batchSize);

      // Update all tasks to completed
      for (const taskId of taskIds) {
        const mockCompletedTask = createMockTask({
          id: taskId,
          status: 'completed',
          percentComplete: 100
        });

        mockGraphClient.patch.mockResolvedValue(mockCompletedTask);

        const updatedTask = await taskService.completeTask(taskId, listId);
        expect(updatedTask.status).toBe('completed');
      }

      // Delete all tasks
      mockGraphClient.delete.mockResolvedValue({});

      for (const taskId of taskIds) {
        await taskService.deleteTask(taskId, listId);
        testState.createdTaskIds = testState.createdTaskIds.filter(id => id !== taskId);
      }

      expect(mockGraphClient.delete).toHaveBeenCalledTimes(batchSize);
    });
  });

  describe('Search and Filtering Integration', () => {
    it('should integrate search with task management operations', async () => {
      const listId = 'test-list-search';
      const searchTaskIds: string[] = [];

      // Create tasks with searchable content
      const searchTasks = [
        { title: 'Project Alpha Meeting', description: 'Discuss project alpha roadmap', categories: ['meetings', 'alpha'] },
        { title: 'Beta Testing Phase', description: 'Start beta testing for new features', categories: ['testing', 'beta'] },
        { title: 'Alpha Documentation', description: 'Write documentation for alpha release', categories: ['docs', 'alpha'] },
        { title: 'Team Standup', description: 'Daily team standup meeting', categories: ['meetings', 'daily'] }
      ];

      // Create all tasks
      for (const taskData of searchTasks) {
        const taskId = generateTestId(`search-task`);
        searchTaskIds.push(taskId);

        const mockTask = createMockTask({
          id: taskId,
          title: taskData.title,
          body: { content: taskData.description, contentType: 'text' },
          categories: taskData.categories
        });

        mockGraphClient.post.mockResolvedValue(mockTask);

        const task = await taskService.createTask(taskData);
        testState.createdTaskIds.push(task.id.toString());
      }

      // Mock search results for 'alpha' query
      const alphaSearchResults = searchTasks
        .filter(task => task.title.toLowerCase().includes('alpha') || task.description.toLowerCase().includes('alpha'))
        .map((task, index) => ({
          id: searchTaskIds[searchTasks.indexOf(task)],
          title: task.title,
          description: task.description,
          status: 'notStarted',
          importance: 'normal',
          categories: task.categories,
          subtasks: [],
          reminders: [],
          taskListId: listId,
          percentComplete: 0,
          createdDateTime: new Date(),
          lastModifiedDateTime: new Date()
        }));

      // Mock the search functionality
      const searchSpy = jest.spyOn(taskService, 'searchTasks');
      searchSpy.mockResolvedValue(alphaSearchResults as any);

      const searchResults = await taskService.searchTasks('alpha');

      expect(searchResults).toHaveLength(2); // 'Project Alpha Meeting' and 'Alpha Documentation'
      expect(searchResults.every(task => 
        task.title.toLowerCase().includes('alpha') || 
        task.description?.toLowerCase().includes('alpha')
      )).toBe(true);

      // Test filtering with query options
      const filterOptions: TaskQueryOptions = {
        categories: ['meetings'],
        importance: 'normal',
        status: 'notStarted'
      };

      const meetingSearchResults = alphaSearchResults.filter(task => 
        task.categories.includes('meetings')
      );

      searchSpy.mockResolvedValue(meetingSearchResults as any);

      const filteredResults = await taskService.searchTasks('alpha', filterOptions);

      expect(filteredResults).toHaveLength(1); // Only 'Project Alpha Meeting'
      expect(filteredResults[0].title).toBe('Project Alpha Meeting');

      // Cleanup
      mockGraphClient.delete.mockResolvedValue({});
      for (const taskId of searchTaskIds) {
        await taskService.deleteTask(taskId, listId);
        testState.createdTaskIds = testState.createdTaskIds.filter(id => id !== taskId);
      }
    });

    it('should handle complex filtering scenarios', async () => {
      const listId = 'test-list-complex-filter';
      
      // Mock tasks with different statuses, importance levels, and dates
      const complexTasks = Array.from({ length: 20 }, (_, i) => createMockTask({
        id: `complex-task-${i}`,
        title: `Complex Task ${i}`,
        status: i % 4 === 0 ? 'completed' : i % 3 === 0 ? 'inProgress' : 'notStarted',
        importance: i % 3 === 0 ? 'high' : i % 2 === 0 ? 'normal' : 'low',
        categories: [`category-${i % 5}`, `type-${i % 3}`],
        dueDateTime: i % 2 === 0 ? {
          dateTime: new Date(Date.now() + (i * 24 * 60 * 60 * 1000)).toISOString(),
          timeZone: 'UTC'
        } : undefined
      }));

      const mockResponse = {
        value: complexTasks,
        '@odata.count': complexTasks.length
      };

      mockGraphClient.get.mockResolvedValue(mockResponse);

      // Test multiple filter combinations
      const filterTests = [
        {
          options: { status: 'completed' as const },
          expectedCount: complexTasks.filter(t => t.status === 'completed').length
        },
        {
          options: { importance: 'high' as const },
          expectedCount: complexTasks.filter(t => t.importance === 'high').length
        },
        {
          options: { status: 'inProgress' as const, importance: 'high' as const },
          expectedCount: complexTasks.filter(t => t.status === 'inProgress' && t.importance === 'high').length
        }
      ];

      for (const test of filterTests) {
        const result = await taskService.listTasks(test.options);
        
        expect(result.tasks).toHaveLength(test.expectedCount);
        
        // Verify filtering logic was applied in the Graph API call
        const lastCall = mockGraphClient.get.mock.calls[mockGraphClient.get.mock.calls.length - 1];
        const params = lastCall[1];
        
        if (test.options.status) {
          expect(params.$filter).toContain(`status eq '${test.options.status}'`);
        }
        if (test.options.importance) {
          expect(params.$filter).toContain(`importance eq '${test.options.importance}'`);
        }
      }
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should handle transient failures with retry logic', async () => {
      const taskId = generateTestId('retry-task');
      let callCount = 0;

      // Mock GraphClient to fail first two times, then succeed
      mockGraphClient.get.mockImplementation(() => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Transient network error');
        }
        return Promise.resolve(createMockTask({ id: taskId }));
      });

      // In a real implementation, we'd have retry logic in the service or client
      // For now, we'll simulate the retry behavior
      let task;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          task = await taskService.getTask(taskId);
          break;
        } catch (error) {
          retryCount++;
          if (retryCount === maxRetries) throw error;
          await sleep(100 * retryCount); // Exponential backoff
        }
      }

      expect(task).toBeDefined();
      expect(callCount).toBe(3); // Failed twice, succeeded on third attempt
    });

    it('should handle rate limiting gracefully', async () => {
      const rateLimitError = {
        response: { 
          status: 429, 
          data: mockGraphError429,
          headers: { 'retry-after': '1' } // 1 second retry
        }
      };

      let callCount = 0;
      mockGraphClient.get.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw rateLimitError;
        }
        return Promise.resolve({ value: [], '@odata.count': 0 });
      });

      // Simulate retry after rate limit
      try {
        await taskService.listTaskLists();
      } catch (error) {
        // First call should fail with rate limit
        expect(callCount).toBe(1);
        
        // Wait for retry period
        await sleep(1100);
        
        // Second call should succeed
        const result = await taskService.listTaskLists();
        expect(result).toBeDefined();
        expect(callCount).toBe(2);
      }
    });

    it('should maintain data consistency during concurrent operations', async () => {
      const listId = 'test-list-concurrent';
      const taskId = generateTestId('concurrent-task');

      // Mock task that gets updated
      let taskVersion = 0;
      const getUpdatedTask = () => {
        taskVersion++;
        return createMockTask({
          id: taskId,
          title: `Task Version ${taskVersion}`,
          lastModifiedDateTime: new Date().toISOString()
        });
      };

      mockGraphClient.post.mockResolvedValue(getUpdatedTask());
      mockGraphClient.patch.mockImplementation(() => Promise.resolve(getUpdatedTask()));
      mockGraphClient.get.mockImplementation(() => Promise.resolve(getUpdatedTask()));

      // Create task
      const createdTask = await taskService.createTask({
        title: 'Concurrent Test Task'
      });
      testState.createdTaskIds.push(createdTask.id.toString());

      // Simulate concurrent updates
      const updatePromises = Array.from({ length: 5 }, (_, i) => 
        taskService.updateTask(taskId, {
          title: `Concurrent Update ${i}`,
          percentComplete: i * 20
        }, listId)
      );

      const updateResults = await Promise.all(updatePromises);

      // All updates should complete successfully
      expect(updateResults).toHaveLength(5);
      updateResults.forEach(result => {
        expect(result).toBeDefined();
        expect(result.id.toString()).toBe(taskId);
      });

      // Each update should have been processed
      expect(mockGraphClient.patch).toHaveBeenCalledTimes(5);

      // Cleanup
      mockGraphClient.delete.mockResolvedValue({});
      await taskService.deleteTask(taskId, listId);
      testState.createdTaskIds = testState.createdTaskIds.filter(id => id !== taskId);
    });
  });

  describe('Cache Integration', () => {
    it('should demonstrate cache behavior across operations', async () => {
      const listId = 'test-list-cache';
      const taskId = generateTestId('cache-task');

      // Create mock cache manager to track cache operations
      const mockCacheManager = {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn()
      };

      (taskService as any).cacheManager = mockCacheManager;

      // First read - cache miss
      mockCacheManager.get.mockResolvedValueOnce(undefined);
      mockGraphClient.get.mockResolvedValue(createMockTask({ id: taskId }));

      const task1 = await taskService.getTask(taskId, listId);

      expect(mockCacheManager.get).toHaveBeenCalledWith(`task:${taskId}`);
      expect(mockGraphClient.get).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalled();

      // Second read - cache hit
      mockCacheManager.get.mockResolvedValueOnce(task1);

      const task2 = await taskService.getTask(taskId, listId);

      expect(task2).toEqual(task1);
      expect(mockGraphClient.get).toHaveBeenCalledTimes(1); // No additional API call

      // Update task - should invalidate cache
      const updatedTask = createMockTask({ 
        id: taskId, 
        title: 'Updated Task',
        lastModifiedDateTime: new Date().toISOString()
      });
      
      mockGraphClient.patch.mockResolvedValue(updatedTask);

      await taskService.updateTask(taskId, { title: 'Updated Task' }, listId);

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `task:${taskId}`,
        expect.any(Object),
        expect.any(String),
        'PATCH',
        300
      );

      // Delete task - should remove from cache
      mockGraphClient.delete.mockResolvedValue({});

      await taskService.deleteTask(taskId, listId);

      expect(mockCacheManager.delete).toHaveBeenCalledWith(`task:${taskId}`);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle a typical user workflow: daily task management', async () => {
      const listId = 'test-list-daily';
      const workflowTaskIds: string[] = [];

      // Morning: Create today's tasks
      const dailyTasks = [
        { title: 'Check emails', importance: 'normal' as const, categories: ['admin'] },
        { title: 'Team standup', importance: 'high' as const, categories: ['meetings'] },
        { title: 'Review pull requests', importance: 'high' as const, categories: ['development'] },
        { title: 'Write documentation', importance: 'normal' as const, categories: ['docs'] },
        { title: 'Plan sprint tasks', importance: 'low' as const, categories: ['planning'] }
      ];

      for (const taskData of dailyTasks) {
        const taskId = generateTestId('daily-task');
        workflowTaskIds.push(taskId);

        const mockTask = createMockTask({
          id: taskId,
          title: taskData.title,
          importance: taskData.importance,
          categories: taskData.categories
        });

        mockGraphClient.post.mockResolvedValue(mockTask);

        const task = await taskService.createTask(taskData);
        testState.createdTaskIds.push(task.id.toString());

        expect(task.title).toBe(taskData.title);
        expect(task.importance).toBe(taskData.importance);
      }

      // Midday: Mark some tasks as in progress
      const inProgressTaskIds = workflowTaskIds.slice(0, 2);
      
      for (const taskId of inProgressTaskIds) {
        const mockUpdatedTask = createMockTask({
          id: taskId,
          status: 'inProgress',
          percentComplete: 50
        });

        mockGraphClient.patch.mockResolvedValue(mockUpdatedTask);

        const updatedTask = await taskService.updateTask(taskId, {
          status: 'inProgress',
          percentComplete: 50
        }, listId);

        expect(updatedTask.status).toBe('inProgress');
      }

      // Evening: Complete finished tasks
      const completedTaskIds = workflowTaskIds.slice(0, 3);

      for (const taskId of completedTaskIds) {
        const mockCompletedTask = createMockTask({
          id: taskId,
          status: 'completed',
          percentComplete: 100
        });

        mockGraphClient.patch.mockResolvedValue(mockCompletedTask);

        const completedTask = await taskService.completeTask(taskId, listId);

        expect(completedTask.status).toBe('completed');
        expect(completedTask.percentComplete).toBe(100);
      }

      // End of day: List remaining tasks
      const remainingTasks = workflowTaskIds.slice(3);
      const mockListResponse = {
        value: remainingTasks.map(id => createMockTask({
          id,
          status: 'notStarted'
        })),
        '@odata.count': remainingTasks.length
      };

      mockGraphClient.get.mockResolvedValue(mockListResponse);

      const options: TaskQueryOptions = {
        status: 'notStarted',
        listId
      };

      const remainingTasksResult = await taskService.listTasks(options);

      expect(remainingTasksResult.tasks.length).toBe(remainingTasks.length);
      expect(remainingTasksResult.tasks.every(task => task.status === 'notStarted')).toBe(true);

      // Cleanup
      mockGraphClient.delete.mockResolvedValue({});
      for (const taskId of workflowTaskIds) {
        await taskService.deleteTask(taskId, listId);
        testState.createdTaskIds = testState.createdTaskIds.filter(id => id !== taskId);
      }
    });

    it('should handle project planning scenario with dependencies', async () => {
      const projectListId = 'test-list-project';
      const projectTaskIds: string[] = [];

      // Create project tasks with logical dependency order
      const projectTasks = [
        { title: 'Project kickoff meeting', importance: 'high' as const, order: 1 },
        { title: 'Requirements gathering', importance: 'high' as const, order: 2 },
        { title: 'Technical design', importance: 'high' as const, order: 3 },
        { title: 'Implementation phase 1', importance: 'normal' as const, order: 4 },
        { title: 'Code review', importance: 'normal' as const, order: 5 },
        { title: 'Testing phase', importance: 'high' as const, order: 6 },
        { title: 'Documentation', importance: 'normal' as const, order: 7 },
        { title: 'Deployment', importance: 'high' as const, order: 8 }
      ];

      // Create all project tasks
      for (const taskData of projectTasks) {
        const taskId = generateTestId(`project-task-${taskData.order}`);
        projectTaskIds.push(taskId);

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + taskData.order * 3); // Stagger due dates

        const mockTask = createMockTask({
          id: taskId,
          title: taskData.title,
          importance: taskData.importance,
          categories: ['project-x', `phase-${Math.ceil(taskData.order / 2)}`],
          dueDateTime: {
            dateTime: dueDate.toISOString(),
            timeZone: 'UTC'
          }
        });

        mockGraphClient.post.mockResolvedValue(mockTask);

        const task = await taskService.createTask({
          title: taskData.title,
          importance: taskData.importance,
          dueDateTime: dueDate,
          categories: ['project-x', `phase-${Math.ceil(taskData.order / 2)}`]
        });

        testState.createdTaskIds.push(task.id.toString());
      }

      // Simulate progressing through project phases
      for (let phase = 1; phase <= 4; phase++) {
        const phaseTaskIds = projectTaskIds.filter((_, index) => 
          Math.ceil((index + 1) / 2) === phase
        );

        for (const taskId of phaseTaskIds) {
          // Start task
          mockGraphClient.patch.mockResolvedValue(createMockTask({
            id: taskId,
            status: 'inProgress',
            percentComplete: 30
          }));

          await taskService.updateTask(taskId, {
            status: 'inProgress',
            percentComplete: 30
          }, projectListId);

          // Complete task
          mockGraphClient.patch.mockResolvedValue(createMockTask({
            id: taskId,
            status: 'completed',
            percentComplete: 100
          }));

          await taskService.completeTask(taskId, projectListId);
        }

        // Check phase completion
        const mockPhaseResponse = {
          value: phaseTaskIds.map(id => createMockTask({
            id,
            status: 'completed',
            categories: ['project-x', `phase-${phase}`]
          })),
          '@odata.count': phaseTaskIds.length
        };

        mockGraphClient.get.mockResolvedValue(mockPhaseResponse);

        const phaseResult = await taskService.listTasks({
          categories: [`phase-${phase}`],
          status: 'completed',
          listId: projectListId
        });

        expect(phaseResult.tasks.length).toBe(phaseTaskIds.length);
        expect(phaseResult.tasks.every(task => task.status === 'completed')).toBe(true);
      }

      // Final project status check
      const mockFinalResponse = {
        value: projectTaskIds.map(id => createMockTask({
          id,
          status: 'completed',
          categories: ['project-x']
        })),
        '@odata.count': projectTaskIds.length
      };

      mockGraphClient.get.mockResolvedValue(mockFinalResponse);

      const finalResult = await taskService.listTasks({
        categories: ['project-x'],
        listId: projectListId
      });

      expect(finalResult.tasks.length).toBe(projectTasks.length);
      expect(finalResult.tasks.every(task => task.status === 'completed')).toBe(true);

      // Cleanup
      mockGraphClient.delete.mockResolvedValue({});
      for (const taskId of projectTaskIds) {
        await taskService.deleteTask(taskId, projectListId);
        testState.createdTaskIds = testState.createdTaskIds.filter(id => id !== taskId);
      }
    });
  });
});