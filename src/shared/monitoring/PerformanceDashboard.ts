/**
 * Real-time Performance Monitoring Dashboard for Unified PIM MCP
 *
 * Provides comprehensive performance metrics, memory monitoring,
 * API call tracking, and ChromaDB query analysis with real-time
 * alerts and optimization recommendations.
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import * as os from 'os';
import * as process from 'process';

export interface PerformanceMetrics {
  timestamp: number;

  // System metrics
  memory: {
    used: number;
    free: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };

  cpu: {
    usage: number;
    loadAverage: number[];
  };

  // Application metrics
  api: {
    totalRequests: number;
    activeRequests: number;
    averageResponseTime: number;
    errorRate: number;
    requestsPerSecond: number;
  };

  // ChromaDB metrics
  chromadb: {
    totalQueries: number;
    activeQueries: number;
    averageQueryTime: number;
    cacheHitRate: number;
    collectionSizes: Record<string, number>;
  };

  // GraphClient metrics
  graph: {
    totalCalls: number;
    rateLimitHits: number;
    authRefreshes: number;
    averageLatency: number;
    circuitBreakerState: string;
  };

  // General performance
  uptime: number;
  eventLoopDelay: number;
  gcMetrics: {
    totalCollections: number;
    totalDuration: number;
  };
}

export interface PerformanceAlert {
  type: 'warning' | 'critical' | 'info';
  component: string;
  message: string;
  value: number;
  threshold: number;
  timestamp: number;
  recommendations?: string[];
}

export interface PerformanceThresholds {
  memory: {
    warningPercent: number;
    criticalPercent: number;
  };
  cpu: {
    warningPercent: number;
    criticalPercent: number;
  };
  responseTime: {
    warningMs: number;
    criticalMs: number;
  };
  errorRate: {
    warningPercent: number;
    criticalPercent: number;
  };
  eventLoopDelay: {
    warningMs: number;
    criticalMs: number;
  };
}

export class PerformanceDashboard extends EventEmitter {
  private metrics: PerformanceMetrics;
  private alerts: PerformanceAlert[] = [];
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;
  private startTime = performance.now();

  // Tracking variables
  private requestCount = 0;
  private errorCount = 0;
  private responseTimeSamples: number[] = [];
  private chromaQueryCount = 0;
  private chromaQueryTimes: number[] = [];
  private chromaCacheHits = 0;
  private chromaCacheMisses = 0;
  private graphCallCount = 0;
  private graphLatencies: number[] = [];
  private rateLimitHits = 0;
  private authRefreshCount = 0;
  private circuitBreakerState = 'closed';
  private gcCollections = 0;
  private gcDuration = 0;

  // Real-time tracking
  private activeRequests = new Set<string>();
  private activeQueries = new Set<string>();
  private eventLoopMonitor?: any;

  private readonly thresholds: PerformanceThresholds = {
    memory: { warningPercent: 80, criticalPercent: 95 },
    cpu: { warningPercent: 80, criticalPercent: 95 },
    responseTime: { warningMs: 1000, criticalMs: 5000 },
    errorRate: { warningPercent: 5, criticalPercent: 15 },
    eventLoopDelay: { warningMs: 10, criticalMs: 100 },
  };

  constructor(
    private config: {
      updateInterval?: number;
      retentionPeriod?: number;
      alertCooldown?: number;
    } = {}
  ) {
    super();

    this.config = {
      updateInterval: 5000, // 5 seconds
      retentionPeriod: 300000, // 5 minutes
      alertCooldown: 60000, // 1 minute
      ...config,
    };

    this.metrics = this.initializeMetrics();
    this.setupGCMonitoring();
    this.setupEventLoopMonitoring();
  }

  private initializeMetrics(): PerformanceMetrics {
    return {
      timestamp: Date.now(),
      memory: {
        used: 0,
        free: 0,
        total: 0,
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
      },
      cpu: {
        usage: 0,
        loadAverage: [],
      },
      api: {
        totalRequests: 0,
        activeRequests: 0,
        averageResponseTime: 0,
        errorRate: 0,
        requestsPerSecond: 0,
      },
      chromadb: {
        totalQueries: 0,
        activeQueries: 0,
        averageQueryTime: 0,
        cacheHitRate: 0,
        collectionSizes: {},
      },
      graph: {
        totalCalls: 0,
        rateLimitHits: 0,
        authRefreshes: 0,
        averageLatency: 0,
        circuitBreakerState: 'closed',
      },
      uptime: 0,
      eventLoopDelay: 0,
      gcMetrics: {
        totalCollections: 0,
        totalDuration: 0,
      },
    };
  }

  public start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startTime = performance.now();

    // Start periodic metrics collection
    this.intervalId = setInterval(() => {
      this.collectMetrics();
      this.checkThresholds();
      this.emit('metrics', this.metrics);
    }, this.config.updateInterval);

    // Clean up old alerts periodically
    setInterval(() => {
      this.cleanupAlerts();
    }, this.config.retentionPeriod!);

    this.emit('started');
  }

  public stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }

    if (this.eventLoopMonitor) {
      clearInterval(this.eventLoopMonitor);
      this.eventLoopMonitor = undefined;
    }

    this.emit('stopped');
  }

  private collectMetrics(): void {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();

    this.metrics = {
      timestamp: Date.now(),

      memory: {
        used: totalMemory - freeMemory,
        free: freeMemory,
        total: totalMemory,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
      },

      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        loadAverage: os.loadavg(),
      },

      api: {
        totalRequests: this.requestCount,
        activeRequests: this.activeRequests.size,
        averageResponseTime: this.calculateAverageResponseTime(),
        errorRate: this.calculateErrorRate(),
        requestsPerSecond: this.calculateRequestsPerSecond(),
      },

      chromadb: {
        totalQueries: this.chromaQueryCount,
        activeQueries: this.activeQueries.size,
        averageQueryTime: this.calculateAverageQueryTime(),
        cacheHitRate: this.calculateCacheHitRate(),
        collectionSizes: {}, // Will be populated by ChromaDB adapter
      },

      graph: {
        totalCalls: this.graphCallCount,
        rateLimitHits: this.rateLimitHits,
        authRefreshes: this.authRefreshCount,
        averageLatency: this.calculateAverageGraphLatency(),
        circuitBreakerState: this.circuitBreakerState,
      },

      uptime: performance.now() - this.startTime,
      eventLoopDelay: this.getEventLoopDelay(),

      gcMetrics: {
        totalCollections: this.gcCollections,
        totalDuration: this.gcDuration,
      },
    };
  }

  private checkThresholds(): void {
    const alerts: PerformanceAlert[] = [];

    // Memory threshold checks
    const memoryUsagePercent = (this.metrics.memory.used / this.metrics.memory.total) * 100;
    if (memoryUsagePercent > this.thresholds.memory.criticalPercent) {
      alerts.push(
        this.createAlert(
          'critical',
          'memory',
          `Memory usage critically high: ${memoryUsagePercent.toFixed(1)}%`,
          memoryUsagePercent,
          this.thresholds.memory.criticalPercent,
          [
            'Consider increasing available memory',
            'Check for memory leaks in the application',
            'Review ChromaDB cache size configuration',
            'Enable garbage collection optimization',
          ]
        )
      );
    } else if (memoryUsagePercent > this.thresholds.memory.warningPercent) {
      alerts.push(
        this.createAlert(
          'warning',
          'memory',
          `Memory usage high: ${memoryUsagePercent.toFixed(1)}%`,
          memoryUsagePercent,
          this.thresholds.memory.warningPercent,
          [
            'Monitor memory usage trend',
            'Consider optimizing data structures',
            'Review caching strategies',
          ]
        )
      );
    }

    // Response time checks
    if (this.metrics.api.averageResponseTime > this.thresholds.responseTime.criticalMs) {
      alerts.push(
        this.createAlert(
          'critical',
          'api',
          `API response time critically slow: ${this.metrics.api.averageResponseTime.toFixed(0)}ms`,
          this.metrics.api.averageResponseTime,
          this.thresholds.responseTime.criticalMs,
          [
            'Check database query performance',
            'Review API endpoint efficiency',
            'Consider implementing caching',
            'Monitor external service latency',
          ]
        )
      );
    } else if (this.metrics.api.averageResponseTime > this.thresholds.responseTime.warningMs) {
      alerts.push(
        this.createAlert(
          'warning',
          'api',
          `API response time slow: ${this.metrics.api.averageResponseTime.toFixed(0)}ms`,
          this.metrics.api.averageResponseTime,
          this.thresholds.responseTime.warningMs,
          [
            'Monitor response time trends',
            'Consider query optimization',
            'Review concurrent request handling',
          ]
        )
      );
    }

    // Error rate checks
    if (this.metrics.api.errorRate > this.thresholds.errorRate.criticalPercent) {
      alerts.push(
        this.createAlert(
          'critical',
          'api',
          `API error rate critically high: ${this.metrics.api.errorRate.toFixed(1)}%`,
          this.metrics.api.errorRate,
          this.thresholds.errorRate.criticalPercent,
          [
            'Investigate error patterns',
            'Check external service health',
            'Review error handling logic',
            'Consider circuit breaker implementation',
          ]
        )
      );
    } else if (this.metrics.api.errorRate > this.thresholds.errorRate.warningPercent) {
      alerts.push(
        this.createAlert(
          'warning',
          'api',
          `API error rate elevated: ${this.metrics.api.errorRate.toFixed(1)}%`,
          this.metrics.api.errorRate,
          this.thresholds.errorRate.warningPercent,
          ['Monitor error patterns', 'Check service dependencies']
        )
      );
    }

    // Event loop delay checks
    if (this.metrics.eventLoopDelay > this.thresholds.eventLoopDelay.criticalMs) {
      alerts.push(
        this.createAlert(
          'critical',
          'eventloop',
          `Event loop delay critically high: ${this.metrics.eventLoopDelay.toFixed(1)}ms`,
          this.metrics.eventLoopDelay,
          this.thresholds.eventLoopDelay.criticalMs,
          [
            'Check for blocking synchronous operations',
            'Review CPU-intensive tasks',
            'Consider worker threads for heavy computation',
            'Optimize database query performance',
          ]
        )
      );
    }

    // Add new alerts
    for (const alert of alerts) {
      this.addAlert(alert);
    }
  }

  private createAlert(
    type: 'warning' | 'critical' | 'info',
    component: string,
    message: string,
    value: number,
    threshold: number,
    recommendations: string[] = []
  ): PerformanceAlert {
    return {
      type,
      component,
      message,
      value,
      threshold,
      timestamp: Date.now(),
      recommendations,
    };
  }

  private addAlert(alert: PerformanceAlert): void {
    // Check if similar alert exists within cooldown period
    const similarAlert = this.alerts.find(
      a =>
        a.component === alert.component &&
        a.type === alert.type &&
        Date.now() - a.timestamp < this.config.alertCooldown!
    );

    if (!similarAlert) {
      this.alerts.push(alert);
      this.emit('alert', alert);
    }
  }

  private cleanupAlerts(): void {
    const cutoff = Date.now() - this.config.retentionPeriod!;
    this.alerts = this.alerts.filter(alert => alert.timestamp > cutoff);
  }

  // Calculation methods
  private calculateAverageResponseTime(): number {
    if (this.responseTimeSamples.length === 0) return 0;
    const sum = this.responseTimeSamples.reduce((a, b) => a + b, 0);
    return sum / this.responseTimeSamples.length;
  }

  private calculateErrorRate(): number {
    if (this.requestCount === 0) return 0;
    return (this.errorCount / this.requestCount) * 100;
  }

  private calculateRequestsPerSecond(): number {
    const uptimeSeconds = this.metrics.uptime / 1000;
    return uptimeSeconds > 0 ? this.requestCount / uptimeSeconds : 0;
  }

  private calculateAverageQueryTime(): number {
    if (this.chromaQueryTimes.length === 0) return 0;
    const sum = this.chromaQueryTimes.reduce((a, b) => a + b, 0);
    return sum / this.chromaQueryTimes.length;
  }

  private calculateCacheHitRate(): number {
    const total = this.chromaCacheHits + this.chromaCacheMisses;
    return total > 0 ? (this.chromaCacheHits / total) * 100 : 0;
  }

  private calculateAverageGraphLatency(): number {
    if (this.graphLatencies.length === 0) return 0;
    const sum = this.graphLatencies.reduce((a, b) => a + b, 0);
    return sum / this.graphLatencies.length;
  }

  private getEventLoopDelay(): number {
    // This would be set by the event loop monitor
    return 0; // Placeholder
  }

  private setupGCMonitoring(): void {
    if (typeof process.on === 'function') {
      // TODO: Implement GC monitoring using process.on('gc') when available
      // Note: GC monitoring requires running with --expose-gc flag
    }
  }

  private setupEventLoopMonitoring(): void {
    let start = process.hrtime.bigint();

    this.eventLoopMonitor = setInterval(() => {
      const end = process.hrtime.bigint();
      const delay = Number(end - start) / 1000000; // Convert to milliseconds

      // Update event loop delay (this is a simplified implementation)
      // In a real implementation, you'd use more sophisticated monitoring

      start = process.hrtime.bigint();
    }, 1000);
  }

  // Public tracking methods for other components to call
  public trackApiRequest(id: string): void {
    this.activeRequests.add(id);
    this.requestCount++;
  }

  public completeApiRequest(id: string, responseTime: number, isError = false): void {
    this.activeRequests.delete(id);
    this.responseTimeSamples.push(responseTime);

    // Keep only last 100 samples for memory efficiency
    if (this.responseTimeSamples.length > 100) {
      this.responseTimeSamples.shift();
    }

    if (isError) {
      this.errorCount++;
    }
  }

  public trackChromaQuery(id: string): void {
    this.activeQueries.add(id);
    this.chromaQueryCount++;
  }

  public completeChromaQuery(id: string, queryTime: number, cacheHit = false): void {
    this.activeQueries.delete(id);
    this.chromaQueryTimes.push(queryTime);

    if (this.chromaQueryTimes.length > 100) {
      this.chromaQueryTimes.shift();
    }

    if (cacheHit) {
      this.chromaCacheHits++;
    } else {
      this.chromaCacheMisses++;
    }
  }

  public trackGraphCall(latency: number): void {
    this.graphCallCount++;
    this.graphLatencies.push(latency);

    if (this.graphLatencies.length > 100) {
      this.graphLatencies.shift();
    }
  }

  public recordRateLimitHit(): void {
    this.rateLimitHits++;
  }

  public recordAuthRefresh(): void {
    this.authRefreshCount++;
  }

  public updateCircuitBreakerState(state: string): void {
    this.circuitBreakerState = state;
  }

  public updateCollectionSizes(sizes: Record<string, number>): void {
    this.metrics.chromadb.collectionSizes = { ...sizes };
  }

  // Public getters
  public getCurrentMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public getRecentAlerts(count = 10): PerformanceAlert[] {
    return this.alerts.sort((a, b) => b.timestamp - a.timestamp).slice(0, count);
  }

  public getMetricsSummary(): any {
    return {
      status: this.isRunning ? 'running' : 'stopped',
      uptime: this.metrics.uptime,
      totalRequests: this.metrics.api.totalRequests,
      totalQueries: this.metrics.chromadb.totalQueries,
      totalGraphCalls: this.metrics.graph.totalCalls,
      alertCount: this.alerts.length,
      lastUpdate: this.metrics.timestamp,
    };
  }

  // Dashboard HTML generation for development
  public generateDashboardHTML(): string {
    const metrics = this.getCurrentMetrics();
    const alerts = this.getRecentAlerts(5);

    return `
<!DOCTYPE html>
<html>
<head>
    <title>Unified PIM MCP - Performance Dashboard</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: #f5f5f5;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .metrics-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 20px;
        }
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .metric-title {
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #333;
        }
        .metric-value {
            font-size: 24px;
            font-weight: bold;
            color: #667eea;
        }
        .metric-details {
            margin-top: 10px;
            font-size: 14px;
            color: #666;
        }
        .alert {
            margin: 10px 0;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid;
        }
        .alert.critical {
            background: #fee;
            border-color: #f44336;
            color: #d32f2f;
        }
        .alert.warning {
            background: #fff8e1;
            border-color: #ff9800;
            color: #f57c00;
        }
        .alert.info {
            background: #e3f2fd;
            border-color: #2196f3;
            color: #1976d2;
        }
        .progress-bar {
            width: 100%;
            height: 8px;
            background: #e0e0e0;
            border-radius: 4px;
            overflow: hidden;
            margin: 10px 0;
        }
        .progress-fill {
            height: 100%;
            transition: width 0.3s ease;
        }
        .status-good { background: #4caf50; }
        .status-warning { background: #ff9800; }
        .status-critical { background: #f44336; }
        .refresh-info {
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-top: 20px;
        }
    </style>
    <script>
        setTimeout(() => location.reload(), 5000); // Auto-refresh every 5 seconds
    </script>
</head>
<body>
    <div class="header">
        <h1>🚀 Unified PIM MCP - Performance Dashboard</h1>
        <p>Real-time monitoring and performance metrics</p>
    </div>
    
    <div class="metrics-grid">
        <div class="metric-card">
            <div class="metric-title">💾 Memory Usage</div>
            <div class="metric-value">${((metrics.memory.used / metrics.memory.total) * 100).toFixed(1)}%</div>
            <div class="progress-bar">
                <div class="progress-fill ${this.getStatusClass((metrics.memory.used / metrics.memory.total) * 100, 80, 95)}" 
                     style="width: ${((metrics.memory.used / metrics.memory.total) * 100).toFixed(1)}%"></div>
            </div>
            <div class="metric-details">
                Heap: ${(metrics.memory.heapUsed / 1024 / 1024).toFixed(1)} MB<br>
                RSS: ${(metrics.memory.rss / 1024 / 1024).toFixed(1)} MB<br>
                Total: ${(metrics.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-title">🌐 API Performance</div>
            <div class="metric-value">${metrics.api.averageResponseTime.toFixed(0)}ms</div>
            <div class="metric-details">
                Total Requests: ${metrics.api.totalRequests}<br>
                Active: ${metrics.api.activeRequests}<br>
                Error Rate: ${metrics.api.errorRate.toFixed(2)}%<br>
                RPS: ${metrics.api.requestsPerSecond.toFixed(1)}
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-title">🔍 ChromaDB Queries</div>
            <div class="metric-value">${metrics.chromadb.averageQueryTime.toFixed(0)}ms</div>
            <div class="metric-details">
                Total Queries: ${metrics.chromadb.totalQueries}<br>
                Active: ${metrics.chromadb.activeQueries}<br>
                Cache Hit Rate: ${metrics.chromadb.cacheHitRate.toFixed(1)}%
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-title">📊 Microsoft Graph</div>
            <div class="metric-value">${metrics.graph.averageLatency.toFixed(0)}ms</div>
            <div class="metric-details">
                Total Calls: ${metrics.graph.totalCalls}<br>
                Rate Limits: ${metrics.graph.rateLimitHits}<br>
                Auth Refreshes: ${metrics.graph.authRefreshes}<br>
                Circuit Breaker: ${metrics.graph.circuitBreakerState}
            </div>
        </div>
        
        <div class="metric-card">
            <div class="metric-title">⏱️ System Health</div>
            <div class="metric-value">${(metrics.uptime / 1000 / 60).toFixed(1)}min</div>
            <div class="metric-details">
                Event Loop: ${metrics.eventLoopDelay.toFixed(1)}ms<br>
                GC Collections: ${metrics.gcMetrics.totalCollections}<br>
                GC Duration: ${metrics.gcMetrics.totalDuration.toFixed(1)}ms
            </div>
        </div>
    </div>
    
    ${
      alerts.length > 0
        ? `
    <div class="metric-card">
        <div class="metric-title">⚠️ Recent Alerts</div>
        ${alerts
          .map(
            alert => `
        <div class="alert ${alert.type}">
            <strong>${alert.component.toUpperCase()}:</strong> ${alert.message}
            ${alert.recommendations ? `<br><small>💡 ${alert.recommendations[0]}</small>` : ''}
        </div>
        `
          )
          .join('')}
    </div>
    `
        : ''
    }
    
    <div class="refresh-info">
        📡 Last updated: ${new Date(metrics.timestamp).toLocaleTimeString()} | Auto-refresh in 5s
    </div>
</body>
</html>`;
  }

  private getStatusClass(value: number, warning: number, critical: number): string {
    if (value >= critical) return 'status-critical';
    if (value >= warning) return 'status-warning';
    return 'status-good';
  }
}
