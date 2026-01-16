import { Request, Response, NextFunction } from 'express';

/**
 * Simple in-memory cache for API responses
 */
class CacheStore {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  set(key: string, data: any, ttl: number = this.defaultTTL): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now() + ttl,
    });
  }

  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() > cached.timestamp) {
      this.cache.delete(key);
      return null;
    }

    return cached.data;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clear expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now > value.timestamp) {
        this.cache.delete(key);
      }
    }
  }
}

export const cacheStore = new CacheStore();

// Run cleanup every 10 minutes
setInterval(() => cacheStore.cleanup(), 10 * 60 * 1000);

/**
 * Cache middleware for GET requests
 * Includes user ID in cache key for user-specific caching
 */
export const cacheMiddleware = (ttl: number = 5 * 60 * 1000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Include user ID in cache key for user-specific caching
    const userId = (req as any).user?.id || 'anonymous';
    const key = `${userId}:${req.originalUrl || req.url}`;
    const cached = cacheStore.get(key);

    if (cached) {
      return res.json(cached);
    }

    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json method to cache response
    res.json = function (data: any) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheStore.set(key, data, ttl);
      }
      return originalJson(data);
    };

    next();
  };
};

/**
 * Invalidate cache for specific patterns
 */
export const invalidateCache = (pattern: string): void => {
  const keys = Array.from((cacheStore as any).cache.keys()) as string[];
  keys.forEach((key) => {
    if (key.includes(pattern)) {
      cacheStore.delete(key);
    }
  });
};
