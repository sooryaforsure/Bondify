import { EventItem, TicketTier, TicketBooking } from '../types/index.ts';

export class EventService {
  private events: Map<string, EventItem> = new Map();
  private bookings: Map<string, TicketBooking> = new Map();

  constructor() {
    this.seedDefaultEvents();
  }

  private seedDefaultEvents() {
    const kochiConcert: EventItem = {
      id: 'evt_kochi_live_music_2026',
      organizerId: 'usr_org_1',
      organizerName: 'Grand Arena Entertainment',
      title: 'Grand Malayalam Fusion Music Fest 2026',
      description: 'Experience an electrifying night of live fusion rock and traditional melodies featuring top playback artists.',
      category: 'Music & Concert',
      bannerUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800',
      venueName: 'Jawaharlal Nehru International Stadium Grounds',
      address: 'Kaloor, Kochi, Kerala 682017',
      city: 'Kochi',
      latitude: 9.9982,
      longitude: 76.2999,
      startTime: '2026-11-15T18:00:00Z',
      endTime: '2026-11-15T23:00:00Z',
      ticketTiers: [
        { id: 'tier_gen_1', name: 'General Entry', price: 499, totalQuantity: 1000, soldQuantity: 320 },
        { id: 'tier_vip_1', name: 'VIP Front Lounge', price: 1499, totalQuantity: 150, soldQuantity: 85 }
      ],
      isApproved: true,
      createdAt: new Date().toISOString()
    };

    const techSummit: EventItem = {
      id: 'evt_kochi_tech_summit_2026',
      organizerId: 'usr_org_1',
      organizerName: 'Grand Arena Entertainment',
      title: 'Kerala Tech Creators & Startup Summit',
      description: 'The premier gathering of product builders, creators, and tech innovators across South India.',
      category: 'Tech & Innovation',
      bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
      venueName: 'Le Meridien Convention Hall',
      address: 'Maradu, Kochi, Kerala 682304',
      city: 'Kochi',
      latitude: 9.9328,
      longitude: 76.3195,
      startTime: '2026-12-05T09:30:00Z',
      endTime: '2026-12-05T18:00:00Z',
      ticketTiers: [
        { id: 'tier_tech_std', name: 'Standard Delegate', price: 799, totalQuantity: 400, soldQuantity: 140 },
        { id: 'tier_tech_vip', name: 'VIP Networking Pass', price: 2499, totalQuantity: 60, soldQuantity: 28 }
      ],
      isApproved: true,
      createdAt: new Date().toISOString()
    };

    const tvmCarnival: EventItem = {
      id: 'evt_tvm_food_culture_fest',
      organizerId: 'usr_org_1',
      organizerName: 'Grand Arena Entertainment',
      title: 'Trivandrum Cultural & Food Street Carnival',
      description: 'Street foods, artisan crafts, traditional arts, and family games right by the beach.',
      category: 'Cultural & Food',
      bannerUrl: 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800',
      venueName: 'Shanghumukham Beach Grounds',
      address: 'Trivandrum, Kerala 695008',
      city: 'Trivandrum',
      latitude: 8.4795,
      longitude: 76.9082,
      startTime: '2026-11-20T16:00:00Z',
      endTime: '2026-11-20T22:30:00Z',
      ticketTiers: [
        { id: 'tier_food_pass', name: 'Carnival Entry & Tasting Band', price: 199, totalQuantity: 800, soldQuantity: 210 }
      ],
      isApproved: true,
      createdAt: new Date().toISOString()
    };

    this.events.set(kochiConcert.id, kochiConcert);
    this.events.set(techSummit.id, techSummit);
    this.events.set(tvmCarnival.id, tvmCarnival);

    // Seed sample attendee ticket for Arjun Nair to enable instant gate testing
    const sampleBookingId = 'book_sample_gate_1';
    const sampleQrHash = `FRND_TKT_DEMO_ARJUN_KOCHI_2026`;
    this.bookings.set(sampleBookingId, {
      id: sampleBookingId,
      eventId: techSummit.id,
      eventTitle: techSummit.title,
      userId: 'usr_normal_1',
      userName: 'Arjun Nair',
      userPhone: '+919876543210',
      tierId: techSummit.ticketTiers[0].id,
      tierName: techSummit.ticketTiers[0].name,
      quantity: 2,
      totalAmount: techSummit.ticketTiers[0].price * 2,
      qrCodeHash: sampleQrHash,
      isUsed: false,
      bookedAt: new Date(Date.now() - 86400000).toISOString()
    });
  }

  createEvent(
    organizerId: string,
    organizerName: string,
    payload: {
      title: string;
      description: string;
      category: string;
      bannerUrl?: string;
      venueName: string;
      address: string;
      city: string;
      latitude: number;
      longitude: number;
      startTime: string;
      endTime: string;
      ticketTiers: Array<{ name: string; price: number; totalQuantity: number }>;
    }
  ): EventItem {
    const eventId = `evt_${crypto.randomUUID()}`;
    const newEvent: EventItem = {
      id: eventId,
      organizerId,
      organizerName,
      title: payload.title,
      description: payload.description,
      category: payload.category || 'General',
      bannerUrl: payload.bannerUrl || 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800',
      venueName: payload.venueName,
      address: payload.address,
      city: payload.city,
      latitude: payload.latitude,
      longitude: payload.longitude,
      startTime: payload.startTime,
      endTime: payload.endTime,
      ticketTiers: payload.ticketTiers.map((t, index) => ({
        id: `tier_${eventId}_${index}`,
        name: t.name,
        price: t.price,
        totalQuantity: t.totalQuantity,
        soldQuantity: 0
      })),
      isApproved: true, // Auto-approved in dev, or toggled by Super Admin
      createdAt: new Date().toISOString()
    };

    this.events.set(eventId, newEvent);
    return newEvent;
  }

  getEvents(userLat?: number, userLon?: number, maxDistanceKm?: number): EventItem[] {
    const list = Array.from(this.events.values()).filter(e => e.isApproved);

    if (userLat !== undefined && userLon !== undefined) {
      // Calculate Haversine distance in kilometers and sort by proximity
      const enriched = list.map(event => {
        const distance = this.calculateDistanceKm(userLat, userLon, event.latitude, event.longitude);
        return {
          ...event,
          distanceKm: Math.round(distance * 10) / 10
        };
      });

      const filtered = maxDistanceKm 
        ? enriched.filter(e => (e.distanceKm ?? 0) <= maxDistanceKm)
        : enriched;

      return filtered.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }

    return list;
  }

  getEventById(id: string): EventItem | undefined {
    return this.events.get(id);
  }

  bookTicket(
    userId: string,
    userName: string,
    userPhone: string,
    eventId: string,
    tierId: string,
    quantity: number
  ): TicketBooking {
    const event = this.events.get(eventId);
    if (!event) throw new Error('Event not found');

    const tier = event.ticketTiers.find(t => t.id === tierId);
    if (!tier) throw new Error('Ticket tier not found');

    if (tier.soldQuantity + quantity > tier.totalQuantity) {
      throw new Error('Requested ticket quantity is sold out or unavailable');
    }

    tier.soldQuantity += quantity;

    const bookingId = `book_${crypto.randomUUID()}`;
    const qrCodeHash = `FRND_TKT_${bookingId.slice(-8).toUpperCase()}_${eventId.slice(-6).toUpperCase()}_${Date.now()}`;

    const booking: TicketBooking = {
      id: bookingId,
      eventId: event.id,
      eventTitle: event.title,
      userId,
      userName,
      userPhone,
      tierId: tier.id,
      tierName: tier.name,
      quantity,
      totalAmount: tier.price * quantity,
      qrCodeHash,
      isUsed: false,
      bookedAt: new Date().toISOString()
    };

    this.bookings.set(bookingId, booking);
    return booking;
  }

  getUserBookings(userId: string): TicketBooking[] {
    return Array.from(this.bookings.values()).filter(b => b.userId === userId);
  }

  getAllBookings(): TicketBooking[] {
    return Array.from(this.bookings.values()).sort(
      (a, b) => new Date(b.bookedAt).getTime() - new Date(a.bookedAt).getTime()
    );
  }

  verifyAndCheckInTicket(qrCodeHash: string): { success: boolean; booking?: TicketBooking; message: string } {
    for (const booking of this.bookings.values()) {
      if (booking.qrCodeHash === qrCodeHash) {
        if (booking.isUsed) {
          return { success: false, booking, message: 'Ticket has ALREADY been used for check-in!' };
        }
        booking.isUsed = true;
        return { success: true, booking, message: 'Ticket validated successfully! Welcome to the event.' };
      }
    }
    return { success: false, message: 'Invalid ticket QR code hash.' };
  }

  /**
   * Haversine formula to compute great-circle distance between two GPS coordinates in kilometers
   */
  private calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
