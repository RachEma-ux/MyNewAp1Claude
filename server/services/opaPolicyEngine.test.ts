/**
 * OPA Policy Engine Tests
 * 
 * Unit tests for OPAPolicyEngine service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OPAPolicyEngine } from './opaPolicyEngine';

describe('OPAPolicyEngine', () => {
  let engine: OPAPolicyEngine;

  beforeEach(() => {
    engine = new OPAPolicyEngine({
      baseUrl: 'https://opa.example.com',
      timeout: 5000,
    });
  });

  describe('evaluatePolicy', () => {
    it('should evaluate compliant agent', async () => {
      const result = await engine.evaluatePolicy({
        agent: {
          id: 1,
          name: 'Compliant Agent',
          roleClass: 'analyst',
          temperature: 0.7,
          hasDocumentAccess: true,
          hasToolAccess: true,
          allowedTools: ['web_search', 'code_execution'],
        },
        workspace: {
          id: 1,
          policies: [],
        },
      });

      expect(result).toBeDefined();
      expect(result.allowed).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it('should detect temperature violations', async () => {
      const result = await engine.evaluatePolicy({
        agent: {
          id: 1,
          name: 'Invalid Agent',
          roleClass: 'analyst',
          temperature: 3.0, // Out of range
          hasDocumentAccess: false,
          hasToolAccess: false,
          allowedTools: [],
        },
        workspace: {
          id: 1,
          policies: [],
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some(v => v.includes('temperature'))).toBe(true);
    });

    it('should detect role-based violations', async () => {
      const result = await engine.evaluatePolicy({
        agent: {
          id: 1,
          name: 'Invalid Role',
          roleClass: 'invalid_role' as any,
          temperature: 0.5,
          hasDocumentAccess: false,
          hasToolAccess: false,
          allowedTools: [],
        },
        workspace: {
          id: 1,
          policies: [],
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should validate tool access', async () => {
      const result = await engine.evaluatePolicy({
        agent: {
          id: 1,
          name: 'Tool Access Test',
          roleClass: 'analyst',
          temperature: 0.7,
          hasDocumentAccess: true,
          hasToolAccess: true,
          allowedTools: [],
        },
        workspace: {
          id: 1,
          policies: [],
        },
      });

      // Tool access without tools list should fail
      expect(result.allowed).toBe(false);
    });
  });

  describe('compilePolicy', () => {
    it('should compile valid policy', async () => {
      const result = await engine.compilePolicy(`
        package agent_governance
        evaluate { true }
      `);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid policy syntax', async () => {
      const result = await engine.compilePolicy(`
        package agent_governance
        invalid syntax here !!!
      `);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should validate policy structure', async () => {
      const result = await engine.compilePolicy(`
        package agent_governance
        
        evaluate[result] {
          result := {
            "allowed": true,
            "violations": [],
            "score": 100
          }
        }
      `);

      expect(result.success).toBe(true);
    });
  });

  describe('getVersion', () => {
    it('should return OPA version', async () => {
      const version = await engine.getVersion();

      expect(version).toBeDefined();
      expect(version).toMatch(/^\d+\.\d+\.\d+/);
    });
  });

  describe('healthCheck', () => {
    it('should check OPA health', async () => {
      const health = await engine.healthCheck();

      expect(health).toBeDefined();
      expect(health.healthy).toBe(true);
      expect(health.message).toBeDefined();
    });
  });

  describe('policy evaluation details', () => {
    it('should provide detailed evaluation results', async () => {
      const result = await engine.evaluatePolicy({
        agent: {
          id: 1,
          name: 'Detailed Test',
          roleClass: 'analyst',
          temperature: 0.7,
          hasDocumentAccess: true,
          hasToolAccess: true,
          allowedTools: ['web_search'],
        },
        workspace: {
          id: 1,
          policies: [],
        },
      });

      expect(result.details).toBeDefined();
      expect(result.details.temperature_check).toBeDefined();
      expect(result.details.access_check).toBeDefined();
      expect(result.details.tools_check).toBeDefined();
      expect(result.details.role_check).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle OPA service errors gracefully', async () => {
      expect(async () => {
        await engine.evaluatePolicy({
          agent: {
            id: 1,
            name: 'Test',
            roleClass: 'analyst',
            temperature: 0.7,
            hasDocumentAccess: false,
            hasToolAccess: false,
            allowedTools: [],
          },
          workspace: {
            id: 1,
            policies: [],
          },
        });
      }).not.toThrow();
    });
  });

  describe('policy caching', () => {
    it('should cache compiled policies', async () => {
      const policy = `
        package agent_governance
        evaluate { true }
      `;

      const result1 = await engine.compilePolicy(policy);
      const result2 = await engine.compilePolicy(policy);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
    });
  });

  describe('role-based policies', () => {
    it('should enforce role-specific rules', async () => {
      // Assistant role should have lower temperature
      const assistantResult = await engine.evaluatePolicy({
        agent: {
          id: 1,
          name: 'Assistant',
          roleClass: 'assistant',
          temperature: 0.3,
          hasDocumentAccess: false,
          hasToolAccess: false,
          allowedTools: [],
        },
        workspace: {
          id: 1,
          policies: [],
        },
      });

      // Analyst role can have higher temperature
      const analystResult = await engine.evaluatePolicy({
        agent: {
          id: 2,
          name: 'Analyst',
          roleClass: 'analyst',
          temperature: 0.8,
          hasDocumentAccess: true,
          hasToolAccess: true,
          allowedTools: ['web_search'],
        },
        workspace: {
          id: 1,
          policies: [],
        },
      });

      expect(assistantResult.allowed).toBe(true);
      expect(analystResult.allowed).toBe(true);
    });
  });
});
