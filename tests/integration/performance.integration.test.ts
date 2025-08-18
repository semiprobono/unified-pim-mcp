import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';
import { UnifiedPIMMain } from '../../src/index.js';
import { GraphApiMockStrategy, ChromaDbMockStrategy } from '../mocks/advancedMockStrategies.js';
import { EmailDataGenerator } from '../fixtures/testDataGenerator.js';
import { testConfig } from './setup.integration.js';

/**
 * Performance and Load Testing for Integration Scenarios
 * 
 * Tests system performance under various conditions:
 * 1. Throughput benchmarks for all MCP tools
 * 2. Concurrent user load testing
 * 3. Memory usage and leak detection
 * 4. Database and cache performance
 * 5. Network latency impact analysis
 * 6. Resource utilization monitoring
 * 7. Stress testing and breaking points
 * 8. Performance regression detection
 */

interface PerformanceMetrics {
  operationsPerSecond: number;
  averageResponseTime: number;
  medianResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  memoryUsageMB: number;
  memoryLeakDetected: boolean;
  errorRate: number;
  throughput: number;
}

interface LoadTestResult {
  scenario: string;
  duration: number;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  metrics: PerformanceMetrics;
  resourceUtilization: {
    cpuUsage: number;
    memoryUsage: number;
    cacheHitRate: number;
    dbConnections: number;
  };
}

class PerformanceMonitor extends EventEmitter {
  private responseTimes: number[] = [];
  private memorySnapshots: number[] = [];
  private startTime: number = 0;
  private operations: { timestamp: number; success: boolean; duration: number }[] = [];

  start(): void {
    this.startTime = performance.now();
    this.responseTimes = [];
    this.memorySnapshots = [];
    this.operations = [];
    
    // Start memory monitoring
    this.startMemoryMonitoring();
  }

  recordOperation(duration: number, success: boolean): void {
    this.responseTimes.push(duration);
    this.operations.push({
      timestamp: performance.now(),
      success,
      duration
    });
  }

  stop(): PerformanceMetrics {
    const totalDuration = performance.now() - this.startTime;
    const successfulOps = this.operations.filter(op => op.success);
    const failedOps = this.operations.filter(op => !op.success);

    // Calculate response time percentiles
    const sortedTimes = [...this.responseTimes].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    const medianIndex = Math.floor(sortedTimes.length * 0.5);

    // Detect memory leaks
    const memoryLeakDetected = this.detectMemoryLeak();

    return {
      operationsPerSecond: (this.operations.length / totalDuration) * 1000,
      averageResponseTime: this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length || 0,
      medianResponseTime: sortedTimes[medianIndex] || 0,
      p95ResponseTime: sortedTimes[p95Index] || 0,
      p99ResponseTime: sortedTimes[p99Index] || 0,
      memoryUsageMB: process.memoryUsage().heapUsed / 1024 / 1024,
      memoryLeakDetected,
      errorRate: failedOps.length / this.operations.length,
      throughput: successfulOps.length
    };
  }

  private startMemoryMonitoring(): void {
    const interval = setInterval(() => {
      this.memorySnapshots.push(process.memoryUsage().heapUsed);
    }, 1000);

    // Stop monitoring after a reasonable time
    setTimeout(() => clearInterval(interval), 60000);
  }

  private detectMemoryLeak(): boolean {
    if (this.memorySnapshots.length < 10) return false;

    // Simple leak detection: check if memory consistently increases
    const recent = this.memorySnapshots.slice(-10);
    const initial = this.memorySnapshots.slice(0, 10);
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const initialAvg = initial.reduce((a, b) => a + b, 0) / initial.length;
    
    // Consider it a leak if memory increased by more than 50%
    return (recentAvg - initialAvg) / initialAvg > 0.5;
  }
}

describe('Performance and Load Testing', () => {
  let pimApp: UnifiedPIMMain;
  let graphMock: GraphApiMockStrategy;
  let chromaMock: ChromaDbMockStrategy;
  let performanceMonitor: PerformanceMonitor;
  let mockServer: any;

  beforeAll(async () => {
    // Setup mocks
    graphMock = new GraphApiMockStrategy({
      enableLogging: true,
      persistData: false,
      simulateRateLimit: false
    });
    await graphMock.setup();

    chromaMock = new ChromaDbMockStrategy();
    await chromaMock.setup();

    // Initialize application
    pimApp = new UnifiedPIMMain();
    performanceMonitor = new PerformanceMonitor();

    // Setup mock MCP client
    mockServer = {
      async callTool(name: string, args: any = {}): Promise<any> {
        const start = performance.now();
        try {
          const result = await pimApp['pimServer']?.executeTool(name, args);
          const duration = performance.now() - start;
          performanceMonitor.recordOperation(duration, true);
          return result;
        } catch (error) {
          const duration = performance.now() - start;
          performanceMonitor.recordOperation(duration, false);
          throw error;
        }
      }
    };
  });

  afterAll(async () => {
    await graphMock?.teardown();
    await chromaMock?.teardown();
    
    // Graceful shutdown
    if (pimApp) {
      process.emit('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  });

  beforeEach(async () => {
    performanceMonitor = new PerformanceMonitor();
    
    // Clear any performance counters
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(async () => {
    // Clean up after each test
  });

  describe('Throughput Benchmarks', () => {
    test('should measure authentication tool performance', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        performanceMonitor.start();

        // Benchmark authentication operations
        const authOperations = 100;
        const promises = [];

        for (let i = 0; i < authOperations; i++) {
          promises.push(
            mockServer.callTool('pim_auth_start', {
              platform: 'microsoft',
              userId: `benchmark-user-${i}`
            })
          );

          // Add some delay to prevent overwhelming
          if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        }

        await Promise.all(promises);
        const metrics = performanceMonitor.stop();

        console.log('🔐 Authentication Tool Benchmark Results:');
        console.log(`   Operations/second: ${metrics.operationsPerSecond.toFixed(2)}`);
        console.log(`   Average response time: ${metrics.averageResponseTime.toFixed(2)}ms`);
        console.log(`   P95 response time: ${metrics.p95ResponseTime.toFixed(2)}ms`);
        console.log(`   Error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);

        // Performance assertions
        expect(metrics.operationsPerSecond).toBeGreaterThan(10); // At least 10 ops/sec
        expect(metrics.averageResponseTime).toBeLessThan(1000); // Under 1 second
        expect(metrics.errorRate).toBeLessThan(0.05); // Less than 5% error rate

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 60000);

    test('should measure email operation performance', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        // Authenticate first
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'perf-user' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'perf-code', 
          state: 'perf-state' 
        });

        performanceMonitor.start();

        // Mixed email operations benchmark
        const operations = [
          // Email searches
          ...Array.from({ length: 50 }, (_, i) => 
            () => mockServer.callTool('pim_email_search', {
              query: `performance test ${i}`,
              platform: 'microsoft',
              limit: 10
            })
          ),
          // Email gets
          ...Array.from({ length: 30 }, (_, i) =>
            () => mockServer.callTool('pim_email_get', {
              emailId: `perf-email-${i}`,
              platform: 'microsoft'
            })
          ),
          // Email sends
          ...Array.from({ length: 20 }, (_, i) =>
            () => mockServer.callTool('pim_email_send', {
              to: [`recipient${i}@test.com`],
              subject: `Performance Test ${i}`,
              body: 'Performance testing email',
              platform: 'microsoft'
            })
          )
        ];

        // Execute operations with controlled concurrency
        const concurrency = 5;
        const results = [];
        
        for (let i = 0; i < operations.length; i += concurrency) {
          const batch = operations.slice(i, i + concurrency);
          const batchResults = await Promise.allSettled(
            batch.map(op => op())
          );
          results.push(...batchResults);

          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        const metrics = performanceMonitor.stop();

        console.log('📧 Email Operations Benchmark Results:');
        console.log(`   Total operations: ${operations.length}`);
        console.log(`   Operations/second: ${metrics.operationsPerSecond.toFixed(2)}`);
        console.log(`   Average response time: ${metrics.averageResponseTime.toFixed(2)}ms`);
        console.log(`   P95 response time: ${metrics.p95ResponseTime.toFixed(2)}ms`);
        console.log(`   Error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
        console.log(`   Memory usage: ${metrics.memoryUsageMB.toFixed(2)}MB`);

        // Performance assertions
        expect(metrics.operationsPerSecond).toBeGreaterThan(5); // At least 5 ops/sec
        expect(metrics.averageResponseTime).toBeLessThan(2000); // Under 2 seconds
        expect(metrics.errorRate).toBeLessThan(0.1); // Less than 10% error rate
        expect(metrics.memoryUsageMB).toBeLessThan(500); // Under 500MB

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 90000);

    test('should measure cache performance impact', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'cache-user' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'cache-code', 
          state: 'cache-state' 
        });

        // Test with cold cache
        console.log('🧊 Testing with cold cache...');
        performanceMonitor.start();

        const coldCacheOps = Array.from({ length: 20 }, (_, i) =>
          mockServer.callTool('pim_email_search', {
            query: `cache test ${i}`,
            platform: 'microsoft'
          })
        );

        await Promise.all(coldCacheOps);
        const coldMetrics = performanceMonitor.stop();

        // Test with warm cache (same queries)
        console.log('🔥 Testing with warm cache...');
        performanceMonitor.start();

        const warmCacheOps = Array.from({ length: 20 }, (_, i) =>
          mockServer.callTool('pim_email_search', {
            query: `cache test ${i}`,
            platform: 'microsoft'
          })
        );

        await Promise.all(warmCacheOps);
        const warmMetrics = performanceMonitor.stop();

        console.log('📊 Cache Performance Comparison:');
        console.log(`   Cold cache avg response: ${coldMetrics.averageResponseTime.toFixed(2)}ms`);
        console.log(`   Warm cache avg response: ${warmMetrics.averageResponseTime.toFixed(2)}ms`);
        console.log(`   Performance improvement: ${((coldMetrics.averageResponseTime - warmMetrics.averageResponseTime) / coldMetrics.averageResponseTime * 100).toFixed(2)}%`);

        // Cache should provide significant improvement
        expect(warmMetrics.averageResponseTime).toBeLessThan(coldMetrics.averageResponseTime * 0.8);

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 60000);
  });

  describe('Concurrent User Load Testing', () => {
    test('should handle multiple concurrent users', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        const concurrentUsers = 10;
        const operationsPerUser = 10;

        console.log(`👥 Testing ${concurrentUsers} concurrent users with ${operationsPerUser} operations each...`);

        performanceMonitor.start();

        // Simulate concurrent users
        const userWorkflows = Array.from({ length: concurrentUsers }, async (_, userId) => {
          const userMetrics = {
            userId,
            operations: 0,
            errors: 0,
            totalTime: 0
          };

          try {
            // Each user authenticates
            await mockServer.callTool('pim_auth_start', {
              platform: 'microsoft',
              userId: `concurrent-user-${userId}`
            });

            await mockServer.callTool('pim_auth_callback', {
              platform: 'microsoft',
              code: `concurrent-code-${userId}`,
              state: `concurrent-state-${userId}`
            });

            // Each user performs operations
            for (let opIndex = 0; opIndex < operationsPerUser; opIndex++) {
              const opStart = performance.now();

              try {
                await mockServer.callTool('pim_email_search', {
                  query: `user ${userId} search ${opIndex}`,
                  platform: 'microsoft'
                });

                await mockServer.callTool('pim_email_get', {
                  emailId: `user-${userId}-email-${opIndex}`,
                  platform: 'microsoft'
                });

                userMetrics.operations++;
              } catch (error) {
                userMetrics.errors++;
              }

              userMetrics.totalTime += performance.now() - opStart;

              // Random delay to simulate real user behavior
              await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
            }

          } catch (error) {
            console.error(`User ${userId} workflow failed:`, error);
          }

          return userMetrics;
        });

        const userResults = await Promise.allSettled(userWorkflows);
        const metrics = performanceMonitor.stop();

        // Analyze results
        const successfulUsers = userResults.filter(r => r.status === 'fulfilled');
        const totalOperations = successfulUsers.reduce((sum, r) => 
          sum + (r.status === 'fulfilled' ? r.value.operations : 0), 0
        );
        const totalErrors = successfulUsers.reduce((sum, r) => 
          sum + (r.status === 'fulfilled' ? r.value.errors : 0), 0
        );

        console.log('👥 Concurrent Users Test Results:');
        console.log(`   Successful users: ${successfulUsers.length}/${concurrentUsers}`);
        console.log(`   Total operations: ${totalOperations}`);
        console.log(`   Total errors: ${totalErrors}`);
        console.log(`   Overall ops/sec: ${metrics.operationsPerSecond.toFixed(2)}`);
        console.log(`   Average response time: ${metrics.averageResponseTime.toFixed(2)}ms`);
        console.log(`   P95 response time: ${metrics.p95ResponseTime.toFixed(2)}ms`);
        console.log(`   Error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);

        // Performance assertions for concurrent load
        expect(successfulUsers.length).toBeGreaterThanOrEqual(concurrentUsers * 0.9); // 90% user success
        expect(metrics.errorRate).toBeLessThan(0.15); // Less than 15% error rate under load
        expect(metrics.averageResponseTime).toBeLessThan(3000); // Under 3 seconds under load

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 120000);

    test('should maintain performance under sustained load', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'sustained-user' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'sustained-code', 
          state: 'sustained-state' 
        });

        const testDuration = 30000; // 30 seconds
        const operationInterval = 100; // 100ms between operations
        
        console.log(`⏰ Running sustained load test for ${testDuration/1000} seconds...`);

        performanceMonitor.start();

        const startTime = Date.now();
        const operations: Promise<any>[] = [];
        let operationCount = 0;

        // Generate sustained load
        const loadInterval = setInterval(() => {
          if (Date.now() - startTime > testDuration) {
            clearInterval(loadInterval);
            return;
          }

          // Mix of different operations
          const opType = operationCount % 3;
          let operation: Promise<any>;

          switch (opType) {
            case 0:
              operation = mockServer.callTool('pim_email_search', {
                query: `sustained search ${operationCount}`,
                platform: 'microsoft'
              });
              break;
            case 1:
              operation = mockServer.callTool('pim_email_get', {
                emailId: `sustained-email-${operationCount}`,
                platform: 'microsoft'
              });
              break;
            case 2:
              operation = mockServer.callTool('pim_auth_status', {
                platform: 'microsoft'
              });
              break;
            default:
              operation = Promise.resolve();
          }

          operations.push(operation);
          operationCount++;
        }, operationInterval);

        // Wait for test duration
        await new Promise(resolve => setTimeout(resolve, testDuration + 1000));
        
        // Wait for all operations to complete
        await Promise.allSettled(operations);
        
        const metrics = performanceMonitor.stop();

        console.log('⏰ Sustained Load Test Results:');
        console.log(`   Duration: ${testDuration/1000} seconds`);
        console.log(`   Total operations: ${operationCount}`);
        console.log(`   Operations/second: ${metrics.operationsPerSecond.toFixed(2)}`);
        console.log(`   Average response time: ${metrics.averageResponseTime.toFixed(2)}ms`);
        console.log(`   P95 response time: ${metrics.p95ResponseTime.toFixed(2)}ms`);
        console.log(`   Error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
        console.log(`   Memory usage: ${metrics.memoryUsageMB.toFixed(2)}MB`);
        console.log(`   Memory leak detected: ${metrics.memoryLeakDetected}`);

        // Sustained load assertions
        expect(metrics.operationsPerSecond).toBeGreaterThan(3); // Maintain at least 3 ops/sec
        expect(metrics.errorRate).toBeLessThan(0.2); // Less than 20% error rate
        expect(metrics.memoryLeakDetected).toBe(false); // No memory leaks
        expect(metrics.p95ResponseTime).toBeLessThan(5000); // P95 under 5 seconds

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 120000);
  });

  describe('Stress Testing and Breaking Points', () => {
    test('should identify system breaking points', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'stress-user' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'stress-code', 
          state: 'stress-state' 
        });

        console.log('💥 Running stress test to find breaking points...');

        const stressLevels = [10, 25, 50, 100, 200]; // Operations per batch
        const results: Array<{ level: number; metrics: PerformanceMetrics }> = [];

        for (const level of stressLevels) {
          console.log(`   Testing stress level: ${level} concurrent operations`);

          performanceMonitor.start();

          // Generate stress load
          const stressOperations = Array.from({ length: level }, (_, i) =>
            mockServer.callTool('pim_email_search', {
              query: `stress test ${level}-${i}`,
              platform: 'microsoft'
            }).catch(error => ({ error: error.message }))
          );

          await Promise.allSettled(stressOperations);
          const metrics = performanceMonitor.stop();

          results.push({ level, metrics });

          console.log(`     Ops/sec: ${metrics.operationsPerSecond.toFixed(2)}`);
          console.log(`     Avg response: ${metrics.averageResponseTime.toFixed(2)}ms`);
          console.log(`     Error rate: ${(metrics.errorRate * 100).toFixed(2)}%`);

          // If error rate exceeds 50%, we've likely hit the breaking point
          if (metrics.errorRate > 0.5) {
            console.log(`   💥 Breaking point detected at level ${level}`);
            break;
          }

          // Small delay between stress levels
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Analyze breaking point
        console.log('📊 Stress Test Analysis:');
        results.forEach(result => {
          console.log(`   Level ${result.level}: ${result.metrics.operationsPerSecond.toFixed(2)} ops/sec, ${(result.metrics.errorRate * 100).toFixed(2)}% errors`);
        });

        // Find the highest successful load level
        const successfulLevels = results.filter(r => r.metrics.errorRate < 0.1);
        const maxSuccessfulLevel = successfulLevels.length > 0 
          ? Math.max(...successfulLevels.map(r => r.level))
          : 0;

        console.log(`   Maximum successful load: ${maxSuccessfulLevel} concurrent operations`);

        // Stress test assertions
        expect(maxSuccessfulLevel).toBeGreaterThan(10); // Should handle at least 10 concurrent ops
        expect(results.length).toBeGreaterThan(0); // Should complete at least some tests

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 180000);

    test('should recover gracefully from overload', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'recovery-user' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'recovery-code', 
          state: 'recovery-state' 
        });

        console.log('🔄 Testing graceful recovery from overload...');

        // Step 1: Generate normal load
        performanceMonitor.start();
        const normalOps = Array.from({ length: 10 }, (_, i) =>
          mockServer.callTool('pim_email_search', {
            query: `normal load ${i}`,
            platform: 'microsoft'
          })
        );

        await Promise.all(normalOps);
        const normalMetrics = performanceMonitor.stop();

        console.log(`   Normal load baseline: ${normalMetrics.averageResponseTime.toFixed(2)}ms avg response`);

        // Step 2: Generate overload
        console.log('   Generating overload...');
        performanceMonitor.start();

        const overloadOps = Array.from({ length: 100 }, (_, i) =>
          mockServer.callTool('pim_email_search', {
            query: `overload ${i}`,
            platform: 'microsoft'
          }).catch(error => ({ error: error.message }))
        );

        await Promise.allSettled(overloadOps);
        const overloadMetrics = performanceMonitor.stop();

        console.log(`   Overload performance: ${overloadMetrics.averageResponseTime.toFixed(2)}ms avg response, ${(overloadMetrics.errorRate * 100).toFixed(2)}% errors`);

        // Step 3: Wait for recovery
        console.log('   Waiting for system recovery...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 4: Test recovery
        performanceMonitor.start();
        
        const recoveryOps = Array.from({ length: 10 }, (_, i) =>
          mockServer.callTool('pim_email_search', {
            query: `recovery test ${i}`,
            platform: 'microsoft'
          })
        );

        await Promise.all(recoveryOps);
        const recoveryMetrics = performanceMonitor.stop();

        console.log(`   Recovery performance: ${recoveryMetrics.averageResponseTime.toFixed(2)}ms avg response, ${(recoveryMetrics.errorRate * 100).toFixed(2)}% errors`);

        // Recovery assertions
        expect(recoveryMetrics.errorRate).toBeLessThan(0.1); // Should recover to low error rate
        expect(recoveryMetrics.averageResponseTime).toBeLessThan(normalMetrics.averageResponseTime * 2); // Should recover to reasonable response times

        console.log('✅ System recovery test completed');

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 120000);
  });

  describe('Memory and Resource Usage', () => {
    test('should monitor memory usage under load', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'memory-user' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'memory-code', 
          state: 'memory-state' 
        });

        console.log('🧠 Monitoring memory usage under load...');

        const initialMemory = process.memoryUsage();
        console.log(`   Initial memory usage: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

        // Generate memory-intensive operations
        const memoryIntensiveOps = [];
        
        for (let batch = 0; batch < 5; batch++) {
          console.log(`   Running batch ${batch + 1}/5...`);
          
          const batchOps = Array.from({ length: 50 }, (_, i) =>
            mockServer.callTool('pim_email_search', {
              query: `memory test batch ${batch} operation ${i}`,
              platform: 'microsoft',
              limit: 50 // Larger result sets
            })
          );

          memoryIntensiveOps.push(...batchOps);
          await Promise.allSettled(batchOps);

          const currentMemory = process.memoryUsage();
          console.log(`     Memory after batch ${batch + 1}: ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

          // Force garbage collection if available
          if (global.gc) {
            global.gc();
            const gcMemory = process.memoryUsage();
            console.log(`     Memory after GC: ${(gcMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
          }

          // Small delay between batches
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const finalMemory = process.memoryUsage();
        const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

        console.log('🧠 Memory Usage Analysis:');
        console.log(`   Initial: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   Final: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        console.log(`   Increase: ${memoryIncrease.toFixed(2)}MB`);
        console.log(`   Total operations: ${memoryIntensiveOps.length}`);

        // Memory usage assertions
        expect(finalMemory.heapUsed).toBeLessThan(1024 * 1024 * 1024); // Under 1GB
        expect(memoryIncrease).toBeLessThan(200); // Less than 200MB increase

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 120000);

    test('should detect memory leaks in long-running operations', async () => {
      const appPromise = pimApp.main();
      await new Promise(resolve => setTimeout(resolve, 3000));

      try {
        await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: 'leak-user' });
        await mockServer.callTool('pim_auth_callback', { 
          platform: 'microsoft', 
          code: 'leak-code', 
          state: 'leak-state' 
        });

        console.log('🔍 Running memory leak detection test...');

        const memorySnapshots: number[] = [];
        const testDuration = 30000; // 30 seconds
        const snapshotInterval = 2000; // Every 2 seconds

        // Start memory monitoring
        const monitoringInterval = setInterval(() => {
          const memory = process.memoryUsage().heapUsed / 1024 / 1024;
          memorySnapshots.push(memory);
          console.log(`     Memory snapshot: ${memory.toFixed(2)}MB`);
        }, snapshotInterval);

        // Generate continuous operations
        const startTime = Date.now();
        let operationCount = 0;

        const operationLoop = async () => {
          while (Date.now() - startTime < testDuration) {
            try {
              await mockServer.callTool('pim_email_search', {
                query: `leak test ${operationCount++}`,
                platform: 'microsoft'
              });

              // Small delay
              await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
              // Continue despite errors
            }
          }
        };

        await operationLoop();
        clearInterval(monitoringInterval);

        // Analyze memory trend
        const isMemoryIncreasing = this.analyzeMemoryTrend(memorySnapshots);
        const memoryRange = Math.max(...memorySnapshots) - Math.min(...memorySnapshots);

        console.log('🔍 Memory Leak Analysis:');
        console.log(`   Test duration: ${testDuration/1000} seconds`);
        console.log(`   Operations performed: ${operationCount}`);
        console.log(`   Memory snapshots: ${memorySnapshots.length}`);
        console.log(`   Memory range: ${memoryRange.toFixed(2)}MB`);
        console.log(`   Consistent increase detected: ${isMemoryIncreasing}`);

        // Memory leak assertions
        expect(isMemoryIncreasing).toBe(false); // Should not show consistent memory increase
        expect(memoryRange).toBeLessThan(100); // Memory usage should be relatively stable

      } finally {
        process.emit('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }, 120000);
  });

  // Helper method to analyze memory trend
  private analyzeMemoryTrend(snapshots: number[]): boolean {
    if (snapshots.length < 5) return false;

    // Check if memory consistently increases over time
    let increasingTrend = 0;
    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i] > snapshots[i - 1]) {
        increasingTrend++;
      }
    }

    // Consider it a leak if more than 70% of snapshots show increase
    return (increasingTrend / (snapshots.length - 1)) > 0.7;
  }

  describe('Network Latency Impact', () => {
    test('should measure performance impact of network latency', async () => {
      const latencyLevels = [0, 100, 500, 1000]; // ms
      const results: Array<{ latency: number; metrics: PerformanceMetrics }> = [];

      for (const latency of latencyLevels) {
        console.log(`🌐 Testing with ${latency}ms network latency...`);

        // Configure mock with latency
        await graphMock.teardown();
        graphMock = new GraphApiMockStrategy({ enableLogging: true });
        graphMock.setNetworkConditions({ latency, errorRate: 0, timeoutRate: 0 });
        await graphMock.setup();

        const appPromise = pimApp.main();
        await new Promise(resolve => setTimeout(resolve, 3000));

        try {
          await mockServer.callTool('pim_auth_start', { platform: 'microsoft', userId: `latency-user-${latency}` });
          await mockServer.callTool('pim_auth_callback', { 
            platform: 'microsoft', 
            code: `latency-code-${latency}`, 
            state: `latency-state-${latency}` 
          });

          performanceMonitor.start();

          // Perform operations under latency
          const latencyOps = Array.from({ length: 20 }, (_, i) =>
            mockServer.callTool('pim_email_search', {
              query: `latency test ${latency}ms ${i}`,
              platform: 'microsoft'
            })
          );

          await Promise.all(latencyOps);
          const metrics = performanceMonitor.stop();

          results.push({ latency, metrics });

          console.log(`     Avg response time: ${metrics.averageResponseTime.toFixed(2)}ms`);
          console.log(`     Operations/second: ${metrics.operationsPerSecond.toFixed(2)}`);

        } finally {
          process.emit('SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log('🌐 Network Latency Impact Analysis:');
      results.forEach(result => {
        console.log(`   ${result.latency}ms latency: ${result.metrics.averageResponseTime.toFixed(2)}ms avg response, ${result.metrics.operationsPerSecond.toFixed(2)} ops/sec`);
      });

      // Latency impact assertions
      const baselineResult = results.find(r => r.latency === 0);
      const highLatencyResult = results.find(r => r.latency === 1000);

      if (baselineResult && highLatencyResult) {
        const performanceDegradation = (highLatencyResult.metrics.averageResponseTime - baselineResult.metrics.averageResponseTime) / baselineResult.metrics.averageResponseTime;
        console.log(`   Performance degradation with 1000ms latency: ${(performanceDegradation * 100).toFixed(2)}%`);
        
        // Should handle latency gracefully
        expect(performanceDegradation).toBeLessThan(10); // Less than 10x degradation
      }
    }, 300000);
  });
});