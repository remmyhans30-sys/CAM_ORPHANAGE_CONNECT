if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }
(function () {
  const role = localStorage.getItem('currentAdminRole') || 'Super Admin';
  if (role !== 'Super Admin' && role !== 'Administrator') {
    alert('Your role (' + role + ') does not have access to Settings.');
    window.location.href = 'dashboard.html';
  }
})();

function flashStatus(elId) {
  const el = document.getElementById(elId);
  el.textContent = 'Saved.';
  setTimeout(function () { el.textContent = ''; }, 2000);
}

function loadOrgSettings() {
  return JSON.parse(localStorage.getItem('orgSettings') || '{}');
}

function loadNotifSettings() {
  return JSON.parse(localStorage.getItem('notifSettings') || '{}');
}

function init() {
  const org = loadOrgSettings();
  document.getElementById('org-name').value = org.name || 'CAM Orphanage Connect';
  document.getElementById('org-email').value = org.email || '';
  document.getElementById('org-phone').value = org.phone || '';
  document.getElementById('org-address').value = org.address || '';
  document.getElementById('org-description').value = org.description || '';
  document.getElementById('org-currency').value = org.currency || 'FCFA';

  const notif = loadNotifSettings();
  document.getElementById('notif-email').checked = notif.email !== false;
  document.getElementById('notif-donations').checked = notif.donations !== false;
  document.getElementById('notif-messages').checked = notif.messages !== false;
}

document.getElementById('org-settings-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const org = loadOrgSettings();
  org.name = document.getElementById('org-name').value.trim();
  org.email = document.getElementById('org-email').value.trim();
  org.phone = document.getElementById('org-phone').value.trim();
  org.address = document.getElementById('org-address').value.trim();
  org.description = document.getElementById('org-description').value.trim();
  localStorage.setItem('orgSettings', JSON.stringify(org));
  flashStatus('org-save-status');
});

document.getElementById('notif-settings-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const notif = {
    email: document.getElementById('notif-email').checked,
    donations: document.getElementById('notif-donations').checked,
    messages: document.getElementById('notif-messages').checked,
  };
  localStorage.setItem('notifSettings', JSON.stringify(notif));
  flashStatus('notif-save-status');
});

document.getElementById('save-currency-btn').addEventListener('click', function () {
  const org = loadOrgSettings();
  org.currency = document.getElementById('org-currency').value;
  localStorage.setItem('orgSettings', JSON.stringify(org));
  flashStatus('currency-save-status');
});

const BACKUP_KEYS = ['orphanages', 'needs', 'donors', 'partners', 'messages', 'reports', 'programs', 'users', 'orgSettings', 'notifSettings', 'deletionLog'];

document.getElementById('export-backup-btn').addEventListener('click', function () {
  const backup = {};
  BACKUP_KEYS.forEach(function (key) {
    const raw = localStorage.getItem(key);
    if (raw !== null) backup[key] = JSON.parse(raw);
  });

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'cam-orphanage-connect-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  const statusEl = document.getElementById('backup-status');
  statusEl.textContent = 'Backup downloaded.';
  setTimeout(function () { statusEl.textContent = ''; }, 3000);
});

document.getElementById('import-backup-btn').addEventListener('click', function () {
  document.getElementById('import-backup-input').click();
});

document.getElementById('import-backup-input').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function () {
    let backup;
    try {
      backup = JSON.parse(reader.result);
    } catch (err) {
      alert('That file is not a valid backup (could not parse JSON).');
      return;
    }

    if (!confirm('Import this backup? This will overwrite all current data in this browser. This cannot be undone.')) return;

    const previous = {};
    BACKUP_KEYS.forEach(function (key) {
      previous[key] = localStorage.getItem(key);
    });

    try {
      BACKUP_KEYS.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(backup, key)) {
          localStorage.setItem(key, JSON.stringify(backup[key]));
        }
      });
    } catch (err) {
      BACKUP_KEYS.forEach(function (key) {
        if (previous[key] === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, previous[key]);
        }
      });
      alert('Import failed: the backup is too large for browser storage. No changes were made.');
      return;
    }

    alert('Backup imported. The page will now reload.');
    window.location.reload();
  };
  reader.readAsText(file);

  e.target.value = '';
});

init();
