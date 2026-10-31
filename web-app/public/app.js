// Friends Connect (FC) Client Logic
let currentUser = null;
let currentToken = null;
let allUsers = [];
let socket = null;
let activeNormalTab = 'connect';

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
let activeDistanceFilter = 50;

// Customer Care Dedicated VoIP State
let supportCallInterval = null;
let supportCallDuration = 0;
let isSupportCallMuted = false;

// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
  await fetchAllUsers();

  // Check saved session in localStorage
  const savedSession = localStorage.getItem('fc_session');
  if (savedSession) {
    try {
      const parsed = JSON.parse(savedSession);
      currentUser = parsed.user;
      currentToken = parsed.token;
      showDashboard();
      return;
    } catch {
      localStorage.removeItem('fc_session');
    }
  }

  // Show login screen by default
  showAuthScreen();
});

// ----------------- SIMPLE LOGIN & DROPDOWN WORKFLOW -----------------

function onAccountDropdownChange() {
  const select = document.getElementById('select-account-role');
  const userId = select.value;

  const phoneMap = {
    'usr_normal_1': '+919876543210',
    'usr_celeb_1': '+919876543212',
    'usr_org_1': '+919876543211',
    'usr_support_1': '+919876543213',
    'usr_admin_1': '+919876543214'
  };

  document.getElementById('input-phone').value = phoneMap[userId] || '+919876543210';
  document.getElementById('input-otp').value = '123456';
}

async function handleSimpleLogin() {
  const select = document.getElementById('select-account-role');
  const userId = select.value;
  const phone = document.getElementById('input-phone').value.trim();
  const otp = document.getElementById('input-otp').value.trim();

  const user = allUsers.find(u => u.id === userId);
  const role = user ? user.role : 'NORMAL';
  const fullName = user ? user.fullName : 'User';

  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phoneNumber: phone,
        otp,
        role,
        fullName
      })
    });

    const data = await res.json();
    if (data.success) {
      currentUser = data.session.user;
      currentToken = data.session.token;
      localStorage.setItem('fc_session', JSON.stringify({ user: currentUser, token: currentToken }));
      showDashboard();
    } else {
      alert(data.error || 'Invalid OTP. Please enter 123456.');
    }
  } catch (err) {
    console.error('Login error:', err);
    alert('Login error. Please check server.');
  }
}

function handleLogout() {
  if (confirm('Are you sure you want to log out?')) {
    localStorage.removeItem('fc_session');
    currentUser = null;
    currentToken = null;
    if (socket) {
      socket.close();
      socket = null;
    }
    stopCallTimer();
    stopLocalCamera();
    clearInterval(supportCallInterval);
    document.getElementById('support-voip-call-card')?.classList.add('hidden');
    document.getElementById('btn-start-support-voip')?.classList.remove('opacity-50', 'pointer-events-none');
    showAuthScreen();
  }
}

function showAuthScreen() {
  document.getElementById('auth-view').classList.remove('hidden');
  document.getElementById('dashboard-view').classList.add('hidden');
  onAccountDropdownChange();
}

// ----------------- STRICT ROLE-SEGREGATED DASHBOARD -----------------

function showDashboard() {
  if (!currentUser) return;

  document.getElementById('auth-view').classList.add('hidden');
  document.getElementById('dashboard-view').classList.remove('hidden');

  // Update Top Bar Profile Info
  document.getElementById('user-display-name').textContent = currentUser.fullName;
  document.getElementById('user-role-badge').textContent = currentUser.role;
  document.getElementById('user-avatar').src = currentUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150';
  document.getElementById('header-role-title').textContent = `${currentUser.fullName} (${currentUser.role})`;

  // Hide all role dashboards first
  ['normal', 'celebrity', 'organization', 'support', 'admin'].forEach(r => {
    document.getElementById(`dashboard-${r}`).classList.add('hidden');
  });

  // Role-specific Header area elements
  const normalPremiumArea = document.getElementById('normal-user-premium-area');
  const celebEarningsArea = document.getElementById('celebrity-earnings-area');
  normalPremiumArea.classList.add('hidden');
  celebEarningsArea.classList.add('hidden');

  const navContainer = document.getElementById('authorized-nav-tabs');
  navContainer.innerHTML = '';

  initWebSocket();

  // 1. NORMAL USER
  if (currentUser.role === 'NORMAL') {
    document.getElementById('dashboard-normal').classList.remove('hidden');
    normalPremiumArea.classList.remove('hidden');
    updateNormalPremiumUI();

    // Normal Tabs
    navContainer.innerHTML = `
      <button onclick="switchNormalTab('connect')" id="norm-tab-connect" class="norm-tab px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white flex items-center gap-1.5">
        <i class="fa-solid fa-shuffle"></i><span>Random Audio/Video</span>
      </button>
      <button onclick="switchNormalTab('events')" id="norm-tab-events" class="norm-tab px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5">
        <i class="fa-solid fa-calendar-days text-amber-400"></i><span>Nearby Events</span>
      </button>
      <button onclick="switchNormalTab('celebrity')" id="norm-tab-celebrity" class="norm-tab px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5">
        <i class="fa-solid fa-star text-pink-400"></i><span>Celebrity Hub</span>
      </button>
      <button onclick="switchNormalTab('support')" id="norm-tab-support" class="norm-tab px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5">
        <i class="fa-solid fa-comments text-emerald-400"></i><span>Customer Care</span>
      </button>
    `;

    loadNearbyEvents();
    loadCelebrityHub();
    loadSupportTickets();
    switchNormalTab('connect');
  }

  // 2. CELEBRITY
  else if (currentUser.role === 'CELEBRITY') {
    document.getElementById('dashboard-celebrity').classList.remove('hidden');
    celebEarningsArea.classList.remove('hidden');

    navContainer.innerHTML = `
      <span class="px-3 py-1.5 rounded-lg text-xs font-bold text-pink-400 bg-pink-950/40 border border-pink-500/30 flex items-center gap-1.5">
        <i class="fa-solid fa-crown"></i><span>Celebrity Console</span>
      </span>
      <span class="text-xs text-slate-400 flex items-center gap-1 py-1.5">
        <i class="fa-solid fa-info-circle text-blue-400"></i>
        <span>Incoming fan call reception & media updates only (No matchmaking or coin buying needed)</span>
      </span>
    `;

    loadCelebrityOwnFeed();
    updateCelebrityCallUI();
  }

  // 3. ORGANIZATION
  else if (currentUser.role === 'ORGANIZATION') {
    document.getElementById('dashboard-organization').classList.remove('hidden');

    navContainer.innerHTML = `
      <span class="px-3 py-1.5 rounded-lg text-xs font-bold text-amber-400 bg-amber-950/40 border border-amber-500/30 flex items-center gap-1.5">
        <i class="fa-solid fa-building"></i><span>Event Organizer Console</span>
      </span>
      <span class="text-xs text-slate-400 flex items-center gap-1 py-1.5">
        <i class="fa-solid fa-ticket text-amber-400"></i>
        <span>Publish events & scan gate QR codes</span>
      </span>
    `;

    loadOrganizationEvents();
  }

  // 4. SUPPORT EXECUTIVE
  else if (currentUser.role === 'SUPPORT') {
    document.getElementById('dashboard-support').classList.remove('hidden');

    navContainer.innerHTML = `
      <span class="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-1.5">
        <i class="fa-solid fa-headset"></i><span>Helpdesk Executive</span>
      </span>
      <span class="text-xs text-slate-400 flex items-center gap-1 py-1.5">
        <span>Active Live Queries Stream</span>
      </span>
    `;

    loadSupportExecutiveDesk();
  }

  // 5. SUPER ADMIN
  else if (currentUser.role === 'SUPER_ADMIN') {
    document.getElementById('dashboard-admin').classList.remove('hidden');

    navContainer.innerHTML = `
      <span class="px-3 py-1.5 rounded-lg text-xs font-bold text-purple-400 bg-purple-950/40 border border-purple-500/30 flex items-center gap-1.5">
        <i class="fa-solid fa-shield-halved"></i><span>Platform Control</span>
      </span>
      <span class="text-xs text-slate-400 flex items-center gap-1 py-1.5">
        <span>Root System Moderation & Analytics</span>
      </span>
    `;

    loadAdminMetrics();
  }
}

// ----------------- NORMAL USER LOGIC -----------------

function switchNormalTab(tabId) {
  activeNormalTab = tabId;

  document.querySelectorAll('.norm-tab').forEach(btn => {
    btn.className = 'norm-tab px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5';
  });
  document.getElementById(`norm-tab-${tabId}`)?.classList.remove('text-slate-400');
  document.getElementById(`norm-tab-${tabId}`)?.classList.add('bg-blue-600', 'text-white');

  document.querySelectorAll('.normal-section').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(`normal-tab-${tabId}`)?.classList.remove('hidden');

  if (tabId === 'events') loadNearbyEvents();
  if (tabId === 'celebrity') renderCelebrityCallControls();
}

function updateNormalPremiumUI() {
  const btnUpgrade = document.getElementById('btn-upgrade-premium');
  const badgeActive = document.getElementById('badge-premium-active');

  if (currentUser.isPremium) {
    btnUpgrade.classList.add('hidden');
    badgeActive.classList.remove('hidden');
  } else {
    btnUpgrade.classList.remove('hidden');
    badgeActive.classList.add('hidden');
  }

  renderCelebrityCallControls();
}

async function unlockPremiumSubscription() {
  try {
    const res = await fetch('/api/auth/upgrade-premium', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success) {
      currentUser.isPremium = true;
      localStorage.setItem('fc_session', JSON.stringify({ user: currentUser, token: currentToken }));
      updateNormalPremiumUI();
      alert('🎉 Congratulations! Premium VIP Subscription activated! You can now call Dulquer Sithara directly on VIP Audio & Video call.');
    }
  } catch (err) {
    console.error('Upgrade error:', err);
  }
}

function renderCelebrityCallControls() {
  const container = document.getElementById('normal-celeb-call-controls');
  if (!container) return;

  if (!currentUser.isPremium) {
    container.innerHTML = `
      <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-left">
        <p class="text-xs font-bold text-amber-400 mb-1 flex items-center gap-1">
          <i class="fa-solid fa-lock"></i>
          <span>VIP Calling Locked (പ്രീമിയം ലോക്ക്ഡ്)</span>
        </p>
        <p class="text-[11px] text-slate-300 leading-snug mb-3">
          സെലിബ്രിറ്റികളെ നേരിട്ട് ഓഡിയോ/വീഡിയോ കോളിൽ വിളിക്കാൻ പ്രീമിയം സബ്‌സ്‌ക്രിപ്ഷൻ ആവശ്യമാണ്.
        </p>
        <button onclick="unlockPremiumSubscription()" class="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow transition">
          Unlock VIP Calls (₹199 / Month)
        </button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 text-left mb-2">
        <p class="text-xs font-bold text-emerald-400 flex items-center gap-1">
          <i class="fa-solid fa-crown"></i>
          <span>VIP Direct Access Unlocked!</span>
        </p>
        <p class="text-[10px] text-slate-300">You have full access to connect with Dulquer Sithara.</p>
      </div>
      <div class="flex gap-2">
        <button onclick="startNormalToCelebCall('usr_celeb_1', 'CELEBRITY_AUDIO')" class="flex-1 py-2.5 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs shadow flex items-center justify-center gap-1.5 transition">
          <i class="fa-solid fa-phone"></i>
          <span>VIP Audio</span>
        </button>
        <button onclick="startNormalToCelebCall('usr_celeb_1', 'CELEBRITY_VIDEO')" class="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow flex items-center justify-center gap-1.5 transition">
          <i class="fa-solid fa-video"></i>
          <span>VIP Video</span>
        </button>
      </div>
    `;
  }
}

function startNormalToCelebCall(celebId, callType) {
  const isAvailable = localStorage.getItem('fc_celeb_available') !== 'false';
  if (!isAvailable) {
    alert('⚠️ Dulquer Sithara is currently Offline (Call receiving turned OFF). Please try again when the celebrity is Online!');
    return;
  }
  const hasVideo = callType === 'CELEBRITY_VIDEO';
  switchNormalTab('connect');

  document.getElementById('peer-name').textContent = 'Dulquer Sithara (VIP Artist)';
  document.getElementById('peer-avatar').src = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150';
  document.getElementById('remote-peer-video-name').textContent = 'Dulquer Sithara (VIP)';
  document.getElementById('remote-peer-video-avatar').src = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150';

  setCallState('connected', hasVideo);
  alert(`Connecting 1-on-1 VIP WebRTC ${hasVideo ? 'Video' : 'Audio'} Call with Dulquer Sithara!`);
}

// ----------------- RANDOM MATCHMAKING LOGIC -----------------

function setMatchingMode(mode) {
  matchingMode = mode;
  const btnAudio = document.getElementById('mode-btn-audio');
  const btnVideo = document.getElementById('mode-btn-video');
  const mainIcon = document.getElementById('idle-main-icon');
  const idleTitle = document.getElementById('idle-title');
  const btnText = document.getElementById('connect-btn-text');

  if (mode === 'VIDEO') {
    btnVideo.className = 'px-5 py-2 rounded-full text-xs font-bold bg-pink-600 text-white shadow';
    btnAudio.className = 'px-5 py-2 rounded-full text-xs font-bold text-slate-400 hover:text-white';
    mainIcon.className = 'fa-solid fa-video text-pink-400';
    idleTitle.textContent = 'Live Random Video Chat';
    btnText.textContent = 'Connect Random Video Friend';
  } else {
    btnAudio.className = 'px-5 py-2 rounded-full text-xs font-bold bg-blue-600 text-white shadow';
    btnVideo.className = 'px-5 py-2 rounded-full text-xs font-bold text-slate-400 hover:text-white';
    mainIcon.className = 'fa-solid fa-microphone text-blue-400';
    idleTitle.textContent = 'Find Someone New';
    btnText.textContent = 'Connect Random Friend';
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
      localMediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const localVideo = document.getElementById('local-video');
      if (localVideo) localVideo.srcObject = localMediaStream;
    }
  } catch (err) {
    console.log('[Camera] Using mock camera preview:', err.message);
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
    localMediaStream.getVideoTracks().forEach(track => { track.enabled = !isCameraOff; });
  }

  if (isCameraOff) {
    overlay.classList.remove('hidden');
    btn.innerHTML = '<i class="fa-solid fa-video-slash text-rose-500"></i>';
  } else {
    overlay.classList.add('hidden');
    btn.innerHTML = '<i class="fa-solid fa-video"></i>';
  }
}

function startRandomMatching() {
  if (!socket || socket.readyState !== WebSocket.OPEN) initWebSocket();
  setCallState('searching');

  socket.send(JSON.stringify({
    type: 'JOIN_RANDOM_QUEUE',
    userId: currentUser.id,
    metadata: { callType: matchingMode, audioOnly: matchingMode === 'AUDIO' }
  }));

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
    socket.send(JSON.stringify({ type: 'LEAVE_RANDOM_QUEUE', userId: currentUser.id }));
  }
  setCallState('idle');
}

function onMatchFound(payload) {
  currentCallPartner = payload.targetUserId;
  const hasVideo = payload.metadata?.hasVideo === true || payload.metadata?.callType === 'RANDOM_VIDEO';

  const names = ['Kavya S.', 'Midhun K.', 'Gokul S.', 'Reshma P.'];
  const avatars = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400'
  ];

  const matchedName = names[Math.floor(Math.random() * names.length)];
  const matchedAvatar = avatars[Math.floor(Math.random() * avatars.length)];

  document.getElementById('peer-name').textContent = matchedName;
  document.getElementById('peer-avatar').src = matchedAvatar;
  document.getElementById('remote-peer-video-name').textContent = matchedName;
  document.getElementById('remote-peer-video-avatar').src = matchedAvatar;

  const remoteVideo = document.getElementById('remote-video');
  const fallback = document.getElementById('remote-video-fallback');
  if (hasVideo) {
    fallback.classList.remove('hidden');
    remoteVideo.classList.add('hidden');
  }

  setCallState('connected', hasVideo);
}

function skipToNextPerson() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'NEXT_PERSON', userId: currentUser.id, metadata: { callType: matchingMode } }));
  }
  setCallState('searching');

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
    socket.send(JSON.stringify({ type: 'END_CALL', userId: currentUser.id }));
  }
  setCallState('idle');
}

function toggleMute() {
  isMuted = !isMuted;
  const btn = document.getElementById('btn-mute');
  if (localMediaStream) {
    localMediaStream.getAudioTracks().forEach(track => { track.enabled = !isMuted; });
  }
  if (isMuted) {
    btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-rose-500"></i>';
  } else {
    btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
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
  }, 1000);
}

function stopCallTimer() {
  clearInterval(callTimerInterval);
  document.getElementById('call-timer').textContent = '00:00';
}

// ----------------- CELEBRITY CONSOLE LOGIC -----------------

let celebAvailable = localStorage.getItem('fc_celeb_available') !== 'false';

function updateCelebrityCallUI() {
  const btn = document.getElementById('celeb-status-btn');
  const label = document.getElementById('celeb-status-label');
  const offlineBox = document.getElementById('celeb-offline-box');
  const waitingBox = document.getElementById('celeb-online-waiting-box');
  const incomingBox = document.getElementById('incoming-fan-call-box');
  const activeBox = document.getElementById('celeb-active-call-box');

  if (celebAvailable) {
    if (btn) btn.className = 'px-4 py-2 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs shadow flex items-center gap-1.5';
    if (label) label.textContent = 'Online (Accepting Calls)';
    if (offlineBox) offlineBox.classList.add('hidden');
    if (activeBox && !activeBox.classList.contains('hidden')) {
      // In active call, keep active call
    } else if (incomingBox && !incomingBox.classList.contains('hidden')) {
      // Incoming call ringing
    } else {
      if (waitingBox) waitingBox.classList.remove('hidden');
    }
  } else {
    if (btn) btn.className = 'px-4 py-2 rounded-full bg-slate-700 text-slate-300 font-bold text-xs shadow flex items-center gap-1.5';
    if (label) label.textContent = 'Offline (Busy)';
    if (offlineBox) offlineBox.classList.remove('hidden');
    if (waitingBox) waitingBox.classList.add('hidden');
    if (incomingBox) incomingBox.classList.add('hidden');
    if (activeBox) activeBox.classList.add('hidden');
  }
}

function toggleCelebrityAvailability() {
  celebAvailable = !celebAvailable;
  localStorage.setItem('fc_celeb_available', celebAvailable ? 'true' : 'false');
  updateCelebrityCallUI();
  if (celebAvailable) {
    alert('🟢 Status: ONLINE! You are now accepting incoming calls from VIP fans.');
  } else {
    alert('🔴 Status: OFFLINE! Incoming fan calls are now disabled.');
  }
}

function simulateIncomingFanCall() {
  if (!celebAvailable) {
    alert('⚠️ Call Receiving is currently OFF. Turn Call Receiving ON to accept fan calls!');
    return;
  }
  document.getElementById('celeb-online-waiting-box')?.classList.add('hidden');
  document.getElementById('incoming-fan-call-box')?.classList.remove('hidden');
}

function acceptIncomingFanCall() {
  document.getElementById('incoming-fan-call-box')?.classList.add('hidden');
  document.getElementById('celeb-active-call-box')?.classList.remove('hidden');
  alert('Connecting 1-on-1 VIP Video Call with fan Arjun Nair!');
}

function declineIncomingFanCall() {
  document.getElementById('incoming-fan-call-box')?.classList.add('hidden');
  alert('Fan call declined.');
  if (celebAvailable) {
    document.getElementById('celeb-online-waiting-box')?.classList.remove('hidden');
  } else {
    document.getElementById('celeb-offline-box')?.classList.remove('hidden');
  }
}

function endCelebrityCall() {
  document.getElementById('celeb-active-call-box')?.classList.add('hidden');
  if (celebAvailable) {
    document.getElementById('celeb-online-waiting-box')?.classList.remove('hidden');
  } else {
    document.getElementById('celeb-offline-box')?.classList.remove('hidden');
  }
  alert('Call completed.');
}

async function loadCelebrityOwnFeed() {
  try {
    const res = await fetch('/api/celebrities/feed');
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('celeb-own-feed');
      container.innerHTML = data.feed.map(post => `
        <div class="bg-[#111928] border border-slate-800 rounded-2xl overflow-hidden shadow">
          <div class="p-4 flex items-center justify-between">
            <span class="text-xs font-bold text-white">${post.celebrityName}</span>
            <span class="text-[10px] text-slate-400">${new Date(post.createdAt).toLocaleDateString()}</span>
          </div>
          <img src="${post.mediaUrl}" class="w-full max-h-80 object-cover">
          <div class="p-4">
            <p class="text-xs text-slate-300 mb-2">${post.caption}</p>
            <div class="text-xs text-pink-400 font-semibold flex items-center gap-1">
              <i class="fa-solid fa-heart"></i>
              <span>${post.likesCount} Fan Likes</span>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading celeb feed:', err);
  }
}

// ----------------- ORGANIZATION CONSOLE LOGIC -----------------

async function loadOrganizationEvents() {
  try {
    const res = await fetch('/api/events');
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('org-events-list');
      container.innerHTML = data.events.map(evt => `
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h4 class="text-xs font-bold text-white">${evt.title}</h4>
            <p class="text-[11px] text-slate-400">${evt.venueName}, ${evt.city}</p>
            <p class="text-[10px] text-amber-400 mt-1 font-semibold">General Pass: ₹${evt.ticketTiers[0]?.price} • ${evt.ticketTiers[0]?.soldQuantity} Sold</p>
          </div>
          <span class="text-xs px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 font-bold">Approved</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading org events:', err);
  }
}

async function handleScanTicket() {
  const hash = document.getElementById('input-scan-qr').value.trim();
  if (!hash) {
    alert('Please enter or scan a ticket QR code hash.');
    return;
  }

  try {
    const res = await fetch('/api/events/verify-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qrCodeHash: hash })
    });
    const data = await res.json();
    const box = document.getElementById('scan-result-box');
    box.classList.remove('hidden');

    if (data.success) {
      box.className = 'mt-4 p-3 rounded-xl border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 text-xs';
      box.innerHTML = `<strong>VALID ENTRY:</strong> ${data.message} <br>Attendee: <strong>${data.booking?.userName}</strong> (${data.booking?.quantity} Tickets)`;
    } else {
      box.className = 'mt-4 p-3 rounded-xl border border-rose-500/50 bg-rose-950/30 text-rose-300 text-xs';
      box.innerHTML = `<strong>INVALID / DUPLICATE:</strong> ${data.message}`;
    }
  } catch (err) {
    console.error('Ticket verification error:', err);
  }
}

// ----------------- SUPPORT EXECUTIVE LOGIC -----------------

let activeExecutiveTicketId = 'ticket_celeb_201';
let executiveAllTickets = [];

async function loadSupportExecutiveDesk() {
  try {
    const res = await fetch('/api/support/tickets', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success && data.tickets) {
      executiveAllTickets = data.tickets;
      if (!executiveAllTickets.some(t => t.id === activeExecutiveTicketId) && executiveAllTickets.length > 0) {
        activeExecutiveTicketId = executiveAllTickets[0].id;
      }

      // Render Ticket Selector Pills
      const selector = document.getElementById('support-ticket-selector');
      if (selector) {
        selector.innerHTML = executiveAllTickets.map(t => {
          const isSelected = t.id === activeExecutiveTicketId;
          const roleBadgeColor = t.userRole === 'CELEBRITY' ? 'text-pink-400' : t.userRole === 'ORGANIZATION' ? 'text-amber-400' : 'text-blue-400';
          return `
            <button onclick="selectExecutiveTicket('${t.id}')" class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${isSelected ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:text-white'}">
              <span>${t.userName}</span>
              <span class="text-[10px] font-bold ${isSelected ? 'text-emerald-200' : roleBadgeColor}">(${t.userRole})</span>
            </button>
          `;
        }).join('');
      }

      // Render Messages for Selected Ticket
      const activeTicket = executiveAllTickets.find(t => t.id === activeExecutiveTicketId) || executiveAllTickets[0];
      const container = document.getElementById('support-desk-messages');
      if (activeTicket && container) {
        if (!activeTicket.messages || activeTicket.messages.length === 0) {
          container.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">No messages in ticket for ${activeTicket.userName}.</p>`;
        } else {
          container.innerHTML = activeTicket.messages.map(msg => `
            <div class="p-3.5 rounded-xl border border-slate-800 ${msg.senderRole === 'SUPPORT' ? 'bg-slate-900 border-l-4 border-l-emerald-500' : 'bg-slate-950 border-l-4 border-l-purple-500'}">
              <div class="flex justify-between text-[11px] text-slate-400 mb-1.5">
                <span class="font-bold ${msg.senderRole === 'SUPPORT' ? 'text-emerald-400' : 'text-purple-300'}">
                  ${msg.senderRole === 'SUPPORT' ? 'Rahul (Support Executive)' : activeTicket.userName + ' (' + activeTicket.userRole + ')'}
                </span>
                <span>${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p class="text-xs text-white leading-relaxed">${msg.content}</p>
            </div>
          `).join('');
          container.scrollTop = container.scrollHeight;
        }
      }
    }
  } catch (err) {
    console.error('Support desk error:', err);
  }
}

function selectExecutiveTicket(ticketId) {
  activeExecutiveTicketId = ticketId;
  loadSupportExecutiveDesk();
}

async function sendSupportExecutiveReply() {
  const input = document.getElementById('support-desk-reply');
  const text = input.value.trim();
  if (!text) return;

  try {
    await fetch('/api/support/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        ticketId: activeExecutiveTicketId || 'ticket_celeb_201',
        content: text
      })
    });
    input.value = '';
    loadSupportExecutiveDesk();
  } catch (err) {
    console.error('Reply error:', err);
  }
}

// ----------------- SUPER ADMIN LOGIC -----------------

async function loadAdminMetrics() {
  if (!currentToken || currentUser?.role !== 'SUPER_ADMIN') return;
  try {
    const res = await fetch('/api/admin/metrics', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success) {
      const m = data.metrics;
      document.getElementById('admin-metrics-grid').innerHTML = `
        <div class="bg-[#111928] border border-slate-800 rounded-2xl p-4">
          <span class="text-[10px] text-slate-400 uppercase font-semibold">Total Users</span>
          <p class="text-xl font-bold text-white mt-1">${m.totalUsers}</p>
        </div>
        <div class="bg-[#111928] border border-slate-800 rounded-2xl p-4">
          <span class="text-[10px] text-slate-400 uppercase font-semibold">Live Events</span>
          <p class="text-xl font-bold text-amber-400 mt-1">${m.totalEvents}</p>
        </div>
        <div class="bg-[#111928] border border-slate-800 rounded-2xl p-4">
          <span class="text-[10px] text-slate-400 uppercase font-semibold">Celebrities</span>
          <p class="text-xl font-bold text-pink-400 mt-1">${m.totalCelebrities}</p>
        </div>
        <div class="bg-[#111928] border border-slate-800 rounded-2xl p-4">
          <span class="text-[10px] text-slate-400 uppercase font-semibold">Platform Revenue</span>
          <p class="text-xl font-bold text-emerald-400 mt-1">₹${m.totalRevenueInRupees.toLocaleString()}</p>
        </div>
      `;

      document.getElementById('admin-users-table').innerHTML = allUsers.map(u => `
        <tr class="hover:bg-slate-800/40">
          <td class="px-4 py-3 font-bold text-white text-xs">${u.fullName}</td>
          <td class="px-4 py-3 font-mono text-[11px] text-slate-400">${u.phoneNumber}</td>
          <td class="px-4 py-3"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200">${u.role}</span></td>
          <td class="px-4 py-3">${u.isBanned ? '<span class="text-rose-400 font-bold">Banned</span>' : '<span class="text-emerald-400 font-bold">Active</span>'}</td>
          <td class="px-4 py-3 text-right">
            ${u.role !== 'SUPER_ADMIN' ? `
              <button onclick="toggleBanUser('${u.id}', ${!u.isBanned})" class="px-2.5 py-1 rounded text-[10px] font-bold border ${u.isBanned ? 'border-emerald-500 text-emerald-300' : 'border-rose-500 text-rose-300'}">
                ${u.isBanned ? 'Unban' : 'Ban'}
              </button>
            ` : '<span class="text-slate-500 text-[10px]">Root</span>'}
          </td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Admin metrics error:', err);
  }
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
      loadAdminMetrics();
    }
  } catch (err) {
    console.error('Ban error:', err);
  }
}

// ----------------- COMMON / SHARED HELPERS -----------------

async function fetchAllUsers() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    if (data.success) allUsers = data.users;
  } catch (err) {
    console.error('Users fetch error:', err);
  }
}

function initWebSocket() {
  if (!currentUser) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws?userId=${currentUser.id}`;
  socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'MATCH_FOUND') onMatchFound(payload);
      else if (payload.type === 'PEER_DISCONNECTED') { alert('Partner skipped to next.'); setCallState('searching'); }
      else if (payload.type === 'END_CALL') { alert('Call ended.'); setCallState('idle'); }
    } catch (err) {
      console.error('WS Error:', err);
    }
  };
}

// Nearby Events & Feed Loader for Normal User
async function loadNearbyEvents() {
  try {
    const res = await fetch(`/api/events?lat=9.9312&lon=76.2673&radius=${activeDistanceFilter}`);
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('events-grid');
      container.innerHTML = data.events.map(evt => `
        <div class="bg-[#111928] border border-slate-800 rounded-2xl overflow-hidden shadow flex flex-col justify-between">
          <img src="${evt.bannerUrl}" class="w-full h-36 object-cover">
          <div class="p-4 flex-1 flex flex-col justify-between">
            <div>
              <h4 class="text-xs font-bold text-white mb-1">${evt.title}</h4>
              <p class="text-[11px] text-slate-400 mb-2">${evt.venueName}, ${evt.city}</p>
            </div>
            <div class="pt-3 border-t border-slate-800 flex justify-between items-center">
              <span class="text-xs font-bold text-amber-400">₹${evt.ticketTiers[0]?.price}</span>
              <button onclick="openBookingModal('${evt.id}')" class="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs shadow">Book</button>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Events error:', err);
  }
}

function filterEventsDistance(r) {
  activeDistanceFilter = r;
  document.getElementById('dist-10').className = r === 10 ? 'px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium' : 'px-2.5 py-1 rounded-md text-slate-400';
  document.getElementById('dist-50').className = r === 50 ? 'px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium' : 'px-2.5 py-1 rounded-md text-slate-400';
  document.getElementById('dist-all').className = r === 0 ? 'px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium' : 'px-2.5 py-1 rounded-md text-slate-400';
  loadNearbyEvents();
}

async function loadCelebrityHub() {
  try {
    const res = await fetch('/api/celebrities/feed');
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('celebrity-feed');
      container.innerHTML = data.feed.map(post => `
        <div class="bg-[#111928] border border-slate-800 rounded-2xl overflow-hidden shadow">
          <div class="p-4 flex items-center gap-3">
            <img src="${post.celebrityAvatar}" class="w-10 h-10 rounded-full object-cover border border-pink-500">
            <div>
              <h4 class="text-xs font-bold text-white">${post.celebrityName}</h4>
              <span class="text-[10px] text-slate-400">${new Date(post.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
          <img src="${post.mediaUrl}" class="w-full max-h-80 object-cover">
          <div class="p-4">
            <p class="text-xs text-slate-300 mb-3">${post.caption}</p>
            <div class="flex items-center justify-between pt-2 border-t border-slate-800">
              <button onclick="likeCelebrityPost('${post.id}')" class="px-3 py-1.5 rounded-lg bg-pink-950/40 border border-pink-500/30 text-rose-400 hover:bg-pink-900/40 text-xs font-bold flex items-center gap-1.5 transition">
                <i class="fa-solid fa-heart"></i>
                <span id="like-count-${post.id}">${post.likesCount} Likes</span>
              </button>
              <span class="text-[10px] text-pink-400/80 font-medium">Verified Celebrity Post</span>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Feed error:', err);
  }
}

async function likeCelebrityPost(postId) {
  try {
    const res = await fetch(`/api/celebrities/like/${postId}`, {
      method: 'POST'
    });
    const data = await res.json();
    if (data.success) {
      const el = document.getElementById(`like-count-${postId}`);
      if (el) el.textContent = `${data.likes} Likes`;
      else loadCelebrityHub();
    }
  } catch (err) {
    console.error('Like error:', err);
  }
}

async function loadSupportTickets() {
  if (!currentToken) return;
  try {
    const res = await fetch('/api/support/tickets', { headers: { 'Authorization': `Bearer ${currentToken}` } });
    const data = await res.json();
    if (data.success && data.tickets.length > 0) {
      const container = document.getElementById('support-messages-container');
      container.innerHTML = data.tickets[0].messages.map(msg => `
        <div class="p-2.5 rounded-xl text-xs ${msg.senderId === currentUser.id ? 'bg-blue-600 ml-auto max-w-xs text-white' : 'bg-slate-800 mr-auto max-w-xs text-slate-200'}">
          ${msg.content}
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Support tickets error:', err);
  }
}

async function sendSupportMessage() {
  const input = document.getElementById('support-message-input');
  const text = input.value.trim();
  if (!text) return;
  try {
    await fetch('/api/support/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({ ticketId: 'ticket_sample_101', content: text })
    });
    input.value = '';
    loadSupportTickets();
  } catch (err) {
    console.error('Support send error:', err);
  }
}

// ----------------- DEDICATED IN-PLACE CUSTOMER CARE VOIP CALL -----------------

function startSupportVoipCall() {
  // Reveal the VoIP calling card right inside the Customer Care section
  const callCard = document.getElementById('support-voip-call-card');
  const btnStart = document.getElementById('btn-start-support-voip');
  const statusText = document.getElementById('support-call-status-text');
  const timerEl = document.getElementById('support-call-timer');
  const wavesEl = document.getElementById('support-voice-waves');

  callCard.classList.remove('hidden');
  btnStart.classList.add('opacity-50', 'pointer-events-none');

  statusText.innerHTML = '<i class="fa-solid fa-phone-volume animate-pulse text-amber-400"></i><span>Calling Helpdesk Desk... (Ringing)</span>';
  wavesEl.classList.add('opacity-40');
  timerEl.textContent = '00:00';
  supportCallDuration = 0;

  // Simulate prompt connection to Support Officer (Rahul) after 1.5 seconds
  setTimeout(() => {
    statusText.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping mr-1"></span><span>Connected • HD Voice Audio</span>';
    wavesEl.classList.remove('opacity-40');

    clearInterval(supportCallInterval);
    supportCallInterval = setInterval(() => {
      supportCallDuration++;
      const mins = String(Math.floor(supportCallDuration / 60)).padStart(2, '0');
      const secs = String(supportCallDuration % 60).padStart(2, '0');
      timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }, 1500);
}

function toggleSupportCallMute() {
  isSupportCallMuted = !isSupportCallMuted;
  const btn = document.getElementById('btn-support-call-mute');
  if (isSupportCallMuted) {
    btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-rose-500"></i>';
    btn.classList.add('bg-rose-950/50', 'border-rose-500/50');
  } else {
    btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
    btn.classList.remove('bg-rose-950/50', 'border-rose-500/50');
  }
}

function endSupportVoipCall() {
  clearInterval(supportCallInterval);
  const durationSec = supportCallDuration;
  supportCallDuration = 0;

  const callCard = document.getElementById('support-voip-call-card');
  const btnStart = document.getElementById('btn-start-support-voip');
  callCard.classList.add('hidden');
  btnStart.classList.remove('opacity-50', 'pointer-events-none');

  const mins = String(Math.floor(durationSec / 60)).padStart(2, '0');
  const secs = String(durationSec % 60).padStart(2, '0');

  // Insert a notification bubble in the chat messages
  const container = document.getElementById('support-messages-container');
  if (container) {
    const bubble = document.createElement('div');
    bubble.className = 'p-2 rounded-xl text-center text-[11px] bg-slate-900 border border-slate-800 text-slate-300 my-2';
    bubble.innerHTML = `<i class="fa-solid fa-phone text-emerald-400 mr-1.5"></i> Voice Support Call ended • Duration: <span class="font-mono font-bold text-emerald-400">${mins}:${secs}</span>`;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }
}

function openBookingModal(eventId) {
  fetch('/api/events')
    .then(r => r.json())
    .then(data => {
      const event = data.events.find(e => e.id === eventId);
      if (!event) return;
      selectedEventForBooking = event;
      selectedTicketTier = event.ticketTiers[0];
      bookingQty = 1;
      document.getElementById('booking-event-title').textContent = event.title;
      document.getElementById('booking-event-venue').textContent = `${event.venueName}, ${event.city}`;
      document.getElementById('booking-qty').textContent = '1';
      document.getElementById('booking-tiers-list').innerHTML = event.ticketTiers.map(t => `
        <div onclick="selectedTicketTier=selectedEventForBooking.ticketTiers.find(x=>x.id==='${t.id}'); document.getElementById('booking-total-price').textContent='₹'+(${t.price}*bookingQty);" class="p-2.5 rounded-xl border border-slate-700 bg-slate-900 flex justify-between cursor-pointer">
          <span class="text-xs font-bold text-white">${t.name}</span>
          <span class="text-xs font-bold text-amber-400">₹${t.price}</span>
        </div>
      `).join('');
      document.getElementById('booking-total-price').textContent = `₹${event.ticketTiers[0].price}`;
      document.getElementById('ticket-booking-form').classList.remove('hidden');
      document.getElementById('ticket-qr-result').classList.add('hidden');
      document.getElementById('modal-ticket').classList.remove('hidden');
    });
}

function adjustTicketQty(delta) {
  bookingQty = Math.max(1, Math.min(10, bookingQty + delta));
  document.getElementById('booking-qty').textContent = bookingQty;
  if (selectedTicketTier) {
    document.getElementById('booking-total-price').textContent = `₹${selectedTicketTier.price * bookingQty}`;
  }
}

async function confirmTicketBooking() {
  try {
    const res = await fetch('/api/events/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({ eventId: selectedEventForBooking.id, tierId: selectedTicketTier.id, quantity: bookingQty })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('ticket-booking-form').classList.add('hidden');
      document.getElementById('ticket-qr-result').classList.remove('hidden');
      document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.booking.qrCodeHash)}`;
      document.getElementById('qr-hash-display').textContent = data.booking.qrCodeHash;
    }
  } catch (err) {
    console.error('Booking error:', err);
  }
}

// ----------------- SUB-VIEWS: NEARBY EVENTS VS MY BOOKINGS -----------------

function toggleEventsSubView(subView) {
  const btnExplore = document.getElementById('btn-sub-explore');
  const btnBookings = document.getElementById('btn-sub-bookings');
  const exploreContainer = document.getElementById('events-explore-container');
  const distFilters = document.getElementById('events-distance-filters');
  const bookingsContainer = document.getElementById('events-my-bookings-container');

  if (subView === 'explore') {
    if (btnExplore) btnExplore.className = 'px-3 py-1.5 rounded-md bg-blue-600 text-white font-medium';
    if (btnBookings) btnBookings.className = 'px-3 py-1.5 rounded-md text-slate-400 hover:text-white';
    if (exploreContainer) exploreContainer.classList.remove('hidden');
    if (distFilters) distFilters.classList.remove('hidden');
    if (bookingsContainer) bookingsContainer.classList.add('hidden');
    loadNearbyEvents();
  } else {
    if (btnExplore) btnExplore.className = 'px-3 py-1.5 rounded-md text-slate-400 hover:text-white';
    if (btnBookings) btnBookings.className = 'px-3 py-1.5 rounded-md bg-blue-600 text-white font-medium';
    if (exploreContainer) exploreContainer.classList.add('hidden');
    if (distFilters) distFilters.classList.add('hidden');
    if (bookingsContainer) bookingsContainer.classList.remove('hidden');
    renderMyBookings();
  }
}

async function renderMyBookings() {
  const container = document.getElementById('my-bookings-list');
  if (!container) return;
  if (!currentToken) {
    container.innerHTML = '<p class="text-xs text-slate-400">Please log in to view your tickets.</p>';
    return;
  }

  container.innerHTML = '<div class="col-span-2 text-center py-8 text-xs text-slate-400"><i class="fa-solid fa-spinner animate-spin mr-2"></i>Loading your digital passes...</div>';

  try {
    const res = await fetch('/api/events/my-bookings', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success && data.bookings && data.bookings.length > 0) {
      container.innerHTML = data.bookings.map(b => `
        <div class="bg-[#111928] border border-amber-500/30 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div class="flex items-start justify-between gap-3 mb-3">
            <div>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 uppercase tracking-wider">Pass ID: ${b.id.slice(-6)}</span>
              <h4 class="text-sm font-bold text-white mt-1.5">${b.eventTitle}</h4>
              <p class="text-xs text-slate-400">${b.tierName} • ${b.quantity} Ticket(s)</p>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${b.status === 'CONFIRMED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'}">
              ${b.status}
            </span>
          </div>

          <div class="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-4 my-2">
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(b.qrCodeHash)}" class="w-20 h-20 bg-white p-1 rounded-lg shadow shrink-0">
            <div class="overflow-hidden">
              <p class="text-[10px] text-slate-400 font-medium">Anti-Fraud Gate Hash:</p>
              <p class="font-mono text-[11px] text-amber-400 font-bold truncate select-all">${b.qrCodeHash}</p>
              <p class="text-[10px] text-emerald-400 mt-1"><i class="fa-solid fa-circle-check mr-1"></i>Official Entry Verified Pass</p>
              <button onclick="navigator.clipboard.writeText('${b.qrCodeHash}'); alert('Copied Ticket Pass Code: ${b.qrCodeHash}');" class="mt-1.5 px-2 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700">
                <i class="fa-solid fa-copy mr-1"></i>Copy Pass Code
              </button>
            </div>
          </div>

          <div class="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
            <span class="text-slate-400">Total Paid: <strong class="text-white">₹${b.totalPrice}</strong></span>
            <span class="text-[11px] text-slate-500">${new Date(b.bookedAt).toLocaleDateString()}</span>
          </div>
        </div>
      `).join('');
    } else {
      container.innerHTML = `
        <div class="col-span-2 text-center py-10 bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
          <i class="fa-solid fa-ticket-simple text-3xl text-slate-600 mb-2"></i>
          <h4 class="text-xs font-bold text-slate-300">നിങ്ങൾ ഇതുവരെ ടിക്കറ്റുകൾ ബുക്ക് ചെയ്തിട്ടില്ല</h4>
          <p class="text-[11px] text-slate-500 mt-1 mb-4">No active tickets found. Book concert passes from the Explore tab!</p>
          <button onclick="toggleEventsSubView('explore')" class="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow">
            Explore Events Now
          </button>
        </div>
      `;
    }
  } catch (err) {
    console.error('My bookings error:', err);
    container.innerHTML = '<p class="text-xs text-rose-400">Error loading your tickets. Please try again.</p>';
  }
}

// ----------------- RICH MODAL ACTIONS (ORG, CELEB & SUPPORT) -----------------

function openRichCreateEventModal() {
  document.getElementById('modal-publish-event')?.classList.remove('hidden');
}

function openCreateEventModal() {
  openRichCreateEventModal();
}

async function submitRichCreateEvent() {
  const title = document.getElementById('evt-input-title').value.trim();
  const category = document.getElementById('evt-input-category').value;
  const city = document.getElementById('evt-input-city').value.trim() || 'Kochi';
  const venue = document.getElementById('evt-input-venue').value.trim() || 'Marine Drive Grounds, Kochi';
  const price = parseInt(document.getElementById('evt-input-price').value || '499', 10);
  const qty = parseInt(document.getElementById('evt-input-qty').value || '500', 10);
  const bannerUrl = document.getElementById('evt-input-banner').value.trim() || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800';

  if (!title) {
    alert('Please enter an event title.');
    return;
  }

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        title,
        description: `Grand Live Event organized by ${currentUser ? currentUser.fullName : 'Organization'}`,
        category,
        venueName: venue,
        address: `${venue}, ${city}`,
        city,
        latitude: 9.9723,
        longitude: 76.2783,
        startTime: new Date(Date.now() + 86400000 * 7).toISOString(),
        endTime: new Date(Date.now() + 86400000 * 7 + 18000000).toISOString(),
        bannerUrl,
        ticketTiers: [{ name: 'General Pass', price, totalQuantity: qty }]
      })
    });

    const data = await res.json();
    if (data.success) {
      alert('🎉 Event Published Successfully! Visible to all normal users nearby.');
      closeModal('modal-publish-event');
      loadOrganizationEvents();
    } else {
      alert(data.error || 'Failed to publish event.');
    }
  } catch (err) {
    console.error('Publish event error:', err);
    alert('Error publishing event.');
  }
}

function openRichCreatePostModal() {
  document.getElementById('modal-publish-media')?.classList.remove('hidden');
}

function openCreatePostModal() {
  openRichCreatePostModal();
}

async function submitRichCreatePost() {
  const caption = document.getElementById('media-input-caption').value.trim();
  const mediaUrl = document.getElementById('media-input-url').value.trim() || 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800';

  if (!caption) {
    alert('Please enter a caption for your update.');
    return;
  }

  try {
    const res = await fetch('/api/celebrities/posts', {
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
    });

    const data = await res.json();
    if (data.success) {
      alert('🌟 Post shared successfully with your fans!');
      document.getElementById('media-input-caption').value = '';
      closeModal('modal-publish-media');
      loadCelebrityOwnFeed();
    } else {
      alert(data.error || 'Failed to publish post.');
    }
  } catch (err) {
    console.error('Publish post error:', err);
    alert('Error publishing post.');
  }
}

let currentSupportDeskName = 'VIP Helpdesk';
let genericSupportRefreshTimer = null;
let modalSupportCallInterval = null;
let modalSupportCallDuration = 0;
let isModalSupportMuted = false;
let currentSupportTicketId = null;

async function openGenericSupportModal(deskName) {
  currentSupportDeskName = deskName || 'VIP Helpdesk';
  const titleEl = document.getElementById('generic-support-title');
  if (titleEl) titleEl.textContent = `${deskName || 'VIP Helpdesk'}`;

  // Reset VoIP Call UI
  clearInterval(modalSupportCallInterval);
  document.getElementById('modal-support-voip-card')?.classList.add('hidden');
  document.getElementById('btn-modal-support-voip')?.classList.remove('hidden');

  document.getElementById('modal-generic-support')?.classList.remove('hidden');
  await loadGenericSupportMessages();

  // Auto-refresh support thread every 3 seconds while open
  clearInterval(genericSupportRefreshTimer);
  genericSupportRefreshTimer = setInterval(loadGenericSupportMessages, 3000);
}

async function loadGenericSupportMessages() {
  if (!currentToken) return;
  const container = document.getElementById('modal-support-messages-list');
  if (!container) return;

  try {
    const res = await fetch('/api/support/tickets', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success && data.tickets && data.tickets.length > 0) {
      const ticket = data.tickets[0];
      currentSupportTicketId = ticket.id;

      if (!ticket.messages || ticket.messages.length === 0) {
        container.innerHTML = `
          <div class="text-center py-8 text-xs text-slate-400">
            <i class="fa-solid fa-headset text-2xl text-slate-600 mb-2"></i>
            <p class="font-bold text-slate-300">Welcome to ${currentSupportDeskName}!</p>
            <p class="text-[11px] text-slate-500 mt-1">No messages yet. Send your query below to get instant assistance from Rahul.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = ticket.messages.map(msg => {
        const isMe = msg.senderId === currentUser.id;
        if (isMe) {
          return `
            <div class="flex flex-col items-end">
              <div class="bg-gradient-to-r from-pink-600 to-purple-600 text-white rounded-2xl rounded-tr-none px-3.5 py-2 max-w-[85%] text-xs shadow">
                ${msg.content}
              </div>
              <span class="text-[9px] text-slate-500 mt-0.5">${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          `;
        } else {
          return `
            <div class="flex items-start gap-2">
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150" class="w-7 h-7 rounded-full object-cover border border-emerald-500 shrink-0 mt-0.5">
              <div class="flex flex-col items-start max-w-[85%]">
                <div class="bg-slate-800 text-slate-100 rounded-2xl rounded-tl-none px-3.5 py-2 text-xs shadow border border-slate-700">
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <span class="text-[10px] font-bold text-emerald-400">Rahul (Support Officer)</span>
                  </div>
                  ${msg.content}
                </div>
                <span class="text-[9px] text-slate-500 mt-0.5">${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            </div>
          `;
        }
      }).join('');

      container.scrollTop = container.scrollHeight;
    }
  } catch (err) {
    console.error('Support load error:', err);
  }
}

async function sendGenericSupportQuery() {
  const input = document.getElementById('generic-support-text');
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await fetch('/api/support/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        ticketId: currentSupportTicketId,
        content: text
      })
    });

    const data = await res.json();
    if (data.success) {
      input.value = '';
      await loadGenericSupportMessages();
    } else {
      alert(data.error || 'Failed to send support query.');
    }
  } catch (err) {
    console.error('Support query error:', err);
  }
}

function startModalSupportVoipCall() {
  const callCard = document.getElementById('modal-support-voip-card');
  const btnStart = document.getElementById('btn-modal-support-voip');
  const statusText = document.getElementById('modal-support-call-status');
  const timerEl = document.getElementById('modal-support-call-timer');
  const wavesEl = document.getElementById('modal-support-waves');

  callCard?.classList.remove('hidden');
  btnStart?.classList.add('hidden');

  if (statusText) statusText.innerHTML = '<i class="fa-solid fa-phone-volume animate-pulse text-amber-400"></i><span>Calling Support Desk... (Ringing)</span>';
  if (wavesEl) wavesEl.classList.add('opacity-40');
  if (timerEl) timerEl.textContent = '00:00';
  modalSupportCallDuration = 0;

  // Simulate prompt connection to Support Officer Rahul after 1.5 seconds
  setTimeout(() => {
    if (statusText) statusText.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping mr-1"></span><span>Connected • HD Voice Audio</span>';
    if (wavesEl) wavesEl.classList.remove('opacity-40');

    clearInterval(modalSupportCallInterval);
    modalSupportCallInterval = setInterval(() => {
      modalSupportCallDuration++;
      const mins = String(Math.floor(modalSupportCallDuration / 60)).padStart(2, '0');
      const secs = String(modalSupportCallDuration % 60).padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }, 1500);
}

function toggleModalSupportMute() {
  isModalSupportMuted = !isModalSupportMuted;
  const btn = document.getElementById('btn-modal-support-mute');
  if (btn) {
    if (isModalSupportMuted) {
      btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-rose-500"></i>';
      btn.classList.add('bg-rose-950/50', 'border-rose-500/50');
    } else {
      btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
      btn.classList.remove('bg-rose-950/50', 'border-rose-500/50');
    }
  }
}

async function endModalSupportVoipCall() {
  clearInterval(modalSupportCallInterval);
  const durationSec = modalSupportCallDuration;
  modalSupportCallDuration = 0;

  document.getElementById('modal-support-voip-card')?.classList.add('hidden');
  document.getElementById('btn-modal-support-voip')?.classList.remove('hidden');

  const mins = String(Math.floor(durationSec / 60)).padStart(2, '0');
  const secs = String(durationSec % 60).padStart(2, '0');

  // Insert notification in ticket thread
  const logMsg = `📞 VoIP Voice Support Call ended • Duration: ${mins}:${secs}`;
  try {
    await fetch('/api/support/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        ticketId: currentSupportTicketId,
        content: logMsg
      })
    });
    await loadGenericSupportMessages();
  } catch (err) {
    console.error('Call log error:', err);
  }
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
  if (id === 'modal-generic-support') {
    clearInterval(genericSupportRefreshTimer);
    if (modalSupportCallInterval) {
      endModalSupportVoipCall();
    }
  }
}
