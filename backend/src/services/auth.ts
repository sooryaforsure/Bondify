import { User, UserRole, AuthSession } from '../types/index.ts';

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
      isPremium: false, // Starts non-premium so user can test subscription upgrade!
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

    // 3. Celebrity User (Dulquer Sithara)
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

    const allUsers = [normalUser, orgUser, celebUser, supportUser, adminUser];
    for (const u of allUsers) {
      this.users.set(u.id, u);
      this.phoneToUser.set(u.phoneNumber, u.id);
    }
  }

  async sendOtp(phoneNumber: string): Promise<{ success: boolean; message: string; debugOtp?: string }> {
    const cleanPhone = phoneNumber.trim();
    // Default demo OTP is 123456 for easy testing, or generate 6-digit code
    const otp = cleanPhone.endsWith('0') || cleanPhone.endsWith('1') || cleanPhone.endsWith('2') || cleanPhone.endsWith('3') || cleanPhone.endsWith('4')
      ? '123456'
      : Math.floor(100000 + Math.random() * 900000).toString();

    this.pendingOtps.set(cleanPhone, {
      otp,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    return {
      success: true,
      message: `OTP sent successfully to ${cleanPhone}`,
      debugOtp: otp, // Returned for sandbox/testing convenience
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

    // Accept either matching OTP or master test OTP '123456'
    const isValid = (entry && entry.otp === otp && entry.expiresAt > Date.now()) || otp === '123456';
    if (!isValid) {
      throw new Error('Invalid or expired OTP. Please enter 123456.');
    }

    this.pendingOtps.delete(cleanPhone);

    let userId = this.phoneToUser.get(cleanPhone);
    let user: User;

    if (!userId) {
      // Auto-register new user
      userId = `usr_${crypto.randomUUID()}`;
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
    } else {
      user = this.users.get(userId)!;
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
    return updated;
  }

  updateWallet(userId: string, amountChange: number): number {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.walletBalance += amountChange;
    this.users.set(userId, user);
    return user.walletBalance;
  }

  banUser(userId: string, banned: boolean): User {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.isBanned = banned;
    this.users.set(userId, user);
    return user;
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
