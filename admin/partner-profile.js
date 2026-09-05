function getPartnerId() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  return id !== null ? Number(id) : null;
}

function loadPartner() {
  const partners = JSON.parse(localStorage.getItem('partners') || '[]');
  const id = getPartnerId();
  if (id === null) return partners[0] || null;
  return partners.find(function (p) { return p.id === id; }) || null;
}

function savePartner(partner) {
  const partners = JSON.parse(localStorage.getItem('partners') || '[]');
  const idx = partners.findIndex(function (p) { return p.id === partner.id; });
  if (idx === -1) return;
  partners[idx] = partner;
  localStorage.setItem('partners', JSON.stringify(partners));
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

function formatFcfa(amount) {
  return Number(amount || 0).toLocaleString('en-US') + ' FCFA';
}

function statusLabel(status) {
  if (status === 'needs-info') return 'Needs info';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function renderHeaderCard(partner) {
  const card = document.getElementById('partner-header-card');

  card.innerHTML =
    '<div class="d-flex flex-wrap justify-content-between align-items-center gap-3">' +
      '<div class="d-flex flex-wrap gap-3 align-items-center">' +
        '<div class="avatar partner-avatar' + (partner.logoUrl ? ' has-photo' : '') + '" style="width:64px;height:64px;font-size:20px; flex-shrink:0;">' +
          (partner.logoUrl ? '<img src="' + encodeURI(partner.logoUrl) + '" alt="">' : initials(partner.name)) +
        '</div>' +
        '<div>' +
          '<div class="d-flex align-items-center gap-2 flex-wrap mb-1">' +
            '<h2 class="h5 mb-0">' + escapeHtml(partner.name) + '</h2>' +
            '<span class="status-badge status-' + partner.verificationStatus + '">' + escapeHtml(statusLabel(partner.verificationStatus)) + '</span>' +
            '<span class="tier-tag tier-friend">' + escapeHtml(partner.orgType) + '</span>' +
            '<span class="tier-tag ' + (partner.tier === 'Verified Referrer' ? 'tier-sustainer' : 'tier-champion') + '">' + escapeHtml(partner.tier) + '</span>' +
          '</div>' +
          '<div class="d-flex flex-wrap gap-3 small text-muted">' +
            '<span>Contact: ' + escapeHtml(partner.contactName || '&mdash;') + '</span>' +
            '<span>' + escapeHtml(partner.email || '&mdash;') + '</span>' +
            '<span>' + escapeHtml(partner.country || '&mdash;') + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="d-flex gap-2 align-self-start">' +
        '<button type="button" class="btn btn-admin-primary btn-sm" id="message-org-btn">Message org</button>' +
        '<button type="button" class="btn btn-admin-danger btn-sm" id="flag-account-btn">' + (partner.status === 'flagged' ? 'Unflag account' : 'Flag account') + '</button>' +
      '</div>' +
    '</div>';
}

function renderOnboardingChecklist(partner) {
  const panel = document.getElementById('onboarding-checklist');
  const items = [
    { label: 'Documents submitted', done: (partner.documents || []).length > 0 },
    { label: 'Verified', done: partner.verificationStatus === 'verified' },
    { label: 'Pledge configured', done: Boolean(partner.pledge) },
    { label: 'Public wording approved', done: Boolean(partner.wordingApproved) },
  ];

  panel.innerHTML = items.map(function (item) {
    return (
      '<div class="d-flex align-items-center gap-2 mb-1">' +
        '<span>' + (item.done ? '&#9989;' : '&#9744;') + '</span>' +
        '<span class="small' + (item.done ? '' : ' text-muted') + '">' + escapeHtml(item.label) + '</span>' +
      '</div>'
    );
  }).join('');
}

function renderStatsStrip(partner) {
  const strip = document.getElementById('partner-stats-strip');
  const stats = [
    { label: 'Orphanages sponsored', value: (partner.orphanagesSponsored || []).length },
    { label: 'Total contributed (lifetime)', value: formatFcfa(partner.totalContributed) },
    { label: 'Placement referrals submitted', value: partner.placementReferralsCount || 0 },
    { label: 'Access tier', value: partner.tier },
  ];

  strip.innerHTML = stats.map(function (stat) {
    return (
      '<div class="col-6 col-md-3">' +
        '<div class="stat-tile">' +
          '<strong>' + escapeHtml(String(stat.value)) + '</strong>' +
          '<span>' + escapeHtml(stat.label) + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
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
  const panel = document.getElementById('placement-referrals-panel');

  if (partner.tier === 'Sponsor') {
    panel.innerHTML =
      '<div class="profile-info-note">' +
        '&#128274; This organization is on the <strong>Sponsor</strong> tier and cannot submit placement cases. ' +
        'Upgrade to <strong>Verified Referrer</strong> tier to enable placement referrals.' +
      '</div>';
    return;
  }

  const cases = partner.placementCases || [];

  if (cases.length === 0) {
    panel.innerHTML = '<p class="text-muted small mb-0">No placement cases submitted yet.</p>';
    return;
  }

  panel.innerHTML = cases.map(function (c, i) {
    const isReviewed = c.status === 'reviewed';
    return (
      '<div class="profile-post">' +
        '<div class="d-flex justify-content-between align-items-start mb-1">' +
          '<span class="profile-post-date">Submitted ' + escapeHtml(c.submittedDate || '') + '</span>' +
          '<div class="d-flex align-items-center gap-2">' +
            '<span class="donor-status-badge status-' + (isReviewed ? 'active' : 'flagged') + '">' + (isReviewed ? 'Reviewed' : 'Pending review') + '</span>' +
            (isReviewed ? '' : '<button type="button" class="btn btn-admin-outline btn-sm mark-case-reviewed-btn" data-case-index="' + i + '">Mark reviewed</button>') +
          '</div>' +
        '</div>' +
        '<dl class="row mb-0 small">' +
          '<dt class="col-4">Referring social worker</dt><dd class="col-8">' + escapeHtml(c.socialWorkerName || '&mdash;') + ' (' + escapeHtml(c.socialWorkerPhone || '&mdash;') + ')</dd>' +
          '<dt class="col-4">Reason for referral</dt><dd class="col-8">' + escapeHtml(c.reasonForReferral || '&mdash;') + '</dd>' +
          '<dt class="col-4">Placement type</dt><dd class="col-8">' + escapeHtml(c.placementType || '&mdash;') + '</dd>' +
          '<dt class="col-4">Educational status</dt><dd class="col-8">' + escapeHtml(c.educationalStatus || '&mdash;') + '</dd>' +
          '<dt class="col-4">Living environment</dt><dd class="col-8">' + escapeHtml(c.livingEnvironmentNotes || '&mdash;') + '</dd>' +
          '<dt class="col-4">Anticipated discharge</dt><dd class="col-8">' + escapeHtml(c.anticipatedDischargeDate || '&mdash;') + '</dd>' +
        '</dl>' +
      '</div>'
    );
  }).join('');
}

function renderSponsoredByPreview(partner) {
  const panel = document.getElementById('sponsored-by-preview');

  panel.innerHTML =
    '<span class="sponsor-badge"><span class="sponsor-badge-dot"></span>Sponsored by ' + escapeHtml(partner.name) + '</span>' +
    '<div class="sponsor-blurb-box">&ldquo;' + escapeHtml(partner.sponsoredByBlurb || '') + '&rdquo;</div>' +
    '<div class="d-flex gap-2">' +
      '<button type="button" class="btn btn-admin-primary btn-sm" id="approve-wording-btn" style="background-color: var(--teal); border-color: var(--teal);">Approve wording</button>' +
      '<button type="button" class="btn btn-admin-outline btn-sm" id="request-edit-btn">Request edit</button>' +
    '</div>';
}

function currentAdmin() {
  return localStorage.getItem('currentAdminEmail') || 'Unknown admin';
}

function logActivity(partner, action) {
  partner.activityLog = partner.activityLog || [];
  partner.activityLog.push({
    reviewer: currentAdmin(),
    action: action,
    timestamp: new Date().toISOString(),
  });
}

function renderVerificationDocuments(partner) {
  const panel = document.getElementById('verification-documents-panel');
  const docs = partner.documents || [];
  const hasDocs = docs.length > 0;

  const requiredNote =
    '<p class="text-muted small mb-2">Required to verify: registration certificate, tax clearance certificate, and a government ID for the contact person.</p>';

  const docsList = hasDocs
    ? requiredNote + '<ul class="mb-3 small">' + docs.map(function (d) { return '<li>' + escapeHtml(d) + '</li>'; }).join('') + '</ul>'
    : requiredNote + '<p class="profile-docs-missing small mb-3">No verification documents uploaded yet.</p>';

  const sanctionsCheck =
    '<div class="form-check mb-3">' +
      '<input class="form-check-input" type="checkbox" id="sanctions-screened-checkbox"' + (partner.sanctionsScreened ? ' checked' : '') + '>' +
      '<label class="form-check-label small" for="sanctions-screened-checkbox">Confirmed this organization and its named officers have been screened against sanctions/watchlists (OFAC, UN)</label>' +
    '</div>';

  const isActionable = partner.verificationStatus === 'pending' || partner.verificationStatus === 'needs-info';
  const isVerified = partner.verificationStatus === 'verified';
  const isSponsor = partner.tier === 'Sponsor';
  const canVerify = hasDocs && partner.sanctionsScreened;

  const decisionNote =
    (partner.verificationStatus === 'needs-info' && partner.infoRequestMessage
      ? '<div class="profile-info-note mb-3">Info requested: ' + escapeHtml(partner.infoRequestMessage) + '</div>'
      : '') +
    (partner.verificationStatus === 'rejected' && partner.rejectionReason
      ? '<div class="profile-info-note profile-info-note-danger mb-3">Rejected: ' + escapeHtml(partner.rejectionReason) + '</div>'
      : '');

  const decisionButtons = isActionable
    ? '<button type="button" class="btn btn-admin-danger btn-sm" id="reject-org-btn">Reject</button>' +
      '<button type="button" class="btn btn-admin-outline btn-sm" id="request-info-btn">Request more info</button>' +
      '<button type="button" class="btn btn-admin-primary btn-sm" id="mark-verified-btn"' + (canVerify ? '' : ' disabled title="Upload documents and confirm sanctions screening first"') + '>Mark as verified</button>'
    : '';

  const tierBtn = !isVerified
    ? ''
    : (isSponsor
        ? '<button type="button" class="btn btn-admin-outline btn-sm" id="tier-toggle-btn"' + (hasDocs ? '' : ' disabled title="Upload verification documents first"') + '>Upgrade to Verified Referrer</button>'
        : '<button type="button" class="btn btn-admin-outline btn-sm" id="tier-toggle-btn">Downgrade to Sponsor</button>');

  panel.innerHTML = decisionNote + docsList + sanctionsCheck + '<div class="d-flex flex-wrap gap-2">' + decisionButtons + tierBtn + '</div>';
}

function renderActivityLog(partner) {
  const panel = document.getElementById('activity-log-panel');
  const log = (partner.activityLog || []).slice().reverse();

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

function renderAdminNotes(partner) {
  document.getElementById('admin-notes-textarea').value = partner.adminNotes || '';
}

function render() {
  const partner = loadPartner();
  const emptyState = document.getElementById('empty-state');
  const content = document.getElementById('partner-content');

  if (!partner) {
    emptyState.classList.remove('d-none');
    content.classList.add('d-none');
    return;
  }

  emptyState.classList.add('d-none');
  content.classList.remove('d-none');
  renderHeaderCard(partner);
  renderOnboardingChecklist(partner);
  renderStatsStrip(partner);
  renderOrphanagesSponsored(partner);
  renderMatchingPledge(partner);
  renderPlacementReferrals(partner);
  renderSponsoredByPreview(partner);
  renderVerificationDocuments(partner);
  renderActivityLog(partner);
  renderAdminNotes(partner);
}

document.getElementById('partner-header-card').addEventListener('click', function (e) {
  const partner = loadPartner();
  if (!partner) return;

  if (e.target.id === 'message-org-btn') {
    const message = prompt('Message to send to ' + partner.name + ':');
    if (message === null) return;
    if (!message.trim()) return;
    alert('(Simulated) Message sent to ' + partner.name + ': "' + message.trim() + '"');
  }

  if (e.target.id === 'flag-account-btn') {
    if (partner.status === 'flagged') {
      partner.status = 'active';
      partner.flagReason = '';
    } else {
      const reason = prompt('Reason for flagging this partner organization?');
      if (reason === null) return;
      if (!reason.trim()) {
        alert('Please provide a reason.');
        return;
      }
      partner.status = 'flagged';
      partner.flagReason = reason.trim();
    }
    logActivity(partner, partner.status === 'flagged' ? 'Flagged account' : 'Unflagged account');
    savePartner(partner);
    render();
  }
});

document.getElementById('placement-referrals-panel').addEventListener('click', function (e) {
  if (!e.target.classList.contains('mark-case-reviewed-btn')) return;
  const partner = loadPartner();
  if (!partner) return;

  const caseIndex = Number(e.target.dataset.caseIndex);
  const cases = partner.placementCases || [];
  if (!cases[caseIndex]) return;

  cases[caseIndex].status = 'reviewed';
  logActivity(partner, 'Reviewed placement case for ' + (cases[caseIndex].socialWorkerName || 'unnamed referral'));
  savePartner(partner);
  render();
});

document.getElementById('sponsored-by-preview').addEventListener('click', function (e) {
  const partner = loadPartner();
  if (!partner) return;

  if (e.target.id === 'approve-wording-btn') {
    partner.wordingApproved = true;
    logActivity(partner, 'Approved public "Sponsored by" wording');
    savePartner(partner);
    render();
    alert('Wording approved. This text is now cleared to go live on the orphanage\'s public profile.');
  }

  if (e.target.id === 'request-edit-btn') {
    const note = prompt('What should change about this wording?');
    if (note === null) return;
    if (!note.trim()) return;
    logActivity(partner, 'Requested wording edit: ' + note.trim());
    savePartner(partner);
    render();
    alert('(Simulated) Edit request sent to ' + partner.name + ': "' + note.trim() + '"');
  }
});

document.getElementById('verification-documents-panel').addEventListener('click', function (e) {
  const partner = loadPartner();
  if (!partner) return;

  if (e.target.id === 'sanctions-screened-checkbox') {
    partner.sanctionsScreened = e.target.checked;
    logActivity(partner, e.target.checked ? 'Confirmed sanctions/watchlist screening' : 'Unconfirmed sanctions/watchlist screening');
    savePartner(partner);
    render();
    return;
  }

  if (e.target.id === 'mark-verified-btn') {
    partner.verificationStatus = 'verified';
    partner.rejectionReason = '';
    partner.infoRequestMessage = '';
    logActivity(partner, 'Marked as verified');
    savePartner(partner);
    render();
  }

  if (e.target.id === 'reject-org-btn') {
    const reason = prompt('Reason for rejecting this organization? This will be shown to them.');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }
    partner.verificationStatus = 'rejected';
    partner.rejectionReason = reason.trim();
    logActivity(partner, 'Rejected');
    savePartner(partner);
    render();
  }

  if (e.target.id === 'request-info-btn') {
    const message = prompt('What information or documents are missing? This will be shown to the organization.');
    if (message === null) return;
    if (!message.trim()) {
      alert('Please describe what is missing.');
      return;
    }
    partner.verificationStatus = 'needs-info';
    partner.infoRequestMessage = message.trim();
    logActivity(partner, 'Requested more info');
    savePartner(partner);
    render();
  }

  if (e.target.id === 'tier-toggle-btn') {
    const upgrading = partner.tier === 'Sponsor';
    partner.tier = upgrading ? 'Verified Referrer' : 'Sponsor';
    logActivity(partner, upgrading ? 'Upgraded to Verified Referrer' : 'Downgraded to Sponsor');
    savePartner(partner);
    render();
  }
});

document.getElementById('save-notes-btn').addEventListener('click', function () {
  const partner = loadPartner();
  if (!partner) return;

  partner.adminNotes = document.getElementById('admin-notes-textarea').value.trim();
  savePartner(partner);

  const statusEl = document.getElementById('notes-save-status');
  statusEl.textContent = 'Saved.';
  setTimeout(function () { statusEl.textContent = ''; }, 2000);
});

render();
