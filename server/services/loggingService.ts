/**
 * Logging and Monitoring Service
 * 
 * Provides structured logging with multiple transports.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  service: string;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

export interface LogTransport {
  log(entry: LogEntry): void | Promise<void>;
}

export class ConsoleTransport implements LogTransport {
  log(entry: LogEntry): void {
    const colors: Record<LogLevel, string> = {
      debug: '\x1b[36m',   // cyan
      info: '\x1b[32m',    // green
      warn: '\x1b[33m',    // yellow
      error: '\x1b[31m',   // red
      fatal: '\x1b[35m',   // magenta
    };

    const reset = '\x1b[0m';
    const color = colors[entry.level];
    const timestamp = entry.timestamp.toISOString();

    let message = `${color}[${timestamp}] [${entry.level.toUpperCase()}] [${entry.service}] ${entry.message}${reset}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      message += ` ${JSON.stringify(entry.context)}`;
    }

    if (entry.error) {
      message += `\n${entry.error.stack}`;
    }

    console.log(message);
  }
}

export class FileTransport implements LogTransport {
  private filePath: string;
  private fs: any;

  constructor(filePath: string) {
    this.filePath = filePath;
    // Lazy load fs
  }

  async log(entry: LogEntry): Promise<void> {
    if (!this.fs) {
      this.fs = await import('fs').then(m => m.promises);
    }

    const line = JSON.stringify({
      timestamp: entry.timestamp.toISOString(),
      level: entry.level,
      service: entry.service,
      message: entry.message,
      context: entry.context,
      error: entry.error ? {
        message: entry.error.message,
        stack: entry.error.stack,
      } : undefined,
    });

    try {
      await this.fs.appendFile(this.filePath, line + '\n');
    } catch (error) {
      console.error(`Failed to write to log file: ${error}`);
    }
  }
}

export class Logger {
  private service: string;
  private transports: LogTransport[];

  constructor(service: string, transports: LogTransport[] = []) {
    this.service = service;
    this.transports = transports.length > 0 ? transports : [new ConsoleTransport()];
  }

  private async log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error): Promise<void> {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      service: this.service,
      message,
      context,
      error,
    };

    for (const transport of this.transports) {
      try {
        await Promise.resolve(transport.log(entry));
      } catch (err) {
        console.error(`Transport error: ${err}`);
      }
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, any>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>): void {
    this.log('warn', message, context);
  }

  error(message: string, error?: Error, context?: Record<string, any>): void {
    this.log('error', message, context, error);
  }

  fatal(message: string, error?: Error, context?: Record<string, any>): void {
    this.log('fatal', message, context, error);
  }
}

// Global logger instances
const loggers: Map<string, Logger> = new Map();

export function getLogger(service: string, transports?: LogTransport[]): Logger {
  if (!loggers.has(service)) {
    loggers.set(service, new Logger(service, transports));
  }
  return loggers.get(service)!;
}

export function createLogger(service: string, transports: LogTransport[] = []): Logger {
  return new Logger(service, transports);
}

// Monitoring metrics
export interface MetricPoint {
  timestamp: Date;
  name: string;
  value: number;
  tags?: Record<string, string>;
}

export class MetricsCollector {
  private metrics: MetricPoint[] = [];
  private maxSize: number = 10000;

  record(name: string, value: number, tags?: Record<string, string>): void {
    const point: MetricPoint = {
      timestamp: new Date(),
      name,
      value,
      tags,
    };

    this.metrics.push(point);

    // Keep only recent metrics
    if (this.metrics.length > this.maxSize) {
      this.metrics = this.metrics.slice(-this.maxSize);
    }
  }

  getMetrics(name?: string, limit: number = 100): MetricPoint[] {
    let filtered = this.metrics;

    if (name) {
      filtered = filtered.filter(m => m.name === name);
    }

    return filtered.slice(-limit);
  }

  clear(): void {
    this.metrics = [];
  }
}

// Global metrics collector
let metricsCollector: MetricsCollector | null = null;

export function getMetricsCollector(): MetricsCollector {
  if (!metricsCollector) {
    metricsCollector = new MetricsCollector();
  }
  return metricsCollector;
}
