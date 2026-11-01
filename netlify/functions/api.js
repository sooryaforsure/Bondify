// Netlify Serverless Function for Friends Connect (FC) API
const fs = require('fs');
const os = require('os');
const pathModule = require('path');

const LIVE_CALLS_FILE = pathModule.join(os.tmpdir(), 'bondify_live_calls_store.json');

function loadLiveCalls() {
  try {
    if (fs.existsSync(LIVE_CALLS_FILE)) {
      const data = JSON.parse(fs.readFileSync(LIVE_CALLS_FILE, 'utf8'));
      if (Array.isArray(data)) return new Map(data);
    }
  } catch (e) {}
  if (!global._liveCalls) global._liveCalls = new Map();
  return global._liveCalls;
}

function saveLiveCalls(map) {
  global._liveCalls = map;
  try {
    fs.writeFileSync(LIVE_CALLS_FILE, JSON.stringify(Array.from(map.entries())), 'utf8');
  } catch (e) {}
}

const INITIAL_USERS = [
  {
    id: 'usr_normal_1',
    phoneNumber: '+919876543210',
    role: 'NORMAL',
    fullName: 'Arjun Nair',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    bio: 'Music enthusiast & tech fan from Kochi',
    city: 'Kochi',
    isVerified: true,
    isBanned: false,
    walletBalance: 350,
    isPremium: false
  },
  {
    id: 'usr_celeb_1',
    phoneNumber: '+919876543212',
    role: 'CELEBRITY',
    fullName: 'Dulquer Sithara',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    bio: 'Playback Singer & Independent Artist. Live for music 🎶',
    city: 'Kochi',
    isVerified: true,
    isBanned: false,
    walletBalance: 12500,
    isPremium: true,
    celebrityDetails: {
      category: 'Playback Singer & Celebrity Artist',
      callRatePerMinute: 75,
      isAvailableForCalls: true,
      followersCount: 350000
    }
  },
  {
    id: 'usr_org_1',
    phoneNumber: '+919876543211',
    role: 'ORGANIZATION',
    fullName: 'Kochi Live Arena Events',
    avatarUrl: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=150',
    bio: 'Premier Concerts, Tech Expos & Cultural Festivals Organizers in Kerala',
    city: 'Kochi',
    isVerified: true,
    isBanned: false,
    walletBalance: 58000,
    isPremium: true
  },
  {
    id: 'usr_support_1',
    phoneNumber: '+919876543213',
    role: 'SUPPORT',
    fullName: 'Rahul (Customer Care Support)',
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    bio: 'Customer Delight & Dispute Resolution Specialist',
    city: 'Kochi',
    isVerified: true,
    isBanned: false,
    walletBalance: 0,
    isPremium: false
  },
  {
    id: 'usr_admin_1',
    phoneNumber: '+919876543214',
    role: 'SUPER_ADMIN',
    fullName: 'Super Admin (Platform Control)',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150',
    bio: 'Platform Governance, Security & Ecosystem Monitor',
    city: 'Kochi',
    isVerified: true,
    isBanned: false,
    walletBalance: 999999,
    isPremium: true
  }
];

let users = [...INITIAL_USERS];

let events = [
  {
    id: 'evt_1',
    organizationId: 'usr_org_1',
    organizationName: 'Kochi Live Arena Events',
    title: 'Kerala Tech Creators & Startup Summit 2026',
    description: 'The largest gathering of tech innovators, founders, creators and AI engineers in South India.',
    category: 'TECH',
    venue: 'Rajiv Gandhi Indoor Stadium, Kadavanthra, Kochi',
    bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
    eventDate: '2026-11-15T09:30:00Z',
    ticketTiers: [
      { id: 'tier_gen', name: 'General Entry', priceInInr: 499, totalQuantity: 1500, availableQuantity: 840 },
      { id: 'tier_vip', name: 'VIP Creator Lounge', priceInInr: 1499, totalQuantity: 300, availableQuantity: 65 }
    ]
  },
  {
    id: 'evt_2',
    organizationId: 'usr_org_1',
    organizationName: 'Kochi Live Arena Events',
    title: 'Dulquer Sithara Live: Symphony of Kerala Tour',
    description: 'An electrifying live concert featuring Malayalam chart-busters, acoustic fusion and celebrity guest duets.',
    category: 'MUSIC',
    venue: 'Jawaharlal Nehru International Stadium Grounds, Kaloor, Kochi',
    bannerUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800',
    eventDate: '2026-11-28T18:00:00Z',
    ticketTiers: [
      { id: 'tier_gold', name: 'Gold Fan Standing', priceInInr: 799, totalQuantity: 2500, availableQuantity: 1120 },
      { id: 'tier_vip_meet', name: 'VIP Meet & Greet Pass', priceInInr: 2999, totalQuantity: 100, availableQuantity: 14 }
    ]
  }
];

let celebrityPosts = [
  {
    id: 'post_1',
    celebrityId: 'usr_celeb_1',
    celebrityName: 'Dulquer Sithara',
    celebrityAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    mediaType: 'IMAGE',
    mediaUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800',
    caption: 'Rehearsals underway for our Grand Kochi Live Arena Concert! Can\'t wait to sing with you all! Drop your favorite song requests in 1-on-1 chat ❤️🎶',
    likesCount: 1420,
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: 'post_2',
    celebrityId: 'usr_celeb_1',
    celebrityName: 'Dulquer Sithara',
    celebrityAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    mediaType: 'IMAGE',
    mediaUrl: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=800',
    caption: 'Studio session complete for our upcoming track! VIP Fan Pass holders get exclusive early preview access and 1-on-1 video calls. Much love to all my fans! ✨',
    likesCount: 2890,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
  }
];

let bookings = [];

exports.handler = async (event) => {
  const path = event.path.replace(/\/\.netlify\/functions\/api/, '').replace(/^\/api/, '');
  const method = event.httpMethod;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let body = {};
  if (event.body) {
    try { body = JSON.parse(event.body); } catch {}
  }

  // 1. Users list
  if (path === '/users' && method === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, users }) };
  }

  // 2. Auth OTP
  if (path === '/auth/verify-otp' && method === 'POST') {
    const phone = body.phoneNumber;
    let user = users.find(u => u.phoneNumber === phone);
    if (!user) {
      user = {
        id: `usr_${Date.now()}`,
        phoneNumber: phone,
        role: body.role || 'NORMAL',
        fullName: body.fullName || 'New User',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
        city: 'Kochi',
        isVerified: true,
        isBanned: false,
        walletBalance: 300,
        isPremium: false
      };
      users.push(user);
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        session: { token: 'jwt_' + Buffer.from(JSON.stringify(user)).toString('base64'), user }
      })
    };
  }

  // 3. Upgrade Premium
  if (path === '/auth/upgrade-premium' && method === 'POST') {
    const user = users[0];
    user.isPremium = true;
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, user, message: 'VIP Activated!' }) };
  }

  // 4. Update Profile
  if (path === '/auth/profile' && method === 'PUT') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  }

  // 5. Events
  if (path.startsWith('/events') && method === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, events }) };
  }

  if (path === '/events' && method === 'POST') {
    const newEvt = {
      id: 'evt_' + Date.now(),
      organizationId: body.organizationId || 'usr_org_1',
      organizationName: 'Kochi Live Arena Events',
      title: body.title || 'New Event',
      description: body.description || '',
      category: body.category || 'MUSIC',
      venue: body.venue || 'Kochi',
      bannerUrl: body.bannerUrl || 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
      eventDate: body.eventDate || new Date().toISOString(),
      ticketTiers: body.ticketTiers || [
        { id: 'tier_1', name: 'General Admission', priceInInr: 499, totalQuantity: 500, availableQuantity: 500 }
      ]
    };
    events.unshift(newEvt);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, event: newEvt }) };
  }

  // 6. Book Ticket
  if (path === '/events/book' && method === 'POST') {
    const hash = 'FRND_TKT_' + Math.random().toString(16).slice(2, 10).toUpperCase() + '_T_2026_' + Date.now();
    const booking = {
      id: 'bk_' + Date.now(),
      ticketHash: hash,
      eventId: body.eventId,
      eventTitle: body.eventTitle || 'Kerala Tech Summit',
      tierName: body.tierName || 'General Entry',
      quantity: body.quantity || 1,
      totalPrice: (body.quantity || 1) * 499,
      qrHash: hash,
      status: 'CONFIRMED',
      createdAt: new Date().toISOString()
    };
    bookings.push(booking);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, booking }) };
  }

  // 7. Verify Ticket
  if (path === '/events/verify-ticket' && method === 'POST') {
    const hash = (body.qrHash || '').trim();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        valid: true,
        ticket: {
          id: 'tkt_' + Date.now(),
          qrHash: hash,
          eventTitle: 'Kerala Tech Creators & Startup Summit 2026',
          tierName: 'VIP Creator Lounge Pass',
          attendeeName: 'Arjun Nair (Verified Attendee)',
          status: 'CHECKED_IN',
          venue: 'Rajiv Gandhi Indoor Stadium, Kadavanthra, Kochi'
        }
      })
    };
  }

  // 8. Celebrity Feed & Posts
  if (path === '/celebrities/feed' && method === 'GET') {
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, feed: celebrityPosts }) };
  }

  if (path === '/celebrities/posts' && method === 'POST') {
    const newPost = {
      id: 'post_' + Date.now(),
      celebrityId: body.celebrityId || 'usr_celeb_1',
      celebrityName: body.celebrityName || 'Dulquer Sithara',
      celebrityAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
      mediaType: body.mediaType || 'IMAGE',
      mediaUrl: body.mediaUrl,
      caption: body.caption || '',
      likesCount: 0,
      createdAt: new Date().toISOString()
    };
    celebrityPosts.unshift(newPost);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, post: newPost }) };
  }

  // Live Cross-device Call Signaling
  if ((path === '/celebrities/call/ring' || path === '/api/celebrities/call/ring') && method === 'POST') {
    const liveCalls = loadLiveCalls();
    const now = Date.now();
    const celebTargetId = body.celebrityId || 'usr_celeb_1';
    const callerId = body.callerId || 'usr_normal_1';

    // Mark any existing active/ringing call for this celebrity or caller as ENDED
    for (const [id, c] of liveCalls.entries()) {
      const isExpired = now - (c.createdAt || 0) > 120000;
      const isTombstoneExpired = c.endedAt && (now - c.endedAt > 30000);
      const isSameParty = c.celebrityId === celebTargetId || c.callerId === callerId;
      if (isSameParty && (c.status === 'RINGING' || c.status === 'CONNECTED' || c.status === 'APPROVED')) {
        c.status = 'ENDED';
        c.endedAt = now;
      }
      if (isExpired || isTombstoneExpired) {
        liveCalls.delete(id);
      }
    }

    const callId = body.callId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const call = {
      callId,
      callerId,
      callerName: body.callerName || body.caller || 'Arjun Nair',
      callerAvatar: body.callerAvatar,
      celebrityId: celebTargetId,
      callType: body.callType || 'CELEBRITY_VIDEO',
      status: 'RINGING',
      createdAt: now,
      offerSdp: body.offerSdp,
      iceCandidates: []
    };
    liveCalls.set(callId, call);
    saveLiveCalls(liveCalls);
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, call }) };
  }

  if ((path === '/celebrities/call/status' || path === '/api/celebrities/call/status') && method === 'GET') {
    const liveCalls = loadLiveCalls();
    const now = Date.now();
    const callId = event.queryStringParameters?.callId;
    const celebrityId = event.queryStringParameters?.celebrityId;
    const callerId = event.queryStringParameters?.callerId;

    let found = null;
    if (callId && liveCalls.has(callId)) {
      found = liveCalls.get(callId);
      // If found call is still marked RINGING, check if ANY call for this celebrity was answered/approved
      if (found && found.status === 'RINGING') {
        for (const c of liveCalls.values()) {
          if ((c.celebrityId === found.celebrityId || c.celebrityId === 'usr_celeb_1') && (c.status === 'CONNECTED' || c.status === 'APPROVED')) {
            found.status = 'CONNECTED';
            found.approvedAt = c.approvedAt || now;
            break;
          }
        }
      }
    }

    if (!found) {
      // 1st priority: Find NEWEST active call (CONNECTED/APPROVED/RINGING) matching celebrity or caller
      const activeCalls = [];
      for (const c of liveCalls.values()) {
        const matchCeleb = celebrityId && (c.celebrityId === celebrityId || celebrityId === 'usr_celeb_1');
        const matchCaller = callerId && c.callerId === callerId;
        if (matchCeleb || matchCaller) {
          if (c.status === 'CONNECTED' || c.status === 'APPROVED' || c.status === 'RINGING') {
            activeCalls.push(c);
          }
        }
      }
      if (activeCalls.length > 0) {
        activeCalls.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        found = activeCalls[0];
      }
    }

    if (!found) {
      // 2nd priority: Recent tombstone ended/declined call
      const recentCalls = [];
      for (const c of liveCalls.values()) {
        const matchCeleb = celebrityId && (c.celebrityId === celebrityId || celebrityId === 'usr_celeb_1');
        const matchCaller = callerId && c.callerId === callerId;
        if (matchCeleb || matchCaller) {
          if (c.status === 'DECLINED' || c.status === 'ENDED') {
            if (c.endedAt && (now - c.endedAt < 30000)) {
              recentCalls.push(c);
            }
          }
        }
      }
      if (recentCalls.length > 0) {
        recentCalls.sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
        found = recentCalls[0];
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, call: found }) };
  }

  if ((path === '/celebrities/call/respond' || path === '/api/celebrities/call/respond') && method === 'POST') {
    const liveCalls = loadLiveCalls();
    const now = Date.now();
    const targetCallId = body.callId;
    const celebTargetId = body.celebrityId || 'usr_celeb_1';
    let call = targetCallId ? liveCalls.get(targetCallId) : null;

    if (!call) {
      // Find newest active/ringing call for this celebrity
      const candidates = [];
      for (const c of liveCalls.values()) {
        if (c.celebrityId === celebTargetId || celebTargetId === 'usr_celeb_1') {
          if (c.status === 'RINGING' || c.status === 'APPROVED' || c.status === 'CONNECTED') {
            candidates.push(c);
          }
        }
      }
      candidates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (candidates.length > 0) call = candidates[0];
    }

    if (!call) {
      for (const c of liveCalls.values()) {
        if (c.status === 'RINGING') {
          call = c;
          break;
        }
      }
    }

    if (call) {
      if (body.action === 'APPROVE') {
        call.status = 'CONNECTED';
        call.approvedAt = now;
        if (body.answerSdp) call.answerSdp = body.answerSdp;
        // Mark ALL ringing calls for this celebrity as CONNECTED so caller is never stranded
        for (const c of liveCalls.values()) {
          if ((c.celebrityId === call.celebrityId || c.celebrityId === 'usr_celeb_1') && c.status === 'RINGING') {
            c.status = 'CONNECTED';
            c.approvedAt = now;
          }
        }
      } else {
        call.status = 'DECLINED';
        call.endedAt = now;
        for (const c of liveCalls.values()) {
          if ((c.celebrityId === call.celebrityId || c.celebrityId === 'usr_celeb_1') && c.status === 'RINGING') {
            c.status = 'DECLINED';
            c.endedAt = now;
          }
        }
      }
      saveLiveCalls(liveCalls);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, call }) };
  }

  if ((path === '/celebrities/call/frame' || path === '/api/celebrities/call/frame') && method === 'POST') {
    const liveCalls = loadLiveCalls();
    const callId = body.callId;
    let call = (callId && callId !== 'active') ? liveCalls.get(callId) : null;
    if (!call) {
      const candidates = [];
      for (const c of liveCalls.values()) {
        if (c.status === 'CONNECTED' || c.status === 'RINGING') candidates.push(c);
      }
      candidates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (candidates.length > 0) call = candidates[0];
    }
    if (call && body.frame) {
      if (body.role === 'CELEBRITY') {
        call.lastCelebFrame = body.frame;
      } else {
        call.lastNormalFrame = body.frame;
      }
      saveLiveCalls(liveCalls);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: !!call }) };
  }

  if ((path === '/celebrities/call/signal' || path === '/api/celebrities/call/signal') && method === 'POST') {
    const liveCalls = loadLiveCalls();
    let call = body.callId ? liveCalls.get(body.callId) : null;
    if (!call) {
      const candidates = [];
      for (const c of liveCalls.values()) {
        if (c.status === 'CONNECTED' || c.status === 'RINGING') candidates.push(c);
      }
      candidates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (candidates.length > 0) call = candidates[0];
    }
    if (call && body.signal) {
      if (body.signal.type === 'RTC_OFFER' && body.signal.sdp) call.offerSdp = body.signal.sdp;
      if (body.signal.type === 'RTC_ANSWER' && body.signal.sdp) call.answerSdp = body.signal.sdp;
      if (body.signal.type === 'RTC_ICE_CANDIDATE' && body.signal.candidate) {
        call.iceCandidates = call.iceCandidates || [];
        call.iceCandidates.push({ candidate: body.signal.candidate, fromRole: body.signal.fromRole });
      }
      saveLiveCalls(liveCalls);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, call }) };
  }

  if ((path === '/celebrities/call/end' || path === '/api/celebrities/call/end') && method === 'POST') {
    const liveCalls = loadLiveCalls();
    let call = body.callId ? liveCalls.get(body.callId) : null;
    if (!call) {
      const candidates = [];
      for (const c of liveCalls.values()) {
        if (c.status === 'CONNECTED' || c.status === 'RINGING') candidates.push(c);
      }
      candidates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (candidates.length > 0) call = candidates[0];
    }
    if (call) {
      call.status = 'ENDED';
      call.endedAt = Date.now();
      call.endedBy = body.endedBy || 'USER';
      saveLiveCalls(liveCalls);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, call }) };
  }

  // 9. Admin metrics & moderation
  if (path === '/admin/metrics' && method === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        metrics: {
          totalUsers: users.length,
          totalCelebrities: 1,
          totalOrganizations: 1,
          totalEvents: events.length,
          totalBookings: 785,
          totalRevenueInRupees: 512315
        }
      })
    };
  }

  if (path === '/admin/ban' && method === 'POST') {
    const user = users.find(u => u.id === body.userId);
    if (user) user.isBanned = body.isBanned;
    return { statusCode: 200, headers, body: JSON.stringify({ success: true, message: 'User status updated' }) };
  }

  // Default fallback
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, message: 'FRND API Online' })
  };
};
