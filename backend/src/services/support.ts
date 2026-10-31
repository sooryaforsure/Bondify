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
      userName: 'Rahul Nair',
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
          content: 'Hi Rahul! You can request cancellation up to 48 hours prior to the event through the ticket section.',
          timestamp: new Date(Date.now() - 3600000 * 1.5).toISOString()
        }
      ]
    };

    this.tickets.set(ticketId, sampleTicket);
    this.userActiveTicket.set('usr_normal_1', ticketId);
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
