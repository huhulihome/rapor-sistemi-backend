import { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '../types/api.js';

/**
 * Input validation and sanitization middleware
 */

/**
 * Sanitize string input to prevent XSS attacks
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/[<>]/g, '') // Remove < and > to prevent HTML injection
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers like onclick=
    .trim();
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate and sanitize task input
 */
export interface TaskInput {
  title: string;
  description?: string;
  category: 'routine' | 'project' | 'one_time' | 'issue_resolution';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status?: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  assigned_to?: string;
  due_date?: string;
  estimated_hours?: number;
  tags?: string[];
}

export function validateTaskInput(input: any): { valid: boolean; errors: string[]; data?: TaskInput } {
  const errors: string[] = [];

  // Validate required fields
  if (!input.title || typeof input.title !== 'string') {
    errors.push('Title is required and must be a string');
  } else if (input.title.length < 3 || input.title.length > 200) {
    errors.push('Title must be between 3 and 200 characters');
  }

  // Validate category
  const validCategories = ['routine', 'project', 'one_time', 'issue_resolution'];
  if (!input.category || !validCategories.includes(input.category)) {
    errors.push('Category must be one of: routine, project, one_time, issue_resolution');
  }

  // Validate priority
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  if (!input.priority || !validPriorities.includes(input.priority)) {
    errors.push('Priority must be one of: low, medium, high, critical');
  }

  // Validate status if provided
  if (input.status) {
    const validStatuses = ['not_started', 'in_progress', 'completed', 'blocked'];
    if (!validStatuses.includes(input.status)) {
      errors.push('Status must be one of: not_started, in_progress, completed, blocked');
    }
  }

  // Validate assigned_to if provided
  if (input.assigned_to && !isValidUUID(input.assigned_to)) {
    errors.push('assigned_to must be a valid UUID');
  }

  // Validate due_date if provided
  if (input.due_date) {
    const date = new Date(input.due_date);
    if (isNaN(date.getTime())) {
      errors.push('due_date must be a valid ISO date string');
    }
  }

  // Validate estimated_hours if provided
  if (input.estimated_hours !== undefined) {
    if (typeof input.estimated_hours !== 'number' || input.estimated_hours < 0 || input.estimated_hours > 1000) {
      errors.push('estimated_hours must be a number between 0 and 1000');
    }
  }

  // Validate tags if provided
  if (input.tags) {
    if (!Array.isArray(input.tags)) {
      errors.push('tags must be an array');
    } else if (input.tags.length > 10) {
      errors.push('Maximum 10 tags allowed');
    } else if (!input.tags.every((tag: any) => typeof tag === 'string' && tag.length <= 50)) {
      errors.push('Each tag must be a string with maximum 50 characters');
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Sanitize and return validated data
  const data: TaskInput = {
    title: sanitizeString(input.title),
    description: input.description ? sanitizeString(input.description) : undefined,
    category: input.category,
    priority: input.priority,
    status: input.status,
    assigned_to: input.assigned_to,
    due_date: input.due_date,
    estimated_hours: input.estimated_hours,
    tags: input.tags?.map((tag: string) => sanitizeString(tag)),
  };

  return { valid: true, errors: [], data };
}

/**
 * Validate and sanitize issue input
 */
export interface IssueInput {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  suggested_assignee_id: string;
}

export function validateIssueInput(input: any): { valid: boolean; errors: string[]; data?: IssueInput } {
  const errors: string[] = [];

  // Validate title
  if (!input.title || typeof input.title !== 'string') {
    errors.push('Title is required and must be a string');
  } else if (input.title.length < 3 || input.title.length > 200) {
    errors.push('Title must be between 3 and 200 characters');
  }

  // Validate description
  if (!input.description || typeof input.description !== 'string') {
    errors.push('Description is required and must be a string');
  } else if (input.description.length < 10 || input.description.length > 2000) {
    errors.push('Description must be between 10 and 2000 characters');
  }

  // Validate priority
  const validPriorities = ['low', 'medium', 'high', 'critical'];
  if (!input.priority || !validPriorities.includes(input.priority)) {
    errors.push('Priority must be one of: low, medium, high, critical');
  }

  // Validate suggested_assignee_id
  if (!input.suggested_assignee_id || !isValidUUID(input.suggested_assignee_id)) {
    errors.push('suggested_assignee_id is required and must be a valid UUID');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Sanitize and return validated data
  const data: IssueInput = {
    title: sanitizeString(input.title),
    description: sanitizeString(input.description),
    priority: input.priority,
    suggested_assignee_id: input.suggested_assignee_id,
  };

  return { valid: true, errors: [], data };
}

/**
 * Middleware to validate request body against a validation function
 */
export function validateRequest<T>(
  validationFn: (input: any) => { valid: boolean; errors: string[]; data?: T }
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = validationFn(req.body);

    if (!result.valid) {
      res.status(400).json({
        error: 'Validation failed',
        message: result.errors.join(', '),
        details: result.errors,
      } as ApiResponse<null>);
      return;
    }

    // Replace request body with sanitized data
    req.body = result.data;
    next();
  };
}

/**
 * Validate pagination parameters
 */
export function validatePagination(req: Request, res: Response, next: NextFunction) {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  if (page < 1) {
    res.status(400).json({
      error: 'Invalid pagination',
      message: 'Page must be greater than 0',
    } as ApiResponse<null>);
    return;
  }

  if (limit < 1 || limit > 100) {
    res.status(400).json({
      error: 'Invalid pagination',
      message: 'Limit must be between 1 and 100',
    } as ApiResponse<null>);
    return;
  }

  req.query.page = page.toString();
  req.query.limit = limit.toString();
  next();
}

/**
 * Sanitize query parameters
 */
export function sanitizeQuery(req: Request, _res: Response, next: NextFunction) {
  if (req.query) {
    Object.keys(req.query).forEach((key) => {
      const value = req.query[key];
      if (typeof value === 'string') {
        req.query[key] = sanitizeString(value);
      }
    });
  }
  next();
}
