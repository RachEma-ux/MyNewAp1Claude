/**
 * SSE Client for External Orchestrator Events
 * Phase 3: External Orchestrator Support
 * 
 * Subscribes to Server-Sent Events from external orchestrator:
 * - Policy updates (hot reload notifications)
 * - Agent invalidations (governance status changes)
 * - Runtime events (agent start/stop)
 * 
 * Falls back to polling if SSE unavailable
 */

import type { TLSContext } from "../security/tlsConfig";

export interface SSEEvent {
  type: "policy_update" | "agent_invalidation" | "runtime_event";
  data: any;
  timestamp: string;
}

export interface SSEClientConfig {
  baseUrl: string;
  workspaceId: string;
  apiKey: string;
  tlsContext?: TLSContext;
  reconnectDelay?: number; // milliseconds
  maxReconnectAttempts?: number;
}

export type SSEEventHandler = (event: SSEEvent) => void;

/**
 * SSE Client
 * Maintains persistent connection to external orchestrator event stream
 */
export class SSEClient {
  private eventSource?: EventSource;
  private reconnectAttempts = 0;
  private maxReconnectAttempts: number;
  private reconnectDelay: number;
  private handlers: Map<string, Set<SSEEventHandler>> = new Map();
  private pollingInterval?: NodeJS.Timeout;
  private isPolling = false;

  constructor(private config: SSEClientConfig) {
    this.maxReconnectAttempts = config.maxReconnectAttempts || 10;
    this.reconnectDelay = config.reconnectDelay || 5000; // 5s
  }

  /**
   * Connect to SSE stream
   */
  async connect(): Promise<void> {
    const url = `${this.config.baseUrl}/v1/workspaces/${this.config.workspaceId}/events/stream`;

    try {
      // Note: EventSource is browser-only API
      // For Node.js, use eventsource npm package or fetch with streaming
      
      // MVP: Use polling fallback for Node.js environment
      if (typeof EventSource === "undefined") {
        console.log("[SSE] EventSource not available, falling back to polling");
        this.startPolling();
        return;
      }

      this.eventSource = new EventSource(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      } as any);

      this.eventSource.onopen = () => {
        console.log("[SSE] Connected to event stream");
        this.reconnectAttempts = 0;
        this.stopPolling();
      };

      this.eventSource.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.eventSource.onerror = (error) => {
        console.error("[SSE] Connection error:", error);
        this.handleError();
      };
    } catch (error) {
      console.error("[SSE] Failed to connect:", error);
      this.startPolling();
    }
  }

  /**
   * Disconnect from SSE stream
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    this.stopPolling();
  }

  /**
   * Subscribe to event type
   */
  on(eventType: string, handler: SSEEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType)!.add(handler);
  }

  /**
   * Unsubscribe from event type
   */
  off(eventType: string, handler: SSEEventHandler): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Handle incoming message
   */
  private handleMessage(data: string): void {
    try {
      const event: SSEEvent = JSON.parse(data);
      
      // Emit to type-specific handlers
      const handlers = this.handlers.get(event.type);
      if (handlers) {
        handlers.forEach((handler) => handler(event));
      }

      // Emit to wildcard handlers
      const wildcardHandlers = this.handlers.get("*");
      if (wildcardHandlers) {
        wildcardHandlers.forEach((handler) => handler(event));
      }
    } catch (error) {
      console.error("[SSE] Failed to parse event:", error);
    }
  }

  /**
   * Handle connection error
   */
  private handleError(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[SSE] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
    } else {
      console.log("[SSE] Max reconnect attempts reached, falling back to polling");
      this.startPolling();
    }
  }

  /**
   * Start polling fallback
   */
  private startPolling(): void {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;
    console.log("[SSE] Starting polling fallback (interval: 30s)");

    this.pollingInterval = setInterval(async () => {
      try {
        await this.pollEvents();
      } catch (error) {
        console.error("[SSE] Polling error:", error);
      }
    }, 30000); // Poll every 30s
  }

  /**
   * Stop polling fallback
   */
  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = undefined;
      this.isPolling = false;
    }
  }

  /**
   * Poll for events (fallback)
   */
  private async pollEvents(): Promise<void> {
    const url = `${this.config.baseUrl}/v1/workspaces/${this.config.workspaceId}/events/recent`;

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Polling failed: ${response.status}`);
      }

      const events: SSEEvent[] = await response.json();
      
      // Emit each event
      events.forEach((event) => {
        const handlers = this.handlers.get(event.type);
        if (handlers) {
          handlers.forEach((handler) => handler(event));
        }
      });
    } catch (error) {
      console.error("[SSE] Polling failed:", error);
    }
  }

  /**
   * Get connection status
   */
  getStatus(): "connected" | "polling" | "disconnected" {
    if (this.eventSource && this.eventSource.readyState === EventSource.OPEN) {
      return "connected";
    } else if (this.isPolling) {
      return "polling";
    } else {
      return "disconnected";
    }
  }
}

/**
 * Create SSE client for workspace
 */
export function createSSEClient(config: SSEClientConfig): SSEClient {
  return new SSEClient(config);
}
