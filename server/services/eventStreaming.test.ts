/**
 * Event Streaming Tests
 * 
 * Unit tests for EventStreamManager service
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventStreamManager } from './eventStreaming';

describe('EventStreamManager', () => {
  let manager: EventStreamManager;

  beforeEach(() => {
    manager = new EventStreamManager(100);
  });

  describe('subscribe', () => {
    it('should subscribe to events', () => {
      const callback = vi.fn();
      const id = manager.subscribe(1, ['agent.started'], callback);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(manager.getSubscriberCount(1)).toBe(1);
    });

    it('should support multiple subscriptions', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      manager.subscribe(1, ['agent.started'], callback1);
      manager.subscribe(1, ['agent.stopped'], callback2);

      expect(manager.getSubscriberCount(1)).toBe(2);
    });

    it('should support multiple event types', () => {
      const callback = vi.fn();
      manager.subscribe(1, ['agent.started', 'agent.stopped'], callback);

      expect(manager.getSubscriberCount(1)).toBe(1);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe from events', () => {
      const callback = vi.fn();
      const id = manager.subscribe(1, ['agent.started'], callback);

      expect(manager.getSubscriberCount(1)).toBe(1);

      manager.unsubscribe(1, id);

      expect(manager.getSubscriberCount(1)).toBe(0);
    });

    it('should handle invalid subscription IDs', () => {
      expect(() => {
        manager.unsubscribe(1, 'invalid-id');
      }).not.toThrow();
    });
  });

  describe('emitEvent', () => {
    it('should emit events to subscribers', (done) => {
      const callback = vi.fn((event) => {
        expect(event.type).toBe('agent.started');
        expect(event.workspaceId).toBe(1);
        done();
      });

      manager.subscribe(1, ['agent.started'], callback);

      manager.emitEvent({
        type: 'agent.started',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });
    });

    it('should filter events by type', (done) => {
      let eventCount = 0;
      const callback = vi.fn(() => {
        eventCount++;
      });

      manager.subscribe(1, ['agent.started'], callback);

      manager.emitEvent({
        type: 'agent.started',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });

      manager.emitEvent({
        type: 'agent.stopped',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });

      setTimeout(() => {
        expect(eventCount).toBe(1);
        done();
      }, 50);
    });

    it('should not emit events to other workspaces', (done) => {
      const callback = vi.fn();

      manager.subscribe(1, ['agent.started'], callback);

      manager.emitEvent({
        type: 'agent.started',
        timestamp: new Date(),
        workspaceId: 2,
        agentId: 1,
        data: {},
      });

      setTimeout(() => {
        expect(callback).not.toHaveBeenCalled();
        done();
      }, 50);
    });

    it('should emit to multiple subscribers', (done) => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      manager.subscribe(1, ['agent.started'], callback1);
      manager.subscribe(1, ['agent.started'], callback2);

      manager.emitEvent({
        type: 'agent.started',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });

      setTimeout(() => {
        expect(callback1).toHaveBeenCalled();
        expect(callback2).toHaveBeenCalled();
        done();
      }, 50);
    });
  });

  describe('getEventHistory', () => {
    it('should retrieve event history', () => {
      manager.emitEvent({
        type: 'agent.started',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });

      const history = manager.getEventHistory(1);
      expect(history).toHaveLength(1);
      expect(history[0].type).toBe('agent.started');
    });

    it('should maintain event buffer size limit', () => {
      const smallManager = new EventStreamManager(5);

      for (let i = 0; i < 10; i++) {
        smallManager.emitEvent({
          type: 'agent.started',
          timestamp: new Date(),
          workspaceId: 1,
          agentId: i,
          data: {},
        });
      }

      const history = smallManager.getEventHistory(1);
      expect(history.length).toBeLessThanOrEqual(5);
    });

    it('should return empty history for unknown workspace', () => {
      const history = manager.getEventHistory(999);
      expect(history).toHaveLength(0);
    });
  });

  describe('getSubscriberCount', () => {
    it('should return correct subscriber count', () => {
      expect(manager.getSubscriberCount(1)).toBe(0);

      manager.subscribe(1, ['agent.started'], () => {});
      expect(manager.getSubscriberCount(1)).toBe(1);

      manager.subscribe(1, ['agent.stopped'], () => {});
      expect(manager.getSubscriberCount(1)).toBe(2);
    });

    it('should return 0 for unknown workspace', () => {
      expect(manager.getSubscriberCount(999)).toBe(0);
    });
  });

  describe('event data preservation', () => {
    it('should preserve event data', (done) => {
      const eventData = { detail: 'test data', value: 123 };
      const callback = vi.fn((event) => {
        expect(event.data).toEqual(eventData);
        done();
      });

      manager.subscribe(1, ['agent.started'], callback);

      manager.emitEvent({
        type: 'agent.started',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: eventData,
      });
    });

    it('should preserve event timestamp', (done) => {
      const now = new Date();
      const callback = vi.fn((event) => {
        expect(event.timestamp).toEqual(now);
        done();
      });

      manager.subscribe(1, ['agent.started'], callback);

      manager.emitEvent({
        type: 'agent.started',
        timestamp: now,
        workspaceId: 1,
        agentId: 1,
        data: {},
      });
    });
  });

  describe('error handling', () => {
    it('should handle subscriber callback errors', () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });

      manager.subscribe(1, ['agent.started'], errorCallback);

      expect(() => {
        manager.emitEvent({
          type: 'agent.started',
          timestamp: new Date(),
          workspaceId: 1,
          agentId: 1,
          data: {},
        });
      }).not.toThrow();
    });
  });

  describe('multiple event types', () => {
    it('should handle multiple event types in subscription', (done) => {
      let eventCount = 0;
      const callback = vi.fn(() => {
        eventCount++;
      });

      manager.subscribe(1, ['agent.started', 'agent.stopped', 'policy.updated'], callback);

      manager.emitEvent({
        type: 'agent.started',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });

      manager.emitEvent({
        type: 'agent.stopped',
        timestamp: new Date(),
        workspaceId: 1,
        agentId: 1,
        data: {},
      });

      manager.emitEvent({
        type: 'policy.updated',
        timestamp: new Date(),
        workspaceId: 1,
        policyId: 1,
        data: {},
      });

      setTimeout(() => {
        expect(eventCount).toBe(3);
        done();
      }, 50);
    });
  });
});
