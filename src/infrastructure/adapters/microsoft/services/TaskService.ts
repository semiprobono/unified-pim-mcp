import { Logger } from '../../../../shared/logging/Logger.js';
import { Task, TaskEntity, TaskList, Subtask, TaskReminder } from '../../../../domain/entities/Task.js';
import { PaginationInfo } from '../../../../domain/interfaces/PlatformPort.js';
import { GraphClient } from '../clients/GraphClient.js';
import { CacheManager } from '../cache/CacheManager.js';
import { ChromaDbInitializer } from '../cache/ChromaDbInitializer.js';
import { TaskMapper } from '../mappers/TaskMapper.js';
import { ErrorHandler } from '../errors/ErrorHandler.js';
import { ChromaClient } from 'chromadb';
import { GraphRequestOptions } from '../clients/GraphClient.js';

/**
 * Task query options for searching
 */
export interface TaskQueryOptions {
  listId?: string;
  status?: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred';
  importance?: 'low' | 'normal' | 'high';
  isCompleted?: boolean;
  hasAttachments?: boolean;
  categories?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  skip?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

/**
 * Task search result with pagination
 */
export interface TaskSearchResult {
  tasks: Task[];
  pagination: PaginationInfo;
  totalCount: number;
  nextPageToken?: string;
}

/**
 * Create task input
 */
export interface CreateTaskInput {
  title: string;
  description?: string;
  listId?: string;
  importance?: 'low' | 'normal' | 'high';
  dueDateTime?: Date;
  startDateTime?: Date;
  categories?: string[];
  reminderDateTime?: Date;
}

/**
 * Update task input
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred';
  importance?: 'low' | 'normal' | 'high';
  dueDateTime?: Date | null;
  startDateTime?: Date | null;
  categories?: string[];
  percentComplete?: number;
}

/**
 * Microsoft Graph Task Service
 * Implements task operations using Graph API (Microsoft To Do)
 */
export class TaskService {
  private readonly logger: Logger;
  private cacheManager: CacheManager | null = null;
  private chromaService: ChromaDbInitializer | null = null;
  private chromaClient: ChromaClient | null = null;
  private searchCollection: any = null;
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor(
    private readonly graphClient: GraphClient,
    logger?: Logger
  ) {
    this.logger = logger || new Logger('TaskService');
  }

  /**
   * Initialize ChromaDB and cache
   */
  private async initializeServices(): Promise<void> {
    if (!this.chromaService) {
      this.chromaService = new ChromaDbInitializer('http://localhost:8000', this.logger);
      await this.chromaService.initialize();
      
      // Create tasks search collection - use ChromaClient directly
      try {
        const chromaClient = new ChromaClient({ path: 'http://localhost:8000' });
        this.chromaClient = chromaClient;
        this.searchCollection = await chromaClient.getOrCreateCollection({
          name: 'tasks-search-index',
          metadata: { 
            description: 'Semantic search index for tasks',
            'hnsw:space': 'cosine'
          }
        });
        this.logger.info('Tasks search collection initialized');
      } catch (error) {
        this.logger.error('Failed to initialize tasks search collection', { error });
      }
    }

    if (!this.cacheManager) {
      this.cacheManager = new CacheManager(this.chromaService!, { defaultTtl: this.CACHE_TTL }, this.logger);
    }
  }

  /**
   * List all task lists
   */
  async listTaskLists(): Promise<TaskList[]> {
    try {
      await this.initializeServices();

      // Check cache first
      const cacheKey = 'task-lists';
      const cached = await this.cacheManager?.get(cacheKey) as TaskList[] | undefined;
      if (cached) {
        this.logger.debug('Returning cached task lists');
        return cached;
      }

      // Fetch from Graph API
      const params: Record<string, any> = {
        $select: 'id,displayName,isDefault',
        $orderby: 'displayName'
      };
      const response = await this.graphClient.get('/me/todo/lists', params as GraphRequestOptions);

      const lists: TaskList[] = response.value.map((list: any) => ({
        id: list.id,
        name: list.displayName,
        isDefault: list.isDefault || false
      }));

      // Cache the result
      await this.cacheManager?.set(cacheKey, lists, '/me/todo/lists', 'GET', this.CACHE_TTL);

      return lists;
    } catch (error) {
      this.logger.error('Failed to list task lists', { error });
      throw error;
    }
  }

  /**
   * List tasks with optional filtering
   */
  async listTasks(options?: TaskQueryOptions): Promise<TaskSearchResult> {
    try {
      await this.initializeServices();

      // Build query parameters
      const params: any = {
        $select: 'id,title,body,importance,status,dueDateTime,startDateTime,completedDateTime,categories,reminderDateTime,recurrence,createdDateTime,lastModifiedDateTime',
        $top: options?.limit || 50,
        $skip: options?.skip || 0,
        $count: true
      };

      // Add filters
      const filters: string[] = [];
      if (options?.status) {
        filters.push(`status eq '${options.status}'`);
      }
      if (options?.importance) {
        filters.push(`importance eq '${options.importance}'`);
      }
      if (options?.isCompleted !== undefined) {
        filters.push(`status ${options.isCompleted ? 'eq' : 'ne'} 'completed'`);
      }
      if (options?.dateFrom) {
        filters.push(`dueDateTime/dateTime ge '${options.dateFrom.toISOString()}'`);
      }
      if (options?.dateTo) {
        filters.push(`dueDateTime/dateTime le '${options.dateTo.toISOString()}'`);
      }

      if (filters.length > 0) {
        params.$filter = filters.join(' and ');
      }

      // Add ordering
      if (options?.orderBy) {
        const direction = options.orderDirection === 'desc' ? ' desc' : '';
        params.$orderby = `${options.orderBy}${direction}`;
      } else {
        params.$orderby = 'dueDateTime/dateTime asc';
      }

      // Determine the list to query
      const listId = options?.listId || await this.getDefaultListId();
      const endpoint = `/me/todo/lists/${listId}/tasks`;

      // Fetch from Graph API
      const response = await this.graphClient.get(endpoint, params);

      // Map to domain entities
      const tasks = response.value.map((task: any) => TaskMapper.fromGraphTask(task, listId));

      // Index tasks in ChromaDB for search
      if (this.searchCollection && tasks.length > 0) {
        await this.indexTasksForSearch(tasks);
      }

      return {
        tasks,
        pagination: {
          total: response['@odata.count'] || tasks.length,
          page: Math.floor((options?.skip || 0) / (options?.limit || 50)) + 1,
          pageSize: options?.limit || 50,
          hasNextPage: response['@odata.nextLink'] !== undefined,
          hasPreviousPage: (options?.skip || 0) > 0
        },
        totalCount: response['@odata.count'] || tasks.length,
        nextPageToken: response['@odata.nextLink']
      };
    } catch (error) {
      this.logger.error('Failed to list tasks', { error });
      throw error;
    }
  }

  /**
   * Get a specific task by ID
   */
  async getTask(taskId: string, listId?: string): Promise<Task> {
    try {
      await this.initializeServices();

      // Check cache first
      const cacheKey = `task:${taskId}`;
      const cached = await this.cacheManager?.get(cacheKey) as Task | undefined;
      if (cached) {
        this.logger.debug('Returning cached task', { taskId });
        return cached;
      }

      // Get list ID if not provided
      const taskListId = listId || await this.getDefaultListId();
      const endpoint = `/me/todo/lists/${taskListId}/tasks/${taskId}`;

      const params: Record<string, any> = {
        $select: 'id,title,body,importance,status,dueDateTime,startDateTime,completedDateTime,categories,reminderDateTime,recurrence,createdDateTime,lastModifiedDateTime'
      };
      const response = await this.graphClient.get(endpoint, params as GraphRequestOptions);

      const task = TaskMapper.fromGraphTask(response, taskListId);

      // Cache the result
      await this.cacheManager?.set(cacheKey, task, endpoint, 'GET', this.CACHE_TTL);

      return task;
    } catch (error) {
      this.logger.error('Failed to get task', { taskId, error });
      throw error;
    }
  }

  /**
   * Create a new task
   */
  async createTask(data: CreateTaskInput): Promise<Task> {
    try {
      await this.initializeServices();

      const listId = data.listId || await this.getDefaultListId();
      const endpoint = `/me/todo/lists/${listId}/tasks`;

      // Build request body
      const body: any = {
        title: data.title,
        body: data.description ? {
          content: data.description,
          contentType: 'text'
        } : undefined,
        importance: data.importance || 'normal',
        categories: data.categories || [],
        status: 'notStarted'
      };

      if (data.dueDateTime) {
        body.dueDateTime = {
          dateTime: data.dueDateTime.toISOString(),
          timeZone: 'UTC'
        };
      }

      if (data.startDateTime) {
        body.startDateTime = {
          dateTime: data.startDateTime.toISOString(),
          timeZone: 'UTC'
        };
      }

      if (data.reminderDateTime) {
        body.reminderDateTime = {
          dateTime: data.reminderDateTime.toISOString(),
          timeZone: 'UTC'
        };
      }

      const response = await this.graphClient.post(endpoint, body);
      const task = TaskMapper.fromGraphTask(response, listId);

      // Index in ChromaDB
      if (this.searchCollection) {
        await this.indexTasksForSearch([task]);
      }

      // Invalidate list cache
      await this.cacheManager?.delete(`tasks:list:${listId}`);

      this.logger.info('Task created successfully', { taskId: task.id.toString() });
      return task;
    } catch (error) {
      this.logger.error('Failed to create task', { error });
      throw error;
    }
  }

  /**
   * Update an existing task
   */
  async updateTask(taskId: string, updates: UpdateTaskInput, listId?: string): Promise<Task> {
    try {
      await this.initializeServices();

      const taskListId = listId || await this.getDefaultListId();
      const endpoint = `/me/todo/lists/${taskListId}/tasks/${taskId}`;

      // Build update body
      const body: any = {};

      if (updates.title !== undefined) body.title = updates.title;
      if (updates.description !== undefined) {
        body.body = {
          content: updates.description,
          contentType: 'text'
        };
      }
      if (updates.status !== undefined) body.status = updates.status;
      if (updates.importance !== undefined) body.importance = updates.importance;
      if (updates.categories !== undefined) body.categories = updates.categories;
      if (updates.percentComplete !== undefined) {
        body.percentComplete = updates.percentComplete;
        // Auto-update status based on percentage
        if (updates.percentComplete === 100) {
          body.status = 'completed';
        } else if (updates.percentComplete > 0) {
          body.status = 'inProgress';
        }
      }

      if (updates.dueDateTime !== undefined) {
        body.dueDateTime = updates.dueDateTime ? {
          dateTime: updates.dueDateTime.toISOString(),
          timeZone: 'UTC'
        } : null;
      }

      if (updates.startDateTime !== undefined) {
        body.startDateTime = updates.startDateTime ? {
          dateTime: updates.startDateTime.toISOString(),
          timeZone: 'UTC'
        } : null;
      }

      const response = await this.graphClient.patch(endpoint, body);
      const task = TaskMapper.fromGraphTask(response, taskListId);

      // Update cache
      await this.cacheManager?.set(`task:${taskId}`, task, endpoint, 'PATCH', this.CACHE_TTL);

      // Re-index in ChromaDB
      if (this.searchCollection) {
        await this.indexTasksForSearch([task]);
      }

      this.logger.info('Task updated successfully', { taskId });
      return task;
    } catch (error) {
      this.logger.error('Failed to update task', { taskId, error });
      throw error;
    }
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string, listId?: string): Promise<void> {
    try {
      await this.initializeServices();

      const taskListId = listId || await this.getDefaultListId();
      const endpoint = `/me/todo/lists/${taskListId}/tasks/${taskId}`;

      await this.graphClient.delete(endpoint);

      // Remove from cache
      await this.cacheManager?.delete(`task:${taskId}`);

      // Remove from ChromaDB
      if (this.searchCollection) {
        try {
          await this.searchCollection.delete({
            ids: [taskId]
          });
        } catch (error) {
          this.logger.warn('Failed to remove task from search index', { taskId, error });
        }
      }

      this.logger.info('Task deleted successfully', { taskId });
    } catch (error) {
      this.logger.error('Failed to delete task', { taskId, error });
      throw error;
    }
  }

  /**
   * Mark a task as completed
   */
  async completeTask(taskId: string, listId?: string): Promise<Task> {
    return this.updateTask(taskId, {
      status: 'completed',
      percentComplete: 100
    }, listId);
  }

  /**
   * Search tasks using semantic search
   */
  async searchTasks(query: string, options?: TaskQueryOptions): Promise<Task[]> {
    try {
      await this.initializeServices();

      if (!this.searchCollection) {
        // Fallback to regular list with filtering
        this.logger.warn('ChromaDB not available, falling back to standard filtering');
        const result = await this.listTasks(options);
        return result.tasks.filter(task => 
          task.title.toLowerCase().includes(query.toLowerCase()) ||
          task.description?.toLowerCase().includes(query.toLowerCase())
        );
      }

      // Perform semantic search
      const searchResults = await this.searchCollection.query({
        queryTexts: [query],
        nResults: options?.limit || 25,
        where: this.buildChromaWhereClause(options)
      });

      if (!searchResults.ids[0] || searchResults.ids[0].length === 0) {
        return [];
      }

      // Fetch full task details
      const tasks: Task[] = [];
      for (const id of searchResults.ids[0]) {
        try {
          const metadata = searchResults.metadatas[0][searchResults.ids[0].indexOf(id)];
          const task = await this.getTask(id as string, metadata?.listId as string);
          tasks.push(task);
        } catch (error) {
          this.logger.warn('Failed to fetch task from search result', { id, error });
        }
      }

      return tasks;
    } catch (error) {
      this.logger.error('Failed to search tasks', { query, error });
      throw error;
    }
  }

  /**
   * Get the default task list ID
   */
  private async getDefaultListId(): Promise<string> {
    const lists = await this.listTaskLists();
    const defaultList = lists.find(list => list.isDefault);
    if (defaultList) {
      return defaultList.id;
    }
    // Return first list if no default
    if (lists.length > 0) {
      return lists[0].id;
    }
    throw new Error('No task lists found');
  }

  /**
   * Index tasks in ChromaDB for semantic search
   */
  private async indexTasksForSearch(tasks: Task[]): Promise<void> {
    if (!this.searchCollection || tasks.length === 0) return;

    try {
      const documents = tasks.map(task => 
        `${task.title} ${task.description || ''} ${task.categories.join(' ')}`
      );

      const metadatas = tasks.map(task => ({
        taskId: task.id.toString(),
        listId: task.taskListId,
        title: task.title,
        status: task.status,
        importance: task.importance,
        dueDate: task.dueDateTime?.toISOString() || '',
        categories: task.categories.join(','),
        isCompleted: task.status === 'completed'
      }));

      const ids = tasks.map(task => task.id.toString());

      await this.searchCollection.upsert({
        ids,
        documents,
        metadatas
      });

      this.logger.debug('Tasks indexed for search', { count: tasks.length });
    } catch (error) {
      this.logger.error('Failed to index tasks for search', { error });
    }
  }

  /**
   * Build ChromaDB where clause from query options
   */
  private buildChromaWhereClause(options?: TaskQueryOptions): any {
    const where: any = {};

    if (options?.status) {
      where.status = options.status;
    }
    if (options?.importance) {
      where.importance = options.importance;
    }
    if (options?.isCompleted !== undefined) {
      where.isCompleted = options.isCompleted;
    }
    if (options?.listId) {
      where.listId = options.listId;
    }

    return Object.keys(where).length > 0 ? where : undefined;
  }
}