if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

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

init();
