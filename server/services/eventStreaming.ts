/**
 * Event Streaming System
 * 
 * Manages real-time event streaming from the orchestrator.
 * Supports Server-Sent Events (SSE) and WebSocket transports.
 */

import { EventEmitter } from 'events';

export type EventType = 
  | 'agent.started'
  | 'agent.stopped'
  | 'agent.error'
  | 'agent.status_changed'
  | 'policy.updated'
  | 'policy.reloaded'
  | 'governance.violation'
  | 'governance.approved'
  | 'orchestrator.connected'
  | 'orchestrator.disconnected';

export interface StreamEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  workspaceId: number;
  agentId?: number;
  data: Record<string, any>;
}

export interface EventSubscriber {
  id: string;
  workspaceId: number;
  eventTypes: EventType[];
  callback: (event: StreamEvent) => void;
}

export class EventStreamManager extends EventEmitter {
  private subscribers: Map<string, EventSubscriber> = new Map();
  private eventBuffer: StreamEvent[] = [];
  private maxBufferSize: number = 1000;
  private eventIdCounter: number = 0;

  constructor(maxBufferSize?: number) {
    super();
    if (maxBufferSize) {
      this.maxBufferSize = maxBufferSize;
    }
  }

  /**
   * Subscribe to events
   */
  subscribe(
    workspaceId: number,
    eventTypes: EventType[],
    callback: (event: StreamEvent) => void
  ): string {
    const subscriberId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const subscriber: EventSubscriber = {
      id: subscriberId,
      workspaceId,
      eventTypes,
      callback,
    };

    this.subscribers.set(subscriberId, subscriber);

    this.emit('subscriber.added', { subscriberId, workspaceId });

    return subscriberId;
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriberId: string): boolean {
    const removed = this.subscribers.delete(subscriberId);
    if (removed) {
      this.emit('subscriber.removed', { subscriberId });
    }
    return removed;
  }

  /**
   * Emit an event to all subscribers
   */
  emitEvent(event: Omit<StreamEvent, 'id'>): void {
    const fullEvent: StreamEvent = {
      ...event,
      id: `evt_${++this.eventIdCounter}`,
    };

    // Add to buffer
    this.eventBuffer.push(fullEvent);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }

    // Dispatch to subscribers
    for (const subscriber of this.subscribers.values()) {
      if (
        subscriber.workspaceId === event.workspaceId &&
        subscriber.eventTypes.includes(event.type)
      ) {
        try {
          subscriber.callback(fullEvent);
        } catch (error) {
          console.error(`Error in subscriber callback: ${error}`);
        }
      }
    }

    // Emit to internal listeners
    this.emit('event', fullEvent);
  }

  /**
   * Get event history (for reconnection scenarios)
   */
  getEventHistory(
    workspaceId: number,
    eventTypes?: EventType[],
    limit: number = 100
  ): StreamEvent[] {
    return this.eventBuffer
      .filter(
        event =>
          event.workspaceId === workspaceId &&
          (!eventTypes || eventTypes.includes(event.type))
      )
      .slice(-limit);
  }

  /**
   * Get subscriber count
   */
  getSubscriberCount(workspaceId?: number): number {
    if (!workspaceId) {
      return this.subscribers.size;
    }
    return Array.from(this.subscribers.values()).filter(
      sub => sub.workspaceId === workspaceId
    ).length;
  }

  /**
   * Clear all subscribers for a workspace
   */
  clearWorkspaceSubscribers(workspaceId: number): number {
    let count = 0;
    for (const [id, subscriber] of this.subscribers.entries()) {
      if (subscriber.workspaceId === workspaceId) {
        this.subscribers.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.subscribers.clear();
    this.eventBuffer = [];
    this.eventIdCounter = 0;
  }
}

// Singleton instance
let eventStreamManager: EventStreamManager | null = null;

export function initializeEventStreaming(maxBufferSize?: number): EventStreamManager {
  eventStreamManager = new EventStreamManager(maxBufferSize);
  return eventStreamManager;
}

export function getEventStreamManager(): EventStreamManager | null {
  return eventStreamManager;
}

/**
 * Helper to emit common event types
 */
export function emitAgentEvent(
  type: 'started' | 'stopped' | 'error' | 'status_changed',
  workspaceId: number,
  agentId: number,
  data: Record<string, any> = {}
): void {
  const manager = getEventStreamManager();
  if (!manager) return;

  manager.emitEvent({
    type: `agent.${type}` as EventType,
    timestamp: new Date(),
    workspaceId,
    agentId,
    data,
  });
}

export function emitPolicyEvent(
  type: 'updated' | 'reloaded',
  workspaceId: number,
  data: Record<string, any> = {}
): void {
  const manager = getEventStreamManager();
  if (!manager) return;

  manager.emitEvent({
    type: `policy.${type}` as EventType,
    timestamp: new Date(),
    workspaceId,
    data,
  });
}

export function emitGovernanceEvent(
  type: 'violation' | 'approved',
  workspaceId: number,
  agentId: number,
  data: Record<string, any> = {}
): void {
  const manager = getEventStreamManager();
  if (!manager) return;

  manager.emitEvent({
    type: `governance.${type}` as EventType,
    timestamp: new Date(),
    workspaceId,
    agentId,
    data,
  });
}
