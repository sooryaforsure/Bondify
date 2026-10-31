// FRND Web Application State & Client Logic
let currentUser = null;
let currentToken = null;
let allUsers = [];
let socket = null;
let currentTab = 'matchmaking';

// Call & WebRTC State
let matchingMode = 'AUDIO'; // 'AUDIO' or 'VIDEO'
let callTimerInterval = null;
let callDuration = 0;
let isMuted = false;
let isCameraOff = false;
let localMediaStream = null;
let currentCallPartner = null;
let currentCallHasVideo = false;
let selectedEventForBooking = null;
let selectedTicketTier = null;
let bookingQty = 1;
let selectedCelebrityForCall = null;
let activeDistanceFilter = 50;

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
  await fetchAllUsers();
  // Default login as Rahul (Normal User)
  await switchUserRole('usr_normal_1');
  initWebSocket();
  loadNearbyEvents();
  loadCelebrityHub();
  loadSupportTickets();
});

// ----------------- USER & ROLE MANAGEMENT -----------------

async function fetchAllUsers() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    if (data.success) {
      allUsers = data.users;
    }
  } catch (err) {
    console.error('Error fetching users:', err);
  }
}

async function switchUserRole(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  // Auto-login or verify OTP for this user
  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: user.phoneNumber,
        otp: '123456',
        role: user.role,
        fullName: user.fullName
      })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.session.user;
      currentToken = data.session.token;
      updateUserUI();

      // Reconnect socket with new user identity
      if (socket) {
        socket.close();
      }
      initWebSocket();

      // Show/Hide Role specific elements
      updateRoleSpecificUI();
    }
  } catch (err) {
    console.error('Login error:', err);
  }
}

function updateUserUI() {
  if (!currentUser) return;

  document.getElementById('user-display-name').textContent = currentUser.fullName;
  document.getElementById('user-role-badge').textContent = currentUser.role;
  document.getElementById('user-wallet-coins').textContent = currentUser.walletBalance;
  document.getElementById('user-avatar').src = currentUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';

  // Highlight active role button
  document.querySelectorAll('.role-btn').forEach(btn => btn.classList.remove('ring-2', 'ring-indigo-400'));
  const activeBtnId = {
    'NORMAL': 'role-btn-normal',
    'ORGANIZATION': 'role-btn-org',
    'CELEBRITY': 'role-btn-celeb',
    'SUPPORT': 'role-btn-support',
    'SUPER_ADMIN': 'role-btn-admin'
  }[currentUser.role];
  if (activeBtnId) {
    document.getElementById(activeBtnId)?.classList.add('ring-2', 'ring-indigo-400');
  }
}

function updateRoleSpecificUI() {
  const adminTab = document.getElementById('tab-admin');
  const postEventBtn = document.getElementById('btn-post-event');
  const postMediaBtn = document.getElementById('btn-post-media');

  // Super Admin Tab
  if (currentUser.role === 'SUPER_ADMIN') {
    adminTab.classList.remove('hidden');
    loadAdminMetrics();
  } else {
    adminTab.classList.add('hidden');
    if (currentTab === 'admin') switchTab('matchmaking');
  }

  // Organization Post Event Button
  if (currentUser.role === 'ORGANIZATION' || currentUser.role === 'SUPER_ADMIN') {
    postEventBtn.classList.remove('hidden');
  } else {
    postEventBtn.classList.add('hidden');
  }

  // Celebrity Post Media Button
  if (currentUser.role === 'CELEBRITY' || currentUser.role === 'SUPER_ADMIN') {
    postMediaBtn.classList.remove('hidden');
  } else {
    postMediaBtn.classList.add('hidden');
  }
}

function addDemoCoins() {
  if (!currentUser) return;
  currentUser.walletBalance += 100;
  document.getElementById('user-wallet-coins').textContent = currentUser.walletBalance;
  alert('Added 100 Demo Coins! Current balance: ' + currentUser.walletBalance + ' coins');
}

// ----------------- TAB NAVIGATION -----------------

function switchTab(tabId) {
  currentTab = tabId;

  // Update tabs UI
  document.querySelectorAll('.tab-item').forEach(el => {
    el.classList.remove('active-tab');
    el.classList.add('text-slate-400');
  });
  document.getElementById(`tab-${tabId}`)?.classList.add('active-tab');
  document.getElementById(`tab-${tabId}`)?.classList.remove('text-slate-400');

  // Show selected content
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.getElementById(`view-${tabId}`)?.classList.remove('hidden');

  if (tabId === 'events') loadNearbyEvents();
  if (tabId === 'celebrity') loadCelebrityHub();
  if (tabId === 'support') loadSupportTickets();
  if (tabId === 'admin') loadAdminMetrics();
}

// ----------------- WEBSOCKET & REALTIME SIGNALING -----------------

function initWebSocket() {
  if (!currentUser) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws?userId=${currentUser.id}`;

  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('[WebSocket] Connected to FRND signaling server');
  };

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      handleSignalingMessage(payload);
    } catch (err) {
      console.error('[WebSocket] Error parsing message:', err);
    }
  };

  socket.onclose = () => {
    console.log('[WebSocket] Connection closed');
  };
}

function handleSignalingMessage(payload) {
  console.log('[Signaling Received]:', payload.type, payload);

  switch (payload.type) {
    case 'MATCH_FOUND':
      onMatchFound(payload);
      break;

    case 'PEER_DISCONNECTED':
      alert('Your call partner skipped to the next person.');
      setCallState('searching');
      break;

    case 'END_CALL':
      alert('Call ended.');
      setCallState('idle');
      break;

    case 'CALL_OFFER':
      // Simulated answer back for 2-way WebRTC handshake
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          type: 'CALL_ANSWER',
          sdp: { type: 'answer', sdp: 'v=0...' }
        }));
      }
      break;

    default:
      break;
  }
}

// ----------------- RANDOM AUDIO & VIDEO MATCHMAKING -----------------

function setMatchingMode(mode) {
  matchingMode = mode;

  const btnAudio = document.getElementById('mode-btn-audio');
  const btnVideo = document.getElementById('mode-btn-video');
  const mainIcon = document.getElementById('idle-main-icon');
  const idleTitle = document.getElementById('idle-title');
  const idleDesc = document.getElementById('idle-desc');
  const btnText = document.getElementById('connect-btn-text');
  const btnIcon = document.getElementById('connect-btn-icon');

  if (mode === 'VIDEO') {
    btnVideo.className = 'px-5 py-2 rounded-full text-xs font-bold transition flex items-center gap-2 bg-gradient-to-r from-pink-600 to-purple-600 text-white shadow-sm';
    btnAudio.className = 'px-5 py-2 rounded-full text-xs font-bold transition flex items-center gap-2 text-slate-400 hover:text-white';
    mainIcon.className = 'fa-solid fa-video text-pink-400';
    idleTitle.textContent = 'Live Random Video Chat';
    idleDesc.textContent = 'Connect 1-on-1 on live WebRTC video with online friends worldwide.';
    btnText.textContent = 'Connect Random Video Friend';
    btnIcon.className = 'fa-solid fa-video';
  } else {
    btnAudio.className = 'px-5 py-2 rounded-full text-xs font-bold transition flex items-center gap-2 bg-indigo-600 text-white shadow-sm';
    btnVideo.className = 'px-5 py-2 rounded-full text-xs font-bold transition flex items-center gap-2 text-slate-400 hover:text-white';
    mainIcon.className = 'fa-solid fa-microphone text-indigo-400';
    idleTitle.textContent = 'Find Someone New';
    idleDesc.textContent = 'Safe, instant anonymous audio matching with verified community members.';
    btnText.textContent = 'Connect Random Friend';
    btnIcon.className = 'fa-solid fa-phone-volume';
  }
}

function setCallState(state, hasVideo = false) {
  currentCallHasVideo = hasVideo;
  document.getElementById('call-state-idle').classList.add('hidden');
  document.getElementById('call-state-searching').classList.add('hidden');
  document.getElementById('call-state-connected').classList.add('hidden');

  const videoViewport = document.getElementById('video-call-viewport');
  const audioViewport = document.getElementById('audio-call-viewport');
  const btnCamera = document.getElementById('btn-camera');

  if (state === 'idle') {
    document.getElementById('call-state-idle').classList.remove('hidden');
    stopCallTimer();
    stopLocalCamera();
  } else if (state === 'searching') {
    document.getElementById('call-state-searching').classList.remove('hidden');
    stopCallTimer();
  } else if (state === 'connected') {
    document.getElementById('call-state-connected').classList.remove('hidden');
    
    if (hasVideo) {
      videoViewport.classList.remove('hidden');
      audioViewport.classList.add('hidden');
      btnCamera.classList.remove('hidden');
      startLocalCamera();
    } else {
      videoViewport.classList.add('hidden');
      audioViewport.classList.remove('hidden');
      btnCamera.classList.add('hidden');
      stopLocalCamera();
    }
    startCallTimer();
  }
}

async function startLocalCamera() {
  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      localMediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      const localVideo = document.getElementById('local-video');
      if (localVideo) {
        localVideo.srcObject = localMediaStream;
      }
    }
  } catch (err) {
    console.log('[Camera] Using simulated camera stream or preview:', err.message);
  }
}

function stopLocalCamera() {
  if (localMediaStream) {
    localMediaStream.getTracks().forEach(t => t.stop());
    localMediaStream = null;
  }
}

function toggleCamera() {
  isCameraOff = !isCameraOff;
  const overlay = document.getElementById('local-camera-off-overlay');
  const btn = document.getElementById('btn-camera');

  if (localMediaStream) {
    localMediaStream.getVideoTracks().forEach(track => {
      track.enabled = !isCameraOff;
    });
  }

  if (isCameraOff) {
    overlay.classList.remove('hidden');
    btn.innerHTML = '<i class="fa-solid fa-video-slash text-rose-500"></i>';
    btn.classList.add('bg-rose-950/40', 'border-rose-500/50');
  } else {
    overlay.classList.add('hidden');
    btn.innerHTML = '<i class="fa-solid fa-video"></i>';
    btn.classList.remove('bg-rose-950/40', 'border-rose-500/50');
  }
}

function startRandomMatching() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    initWebSocket();
  }

  setCallState('searching');

  // Send JOIN_RANDOM_QUEUE signal with callType preference
  socket.send(JSON.stringify({
    type: 'JOIN_RANDOM_QUEUE',
    userId: currentUser.id,
    metadata: {
      callType: matchingMode,
      audioOnly: matchingMode === 'AUDIO'
    }
  }));

  // Demo fallback: If no second user is online in sandbox after 3.5 seconds, match with peer
  setTimeout(() => {
    const searching = !document.getElementById('call-state-searching').classList.contains('hidden');
    if (searching) {
      onMatchFound({
        roomId: 'room_demo_match_' + Date.now(),
        targetUserId: 'usr_partner_demo',
        metadata: {
          isInitiator: true,
          callType: matchingMode === 'VIDEO' ? 'RANDOM_VIDEO' : 'RANDOM_AUDIO',
          hasVideo: matchingMode === 'VIDEO'
        }
      });
    }
  }, 3500);
}

function cancelMatching() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'LEAVE_RANDOM_QUEUE',
      userId: currentUser.id
    }));
  }
  setCallState('idle');
}

function onMatchFound(payload) {
  currentCallPartner = payload.targetUserId;
  const hasVideo = payload.metadata?.hasVideo === true || payload.metadata?.callType === 'RANDOM_VIDEO';
  
  // Random peer avatar & name
  const names = ['Kavya S.', 'Arjun Menon', 'Sneha V.', 'Fahad K.', 'Deepak Raj'];
  const avatars = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400'
  ];

  const matchedName = names[Math.floor(Math.random() * names.length)];
  const matchedAvatar = avatars[Math.floor(Math.random() * avatars.length)];

  document.getElementById('peer-name').textContent = matchedName;
  document.getElementById('peer-avatar').src = matchedAvatar;
  document.getElementById('remote-peer-video-name').textContent = matchedName;
  document.getElementById('remote-peer-video-avatar').src = matchedAvatar;

  // Video fallback element setup
  const remoteVideo = document.getElementById('remote-video');
  const fallback = document.getElementById('remote-video-fallback');
  if (hasVideo) {
    // Show live peer video preview
    fallback.classList.remove('hidden');
    remoteVideo.classList.add('hidden');
  }

  setCallState('connected', hasVideo);
}

function skipToNextPerson() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'NEXT_PERSON',
      userId: currentUser.id,
      metadata: { callType: matchingMode }
    }));
  }
  setCallState('searching');

  // Trigger next match simulation
  setTimeout(() => {
    const searching = !document.getElementById('call-state-searching').classList.contains('hidden');
    if (searching) {
      onMatchFound({
        roomId: 'room_demo_next_' + Date.now(),
        targetUserId: 'usr_partner_next',
        metadata: {
          isInitiator: true,
          callType: matchingMode === 'VIDEO' ? 'RANDOM_VIDEO' : 'RANDOM_AUDIO',
          hasVideo: matchingMode === 'VIDEO'
        }
      });
    }
  }, 2500);
}

function endCurrentCall() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'END_CALL',
      userId: currentUser.id
    }));
  }
  setCallState('idle');
}

function toggleMute() {
  isMuted = !isMuted;
  const btn = document.getElementById('btn-mute');

  if (localMediaStream) {
    localMediaStream.getAudioTracks().forEach(track => {
      track.enabled = !isMuted;
    });
  }

  if (isMuted) {
    btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-rose-500"></i>';
    btn.classList.add('bg-rose-950/40', 'border-rose-500/50');
  } else {
    btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    btn.classList.remove('bg-rose-950/40', 'border-rose-500/50');
  }
}

function startCallTimer() {
  callDuration = 0;
  clearInterval(callTimerInterval);
  callTimerInterval = setInterval(() => {
    callDuration++;
    const mins = String(Math.floor(callDuration / 60)).padStart(2, '0');
    const secs = String(callDuration % 60).padStart(2, '0');
    document.getElementById('call-timer').textContent = `${mins}:${secs}`;
    const videoTimer = document.getElementById('video-call-timer');
    if (videoTimer) videoTimer.textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopCallTimer() {
  clearInterval(callTimerInterval);
  document.getElementById('call-timer').textContent = '00:00';
  const videoTimer = document.getElementById('video-call-timer');
  if (videoTimer) videoTimer.textContent = '00:00';
}

// ----------------- NEARBY EVENTS & TICKETING -----------------

async function loadNearbyEvents() {
  try {
    const userLat = currentUser?.latitude || 9.9312;
    const userLon = currentUser?.longitude || 76.2673;
    const url = `/api/events?lat=${userLat}&lon=${userLon}${activeDistanceFilter ? `&radius=${activeDistanceFilter}` : ''}`;
    
    const res = await fetch(url);
    const data = await res.json();
    if (data.success) {
      renderEvents(data.events);
    }
  } catch (err) {
    console.error('Error loading events:', err);
  }
}

function filterEventsDistance(radiusKm) {
  activeDistanceFilter = radiusKm;
  document.getElementById('dist-10').className = radiusKm === 10 ? 'px-2.5 py-1 rounded-md bg-indigo-600 text-white font-medium' : 'px-2.5 py-1 rounded-md text-slate-400 hover:text-white';
  document.getElementById('dist-50').className = radiusKm === 50 ? 'px-2.5 py-1 rounded-md bg-indigo-600 text-white font-medium' : 'px-2.5 py-1 rounded-md text-slate-400 hover:text-white';
  document.getElementById('dist-all').className = radiusKm === 0 ? 'px-2.5 py-1 rounded-md bg-indigo-600 text-white font-medium' : 'px-2.5 py-1 rounded-md text-slate-400 hover:text-white';
  loadNearbyEvents();
}

function renderEvents(events) {
  const container = document.getElementById('events-grid');
  if (!events || events.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-12 text-center text-slate-400">
        <i class="fa-regular fa-calendar-xmark text-4xl mb-3 text-slate-500"></i>
        <p class="text-sm">No events found within ${activeDistanceFilter}km of your location.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = events.map(evt => `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition flex flex-col shadow-lg">
      <div class="relative h-44 overflow-hidden">
        <img src="${evt.bannerUrl}" class="w-full h-full object-cover">
        <div class="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-semibold text-amber-300 border border-amber-500/30 flex items-center gap-1">
          <i class="fa-solid fa-location-dot"></i>
          <span>${evt.distanceKm !== undefined ? `${evt.distanceKm} km away` : evt.city}</span>
        </div>
        <div class="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] font-semibold text-indigo-300 border border-indigo-500/30">
          ${evt.category}
        </div>
      </div>

      <div class="p-5 flex-1 flex flex-col justify-between">
        <div>
          <h3 class="text-base font-bold text-white mb-1.5 leading-snug">${evt.title}</h3>
          <p class="text-xs text-slate-400 mb-3 line-clamp-2">${evt.description}</p>
          
          <div class="space-y-1.5 text-xs text-slate-300 mb-4">
            <div class="flex items-center gap-2">
              <i class="fa-regular fa-clock text-indigo-400 w-4"></i>
              <span>${new Date(evt.startTime).toLocaleDateString()} at ${new Date(evt.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div class="flex items-center gap-2">
              <i class="fa-solid fa-building text-slate-400 w-4"></i>
              <span class="truncate">${evt.venueName}, ${evt.city}</span>
            </div>
          </div>
        </div>

        <div class="pt-4 border-t border-slate-800/80 flex items-center justify-between">
          <div>
            <span class="text-[10px] text-slate-500 uppercase font-semibold">Starting from</span>
            <p class="text-base font-extrabold text-amber-400">₹${evt.ticketTiers[0]?.price || 0}</p>
          </div>
          <button onclick="openBookingModal('${evt.id}')" class="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:opacity-90 text-slate-950 font-bold text-xs shadow-md transition flex items-center gap-1.5">
            <i class="fa-solid fa-ticket"></i>
            <span>Book Ticket</span>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function openBookingModal(eventId) {
  fetch(`/api/events`)
    .then(r => r.json())
    .then(data => {
      const event = data.events.find(e => e.id === eventId);
      if (!event) return;

      selectedEventForBooking = event;
      selectedTicketTier = event.ticketTiers[0];
      bookingQty = 1;

      document.getElementById('booking-event-title').textContent = event.title;
      document.getElementById('booking-event-venue').textContent = `${event.venueName}, ${event.city}`;
      document.getElementById('booking-qty').textContent = bookingQty;

      renderTiersList();
      updateBookingTotal();

      document.getElementById('ticket-booking-form').classList.remove('hidden');
      document.getElementById('ticket-qr-result').classList.add('hidden');
      document.getElementById('modal-ticket').classList.remove('hidden');
    });
}

function renderTiersList() {
  const container = document.getElementById('booking-tiers-list');
  container.innerHTML = selectedEventForBooking.ticketTiers.map(tier => `
    <div onclick="selectTier('${tier.id}')" class="p-3 rounded-xl border cursor-pointer transition flex items-center justify-between ${selectedTicketTier.id === tier.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'}">
      <div>
        <p class="text-xs font-bold text-slate-200">${tier.name}</p>
        <p class="text-[10px] text-slate-400">${tier.totalQuantity - tier.soldQuantity} seats remaining</p>
      </div>
      <span class="text-xs font-bold text-amber-400">₹${tier.price}</span>
    </div>
  `).join('');
}

function selectTier(tierId) {
  selectedTicketTier = selectedEventForBooking.ticketTiers.find(t => t.id === tierId);
  renderTiersList();
  updateBookingTotal();
}

function adjustTicketQty(delta) {
  bookingQty = Math.max(1, Math.min(10, bookingQty + delta));
  document.getElementById('booking-qty').textContent = bookingQty;
  updateBookingTotal();
}

function updateBookingTotal() {
  if (!selectedTicketTier) return;
  const total = selectedTicketTier.price * bookingQty;
  document.getElementById('booking-total-price').textContent = `₹${total}`;
}

async function confirmTicketBooking() {
  try {
    const res = await fetch('/api/events/book', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        eventId: selectedEventForBooking.id,
        tierId: selectedTicketTier.id,
        quantity: bookingQty
      })
    });

    const data = await res.json();
    if (data.success) {
      const booking = data.booking;
      document.getElementById('ticket-booking-form').classList.add('hidden');
      document.getElementById('ticket-qr-result').classList.remove('hidden');

      // Generate dynamic QR code image via standard public SVG QR generator API
      const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(booking.qrCodeHash)}`;
      document.getElementById('qr-image').src = qrApiUrl;
      document.getElementById('qr-hash-display').textContent = booking.qrCodeHash;
    } else {
      alert(data.error || 'Failed to book ticket');
    }
  } catch (err) {
    console.error('Booking failed:', err);
  }
}

// ----------------- CELEBRITY HUB & VIP CALLING -----------------

async function loadCelebrityHub() {
  try {
    // 1. Load Celebrities List
    const celebsRes = await fetch('/api/celebrities/list');
    const celebsData = await celebsRes.json();
    if (celebsData.success) {
      renderCelebritiesList(celebsData.celebrities);
    }

    // 2. Load Feed Posts
    const feedRes = await fetch('/api/celebrities/feed');
    const feedData = await feedRes.json();
    if (feedData.success) {
      renderCelebrityFeed(feedData.feed);
    }
  } catch (err) {
    console.error('Error loading celebrity hub:', err);
  }
}

function renderCelebritiesList(celebrities) {
  const container = document.getElementById('celebrities-list');
  container.innerHTML = celebrities.map(celeb => `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="relative">
          <img src="${celeb.avatarUrl}" class="w-12 h-12 rounded-full object-cover border border-pink-500/50">
          <span class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border border-slate-900 rounded-full"></span>
        </div>
        <div>
          <h4 class="text-xs font-bold text-white flex items-center gap-1">
            ${celeb.fullName}
            <i class="fa-solid fa-circle-check text-sky-400 text-[10px]"></i>
          </h4>
          <p class="text-[10px] text-slate-400">${celeb.celebrityDetails?.category || 'Artist'}</p>
          <span class="text-[10px] font-semibold text-amber-400">
            <i class="fa-solid fa-coins mr-0.5"></i>${celeb.celebrityDetails?.callRatePerMinute || 50} / min
          </span>
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <button onclick="promptVipCall('${celeb.id}', 'CELEBRITY_AUDIO')" class="w-8 h-8 rounded-lg bg-pink-600/20 text-pink-400 hover:bg-pink-600 hover:text-white flex items-center justify-center text-xs transition" title="VIP Audio Call">
          <i class="fa-solid fa-phone"></i>
        </button>
        <button onclick="promptVipCall('${celeb.id}', 'CELEBRITY_VIDEO')" class="w-8 h-8 rounded-lg bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white flex items-center justify-center text-xs transition" title="VIP Video Call">
          <i class="fa-solid fa-video"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function renderCelebrityFeed(posts) {
  const container = document.getElementById('celebrity-feed');
  container.innerHTML = posts.map(post => `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
      <!-- Author Header -->
      <div class="p-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <img src="${post.celebrityAvatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'}" class="w-10 h-10 rounded-full object-cover border border-pink-500/50">
          <div>
            <h4 class="text-xs font-bold text-white flex items-center gap-1">
              ${post.celebrityName}
              <i class="fa-solid fa-circle-check text-sky-400 text-[10px]"></i>
            </h4>
            <span class="text-[10px] text-slate-400">${new Date(post.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <button onclick="promptVipCall('${post.celebrityId}', 'CELEBRITY_AUDIO')" class="px-3 py-1 rounded-full bg-pink-500/20 text-pink-300 hover:bg-pink-500 hover:text-white text-xs font-semibold transition flex items-center gap-1">
          <i class="fa-solid fa-phone text-[10px]"></i>
          <span>VIP Call</span>
        </button>
      </div>

      <!-- Media Content (Image or Video) -->
      ${post.mediaType === 'VIDEO' ? `
        <div class="bg-black relative max-h-[420px] flex items-center justify-center">
          <video src="${post.mediaUrl}" controls class="w-full max-h-[420px] object-contain"></video>
        </div>
      ` : `
        <img src="${post.mediaUrl}" class="w-full max-h-[420px] object-cover">
      `}

      <!-- Caption & Like Bar -->
      <div class="p-4">
        <p class="text-xs text-slate-300 mb-3">${post.caption}</p>
        <div class="flex items-center gap-4 text-xs text-slate-400">
          <button onclick="likePost('${post.id}')" class="flex items-center gap-1.5 text-rose-400 hover:scale-110 transition">
            <i class="fa-solid fa-heart"></i>
            <span id="likes-${post.id}">${post.likesCount}</span>
          </button>
          <span class="flex items-center gap-1">
            <i class="fa-regular fa-comment"></i>
            <span>Comments</span>
          </span>
          <span class="flex items-center gap-1">
            <i class="fa-solid fa-share-nodes"></i>
            <span>Share</span>
          </span>
        </div>
      </div>
    </div>
  `).join('');
}

async function likePost(postId) {
  try {
    const res = await fetch(`/api/celebrities/like/${postId}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      document.getElementById(`likes-${postId}`).textContent = data.likes;
    }
  } catch (err) {
    console.error('Error liking post:', err);
  }
}

async function promptVipCall(celebId, callType) {
  try {
    const res = await fetch('/api/celebrities/authorize-call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ celebrityId: celebId, callType })
    });

    const data = await res.json();
    if (!data.authorized) {
      alert(data.reason || 'Not eligible for VIP call');
      return;
    }

    selectedCelebrityForCall = { celebId, callType, rate: data.ratePerMinute, celeb: data.celebrity };
    document.getElementById('vip-celeb-name').textContent = data.celebrity.fullName;
    document.getElementById('vip-celeb-avatar').src = data.celebrity.avatarUrl;
    document.getElementById('vip-celeb-rate').textContent = `${data.ratePerMinute} coins / min`;
    document.getElementById('vip-call-type-badge').textContent = callType === 'CELEBRITY_VIDEO' ? 'VIP Video Call' : 'VIP Audio Call';
    document.getElementById('vip-user-coins').textContent = `${currentUser.walletBalance} coins`;

    document.getElementById('modal-vip-call').classList.remove('hidden');
  } catch (err) {
    console.error('VIP Call Auth error:', err);
  }
}

function startVipCallSession() {
  closeModal('modal-vip-call');
  switchTab('matchmaking');
  
  const hasVideo = selectedCelebrityForCall.callType === 'CELEBRITY_VIDEO';

  // Set peer name and avatar for celebrity
  const celebName = selectedCelebrityForCall.celeb.fullName + ' (VIP)';
  const celebAvatar = selectedCelebrityForCall.celeb.avatarUrl;

  document.getElementById('peer-name').textContent = celebName;
  document.getElementById('peer-avatar').src = celebAvatar;
  document.getElementById('remote-peer-video-name').textContent = celebName;
  document.getElementById('remote-peer-video-avatar').src = celebAvatar;

  setCallState('connected', hasVideo);
  alert(`Connecting 1-on-1 VIP WebRTC ${hasVideo ? 'Video' : 'Audio'} Call with ${selectedCelebrityForCall.celeb.fullName}!`);
}

// ----------------- CUSTOMER CARE SUPPORT DESK -----------------

let activeSupportTicket = null;

async function loadSupportTickets() {
  try {
    const res = await fetch('/api/support/tickets', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success && data.tickets.length > 0) {
      activeSupportTicket = data.tickets[0];
      renderSupportMessages(activeSupportTicket.messages);
      document.getElementById('support-ticket-status').textContent = `TICKET: ${activeSupportTicket.status}`;
    }
  } catch (err) {
    console.error('Error loading support tickets:', err);
  }
}

function renderSupportMessages(messages) {
  const container = document.getElementById('support-messages-container');
  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div class="text-center text-slate-500 py-12 text-xs">
        No previous messages. Type below to chat with a support executive.
      </div>
    `;
    return;
  }

  container.innerHTML = messages.map(msg => {
    const isMe = msg.senderId === currentUser.id;
    return `
      <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
        <div class="max-w-md rounded-2xl px-4 py-2.5 text-xs shadow-md ${isMe ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700/60'}">
          <p class="font-semibold text-[10px] mb-0.5 ${isMe ? 'text-indigo-200' : 'text-emerald-400'}">
            ${isMe ? 'You' : `Support Executive (${msg.senderRole})`}
          </p>
          <p>${msg.content}</p>
        </div>
        <span class="text-[9px] text-slate-500 mt-1 px-1">${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

async function sendSupportMessage() {
  const input = document.getElementById('support-message-input');
  const text = input.value.trim();
  if (!text || !activeSupportTicket) return;

  try {
    const res = await fetch('/api/support/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        ticketId: activeSupportTicket.id,
        content: text
      })
    });

    const data = await res.json();
    if (data.success) {
      input.value = '';
      activeSupportTicket.messages.push(data.message);
      renderSupportMessages(activeSupportTicket.messages);

      // Automated support agent reply simulation after 1.5 seconds if sent by normal/org/celeb user
      if (currentUser.role !== 'SUPPORT') {
        setTimeout(async () => {
          activeSupportTicket.messages.push({
            id: 'auto_reply_' + Date.now(),
            ticketId: activeSupportTicket.id,
            senderId: 'usr_support_1',
            senderRole: 'SUPPORT',
            content: `Thank you for reaching out to FRND Helpdesk! We have received your query regarding "${text.slice(0, 30)}..." and an executive will assist you.`,
            timestamp: new Date().toISOString()
          });
          renderSupportMessages(activeSupportTicket.messages);
        }, 1500);
      }
    }
  } catch (err) {
    console.error('Error sending support message:', err);
  }
}

function startSupportVoipCall() {
  switchTab('matchmaking');
  document.getElementById('peer-name').textContent = 'FRND Customer Care (VoIP)';
  document.getElementById('peer-avatar').src = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150';
  setCallState('connected');
  alert('Connected to FRND Helpdesk via in-app VoIP Audio Call!');
}

// ----------------- SUPER ADMIN OPERATIONS -----------------

async function loadAdminMetrics() {
  try {
    const res = await fetch('/api/admin/metrics', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success) {
      renderAdminMetrics(data.metrics);
      renderAdminUsersTable();
    }
  } catch (err) {
    console.error('Admin metrics error:', err);
  }
}

function renderAdminMetrics(m) {
  const container = document.getElementById('admin-metrics-grid');
  container.innerHTML = `
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <span class="text-[11px] text-slate-400 uppercase font-semibold">Total Users</span>
      <p class="text-2xl font-bold text-white mt-1">${m.totalUsers}</p>
      <span class="text-[10px] text-indigo-400 font-medium">Community Members</span>
    </div>
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <span class="text-[11px] text-slate-400 uppercase font-semibold">Live Events</span>
      <p class="text-2xl font-bold text-amber-400 mt-1">${m.totalEvents}</p>
      <span class="text-[10px] text-slate-400">${m.totalBookings} tickets sold</span>
    </div>
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <span class="text-[11px] text-slate-400 uppercase font-semibold">Celebrities</span>
      <p class="text-2xl font-bold text-pink-400 mt-1">${m.totalCelebrities}</p>
      <span class="text-[10px] text-slate-400">Verified Artists</span>
    </div>
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-4">
      <span class="text-[11px] text-slate-400 uppercase font-semibold">Gross Revenue</span>
      <p class="text-2xl font-bold text-emerald-400 mt-1">₹${m.totalRevenueInRupees.toLocaleString()}</p>
      <span class="text-[10px] text-slate-400">Tickets & VIP Calls</span>
    </div>
  `;
}

function renderAdminUsersTable() {
  const container = document.getElementById('admin-users-table');
  container.innerHTML = allUsers.map(u => `
    <tr class="hover:bg-slate-800/40 transition">
      <td class="px-4 py-3 flex items-center gap-2.5">
        <img src="${u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}" class="w-7 h-7 rounded-full object-cover">
        <div>
          <p class="font-bold text-white text-xs">${u.fullName}</p>
          <span class="text-[10px] text-slate-400 font-mono">${u.id}</span>
        </div>
      </td>
      <td class="px-4 py-3 font-mono text-[11px]">${u.phoneNumber}</td>
      <td class="px-4 py-3">
        <span class="px-2 py-0.5 rounded text-[10px] font-semibold ${
          u.role === 'SUPER_ADMIN' ? 'bg-purple-500/20 text-purple-300' :
          u.role === 'CELEBRITY' ? 'bg-pink-500/20 text-pink-300' :
          u.role === 'ORGANIZATION' ? 'bg-amber-500/20 text-amber-300' :
          u.role === 'SUPPORT' ? 'bg-emerald-500/20 text-emerald-300' :
          'bg-indigo-500/20 text-indigo-300'
        }">${u.role}</span>
      </td>
      <td class="px-4 py-3">
        ${u.isBanned ? '<span class="text-rose-400 font-bold text-[11px]"><i class="fa-solid fa-ban mr-1"></i>Banned</span>' : '<span class="text-emerald-400 font-bold text-[11px]"><i class="fa-solid fa-check mr-1"></i>Active</span>'}
      </td>
      <td class="px-4 py-3 text-right">
        ${u.role !== 'SUPER_ADMIN' ? `
          <button onclick="toggleBanUser('${u.id}', ${!u.isBanned})" class="px-2.5 py-1 rounded text-[11px] font-semibold border ${u.isBanned ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-300' : 'border-rose-500/40 bg-rose-950/40 text-rose-300'} hover:opacity-80 transition">
            ${u.isBanned ? 'Unban' : 'Ban'}
          </button>
        ` : '<span class="text-slate-500 text-[10px]">Root</span>'}
      </td>
    </tr>
  `).join('');
}

async function toggleBanUser(targetUserId, ban) {
  try {
    const res = await fetch('/api/admin/ban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ targetUserId, ban })
    });
    const data = await res.json();
    if (data.success) {
      await fetchAllUsers();
      renderAdminUsersTable();
      alert(`User status updated to: ${ban ? 'BANNED' : 'ACTIVE'}`);
    }
  } catch (err) {
    console.error('Ban error:', err);
  }
}

// ----------------- MODAL HELPERS -----------------

function closeModal(modalId) {
  document.getElementById(modalId)?.classList.add('hidden');
}

function openCreateEventModal() {
  const title = prompt('Enter Event Title:');
  if (!title) return;
  const venue = prompt('Enter Venue Name & City:');
  const price = parseInt(prompt('Enter General Ticket Price (₹):') || '499', 10);

  fetch('/api/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentToken}`
    },
    body: JSON.stringify({
      title,
      description: 'Exciting live event organized by ' + currentUser.fullName,
      category: 'Live Concert',
      venueName: venue || 'Marine Drive Grounds',
      address: 'Kochi, Kerala',
      city: 'Kochi',
      latitude: 9.9723,
      longitude: 76.2783,
      startTime: new Date(Date.now() + 86400000 * 7).toISOString(),
      endTime: new Date(Date.now() + 86400000 * 7 + 18000000).toISOString(),
      ticketTiers: [{ name: 'Standard Pass', price, totalQuantity: 500 }]
    })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      alert('Event published successfully!');
      loadNearbyEvents();
    }
  });
}

function openCreatePostModal() {
  const caption = prompt('Enter Caption for your new post:');
  if (!caption) return;
  const mediaUrl = prompt('Enter Image URL (or press Enter for default):') || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800';

  fetch('/api/celebrities/posts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${currentToken}`
    },
    body: JSON.stringify({
      mediaType: 'IMAGE',
      mediaUrl,
      caption
    })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      alert('Post shared with followers!');
      loadCelebrityHub();
    }
  });
}
