const API_BASE = 'http://localhost:4000/api';

function apiRequest(path, options) {
  options = options || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const token = localStorage.getItem('partnerToken');
  if (token) headers.Authorization = 'Bearer ' + token;

  return fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(function (response) {
    if (response.status === 401 && path !== '/partner-auth/login') {
      localStorage.removeItem('partnerToken');
      localStorage.removeItem('partnerEmail');
      alert('Your session has expired. Please log in again.');
      window.location.href = 'index.html';
      return new Promise(function () {});
    }

    if (response.status === 204) return null;

    return response.json().catch(function () { return null; }).then(function (data) {
      if (!response.ok) {
        const message = (data && data.error) || ('Request failed with status ' + response.status);
        throw new Error(message);
      }
      return data;
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.logout-link').forEach(function (link) {
    link.addEventListener('click', function () {
      localStorage.removeItem('partnerToken');
      localStorage.removeItem('partnerEmail');
    });
  });

  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  if (sidebarToggleBtn) {
    sidebarToggleBtn.addEventListener('click', function () {
      document.getElementById('dashboard-sidebar').classList.toggle('show');
    });
  }

  const messagesLink = document.getElementById('messages-nav-link');
  if (!messagesLink || !localStorage.getItem('partnerToken')) return;

  apiRequest('/partner-auth/messages/unread').then(function (data) {
    if (data && data.hasUnread) {
      const dot = document.createElement('span');
      dot.className = 'nav-unread-dot';
      messagesLink.appendChild(dot);
    }
  }).catch(function () {});
});
