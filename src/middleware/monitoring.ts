/**
 * Monitoring Middleware
 * Tracks request metrics, response times, and errors
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Monitoring');

interface RequestMetrics {
  method: string;
  path: string;
  statusCode: number;
  responseTime: number;
  timestamp: string;
  userAgent?: string;
  ip?: string;
}

// In-memory metrics storage (in production, use a proper metrics service)
class MetricsCollector {
  private metrics: RequestMetrics[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 requests

  addMetric(metric: RequestMetrics): void {
    this.metrics.push(metric);

    // Keep only the last N metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }
  }

  getMetrics(): RequestMetrics[] {
    return [...this.metrics];
  }

  getStats() {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        averageResponseTime: 0,
        errorRate: 0,
        requestsByStatus: {},
        requestsByPath: {},
      };
    }

    const totalRequests = this.metrics.length;
    const totalResponseTime = this.metrics.reduce((sum, m) => sum + m.responseTime, 0);
    const averageResponseTime = totalResponseTime / totalRequests;

    const errorCount = this.metrics.filter(m => m.statusCode >= 400).length;
    const errorRate = (errorCount / totalRequests) * 100;

    const requestsByStatus = this.metrics.reduce((acc, m) => {
      acc[m.statusCode] = (acc[m.statusCode] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const requestsByPath = this.metrics.reduce((acc, m) => {
      acc[m.path] = (acc[m.path] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalRequests,
      averageResponseTime: Math.round(averageResponseTime),
      errorRate: Math.round(errorRate * 100) / 100,
      requestsByStatus,
      requestsByPath,
    };
  }

  clearMetrics(): void {
    this.metrics = [];
  }
}

export const metricsCollector = new MetricsCollector();

/**
 * Request logging and metrics middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const { method, path, ip } = req;
  const userAgent = req.get('user-agent');

  // Log incoming request
  logger.info('Incoming request', {
    method,
    path,
    ip,
    userAgent,
  });

  // Capture response
  const originalSend = res.send;
  res.send = function (data: any): Response {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Collect metrics
    const metric: RequestMetrics = {
      method,
      path,
      statusCode,
      responseTime,
      timestamp: new Date().toISOString(),
      userAgent,
      ip,
    };
    metricsCollector.addMetric(metric);

    // Log response
    if (statusCode >= 500) {
      logger.error('Request completed', undefined, {
        method,
        path,
        statusCode,
        responseTime: `${responseTime}ms`,
      });
    } else if (statusCode >= 400) {
      logger.warn('Request completed', {
        method,
        path,
        statusCode,
        responseTime: `${responseTime}ms`,
      });
    } else {
      logger.info('Request completed', {
        method,
        path,
        statusCode,
        responseTime: `${responseTime}ms`,
      });
    }

    // Warn on slow requests
    if (responseTime > 1000) {
      logger.warn('Slow request detected', {
        method,
        path,
        responseTime: `${responseTime}ms`,
      });
    }

    return originalSend.call(this, data);
  };

  next();
}

/**
 * Error tracking middleware
 */
export function errorTracker(err: Error & { method?: string; path?: string }, req: Request, _res: Response, next: NextFunction): void {
  logger.error('Unhandled error', err, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  next(err);
}

/**
 * Health metrics endpoint handler
 */
export function getHealthMetrics(_req: Request, res: Response): void {
  const stats = metricsCollector.getStats();
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: Math.floor(uptime),
      formatted: formatUptime(uptime),
    },
    memory: {
      rss: formatBytes(memoryUsage.rss),
      heapTotal: formatBytes(memoryUsage.heapTotal),
      heapUsed: formatBytes(memoryUsage.heapUsed),
      external: formatBytes(memoryUsage.external),
    },
    metrics: stats,
  });
}

/**
 * Metrics endpoint handler
 */
export function getMetrics(_req: Request, res: Response): void {
  const stats = metricsCollector.getStats();
  res.json(stats);
}

/**
 * Clear metrics endpoint handler (admin only)
 */
export function clearMetrics(req: Request, res: Response): void {
  metricsCollector.clearMetrics();
  logger.info('Metrics cleared', {
    clearedBy: req.ip,
  });
  res.json({ message: 'Metrics cleared successfully' });
}

// Helper functions
function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(' ');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
