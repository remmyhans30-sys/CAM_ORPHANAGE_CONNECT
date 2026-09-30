if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

function getDonorId() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  return id !== null ? Number(id) : null;
}

let donorsCache = [];

function fetchDonorsFromApi() {
  return apiRequest('/donors').then(function (data) {
    donorsCache = data.donors;
  });
}

let orphanagesCache = [];

function fetchOrphanagesFromApi() {
  return apiRequest('/orphanages').then(function (data) {
    orphanagesCache = data.orphanages;
  });
}

function loadDonor() {
  const id = getDonorId();
  if (id === null) return donorsCache[0] || null;
  return donorsCache.find(function (d) { return d.id === id; }) || null;
}

function saveDonor(donor) {
  return apiRequest('/donors/' + donor.id, { method: 'PUT', body: donor })
    .catch(function (err) {
      alert('Could not save changes to the server: ' + err.message);
    });
}

function openOrCreateMessageThread(accountType, accountId, senderName) {
  apiRequest('/messages/thread', { method: 'POST', body: { accountType: accountType, accountId: accountId, senderName: senderName } })
    .then(function (data) {
      window.location.href = 'messages.html?id=' + data.message.id;
    })
    .catch(function (err) {
      alert('Could not open message thread: ' + err.message);
    });
}

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

function monthsSince(dateStr) {
  const then = new Date(dateStr);
  const now = new Date();
  let months = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  if (now.getDate() < then.getDate()) months--;
  return Math.max(0, months);
}

function computeDuplicateRisk(donor) {
  const email = (donor.email || '').trim().toLowerCase();
  if (!email) return null;

  const sharers = donorsCache.filter(function (d) {
    return d.id !== donor.id && (d.email || '').trim().toLowerCase() === email;
  });

  if (sharers.length === 0) return null;
  return 'Email also used by ' + sharers.map(function (d) { return d.name; }).join(', ');
}

function renderDuplicateRisk(donor) {
  const box = document.getElementById('duplicate-risk-box');
  const risk = computeDuplicateRisk(donor);

  box.innerHTML = risk
    ? '<div class="profile-info-note profile-info-note-danger">&#9888; ' + escapeHtml(risk) + '</div>'
    : '';
}

function currentAdmin() {
  return localStorage.getItem('currentAdminEmail') || 'Unknown admin';
}

function logActivity(donor, action) {
  donor.activityLog = donor.activityLog || [];
  donor.activityLog.push({
    reviewer: currentAdmin(),
    action: action,
    timestamp: new Date().toISOString(),
  });
}

function formatFcfa(amount) {
  const currency = JSON.parse(localStorage.getItem('orgSettings') || '{}').currency || 'FCFA';
  const num = Number(amount || 0).toLocaleString('en-US');
  if (currency === 'USD') return '$' + num;
  if (currency === 'EUR') return '€' + num;
  return num + ' FCFA';
}

function anniversaryText(joinDate) {
  const months = monthsSince(joinDate);
  if (months < 24) return months + ' month' + (months === 1 ? '' : 's') + ' as a donor';
  const years = Math.floor(months / 12);
  return years + ' year' + (years === 1 ? '' : 's') + ' as a donor';
}

function anniversaryMarker(joinDate) {
  return '\u{1F389} ' + anniversaryText(joinDate);
}

function renderHeaderCard(donor) {
  const card = document.getElementById('donor-header-card');

  card.innerHTML =
    '<div class="d-flex flex-wrap justify-content-between align-items-center gap-3">' +
      '<div class="d-flex flex-wrap gap-3 align-items-center">' +
        '<div class="avatar donor-avatar' + (donor.photoUrl ? ' has-photo' : '') + '" style="width:64px;height:64px;font-size:22px; flex-shrink:0;">' +
          (donor.photoUrl ? '<img src="' + encodeURI(donor.photoUrl) + '" alt="">' : initials(donor.name)) +
        '</div>' +
        '<div>' +
          '<div class="d-flex align-items-center gap-2 flex-wrap mb-1">' +
            '<h2 class="h5 mb-0">' + escapeHtml(donor.name) + '</h2>' +
            '<span class="donor-status-badge status-' + donor.status + '">' + (donor.status === 'flagged' ? 'Flagged' : 'Active') + '</span>' +
            (donor.vip ? '<span class="vip-tag">&#9733; VIP donor</span>' : '') +
          '</div>' +
          '<p class="text-muted small mb-1">' + escapeHtml(donor.email || '&mdash;') + '</p>' +
          '<div class="d-flex flex-wrap gap-3 small text-muted">' +
            '<span>Joined ' + escapeHtml(donor.joinDate || '&mdash;') + '</span>' +
            '<span>' + escapeHtml(donor.location || '&mdash;') + '</span>' +
            '<span>Preferred: ' + escapeHtml(donor.preferredCurrency || '&mdash;') + ' / ' + escapeHtml(donor.preferredPayment || '&mdash;') + '</span>' +
            '<span>Last active: ' + escapeHtml(donor.lastActive || '&mdash;') + '</span>' +
            '<span>' + escapeHtml(anniversaryMarker(donor.joinDate)) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="d-flex gap-2 align-self-start">' +
        '<button type="button" class="btn btn-admin-primary btn-sm" id="message-donor-btn">Message donor</button>' +
        '<button type="button" class="btn btn-admin-danger btn-sm" id="flag-account-btn">' + (donor.status === 'flagged' ? 'Unflag account' : 'Flag account') + '</button>' +
      '</div>' +
    '</div>';
}

function renderStatsStrip(donor) {
  const strip = document.getElementById('donor-stats-strip');
  const stats = [
    { label: 'Total given (lifetime)', value: formatFcfa(donor.totalGiven) },
    { label: 'Donations made', value: donor.donationsCount || 0 },
    { label: 'Homes followed', value: donor.homesFollowedCount || 0 },
    { label: (donor.activeRecurringGifts === 1 ? 'Recurring gift active' : 'Recurring gifts active'), value: donor.activeRecurringGifts || 0 },
    { label: 'Chargebacks/disputes', value: donor.chargebacksCount || 0 },
  ];

  strip.innerHTML = stats.map(function (stat) {
    return (
      '<div class="col-6 col-md-4 col-lg">' +
        '<div class="stat-tile">' +
          '<strong>' + escapeHtml(String(stat.value)) + '</strong>' +
          '<span>' + escapeHtml(stat.label) + '</span>' +
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

function renderDonationHistory(donor) {
  const tbody = document.getElementById('donation-history-tbody');
  const donations = donor.donations || [];

  if (donations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted small">No donations recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = donations.map(function (d) {
    const statusLabel = d.type === 'item'
      ? (d.status === 'refunded' ? 'Returned' : 'Delivered')
      : (d.status || '').charAt(0).toUpperCase() + (d.status || '').slice(1);

    return (
      '<tr>' +
        '<td>' + escapeHtml(d.date) + '</td>' +
        '<td>' + escapeHtml(d.orphanage) + '</td>' +
        '<td>' + escapeHtml(d.need || '&mdash;') + '</td>' +
        '<td><span class="tier-tag ' + (d.type === 'item' ? 'tier-champion' : 'tier-friend') + '">' + donationTypeLabel(d) + '</span></td>' +
        '<td>' + donationDetailsText(d) + '</td>' +
        '<td>' + escapeHtml(d.method || d.deliveryMethod || '&mdash;') + '</td>' +
        '<td><span class="tier-tag tier-friend">' + escapeHtml(statusLabel) + '</span></td>' +
      '</tr>'
    );
  }).join('');
}

function renderPasswordResets(donor) {
  const tbody = document.getElementById('password-resets-tbody');
  const resets = donor.passwordResets || [];

  if (resets.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-muted small">No password reset requests.</td></tr>';
    return;
  }

  tbody.innerHTML = resets.map(function (r) {
    const isCompleted = r.status === 'completed';
    return (
      '<tr>' +
        '<td>' + escapeHtml(r.date) + '</td>' +
        '<td>' + escapeHtml(r.method) + '</td>' +
        '<td>' + (isCompleted ? '<span class="tier-tag tier-friend">Completed</span>' : '<span class="fail-tag">Link expired, not used</span>') + '</td>' +
      '</tr>'
    );
  }).join('');
}

function renderFailedPayments(donor) {
  const tbody = document.getElementById('failed-payments-tbody');
  const failures = donor.failedPayments || [];

  if (failures.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-muted small">No failed payment attempts.</td></tr>';
    return;
  }

  tbody.innerHTML = failures.map(function (f) {
    return (
      '<tr>' +
        '<td>' + escapeHtml(f.date) + '</td>' +
        '<td>' + formatFcfa(f.amount) + '</td>' +
        '<td>' + escapeHtml(f.method) + '</td>' +
        '<td><span class="fail-tag">' + escapeHtml(f.reason) + '</span></td>' +
      '</tr>'
    );
  }).join('');
}

function renderSupportTickets(donor) {
  const list = document.getElementById('support-tickets-list');
  const tickets = donor.supportTickets || [];

  if (tickets.length === 0) {
    list.innerHTML = '<p class="text-muted small mb-0">No support tickets on record.</p>';
    return;
  }

  list.innerHTML = tickets.map(function (t) {
    const isOpen = t.status === 'open';
    return (
      '<div class="ticket-row">' +
        '<span>&ldquo;' + escapeHtml(t.issue) + '&rdquo;</span>' +
        '<span class="ticket-status ' + (isOpen ? 'open' : 'resolved') + '">' + escapeHtml(isOpen ? 'Open' : 'Resolved') + '</span>' +
      '</div>'
    );
  }).join('');
}

function renderReferrals(donor) {
  const panel = document.getElementById('referrals-panel');
  const referrals = donor.referralsMade || [];
  const activeCount = referrals.filter(function (r) { return r.active; }).length;

  const referredByLine = donor.referredBy
    ? '<p class="small text-muted mb-2">Referred by: <strong class="text-body">' + escapeHtml(donor.referredBy) + '</strong> (existing donor)</p>'
    : '<p class="small text-muted mb-2">Not referred by anyone &mdash; joined directly.</p>';

  const referralsLine = '<p class="small text-muted mb-0">Has referred: <strong class="text-body">' +
    referrals.length + ' people</strong> &mdash; ' + activeCount + ' became an active donor</p>';

  panel.innerHTML = referredByLine + referralsLine;
}

function renderHomesFollowed(donor) {
  const list = document.getElementById('homes-followed-list');
  const homes = donor.homesFollowed || [];

  if (homes.length === 0) {
    list.innerHTML = '<p class="text-muted small mb-0">Not following any orphanages yet.</p>';
    return;
  }

  list.innerHTML = homes.map(function (h) {
    return '<div><span class="tier-tag tier-friend">' + escapeHtml(h.name) + ' &mdash; ' + escapeHtml(h.tier) + '</span></div>';
  }).join('');
}

function renderGroupsJoined(donor) {
  const list = document.getElementById('groups-joined-list');
  const groups = donor.groupsJoined || [];

  if (groups.length === 0) {
    list.innerHTML = '<p class="text-muted small mb-0">Not part of any giving circles or associations.</p>';
    return;
  }

  list.innerHTML = groups.map(function (g) {
    return '<div><span class="tier-tag tier-friend">' + escapeHtml(g) + '</span></div>';
  }).join('');
}

function renderTrustAlertBox(donor) {
  const box = document.getElementById('trust-alert-box');
  const failedCount = (donor.failedPayments || []).length;
  const successCount = donor.donationsCount || 0;
  const totalAttempts = successCount + failedCount;
  const rate = totalAttempts > 0 ? Math.round((failedCount / totalAttempts) * 100) : 0;
  const hasChargebacks = (donor.chargebacksCount || 0) > 0;

  const isFlagged = hasChargebacks || rate >= 20;

  const summary = 'Payment failure rate: ' + rate + '% (' + failedCount + ' of ' + totalAttempts + ' attempts).';
  const message = isFlagged
    ? 'Trust flag: ' + summary + (hasChargebacks ? ' ' + donor.chargebacksCount + ' chargeback(s)/dispute(s) on record.' : '')
    : 'No trust flags on this account. ' + summary;

  box.innerHTML = '<div class="flag-alert">&#9888; ' + escapeHtml(message) + '</div>';
}

function renderAdminNotes(donor) {
  document.getElementById('admin-notes-textarea').value = donor.adminNotes || '';
}

function renderEditForm(donor) {
  document.getElementById('edit-name-input').value = donor.name || '';
  document.getElementById('edit-email-input').value = donor.email || '';
  document.getElementById('edit-location-input').value = donor.location || '';
}

function renderActivityLog(donor) {
  const panel = document.getElementById('activity-log-panel');
  const log = (donor.activityLog || []).slice().reverse();

  if (log.length === 0) {
    panel.innerHTML = '<p class="text-muted small mb-0">No activity recorded yet.</p>';
    return;
  }

  panel.innerHTML = '<ul class="mb-0 small">' + log.map(function (entry) {
    const when = new Date(entry.timestamp);
    const whenText = isNaN(when.getTime()) ? entry.timestamp : when.toLocaleString();
    return '<li>' + escapeHtml(entry.action) + ' by ' + escapeHtml(entry.reviewer) + ' &mdash; ' + escapeHtml(whenText) + '</li>';
  }).join('') + '</ul>';
}

function render() {
  const donor = loadDonor();
  const emptyState = document.getElementById('empty-state');
  const content = document.getElementById('donor-content');

  if (!donor) {
    emptyState.classList.remove('d-none');
    content.classList.add('d-none');
    return;
  }

  emptyState.classList.add('d-none');
  content.classList.remove('d-none');
  renderHeaderCard(donor);
  renderDuplicateRisk(donor);
  renderStatsStrip(donor);
  renderDonationHistory(donor);
  renderPasswordResets(donor);
  renderFailedPayments(donor);
  renderSupportTickets(donor);
  renderReferrals(donor);
  renderHomesFollowed(donor);
  renderGroupsJoined(donor);
  renderTrustAlertBox(donor);
  renderAdminNotes(donor);
  renderActivityLog(donor);
  renderEditForm(donor);
}

document.getElementById('donor-header-card').addEventListener('click', function (e) {
  const donor = loadDonor();
  if (!donor) return;

  if (e.target.id === 'message-donor-btn') {
    openOrCreateMessageThread('donor', donor.id, donor.name);
  }

  if (e.target.id === 'flag-account-btn') {
    if (donor.status === 'flagged') {
      donor.status = 'active';
      donor.flagReason = '';
    } else {
      const reason = prompt('Reason for flagging this donor account?');
      if (reason === null) return;
      if (!reason.trim()) {
        alert('Please provide a reason.');
        return;
      }
      donor.status = 'flagged';
      donor.flagReason = reason.trim();
    }
    logActivity(donor, donor.status === 'flagged' ? 'Flagged account' : 'Unflagged account');
    saveDonor(donor);
    render();
  }
});

document.getElementById('save-edit-btn').addEventListener('click', function () {
  const donor = loadDonor();
  if (!donor) return;

  donor.name = document.getElementById('edit-name-input').value.trim();
  donor.email = document.getElementById('edit-email-input').value.trim();
  donor.location = document.getElementById('edit-location-input').value.trim();
  logActivity(donor, 'Edited basic details');
  saveDonor(donor);
  render();

  const statusEl = document.getElementById('edit-save-status');
  statusEl.textContent = 'Saved.';
  setTimeout(function () { statusEl.textContent = ''; }, 2000);
});

document.getElementById('delete-donor-btn').addEventListener('click', function () {
  const donor = loadDonor();
  if (!donor) return;
  if (!confirm('Permanently delete "' + donor.name + '"? This cannot be undone.')) return;

  apiRequest('/donors/' + donor.id, { method: 'DELETE' })
    .then(function () {
      const deletionLog = JSON.parse(localStorage.getItem('deletionLog') || '[]');
      deletionLog.push({ accountName: donor.name, accountType: 'donor', reviewer: currentAdmin(), timestamp: new Date().toISOString() });
      localStorage.setItem('deletionLog', JSON.stringify(deletionLog));

      window.location.href = 'donors.html';
    })
    .catch(function (err) {
      alert('Could not delete: ' + err.message);
    });
});

document.getElementById('save-notes-btn').addEventListener('click', function () {
  const donor = loadDonor();
  if (!donor) return;

  donor.adminNotes = document.getElementById('admin-notes-textarea').value.trim();
  logActivity(donor, 'Updated admin notes');
  saveDonor(donor);
  render();

  const statusEl = document.getElementById('notes-save-status');
  statusEl.textContent = 'Saved.';
  setTimeout(function () { statusEl.textContent = ''; }, 2000);
});

const addDonationModal = new bootstrap.Modal(document.getElementById('add-donation-modal'));

function populateDonationOrphanageDropdown() {
  const select = document.getElementById('donation-orphanage');
  select.innerHTML = '<option value="" disabled selected>Select an orphanage&hellip;</option>';
  orphanagesCache.forEach(function (o) {
    const option = document.createElement('option');
    option.value = o.name;
    option.textContent = o.name;
    select.appendChild(option);
  });
}

document.getElementById('donation-type').addEventListener('change', function (e) {
  const isItem = e.target.value === 'item';
  document.getElementById('donation-money-fields').classList.toggle('d-none', isItem);
  document.getElementById('donation-item-fields').classList.toggle('d-none', !isItem);
});

document.getElementById('add-donation-btn').addEventListener('click', function () {
  document.getElementById('add-donation-form').reset();
  document.getElementById('donation-type').value = 'money';
  document.getElementById('donation-money-fields').classList.remove('d-none');
  document.getElementById('donation-item-fields').classList.add('d-none');
  document.getElementById('donation-date').value = new Date().toISOString().slice(0, 10);
  populateDonationOrphanageDropdown();
  addDonationModal.show();
});

document.getElementById('add-donation-form').addEventListener('submit', function (e) {
  e.preventDefault();
  const donor = loadDonor();
  if (!donor) return;

  const type = document.getElementById('donation-type').value;
  const orphanage = document.getElementById('donation-orphanage').value;
  const need = document.getElementById('donation-need').value.trim();
  const date = document.getElementById('donation-date').value || new Date().toISOString().slice(0, 10);

  if (!orphanage) {
    alert('Please select an orphanage.');
    return;
  }

  let donation;
  let estimatedValue = 0;

  if (type === 'item') {
    const itemDescription = document.getElementById('donation-item-description').value.trim();
    if (!itemDescription) {
      alert('Please describe what was donated.');
      return;
    }
    estimatedValue = Number(document.getElementById('donation-item-value').value) || 0;
    donation = {
      type: 'item',
      orphanage: orphanage,
      need: need,
      itemDescription: itemDescription,
      quantity: document.getElementById('donation-quantity').value.trim(),
      amount: estimatedValue,
      deliveryMethod: document.getElementById('donation-delivery-method').value.trim(),
      date: date,
      status: 'completed',
    };
  } else {
    estimatedValue = Number(document.getElementById('donation-amount').value) || 0;
    donation = {
      type: 'money',
      orphanage: orphanage,
      need: need,
      amount: estimatedValue,
      method: document.getElementById('donation-method').value.trim(),
      date: date,
      status: 'completed',
    };
  }

  donor.donations = donor.donations || [];
  donor.donations.push(donation);
  donor.donationsCount = (donor.donationsCount || 0) + 1;
  donor.totalGiven = (donor.totalGiven || 0) + estimatedValue;
  logActivity(donor, 'Added ' + (type === 'item' ? 'item' : 'money') + ' donation');

  saveDonor(donor).then(function () {
    addDonationModal.hide();
    render();
  });
});

Promise.all([fetchDonorsFromApi(), fetchOrphanagesFromApi()])
  .then(render)
  .catch(function (err) {
    document.getElementById('empty-state').textContent = 'Could not load donor data from the server: ' + err.message;
    document.getElementById('empty-state').classList.remove('d-none');
    document.getElementById('donor-content').classList.add('d-none');
  });
