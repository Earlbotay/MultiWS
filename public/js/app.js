/* ============================================
   Multichat - Common Application JavaScript
   ============================================ */

// ---- API Helper ----
const api = {
  async _request(method, url, body, isFormData = false) {
    const opts = {
      method,
      credentials: 'include',
      headers: {}
    };
    if (body && !isFormData) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    if (body && isFormData) {
      opts.body = body;
    }
    try {
      const res = await fetch(url, opts);
      if (res.status === 401) {
        window.location.href = '/index.html';
        return null;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || data.message || `Ralat ${res.status}`);
      }
      return data;
    } catch (err) {
      if (err.message && !err.message.startsWith('Ralat')) {
        throw new Error(`Ralat: ${err.message}`);
      }
      throw err;
    }
  },
  get(url) { return this._request('GET', url); },
  post(url, data) { return this._request('POST', url, data); },
  put(url, data) { return this._request('PUT', url, data); },
  del(url) { return this._request('DELETE', url); },
  upload(url, formData) { return this._request('POST', url, formData, true); }
};

// ---- Toast Notifications ----
function _getToastContainer() {
  let c = document.querySelector('.toast-container');
  if (!c) {
    c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

function showToast(message, type = 'success') {
  const container = _getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
  const iconClass = icons[type] || icons.info;
  toast.innerHTML = `<i class="fas ${iconClass}"></i><span></span>`;
  toast.querySelector('span').textContent = message;
  container.appendChild(toast);

  toast.addEventListener('click', () => _removeToast(toast));

  setTimeout(() => _removeToast(toast), 4000);
}

function _removeToast(toast) {
  if (toast._removing) return;
  toast._removing = true;
  toast.classList.add('toast-out');
  setTimeout(() => toast.remove(), 300);
}

// ---- Confirmation Modal ----
function showConfirm(title, message) {
  return new Promise((resolve) => {
    // Remove existing confirm modals
    document.querySelectorAll('.confirm-modal-overlay').forEach(el => el.remove());

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show confirm-modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3>${escapeHtml(title)}</h3>
          <button class="modal-close" data-action="cancel">&times;</button>
        </div>
        <div class="modal-body">
          <p>${escapeHtml(message)}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-action="cancel">Batal</button>
          <button class="btn btn-danger" data-action="confirm">Ya, Teruskan</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      const action = e.target.dataset.action;
      if (action === 'confirm') {
        overlay.remove();
        resolve(true);
      } else if (action === 'cancel') {
        overlay.remove();
        resolve(false);
      }
    });

    overlay.querySelector('.modal').addEventListener('click', (e) => e.stopPropagation());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
  });
}

// ---- Formatting Helpers ----
function formatPhone(phone) {
  if (!phone) return '-';
  // Remove @s.whatsapp.net suffix
  phone = phone.replace(/@.+/, '');
  // Format: +60 12-345 6789
  if (phone.startsWith('60') && phone.length >= 10) {
    return `+${phone.slice(0, 2)} ${phone.slice(2, 4)}-${phone.slice(4, 7)} ${phone.slice(7)}`;
  }
  return `+${phone}`;
}

function formatTime(timestamp) {
  if (!timestamp) return '-';
  // Auto-detect: jika < 1 trilion, ia dalam saat → tukar ke milisaat
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '-';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit', hour12: false });

  if (isToday) return time;
  if (isYesterday) return `Semalam, ${time}`;
  return d.toLocaleDateString('ms-MY', { day: '2-digit', month: '2-digit', year: 'numeric' }) + `, ${time}`;
}

function timeAgo(timestamp) {
  if (!timestamp) return '-';
  const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '-';
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);

  if (diff < 30) return 'baru sahaja';
  if (diff < 60) return `${diff} saat lalu`;
  if (diff < 3600) return `${Math.floor(diff / 60)} minit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
  return d.toLocaleDateString('ms-MY', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ---- Sidebar ----
function setActiveNav(page) {
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
}

function loadSidebar() {
  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';
  sidebar.id = 'sidebar';
  sidebar.innerHTML = `
    <div class="sidebar-logo">
      <i class="fab fa-whatsapp"></i>
      <span>Multichat</span>
    </div>
    <nav class="sidebar-nav">
      <a href="/dashboard.html" data-page="dashboard"><i class="fas fa-home"></i>Dashboard</a>
      <a href="/device.html" data-page="device"><i class="fas fa-mobile-screen-button"></i>Peranti</a>
      <a href="/chat.html" data-page="chat"><i class="fas fa-comments"></i>Ruang Chat</a>
      <a href="/blast.html" data-page="blast"><i class="fas fa-paper-plane"></i>Broadcast</a>
      <a href="/warmer.html" data-page="warmer"><i class="fas fa-fire"></i>Pemanasan</a>
      <a href="/checker.html" data-page="checker"><i class="fas fa-magnifying-glass"></i>Semak Nombor</a>
      <a href="/autoreply.html" data-page="autoreply"><i class="fas fa-robot"></i>Auto Balas</a>
      <a href="/status.html" data-page="status"><i class="fas fa-circle-dot"></i>Status WA</a>
      <div class="sidebar-divider"></div>
      <a href="#" class="logout-btn" id="logoutBtn"><i class="fas fa-right-from-bracket"></i>Log Keluar</a>
    </nav>
  `;

  // Toggle button for mobile
  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'sidebar-toggle';
  toggleBtn.id = 'sidebarToggle';
  toggleBtn.innerHTML = '<i class="fas fa-bars"></i>';

  // Overlay for mobile
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  overlay.id = 'sidebarOverlay';

  document.body.prepend(overlay);
  document.body.prepend(sidebar);
  document.body.prepend(toggleBtn);

  // Toggle sidebar
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('show');
  });

  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('show');
  });

  // Logout handler
  document.getElementById('logoutBtn').addEventListener('click', async (e) => {
    e.preventDefault();
    const ok = await showConfirm('Log Keluar', 'Adakah anda pasti mahu log keluar?');
    if (ok) {
      try {
        await api.post('/api/auth/logout');
      } catch (_) { /* ignore */ }
      window.location.href = '/index.html';
    }
  });
}

// ---- Generic Modal helpers ----
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

// ---- Escape HTML ----
function escapeHtml(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ---- Init page on load ----
document.addEventListener('DOMContentLoaded', () => {
  // Only load sidebar if not login page
  if (!document.body.classList.contains('login-page')) {
    loadSidebar();
    // Detect current page for active nav
    const path = window.location.pathname.split('/').pop().replace('.html', '') || 'dashboard';
    setActiveNav(path);
  }
});
