/**
 * Automation Logging Service
 * Provides detailed logging and debugging for automation executions
 */

export interface AutomationLog {
  id: string;
  automationId: string;
  runId: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface LogQuery {
  automationId?: string;
  runId?: string;
  level?: AutomationLog["level"];
  startTime?: number;
  endTime?: number;
  limit?: number;
}

/**
 * Automation Logging Service
 */
class AutomationLoggingService {
  private logs: AutomationLog[] = [];
  private maxLogs = 10000; // Keep last 10k logs in memory

  /**
   * Log a message
   */
  log(
    automationId: string,
    runId: string,
    level: AutomationLog["level"],
    message: string,
    metadata?: Record<string, any>
  ): void {
    const log: AutomationLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      automationId,
      runId,
      level,
      message,
      timestamp: Date.now(),
      metadata,
    };

    this.logs.push(log);

    // Trim old logs if exceeding limit
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console with formatting
    const prefix = `[Automation:${automationId}:${runId}]`;
    switch (level) {
      case "debug":
        console.debug(prefix, message, metadata);
        break;
      case "info":
        console.log(prefix, message, metadata);
        break;
      case "warn":
        console.warn(prefix, message, metadata);
        break;
      case "error":
        console.error(prefix, message, metadata);
        break;
    }
  }

  /**
   * Debug log
   */
  debug(automationId: string, runId: string, message: string, metadata?: Record<string, any>): void {
    this.log(automationId, runId, "debug", message, metadata);
  }

  /**
   * Info log
   */
  info(automationId: string, runId: string, message: string, metadata?: Record<string, any>): void {
    this.log(automationId, runId, "info", message, metadata);
  }

  /**
   * Warning log
   */
  warn(automationId: string, runId: string, message: string, metadata?: Record<string, any>): void {
    this.log(automationId, runId, "warn", message, metadata);
  }

  /**
   * Error log
   */
  error(automationId: string, runId: string, message: string, metadata?: Record<string, any>): void {
    this.log(automationId, runId, "error", message, metadata);
  }

  /**
   * Query logs
   */
  query(query: LogQuery): AutomationLog[] {
    let filtered = this.logs;

    // Filter by automation ID
    if (query.automationId) {
      filtered = filtered.filter((log) => log.automationId === query.automationId);
    }

    // Filter by run ID
    if (query.runId) {
      filtered = filtered.filter((log) => log.runId === query.runId);
    }

    // Filter by level
    if (query.level) {
      filtered = filtered.filter((log) => log.level === query.level);
    }

    // Filter by time range
    if (query.startTime) {
      filtered = filtered.filter((log) => log.timestamp >= query.startTime!);
    }

    if (query.endTime) {
      filtered = filtered.filter((log) => log.timestamp <= query.endTime!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    // Limit results
    if (query.limit) {
      filtered = filtered.slice(0, query.limit);
    }

    return filtered;
  }

  /**
   * Get logs for a specific automation
   */
  getAutomationLogs(automationId: string, limit = 100): AutomationLog[] {
    return this.query({ automationId, limit });
  }

  /**
   * Get logs for a specific run
   */
  getRunLogs(runId: string): AutomationLog[] {
    return this.query({ runId });
  }

  /**
   * Get error logs
   */
  getErrors(automationId?: string, limit = 50): AutomationLog[] {
    return this.query({ automationId, level: "error", limit });
  }

  /**
   * Clear logs
   */
  clear(automationId?: string): void {
    if (automationId) {
      this.logs = this.logs.filter((log) => log.automationId !== automationId);
    } else {
      this.logs = [];
    }
  }

  /**
   * Get log statistics
   */
  getStatistics(automationId?: string): {
    total: number;
    byLevel: Record<string, number>;
    byAutomation: Record<string, number>;
  } {
    const filtered = automationId
      ? this.logs.filter((log) => log.automationId === automationId)
      : this.logs;

    const byLevel: Record<string, number> = {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    };

    const byAutomation: Record<string, number> = {};

    for (const log of filtered) {
      byLevel[log.level]++;
      byAutomation[log.automationId] = (byAutomation[log.automationId] || 0) + 1;
    }

    return {
      total: filtered.length,
      byLevel,
      byAutomation,
    };
  }

  /**
   * Export logs to JSON
   */
  export(query?: LogQuery): string {
    const logs = query ? this.query(query) : this.logs;
    return JSON.stringify(logs, null, 2);
  }

  /**
   * Create logger for specific automation run
   */
  createLogger(automationId: string, runId: string) {
    return {
      debug: (message: string, metadata?: Record<string, any>) =>
        this.debug(automationId, runId, message, metadata),
      info: (message: string, metadata?: Record<string, any>) =>
        this.info(automationId, runId, message, metadata),
      warn: (message: string, metadata?: Record<string, any>) =>
        this.warn(automationId, runId, message, metadata),
      error: (message: string, metadata?: Record<string, any>) =>
        this.error(automationId, runId, message, metadata),
    };
  }
}

// Singleton instance
export const automationLogger = new AutomationLoggingService();
