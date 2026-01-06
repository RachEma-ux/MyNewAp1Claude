/**
 * Structured logging for Agent Governance Module
 */

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

export interface LogContext {
  workspaceId?: string;
  agentId?: string | number;
  userId?: string;
  operation?: string;
  [key: string]: any;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class AgentLogger {
  private serviceName = "agent-governance";

  private formatLog(level: LogLevel, message: string, context: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: {
        ...context,
        service: this.serviceName,
      },
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return entry;
  }

  private log(level: LogLevel, message: string, context: LogContext = {}, error?: Error) {
    const entry = this.formatLog(level, message, context, error);

    // Output as JSON for structured logging
    console.log(JSON.stringify(entry));
  }

  debug(message: string, context: LogContext = {}) {
    this.log(LogLevel.DEBUG, message, context);
  }

  info(message: string, context: LogContext = {}) {
    this.log(LogLevel.INFO, message, context);
  }

  warn(message: string, context: LogContext = {}, error?: Error) {
    this.log(LogLevel.WARN, message, context, error);
  }

  error(message: string, context: LogContext = {}, error?: Error) {
    this.log(LogLevel.ERROR, message, context, error);
  }

  // Specific logging methods for common operations
  agentCreated(agentId: number | string, context: LogContext = {}) {
    this.info("Agent created", {
      ...context,
      agentId,
      operation: "agent.create",
    });
  }

  agentPromoted(agentId: number | string, success: boolean, context: LogContext = {}) {
    this.info("Agent promotion attempted", {
      ...context,
      agentId,
      operation: "agent.promote",
      success,
    });
  }

  policyEvaluated(agentId: number | string, allow: boolean, denies: string[], context: LogContext = {}) {
    this.info("Policy evaluated", {
      ...context,
      agentId,
      operation: "policy.evaluate",
      allow,
      deniesCount: denies.length,
    });
  }

  policyHotReloaded(policyHash: string, affectedAgents: number, context: LogContext = {}) {
    this.info("Policy hot reloaded", {
      ...context,
      operation: "policy.hotreload",
      policyHash,
      affectedAgents,
    });
  }

  admissionDenied(agentId: number | string, reason: string, context: LogContext = {}) {
    this.warn("Agent admission denied", {
      ...context,
      agentId,
      operation: "admission.deny",
      reason,
    });
  }

  admissionGranted(agentId: number | string, context: LogContext = {}) {
    this.debug("Agent admission granted", {
      ...context,
      agentId,
      operation: "admission.grant",
    });
  }

  proofGenerated(agentId: number | string, agentHash: string, policyHash: string, context: LogContext = {}) {
    this.info("Cryptographic proof generated", {
      ...context,
      agentId,
      operation: "proof.generate",
      agentHash,
      policyHash,
    });
  }

  proofVerified(agentId: number | string, valid: boolean, context: LogContext = {}) {
    this.info("Proof verification completed", {
      ...context,
      agentId,
      operation: "proof.verify",
      valid,
    });
  }

  runtimeError(operation: string, error: Error, context: LogContext = {}) {
    this.error("Runtime error occurred", {
      ...context,
      operation,
    }, error);
  }
}

// Global logger instance
export const agentLogger = new AgentLogger();
