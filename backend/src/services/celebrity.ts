import { CelebrityPost, User, CallSession } from '../types/index.ts';
import { AuthService } from './auth.ts';

export class CelebrityService {
  private posts: Map<string, CelebrityPost> = new Map();
  private activeVipCalls: Map<string, CallSession> = new Map();

  constructor(private authService: AuthService) {
    this.seedDefaultPosts();
  }

  private seedDefaultPosts() {
    const post1: CelebrityPost = {
      id: 'post_celeb_1',
      celebrityId: 'usr_celeb_1',
      celebrityName: 'Dulquer Sithara',
      celebrityAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      mediaType: 'IMAGE',
      mediaUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800',
      caption: 'Backstage vibes right before tonight’s live acoustic performance in Kochi! 🎤✨ Fans can connect with me on VIP video call!',
      likesCount: 1420,
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString()
    };

    const post2: CelebrityPost = {
      id: 'post_celeb_2',
      celebrityId: 'usr_celeb_1',
      celebrityName: 'Dulquer Sithara',
      celebrityAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      mediaType: 'VIDEO',
      mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-singer-singing-on-stage-with-microphone-41221-large.mp4',
      thumbnailUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800',
      caption: 'Quick rehearsal snippet of my new single! Drops next week. What do you all think? 🎶❤️',
      likesCount: 2890,
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
    };

    this.posts.set(post1.id, post1);
    this.posts.set(post2.id, post2);
  }

  getCelebrityFeed(): CelebrityPost[] {
    return Array.from(this.posts.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  createPost(
    celebrityId: string,
    celebrityName: string,
    celebrityAvatar: string | undefined,
    mediaType: 'IMAGE' | 'VIDEO',
    mediaUrl: string,
    caption: string,
    thumbnailUrl?: string
  ): CelebrityPost {
    const post: CelebrityPost = {
      id: `post_${crypto.randomUUID()}`,
      celebrityId,
      celebrityName,
      celebrityAvatar,
      mediaType,
      mediaUrl,
      thumbnailUrl,
      caption,
      likesCount: 0,
      createdAt: new Date().toISOString()
    };

    this.posts.set(post.id, post);
    return post;
  }

  likePost(postId: string): number {
    const post = this.posts.get(postId);
    if (!post) throw new Error('Post not found');
    post.likesCount += 1;
    return post.likesCount;
  }

  getCelebritiesList(): User[] {
    return this.authService.getAllUsers().filter(u => u.role === 'CELEBRITY' && !u.isBanned);
  }

  /**
   * Validates if a user is eligible to initiate a VIP Audio or Video call to a celebrity
   */
  authorizeCelebrityCall(
    callerId: string,
    celebrityId: string,
    callType: 'CELEBRITY_AUDIO' | 'CELEBRITY_VIDEO'
  ): { authorized: boolean; reason?: string; ratePerMinute: number; celebrity: User } {
    const caller = this.authService.getUser(callerId);
    if (!caller) throw new Error('Caller not found');

    const celebrity = this.authService.getUser(celebrityId);
    if (!celebrity || celebrity.role !== 'CELEBRITY') {
      throw new Error('Celebrity not found or invalid role');
    }

    const celebDetails = celebrity.celebrityDetails;
    if (!celebDetails) {
      throw new Error('Celebrity call configuration missing');
    }

    if (!celebDetails.isAvailableForCalls) {
      return {
        authorized: false,
        reason: `${celebrity.fullName} is currently offline and not accepting calls.`,
        ratePerMinute: celebDetails.callRatePerMinute,
        celebrity
      };
    }

    const rate = callType === 'CELEBRITY_VIDEO' 
      ? Math.round(celebDetails.callRatePerMinute * 1.5) // 50% extra for video call
      : celebDetails.callRatePerMinute;

    // Normal users MUST have an active Premium Subscription to call celebrities
    if (!caller.isPremium) {
      return {
        authorized: false,
        reason: 'സെലിബ്രിറ്റികളെ വിളിക്കാൻ പ്രീമിയം സബ്‌സ്‌ക്രിപ്ഷൻ (Premium Pass) ആവശ്യമാണ്! പ്രീമിയം പാസ്സ് സബ്‌സ്‌ക്രൈബ് ചെയ്ത് VIP കോളുകൾ അൺലോക്ക് ചെയ്യുക.',
        ratePerMinute: rate,
        celebrity
      };
    }

    return {
      authorized: true,
      ratePerMinute: rate,
      celebrity
    };
  }

  startVipCallSession(
    callerId: string,
    celebrityId: string,
    callType: 'CELEBRITY_AUDIO' | 'CELEBRITY_VIDEO',
    ratePerMinute: number
  ): CallSession {
    const callId = `vip_call_${crypto.randomUUID()}`;
    const roomId = `room_vip_${crypto.randomUUID()}`;

    const session: CallSession = {
      callId,
      callType,
      callerId,
      receiverId: celebrityId,
      roomId,
      startedAt: Date.now(),
      ratePerMinute,
      totalBilled: 0,
      hasVideo: callType === 'CELEBRITY_VIDEO',
      status: 'CONNECTED'
    };

    this.activeVipCalls.set(roomId, session);
    return session;
  }

  endVipCallSession(roomId: string): CallSession | undefined {
    const session = this.activeVipCalls.get(roomId);
    if (!session) return undefined;

    session.endedAt = Date.now();
    session.durationSeconds = Math.max(1, Math.round((session.endedAt - session.startedAt) / 1000));
    session.status = 'ENDED';

    const billedMinutes = Math.ceil(session.durationSeconds / 60);
    const totalCoins = billedMinutes * (session.ratePerMinute || 0);
    session.totalBilled = totalCoins;

    // Deduct coins from caller & credit celebrity earnings
    if (session.callerId && totalCoins > 0) {
      this.authService.updateWallet(session.callerId, -totalCoins);
      if (session.receiverId) {
        // 70% share to celebrity, 30% platform fee
        const celebEarnings = Math.round(totalCoins * 0.7);
        this.authService.updateWallet(session.receiverId, celebEarnings);
      }
    }

    this.activeVipCalls.delete(roomId);
    return session;
  }

  // Cross-device live signaling state
  private pendingLiveCalls: Map<string, any> = new Map();

  ringCelebrity(
    callerId: string,
    callerName: string,
    callerAvatar: string | undefined,
    celebrityId: string,
    callType: 'CELEBRITY_AUDIO' | 'CELEBRITY_VIDEO',
    offerSdp?: string,
    clientCallId?: string
  ): any {
    const now = Date.now();
    // When a new call is being initiated, immediately clear any previous calls for these parties
    for (const [id, c] of this.pendingLiveCalls.entries()) {
      const isExpired = now - c.createdAt > 120000;
      const isSameParty = c.celebrityId === celebrityId || c.callerId === callerId;
      if (isSameParty || isExpired) {
        this.pendingLiveCalls.delete(id);
      }
    }

    const callId = clientCallId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const call = {
      callId,
      callerId,
      callerName,
      callerAvatar,
      celebrityId,
      callType,
      status: 'RINGING',
      createdAt: now,
      offerSdp,
      iceCandidates: []
    };
    this.pendingLiveCalls.set(callId, call);
    return call;
  }

  getLiveCallStatus(query: { callId?: string; celebrityId?: string; callerId?: string }): any {
    const now = Date.now();
    if (query.callId) {
      const direct = this.pendingLiveCalls.get(query.callId);
      if (direct) {
        // If direct is still RINGING, check if ANY call for this celebrity was answered/approved
        if (direct.status === 'RINGING') {
          for (const c of this.pendingLiveCalls.values()) {
            if ((c.celebrityId === direct.celebrityId || c.celebrityId === 'usr_celeb_1') && (c.status === 'CONNECTED' || c.status === 'APPROVED')) {
              direct.status = 'CONNECTED';
              direct.approvedAt = c.approvedAt || now;
              break;
            }
          }
        }
        return direct;
      }
      // CRITICAL FIX: If caller asked for a specific callId and it's NOT in pendingLiveCalls,
      // NEVER return an old, different call's ENDED status! Return null immediately.
      return null;
    }

    // 1st priority: Find NEWEST active/ringing call matching celebrity or caller
    const activeCalls: any[] = [];
    for (const call of this.pendingLiveCalls.values()) {
      const matchCeleb = query.celebrityId && (call.celebrityId === query.celebrityId || query.celebrityId === 'usr_celeb_1');
      const matchCaller = query.callerId && call.callerId === query.callerId;
      if ((matchCeleb || matchCaller) && (call.status === 'RINGING' || call.status === 'APPROVED' || call.status === 'CONNECTED')) {
        activeCalls.push(call);
      }
    }
    if (activeCalls.length > 0) {
      activeCalls.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      return activeCalls[0];
    }

    // 2nd priority: Recently declined/ended call (within strict 5s tombstone)
    const recentCalls: any[] = [];
    for (const call of this.pendingLiveCalls.values()) {
      const matchCeleb = query.celebrityId && (call.celebrityId === query.celebrityId || query.celebrityId === 'usr_celeb_1');
      const matchCaller = query.callerId && call.callerId === query.callerId;
      if ((matchCeleb || matchCaller) && (call.status === 'DECLINED' || call.status === 'ENDED')) {
        if (call.endedAt && (now - call.endedAt < 5000)) {
          recentCalls.push(call);
        }
      }
    }
    if (recentCalls.length > 0) {
      recentCalls.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
      return recentCalls[0];
    }
    return null;
  }

  respondToLiveCall(callId?: string, action: 'APPROVE' | 'DECLINE' = 'APPROVE', answerSdp?: string, celebrityId?: string): any {
    const now = Date.now();
    let call = callId ? this.pendingLiveCalls.get(callId) : null;
    if (!call && celebrityId) {
      const candidates: any[] = [];
      for (const c of this.pendingLiveCalls.values()) {
        if ((c.celebrityId === celebrityId || celebrityId === 'usr_celeb_1') && (c.status === 'RINGING' || c.status === 'APPROVED' || c.status === 'CONNECTED')) {
          candidates.push(c);
        }
      }
      candidates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (candidates.length > 0) call = candidates[0];
    }
    if (!call) {
      for (const c of this.pendingLiveCalls.values()) {
        if (c.status === 'RINGING') {
          call = c;
          break;
        }
      }
    }
    if (!call) return null;

    if (action === 'APPROVE') {
      call.status = 'CONNECTED';
      call.approvedAt = now;
      if (answerSdp) call.answerSdp = answerSdp;
      // Mark ALL ringing calls for this celebrity as CONNECTED so caller is never stranded
      for (const c of this.pendingLiveCalls.values()) {
        if ((c.celebrityId === call.celebrityId || c.celebrityId === 'usr_celeb_1') && c.status === 'RINGING') {
          c.status = 'CONNECTED';
          c.approvedAt = now;
        }
      }
    } else {
      call.status = 'DECLINED';
      call.endedAt = now;
      for (const c of this.pendingLiveCalls.values()) {
        if ((c.celebrityId === call.celebrityId || c.celebrityId === 'usr_celeb_1') && c.status === 'RINGING') {
          c.status = 'DECLINED';
          c.endedAt = now;
        }
      }
    }
    return call;
  }

  relayCallSignal(callId: string, signal: { type: string; sdp?: string; candidate?: any; fromRole: string }): any {
    let call = callId ? this.pendingLiveCalls.get(callId) : null;
    if (!call) {
      for (const c of this.pendingLiveCalls.values()) {
        if (c.status === 'CONNECTED' || c.status === 'RINGING') {
          call = c;
          break;
        }
      }
    }
    if (!call) return null;
    if (signal.type === 'RTC_OFFER' && signal.sdp) call.offerSdp = signal.sdp;
    if (signal.type === 'RTC_ANSWER' && signal.sdp) call.answerSdp = signal.sdp;
    if (signal.type === 'RTC_ICE_CANDIDATE' && signal.candidate) {
      call.iceCandidates = call.iceCandidates || [];
      call.iceCandidates.push({ candidate: signal.candidate, fromRole: signal.fromRole });
    }
    return call;
  }

  updateLiveFrame(callId: string, role: string, frame: string): any {
    let call = callId ? this.pendingLiveCalls.get(callId) : null;
    if (!call) {
      const candidates: any[] = [];
      for (const c of this.pendingLiveCalls.values()) {
        if (c.status === 'CONNECTED' || c.status === 'RINGING') {
          candidates.push(c);
        }
      }
      candidates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (candidates.length > 0) call = candidates[0];
    }
    if (!call) return null;
    if (role === 'CELEBRITY') {
      call.lastCelebFrame = frame;
    } else {
      call.lastNormalFrame = frame;
    }
    return call;
  }

  endLiveCall(callId: string, endedBy: string): any {
    if (!callId) return null;
    const call = this.pendingLiveCalls.get(callId);
    // CRITICAL FIX: If this specific callId does not exist in pending calls,
    // DO NOT touch other ringing calls! Return null immediately.
    if (!call) return null;
    call.status = 'ENDED';
    call.endedAt = Date.now();
    call.endedBy = endedBy;
    return call;
  }
}
