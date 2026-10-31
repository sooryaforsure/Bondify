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
      celebrityName: 'Ananya Joy',
      celebrityAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      mediaType: 'IMAGE',
      mediaUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800',
      caption: 'Backstage vibes right before tonight’s live acoustic performance in Kochi! 🎤✨ Let’s connect on VIP call later tonight!',
      likesCount: 1420,
      createdAt: new Date(Date.now() - 3600000 * 4).toISOString()
    };

    const post2: CelebrityPost = {
      id: 'post_celeb_2',
      celebrityId: 'usr_celeb_1',
      celebrityName: 'Ananya Joy',
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

    // Check premium subscription or sufficient wallet coins
    if (!caller.isPremium && caller.walletBalance < rate) {
      return {
        authorized: false,
        reason: `Celebrity calling is a Premium feature. You need an active Premium Pass or at least ${rate} coins in your wallet. Current balance: ${caller.walletBalance} coins.`,
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
}
