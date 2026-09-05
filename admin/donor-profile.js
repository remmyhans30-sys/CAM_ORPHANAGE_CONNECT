function loadDonor() {
  return JSON.parse(localStorage.getItem('donor') || 'null');
}

function saveDonor(donor) {
  localStorage.setItem('donor', JSON.stringify(donor));
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

function formatFcfa(amount) {
  return Number(amount || 0).toLocaleString('en-US') + ' FCFA';
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
    '<div class="d-flex flex-wrap gap-4 align-items-start">' +
      '<div class="avatar donor-avatar' + (donor.photoUrl ? ' has-photo' : '') + '" style="width:96px;height:96px; flex-shrink:0;">' +
        (donor.photoUrl ? '<img src="' + encodeURI(donor.photoUrl) + '" alt="">' : initials(donor.name)) +
      '</div>' +
      '<div class="flex-grow-1">' +
        '<div class="d-flex align-items-center gap-2 flex-wrap mb-1">' +
          '<h2 class="h4 mb-0">' + escapeHtml(donor.name) + '</h2>' +
          (donor.vip ? '<span class="vip-tag">VIP</span>' : '') +
          '<span class="donor-status-badge status-' + donor.status + '">' + (donor.status === 'flagged' ? 'Flagged' : 'Active') + '</span>' +
        '</div>' +
        '<p class="text-muted small mb-3">' + escapeHtml(anniversaryMarker(donor.joinDate)) + '</p>' +
        '<dl class="row mb-0 small">' +
          '<dt class="col-sm-3">Email</dt><dd class="col-sm-9">' + escapeHtml(donor.email || '&mdash;') + '</dd>' +
          '<dt class="col-sm-3">Joined</dt><dd class="col-sm-9">' + escapeHtml(donor.joinDate || '&mdash;') + '</dd>' +
          '<dt class="col-sm-3">Location</dt><dd class="col-sm-9">' + escapeHtml(donor.location || '&mdash;') + '</dd>' +
          '<dt class="col-sm-3">Preferred payment</dt><dd class="col-sm-9">' + escapeHtml(donor.preferredPayment || '&mdash;') + ' (' + escapeHtml(donor.preferredCurrency || '&mdash;') + ')</dd>' +
          '<dt class="col-sm-3">Last active</dt><dd class="col-sm-9">' + escapeHtml(donor.lastActive || '&mdash;') + '</dd>' +
        '</dl>' +
        '<div class="d-flex gap-2 mt-3">' +
          '<button type="button" class="btn btn-admin-primary btn-sm" id="message-donor-btn">Message donor</button>' +
          '<button type="button" class="btn btn-admin-danger btn-sm" id="flag-account-btn">' + (donor.status === 'flagged' ? 'Unflag account' : 'Flag account') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function renderStatsStrip(donor) {
  const strip = document.getElementById('donor-stats-strip');
  const stats = [
    { label: 'Total given', value: formatFcfa(donor.totalGiven) },
    { label: 'Donations made', value: donor.donationsCount || 0 },
    { label: 'Homes followed', value: donor.homesFollowedCount || 0 },
    { label: 'Active recurring gifts', value: donor.activeRecurringGifts || 0 },
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

function renderDonationHistory(donor) {
  const tbody = document.getElementById('donation-history-tbody');
  const donations = donor.donations || [];

  if (donations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted small">No donations recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = donations.map(function (d) {
    return (
      '<tr>' +
        '<td>' + escapeHtml(d.date) + '</td>' +
        '<td>' + escapeHtml(d.orphanage) + '</td>' +
        '<td>' + escapeHtml(d.need) + '</td>' +
        '<td>' + formatFcfa(d.amount) + '</td>' +
        '<td>' + escapeHtml(d.method) + '</td>' +
        '<td><span class="donor-status-badge status-' + (d.status === 'completed' ? 'active' : 'flagged') + '">' + escapeHtml(d.status.charAt(0).toUpperCase() + d.status.slice(1)) + '</span></td>' +
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
        '<td><span class="donor-status-badge status-' + (isCompleted ? 'active' : 'flagged') + '">' + escapeHtml(isCompleted ? 'Completed' : 'Link expired, not used') + '</span></td>' +
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
        '<td>' + escapeHtml(f.reason) + '</td>' +
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
      '<div class="d-flex justify-content-between align-items-start gap-3 py-2 border-bottom">' +
        '<div>' +
          '<p class="mb-0">' + escapeHtml(t.issue) + '</p>' +
          '<span class="text-muted small">' + escapeHtml(t.date) + '</span>' +
        '</div>' +
        '<span class="donor-status-badge status-' + (isOpen ? 'flagged' : 'active') + '">' + escapeHtml(isOpen ? 'Open' : 'Resolved') + '</span>' +
      '</div>'
    );
  }).join('');
}

function renderReferrals(donor) {
  const panel = document.getElementById('referrals-panel');
  const referrals = donor.referralsMade || [];
  const activeCount = referrals.filter(function (r) { return r.active; }).length;

  const referredByLine = donor.referredBy
    ? '<p class="mb-2"><strong>Referred by:</strong> ' + escapeHtml(donor.referredBy) + '</p>'
    : '<p class="mb-2 text-muted">Not referred by anyone &mdash; joined directly.</p>';

  const referralsList = referrals.length
    ? '<ul class="mb-0 small">' + referrals.map(function (r) {
        return '<li>' + escapeHtml(r.name) + (r.active ? ' <span class="text-muted">(active donor)</span>' : ' <span class="text-muted">(inactive)</span>') + '</li>';
      }).join('') + '</ul>'
    : '<p class="text-muted small mb-0">Hasn\'t referred anyone yet.</p>';

  panel.innerHTML =
    referredByLine +
    '<p class="mb-2"><strong>Referred ' + referrals.length + ' donor' + (referrals.length === 1 ? '' : 's') + '</strong> (' + activeCount + ' became active)</p>' +
    referralsList;
}

function renderHomesFollowed(donor) {
  const list = document.getElementById('homes-followed-list');
  const homes = donor.homesFollowed || [];

  if (homes.length === 0) {
    list.innerHTML = '<p class="text-muted small mb-0">Not following any orphanages yet.</p>';
    return;
  }

  list.innerHTML = '<div class="d-flex flex-wrap gap-2">' + homes.map(function (h) {
    return (
      '<span class="tier-tag tier-' + h.tier.toLowerCase() + '">' +
        escapeHtml(h.name) + ' &middot; ' + escapeHtml(h.tier) +
      '</span>'
    );
  }).join('') + '</div>';
}

function renderGroupsJoined(donor) {
  const list = document.getElementById('groups-joined-list');
  const groups = donor.groupsJoined || [];

  if (groups.length === 0) {
    list.innerHTML = '<p class="text-muted small mb-0">Not part of any giving circles or associations.</p>';
    return;
  }

  list.innerHTML = '<div class="d-flex flex-wrap gap-2">' + groups.map(function (g) {
    return '<span class="tier-tag tier-friend">' + escapeHtml(g) + '</span>';
  }).join('') + '</div>';
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

  box.innerHTML = '<div class="profile-info-note' + (isFlagged ? ' profile-info-note-danger' : '') + '">' + escapeHtml(message) + '</div>';
}

function renderAdminNotes(donor) {
  document.getElementById('admin-notes-textarea').value = donor.adminNotes || '';
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
}

function seedSampleData() {
  const sampleDonor = {
    id: 1,
    name: 'Ngozi Adeyemi',
    email: 'ngozi.adeyemi@example.com',
    joinDate: '2026-02-14',
    location: 'Douala, Cameroon',
    preferredPayment: 'MTN Mobile Money',
    preferredCurrency: 'FCFA',
    lastActive: '2026-09-01',
    vip: true,
    status: 'active',
    totalGiven: 850000,
    donationsCount: 14,
    homesFollowedCount: 3,
    activeRecurringGifts: 2,
    chargebacksCount: 0,
    donations: [
      { date: '2026-08-15', orphanage: "Hope Children's Home", need: 'New dormitory beds', amount: 60000, method: 'MTN Mobile Money', status: 'completed' },
      { date: '2026-07-20', orphanage: 'Grace Orphanage', need: 'Kitchen renovation', amount: 100000, method: 'MTN Mobile Money', status: 'completed' },
      { date: '2026-06-10', orphanage: "Hope Children's Home", need: 'School fees for 10 children', amount: 45000, method: 'Bank transfer', status: 'refunded' },
      { date: '2026-05-02', orphanage: "Foyer de l'Espérance", need: 'Fournitures scolaires', amount: 30000, method: 'MTN Mobile Money', status: 'completed' },
    ],
    passwordResets: [
      { date: '2026-07-02', method: 'Email link', status: 'completed' },
      { date: '2026-04-18', method: 'Email link', status: 'expired' },
    ],
    failedPayments: [
      { date: '2026-08-01', amount: 60000, method: 'MTN Mobile Money', reason: 'Insufficient funds' },
      { date: '2026-06-09', amount: 45000, method: 'Bank transfer', reason: 'Card declined' },
    ],
    supportTickets: [
      { date: '2026-08-16', issue: "Donation didn't show as completed", status: 'resolved' },
      { date: '2026-09-02', issue: 'Asking how to update payment method', status: 'open' },
    ],
    referredBy: 'Amina Njoya',
    referralsMade: [
      { name: 'Chidi Okafor', active: true },
      { name: 'Fatou Bello', active: false },
    ],
    homesFollowed: [
      { name: "Hope Children's Home", tier: 'Champion' },
      { name: 'Grace Orphanage', tier: 'Sustainer' },
      { name: "Foyer de l'Espérance", tier: 'Friend' },
    ],
    groupsJoined: ['Cameroon Diaspora Paris', 'Douala Alumni Giving Circle'],
  };

  saveDonor(sampleDonor);
  render();
}

function clearAllData() {
  if (!confirm('Clear donor data? This cannot be undone.')) return;
  localStorage.removeItem('donor');
  render();
}

document.getElementById('seed-btn').addEventListener('click', seedSampleData);
document.getElementById('clear-btn').addEventListener('click', clearAllData);

document.getElementById('donor-header-card').addEventListener('click', function (e) {
  const donor = loadDonor();
  if (!donor) return;

  if (e.target.id === 'message-donor-btn') {
    const message = prompt('Message to send to ' + donor.name + ':');
    if (message === null) return;
    if (!message.trim()) return;
    alert('(Simulated) Message sent to ' + donor.name + ': "' + message.trim() + '"');
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
    saveDonor(donor);
    render();
  }
});

document.getElementById('save-notes-btn').addEventListener('click', function () {
  const donor = loadDonor();
  if (!donor) return;

  donor.adminNotes = document.getElementById('admin-notes-textarea').value.trim();
  saveDonor(donor);

  const statusEl = document.getElementById('notes-save-status');
  statusEl.textContent = 'Saved.';
  setTimeout(function () { statusEl.textContent = ''; }, 2000);
});

render();
