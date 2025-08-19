// Authentication exports
export { GoogleAuthConfig } from './auth/GoogleAuthConfig.js';
export { GoogleAuthProvider, GoogleTokenCacheEntry } from './auth/GoogleAuthProvider.js';
export { TokenRefreshService } from './auth/TokenRefreshService.js';

// Client exports
export {
  GoogleClient,
  GoogleRequestOptions,
  BatchRequestItem,
  BatchResponseItem,
} from './clients/GoogleClient.js';
export { RateLimiter, RateLimitConfig, RateLimitStatus } from './clients/RateLimiter.js';
export {
  CircuitBreaker,
  CircuitBreakerConfig,
  CircuitState,
  CircuitBreakerStats,
} from './clients/CircuitBreaker.js';

// Cache exports
export {
  ChromaDbInitializer,
  GoogleCollections,
  CacheEntry,
  SearchIndexEntry,
  SyncMetadata,
} from './cache/ChromaDbInitializer.js';
export { CacheManager, CacheConfig } from './cache/CacheManager.js';

// Error exports
export {
  GoogleError,
  GoogleErrorCode,
  GoogleErrorResponse,
  ERROR_CODE_MAP,
  shouldRefreshToken,
  extractErrorDetails,
} from './errors/GoogleErrors.js';
export { ErrorHandler, ErrorHandlerConfig } from './errors/ErrorHandler.js';

// Service exports
export { 
  EmailService, 
  EmailQueryOptions, 
  EmailSearchResult,
  CalendarService,
  CalendarQueryOptions,
  CalendarSearchResult,
  FreeTimeOptions,
  FreeTimeSlot,
  ContactsService,
  ContactQueryOptions,
  ContactSearchResult,
  TaskService,
  TaskQueryOptions,
  TaskSearchResult,
  CreateTaskInput,
  UpdateTaskInput,
  FileService,
  FileQueryOptions,
  FileSearchResult,
  FileMetadataInput,
  SharePermissionsInput,
  NotesService,
  NoteQueryOptions,
  NoteSearchResult,
  CreateNotebookInput,
  CreateSectionInput,
  CreatePageInput,
  UpdateNoteInput
} from './services/index.js';

// Mapper exports
export { EmailMapper, CalendarMapper, ContactsMapper, TaskMapper, FileMapper, NotesMapper } from './mappers/index.js';

// Main adapter export
export { GoogleAdapter } from './GoogleAdapter.js';