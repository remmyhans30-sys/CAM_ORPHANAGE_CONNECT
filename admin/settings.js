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

function mirrorToLocalStorage(settings) {
  localStorage.setItem('orgSettings', JSON.stringify({
    name: settings.orgName,
    email: settings.orgEmail,
    phone: settings.orgPhone,
    address: settings.orgAddress,
    description: settings.orgDescription,
    currency: settings.currency,
  }));
  localStorage.setItem('notifSettings', JSON.stringify({
    email: settings.notifEmail,
    donations: settings.notifDonations,
    messages: settings.notifMessages,
  }));
}

function populateForm(settings) {
  document.getElementById('org-name').value = settings.orgName || 'CAM Orphanage Connect';
  document.getElementById('org-email').value = settings.orgEmail || '';
  document.getElementById('org-phone').value = settings.orgPhone || '';
  document.getElementById('org-address').value = settings.orgAddress || '';
  document.getElementById('org-description').value = settings.orgDescription || '';
  document.getElementById('org-currency').value = settings.currency || 'FCFA';

  document.getElementById('notif-email').checked = settings.notifEmail !== false;
  document.getElementById('notif-donations').checked = settings.notifDonations !== false;
  document.getElementById('notif-messages').checked = settings.notifMessages !== false;
}

function init() {
  apiRequest('/settings')
    .then(function (data) {
      populateForm(data.settings);
      mirrorToLocalStorage(data.settings);
    })
    .catch(function (err) {
      alert('Could not load settings from the server: ' + err.message);
    });
}

document.getElementById('org-settings-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const data = {
    orgName: document.getElementById('org-name').value.trim(),
    orgEmail: document.getElementById('org-email').value.trim(),
    orgPhone: document.getElementById('org-phone').value.trim(),
    orgAddress: document.getElementById('org-address').value.trim(),
    orgDescription: document.getElementById('org-description').value.trim(),
  };

  apiRequest('/settings', { method: 'PUT', body: data })
    .then(function (result) {
      mirrorToLocalStorage(result.settings);
      flashStatus('org-save-status');
    })
    .catch(function (err) {
      alert('Could not save: ' + err.message);
    });
});

document.getElementById('notif-settings-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const data = {
    notifEmail: document.getElementById('notif-email').checked,
    notifDonations: document.getElementById('notif-donations').checked,
    notifMessages: document.getElementById('notif-messages').checked,
  };

  apiRequest('/settings', { method: 'PUT', body: data })
    .then(function (result) {
      mirrorToLocalStorage(result.settings);
      flashStatus('notif-save-status');
    })
    .catch(function (err) {
      alert('Could not save: ' + err.message);
    });
});

document.getElementById('save-currency-btn').addEventListener('click', function () {
  const data = { currency: document.getElementById('org-currency').value };

  apiRequest('/settings', { method: 'PUT', body: data })
    .then(function (result) {
      mirrorToLocalStorage(result.settings);
      flashStatus('currency-save-status');
    })
    .catch(function (err) {
      alert('Could not save: ' + err.message);
    });
});

document.getElementById('export-backup-btn').addEventListener('click', function () {
  const statusEl = document.getElementById('backup-status');
  statusEl.textContent = 'Preparing export...';

  Promise.all([
    apiRequest('/orphanages'),
    apiRequest('/donors'),
    apiRequest('/partners'),
    apiRequest('/programs'),
    apiRequest('/needs'),
    apiRequest('/messages'),
    apiRequest('/reports'),
    apiRequest('/settings'),
  ])
    .then(function (results) {
      const backup = {
        orphanages: results[0].orphanages,
        donors: results[1].donors,
        partners: results[2].partners,
        programs: results[3].programs,
        needs: results[4].needs,
        messages: results[5].messages,
        reports: results[6].reports,
        settings: results[7].settings,
        exportedAt: new Date().toISOString(),
      };

      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'cam-orphanage-connect-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      statusEl.textContent = 'Backup downloaded.';
      setTimeout(function () { statusEl.textContent = ''; }, 3000);
    })
    .catch(function (err) {
      statusEl.textContent = 'Export failed: ' + err.message;
    });
});

init();
