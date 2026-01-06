/**
 * Feature Flags for Agent Control Plane
 * 
 * These flags control which features are enabled in different environments.
 */

export interface AgentFeatureFlags {
  promotions: {
    enabled: boolean;
  };
  approvals: {
    enabled: boolean;
  };
  policySimulation: {
    enabled: boolean;
  };
  exceptions: {
    enabled: boolean;
  };
  workflowIntegration: {
    enabled: boolean;
  };
  driftDetection: {
    enabled: boolean;
  };
  autonomousRemediation: {
    enabled: boolean;
  };
  chaosTest: {
    enabled: boolean;
  };
}

/**
 * Default feature flags (development)
 */
export const defaultFeatureFlags: AgentFeatureFlags = {
  promotions: {
    enabled: true,
  },
  approvals: {
    enabled: false, // Disabled by default, enable in production
  },
  policySimulation: {
    enabled: true,
  },
  exceptions: {
    enabled: true,
  },
  workflowIntegration: {
    enabled: true,
  },
  driftDetection: {
    enabled: false, // Enable in production
  },
  autonomousRemediation: {
    enabled: false, // Enable with caution
  },
  chaosTest: {
    enabled: false, // Non-prod only
  },
};

/**
 * Production feature flags
 */
export const productionFeatureFlags: AgentFeatureFlags = {
  ...defaultFeatureFlags,
  approvals: {
    enabled: true, // Require approvals in production
  },
  driftDetection: {
    enabled: true, // Monitor drift in production
  },
  chaosTest: {
    enabled: false, // Never in production
  },
};

/**
 * Get feature flags based on environment
 */
export function getFeatureFlags(): AgentFeatureFlags {
  const env = process.env.NODE_ENV || "development";
  
  if (env === "production") {
    return productionFeatureFlags;
  }
  
  return defaultFeatureFlags;
}

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(
  feature: keyof AgentFeatureFlags
): boolean {
  const flags = getFeatureFlags();
  return flags[feature].enabled;
}
