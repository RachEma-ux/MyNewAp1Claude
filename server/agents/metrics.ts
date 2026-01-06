/**
 * Metrics collection for Agent Governance Module
 */

export interface MetricData {
  name: string;
  value: number;
  timestamp: string;
  labels: Record<string, string>;
}

export interface AgentMetrics {
  // Agent counts
  totalAgents: number;
  sandboxAgents: number;
  governedAgents: number;
  invalidatedAgents: number;
  restrictedAgents: number;

  // Promotion metrics
  promotionAttempts: number;
  promotionSuccesses: number;
  promotionFailures: number;
  promotionSuccessRate: number;

  // Policy metrics
  policyEvaluations: number;
  policyHotReloads: number;
  policyViolations: number;

  // Admission metrics
  admissionAttempts: number;
  admissionGranted: number;
  admissionDenied: number;
  admissionSuccessRate: number;

  // Performance metrics
  avgPromotionDurationMs: number;
  avgPolicyEvaluationMs: number;
  avgProofGenerationMs: number;
}

class MetricsCollector {
  private metrics: Map<string, number> = new Map();
  private durations: Map<string, number[]> = new Map();

  /**
   * Increment a counter metric
   */
  increment(name: string, labels: Record<string, string> = {}, value: number = 1) {
    const key = this.getKey(name, labels);
    const current = this.metrics.get(key) || 0;
    this.metrics.set(key, current + value);
  }

  /**
   * Set a gauge metric
   */
  set(name: string, labels: Record<string, string> = {}, value: number) {
    const key = this.getKey(name, labels);
    this.metrics.set(key, value);
  }

  /**
   * Record a duration (histogram)
   */
  recordDuration(name: string, labels: Record<string, string> = {}, durationMs: number) {
    const key = this.getKey(name, labels);
    const durations = this.durations.get(key) || [];
    durations.push(durationMs);
    this.durations.set(key, durations);
  }

  /**
   * Get average duration
   */
  getAverageDuration(name: string, labels: Record<string, string> = {}): number {
    const key = this.getKey(name, labels);
    const durations = this.durations.get(key) || [];
    if (durations.length === 0) return 0;
    return durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  /**
   * Get metric value
   */
  get(name: string, labels: Record<string, string> = {}): number {
    const key = this.getKey(name, labels);
    return this.metrics.get(key) || 0;
  }

  /**
   * Get all metrics as structured data
   */
  getAllMetrics(): MetricData[] {
    const result: MetricData[] = [];
    const timestamp = new Date().toISOString();

    for (const [key, value] of this.metrics.entries()) {
      const { name, labels } = this.parseKey(key);
      result.push({
        name,
        value,
        timestamp,
        labels,
      });
    }

    return result;
  }

  /**
   * Get agent-specific metrics summary
   */
  getAgentMetrics(): AgentMetrics {
    const totalAgents = this.get("agents.total");
    const sandboxAgents = this.get("agents.sandbox");
    const governedAgents = this.get("agents.governed");
    const invalidatedAgents = this.get("agents.invalidated");
    const restrictedAgents = this.get("agents.restricted");

    const promotionAttempts = this.get("promotion.attempts");
    const promotionSuccesses = this.get("promotion.successes");
    const promotionFailures = this.get("promotion.failures");
    const promotionSuccessRate =
      promotionAttempts > 0 ? (promotionSuccesses / promotionAttempts) * 100 : 0;

    const policyEvaluations = this.get("policy.evaluations");
    const policyHotReloads = this.get("policy.hotreloads");
    const policyViolations = this.get("policy.violations");

    const admissionAttempts = this.get("admission.attempts");
    const admissionGranted = this.get("admission.granted");
    const admissionDenied = this.get("admission.denied");
    const admissionSuccessRate =
      admissionAttempts > 0 ? (admissionGranted / admissionAttempts) * 100 : 0;

    const avgPromotionDurationMs = this.getAverageDuration("promotion.duration");
    const avgPolicyEvaluationMs = this.getAverageDuration("policy.evaluation.duration");
    const avgProofGenerationMs = this.getAverageDuration("proof.generation.duration");

    return {
      totalAgents,
      sandboxAgents,
      governedAgents,
      invalidatedAgents,
      restrictedAgents,
      promotionAttempts,
      promotionSuccesses,
      promotionFailures,
      promotionSuccessRate,
      policyEvaluations,
      policyHotReloads,
      policyViolations,
      admissionAttempts,
      admissionGranted,
      admissionDenied,
      admissionSuccessRate,
      avgPromotionDurationMs,
      avgPolicyEvaluationMs,
      avgProofGenerationMs,
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics.clear();
    this.durations.clear();
  }

  /**
   * Generate metric key from name and labels
   */
  private getKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  /**
   * Parse metric key back to name and labels
   */
  private parseKey(key: string): { name: string; labels: Record<string, string> } {
    const match = key.match(/^([^{]+)(?:\{([^}]+)\})?$/);
    if (!match) {
      return { name: key, labels: {} };
    }

    const name = match[1];
    const labelStr = match[2];
    const labels: Record<string, string> = {};

    if (labelStr) {
      for (const pair of labelStr.split(",")) {
        const [k, v] = pair.split("=");
        if (k && v) {
          labels[k] = v;
        }
      }
    }

    return { name, labels };
  }
}

// Global metrics collector instance
export const metricsCollector = new MetricsCollector();

// Helper functions for common metrics
export const trackPromotion = (success: boolean, durationMs: number) => {
  metricsCollector.increment("promotion.attempts");
  metricsCollector.increment(success ? "promotion.successes" : "promotion.failures");
  metricsCollector.recordDuration("promotion.duration", {}, durationMs);
};

export const trackPolicyEvaluation = (durationMs: number, violations: number) => {
  metricsCollector.increment("policy.evaluations");
  if (violations > 0) {
    metricsCollector.increment("policy.violations", {}, violations);
  }
  metricsCollector.recordDuration("policy.evaluation.duration", {}, durationMs);
};

export const trackAdmission = (granted: boolean) => {
  metricsCollector.increment("admission.attempts");
  metricsCollector.increment(granted ? "admission.granted" : "admission.denied");
};

export const trackProofGeneration = (durationMs: number) => {
  metricsCollector.recordDuration("proof.generation.duration", {}, durationMs);
};
