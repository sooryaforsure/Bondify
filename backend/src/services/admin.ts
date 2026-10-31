import { User, EventItem, TicketBooking } from '../types/index.ts';
import { AuthService } from './auth.ts';
import { EventService } from './events.ts';
import { MatchmakingService } from './matchmaking.ts';

export interface PlatformMetrics {
  totalUsers: number;
  totalCelebrities: number;
  totalOrganizations: number;
  totalEvents: number;
  totalBookings: number;
  activeMatchmakingQueue: number;
  activeVoiceCalls: number;
  totalRevenueInRupees: number;
}

export class AdminService {
  constructor(
    private authService: AuthService,
    private eventService: EventService,
    private matchmakingService: MatchmakingService
  ) {}

  getPlatformMetrics(): PlatformMetrics {
    const allUsers = this.authService.getAllUsers();
    const allEvents = this.eventService.getEvents();

    let totalRevenue = 0;
    let totalBookings = 0;

    for (const event of allEvents) {
      for (const tier of event.ticketTiers) {
        totalBookings += tier.soldQuantity;
        totalRevenue += tier.soldQuantity * tier.price;
      }
    }

    return {
      totalUsers: allUsers.length,
      totalCelebrities: allUsers.filter(u => u.role === 'CELEBRITY').length,
      totalOrganizations: allUsers.filter(u => u.role === 'ORGANIZATION').length,
      totalEvents: allEvents.length,
      totalBookings,
      activeMatchmakingQueue: this.matchmakingService.getQueueCount(),
      activeVoiceCalls: this.matchmakingService.getActiveCallsCount(),
      totalRevenueInRupees: totalRevenue
    };
  }

  toggleUserBan(adminUserId: string, targetUserId: string, ban: boolean): User {
    const admin = this.authService.getUser(adminUserId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: Super Admin privileges required');
    }
    return this.authService.banUser(targetUserId, ban);
  }

  approveOrganization(adminUserId: string, targetUserId: string, approved: boolean): User {
    const admin = this.authService.getUser(adminUserId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: Super Admin privileges required');
    }

    const orgUser = this.authService.getUser(targetUserId);
    if (!orgUser || orgUser.role !== 'ORGANIZATION') {
      throw new Error('Target user is not an organization');
    }

    if (!orgUser.organizationDetails) {
      orgUser.organizationDetails = { companyName: orgUser.fullName, isApproved: approved };
    } else {
      orgUser.organizationDetails.isApproved = approved;
    }

    orgUser.isVerified = approved;
    return this.authService.updateProfile(targetUserId, orgUser);
  }

  verifyCelebrity(adminUserId: string, targetUserId: string, verified: boolean): User {
    const admin = this.authService.getUser(adminUserId);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: Super Admin privileges required');
    }

    const celebUser = this.authService.getUser(targetUserId);
    if (!celebUser || celebUser.role !== 'CELEBRITY') {
      throw new Error('Target user is not a celebrity');
    }

    celebUser.isVerified = verified;
    return this.authService.updateProfile(targetUserId, celebUser);
  }
}
