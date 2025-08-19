/**
 * Mock ChromaDB implementation for testing
 */

import { ChromaApi } from 'chromadb';

/**
 * Mock ChromaDB Collection
 */
export class MockChromaCollection {
  private documents: Map<string, any> = new Map();
  private metadata: Map<string, any> = new Map();
  private embeddings: Map<string, number[]> = new Map();

  constructor(private name: string) {}

  async add(params: {
    ids: string[];
    documents?: string[];
    metadatas?: any[];
    embeddings?: number[][];
  }): Promise<void> {
    params.ids.forEach((id, index) => {
      if (params.documents) {
        this.documents.set(id, params.documents[index]);
      }
      if (params.metadatas) {
        this.metadata.set(id, params.metadatas[index]);
      }
      if (params.embeddings) {
        this.embeddings.set(id, params.embeddings[index]);
      }
    });
  }

  async update(params: {
    ids: string[];
    documents?: string[];
    metadatas?: any[];
    embeddings?: number[][];
  }): Promise<void> {
    // Same as add for mock purposes
    await this.add(params);
  }

  async upsert(params: {
    ids: string[];
    documents?: string[];
    metadatas?: any[];
    embeddings?: number[][];
  }): Promise<void> {
    // Same as add for mock purposes
    await this.add(params);
  }

  async get(params?: {
    ids?: string[];
    where?: any;
    limit?: number;
    offset?: number;
    include?: ('documents' | 'metadatas' | 'embeddings' | 'distances')[];
  }): Promise<{
    ids: string[];
    documents?: string[];
    metadatas?: any[];
    embeddings?: number[][];
  }> {
    let ids: string[] = [];

    if (params?.ids) {
      ids = params.ids.filter(id => this.documents.has(id) || this.metadata.has(id));
    } else {
      ids = Array.from(this.documents.keys());
    }

    // Apply limit and offset
    if (params?.offset) {
      ids = ids.slice(params.offset);
    }
    if (params?.limit) {
      ids = ids.slice(0, params.limit);
    }

    const result: any = { ids };

    if (!params?.include || params.include.includes('documents')) {
      result.documents = ids.map(id => this.documents.get(id)).filter(Boolean);
    }
    if (!params?.include || params.include.includes('metadatas')) {
      result.metadatas = ids.map(id => this.metadata.get(id)).filter(Boolean);
    }
    if (!params?.include || params.include.includes('embeddings')) {
      result.embeddings = ids.map(id => this.embeddings.get(id)).filter(Boolean);
    }

    return result;
  }

  async query(params: {
    queryTexts?: string[];
    queryEmbeddings?: number[][];
    nResults?: number;
    where?: any;
    include?: ('documents' | 'metadatas' | 'embeddings' | 'distances')[];
  }): Promise<{
    ids: string[][];
    documents?: string[][];
    metadatas?: any[][];
    embeddings?: number[][][];
    distances?: number[][];
  }> {
    // Mock search results
    const allIds = Array.from(this.documents.keys());
    const nResults = params.nResults || 10;
    const resultIds = allIds.slice(0, nResults);

    const result: any = {
      ids: [resultIds],
    };

    if (!params.include || params.include.includes('documents')) {
      result.documents = [resultIds.map(id => this.documents.get(id)).filter(Boolean)];
    }
    if (!params.include || params.include.includes('metadatas')) {
      result.metadatas = [resultIds.map(id => this.metadata.get(id)).filter(Boolean)];
    }
    if (!params.include || params.include.includes('embeddings')) {
      result.embeddings = [resultIds.map(id => this.embeddings.get(id)).filter(Boolean)];
    }
    if (!params.include || params.include.includes('distances')) {
      result.distances = [resultIds.map(() => Math.random())]; // Random distances for mock
    }

    return result;
  }

  async delete(params?: { ids?: string[]; where?: any }): Promise<void> {
    if (params?.ids) {
      params.ids.forEach(id => {
        this.documents.delete(id);
        this.metadata.delete(id);
        this.embeddings.delete(id);
      });
    } else {
      // Delete all if no specific ids
      this.documents.clear();
      this.metadata.clear();
      this.embeddings.clear();
    }
  }

  async count(): Promise<number> {
    return this.documents.size;
  }

  /**
   * Test compatibility methods that match ChromaDbInitializer interface
   */
  async addDocuments(
    collectionName: string,
    documents: Array<{
      id: string;
      content: string;
      metadata: Record<string, any>;
    }>,
    ids?: string[],
    embeddings?: number[][]
  ): Promise<void> {
    // For mock, just store in current collection
    const params = {
      ids: ids || documents.map(doc => doc.id),
      documents: documents.map(doc => doc.content),
      metadatas: documents.map(doc => doc.metadata),
      embeddings: embeddings,
    };
    await this.add(params);
  }

  async deleteDocuments(params: {
    collection: string;
    ids: string[];
  }): Promise<void> {
    await this.delete({ ids: params.ids });
  }

  async updateDocuments(
    collectionName: string,
    ids: string[],
    documents: Array<{
      content?: string;
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    const params = {
      ids,
      documents: documents.map(doc => doc.content).filter(Boolean),
      metadatas: documents.map(doc => doc.metadata).filter(Boolean),
    };
    await this.update(params);
  }

  async searchDocuments(
    collectionName: string,
    query: string,
    options?: {
      limit?: number;
      where?: Record<string, any>;
    }
  ): Promise<Array<{
    id: string;
    content: string;
    metadata: Record<string, any>;
    distance?: number;
  }>> {
    const results = await this.query({
      queryTexts: [query],
      nResults: options?.limit || 10,
      where: options?.where,
      include: ['documents', 'metadatas', 'distances'],
    });

    if (!results.documents?.[0] || !results.ids?.[0]) {
      return [];
    }

    return results.ids[0].map((id, index) => ({
      id,
      content: (results.documents?.[0]?.[index] as string) || '',
      metadata: (results.metadatas?.[0]?.[index] as Record<string, any>) || {},
      distance: results.distances?.[0]?.[index],
    }));
  }

  async ensureCollection(name: string, config?: any): Promise<void> {
    // Mock implementation - do nothing as collection already "exists"
  }

  // Test utilities
  getName(): string {
    return this.name;
  }

  getSize(): number {
    return this.documents.size;
  }

  hasDocument(id: string): boolean {
    return this.documents.has(id) || this.metadata.has(id);
  }

  clear(): void {
    this.documents.clear();
    this.metadata.clear();
    this.embeddings.clear();
  }
}

/**
 * Mock ChromaDB Client
 */
export class MockChromaClient {
  private collections: Map<string, MockChromaCollection> = new Map();
  private shouldFail = false;
  private failureError: Error = new Error('Mock ChromaDB failure');

  async createCollection(params: {
    name: string;
    metadata?: any;
    embeddingFunction?: any;
  }): Promise<MockChromaCollection> {
    if (this.shouldFail) {
      throw this.failureError;
    }

    const collection = new MockChromaCollection(params.name);
    this.collections.set(params.name, collection);
    return collection;
  }

  async getOrCreateCollection(params: {
    name: string;
    metadata?: any;
    embeddingFunction?: any;
  }): Promise<MockChromaCollection> {
    if (this.shouldFail) {
      throw this.failureError;
    }

    if (this.collections.has(params.name)) {
      return this.collections.get(params.name)!;
    }

    return this.createCollection(params);
  }

  async getCollection(params: {
    name: string;
    embeddingFunction?: any;
  }): Promise<MockChromaCollection> {
    if (this.shouldFail) {
      throw this.failureError;
    }

    const collection = this.collections.get(params.name);
    if (!collection) {
      throw new Error(`Collection ${params.name} not found`);
    }

    return collection;
  }

  async listCollections(): Promise<{ name: string; metadata?: any }[]> {
    if (this.shouldFail) {
      throw this.failureError;
    }

    return Array.from(this.collections.keys()).map(name => ({ name }));
  }

  async deleteCollection(params: { name: string }): Promise<void> {
    if (this.shouldFail) {
      throw this.failureError;
    }

    this.collections.delete(params.name);
  }

  async reset(): Promise<void> {
    if (this.shouldFail) {
      throw this.failureError;
    }

    this.collections.clear();
  }

  async version(): Promise<string> {
    return '0.4.0-mock';
  }

  async heartbeat(): Promise<number> {
    if (this.shouldFail) {
      throw this.failureError;
    }

    return Date.now();
  }

  // Test utilities
  setShouldFail(fail: boolean, error?: Error): void {
    this.shouldFail = fail;
    if (error) {
      this.failureError = error;
    }
  }

  getCollectionCount(): number {
    return this.collections.size;
  }

  hasCollection(name: string): boolean {
    return this.collections.has(name);
  }

  clearAllCollections(): void {
    this.collections.clear();
  }

  getCollection(name: string): MockChromaCollection | undefined {
    return this.collections.get(name);
  }

  /**
   * Test compatibility methods that match ChromaDbInitializer interface
   */
  async addDocuments(
    collectionName: string,
    documents: Array<{
      id: string;
      content: string;
      metadata: Record<string, any>;
    }>,
    ids?: string[],
    embeddings?: number[][]
  ): Promise<void> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }
    await collection.addDocuments(collectionName, documents, ids, embeddings);
  }

  async deleteDocuments(params: {
    collection: string;
    ids: string[];
  }): Promise<void> {
    const collection = this.collections.get(params.collection);
    if (!collection) {
      throw new Error(`Collection ${params.collection} not found`);
    }
    await collection.deleteDocuments(params);
  }

  async updateDocuments(
    collectionName: string,
    ids: string[],
    documents: Array<{
      content?: string;
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }
    await collection.updateDocuments(collectionName, ids, documents);
  }

  async searchDocuments(
    collectionName: string,
    query: string,
    options?: {
      limit?: number;
      where?: Record<string, any>;
    }
  ): Promise<Array<{
    id: string;
    content: string;
    metadata: Record<string, any>;
    distance?: number;
  }>> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} not found`);
    }
    return collection.searchDocuments(collectionName, query, options);
  }

  async ensureCollection(name: string, config?: any): Promise<void> {
    if (!this.collections.has(name)) {
      await this.createCollection({ name, metadata: config?.metadata });
    }
  }
}

/**
 * Global mock client instance
 */
export const mockChromaClient = new MockChromaClient();

/**
 * Mock ChromaAPI factory
 */
export const mockChromaApi = {
  ChromaApi: jest.fn().mockImplementation(() => mockChromaClient),
};

/**
 * Jest mock for chromadb module
 */
export const chromaDbMock = {
  ChromaApi: jest.fn().mockImplementation(() => mockChromaClient),
  Collection: MockChromaCollection,
};

/**
 * Helper functions for tests
 */
export const chromaDbTestHelpers = {
  resetMock: () => {
    mockChromaClient.clearAllCollections();
    mockChromaClient.setShouldFail(false);
    jest.clearAllMocks();
  },

  simulateFailure: (error?: Error) => {
    mockChromaClient.setShouldFail(true, error);
  },

  createMockCollection: async (
    name: string,
    documents: Array<{ id: string; content: string; metadata?: any }> = []
  ) => {
    const collection = await mockChromaClient.createCollection({ name });

    if (documents.length > 0) {
      await collection.add({
        ids: documents.map(d => d.id),
        documents: documents.map(d => d.content),
        metadatas: documents.map(d => d.metadata || {}),
      });
    }

    return collection;
  },

  addDocumentsToCollection: async (
    collection: MockChromaCollection,
    documents: Array<{ id: string; content: string; metadata?: any }>
  ) => {
    await collection.add({
      ids: documents.map(d => d.id),
      documents: documents.map(d => d.content),
      metadatas: documents.map(d => d.metadata || {}),
    });
  },

  simulateSlowOperation: (delayMs: number = 1000) => {
    const originalGet = mockChromaClient.getCollection;
    mockChromaClient.getCollection = jest.fn().mockImplementation(async (params: any) => {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return originalGet.call(mockChromaClient, params);
    });
  },

  getStats: () => ({
    totalCollections: mockChromaClient.getCollectionCount(),
    collections: Array.from((mockChromaClient as any).collections.entries()).map(
      ([name, collection]: [string, MockChromaCollection]) => ({
        name,
        size: collection.getSize(),
      })
    ),
  }),
};

/**
 * Mock embedding function for tests
 */
export const mockEmbeddingFunction = {
  generate: jest.fn().mockImplementation((texts: string[]) => {
    // Generate mock embeddings (random vectors)
    return texts.map(() => Array.from({ length: 384 }, () => Math.random()));
  }),
};

/**
 * Test scenarios for ChromaDB operations
 */
export const chromaDbTestScenarios = {
  success: () => {
    chromaDbTestHelpers.resetMock();
  },

  connectionFailure: () => {
    chromaDbTestHelpers.resetMock();
    chromaDbTestHelpers.simulateFailure(new Error('Connection refused'));
  },

  collectionNotFound: () => {
    chromaDbTestHelpers.resetMock();
    // Will throw when trying to get a non-existent collection
  },

  performanceDegradation: (delayMs: number = 2000) => {
    chromaDbTestHelpers.resetMock();
    chromaDbTestHelpers.simulateSlowOperation(delayMs);
  },

  memoryPressure: () => {
    chromaDbTestHelpers.resetMock();
    chromaDbTestHelpers.simulateFailure(new Error('Out of memory'));
  },
};
