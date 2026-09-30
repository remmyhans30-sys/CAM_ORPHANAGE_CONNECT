if (!localStorage.getItem('partnerToken')) { window.location.href = 'index.html'; }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function formatFcfa(amount) {
  const currency = JSON.parse(localStorage.getItem('orgSettings') || '{}').currency || 'FCFA';
  const num = Number(amount || 0).toLocaleString('en-US');
  if (currency === 'USD') return '$' + num;
  if (currency === 'EUR') return '€' + num;
  return num + ' FCFA';
}

function statusLabel(status) {
  if (status === 'needs-info') return 'Needs info';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

let partnerCache = null;
let orphanagesCache = [];

function loadPartner() {
  return partnerCache;
}

function fetchPartnerFromApi() {
  return apiRequest('/partner-auth/me').then(function (data) {
    partnerCache = data.partner;
  });
}

function fetchOrphanagesFromApi() {
  return apiRequest('/partner-auth/orphanages').then(function (data) {
    orphanagesCache = data.orphanages;
  });
}

function savePartner(updates) {
  return apiRequest('/partner-auth/me', { method: 'PUT', body: updates }).then(function (data) {
    partnerCache = data.partner;
  });
}

function renderHeader(partner) {
  const avatar = document.getElementById('partner-avatar');
  if (partner.logoUrl) {
    avatar.classList.add('has-photo');
    avatar.innerHTML = '<img src="' + encodeURI(partner.logoUrl) + '" alt="">';
  } else {
    avatar.textContent = initials(partner.name);
  }

  document.getElementById('partner-name').textContent = partner.name || '—';
  document.getElementById('partner-country').textContent = [partner.country, partner.email].filter(Boolean).join(' · ') || '—';

  const statusBadge = document.getElementById('partner-status-badge');
  statusBadge.className = 'status-badge status-' + partner.verificationStatus;
  statusBadge.textContent = statusLabel(partner.verificationStatus);

  document.getElementById('partner-tier-badge').textContent = partner.tier || '';
}

function renderStatusNote(partner) {
  const box = document.getElementById('status-note-box');
  let html = '';

  if (partner.verificationStatus === 'pending') {
    html = '<div class="alert alert-warning py-2 mb-0">Your account is awaiting verification by the CAM Orphanage Connect team.</div>';
  } else if (partner.verificationStatus === 'needs-info' && partner.infoRequestMessage) {
    html = '<div class="alert alert-warning py-2 mb-0">Info requested: ' + escapeHtml(partner.infoRequestMessage) + '</div>';
  } else if (partner.verificationStatus === 'rejected' && partner.rejectionReason) {
    html = '<div class="alert alert-danger py-2 mb-0">Application rejected: ' + escapeHtml(partner.rejectionReason) + '</div>';
  }

  box.innerHTML = html;
}

function renderStats(partner) {
  const strip = document.getElementById('partner-stats');
  const stats = [
    { icon: 'bi-cash-coin', color: 'coral', label: 'Total contributed (lifetime)', value: formatFcfa(partner.totalContributed) },
    { icon: 'bi-receipt', color: 'teal', label: 'Donations made', value: (partner.donations || []).length },
    { icon: 'bi-house-heart', color: 'purple', label: 'Orphanages sponsored', value: (partner.orphanagesSponsored || []).length },
    { icon: 'bi-award', color: 'gold', label: 'Access tier', value: partner.tier },
  ];

  if (partner.tier === 'Verified Referrer') {
    stats.push({ icon: 'bi-file-earmark-person', color: 'teal', label: 'Placement referrals submitted', value: partner.placementReferralsCount || 0 });
  }

  strip.innerHTML = stats.map(function (stat) {
    return (
      '<div class="col-6 col-lg-3">' +
        '<div class="dashboard-stat-card">' +
          '<div class="dashboard-stat-icon ' + stat.color + '"><i class="bi ' + stat.icon + '"></i></div>' +
          '<div>' +
            '<div class="dashboard-stat-value">' + escapeHtml(String(stat.value)) + '</div>' +
            '<div class="dashboard-stat-label">' + escapeHtml(stat.label) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function donationTypeLabel(d) {
  return d.type === 'item' ? 'Item' : 'Money';
}

function donationDetailsText(d) {
  if (d.type === 'item') {
    const parts = [escapeHtml(d.itemDescription || 'Item donation')];
    if (d.quantity) parts.push('(' + escapeHtml(d.quantity) + ')');
    if (d.amount) parts.push('&mdash; est. ' + formatFcfa(d.amount));
    return parts.join(' ');
  }
  return formatFcfa(d.amount);
}

function renderDonationHistory(partner) {
  const tbody = document.getElementById('donation-history-tbody');
  const donations = partner.donations || [];

  if (donations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted small">No donations recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = donations.slice().reverse().map(function (d) {
    const statusLabel = d.type === 'item' ? 'Delivered' : (d.status || '').charAt(0).toUpperCase() + (d.status || '').slice(1);
    return (
      '<tr>' +
        '<td>' + escapeHtml(d.date) + '</td>' +
        '<td>' + escapeHtml(d.orphanage) + '</td>' +
        '<td>' + escapeHtml(d.need || '&mdash;') + '</td>' +
        '<td><span class="tier-tag">' + donationTypeLabel(d) + '</span></td>' +
        '<td>' + donationDetailsText(d) + '</td>' +
        '<td>' + escapeHtml(d.method || d.deliveryMethod || '&mdash;') + '</td>' +
        '<td><span class="tier-tag">' + escapeHtml(statusLabel) + '</span></td>' +
      '</tr>'
    );
  }).join('');
}

function renderFavorites(partner) {
  const panel = document.getElementById('favorites-panel');
  const favoriteIds = partner.favoriteOrphanageIds || [];
  const favorites = orphanagesCache.filter(function (o) { return favoriteIds.indexOf(o.id) !== -1; });

  if (favorites.length === 0) {
    panel.innerHTML = '<p class="text-muted small mb-0">No favorites yet. Star an orphanage while browsing to add it here.</p>';
    return;
  }

  panel.innerHTML = '<div class="d-flex flex-wrap gap-2">' + favorites.map(function (o) {
    return '<a href="orphanage-view.html?id=' + encodeURIComponent(o.id) + '" class="tier-tag text-decoration-none">&#9733; ' + escapeHtml(o.name) + '</a>';
  }).join('') + '</div>';
}

function renderOrphanagesSponsored(partner) {
  const tbody = document.getElementById('orphanages-sponsored-tbody');
  const homes = partner.orphanagesSponsored || [];

  if (homes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted small">No orphanages sponsored yet.</td></tr>';
    return;
  }

  tbody.innerHTML = homes.map(function (h) {
    return (
      '<tr>' +
        '<td>' + escapeHtml(h.name) + '</td>' +
        '<td>' + escapeHtml(h.sponsorSince) + '</td>' +
        '<td>' + formatFcfa(h.amount) + '</td>' +
      '</tr>'
    );
  }).join('');
}

function renderMatchingPledge(partner) {
  const panel = document.getElementById('matching-pledge-panel');
  const pledge = partner.pledge;

  if (!pledge) {
    panel.innerHTML = '<p class="text-muted small mb-0">No matching pledge on record.</p>';
    return;
  }

  const percent = pledge.limit > 0 ? Math.min(100, Math.round((pledge.used / pledge.limit) * 100)) : 0;

  panel.innerHTML =
    '<p class="small mb-2">' + escapeHtml(pledge.description) + '</p>' +
    '<div class="progress finance-progress mb-2"><div class="progress-bar" style="width: ' + percent + '%"></div></div>' +
    '<p class="small text-muted mb-0">' + formatFcfa(pledge.used) + ' of ' + formatFcfa(pledge.limit) + ' used (' + percent + '%)</p>';
}

function renderPlacementReferrals(partner) {
  const card = document.getElementById('placement-referrals-card');
  if (partner.tier !== 'Verified Referrer') {
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  const panel = document.getElementById('placement-referrals-panel');
  const cases = partner.placementCases || [];

  if (cases.length === 0) {
    panel.innerHTML = '<p class="text-muted small mb-0">No placement cases submitted yet.</p>';
    return;
  }

  panel.innerHTML = cases.map(function (c) {
    const isReviewed = c.status === 'reviewed';
    return (
      '<div class="profile-post mb-3">' +
        '<div class="d-flex justify-content-between align-items-start mb-1">' +
          '<span class="text-muted small">Submitted ' + escapeHtml(c.submittedDate || '') + '</span>' +
          '<span class="status-badge status-' + (isReviewed ? 'verified' : 'pending') + '">' + (isReviewed ? 'Reviewed' : 'Pending review') + '</span>' +
        '</div>' +
        '<dl class="row mb-0 small">' +
          '<dt class="col-4">Referring social worker</dt><dd class="col-8">' + escapeHtml(c.socialWorkerName || '&mdash;') + ' (' + escapeHtml(c.socialWorkerPhone || '&mdash;') + ')</dd>' +
          '<dt class="col-4">Reason for referral</dt><dd class="col-8">' + escapeHtml(c.reasonForReferral || '&mdash;') + '</dd>' +
          '<dt class="col-4">Placement type</dt><dd class="col-8">' + escapeHtml(c.placementType || '&mdash;') + '</dd>' +
        '</dl>' +
      '</div>'
    );
  }).join('');
}

function renderDocuments(partner) {
  const panel = document.getElementById('documents-panel');
  const docs = partner.documents || [];

  if (docs.length === 0) {
    panel.innerHTML = '<p class="text-muted small mb-0">No documents on file yet.</p>';
    return;
  }

  panel.innerHTML = '<ul class="mb-0 small">' + docs.map(function (d) { return '<li>' + escapeHtml(d) + '</li>'; }).join('') + '</ul>';
}

function renderEditForm(partner) {
  document.getElementById('edit-contact-name').value = partner.contactName || '';
  document.getElementById('edit-country').value = partner.country || '';
}

function renderAll(partner) {
  renderHeader(partner);
  renderStatusNote(partner);
  renderStats(partner);
  renderDonationHistory(partner);
  renderFavorites(partner);
  renderOrphanagesSponsored(partner);
  renderMatchingPledge(partner);
  renderPlacementReferrals(partner);
  renderDocuments(partner);
  renderEditForm(partner);
}

Promise.all([fetchPartnerFromApi(), fetchOrphanagesFromApi()]).then(function () {
  const partner = loadPartner();
  if (!partner) {
    document.getElementById('empty-state').classList.remove('d-none');
    document.getElementById('empty-state').textContent = 'Could not load your account.';
    return;
  }
  document.getElementById('dashboard-content').classList.remove('d-none');
  renderAll(partner);

  const params = new URLSearchParams(window.location.search);
  if (params.get('openDonation') === '1') {
    openAddDonationModal({ orphanageId: params.get('orphanageId'), need: params.get('need') });
    window.history.replaceState({}, '', 'dashboard.html');
  }
}).catch(function (err) {
  document.getElementById('empty-state').classList.remove('d-none');
  document.getElementById('empty-state').textContent = 'Could not load your account: ' + err.message + '. Is the backend running?';
});

document.getElementById('save-edit-btn').addEventListener('click', function () {
  const contactName = document.getElementById('edit-contact-name').value.trim();
  const country = document.getElementById('edit-country').value.trim();
  const statusEl = document.getElementById('edit-save-status');

  if (!contactName) {
    alert('Contact person is required.');
    return;
  }

  savePartner({ contactName: contactName, country: country })
    .then(function () {
      renderAll(loadPartner());
      statusEl.textContent = 'Saved.';
      setTimeout(function () { statusEl.textContent = ''; }, 2000);
    })
    .catch(function (err) {
      alert('Could not save changes: ' + err.message);
    });
});

document.getElementById('change-password-btn').addEventListener('click', function () {
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmNewPassword = document.getElementById('confirm-new-password').value;
  const statusEl = document.getElementById('password-save-status');

  if (!currentPassword || !newPassword) {
    alert('Please fill in your current and new password.');
    return;
  }
  if (newPassword !== confirmNewPassword) {
    alert('New password and confirmation do not match.');
    return;
  }
  if (newPassword.length < 6) {
    alert('New password must be at least 6 characters.');
    return;
  }

  apiRequest('/partner-auth/change-password', { method: 'POST', body: { currentPassword: currentPassword, newPassword: newPassword } })
    .then(function () {
      document.getElementById('current-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-new-password').value = '';
      statusEl.textContent = 'Password changed.';
      setTimeout(function () { statusEl.textContent = ''; }, 2000);
    })
    .catch(function (err) {
      alert('Could not change password: ' + err.message);
    });
});


function csvField(value) {
  const str = String(value === undefined || value === null ? '' : value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadCsv(filename, rows) {
  const csv = rows.map(function (row) { return row.map(csvField).join(','); }).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

document.getElementById('export-donations-btn').addEventListener('click', function () {
  const partner = loadPartner();
  if (!partner) return;

  const rows = [['Date', 'Orphanage', 'Need', 'Type', 'Details', 'Method', 'Status']];
  (partner.donations || []).forEach(function (d) {
    const details = d.type === 'item'
      ? [d.itemDescription || '', d.quantity ? '(' + d.quantity + ')' : ''].join(' ').trim()
      : String(d.amount || 0);
    rows.push([d.date || '', d.orphanage || '', d.need || '', donationTypeLabel(d), details, d.method || d.deliveryMethod || '', d.status || '']);
  });

  downloadCsv('donation-history.csv', rows);
});

const addDonationModal = new bootstrap.Modal(document.getElementById('add-donation-modal'));

function populateDonationOrphanageDropdown() {
  const select = document.getElementById('donation-orphanage');
  select.innerHTML = '<option value="" disabled selected>Select an orphanage&hellip;</option>';
  orphanagesCache.forEach(function (o) {
    const option = document.createElement('option');
    option.value = o.id;
    option.textContent = o.name;
    select.appendChild(option);
  });
}

document.getElementById('donation-type').addEventListener('change', function (e) {
  const isItem = e.target.value === 'item';
  document.getElementById('donation-money-fields').classList.toggle('d-none', isItem);
  document.getElementById('donation-item-fields').classList.toggle('d-none', !isItem);
});

function openAddDonationModal(prefill) {
  prefill = prefill || {};
  document.getElementById('add-donation-form').reset();
  document.getElementById('donation-type').value = 'money';
  document.getElementById('donation-money-fields').classList.remove('d-none');
  document.getElementById('donation-item-fields').classList.add('d-none');
  document.getElementById('donation-date').value = new Date().toISOString().slice(0, 10);
  populateDonationOrphanageDropdown();
  if (prefill.orphanageId) document.getElementById('donation-orphanage').value = String(prefill.orphanageId);
  if (prefill.need) document.getElementById('donation-need').value = prefill.need;
  addDonationModal.show();
}

document.getElementById('add-donation-btn').addEventListener('click', function () {
  openAddDonationModal();
});

document.getElementById('add-donation-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const type = document.getElementById('donation-type').value;
  const orphanageId = document.getElementById('donation-orphanage').value;
  const need = document.getElementById('donation-need').value.trim();
  const date = document.getElementById('donation-date').value || new Date().toISOString().slice(0, 10);

  if (!orphanageId) {
    alert('Please select an orphanage.');
    return;
  }

  const body = { type: type, orphanageId: Number(orphanageId), need: need, date: date };

  if (type === 'item') {
    const itemDescription = document.getElementById('donation-item-description').value.trim();
    if (!itemDescription) {
      alert('Please describe what was donated.');
      return;
    }
    body.itemDescription = itemDescription;
    body.quantity = document.getElementById('donation-quantity').value.trim();
    body.amount = Number(document.getElementById('donation-item-value').value) || 0;
    body.deliveryMethod = document.getElementById('donation-delivery-method').value.trim();
  } else {
    body.amount = Number(document.getElementById('donation-amount').value) || 0;
    body.method = document.getElementById('donation-method').value.trim();
  }

  apiRequest('/partner-auth/donations', { method: 'POST', body: body })
    .then(function (data) {
      partnerCache = data.partner;
      addDonationModal.hide();
      renderAll(partnerCache);
    })
    .catch(function (err) {
      alert('Could not save donation: ' + err.message);
    });
});

const addPlacementCaseModal = new bootstrap.Modal(document.getElementById('add-placement-case-modal'));

document.getElementById('add-placement-case-btn').addEventListener('click', function () {
  document.getElementById('add-placement-case-form').reset();
  addPlacementCaseModal.show();
});

document.getElementById('add-placement-case-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const socialWorkerName = document.getElementById('case-social-worker-name').value.trim();
  const reasonForReferral = document.getElementById('case-reason').value.trim();

  if (!socialWorkerName || !reasonForReferral) {
    alert('Please provide the social worker name and reason for referral.');
    return;
  }

  const body = {
    socialWorkerName: socialWorkerName,
    socialWorkerPhone: document.getElementById('case-social-worker-phone').value.trim(),
    reasonForReferral: reasonForReferral,
    placementType: document.getElementById('case-placement-type').value.trim(),
    educationalStatus: document.getElementById('case-educational-status').value.trim(),
    livingEnvironmentNotes: document.getElementById('case-living-environment').value.trim(),
    anticipatedDischargeDate: document.getElementById('case-discharge-date').value,
  };

  apiRequest('/partner-auth/placement-cases', { method: 'POST', body: body })
    .then(function (data) {
      partnerCache = data.partner;
      addPlacementCaseModal.hide();
      renderAll(partnerCache);
    })
    .catch(function (err) {
      alert('Could not submit case: ' + err.message);
    });
});
