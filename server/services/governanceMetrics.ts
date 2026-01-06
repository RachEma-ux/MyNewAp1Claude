/**
 * Governance Metrics
 * Phase 7: Observability & Audit
 * 
 * Prometheus-style metrics for governance events
 */

interface MetricCounter {
  name: string;
  help: string;
  value: number;
  labels?: Record<string, string>;
}

class GovernanceMetrics {
  private counters: Map<string, MetricCounter> = new Map();

  constructor() {
    // Initialize counters
    this.initCounter("agent_starts_allowed_total", "Total number of agent starts allowed by admission control");
    this.initCounter("agent_starts_denied_total", "Total number of agent starts denied by admission control");
    this.initCounter("agent_invalidation_events_total", "Total number of agent invalidation events");
    this.initCounter("policy_reload_success_total", "Total number of successful policy reloads");
    this.initCounter("policy_reload_failure_total", "Total number of failed policy reloads");
    this.initCounter("promotion_attempts_total", "Total number of agent promotion attempts");
    this.initCounter("promotion_denies_total", "Total number of agent promotion denials");
  }

  /**
   * Initialize a counter
   */
  private initCounter(name: string, help: string): void {
    this.counters.set(name, {
      name,
      help,
      value: 0,
    });
  }

  /**
   * Increment a counter
   */
  inc(name: string, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    const counter = this.counters.get(key);
    
    if (counter) {
      counter.value++;
    } else {
      // Create new counter with labels
      this.counters.set(key, {
        name,
        help: "",
        value: 1,
        labels,
      });
    }
  }

  /**
   * Get counter value
   */
  get(name: string, labels?: Record<string, string>): number {
    const key = this.getKey(name, labels);
    return this.counters.get(key)?.value || 0;
  }

  /**
   * Generate key from name and labels
   */
  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(",");
    return `${name}{${labelStr}}`;
  }

  /**
   * Export metrics in Prometheus format
   */
  export(): string {
    const lines: string[] = [];

    for (const [key, counter] of Array.from(this.counters.entries())) {
      // Add HELP line
      if (counter.help) {
        lines.push(`# HELP ${counter.name} ${counter.help}`);
        lines.push(`# TYPE ${counter.name} counter`);
      }

      // Add metric line
      lines.push(`${key} ${counter.value}`);
    }

    return lines.join("\n");
  }

  /**
   * Get all counters as JSON
   */
  toJSON(): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, counter] of Array.from(this.counters.entries())) {
      result[key] = {
        value: counter.value,
        labels: counter.labels,
      };
    }

    return result;
  }

  /**
   * Reset all counters (for testing)
   */
  reset(): void {
    for (const counter of Array.from(this.counters.values())) {
      counter.value = 0;
    }
  }

  /**
   * Clear all counters (for testing)
   */
  clear(): void {
    this.counters.clear();
  }
}

// Singleton instance
let _governanceMetrics: GovernanceMetrics | null = null;

export function getGovernanceMetrics(): GovernanceMetrics {
  if (!_governanceMetrics) {
    _governanceMetrics = new GovernanceMetrics();
  }
  return _governanceMetrics;
}
