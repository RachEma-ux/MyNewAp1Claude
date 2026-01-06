/**
 * OPA Policy Engine
 * 
 * Integrates with Open Policy Agent (OPA) for policy evaluation.
 * Supports Rego policy language and provides policy compilation and evaluation.
 */

import https from 'https';

export interface OPAConfig {
  baseUrl: string;
  timeout?: number;
}

export interface PolicyEvaluationInput {
  agent: {
    id: number;
    name: string;
    roleClass: string;
    temperature: number;
    hasDocumentAccess: boolean;
    hasToolAccess: boolean;
    allowedTools: string[];
  };
  workspace: {
    id: number;
    policies: string[];
  };
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  violations: string[];
  score: number;
  details: Record<string, any>;
}

export class OPAPolicyEngine {
  private config: OPAConfig;

  constructor(config: OPAConfig) {
    this.config = {
      timeout: 30000,
      ...config,
    };
  }

  /**
   * Evaluate agent against policies
   */
  async evaluatePolicy(input: PolicyEvaluationInput): Promise<PolicyEvaluationResult> {
    try {
      const result = await this.httpRequest('POST', '/v1/data/agent_governance/evaluate', {
        input,
      });

      return {
        allowed: result.result?.allowed ?? false,
        violations: result.result?.violations ?? [],
        score: result.result?.score ?? 0,
        details: result.result?.details ?? {},
      };
    } catch (error) {
      throw new Error(`OPA policy evaluation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Compile a Rego policy
   */
  async compilePolicy(regoContent: string): Promise<{ success: boolean; errors?: string[] }> {
    try {
      const result = await this.httpRequest('POST', '/v1/compile', {
        query: 'data.agent_governance',
        unknowns: ['input'],
        modules: [
          {
            filename: 'policy.rego',
            content: regoContent,
          },
        ],
      });

      if (result.errors && result.errors.length > 0) {
        return {
          success: false,
          errors: result.errors.map((e: any) => e.message),
        };
      }

      return { success: true };
    } catch (error) {
      throw new Error(`OPA policy compilation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get OPA version
   */
  async getVersion(): Promise<string> {
    try {
      const result = await this.httpRequest('GET', '/version', null);
      return result.version || 'unknown';
    } catch (error) {
      throw new Error(`Failed to get OPA version: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check OPA health
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.httpRequest('GET', '/health', null);
      return result.result?.ready === true;
    } catch {
      return false;
    }
  }

  /**
   * Make HTTP request to OPA
   */
  private httpRequest(method: string, path: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.config.baseUrl);

      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: this.config.timeout,
      };

      const req = https.request(url, options, (res) => {
        let data = '';

        res.on('data', chunk => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(JSON.parse(data || '{}'));
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }
}

// Singleton instance
let opaPolicyEngine: OPAPolicyEngine | null = null;

export function initializeOPAEngine(config: OPAConfig): OPAPolicyEngine {
  opaPolicyEngine = new OPAPolicyEngine(config);
  return opaPolicyEngine;
}

export function getOPAEngine(): OPAPolicyEngine | null {
  return opaPolicyEngine;
}
