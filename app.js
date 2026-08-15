// ===== PTA App — Native Mobile JavaScript =====

// ===== Splash Screen =====
window.addEventListener('load', () => {
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hide');
  }, 1200);
});

// ===== Service Worker Registration =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.error('SW reg failed:', err));
  });
}

// ===== Theme Management =====
const root = document.body;
const savedTheme = localStorage.getItem('theme');
if (savedTheme) root.dataset.theme = savedTheme;

function updateThemeIcon() {
  const icon = document.querySelector('#themeToggle i');
  if (icon) icon.className = root.dataset.theme === 'light' ? 'bi bi-moon' : 'bi bi-sun';
}
updateThemeIcon();

document.getElementById('themeToggle').addEventListener('click', () => {
  const current = root.dataset.theme;
  const next = current === 'light' ? 'dark' : 'light';
  root.dataset.theme = next;
  localStorage.setItem('theme', next);
  updateThemeIcon();
});

// ===== Tab Navigation (Page Switching) =====
const tabs = document.querySelectorAll('.tab-item');
const pages = document.querySelectorAll('.page');

function switchPage(pageId) {
  pages.forEach((p) => p.classList.remove('active'));
  tabs.forEach((t) => t.classList.remove('active'));

  const page = document.getElementById(pageId);
  const tab = document.querySelector(`.tab-item[data-page="${pageId}"]`);

  if (page) page.classList.add('active');
  if (tab) tab.classList.add('active');

  // Update app bar title
  const titles = {
    'page-home': 'Precious Tots Academy',
    'page-programs': 'Programs',
    'page-gallery': 'Gallery',
    'page-contact': 'Contact',
    'page-admin': 'Admin Panel',
  };
  const titleEl = document.getElementById('appBarTitle');
  if (titleEl && titles[pageId]) titleEl.textContent = titles[pageId];

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Trigger scroll animations
  setTimeout(handleScrollAnimation, 100);
}

tabs.forEach((tab) => {
  tab.addEventListener('click', (e) => {
    e.preventDefault();
    const pageId = tab.getAttribute('data-page');
    switchPage(pageId);
  });
});

// ===== Bottom Sheet Management =====
function showSheet(sheetId) {
  const overlay = document.getElementById('sheetOverlay');
  const sheet = document.getElementById(sheetId);
  if (overlay) overlay.classList.add('show');
  if (sheet) sheet.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function hideSheet() {
  const overlay = document.getElementById('sheetOverlay');
  const sheets = document.querySelectorAll('.bottom-sheet');
  if (overlay) overlay.classList.remove('show');
  sheets.forEach((s) => s.classList.remove('show'));
  document.body.style.overflow = '';

  // Clear forms and alerts
  sheets.forEach((sheet) => {
    sheet.querySelectorAll('form').forEach((f) => f.reset());
    sheet.querySelectorAll('.alert-message').forEach((a) => a.remove());
  });
}

// Keep functions used by inline HTML actions available when this file runs as a module.
window.switchPage = switchPage;
window.hideSheet = hideSheet;

document.getElementById('sheetOverlay').addEventListener('click', hideSheet);

// Close sheet on handle click
document.querySelectorAll('.sheet-handle').forEach((h) => {
  h.addEventListener('click', hideSheet);
});

// ===== Auth Sheet Triggers =====
document.getElementById('loginTrigger').addEventListener('click', async () => {
  if (sb) await sb.auth.signOut();
  showAuthLanding('loginPanel');
});
document.getElementById('signupTrigger').addEventListener('click', () => showAuthLanding('signupPanel'));

function showAuthLanding(panelId = 'loginPanel') {
  document.getElementById('authLanding').style.display = 'flex';
  document.querySelectorAll('.protected-app').forEach((el) => { el.style.display = 'none'; });
  document.querySelectorAll('.auth-panel').forEach((panel) => panel.classList.toggle('active', panel.id === panelId));
  document.querySelectorAll('.auth-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.authPanel === panelId));
}

function showProtectedApp(user) {
  document.getElementById('authLanding').style.display = 'none';
  document.querySelectorAll('.protected-app').forEach((el) => { el.style.display = ''; });
  switchPage('page-home');
  updateNavigationForLoggedInUser(user);
}

document.querySelectorAll('.auth-tab').forEach((tab) => tab.addEventListener('click', () => showAuthLanding(tab.dataset.authPanel)));

// Switch between auth sheets
document.querySelectorAll('[data-sheet]').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    hideSheet();
    setTimeout(() => showSheet(el.getAttribute('data-sheet')), 300);
  });
});

// ===== Alert Helper =====
function showAlert(message, type = 'error', sheetId) {
  const sheet = sheetId ? document.getElementById(sheetId) : document.querySelector('.bottom-sheet.show');
  if (!sheet) {
    const container = document.querySelector('.auth-panel.active .auth-alerts');
    if (!container) return;
    container.querySelectorAll('.alert-message').forEach((a) => a.remove());
    const alert = document.createElement('div');
    alert.className = `alert-message alert-${type}`;
    alert.textContent = message;
    container.appendChild(alert);
    return;
  }

  sheet.querySelectorAll('.alert-message').forEach((a) => a.remove());

  const alert = document.createElement('div');
  alert.className = `alert-message alert-${type}`;
  alert.textContent = message;

  const content = sheet.querySelector('.sheet-content') || sheet.querySelector('.sheet-icon').parentNode;
  content.insertBefore(alert, content.firstChild);

  setTimeout(() => alert.remove(), 5000);
}

function setButtonLoading(button, isLoading) {
  if (isLoading) {
    button.classList.add('loading');
    button.disabled = true;
  } else {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

// ===== Supabase Auth =====
const sb = window.supabase;

// ===== Admin Constants (production admins) =====
const ADMIN_EMAILS = [
  'precioustotsacademy@outlook.com',
  'precioustotsacademy@gmail.com',
  'admin@precioustotsacademy.com',
  '2frankincense4m@gmail.com',
];

function isAdmin(email, user = null) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase()) || user?.app_metadata?.is_admin === true;
}

function isAdminUser(user) { return isAdmin(user?.email, user); }

// ===== Biometric / Screen Lock 2FA =====
let biometricUnlocked = false;
let biometricAuthenticationInProgress = false;
let approvedSessionActive = false;

async function checkBiometricAvailability() {
  if (!window.Capacitor || !window.Capacitor.Plugins.BiometricAuth) return null;
  try {
    const result = await window.Capacitor.Plugins.BiometricAuth.checkBiometry();
    return result;
  } catch (e) {
    console.error('Biometric check error:', e);
    return null;
  }
}

async function biometricAuthenticate() {
  if (!window.Capacitor || !window.Capacitor.Plugins.BiometricAuth) {
    // Web fallback — no biometric on web, auto-pass
    biometricUnlocked = true;
    return true;
  }
  try {
    await window.Capacitor.Plugins.BiometricAuth.authenticate({
      reason: 'Authenticate to access PTA',
      allowDeviceCredential: true,
      androidBiometryStrength: 'weak',
    });
    biometricUnlocked = true;
    return true;
  } catch (e) {
    console.error('Biometric auth error:', e);
    return false;
  }
}

function showBiometricLock() {
  const lock = document.getElementById('biometricLock');
  if (lock) lock.style.display = 'flex';
}

function hideBiometricLock() {
  const lock = document.getElementById('biometricLock');
  if (lock) lock.style.display = 'none';
}

async function tryBiometricUnlock() {
  if (biometricAuthenticationInProgress) return;
  biometricAuthenticationInProgress = true;
  const success = await biometricAuthenticate();
  biometricAuthenticationInProgress = false;
  if (success) {
    hideBiometricLock();
    await checkLegalAcceptance();
  } else {
    const msg = document.getElementById('biometricMsg');
    if (msg) msg.textContent = 'Authentication failed. Try again.';
  }
}

// Approved accounts must pass device authentication before app access.
async function initBiometricIfNeeded() {
  if (biometricUnlocked || biometricAuthenticationInProgress) return;
  const { data } = await sb.auth.getSession();
  if (!data.session) return;
  const user = data.session.user;
  if (!isAdmin(user.email, user) && user.app_metadata?.invite_status !== 'approved') return;
  approvedSessionActive = true;
  showBiometricLock();
  await tryBiometricUnlock();
}

// Biometric lock button handlers
document.addEventListener('DOMContentLoaded', () => {
  const unlockBtn = document.getElementById('biometricUnlockBtn');
  if (unlockBtn) unlockBtn.addEventListener('click', tryBiometricUnlock);
});

// Obscure approved-account content in the app switcher and authenticate again on resume.
if (window.Capacitor?.Plugins?.App) {
  window.Capacitor.Plugins.App.addListener('pause', () => {
    if (!approvedSessionActive) return;
    biometricUnlocked = false;
    showBiometricLock();
  });
  window.Capacitor.Plugins.App.addListener('resume', () => {
    if (approvedSessionActive) initBiometricIfNeeded();
  });
}

// Signup form
document.getElementById('signupForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const firstName = document.getElementById('firstName').value;
  const lastName = document.getElementById('lastName').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  const confirmPassword = document.getElementById('confirmPassword').value;
  const submitButton = this.querySelector('.auth-btn');

  if (!firstName || !lastName || !email || !password || !confirmPassword) {
    showAlert('Please fill in all fields');
    return;
  }
  if (password !== confirmPassword) {
    showAlert('Passwords do not match');
    return;
  }
  if (password.length < 6) {
    showAlert('Password must be at least 6 characters long');
    return;
  }
  if (!document.getElementById('agreeTerms').checked) {
    showAlert('Please agree to the Terms and Conditions');
    return;
  }

  if (!sb) {
    showAlert('Authentication service not available.', 'error');
    return;
  }

  try {
    setButtonLoading(submitButton, true);
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { first_name: firstName, last_name: lastName, invite_status: 'pending' } }
    });
    if (error) throw error;

    if (data.user && data.session === null) {
      showAlert('Request sent. Confirm your email, then wait for an administrator to provide your access code.', 'success');
    } else {
      await sb.auth.signOut();
      showAlert('Request sent to the administrator. You can log in after receiving your access code.', 'success');
    }
    this.reset();
    setTimeout(() => { hideSheet(); showAuthLanding('loginPanel'); }, 2000);
  } catch (error) {
    console.error('Signup error:', error);
    let msg = 'Signup failed. Please try again.';
    if (error.message.includes('already registered')) msg = 'This email is already registered. Please login.';
    else if (error.message.includes('invalid email')) msg = 'Please enter a valid email address.';
    else if (error.message.includes('weak password')) msg = 'Password is too weak. Please choose a stronger password.';
    showAlert(msg);
  } finally {
    setButtonLoading(submitButton, false);
  }
});

// Login form
document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const inviteCode = document.getElementById('sheetLoginInviteCode').value.trim().toUpperCase();
  const submitButton = this.querySelector('.auth-btn');

  if (!email || !password) {
    showAlert('Please fill in all fields');
    return;
  }

  if (!sb) {
    showAlert('Authentication service not available.', 'error');
    return;
  }

  try {
    setButtonLoading(submitButton, true);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!isAccountAllowed(data.user)) throw new Error('This account is suspended or pending deletion. Contact PTA support.');
    if (!isAdmin(data.user.email, data.user) && data.user.app_metadata?.invite_status !== 'approved') {
      if (!inviteCode) throw new Error('Your account is awaiting approval. Enter the access code provided by an administrator.');
      data.user = await verifyInviteCode(inviteCode);
    }

    showAlert(`Welcome back, ${data.user.email}!`, 'success');
    this.reset();
    setTimeout(() => { hideSheet(); updateNavigationForLoggedInUser(data.user); }, 1500);

    setTimeout(() => initBiometricIfNeeded(), 100);
  } catch (error) {
    console.error('Login error:', error);
    let msg = 'Login failed. Please check your credentials.';
    if (error.message.includes('Invalid login')) msg = 'Invalid email or password.';
    else if (error.message.includes('not confirmed')) msg = 'Please confirm your email first.';
    else if (error.message.includes('too many')) msg = 'Too many attempts. Try again later.';
    showAlert(msg);
  } finally {
    setButtonLoading(submitButton, false);
  }
});

// Authentication landing forms
document.getElementById('landingSignupForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const fullName = document.getElementById('fullName').value.trim();
  const email = document.getElementById('landingSignupEmail').value.trim();
  const password = document.getElementById('landingSignupPassword').value;
  const confirmation = document.getElementById('landingConfirmPassword').value;
  const button = this.querySelector('.auth-btn');
  if (!fullName || !email || !password || !confirmation) return showAlert('Please fill in all fields.');
  if (password !== confirmation) return showAlert('Passwords do not match.');
  if (password.length < 6) return showAlert('Password must be at least 6 characters long.');
  if (!sb) return showAlert('Authentication service not available.');
  try {
    setButtonLoading(button, true);
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, invite_status: 'pending' } },
    });
    if (error) throw error;
    if (data.session) await sb.auth.signOut();
    this.reset();
    showAlert(data.session ? 'Request sent to the administrator. You can log in after receiving your invite code.' : 'Request sent. Confirm your email, then wait for the administrator to provide your invite code.', 'success');
    setTimeout(() => showAuthLanding('loginPanel'), 2500);
  } catch (error) {
    showAlert(error.message?.includes('already registered') ? 'This email is already registered. Please log in.' : `Signup failed: ${error.message || 'Please try again.'}`);
  } finally {
    setButtonLoading(button, false);
  }
});

document.getElementById('landingLoginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const email = document.getElementById('landingLoginEmail').value.trim();
  const password = document.getElementById('landingLoginPassword').value;
  const inviteCode = document.getElementById('loginInviteCode').value.trim().toUpperCase();
  const button = this.querySelector('.auth-btn');
  if (!email || !password) return showAlert('Please enter your email and password.');
  if (!sb) return showAlert('Authentication service not available.');
  try {
    setButtonLoading(button, true);
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!isAccountAllowed(data.user)) throw new Error('This account is suspended or pending deletion. Contact PTA support.');
    let user = data.user;
    if (!isAdmin(user.email, user) && user.app_metadata?.invite_status !== 'approved') {
      if (!inviteCode) throw new Error('Your account is awaiting approval. Enter the access code provided by an administrator.');
      user = await verifyInviteCode(inviteCode);
    }
    this.reset();
    showProtectedApp(user);
  } catch (error) {
    if (sb) await sb.auth.signOut();
    let message = 'Login failed. Please check your credentials.';
    if (error.message?.includes('invite') || error.message?.includes('approval')) message = error.message;
    else if (error.message?.includes('Invalid login')) message = 'Invalid email or password.';
    showAlert(message);
  } finally {
    setButtonLoading(button, false);
  }
});

// Forgot password
document.getElementById('forgotPasswordForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  const email = document.getElementById('forgotEmail').value;
  const submitButton = this.querySelector('.auth-btn');

  if (!email) {
    showAlert('Please enter your email address');
    return;
  }

  if (!sb) {
    showAlert('Authentication service not available.', 'error');
    return;
  }

  try {
    setButtonLoading(submitButton, true);
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;

    showAlert('Password reset email sent! Check your inbox.', 'success');
    this.reset();
    setTimeout(() => hideSheet(), 3000);
  } catch (error) {
    console.error('Password reset error:', error);
    let msg = 'Failed to send reset email. Please try again.';
    if (error.message.includes('not found')) msg = 'No account found with this email.';
    else if (error.message.includes('invalid email')) msg = 'Please enter a valid email address.';
    showAlert(msg);
  } finally {
    setButtonLoading(submitButton, false);
  }
});

// Update nav for logged-in user
function updateNavigationForLoggedInUser(user) {
  approvedSessionActive = isAdmin(user.email, user) || user.app_metadata?.invite_status === 'approved';
  enforceCurrentAccountStatus();
  const loginTrigger = document.getElementById('loginTrigger');
  if (loginTrigger) {
    const name = (user.user_metadata && (user.user_metadata.first_name || user.user_metadata.full_name)) || user.email.split('@')[0];
    loginTrigger.innerHTML = `<i class="bi bi-person-check"></i> ${name}`;
    loginTrigger.onclick = async () => {
      if (sb) {
        await sb.auth.signOut();
        showAuthLanding('loginPanel');
      }
    };
  }
  // Show upload section if logged in
  const uploadSection = document.getElementById('uploadSection');
  if (uploadSection) uploadSection.style.display = isAdmin(user.email, user) ? 'block' : 'none';

  // Show admin tab if user is admin
  if (isAdmin(user.email, user)) {
    const adminTab = document.getElementById('adminTab');
    if (adminTab) adminTab.style.display = 'flex';
    loadAdminMembers();
  }

  if (approvedSessionActive) setTimeout(() => initBiometricIfNeeded(), 100);
}

async function enforceCurrentAccountStatus() {
  const {data:sessionData}=await sb.auth.getSession();
  if(!sessionData.session)return;
  const {data:status}=await sb.from('account_status').select('status,reason,updated_at').eq('user_id',sessionData.session.user.id).maybeSingle();
  if(status && status.status!=='active') {
    await sb.auth.signOut();
    alert(status.status==='suspended'?'Your PTA account is suspended. '+(status.reason||'Contact support for details.'):'Your account deletion request is pending. Contact support within the recovery window to cancel.');
    return;
  }
  if(status?.reason?.startsWith('Warning:') && localStorage.getItem('lastAccountWarning')!==status.updated_at) {
    localStorage.setItem('lastAccountWarning',status.updated_at);
    alert(status.reason);
  }
}

// Check auth state on load
if (sb) {
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      approvedSessionActive = false;
      biometricUnlocked = false;
      hideBiometricLock();
      showAuthLanding('loginPanel');
    }
    if (session && session.user && isAccountAllowed(session.user) && (isAdmin(session.user.email, session.user) || session.user.app_metadata?.invite_status === 'approved')) {
      showProtectedApp(session.user);
    }
  });

  // Check existing session
  sb.auth.getSession().then(({ data }) => {
    if (data.session && data.session.user && isAccountAllowed(data.session.user) && (isAdmin(data.session.user.email, data.session.user) || data.session.user.app_metadata?.invite_status === 'approved')) {
      showProtectedApp(data.session.user);
    } else {
      showAuthLanding('signupPanel');
    }
  });
}

// ===== Upload Logic (Supabase Storage) =====

// ===== Side Menu & Community Chat =====
let chatChannel = null;
function closeMenu() { document.getElementById('sideMenu')?.classList.remove('show'); document.getElementById('menuOverlay')?.classList.remove('show'); }
document.getElementById('menuToggle')?.addEventListener('click', () => { document.getElementById('sideMenu')?.classList.add('show'); document.getElementById('menuOverlay')?.classList.add('show'); });
document.getElementById('menuClose')?.addEventListener('click', closeMenu);
document.getElementById('menuOverlay')?.addEventListener('click', closeMenu);
document.querySelectorAll('[data-menu-page]').forEach(btn => btn.addEventListener('click', () => { const page = btn.dataset.menuPage; closeMenu(); switchPage(page); if (page === 'page-chat') loadChatMessages(); }));
function renderChatMessage(m, uid) { const row=document.createElement('div'); row.className='chat-message'+(m.user_id===uid?' mine':''); const header=document.createElement('div'); header.className='chat-message-header'; const n=document.createElement('button'); n.type='button'; n.className='chat-sender'; n.textContent=m.sender_name||'Deleted member'; if(m.user_id&&m.user_id!==uid)n.addEventListener('click',()=>openReportSheet({reportedUserId:m.user_id,type:'user',senderName:m.sender_name})); header.appendChild(n); if(m.user_id&&m.user_id!==uid){const menu=document.createElement('button');menu.type='button';menu.className='chat-menu-btn';menu.setAttribute('aria-label','Message actions');menu.innerHTML='<i class="bi bi-three-dots-vertical"></i>';menu.addEventListener('click',()=>showMessageActions(m));header.appendChild(menu);} const p=document.createElement('p');p.textContent=m.moderation_status==='removed'?'Message removed by a moderator':m.body;const t=document.createElement('small');t.textContent=new Date(m.created_at).toLocaleString();row.append(header,p,t);return row; }
async function loadChatMessages() { if(!sb)return; const {data:s}=await sb.auth.getSession(); if(!s.session)return; const box=document.getElementById('chatMessages'); const {data,error}=await sb.from('chat_messages').select('*').order('created_at',{ascending:true}).limit(200); box.innerHTML=''; if(error){box.textContent='Chatroom setup is required in Supabase.';return;} data.forEach(m=>box.appendChild(renderChatMessage(m,s.session.user.id))); box.scrollTop=box.scrollHeight; if(!chatChannel)chatChannel=sb.channel('pta-chat').on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_messages'},p=>{box.appendChild(renderChatMessage(p.new,s.session.user.id));box.scrollTop=box.scrollHeight;}).subscribe(); }
document.getElementById('chatForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!await requireLegalAcceptance())return;const input=document.getElementById('chatInput'),body=input.value.trim();if(!body)return;const {data}=await sb.auth.getSession(),user=data.session?.user;if(!user)return;const sender_name=user.user_metadata?.full_name||user.user_metadata?.first_name||user.email.split('@')[0];const {error}=await sb.from('chat_messages').insert({user_id:user.id,sender_name,body});if(!error)input.value='';else alert(error.message);});

function showMessageActions(message){const action=prompt('Message actions:\n1 — Report message\n2 — Report user\n3 — Block user');if(action==='1')openReportSheet({reportedUserId:message.user_id,messageId:message.id,type:'message',senderName:message.sender_name});if(action==='2')openReportSheet({reportedUserId:message.user_id,type:'user',senderName:message.sender_name});if(action==='3')blockUser(message.user_id,message.sender_name);}
function openReportSheet(target){pendingReportTarget=target;document.getElementById('reportTargetText').textContent=`Report ${target.type} from ${target.senderName||'this member'}`;document.getElementById('reportSheet').style.display='flex';}
async function blockUser(userId,name){if(!confirm(`Block ${name||'this member'}? Their messages will be hidden for you.`))return;const {data}=await sb.auth.getSession();const {error}=await sb.from('user_blocks').insert({blocker_id:data.session.user.id,blocked_user_id:userId});if(error&&!error.message.includes('duplicate'))return alert(error.message);await loadChatMessages();alert('User blocked. You can still report safety concerns separately.');}

const STORAGE_BUCKET = 'pta_uploads';

function getCurrentUserId() {
  if (!sb) return null;
  return null;
}

async function uploadFile(file, category) {
  if (!sb) { showUploadAlert('Service not available.', 'error'); return; }
  if (!await requireLegalAcceptance()) { showUploadAlert('Accept the current Terms and Community Guidelines before uploading.', 'error'); return; }

  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) {
    showUploadAlert('Please login to upload files.', 'error');
    showAuthLanding('loginPanel');
    return;
  }

  const userId = sessionData.session.user.id;
  const ext = file.name.split('.').pop().toLowerCase();
  const fileName = `${category}/${userId}/${Date.now()}.${ext}`;
  const validTypes = {
    photo: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'],
    pdf: ['pdf'],
    video: ['mp4', 'mov', 'avi', 'mkv', 'webm']
  };

  if (!validTypes[category] || !validTypes[category].includes(ext)) {
    showUploadAlert(`Invalid file type for ${category}. Allowed: ${validTypes[category].join(', ')}`, 'error');
    return;
  }

  const maxSize = category === 'video' ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
  if (file.size > maxSize) {
    showUploadAlert(`File too large. Max: ${category === 'video' ? '100MB' : '20MB'}`, 'error');
    return;
  }

  const progressEl = document.getElementById('uploadProgress');
  if (progressEl) { progressEl.style.display = 'block'; progressEl.textContent = 'Uploading...'; }

  try {
    const { data, error } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(fileName, file, { contentType: file.type, upsert: false });

    if (error) throw error;

    const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(fileName);
    showUploadAlert(`${category.charAt(0).toUpperCase() + category.slice(1)} uploaded successfully!`, 'success');
    addGalleryItem(urlData.publicUrl, category, file.name);
  } catch (error) {
    console.error('Upload error:', error);
    let msg = 'Upload failed. Please try again.';
    if (error.message.includes('not found') || error.message.includes('bucket')) {
      msg = 'Storage bucket not found. Please create "pta_uploads" bucket in Supabase dashboard.';
    } else if (error.message.includes('policy') || error.message.includes('permission')) {
      msg = 'Upload permission denied. Please configure storage policies in Supabase dashboard.';
    }
    showUploadAlert(msg, 'error');
  } finally {
    if (progressEl) { progressEl.style.display = 'none'; }
  }
}

function showUploadAlert(message, type = 'error') {
  const container = document.getElementById('uploadAlerts');
  if (!container) return;
  container.querySelectorAll('.alert-message').forEach((a) => a.remove());
  const alert = document.createElement('div');
  alert.className = `alert-message alert-${type}`;
  alert.textContent = message;
  container.appendChild(alert);
  setTimeout(() => alert.remove(), 5000);
}

function addGalleryItem(url, category, fileName) {
  const galleryGrid = document.querySelector('#page-gallery .gallery-grid');
  if (!galleryGrid) return;
  const item = document.createElement('div');
  item.className = 'gallery-item scroll-animate animated';
  if (category === 'photo') {
    item.innerHTML = `<img src="${url}" alt="${fileName}" style="width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:6px;"><h4>${fileName}</h4>`;
  } else if (category === 'pdf') {
    item.innerHTML = `<i class="bi bi-file-earmark-pdf gallery-icon"></i><h4>${fileName}</h4><a href="${url}" target="_blank" class="auth-link" style="font-size:0.7rem;">View PDF</a>`;
  } else if (category === 'video') {
    item.innerHTML = `<video src="${url}" controls style="width:100%;height:120px;object-fit:cover;border-radius:10px;margin-bottom:6px;"></video><h4 style="font-size:0.75rem;">${fileName}</h4>`;
  }
  galleryGrid.prepend(item);
}

// File input handlers
document.addEventListener('DOMContentLoaded', () => {
  const photoInput = document.getElementById('photoInput');
  const pdfInput = document.getElementById('pdfInput');
  const videoInput = document.getElementById('videoInput');

  if (photoInput) photoInput.addEventListener('change', (e) => {
    if (e.target.files[0]) uploadFile(e.target.files[0], 'photo');
  });
  if (pdfInput) pdfInput.addEventListener('change', (e) => {
    if (e.target.files[0]) uploadFile(e.target.files[0], 'pdf');
  });
  if (videoInput) videoInput.addEventListener('change', (e) => {
    if (e.target.files[0]) uploadFile(e.target.files[0], 'video');
  });
});

// Camera capture (Capacitor)
async function capturePhoto() {
  if (!await requireLegalAcceptance()) { showUploadAlert('Accept the current Terms and Community Guidelines before uploading.', 'error'); return; }
  if (!window.Capacitor || !window.Capacitor.Plugins.Camera) {
    // Fallback: trigger file input with camera capture
    const photoInput = document.getElementById('photoInput');
    if (photoInput) { photoInput.setAttribute('capture', 'environment'); photoInput.click(); }
    return;
  }
  try {
    if (localStorage.getItem('cameraRationaleSeen') !== 'true') {
      if (!confirm('PTA needs camera access only to take the photo you choose to upload to the school noticeboard. Continue?')) return;
      localStorage.setItem('cameraRationaleSeen', 'true');
    }
    const photo = await window.Capacitor.Plugins.Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: 'uri',
      source: 'CAMERA'
    });
    const blob = await fetch(photo.webPath).then(r => r.blob());
    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    uploadFile(file, 'photo');
  } catch (err) {
    console.error('Camera error:', err);
  }
}

if (document.getElementById('cameraBtn')) {
  document.getElementById('cameraBtn').addEventListener('click', capturePhoto);
}

// ===== Admin Member Management (via Supabase Edge Function) =====
const EDGE_FUNCTION_URL = 'https://pvhfkjinyrgxakvsoblp.supabase.co/functions/v1/admin-operations';
const COMPLIANCE_FUNCTION_URL = 'https://pvhfkjinyrgxakvsoblp.supabase.co/functions/v1/compliance-operations';
let legalAcceptanceCurrent = false;
let requiredLegalDocuments = [];
let pendingReportTarget = null;

function isAccountAllowed(user) { return !['suspended','deletion_pending'].includes(user?.app_metadata?.account_status); }

async function verifyInviteCode(inviteCode) {
  const headers = await getAdminHeaders();
  const res = await fetch(EDGE_FUNCTION_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'verifyInviteCode', inviteCode }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invite code verification failed.');
  const { data: refreshed, error } = await sb.auth.refreshSession();
  if (error || !refreshed.user) throw error || new Error('Could not refresh your access.');
  return refreshed.user;
}

async function getAdminHeaders() {
  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session) throw new Error('Not authenticated');
  return {
    'Authorization': `Bearer ${sessionData.session.access_token}`,
    'Content-Type': 'application/json',
  };
}

async function checkLegalAcceptance(){const {data:sessionData}=await sb.auth.getSession();if(!sessionData.session)return false;const [{data:documents,error:documentsError},{data:acceptances,error:acceptanceError}]=await Promise.all([sb.from('legal_documents').select('*').eq('required',true),sb.from('legal_acceptances').select('document_type,document_version').eq('user_id',sessionData.session.user.id)]);if(documentsError||acceptanceError){console.error('Legal acceptance check failed',documentsError||acceptanceError);document.getElementById('consentGate').style.display='flex';document.getElementById('consentError').textContent='The legal service is unavailable. Posting and uploads remain disabled.';return false;}requiredLegalDocuments=documents||[];legalAcceptanceCurrent=requiredLegalDocuments.every(d=>(acceptances||[]).some(a=>a.document_type===d.document_type&&a.document_version===d.current_version));document.getElementById('consentGate').style.display=legalAcceptanceCurrent?'none':'flex';return legalAcceptanceCurrent;}
async function requireLegalAcceptance(){if(legalAcceptanceCurrent)return true;await checkLegalAcceptance();if(!legalAcceptanceCurrent)document.getElementById('consentError').textContent='Accept the current documents before posting or uploading.';return legalAcceptanceCurrent;}
document.getElementById('acceptLegalBtn')?.addEventListener('click',async()=>{const checkbox=document.getElementById('consentCheckbox'),errorEl=document.getElementById('consentError'),button=document.getElementById('acceptLegalBtn');if(!checkbox.checked){errorEl.textContent='You must explicitly check the acceptance box.';return;}const {data}=await sb.auth.getSession();button.disabled=true;const rows=requiredLegalDocuments.map(d=>({user_id:data.session.user.id,document_type:d.document_type,document_version:d.current_version}));const {error}=await sb.from('legal_acceptances').upsert(rows,{onConflict:'user_id,document_type,document_version'});button.disabled=false;if(error){errorEl.textContent='Acceptance could not be recorded. Please try again.';return;}legalAcceptanceCurrent=true;document.getElementById('consentGate').style.display='none';});
document.getElementById('cancelReportBtn')?.addEventListener('click',()=>{document.getElementById('reportSheet').style.display='none';});
document.getElementById('reportForm')?.addEventListener('submit',async e=>{e.preventDefault();if(!pendingReportTarget)return;const {data}=await sb.auth.getSession();const payload={reporter_id:data.session.user.id,reported_user_id:pendingReportTarget.reportedUserId,message_id:pendingReportTarget.messageId||null,reason:document.getElementById('reportReason').value,details:document.getElementById('reportDetails').value.trim()||null};const {data:report,error}=await sb.from('content_reports').insert(payload).select('id').single();if(error)return alert(`Report could not be submitted: ${error.message}`);e.target.reset();document.getElementById('reportSheet').style.display='none';pendingReportTarget=null;alert(`Report submitted. Reference: ${report.id}`);});
document.getElementById('deleteAccountBtn')?.addEventListener('click',async()=>{if(!confirm('Request account deletion? Access will end immediately and permanent deletion is scheduled in 14 days.'))return;showBiometricLock();if(!await biometricAuthenticate()){hideBiometricLock();return alert('Device authentication is required.');}const headers=await getAdminHeaders();const res=await fetch(COMPLIANCE_FUNCTION_URL,{method:'POST',headers,body:JSON.stringify({action:'requestDeletion'})});const result=await res.json();if(!res.ok){hideBiometricLock();return alert(result.error||'Deletion request failed.');}await sb.auth.signOut();alert(`Deletion request ${result.requestId} received. Permanent deletion is scheduled for ${new Date(result.scheduledFor).toLocaleDateString()}. Contact support during the recovery window to cancel.`);});

async function loadAdminMembers() {
  if (!sb) return;
  const { data: sessionData } = await sb.auth.getSession();
  if (!sessionData.session || !isAdmin(sessionData.session.user.email, sessionData.session.user)) return;

  const listEl = document.getElementById('adminMemberList');
  const requestListEl = document.getElementById('adminRequestList');
  const adminListEl = document.getElementById('adminAdminList');
  const loadingEl = document.getElementById('adminLoading');
  const requestLoadingEl = document.getElementById('adminRequestLoading');
  if (loadingEl) loadingEl.style.display = 'block';
  if (requestLoadingEl) requestLoadingEl.style.display = 'block';
  if (listEl) listEl.innerHTML = '';
  if (requestListEl) requestListEl.innerHTML = '';
  if (adminListEl) adminListEl.innerHTML = '';

  try {
    const headers = await getAdminHeaders();
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'listUsers' }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to load members');

    if (loadingEl) loadingEl.style.display = 'none';
    if (requestLoadingEl) requestLoadingEl.style.display = 'none';

    const users = data.users || [];
    const requests = users.filter((u) => !isAdminUser(u) && u.app_metadata?.invite_status !== 'approved');
    const members = users.filter((u) => !isAdminUser(u) && u.app_metadata?.invite_status === 'approved');
    const administrators = users.filter(isAdminUser);
    document.getElementById('adminRequestCount').textContent = requests.length;
    document.getElementById('adminMemberCount').textContent = members.length;
    document.getElementById('adminAdminCount').textContent = administrators.length;
    if (!requests.length) requestListEl.innerHTML = '<p class="admin-empty">No account requests.</p>';
    if (!members.length) listEl.innerHTML = '<p class="admin-empty">No members found.</p>';
    if (!administrators.length) adminListEl.innerHTML = '<p class="admin-empty">No administrators found.</p>';

    requests.forEach((u) => {
      const name = getAdminUserName(u);
      const item = document.createElement('div');
      item.className = 'admin-member-item admin-request-item';
      item.innerHTML = `<div class="admin-member-info"><i class="bi bi-person-exclamation admin-member-icon"></i><div><div class="admin-member-name">${escapeHTML(name)}</div><div class="admin-member-email">${escapeHTML(u.email || '')}</div><span class="admin-status">${u.app_metadata?.invite_status === 'issued' ? 'Code issued' : 'Awaiting review'}</span></div></div><div class="admin-member-actions"><button class="admin-code-btn" data-user-id="${u.id}" data-email="${escapeHTML(u.email || '')}"><i class="bi bi-key"></i> ${u.app_metadata?.invite_status === 'issued' ? 'New code' : 'Generate code'}</button><button class="admin-action-btn admin-remove" aria-label="Reject request" data-user-id="${u.id}" data-email="${escapeHTML(u.email || '')}"><i class="bi bi-x-circle"></i></button></div>`;
      requestListEl.appendChild(item);
    });

    members.forEach((u) => {
      const name = getAdminUserName(u);
      const item = document.createElement('div');
      item.className = 'admin-member-item';
      item.innerHTML = `
        <div class="admin-member-info">
          <i class="bi bi-person admin-member-icon"></i>
          <div>
            <div class="admin-member-name">${escapeHTML(name)}</div>
            <div class="admin-member-email">${escapeHTML(u.email || '')}</div>
          </div>
        </div>
        <div class="admin-member-actions">
          <button class="admin-promote-btn" data-user-id="${u.id}" data-email="${escapeHTML(u.email || '')}"><i class="bi bi-shield-plus"></i> Make admin</button>
          <button class="admin-action-btn admin-remove" aria-label="Remove member" data-user-id="${u.id}" data-email="${escapeHTML(u.email || '')}"><i class="bi bi-person-x"></i></button>
        </div>
      `;
      if (listEl) listEl.appendChild(item);
    });

    administrators.forEach((u) => {
      const item = document.createElement('div');
      item.className = 'admin-member-item';
      item.innerHTML = `<div class="admin-member-info"><i class="bi bi-shield-check admin-member-icon"></i><div><div class="admin-member-name">${escapeHTML(getAdminUserName(u))}</div><div class="admin-member-email">${escapeHTML(u.email || '')}</div></div></div><span class="admin-badge">Admin</span>`;
      adminListEl.appendChild(item);
    });

    // Wire remove buttons
    document.getElementById('page-admin').querySelectorAll('.admin-remove').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        const userId = btn.getAttribute('data-user-id');
        const email = btn.getAttribute('data-email');
        if (confirm(`Remove user ${email}? This will delete their account.`)) {
          await removeMember(userId);
        }
      });
    });
    requestListEl.querySelectorAll('.admin-code-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const headers = await getAdminHeaders();
          const res = await fetch(EDGE_FUNCTION_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'issueInviteCode', userId: btn.dataset.userId }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not issue code');
          showInviteShareOptions(btn.dataset.email, data.inviteCode);
          loadAdminMembers();
        } catch (error) {
          showAdminAlert(error.message, 'error');
          btn.disabled = false;
        }
      });
    });
    listEl.querySelectorAll('.admin-promote-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Grant administrator privileges to ${btn.dataset.email}?`)) return;
        btn.disabled = true;
        try {
          const headers = await getAdminHeaders();
          const res = await fetch(EDGE_FUNCTION_URL, { method: 'POST', headers, body: JSON.stringify({ action: 'promoteAdmin', userId: btn.dataset.userId }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Could not promote member');
          showAdminAlert(`${btn.dataset.email} is now an administrator.`, 'success');
          loadAdminMembers();
        } catch (error) { showAdminAlert(error.message, 'error'); btn.disabled = false; }
      });
    });
    loadAdminReports();
  } catch (error) {
    console.error('Admin list error:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (requestLoadingEl) requestLoadingEl.style.display = 'none';
    if (listEl) listEl.innerHTML = '<p style="text-align:center;color:var(--primary-red);font-size:0.85rem;">Failed to load members. ' + (error.message || '') + '</p>';
  }
}

async function loadAdminReports(){const list=document.getElementById('adminReportList');if(!list)return;try{const headers=await getAdminHeaders();const res=await fetch(COMPLIANCE_FUNCTION_URL,{method:'POST',headers,body:JSON.stringify({action:'listReports'})});const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not load reports');const reports=data.reports||[],open=reports.filter(r=>r.status==='open'||r.status==='reviewing');document.getElementById('adminReportCount').textContent=open.length;list.innerHTML=open.length?'':'<p class="admin-empty">No open reports.</p>';open.forEach(report=>{const reporter=data.users?.[report.reporter_id]||{},reported=data.users?.[report.reported_user_id]||{};const card=document.createElement('div');card.className='report-card';card.innerHTML=`<div class="report-meta"><strong>${escapeHTML(report.reason.replaceAll('_',' '))}</strong><span>${new Date(report.created_at).toLocaleString()}</span></div><p>${escapeHTML(report.chat_messages?.body||'User report (no message attached)')}</p><small>Reporter: ${escapeHTML(reporter.email||report.reporter_id)}<br>Reported: ${escapeHTML(reported.email||report.reported_user_id)}</small><textarea class="form-input report-notes" rows="2" maxlength="2000" placeholder="Moderator notes"></textarea><div class="report-actions"><button data-decision="hide_message">Hide</button><button data-decision="remove_message">Remove</button><button data-decision="warn_user">Warn</button><button data-decision="suspend_user">Suspend</button><button data-decision="dismiss">Dismiss</button></div>`;card.querySelectorAll('[data-decision]').forEach(btn=>btn.addEventListener('click',()=>moderateReport(report.id,btn.dataset.decision,card.querySelector('.report-notes').value)));list.appendChild(card);});}catch(error){list.innerHTML=`<p class="form-error">${escapeHTML(error.message)}</p>`;}}
async function moderateReport(reportId,decision,notes){if(!confirm(`Apply moderation action: ${decision.replaceAll('_',' ')}?`))return;const headers=await getAdminHeaders();const res=await fetch(COMPLIANCE_FUNCTION_URL,{method:'POST',headers,body:JSON.stringify({action:'moderateReport',reportId,decision,notes})});const data=await res.json();if(!res.ok)return showAdminAlert(data.error||'Moderation failed','error');showAdminAlert('Report resolved.','success');loadAdminReports();}

function getAdminUserName(user) {
  return (user.user_metadata && (user.user_metadata.full_name || user.user_metadata.first_name)) || (user.email || 'Unknown').split('@')[0];
}

function escapeHTML(value) {
  const span = document.createElement('span');
  span.textContent = String(value);
  return span.innerHTML;
}

async function removeMember(userId) {
  if (!sb) return;
  try {
    const headers = await getAdminHeaders();
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'deleteUser', userId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove member');
    loadAdminMembers();
    showAdminAlert('Member removed successfully.', 'success');
  } catch (error) {
    console.error('Remove member error:', error);
    showAdminAlert('Failed to remove member. ' + (error.message || ''), 'error');
  }
}

function showAdminAlert(message, type = 'error') {
  const container = document.getElementById('adminAlerts');
  if (!container) return;
  container.querySelectorAll('.alert-message').forEach((a) => a.remove());
  const alert = document.createElement('div');
  alert.className = `alert-message alert-${type}`;
  alert.textContent = message;
  container.appendChild(alert);
  setTimeout(() => alert.remove(), 5000);
}

function showInviteShareOptions(email, inviteCode) {
  const container = document.getElementById('adminAlerts');
  if (!container) return;
  container.querySelectorAll('.alert-message, .invite-share-panel').forEach((el) => el.remove());

  const message = `Your Precious Tots Academy account has been approved.\n\nInvite code: ${inviteCode}\n\nOpen the PTA app and log in with your email, password, and this invite code. Please keep this code private.`;
  const panel = document.createElement('div');
  panel.className = 'invite-share-panel';

  const summary = document.createElement('p');
  summary.textContent = `Invite code for ${email}: ${inviteCode}`;
  panel.appendChild(summary);

  const actions = document.createElement('div');
  actions.className = 'invite-share-actions';

  const emailButton = document.createElement('button');
  emailButton.type = 'button';
  emailButton.className = 'invite-share-btn share-email';
  emailButton.innerHTML = '<i class="bi bi-envelope"></i> Email';
  emailButton.addEventListener('click', () => {
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Your PTA invite code')}&body=${encodeURIComponent(message)}`;
  });

  const whatsappButton = document.createElement('button');
  whatsappButton.type = 'button';
  whatsappButton.className = 'invite-share-btn share-whatsapp';
  whatsappButton.innerHTML = '<i class="bi bi-whatsapp"></i> WhatsApp';
  whatsappButton.addEventListener('click', () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  });

  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'invite-share-btn share-copy';
  copyButton.innerHTML = '<i class="bi bi-clipboard"></i> Copy';
  copyButton.addEventListener('click', async () => {
    await navigator.clipboard.writeText(message);
    showAdminAlert('Access code copied.', 'success');
  });
  const shareButton = document.createElement('button');
  shareButton.type = 'button';
  shareButton.className = 'invite-share-btn share-native';
  shareButton.innerHTML = '<i class="bi bi-share"></i> Share';
  shareButton.addEventListener('click', async () => {
    if (navigator.share) await navigator.share({ title: 'PTA access code', text: message });
    else await navigator.clipboard.writeText(message);
  });
  actions.append(copyButton, shareButton, emailButton, whatsappButton);
  panel.appendChild(actions);
  container.appendChild(panel);
}

// ===== Program Detail Sheet =====
const programData = {
  creche: { title: 'Crèche', body: 'Our crèche program provides gentle, nurturing care for our youngest learners. We focus on creating a warm, secure environment where children can explore and develop at their own pace. Activities are designed to stimulate sensory development and encourage early social interaction in a safe, supervised setting.' },
  reception: { title: 'Reception', body: 'The reception program introduces structured learning through play-based activities that foster creativity and teamwork. Children develop foundational skills in a supportive environment that encourages curiosity and builds confidence.' },
  kg1: { title: 'KG 1', body: 'In KG 1, we focus on building essential early learning skills through a balanced mix of structured activities and guided play. Children begin developing literacy and numeracy foundations while continuing to explore their creativity and social skills.' },
  kg2: { title: 'KG 2', body: 'Our KG 2 program prepares children for the transition to primary education with more structured learning experiences. We focus on developing independence, problem-solving skills, and a love for learning.' },
  preparatory: { title: 'Preparatory', body: 'The preparatory class offers comprehensive preparation for primary school with an enhanced curriculum that challenges and engages young minds. We focus on developing the academic and social skills needed for a successful transition to formal schooling.' },
  grade1: { title: 'Grade 1', body: 'First grade at Precious Tots Academy focuses on building strong foundational skills in literacy and numeracy. Our curriculum is designed to make learning engaging and meaningful while supporting each child\'s individual growth.' },
  grade2: { title: 'Grade 2', body: 'In second grade, we build upon core academic skills while encouraging greater independence in learning. Students continue to develop reading, writing, and mathematical abilities through interactive lessons.' },
  grade3: { title: 'Grade 3', body: 'Third grade expands subject knowledge and introduces more complex concepts across the curriculum. We focus on developing critical thinking skills and fostering a deeper understanding of core subjects.' },
  grade4: { title: 'Grade 4', body: 'Fourth grade emphasizes independent learning skills and personal responsibility in academic work. Students are encouraged to take ownership of their learning while receiving the guidance needed to succeed.' },
  grade5: { title: 'Grade 5', body: 'Our fifth grade program prepares students for the transition to secondary education with a comprehensive curriculum. We focus on developing the academic skills, study habits, and personal responsibility needed for success.' },
};

document.querySelectorAll('.program-card[data-program]').forEach((card) => {
  card.addEventListener('click', () => {
    const key = card.getAttribute('data-program');
    const data = programData[key];
    if (data) {
      document.getElementById('programDetailTitle').textContent = data.title;
      document.getElementById('programDetailBody').textContent = data.body;
      showSheet('programSheet');
    }
  });
});

// ===== Scroll Animations =====
function elementInView(el, dividend = 1.2) {
  const elementTop = el.getBoundingClientRect().top;
  return elementTop <= (window.innerHeight || document.documentElement.clientHeight) / dividend;
}

function handleScrollAnimation() {
  document.querySelectorAll('.scroll-animate:not(.animated)').forEach((el) => {
    if (elementInView(el)) el.classList.add('animated');
  });
}

window.addEventListener('scroll', handleScrollAnimation, { passive: true });
document.addEventListener('DOMContentLoaded', handleScrollAnimation);

// ===== Prevent pinch zoom (native feel) =====
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// Let inputs zoom on focus (iOS accessibility)
document.querySelectorAll('input, textarea, select').forEach((el) => {
  el.addEventListener('focus', () => {
    el.style.fontSize = '16px';
  });
});
