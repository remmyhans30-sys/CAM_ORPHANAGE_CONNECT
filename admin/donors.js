if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

let donorsCache = [];

function loadDonors() {
  return donorsCache;
}

function fetchDonorsFromApi() {
  return apiRequest('/donors').then(function (data) {
    donorsCache = data.donors;
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

function computeDuplicateRisks(donors) {
  const byEmail = {};
  donors.forEach(function (d) {
    const email = (d.email || '').trim().toLowerCase();
    if (!email) return;
    byEmail[email] = byEmail[email] || [];
    byEmail[email].push(d);
  });

  const risks = {};
  donors.forEach(function (d) {
    const email = (d.email || '').trim().toLowerCase();
    if (!email) return;
    const sharers = byEmail[email].filter(function (other) { return other.id !== d.id; });
    if (sharers.length) {
      risks[d.id] = 'Email also used by ' + sharers.map(function (o) { return o.name; }).join(', ');
    }
  });

  return risks;
}

let currentDonors = [];

function render() {
  const allDonors = loadDonors();
  const grid = document.getElementById('donors-grid');
  const emptyState = document.getElementById('empty-state');
  const filterEmptyState = document.getElementById('filter-empty-state');

  grid.innerHTML = '';
  currentDonors = [];

  if (allDonors.length === 0) {
    grid.classList.add('d-none');
    filterEmptyState.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  emptyState.classList.add('d-none');

  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;

  const donors = allDonors.filter(function (donor) {
    const matchesSearch = !search ||
      (donor.name || '').toLowerCase().includes(search) ||
      (donor.email || '').toLowerCase().includes(search);
    const matchesStatus = statusFilter === 'all' || donor.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  currentDonors = donors;

  if (donors.length === 0) {
    grid.classList.add('d-none');
    filterEmptyState.classList.remove('d-none');
    return;
  }

  grid.classList.remove('d-none');
  filterEmptyState.classList.add('d-none');

  const duplicateRisks = computeDuplicateRisks(allDonors);

  donors.forEach(function (donor) {
    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4';

    col.innerHTML =
      '<div class="card card-admin p-4 h-100 d-flex flex-column">' +
        '<div class="d-flex align-items-center gap-3 mb-3">' +
          '<div class="avatar donor-avatar' + (donor.photoUrl ? ' has-photo' : '') + '" style="width:56px;height:56px;font-size:18px; flex-shrink:0;">' +
            (donor.photoUrl ? '<img src="' + encodeURI(donor.photoUrl) + '" alt="">' : initials(donor.name)) +
          '</div>' +
          '<div>' +
            '<h3 class="h6 mb-1">' + escapeHtml(donor.name) + '</h3>' +
            '<span class="donor-status-badge status-' + donor.status + '">' + donorStatusLabel(donor.status) + '</span>' +
            (donor.vip ? ' <span class="vip-tag"><i class="bi bi-star-fill"></i> VIP</span>' : '') +
          '</div>' +
        '</div>' +
        '<p class="text-muted small mb-1">' + escapeHtml(donor.email || '') + '</p>' +
        (donor.status === 'pending' && donor.needsEmailConfirmation
          ? '<p class="small text-warning-emphasis mb-1"><i class="bi bi-envelope-exclamation"></i> Email not confirmed yet</p>'
          : '') +
        '<p class="text-muted small mb-3">' + escapeHtml(donor.location || '') + '</p>' +
        (duplicateRisks[donor.id] ? '<p class="profile-flag-badge" title="' + escapeHtml(duplicateRisks[donor.id]) + '"><i class="bi bi-exclamation-triangle-fill"></i> Duplicate account risk</p>' : '') +
        '<a href="donor-profile.html?id=' + encodeURIComponent(donor.id) + '" class="btn btn-admin-primary btn-sm mt-auto">' + (donor.status === 'pending' ? 'Review and approve' : 'Review profile') + '</a>' +
      '</div>';

    grid.appendChild(col);
  });
}

function donorStatusLabel(status) {
  return { pending: 'Awaiting approval', active: 'Active', flagged: 'Flagged', rejected: 'Rejected' }[status] || 'Active';
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
  const rows = [['Name', 'Email', 'Location', 'Status', 'Join Date', 'Total Given', 'Donations Count']];
  currentDonors.forEach(function (d) {
    rows.push([d.name, d.email || '', d.location || '', d.status, d.joinDate || '', d.totalGiven || 0, d.donationsCount || 0]);
  });
  downloadCsv('donors.csv', rows);
});

document.getElementById('search-input').addEventListener('input', render);
document.getElementById('status-filter').addEventListener('change', render);

fetchDonorsFromApi()
  .then(render)
  .catch(function (err) {
    document.getElementById('donors-grid').innerHTML =
      '<div class="col-12"><div class="alert alert-danger">Could not load donors from the server: ' + err.message + '</div></div>';
    document.getElementById('donors-grid').classList.remove('d-none');
  });
