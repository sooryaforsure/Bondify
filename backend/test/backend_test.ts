import { AuthService } from '../src/services/auth.ts';
import { MatchmakingService } from '../src/services/matchmaking.ts';
import { EventService } from '../src/services/events.ts';
import { CelebrityService } from '../src/services/celebrity.ts';
import { SupportService } from '../src/services/support.ts';
import { AdminService } from '../src/services/admin.ts';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

async function runAllTests() {
  console.log('🚀 Running Comprehensive FRND Backend Test Suite...\n');

  // Test 1: Authentication & OTP
  console.log('--- TEST 1: Auth, Phone OTP & JWT Verification ---');
  const auth = new AuthService();
  const otpRes = await auth.sendOtp('+919876543299');
  assert(otpRes.success, 'OTP should be sent');
  console.log('✓ Send OTP successful');

  const session = await auth.verifyOtpAndLogin('+919876543299', otpRes.debugOtp || '123456', 'NORMAL', 'Test User');
  assert(session.user.role === 'NORMAL', 'User role should be NORMAL');
  assert(!!session.token, 'JWT Token must be generated');
  console.log('✓ OTP Login & User Registration successful. User ID:', session.user.id);

  const payload = await auth.verifyJwt(session.token);
  assert(payload?.userId === session.user.id, 'JWT signature verification must match user ID');
  console.log('✓ Cryptographic JWT verification successful');

  // Test 2: Location-Based Events & Geo-Ticketing
  console.log('\n--- TEST 2: Location-based Events & QR Ticketing ---');
  const eventService = new EventService();
  
  // User in Kochi (9.9312, 76.2673)
  const nearbyEvents = eventService.getEvents(9.9312, 76.2673, 50); // 50km radius
  assert(nearbyEvents.length >= 2, 'Should find events within 50km of Kochi');
  assert(nearbyEvents[0].city === 'Kochi', 'Closest event should be in Kochi');
  console.log(`✓ Geo-query returned ${nearbyEvents.length} events. Nearest: "${nearbyEvents[0].title}" (${nearbyEvents[0].distanceKm} km)`);

  // Book a ticket
  const booking = eventService.bookTicket(
    session.user.id,
    session.user.fullName,
    session.user.phoneNumber,
    nearbyEvents[0].id,
    nearbyEvents[0].ticketTiers[0].id,
    2
  );
  assert(booking.quantity === 2, 'Booking quantity must be 2');
  assert(booking.qrCodeHash.startsWith('FRND_TKT_'), 'QR code hash must be generated');
  console.log('✓ Ticket booking successful. QR Code Hash:', booking.qrCodeHash);

  // Validate QR Code
  const scanResult = eventService.verifyAndCheckInTicket(booking.qrCodeHash);
  assert(scanResult.success, 'QR code check-in should be successful');
  console.log('✓ Organizer QR scanner verification successful');

  // Attempt duplicate scan
  const duplicateScan = eventService.verifyAndCheckInTicket(booking.qrCodeHash);
  assert(!duplicateScan.success, 'Duplicate QR scan should be rejected');
  console.log('✓ Anti-fraud duplicate ticket scan prevention verified');

  // Test 3: Celebrity Hub & Premium Calling (Audio & Video)
  console.log('\n--- TEST 3: Celebrity Hub & VIP Calling Authorization (Audio & Video) ---');
  const celebService = new CelebrityService(auth);
  const feed = celebService.getCelebrityFeed();
  assert(feed.length >= 2, 'Celebrity feed should contain posts');
  console.log(`✓ Celebrity feed retrieved: ${feed.length} posts`);

  // Ananya Joy is usr_celeb_1 (rate: 50 coins/min)
  // Non-premium user with 0 coins
  const poorUser = auth.updateProfile(session.user.id, { walletBalance: 10, isPremium: false });
  const authCheckFail = celebService.authorizeCelebrityCall(poorUser.id, 'usr_celeb_1', 'CELEBRITY_AUDIO');
  assert(!authCheckFail.authorized, 'Call must be blocked for insufficient funds');
  console.log('✓ Free-tier / insufficient balance restriction enforced:', authCheckFail.reason);

  // Upgrade user or add coins
  auth.updateProfile(session.user.id, { walletBalance: 300, isPremium: true });
  const authCheckSuccess = celebService.authorizeCelebrityCall(session.user.id, 'usr_celeb_1', 'CELEBRITY_VIDEO');
  assert(authCheckSuccess.authorized, 'Video Call must be authorized for premium user');
  console.log(`✓ VIP Video Call authorization granted (Rate: ${authCheckSuccess.ratePerMinute} coins/min)`);

  // Test VIP Video call session & coin billing
  const vipVideoSession = celebService.startVipCallSession(session.user.id, 'usr_celeb_1', 'CELEBRITY_VIDEO', authCheckSuccess.ratePerMinute);
  assert(vipVideoSession.hasVideo === true, 'VIP Video call must have hasVideo: true');
  console.log('✓ VIP Video Call session started with hasVideo=true. Room ID:', vipVideoSession.roomId);
  const endedVideoSession = celebService.endVipCallSession(vipVideoSession.roomId);
  assert(endedVideoSession?.status === 'ENDED', 'VIP video call session must end');
  console.log(`✓ VIP Video Call ended. Duration: ${endedVideoSession?.durationSeconds}s, Billed: ${endedVideoSession?.totalBilled} coins`);

  // Test 4: Random Friends Audio & Video Matchmaking Engine
  console.log('\n--- TEST 4: Random Matchmaking Engine Simulation (Audio & Video) ---');
  const mmService = new MatchmakingService();

  // Create mock sockets
  const messagesUserA: unknown[] = [];
  const messagesUserB: unknown[] = [];
  const messagesUserC: unknown[] = [];
  const messagesUserD: unknown[] = [];

  const mockSocketA = { readyState: WebSocket.OPEN, send: (data: string) => messagesUserA.push(JSON.parse(data)) } as unknown as WebSocket;
  const mockSocketB = { readyState: WebSocket.OPEN, send: (data: string) => messagesUserB.push(JSON.parse(data)) } as unknown as WebSocket;
  const mockSocketC = { readyState: WebSocket.OPEN, send: (data: string) => messagesUserC.push(JSON.parse(data)) } as unknown as WebSocket;
  const mockSocketD = { readyState: WebSocket.OPEN, send: (data: string) => messagesUserD.push(JSON.parse(data)) } as unknown as WebSocket;

  mmService.registerClient('sock_user_a', mockSocketA, 'usr_alice');
  mmService.registerClient('sock_user_b', mockSocketB, 'usr_bob');
  mmService.registerClient('sock_user_c', mockSocketC, 'usr_charlie');
  mmService.registerClient('sock_user_d', mockSocketD, 'usr_diana');

  // 1. Audio Match Test: Alice joins with AUDIO
  mmService.handleSignalingMessage('sock_user_a', { type: 'JOIN_RANDOM_QUEUE', metadata: { callType: 'AUDIO' } });
  assert(mmService.getQueueCount() === 1, 'Queue count should be 1');
  console.log('✓ User A entered Audio queue, waiting for partner...');

  // Bob joins with AUDIO -> Instant Audio Match!
  mmService.handleSignalingMessage('sock_user_b', { type: 'JOIN_RANDOM_QUEUE', metadata: { callType: 'AUDIO' } });
  assert(messagesUserA.length > 0 && (messagesUserA[0] as { type: string }).type === 'MATCH_FOUND', 'User A should receive MATCH_FOUND');
  console.log('✓ Instant Audio pair matched!');

  // 2. Video Match Test: Charlie and Diana join with VIDEO
  mmService.handleSignalingMessage('sock_user_c', { type: 'JOIN_RANDOM_QUEUE', metadata: { callType: 'VIDEO' } });
  mmService.handleSignalingMessage('sock_user_d', { type: 'JOIN_RANDOM_QUEUE', metadata: { callType: 'VIDEO' } });
  const matchD = messagesUserD.find((m: unknown) => (m as { type: string }).type === 'MATCH_FOUND') as { metadata?: { hasVideo?: boolean; callType?: string } };
  assert(matchD?.metadata?.hasVideo === true, 'Video match must deliver hasVideo: true metadata');
  assert(matchD?.metadata?.callType === 'RANDOM_VIDEO', 'CallType must be RANDOM_VIDEO');
  console.log('✓ Instant Video pair matched with hasVideo=true & callType=RANDOM_VIDEO!');

  // Test WebRTC signaling relay between the pair
  mmService.handleSignalingMessage('sock_user_a', {
    type: 'CALL_OFFER',
    sdp: { type: 'offer', sdp: 'v=0...' }
  });
  const offerReceivedByBob = messagesUserB.find((m: unknown) => (m as { type: string }).type === 'CALL_OFFER');
  assert(!!offerReceivedByBob, 'User B must receive User A’s WebRTC SDP Offer');
  console.log('✓ WebRTC SDP Offer successfully relayed through signaling server');

  // Test 5: Customer Care Support Desk
  console.log('\n--- TEST 5: Customer Care Support Desk ---');
  const supportService = new SupportService();
  const ticket = supportService.getOrCreateTicket(session.user.id, session.user.fullName, session.user.role, session.user.phoneNumber);
  assert(ticket.status === 'WAITING', 'New ticket should be in WAITING state');
  
  supportService.sendMessage(ticket.id, session.user.id, 'NORMAL', 'Need help with event pass');
  const reply = supportService.sendMessage(ticket.id, 'usr_support_1', 'SUPPORT', 'Hello, how can I assist you?');
  assert(reply.senderRole === 'SUPPORT', 'Support reply should be logged');
  console.log('✓ Customer support ticket created and 2-way messaging verified');

  // Test 6: Super Admin Operations & Metrics
  console.log('\n--- TEST 6: Super Admin Control & Platform Metrics ---');
  const adminService = new AdminService(auth, eventService, mmService);
  const metrics = adminService.getPlatformMetrics();
  assert(metrics.totalUsers > 0, 'Total users metric must be > 0');
  assert(metrics.totalEvents > 0, 'Total events metric must be > 0');
  console.log('✓ Super Admin Metrics:', JSON.stringify(metrics, null, 2));

  // Admin ban test
  adminService.toggleUserBan('usr_admin_1', session.user.id, true);
  const bannedUser = auth.getUser(session.user.id);
  assert(bannedUser?.isBanned === true, 'User should be banned');
  console.log('✓ Super Admin user suspension/ban control verified');

  console.log('\n🎉 ALL 6 COMPREHENSIVE BACKEND TESTS PASSED SUCCESSFULLY! 🎉\n');
}

runAllTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  Deno.exit(1);
});
