import { 
  MatchmakingQueueEntry, 
  CallSession, 
  SignalingPayload 
} from '../types/index.ts';

interface ClientConnection {
  socket: WebSocket;
  userId: string;
  currentRoomId?: string;
  partnerSocket?: WebSocket;
  lastPartnerId?: string;
}

export class MatchmakingService {
  private queue: MatchmakingQueueEntry[] = [];
  private activeConnections: Map<string, ClientConnection> = new Map(); // socketId -> ClientConnection
  private userToSocketId: Map<string, string> = new Map(); // userId -> socketId
  private activeCallSessions: Map<string, CallSession> = new Map(); // roomId -> CallSession

  registerClient(socketId: string, socket: WebSocket, userId: string) {
    this.activeConnections.set(socketId, { socket, userId });
    this.userToSocketId.set(userId, socketId);
  }

  unregisterClient(socketId: string) {
    const conn = this.activeConnections.get(socketId);
    if (!conn) return;

    // 1. Remove from matchmaking queue if present
    this.removeFromQueue(conn.userId);

    // 2. If in an active call, notify partner and end call
    if (conn.currentRoomId) {
      this.handleHangup(socketId, 'PEER_DISCONNECTED');
    }

    this.userToSocketId.delete(conn.userId);
    this.activeConnections.delete(socketId);
  }

  handleSignalingMessage(socketId: string, payload: SignalingPayload) {
    const conn = this.activeConnections.get(socketId);
    if (!conn) return;

    switch (payload.type) {
      case 'JOIN_RANDOM_QUEUE': {
        const callType = (payload.metadata?.callType as 'AUDIO' | 'VIDEO') || (payload.metadata?.audioOnly === false ? 'VIDEO' : 'AUDIO');
        this.joinQueue(conn, callType);
        break;
      }

      case 'LEAVE_RANDOM_QUEUE':
        this.removeFromQueue(conn.userId);
        this.send(conn.socket, { type: 'LEAVE_RANDOM_QUEUE', message: 'Left matchmaking queue' });
        break;

      case 'NEXT_PERSON': {
        const lastCallType = (payload.metadata?.callType as 'AUDIO' | 'VIDEO') || 'AUDIO';
        this.handleHangup(socketId, 'NEXT_PERSON');
        // Immediately rejoin queue for new match with same callType preference
        this.joinQueue(conn, lastCallType);
        break;
      }

      case 'END_CALL':
        this.handleHangup(socketId, 'END_CALL');
        break;

      case 'CALL_OFFER':
      case 'CALL_ANSWER':
      case 'ICE_CANDIDATE':
        this.relayWebRtcSignal(conn, payload);
        break;

      default:
        break;
    }
  }

  private joinQueue(conn: ClientConnection, callType: 'AUDIO' | 'VIDEO' = 'AUDIO') {
    // Check if already in queue
    const existingIndex = this.queue.findIndex(q => q.userId === conn.userId);
    if (existingIndex !== -1) {
      this.queue.splice(existingIndex, 1);
    }

    const socketId = this.userToSocketId.get(conn.userId) || '';
    const entry: MatchmakingQueueEntry = {
      userId: conn.userId,
      socketId,
      joinedAt: Date.now(),
      callType,
      lastMatchedWith: conn.lastPartnerId ? [conn.lastPartnerId] : []
    };

    this.queue.push(entry);

    // Try finding an instant match
    this.processQueue();
  }

  private removeFromQueue(userId: string) {
    this.queue = this.queue.filter(q => q.userId !== userId);
  }

  private processQueue() {
    if (this.queue.length < 2) return;

    // Scan queue for eligible pairs matching the same callType (AUDIO with AUDIO, VIDEO with VIDEO)
    for (let i = 0; i < this.queue.length; i++) {
      const candidateA = this.queue[i];
      const connA = this.activeConnections.get(candidateA.socketId);
      if (!connA || connA.socket.readyState !== WebSocket.OPEN) continue;

      for (let j = i + 1; j < this.queue.length; j++) {
        const candidateB = this.queue[j];
        const connB = this.activeConnections.get(candidateB.socketId);
        if (!connB || connB.socket.readyState !== WebSocket.OPEN) continue;

        // Skip if same user opened two tabs
        if (candidateA.userId === candidateB.userId) continue;

        // Ensure matching callType (Audio to Audio, Video to Video)
        if (candidateA.callType !== candidateB.callType) continue;

        // Avoid immediate back-to-back rematch if other candidates exist
        const recentlyMatched = (candidateA.lastMatchedWith?.includes(candidateB.userId)) && this.queue.length > 2;
        if (recentlyMatched) continue;

        // MATCH FOUND!
        // Remove both from queue
        this.queue.splice(j, 1);
        this.queue.splice(i, 1);

        this.establishMatch(connA, connB, candidateA.callType);
        return; // Recurse or process next on subsequent triggers
      }
    }
  }

  private establishMatch(connA: ClientConnection, connB: ClientConnection, callType: 'AUDIO' | 'VIDEO') {
    const roomId = `room_match_${crypto.randomUUID()}`;

    connA.currentRoomId = roomId;
    connA.partnerSocket = connB.socket;
    connA.lastPartnerId = connB.userId;

    connB.currentRoomId = roomId;
    connB.partnerSocket = connA.socket;
    connB.lastPartnerId = connA.userId;

    const session: CallSession = {
      callId: `call_${crypto.randomUUID()}`,
      callType: callType === 'VIDEO' ? 'RANDOM_VIDEO' : 'RANDOM_AUDIO',
      callerId: connA.userId,
      receiverId: connB.userId,
      roomId,
      startedAt: Date.now(),
      hasVideo: callType === 'VIDEO',
      status: 'CONNECTED'
    };

    this.activeCallSessions.set(roomId, session);

    // User A acts as the WebRTC Initiator (will send CALL_OFFER)
    this.send(connA.socket, {
      type: 'MATCH_FOUND',
      roomId,
      targetUserId: connB.userId,
      metadata: {
        isInitiator: true,
        callType: session.callType,
        hasVideo: session.hasVideo
      }
    });

    // User B awaits the offer
    this.send(connB.socket, {
      type: 'MATCH_FOUND',
      roomId,
      targetUserId: connA.userId,
      metadata: {
        isInitiator: false,
        callType: session.callType,
        hasVideo: session.hasVideo
      }
    });
  }

  private relayWebRtcSignal(conn: ClientConnection, payload: SignalingPayload) {
    if (!conn.partnerSocket || conn.partnerSocket.readyState !== WebSocket.OPEN) {
      this.send(conn.socket, {
        type: 'ERROR',
        message: 'Partner is not connected or call has ended.'
      });
      return;
    }

    // Forward SDP/ICE candidate to partner
    this.send(conn.partnerSocket, {
      ...payload,
      targetUserId: conn.userId
    });
  }

  private handleHangup(socketId: string, reason: SignalingMessageType) {
    const conn = this.activeConnections.get(socketId);
    if (!conn) return;

    const roomId = conn.currentRoomId;
    if (roomId) {
      const session = this.activeCallSessions.get(roomId);
      if (session) {
        session.endedAt = Date.now();
        session.durationSeconds = Math.round((session.endedAt - session.startedAt) / 1000);
        session.status = 'ENDED';
      }
      this.activeCallSessions.delete(roomId);
    }

    // Notify partner
    if (conn.partnerSocket && conn.partnerSocket.readyState === WebSocket.OPEN) {
      this.send(conn.partnerSocket, {
        type: reason === 'NEXT_PERSON' ? 'PEER_DISCONNECTED' : 'END_CALL',
        message: reason === 'NEXT_PERSON' ? 'Partner skipped to next person.' : 'Call ended.'
      });

      // Clear partner's link
      for (const otherConn of this.activeConnections.values()) {
        if (otherConn.socket === conn.partnerSocket) {
          otherConn.currentRoomId = undefined;
          otherConn.partnerSocket = undefined;
          break;
        }
      }
    }

    conn.currentRoomId = undefined;
    conn.partnerSocket = undefined;
  }

  getQueueCount(): number {
    return this.queue.length;
  }

  getActiveCallsCount(): number {
    return this.activeCallSessions.size;
  }

  private send(socket: WebSocket, data: SignalingPayload) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(data));
    }
  }
}
