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
let activeRemoteStream = null;
let celebRemoteStream = null;
let celebLocalStream = null;
let isCelebCameraOff = false;
let isCelebActiveCall = false;
let isVipCallMinimized = false;
let callerCallState = 'IDLE'; // 'IDLE' | 'RINGING' | 'CONNECTED' | 'ENDED' | 'DECLINED'
const handledCallSessions = new Set();
let lastFanCallerName = 'Arjun Nair (VIP Gold Fan)';
let celebCallChannel = null;
let currentCallPartner = null;
let currentCallHasVideo = false;
let selectedEventForBooking = null;
let selectedTicketTier = null;
let bookingQty = 1;
let activeDistanceFilter = 50;

// WebRTC Peer Connection State for Real Live Camera Calls
let rtcPeerConnection = null;
let rtcIceQueue = [];

// ==============================================================
// PEERJS REAL-TIME CALLING ENGINE (ZERO-LATENCY HD AUDIO & VIDEO)
// ==============================================================
let appPeer = null;
let activePeerCall = null;
const CELEB_PEER_ID = 'bondify-celeb-dulquer-sithara';

function initAppPeer() {
  if (appPeer && !appPeer.destroyed) return;
  if (typeof Peer === 'undefined') {
    console.warn('PeerJS library not loaded yet, will retry in 500ms');
    setTimeout(initAppPeer, 500);
    return;
  }

  const isCeleb = (currentUser && (currentUser.role === 'CELEBRITY' || currentUser.id === 'usr_celeb_1')) ||
    (document.getElementById('dashboard-celebrity') && !document.getElementById('dashboard-celebrity').classList.contains('hidden'));

  const myPeerId = isCeleb ? CELEB_PEER_ID : `bondify-fan-${currentUser?.id || 'usr_normal_1'}-${Date.now().toString(36)}`;

  try {
    appPeer = new Peer(myPeerId, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:openrelay.metered.ca:80' },
          {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          },
          {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
          }
        ],
        sdpSemantics: 'unified-plan'
      }
    });

    appPeer.on('open', (id) => {
      console.log(`[PeerJS Ready] Connected with ID: ${id} (isCeleb: ${isCeleb})`);
    });

    // When Celebrity receives an incoming call from Fan
    appPeer.on('call', async (incomingCall) => {
      console.log('[PeerJS] Incoming call received from:', incomingCall.peer);
      activePeerCall = incomingCall;

      const callId = incomingCall.metadata?.callId || activeServerCallId || ('call_' + Date.now());
      activeServerCallId = callId;

      const callType = incomingCall.metadata?.callType || 'CELEBRITY_VIDEO';
      inChatCurrentCallType = callType;

      const callerName = incomingCall.metadata?.callerName || lastFanCallerName || 'Arjun Nair (VIP Fan)';
      simulateIncomingFanCall(callerName, callId, callType);

      // Listen for remote disconnect from caller
      incomingCall.on('close', () => {
        console.log('[PeerJS] Call ended by caller');
        if (isCelebActiveCall) {
          endCelebrityCall(true);
          notifyCallEnded('📞 Fan ended / disconnected the call.');
        }
      });

      incomingCall.on('error', (err) => {
        console.warn('[PeerJS] Incoming call error:', err);
      });
    });

    appPeer.on('error', (err) => {
      console.warn('[PeerJS Error]:', err.type, err);
      if (err.type === 'unavailable-id' && isCeleb) {
        console.log('[PeerJS] Celebrity ID in use, attempting clean re-connect');
        setTimeout(() => {
          if (appPeer) {
            try { appPeer.destroy(); } catch {}
          }
          appPeer = null;
          initAppPeer();
        }, 2000);
      }
    });
  } catch (err) {
    console.error('[PeerJS Init Error]:', err);
  }
}

window.addEventListener('beforeunload', () => {
  if (appPeer) {
    try { appPeer.destroy(); } catch {}
  }
});

function getCelebCallChannel() {
  if (!window.celebCallChannel) {
    try {
      window.celebCallChannel = new BroadcastChannel('fc_celebrity_calls');
      window.celebCallChannel.onmessage = (event) => {
        handleCrossTabCallEvent(event.data);
      };
    } catch (e) {
      console.warn('[BroadcastChannel] Init error:', e);
    }
  }
  return window.celebCallChannel;
}

const seenCallMsgIds = new Set();
function postCrossTabCallEvent(payload) {
  const msgId = payload.msgId || `${payload.type || payload.state}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const messageWithId = { ...payload, msgId };
  seenCallMsgIds.add(msgId);

  try {
    const ch = getCelebCallChannel();
    if (ch) ch.postMessage(messageWithId);
  } catch (e) {}
  try {
    const syncKey = payload.type ? `fc_celeb_call_sync_${payload.type}` : 'fc_celeb_call_state';
    localStorage.setItem(syncKey, JSON.stringify({ ...messageWithId, _t: Date.now() }));
  } catch (e) {}
}

async function acquireUserMediaSafely() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('No mediaDevices support in browser');
  }

  // Tier 1: User-Facing HD Camera with full audio processing
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    if (stream && stream.getAudioTracks().length > 0) return stream;
  } catch (err1) {
    console.log('[Media] Tier 1 facingMode failed, trying flexible constraints:', err1?.name || err1);
  }

  // Tier 2: Flexible standard video + audio
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: {
        echoCancellation: true,
        noiseSuppression: true
      }
    });
    if (stream && stream.getAudioTracks().length > 0) return stream;
  } catch (err2) {
    console.log('[Media] Tier 2 flexible video+audio failed, trying separate video & audio:', err2?.name || err2);
  }

  // Tier 3: Standalone Video & Microphone Acquisition (Guarantees Laptop Mics are NEVER Dropped!)
  let videoStream = null;
  let audioStream = null;

  try {
    videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
  } catch (errVid) {
    console.warn('[Media] Standalone camera error:', errVid?.name || errVid);
  }

  try {
    audioStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    }).catch(() => navigator.mediaDevices.getUserMedia({ audio: true }));
  } catch (errAud) {
    console.warn('[Media] Standalone microphone error:', errAud?.name || errAud);
  }

  if (videoStream || audioStream) {
    const combined = new MediaStream();
    if (videoStream) {
      videoStream.getVideoTracks().forEach(t => combined.addTrack(t));
    }
    if (audioStream) {
      audioStream.getAudioTracks().forEach(t => {
        t.enabled = true;
        combined.addTrack(t);
      });
    }
    return combined;
  }

  throw new Error('No camera or microphone devices accessible');
}

async function acquireUserAudioOnlySafely() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    console.warn('[Audio] No mediaDevices support, using synthetic stream');
    return createSyntheticSilentAudioStream();
  }

  // Tier 1: Optimized voice constraints
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    if (s && s.getAudioTracks().length > 0) {
      s.getAudioTracks().forEach(t => { t.enabled = true; });
      return s;
    }
  } catch (e1) {
    console.warn('[Audio] Tier 1 mic failed, trying Tier 2:', e1);
  }

  // Tier 2: Plain unconstrained audio: true
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: true
    });
    if (s && s.getAudioTracks().length > 0) {
      s.getAudioTracks().forEach(t => { t.enabled = true; });
      return s;
    }
  } catch (e2) {
    console.warn('[Audio] Tier 2 mic failed, trying Tier 3:', e2);
  }

  // Tier 3: Basic audio with minimal constraint
  try {
    const s = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1 }
    });
    if (s && s.getAudioTracks().length > 0) {
      s.getAudioTracks().forEach(t => { t.enabled = true; });
      return s;
    }
  } catch (e3) {
    console.warn('[Audio] Tier 3 mic failed:', e3);
  }

  // Tier 4: Synthetic Audio track so PeerJS always has a valid transceiver
  return createSyntheticSilentAudioStream();
}

function createSyntheticSilentAudioStream() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const dst = ctx.createMediaStreamDestination();
      const gain = ctx.createGain();
      gain.gain.value = 0.001; // nearly silent carrier
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      return dst.stream;
    }
  } catch (e) {
    console.warn('[Audio] Synthetic stream error:', e);
  }
  return new MediaStream();
}

let isVipSpeakerOn = false;

function updateSpeakerButtonsUI(enableSpeaker) {
  const btnInchat = document.getElementById('btn-inchat-speaker');
  const iconInchat = document.getElementById('btn-inchat-speaker-icon');
  const btnCeleb = document.getElementById('btn-celeb-speaker');
  const iconCeleb = document.getElementById('btn-celeb-speaker-icon');

  const activeClass = 'w-14 h-14 rounded-full bg-emerald-500/30 text-emerald-300 border-2 border-emerald-400 flex items-center justify-center text-xl transition shadow-2xl shadow-emerald-950/60 active:scale-95 cursor-pointer';
  const inactiveClass = 'w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center text-xl border border-white/20 transition shadow-2xl active:scale-95 cursor-pointer';

  [btnInchat, btnCeleb].forEach(btn => {
    if (btn) btn.className = enableSpeaker ? activeClass : inactiveClass;
  });

  [iconInchat, iconCeleb].forEach(icon => {
    if (icon) {
      icon.className = enableSpeaker ? 'fa-solid fa-volume-high text-emerald-300' : 'fa-solid fa-volume-low text-slate-300';
    }
  });
}

async function setSpeakerphoneOutput(enableSpeaker, showToast = false) {
  isVipSpeakerOn = !!enableSpeaker;
  const audioEl = document.getElementById('vip-remote-audio');
  const inchatVid = document.getElementById('normal-inchat-remote-video');
  const celebVid = document.getElementById('celeb-remote-video');

  // Volume: Always keep full 1.0 volume for crystal-clear two-way audio
  if (audioEl) {
    audioEl.volume = 1.0;
    audioEl.muted = false;
  }
  if (inchatVid) {
    inchatVid.volume = 1.0;
  }
  if (celebVid) {
    celebVid.volume = 1.0;
  }

  // Hardware audio sink routing (Android Chrome / Edge / Chrome)
  if (navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      if (outputs.length > 0) {
        let chosenSink = '';
        if (enableSpeaker) {
          const spk = outputs.find(d => /speaker|loudspeaker|external/i.test(d.label));
          if (spk) chosenSink = spk.deviceId;
        } else {
          const earp = outputs.find(d => /earpiece|receiver|phone|handset/i.test(d.label));
          if (earp) chosenSink = earp.deviceId;
        }

        const applySink = async (el) => {
          if (el && typeof el.setSinkId === 'function') {
            try { await el.setSinkId(chosenSink); } catch {}
          }
        };

        await applySink(audioEl);
        await applySink(inchatVid);
        await applySink(celebVid);
      }
    } catch (e) {
      console.warn('[Speaker] setSinkId routing error:', e);
    }
  }

  updateSpeakerButtonsUI(enableSpeaker);

  if (showToast) {
    showCallToast(enableSpeaker ? '🔊 Speaker On (Loudspeaker)' : '🎧 Earpiece / Default Output');
  }
}

function toggleInChatSpeaker() {
  setSpeakerphoneOutput(!isVipSpeakerOn, true);
}

function toggleCelebritySpeaker() {
  setSpeakerphoneOutput(!isVipSpeakerOn, true);
}

function attachRemoteVideoStream(videoEl, frameImg, stream) {
  if (!videoEl || !stream) return;
  console.log('[attachRemoteVideoStream] Attaching remote stream to', videoEl.id, stream);

  // 1. Unhide and display video element immediately
  videoEl.classList.remove('hidden');
  videoEl.style.display = 'block';
  videoEl.srcObject = stream;

  // 2. Ensure all incoming tracks are enabled
  try {
    stream.getVideoTracks().forEach(t => { t.enabled = true; });
    stream.getAudioTracks().forEach(t => { t.enabled = true; });
  } catch (e) {}

  const onFrameReady = () => {
    videoEl.classList.remove('hidden');
    videoEl.style.display = 'block';
    if (frameImg && (videoEl.videoWidth > 0 || videoEl.currentTime > 0)) {
      frameImg.classList.add('hidden');
      frameImg.style.display = 'none';
    }
  };

  ['loadedmetadata', 'canplay', 'playing', 'timeupdate', 'resize'].forEach(evt => {
    videoEl.addEventListener(evt, onFrameReady, { passive: true });
  });

  // 3. Play video with robust fallback: keep video muted so mobile browsers never block video or sound
  videoEl.muted = true;
  videoEl.play().then(onFrameReady).catch(err => {
    console.warn('[Video] Play retry:', err);
    videoEl.play().then(onFrameReady).catch(() => {});
  });
}

function preUnlockAudioElements() {
  try {
    const audioEl = document.getElementById('vip-remote-audio');
    if (audioEl) {
      audioEl.muted = false;
      audioEl.volume = 1.0;
      audioEl.play().then(() => audioEl.pause()).catch(() => {});
    }
  } catch (e) {}
}

function playRemoteVipAudio(stream) {
  if (!stream) return;
  let audioEl = document.getElementById('vip-remote-audio');
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.id = 'vip-remote-audio';
    audioEl.autoplay = true;
    audioEl.playsInline = true;
    document.body.appendChild(audioEl);
  }
  audioEl.srcObject = stream;
  audioEl.muted = false;
  audioEl.volume = 1.0; // Crystal clear high volume for VIP calls

  try {
    stream.getAudioTracks().forEach(t => { t.enabled = true; });
  } catch (e) {}

  audioEl.play().then(() => {
    document.getElementById('inchat-unmute-overlay')?.classList.add('hidden');
  }).catch(err => {
    console.warn('[VIP Audio Playback] Autoplay waiting for user gesture on mobile:', err);
    // Show polite tap-to-unmute pill if mobile browser held sound
    document.getElementById('inchat-unmute-overlay')?.classList.remove('hidden');
    const unlockAudio = () => {
      audioEl.play().then(() => {
        document.getElementById('inchat-unmute-overlay')?.classList.add('hidden');
      }).catch(() => {});
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
    };
    document.addEventListener('click', unlockAudio, { once: true });
    document.addEventListener('touchstart', unlockAudio, { once: true });
  });
}

function unmuteVipAudioNow() {
  const audioEl = document.getElementById('vip-remote-audio');
  if (audioEl) {
    audioEl.muted = false;
    audioEl.volume = 1.0;
    audioEl.play().catch(() => {});
  }
  document.getElementById('inchat-unmute-overlay')?.classList.add('hidden');
  showCallToast('🔊 Celebrity audio unmuted at full volume!');
}

async function getOrCreateLocalCamera(isCeleb = false) {
  if (isCeleb) {
    if (celebLocalStream && celebLocalStream.active && celebLocalStream.getVideoTracks().some(t => t.readyState === 'live')) {
      const localVid = document.getElementById('celeb-local-video');
      if (localVid) {
        localVid.srcObject = celebLocalStream;
        localVid.play().catch(() => {});
      }
      return celebLocalStream;
    }
    // If celebLocalStream exists but has NO live video tracks, stop it first
    if (celebLocalStream) {
      try { celebLocalStream.getTracks().forEach(t => t.stop()); } catch {}
      celebLocalStream = null;
    }
    try {
      celebLocalStream = await acquireUserMediaSafely();
    } catch (err) {
      console.warn('[Camera] Celeb getUserMedia fallback to canvas:', err);
      const celebAvatar = currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150';
      celebLocalStream = createLiveVideoStream(celebAvatar, 'Dulquer Sithara (Host Camera)', 'Celebrity Camera Feed');
    }
    // Guarantee active microphone on celebrity stream
    if (celebLocalStream && celebLocalStream.getAudioTracks().length === 0) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach(t => { t.enabled = true; celebLocalStream.addTrack(t); });
      } catch (e) {}
    }
    if (celebLocalStream) {
      celebLocalStream.getAudioTracks().forEach(t => { t.enabled = true; });
    }
    const localVid = document.getElementById('celeb-local-video');
    if (localVid) {
      localVid.srcObject = celebLocalStream;
      localVid.play().catch(() => {});
    }
    return celebLocalStream;
  } else {
    if (localMediaStream && localMediaStream.active && localMediaStream.getVideoTracks().some(t => t.readyState === 'live')) {
      const inChatLocalVid = document.getElementById('normal-inchat-local-video');
      if (inChatLocalVid) {
        inChatLocalVid.srcObject = localMediaStream;
        inChatLocalVid.play().catch(() => {});
      }
      const localVid = document.getElementById('local-video');
      if (localVid) {
        localVid.srcObject = localMediaStream;
        localVid.play().catch(() => {});
      }
      return localMediaStream;
    }
    // If localMediaStream exists but has NO live video tracks, stop it first
    if (localMediaStream) {
      try { localMediaStream.getTracks().forEach(t => t.stop()); } catch {}
      localMediaStream = null;
    }
    try {
      localMediaStream = await acquireUserMediaSafely();
    } catch (err) {
      console.warn('[Camera] User getUserMedia fallback to canvas:', err);
      const myAvatar = currentUser?.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200';
      const myName = currentUser?.fullName || 'Arjun Nair';
      localMediaStream = createLiveVideoStream(myAvatar, `${myName} (Camera)`, 'User Camera Feed');
    }
    const inChatLocalVid = document.getElementById('normal-inchat-local-video');
    if (inChatLocalVid) {
      inChatLocalVid.srcObject = localMediaStream;
      inChatLocalVid.play().catch(() => {});
    }
    const localVid = document.getElementById('local-video');
    if (localVid) {
      localVid.srcObject = localMediaStream;
      localVid.play().catch(() => {});
    }
    return localMediaStream;
  }
}

function initWebRtcConnection(role) {
  if (rtcPeerConnection) {
    try {
      rtcPeerConnection.ontrack = null;
      rtcPeerConnection.onicecandidate = null;
      rtcPeerConnection.close();
    } catch {}
    rtcPeerConnection = null;
  }
  rtcIceQueue = [];

  const rtcConfig = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:openrelay.metered.ca:80' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  };

  rtcPeerConnection = new RTCPeerConnection(rtcConfig);

  // Attach local stream tracks to WebRTC
  const localStream = role === 'CELEBRITY' ? celebLocalStream : localMediaStream;
  if (localStream) {
    localStream.getTracks().forEach(track => {
      rtcPeerConnection.addTrack(track, localStream);
    });
  }

  // When remote live camera arrives from the peer!
  rtcPeerConnection.ontrack = (event) => {
    console.log(`[WebRTC ${role}] Received remote stream:`, event.streams);
    const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);

    if (role === 'CELEBRITY') {
      const remoteVid = document.getElementById('celeb-remote-video');
      const frameImg = document.getElementById('celeb-remote-frame');
      if (remoteVid) {
        remoteVid.srcObject = stream;
        remoteVid.onplaying = () => {
          remoteVid.classList.remove('hidden');
          if (frameImg) frameImg.classList.add('hidden');
        };
        remoteVid.play().then(() => {
          remoteVid.classList.remove('hidden');
          if (frameImg) frameImg.classList.add('hidden');
        }).catch(e => console.log('Celeb remote video play error:', e));
      }
    } else {
      const inChatRemoteVid = document.getElementById('normal-inchat-remote-video');
      const frameImg = document.getElementById('normal-inchat-remote-frame');
      if (inChatRemoteVid) {
        inChatRemoteVid.srcObject = stream;
        inChatRemoteVid.onplaying = () => {
          inChatRemoteVid.classList.remove('hidden');
          if (frameImg) frameImg.classList.add('hidden');
        };
        inChatRemoteVid.play().then(() => {
          inChatRemoteVid.classList.remove('hidden');
          if (frameImg) frameImg.classList.add('hidden');
        }).catch(e => console.log('In-chat remote video play error:', e));
      }
      const remoteVid = document.getElementById('remote-video');
      const fallback = document.getElementById('remote-video-fallback');
      if (fallback) fallback.classList.add('hidden');
      if (remoteVid) {
        remoteVid.classList.remove('hidden');
        remoteVid.srcObject = stream;
        remoteVid.play().catch(e => console.log('Normal remote video play error:', e));
      }
    }
  };

  // ICE candidate exchange
  rtcPeerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendWebRtcSignal({
        type: 'RTC_ICE_CANDIDATE',
        candidate: event.candidate.toJSON(),
        fromRole: role
      });
    }
  };

  return rtcPeerConnection;
}

function sendWebRtcSignal(signal) {
  postCrossTabCallEvent(signal);
  if (activeServerCallId) {
    fetch('/api/celebrities/call/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: activeServerCallId, signal })
    }).catch(e => console.warn('WebRTC signal POST error:', e));
  }
}

// ----------------- LIVE VIDEO FRAME RELAY ENGINE (100% BLANK-SCREEN PREVENTION FALLBACK) -----------------
let liveFrameInterval = null;
function startLiveFrameStreaming(role) {
  if (liveFrameInterval) clearInterval(liveFrameInterval);
  liveFrameInterval = setInterval(() => {
    if (!isCelebActiveCall || inChatCurrentCallType !== 'CELEBRITY_VIDEO') {
      clearInterval(liveFrameInterval);
      liveFrameInterval = null;
      return;
    }
    const vidId = role === 'CELEBRITY' ? 'celeb-local-video' : 'normal-inchat-local-video';
    const localVid = document.getElementById(vidId);
    if (!localVid) return;
    if (localVid.paused && localVid.srcObject) {
      localVid.play().catch(() => {});
    }
    if (localVid.videoWidth === 0) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(localVid, 0, 0, 640, 480);
      const frame = canvas.toDataURL('image/jpeg', 0.6);

      fetch('/api/celebrities/call/frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callId: activeServerCallId || 'active', role, frame })
      }).catch(() => {});
    } catch (e) {}
  }, 500);
}

function stopLiveFrameStreaming() {
  if (liveFrameInterval) {
    clearInterval(liveFrameInterval);
    liveFrameInterval = null;
  }
}

function applyRemoteVideoFrame(frame, fromRole) {
  if (!frame) return;
  if (fromRole === 'CELEBRITY') {
    const remoteVid = document.getElementById('normal-inchat-remote-video');
    const frameImg = document.getElementById('normal-inchat-remote-frame');
    // If real-time WebRTC video track is active with decoded video frames, keep remote video visible
    if (remoteVid && remoteVid.srcObject && remoteVid.videoWidth > 0 && !remoteVid.paused) {
      remoteVid.classList.remove('hidden');
      remoteVid.style.display = 'block';
      if (frameImg) {
        frameImg.classList.add('hidden');
        frameImg.style.display = 'none';
      }
      return;
    }
    // WebRTC connecting or empty: seamlessly render incoming live camera frame
    if (frameImg) {
      frameImg.src = frame;
      frameImg.classList.remove('hidden');
      frameImg.style.display = 'block';
    }
  } else if (fromRole === 'NORMAL_USER') {
    const remoteVid = document.getElementById('celeb-remote-video');
    const frameImg = document.getElementById('celeb-remote-frame');
    // If real-time WebRTC video track is active with decoded video frames, keep remote video visible
    if (remoteVid && remoteVid.srcObject && remoteVid.videoWidth > 0 && !remoteVid.paused) {
      remoteVid.classList.remove('hidden');
      remoteVid.style.display = 'block';
      if (frameImg) {
        frameImg.classList.add('hidden');
        frameImg.style.display = 'none';
      }
      return;
    }
    // WebRTC connecting or empty: seamlessly render incoming live camera frame
    if (frameImg) {
      frameImg.src = frame;
      frameImg.classList.remove('hidden');
      frameImg.style.display = 'block';
    }
  }
}

async function createAndSendRtcOffer() {
  try {
    const pc = rtcPeerConnection;
    if (!pc) return;
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    await pc.setLocalDescription(offer);
    sendWebRtcSignal({
      type: 'RTC_OFFER',
      sdp: pc.localDescription.toJSON(),
      fromRole: 'NORMAL_USER'
    });
  } catch (err) {
    console.error('[WebRTC Offer Error]:', err);
  }
}

async function handleRtcOffer(sdp) {
  try {
    if (!rtcPeerConnection) {
      await getOrCreateLocalCamera(true);
      initWebRtcConnection('CELEBRITY');
    }
    const pc = rtcPeerConnection;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    while (rtcIceQueue.length > 0) {
      const cand = rtcIceQueue.shift();
      await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    sendWebRtcSignal({
      type: 'RTC_ANSWER',
      sdp: pc.localDescription.toJSON(),
      fromRole: 'CELEBRITY'
    });
  } catch (err) {
    console.error('[WebRTC Answer Error]:', err);
  }
}

async function handleRtcAnswer(sdp) {
  try {
    const pc = rtcPeerConnection;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));

    while (rtcIceQueue.length > 0) {
      const cand = rtcIceQueue.shift();
      await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
    }
  } catch (err) {
    console.error('[WebRTC RemoteDescription Error]:', err);
  }
}

async function handleRtcCandidate(candidate, from) {
  try {
    const pc = rtcPeerConnection;
    if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
      rtcIceQueue.push(candidate);
      return;
    }
    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
  } catch (err) {
    console.warn('[WebRTC Candidate Error]:', err);
  }
}

function closeRtcPeerConnection() {
  if (rtcPeerConnection) {
    try {
      rtcPeerConnection.ontrack = null;
      rtcPeerConnection.onicecandidate = null;
      rtcPeerConnection.close();
    } catch {}
    rtcPeerConnection = null;
  }
  rtcIceQueue = [];
}

// Customer Care Dedicated VoIP State
let supportCallInterval = null;
let supportCallDuration = 0;
let isSupportCallMuted = false;

// ----------------- REALISTIC LIVE VIDEO STREAM ENGINE -----------------
function createLiveVideoStream(avatarUrl, displayName, roleText) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = avatarUrl;

  let frame = 0;
  let animId;

  function render() {
    frame++;
    const t = frame * 0.035;

    // 1. Dynamic studio background
    const bgGrad = ctx.createRadialGradient(
      320 + Math.sin(t * 0.7) * 60,
      180 + Math.cos(t * 0.5) * 40,
      40,
      320,
      180,
      360
    );
    bgGrad.addColorStop(0, '#1c2436');
    bgGrad.addColorStop(0.6, '#0f1524');
    bgGrad.addColorStop(1, '#05070e');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, 640, 360);

    // 2. Soft studio back-light
    ctx.save();
    ctx.beginPath();
    ctx.arc(320, 160, 95 + Math.sin(t * 1.5) * 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fill();
    ctx.restore();

    // 3. Avatar with live camera breathing & head movement
    ctx.save();
    const avatarY = 160 + Math.sin(t) * 4;
    const avatarX = 320 + Math.cos(t * 0.6) * 3;

    ctx.beginPath();
    ctx.arc(avatarX, avatarY, 74, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, avatarX - 74, avatarY - 74, 148, 148);
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(avatarX - 74, avatarY - 74, 148, 148);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(displayName.charAt(0) || 'U', avatarX, avatarY + 12);
    }
    ctx.restore();

    // 4. Specular border around avatar
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, 76, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.stroke();
    ctx.restore();

    // 5. Reactive live audio frequency spectrum waveform
    ctx.save();
    const numBars = 32;
    const barWidth = 6;
    const barSpacing = 4;
    const totalW = numBars * (barWidth + barSpacing);
    const startX = (640 - totalW) / 2;
    for (let i = 0; i < numBars; i++) {
      const h = Math.abs(Math.sin(t * 3 + i * 0.35)) * 30 + 4;
      const bx = startX + i * (barWidth + barSpacing);
      const by = 285 - h / 2;
      ctx.fillStyle = 'rgba(255, 255, 255, ' + (0.4 + (h / 34) * 0.6) + ')';
      ctx.fillRect(bx, by, barWidth, h);
    }
    ctx.restore();

    // 6. Name and Role Tag
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(displayName, 320, 316);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(roleText, 320, 334);
    ctx.restore();

    // 7. Live HUD watermark
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(16, 16, 136, 24);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(28, 28, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('LIVE HD • 60FPS', 38, 31);
    ctx.restore();

    animId = requestAnimationFrame(render);
  }

  render();
  const captureFn = canvas.captureStream || canvas.webkitCaptureStream;
  const stream = captureFn ? captureFn.call(canvas, 30) : new MediaStream();
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0.0001; // Silent carrier for WebRTC audio negotiation
      const dst = audioCtx.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      const audioTrack = dst.stream.getAudioTracks()[0];
      if (audioTrack) stream.addTrack(audioTrack);
    }
  } catch (e) {}

  stream._stopCanvas = () => {
    cancelAnimationFrame(animId);
  };
  return stream;
}

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
      return;
    }
  } catch (err) {
    console.warn('[Netlify/Static Fallback] Using client-side session authentication:', err);
  }

  // Seamless fallback for Netlify static deployments
  currentUser = {
    id: userId,
    phoneNumber: phone,
    role,
    fullName,
    avatarUrl: user?.avatarUrl || (role === 'CELEBRITY' 
      ? 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' 
      : (role === 'ORGANIZATION'
        ? 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=150'
        : (role === 'SUPER_ADMIN'
          ? 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150'
          : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150'))),
    city: 'Kochi',
    isVerified: true,
    isBanned: false,
    walletBalance: role === 'CELEBRITY' ? 12500 : (role === 'ORGANIZATION' ? 58000 : 350),
    isPremium: role === 'CELEBRITY' || role === 'SUPER_ADMIN' || localStorage.getItem('fc_celeb_hub_premium') === 'true'
  };
  currentToken = 'jwt_session_' + Date.now();
  localStorage.setItem('fc_session', JSON.stringify({ user: currentUser, token: currentToken }));
  showDashboard();
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
  if (normalPremiumArea) normalPremiumArea.classList.add('hidden');
  if (celebEarningsArea) celebEarningsArea.classList.add('hidden');

  const navContainer = document.getElementById('authorized-nav-tabs');
  navContainer.innerHTML = '';

  initWebSocket();
  initAppPeer();
  fetchCelebrityAvailability();

  // 1. NORMAL USER
  if (currentUser.role === 'NORMAL') {
    document.getElementById('dashboard-normal').classList.remove('hidden');
    if (normalPremiumArea) {
      normalPremiumArea.classList.remove('hidden');
      updateNormalPremiumUI();
    }

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

    if (!window.celebAvailPollInterval) {
      window.celebAvailPollInterval = setInterval(fetchCelebrityAvailability, 3000);
    }
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

    startCelebrityIncomingCallPoll();
    switchCelebrityTab('calls');
    loadCelebrityAnalytics(currentUser.id);
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
        <i class="fa-solid fa-headset text-blue-400"></i><span>Helpdesk Executive (Rahul)</span>
      </span>
      <span class="text-xs text-slate-400 flex items-center gap-1 py-1.5">
        <span class="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping mr-1"></span>
        <span>VoIP Call Terminal & Queries Active</span>
      </span>
    `;

    loadSupportExecutiveDesk();
    startSupportExecutivePolling();
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
    loadAdminCallReviews();
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
  if (tabId === 'celebrity') {
    fetchCelebrityAvailability();
    checkCelebrityHubAccess();
  }
  if (tabId === 'support') {
    loadSupportTickets();
    startSupportChatAutoRefresh();
  }
}

function updateNormalPremiumUI() {
  // Global upgrade button removed as subscriptions are per-celebrity VIP fan passes
  const btnUpgrade = document.getElementById('btn-upgrade-premium');
  if (btnUpgrade) btnUpgrade.style.display = 'none';
  const badgeActive = document.getElementById('badge-premium-active');
  if (badgeActive) badgeActive.style.display = 'none';

  if (activeNormalTab === 'celebrity') {
    checkCelebrityHubAccess();
  }
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
      localStorage.setItem('fc_celeb_hub_premium', 'true');
      localStorage.setItem('fc_session', JSON.stringify({ user: currentUser, token: currentToken }));
      updateNormalPremiumUI();
      alert('🎉 Congratulations! Premium VIP Subscription activated! You now have full VIP access to Celebrity Hub.');
    }
  } catch (err) {
    console.error('Upgrade error:', err);
    // Fallback local activation
    currentUser.isPremium = true;
    localStorage.setItem('fc_celeb_hub_premium', 'true');
    localStorage.setItem('fc_session', JSON.stringify({ user: currentUser, token: currentToken }));
    updateNormalPremiumUI();
    alert('🎉 Premium VIP Subscription activated! Celebrity Hub Unlocked.');
  }
}

// ----------------- CELEBRITY HUB VIP ACCESS & 1-ON-1 CHAT ENGINE -----------------

const CELEB_PROFILES = {
  'usr_celeb_1': { id: 'usr_celeb_1', name: 'Dulquer Sithara', role: 'Playback Singer & Music Artist', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', price: 499 },
  'usr_celeb_2': { id: 'usr_celeb_2', name: 'Tovino Thomas', role: 'Actor & Cinema Producer', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', price: 599 },
  'usr_celeb_3': { id: 'usr_celeb_3', name: 'Kalyani Priyadarshan', role: 'Actress & Fashion Influencer', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', price: 499 },
  'usr_celeb_4': { id: 'usr_celeb_4', name: 'Basil Joseph', role: 'Director & Actor', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', price: 499 },
  'usr_celeb_5': { id: 'usr_celeb_5', name: 'Aparna Balamurali', role: 'Playback Singer & Actress', avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', price: 399 },
  'usr_celeb_6': { id: 'usr_celeb_6', name: 'Arjun Ratan (Arjyou)', role: 'Content Creator & Vlogger', avatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150', price: 299 },
};

let currentActiveChatCelebId = 'usr_celeb_1';

// Dynamic Celebrity Online/Offline Availability System
let celebrityAvailabilityMap = {
  'usr_celeb_1': true,
  'usr_celeb_2': true,
  'usr_celeb_3': true,
  'usr_celeb_4': true,
  'usr_celeb_5': true,
  'usr_celeb_6': true
};

async function fetchCelebrityAvailability() {
  try {
    const res = await fetch('/api/celebrities/availability');
    const data = await res.json();
    if (data.success && data.availability) {
      celebrityAvailabilityMap = { ...celebrityAvailabilityMap, ...data.availability };
      updateCelebrityOnlineOfflineDOM();
    }
  } catch (err) {
    console.warn('Failed to fetch celebrity availability:', err);
  }
}

function updateCelebrityOnlineOfflineDOM() {
  renderCelebrityStories();
  if (currentActiveChatCelebId) {
    updateChatHeaderAvailability(currentActiveChatCelebId);
    updateCardCallButtons(currentActiveChatCelebId);
  }
}

function isCelebrityOnline(celebId) {
  return celebrityAvailabilityMap[celebId] !== false;
}

function updateChatHeaderAvailability(celebId) {
  const isOnline = isCelebrityOnline(celebId);
  const celeb = CELEB_PROFILES[celebId] || { name: 'Creator' };
  const statusEl = document.getElementById('chat-celeb-status-indicator');
  const btnAudio = document.getElementById('btn-chat-audio-call');
  const btnVideo = document.getElementById('btn-chat-video-call');

  if (statusEl) {
    if (isOnline) {
      statusEl.className = 'text-[10px] text-emerald-400 flex items-center gap-1 font-mono';
      statusEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
        <span>Active Online • VIP Direct</span>
      `;
    } else {
      statusEl.className = 'text-[10px] text-slate-400 flex items-center gap-1 font-mono';
      statusEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
        <span class="text-slate-400 font-bold">Offline • Not Accepting Calls</span>
      `;
    }
  }

  if (btnAudio && btnVideo) {
    if (isOnline) {
      btnAudio.className = 'w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-emerald-500/20 border border-white/15 text-emerald-400 hover:text-emerald-300 flex items-center justify-center transition active:scale-95 shadow cursor-pointer';
      btnAudio.innerHTML = '<i class="fa-solid fa-phone text-xs sm:text-sm"></i>';
      btnAudio.title = 'Start VIP Audio Call';

      btnVideo.className = 'w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/10 hover:bg-sky-500/20 border border-white/15 text-sky-400 hover:text-sky-300 flex items-center justify-center transition active:scale-95 shadow cursor-pointer';
      btnVideo.innerHTML = '<i class="fa-solid fa-video text-xs sm:text-sm"></i>';
      btnVideo.title = 'Start VIP Video Call';
    } else {
      btnAudio.className = 'w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-500 opacity-60 flex items-center justify-center transition cursor-not-allowed shadow active:scale-95';
      btnAudio.innerHTML = '<i class="fa-solid fa-phone-slash text-xs sm:text-sm text-slate-500"></i>';
      btnAudio.title = `${celeb.name} is currently Offline`;

      btnVideo.className = 'w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900/90 border border-slate-700/80 text-slate-500 opacity-60 flex items-center justify-center transition cursor-not-allowed shadow active:scale-95';
      btnVideo.innerHTML = '<i class="fa-solid fa-video-slash text-xs sm:text-sm text-slate-500"></i>';
      btnVideo.title = `${celeb.name} is currently Offline`;
    }
  }
}

// ----------------- USER PROFILE MODAL & EDIT FUNCTIONS -----------------
function openUserProfileModal() {
  if (!currentUser) return;
  const modal = document.getElementById('modal-user-profile');
  if (!modal) return;

  const previewEl = document.getElementById('profile-edit-avatar-preview');
  if (previewEl) previewEl.src = currentUser.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200';

  const avatarUrlInput = document.getElementById('profile-edit-avatar-url');
  if (avatarUrlInput) avatarUrlInput.value = currentUser.avatarUrl || '';

  const nameInput = document.getElementById('profile-edit-fullname');
  if (nameInput) nameInput.value = currentUser.fullName || currentUser.name || '';

  const bioInput = document.getElementById('profile-edit-bio');
  if (bioInput) bioInput.value = currentUser.bio || '';

  const cityInput = document.getElementById('profile-edit-city');
  if (cityInput) cityInput.value = currentUser.city || 'Kochi';

  const phoneInput = document.getElementById('profile-edit-phone');
  if (phoneInput) phoneInput.value = currentUser.phoneNumber || '';

  const roleText = document.getElementById('profile-edit-role-text');
  if (roleText) roleText.textContent = currentUser.role || 'NORMAL';

  openModal('modal-user-profile');
}

function updateProfileAvatarPreview(url) {
  if (url && url.trim()) {
    const previewEl = document.getElementById('profile-edit-avatar-preview');
    if (previewEl) previewEl.src = url.trim();
  }
}

const SAMPLE_AVATARS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200',
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=200',
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200'
];
let sampleAvatarIdx = 0;
function cycleProfileAvatar() {
  sampleAvatarIdx = (sampleAvatarIdx + 1) % SAMPLE_AVATARS.length;
  const newUrl = SAMPLE_AVATARS[sampleAvatarIdx];
  const previewEl = document.getElementById('profile-edit-avatar-preview');
  if (previewEl) previewEl.src = newUrl;
  const avatarUrlInput = document.getElementById('profile-edit-avatar-url');
  if (avatarUrlInput) avatarUrlInput.value = newUrl;
}

async function saveUserProfile(e) {
  if (e) e.preventDefault();
  const fullName = document.getElementById('profile-edit-fullname').value.trim();
  const bio = document.getElementById('profile-edit-bio').value.trim();
  const city = document.getElementById('profile-edit-city').value.trim();
  const avatarUrl = document.getElementById('profile-edit-avatar-url').value.trim() || document.getElementById('profile-edit-avatar-preview').src;

  const btnSave = document.getElementById('btn-save-profile');
  const originalHtml = btnSave ? btnSave.innerHTML : 'Save Profile';
  if (btnSave) {
    btnSave.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Saving...';
    btnSave.disabled = true;
  }

  try {
    const res = await fetch('/api/users/profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ fullName, bio, city, avatarUrl })
    });
    const data = await res.json();
    if (data.success && data.user) {
      currentUser = { ...currentUser, ...data.user };
    } else {
      currentUser.fullName = fullName;
      currentUser.name = fullName;
      currentUser.bio = bio;
      currentUser.city = city;
      currentUser.avatarUrl = avatarUrl;
    }

    localStorage.setItem('fc_session', JSON.stringify({ user: currentUser, token: currentToken }));

    // Update top header profile avatar & name immediately
    const headerName = document.getElementById('user-name-display');
    if (headerName) headerName.textContent = currentUser.fullName || currentUser.name;
    const headerAvatar = document.getElementById('user-avatar-display');
    if (headerAvatar) headerAvatar.src = currentUser.avatarUrl || avatarUrl;

    closeModal('modal-user-profile');
    showCallToast('✅ Profile updated successfully!');
  } catch (err) {
    console.error('Save profile error:', err);
    currentUser.fullName = fullName;
    currentUser.name = fullName;
    currentUser.bio = bio;
    currentUser.city = city;
    currentUser.avatarUrl = avatarUrl;
    localStorage.setItem('fc_session', JSON.stringify({ user: currentUser, token: currentToken }));
    const headerName = document.getElementById('user-name-display');
    if (headerName) headerName.textContent = currentUser.fullName || currentUser.name;
    const headerAvatar = document.getElementById('user-avatar-display');
    if (headerAvatar) headerAvatar.src = currentUser.avatarUrl || avatarUrl;

    closeModal('modal-user-profile');
    showCallToast('✅ Profile updated locally');
  } finally {
    if (btnSave) {
      btnSave.innerHTML = originalHtml;
      btnSave.disabled = false;
    }
  }
}

function checkCelebrityHubAccess() {
  // Hub is freely accessible for all users to explore stories and feed
  const unlockedBox = document.getElementById('normal-celeb-hub-unlocked');
  unlockedBox?.classList.remove('hidden');
  document.getElementById('celeb-hub-main-view')?.classList.remove('hidden');
  document.getElementById('normal-celeb-chat-view')?.classList.add('hidden');
  loadCelebrityHub();
}

function hasCelebrityFanPass(celebId = 'usr_celeb_1') {
  return localStorage.getItem('fc_fan_pass_' + celebId) === 'true';
}

function subscribeCelebrityFanPass(celebId = 'usr_celeb_1') {
  const celeb = CELEB_PROFILES[celebId] || { name: 'Creator', price: 499 };
  
  // 1. Instant Optimistic Local Activation (Zero Lag!)
  localStorage.setItem('fc_fan_pass_' + celebId, 'true');
  playGateBeep(true);
  
  // 2. Smooth non-blocking toast feedback
  showCallToast(`🎉 ${celeb.name} VIP Fan Pass Activated!`);
  
  // 3. Immediately re-render VIP Card UI
  updateCardFanPassUI(celebId);
  updateCardCallButtons(celebId);

  // 4. Background persist to Neon PostgreSQL
  fetch('/api/vip-pass/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: currentUser?.id || 'usr_normal_1',
      celebrityId: celebId,
      amount: celeb.price
    })
  }).catch(e => console.warn('Background VIP pass subscription sync error:', e));
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
}

function openCelebrityCallCard(celebId = 'usr_celeb_1') {
  currentActiveChatCelebId = celebId;
  const celeb = CELEB_PROFILES[celebId] || { id: celebId, name: 'Dulquer Sithara', role: 'Artist', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200', price: 499 };

  // Update details in call card modal
  const avatarEl = document.getElementById('card-celeb-avatar');
  if (avatarEl) avatarEl.src = celeb.avatar;
  const nameEl = document.getElementById('card-celeb-name');
  if (nameEl) nameEl.textContent = celeb.name;
  const roleEl = document.getElementById('card-celeb-role');
  if (roleEl) roleEl.textContent = celeb.role;

  initAppPeer();
  updateCardFanPassUI(celebId);
  updateCardCallButtons(celebId);
  fetchCelebrityAvailability();
  
  openModal('modal-celeb-call-card');
  const cardModal = document.getElementById('modal-celeb-call-card');
  if (cardModal) cardModal.classList.remove('hidden');
}

function closeCelebrityCallCard() {
  closeModal('modal-celeb-call-card');
}

function openCelebrityChatScreen(celebId = 'usr_celeb_1') {
  openCelebrityCallCard(celebId);
}

function closeCelebrityChatScreen() {
  closeCelebrityCallCard();
}

function updateCardFanPassUI(celebId = 'usr_celeb_1') {
  const isSubscribed = hasCelebrityFanPass(celebId);
  const celeb = CELEB_PROFILES[celebId] || { name: 'Creator', price: 499 };
  const passEl = document.getElementById('card-fan-pass-area');
  if (!passEl) return;

  if (isSubscribed) {
    passEl.innerHTML = `
      <div class="flex items-center justify-between gap-3 p-1">
        <div class="flex items-center gap-2.5">
          <span class="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500/20 to-emerald-500/20 text-amber-400 flex items-center justify-center text-sm border border-amber-500/30">
            <i class="fa-solid fa-crown text-amber-400"></i>
          </span>
          <div>
            <h4 class="text-xs font-black text-white flex items-center gap-1.5">
              <span>VIP Fan Pass Active</span>
              <i class="fa-solid fa-circle-check text-emerald-400 text-xs"></i>
            </h4>
            <p class="text-[10px] text-emerald-300">Unlimited 1-on-1 VIP Calling Unlocked</p>
          </div>
        </div>
        <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Active</span>
      </div>
    `;
  } else {
    passEl.innerHTML = `
      <div class="text-center p-1">
        <div class="flex items-center justify-center gap-1.5 text-amber-400 font-extrabold text-xs mb-1">
          <i class="fa-solid fa-crown text-amber-400"></i>
          <span>${celeb.name} VIP Fan Pass</span>
        </div>
        <p class="text-[11px] text-slate-300 mb-3 leading-relaxed">
          Subscribe to unlock direct 1-on-1 private VIP Audio & Video calls with ${celeb.name}.
        </p>
        <button onclick="subscribeCelebrityFanPass('${celebId}')" class="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 active:scale-95 transition cursor-pointer">
          <i class="fa-solid fa-crown text-slate-950"></i>
          <span>Activate VIP Fan Pass (₹${celeb.price} / Month)</span>
        </button>
      </div>
    `;
  }
}

function updateCardCallButtons(celebId = 'usr_celeb_1') {
  const isOnline = isCelebrityOnline(celebId);
  const celeb = CELEB_PROFILES[celebId] || { name: 'Creator' };

  // Ring styling
  const ringEl = document.getElementById('card-celeb-ring');
  if (ringEl) {
    if (isOnline) {
      ringEl.className = 'w-24 h-24 sm:w-28 sm:h-28 p-[3px] rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 shadow-xl transition-all duration-300';
    } else {
      ringEl.className = 'w-24 h-24 sm:w-28 sm:h-28 p-[3px] rounded-full bg-slate-800 border-2 border-slate-700 shadow-xl grayscale transition-all duration-300';
    }
  }

  // Badge styling
  const badgeEl = document.getElementById('card-celeb-badge');
  if (badgeEl) {
    if (isOnline) {
      badgeEl.className = 'absolute bottom-1 right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-slate-950 flex items-center justify-center shadow';
      badgeEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-white"></span>';
    } else {
      badgeEl.className = 'absolute bottom-1 right-1 w-6 h-6 rounded-full bg-slate-600 border-2 border-slate-950 flex items-center justify-center shadow';
      badgeEl.innerHTML = '<i class="fa-solid fa-moon text-[9px] text-slate-300"></i>';
    }
  }

  // Status indicator
  const statusEl = document.getElementById('card-celeb-status-indicator');
  if (statusEl) {
    if (isOnline) {
      statusEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400';
      statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span><span>Online • Accepting Calls</span>';
    } else {
      statusEl.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-800/80 border border-slate-700 text-slate-400';
      statusEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span><span class="text-slate-400 font-bold">Offline • Not Accepting Calls</span>';
    }
  }

  // Audio and Video call action buttons
  const btnAudio = document.getElementById('btn-card-audio-call');
  const btnVideo = document.getElementById('btn-card-video-call');
  const audioWrap = document.getElementById('btn-card-audio-icon-wrap');
  const videoWrap = document.getElementById('btn-card-video-icon-wrap');

  if (btnAudio && btnVideo) {
    if (isOnline) {
      btnAudio.className = 'group py-3.5 px-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 border border-emerald-400/30 flex flex-col items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer';
      if (audioWrap) audioWrap.innerHTML = '<i class="fa-solid fa-phone"></i>';
      btnAudio.title = 'Start VIP Audio Call';

      btnVideo.className = 'group py-3.5 px-3 rounded-2xl bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-sky-950/40 border border-sky-400/30 flex flex-col items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer';
      if (videoWrap) videoWrap.innerHTML = '<i class="fa-solid fa-video"></i>';
      btnVideo.title = 'Start VIP Video Call';
    } else {
      btnAudio.className = 'group py-3.5 px-3 rounded-2xl bg-slate-900 border border-slate-700/80 text-slate-500 opacity-60 flex flex-col items-center justify-center gap-1.5 transition cursor-not-allowed shadow';
      if (audioWrap) audioWrap.innerHTML = '<i class="fa-solid fa-phone-slash text-slate-500"></i>';
      btnAudio.title = `${celeb.name} is currently Offline`;

      btnVideo.className = 'group py-3.5 px-3 rounded-2xl bg-slate-900 border border-slate-700/80 text-slate-500 opacity-60 flex flex-col items-center justify-center gap-1.5 transition cursor-not-allowed shadow';
      if (videoWrap) videoWrap.innerHTML = '<i class="fa-solid fa-video-slash text-slate-500"></i>';
      btnVideo.title = `${celeb.name} is currently Offline`;
    }
  }
}

function handleCelebrityCallClick(celebId = 'usr_celeb_1', callType = 'CELEBRITY_VIDEO') {
  preUnlockAudioElements();
  const celeb = CELEB_PROFILES[celebId] || { name: 'Creator', price: 499 };
  if (!isCelebrityOnline(celebId)) {
    showCallToast(`🔴 ${celeb.name} is currently OFFLINE and not accepting calls.`);
    return;
  }
  if (!hasCelebrityFanPass(celebId)) {
    showCallToast(`⚠️ ${celeb.name} VIP Fan Pass Required`);
    return;
  }
  closeCelebrityCallCard();
  startNormalToCelebCall(celebId, callType);
}

function renderCelebrityChatScreen(celebId = 'usr_celeb_1') {
  const celeb = CELEB_PROFILES[celebId] || { name: 'Dulquer Sithara', role: 'Artist', price: 499 };
  const isSubscribed = hasCelebrityFanPass(celebId);
  const badgeEl = document.getElementById('celeb-pass-status-badge');
  const controlsEl = document.getElementById('celeb-chat-controls');

  if (badgeEl) {
    if (isSubscribed) {
      badgeEl.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5';
      badgeEl.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i><span>VIP Fan Pass Active</span>`;
    } else {
      badgeEl.className = 'px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5';
      badgeEl.innerHTML = `<i class="fa-solid fa-lock text-amber-400"></i><span>VIP Fan Pass Required</span>`;
    }
  }

  // 1. Controls: High-Contrast Amber VIP Activation Card vs Instagram DM Pill Input
  if (!isSubscribed) {
    controlsEl.innerHTML = `
      <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-amber-950/40 via-slate-900/90 to-slate-950 border border-amber-500/40 text-center shadow-xl">
        <div class="flex items-center justify-center gap-2 text-amber-400 font-extrabold text-xs mb-1">
          <i class="fa-solid fa-crown text-amber-400"></i>
          <span>${celeb.name} VIP Fan Pass</span>
        </div>
        <p class="text-[11px] text-slate-300 mb-3 max-w-sm mx-auto leading-relaxed">
          Subscribe to unlock direct 1-on-1 private messaging, media posts, and exclusive audio/video calls with ${celeb.name}.
        </p>
        <button onclick="subscribeCelebrityFanPass('${celebId}')" class="w-full sm:w-auto px-6 py-3 rounded-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 mx-auto active:scale-95 transition cursor-pointer">
          <i class="fa-solid fa-crown text-slate-950"></i>
          <span>Activate ${celeb.name} Fan Pass (₹${celeb.price} / Month)</span>
        </button>
      </div>
    `;
  } else {
    // True Instagram DM Input with Quick Reactions & Keyboard Elevation
    controlsEl.innerHTML = `
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1 hidden sm:flex shrink-0">
          <button onclick="sendQuickReaction('${celebId}', '❤️')" class="w-8 h-8 rounded-full hover:bg-white/10 text-base transition flex items-center justify-center" title="Send Heart">❤️</button>
          <button onclick="sendQuickReaction('${celebId}', '🔥')" class="w-8 h-8 rounded-full hover:bg-white/10 text-base transition flex items-center justify-center" title="Send Fire">🔥</button>
          <button onclick="sendQuickReaction('${celebId}', '👏')" class="w-8 h-8 rounded-full hover:bg-white/10 text-base transition flex items-center justify-center" title="Send Claps">👏</button>
        </div>
        <div class="flex-1 relative flex items-center">
          <input id="celeb-chat-input" type="text" placeholder="Message ${celeb.name.split(' ')[0]}..." 
            onkeydown="if(event.key==='Enter') sendCelebChatMessage('${celebId}')"
            class="w-full pl-4 pr-10 py-2.5 sm:py-3 rounded-full bg-slate-900 border border-white/20 text-white text-xs placeholder:text-slate-400 focus:outline-none focus:border-white focus:ring-1 focus:ring-white transition shadow-inner" />
          <button onclick="sendQuickReaction('${celebId}', '❤️')" class="sm:hidden absolute right-3 text-sm text-rose-500 hover:scale-110 transition">❤️</button>
        </div>
        <button onclick="sendCelebChatMessage('${celebId}')" class="px-5 py-2.5 sm:py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-lg flex items-center gap-1.5 active:scale-95 transition cursor-pointer shrink-0">
          <i class="fa-solid fa-paper-plane text-xs"></i>
          <span class="hidden sm:inline">Send</span>
        </button>
      </div>
    `;
  }

  renderCelebChatHistory(celebId);
}

function sendQuickReaction(celebId = 'usr_celeb_1', emoji = '❤️') {
  const input = document.getElementById('celeb-chat-input');
  if (input) input.value = emoji;
  sendCelebChatMessage(celebId);
}

function renderCelebChatHistory(celebId = 'usr_celeb_1') {
  const messagesEl = document.getElementById('celeb-chat-messages');
  if (!messagesEl) return;

  const celeb = CELEB_PROFILES[celebId] || { name: 'Dulquer Sithara', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' };
  const storageKey = 'fc_celeb_chat_' + celebId;
  let chatData = [];
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) chatData = JSON.parse(saved);
  } catch {}

  if (!chatData || chatData.length === 0) {
    chatData = [
      {
        id: 'msg_init',
        sender: 'CELEBRITY',
        name: celeb.name,
        avatar: celeb.avatar,
        text: `Hey there! Welcome to my official VIP room! ❤️ How are you doing today?`,
        time: 'Today • 10:00 AM'
      }
    ];
    try { localStorage.setItem(storageKey, JSON.stringify(chatData)); } catch {}
  }

  messagesEl.innerHTML = chatData.map(msg => {
    const isMe = msg.sender === 'FAN';
    if (isMe) {
      return `
        <div class="flex justify-end gap-2 items-end">
          <div class="max-w-[78%] sm:max-w-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 rounded-2xl rounded-br-sm shadow-md border border-blue-400/30">
            <p class="text-xs leading-relaxed break-words">${msg.text}</p>
            <span class="text-[9px] text-blue-200 block text-right mt-1 font-mono">${msg.time}</span>
          </div>
        </div>
      `;
    } else {
      return `
        <div class="flex justify-start gap-2.5 items-end">
          <img src="${msg.avatar || celeb.avatar}" class="w-8 h-8 rounded-full object-cover border border-white/30 shadow mb-1 shrink-0">
          <div class="max-w-[78%] sm:max-w-md bg-slate-900/90 backdrop-blur-md text-slate-100 p-3 rounded-2xl rounded-bl-sm shadow border border-white/15">
            <span class="text-[10px] text-sky-400 font-bold block mb-0.5">${msg.name || celeb.name}</span>
            <p class="text-xs leading-relaxed break-words">${msg.text}</p>
            <span class="text-[9px] text-slate-400 block text-right mt-1 font-mono">${msg.time}</span>
          </div>
        </div>
      `;
    }
  }).join('');

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function sendCelebChatMessage(celebId = 'usr_celeb_1') {
  const celeb = CELEB_PROFILES[celebId] || { name: 'Dulquer Sithara', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150' };
  if (!hasCelebrityFanPass(celebId)) {
    showCallToast(`⚠️ ${celeb.name} VIP Fan Pass Required`);
    return;
  }
  const input = document.getElementById('celeb-chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const storageKey = 'fc_celeb_chat_' + celebId;
  let chatData = [];
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) chatData = JSON.parse(saved);
  } catch {}

  const now = new Date();
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  chatData.push({
    id: 'msg_' + Date.now(),
    sender: 'FAN',
    name: currentUser?.fullName || 'Arjun Nair',
    text,
    time: timeStr
  });

  try { localStorage.setItem(storageKey, JSON.stringify(chatData)); } catch {}
  renderCelebChatHistory(celebId);

  // Realistic automated reply from this specific celebrity after 1.2 seconds!
  setTimeout(() => {
    const replies = [
      `Thank you so much for the message! ❤️ Your love and support truly mean the world to me!`,
      `Doing great! Talking to fans like you keeps me inspired. See you at the upcoming shows! 🎶`,
      `Thanks a lot! 🥰 So thrilled to connect with you directly on Friends Connect! Love you all ❤️`,
      `Hey! Really appreciate your message and support through the VIP Fan Pass! Stay blessed! ✨`
    ];
    const replyText = replies[Math.floor(Math.random() * replies.length)];

    let current = [];
    try { current = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch {}
    current.push({
      id: 'msg_' + Date.now(),
      sender: 'CELEBRITY',
      name: celeb.name,
      avatar: celeb.avatar,
      text: replyText,
      time: timeStr
    });
    try { localStorage.setItem(storageKey, JSON.stringify(current)); } catch {}
    renderCelebChatHistory(celebId);
    playGateBeep(true);
  }, 1200);
}

let inChatRingingTimer = null;
let inChatCallTimerInterval = null;
let inChatCallSeconds = 0;
let inChatCallMuted = false;
let inChatCameraEnabled = true;
let inChatCurrentCallType = 'CELEBRITY_VIDEO';
let activeServerCallId = null;
let callerStatusPollInterval = null;

function playInChatRingingBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(480, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  } catch (e) {}
}

function startInChatRingingTone() {
  stopInChatRingingTone();
  playInChatRingingBeep();
  inChatRingingTimer = setInterval(playInChatRingingBeep, 2400);
}

function stopInChatRingingTone() {
  if (inChatRingingTimer) {
    clearInterval(inChatRingingTimer);
    inChatRingingTimer = null;
  }
}

async function startNormalToCelebCall(celebId, callType) {
  const celeb = CELEB_PROFILES[celebId] || { name: 'Creator', price: 499, avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200' };
  if (!hasCelebrityFanPass(celebId)) {
    showCallToast(`⚠️ Please subscribe to ${celeb.name} VIP Fan Pass to unlock VIP Calling.`);
    openCelebrityCallCard(celebId);
    return;
  }

  inChatCurrentCallType = callType;
  isCelebActiveCall = true;
  callerCallState = 'RINGING';

  // Close VIP call card and display the edge-to-edge call overlay
  closeCelebrityCallCard();
  const inchatView = document.getElementById('normal-celeb-call-inchat-view');
  if (inchatView) inchatView.classList.remove('hidden');

  // Populate dynamic celebrity identity into fullscreen call HUD
  const inchatAvatar = document.getElementById('inchat-call-celeb-avatar');
  if (inchatAvatar) inchatAvatar.src = celeb.avatar;
  const inchatName = document.getElementById('inchat-call-celeb-name');
  if (inchatName) inchatName.textContent = celeb.name;
  const ringingAvatar = document.getElementById('inchat-ringing-celeb-avatar');
  if (ringingAvatar) ringingAvatar.src = celeb.avatar;
  const ringingName = document.getElementById('inchat-ringing-celeb-name');
  if (ringingName) ringingName.textContent = celeb.name;
  const audioAvatar = document.getElementById('inchat-audio-celeb-avatar');
  if (audioAvatar) audioAvatar.src = celeb.avatar;
  const audioName = document.getElementById('inchat-audio-celeb-name');
  if (audioName) audioName.textContent = `${celeb.name} (VIP Audio Call)`;

  // Automatically trigger edge-to-edge auto-fullscreen on call initiation
  triggerAutoFullscreen('normal-celeb-call-inchat-view');
  try {
    history.pushState({ inVipCall: true }, '');
  } catch (e) {}

  // Set Ringing State UI
  const ringingCard = document.getElementById('inchat-call-ringing-card');
  if (ringingCard) {
    ringingCard.classList.remove('hidden');
    ringingCard.style.display = '';
  }
  document.getElementById('inchat-call-audio-card')?.classList.add('hidden');
  document.getElementById('normal-inchat-remote-video')?.classList.add('hidden');
  
  const localWrapper = document.getElementById('inchat-local-camera-wrapper');
  if (localWrapper) {
    localWrapper.className = 'absolute inset-0 w-full h-full transition-all duration-500 z-10 overflow-hidden';
  }
  document.getElementById('inchat-pip-label')?.classList.add('hidden');
  document.getElementById('inchat-cam-off-overlay')?.classList.add('hidden');

  const statusLabel = document.getElementById('inchat-call-status-label');
  if (statusLabel) statusLabel.textContent = `Calling ${celeb.name} (${callType === 'CELEBRITY_VIDEO' ? 'VIP Video' : 'VIP Audio'})...`;
  const timerEl = document.getElementById('inchat-call-timer');
  if (timerEl) timerEl.textContent = '00:00';

  startInChatRingingTone();

  // Generate synchronous callId upfront so all devices share the exact same ID immediately
  const generatedCallId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  activeServerCallId = generatedCallId;

  // Send Ring Request to Server & Cross-Tab IMMEDIATELY without awaiting camera
  const callerDisplayName = currentUser?.fullName || 'Arjun Nair';
  const callPayload = {
    callId: generatedCallId,
    caller: callerDisplayName,
    callerName: callerDisplayName,
    callerId: currentUser?.id || 'usr_normal_1',
    callerAvatar: currentUser?.avatarUrl,
    celebrityId: celebId,
    callType,
    time: Date.now()
  };

  localStorage.setItem('fc_incoming_celeb_call', JSON.stringify(callPayload));
  postCrossTabCallEvent({ type: 'INCOMING_CALL', ...callPayload });

  fetch('/api/celebrities/call/ring', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(callPayload)
  }).then(async res => {
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.call && data.call.callId) {
        activeServerCallId = data.call.callId;
      }
    }
  }).catch(err => {
    console.warn('Server call ring failed (fallback to local):', err);
  });

  // Start polling status for caller
  startCallerCallStatusPoll();

  // Concurrently acquire local media in background so it doesn't delay network ring
  if (callType === 'CELEBRITY_VIDEO') {
    getOrCreateLocalCamera(false).then(stream => {
      const pipVid = document.getElementById('normal-inchat-local-video');
      if (pipVid && stream) {
        pipVid.srcObject = stream;
        pipVid.play().catch(() => {});
      }
      callCelebrityViaPeer(celebId, stream, callType);
    }).catch(err => {
      console.warn('[Video Call] Camera error, falling back to audio only:', err);
      acquireUserAudioOnlySafely().then(stream => {
        localMediaStream = stream;
        callCelebrityViaPeer(celebId, stream, callType);
      });
    });
  } else {
    // Pure VIP Audio Call: Microphone only, NO CAMERA!
    acquireUserAudioOnlySafely().then(stream => {
      localMediaStream = stream;
      callCelebrityViaPeer(celebId, stream, callType);
    }).catch(err => {
      console.warn('[Audio Call] Mic error:', err);
      callCelebrityViaPeer(celebId, null, callType);
    });
  }
}

function callCelebrityViaPeer(celebId, stream, callType) {
  if (!appPeer || appPeer.destroyed) {
    initAppPeer();
  }
  const doCall = () => {
    if (!appPeer || appPeer.destroyed) return;
    try {
      if (appPeer.disconnected) {
        console.log('[PeerJS Fan] Reconnecting peer...');
        appPeer.reconnect();
      }
      const uniqueCallId = activeServerCallId || ('call_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
      activeServerCallId = uniqueCallId;

      console.log('[PeerJS Fan] Calling celebrity directly at:', CELEB_PEER_ID, 'CallType:', callType, 'CallId:', uniqueCallId);
      const outboundStream = stream || localMediaStream || new MediaStream();
      const call = appPeer.call(CELEB_PEER_ID, outboundStream, {
        metadata: {
          callerName: currentUser?.fullName || 'Arjun Nair',
          callerId: currentUser?.id || 'usr_normal_1',
          callType,
          callId: uniqueCallId
        }
      });
      if (!call) return;
      activePeerCall = call;

      call.on('stream', (celebRemoteStream) => {
        console.log('[PeerJS Fan] Received live stream from Dulquer Sithara!');
        onInChatCallApproved();

        // Play audio directly through dedicated audio element
        playRemoteVipAudio(celebRemoteStream);

        // If video call, render video
        if (inChatCurrentCallType === 'CELEBRITY_VIDEO') {
          const remoteVid = document.getElementById('normal-inchat-remote-video');
          const frameImg = document.getElementById('normal-inchat-remote-frame');
          attachRemoteVideoStream(remoteVid, frameImg, celebRemoteStream);
        }
      });

      call.on('close', () => {
        console.log('[PeerJS Fan] Call closed by celebrity. State:', callerCallState);
        // ONLY end call if the call was already connected!
        // While ringing, WebRTC connection is still negotiating, so DO NOT auto-cut!
        if (callerCallState === 'CONNECTED') {
          endNormalInChatCelebCall();
          notifyCallEnded('📞 Dulquer Sithara ended the call.');
        }
      });

      call.on('error', (err) => {
        console.warn('[PeerJS Fan Call Error]:', err);
      });
    } catch (e) {
      console.warn('[PeerJS Fan call exception]:', e);
    }
  };

  if (appPeer && appPeer.open) {
    doCall();
  } else if (appPeer) {
    appPeer.once('open', doCall);
  }
}

function startCallerCallStatusPoll() {
  if (callerStatusPollInterval) clearInterval(callerStatusPollInterval);
  callerStatusPollInterval = setInterval(async () => {
    if (!isCelebActiveCall) {
      clearInterval(callerStatusPollInterval);
      callerStatusPollInterval = null;
      return;
    }
    try {
      const url = `/api/celebrities/call/status?callId=${activeServerCallId || ''}&celebrityId=usr_celeb_1&callerId=${currentUser?.id || 'usr_normal_1'}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.call) {
          const call = data.call;
          // CRITICAL GUARD: Only accept status for the CURRENT activeServerCallId!
          if (activeServerCallId && call.callId && call.callId !== activeServerCallId) {
            console.log('[CALLER Poll] Ignoring mismatched status from old call:', call.callId, 'current:', activeServerCallId);
            return;
          }
          if (call.callId) activeServerCallId = call.callId;
          if (call.status === 'APPROVED' || call.status === 'CONNECTED') {
            if (callerCallState !== 'CONNECTED') {
              console.log('[CALLER] Call approved by celebrity! Transitioning to live view...', call);
              callerCallState = 'CONNECTED';
              onInChatCallApproved(call);
            }
          } else if (call.status === 'DECLINED') {
            callerCallState = 'DECLINED';
            onInChatCallDeclined();
            return;
          } else if (call.status === 'ENDED') {
            if (callerStatusPollInterval) {
              clearInterval(callerStatusPollInterval);
              callerStatusPollInterval = null;
            }
            if (callerCallState !== 'ENDED') {
              onInChatCallEnded(call.endedBy, call.callId);
            }
            return;
          }
          if (call.answerSdp && rtcPeerConnection && !rtcPeerConnection.remoteDescription) {
            handleRtcAnswer(call.answerSdp);
          }
          if (call.iceCandidates && call.iceCandidates.length > 0) {
            call.iceCandidates.forEach(item => {
              if (item.fromRole === 'CELEBRITY') {
                handleRtcCandidate(item.candidate, 'CELEBRITY');
              }
            });
          }
          if (call.lastCelebFrame) {
            applyRemoteVideoFrame(call.lastCelebFrame, 'CELEBRITY');
          }
        }
      }
    } catch (e) {}
  }, 500);
}

function stopNormalCallVideos() {
  const inChatRemoteVid = document.getElementById('normal-inchat-remote-video');
  if (inChatRemoteVid) inChatRemoteVid.srcObject = null;
  const inChatLocalVid = document.getElementById('normal-inchat-local-video');
  if (inChatLocalVid) inChatLocalVid.srcObject = null;

  const frameImg = document.getElementById('normal-inchat-remote-frame');
  if (frameImg) {
    frameImg.src = '';
    frameImg.classList.add('hidden');
  }

  const remoteVid = document.getElementById('remote-video');
  if (remoteVid) remoteVid.srcObject = null;
  const localVid = document.getElementById('local-video');
  if (localVid) localVid.srcObject = null;

  if (localMediaStream) {
    try {
      if (localMediaStream._stopCanvas) localMediaStream._stopCanvas();
      localMediaStream.getTracks().forEach(t => t.stop());
    } catch (e) {}
    localMediaStream = null;
  }
}

async function onInChatCallApproved(call) {
  isCelebActiveCall = true;
  callerCallState = 'CONNECTED';
  stopInChatRingingTone();
  triggerAutoFullscreen('normal-celeb-call-inchat-view');

  const ringingCard = document.getElementById('inchat-call-ringing-card');
  if (ringingCard) {
    ringingCard.classList.add('hidden');
    ringingCard.style.display = 'none';
  }

  const isVideo = inChatCurrentCallType === 'CELEBRITY_VIDEO';
  if (isVideo) {
    document.getElementById('inchat-call-audio-card')?.classList.add('hidden');
    document.getElementById('btn-inchat-camera')?.classList.remove('hidden');

    const remoteVid = document.getElementById('normal-inchat-remote-video');
    const frameImg = document.getElementById('normal-inchat-remote-frame');
    if (remoteVid) {
      remoteVid.classList.remove('hidden');
      remoteVid.style.display = 'block';
      if (remoteVid.srcObject) {
        attachRemoteVideoStream(remoteVid, frameImg, remoteVid.srcObject);
      }
    }

    const localWrapper = document.getElementById('inchat-local-camera-wrapper');
    if (localWrapper) {
      localWrapper.classList.remove('hidden');
      localWrapper.className = 'absolute top-20 right-4 sm:top-24 sm:right-6 w-28 sm:w-36 h-36 sm:h-48 rounded-2xl overflow-hidden border-2 border-white/40 bg-slate-900 shadow-2xl z-20 transition-all duration-300';
    }
    const pipLabel = document.getElementById('inchat-pip-label');
    if (pipLabel) pipLabel.classList.remove('hidden');

    const pipVid = document.getElementById('normal-inchat-local-video');
    const stream = localMediaStream || celebLocalStream;
    if (pipVid && stream) {
      pipVid.srcObject = stream;
      pipVid.play().catch(() => {});
    }

    // Automatically route audio to loud speaker for Video Calls
    setSpeakerphoneOutput(true, false);

    // Always start frame relay fallback to guarantee no blank screen
    startLiveFrameStreaming('NORMAL_USER');
  } else {
    // Pure VIP Audio Call: Microphone only, NO VIDEO!
    document.getElementById('inchat-call-audio-card')?.classList.remove('hidden');
    document.getElementById('inchat-local-camera-wrapper')?.classList.add('hidden');
    document.getElementById('normal-inchat-remote-video')?.classList.add('hidden');
    document.getElementById('normal-inchat-remote-frame')?.classList.add('hidden');
    document.getElementById('btn-inchat-camera')?.classList.add('hidden');

    // Default to earpiece / normal output for Audio Calls with speaker toggle ready
    setSpeakerphoneOutput(false, false);
  }

  const currentCeleb = CELEB_PROFILES[currentActiveChatCelebId] || { name: 'Creator' };
  const statusLabel = document.getElementById('inchat-call-status-label');
  if (statusLabel) statusLabel.textContent = `VIP ${isVideo ? 'Video' : 'Audio'} Call Active with ${currentCeleb.name} (Live Connected)`;

  // Start in-call seconds timer
  inChatCallSeconds = 0;
  if (inChatCallTimerInterval) clearInterval(inChatCallTimerInterval);
  const timerEl = document.getElementById('inchat-call-timer');
  if (timerEl) timerEl.textContent = '00:00';
  const initialPipTimer = document.getElementById('floating-pip-timer');
  if (initialPipTimer) initialPipTimer.textContent = '00:00';

  inChatCallTimerInterval = setInterval(() => {
    inChatCallSeconds++;
    const m = String(Math.floor(inChatCallSeconds / 60)).padStart(2, '0');
    const s = String(inChatCallSeconds % 60).padStart(2, '0');
    const timeStr = `${m}:${s}`;
    if (timerEl) timerEl.textContent = timeStr;
    const pipTimer = document.getElementById('floating-pip-timer');
    if (pipTimer) pipTimer.textContent = timeStr;
  }, 1000);

  // Initialize manual WebRTC only as fallback if PeerJS is not connected
  if (!activePeerCall) {
    initWebRtcConnection('NORMAL_USER');
    await createAndSendRtcOffer();
  }
}

function onInChatCallDeclined() {
  callerCallState = 'DECLINED';
  endNormalInChatCelebCall();
  notifyCallEnded('❌ Dulquer Sithara is currently unavailable / declined the call request.');
}

function onInChatCallEnded(endedBy = 'CELEBRITY', callId = null) {
  const wasConnected = callerCallState === 'CONNECTED';
  callerCallState = 'ENDED';
  const cId = callId || activeServerCallId;
  endNormalInChatCelebCall(wasConnected);
  notifyCallEnded(`📞 Call ended by ${endedBy === 'CELEBRITY' ? 'Dulquer Sithara' : 'caller'}.`, cId);
}

function endNormalInChatCelebCall(wasConnectedOverride = null) {
  try {
    const wasConnected = wasConnectedOverride !== null ? wasConnectedOverride : (callerCallState === 'CONNECTED');
    isCelebActiveCall = false;
    isVipCallMinimized = false;
    callerCallState = 'IDLE';
    stopInChatRingingTone();
    stopLiveFrameStreaming();

    // Hide minimized PiP widget if visible
    document.getElementById('floating-vip-call-pip')?.classList.add('hidden');

    if (activePeerCall) {
      try {
        activePeerCall.close();
      } catch (e) {}
      activePeerCall = null;
    }

    if (callerStatusPollInterval) {
      clearInterval(callerStatusPollInterval);
      callerStatusPollInterval = null;
    }
    if (inChatCallTimerInterval) {
      clearInterval(inChatCallTimerInterval);
      inChatCallTimerInterval = null;
    }

    closeRtcPeerConnection();
    stopNormalCallVideos();

    // Stop and reset dedicated remote audio element
    const remoteAudio = document.getElementById('vip-remote-audio');
    if (remoteAudio) {
      remoteAudio.pause();
      remoteAudio.srcObject = null;
    }

    // Reset local camera wrapper and PiP overlay states
    const localWrapper = document.getElementById('inchat-local-camera-wrapper');
    if (localWrapper) {
      localWrapper.classList.remove('hidden');
      localWrapper.className = 'absolute inset-0 w-full h-full transition-all duration-500 z-10 overflow-hidden';
    }
    document.getElementById('inchat-pip-label')?.classList.add('hidden');
    document.getElementById('normal-inchat-remote-video')?.classList.add('hidden');
    document.getElementById('inchat-cam-off-overlay')?.classList.add('hidden');
    document.getElementById('inchat-call-ringing-card')?.classList.add('hidden');
    document.getElementById('inchat-call-audio-card')?.classList.add('hidden');
    document.getElementById('btn-inchat-camera')?.classList.remove('hidden');

    // Reset button appearances
    inChatCallMuted = false;
    inChatCameraEnabled = true;
    isVipSpeakerOn = false;
    updateSpeakerButtonsUI(false);
    const btnMute = document.getElementById('btn-inchat-mute');
    if (btnMute) {
      btnMute.innerHTML = '<i class="fa-solid fa-microphone text-white"></i>';
      btnMute.className = 'w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center text-xl border border-white/20 transition shadow-2xl active:scale-95 cursor-pointer';
    }
    const btnCam = document.getElementById('btn-inchat-camera');
    if (btnCam) {
      btnCam.innerHTML = '<i class="fa-solid fa-video text-white"></i>';
      btnCam.className = 'w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center text-xl border border-white/20 transition shadow-2xl active:scale-95 cursor-pointer';
    }

    // Safely exit fullscreen
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement) {
        const exitFn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen;
        if (exitFn) exitFn.call(document);
      }
    } catch (e) {}

    const callIdToEnd = activeServerCallId;
    const targetCeleb = currentActiveChatCelebId || 'usr_celeb_1';

    // 1. Immediately inform Server API with celebrityId and callerId
    fetch('/api/celebrities/call/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callId: callIdToEnd,
        celebrityId: targetCeleb,
        callerId: currentUser?.id || 'usr_normal_1',
        endedBy: 'NORMAL_USER'
      })
    }).catch(() => {});

    // 2. Remove any lingering incoming call in local storage
    try {
      localStorage.removeItem('fc_incoming_celeb_call');
    } catch {}

    // 3. WebSocket instant signal to terminate celebrity ring immediately
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'CELEB_CALL_ENDED',
        callId: callIdToEnd,
        celebrityId: targetCeleb,
        callerId: currentUser?.id || 'usr_normal_1',
        endedBy: 'NORMAL_USER'
      }));
    }

    // 4. Cross tab signal
    const endPayload = {
      type: 'CALL_ENDED',
      state: 'ended',
      callId: callIdToEnd,
      celebrityId: targetCeleb,
      endedBy: 'NORMAL_USER',
      caller: currentUser?.fullName || 'Arjun Nair',
      time: Date.now()
    };
    try {
      localStorage.setItem('fc_celeb_call_state', JSON.stringify(endPayload));
    } catch {}
    postCrossTabCallEvent(endPayload);

    // Return cleanly to feed
    document.getElementById('normal-celeb-call-inchat-view')?.classList.add('hidden');

    const finishedCallId = activeServerCallId;
    activeServerCallId = null;

    // Show 5-star rating modal ONLY if the call was actually connected!
    if (wasConnected && currentUser?.role === 'NORMAL') {
      setTimeout(() => {
        openCallReviewModal(currentActiveChatCelebId || 'usr_celeb_1', finishedCallId);
      }, 600);
    }
  } catch (err) {
    console.error('Error ending VIP call:', err);
    document.getElementById('normal-celeb-call-inchat-view')?.classList.add('hidden');
    activeServerCallId = null;
  }
}

// ----------------- FAN SATISFACTION 5-STAR RATING & CALL QUALITY REVIEWS -----------------
let currentRatingStar = 5;
let pendingReviewCallId = null;
let pendingReviewCelebId = 'usr_celeb_1';
let pendingReviewCallType = 'CELEBRITY_VIDEO';
const selectedCallReviewTags = new Set();

const RATING_LABELS = {
  1: '1.0 • Poor Connection / Audio Issue',
  2: '2.0 • Average Connection',
  3: '3.0 • Good Conversation',
  4: '4.0 • Great Audio & Video!',
  5: '5.0 • Exceptional VIP Experience!'
};

function toggleReviewTag(btn, tag) {
  if (selectedCallReviewTags.has(tag)) {
    selectedCallReviewTags.delete(tag);
    btn.className = 'review-tag-chip px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:border-blue-500/50 transition cursor-pointer';
  } else {
    selectedCallReviewTags.add(tag);
    const isBug = /bug|issue|cut|noise|glitch|lag|freeze|mute|mic/i.test(tag);
    btn.className = isBug
      ? 'review-tag-chip px-2.5 py-1 rounded-full bg-rose-950/60 border border-rose-500/70 text-rose-300 font-bold transition shadow cursor-pointer scale-105'
      : 'review-tag-chip px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/60 text-amber-300 font-bold transition shadow cursor-pointer scale-105';
  }
}

function openCallReviewModal(celebId = 'usr_celeb_1', callId = null, callType = 'CELEBRITY_VIDEO') {
  const celeb = CELEB_PROFILES[celebId] || { name: 'Dulquer Sithara', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=160' };
  pendingReviewCelebId = celebId;
  pendingReviewCallId = callId;
  pendingReviewCallType = callType || inChatCurrentCallType || 'CELEBRITY_VIDEO';

  const avatarEl = document.getElementById('review-modal-celeb-avatar');
  if (avatarEl) avatarEl.src = celeb.avatar;
  const nameEl = document.getElementById('review-modal-celeb-name');
  if (nameEl) nameEl.textContent = celeb.name;

  selectedCallReviewTags.clear();
  document.querySelectorAll('.review-tag-chip').forEach(btn => {
    btn.className = 'review-tag-chip px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:border-blue-500/50 transition cursor-pointer';
  });
  const feedbackInput = document.getElementById('call-review-feedback');
  if (feedbackInput) feedbackInput.value = '';

  setCallReviewRating(5);
  openModal('modal-call-review');
}

function closeCallReviewModalCleanly() {
  closeModal('modal-call-review');
  selectedCallReviewTags.clear();
  const feedbackInput = document.getElementById('call-review-feedback');
  if (feedbackInput) feedbackInput.value = '';
}

function setCallReviewRating(stars) {
  currentRatingStar = stars;
  document.querySelectorAll('.star-rating-btn').forEach(btn => {
    const starNum = parseInt(btn.getAttribute('data-star') || '0', 10);
    if (starNum <= stars) {
      btn.className = 'star-rating-btn text-3xl text-amber-400 hover:scale-125 transition-transform';
    } else {
      btn.className = 'star-rating-btn text-3xl text-slate-600 hover:scale-125 transition-transform';
    }
  });

  const labelEl = document.getElementById('review-modal-rating-label');
  if (labelEl) labelEl.textContent = RATING_LABELS[stars] || `${stars}.0 Stars`;
}

async function submitCallReviewRating() {
  const btn = document.getElementById('btn-submit-review');
  const orig = btn ? btn.innerHTML : 'Submit Review';
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Submitting...';
    btn.disabled = true;
  }

  const feedbackText = document.getElementById('call-review-feedback')?.value.trim() || '';
  const currentCeleb = CELEB_PROFILES[pendingReviewCelebId] || { name: 'Dulquer Sithara' };

  const reviewRecord = {
    id: 'rev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    celebrityId: pendingReviewCelebId,
    celebrityName: currentCeleb.name,
    callId: pendingReviewCallId || ('call_' + Date.now()),
    callType: pendingReviewCallType || 'CELEBRITY_VIDEO',
    rating: currentRatingStar,
    issueTags: Array.from(selectedCallReviewTags),
    feedback: feedbackText,
    callerId: currentUser?.id || 'usr_normal_1',
    callerName: currentUser?.fullName || 'Arjun Nair',
    createdAt: new Date().toISOString()
  };

  // 1. Immediately store in persistent localStorage
  try {
    const stored = JSON.parse(localStorage.getItem('fc_call_reviews') || '[]');
    stored.unshift(reviewRecord);
    localStorage.setItem('fc_call_reviews', JSON.stringify(stored.slice(0, 100)));
  } catch {}

  try {
    // 4-second timeout promise race so the UI NEVER spins endlessly
    const fetchPromise = fetch('/api/celebrities/review', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify(reviewRecord)
    });

    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 4000));
    await Promise.race([fetchPromise, timeoutPromise]);
    showCallToast('⭐ Thank you! Your call review & feedback was recorded.');
  } catch (err) {
    console.warn('Submit review saved locally:', err);
    showCallToast('⭐ Thank you for rating your call experience!');
  } finally {
    if (btn) {
      btn.innerHTML = orig;
      btn.disabled = false;
    }
    closeCallReviewModalCleanly();
    loadCelebrityAnalytics(pendingReviewCelebId);
  }
}

// Super Admin Call Quality Reviews & Bugs Fetcher
async function loadAdminCallReviews() {
  const tbody = document.getElementById('admin-reviews-table-body');
  let backendReviews = [];
  let summary = { totalReviews: 0, averageRating: 5.0, reportedIssuesCount: 0, fiveStarPercentage: 100 };

  try {
    const res = await fetch('/api/admin/call-reviews', {
      headers: { 'Authorization': `Bearer ${currentToken}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        backendReviews = data.reviews || [];
        if (data.summary) summary = data.summary;
      }
    }
  } catch (err) {
    console.warn('Backend call reviews fetch warning (using merged store):', err);
  }

  // Merge with locally stored reviews
  let localReviews = [];
  try {
    localReviews = JSON.parse(localStorage.getItem('fc_call_reviews') || '[]');
  } catch {}

  const seenIds = new Set();
  const mergedReviews = [];
  for (const r of [...localReviews, ...backendReviews]) {
    if (r && r.id && !seenIds.has(r.id)) {
      seenIds.add(r.id);
      mergedReviews.push(r);
    }
  }

  mergedReviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Recalculate summary from combined dataset
  if (mergedReviews.length > 0) {
    const total = mergedReviews.length;
    let sum = 0;
    let fiveStars = 0;
    let issues = 0;
    for (const r of mergedReviews) {
      const val = Number(r.rating || 5);
      sum += val;
      if (val >= 5) fiveStars++;
      if (Array.isArray(r.issueTags) && r.issueTags.some(t => /bug|issue|cut|noise|glitch|lag|freeze|mute|mic/i.test(t))) {
        issues++;
      }
    }
    summary.totalReviews = total;
    summary.averageRating = Number((sum / total).toFixed(1));
    summary.reportedIssuesCount = issues;
    summary.fiveStarPercentage = Math.round((fiveStars / total) * 100);
  }

  const countEl = document.getElementById('admin-call-reviews-count');
  if (countEl) countEl.textContent = `${summary.totalReviews} Reviews`;

  const avgEl = document.getElementById('admin-reviews-avg-rating');
  if (avgEl) avgEl.innerHTML = `${summary.averageRating} <span class="text-xs text-amber-400">★</span>`;

  const totalEl = document.getElementById('admin-reviews-total-count');
  if (totalEl) totalEl.textContent = String(summary.totalReviews);

  const issuesEl = document.getElementById('admin-reviews-issues-count');
  if (issuesEl) issuesEl.textContent = String(summary.reportedIssuesCount);

  const perfEl = document.getElementById('admin-reviews-perfection-rate');
  if (perfEl) perfEl.textContent = `${summary.fiveStarPercentage}%`;

  if (tbody) {
    if (mergedReviews.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="px-5 py-8 text-center text-slate-400">No call reviews submitted yet. User reviews after VIP calls will appear here in real-time.</td></tr>';
    } else {
      tbody.innerHTML = mergedReviews.map(r => {
        const starsHtml = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        const isVideo = r.callType === 'CELEBRITY_VIDEO';
        const tags = Array.isArray(r.issueTags) ? r.issueTags : [];
        const tagsHtml = tags.length > 0
          ? tags.map(t => {
              const isBug = /bug|issue|cut|noise|glitch|lag|freeze|mute|mic/i.test(t);
              return `<span class="px-2 py-0.5 rounded text-[10px] font-bold ${isBug ? 'bg-rose-950/60 text-rose-300 border border-rose-500/40' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-500/40'}">${t}</span>`;
            }).join(' ')
          : '<span class="text-slate-500 text-[11px]">No tags selected</span>';

        const formattedDate = new Date(r.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

        return `
          <tr class="hover:bg-slate-900/40 transition">
            <td class="px-5 py-3 font-semibold text-white">${r.callerName || 'Fan User'}</td>
            <td class="px-5 py-3 text-slate-300">${r.celebrityName || 'Dulquer Sithara'}</td>
            <td class="px-5 py-3">
              <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isVideo ? 'bg-sky-950/40 text-sky-300 border border-sky-500/30' : 'bg-teal-950/40 text-teal-300 border border-teal-500/30'}">
                ${isVideo ? '🎥 Video Call' : '📞 Audio Call'}
              </span>
            </td>
            <td class="px-5 py-3 font-mono font-bold text-amber-400 text-xs">${starsHtml} (${r.rating}.0)</td>
            <td class="px-5 py-3"><div class="flex flex-wrap gap-1 max-w-xs">${tagsHtml}</div></td>
            <td class="px-5 py-3 text-slate-300 max-w-xs truncate" title="${r.feedback || ''}">${r.feedback ? `"${r.feedback}"` : '<span class="text-slate-500">—</span>'}</td>
            <td class="px-5 py-3 text-right text-slate-400 font-mono text-[11px]">${formattedDate}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // 5-second Auto-poll interval when on Super Admin Dashboard
  if (!window.adminReviewsPollInterval) {
    window.adminReviewsPollInterval = setInterval(() => {
      if (currentUser?.role === 'SUPER_ADMIN') {
        const adminDash = document.getElementById('dashboard-admin');
        if (adminDash && !adminDash.classList.contains('hidden')) {
          loadAdminCallReviews();
        }
      }
    }, 5000);
  }
}

// ----------------- DYNAMIC CELEBRITY ANALYTICS & REVENUE ENGINE -----------------
async function loadCelebrityAnalytics(celebId = 'usr_celeb_1') {
  try {
    const res = await fetch(`/api/celebrities/analytics?celebrityId=${celebId}`);
    const data = await res.json();
    if (data.success && data.analytics) {
      const a = data.analytics;
      const earningsFormatted = `₹${Number(a.fanEarnings || 0).toLocaleString('en-IN')}`;

      // 1. Top Header Earnings Indicator
      const headerEarn = document.getElementById('header-celeb-earnings');
      if (headerEarn) headerEarn.textContent = earningsFormatted;

      // 2. Celebrity Profile Banner Indicators
      const profEarn = document.getElementById('celeb-profile-earnings');
      if (profEarn) profEarn.textContent = earningsFormatted;

      const profLikes = document.getElementById('celeb-profile-likes');
      if (profLikes) profLikes.textContent = `${a.totalLikes || 0} Likes`;

      // 3. Call Analytics & Revenue Console Cards
      const statCalls = document.getElementById('celeb-stat-total-calls');
      if (statCalls) statCalls.textContent = `${a.totalCalls || 0} Calls`;

      const statEarn = document.getElementById('celeb-stat-earnings');
      if (statEarn) statEarn.textContent = earningsFormatted;

      const statAvg = document.getElementById('celeb-stat-avg-duration');
      if (statAvg) {
        statAvg.textContent = a.avgDuration || `${a.avgDurationSec || 0}s`;
      }

      const statRating = document.getElementById('celeb-stat-rating');
      if (statRating) statRating.textContent = a.fanSatisfaction || '5.0 / 5.0 ★';

      // 4. Recent Fan Callers Log
      const callersList = document.getElementById('celeb-recent-callers-list');
      if (callersList) {
        if (a.recentCallers && a.recentCallers.length > 0) {
          callersList.innerHTML = a.recentCallers.map(c => `
            <div class="flex justify-between items-center text-slate-300 py-1 border-b border-slate-800/40 last:border-none">
              <span class="font-medium">${c.name || c.callerName || 'VIP Fan'}</span>
              <span class="text-blue-400 font-mono text-[10px]">${c.duration || '0s'} • ⭐ ${c.rating || 5}</span>
            </div>
          `).join('');
        } else {
          callersList.innerHTML = `<div class="text-slate-500 py-1 text-center text-xs">No calls logged yet</div>`;
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load celebrity analytics:', err);
  }
}

let callToastTimer = null;
let lastDisconnectNoticeTime = 0;

function showCallToast(msg) {
  let toast = document.getElementById('global-call-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'global-call-toast';
    toast.className = 'fixed top-16 left-1/2 -translate-x-1/2 z-[9999] px-5 py-2.5 rounded-full bg-slate-900/95 backdrop-blur-md border border-white/30 text-white font-bold text-xs shadow-2xl transition-all duration-300 pointer-events-none flex items-center gap-2';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('hidden', 'opacity-0');
  toast.classList.add('opacity-100');
  if (callToastTimer) clearTimeout(callToastTimer);
  callToastTimer = setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2500);
}

const finalizedCallNotificationIds = new Set();

function notifyCallEnded(reason = '📞 Call ended / disconnected.', callId = null) {
  const now = Date.now();
  if (callId) {
    if (finalizedCallNotificationIds.has(callId)) return;
    finalizedCallNotificationIds.add(callId);
  }
  // Global debounce: do not spam duplicate disconnect messages within 5 seconds
  if (now - lastDisconnectNoticeTime < 5000) return;
  lastDisconnectNoticeTime = now;
  showCallToast(reason);
}

let inChatToastTimer = null;
function showInChatToast(msg) {
  let toast = document.getElementById('inchat-call-toast');
  if (!toast) {
    const container = document.getElementById('normal-celeb-call-video-container');
    if (!container) {
      showCallToast(msg);
      return;
    }
    toast = document.createElement('div');
    toast.id = 'inchat-call-toast';
    toast.className = 'absolute top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 rounded-full bg-black/85 backdrop-blur-md border border-white/30 text-white font-bold text-xs shadow-2xl transition-all duration-300 pointer-events-none flex items-center gap-2';
    container.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.remove('hidden', 'opacity-0');
  toast.classList.add('opacity-100');
  if (inChatToastTimer) clearTimeout(inChatToastTimer);
  inChatToastTimer = setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 1800);
}

function toggleInChatCallMute() {
  inChatCallMuted = !inChatCallMuted;
  const stream = localMediaStream || celebLocalStream;
  if (stream) {
    stream.getAudioTracks().forEach(t => { t.enabled = !inChatCallMuted; });
  }
  const btn = document.getElementById('btn-inchat-mute');
  if (inChatCallMuted) {
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-white"></i>';
      btn.className = 'w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center text-xl border border-rose-400/40 transition shadow-2xl active:scale-95 cursor-pointer';
    }
    showInChatToast('🔇 Microphone Muted');
  } else {
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-microphone text-white"></i>';
      btn.className = 'w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center text-xl border border-white/20 transition shadow-2xl active:scale-95 cursor-pointer';
    }
    showInChatToast('🎤 Microphone Active');
  }
}

function toggleInChatCamera() {
  inChatCameraEnabled = !inChatCameraEnabled;
  const stream = localMediaStream || celebLocalStream;
  if (stream) {
    stream.getVideoTracks().forEach(t => { t.enabled = inChatCameraEnabled; });
  }
  const btn = document.getElementById('btn-inchat-camera');
  const overlay = document.getElementById('inchat-cam-off-overlay');

  if (inChatCameraEnabled) {
    if (overlay) overlay.classList.add('hidden');
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-video text-white"></i>';
      btn.className = 'w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center text-xl border border-white/20 transition shadow-2xl active:scale-95 cursor-pointer';
    }
    showInChatToast('📹 Camera Turned On');
  } else {
    if (overlay) overlay.classList.remove('hidden');
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-video-slash text-white"></i>';
      btn.className = 'w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center text-xl border border-rose-400/40 transition shadow-2xl active:scale-95 cursor-pointer';
    }
    showInChatToast('🚫 Camera Turned Off');
  }
}

// Automatically triggers HTML5 Fullscreen for VIP Celebrity calls
function triggerAutoFullscreen(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  try {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) {
        req.call(el).catch(err => {
          console.warn('[AutoFullscreen] Browser blocked native fullscreen without direct user gesture; fallback to 100vw x 100vh modal:', err);
        });
      }
    }
  } catch (e) {
    console.warn('[AutoFullscreen] Exception:', e);
  }
}

// Minimizes active VIP Celebrity Call to a floating Picture-in-Picture (PiP) badge in bottom right corner
function minimizeVipCallToPip() {
  if (!isCelebActiveCall) return;
  isVipCallMinimized = true;

  // Hide the full screen call container without stopping any audio/video streams!
  document.getElementById('normal-celeb-call-inchat-view')?.classList.add('hidden');
  document.getElementById('celeb-active-call-box')?.classList.add('hidden');

  // Exit native HTML5 fullscreen if active
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFn) exitFn.call(document).catch(() => {});
    }
  } catch (e) {}

  // Reveal the floating PiP badge
  const pipWidget = document.getElementById('floating-vip-call-pip');
  if (pipWidget) {
    pipWidget.classList.remove('hidden');
    const nameEl = document.getElementById('floating-pip-name');
    const avatarEl = document.getElementById('floating-pip-avatar');
    if (currentUser?.role === 'CELEBRITY') {
      if (nameEl) nameEl.textContent = lastFanCallerName || 'Arjun Nair (VIP Fan)';
      if (avatarEl) avatarEl.src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100';
    } else {
      if (nameEl) nameEl.textContent = 'Dulquer Sithara';
      if (avatarEl) avatarEl.src = 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100';
    }
  }
  showInChatToast('⏬ Call minimized to PiP. Tap widget to restore.');
}

// Restores full-screen view from the floating PiP badge
function restoreVipCallFromPip() {
  if (!isCelebActiveCall) return;
  isVipCallMinimized = false;

  // Hide the floating widget
  document.getElementById('floating-vip-call-pip')?.classList.add('hidden');

  // Push history state so back button will minimize again
  try {
    history.pushState({ inVipCall: true }, '');
  } catch (e) {}

  // Restore the active full-screen container and re-trigger auto fullscreen
  if (currentUser?.role === 'CELEBRITY') {
    const celebBox = document.getElementById('celeb-active-call-box');
    if (celebBox) {
      celebBox.classList.remove('hidden');
      triggerAutoFullscreen('celeb-active-call-box');
    }
  } else {
    const inchatView = document.getElementById('normal-celeb-call-inchat-view');
    if (inchatView) {
      inchatView.classList.remove('hidden');
      triggerAutoFullscreen('normal-celeb-call-inchat-view');
    }
  }
}

// Ends the call directly from the minimized PiP widget
function endMinimizedVipCall() {
  document.getElementById('floating-vip-call-pip')?.classList.add('hidden');
  isVipCallMinimized = false;
  if (currentUser?.role === 'CELEBRITY') {
    endCelebrityCall();
  } else {
    endNormalInChatCelebCall();
  }
}

// Hardware / Browser Back button minimization handling
window.addEventListener('popstate', (e) => {
  if (isCelebActiveCall && !isVipCallMinimized) {
    minimizeVipCallToPip();
  }
});

// Fullscreen exit (e.g. Escape key) minimization handling
function onGlobalFullscreenChange() {
  const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
  if (!isFs && isCelebActiveCall && !isVipCallMinimized) {
    minimizeVipCallToPip();
  }
}
document.addEventListener('fullscreenchange', onGlobalFullscreenChange);
document.addEventListener('webkitfullscreenchange', onGlobalFullscreenChange);

// ----------------- RANDOM MATCHMAKING & CALL LOGIC -----------------

function setMatchingMode(mode) {
  matchingMode = mode;
  isCelebActiveCall = false;
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

  const title = document.getElementById('searching-state-title');
  const desc = document.getElementById('searching-state-desc');
  if (title) title.textContent = 'Finding an Online Friend...';
  if (desc) desc.textContent = mode === 'VIDEO' 
    ? 'Matching with an active random video chat user...' 
    : 'Matching with an active user in the queue.';
}

function setCallState(state, hasVideo = false) {
  currentCallHasVideo = hasVideo;
  document.getElementById('call-state-idle')?.classList.add('hidden');
  document.getElementById('call-state-searching')?.classList.add('hidden');
  document.getElementById('call-state-connected')?.classList.add('hidden');

  const videoViewport = document.getElementById('video-call-viewport');
  const audioViewport = document.getElementById('audio-call-viewport');
  const btnCamera = document.getElementById('btn-camera');
  const remoteVideo = document.getElementById('remote-video');
  const fallback = document.getElementById('remote-video-fallback');

  if (state === 'idle') {
    document.getElementById('call-state-idle')?.classList.remove('hidden');
    stopCallTimer();
    stopLocalCamera();
    stopRemoteVideo();
    closeRtcPeerConnection();
    isCelebActiveCall = false;

    // Always reset searching text back to Random Friends Matchmaking
    const title = document.getElementById('searching-state-title');
    const desc = document.getElementById('searching-state-desc');
    if (title) title.textContent = 'Finding an Online Friend...';
    if (desc) desc.textContent = 'Matching with an active user in the queue.';
    const badgeTitle = document.getElementById('remote-video-badge-title');
    if (badgeTitle) badgeTitle.textContent = 'Live Video Feed';
  } else if (state === 'searching') {
    document.getElementById('call-state-searching')?.classList.remove('hidden');
    stopCallTimer();

    // If this is random matchmaking (not a celebrity call), guarantee random friend labels!
    if (!isCelebActiveCall) {
      const title = document.getElementById('searching-state-title');
      const desc = document.getElementById('searching-state-desc');
      if (title) title.textContent = 'Finding an Online Friend...';
      if (desc) desc.textContent = matchingMode === 'VIDEO'
        ? 'Matching with an active random video chat user...'
        : 'Matching with an active user in the queue.';
      const badgeTitle = document.getElementById('remote-video-badge-title');
      if (badgeTitle) badgeTitle.textContent = 'Random Video Feed';
    }
  } else if (state === 'connected') {
    document.getElementById('call-state-connected')?.classList.remove('hidden');
    if (hasVideo) {
      if (videoViewport) videoViewport.classList.remove('hidden');
      if (audioViewport) audioViewport.classList.add('hidden');
      if (btnCamera) btnCamera.classList.remove('hidden');
      if (remoteVideo) remoteVideo.classList.remove('hidden');
      if (fallback) fallback.classList.add('hidden');
      if (!isCelebActiveCall) {
        startLocalCamera();
        startRemoteVideo();
      }
    } else {
      if (videoViewport) videoViewport.classList.add('hidden');
      if (audioViewport) audioViewport.classList.remove('hidden');
      if (btnCamera) btnCamera.classList.add('hidden');
      stopLocalCamera();
      stopRemoteVideo();
    }
    startCallTimer();
  }
}

async function startLocalCamera() {
  const localVideo = document.getElementById('local-video');
  if (!localVideo) return;

  try {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      localMediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localMediaStream;
      localVideo.play().catch(() => {});
      return;
    }
    throw new Error('No mediaDevices');
  } catch (err) {
    console.log('[Camera] Using live simulated user camera:', err.message);
    const myAvatar = currentUser?.avatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200';
    const myName = currentUser?.fullName || 'You (Arjun Nair)';
    localMediaStream = createLiveVideoStream(myAvatar, myName, 'Your Camera');
    localVideo.srcObject = localMediaStream;
    localVideo.play().catch(() => {});
  }
}

function stopLocalCamera() {
  const localVideo = document.getElementById('local-video');
  if (localVideo) localVideo.srcObject = null;
  if (localMediaStream) {
    if (localMediaStream._stopCanvas) localMediaStream._stopCanvas();
    localMediaStream.getTracks().forEach(t => t.stop());
    localMediaStream = null;
  }
}

function startRemoteVideo(avatar, name) {
  const remoteVideo = document.getElementById('remote-video');
  const fallback = document.getElementById('remote-video-fallback');
  if (!remoteVideo) return;

  if (fallback) fallback.classList.add('hidden');
  remoteVideo.classList.remove('hidden');

  const peerName = name || document.getElementById('peer-name')?.textContent || 'Dulquer Sithara (VIP Artist)';
  const peerAvatar = avatar || document.getElementById('peer-avatar')?.src || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400';

  if (activeRemoteStream && activeRemoteStream._stopCanvas) {
    activeRemoteStream._stopCanvas();
  }

  activeRemoteStream = createLiveVideoStream(peerAvatar, peerName, 'Live Video Feed • Verified');
  remoteVideo.srcObject = activeRemoteStream;
  remoteVideo.play().catch(() => {});
}

function stopRemoteVideo() {
  const remoteVideo = document.getElementById('remote-video');
  if (remoteVideo) remoteVideo.srcObject = null;
  if (activeRemoteStream) {
    if (activeRemoteStream._stopCanvas) activeRemoteStream._stopCanvas();
    activeRemoteStream.getTracks().forEach(t => t.stop());
    activeRemoteStream = null;
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
    overlay?.classList.remove('hidden');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-video-slash text-rose-500"></i>';
  } else {
    overlay?.classList.add('hidden');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-video"></i>';
  }
}

function startRandomMatching() {
  isCelebActiveCall = false; // Never a celebrity call!

  // Reset searching UI strictly for random friend matchmaking
  const title = document.getElementById('searching-state-title');
  const desc = document.getElementById('searching-state-desc');
  if (title) title.textContent = 'Finding an Online Friend...';
  if (desc) desc.textContent = matchingMode === 'VIDEO'
    ? 'Matching with an active random video chat user in queue...'
    : 'Matching with an active user in the queue.';

  const peerName = document.getElementById('peer-name');
  if (peerName) peerName.textContent = 'Online Friend';
  const badgeTitle = document.getElementById('remote-video-badge-title');
  if (badgeTitle) badgeTitle.textContent = 'Random Video Feed';

  if (!socket || socket.readyState !== WebSocket.OPEN) initWebSocket();
  setCallState('searching');

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: 'JOIN_RANDOM_QUEUE',
      userId: currentUser?.id,
      metadata: { callType: matchingMode, audioOnly: matchingMode === 'AUDIO' }
    }));
  }

  setTimeout(() => {
    const searching = !document.getElementById('call-state-searching')?.classList.contains('hidden');
    if (searching && !isCelebActiveCall) {
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
  }, 3000);
}

function cancelMatching() {
  if (isCelebActiveCall) {
    endCurrentCall();
    return;
  }
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'LEAVE_RANDOM_QUEUE', userId: currentUser?.id }));
  }
  setCallState('idle');
}

function onMatchFound(payload) {
  isCelebActiveCall = false;
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
  const badgeTitle = document.getElementById('remote-video-badge-title');
  if (badgeTitle) badgeTitle.textContent = `${matchedName} (Online Friend)`;

  setCallState('connected', hasVideo);
  if (hasVideo) {
    startRemoteVideo(matchedAvatar, matchedName);
  }
}

function skipToNextPerson() {
  isCelebActiveCall = false;
  const title = document.getElementById('searching-state-title');
  const desc = document.getElementById('searching-state-desc');
  if (title) title.textContent = 'Finding an Online Friend...';
  if (desc) desc.textContent = 'Connecting you to the next online friend...';

  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'NEXT_PERSON', userId: currentUser?.id, metadata: { callType: matchingMode } }));
  }
  setCallState('searching');

  setTimeout(() => {
    const searching = !document.getElementById('call-state-searching')?.classList.contains('hidden');
    if (searching && !isCelebActiveCall) {
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
    socket.send(JSON.stringify({ type: 'END_CALL', userId: currentUser?.id }));
  }
  isCelebActiveCall = false;
  closeRtcPeerConnection();
  setCallState('idle');

  // Clean up any pending incoming storage keys
  try {
    localStorage.removeItem('fc_incoming_celeb_call');
  } catch {}

  // Broadcast call termination so celebrity console disconnects immediately
  const endPayload = {
    type: 'CALL_ENDED',
    state: 'ended',
    endedBy: 'NORMAL_USER',
    caller: currentUser?.fullName || 'Arjun Nair',
    time: Date.now()
  };
  localStorage.setItem('fc_celeb_call_state', JSON.stringify(endPayload));
  postCrossTabCallEvent(endPayload);
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
  if (tabId === 'calls') {
    updateCelebrityCallUI();
    loadCelebrityAnalytics(currentUser?.id || 'usr_celeb_1');
  }
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

async function toggleCelebrityAvailability() {
  celebAvailable = !celebAvailable;
  localStorage.setItem('fc_celeb_available', celebAvailable ? 'true' : 'false');
  updateCelebrityCallUI();

  const celebId = currentUser?.id || 'usr_celeb_1';
  celebrityAvailabilityMap[celebId] = celebAvailable;
  updateCelebrityOnlineOfflineDOM();

  // 1. Broadcast across browser tabs
  postCrossTabCallEvent({
    type: 'CELEB_AVAILABILITY_CHANGED',
    celebrityId: celebId,
    isAvailable: celebAvailable
  });

  // 2. Synchronize to Backend Database & WebSockets
  try {
    await fetch('/api/celebrities/availability', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`
      },
      body: JSON.stringify({ celebrityId: celebId, isAvailable: celebAvailable })
    });
  } catch (err) {
    console.warn('Failed to notify server of availability change:', err);
  }

  if (celebAvailable) {
    startCelebrityIncomingCallPoll();
    showCallToast('🟢 Status: ONLINE! You are now accepting incoming calls from VIP fans.');
  } else {
    stopCelebrityIncomingRingtone();
    stopCelebrityIncomingCallPoll();
    showCallToast('🔴 Status: OFFLINE! Fan calls are now paused.');
  }
}

function simulateIncomingFanCall(callerName = 'Arjun Nair (VIP Gold Fan)', callId = null, callType = 'CELEBRITY_VIDEO') {
  if (isCelebActiveCall || (callId && handledCallSessions.has(callId))) {
    return;
  }
  if (callId) activeServerCallId = callId;
  lastFanCallerName = callerName;
  if (callType) inChatCurrentCallType = callType;

  const callerEl = document.getElementById('incoming-caller-name');
  if (callerEl) callerEl.textContent = callerName;
  const fanLabel = document.getElementById('celeb-fan-caller-label');
  if (fanLabel) fanLabel.textContent = callerName;

  const globalCaller = document.getElementById('global-incoming-caller-name');
  if (globalCaller) globalCaller.textContent = callerName;

  // DYNAMIC BADGE: Audio Call vs Video Call
  const isAudio = callType === 'CELEBRITY_AUDIO' || callType === 'AUDIO' || (typeof callType === 'string' && callType.toLowerCase().includes('audio'));
  const badgeWrap = document.getElementById('global-incoming-call-badge-wrap');
  const badgeText = document.getElementById('global-incoming-call-type-badge');
  if (badgeText) {
    badgeText.innerHTML = isAudio 
      ? '<i class="fa-solid fa-phone text-teal-300 mr-1"></i> Incoming VIP Fan Audio Call' 
      : '<i class="fa-solid fa-video text-emerald-300 mr-1"></i> Incoming VIP Fan Video Call';
  }
  if (badgeWrap) {
    if (isAudio) {
      badgeWrap.className = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-teal-950/90 border border-teal-500/60 text-teal-300 text-xs font-bold mb-3 shadow';
    } else {
      badgeWrap.className = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-bold mb-3 shadow';
    }
  }

  const rateEl = document.getElementById('global-incoming-call-rate');
  if (rateEl) {
    rateEl.textContent = isAudio ? '₹50 / min (70% Share)' : '₹150 / min (70% Share)';
  }

  // Dashboard widget labels
  const dashBadge = document.getElementById('incoming-fan-call-badge-label');
  if (dashBadge) dashBadge.textContent = isAudio ? 'Incoming VIP Fan Audio Call' : 'Incoming VIP Fan Video Call';
  const dashType = document.getElementById('incoming-fan-call-type-label');
  if (dashType) {
    dashType.innerHTML = isAudio 
      ? '<i class="fa-solid fa-phone text-emerald-400"></i> 1-on-1 VIP Audio Call' 
      : '<i class="fa-solid fa-video text-blue-400"></i> 1-on-1 VIP Video Call';
  }

  document.getElementById('celeb-online-waiting-box')?.classList.add('hidden');
  document.getElementById('incoming-fan-call-box')?.classList.remove('hidden');
  document.getElementById('global-celeb-incoming-modal')?.classList.remove('hidden');
  startCelebrityIncomingRingtone();
}

function dismissCelebrityIncomingCall(callId = null) {
  if (callId) handledCallSessions.add(callId);
  activeServerCallId = null;
  stopCelebrityIncomingRingtone();

  const modal = document.getElementById('global-celeb-incoming-modal');
  if (modal) modal.classList.add('hidden');

  const incomingBox = document.getElementById('incoming-fan-call-box');
  if (incomingBox) incomingBox.classList.add('hidden');

  if (celebAvailable) {
    document.getElementById('celeb-online-waiting-box')?.classList.remove('hidden');
  } else {
    document.getElementById('celeb-offline-box')?.classList.remove('hidden');
  }

  try {
    localStorage.removeItem('fc_incoming_celeb_call');
  } catch {}
}

let celebIncomingPollInterval = null;
function startCelebrityIncomingCallPoll() {
  if (celebIncomingPollInterval) clearInterval(celebIncomingPollInterval);
  celebIncomingPollInterval = setInterval(async () => {
    const isCelebTab = (currentUser && (currentUser.role === 'CELEBRITY' || currentUser.id === 'usr_celeb_1')) || 
      (document.getElementById('dashboard-celebrity') && !document.getElementById('dashboard-celebrity').classList.contains('hidden'));
    
    if (!isCelebTab) return;

    if (!appPeer || appPeer.destroyed) {
      initAppPeer();
    }

    // While in active call, poll status to detect if fan hung up / disconnected, apply WebRTC offer, candidates, and live video frames
    if (isCelebActiveCall) {
      try {
        const query = activeServerCallId ? `callId=${activeServerCallId}` : `celebrityId=usr_celeb_1`;
        const res = await fetch(`/api/celebrities/call/status?${query}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.call) {
            const call = data.call;
            // CRITICAL: Ignore any status response that does not match our current active call session!
            if (activeServerCallId && call.callId && call.callId !== activeServerCallId) {
              return;
            }
            if (call.callId) activeServerCallId = call.callId;
            if (call.status === 'ENDED') {
              const endedId = call.callId || activeServerCallId;
              activeServerCallId = null;
              if (endedId) handledCallSessions.add(endedId);
              endCelebrityCall(true);
              notifyCallEnded('📞 Fan ended / disconnected the call.', endedId);
              return;
            }
            if (call.offerSdp && (!rtcPeerConnection || !rtcPeerConnection.remoteDescription)) {
              console.log('[Celeb Poll] Applying offerSdp from status poll');
              handleRtcOffer(call.offerSdp);
            }
            if (call.iceCandidates && call.iceCandidates.length > 0) {
              call.iceCandidates.forEach(item => {
                if (item.fromRole === 'NORMAL_USER') {
                  handleRtcCandidate(item.candidate, 'NORMAL_USER');
                }
              });
            }
            if (call.lastNormalFrame) {
              applyRemoteVideoFrame(call.lastNormalFrame, 'NORMAL_USER');
            }
          }
        }
      } catch (e) {}
      return;
    }

    try {
      const res = await fetch('/api/celebrities/call/status?celebrityId=usr_celeb_1');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.call) {
          const call = data.call;
          const callId = call.callId;
          if (call.status === 'RINGING') {
            const callType = call.callType || 'CELEBRITY_VIDEO';
            if (isCelebActiveCall || (callId && handledCallSessions.has(callId))) {
              return;
            }
            activeServerCallId = callId;
            lastFanCallerName = `${call.callerName || call.caller || 'Arjun Nair'} (VIP Fan)`;
            simulateIncomingFanCall(lastFanCallerName, callId, callType);
          } else if (call.status === 'ENDED' || call.status === 'DECLINED') {
            dismissCelebrityIncomingCall(callId);
          }
        } else {
          // If server has no call, dismiss any stuck incoming pop-up
          dismissCelebrityIncomingCall();
        }
      }
    } catch (e) {}
  }, 750);
}

function stopCelebrityIncomingCallPoll() {
  if (celebIncomingPollInterval) {
    clearInterval(celebIncomingPollInterval);
    celebIncomingPollInterval = null;
  }
}

async function startCelebrityCallVideos() {
  await getOrCreateLocalCamera(true);
}

function stopCelebrityCallVideos() {
  const celebRemoteVideo = document.getElementById('celeb-remote-video');
  if (celebRemoteVideo) celebRemoteVideo.srcObject = null;
  const frameImg = document.getElementById('celeb-remote-frame');
  if (frameImg) {
    frameImg.src = '';
    frameImg.classList.add('hidden');
  }
  if (celebRemoteStream) {
    if (celebRemoteStream._stopCanvas) celebRemoteStream._stopCanvas();
    celebRemoteStream.getTracks().forEach(t => t.stop());
    celebRemoteStream = null;
  }

  const celebLocalVideo = document.getElementById('celeb-local-video');
  if (celebLocalVideo) celebLocalVideo.srcObject = null;
  if (celebLocalStream) {
    if (celebLocalStream._stopCanvas) celebLocalStream._stopCanvas();
    celebLocalStream.getTracks().forEach(t => t.stop());
    celebLocalStream = null;
  }
}

function toggleCelebrityCamera() {
  isCelebCameraOff = !isCelebCameraOff;
  const overlay = document.getElementById('celeb-camera-off-overlay');
  const btn = document.getElementById('btn-celeb-camera');

  if (celebLocalStream) {
    celebLocalStream.getVideoTracks().forEach(track => { track.enabled = !isCelebCameraOff; });
  }

  if (isCelebCameraOff) {
    overlay?.classList.remove('hidden');
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-video-slash text-white"></i>';
      btn.className = 'w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center text-xl border border-rose-400/40 transition shadow-2xl active:scale-95 cursor-pointer';
    }
  } else {
    overlay?.classList.add('hidden');
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-video text-white"></i>';
      btn.className = 'w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center text-xl border border-white/20 transition shadow-2xl active:scale-95 cursor-pointer';
    }
  }
}

function toggleCelebrityCallMute() {
  isCelebCallMuted = !isCelebCallMuted;
  const btn = document.getElementById('btn-celeb-call-mute');
  if (celebLocalStream) {
    celebLocalStream.getAudioTracks().forEach(track => { track.enabled = !isCelebCallMuted; });
  }
  if (btn) {
    if (isCelebCallMuted) {
      btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-white"></i>';
      btn.className = 'w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center text-xl border border-rose-400/40 transition shadow-2xl active:scale-95 cursor-pointer';
    } else {
      btn.innerHTML = '<i class="fa-solid fa-microphone text-white"></i>';
      btn.className = 'w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center text-xl border border-white/20 transition shadow-2xl active:scale-95 cursor-pointer';
    }
  }
}

async function approveIncomingFanCall() {
  preUnlockAudioElements();
  stopCelebrityIncomingRingtone();
  playGateBeep(true);
  isCelebActiveCall = true;

  const callIdToApprove = activeServerCallId;
  if (callIdToApprove) {
    handledCallSessions.add(callIdToApprove);
  }

  document.getElementById('global-celeb-incoming-modal')?.classList.add('hidden');
  document.getElementById('incoming-fan-call-box')?.classList.add('hidden');
  document.getElementById('celeb-online-waiting-box')?.classList.add('hidden');
  
  // Switch to calls desk to view feeds
  switchCelebrityTab('calls');
  document.getElementById('celeb-active-call-box')?.classList.remove('hidden');

  // Trigger Auto Fullscreen on celebrity answering call
  triggerAutoFullscreen('celeb-active-call-box');
  try {
    history.pushState({ inVipCall: true }, '');
  } catch (e) {}

  // Immediately notify server so call status updates to CONNECTED without delay
  fetch('/api/celebrities/call/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callId: callIdToApprove,
      celebrityId: currentUser?.id || 'usr_celeb_1',
      action: 'APPROVE'
    })
  }).then(async res => {
    if (res.ok) {
      const data = await res.json();
      if (data.call && data.call.callId) {
        activeServerCallId = data.call.callId;
      }
    }
  }).catch(e => console.warn('Approve server call error:', e));

  // Start active call timer
  celebActiveCallSeconds = 0;
  if (celebActiveCallTimer) clearInterval(celebActiveCallTimer);
  const timerEl = document.getElementById('celeb-active-call-timer');
  if (timerEl) timerEl.textContent = '00:00';
  const initialPipTimer = document.getElementById('floating-pip-timer');
  if (initialPipTimer) initialPipTimer.textContent = '00:00';

  celebActiveCallTimer = setInterval(() => {
    celebActiveCallSeconds++;
    const m = String(Math.floor(celebActiveCallSeconds / 60)).padStart(2, '0');
    const s = String(celebActiveCallSeconds % 60).padStart(2, '0');
    const timeStr = `${m}:${s}`;
    if (timerEl) timerEl.textContent = timeStr;
    const pipTimer = document.getElementById('floating-pip-timer');
    if (pipTimer) pipTimer.textContent = timeStr;
  }, 1000);

  // Determine whether this call session is Video or Audio
  const isVideo = (inChatCurrentCallType === 'CELEBRITY_VIDEO') || 
    (activePeerCall?.metadata?.callType === 'CELEBRITY_VIDEO');
  inChatCurrentCallType = isVideo ? 'CELEBRITY_VIDEO' : 'CELEBRITY_AUDIO';

  let celebStream = null;
  if (isVideo) {
    document.getElementById('celeb-call-audio-card')?.classList.add('hidden');
    document.getElementById('celeb-local-camera-wrapper')?.classList.remove('hidden');
    document.getElementById('btn-celeb-camera')?.classList.remove('hidden');

    const celebRemoteVid = document.getElementById('celeb-remote-video');
    const celebRemoteFrame = document.getElementById('celeb-remote-frame');
    if (celebRemoteVid) {
      celebRemoteVid.classList.remove('hidden');
      celebRemoteVid.style.display = 'block';
    }
    if (celebRemoteFrame) {
      celebRemoteFrame.classList.add('hidden');
    }

    celebStream = await getOrCreateLocalCamera(true);
    // GUARANTEE: Ensure celebrity microphone is attached & unmuted
    if (celebStream && celebStream.getAudioTracks().length === 0) {
      try {
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        mic.getAudioTracks().forEach(t => { t.enabled = true; celebStream.addTrack(t); });
      } catch (e) {
        console.warn('[Celeb Video] Standalone mic error:', e);
      }
    }
    if (celebStream) {
      celebStream.getAudioTracks().forEach(t => { t.enabled = true; });
    }
    celebLocalStream = celebStream;

    const celebPipVid = document.getElementById('celeb-local-video');
    if (celebPipVid && celebStream) {
      celebPipVid.srcObject = celebStream;
      celebPipVid.play().catch(() => {});
    }

    // Auto-enable loud speaker for video calls
    setSpeakerphoneOutput(true, false);
  } else {
    // Pure VIP Audio Call: Microphone only, NO CAMERA!
    document.getElementById('celeb-call-audio-card')?.classList.remove('hidden');
    const fanNameEl = document.getElementById('celeb-audio-fan-name');
    if (fanNameEl) fanNameEl.textContent = `${lastFanCallerName || 'Arjun Nair'} (VIP Audio Call)`;
    document.getElementById('celeb-local-camera-wrapper')?.classList.add('hidden');
    document.getElementById('celeb-remote-video')?.classList.add('hidden');
    document.getElementById('celeb-remote-frame')?.classList.add('hidden');
    document.getElementById('btn-celeb-camera')?.classList.add('hidden');

    // Default earpiece mode for audio calls with speaker toggle ready
    setSpeakerphoneOutput(false, false);

    try {
      celebStream = await acquireUserAudioOnlySafely();
    } catch (e) {
      console.warn('[Celeb Audio Call] Mic error fallback:', e);
      celebStream = new MediaStream();
    }
    celebLocalStream = celebStream;
  }

  // Answer PeerJS call directly with celebrity stream!
  if (activePeerCall) {
    console.log('[PeerJS Celeb] Answering PeerJS call with celebrity stream. isVideo:', isVideo);
    try {
      activePeerCall.answer(celebStream);
      activePeerCall.on('stream', (fanRemoteStream) => {
        console.log('[PeerJS Celeb] Received fan remote stream via PeerJS!');

        // 1. Play audio directly through dedicated audio element
        playRemoteVipAudio(fanRemoteStream);

        // 2. If video call, render video
        if (isVideo) {
          const remoteVid = document.getElementById('celeb-remote-video');
          const frameImg = document.getElementById('celeb-remote-frame');
          attachRemoteVideoStream(remoteVid, frameImg, fanRemoteStream);
        }
      });
      activePeerCall.on('close', () => {
        console.log('[PeerJS Celeb] Call closed by fan');
        if (isCelebActiveCall) {
          endCelebrityCall(true);
          notifyCallEnded('📞 Fan ended / disconnected the call.');
        }
      });
    } catch (e) {
      console.warn('[PeerJS Celeb answer error]:', e);
    }
  }

  // Always start live frame streaming for video calls to guarantee 100% zero black screens
  if (isVideo) {
    startLiveFrameStreaming('CELEBRITY');
    if (!activePeerCall) {
      initWebRtcConnection('CELEBRITY');
    }
  }

  // 4. Broadcast approval across browser tabs
  const payload = {
    type: 'CALL_APPROVED',
    state: 'connected',
    callId: callIdToApprove,
    celebId: currentUser?.id || 'usr_celeb_1',
    caller: lastFanCallerName || 'Arjun Nair',
    time: Date.now()
  };
  try {
    localStorage.setItem('fc_celeb_call_state', JSON.stringify(payload));
  } catch {}
  postCrossTabCallEvent(payload);
}

function declineIncomingFanCall() {
  stopCelebrityIncomingRingtone();
  playGateBeep(false);

  const callIdToDecline = activeServerCallId;
  if (callIdToDecline) {
    handledCallSessions.add(callIdToDecline);
  }

  document.getElementById('global-celeb-incoming-modal')?.classList.add('hidden');
  document.getElementById('incoming-fan-call-box')?.classList.add('hidden');
  if (celebAvailable) {
    document.getElementById('celeb-online-waiting-box')?.classList.remove('hidden');
  } else {
    document.getElementById('celeb-offline-box')?.classList.remove('hidden');
  }

  // Inform Server API
  if (callIdToDecline) {
    fetch('/api/celebrities/call/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: callIdToDecline, action: 'DECLINE' })
    }).catch(e => console.warn('Decline server call error:', e));
  }

  try {
    localStorage.removeItem('fc_incoming_celeb_call');
  } catch {}

  // Broadcast decline across browser tabs
  const payload = { type: 'CALL_DECLINED', state: 'declined', callId: callIdToDecline, time: Date.now() };
  try {
    localStorage.setItem('fc_celeb_call_state', JSON.stringify(payload));
  } catch {}
  postCrossTabCallEvent(payload);
  activeServerCallId = null;
}

function endCelebrityCall(silent = false) {
  isCelebActiveCall = false;
  isVipCallMinimized = false;
  stopCelebrityIncomingRingtone();
  stopLiveFrameStreaming();
  if (celebActiveCallTimer) {
    clearInterval(celebActiveCallTimer);
    celebActiveCallTimer = null;
  }
  if (activePeerCall) {
    try {
      activePeerCall.close();
    } catch (e) {}
    activePeerCall = null;
  }
  closeRtcPeerConnection();
  stopCelebrityCallVideos();

  // Stop and reset dedicated remote audio element
  const remoteAudio = document.getElementById('vip-remote-audio');
  if (remoteAudio) {
    remoteAudio.pause();
    remoteAudio.srcObject = null;
  }
  document.getElementById('btn-celeb-camera')?.classList.remove('hidden');
  document.getElementById('celeb-local-camera-wrapper')?.classList.remove('hidden');
  document.getElementById('celeb-call-audio-card')?.classList.add('hidden');

  // Hide floating PiP widget if active
  document.getElementById('floating-vip-call-pip')?.classList.add('hidden');
  document.getElementById('global-celeb-incoming-modal')?.classList.add('hidden');
  document.getElementById('celeb-active-call-box')?.classList.add('hidden');
  document.getElementById('incoming-fan-call-box')?.classList.add('hidden');
  if (celebAvailable) {
    document.getElementById('celeb-online-waiting-box')?.classList.remove('hidden');
  } else {
    document.getElementById('celeb-offline-box')?.classList.remove('hidden');
  }

  // Reset button appearances
  isCelebCallMuted = false;
  isCelebCameraOff = false;
  isVipSpeakerOn = false;
  updateSpeakerButtonsUI(false);
  const btnCelebMute = document.getElementById('btn-celeb-call-mute');
  if (btnCelebMute) {
    btnCelebMute.innerHTML = '<i class="fa-solid fa-microphone text-white"></i>';
    btnCelebMute.className = 'w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center text-xl border border-white/20 transition shadow-2xl active:scale-95 cursor-pointer';
  }
  const btnCelebCam = document.getElementById('btn-celeb-camera');
  if (btnCelebCam) {
    btnCelebCam.innerHTML = '<i class="fa-solid fa-video text-white"></i>';
    btnCelebCam.className = 'w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md text-white flex items-center justify-center text-xl border border-white/20 transition shadow-2xl active:scale-95 cursor-pointer';
  }

  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }

  // Inform Server API
  const callIdToEnd = activeServerCallId;
  if (callIdToEnd) {
    handledCallSessions.add(callIdToEnd);
    fetch('/api/celebrities/call/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callId: callIdToEnd, endedBy: 'CELEBRITY' })
    }).catch(e => console.warn('End server call error:', e));
  }

  try {
    localStorage.removeItem('fc_incoming_celeb_call');
  } catch {}

  // Broadcast call termination to normal user
  if (!silent) {
    const endPayload = {
      type: 'CALL_ENDED',
      state: 'ended',
      callId: callIdToEnd,
      endedBy: 'CELEBRITY',
      time: Date.now()
    };
    try {
      localStorage.setItem('fc_celeb_call_state', JSON.stringify(endPayload));
    } catch {}
    postCrossTabCallEvent(endPayload);
  }
  activeServerCallId = null;
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
          ? `<video src="${post.mediaUrl}" controls playsinline class="w-full max-h-[520px] object-contain bg-black"></video>`
          : `<img src="${post.mediaUrl}" class="w-full max-h-[520px] object-contain bg-black">`;

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

let activeExecutiveTicketId = 'ticket_sample_101';
let executiveAllTickets = [];
let supportExecutivePollTimer = null;
let supportIncomingRingtoneTimer = null;
let supportActiveIncomingCall = null;
let supportDeskActiveCall = null;
let isSupportDeskMuted = false;
let supportDeskCallDuration = 0;
let supportDeskCallInterval = null;
let supportDeskLocalStream = null;

// Ringtone generation via Web Audio API
function playSupportDeskRingChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc1.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.3); // E5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(659.25, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.3); // G5

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.4);
    osc2.stop(ctx.currentTime + 0.4);
  } catch {}
}

function startSupportDeskRingtone() {
  stopSupportDeskRingtone();
  playSupportDeskRingChime();
  supportIncomingRingtoneTimer = setInterval(playSupportDeskRingChime, 1500);
}

function stopSupportDeskRingtone() {
  if (supportIncomingRingtoneTimer) {
    clearInterval(supportIncomingRingtoneTimer);
    supportIncomingRingtoneTimer = null;
  }
}

async function loadSupportExecutiveDesk() {
  try {
    const res = await fetch('/api/support/tickets', {
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'x-user-role': 'SUPPORT',
        'x-user-id': currentUser?.id || 'usr_support_1',
        'x-user-name': currentUser?.fullName || 'Rahul (Customer Care)'
      }
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
            <button onclick="selectExecutiveTicket('${t.id}')" class="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${isSelected ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-800 text-slate-300 hover:text-white'}">
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
          container.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">No messages in ticket for ${activeTicket.userName}. Type below to start live assistance.</p>`;
        } else {
          container.innerHTML = activeTicket.messages.map(msg => `
            <div class="p-3.5 rounded-xl border border-slate-800 mb-2.5 ${msg.senderRole === 'SUPPORT' ? 'bg-slate-900 border-l-4 border-l-emerald-500' : 'bg-slate-950 border-l-4 border-l-purple-500'}">
              <div class="flex justify-between text-[11px] text-slate-400 mb-1.5">
                <span class="font-bold ${msg.senderRole === 'SUPPORT' ? 'text-emerald-400' : 'text-purple-300'}">
                  ${msg.senderRole === 'SUPPORT' ? 'Rahul (Support Executive)' : activeTicket.userName + ' (' + (msg.senderRole || activeTicket.userRole) + ')'}
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
    console.error('Support desk load error:', err);
  }
}

function selectExecutiveTicket(ticketId) {
  activeExecutiveTicketId = ticketId;
  loadSupportExecutiveDesk();
}

async function sendSupportExecutiveReply() {
  const input = document.getElementById('support-desk-reply');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  try {
    await fetch('/api/support/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
        'x-user-role': 'SUPPORT',
        'x-user-id': currentUser?.id || 'usr_support_1',
        'x-user-name': currentUser?.fullName || 'Rahul (Customer Care)'
      },
      body: JSON.stringify({
        ticketId: activeExecutiveTicketId || 'ticket_sample_101',
        senderId: currentUser?.id || 'usr_support_1',
        senderRole: 'SUPPORT',
        content: text
      })
    });
    input.value = '';
    await loadSupportExecutiveDesk();
  } catch (err) {
    console.error('Support reply error:', err);
  }
}

function startSupportExecutivePolling() {
  if (supportExecutivePollTimer) clearInterval(supportExecutivePollTimer);

  supportExecutivePollTimer = setInterval(async () => {
    if (!currentUser || currentUser.role !== 'SUPPORT') {
      clearInterval(supportExecutivePollTimer);
      return;
    }

    // 1. Check for incoming VoIP calls
    try {
      const res = await fetch('/api/support/call/status', {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      const call = data.call;

      if (call && call.status === 'RINGING') {
        supportActiveIncomingCall = call;
        const incomingBox = document.getElementById('support-incoming-call-box');
        if (incomingBox && incomingBox.classList.contains('hidden')) {
          incomingBox.classList.remove('hidden');
          const callerNameEl = document.getElementById('support-caller-name');
          const callerRoleEl = document.getElementById('support-caller-role-text');
          if (callerNameEl) callerNameEl.textContent = call.callerName || 'Fan User';
          if (callerRoleEl) callerRoleEl.textContent = `${call.callerRole || 'User'} • Requesting Live Voice Assistance`;
          startSupportDeskRingtone();
        }
      } else {
        // If not ringing, ensure incoming popup is hidden
        const incomingBox = document.getElementById('support-incoming-call-box');
        if (incomingBox && !incomingBox.classList.contains('hidden') && !supportDeskActiveCall) {
          incomingBox.classList.add('hidden');
          stopSupportDeskRingtone();
        }
        if (call && (call.status === 'ENDED' || call.status === 'DECLINED') && supportDeskActiveCall) {
          endSupportDeskCall(true);
        }
      }
    } catch (e) {
      console.warn('Support call poll warning:', e);
    }

    // 2. Refresh active ticket messages every 3s
    const supportDash = document.getElementById('dashboard-support');
    if (supportDash && !supportDash.classList.contains('hidden')) {
      loadSupportExecutiveDesk();
    }
  }, 2000);
}

async function approveSupportIncomingCall() {
  stopSupportDeskRingtone();
  const incomingBox = document.getElementById('support-incoming-call-box');
  const activeBox = document.getElementById('support-active-call-box');
  if (incomingBox) incomingBox.classList.add('hidden');

  try {
    const res = await fetch('/api/support/call/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({
        callId: supportActiveIncomingCall?.callId,
        action: 'APPROVE'
      })
    });
    const data = await res.json();
    supportDeskActiveCall = data.call || supportActiveIncomingCall;
  } catch (err) {
    console.error('Call approval error:', err);
  }

  // Broadcast cross-tab approval
  localStorage.setItem('fc_support_call_signal', JSON.stringify({
    type: 'CONNECTED',
    callId: supportActiveIncomingCall?.callId,
    timestamp: Date.now()
  }));

  if (activeBox) activeBox.classList.remove('hidden');
  const callerNameEl = document.getElementById('support-active-caller-name');
  if (callerNameEl) callerNameEl.textContent = supportActiveIncomingCall?.callerName || 'Arjun Nair';

  // Acquire Support Executive Microphone
  try {
    supportDeskLocalStream = await acquireUserAudioOnlySafely();
    const audioEl = document.getElementById('support-remote-audio');
    if (audioEl) {
      audioEl.muted = false;
      audioEl.volume = 1.0;
      audioEl.play().catch(() => {});
    }
  } catch (err) {
    console.warn('Support executive microphone warning:', err);
  }

  // Live Timer
  supportDeskCallDuration = 0;
  const timerEl = document.getElementById('support-desk-call-timer');
  if (timerEl) timerEl.textContent = '00:00';
  if (supportDeskCallInterval) clearInterval(supportDeskCallInterval);

  supportDeskCallInterval = setInterval(() => {
    supportDeskCallDuration++;
    const mins = String(Math.floor(supportDeskCallDuration / 60)).padStart(2, '0');
    const secs = String(supportDeskCallDuration % 60).padStart(2, '0');
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
  }, 1000);

  showCallToast('📞 Connected to ' + (supportActiveIncomingCall?.callerName || 'User'));
}

async function declineSupportIncomingCall() {
  stopSupportDeskRingtone();
  const incomingBox = document.getElementById('support-incoming-call-box');
  if (incomingBox) incomingBox.classList.add('hidden');

  try {
    await fetch('/api/support/call/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({
        callId: supportActiveIncomingCall?.callId,
        action: 'DECLINE'
      })
    });
  } catch (err) {}

  localStorage.setItem('fc_support_call_signal', JSON.stringify({
    type: 'DECLINED',
    callId: supportActiveIncomingCall?.callId,
    timestamp: Date.now()
  }));

  supportActiveIncomingCall = null;
}

function toggleSupportDeskMute() {
  isSupportDeskMuted = !isSupportDeskMuted;
  const btn = document.getElementById('btn-support-desk-mute');
  if (supportDeskLocalStream) {
    supportDeskLocalStream.getAudioTracks().forEach(t => { t.enabled = !isSupportDeskMuted; });
  }
  if (btn) {
    if (isSupportDeskMuted) {
      btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-rose-500"></i>';
      btn.classList.add('bg-rose-950/50', 'border-rose-500/50');
    } else {
      btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
      btn.classList.remove('bg-rose-950/50', 'border-rose-500/50');
    }
  }
}

async function endSupportDeskCall(isRemote = false) {
  if (supportDeskCallInterval) clearInterval(supportDeskCallInterval);
  const durationSec = supportDeskCallDuration;
  supportDeskCallDuration = 0;

  const activeBox = document.getElementById('support-active-call-box');
  if (activeBox) activeBox.classList.add('hidden');

  if (supportDeskLocalStream) {
    supportDeskLocalStream.getTracks().forEach(t => t.stop());
    supportDeskLocalStream = null;
  }

  if (!isRemote && supportDeskActiveCall?.callId) {
    try {
      await fetch('/api/support/call/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ callId: supportDeskActiveCall.callId })
      });
    } catch {}

    localStorage.setItem('fc_support_call_signal', JSON.stringify({
      type: 'ENDED',
      callId: supportDeskActiveCall.callId,
      timestamp: Date.now()
    }));
  }

  const mins = String(Math.floor(durationSec / 60)).padStart(2, '0');
  const secs = String(durationSec % 60).padStart(2, '0');
  showCallToast(`Call ended • Duration: ${mins}:${secs}`);
  supportDeskActiveCall = null;
  supportActiveIncomingCall = null;
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

const DEFAULT_USERS_FALLBACK = [
  { id: 'usr_normal_1', fullName: 'Rahul Sharma', role: 'NORMAL_USER', phoneNumber: '+91 98765 43210', avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150', city: 'Kochi', isVerified: true },
  { id: 'usr_celeb_1', fullName: 'Dulquer Salmaan', role: 'CELEBRITY', phoneNumber: '+91 98989 89898', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', city: 'Kochi', isVerified: true },
  { id: 'usr_celeb_2', fullName: 'Sithara Krishnakumar', role: 'CELEBRITY', phoneNumber: '+91 97777 77777', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', city: 'Calicut', isVerified: true },
  { id: 'usr_org_1', fullName: 'Wonderwall Media', role: 'ORGANIZATION', phoneNumber: '+91 94444 33322', avatarUrl: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=150', city: 'Kochi', isVerified: true },
  { id: 'usr_admin_1', fullName: 'Super Admin', role: 'SUPER_ADMIN', phoneNumber: '+91 99999 99999', avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150', city: 'Kochi', isVerified: true }
];

const DEFAULT_EVENTS_FALLBACK = [
  {
    id: 'evt_1',
    title: 'Kerala Tech Creators & Startup Summit 2026',
    venueName: 'Rajiv Gandhi Indoor Stadium',
    city: 'Kadavanthra, Kochi',
    bannerUrl: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
    ticketTiers: [{ price: 499 }]
  },
  {
    id: 'evt_2',
    title: 'Dulquer Sithara Live: Symphony of Kerala Tour',
    venueName: 'JLN Stadium Grounds',
    city: 'Kaloor, Kochi',
    bannerUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800',
    ticketTiers: [{ price: 799 }]
  },
  {
    id: 'evt_3',
    title: 'Grand Kochi Food & Cultural Carnival',
    venueName: 'Marine Drive Waterfront',
    city: 'Kochi',
    bannerUrl: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800',
    ticketTiers: [{ price: 199 }]
  }
];

const DEFAULT_CELEB_POSTS_FALLBACK = [
  {
    id: 'post_celeb_1',
    celebrityId: 'usr_celeb_1',
    celebrityName: 'Dulquer Sithara',
    celebrityAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    caption: 'Backstage vibes right before tonight’s live acoustic performance in Kochi! 🎤✨ Fans can connect with me on VIP video call!',
    mediaUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800',
    mediaType: 'IMAGE',
    likesCount: 1420,
    comments: [
      { id: 'c1', userName: 'Arjun Nair', content: 'Loved the acoustic set tonight! 🎶❤️' },
      { id: 'c2', userName: 'Meera Krishna', content: 'Can\'t wait for your next album release!' }
    ],
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: 'post_celeb_2',
    celebrityId: 'usr_celeb_1',
    celebrityName: 'Dulquer Sithara',
    celebrityAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    caption: 'Quick rehearsal snippet of my new single! Drops next week. What do you all think? 🎶❤️',
    mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-singer-singing-on-stage-with-microphone-41221-large.mp4',
    mediaType: 'VIDEO',
    likesCount: 2890,
    comments: [
      { id: 'c3', userName: 'Rahul', content: 'Pure goosebumps! Super voice!' }
    ],
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 'post_celeb_3',
    celebrityId: 'usr_celeb_2',
    celebrityName: 'Tovino Thomas',
    celebrityAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    caption: 'Day 45 on set! High-octane action scenes wrapped for the new project. Kerala cinema to the moon! 🎬💥💪',
    mediaUrl: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800',
    mediaType: 'IMAGE',
    likesCount: 5240,
    comments: [
      { id: 'c4', userName: 'Arjun Nair', content: 'Minnal Murali vibes return! 🔥🔥' }
    ],
    createdAt: new Date(Date.now() - 3600000 * 12).toISOString()
  },
  {
    id: 'post_celeb_4',
    celebrityId: 'usr_celeb_3',
    celebrityName: 'Kalyani Priyadarshan',
    celebrityAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    caption: 'Golden hour in Fort Kochi ✨ Wearing handcrafted traditional Kerala weaves for today’s festive campaign.',
    mediaUrl: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800',
    mediaType: 'IMAGE',
    likesCount: 4180,
    comments: [
      { id: 'c5', userName: 'Sneha', content: 'Fort Kochi sunsets are unmatched 🌅' }
    ],
    createdAt: new Date(Date.now() - 3600000 * 16).toISOString()
  },
  {
    id: 'post_celeb_5',
    celebrityId: 'usr_celeb_4',
    celebrityName: 'Basil Joseph',
    celebrityAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    caption: 'Script discussion with the team. When 4 filmmakers gather, 90% is jokes and 10% is actual movie writing! 😂🎥',
    mediaUrl: 'https://images.unsplash.com/photo-1526478806334-5fd488fcaabc?w=800',
    mediaType: 'IMAGE',
    likesCount: 6120,
    comments: [
      { id: 'c6', userName: 'Arjun Nair', content: 'Basil ettan\'s combo is always superhit! 🤣' }
    ],
    createdAt: new Date(Date.now() - 3600000 * 20).toISOString()
  },
  {
    id: 'post_celeb_6',
    celebrityId: 'usr_celeb_5',
    celebrityName: 'Aparna Balamurali',
    celebrityAvatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    caption: 'In the studio recording classical melodies with the orchestra. Music is healing. 🎼🕊️',
    mediaUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=800',
    mediaType: 'IMAGE',
    likesCount: 3340,
    comments: [
      { id: 'c7', userName: 'Divya', content: 'Soothing as always! Your voice is a blessing.' }
    ],
    createdAt: new Date(Date.now() - 3600000 * 28).toISOString()
  },
  {
    id: 'post_celeb_7',
    celebrityId: 'usr_celeb_6',
    celebrityName: 'Arjun Ratan (Arjyou)',
    celebrityAvatar: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150',
    caption: 'New vlog dropping tonight 8 PM! Exploring Kerala street food in Calicut Beach. Get ready for some mouthwatering delights! 🌯🔥',
    mediaUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800',
    mediaType: 'IMAGE',
    likesCount: 7850,
    comments: [
      { id: 'c8', userName: 'Arjun Nair', content: 'Calicut food vlog = peak cinema! 🤤' }
    ],
    createdAt: new Date(Date.now() - 3600000 * 6).toISOString()
  },
  {
    id: 'post_celeb_8',
    celebrityId: 'usr_celeb_2',
    celebrityName: 'Tovino Thomas',
    celebrityAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    caption: 'Late night gym grind. Consistency is the only superpower that matters! 🏋️‍♂️⚡ Stay motivated fam!',
    mediaUrl: 'https://assets.mixkit.co/videos/preview/mixkit-young-man-training-with-dumbbells-in-a-gym-42654-large.mp4',
    mediaType: 'VIDEO',
    likesCount: 9150,
    comments: [
      { id: 'c9', userName: 'Pranav', content: 'Beast mode unlocked! 💪🔥' }
    ],
    createdAt: new Date(Date.now() - 3600000 * 30).toISOString()
  }
];

async function fetchAllUsers() {
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.users && data.users.length) {
        allUsers = data.users;
        return;
      }
    }
  } catch (err) {
    console.warn('Users fetch error (using fallback):', err);
  }
  allUsers = DEFAULT_USERS_FALLBACK;
}

function initWebSocket() {
  if (!currentUser) return;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws?userId=${currentUser.id}`;
  socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      if (payload.type === 'MATCH_FOUND') {
        onMatchFound(payload);
      } else if (payload.type === 'PEER_DISCONNECTED') {
        alert('Partner skipped to next.');
        setCallState('searching');
      } else if (payload.type === 'END_CALL') {
        setCallState('idle');
        notifyCallEnded('📞 Call ended.');
      } else if (payload.type === 'INCOMING_CELEB_CALL') {
        if (payload.call) {
          const callId = payload.call.callId;
          const callType = payload.call.callType || 'CELEBRITY_VIDEO';
          if (isCelebActiveCall || (callId && handledCallSessions.has(callId))) {
            return;
          }
          activeServerCallId = callId;
          lastFanCallerName = `${payload.call.callerName || payload.call.caller || 'Arjun Nair'} (VIP Fan)`;
          simulateIncomingFanCall(lastFanCallerName, callId, callType);
        }
      } else if (payload.type === 'CELEB_CALL_RESPONSE') {
        if (payload.action === 'APPROVE') {
          if (callerCallState !== 'CONNECTED') {
            callerCallState = 'CONNECTED';
            onInChatCallApproved(payload.call);
          }
        } else {
          callerCallState = 'DECLINED';
          onInChatCallDeclined();
        }
      } else if (payload.type === 'CELEB_CALL_ENDED') {
        const isCelebUser = (currentUser && (currentUser.role === 'CELEBRITY' || currentUser.id === 'usr_celeb_1')) || 
          (document.getElementById('dashboard-celebrity') && !document.getElementById('dashboard-celebrity').classList.contains('hidden'));
        if (isCelebUser) {
          dismissCelebrityIncomingCall(payload.callId || payload.call?.callId);
          if (isCelebActiveCall) {
            endCelebrityCall(true);
            notifyCallEnded('📞 Fan disconnected / ended the call.');
          }
        } else {
          onInChatCallEnded(payload.call?.endedBy || 'CELEBRITY');
        }
      } else if (payload.type === 'CELEB_WEBRTC_SIGNAL') {
        if (payload.signal?.type === 'RTC_OFFER' && currentUser?.role === 'CELEBRITY') {
          handleRtcOffer(payload.signal.sdp);
        } else if (payload.signal?.type === 'RTC_ANSWER' && currentUser?.role !== 'CELEBRITY') {
          handleRtcAnswer(payload.signal.sdp);
        } else if (payload.signal?.type === 'RTC_ICE_CANDIDATE') {
          handleRtcCandidate(payload.signal.candidate, payload.signal.fromRole);
        }
      } else if (payload.type === 'CELEB_VIDEO_FRAME') {
        applyRemoteVideoFrame(payload.frame, payload.fromRole);
      } else if (payload.type === 'CELEB_AVAILABILITY_CHANGED') {
        if (payload.celebrityId) {
          celebrityAvailabilityMap[payload.celebrityId] = payload.isAvailable;
          updateCelebrityOnlineOfflineDOM();
        }
      }
    } catch (err) {
      console.error('WS Error:', err);
    }
  };

  socket.onclose = () => {
    setTimeout(() => {
      if (currentUser && (!socket || socket.readyState === WebSocket.CLOSED)) {
        initWebSocket();
  initAppPeer();
      }
    }, 2000);
  };

  socket.onerror = () => {
    try { socket.close(); } catch {}
  };
}

// Nearby Events & Feed Loader for Normal User
async function loadNearbyEvents() {
  let eventsToRender = DEFAULT_EVENTS_FALLBACK;
  try {
    const res = await fetch(`/api/events?lat=9.9312&lon=76.2673&radius=${activeDistanceFilter}`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.events && data.events.length) {
        eventsToRender = data.events;
      }
    }
  } catch (err) {
    console.warn('Events fetch error (using fallback):', err);
  }

  const container = document.getElementById('events-grid');
  if (!container) return;
  container.innerHTML = eventsToRender.map(evt => `
    <div class="bg-[#111928] border border-slate-800 rounded-2xl overflow-hidden shadow flex flex-col justify-between">
      <img src="${evt.bannerUrl}" class="w-full h-36 object-cover">
      <div class="p-4 flex-1 flex flex-col justify-between">
        <div>
          <h4 class="text-xs font-bold text-white mb-1">${evt.title}</h4>
          <p class="text-[11px] text-slate-400 mb-2">${evt.venueName || evt.venue || 'Kochi'}, ${evt.city || 'Kerala'}</p>
        </div>
        <div class="pt-3 border-t border-slate-800 flex justify-between items-center">
          <span class="text-xs font-bold text-amber-400">₹${evt.ticketTiers?.[0]?.priceInInr || evt.ticketTiers?.[0]?.price || 499}</span>
          <button onclick="openBookingModal('${evt.id}')" class="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs shadow">Book</button>
        </div>
      </div>
    </div>
  `).join('');
}

function filterEventsDistance(r) {
  activeDistanceFilter = r;
  document.getElementById('dist-10').className = r === 10 ? 'px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium' : 'px-2.5 py-1 rounded-md text-slate-400';
  document.getElementById('dist-50').className = r === 50 ? 'px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium' : 'px-2.5 py-1 rounded-md text-slate-400';
  document.getElementById('dist-all').className = r === 0 ? 'px-2.5 py-1 rounded-md bg-blue-600 text-white font-medium' : 'px-2.5 py-1 rounded-md text-slate-400';
  loadNearbyEvents();
}

function getStoredLikedPosts() {
  const key = 'fc_liked_posts_' + (currentUser?.id || 'usr_normal_1');
  try {
    const list = JSON.parse(localStorage.getItem(key) || '["post_celeb_1", "post_celeb_3", "post_celeb_7"]');
    return new Set(list);
  } catch {
    return new Set(['post_celeb_1', 'post_celeb_3', 'post_celeb_7']);
  }
}

function saveStoredLikedPosts(set) {
  const key = 'fc_liked_posts_' + (currentUser?.id || 'usr_normal_1');
  localStorage.setItem(key, JSON.stringify(Array.from(set)));
}

async function loadCelebrityHub(isBackgroundPoll = false) {
  fetchCelebrityAvailability();
  if (!isBackgroundPoll) renderCelebrityStories();

  let feedToRender = DEFAULT_CELEB_POSTS_FALLBACK;
  try {
    const res = await fetch('/api/celebrities/feed');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.feed && data.feed.length) {
        feedToRender = data.feed;
      }
    }
  } catch (err) {
    if (!isBackgroundPoll) console.warn('Feed fetch error (using fallback):', err);
  }

  renderCelebrityFeed(feedToRender);

  if (!window.celebFeedPollInterval) {
    window.celebFeedPollInterval = setInterval(() => {
      if (currentUser?.role === 'NORMAL') {
        const celebTab = document.getElementById('normal-tab-celebrity');
        if (celebTab && !celebTab.classList.contains('hidden')) {
          loadCelebrityHub(true);
        }
      }
    }, 8000);
  }
}

function renderCelebrityStories() {
  const container = document.getElementById('celebrity-stories-strip');
  if (!container) return;

  const creators = Object.entries(CELEB_PROFILES).map(([id, data]) => ({ id, ...data }));

  container.innerHTML = creators.map(creator => {
    const isOnline = isCelebrityOnline(creator.id);
    const ringClass = isOnline
      ? 'bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 group-hover:scale-105 shadow-md'
      : 'border-2 border-slate-700 bg-slate-800/80 grayscale opacity-75';
    const badgeHtml = isOnline
      ? `<span class="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-black flex items-center justify-center text-[8px] text-white shadow" title="Online • Accepting Calls"><i class="fa-solid fa-check"></i></span>`
      : `<span class="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-slate-700 border-2 border-black flex items-center justify-center text-[7px] text-slate-400 shadow" title="Offline • Not Accepting Calls"><i class="fa-solid fa-moon"></i></span>`;

    return `
      <div onclick="openCelebrityCallCard('${creator.id}')" class="flex flex-col items-center flex-shrink-0 cursor-pointer group transition active:scale-95">
        <div class="w-16 h-16 sm:w-18 sm:h-18 p-[2.5px] rounded-full ${ringClass} transition relative">
          <div class="w-full h-full rounded-full bg-black p-[2px]">
            <img src="${creator.avatar}" class="w-full h-full rounded-full object-cover" alt="${creator.name}">
          </div>
          ${badgeHtml}
        </div>
        <span class="text-[11px] font-medium text-slate-200 mt-1.5 max-w-[75px] truncate text-center group-hover:text-sky-300 transition">
          ${creator.name.split(' ')[0]}
        </span>
      </div>
    `;
  }).join('');
}

function renderCelebrityFeed(posts) {
  const container = document.getElementById('celebrity-feed');
  if (!container) return;

  const currentUserId = currentUser?.id || 'usr_normal_1';
  const likedPosts = getStoredLikedPosts();

  container.innerHTML = posts.map(post => {
    const isLiked = likedPosts.has(post.id);
    const isVideo = post.mediaType === 'VIDEO' || (post.mediaUrl && (post.mediaUrl.startsWith('data:video') || post.mediaUrl.endsWith('.mp4') || post.mediaUrl.endsWith('.webm')));
    const mediaHtml = isVideo
      ? `<video src="${post.mediaUrl}" controls playsinline class="w-full max-h-[520px] object-contain bg-black"></video>`
      : `<img src="${post.mediaUrl}" class="w-full max-h-[520px] object-contain bg-black" loading="lazy">`;

    const commentsList = post.comments || [];

    return `
      <article class="fc-glass-card rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-slate-950/70 backdrop-blur-xl">
        <!-- Post Header -->
        <div class="p-3.5 flex items-center justify-between border-b border-white/10">
          <div onclick="openCelebrityCallCard('${post.celebrityId || 'usr_celeb_1'}')" class="flex items-center gap-3 cursor-pointer group">
            <div class="w-10 h-10 p-[2px] rounded-full bg-gradient-to-tr from-amber-500 to-rose-500 group-hover:scale-105 transition shadow-sm">
              <img src="${post.celebrityAvatar || 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150'}" class="w-full h-full rounded-full object-cover">
            </div>
            <div>
              <div class="text-xs font-bold text-white flex items-center gap-1.5 group-hover:text-sky-300 transition">
                <span>${post.celebrityName}</span>
                <i class="fa-solid fa-circle-check text-sky-400 text-xs"></i>
              </div>
              <span class="text-[10px] text-slate-400 font-normal">Kochi, Kerala • ${timeAgo(post.createdAt)}</span>
            </div>
          </div>
          <button onclick="openCelebrityCallCard('${post.celebrityId || 'usr_celeb_1'}')" class="text-slate-400 hover:text-white p-2 rounded-lg transition cursor-pointer" title="Creator VIP Room">
            <i class="fa-solid fa-ellipsis"></i>
          </button>
        </div>

        <!-- Post Media -->
        <div class="relative bg-black flex items-center justify-center">
          ${mediaHtml}
        </div>

        <!-- Post Action Bar (Clean Instagram Style: Like & Comment only) -->
        <div class="p-4 pt-3">
          <div class="flex items-center gap-4 mb-2.5">
            <!-- Like Button (Toggle) -->
            <button onclick="togglePostLike('${post.id}')" id="btn-like-${post.id}" class="transition active:scale-125 focus:outline-none cursor-pointer" title="Like">
              ${isLiked 
                ? '<i class="fa-solid fa-heart text-rose-500 text-xl"></i>' 
                : '<i class="fa-regular fa-heart text-white hover:text-rose-400 text-xl"></i>'}
            </button>
            <!-- Comment Button -->
            <button onclick="togglePostComments('${post.id}')" class="transition active:scale-125 text-white hover:text-sky-400 focus:outline-none cursor-pointer" title="Comments">
              <i class="fa-regular fa-comment text-xl"></i>
            </button>
          </div>

          <!-- Likes Count Line -->
          <div class="text-xs font-bold text-white mb-1.5" id="likes-count-${post.id}">
            ${post.likesCount.toLocaleString()} likes
          </div>

          <!-- Caption Line -->
          <div class="text-xs text-slate-200 leading-relaxed mb-2">
            <span onclick="openCelebrityCallCard('${post.celebrityId || 'usr_celeb_1'}')" class="font-extrabold text-white mr-1.5 cursor-pointer hover:underline">
              ${post.celebrityName}
            </span>
            <span>${post.caption}</span>
          </div>

          <!-- Comments Count Link (Click to toggle comments, just like Instagram) -->
          ${commentsList.length > 0 ? `
            <div class="text-[11px] text-slate-400 mb-1 cursor-pointer hover:text-slate-200 transition" onclick="togglePostComments('${post.id}')">
              View all ${commentsList.length} comments
            </div>
          ` : `
            <div class="text-[11px] text-slate-400 mb-1 cursor-pointer hover:text-slate-200 transition" onclick="togglePostComments('${post.id}')">
              Add a comment...
            </div>
          `}

          <!-- Entire Comments Section (Hidden by default; opens ONLY on clicking comment button or link) -->
          <div id="comments-section-${post.id}" class="hidden mt-2 pt-2 border-t border-white/10 animate-fade-in">
            <!-- Comments List -->
            <div id="comments-box-${post.id}" class="space-y-1.5 mb-2.5 max-h-48 overflow-y-auto pr-1">
              <div id="comments-list-${post.id}" class="space-y-1.5">
                ${commentsList.map(c => `
                  <div class="text-xs leading-relaxed flex items-start gap-1.5">
                    <span class="font-bold text-white shrink-0">${c.userName}:</span>
                    <span class="text-slate-300">${c.content}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Quick Add Comment Input -->
            <div class="flex items-center gap-2 mt-2">
              <input id="comment-input-${post.id}" type="text" placeholder="Add a comment for ${post.celebrityName}..." 
                onkeydown="if(event.key==='Enter') submitPostComment('${post.id}')"
                class="flex-1 px-3 py-1.5 rounded-xl bg-white/[0.05] border border-white/15 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-white/40 transition" />
              <button onclick="submitPostComment('${post.id}')" class="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition active:scale-95 shadow cursor-pointer">
                Post
              </button>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

async function togglePostLike(postId) {
  const likedSet = getStoredLikedPosts();
  const currentlyLiked = likedSet.has(postId);
  const btn = document.getElementById(`btn-like-${postId}`);
  const countEl = document.getElementById(`likes-count-${postId}`);

  if (currentlyLiked) {
    likedSet.delete(postId);
    if (btn) btn.innerHTML = '<i class="fa-regular fa-heart text-white hover:text-rose-400 text-xl"></i>';
  } else {
    likedSet.add(postId);
    if (btn) btn.innerHTML = '<i class="fa-solid fa-heart text-rose-500 text-xl"></i>';
  }
  saveStoredLikedPosts(likedSet);

  try {
    const res = await fetch(`/api/celebrities/like/${postId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser?.id || 'usr_normal_1' })
    });
    const data = await res.json();
    if (data.success && countEl) {
      countEl.textContent = `${data.likes.toLocaleString()} likes`;
    }
  } catch (err) {
    console.warn('Like toggle network error:', err);
  }
}

function togglePostComments(postId) {
  const section = document.getElementById(`comments-section-${postId}`);
  if (!section) return;
  const isHidden = section.classList.contains('hidden');
  if (isHidden) {
    section.classList.remove('hidden');
    const input = document.getElementById(`comment-input-${postId}`);
    if (input) {
      setTimeout(() => input.focus(), 60);
    }
  } else {
    section.classList.add('hidden');
  }
}

async function submitPostComment(postId) {
  const input = document.getElementById(`comment-input-${postId}`);
  if (!input || !input.value.trim()) return;
  const content = input.value.trim();
  input.value = '';

  const userName = currentUser?.fullName || 'VIP Fan';
  const list = document.getElementById(`comments-list-${postId}`);
  if (list) {
    const div = document.createElement('div');
    div.className = 'text-xs leading-relaxed flex items-start gap-1.5 animate-fade-in';
    div.innerHTML = `<span class="font-bold text-white shrink-0">${userName}:</span><span class="text-slate-200">${content}</span>`;
    list.appendChild(div);
  }

  // Ensure comments section is visible
  const section = document.getElementById(`comments-section-${postId}`);
  section?.classList.remove('hidden');

  try {
    await fetch(`/api/celebrities/comment/${postId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser?.id || 'usr_normal_1',
        userName,
        userAvatar: currentUser?.avatarUrl,
        content
      })
    });
  } catch (e) {
    console.warn('Comment post error:', e);
  }
}

function shareCelebrityPost(postId) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(window.location.origin + '/#post/' + postId);
  }
  alert('🔗 Post link copied to clipboard!');
}

function bookmarkCelebrityPost(postId) {
  const btn = document.getElementById(`btn-bookmark-${postId}`);
  if (btn) {
    const isSaved = btn.innerHTML.includes('fa-solid');
    if (isSaved) {
      btn.innerHTML = '<i class="fa-regular fa-bookmark text-xl"></i>';
    } else {
      btn.innerHTML = '<i class="fa-solid fa-bookmark text-amber-400 text-xl"></i>';
    }
  }
}

function timeAgo(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

let activeUserTicketId = 'ticket_sample_101';
let userSupportChatPollTimer = null;
let activeSupportVoipCallId = null;
let supportVoipStatusPollTimer = null;
let supportVoipLocalStream = null;
let isSupportCallMuted = false;
let supportCallDuration = 0;
let supportCallInterval = null;

async function loadSupportTickets() {
  if (!currentToken) return;
  try {
    const res = await fetch('/api/support/tickets', {
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'x-user-id': currentUser?.id || 'usr_normal_1',
        'x-user-role': currentUser?.role || 'NORMAL',
        'x-user-name': currentUser?.fullName || 'Arjun Nair'
      }
    });
    const data = await res.json();
    if (data.success && data.tickets && data.tickets.length > 0) {
      let myTicket = data.tickets.find(t => t.userId === currentUser?.id);
      if (!myTicket) {
        if (currentUser?.role === 'CELEBRITY') {
          myTicket = data.tickets.find(t => t.id === 'ticket_celeb_201') || data.tickets[0];
        } else if (currentUser?.role === 'ORGANIZATION') {
          myTicket = data.tickets.find(t => t.id === 'ticket_org_301') || data.tickets[0];
        } else {
          myTicket = data.tickets.find(t => t.id === 'ticket_sample_101') || data.tickets[0];
        }
      }

      if (myTicket) {
        activeUserTicketId = myTicket.id;
        const container = document.getElementById('support-messages-container');
        if (container && myTicket.messages) {
          container.innerHTML = myTicket.messages.map(msg => `
            <div class="p-2.5 rounded-xl text-xs mb-2 transition-all ${
              msg.senderRole === 'SUPPORT'
                ? 'bg-slate-800 text-slate-200 mr-auto max-w-xs border border-slate-700/60 shadow-sm'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white ml-auto max-w-xs shadow-md'
            }">
              <div class="flex items-center justify-between text-[10px] opacity-75 mb-1 gap-2">
                <span class="font-bold">${msg.senderRole === 'SUPPORT' ? 'Rahul (Customer Care)' : 'You'}</span>
                <span>${new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p class="leading-relaxed">${msg.content}</p>
            </div>
          `).join('');
          container.scrollTop = container.scrollHeight;
        }
      }
    }
  } catch (err) {
    console.error('Support tickets error:', err);
  }
}

function startSupportChatAutoRefresh() {
  if (userSupportChatPollTimer) clearInterval(userSupportChatPollTimer);
  userSupportChatPollTimer = setInterval(() => {
    if (activeNormalTab === 'support') {
      loadSupportTickets();
    }
  }, 3000);
}

async function sendSupportMessage() {
  const input = document.getElementById('support-message-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const ticketId = activeUserTicketId || (
    currentUser?.role === 'CELEBRITY' ? 'ticket_celeb_201' :
    currentUser?.role === 'ORGANIZATION' ? 'ticket_org_301' : 'ticket_sample_101'
  );

  try {
    await fetch('/api/support/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
        'x-user-id': currentUser?.id || 'usr_normal_1',
        'x-user-role': currentUser?.role || 'NORMAL',
        'x-user-name': currentUser?.fullName || 'Arjun Nair'
      },
      body: JSON.stringify({
        ticketId,
        senderId: currentUser?.id || 'usr_normal_1',
        senderRole: currentUser?.role || 'NORMAL',
        senderName: currentUser?.fullName || 'Arjun Nair',
        content: text
      })
    });
    input.value = '';
    await loadSupportTickets();
  } catch (err) {
    console.error('Support send error:', err);
  }
}

// ----------------- DEDICATED IN-PLACE CUSTOMER CARE VOIP CALL -----------------

async function startSupportVoipCall() {
  const callCard = document.getElementById('support-voip-call-card');
  const btnStart = document.getElementById('btn-start-support-voip');
  const statusText = document.getElementById('support-call-status-text');
  const timerEl = document.getElementById('support-call-timer');
  const wavesEl = document.getElementById('support-voice-waves');

  if (callCard) callCard.classList.remove('hidden');
  if (btnStart) btnStart.classList.add('opacity-50', 'pointer-events-none');

  if (statusText) statusText.innerHTML = '<i class="fa-solid fa-phone-volume animate-pulse text-amber-400"></i><span>Calling Helpdesk Desk... (Ringing)</span>';
  if (wavesEl) wavesEl.classList.add('opacity-40');
  if (timerEl) timerEl.textContent = '00:00';
  supportCallDuration = 0;

  const callId = 'call_support_' + Date.now();
  activeSupportVoipCallId = callId;

  // 1. Ring backend support desk
  try {
    await fetch('/api/support/call/ring', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
      body: JSON.stringify({
        callId,
        callerId: currentUser?.id || 'usr_normal_1',
        callerName: currentUser?.fullName || 'Arjun Nair',
        callerRole: currentUser?.role || 'NORMAL'
      })
    });
  } catch (e) {
    console.warn('VoIP ring error:', e);
  }

  // Cross-tab broadcast for instant reaction
  localStorage.setItem('fc_support_call_signal', JSON.stringify({
    type: 'RING',
    callId,
    callerName: currentUser?.fullName || 'Arjun Nair',
    callerRole: currentUser?.role || 'NORMAL',
    timestamp: Date.now()
  }));

  // Acquire Caller Microphone with resilient 4-tier fallback
  try {
    supportVoipLocalStream = await acquireUserAudioOnlySafely();
    const audioEl = document.getElementById('support-user-voip-audio');
    if (audioEl) {
      audioEl.muted = false;
      audioEl.volume = 1.0;
      audioEl.play().catch(() => {});
    }
  } catch (err) {
    console.warn('Caller mic acquire warning:', err);
  }

  // Poll call status until CONNECTED, DECLINED, or ENDED
  if (supportVoipStatusPollTimer) clearInterval(supportVoipStatusPollTimer);
  supportVoipStatusPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/support/call/status?callId=${callId}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
      });
      const data = await res.json();
      const call = data.call;

      if (call && call.status === 'CONNECTED') {
        clearInterval(supportVoipStatusPollTimer);
        supportVoipStatusPollTimer = null;

        if (statusText) statusText.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping mr-1"></span><span>Connected • HD Voice Audio</span>';
        if (wavesEl) wavesEl.classList.remove('opacity-40');

        if (supportCallInterval) clearInterval(supportCallInterval);
        supportCallInterval = setInterval(() => {
          supportCallDuration++;
          const mins = String(Math.floor(supportCallDuration / 60)).padStart(2, '0');
          const secs = String(supportCallDuration % 60).padStart(2, '0');
          if (timerEl) timerEl.textContent = `${mins}:${secs}`;
        }, 1000);

        showCallToast('📞 Connected to Rahul (Helpdesk Executive)');
      } else if (call && call.status === 'DECLINED') {
        clearInterval(supportVoipStatusPollTimer);
        supportVoipStatusPollTimer = null;
        if (statusText) statusText.innerHTML = '<span class="text-rose-400 font-bold"><i class="fa-solid fa-phone-slash mr-1"></i> Call Declined by Helpdesk</span>';
        setTimeout(() => endSupportVoipCall(true), 2500);
      } else if (call && call.status === 'ENDED') {
        endSupportVoipCall(true);
      }
    } catch (e) {}
  }, 1000);
}

function toggleSupportCallMute() {
  isSupportCallMuted = !isSupportCallMuted;
  const btn = document.getElementById('btn-support-call-mute');
  if (supportVoipLocalStream) {
    supportVoipLocalStream.getAudioTracks().forEach(t => { t.enabled = !isSupportCallMuted; });
  }
  if (btn) {
    if (isSupportCallMuted) {
      btn.innerHTML = '<i class="fa-solid fa-microphone-slash text-rose-500"></i>';
      btn.classList.add('bg-rose-950/50', 'border-rose-500/50');
    } else {
      btn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
      btn.classList.remove('bg-rose-950/50', 'border-rose-500/50');
    }
  }
}

async function endSupportVoipCall(isRemote = false) {
  if (supportVoipStatusPollTimer) {
    clearInterval(supportVoipStatusPollTimer);
    supportVoipStatusPollTimer = null;
  }
  if (supportCallInterval) clearInterval(supportCallInterval);
  const durationSec = supportCallDuration;
  supportCallDuration = 0;

  const callCard = document.getElementById('support-voip-call-card');
  const btnStart = document.getElementById('btn-start-support-voip');
  if (callCard) callCard.classList.add('hidden');
  if (btnStart) btnStart.classList.remove('opacity-50', 'pointer-events-none');

  if (supportVoipLocalStream) {
    supportVoipLocalStream.getTracks().forEach(t => t.stop());
    supportVoipLocalStream = null;
  }

  if (!isRemote && activeSupportVoipCallId) {
    try {
      await fetch('/api/support/call/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentToken}` },
        body: JSON.stringify({ callId: activeSupportVoipCallId })
      });
    } catch {}

    localStorage.setItem('fc_support_call_signal', JSON.stringify({
      type: 'ENDED',
      callId: activeSupportVoipCallId,
      timestamp: Date.now()
    }));
  }

  const mins = String(Math.floor(durationSec / 60)).padStart(2, '0');
  const secs = String(durationSec % 60).padStart(2, '0');

  // Insert notification bubble in support chat messages
  const container = document.getElementById('support-messages-container');
  if (container) {
    const bubble = document.createElement('div');
    bubble.className = 'p-2 rounded-xl text-center text-[11px] bg-slate-900 border border-slate-800 text-slate-300 my-2 shadow-sm';
    bubble.innerHTML = `<i class="fa-solid fa-phone text-emerald-400 mr-1.5"></i> Voice Support Call ended • Duration: <span class="font-mono font-bold text-emerald-400">${mins}:${secs}</span>`;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
  }

  activeSupportVoipCallId = null;
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
          <h4 class="text-xs font-bold text-slate-300">No Tickets Booked Yet</h4>
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
function compressImageFile(file, maxDimension = 1200, quality = 0.82) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

async function handleCelebMediaFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const isVideo = file.type.startsWith('video');
  currentCelebUploadedMediaType = isVideo ? 'VIDEO' : 'IMAGE';

  let dataUrl = '';
  if (isVideo) {
    dataUrl = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.readAsDataURL(file);
    });
  } else {
    dataUrl = await compressImageFile(file, 1200, 0.85);
  }

  const input = document.getElementById('media-input-url');
  if (input) input.value = dataUrl;

  const previewBox = document.getElementById('celeb-media-preview-box');
  const previewContent = document.getElementById('celeb-media-preview-content');
  const previewName = document.getElementById('celeb-media-name');
  const previewBadge = document.getElementById('celeb-media-type-badge');

  if (previewContent) {
    if (isVideo) {
      previewContent.innerHTML = `<video src="${dataUrl}" controls playsinline class="w-full max-h-48 rounded-xl object-contain bg-black"></video>`;
    } else {
      previewContent.innerHTML = `<img src="${dataUrl}" class="w-full max-h-48 rounded-xl object-contain bg-slate-900">`;
    }
  }

  if (previewName) previewName.textContent = file.name;
  if (previewBadge) {
    previewBadge.textContent = isVideo ? '🎬 Video Clip' : '📷 Photo File (Optimized)';
    previewBadge.className = isVideo 
      ? 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-950/40 text-pink-300 border border-pink-500/30' 
      : 'px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950/40 text-blue-300 border border-blue-500/30';
  }
  previewBox?.classList.remove('hidden');
}

// 4. Multi-tab Celebrity Call Approval, Live Video & Disconnect Sync Engine
async function handleCrossTabCallEvent(data) {
  if (!data || (!data.type && !data.state)) return;

  // Deduplication across BroadcastChannel and Storage events
  if (data.msgId) {
    if (seenCallMsgIds.has(data.msgId)) return;
    seenCallMsgIds.add(data.msgId);
    if (seenCallMsgIds.size > 200) {
      const first = seenCallMsgIds.values().next().value;
      seenCallMsgIds.delete(first);
    }
  }

  if (data.type === 'CELEB_AVAILABILITY_CHANGED') {
    if (data.celebrityId) {
      celebrityAvailabilityMap[data.celebrityId] = data.isAvailable;
      updateCelebrityOnlineOfflineDOM();
    }
    return;
  }

  const isCelebTab = (currentUser && (currentUser.role === 'CELEBRITY' || currentUser.id === 'usr_celeb_1')) || 
    (document.getElementById('dashboard-celebrity') && !document.getElementById('dashboard-celebrity').classList.contains('hidden'));
  const isNormalTab = (currentUser && currentUser.role === 'NORMAL') || 
    (document.getElementById('dashboard-normal') && !document.getElementById('dashboard-normal').classList.contains('hidden'));

  // 1. WebRTC Signaling Dispatch
  if (data.type === 'RTC_OFFER') {
    if (isCelebTab && data.sdp) {
      await handleRtcOffer(data.sdp);
    }
    return;
  }
  if (data.type === 'RTC_ANSWER') {
    if (isNormalTab && data.sdp) {
      await handleRtcAnswer(data.sdp);
    }
    return;
  }
  if (data.type === 'RTC_ICE_CANDIDATE') {
    const myRole = isCelebTab ? 'CELEBRITY' : 'NORMAL_USER';
    if (data.from && data.from !== myRole && data.candidate) {
      await handleRtcCandidate(data.candidate, data.from);
    }
    return;
  }

  // 2. CELEBRITY Console Events
  if (isCelebTab) {
    if (data.type === 'INCOMING_CALL' || data.state === 'incoming') {
      if (celebAvailable) {
        if (isCelebActiveCall || (data.callId && handledCallSessions.has(data.callId))) {
          return;
        }
        const callType = data.callType || 'CELEBRITY_VIDEO';
        lastFanCallerName = `${data.caller || 'Arjun Nair'} (VIP Fan)`;
        simulateIncomingFanCall(lastFanCallerName, data.callId, callType);
      }
    } else if (data.type === 'CALL_ENDED' || data.state === 'ended' || data.type === 'CELEB_CALL_ENDED') {
      dismissCelebrityIncomingCall(data.callId);
      closeRtcPeerConnection();
      if (isCelebActiveCall) {
        endCelebrityCall(true);
        notifyCallEnded(`📞 Fan ${data.caller || 'Arjun Nair'} disconnected / ended the call.`, data.callId);
      }
    }
  }

  // 3. NORMAL USER Console Events
  if (isNormalTab) {
    if (data.type === 'CALL_APPROVED' || data.state === 'connected') {
      isCelebActiveCall = true;
      if (callerCallState !== 'CONNECTED') {
        callerCallState = 'CONNECTED';
        const inchatView = document.getElementById('normal-celeb-call-inchat-view');
        if (inchatView && !inchatView.classList.contains('hidden')) {
          await onInChatCallApproved(data);
        } else {
          setCallState('connected', true);
          await getOrCreateLocalCamera(false);
          initWebRtcConnection('NORMAL_USER');
          await createAndSendRtcOffer();
        }
      }
    } else if (data.type === 'CALL_DECLINED' || data.state === 'declined') {
      isCelebActiveCall = false;
      callerCallState = 'DECLINED';
      const inchatView = document.getElementById('normal-celeb-call-inchat-view');
      if (inchatView && !inchatView.classList.contains('hidden')) {
        onInChatCallDeclined();
      } else {
        closeRtcPeerConnection();
        setCallState('idle');
        notifyCallEnded('❌ Dulquer Sithara is currently unavailable / declined the call request.', data.callId);
      }
    } else if (data.type === 'CALL_ENDED' || data.state === 'ended') {
      isCelebActiveCall = false;
      callerCallState = 'ENDED';
      const inchatView = document.getElementById('normal-celeb-call-inchat-view');
      if (inchatView && !inchatView.classList.contains('hidden')) {
        onInChatCallEnded(data.endedBy || 'CELEBRITY', data.callId);
      } else {
        const activeCall = document.getElementById('call-state-connected');
        const searchingState = document.getElementById('call-state-searching');
        const wasActive = activeCall && !activeCall.classList.contains('hidden');
        const wasSearching = searchingState && !searchingState.classList.contains('hidden');

        closeRtcPeerConnection();
        setCallState('idle');

        if (wasActive) {
          notifyCallEnded(`📞 Call ended by ${data.endedBy === 'CELEBRITY' ? 'Dulquer Sithara' : 'partner'}.`, data.callId);
        } else if (wasSearching) {
          notifyCallEnded('📞 Call disconnected.', data.callId);
        }
      }
    }
  }
}

// Zero-latency cross-tab BroadcastChannel
getCelebCallChannel();

// Window Storage Listener (fallback across all windows/tabs)
window.addEventListener('storage', (event) => {
  if (event.key && event.key.startsWith('fc_celeb_call_sync_') && event.newValue) {
    try {
      const payload = JSON.parse(event.newValue);
      handleCrossTabCallEvent(payload);
    } catch {}
  }
  if (event.key === 'fc_incoming_celeb_call' && event.newValue) {
    try {
      const payload = JSON.parse(event.newValue);
      handleCrossTabCallEvent({ type: 'INCOMING_CALL', ...payload });
    } catch {}
  }
  if (event.key === 'fc_celeb_call_state' && event.newValue) {
    try {
      const payload = JSON.parse(event.newValue);
      handleCrossTabCallEvent(payload);
    } catch {}
  }
});
