/**
 * Real-Time Collaboration Service
 * Enables multiple users to collaborate in real-time
 */

import { WebSocket } from "ws";

export interface CollaborationSession {
  id: string;
  workspaceId: number;
  resourceType: "document" | "code" | "chat" | "canvas";
  resourceId: string;
  participants: Participant[];
  createdAt: number;
}

export interface Participant {
  userId: number;
  username: string;
  color: string;
  cursor?: CursorPosition;
  selection?: Selection;
  lastActivity: number;
}

export interface CursorPosition {
  line: number;
  column: number;
}

export interface Selection {
  start: CursorPosition;
  end: CursorPosition;
}

export interface CollaborationEvent {
  type: "join" | "leave" | "cursor" | "edit" | "selection" | "message";
  sessionId: string;
  userId: number;
  timestamp: number;
  data: any;
}

/**
 * Real-Time Collaboration Manager
 */
class RealtimeCollaborationService {
  private sessions: Map<string, CollaborationSession> = new Map();
  private connections: Map<number, WebSocket> = new Map(); // userId -> WebSocket
  private userSessions: Map<number, Set<string>> = new Map(); // userId -> sessionIds
  
  /**
   * Create collaboration session
   */
  createSession(
    workspaceId: number,
    resourceType: CollaborationSession["resourceType"],
    resourceId: string
  ): CollaborationSession {
    const session: CollaborationSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workspaceId,
      resourceType,
      resourceId,
      participants: [],
      createdAt: Date.now(),
    };
    
    this.sessions.set(session.id, session);
    
    console.log(`[Collaboration] Created session: ${session.id}`);
    
    return session;
  }
  
  /**
   * Join session
   */
  joinSession(
    sessionId: string,
    userId: number,
    username: string,
    ws: WebSocket
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    // Check if already in session
    const existing = session.participants.find((p) => p.userId === userId);
    if (existing) {
      existing.lastActivity = Date.now();
      return true;
    }
    
    // Add participant
    const participant: Participant = {
      userId,
      username,
      color: this.generateColor(userId),
      lastActivity: Date.now(),
    };
    
    session.participants.push(participant);
    
    // Store connection
    this.connections.set(userId, ws);
    
    // Track user sessions
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(sessionId);
    
    // Broadcast join event
    this.broadcastEvent(sessionId, {
      type: "join",
      sessionId,
      userId,
      timestamp: Date.now(),
      data: { participant },
    });
    
    console.log(`[Collaboration] User ${userId} joined session ${sessionId}`);
    
    return true;
  }
  
  /**
   * Leave session
   */
  leaveSession(sessionId: string, userId: number): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    
    // Remove participant
    session.participants = session.participants.filter((p) => p.userId !== userId);
    
    // Remove from user sessions
    this.userSessions.get(userId)?.delete(sessionId);
    
    // Broadcast leave event
    this.broadcastEvent(sessionId, {
      type: "leave",
      sessionId,
      userId,
      timestamp: Date.now(),
      data: {},
    });
    
    // Clean up empty session
    if (session.participants.length === 0) {
      this.sessions.delete(sessionId);
      console.log(`[Collaboration] Deleted empty session: ${sessionId}`);
    }
    
    return true;
  }
  
  /**
   * Update cursor position
   */
  updateCursor(sessionId: string, userId: number, position: CursorPosition): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const participant = session.participants.find((p) => p.userId === userId);
    if (!participant) return;
    
    participant.cursor = position;
    participant.lastActivity = Date.now();
    
    // Broadcast cursor update
    this.broadcastEvent(sessionId, {
      type: "cursor",
      sessionId,
      userId,
      timestamp: Date.now(),
      data: { position },
    }, userId);
  }
  
  /**
   * Update selection
   */
  updateSelection(sessionId: string, userId: number, selection: Selection): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const participant = session.participants.find((p) => p.userId === userId);
    if (!participant) return;
    
    participant.selection = selection;
    participant.lastActivity = Date.now();
    
    // Broadcast selection update
    this.broadcastEvent(sessionId, {
      type: "selection",
      sessionId,
      userId,
      timestamp: Date.now(),
      data: { selection },
    }, userId);
  }
  
  /**
   * Broadcast edit operation
   */
  broadcastEdit(sessionId: string, userId: number, edit: any): void {
    this.broadcastEvent(sessionId, {
      type: "edit",
      sessionId,
      userId,
      timestamp: Date.now(),
      data: { edit },
    }, userId);
  }
  
  /**
   * Send message in session
   */
  sendMessage(sessionId: string, userId: number, message: string): void {
    this.broadcastEvent(sessionId, {
      type: "message",
      sessionId,
      userId,
      timestamp: Date.now(),
      data: { message },
    });
  }
  
  /**
   * Broadcast event to all participants
   */
  private broadcastEvent(
    sessionId: string,
    event: CollaborationEvent,
    excludeUserId?: number
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const message = JSON.stringify(event);
    
    session.participants.forEach((participant) => {
      if (excludeUserId && participant.userId === excludeUserId) return;
      
      const ws = this.connections.get(participant.userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }
  
  /**
   * Generate color for user
   */
  private generateColor(userId: number): string {
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
   * Get session
   */
  getSession(sessionId: string): CollaborationSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * List sessions for workspace
   */
  listSessions(workspaceId: number): CollaborationSession[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.workspaceId === workspaceId
    );
  }
  
  /**
   * Get active participants count
   */
  getActiveParticipants(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    return session ? session.participants.length : 0;
  }
  
  /**
   * Clean up inactive participants
   */
  cleanupInactive(maxInactiveMs = 300000): void {
    const now = Date.now();
    
    this.sessions.forEach((session) => {
      session.participants = session.participants.filter((participant) => {
        const inactive = now - participant.lastActivity > maxInactiveMs;
        
        if (inactive) {
          console.log(`[Collaboration] Removing inactive user ${participant.userId} from session ${session.id}`);
          this.broadcastEvent(session.id, {
            type: "leave",
            sessionId: session.id,
            userId: participant.userId,
            timestamp: now,
            data: { reason: "inactive" },
          });
        }
        
        return !inactive;
      });
      
      // Clean up empty sessions
      if (session.participants.length === 0) {
        this.sessions.delete(session.id);
      }
    });
  }
}

export const realtimeCollaborationService = new RealtimeCollaborationService();

// Clean up inactive participants every 5 minutes
const _realtimeCleanupInterval = setInterval(() => {
  realtimeCollaborationService.cleanupInactive();
}, 300000);

export function stopRealtimeCleanup() {
  clearInterval(_realtimeCleanupInterval);
}
