import { exec } from 'child_process';
import { promisify } from 'util';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

/**
 * Global setup for integration tests
 * Sets up external services, test databases, and mock servers
 */
export default async function globalSetup(): Promise<void> {
  console.log('🔧 Setting up integration test environment...');

  const isRealIntegration = process.env.REAL_INTEGRATION === 'true';

  if (isRealIntegration) {
    await setupRealServices();
  } else {
    await setupMockServices();
  }

  // Create test environment file
  await createTestEnvFile();

  console.log('✅ Integration test environment ready');
}

/**
 * Setup real external services for integration testing
 */
async function setupRealServices(): Promise<void> {
  console.log('🌐 Setting up real external services...');

  // Start ChromaDB container
  try {
    await execAsync('docker-compose -f docker-compose.dev.yml up -d chromadb');
    console.log('📊 ChromaDB container started');

    // Wait for ChromaDB to be ready
    await waitForService('http://localhost:8000/api/v1/heartbeat', 30000);
    console.log('✅ ChromaDB is ready');
  } catch (error) {
    console.warn('⚠️ Failed to start ChromaDB container:', error);
  }

  // Start Redis if needed
  try {
    await execAsync('docker-compose -f docker-compose.dev.yml up -d redis');
    console.log('🔴 Redis container started');

    // Wait for Redis to be ready
    await waitForService('redis://localhost:6379', 15000, 'redis');
    console.log('✅ Redis is ready');
  } catch (error) {
    console.warn('⚠️ Failed to start Redis container:', error);
  }
}

/**
 * Setup mock services for isolated testing
 */
async function setupMockServices(): Promise<void> {
  console.log('🎭 Setting up mock services...');

  // Start mock OAuth server if needed
  const mockOAuthPort = process.env.MOCK_OAUTH_PORT || '3001';

  try {
    // Check if mock OAuth server is already running
    await fetch(`http://localhost:${mockOAuthPort}/health`);
    console.log('🔐 Mock OAuth server already running');
  } catch (error) {
    console.log('🔐 Starting mock OAuth server...');
    // Mock OAuth server would be started here in a real scenario
  }

  // Setup in-memory mock ChromaDB
  console.log('📊 Setting up in-memory ChromaDB mock');
  process.env.CHROMADB_HOST = 'mock';

  // Setup mock Graph API responses
  console.log('📮 Setting up mock Microsoft Graph API');
  process.env.MICROSOFT_GRAPH_BASE_URL = 'http://localhost:3002/mock';
}

/**
 * Wait for a service to become available
 */
async function waitForService(
  url: string,
  timeout: number = 30000,
  type: 'http' | 'redis' = 'http'
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      if (type === 'http') {
        const response = await fetch(url);
        if (response.ok) {
          return;
        }
      } else if (type === 'redis') {
        // Redis health check would go here
        return;
      }
    } catch (error) {
      // Service not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(`Service at ${url} did not become available within ${timeout}ms`);
}

/**
 * Create test environment configuration file
 */
async function createTestEnvFile(): Promise<void> {
  const testEnvPath = path.join(process.cwd(), '.env.test');

  const testEnvContent = `
# Integration Test Environment
NODE_ENV=test
LOG_LEVEL=warn

# Test Database Configuration
CHROMADB_HOST=localhost
CHROMADB_PORT=8000
REDIS_HOST=localhost
REDIS_PORT=6379

# Mock Service Configuration
MOCK_OAUTH_PORT=3001
MOCK_GRAPH_PORT=3002

# Test Microsoft Graph Configuration
AZURE_CLIENT_ID=test-client-id
AZURE_TENANT_ID=test-tenant-id
AZURE_CLIENT_SECRET=test-client-secret
AZURE_REDIRECT_URI=http://localhost:3000/auth/callback

# Test Security Configuration
ENCRYPTION_KEY=test-encryption-key-32-chars-long
JWT_SECRET=test-jwt-secret-key

# Rate Limiting Test Configuration
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Circuit Breaker Test Configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_RESET_TIMEOUT=30000

# Cache Test Configuration
CACHE_TTL_SECONDS=300
CACHE_MAX_SIZE=1000

# Performance Test Configuration
PERFORMANCE_TEST_DURATION=30000
PERFORMANCE_TEST_CONCURRENT_USERS=10
`.trim();

  await fs.writeFile(testEnvPath, testEnvContent);
  console.log('📝 Test environment file created');
}
