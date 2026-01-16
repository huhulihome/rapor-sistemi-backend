/**
 * Logger Utility
 * Provides structured logging with different levels and contexts
 */

export enum LogLevel {
  ERROR = 'ERROR',
  WARN = 'WARN',
  INFO = 'INFO',
  DEBUG = 'DEBUG',
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: string;
  metadata?: Record<string, any>;
  error?: Error;
}

class Logger {
  private context?: string;
  private minLevel: LogLevel;

  constructor(context?: string) {
    this.context = context;
    this.minLevel = this.getMinLogLevel();
  }

  private getMinLogLevel(): LogLevel {
    const level = process.env.LOG_LEVEL?.toUpperCase() || 'INFO';
    return LogLevel[level as keyof typeof LogLevel] || LogLevel.INFO;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
    return levels.indexOf(level) <= levels.indexOf(this.minLevel);
  }

  private formatLog(entry: LogEntry): string {
    const { level, message, timestamp, context, metadata, error } = entry;
    
    const logObject: any = {
      level,
      timestamp,
      message,
    };

    if (context) {
      logObject.context = context;
    }

    if (metadata && Object.keys(metadata).length > 0) {
      logObject.metadata = metadata;
    }

    if (error) {
      logObject.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return JSON.stringify(logObject);
  }

  private log(level: LogLevel, message: string, metadata?: Record<string, any>, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: this.context,
      metadata,
      error,
    };

    const formattedLog = this.formatLog(entry);

    // In production, use structured JSON logging
    // In development, use more readable format
    if (process.env.NODE_ENV === 'production') {
      console.log(formattedLog);
    } else {
      const contextStr = this.context ? `[${this.context}] ` : '';
      const metadataStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
      const errorStr = error ? `\n${error.stack}` : '';
      
      switch (level) {
        case LogLevel.ERROR:
          console.error(`❌ ${contextStr}${message}${metadataStr}${errorStr}`);
          break;
        case LogLevel.WARN:
          console.warn(`⚠️  ${contextStr}${message}${metadataStr}`);
          break;
        case LogLevel.INFO:
          console.info(`ℹ️  ${contextStr}${message}${metadataStr}`);
          break;
        case LogLevel.DEBUG:
          console.debug(`🔍 ${contextStr}${message}${metadataStr}`);
          break;
      }
    }
  }

  error(message: string, error?: Error, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, metadata, error);
  }

  warn(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  info(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  debug(message: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  // Create a child logger with additional context
  child(childContext: string): Logger {
    const fullContext = this.context 
      ? `${this.context}:${childContext}` 
      : childContext;
    return new Logger(fullContext);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export factory function for creating contextual loggers
export function createLogger(context: string): Logger {
  return new Logger(context);
}
