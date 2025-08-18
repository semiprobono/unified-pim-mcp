/**
 * Cache layer types
 */
export type CacheLayer = 'memory' | 'chromadb' | 'file' | 'redis';

/**
 * Cache entry metadata
 */
export interface CacheEntryMetadata {
  key: string;
  createdAt: Date;
  expiresAt?: Date;
  lastAccessedAt: Date;
  hitCount: number;
  size: number;
  tags?: string[];
  version?: string;
  checksum?: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictionCount: number;
  averageAccessTime: number;
  oldestEntry?: Date;
  newestEntry?: Date;
  memoryUsage?: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  ttl?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum cache size (entries or bytes)
  maxMemory?: number; // Maximum memory usage in bytes
  evictionPolicy?: 'lru' | 'lfu' | 'fifo' | 'ttl';
  compressionEnabled?: boolean;
  encryptionEnabled?: boolean;
  persistToDisk?: boolean;
  syncInterval?: number;
  customProperties?: Record<string, any>;
}

/**
 * Cache query options
 */
export interface CacheQueryOptions {
  includeTags?: string[];
  excludeTags?: string[];
  minAge?: number;
  maxAge?: number;
  sortBy?: 'createdAt' | 'lastAccessedAt' | 'size' | 'hitCount';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Base cache interface
 */
export interface CachePort {
  readonly layer: CacheLayer;
  readonly isAvailable: boolean;
  readonly config: CacheConfig;

  // Basic operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  
  // Batch operations
  getMany<T>(keys: string[]): Promise<(T | null)[]>;
  setMany<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void>;
  deleteMany(keys: string[]): Promise<number>;
  
  // Pattern operations
  keys(pattern?: string): Promise<string[]>;
  clear(): Promise<void>;
  
  // TTL operations
  expire(key: string, ttl: number): Promise<boolean>;
  ttl(key: string): Promise<number | null>;
  persist(key: string): Promise<boolean>;
  
  // Metadata operations
  getMetadata(key: string): Promise<CacheEntryMetadata | null>;
  updateMetadata(key: string, metadata: Partial<CacheEntryMetadata>): Promise<boolean>;
  
  // Statistics
  getStats(): Promise<CacheStats>;
  resetStats(): Promise<void>;
  
  // Tagging
  tag(key: string, tags: string[]): Promise<void>;
  getByTag(tag: string): Promise<string[]>;
  clearByTag(tag: string): Promise<number>;
  
  // Health and maintenance
  healthCheck(): Promise<{
    isHealthy: boolean;
    latency: number;
    errors: string[];
    memoryUsage?: number;
  }>;
  
  optimize(): Promise<void>;
  cleanup(): Promise<number>; // Returns number of cleaned entries
  
  // Event handling
  onEviction?: (key: string, value: any, reason: 'expired' | 'size' | 'manual') => void;
  onError?: (error: Error, operation: string, key?: string) => void;
  
  // Lifecycle
  initialize(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Multi-layer cache manager interface
 */
export interface MultiLayerCachePort {
  readonly layers: CacheLayer[];
  readonly primaryLayer: CacheLayer;

  // Multi-layer operations
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  
  // Layer-specific operations
  getFromLayer<T>(layer: CacheLayer, key: string): Promise<T | null>;
  setToLayer<T>(layer: CacheLayer, key: string, value: T, ttl?: number): Promise<void>;
  deleteFromLayer(layer: CacheLayer, key: string): Promise<boolean>;
  
  // Synchronization
  syncLayers(key: string): Promise<void>;
  warmupCache(keys: string[]): Promise<void>;
  
  // Statistics per layer
  getLayerStats(layer: CacheLayer): Promise<CacheStats>;
  getAllStats(): Promise<Record<CacheLayer, CacheStats>>;
  
  // Configuration
  configureLayer(layer: CacheLayer, config: CacheConfig): Promise<void>;
  getLayerConfig(layer: CacheLayer): CacheConfig;
}

/**
 * Vector cache interface for semantic search (ChromaDB)
 */
export interface VectorCachePort extends CachePort {
  // Vector operations
  addVector(key: string, vector: number[], metadata?: Record<string, any>): Promise<void>;
  addVectors(entries: Array<{
    key: string;
    vector: number[];
    metadata?: Record<string, any>;
  }>): Promise<void>;
  
  // Similarity search
  queryVector(
    vector: number[],
    limit?: number,
    threshold?: number
  ): Promise<Array<{
    key: string;
    score: number;
    metadata?: Record<string, any>;
  }>>;
  
  queryText(
    text: string,
    limit?: number,
    threshold?: number
  ): Promise<Array<{
    key: string;
    score: number;
    metadata?: Record<string, any>;
  }>>;
  
  // Collections management
  createCollection(name: string, metadata?: Record<string, any>): Promise<void>;
  deleteCollection(name: string): Promise<boolean>;
  listCollections(): Promise<string[]>;
  setCurrentCollection(name: string): Promise<void>;
  
  // Advanced queries
  queryWithFilters(
    vector: number[],
    filters: Record<string, any>,
    limit?: number
  ): Promise<Array<{
    key: string;
    score: number;
    metadata?: Record<string, any>;
  }>>;
  
  // Embeddings
  generateEmbedding(text: string): Promise<number[]>;
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}

/**
 * Distributed cache interface (Redis)
 */
export interface DistributedCachePort extends CachePort {
  // Distributed operations
  publish(channel: string, message: any): Promise<number>;
  subscribe(channel: string, handler: (message: any) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  
  // Lock operations
  acquireLock(key: string, ttl: number): Promise<boolean>;
  releaseLock(key: string): Promise<boolean>;
  renewLock(key: string, ttl: number): Promise<boolean>;
  
  // Atomic operations
  increment(key: string, amount?: number): Promise<number>;
  decrement(key: string, amount?: number): Promise<number>;
  
  // Set operations
  sadd(key: string, members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, members: string[]): Promise<number>;
  
  // Hash operations
  hset(key: string, field: string, value: any): Promise<boolean>;
  hget(key: string, field: string): Promise<any>;
  hdel(key: string, fields: string[]): Promise<number>;
  hgetall(key: string): Promise<Record<string, any>>;
  
  // List operations
  lpush(key: string, values: any[]): Promise<number>;
  rpush(key: string, values: any[]): Promise<number>;
  lpop(key: string): Promise<any>;
  rpop(key: string): Promise<any>;
  lrange(key: string, start: number, stop: number): Promise<any[]>;
}

/**
 * Cache factory interface
 */
export interface CacheFactory {
  createCache(layer: CacheLayer, config: CacheConfig): Promise<CachePort>;
  createMultiLayerCache(
    layers: Array<{ layer: CacheLayer; config: CacheConfig }>,
    primaryLayer: CacheLayer
  ): Promise<MultiLayerCachePort>;
  createVectorCache(config: CacheConfig): Promise<VectorCachePort>;
  createDistributedCache(config: CacheConfig): Promise<DistributedCachePort>;
}

/**
 * Cache error types
 */
export enum CacheErrorType {
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
  CAPACITY_ERROR = 'CAPACITY_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Cache error class
 */
export class CacheError extends Error {
  constructor(
    public readonly type: CacheErrorType,
    public readonly layer: CacheLayer,
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'CacheError';
  }
}

/**
 * Cache event types
 */
export interface CacheEvents {
  hit: { key: string; layer: CacheLayer };
  miss: { key: string; layers: CacheLayer[] };
  set: { key: string; layer: CacheLayer; size: number };
  delete: { key: string; layer: CacheLayer };
  evict: { key: string; layer: CacheLayer; reason: string };
  error: { error: CacheError; operation: string; key?: string };
  sync: { key: string; fromLayer: CacheLayer; toLayer: CacheLayer };
  cleanup: { layer: CacheLayer; cleanedEntries: number };
}

/**
 * Cache event emitter interface
 */
export interface CacheEventEmitter {
  on<K extends keyof CacheEvents>(event: K, listener: (data: CacheEvents[K]) => void): void;
  off<K extends keyof CacheEvents>(event: K, listener: (data: CacheEvents[K]) => void): void;
  emit<K extends keyof CacheEvents>(event: K, data: CacheEvents[K]): void;
}