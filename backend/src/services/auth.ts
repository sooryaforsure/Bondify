import { User, UserRole, AuthSession } from '../types/index.ts';
import { isDbAvailable, query, queryOne, execute } from '../lib/db.ts';

const JWT_SECRET = new TextEncoder().encode('frnd-super-secret-jwt-key-2026-high-security');

export class AuthService {
  private users: Map<string, User> = new Map();
  private phoneToUser: Map<string, string> = new Map();
  private pendingOtps: Map<string, { otp: string; expiresAt: number }> = new Map();

  constructor() {
    this.seedDefaultUsers();
  }

  private seedDefaultUsers() {
    // 1. Normal User (Arjun Nair)
    const normalUser: User = {
      id: 'usr_normal_1',
      phoneNumber: '+919876543210',
      role: 'NORMAL',
      fullName: 'Arjun Nair',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
      bio: 'Music enthusiast & tech fan from Kochi',
      city: 'Kochi',
      latitude: 9.9312,
      longitude: 76.2673,
      isVerified: true,
      isBanned: false,
      walletBalance: 50,
      isPremium: false,
      createdAt: new Date().toISOString(),
    };

    // 2. Organization User (Kochi Live Arena Events)
    const orgUser: User = {
      id: 'usr_org_1',
      phoneNumber: '+919876543211',
      role: 'ORGANIZATION',
      fullName: 'Kochi Live Arena Events',
      avatarUrl: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=150',
      bio: 'Leading concert & live mega event organizers in Kerala',
      city: 'Kochi',
      latitude: 9.9674,
      longitude: 76.2991,
      isVerified: true,
      isBanned: false,
      walletBalance: 0,
      isPremium: false,
      organizationDetails: {
        companyName: 'Kochi Live Arena Events Pvt Ltd',
        registrationNumber: 'KL-ERN-2024-9988',
        isApproved: true,
      },
      createdAt: new Date().toISOString(),
    };

    // 3. Celebrity User 1 (Dulquer Sithara)
    const celebUser: User = {
      id: 'usr_celeb_1',
      phoneNumber: '+919876543212',
      role: 'CELEBRITY',
      fullName: 'Dulquer Sithara',
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      bio: 'Playback Singer & Celebrity Artist 🎤✨',
      city: 'Kochi',
      latitude: 9.9816,
      longitude: 76.2798,
      isVerified: true,
      isBanned: false,
      walletBalance: 0,
      isPremium: true,
      celebrityDetails: {
        category: 'Playback Singer & Celebrity Artist',
        callRatePerMinute: 50,
        isAvailableForCalls: true,
        followersCount: 350000,
      },
      createdAt: new Date().toISOString(),
    };

    // 3b. Celebrity User 2 (Tovino Thomas)
    const celebUser2: User = {
      id: 'usr_celeb_2',
      phoneNumber: '+919876543222',
      role: 'CELEBRITY',
      fullName: 'Tovino Thomas',
      avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
      bio: 'Actor, Producer & Cinema Enthusiast 🎬⚡',
      city: 'Kochi',
      latitude: 9.9820,
      longitude: 76.2810,
      isVerified: true,
      isBanned: false,
      walletBalance: 0,
      isPremium: true,
      celebrityDetails: {
        category: 'Actor & Producer',
        callRatePerMinute: 60,
        isAvailableForCalls: true,
        followersCount: 820000,
      },
      createdAt: new Date().toISOString(),
    };

    // 3c. Celebrity User 3 (Kalyani Priyadarshan)
    const celebUser3: User = {
      id: 'usr_celeb_3',
      phoneNumber: '+919876543223',
      role: 'CELEBRITY',
      fullName: 'Kalyani Priyadarshan',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
      bio: 'Fashion, Cinema & Good Vibes 🌸✨',
      city: 'Kochi',
      latitude: 9.9750,
      longitude: 76.2750,
      isVerified: true,
      isBanned: false,
      walletBalance: 0,
      isPremium: true,
      celebrityDetails: {
        category: 'Actress & Fashion Influencer',
        callRatePerMinute: 55,
        isAvailableForCalls: true,
        followersCount: 640000,
      },
      createdAt: new Date().toISOString(),
    };

    // 3d. Celebrity User 4 (Basil Joseph)
    const celebUser4: User = {
      id: 'usr_celeb_4',
      phoneNumber: '+919876543224',
      role: 'CELEBRITY',
      fullName: 'Basil Joseph',
      avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
      bio: 'Director, Filmmaker & Entertainer 🎥🔥',
      city: 'Kochi',
      latitude: 9.9880,
      longitude: 76.2890,
      isVerified: true,
      isBanned: false,
      walletBalance: 0,
      isPremium: true,
      celebrityDetails: {
        category: 'Director & Actor',
        callRatePerMinute: 50,
        isAvailableForCalls: true,
        followersCount: 510000,
      },
      createdAt: new Date().toISOString(),
    };

    // 3e. Celebrity User 5 (Aparna Balamurali)
    const celebUser5: User = {
      id: 'usr_celeb_5',
      phoneNumber: '+919876543225',
      role: 'CELEBRITY',
      fullName: 'Aparna Balamurali',
      avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
      bio: 'Singer & National Award Winning Actress 🎶🏆',
      city: 'Thrissur',
      latitude: 10.5276,
      longitude: 76.2144,
      isVerified: true,
      isBanned: false,
      walletBalance: 0,
      isPremium: true,
      celebrityDetails: {
        category: 'Playback Singer & Actress',
        callRatePerMinute: 45,
        isAvailableForCalls: true,
        followersCount: 420000,
      },
      createdAt: new Date().toISOString(),
    };

    // 3f. Celebrity User 6 (Arjyou)
    const celebUser6: User = {
      id: 'usr_celeb_6',
      phoneNumber: '+919876543226',
      role: 'CELEBRITY',
      fullName: 'Arjun Ratan (Arjyou)',
      avatarUrl: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
      bio: 'Content Creator, Vlogger & Comedian 🚀😂',
      city: 'Kozhikode',
      latitude: 11.2588,
      longitude: 75.7804,
      isVerified: true,
      isBanned: false,
      walletBalance: 0,
      isPremium: true,
      celebrityDetails: {
        category: 'Content Creator & Vlogger',
        callRatePerMinute: 40,
        isAvailableForCalls: true,
        followersCount: 780000,
      },
      createdAt: new Date().toISOString(),
    };

    // 4. Customer Support User (Rahul)
    const supportUser: User = {
      id: 'usr_support_1',
      phoneNumber: '+919876543213',
      role: 'SUPPORT',
      fullName: 'Rahul (Customer Care Support)',
      avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
      bio: 'Customer Care Executive',
      city: 'Kochi',
      isVerified: true,
      isBanned: false,
      walletBalance: 0,
      isPremium: false,
      createdAt: new Date().toISOString(),
    };

    // 5. Super Admin
    const adminUser: User = {
      id: 'usr_admin_1',
      phoneNumber: '+919876543214',
      role: 'SUPER_ADMIN',
      fullName: 'Super Admin (Platform Control)',
      avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
      bio: 'Platform Root Admin',
      city: 'Global',
      isVerified: true,
      isBanned: false,
      walletBalance: 999999,
      isPremium: true,
      createdAt: new Date().toISOString(),
    };

    const allUsers = [
      normalUser, 
      orgUser, 
      celebUser, 
      celebUser2, 
      celebUser3, 
      celebUser4, 
      celebUser5, 
      celebUser6, 
      supportUser, 
      adminUser
    ];
    for (const u of allUsers) {
      this.users.set(u.id, u);
      this.phoneToUser.set(u.phoneNumber, u.id);
    }
  }

  async syncSeedToDb(): Promise<void> {
    if (!isDbAvailable()) return;
    try {
      for (const u of this.users.values()) {
        await execute(
          `INSERT INTO users (
            id, phone_number, role, full_name, avatar_url, bio, city,
            latitude, longitude, is_verified, is_banned, wallet_balance,
            is_premium, celebrity_details, organization_details, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
          ON CONFLICT (id) DO NOTHING`,
          [
            u.id,
            u.phoneNumber,
            u.role,
            u.fullName,
            u.avatarUrl || null,
            u.bio || null,
            u.city || null,
            u.latitude || null,
            u.longitude || null,
            u.isVerified,
            u.isBanned,
            u.walletBalance,
            u.isPremium,
            u.celebrityDetails ? JSON.stringify(u.celebrityDetails) : null,
            u.organizationDetails ? JSON.stringify(u.organizationDetails) : null,
            u.createdAt
          ]
        );
      }
      console.log('[Auth] Default users synchronized to PostgreSQL');
    } catch (err) {
      console.warn('[Auth] Failed to sync users to DB:', err);
    }
  }

  async sendOtp(phoneNumber: string): Promise<{ success: boolean; message: string; debugOtp?: string }> {
    const cleanPhone = phoneNumber.trim();
    const otp = cleanPhone.endsWith('0') || cleanPhone.endsWith('1') || cleanPhone.endsWith('2') || cleanPhone.endsWith('3') || cleanPhone.endsWith('4')
      ? '123456'
      : Math.floor(100000 + Math.random() * 900000).toString();

    this.pendingOtps.set(cleanPhone, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return {
      success: true,
      message: `OTP sent successfully to ${cleanPhone}`,
      debugOtp: otp,
    };
  }

  async verifyOtpAndLogin(
    phoneNumber: string, 
    otp: string, 
    roleToRegister: UserRole = 'NORMAL',
    fullName?: string
  ): Promise<AuthSession> {
    const cleanPhone = phoneNumber.trim();
    const entry = this.pendingOtps.get(cleanPhone);

    const isValid = (entry && entry.otp === otp && entry.expiresAt > Date.now()) || otp === '123456';
    if (!isValid) {
      throw new Error('Invalid or expired OTP. Please enter 123456.');
    }

    this.pendingOtps.delete(cleanPhone);

    let user: User | null = null;

    // Check DB first if available
    if (isDbAvailable()) {
      try {
        const dbRow = await queryOne<any>(
          `SELECT * FROM users WHERE phone_number = $1`,
          [cleanPhone]
        );
        if (dbRow) {
          user = this.mapDbUserToModel(dbRow);
          this.users.set(user.id, user);
          this.phoneToUser.set(cleanPhone, user.id);
        }
      } catch (err) {
        console.warn('[Auth] DB lookup error:', err);
      }
    }

    // Check cache
    if (!user) {
      const cachedId = this.phoneToUser.get(cleanPhone);
      if (cachedId) {
        user = this.users.get(cachedId) || null;
      }
    }

    if (!user) {
      // Auto-register new user
      const userId = `usr_${crypto.randomUUID()}`;
      user = {
        id: userId,
        phoneNumber: cleanPhone,
        role: roleToRegister,
        fullName: fullName || `User ${cleanPhone.slice(-4)}`,
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${userId}`,
        bio: 'Hello! I am on FRND.',
        city: 'Kochi',
        latitude: 9.9312,
        longitude: 76.2673,
        isVerified: roleToRegister === 'NORMAL',
        isBanned: false,
        walletBalance: 100, // Welcome 100 coins bonus
        isPremium: false,
        createdAt: new Date().toISOString(),
      };

      if (roleToRegister === 'CELEBRITY') {
        user.celebrityDetails = {
          category: 'Artist',
          callRatePerMinute: 40,
          isAvailableForCalls: true,
          followersCount: 100,
        };
      } else if (roleToRegister === 'ORGANIZATION') {
        user.organizationDetails = {
          companyName: fullName || 'New Organization',
          isApproved: false,
        };
      }

      this.users.set(userId, user);
      this.phoneToUser.set(cleanPhone, userId);

      // Persist new user to DB
      if (isDbAvailable()) {
        try {
          await execute(
            `INSERT INTO users (
              id, phone_number, role, full_name, avatar_url, bio, city,
              latitude, longitude, is_verified, is_banned, wallet_balance,
              is_premium, celebrity_details, organization_details, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
            [
              user.id,
              user.phoneNumber,
              user.role,
              user.fullName,
              user.avatarUrl,
              user.bio,
              user.city,
              user.latitude,
              user.longitude,
              user.isVerified,
              user.isBanned,
              user.walletBalance,
              user.isPremium,
              user.celebrityDetails ? JSON.stringify(user.celebrityDetails) : null,
              user.organizationDetails ? JSON.stringify(user.organizationDetails) : null,
              user.createdAt
            ]
          );
        } catch (err) {
          console.warn('[Auth] DB insert error on new registration:', err);
        }
      }
    }

    if (user.isBanned) {
      throw new Error('Your account has been suspended by the administrator.');
    }

    const token = await this.generateJwt({ userId: user.id, role: user.role, phone: user.phoneNumber });
    return { token, user };
  }

  async adminLogin(identifier: string, password: string): Promise<AuthSession> {
    const cleanId = identifier.trim().toLowerCase();
    const cleanPass = password.trim();

    let targetUser: User | undefined;

    if ((cleanId === 'admin@frnd.app' || cleanId === 'admin' || cleanId === '+919876543214') && cleanPass === 'admin123') {
      targetUser = this.users.get('usr_admin_1');
    } else if ((cleanId === 'support@frnd.app' || cleanId === 'support' || cleanId === '+919876543213') && cleanPass === 'support123') {
      targetUser = this.users.get('usr_support_1');
    }

    if (!targetUser) {
      throw new Error('Invalid administrative credentials or password.');
    }

    const token = await this.generateJwt({ userId: targetUser.id, role: targetUser.role, phone: targetUser.phoneNumber });
    return { token, user: targetUser };
  }

  getUser(userId: string): User | undefined {
    return this.users.get(userId);
  }

  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  updateProfile(userId: string, updates: Partial<User>): User {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    const updated = { ...user, ...updates };
    this.users.set(userId, updated);

    if (isDbAvailable()) {
      execute(
        `UPDATE users SET 
          full_name = COALESCE($1, full_name),
          bio = COALESCE($2, bio),
          city = COALESCE($3, city),
          avatar_url = COALESCE($4, avatar_url),
          is_premium = COALESCE($5, is_premium),
          is_verified = COALESCE($6, is_verified),
          celebrity_details = COALESCE($7, celebrity_details),
          organization_details = COALESCE($8, organization_details)
        WHERE id = $9`,
        [
          updates.fullName ?? null,
          updates.bio ?? null,
          updates.city ?? null,
          updates.avatarUrl ?? null,
          updates.isPremium !== undefined ? updates.isPremium : null,
          updates.isVerified !== undefined ? updates.isVerified : null,
          updates.celebrityDetails ? JSON.stringify(updates.celebrityDetails) : null,
          updates.organizationDetails ? JSON.stringify(updates.organizationDetails) : null,
          userId
        ]
      ).catch(err => console.warn('[Auth] Error updating profile in DB:', err));
    }

    return updated;
  }

  updateWallet(userId: string, amountChange: number): number {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.walletBalance += amountChange;
    this.users.set(userId, user);

    if (isDbAvailable()) {
      execute(
        `UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2`,
        [amountChange, userId]
      ).catch(err => console.warn('[Auth] Error updating wallet in DB:', err));
    }

    return user.walletBalance;
  }

  banUser(userId: string, banned: boolean): User {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.isBanned = banned;
    this.users.set(userId, user);

    if (isDbAvailable()) {
      execute(
        `UPDATE users SET is_banned = $1 WHERE id = $2`,
        [banned, userId]
      ).catch(err => console.warn('[Auth] Error banning user in DB:', err));
    }

    return user;
  }

  private mapDbUserToModel(r: any): User {
    return {
      id: r.id,
      phoneNumber: r.phone_number,
      role: r.role as UserRole,
      fullName: r.full_name,
      avatarUrl: r.avatar_url,
      bio: r.bio,
      city: r.city,
      latitude: r.latitude ? Number(r.latitude) : undefined,
      longitude: r.longitude ? Number(r.longitude) : undefined,
      isVerified: Boolean(r.is_verified),
      isBanned: Boolean(r.is_banned),
      walletBalance: Number(r.wallet_balance || 0),
      isPremium: Boolean(r.is_premium),
      celebrityDetails: r.celebrity_details ? (typeof r.celebrity_details === 'string' ? JSON.parse(r.celebrity_details) : r.celebrity_details) : undefined,
      organizationDetails: r.organization_details ? (typeof r.organization_details === 'string' ? JSON.parse(r.organization_details) : r.organization_details) : undefined,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString()
    };
  }

  // ---------------- JWT Helpers using crypto.subtle ----------------

  private async generateJwt(payload: Record<string, unknown>): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const encodedHeader = this.base64UrlEncode(JSON.stringify(header));
    const fullPayload = { ...payload, exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600 };
    const encodedPayload = this.base64UrlEncode(JSON.stringify(fullPayload));

    const dataToSign = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
    const key = await crypto.subtle.importKey(
      'raw',
      JWT_SECRET,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, dataToSign);
    const encodedSignature = this.base64UrlEncode(new Uint8Array(signature));

    return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
  }

  async verifyJwt(token: string): Promise<Record<string, unknown> | null> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const [encodedHeader, encodedPayload, encodedSignature] = parts;
      const dataToVerify = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

      const key = await crypto.subtle.importKey(
        'raw',
        JWT_SECRET,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const signatureBytes = this.base64UrlDecode(encodedSignature);
      const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes as unknown as BufferSource, dataToVerify);
      if (!isValid) return null;

      const payloadJson = new TextDecoder().decode(this.base64UrlDecode(encodedPayload));
      const payload = JSON.parse(payloadJson);

      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return null; // Expired
      }

      return payload;
    } catch {
      return null;
    }
  }

  private base64UrlEncode(input: string | Uint8Array): string {
    let bytes: Uint8Array;
    if (typeof input === 'string') {
      bytes = new TextEncoder().encode(input);
    } else {
      bytes = input;
    }

    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private base64UrlDecode(base64url: string): Uint8Array {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
