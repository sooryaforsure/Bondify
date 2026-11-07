export type UserRole = 
  | 'NORMAL' 
  | 'ORGANIZATION' 
  | 'CELEBRITY' 
  | 'SUPPORT' 
  | 'SUPER_ADMIN';

export interface User {
  id: string;
  phoneNumber: string;
  role: UserRole;
  fullName: string;
  avatarUrl?: string;
  bio?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  isVerified: boolean;
  isBanned: boolean;
  walletBalance: number; // For premium calling coins/credits
  isPremium: boolean;
  createdAt: string;
  // Celebrity specific fields
  celebrityDetails?: {
    category: string;
    callRatePerMinute: number;
    isAvailableForCalls: boolean;
    followersCount: number;
  };
  // Organization specific fields
  organizationDetails?: {
    companyName: string;
    registrationNumber?: string;
    isApproved: boolean;
  };
}

export interface AuthSession {
  token: string;
  user: User;
}

// ----------------- Matchmaking & WebRTC Types -----------------

export interface MatchmakingQueueEntry {
  userId: string;
  socketId: string;
  joinedAt: number;
  preferredLanguage?: string;
  callType: 'AUDIO' | 'VIDEO';
  lastMatchedWith?: string[]; // IDs of users recently matched to avoid immediate duplicates
}

export interface CallSession {
  callId: string;
  callType: 'RANDOM_AUDIO' | 'RANDOM_VIDEO' | 'CELEBRITY_AUDIO' | 'CELEBRITY_VIDEO' | 'SUPPORT_VOIP';
  callerId: string;
  receiverId?: string;
  roomId: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds?: number;
  ratePerMinute?: number;
  totalBilled?: number;
  hasVideo?: boolean;
  status: 'RINGING' | 'CONNECTED' | 'ENDED' | 'REJECTED';
}

export type SignalingMessageType = 
  | 'JOIN_RANDOM_QUEUE'
  | 'LEAVE_RANDOM_QUEUE'
  | 'MATCH_FOUND'
  | 'NEXT_PERSON'
  | 'CALL_OFFER'
  | 'CALL_ANSWER'
  | 'ICE_CANDIDATE'
  | 'END_CALL'
  | 'PEER_DISCONNECTED'
  | 'CALL_CELEBRITY_REQUEST'
  | 'CELEBRITY_CALL_ACCEPTED'
  | 'CELEBRITY_CALL_REJECTED'
  | 'SUPPORT_REQUEST'
  | 'SUPPORT_ACCEPTED'
  | 'SUPPORT_MESSAGE'
  | 'CELEB_CALL_ENDED'
  | 'CELEB_AVAILABILITY_CHANGED'
  | 'INCOMING_CELEB_CALL'
  | 'ERROR';

export interface SignalingPayload {
  type: SignalingMessageType;
  userId?: string;
  roomId?: string;
  targetUserId?: string;
  sdp?: unknown;
  candidate?: unknown;
  message?: string;
  metadata?: Record<string, unknown>;
}

// ----------------- Events & Ticketing Types -----------------

export interface TicketTier {
  id: string;
  name: string; // e.g., 'General Access', 'VIP'
  price: number;
  totalQuantity: number;
  soldQuantity: number;
}

export interface EventItem {
  id: string;
  organizerId: string;
  organizerName: string;
  title: string;
  description: string;
  category: string;
  bannerUrl: string;
  venueName: string;
  address: string;
  city: string;
  latitude: number;
  longitude: number;
  startTime: string;
  endTime: string;
  ticketTiers: TicketTier[];
  isApproved: boolean;
  createdAt: string;
  distanceKm?: number; // Calculated dynamically based on user's coordinate
}

export interface TicketBooking {
  id: string;
  eventId: string;
  eventTitle: string;
  userId: string;
  userName: string;
  userPhone: string;
  tierId: string;
  tierName: string;
  quantity: number;
  totalAmount: number;
  qrCodeHash: string;
  isUsed: boolean;
  bookedAt: string;
}

// ----------------- Celebrity Media Feed Types -----------------

export interface PostComment {
  id: string;
  postId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
}

export interface CelebrityPost {
  id: string;
  celebrityId: string;
  celebrityName: string;
  celebrityAvatar?: string;
  mediaType: 'IMAGE' | 'VIDEO';
  mediaUrl: string;
  thumbnailUrl?: string;
  caption: string;
  likesCount: number;
  likedByUserIds?: string[];
  comments?: PostComment[];
  createdAt: string;
}

// ----------------- Customer Care Support Types -----------------

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  userPhone: string;
  status: 'WAITING' | 'IN_PROGRESS' | 'RESOLVED';
  assignedAgentId?: string;
  createdAt: string;
  messages: SupportChatMessage[];
}

export interface SupportChatMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderRole: UserRole;
  content: string;
  timestamp: string;
}

// ----------------- Persistent DB History & Messaging Types -----------------

export interface CallHistoryRecord {
  id: string;
  callType: string;
  callerId: string;
  receiverId?: string;
  callerName?: string;
  receiverName?: string;
  status: string;
  durationSeconds: number;
  ratePerMinute: number;
  totalBilled: number;
  hasVideo: boolean;
  startedAt: string;
  endedAt?: string;
}

export interface ChatMessageRecord {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface VipFanPassRecord {
  id: string;
  userId: string;
  celebrityId: string;
  isActive: boolean;
  purchasedAt: string;
  expiresAt?: string;
}
