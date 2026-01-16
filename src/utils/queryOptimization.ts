import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Query optimization utilities for Supabase
 */

/**
 * Batch fetch records to reduce database round trips
 */
export async function batchFetch<T>(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  batchSize: number = 50
): Promise<T[]> {
  const results: T[] = [];
  
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .in('id', batch);
    
    if (error) throw error;
    if (data) results.push(...data as T[]);
  }
  
  return results;
}

/**
 * Paginate query results efficiently
 */
export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalCount: number;
  };
}

export async function paginateQuery<T>(
  supabase: SupabaseClient,
  table: string,
  options: PaginationOptions,
  filters?: Record<string, any>
): Promise<PaginatedResult<T>> {
  const { page, pageSize } = options;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Build query
  let query = supabase.from(table).select('*', { count: 'exact' });

  // Apply filters
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });
  }

  // Execute query with pagination
  const { data, error, count } = await query.range(from, to);

  if (error) throw error;

  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    data: (data as T[]) || [],
    pagination: {
      page,
      pageSize,
      totalPages,
      totalCount,
    },
  };
}

/**
 * Optimize select queries by only fetching needed columns
 */
export function selectColumns(columns: string[]): string {
  return columns.join(',');
}

/**
 * Build optimized filter query
 */
export function buildFilterQuery(
  query: any,
  filters: Record<string, any>
): any {
  let optimizedQuery = query;

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (Array.isArray(value)) {
      optimizedQuery = optimizedQuery.in(key, value);
    } else if (typeof value === 'object' && value.operator) {
      // Support for complex filters like { operator: 'gte', value: 10 }
      const { operator, value: filterValue } = value;
      optimizedQuery = optimizedQuery[operator](key, filterValue);
    } else {
      optimizedQuery = optimizedQuery.eq(key, value);
    }
  });

  return optimizedQuery;
}

/**
 * Debounce database writes to reduce load
 */
export class WriteDebouncer {
  private pending: Map<string, { data: any; resolve: Function; reject: Function }[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly delay: number;

  constructor(delay: number = 1000) {
    this.delay = delay;
  }

  async write(
    supabase: SupabaseClient,
    table: string,
    data: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const key = table;
      
      if (!this.pending.has(key)) {
        this.pending.set(key, []);
      }
      
      this.pending.get(key)!.push({ data, resolve, reject });

      // Clear existing timer
      if (this.timers.has(key)) {
        clearTimeout(this.timers.get(key)!);
      }

      // Set new timer
      const timer = setTimeout(async () => {
        await this.flush(supabase, key);
      }, this.delay);

      this.timers.set(key, timer);
    });
  }

  private async flush(supabase: SupabaseClient, table: string): Promise<void> {
    const items = this.pending.get(table);
    if (!items || items.length === 0) return;

    this.pending.delete(table);
    this.timers.delete(table);

    try {
      const dataToInsert = items.map(item => item.data);
      const { data, error } = await supabase
        .from(table)
        .insert(dataToInsert)
        .select();

      if (error) throw error;

      items.forEach((item, index) => {
        item.resolve(data?.[index]);
      });
    } catch (error) {
      items.forEach(item => item.reject(error));
    }
  }
}

/**
 * Query result memoization
 */
export class QueryMemoizer {
  private cache: Map<string, { result: any; timestamp: number }> = new Map();
  private readonly ttl: number;

  constructor(ttl: number = 60000) { // Default 1 minute
    this.ttl = ttl;
  }

  async memoize<T>(
    key: string,
    queryFn: () => Promise<T>
  ): Promise<T> {
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.result;
    }

    const result = await queryFn();
    this.cache.set(key, { result, timestamp: Date.now() });
    
    return result;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}
