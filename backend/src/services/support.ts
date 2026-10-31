import { SupportTicket, SupportChatMessage, UserRole } from '../types/index.ts';

export class SupportService {
  private tickets: Map<string, SupportTicket> = new Map();
  private userActiveTicket: Map<string, string> = new Map(); // userId -> ticketId

  constructor() {
    this.seedDefaultSupport();
  }

  private seedDefaultSupport() {
    const ticketId = 'ticket_sample_101';
    const sampleTicket: SupportTicket = {
      id: ticketId,
      userId: 'usr_normal_1',
      userName: 'Arjun Nair',
      userRole: 'NORMAL',
      userPhone: '+919876543210',
      status: 'IN_PROGRESS',
      assignedAgentId: 'usr_support_1',
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      messages: [
        {
          id: 'msg_1',
          ticketId,
          senderId: 'usr_normal_1',
          senderRole: 'NORMAL',
          content: 'Hello, I have a query about the upcoming Grand Malayalam Fusion Music Fest ticket refund policy.',
          timestamp: new Date(Date.now() - 3600000 * 2).toISOString()
        },
        {
          id: 'msg_2',
          ticketId,
          senderId: 'usr_support_1',
          senderRole: 'SUPPORT',
          content: 'Hi Arjun! You can request cancellation up to 48 hours prior to the event through the ticket section.',
          timestamp: new Date(Date.now() - 3600000 * 1.5).toISOString()
        }
      ]
    };

    this.tickets.set(ticketId, sampleTicket);
    this.userActiveTicket.set('usr_normal_1', ticketId);

    // Seed Celebrity Support Ticket for Dulquer Sithara
    const celebTicketId = 'ticket_celeb_201';
    const sampleCelebTicket: SupportTicket = {
      id: celebTicketId,
      userId: 'usr_celeb_1',
      userName: 'Dulquer Sithara',
      userRole: 'CELEBRITY',
      userPhone: '+919876543212',
      status: 'IN_PROGRESS',
      assignedAgentId: 'usr_support_1',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      messages: [
        {
          id: 'msg_c1',
          ticketId: celebTicketId,
          senderId: 'usr_celeb_1',
          senderRole: 'CELEBRITY',
          content: 'Hello Support Desk, I wanted to confirm the schedule for the live fan video sessions this weekend.',
          timestamp: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: 'msg_c2',
          ticketId: celebTicketId,
          senderId: 'usr_support_1',
          senderRole: 'SUPPORT',
          content: 'Hi Dulquer Sir! Your VIP Fan Line is configured and active. Fans can only call you when you toggle Call Receiving to Online.',
          timestamp: new Date(Date.now() - 1800000).toISOString()
        }
      ]
    };
    this.tickets.set(celebTicketId, sampleCelebTicket);
    this.userActiveTicket.set('usr_celeb_1', celebTicketId);

    // Seed Organization Support Ticket for Kochi Live Arena
    const orgTicketId = 'ticket_org_301';
    const sampleOrgTicket: SupportTicket = {
      id: orgTicketId,
      userId: 'usr_org_1',
      userName: 'Kochi Live Arena Events',
      userRole: 'ORGANIZATION',
      userPhone: '+919876543211',
      status: 'IN_PROGRESS',
      assignedAgentId: 'usr_support_1',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      messages: [
        {
          id: 'msg_o1',
          ticketId: orgTicketId,
          senderId: 'usr_org_1',
          senderRole: 'ORGANIZATION',
          content: 'Hi Support, need assistance checking the QR code scanner sensitivity for gate entry.',
          timestamp: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: 'msg_o2',
          ticketId: orgTicketId,
          senderId: 'usr_support_1',
          senderRole: 'SUPPORT',
          content: 'Hello Kochi Arena team! The gate scanner accepts direct camera QR scans or paste of the anti-fraud hash.',
          timestamp: new Date(Date.now() - 1800000).toISOString()
        }
      ]
    };
    this.tickets.set(orgTicketId, sampleOrgTicket);
    this.userActiveTicket.set('usr_org_1', orgTicketId);
  }

  getTicket(ticketId: string): SupportTicket | undefined {
    return this.tickets.get(ticketId);
  }

  getOrCreateTicket(
    userId: string,
    userName: string,
    userRole: UserRole,
    userPhone: string
  ): SupportTicket {
    const existingTicketId = this.userActiveTicket.get(userId);
    if (existingTicketId) {
      const ticket = this.tickets.get(existingTicketId);
      if (ticket && ticket.status !== 'RESOLVED') {
        return ticket;
      }
    }

    const ticketId = `ticket_${crypto.randomUUID()}`;
    const newTicket: SupportTicket = {
      id: ticketId,
      userId,
      userName,
      userRole,
      userPhone,
      status: 'WAITING',
      createdAt: new Date().toISOString(),
      messages: []
    };

    this.tickets.set(ticketId, newTicket);
    this.userActiveTicket.set(userId, ticketId);
    return newTicket;
  }

  sendMessage(
    ticketId: string,
    senderId: string,
    senderRole: UserRole,
    content: string
  ): SupportChatMessage {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error('Support ticket not found');

    const msg: SupportChatMessage = {
      id: `msg_${crypto.randomUUID()}`,
      ticketId,
      senderId,
      senderRole,
      content,
      timestamp: new Date().toISOString()
    };

    ticket.messages.push(msg);
    if (senderRole === 'SUPPORT' && ticket.status === 'WAITING') {
      ticket.status = 'IN_PROGRESS';
      ticket.assignedAgentId = senderId;
    }

    return msg;
  }

  getAllTickets(): SupportTicket[] {
    return Array.from(this.tickets.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  resolveTicket(ticketId: string): SupportTicket {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) throw new Error('Ticket not found');
    ticket.status = 'RESOLVED';
    this.userActiveTicket.delete(ticket.userId);
    return ticket;
  }
}
