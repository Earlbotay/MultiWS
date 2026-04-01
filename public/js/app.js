/* ===== Multichat Shared JavaScript ===== */

// ===== UTILITIES =====
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'baru je';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' min lalu';
  if (diff < 86400000) return d.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short' });
}

function formatDate(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatPhone(phone) {
  if (!phone) return 'Tiada nombor';
  return '+' + phone;
}

// ===== TOAST NOTIFICATIONS =====
let toastContainer = null;

function showToast(message, type = 'info') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ===== API HELPER =====
async function api(url, options = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      credentials: 'same-origin',
      ...options,
    });
    const data = await res.json();
    if (!res.ok || data.success === false) {
      throw new Error(data.error || `Ralat ${res.status}`);
    }
    return data;
  } catch (err) {
    if (err.message.includes('log masuk') || err.message.includes('401')) {
      window.location.href = '/';
    }
    throw err;
  }
}

// ===== SSE (Server-Sent Events) =====
let eventSource = null;
const sseHandlers = {};

function connectSSE() {
  if (eventSource) eventSource.close();
  eventSource = new EventSource('/api/events');

  eventSource.addEventListener('connected', () => {
    console.log('[SSE] Bersambung');
  });

  eventSource.onerror = () => {
    console.warn('[SSE] Terputus, mencuba semula...');
    setTimeout(connectSSE, 5000);
  };

  // Register existing handlers
  for (const [event, handlers] of Object.entries(sseHandlers)) {
    for (const handler of handlers) {
      eventSource.addEventListener(event, handler);
    }
  }
}

function onSSE(event, callback) {
  if (!sseHandlers[event]) sseHandlers[event] = [];
  const handler = (e) => {
    try { callback(JSON.parse(e.data)); } catch (err) { console.error('[SSE] Ralat:', err); }
  };
  sseHandlers[event].push(handler);
  if (eventSource) {
    eventSource.addEventListener(event, handler);
  }
}

// ===== AUTH STATE =====
let currentUser = null;

async function checkAuth() {
  try {
    const res = await api('/api/auth/me');
    currentUser = res.data;
    return currentUser;
  } catch (err) {
    return null;
  }
}

async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch (err) {}
  window.location.href = '/';
}

// ===== SIDEBAR =====
function loadSidebar(activePage) {
  const sidebarEl = document.getElementById('sidebar');
  if (!sidebarEl || sidebarEl.dataset.loaded === 'true') return;
  sidebarEl.dataset.loaded = 'true';

  const isAdmin = currentUser && currentUser.role === 'admin';

  const navItems = [
    { id: 'dashboard', icon: '📊', label: 'Dashboard', href: '/dashboard.html' },
    { id: 'devices', icon: '📱', label: 'Peranti', href: '/device.html' },
    { id: 'chat', icon: '💬', label: 'Sembang', href: '/chat.html' },
    { id: 'blast', icon: '📢', label: 'Broadcast', href: '/blast.html' },
    { id: 'warmer', icon: '🔥', label: 'Warmer', href: '/warmer.html' },
    { id: 'checker', icon: '✅', label: 'Checker', href: '/checker.html' },
    { id: 'autoreply', icon: '🤖', label: 'Auto Balas', href: '/autoreply.html' },
    { id: 'status', icon: '📡', label: 'Status', href: '/status.html' },
  ];

  if (isAdmin) {
    navItems.push({ divider: true });
    navItems.push({ id: 'admin', icon: '🛡️', label: 'Panel Admin', href: '/admin.html' });
  }

  let navHtml = '';
  for (const item of navItems) {
    if (item.divider) {
      navHtml += '<div class="nav-divider"></div>';
      continue;
    }
    const active = activePage === item.id ? ' active' : '';
    navHtml += `<a class="nav-item${active}" href="${item.href}">
      <span class="icon">${item.icon}</span>
      <span>${item.label}</span>
    </a>`;
  }

  const initial = currentUser ? currentUser.username.charAt(0).toUpperCase() : '?';

  sidebarEl.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">💬</div>
      <span class="sidebar-title">Multichat</span>
    </div>
    <nav class="sidebar-nav">${navHtml}</nav>
    <div class="sidebar-footer">
      <div class="user-info">
        <div class="user-avatar">${initial}</div>
        <div>
          <div class="user-name">${escapeHtml(currentUser ? currentUser.username : 'Pengguna')}</div>
          <div class="user-role">${escapeHtml(currentUser ? currentUser.role : '')}</div>
        </div>
      </div>
      <button class="btn btn-outline btn-sm w-full mt-2" onclick="logout()">🚪 Log Keluar</button>
    </div>
  `;
}

// ===== MODAL HELPER =====
function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

// ===== CONFIRMATION DIALOG =====
function confirmAction(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">⚠️ Pengesahan</h3>
        </div>
        <p style="color: var(--text-secondary); font-size: 14px; margin-bottom: 20px;">${escapeHtml(message)}</p>
        <div class="modal-footer">
          <button class="btn btn-outline" id="confirmNo">Batal</button>
          <button class="btn btn-danger" id="confirmYes">Ya, Teruskan</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirmNo').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#confirmYes').onclick = () => { overlay.remove(); resolve(true); };
  });
}

// ===== PAGE INIT =====
async function initPage(pageName) {
  const user = await checkAuth();
  if (!user) {
    window.location.href = '/';
    return null;
  }
  loadSidebar(pageName);
  connectSSE();
  return user;
}
