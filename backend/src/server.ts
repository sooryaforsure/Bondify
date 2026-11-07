import { AuthService } from './services/auth.ts';
import { MatchmakingService } from './services/matchmaking.ts';
import { EventService } from './services/events.ts';
import { CelebrityService } from './services/celebrity.ts';
import { SupportService } from './services/support.ts';
import { AdminService } from './services/admin.ts';
import { SignalingPayload } from './types/index.ts';
import { initDatabase, isDbAvailable, query, queryOne, execute } from './lib/db.ts';

export class FrndServer {
  public authService: AuthService;
  public matchmakingService: MatchmakingService;
  public eventService: EventService;
  public celebrityService: CelebrityService;
  public supportService: SupportService;
  public adminService: AdminService;
  private server?: Deno.HttpServer;

  constructor() {
    this.authService = new AuthService();
    this.matchmakingService = new MatchmakingService();
    this.eventService = new EventService();
    this.celebrityService = new CelebrityService(this.authService);
    this.supportService = new SupportService();
    this.adminService = new AdminService(
      this.authService,
      this.eventService,
      this.matchmakingService
    );
  }

  async start(port: number = 3000): Promise<Deno.HttpServer> {
    // 0. Initialize PostgreSQL Database (if DATABASE_URL is configured)
    try {
      let schemaSql = '';
      try {
        schemaSql = await Deno.readTextFile('backend/schema.sql');
      } catch {
        try {
          schemaSql = await Deno.readTextFile('schema.sql');
        } catch {}
      }

      const dbReady = await initDatabase(schemaSql);
      if (dbReady) {
        await this.authService.syncSeedToDb();
        await this.celebrityService.syncSeedToDb();
        await this.eventService.syncSeedToDb();
        await this.supportService.syncSeedToDb();
      }
    } catch (err) {
      console.warn('[Server] DB startup check finished:', err);
    }

    const handler = async (req: Request): Promise<Response> => {
      const url = new URL(req.url);

      // 1. CORS Preflight
      if (req.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: this.corsHeaders(),
        });
      }

      // 2. WebSocket Upgrade for Realtime Matchmaking & VoIP Signaling
      if (url.pathname === '/ws') {
        if (req.headers.get('upgrade') !== 'websocket') {
          return new Response('Expected websocket', { status: 400 });
        }
        const { socket, response } = Deno.upgradeWebSocket(req);
        this.setupWebSocket(socket, url);
        return response;
      }

      // 3. REST API Routes
      if (url.pathname.startsWith('/api/')) {
        try {
          return await this.handleApiRoutes(req, url);
        } catch (err: unknown) {
          const error = err as Error;
          return this.jsonResponse(
            { success: false, error: error.message || 'Internal server error' },
            400
          );
        }
      }

      // 4. Serve Static Web App files
      return await this.serveStaticFiles(url.pathname);
    };

    this.server = Deno.serve({ port, hostname: '0.0.0.0' }, handler);
    console.log(`[FRND Server] Running at http://localhost:${port}`);
    return this.server;
  }

  stop() {
    if (this.server) {
      this.server.shutdown();
    }
  }

  private setupWebSocket(socket: WebSocket, url: URL) {
    const socketId = `sock_${crypto.randomUUID()}`;
    const userId = url.searchParams.get('userId') || `guest_${socketId.slice(-6)}`;

    socket.onopen = () => {
      this.matchmakingService.registerClient(socketId, socket, userId);
    };

    socket.onmessage = (event) => {
      try {
        const payload: SignalingPayload = JSON.parse(event.data);
        payload.userId = payload.userId || userId;
        this.matchmakingService.handleSignalingMessage(socketId, payload);
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    socket.onclose = () => {
      this.matchmakingService.unregisterClient(socketId);
    };

    socket.onerror = (err) => {
      console.error('[WebSocket] Error on socket:', err);
      this.matchmakingService.unregisterClient(socketId);
    };
  }

  private async handleApiRoutes(req: Request, url: URL): Promise<Response> {
    const path = url.pathname;
    const method = req.method;

    // --- AUTH ROUTES ---
    if (path === '/api/auth/send-otp' && method === 'POST') {
      const body = await req.json();
      const res = await this.authService.sendOtp(body.phoneNumber);
      return this.jsonResponse(res);
    }

    if (path === '/api/auth/verify-otp' && method === 'POST') {
      const body = await req.json();
      const session = await this.authService.verifyOtpAndLogin(
        body.phoneNumber,
        body.otp,
        body.role,
        body.fullName
      );
      return this.jsonResponse({ success: true, session });
    }

    if (path === '/api/auth/admin-login' && method === 'POST') {
      const body = await req.json();
      const session = await this.authService.adminLogin(body.identifier, body.password);
      return this.jsonResponse({ success: true, session });
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const user = await this.authenticate(req);
      return this.jsonResponse({ success: true, user });
    }

    if (path === '/api/auth/upgrade-premium' && method === 'POST') {
      const user = await this.authenticate(req);
      const updated = this.authService.updateProfile(user.id, { isPremium: true });
      return this.jsonResponse({ success: true, user: updated, message: 'Premium Pass activated successfully!' });
    }

    if ((path === '/api/auth/profile' || path === '/api/users/profile') && (method === 'PUT' || method === 'POST')) {
      const updates = await req.json();
      let targetUserId = updates.userId;
      if (!targetUserId) {
        try {
          const user = await this.authenticate(req);
          targetUserId = user.id;
        } catch {}
      }
      targetUserId = targetUserId || 'usr_normal_1';
      const updated = this.authService.updateProfile(targetUserId, updates);
      return this.jsonResponse({ success: true, user: updated });
    }

    if (path === '/api/users' && method === 'GET') {
      const users = this.authService.getAllUsers();
      return this.jsonResponse({ success: true, users });
    }

    // --- EVENTS ROUTES (Location Based) ---
    if (path === '/api/events' && method === 'GET') {
      const lat = url.searchParams.has('lat') ? parseFloat(url.searchParams.get('lat')!) : undefined;
      const lon = url.searchParams.has('lon') ? parseFloat(url.searchParams.get('lon')!) : undefined;
      const radius = url.searchParams.has('radius') ? parseFloat(url.searchParams.get('radius')!) : undefined;
      const events = this.eventService.getEvents(lat, lon, radius);
      return this.jsonResponse({ success: true, events });
    }

    if (path === '/api/events' && method === 'POST') {
      const user = await this.authenticate(req);
      if (user.role !== 'ORGANIZATION' && user.role !== 'SUPER_ADMIN') {
        throw new Error('Only Organizations or Admins can post events');
      }
      const body = await req.json();
      const event = this.eventService.createEvent(user.id, user.fullName, body);
      return this.jsonResponse({ success: true, event });
    }

    if (path === '/api/events/book' && method === 'POST') {
      const user = await this.authenticate(req);
      const body = await req.json();
      const booking = this.eventService.bookTicket(
        user.id,
        user.fullName,
        user.phoneNumber,
        body.eventId,
        body.tierId,
        body.quantity || 1
      );
      return this.jsonResponse({ success: true, booking });
    }

    if (path === '/api/events/my-bookings' && method === 'GET') {
      const user = await this.authenticate(req);
      const bookings = this.eventService.getUserBookings(user.id);
      return this.jsonResponse({ success: true, bookings });
    }

    if (path === '/api/events/all-bookings' && method === 'GET') {
      const bookings = this.eventService.getAllBookings();
      return this.jsonResponse({ success: true, bookings });
    }

    if (path === '/api/events/verify-ticket' && method === 'POST') {
      const body = await req.json();
      const result = this.eventService.verifyAndCheckInTicket(body.qrCodeHash);
      return this.jsonResponse(result);
    }

    // --- CELEBRITY & VIP CALL ROUTES ---
    if (path === '/api/celebrities/feed' && method === 'GET') {
      const feed = await this.celebrityService.getCelebrityFeed();
      return this.jsonResponse({ success: true, feed });
    }

    if (path === '/api/celebrities/list' && method === 'GET') {
      const celebrities = this.celebrityService.getCelebritiesList();
      return this.jsonResponse({ success: true, celebrities });
    }

    if (path === '/api/celebrities/posts' && method === 'POST') {
      const user = await this.authenticate(req);
      if (user.role !== 'CELEBRITY' && user.role !== 'SUPER_ADMIN') {
        throw new Error('Only verified celebrities can post to feed');
      }
      const body = await req.json();
      const post = this.celebrityService.createPost(
        user.id,
        user.fullName,
        user.avatarUrl,
        body.mediaType || 'IMAGE',
        body.mediaUrl,
        body.caption,
        body.thumbnailUrl
      );
      return this.jsonResponse({ success: true, post });
    }

    if (path.startsWith('/api/celebrities/like/') && method === 'POST') {
      const postId = path.replace('/api/celebrities/like/', '');
      let userId = 'usr_normal_1';
      try {
        const body = await req.json();
        if (body.userId) userId = body.userId;
      } catch {}
      const res = this.celebrityService.likePost(postId, userId);
      return this.jsonResponse({ success: true, likes: res.likes, isLiked: res.isLiked });
    }

    if (path.startsWith('/api/celebrities/comment/') && method === 'POST') {
      const postId = path.replace('/api/celebrities/comment/', '');
      const body = await req.json();
      const comment = this.celebrityService.addComment(
        postId,
        body.userId || 'usr_normal_1',
        body.userName || 'VIP Fan',
        body.userAvatar,
        body.content || ''
      );
      return this.jsonResponse({ success: true, comment });
    }

    if (path === '/api/celebrities/availability' && method === 'GET') {
      const celebId = url.searchParams.get('celebrityId') || undefined;
      const availability = this.celebrityService.getCelebrityAvailability(celebId);
      return this.jsonResponse({ success: true, availability });
    }

    if (path === '/api/celebrities/availability' && method === 'POST') {
      const body = await req.json();
      const celebId = body.celebrityId || 'usr_celeb_1';
      const isAvailable = Boolean(body.isAvailable);
      this.celebrityService.setCelebrityAvailability(celebId, isAvailable);
      
      // Real-time broadcast availability change to all active users via matchmaking socket
      this.matchmakingService.broadcast({
        type: 'CELEB_AVAILABILITY_CHANGED',
        celebrityId: celebId,
        isAvailable
      });
      return this.jsonResponse({ success: true, celebrityId: celebId, isAvailable });
    }

    if (path === '/api/celebrities/analytics' && method === 'GET') {
      const celebId = url.searchParams.get('celebrityId') || 'usr_celeb_1';
      const analytics = await this.celebrityService.getCelebrityAnalytics(celebId);
      return this.jsonResponse({ success: true, analytics });
    }

    if (path === '/api/celebrities/review' && method === 'POST') {
      let callerUser: any = null;
      try {
        callerUser = await this.authenticate(req);
      } catch {}
      const body = await req.json();
      const result = await this.celebrityService.submitCallReview(
        body.callId,
        body.rating || 5,
        body.celebrityId || 'usr_celeb_1',
        callerUser?.id || body.callerId || 'usr_normal_1',
        callerUser?.fullName || body.callerName || 'Arjun Nair',
        body.celebrityName || 'Dulquer Sithara',
        body.callType || 'CELEBRITY_VIDEO',
        body.issueTags || [],
        body.feedback || ''
      );
      return this.jsonResponse(result);
    }

    if (path === '/api/celebrities/authorize-call' && method === 'POST') {
      const user = await this.authenticate(req);
      const body = await req.json();
      const result = this.celebrityService.authorizeCelebrityCall(
        user.id,
        body.celebrityId,
        body.callType || 'CELEBRITY_AUDIO'
      );
      return this.jsonResponse(result);
    }

    // --- CELEBRITY LIVE CALL SIGNALING ROUTES (Cross-device & Multi-network) ---
    if (path === '/api/celebrities/call/ring' && method === 'POST') {
      const body = await req.json();
      const celebTargetId = body.celebrityId || 'usr_celeb_1';
      const callerDisplayName = body.callerName || body.caller || 'Arjun Nair';
      const call = this.celebrityService.ringCelebrity(
        body.callerId || 'usr_normal_1',
        callerDisplayName,
        body.callerAvatar,
        celebTargetId,
        body.callType || 'CELEBRITY_VIDEO',
        body.offerSdp,
        body.callId
      );

      console.log(`[CALL RING] Incoming call from ${callerDisplayName} (${body.callerId}) to celebrity ${celebTargetId}. CallId: ${call.callId}`);

      // Instant WebSocket push to celebrity device
      this.matchmakingService.sendToUser(celebTargetId, {
        type: 'INCOMING_CELEB_CALL',
        call
      });

      return this.jsonResponse({ success: true, call });
    }

    if (path === '/api/celebrities/call/status' && method === 'GET') {
      const callId = url.searchParams.get('callId') || undefined;
      const celebrityId = url.searchParams.get('celebrityId') || undefined;
      const callerId = url.searchParams.get('callerId') || undefined;
      const call = this.celebrityService.getLiveCallStatus({ callId, celebrityId, callerId });
      if (call) {
        console.log(`[CALL STATUS] Queried by celeb=${celebrityId} caller=${callerId} callId=${callId} => Status: ${call.status}`);
      }
      return this.jsonResponse({ success: true, call });
    }

    if (path === '/api/celebrities/call/respond' && method === 'POST') {
      const body = await req.json();
      try {
        const call = this.celebrityService.respondToLiveCall(
          body.callId,
          body.action || 'APPROVE',
          body.answerSdp,
          body.celebrityId || 'usr_celeb_1'
        );

        console.log(`[CALL RESPOND] Call ${body.callId} action: ${body.action} => Status: ${call?.status}`);

        // Instant WebSocket push to normal user device
        if (call && call.callerId) {
          this.matchmakingService.sendToUser(call.callerId, {
            type: 'CELEB_CALL_RESPONSE',
            action: body.action,
            call
          });
        }

        return this.jsonResponse({ success: true, call });
      } catch (err) {
        console.error('[CALL RESPOND ERROR]:', err);
        return this.jsonResponse({ success: false, error: String(err) });
      }
    }

    if (path === '/api/celebrities/call/signal' && method === 'POST') {
      const body = await req.json();
      const call = this.celebrityService.relayCallSignal(body.callId, body.signal);

      // Relay WebRTC signal to target peer via WebSocket
      const targetUserId = body.signal?.fromRole === 'CELEBRITY' ? call?.callerId : call?.celebrityId;
      if (targetUserId) {
        this.matchmakingService.sendToUser(targetUserId, {
          type: 'CELEB_WEBRTC_SIGNAL',
          signal: body.signal,
          callId: body.callId
        });
      }

      return this.jsonResponse({ success: true, call });
    }

    if (path === '/api/celebrities/call/frame' && method === 'POST') {
      const body = await req.json();
      const call = this.celebrityService.updateLiveFrame(body.callId, body.role, body.frame);

      // Fast frame relay to opposite user via WebSocket
      const targetUserId = body.role === 'CELEBRITY' ? call?.callerId : call?.celebrityId;
      if (targetUserId) {
        this.matchmakingService.sendToUser(targetUserId, {
          type: 'CELEB_VIDEO_FRAME',
          fromRole: body.role,
          frame: body.frame,
          callId: body.callId
        });
      }

      return this.jsonResponse({ success: true });
    }

    if (path === '/api/celebrities/call/end' && method === 'POST') {
      const body = await req.json();
      const celebTargetId = body.celebrityId || 'usr_celeb_1';
      console.log(`[CALL END] Call ${body.callId} ended by ${body.endedBy} (Target Celeb: ${celebTargetId})`);
      const call = this.celebrityService.endLiveCall(body.callId, body.endedBy || 'USER', celebTargetId, body.callerId);

      const endSignal = {
        type: 'CELEB_CALL_ENDED',
        call: call || { callId: body.callId, celebrityId: celebTargetId, status: 'ENDED', endedBy: body.endedBy || 'USER' },
        callId: body.callId,
        celebrityId: celebTargetId,
        endedBy: body.endedBy || 'USER'
      };

      // Broadcast to all active sockets so every open celebrity or user tab terminates the ringing instantly!
      this.matchmakingService.broadcast(endSignal);

      return this.jsonResponse({ success: true, call });
    }

    // --- CALL HISTORY & CHAT MESSAGING PERSISTENCE ROUTES ---
    if (path === '/api/calls/history' && method === 'GET') {
      const userId = url.searchParams.get('userId') || 'usr_normal_1';
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const history = await this.celebrityService.getCallHistory(userId, limit);
      return this.jsonResponse({ success: true, history });
    }

    if (path === '/api/chat/messages' && method === 'GET') {
      const senderId = url.searchParams.get('senderId');
      const receiverId = url.searchParams.get('receiverId');
      if (isDbAvailable() && senderId && receiverId) {
        try {
          const rows = await query<any>(
            `SELECT * FROM chat_messages 
             WHERE (sender_id = $1 AND receiver_id = $2) 
                OR (sender_id = $2 AND receiver_id = $1)
             ORDER BY created_at ASC 
             LIMIT 100`,
            [senderId, receiverId]
          );
          return this.jsonResponse({ success: true, messages: rows });
        } catch (err) {
          console.warn('[Chat] Query error:', err);
        }
      }
      return this.jsonResponse({ success: true, messages: [] });
    }

    if (path === '/api/chat/messages' && method === 'POST') {
      const body = await req.json();
      const msgId = `msg_${crypto.randomUUID()}`;
      if (isDbAvailable() && body.senderId && body.receiverId && body.content) {
        try {
          await execute(
            `INSERT INTO chat_messages (id, sender_id, receiver_id, content, is_read, created_at)
             VALUES ($1, $2, $3, $4, false, NOW())`,
            [msgId, body.senderId, body.receiverId, body.content]
          );
        } catch (err) {
          console.warn('[Chat] Insert error:', err);
        }
      }
      return this.jsonResponse({ success: true, messageId: msgId });
    }

    if (path === '/api/vip-pass/check' && method === 'GET') {
      const userId = url.searchParams.get('userId');
      const celebrityId = url.searchParams.get('celebrityId') || 'usr_celeb_1';
      if (isDbAvailable() && userId) {
        try {
          const pass = await queryOne<any>(
            `SELECT * FROM vip_fan_passes WHERE user_id = $1 AND celebrity_id = $2 AND is_active = true`,
            [userId, celebrityId]
          );
          return this.jsonResponse({ success: true, hasPass: Boolean(pass) });
        } catch (err) {
          console.warn('[VIP Pass] Check error:', err);
        }
      }
      return this.jsonResponse({ success: true, hasPass: true });
    }

    if (path === '/api/vip-pass/subscribe' && method === 'POST') {
      const body = await req.json();
      const userId = body.userId || 'usr_normal_1';
      const celebId = body.celebrityId || 'usr_celeb_1';
      const amount = Number(body.amount || 499);
      
      this.celebrityService.subscribeVipFanPass(userId, celebId, amount);

      if (isDbAvailable()) {
        try {
          await execute(
            `INSERT INTO vip_fan_passes (id, user_id, celebrity_id, is_active, purchased_at, expires_at)
             VALUES ($1, $2, $3, true, NOW(), NOW() + INTERVAL '30 days')
             ON CONFLICT (user_id, celebrity_id) DO UPDATE SET is_active = true, expires_at = NOW() + INTERVAL '30 days'`,
            [`pass_${crypto.randomUUID()}`, userId, celebId]
          );
        } catch (err) {
          console.warn('[VIP Pass] Subscribe error:', err);
        }
      }
      return this.jsonResponse({ success: true, message: 'VIP Fan Pass subscribed successfully!' });
    }

    // --- SUPPORT DESK ROUTES ---
    if (path === '/api/support/tickets' && method === 'GET') {
      const user = await this.authenticate(req);
      if (user.role === 'SUPPORT' || user.role === 'SUPER_ADMIN') {
        const tickets = this.supportService.getAllTickets();
        return this.jsonResponse({ success: true, tickets });
      }
      const ticket = this.supportService.getOrCreateTicket(
        user.id,
        user.fullName,
        user.role,
        user.phoneNumber
      );
      return this.jsonResponse({ success: true, tickets: [ticket] });
    }

    if (path === '/api/support/messages' && method === 'POST') {
      const user = await this.authenticate(req);
      const body = await req.json();
      let ticketId = body.ticketId;
      if (!ticketId || !this.supportService.getTicket(ticketId)) {
        const ticket = this.supportService.getOrCreateTicket(
          user.id,
          user.fullName,
          user.role,
          user.phoneNumber
        );
        ticketId = ticket.id;
      }
      const msg = this.supportService.sendMessage(
        ticketId,
        user.id,
        user.role,
        body.content
      );
      return this.jsonResponse({ success: true, message: msg, ticketId });
    }

    // --- SUPER ADMIN ROUTES ---
    if (path === '/api/admin/metrics' && method === 'GET') {
      const user = await this.authenticate(req);
      if (user.role !== 'SUPER_ADMIN') {
        throw new Error('Super admin access required');
      }
      const metrics = this.adminService.getPlatformMetrics();
      const users = this.authService.getAllUsers();
      return this.jsonResponse({ success: true, metrics, users });
    }

    if (path === '/api/admin/call-reviews' && method === 'GET') {
      const user = await this.authenticate(req);
      if (user.role !== 'SUPER_ADMIN') {
        throw new Error('Super admin access required');
      }
      const reviewsData = await this.celebrityService.getCallQualityReviews();
      return this.jsonResponse(reviewsData);
    }

    if (path === '/api/admin/users' && method === 'GET') {
      const user = await this.authenticate(req);
      if (user.role !== 'SUPER_ADMIN') {
        throw new Error('Super admin access required');
      }
      const users = this.authService.getAllUsers();
      return this.jsonResponse({ success: true, users });
    }

    if (path === '/api/admin/ban' && method === 'POST') {
      const user = await this.authenticate(req);
      const body = await req.json();
      const updated = this.adminService.toggleUserBan(user.id, body.targetUserId, body.ban);
      return this.jsonResponse({ success: true, user: updated });
    }

    if (path === '/api/admin/approve-org' && method === 'POST') {
      const user = await this.authenticate(req);
      const body = await req.json();
      const updated = this.adminService.approveOrganization(user.id, body.targetUserId, body.approved);
      return this.jsonResponse({ success: true, user: updated });
    }

    if (path === '/api/admin/verify-celeb' && method === 'POST') {
      const user = await this.authenticate(req);
      const body = await req.json();
      const updated = this.adminService.verifyCelebrity(user.id, body.targetUserId, body.verified);
      return this.jsonResponse({ success: true, user: updated });
    }

    return this.jsonResponse({ error: 'Endpoint not found' }, 404);
  }

  private async authenticate(req: Request) {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Missing or invalid Authorization header');
    }
    const token = authHeader.split(' ')[1];
    const payload = await this.authService.verifyJwt(token);
    if (!payload || !payload.userId) {
      throw new Error('Invalid or expired token');
    }
    const user = this.authService.getUser(payload.userId as string);
    if (!user) {
      throw new Error('User not found');
    }
    if (user.isBanned) {
      throw new Error('Account is suspended');
    }
    return user;
  }

  private async serveStaticFiles(pathname: string): Promise<Response> {
    let filePath = pathname === '/' ? '/index.html' : pathname;
    const staticDir = 'web-app/public';
    const fullPath = `${staticDir}${filePath}`;

    try {
      const file = await Deno.readFile(fullPath);
      const contentType = this.getContentType(filePath);
      return new Response(file, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          ...this.corsHeaders(),
        },
      });
    } catch {
      // Fallback to index.html for Single Page Application client routing
      try {
        const indexHtml = await Deno.readFile(`${staticDir}/index.html`);
        return new Response(indexHtml, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            ...this.corsHeaders(),
          },
        });
      } catch {
        return new Response('404 Not Found', { status: 404 });
      }
    }
  }

  private getContentType(path: string): string {
    if (path.endsWith('.html')) return 'text/html; charset=utf-8';
    if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
    if (path.endsWith('.css')) return 'text/css; charset=utf-8';
    if (path.endsWith('.json')) return 'application/json';
    if (path.endsWith('.svg')) return 'image/svg+xml';
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
    return 'application/octet-stream';
  }

  private jsonResponse(data: unknown, status: number = 200): Response {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...this.corsHeaders(),
      },
    });
  }

  private corsHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }
}

// Standalone execution entrypoint
if (import.meta.main) {
  const port = parseInt(Deno.env.get('PORT') || '3000', 10);
  const server = new FrndServer();
  await server.start(port);
}
