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

  const roleMap = {
    'usr_normal_1': { role: 'NORMAL', name: 'Arjun Nair' },
    'usr_celeb_1': { role: 'CELEBRITY', name: 'Dulquer Sithara' },
    'usr_org_1': { role: 'ORGANIZATION', name: 'Kochi Live Arena Events' },
    'usr_support_1': { role: 'SUPPORT', name: 'Rahul (Customer Care Support)' },
    'usr_admin_1': { role: 'SUPER_ADMIN', name: 'Super Admin (Platform Control)' }
  };
  const fallback = roleMap[userId] || { role: 'NORMAL', name: 'User' };
  const user = allUsers.find(u => u.id === userId);
  const role = user ? user.role : fallback.role;
  const fullName = user ? user.fullName : fallback.name;

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
    document.body.classList.remove('theme-super-admin');
    if (socket) {
      socket.close();
      socket = null;
    }
    stopCallTimer();
    stopLocalCamera();
    clearInterval(supportCallInterval);
    clearInterval(genericSupportRefreshTimer);
    clearInterval(celebSupportRefreshTimer);
    clearInterval(celebTabVoipInterval);
    document.getElementById('support-voip-call-card')?.classList.add('hidden');
    document.getElementById('btn-start-support-voip')?.classList.remove('opacity-50', 'pointer-events-none');
    document.getElementById('celeb-tab-voip-card')?.classList.add('hidden');
    document.getElementById('btn-celeb-tab-voip')?.classList.remove('hidden');
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

  // Unified 3-color palette applied everywhere
  document.body.classList.remove('theme-super-admin');

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
      <button onclick="switchNormalTab('connect')" id="norm-tab-connect" class="norm-tab px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white flex items-center gap-1.5 shadow">
        <i class="fa-solid fa-shuffle"></i><span>Random Audio/Video</span>
      </button>
      <button onclick="switchNormalTab('events')" id="norm-tab-events" class="norm-tab px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition">
        <i class="fa-solid fa-calendar-days text-blue-400"></i><span>Nearby Events</span>
      </button>
      <button onclick="switchNormalTab('celebrity')" id="norm-tab-celebrity" class="norm-tab px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition">
        <i class="fa-solid fa-star text-blue-400"></i><span>Celebrity Hub</span>
      </button>
      <button onclick="switchNormalTab('support')" id="norm-tab-support" class="norm-tab px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition">
        <i class="fa-solid fa-comments text-blue-400"></i><span>Customer Care</span>
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
      <button onclick="switchCelebrityTab('calls')" id="celeb-tab-btn-calls" class="celeb-nav-tab px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white flex items-center gap-1.5 shadow transition">
        <i class="fa-solid fa-phone-volume"></i><span>Fan Calls Desk</span>
      </button>
      <button onclick="switchCelebrityTab('feed')" id="celeb-tab-btn-feed" class="celeb-nav-tab px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition">
        <i class="fa-solid fa-photo-film text-blue-400"></i><span>Fan Media Feed</span>
      </button>
      <button onclick="switchCelebrityTab('support')" id="celeb-tab-btn-support" class="celeb-nav-tab px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition">
        <i class="fa-solid fa-headset text-blue-400"></i><span>VIP Helpdesk (Rahul)</span>
      </button>
    `;

    switchCelebrityTab('calls');
  }

  // 3. ORGANIZATION
  else if (currentUser.role === 'ORGANIZATION') {
    document.getElementById('dashboard-organization').classList.remove('hidden');

    navContainer.innerHTML = `
      <span class="px-3.5 py-1.5 rounded-xl text-xs font-bold text-blue-300 bg-blue-950/40 border border-blue-500/30 flex items-center gap-1.5 shadow">
        <i class="fa-solid fa-building text-blue-400"></i><span>Event Organizer Console</span>
      </span>
      <span class="text-xs text-slate-400 flex items-center gap-1 py-1.5">
        <i class="fa-solid fa-ticket text-blue-400"></i>
        <span>Publish events & scan gate QR codes</span>
      </span>
    `;

    loadOrganizationEvents();
  }

  // 4. SUPPORT EXECUTIVE
  else if (currentUser.role === 'SUPPORT') {
    document.getElementById('dashboard-support').classList.remove('hidden');

    navContainer.innerHTML = `
      <span class="px-3.5 py-1.5 rounded-xl text-xs font-bold text-blue-300 bg-blue-950/40 border border-blue-500/30 flex items-center gap-1.5 shadow">
        <i class="fa-solid fa-headset text-blue-400"></i><span>Helpdesk Executive</span>
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
      <span class="px-3.5 py-1.5 rounded-xl text-xs font-bold text-blue-300 bg-blue-950/40 border border-blue-500/30 flex items-center gap-2 shadow">
        <i class="fa-solid fa-crown text-blue-400"></i><span>Super Admin Control Terminal</span>
      </span>
      <span class="text-xs text-slate-400 flex items-center gap-1 py-1.5 font-medium">
        <i class="fa-solid fa-shield-halved text-blue-400"></i>
        <span>Root System Security • High Privilege Mode</span>
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
      <div class="bg-blue-950/30 border border-blue-500/30 rounded-xl p-3 text-left">
        <p class="text-xs font-bold text-blue-400 mb-1 flex items-center gap-1">
          <i class="fa-solid fa-lock"></i>
          <span>VIP Calling Locked (പ്രീമിയം ലോക്ക്ഡ്)</span>
        </p>
        <p class="text-[11px] text-slate-300 leading-snug mb-3">
          സെലിബ്രിറ്റികളെ നേരിട്ട് ഓഡിയോ/വീഡിയോ കോളിൽ വിളിക്കാൻ പ്രീമിയം സബ്‌സ്‌ക്രിപ്ഷൻ ആവശ്യമാണ്.
        </p>
        <button onclick="unlockPremiumSubscription()" class="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow transition">
          Unlock VIP Calls (₹199 / Month)
        </button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="bg-blue-950/30 border border-blue-500/30 rounded-xl p-3 text-left mb-2">
        <p class="text-xs font-bold text-blue-400 flex items-center gap-1">
          <i class="fa-solid fa-crown"></i>
          <span>VIP Direct Access Unlocked!</span>
        </p>
        <p class="text-[10px] text-slate-300">You have full access to connect with Dulquer Sithara.</p>
      </div>
      <div class="flex gap-2">
        <button onclick="startNormalToCelebCall('usr_celeb_1', 'CELEBRITY_AUDIO')" class="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow flex items-center justify-center gap-1.5 transition">
          <i class="fa-solid fa-phone"></i>
          <span>VIP Audio</span>
        </button>
        <button onclick="startNormalToCelebCall('usr_celeb_1', 'CELEBRITY_VIDEO')" class="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-bold text-xs shadow flex items-center justify-center gap-1.5 transition">
          <i class="fa-solid fa-video text-blue-400"></i>
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

  // Request call approval from celebrity via localStorage cross-tab signal
  localStorage.setItem('fc_incoming_celeb_call', JSON.stringify({
    caller: currentUser?.fullName || 'Arjun Nair',
    callType,
    time: Date.now()
  }));

  // Show ringing / waiting for approval state
  document.getElementById('call-state-idle')?.classList.add('hidden');
  document.getElementById('call-state-connected')?.classList.add('hidden');
  const searchingState = document.getElementById('call-state-searching');
  if (searchingState) {
    searchingState.classList.remove('hidden');
    const title = searchingState.querySelector('h3');
    const desc = searchingState.querySelector('p');
    if (title) title.textContent = 'Calling Dulquer Sithara (Ringing...)';
    if (desc) desc.textContent = 'സെലിബ്രിറ്റി കോൾ അപ്രൂവ് ചെയ്യുന്നതിനായി കാത്തിരിക്കുന്നു (Waiting for Approval)...';
  }
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
let activeCelebrityTab = 'calls';
let celebSupportRefreshTimer = null;
let celebTabVoipInterval = null;
let celebTabVoipDuration = 0;
let isCelebTabVoipMuted = false;

function switchCelebrityTab(tabId) {
  activeCelebrityTab = tabId;

  document.querySelectorAll('.celeb-nav-tab').forEach(btn => {
    btn.className = 'celeb-nav-tab px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1.5 transition';
  });
  const activeBtn = document.getElementById(`celeb-tab-btn-${tabId}`);
  if (activeBtn) {
    activeBtn.className = 'celeb-nav-tab px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-blue-600 text-white flex items-center gap-1.5 shadow transition';
  }

  document.querySelectorAll('.celeb-section').forEach(sec => sec.classList.add('hidden'));
  document.getElementById(`celeb-section-${tabId}`)?.classList.remove('hidden');

  clearInterval(celebSupportRefreshTimer);
  if (tabId === 'feed') loadCelebrityOwnFeed();
  if (tabId === 'support') {
    loadCelebrityTabSupportMessages();
    celebSupportRefreshTimer = setInterval(loadGenericSupportMessages, 3000);
  }
  if (tabId === 'calls') updateCelebrityCallUI();
}

async function loadCelebrityTabSupportMessages() {
  await loadGenericSupportMessages();
}

async function sendCelebTabSupportMessage() {
  const input = document.getElementById('celeb-tab-support-input');
  const text = input.value.trim();
  if (!text) return;

  if (!currentSupportTicketId) {
    await loadGenericSupportMessages();
  }

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
    }
  } catch (err) {
    console.error('Support send error:', err);
  }
}

function startCelebTabVoipCall() {
  const card = document.getElementById('celeb-tab-voip-card');
  const btn = document.getElementById('btn-celeb-tab-voip');
  const status = document.getElementById('celeb-tab-call-status');
  const timer = document.getElementById('celeb-tab-call-timer');
  const waves = document.getElementById('celeb-tab-waves');

  card?.classList.remove('hidden');
  btn?.classList.add('hidden');

  if (status) status.innerHTML = '<i class="fa-solid fa-phone-volume animate-pulse text-amber-400"></i><span>Calling VIP Helpdesk... Ringing</span>';
  if (waves) waves.classList.add('opacity-40');
  if (timer) timer.textContent = '00:00';
  celebTabVoipDuration = 0;

  setTimeout(() => {
    if (status) status.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping mr-1"></span><span>Connected • HD Voice Audio</span>';
    if (waves) waves.classList.remove('opacity-40');

    clearInterval(celebTabVoipInterval);
    celebTabVoipInterval = setInterval(() => {
      celebTabVoipDuration++;
      const mins = String(Math.floor(celebTabVoipDuration / 60)).padStart(2, '0');
      const secs = String(celebTabVoipDuration % 60).padStart(2, '0');
      if (timer) timer.textContent = `${mins}:${secs}`;
    }, 1000);
  }, 1500);
}

function toggleCelebTabVoipMute() {
  isCelebTabVoipMuted = !isCelebTabVoipMuted;
  const btn = document.getElementById('btn-celeb-tab-mute');
  if (btn) {
    if (isCelebTabVoipMuted) {
      btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-rose-500"></i>';
      btn.classList.add('bg-rose-950/50', 'border-rose-500/50');
    } else {
      btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
      btn.classList.remove('bg-rose-950/50', 'border-rose-500/50');
    }
  }
}

async function endCelebTabVoipCall() {
  clearInterval(celebTabVoipInterval);
  const durationSec = celebTabVoipDuration;
  celebTabVoipDuration = 0;

  document.getElementById('celeb-tab-voip-card')?.classList.add('hidden');
  document.getElementById('btn-celeb-tab-voip')?.classList.remove('hidden');

  const mins = String(Math.floor(durationSec / 60)).padStart(2, '0');
  const secs = String(durationSec % 60).padStart(2, '0');
  const logMsg = `📞 VIP VoIP Voice Support Call ended • Duration: ${mins}:${secs}`;

  try {
    if (!currentSupportTicketId) {
      await loadGenericSupportMessages();
    }
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

// Celebrity Call & Audio State
let celebIncomingRingtoneTimer = null;
let celebActiveCallTimer = null;
let celebActiveCallSeconds = 0;
let isCelebCallMuted = false;

function playCelebRingChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.value = 523.25; // C5
    osc2.type = 'sine';
    osc2.frequency.value = 659.25; // E5

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.4);
    osc2.stop(ctx.currentTime + 0.4);
  } catch {}
}

function startCelebrityIncomingRingtone() {
  stopCelebrityIncomingRingtone();
  playCelebRingChime();
  celebIncomingRingtoneTimer = setInterval(playCelebRingChime, 1500);
}

function stopCelebrityIncomingRingtone() {
  if (celebIncomingRingtoneTimer) {
    clearInterval(celebIncomingRingtoneTimer);
    celebIncomingRingtoneTimer = null;
  }
}

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
    stopCelebrityIncomingRingtone();
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
    stopCelebrityIncomingRingtone();
    alert('🔴 Status: OFFLINE! Incoming fan calls are now disabled.');
  }
}

function simulateIncomingFanCall(callerName = 'Arjun Nair (VIP Gold Fan)') {
  if (!celebAvailable) {
    alert('⚠️ Call Receiving is currently OFF. Turn Call Receiving ON to accept fan calls!');
    return;
  }
  const callerEl = document.getElementById('incoming-caller-name');
  if (callerEl) callerEl.textContent = callerName;

  document.getElementById('celeb-online-waiting-box')?.classList.add('hidden');
  document.getElementById('incoming-fan-call-box')?.classList.remove('hidden');
  startCelebrityIncomingRingtone();
}

function approveIncomingFanCall() {
  stopCelebrityIncomingRingtone();
  playGateBeep(true);

  document.getElementById('incoming-fan-call-box')?.classList.add('hidden');
  document.getElementById('celeb-active-call-box')?.classList.remove('hidden');

  // Start active call timer
  celebActiveCallSeconds = 0;
  if (celebActiveCallTimer) clearInterval(celebActiveCallTimer);
  const timerEl = document.getElementById('celeb-active-call-timer');
  if (timerEl) timerEl.textContent = '00:00';

  celebActiveCallTimer = setInterval(() => {
    celebActiveCallSeconds++;
    const m = String(Math.floor(celebActiveCallSeconds / 60)).padStart(2, '0');
    const s = String(celebActiveCallSeconds % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${m}:${s}`;
  }, 1000);

  // Broadcast approval across browser tabs
  localStorage.setItem('fc_celeb_call_state', JSON.stringify({ state: 'connected', time: Date.now() }));
  alert('✅ Call Approved! 1-on-1 VIP Video Call Connected with fan.');
}

function declineIncomingFanCall() {
  stopCelebrityIncomingRingtone();
  playGateBeep(false);

  document.getElementById('incoming-fan-call-box')?.classList.add('hidden');
  if (celebAvailable) {
    document.getElementById('celeb-online-waiting-box')?.classList.remove('hidden');
  } else {
    document.getElementById('celeb-offline-box')?.classList.remove('hidden');
  }

  // Broadcast decline across browser tabs
  localStorage.setItem('fc_celeb_call_state', JSON.stringify({ state: 'declined', time: Date.now() }));
  alert('Fan call request declined.');
}

function toggleCelebrityCallMute() {
  isCelebCallMuted = !isCelebCallMuted;
  const btn = document.getElementById('btn-celeb-call-mute');
  if (btn) {
    btn.innerHTML = isCelebCallMuted 
      ? '<i class="fa-solid fa-microphone-slash text-rose-400"></i><span>Unmute</span>' 
      : '<i class="fa-solid fa-microphone"></i><span>Mute</span>';
  }
}

function endCelebrityCall() {
  stopCelebrityIncomingRingtone();
  if (celebActiveCallTimer) {
    clearInterval(celebActiveCallTimer);
    celebActiveCallTimer = null;
  }
  document.getElementById('celeb-active-call-box')?.classList.add('hidden');
  if (celebAvailable) {
    document.getElementById('celeb-online-waiting-box')?.classList.remove('hidden');
  } else {
    document.getElementById('celeb-offline-box')?.classList.remove('hidden');
  }

  localStorage.setItem('fc_celeb_call_state', JSON.stringify({ state: 'ended', time: Date.now() }));
  alert(`Call ended. Total duration: ${Math.floor(celebActiveCallSeconds / 60)}m ${celebActiveCallSeconds % 60}s. Coins billed.`);
}

async function loadCelebrityOwnFeed() {
  try {
    const res = await fetch('/api/celebrities/feed');
    const data = await res.json();
    if (data.success) {
      const container = document.getElementById('celeb-own-feed');
      container.innerHTML = data.feed.map(post => {
        const isVideo = post.mediaType === 'VIDEO' || (post.mediaUrl && (post.mediaUrl.startsWith('data:video') || post.mediaUrl.endsWith('.mp4') || post.mediaUrl.endsWith('.webm')));
        const mediaHtml = isVideo
          ? `<video src="${post.mediaUrl}" controls playsinline class="w-full max-h-80 object-cover bg-black"></video>`
          : `<img src="${post.mediaUrl}" class="w-full max-h-80 object-cover">`;

        return `
          <div class="bg-[#111928] border border-slate-800 rounded-2xl overflow-hidden shadow">
            <div class="p-4 flex items-center justify-between">
              <span class="text-xs font-bold text-white flex items-center gap-1.5">
                <span>${post.celebrityName}</span>
                ${isVideo ? '<span class="px-1.5 py-0.5 rounded text-[9px] bg-pink-950/40 text-pink-300 border border-pink-500/30 font-bold">Video</span>' : ''}
              </span>
              <span class="text-[10px] text-slate-400">${new Date(post.createdAt).toLocaleDateString()}</span>
            </div>
            ${mediaHtml}
            <div class="p-4">
              <p class="text-xs text-slate-300 mb-2">${post.caption}</p>
              <div class="text-xs text-pink-400 font-semibold flex items-center gap-1">
                <i class="fa-solid fa-heart"></i>
                <span>${post.likesCount} Fan Likes</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
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
        <div class="fc-glass-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-slate-800">
          <div>
            <h4 class="text-xs font-bold text-white">${evt.title}</h4>
            <p class="text-[11px] text-slate-400">${evt.venueName}, ${evt.city}</p>
            <p class="text-[10px] text-blue-400 mt-1 font-semibold">General Pass: ₹${evt.ticketTiers[0]?.price} • ${evt.ticketTiers[0]?.soldQuantity} Sold</p>
          </div>
          <span class="text-xs px-2.5 py-1 rounded-md bg-blue-950/40 text-blue-300 border border-blue-500/30 font-bold">Approved</span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading org events:', err);
  }
}

// ----------------- GATE QR CODE SCANNER (CAMERA & DEVICE FILES) -----------------

let currentGateScanMode = 'camera';
let gateHtml5QrScanner = null;
let gateCameraStream = null;
let isGateCameraRunning = false;

function playGateBeep(isSuccess = true) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = isSuccess ? 880 : 320;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isSuccess ? 0.22 : 0.45));
    osc.start();
    osc.stop(ctx.currentTime + (isSuccess ? 0.22 : 0.45));
  } catch { /* AudioContext muted / blocked */ }
}

function setGateScanMode(mode) {
  currentGateScanMode = mode;
  ['camera', 'file'].forEach(m => {
    const btn = document.getElementById(`btn-scanmode-${m}`);
    const view = document.getElementById(`gate-scanview-${m}`);
    if (m === mode) {
      if (btn) btn.className = 'py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white flex items-center justify-center gap-1.5 transition';
      view?.classList.remove('hidden');
    } else {
      if (btn) btn.className = 'py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-white flex items-center justify-center gap-1.5 transition';
      view?.classList.add('hidden');
    }
  });

  if (mode !== 'camera' && isGateCameraRunning) {
    stopGateCameraScanner();
  }
}

async function startGateCameraScanner() {
  const idlePlaceholder = document.getElementById('qr-camera-idle-placeholder');
  const laserLine = document.getElementById('qr-laser-line');
  const btnStart = document.getElementById('btn-start-camera-scan');
  const btnStop = document.getElementById('btn-stop-camera-scan');

  btnStart?.classList.add('hidden');
  btnStop?.classList.remove('hidden');
  idlePlaceholder?.classList.add('hidden');
  laserLine?.classList.remove('hidden');

  const viewport = document.getElementById('qr-camera-viewport');
  if (!viewport) return;

  // Method 1: Using Html5Qrcode if loaded from CDN
  if (window.Html5Qrcode) {
    try {
      if (gateHtml5QrScanner) {
        try { await gateHtml5QrScanner.stop(); } catch {}
      }
      gateHtml5QrScanner = new Html5Qrcode('qr-camera-viewport');
      await gateHtml5QrScanner.start(
        { facingMode: 'environment' },
        { fps: 15, qrbox: { width: 180, height: 180 } },
        (decodedText) => {
          onQrCodeDetected(decodedText, 'Camera Scanner');
          stopGateCameraScanner();
        },
        () => { /* frame scanning */ }
      );
      isGateCameraRunning = true;
      return;
    } catch (err) {
      console.warn('Html5Qrcode camera failed, falling back to Native MediaDevices:', err);
    }
  }

  // Method 2: Native navigator.mediaDevices + BarcodeDetector / jsQR
  try {
    gateCameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    viewport.innerHTML = '<video id="gate-native-video" autoplay playsinline muted class="w-full h-full object-cover"></video><canvas id="gate-qr-canvas" class="hidden"></canvas>';
    const video = document.getElementById('gate-native-video');
    video.srcObject = gateCameraStream;
    await video.play();
    isGateCameraRunning = true;

    const barcodeDetector = ('BarcodeDetector' in window)
      ? new BarcodeDetector({ formats: ['qr_code'] })
      : null;

    const scanFrame = async () => {
      if (!isGateCameraRunning || !video) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        if (barcodeDetector) {
          try {
            const codes = await barcodeDetector.detect(video);
            if (codes && codes.length > 0) {
              onQrCodeDetected(codes[0].rawValue, 'Camera Scanner');
              stopGateCameraScanner();
              return;
            }
          } catch {}
        } else if (window.jsQR) {
          const canvas = document.getElementById('gate-qr-canvas');
          if (canvas) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imgData.data, imgData.width, imgData.height);
            if (code && code.data) {
              onQrCodeDetected(code.data, 'Camera Scanner');
              stopGateCameraScanner();
              return;
            }
          }
        }
      }
      if (isGateCameraRunning) {
        requestAnimationFrame(scanFrame);
      }
    };
    requestAnimationFrame(scanFrame);
  } catch (camErr) {
    console.error('Camera access error:', camErr);
    alert('Unable to access device camera. Please check camera permissions, or use "Upload Image" / "Browser Pass" option instead.');
    stopGateCameraScanner();
  }
}

async function stopGateCameraScanner() {
  isGateCameraRunning = false;

  if (gateHtml5QrScanner) {
    try {
      await gateHtml5QrScanner.stop();
      await gateHtml5QrScanner.clear();
    } catch {}
    gateHtml5QrScanner = null;
  }

  if (gateCameraStream) {
    gateCameraStream.getTracks().forEach(t => t.stop());
    gateCameraStream = null;
  }

  const viewport = document.getElementById('qr-camera-viewport');
  if (viewport) viewport.innerHTML = '';

  document.getElementById('qr-camera-idle-placeholder')?.classList.remove('hidden');
  document.getElementById('qr-laser-line')?.classList.add('hidden');
  document.getElementById('btn-start-camera-scan')?.classList.remove('hidden');
  document.getElementById('btn-stop-camera-scan')?.classList.add('hidden');
}

function onQrCodeDetected(rawCode, source = 'Scanner') {
  if (!rawCode) return;
  const cleanCode = rawCode.trim();
  const inputEl = document.getElementById('input-scan-qr');
  if (inputEl) inputEl.value = cleanCode;

  const badge = document.getElementById('scan-detected-badge');
  if (badge) {
    badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>Captured from ${source}</span>`;
    badge.classList.remove('hidden');
  }

  handleScanTicket();
}

async function handleQrImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const previewBox = document.getElementById('qr-file-preview-box');
  const previewImg = document.getElementById('qr-file-preview-img');
  const previewName = document.getElementById('qr-file-name');

  if (previewName) previewName.textContent = file.name;
  if (previewImg) previewImg.src = URL.createObjectURL(file);
  previewBox?.classList.remove('hidden');

  // Try Html5Qrcode file scan
  if (window.Html5Qrcode) {
    try {
      const html5Qr = new Html5Qrcode('qr-camera-viewport');
      const decodedResult = await html5Qr.scanFile(file, true);
      await html5Qr.clear();
      if (decodedResult) {
        onQrCodeDetected(decodedResult, 'Device File');
        return;
      }
    } catch (err) {
      console.warn('Html5Qrcode file scan fallback to canvas:', err);
    }
  }

  // Fallback using HTML Image + canvas + jsQR / BarcodeDetector
  const img = new Image();
  img.src = URL.createObjectURL(file);
  img.onload = async () => {
    try {
      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const codes = await detector.detect(img);
        if (codes && codes.length > 0) {
          onQrCodeDetected(codes[0].rawValue, 'Device File');
          return;
        }
      }

      if (window.jsQR) {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imgData.data, imgData.width, imgData.height);
        if (code && code.data) {
          onQrCodeDetected(code.data, 'Device File');
          return;
        }
      }

      const box = document.getElementById('scan-result-box');
      if (box) {
        box.classList.remove('hidden');
        box.className = 'mt-3 p-3.5 rounded-2xl border border-rose-500/40 bg-rose-950/30 text-rose-300 text-xs';
        box.innerHTML = '<strong>Scan Error:</strong> Could not detect a valid QR code in this image. Please select a clearer ticket image from device files.';
      }
    } catch (decodeErr) {
      console.error('File decode error:', decodeErr);
    }
  };
}

async function handleScanTicket() {
  const hash = document.getElementById('input-scan-qr').value.trim();
  if (!hash) {
    alert('Please enter, upload, or scan a ticket QR code.');
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

    playGateBeep(data.success);

    if (data.success) {
      const b = data.booking || {};
      box.className = 'mt-3 p-3.5 rounded-2xl border border-blue-500/40 bg-blue-950/40 text-blue-200 text-xs space-y-1.5 shadow-lg';
      box.innerHTML = `
        <div class="flex items-center justify-between pb-1.5 border-b border-blue-500/30">
          <span class="font-bold text-white flex items-center gap-1.5">
            <i class="fa-solid fa-circle-check text-blue-400 text-sm"></i>
            <span>ENTRY GRANTED • VALID PASS</span>
          </span>
          <span class="px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-bold text-[10px] border border-blue-500/40">Verified</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-[11px] pt-1">
          <div>
            <span class="text-slate-400 block text-[10px]">Attendee Name</span>
            <span class="font-bold text-white">${b.userName || 'Ticket Holder'}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">Tickets Admitted</span>
            <span class="font-bold text-blue-300">${b.quantity || 1} Person(s)</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">Event Title</span>
            <span class="text-slate-200 truncate block">${b.eventTitle || 'Official Event'}</span>
          </div>
          <div>
            <span class="text-slate-400 block text-[10px]">Tier Category</span>
            <span class="text-slate-200">${b.tierName || 'General Access'}</span>
          </div>
        </div>
        <p class="text-[10px] text-blue-300/80 pt-1 border-t border-blue-500/20 flex items-center gap-1">
          <i class="fa-solid fa-clock text-[9px]"></i> Check-in time: ${new Date().toLocaleTimeString()}
        </p>
      `;
    } else {
      const isAlreadyUsed = data.message?.includes('ALREADY');
      box.className = `mt-3 p-3.5 rounded-2xl border ${isAlreadyUsed ? 'border-amber-500/40 bg-amber-950/30 text-amber-200' : 'border-rose-500/40 bg-rose-950/30 text-rose-200'} text-xs space-y-1 shadow-lg`;
      box.innerHTML = `
        <div class="flex items-center gap-2 font-bold ${isAlreadyUsed ? 'text-amber-300' : 'text-rose-400'}">
          <i class="fa-solid ${isAlreadyUsed ? 'fa-triangle-exclamation' : 'fa-circle-xmark'} text-sm"></i>
          <span>${isAlreadyUsed ? 'DUPLICATE PASS ENTRY DENIED' : 'INVALID TICKET CODE'}</span>
        </div>
        <p class="text-[11px] text-slate-300 mt-1">${data.message}</p>
        ${data.booking ? `<p class="text-[10px] text-slate-400 mt-0.5">Assigned to: <strong>${data.booking.userName}</strong> (${data.booking.eventTitle})</p>` : ''}
      `;
    }
  } catch (err) {
    console.error('Ticket verification error:', err);
    playGateBeep(false);
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
      const tabContainer = document.getElementById('modal-support-messages-list-tab');
      if (tabContainer) {
        tabContainer.innerHTML = container.innerHTML;
        tabContainer.scrollTop = tabContainer.scrollHeight;
      }
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

function renderAdminMetricsGrid(m) {
  const grid = document.getElementById('admin-metrics-grid');
  if (!grid) return;
  const rev = (m.totalRevenueInRupees || 0).toLocaleString();
  grid.innerHTML = `
    <div class="fc-glass-card p-5 border border-slate-800 transition-all hover:scale-[1.02]">
      <div class="flex items-center justify-between text-xs mb-2">
        <span class="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Total Ecosystem Users</span>
        <span class="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center text-sm border border-blue-500/30">
          <i class="fa-solid fa-users"></i>
        </span>
      </div>
      <p class="text-2xl font-black text-white mt-1">${m.totalUsers || 0}</p>
      <p class="text-[10px] text-blue-400 mt-1 flex items-center gap-1">
        <i class="fa-solid fa-arrow-trend-up"></i>
        <span>100% Platform Verified</span>
      </p>
    </div>

    <div class="fc-glass-card p-5 border border-slate-800 transition-all hover:scale-[1.02]">
      <div class="flex items-center justify-between text-xs mb-2">
        <span class="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Active Geo Events</span>
        <span class="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center text-sm border border-blue-500/30">
          <i class="fa-solid fa-calendar-days"></i>
        </span>
      </div>
      <p class="text-2xl font-black text-white mt-1">${m.totalEvents || 0}</p>
      <p class="text-[10px] text-blue-400 mt-1 flex items-center gap-1">
        <i class="fa-solid fa-ticket"></i>
        <span>${m.totalBookings || 0} Passes Sold</span>
      </p>
    </div>

    <div class="fc-glass-card p-5 border border-slate-800 transition-all hover:scale-[1.02]">
      <div class="flex items-center justify-between text-xs mb-2">
        <span class="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Verified Celebrities</span>
        <span class="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center text-sm border border-blue-500/30">
          <i class="fa-solid fa-star"></i>
        </span>
      </div>
      <p class="text-2xl font-black text-white mt-1">${m.totalCelebrities || 0}</p>
      <p class="text-[10px] text-blue-400 mt-1 flex items-center gap-1">
        <i class="fa-solid fa-shield-halved"></i>
        <span>VIP Video Channels Live</span>
      </p>
    </div>

    <div class="fc-glass-card p-5 border border-slate-800 transition-all hover:scale-[1.02]">
      <div class="flex items-center justify-between text-xs mb-2">
        <span class="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Gross Platform Revenue</span>
        <span class="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center text-sm border border-blue-500/30">
          <i class="fa-solid fa-coins"></i>
        </span>
      </div>
      <p class="text-2xl font-black text-blue-400 mt-1">₹${rev}</p>
      <p class="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
        <i class="fa-solid fa-circle-check text-blue-400"></i>
        <span>Settlement Verified</span>
      </p>
    </div>
  `;
}

function renderAdminUsersTable(usersList) {
  const table = document.getElementById('admin-users-table');
  if (!table) return;

  const users = (usersList && usersList.length > 0) ? usersList : (allUsers || []);

  const countBadge = document.getElementById('admin-users-count');
  if (countBadge) {
    countBadge.textContent = `${users.length} Total Users`;
  }

  if (!users || users.length === 0) {
    table.innerHTML = `
      <tr>
        <td colspan="5" class="px-5 py-8 text-center text-slate-400">
          <div class="flex flex-col items-center justify-center gap-2">
            <i class="fa-solid fa-users-slash text-2xl text-slate-600"></i>
            <span class="text-xs font-semibold">No registered users found</span>
            <button onclick="loadAdminMetrics()" class="mt-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition flex items-center gap-1.5 mx-auto">
              <i class="fa-solid fa-arrows-rotate"></i> Try Reloading Users
            </button>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  table.innerHTML = users.map(u => {
    const isRootAdmin = u.role === 'SUPER_ADMIN';
    const isBanned = Boolean(u.isBanned);

    let roleBadgeClass = 'bg-blue-950/40 text-blue-300 border-blue-500/30';
    let roleIcon = 'fa-user';
    if (u.role === 'SUPER_ADMIN') {
      roleBadgeClass = 'bg-blue-600 text-white border-blue-400';
      roleIcon = 'fa-crown';
    } else if (u.role === 'CELEBRITY') {
      roleBadgeClass = 'bg-blue-950/50 text-blue-300 border-blue-500/40';
      roleIcon = 'fa-star';
    } else if (u.role === 'ORGANIZATION') {
      roleBadgeClass = 'bg-slate-800 text-slate-200 border-slate-600';
      roleIcon = 'fa-building';
    } else if (u.role === 'SUPPORT') {
      roleBadgeClass = 'bg-blue-950/30 text-blue-300 border-blue-500/20';
      roleIcon = 'fa-headset';
    }

    return `
      <tr class="hover:bg-blue-950/20 transition">
        <td class="px-5 py-3.5 flex items-center gap-3 font-medium">
          <img src="${u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'}" class="w-8 h-8 rounded-full object-cover border border-slate-700 shadow-sm flex-shrink-0">
          <div class="overflow-hidden">
            <p class="font-bold text-white text-xs truncate flex items-center gap-1.5">
              <span>${u.fullName}</span>
              ${u.isPremium ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">VIP</span>' : ''}
            </p>
            <span class="text-[10px] text-slate-400 font-mono block truncate">${u.id}</span>
          </div>
        </td>
        <td class="px-5 py-3.5 font-mono text-[11px] text-slate-300 whitespace-nowrap">
          ${u.phoneNumber || 'N/A'}
        </td>
        <td class="px-5 py-3.5 whitespace-nowrap">
          <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1.5 w-fit ${roleBadgeClass}">
            <i class="fa-solid ${roleIcon} text-[9px]"></i>
            <span>${u.role}</span>
          </span>
        </td>
        <td class="px-5 py-3.5 whitespace-nowrap">
          <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold border flex items-center gap-1.5 w-fit ${isBanned ? 'bg-rose-950/40 text-rose-300 border-rose-500/40' : 'bg-blue-950/40 text-blue-300 border-blue-500/30'}">
            <span class="w-1.5 h-1.5 rounded-full ${isBanned ? 'bg-rose-400' : 'bg-blue-400 animate-pulse'}"></span>
            <span>${isBanned ? 'Suspended' : 'Active Account'}</span>
          </span>
        </td>
        <td class="px-5 py-3.5 text-right whitespace-nowrap">
          ${!isRootAdmin ? `
            <button onclick="toggleBanUser('${u.id}', ${!isBanned})" class="px-3 py-1.5 rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5 ml-auto ${isBanned ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-800 hover:bg-rose-600/90 text-slate-300 hover:text-white border border-slate-700'}">
              <i class="fa-solid ${isBanned ? 'fa-user-check' : 'fa-ban'}"></i>
              <span>${isBanned ? 'Unban User' : 'Ban User'}</span>
            </button>
          ` : `
            <span class="px-2.5 py-1 rounded-lg text-[10px] text-blue-300 bg-blue-950/40 border border-blue-500/30 font-bold uppercase tracking-wider inline-flex items-center gap-1">
              <i class="fa-solid fa-lock text-[9px]"></i> Root Protected
            </span>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

async function loadAdminMetrics() {
  if (!currentToken || currentUser?.role !== 'SUPER_ADMIN') return;

  try {
    const res = await fetch('/api/admin/metrics', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success) {
      if (data.metrics) {
        renderAdminMetricsGrid(data.metrics);
      }
      if (Array.isArray(data.users) && data.users.length > 0) {
        allUsers = data.users;
        renderAdminUsersTable(allUsers);
        return;
      }
    }
  } catch (err) {
    console.warn('Admin metrics error:', err);
  }

  // Guaranteed fallback: fetch users explicitly via /api/users
  try {
    await fetchAllUsers();
    renderAdminUsersTable(allUsers);
  } catch (err) {
    console.error('Failed to load users for admin table:', err);
  }
}

async function toggleBanUser(targetUserId, ban) {
  const actionText = ban ? 'ban/suspend' : 'unban/reactivate';
  if (!confirm(`Are you sure you want to ${actionText} this user account?`)) return;

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
      await loadAdminMetrics();
    } else {
      alert(data.error || 'Failed to update user moderation status.');
    }
  } catch (err) {
    console.error('Ban error:', err);
    alert('Network error while updating user status.');
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
      container.innerHTML = data.feed.map(post => {
        const isVideo = post.mediaType === 'VIDEO' || (post.mediaUrl && (post.mediaUrl.startsWith('data:video') || post.mediaUrl.endsWith('.mp4') || post.mediaUrl.endsWith('.webm')));
        const mediaHtml = isVideo
          ? `<video src="${post.mediaUrl}" controls playsinline class="w-full max-h-80 object-cover bg-black"></video>`
          : `<img src="${post.mediaUrl}" class="w-full max-h-80 object-cover">`;

        return `
          <div class="bg-[#111928] border border-slate-800 rounded-2xl overflow-hidden shadow">
            <div class="p-4 flex items-center gap-3">
              <img src="${post.celebrityAvatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'}" class="w-10 h-10 rounded-full object-cover border border-blue-500 shadow">
              <div>
                <h4 class="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>${post.celebrityName}</span>
                  ${isVideo ? '<span class="px-1.5 py-0.5 rounded text-[9px] bg-pink-950/40 text-pink-300 border border-pink-500/30 font-bold">Video</span>' : ''}
                </h4>
                <span class="text-[10px] text-slate-400">${new Date(post.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            ${mediaHtml}
            <div class="p-4">
              <p class="text-xs text-slate-300 mb-3">${post.caption}</p>
              <div class="flex items-center justify-between pt-2 border-t border-slate-800">
                <button onclick="likeCelebrityPost('${post.id}')" class="px-3 py-1.5 rounded-lg bg-pink-950/40 border border-pink-500/30 text-rose-400 hover:bg-pink-900/40 text-xs font-bold flex items-center gap-1.5 transition">
                  <i class="fa-solid fa-heart"></i>
                  <span id="like-count-${post.id}">${post.likesCount} Likes</span>
                </button>
                <span class="text-[10px] text-blue-400/80 font-medium flex items-center gap-1">
                  <i class="fa-solid fa-circle-check text-blue-400"></i>
                  <span>Verified Celebrity Post</span>
                </span>
              </div>
            </div>
          </div>
        `;
      }).join('');
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
      document.getElementById('evt-banner-preview-box')?.classList.add('hidden');
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

  const determinedType = currentCelebUploadedMediaType || (mediaUrl.startsWith('data:video') || mediaUrl.endsWith('.mp4') ? 'VIDEO' : 'IMAGE');

  try {
    const res = await fetch('/api/celebrities/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({
        mediaType: determinedType,
        mediaUrl,
        caption
      })
    });

    const data = await res.json();
    if (data.success) {
      alert(`🌟 ${determinedType === 'VIDEO' ? 'Video' : 'Photo'} shared successfully with your fans!`);
      document.getElementById('media-input-caption').value = '';
      document.getElementById('celeb-media-preview-box')?.classList.add('hidden');
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
  const tabContainer = document.getElementById('modal-support-messages-list-tab');
  if (!container && !tabContainer) return;

  try {
    const res = await fetch('/api/support/tickets', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    const data = await res.json();
    if (data.success && data.tickets && data.tickets.length > 0) {
      const ticket = data.tickets[0];
      currentSupportTicketId = ticket.id;

      if (!ticket.messages || ticket.messages.length === 0) {
        const emptyHtml = `
          <div class="text-center py-8 text-xs text-slate-400">
            <i class="fa-solid fa-headset text-2xl text-slate-600 mb-2"></i>
            <p class="font-bold text-slate-300">Welcome to Priority Support Desk!</p>
            <p class="text-[11px] text-slate-500 mt-1">No messages yet. Send your query below to get instant assistance from Rahul.</p>
          </div>
        `;
        if (container) container.innerHTML = emptyHtml;
        if (tabContainer) tabContainer.innerHTML = emptyHtml;
        return;
      }

      const html = ticket.messages.map(msg => {
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

      if (container) {
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
      }
      if (tabContainer) {
        tabContainer.innerHTML = html;
        tabContainer.scrollTop = tabContainer.scrollHeight;
      }
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

// ----------------- DIRECT LOCAL DEVICE FILE UPLOADS (ALL LOGINS) -----------------

let currentCelebUploadedMediaType = 'IMAGE';

// 1. Profile Avatar Direct Device File Upload
async function handleAvatarFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('Please select an image file (PNG, JPG, WebP) from your device.');
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    const dataUrl = e.target.result;
    const avatarEl = document.getElementById('user-avatar');
    if (avatarEl) avatarEl.src = dataUrl;

    if (currentUser) {
      currentUser.avatarUrl = dataUrl;
      try {
        await fetch('/api/auth/profile', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
          },
          body: JSON.stringify({ avatarUrl: dataUrl })
        });
        localStorage.setItem('fc_session', JSON.stringify({ user: currentUser, token: currentToken }));
        alert('🎉 Profile picture updated successfully from device files!');
      } catch (err) {
        console.error('Failed to update avatar:', err);
      }
    }
  };
  reader.readAsDataURL(file);
}

// 2. Organization Event Banner Direct Device File Upload
function handleEventBannerFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const input = document.getElementById('evt-input-banner');
    if (input) input.value = dataUrl;

    const previewBox = document.getElementById('evt-banner-preview-box');
    const previewImg = document.getElementById('evt-banner-preview-img');
    const previewName = document.getElementById('evt-banner-name');
    const previewSize = document.getElementById('evt-banner-size');

    if (previewImg) previewImg.src = dataUrl;
    if (previewName) previewName.textContent = file.name;
    if (previewSize) previewSize.textContent = `${(file.size / 1024).toFixed(1)} KB • Loaded from Device File`;
    previewBox?.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

// 3. Celebrity Post Direct Device File Upload (Photos & Videos)
function handleCelebMediaFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const isVideo = file.type.startsWith('video');
  currentCelebUploadedMediaType = isVideo ? 'VIDEO' : 'IMAGE';

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const input = document.getElementById('media-input-url');
    if (input) input.value = dataUrl;

    const previewBox = document.getElementById('celeb-media-preview-box');
    const previewContent = document.getElementById('celeb-media-preview-content');
    const previewName = document.getElementById('celeb-media-name');
    const previewBadge = document.getElementById('celeb-media-type-badge');

    if (previewContent) {
      if (isVideo) {
        previewContent.innerHTML = `<video src="${dataUrl}" controls playsinline class="w-full max-h-48 rounded-xl object-cover bg-black"></video>`;
      } else {
        previewContent.innerHTML = `<img src="${dataUrl}" class="w-full max-h-48 rounded-xl object-cover bg-slate-800">`;
      }
    }

    if (previewName) previewName.textContent = file.name;
    if (previewBadge) {
      previewBadge.textContent = isVideo ? '🎬 Video Clip' : '📷 Photo File';
      previewBadge.className = isVideo 
        ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-950/40 text-pink-300 border border-pink-500/30' 
        : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950/40 text-blue-300 border border-blue-500/30';
    }
    previewBox?.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

// 4. Multi-tab Celebrity Call Approval & Status Sync Listener
window.addEventListener('storage', (event) => {
  // If celebrity receives call request from fan in another tab
  if (event.key === 'fc_incoming_celeb_call' && event.newValue) {
    if (currentUser?.role === 'CELEBRITY' && celebAvailable) {
      try {
        const payload = JSON.parse(event.newValue);
        simulateIncomingFanCall(`${payload.caller} (VIP Fan)`);
      } catch {}
    }
  }

  // If fan is waiting and celebrity approves or declines
  if (event.key === 'fc_celeb_call_state' && event.newValue) {
    if (currentUser?.role === 'NORMAL') {
      try {
        const payload = JSON.parse(event.newValue);
        if (payload.state === 'connected') {
          setCallState('connected', true);
          alert('🎉 Dulquer Sithara APPROVED your call! Connected now.');
        } else if (payload.state === 'declined') {
          setCallState('idle');
          alert('❌ Dulquer Sithara declined the call request.');
        } else if (payload.state === 'ended') {
          setCallState('idle');
        }
      } catch {}
    }
  }
});
