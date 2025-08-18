import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

/**
 * Global teardown for integration tests
 * Cleans up external services, test databases, and temporary files
 */
export default async function globalTeardown(): Promise<void> {
  console.log('🧹 Cleaning up integration test environment...');
  
  const isRealIntegration = process.env.REAL_INTEGRATION === 'true';
  
  if (isRealIntegration) {
    await cleanupRealServices();
  } else {
    await cleanupMockServices();
  }
  
  // Cleanup test files
  await cleanupTestFiles();
  
  console.log('✅ Integration test environment cleaned up');
}

/**
 * Cleanup real external services
 */
async function cleanupRealServices(): Promise<void> {
  console.log('🌐 Cleaning up real external services...');
  
  try {
    // Stop Docker containers but don't remove volumes (for development)
    await execAsync('docker-compose -f docker-compose.dev.yml stop');
    console.log('🐳 Docker containers stopped');
  } catch (error) {
    console.warn('⚠️ Failed to stop Docker containers:', error);
  }
}

/**
 * Cleanup mock services
 */
async function cleanupMockServices(): Promise<void> {
  console.log('🎭 Cleaning up mock services...');
  
  // Mock services cleanup would go here
  // For now, just log that we're cleaning up mocks
  console.log('🎭 Mock services cleaned up');
}

/**
 * Cleanup test files and temporary data
 */
async function cleanupTestFiles(): Promise<void> {
  console.log('📁 Cleaning up test files...');
  
  const filesToCleanup = [
    '.env.test',
    'test-*.log',
    'integration-test-*.json'
  ];
  
  for (const filePattern of filesToCleanup) {
    try {
      const filePath = path.join(process.cwd(), filePattern);
      
      // Check if file exists before trying to delete
      try {
        await fs.access(filePath);
        await fs.unlink(filePath);
        console.log(`🗑️ Removed ${filePattern}`);
      } catch (error) {
        // File doesn't exist, which is fine
      }
    } catch (error) {
      console.warn(`⚠️ Failed to cleanup ${filePattern}:`, error);
    }
  }
  
  // Cleanup test cache directories
  const cacheDirs = [
    'node_modules/.cache/jest-integration',
    'coverage/integration/.temp'
  ];
  
  for (const dir of cacheDirs) {
    try {
      const dirPath = path.join(process.cwd(), dir);
      await fs.rmdir(dirPath, { recursive: true });
      console.log(`🗑️ Removed cache directory ${dir}`);
    } catch (error) {
      // Directory doesn't exist or couldn't be removed, which is fine
    }
  }
}

/**
 * Force cleanup any remaining processes
 */
process.on('exit', () => {
  console.log('🏁 Integration test process exiting');
});

process.on('SIGINT', async () => {
  console.log('🛑 Received SIGINT, cleaning up...');
  await globalTeardown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🛑 Received SIGTERM, cleaning up...');
  await globalTeardown();
  process.exit(0);
});