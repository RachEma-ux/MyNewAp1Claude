/**
 * Client-Side Provider Router
 *
 * For local-only scenarios, route directly without server round-trip.
 * This router determines if requests can be handled locally and provides
 * the appropriate endpoint configuration.
 */

// Routing profile matching server-side definition
export interface WorkspaceRoutingProfile {
  defaultRoute: 'AUTO' | 'LOCAL_ONLY' | 'CLOUD_ALLOWED';
  dataSensitivity: 'LOW' | 'MED' | 'HIGH';
  qualityTier: 'FAST' | 'BALANCED' | 'BEST';
  fallback: { enabled: boolean; maxHops: number };
  pinnedProviderId?: number | null;
}

// Provider info for routing decisions
export interface ProviderInfo {
  id: number;
  name: string;
  type: string;
  kind: 'local' | 'cloud' | 'hybrid';
  enabled: boolean;
  baseUrl?: string;
  capabilities?: string[];
}

// Routing request from client
export interface ClientRoutingRequest {
  workspaceId: number;
  model?: string;
  taskHints?: {
    mustStayLocal?: boolean;
    maxLatencyMs?: number;
    requiredCapabilities?: string[];
  };
}

// Routing decision
export interface ClientRoutingDecision {
  useLocalRouting: boolean;
  providerId: number | null;
  providerName: string | null;
  endpoint: string | null;
  reason: string;
}

/**
 * Client-Side Provider Router
 */
class ClientProviderRouter {
  private localProviders: Map<number, ProviderInfo> = new Map();
  private workspaceProfiles: Map<number, WorkspaceRoutingProfile> = new Map();

  /**
   * Register local providers for direct routing
   */
  registerLocalProvider(provider: ProviderInfo) {
    if (provider.kind === 'local') {
      this.localProviders.set(provider.id, provider);
    }
  }

  /**
   * Update local providers list
   */
  updateLocalProviders(providers: ProviderInfo[]) {
    this.localProviders.clear();
    providers
      .filter(p => p.kind === 'local' && p.enabled)
      .forEach(p => this.localProviders.set(p.id, p));
  }

  /**
   * Cache workspace routing profile
   */
  setWorkspaceProfile(workspaceId: number, profile: WorkspaceRoutingProfile) {
    this.workspaceProfiles.set(workspaceId, profile);
  }

  /**
   * Check if request can be handled locally
   */
  canRouteLocally(request: ClientRoutingRequest): boolean {
    const profile = this.workspaceProfiles.get(request.workspaceId);

    // If no profile, default to server routing
    if (!profile) {
      return false;
    }

    // If LOCAL_ONLY mode, must route locally
    if (profile.defaultRoute === 'LOCAL_ONLY') {
      return this.localProviders.size > 0;
    }

    // If task explicitly requires local
    if (request.taskHints?.mustStayLocal) {
      return this.localProviders.size > 0;
    }

    // If HIGH data sensitivity, prefer local
    if (profile.dataSensitivity === 'HIGH') {
      return this.localProviders.size > 0;
    }

    // For AUTO mode with available local providers, can route locally
    if (profile.defaultRoute === 'AUTO' && this.localProviders.size > 0) {
      // Check if any local provider has required capabilities
      if (request.taskHints?.requiredCapabilities) {
        return this.hasCapableLocalProvider(request.taskHints.requiredCapabilities);
      }
      return true;
    }

    return false;
  }

  /**
   * Check if any local provider has required capabilities
   */
  private hasCapableLocalProvider(requiredCapabilities: string[]): boolean {
    for (const provider of this.localProviders.values()) {
      const caps = provider.capabilities || [];
      const hasAll = requiredCapabilities.every(cap => caps.includes(cap));
      if (hasAll) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get local provider endpoint
   */
  getLocalEndpoint(providerId: number): string | null {
    const provider = this.localProviders.get(providerId);
    if (!provider) return null;

    // Return the provider's base URL
    return provider.baseUrl || null;
  }

  /**
   * Get the best local provider for a request
   */
  getBestLocalProvider(request: ClientRoutingRequest): ProviderInfo | null {
    const profile = this.workspaceProfiles.get(request.workspaceId);
    const providers = Array.from(this.localProviders.values());

    if (providers.length === 0) {
      return null;
    }

    // If pinned provider is local, use it
    if (profile?.pinnedProviderId) {
      const pinned = this.localProviders.get(profile.pinnedProviderId);
      if (pinned) {
        return pinned;
      }
    }

    // Filter by required capabilities
    let eligible = providers;
    if (request.taskHints?.requiredCapabilities) {
      eligible = providers.filter(p => {
        const caps = p.capabilities || [];
        return request.taskHints!.requiredCapabilities!.every(cap => caps.includes(cap));
      });
    }

    // Return first eligible provider (could add scoring later)
    return eligible[0] || null;
  }

  /**
   * Determine if server routing is needed
   */
  needsServerRouting(
    request: ClientRoutingRequest,
    workspaceProfile?: WorkspaceRoutingProfile
  ): boolean {
    // Cache the profile if provided
    if (workspaceProfile) {
      this.workspaceProfiles.set(request.workspaceId, workspaceProfile);
    }

    // If we can route locally and should, don't need server
    if (this.canRouteLocally(request)) {
      const provider = this.getBestLocalProvider(request);
      if (provider && provider.baseUrl) {
        return false;
      }
    }

    // Need server for cloud routing
    return true;
  }

  /**
   * Make a routing decision
   */
  makeRoutingDecision(
    request: ClientRoutingRequest,
    workspaceProfile?: WorkspaceRoutingProfile
  ): ClientRoutingDecision {
    if (workspaceProfile) {
      this.workspaceProfiles.set(request.workspaceId, workspaceProfile);
    }

    const profile = this.workspaceProfiles.get(request.workspaceId);

    // Check if we should route locally
    if (this.canRouteLocally(request)) {
      const provider = this.getBestLocalProvider(request);
      if (provider && provider.baseUrl) {
        return {
          useLocalRouting: true,
          providerId: provider.id,
          providerName: provider.name,
          endpoint: provider.baseUrl,
          reason: this.getLocalRoutingReason(profile, request),
        };
      }
    }

    // Fall back to server routing
    return {
      useLocalRouting: false,
      providerId: null,
      providerName: null,
      endpoint: null,
      reason: this.getServerRoutingReason(profile, request),
    };
  }

  /**
   * Get reason for local routing
   */
  private getLocalRoutingReason(
    profile: WorkspaceRoutingProfile | undefined,
    request: ClientRoutingRequest
  ): string {
    if (profile?.defaultRoute === 'LOCAL_ONLY') {
      return 'Workspace configured for LOCAL_ONLY routing';
    }
    if (request.taskHints?.mustStayLocal) {
      return 'Task requires local execution';
    }
    if (profile?.dataSensitivity === 'HIGH') {
      return 'HIGH data sensitivity requires local processing';
    }
    return 'Local provider available for optimal latency';
  }

  /**
   * Get reason for server routing
   */
  private getServerRoutingReason(
    profile: WorkspaceRoutingProfile | undefined,
    request: ClientRoutingRequest
  ): string {
    if (!profile) {
      return 'No workspace routing profile configured';
    }
    if (this.localProviders.size === 0) {
      return 'No local providers available';
    }
    if (profile.defaultRoute === 'CLOUD_ALLOWED') {
      return 'Workspace allows cloud routing';
    }
    return 'Server routing for optimal provider selection';
  }

  /**
   * Get all registered local providers
   */
  getLocalProviders(): ProviderInfo[] {
    return Array.from(this.localProviders.values());
  }

  /**
   * Clear cached data
   */
  clearCache() {
    this.localProviders.clear();
    this.workspaceProfiles.clear();
  }
}

// Singleton instance
export const clientProviderRouter = new ClientProviderRouter();
