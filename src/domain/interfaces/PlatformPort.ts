import { Platform } from '../value-objects/Platform.js';
import { DateRange } from '../value-objects/DateRange.js';
import { EmailAddress } from '../value-objects/EmailAddress.js';
import { Email } from '../entities/Email.js';
import { CalendarEvent } from '../entities/CalendarEvent.js';
import { Contact } from '../entities/Contact.js';
import { Task } from '../entities/Task.js';
import { File } from '../entities/File.js';

/**
 * Search criteria for filtering results
 */
export interface SearchCriteria {
  query?: string;
  folder?: string;
  category?: string;
  tags?: string[];
  dateRange?: DateRange;
  fromEmail?: EmailAddress;
  toEmail?: EmailAddress;
  hasAttachments?: boolean;
  isRead?: boolean;
  importance?: 'low' | 'normal' | 'high';
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  customFilters?: Record<string, any>;
}

/**
 * Pagination information
 */
export interface PaginationInfo {
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  nextCursor?: string;
  previousCursor?: string;
}

/**
 * Platform operation result
 */
export interface PlatformResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  pagination?: PaginationInfo;
  metadata?: Record<string, any>;
}

/**
 * Batch operation request
 */
export interface BatchOperation<T> {
  operation: 'create' | 'update' | 'delete';
  data: T;
  id?: string;
}

/**
 * Batch operation result
 */
export interface BatchResult<T> {
  success: boolean;
  results: Array<PlatformResult<T>>;
  failedOperations: Array<{
    operation: BatchOperation<T>;
    error: string;
  }>;
}

/**
 * Free/busy time slot
 */
export interface FreeBusySlot {
  start: Date;
  end: Date;
  status: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere';
  subject?: string;
}

/**
 * Free/busy information
 */
export interface FreeBusyInfo {
  email: EmailAddress;
  slots: FreeBusySlot[];
  workingHours?: {
    start: string; // e.g., "09:00"
    end: string;   // e.g., "17:00"
    timezone: string;
  };
  error?: string;
}

/**
 * Available time slot suggestion
 */
export interface TimeSlotSuggestion {
  start: Date;
  end: Date;
  confidence: number; // 0-1, how good this slot is
  attendeeConflicts: number;
  attendeeAvailability: Array<{
    email: EmailAddress;
    status: 'free' | 'tentative' | 'busy' | 'unknown';
  }>;
}

/**
 * Main platform adapter interface
 * Each platform (Microsoft, Google, Apple) implements this interface
 */
export interface PlatformPort {
  readonly platform: Platform;
  readonly isAvailable: boolean;
  readonly isAuthenticated: boolean;

  // Authentication methods
  authenticate(): Promise<boolean>;
  refreshToken(): Promise<boolean>;
  isTokenValid(): Promise<boolean>;
  
  // Email operations
  fetchEmails(criteria: SearchCriteria): Promise<PlatformResult<Email[]>>;
  getEmail(id: string): Promise<PlatformResult<Email>>;
  sendEmail(email: Partial<Email>): Promise<PlatformResult<string>>;
  updateEmail(id: string, updates: Partial<Email>): Promise<PlatformResult<Email>>;
  deleteEmail(id: string): Promise<PlatformResult<boolean>>;
  searchEmails(query: string, criteria?: SearchCriteria): Promise<PlatformResult<Email[]>>;
  
  // Email batch operations
  batchEmailOperations(operations: BatchOperation<Email>[]): Promise<BatchResult<Email>>;
  
  // Calendar operations
  fetchEvents(criteria: SearchCriteria): Promise<PlatformResult<CalendarEvent[]>>;
  getEvent(id: string): Promise<PlatformResult<CalendarEvent>>;
  createEvent(event: Partial<CalendarEvent>): Promise<PlatformResult<string>>;
  updateEvent(id: string, updates: Partial<CalendarEvent>): Promise<PlatformResult<CalendarEvent>>;
  deleteEvent(id: string): Promise<PlatformResult<boolean>>;
  searchEvents(query: string, criteria?: SearchCriteria): Promise<PlatformResult<CalendarEvent[]>>;
  
  // Free/busy operations
  getFreeBusyInfo(emails: EmailAddress[], dateRange: DateRange): Promise<PlatformResult<FreeBusyInfo[]>>;
  findFreeTime(
    attendees: EmailAddress[],
    duration: number, // in minutes
    dateRange: DateRange,
    options?: {
      workingHoursOnly?: boolean;
      minConfidence?: number;
      maxSuggestions?: number;
    }
  ): Promise<PlatformResult<TimeSlotSuggestion[]>>;
  
  // Calendar batch operations
  batchEventOperations(operations: BatchOperation<CalendarEvent>[]): Promise<BatchResult<CalendarEvent>>;
  
  // Contact operations
  fetchContacts(criteria: SearchCriteria): Promise<PlatformResult<Contact[]>>;
  getContact(id: string): Promise<PlatformResult<Contact>>;
  createContact(contact: Partial<Contact>): Promise<PlatformResult<string>>;
  updateContact(id: string, updates: Partial<Contact>): Promise<PlatformResult<Contact>>;
  deleteContact(id: string): Promise<PlatformResult<boolean>>;
  searchContacts(query: string, criteria?: SearchCriteria): Promise<PlatformResult<Contact[]>>;
  
  // Contact batch operations
  batchContactOperations(operations: BatchOperation<Contact>[]): Promise<BatchResult<Contact>>;
  
  // Task operations
  fetchTasks(criteria: SearchCriteria): Promise<PlatformResult<Task[]>>;
  getTask(id: string): Promise<PlatformResult<Task>>;
  createTask(task: Partial<Task>): Promise<PlatformResult<string>>;
  updateTask(id: string, updates: Partial<Task>): Promise<PlatformResult<Task>>;
  deleteTask(id: string): Promise<PlatformResult<boolean>>;
  searchTasks(query: string, criteria?: SearchCriteria): Promise<PlatformResult<Task[]>>;
  
  // Task batch operations
  batchTaskOperations(operations: BatchOperation<Task>[]): Promise<BatchResult<Task>>;
  
  // File operations
  fetchFiles(criteria: SearchCriteria): Promise<PlatformResult<File[]>>;
  getFile(id: string): Promise<PlatformResult<File>>;
  uploadFile(file: {
    name: string;
    content: Buffer | ArrayBuffer;
    contentType: string;
    parentId?: string;
  }): Promise<PlatformResult<string>>;
  downloadFile(id: string): Promise<PlatformResult<Buffer>>;
  updateFile(id: string, updates: Partial<File>): Promise<PlatformResult<File>>;
  deleteFile(id: string): Promise<PlatformResult<boolean>>;
  searchFiles(query: string, criteria?: SearchCriteria): Promise<PlatformResult<File[]>>;
  
  // File batch operations
  batchFileOperations(operations: BatchOperation<File>[]): Promise<BatchResult<File>>;
  
  // Unified search across all data types
  unifiedSearch(query: string, options?: {
    types?: ('email' | 'event' | 'contact' | 'task' | 'file')[];
    limit?: number;
    dateRange?: DateRange;
  }): Promise<PlatformResult<{
    emails: Email[];
    events: CalendarEvent[];
    contacts: Contact[];
    tasks: Task[];
    files: File[];
  }>>;
  
  // Health and status
  healthCheck(): Promise<PlatformResult<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    latency: number;
    details?: Record<string, any>;
  }>>;
  
  // Sync operations
  getLastSyncTime(): Promise<Date | null>;
  sync(options?: {
    incremental?: boolean;
    types?: ('email' | 'event' | 'contact' | 'task' | 'file')[];
  }): Promise<PlatformResult<{
    synced: number;
    errors: number;
    duration: number;
  }>>;
  
  // Rate limiting information
  getRateLimitStatus(): Promise<{
    remaining: number;
    reset: Date;
    limit: number;
  }>;
  
  // Clean up resources
  dispose(): Promise<void>;
}

/**
 * Platform capability checker
 */
export interface PlatformCapabilityChecker {
  /**
   * Checks if the platform supports a specific operation
   */
  supports(operation: string): boolean;
  
  /**
   * Gets the list of supported operations
   */
  getSupportedOperations(): string[];
  
  /**
   * Gets platform-specific limitations
   */
  getLimitations(): Record<string, any>;
}

/**
 * Platform adapter factory interface
 */
export interface PlatformAdapterFactory {
  createAdapter(platform: Platform, config: Record<string, any>): Promise<PlatformPort>;
  destroyAdapter(platform: Platform): Promise<void>;
  getAvailableAdapters(): Platform[];
}

/**
 * Platform health monitor interface
 */
export interface PlatformHealthMonitor {
  checkHealth(platform: Platform): Promise<{
    isHealthy: boolean;
    latency: number;
    errors: string[];
    lastCheck: Date;
  }>;
  
  getHealthStatus(): Promise<Record<Platform, {
    isHealthy: boolean;
    latency: number;
    errors: string[];
    lastCheck: Date;
  }>>;
}

/**
 * Error types for platform operations
 */
export enum PlatformErrorType {
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_REQUEST = 'INVALID_REQUEST',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  SERVER_ERROR = 'SERVER_ERROR',
  TIMEOUT = 'TIMEOUT',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Platform error class
 */
export class PlatformError extends Error {
  constructor(
    public readonly type: PlatformErrorType,
    public readonly platform: Platform,
    message: string,
    public readonly statusCode?: number,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

/**
 * Platform adapter configuration
 */
export interface PlatformConfig {
  clientId: string;
  clientSecret?: string;
  tenantId?: string;
  redirectUri?: string;
  scopes: string[];
  apiVersion?: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  rateLimiting?: {
    requests: number;
    window: number; // in milliseconds
  };
  customProperties?: Record<string, any>;
}