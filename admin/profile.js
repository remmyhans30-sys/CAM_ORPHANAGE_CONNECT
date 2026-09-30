if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

function initials(str) {
  const words = (str || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const email = localStorage.getItem('currentAdminEmail') || '';

apiRequest('/auth/me').then(function (data) {
  document.getElementById('profile-email').textContent = data.admin.email;
  document.getElementById('profile-role').textContent = data.admin.role;

  const displayName = localStorage.getItem('currentAdminDisplayName') || data.admin.name || '';
  document.getElementById('profile-name').value = displayName;
  document.getElementById('profile-avatar').textContent = initials(displayName || email);
}).catch(function () {
  document.getElementById('profile-email').textContent = email;
  document.getElementById('profile-role').textContent = localStorage.getItem('currentAdminRole') || 'Super Admin';
  const displayName = localStorage.getItem('currentAdminDisplayName') || '';
  document.getElementById('profile-name').value = displayName;
  document.getElementById('profile-avatar').textContent = initials(displayName || email);
});

document.getElementById('profile-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const name = document.getElementById('profile-name').value.trim();
  localStorage.setItem('currentAdminDisplayName', name);
  document.getElementById('profile-avatar').textContent = initials(name || email);

  const statusEl = document.getElementById('profile-save-status');
  statusEl.textContent = 'Saved.';
  setTimeout(function () { statusEl.textContent = ''; }, 2000);
});
