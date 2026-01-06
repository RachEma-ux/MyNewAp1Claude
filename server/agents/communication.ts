/**
 * Agent-to-Agent Communication Protocol
 * Enables agents to send messages and share information
 */

export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  type: "request" | "response" | "notification" | "broadcast";
  content: {
    action?: string;
    data?: any;
    context?: Record<string, any>;
  };
  timestamp: number;
  replyTo?: string; // ID of message this is replying to
}

export interface MessageHandler {
  (message: AgentMessage): Promise<AgentMessage | null>;
}

/**
 * Agent Communication Bus
 * Central message broker for agent-to-agent communication
 */
class AgentCommunicationBus {
  private messageHandlers: Map<string, MessageHandler> = new Map();
  private messageHistory: Map<string, AgentMessage[]> = new Map();
  private maxHistorySize = 1000;

  /**
   * Register an agent to receive messages
   */
  registerAgent(agentId: string, handler: MessageHandler): void {
    this.messageHandlers.set(agentId, handler);
    console.log(`[CommunicationBus] Registered agent: ${agentId}`);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): void {
    this.messageHandlers.delete(agentId);
    console.log(`[CommunicationBus] Unregistered agent: ${agentId}`);
  }

  /**
   * Send a message from one agent to another
   */
  async sendMessage(message: AgentMessage): Promise<AgentMessage | null> {
    // Store in history
    this.addToHistory(message);

    // Get handler for target agent
    const handler = this.messageHandlers.get(message.toAgentId);
    if (!handler) {
      console.warn(
        `[CommunicationBus] No handler for agent: ${message.toAgentId}`
      );
      return null;
    }

    try {
      // Deliver message
      const response = await handler(message);

      // Store response in history if exists
      if (response) {
        this.addToHistory(response);
      }

      return response;
    } catch (error) {
      console.error(
        `[CommunicationBus] Error delivering message to ${message.toAgentId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Broadcast a message to all agents
   */
  async broadcast(fromAgentId: string, content: any): Promise<void> {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fromAgentId,
      toAgentId: "all",
      type: "broadcast",
      content,
      timestamp: Date.now(),
    };

    this.addToHistory(message);

    // Send to all registered agents except sender
    const promises = Array.from(this.messageHandlers.entries())
      .filter(([agentId]) => agentId !== fromAgentId)
      .map(([_, handler]) => handler(message).catch((error) => {
        console.error("[CommunicationBus] Broadcast delivery error:", error);
        return null;
      }));

    await Promise.all(promises);
  }

  /**
   * Request-response pattern
   */
  async requestResponse(
    fromAgentId: string,
    toAgentId: string,
    action: string,
    data?: any,
    timeout = 30000
  ): Promise<AgentMessage | null> {
    const requestMessage: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fromAgentId,
      toAgentId,
      type: "request",
      content: { action, data },
      timestamp: Date.now(),
    };

    // Send message with timeout
    const responsePromise = this.sendMessage(requestMessage);
    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeout)
    );

    return Promise.race([responsePromise, timeoutPromise]);
  }

  /**
   * Get message history for an agent
   */
  getHistory(agentId: string): AgentMessage[] {
    return this.messageHistory.get(agentId) || [];
  }

  /**
   * Get conversation between two agents
   */
  getConversation(agentId1: string, agentId2: string): AgentMessage[] {
    const history1 = this.getHistory(agentId1);
    const history2 = this.getHistory(agentId2);

    const conversation = [...history1, ...history2].filter(
      (msg) =>
        (msg.fromAgentId === agentId1 && msg.toAgentId === agentId2) ||
        (msg.fromAgentId === agentId2 && msg.toAgentId === agentId1)
    );

    // Sort by timestamp
    conversation.sort((a, b) => a.timestamp - b.timestamp);

    return conversation;
  }

  /**
   * Clear message history
   */
  clearHistory(agentId?: string): void {
    if (agentId) {
      this.messageHistory.delete(agentId);
    } else {
      this.messageHistory.clear();
    }
  }

  /**
   * Add message to history
   */
  private addToHistory(message: AgentMessage): void {
    // Add to sender's history
    const senderHistory = this.messageHistory.get(message.fromAgentId) || [];
    senderHistory.push(message);
    if (senderHistory.length > this.maxHistorySize) {
      senderHistory.shift();
    }
    this.messageHistory.set(message.fromAgentId, senderHistory);

    // Add to receiver's history (if not broadcast)
    if (message.toAgentId !== "all") {
      const receiverHistory = this.messageHistory.get(message.toAgentId) || [];
      receiverHistory.push(message);
      if (receiverHistory.length > this.maxHistorySize) {
        receiverHistory.shift();
      }
      this.messageHistory.set(message.toAgentId, receiverHistory);
    }
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      registeredAgents: this.messageHandlers.size,
      totalMessages: Array.from(this.messageHistory.values()).reduce(
        (sum, history) => sum + history.length,
        0
      ),
      agentsWithHistory: this.messageHistory.size,
    };
  }
}

/**
 * Agent Communication Helper
 * Provides convenient methods for agents to communicate
 */
export class AgentCommunicator {
  constructor(
    private agentId: string,
    private bus: AgentCommunicationBus
  ) {}

  /**
   * Send a message to another agent
   */
  async send(
    toAgentId: string,
    content: any,
    type: AgentMessage["type"] = "notification"
  ): Promise<AgentMessage | null> {
    const message: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fromAgentId: this.agentId,
      toAgentId,
      type,
      content,
      timestamp: Date.now(),
    };

    return this.bus.sendMessage(message);
  }

  /**
   * Request something from another agent
   */
  async request(
    toAgentId: string,
    action: string,
    data?: any
  ): Promise<AgentMessage | null> {
    return this.bus.requestResponse(this.agentId, toAgentId, action, data);
  }

  /**
   * Broadcast to all agents
   */
  async broadcast(content: any): Promise<void> {
    return this.bus.broadcast(this.agentId, content);
  }

  /**
   * Reply to a message
   */
  async reply(originalMessage: AgentMessage, content: any): Promise<AgentMessage | null> {
    const replyMessage: AgentMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fromAgentId: this.agentId,
      toAgentId: originalMessage.fromAgentId,
      type: "response",
      content,
      timestamp: Date.now(),
      replyTo: originalMessage.id,
    };

    return this.bus.sendMessage(replyMessage);
  }

  /**
   * Get conversation history with another agent
   */
  getConversation(otherAgentId: string): AgentMessage[] {
    return this.bus.getConversation(this.agentId, otherAgentId);
  }
}

// Singleton communication bus
export const communicationBus = new AgentCommunicationBus();

/**
 * Create a communicator for an agent
 */
export function createCommunicator(agentId: string): AgentCommunicator {
  return new AgentCommunicator(agentId, communicationBus);
}
