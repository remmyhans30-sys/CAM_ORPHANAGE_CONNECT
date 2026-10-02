// Local copies talk to the server on this computer; the live site uses its own address.
const API_BASE = (window.location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'http://localhost:4000' : '') + '/api';

function apiRequest(path, options) {
  options = options || {};
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  const token = localStorage.getItem('adminToken');
  if (token) headers.Authorization = 'Bearer ' + token;

  return fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).catch(function () {
    // The browser only says "Failed to fetch" when the server can't be reached at all.
    throw new Error("Can't reach the server. If you're running the site on your own computer, start it with start.bat and keep its window open.");
  }).then(function (response) {
    if (response.status === 401 && path !== '/auth/login') {
      localStorage.removeItem('currentAdminEmail');
      localStorage.removeItem('currentAdminRole');
      localStorage.removeItem('currentAdminDisplayName');
      localStorage.removeItem('adminToken');
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


// Uploaded documents are private, so they are fetched with the admin's login and
// opened from memory instead of through a plain link.
function documentLabelHtml(doc) {
  function esc(value) {
    const div = document.createElement('div');
    div.textContent = value === null || value === undefined ? '' : String(value);
    return div.innerHTML;
  }
  if (typeof doc === 'string') return esc(doc);

  const size = doc.size ? ' <span class="text-muted">(' + Math.max(1, Math.round(doc.size / 1024)) + ' KB)</span>' : '';
  return '<a href="#" data-open-document="' + esc(doc.id) + '" data-document-name="' + esc(doc.name) + '">' + esc(doc.name) + '</a>' + size;
}

document.addEventListener('click', function (e) {
  const link = e.target.closest('[data-open-document]');
  if (!link) return;
  e.preventDefault();

  const token = localStorage.getItem('adminToken');
  const opened = window.open('', '_blank');
  fetch(API_BASE + '/files/document/' + encodeURIComponent(link.dataset.openDocument), {
    headers: token ? { Authorization: 'Bearer ' + token } : {},
  })
    .then(function (response) {
      if (!response.ok) throw new Error('File not found');
      return response.blob();
    })
    .then(function (blob) {
      const url = URL.createObjectURL(blob);
      if (opened) {
        opened.location.href = url;
      } else {
        window.location.href = url;
      }
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    })
    .catch(function () {
      if (opened) opened.close();
      alert('Could not open "' + (link.dataset.documentName || 'this document') + '". It may have been removed.');
    });
});
