if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

let partnersCache = [];
function loadPartners() { return partnersCache; }
function fetchPartnersFromApi() {
  return apiRequest('/partners').then(function (data) {
    partnersCache = data.partners;
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

function statusLabel(status) {
  if (status === 'needs-info') return 'Needs info';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function matchesStatusFilter(status, filter) {
  if (filter === 'all') return status !== 'rejected';
  return status === filter;
}

const STALE_PENDING_DAYS = 10;

function daysPending(partner) {
  if (!partner.submittedDate) return null;
  const ms = Date.now() - new Date(partner.submittedDate).getTime();
  return Math.floor(ms / 86400000);
}

function isUrgent(partner) {
  if (partner.verificationStatus !== 'pending' && partner.verificationStatus !== 'needs-info') return false;
  const days = daysPending(partner);
  return days !== null && days >= STALE_PENDING_DAYS;
}

function pendingCaseCount(partner) {
  return (partner.placementCases || []).filter(function (c) { return c.status === 'pending'; }).length;
}

function computeDuplicateRisks(partners) {
  const byEmail = {};
  partners.forEach(function (p) {
    const email = (p.email || '').trim().toLowerCase();
    if (!email) return;
    byEmail[email] = byEmail[email] || [];
    byEmail[email].push(p);
  });

  const risks = {};
  partners.forEach(function (p) {
    const email = (p.email || '').trim().toLowerCase();
    if (!email) return;
    const sharers = byEmail[email].filter(function (other) { return other.id !== p.id; });
    if (sharers.length) {
      risks[p.id] = 'Email also used by ' + sharers.map(function (o) { return o.name; }).join(', ');
    }
  });

  return risks;
}

let currentPartners = [];

function render() {
  // Partners still completing their profile ('draft') are not ready for review yet.
  const allPartners = loadPartners().filter(function (p) { return p.verificationStatus !== 'draft'; });
  const grid = document.getElementById('partners-grid');
  const emptyState = document.getElementById('empty-state');
  const filterEmptyState = document.getElementById('filter-empty-state');

  grid.innerHTML = '';
  currentPartners = [];

  if (allPartners.length === 0) {
    grid.classList.add('d-none');
    filterEmptyState.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  emptyState.classList.add('d-none');

  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;
  const partners = allPartners.filter(function (p) {
    const matchesSearch = !search || (p.name || '').toLowerCase().includes(search);
    return matchesSearch && matchesStatusFilter(p.verificationStatus, statusFilter);
  });

  currentPartners = partners;

  if (partners.length === 0) {
    grid.classList.add('d-none');
    filterEmptyState.classList.remove('d-none');
    return;
  }

  grid.classList.remove('d-none');
  filterEmptyState.classList.add('d-none');

  const duplicateRisks = computeDuplicateRisks(allPartners);

  partners.forEach(function (partner) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4';

    col.innerHTML =
      '<div class="card card-admin p-4 h-100 d-flex flex-column">' +
        '<div class="d-flex align-items-center gap-3 mb-3">' +
          '<div class="avatar partner-avatar' + (partner.logoUrl ? ' has-photo' : '') + '" style="width:56px;height:56px;font-size:18px; flex-shrink:0;">' +
            (partner.logoUrl ? '<img src="' + encodeURI(partner.logoUrl) + '" alt="">' : initials(partner.name)) +
          '</div>' +
          '<div>' +
            '<h3 class="h6 mb-1">' + escapeHtml(partner.name) + '</h3>' +
            '<span class="status-badge status-' + partner.verificationStatus + '">' + escapeHtml(statusLabel(partner.verificationStatus)) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="d-flex flex-wrap gap-2 mb-3">' +
          '<span class="tier-tag tier-friend">' + escapeHtml(partner.orgType) + '</span>' +
          '<span class="tier-tag ' + (partner.tier === 'Verified Referrer' ? 'tier-sustainer' : 'tier-champion') + '">' + escapeHtml(partner.tier) + '</span>' +
          (isUrgent(partner) ? '<span class="profile-urgent-badge"><i class="bi bi-stopwatch"></i> Urgent</span>' : '') +
          (pendingCaseCount(partner) > 0 ? '<span class="profile-info-badge"><i class="bi bi-clipboard-check"></i> ' + pendingCaseCount(partner) + ' placement case' + (pendingCaseCount(partner) === 1 ? '' : 's') + ' to review</span>' : '') +
        '</div>' +
        '<p class="text-muted small mb-3">' + escapeHtml(partner.contactName || '') + (partner.country ? ' &middot; ' + escapeHtml(partner.country) : '') + '</p>' +
        (duplicateRisks[partner.id] ? '<p class="profile-flag-badge" title="' + escapeHtml(duplicateRisks[partner.id]) + '"><i class="bi bi-exclamation-triangle-fill"></i> Duplicate account risk</p>' : '') +
        '<a href="partner-profile.html?id=' + encodeURIComponent(partner.id) + '" class="btn btn-admin-primary btn-sm mt-auto">Review profile</a>' +
      '</div>';

    grid.appendChild(col);
  });
}

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

document.getElementById('export-csv-btn').addEventListener('click', function () {
  const rows = [['Name', 'Contact', 'Email', 'Country', 'Org Type', 'Tier', 'Verification Status', 'Total Contributed']];
  currentPartners.forEach(function (p) {
    rows.push([p.name, p.contactName || '', p.email || '', p.country || '', p.orgType || '', p.tier || '', p.verificationStatus, p.totalContributed || 0]);
  });
  downloadCsv('partner-organizations.csv', rows);
});

document.getElementById('status-filter').addEventListener('change', render);
document.getElementById('search-input').addEventListener('input', render);

fetchPartnersFromApi()
  .then(render)
  .catch(function (err) {
    document.getElementById('empty-state').textContent = 'Could not load partner organizations from the server: ' + err.message;
    document.getElementById('empty-state').classList.remove('d-none');
  });
