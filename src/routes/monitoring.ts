/**
 * Monitoring Routes
 * Provides endpoints for health checks, metrics, and system status
 */

import { Router } from 'express';
import { getHealthMetrics, getMetrics, clearMetrics } from '../middleware/monitoring.js';
import { supabase } from '../services/supabase.js';
import { createLogger } from '../utils/logger.js';

const router = Router();
const logger = createLogger('MonitoringRoutes');

/**
 * GET /api/monitoring/health
 * Comprehensive health check with all service statuses
 */
router.get('/health', async (_req, res) => {
  try {
    const checks = await performHealthChecks();
    const isHealthy = Object.values(checks).every(check => check.status === 'ok');
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      checks,
    });
  } catch (error) {
    logger.error('Health check failed', error as Error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

/**
 * GET /api/monitoring/metrics
 * Get application metrics
 */
router.get('/metrics', getHealthMetrics);

/**
 * GET /api/monitoring/stats
 * Get request statistics
 */
router.get('/stats', getMetrics);

/**
 * POST /api/monitoring/metrics/clear
 * Clear collected metrics (admin only)
 */
router.post('/metrics/clear', clearMetrics);

/**
 * GET /api/monitoring/database
 * Check database health and connection
 */
router.get('/database', async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Test database connection with a simple query
    const { data, error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);

    const responseTime = Date.now() - startTime;

    if (error) {
      throw error;
    }

    res.json({
      status: 'ok',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Database health check failed', error as Error);
    res.status(503).json({
      status: 'error',
      message: 'Database connection failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/monitoring/email
 * Check email service configuration
 */
router.get('/email', async (req, res) => {
  try {
    const gmailUser = process.env.GMAIL_USER;
    const gmailPassword = process.env.GMAIL_APP_PASSWORD;

    const isConfigured = !!(gmailUser && gmailPassword);

    res.json({
      status: isConfigured ? 'ok' : 'not_configured',
      configured: isConfigured,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Email health check failed', error as Error);
    res.status(503).json({
      status: 'error',
      message: 'Email service check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/monitoring/system
 * Get system information
 */
router.get('/system', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    node: {
      version: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    uptime: {
      seconds: Math.floor(process.uptime()),
      formatted: formatUptime(process.uptime()),
    },
    memory: {
      rss: formatBytes(memoryUsage.rss),
      heapTotal: formatBytes(memoryUsage.heapTotal),
      heapUsed: formatBytes(memoryUsage.heapUsed),
      external: formatBytes(memoryUsage.external),
      arrayBuffers: formatBytes(memoryUsage.arrayBuffers),
    },
    cpu: {
      user: cpuUsage.user,
      system: cpuUsage.system,
    },
    environment: process.env.NODE_ENV || 'development',
  });
});

// Helper functions
async function performHealthChecks() {
  const checks: Record<string, any> = {};

  // Database check
  try {
    const startTime = Date.now();
    const { error } = await supabase
      .from('profiles')
      .select('count')
      .limit(1);
    
    const responseTime = Date.now() - startTime;
    
    checks.database = {
      status: error ? 'error' : 'ok',
      responseTime: `${responseTime}ms`,
      message: error ? error.message : 'Connected',
    };
  } catch (error) {
    checks.database = {
      status: 'error',
      message: 'Connection failed',
    };
  }

  // Email service check
  checks.email = {
    status: process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD ? 'ok' : 'not_configured',
    message: process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD 
      ? 'Configured' 
      : 'Not configured',
  };

  // Memory check
  const memoryUsage = process.memoryUsage();
  const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
  
  checks.memory = {
    status: heapUsedPercent > 90 ? 'warning' : 'ok',
    heapUsed: formatBytes(memoryUsage.heapUsed),
    heapTotal: formatBytes(memoryUsage.heapTotal),
    percentage: `${Math.round(heapUsedPercent)}%`,
  };

  // Uptime check
  const uptime = process.uptime();
  checks.uptime = {
    status: 'ok',
    seconds: Math.floor(uptime),
    formatted: formatUptime(uptime),
  };

  return checks;
}

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

export default router;
