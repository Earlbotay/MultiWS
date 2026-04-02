/* ================================================================
   MultiChat — Shared JavaScript (app.js)
   Loaded by ALL pages. Provides: api(), showToast(), escapeHtml(),
   initSSE(), loadSidebar(), debounce(), formatPhone(), formatDate()
   ================================================================ */

/* ── API Helper ────────────────────────────────────────────────── */
async function api(url, options = {}) {
  // Prepend /api if not already present
  if (!url.startsWith('/api')) {
    url = '/api' + (url.startsWith('/') ? '' : '/') + url;
  }

  const fetchOpts = {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.headers || {})
    }
  };

  // Set JSON content type for POST/PUT/PATCH with body
  const method = (fetchOpts.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH'].includes(method) && fetchOpts.body && typeof fetchOpts.body === 'string') {
    fetchOpts.headers['Content-Type'] = fetchOpts.headers['Content-Type'] || 'application/json';
  }
  // Auto-stringify plain objects
  if (fetchOpts.body && typeof fetchOpts.body === 'object' && !(fetchOpts.body instanceof FormData)) {
    fetchOpts.headers['Content-Type'] = 'application/json';
    fetchOpts.body = JSON.stringify(fetchOpts.body);
  }

  const res = await fetch(url, fetchOpts);
  let data;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const msg = (typeof data === 'object' && data !== null)
      ? (data.error || data.message || `Error ${res.status}`)
      : `Error ${res.status}`;
    // Redirect to login on 401, but guard against infinite loop on login page
    if (res.status === 401 || (typeof msg === 'string' && msg.toLowerCase().includes('log masuk'))) {
      const p = window.location.pathname;
      if (p !== '/' && p !== '/index.html') {
        window.location.href = '/';
        return; // stop further execution
      }
    }
    throw new Error(msg);
  }

  return data;
}

/* ── Toast Notifications ───────────────────────────────────────── */
function showToast(message, type = 'success') {
  // Ensure toast container exists
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ'
  };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.success}</span>
    <span class="toast-body">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Auto-dismiss after 3 seconds
  const timer = setTimeout(() => removeToast(toast), 3000);

  // Allow click to dismiss early
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    removeToast(toast);
  });
}

function removeToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('removing');
  toast.addEventListener('animationend', () => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  });
}

/* ── Escape HTML (XSS Prevention) ──────────────────────────────── */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ── SSE (Server-Sent Events) ──────────────────────────────────── */
let _sseSource = null;

function initSSE() {
  // Close existing connection
  if (_sseSource) {
    _sseSource.close();
    _sseSource = null;
  }

  const es = new EventSource('/api/events');
  _sseSource = es;

  // ── device-status: update specific device card ──
  es.addEventListener('device-status', (e) => {
    try {
      const data = JSON.parse(e.data);
      const card = document.querySelector(`[data-device-id="${data.deviceId}"]`);
      if (card) {
        const badge = card.querySelector('.status-badge');
        if (badge) {
          badge.textContent = data.status;
          badge.className = `status-badge ${data.status}`;
        }
        // Update phone number if available
        if (data.phone) {
          const phoneEl = card.querySelector('.device-phone');
          if (phoneEl) phoneEl.textContent = formatPhone(data.phone);
        }
      }
      // Also update any stat elements showing connected device count
      const connectedEl = document.getElementById('stat-connected');
      if (connectedEl) {
        const allBadges = document.querySelectorAll('.status-badge.connected');
        connectedEl.textContent = allBadges.length;
      }
    } catch (err) {
      console.error('SSE device-status error:', err);
    }
  });

  // ── new-message: update chat or notification ──
  es.addEventListener('new-message', (e) => {
    try {
      const data = JSON.parse(e.data);
      // Update message count stat if present
      const msgCountEl = document.getElementById('stat-messages');
      if (msgCountEl) {
        const current = parseInt(msgCountEl.textContent) || 0;
        msgCountEl.textContent = current + 1;
      }
      // Append message to active chat if matching
      const chatContainer = document.getElementById('chat-messages');
      if (chatContainer && chatContainer.dataset.jid === data.message.remote_jid &&
          chatContainer.dataset.deviceId === String(data.deviceId)) {
        const msgDiv = document.createElement('div');
        const fromMe = data.message.from_me ? 'from-me' : 'received';
        msgDiv.className = `message ${fromMe}`;
        msgDiv.innerHTML = `
          <div class="message-bubble">${escapeHtml(data.message.message || '')}</div>
          <span class="message-time">${formatDate(data.message.timestamp)}</span>
        `;
        chatContainer.appendChild(msgDiv);
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
      // Update conversation list preview
      const convItem = document.querySelector(`.chat-item[data-jid="${data.message.remote_jid}"][data-device-id="${data.deviceId}"]`);
      if (convItem) {
        const preview = convItem.querySelector('.chat-preview');
        if (preview) preview.textContent = data.message.message || '';
        const time = convItem.querySelector('.chat-time');
        if (time) time.textContent = formatDate(data.message.timestamp);
      }
    } catch (err) {
      console.error('SSE new-message error:', err);
    }
  });

  // ── blast-progress: update specific blast row ──
  es.addEventListener('blast-progress', (e) => {
    try {
      const data = JSON.parse(e.data);
      const row = document.querySelector(`[data-blast-id="${data.blastId}"]`);
      if (row) {
        const sentEl = row.querySelector('.blast-sent');
        if (sentEl) sentEl.textContent = data.sent;
        const failedEl = row.querySelector('.blast-failed');
        if (failedEl) failedEl.textContent = data.failed;
        const totalEl = row.querySelector('.blast-total');
        if (totalEl) totalEl.textContent = data.total;
        // Update progress bar
        const progressBar = row.querySelector('.progress-bar');
        if (progressBar && data.total > 0) {
          const pct = Math.round(((data.sent + data.failed) / data.total) * 100);
          progressBar.style.width = pct + '%';
        }
        // Update status badge
        const badge = row.querySelector('.status-badge');
        if (badge && data.status) {
          badge.textContent = data.status;
          badge.className = `status-badge ${data.status}`;
        }
        // Update progress text
        const progressText = row.querySelector('.progress-text');
        if (progressText) {
          progressText.textContent = `${data.sent + data.failed} / ${data.total} (${data.sent} berjaya, ${data.failed} gagal)`;
        }
      }
    } catch (err) {
      console.error('SSE blast-progress error:', err);
    }
  });

  // ── warmer-update: update specific warmer row ──
  es.addEventListener('warmer-update', (e) => {
    try {
      const data = JSON.parse(e.data);
      const row = document.querySelector(`[data-warmer-id="${data.warmerId}"]`);
      if (row) {
        const sentEl = row.querySelector('.warmer-total-sent');
        if (sentEl) sentEl.textContent = data.totalSent;
        const lastEl = row.querySelector('.warmer-last-sent');
        if (lastEl) lastEl.textContent = data.lastSent ? formatDate(data.lastSent) : '-';
      }
    } catch (err) {
      console.error('SSE warmer-update error:', err);
    }
  });

  // ── qr-code: display QR in device card ──
  es.addEventListener('qr-code', (e) => {
    try {
      const data = JSON.parse(e.data);
      const card = document.querySelector(`[data-device-id="${data.deviceId}"]`);
      if (card) {
        // Remove any existing pairing/qr display
        const existing = card.querySelector('.qr-display, .pairing-display');
        if (existing) existing.remove();
        // Create QR display
        const qrDiv = document.createElement('div');
        qrDiv.className = 'qr-display';
        qrDiv.innerHTML = `
          <img src="${data.qr}" alt="QR Code">
          <p>Imbas kod QR ini dengan WhatsApp anda</p>
        `;
        const actionsEl = card.querySelector('.device-actions');
        if (actionsEl) {
          actionsEl.parentNode.insertBefore(qrDiv, actionsEl);
        } else {
          card.querySelector('.card-body')?.appendChild(qrDiv) || card.appendChild(qrDiv);
        }
      }
    } catch (err) {
      console.error('SSE qr-code error:', err);
    }
  });

  // ── pairing-code: display pairing code in device card ──
  es.addEventListener('pairing-code', (e) => {
    try {
      const data = JSON.parse(e.data);
      const card = document.querySelector(`[data-device-id="${data.deviceId}"]`);
      if (card) {
        // Remove any existing pairing/qr display
        const existing = card.querySelector('.qr-display, .pairing-display');
        if (existing) existing.remove();
        // Create pairing display
        const pairDiv = document.createElement('div');
        pairDiv.className = 'pairing-display';
        pairDiv.innerHTML = `
          <div class="pairing-code">${escapeHtml(data.code)}</div>
          <p>Masukkan kod ini dalam WhatsApp anda</p>
          <button class="btn btn-outline btn-sm" onclick="copyPairingCode('${escapeHtml(data.code)}')">📋 Salin Kod</button>
        `;
        const actionsEl = card.querySelector('.device-actions');
        if (actionsEl) {
          actionsEl.parentNode.insertBefore(pairDiv, actionsEl);
        } else {
          card.querySelector('.card-body')?.appendChild(pairDiv) || card.appendChild(pairDiv);
        }
      }
    } catch (err) {
      console.error('SSE pairing-code error:', err);
    }
  });

  // ── Error handler: reconnect after 5 seconds ──
  es.onerror = () => {
    es.close();
    _sseSource = null;
    setTimeout(initSSE, 5000);
  };
}

/* ── Copy Pairing Code ─────────────────────────────────────────── */
function copyPairingCode(code) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(() => {
      showToast('Kod pairing berjaya disalin!');
    }).catch(() => {
      fallbackCopy(code);
    });
  } else {
    fallbackCopy(code);
  }
}

function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast('Kod pairing berjaya disalin!');
}

/* ── Sidebar Loader ────────────────────────────────────────────── */
async function loadSidebar() {
  const el = document.getElementById('sidebar');
  if (!el) return;
  if (el.dataset.loaded) return;
  el.dataset.loaded = '1';

  let user = { username: '...', role: 'user' };
  try {
    const res = await api('/auth/me');
    user = res.data || res;
  } catch (err) {
    // Not logged in — don't redirect (api() handles that)
    console.warn('Failed to load user info:', err.message);
  }

  const currentPath = window.location.pathname;

  const navLinks = [
    { href: '/dashboard.html', icon: '📊', label: 'Dashboard' },
    { href: '/device.html',    icon: '📱', label: 'Peranti' },
    { href: '/chat.html',      icon: '💬', label: 'Chat' },
    { href: '/blast.html',     icon: '🚀', label: 'Blast' },
    { href: '/warmer.html',    icon: '🔥', label: 'Warmer' },
    { href: '/checker.html',   icon: '✅', label: 'Checker' },
    { href: '/autoreply.html', icon: '🤖', label: 'Auto-Reply' },
    { href: '/status.html',    icon: '📈', label: 'Status' }
  ];

  if (user.role === 'admin') {
    navLinks.push({ href: '/admin.html', icon: '⚙️', label: 'Admin' });
  }

  const navHtml = navLinks.map(link => {
    const isActive = currentPath === link.href ||
      (link.href === '/dashboard.html' && (currentPath === '/dashboard.html' || currentPath === '/dashboard'));
    return `<a href="${link.href}" class="${isActive ? 'active' : ''}">
      <span class="nav-icon">${link.icon}</span>
      <span>${link.label}</span>
    </a>`;
  }).join('');

  const initial = (user.username || '?')[0].toUpperCase();

  el.innerHTML = `
    <div class="sidebar-brand">
      <span class="brand-icon">💬</span>
      <span class="brand-text">MultiChat</span>
    </div>
    <nav class="sidebar-nav">
      ${navHtml}
    </nav>
    <div class="sidebar-footer">
      <div class="user-info">
        <span class="user-avatar">${escapeHtml(initial)}</span>
        <span>${escapeHtml(user.username)}${user.role === 'admin' ? ' <span class="tag green" style="margin-left:4px">admin</span>' : ''}</span>
      </div>
      <button class="btn-logout" id="btn-logout">
        🚪 Log Keluar
      </button>
    </div>
  `;

  // Logout handler
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await api('/auth/logout', { method: 'POST' });
      } catch (err) {
        // Ignore errors
      }
      window.location.href = '/';
    });
  }

  // Mobile sidebar toggle handler
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay) {
    overlay.addEventListener('click', () => {
      el.classList.remove('open');
      overlay.classList.remove('active');
    });
  }
}

/* ── Toggle mobile sidebar ─────────────────────────────────────── */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.querySelector('.sidebar-overlay');
  if (sidebar) {
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
  }
}

/* ── Debounce Utility ──────────────────────────────────────────── */
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/* ── Format Phone for Display ──────────────────────────────────── */
function formatPhone(phone) {
  if (!phone) return '-';
  // Remove non-digits
  const digits = String(phone).replace(/\D/g, '');
  // Format: +60 12-345 6789 (Malaysian) or generic
  if (digits.startsWith('60') && digits.length >= 10) {
    const cc = digits.slice(0, 2);
    const rest = digits.slice(2);
    if (rest.length >= 9) {
      return `+${cc} ${rest.slice(0, 2)}-${rest.slice(2, 5)} ${rest.slice(5)}`;
    }
    return `+${cc} ${rest}`;
  }
  // Generic international format
  if (digits.length > 5) {
    return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  return phone;
}

/* ── Format Date/Time ──────────────────────────────────────────── */
function formatDate(timestamp) {
  if (!timestamp) return '-';
  try {
    const date = typeof timestamp === 'number'
      ? new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp)  // Handle seconds vs milliseconds
      : new Date(timestamp);

    if (isNaN(date.getTime())) return '-';

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('ms-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    const timeFormatter = new Intl.DateTimeFormat('ms-MY', {
      timeZone: 'Asia/Kuala_Lumpur',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Check if same day
    const dateStr = formatter.format(date);
    const todayStr = formatter.format(now);
    const timeStr = timeFormatter.format(date);

    if (dateStr === todayStr) {
      return timeStr;
    }

    // Check if yesterday
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatter.format(yesterday);
    if (dateStr === yesterdayStr) {
      return `Semalam ${timeStr}`;
    }

    return `${dateStr}, ${timeStr}`;
  } catch (err) {
    return '-';
  }
}

/* ── DOMContentLoaded: Init sidebar + SSE on all pages except login ── */
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  // Skip sidebar and SSE on login page
  if (path === '/' || path === '/index.html') {
    return;
  }
  loadSidebar();
  initSSE();
});
