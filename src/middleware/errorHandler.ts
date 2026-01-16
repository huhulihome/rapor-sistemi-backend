import type { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  error: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('API Error:', error);

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  // PostgreSQL specific errors
  if (error.code === '23505') {
    res.status(409).json({
      error: 'Duplicate entry',
      message: 'This record already exists',
    });
    return;
  }

  if (error.code === '23503') {
    res.status(400).json({
      error: 'Invalid reference',
      message: 'Referenced record does not exist',
    });
    return;
  }

  res.status(statusCode).json({
    error: error.name || 'Error',
    message,
  });
};
