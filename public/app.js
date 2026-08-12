// Socket.IO connection
const socket = io({
  withCredentials: true
});

// State
let currentUser = null;
let localStream = null;
let peerConnection = null;
let currentRoomId = null;
let isMicOn = true;
let isCameraOn = true;
let partnerUserId = null;
let selectedCountry = 'Worldwide';

// WebRTC configuration
const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

// DOM Elements
const authPage = document.getElementById('auth-page');
const chatPage = document.getElementById('chat-page');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authError = document.getElementById('auth-error');
const findMatchBtn = document.getElementById('find-match-btn');
const skipBtn = document.getElementById('skip-btn');
const countryBtn = document.getElementById('country-btn');
const profileBtn = document.getElementById('profile-btn');
const logoutBtn = document.getElementById('logout-btn');
const localVideo = document.getElementById('local-video');
const remoteVideo = document.getElementById('remote-video');
const waitingOverlay = document.getElementById('waiting-overlay');
const statusMessage = document.getElementById('status-message');
const partnerScreen = document.getElementById('partner-screen');
const remoteVideoWrapper = document.getElementById('remote-video-wrapper');
const localPlaceholder = document.getElementById('local-placeholder');
const localVideoWrapper = document.getElementById('local-video-wrapper');
const onlineCount = document.getElementById('online-count');
const partnerLabel = document.getElementById('partner-label');
const modalUsername = document.getElementById('modal-username');
const modalCountry = document.getElementById('modal-country');
const countryModal = document.getElementById('country-modal');
const profileModal = document.getElementById('profile-modal');
const closeCountryModal = document.getElementById('close-country-modal');
const closeProfileModal = document.getElementById('close-profile-modal');

// Auth tabs
document.querySelectorAll('.tab-btn').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.form-content').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
    authError.textContent = '';
  });
});

// Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (data.success) {
      currentUser = data.user;
      showChatPage();
      authenticateSocket();
    } else {
      authError.textContent = data.error;
    }
  } catch (error) {
    authError.textContent = 'Login failed. Please try again.';
  }
});

// Register
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const country = document.getElementById('register-country').value;

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, country })
    });

    const data = await response.json();

    if (data.success) {
      // Auto login after registration
      const loginResponse = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const loginData = await loginResponse.json();
      if (loginData.success) {
        currentUser = loginData.user;
        showChatPage();
        authenticateSocket();
      }
    } else {
      authError.textContent = data.error;
    }
  } catch (error) {
    authError.textContent = 'Registration failed. Please try again.';
  }
});

// Logout
logoutBtn.addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null;
    cleanup();
    showAuthPage();
  } catch (error) {
    console.error('Logout error:', error);
  }
});

// Show sections
function showChatPage() {
  authPage.classList.add('hidden');
  chatPage.classList.remove('hidden');
  modalUsername.textContent = currentUser.username;
  modalCountry.textContent = getCountryFlag(currentUser.country) + ' ' + currentUser.country;
  initializeLocalVideo();
}

function showAuthPage() {
  chatPage.classList.add('hidden');
  authPage.classList.remove('hidden');
}

function getCountryFlag(country) {
  const flags = {
    'Worldwide': '🌍',
    'Thailand': '🇹🇭',
    'USA': '🇺🇸',
    'UK': '🇬🇧',
    'Japan': '🇯🇵',
    'Korea': '🇰🇷',
    'China': '🇨🇳'
  };
  return flags[country] || '🌍';
}

// Socket authentication
function authenticateSocket() {
  socket.emit('authenticate', {
    userId: currentUser.id,
    username: currentUser.username,
    country: currentUser.country
  });
}

// Initialize local video
async function initializeLocalVideo() {
  try {
    // Try video and audio first
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    localVideo.srcObject = localStream;
    findMatchBtn.disabled = false;
  } catch (error) {
    console.error('Error accessing video/audio:', error);
    try {
      // Try audio only
      localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true
      });
      localVideo.srcObject = null;
      localVideo.poster = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect fill="%231a1a25"/><text x="50%" y="50%" text-anchor="middle" fill="%23a0a0b0" dy=".3em">No Camera</text></svg>';
      findMatchBtn.disabled = false;
      alert('Camera not found. Audio-only mode enabled.');
    } catch (audioError) {
      console.error('Error accessing audio:', audioError);
      // No devices available - text-only mode
      localStream = null;
      localVideo.srcObject = null;
      localVideo.poster = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"><rect fill="%231a1a25"/><text x="50%" y="50%" text-anchor="middle" fill="%23a0a0b0" dy=".3em">No Camera/Mic</text></svg>';
      findMatchBtn.disabled = false;
      alert('No camera or microphone found. Text-only mode enabled.');
    }
  }
}

// Country modal
countryBtn.addEventListener('click', () => {
  countryModal.classList.remove('hidden');
});

closeCountryModal.addEventListener('click', () => {
  countryModal.classList.add('hidden');
});

countryModal.addEventListener('click', (e) => {
  if (e.target === countryModal) {
    countryModal.classList.add('hidden');
  }
});

document.querySelectorAll('.country-option').forEach(option => {
  option.addEventListener('click', () => {
    selectedCountry = option.dataset.country;
    const flagIcon = countryBtn.querySelector('.flag-icon');
    flagIcon.textContent = option.textContent.split(' ')[0];
    countryModal.classList.add('hidden');
  });
});

// Profile modal
profileBtn.addEventListener('click', () => {
  profileModal.classList.remove('hidden');
});

closeProfileModal.addEventListener('click', () => {
  profileModal.classList.add('hidden');
});

profileModal.addEventListener('click', (e) => {
  if (e.target === profileModal) {
    profileModal.classList.add('hidden');
  }
});

// Find Match
findMatchBtn.addEventListener('click', () => {
  socket.emit('find-match', { country: selectedCountry });
});

// Skip
skipBtn.addEventListener('click', () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  socket.emit('skip');
  resetVideoUI();
  socket.emit('find-match', { country: selectedCountry });
});

// Socket event handlers
socket.on('online-count', (data) => {
  onlineCount.textContent = data.count;
});

socket.on('searching', () => {
  waitingOverlay.classList.remove('hidden');
  statusMessage.textContent = 'กำลังค้นหาคู่คุย...';
  statusMessage.classList.remove('hidden');
});

socket.on('search-cancelled', () => {
  waitingOverlay.classList.add('hidden');
  statusMessage.classList.add('hidden');
});

socket.on('match-found', async (data) => {
  waitingOverlay.classList.add('hidden');
  currentRoomId = data.roomId;
  partnerUserId = data.partner.id;
  partnerLabel.textContent = data.partner.username;
  
  partnerScreen.classList.add('hidden');
  remoteVideoWrapper.classList.remove('hidden');
  localPlaceholder.classList.add('hidden');
  localVideoWrapper.classList.remove('hidden');
  
  findMatchBtn.classList.add('hidden');
  skipBtn.classList.remove('hidden');
  
  statusMessage.textContent = 'เชื่อมต่อกับคู่คุยสุ่ม';
  
  // Join the room first
  socket.emit('join-room', { roomId: currentRoomId });
  
  // Then create peer connection and offer
  await createPeerConnection();
});

socket.on('join-room', (data) => {
  currentRoomId = data.roomId;
  console.log('Joined room:', currentRoomId);
});

socket.on('webrtc-offer', async (data) => {
  console.log('Received webrtc-offer');
  if (!peerConnection) {
    await createPeerConnection();
  }
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  console.log('Sending webrtc-answer');
  socket.emit('webrtc-answer', { roomId: currentRoomId, answer });
});

socket.on('webrtc-answer', async (data) => {
  console.log('Received webrtc-answer');
  await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
});

socket.on('ice-candidate', async (data) => {
  console.log('Received ice-candidate');
  if (peerConnection) {
    await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
});

socket.on('partner-skipped', () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  resetVideoUI();
  alert('Partner skipped');
});

socket.on('partner-disconnected', () => {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  resetVideoUI();
  alert('Partner disconnected');
});

// WebRTC functions
async function createPeerConnection() {
  if (!localStream) {
    console.error('No local stream available');
    alert('Camera/microphone is required for video chat');
    return;
  }

  peerConnection = new RTCPeerConnection(rtcConfig);

  // Add local tracks
  localStream.getTracks().forEach(track => {
    console.log('Adding track:', track.kind, track.enabled);
    peerConnection.addTrack(track, localStream);
  });

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    console.log('Received remote track:', event.track.kind);
    console.log('Remote stream:', event.streams[0]);
    remoteVideo.srcObject = event.streams[0];
    remoteVideo.play().catch(e => console.error('Error playing remote video:', e));
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('Sending ICE candidate');
      socket.emit('ice-candidate', {
        roomId: currentRoomId,
        candidate: event.candidate
      });
    }
  };

  // Handle ICE connection state
  peerConnection.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', peerConnection.iceConnectionState);
  };

  // Handle connection state
  peerConnection.onconnectionstatechange = () => {
    console.log('Connection state:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'connected') {
      statusMessage.textContent = 'เชื่อมต่อแล้ว';
    } else if (peerConnection.connectionState === 'disconnected') {
      statusMessage.textContent = 'ตัดการเชื่อมต่อ';
    }
  };

  // Create offer if initiator
  if (!currentRoomId) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    console.log('Created offer');
    socket.emit('webrtc-offer', { roomId: currentRoomId, offer });
  }
}

function resetVideoUI() {
  remoteVideo.srcObject = null;
  partnerScreen.classList.remove('hidden');
  remoteVideoWrapper.classList.add('hidden');
  localPlaceholder.classList.remove('hidden');
  localVideoWrapper.classList.add('hidden');
  
  partnerLabel.textContent = 'คู่คุย';
  statusMessage.textContent = '';
  statusMessage.classList.add('hidden');
  
  findMatchBtn.classList.remove('hidden');
  skipBtn.classList.add('hidden');
}

function cleanup() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  socket.emit('cancel-search');
  resetVideoUI();
}

// Check auth on load
async function checkAuth() {
  try {
    const response = await fetch('/api/me');
    const data = await response.json();
    if (data.user) {
      currentUser = data.user;
      showChatPage();
      authenticateSocket();
    }
  } catch (error) {
    showAuthPage();
  }
}

checkAuth();

// Handle page unload
window.addEventListener('beforeunload', () => {
  cleanup();
});
