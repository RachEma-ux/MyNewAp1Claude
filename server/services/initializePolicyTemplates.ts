/**
 * Policy Templates Initialization
 * Defines default policy templates for common governance scenarios
 */

export const POLICY_TEMPLATES = {
  strict: {
    name: "Strict",
    description: "Highly restrictive policy for sensitive operations",
    category: "strict" as const,
    content: {
      version: "1.0",
      description: "Strict governance policy with maximum restrictions",
      rules: {
        maxBudget: 100,
        maxTokensPerRequest: 2000,
        allowedActions: ["read", "analyze"],
        deniedActions: ["delete", "admin", "modify"],
        allowedRoles: ["analyst", "reviewer"],
        deniedRoles: ["admin"],
        requireApproval: true,
        maxConcurrentExecutions: 1,
        allowDocumentAccess: true,
        allowToolAccess: false,
      },
    },
  },

  standard: {
    name: "Standard",
    description: "Balanced policy for typical operations",
    category: "standard" as const,
    content: {
      version: "1.0",
      description: "Standard governance policy with balanced restrictions",
      rules: {
        maxBudget: 500,
        maxTokensPerRequest: 5000,
        allowedActions: ["read", "write", "analyze"],
        deniedActions: ["delete", "admin"],
        allowedRoles: ["assistant", "analyst", "support"],
        deniedRoles: ["admin"],
        requireApproval: false,
        maxConcurrentExecutions: 5,
        allowDocumentAccess: true,
        allowToolAccess: true,
      },
    },
  },

  permissive: {
    name: "Permissive",
    description: "Flexible policy for development and testing",
    category: "permissive" as const,
    content: {
      version: "1.0",
      description: "Permissive governance policy for development",
      rules: {
        maxBudget: 1000,
        maxTokensPerRequest: 10000,
        allowedActions: ["read", "write", "analyze", "execute"],
        deniedActions: [],
        allowedRoles: ["assistant", "analyst", "support", "reviewer"],
        deniedRoles: [],
        requireApproval: false,
        maxConcurrentExecutions: 10,
        allowDocumentAccess: true,
        allowToolAccess: true,
      },
    },
  },
};

export function getTemplateByCategory(category: string) {
  const key = category.toLowerCase() as keyof typeof POLICY_TEMPLATES;
  return POLICY_TEMPLATES[key] || null;
}

export function getAllTemplates() {
  return Object.values(POLICY_TEMPLATES);
}

export function getTemplateContent(category: string) {
  const template = getTemplateByCategory(category);
  return template?.content || null;
}
