/**
 * Real-Time Collaboration Service
 * Enables multiple users to collaborate in real-time using WebSocket
 */

import { WebSocket, WebSocketServer } from "ws";

export interface CollaborationSession {
  id: string;
  documentId: string;
  participants: Map<string, CollaborationUser>;
  content: string;
  cursors: Map<string, CursorPosition>;
  createdAt: number;
}

export interface CollaborationUser {
  userId: number;
  username: string;
  color: string;
  lastSeen: number;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface CollaborationMessage {
  type: "join" | "leave" | "edit" | "cursor" | "sync";
  sessionId: string;
  userId: number;
  data?: any;
  timestamp: number;
}

/**
 * Collaboration Service
 */
class CollaborationService {
  private sessions: Map<string, CollaborationSession> = new Map();
  private userSockets: Map<number, WebSocket> = new Map();
  private wss: WebSocketServer | null = null;

  /**
   * Initialize WebSocket server
   */
  initialize(port: number): void {
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws: WebSocket) => {
      console.log("[Collaboration] New WebSocket connection");

      ws.on("message", (data: string) => {
        try {
          const message: CollaborationMessage = JSON.parse(data);
          this.handleMessage(ws, message);
        } catch (error) {
          console.error("[Collaboration] Invalid message:", error);
        }
      });

      ws.on("close", () => {
        this.handleDisconnect(ws);
      });
    });

    console.log(`[Collaboration] WebSocket server started on port ${port}`);
  }

  /**
   * Create a collaboration session
   */
  createSession(documentId: string): CollaborationSession {
    const session: CollaborationSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      documentId,
      participants: new Map(),
      content: "",
      cursors: new Map(),
      createdAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    console.log(`[Collaboration] Created session: ${session.id}`);

    return session;
  }

  /**
   * Join a collaboration session
   */
  joinSession(
    sessionId: string,
    userId: number,
    username: string,
    ws: WebSocket
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Add user to session
    const user: CollaborationUser = {
      userId,
      username,
      color: this.generateUserColor(userId),
      lastSeen: Date.now(),
    };

    session.participants.set(userId.toString(), user);
    this.userSockets.set(userId, ws);

    // Broadcast join event
    this.broadcast(sessionId, {
      type: "join",
      sessionId,
      userId,
      data: { user, participantCount: session.participants.size },
      timestamp: Date.now(),
    });

    // Send current state to new user
    this.sendToUser(userId, {
      type: "sync",
      sessionId,
      userId,
      data: {
        content: session.content,
        participants: Array.from(session.participants.values()),
        cursors: Object.fromEntries(session.cursors),
      },
      timestamp: Date.now(),
    });

    console.log(`[Collaboration] User ${username} joined session ${sessionId}`);

    return true;
  }

  /**
   * Leave a collaboration session
   */
  leaveSession(sessionId: string, userId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.participants.delete(userId.toString());
    session.cursors.delete(userId.toString());
    this.userSockets.delete(userId);

    // Broadcast leave event
    this.broadcast(sessionId, {
      type: "leave",
      sessionId,
      userId,
      data: { participantCount: session.participants.size },
      timestamp: Date.now(),
    });

    // Clean up empty sessions
    if (session.participants.size === 0) {
      this.sessions.delete(sessionId);
      console.log(`[Collaboration] Deleted empty session: ${sessionId}`);
    }
  }

  /**
   * Handle edit operation
   */
  handleEdit(sessionId: string, userId: number, edit: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Apply edit to content (simplified - in production use OT or CRDT)
    session.content = edit.content;

    // Broadcast edit to all participants except sender
    this.broadcast(
      sessionId,
      {
        type: "edit",
        sessionId,
        userId,
        data: edit,
        timestamp: Date.now(),
      },
      userId
    );
  }

  /**
   * Handle cursor movement
   */
  handleCursor(sessionId: string, userId: number, position: CursorPosition): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.cursors.set(userId.toString(), position);

    // Broadcast cursor position
    this.broadcast(
      sessionId,
      {
        type: "cursor",
        sessionId,
        userId,
        data: position,
        timestamp: Date.now(),
      },
      userId
    );
  }

  /**
   * Handle incoming message
   */
  private handleMessage(ws: WebSocket, message: CollaborationMessage): void {
    switch (message.type) {
      case "join":
        // Handle in joinSession
        break;
      case "leave":
        this.leaveSession(message.sessionId, message.userId);
        break;
      case "edit":
        this.handleEdit(message.sessionId, message.userId, message.data);
        break;
      case "cursor":
        this.handleCursor(message.sessionId, message.userId, message.data);
        break;
    }
  }

  /**
   * Handle disconnect
   */
  private handleDisconnect(ws: WebSocket): void {
    // Find user by socket
    for (const [userId, socket] of Array.from(this.userSockets.entries())) {
      if (socket === ws) {
        // Find all sessions user is in
        for (const session of Array.from(this.sessions.values())) {
          if (session.participants.has(userId.toString())) {
            this.leaveSession(session.id, userId);
          }
        }
        break;
      }
    }
  }

  /**
   * Broadcast message to all participants in a session
   */
  private broadcast(
    sessionId: string,
    message: CollaborationMessage,
    excludeUserId?: number
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const messageStr = JSON.stringify(message);

    for (const participant of Array.from(session.participants.values())) {
      if (excludeUserId && participant.userId === excludeUserId) {
        continue;
      }

      const ws = this.userSockets.get(participant.userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  /**
   * Send message to specific user
   */
  private sendToUser(userId: number, message: CollaborationMessage): void {
    const ws = this.userSockets.get(userId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Generate color for user
   */
  private generateUserColor(userId: number): string {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#FFA07A",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E2",
    ];

    return colors[userId % colors.length];
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): CollaborationSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get statistics
   */
  getStatistics() {
    return {
      activeSessions: this.sessions.size,
      totalParticipants: Array.from(this.sessions.values()).reduce(
        (sum, session) => sum + session.participants.size,
        0
      ),
      connectedUsers: this.userSockets.size,
    };
  }
}

// Singleton instance
export const collaborationService = new CollaborationService();
