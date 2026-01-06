import type { InterceptorDecision, InterceptorContext } from "../types";

/**
 * Interceptor Chain
 * Phase 2: Orchestrator Runtime - Admission Control
 * 
 * Executes interceptors in order with fail-closed behavior (any deny = block)
 */

export interface Interceptor {
  name: string;
  execute(context: InterceptorContext): Promise<InterceptorDecision>;
}

export class InterceptorChain {
  private interceptors: Interceptor[] = [];

  /**
   * Register an interceptor
   * Interceptors execute in registration order
   */
  register(interceptor: Interceptor): void {
    this.interceptors.push(interceptor);
  }

  /**
   * Execute all interceptors with fail-closed behavior
   * If ANY interceptor denies, the entire chain fails
   */
  async execute(context: InterceptorContext): Promise<InterceptorDecision> {
    const allReasons: string[] = [];
    const allErrorCodes: string[] = [];

    for (const interceptor of this.interceptors) {
      try {
        const decision = await interceptor.execute(context);

        // Collect reasons and error codes
        if (decision.reasons) {
          allReasons.push(...decision.reasons);
        }
        if (decision.errorCodes) {
          allErrorCodes.push(...decision.errorCodes);
        }

        // Fail-closed: any deny blocks the entire chain
        if (decision.deny) {
          return {
            allow: false,
            deny: true,
            reasons: allReasons,
            errorCodes: allErrorCodes,
          };
        }

        // Restrict: continue but mark as restricted
        if (decision.restrict) {
          // Continue checking other interceptors
          continue;
        }
      } catch (error) {
        // Fail-closed: any error blocks the entire chain
        return {
          allow: false,
          deny: true,
          reasons: [
            ...allReasons,
            `Interceptor ${interceptor.name} failed: ${error instanceof Error ? error.message : String(error)}`,
          ],
          errorCodes: [...allErrorCodes, "INTERCEPTOR_ERROR"],
        };
      }
    }

    // All interceptors passed
    return {
      allow: true,
      deny: false,
      restrict: allReasons.length > 0, // Mark as restricted if any warnings
      reasons: allReasons,
      errorCodes: allErrorCodes,
    };
  }

  /**
   * Clear all registered interceptors
   */
  clear(): void {
    this.interceptors = [];
  }

  /**
   * Get list of registered interceptors
   */
  getInterceptors(): Interceptor[] {
    return [...this.interceptors];
  }
}
