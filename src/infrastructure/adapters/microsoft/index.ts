// Authentication exports
export { MsalConfig } from './auth/MsalConfig.js';
export { MsalAuthProvider, TokenCacheEntry } from './auth/MsalAuthProvider.js';
export { TokenRefreshService } from './auth/TokenRefreshService.js';

// Client exports
export { GraphClient, GraphRequestOptions, BatchRequestItem, BatchResponseItem } from './clients/GraphClient.js';
export { RateLimiter, RateLimitConfig, RateLimitStatus } from './clients/RateLimiter.js';
export { CircuitBreaker, CircuitBreakerConfig, CircuitState, CircuitBreakerStats } from './clients/CircuitBreaker.js';

// Cache exports
export { ChromaDbInitializer, GraphCollections, CacheEntry, SearchIndexEntry, SyncMetadata } from './cache/ChromaDbInitializer.js';
export { CacheManager, CacheConfig } from './cache/CacheManager.js';

// Error exports
export { GraphError, GraphErrorCode, GraphErrorResponse, ERROR_CODE_MAP, shouldRefreshToken, extractErrorDetails } from './errors/GraphErrors.js';
export { ErrorHandler, ErrorHandlerConfig } from './errors/ErrorHandler.js';

// Service exports
export { EmailService, EmailQueryOptions, EmailSearchResult } from './services/index.js';

// Mapper exports
export { EmailMapper } from './mappers/index.js';

// Main adapter export
export { GraphAdapter } from './GraphAdapter.js';