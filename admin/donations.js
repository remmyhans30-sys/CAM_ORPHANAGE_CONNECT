if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }
if (localStorage.getItem('currentAdminRole') === 'Content Manager') {
  alert('Your role (Content Manager) does not have access to Donations.');
  window.location.href = 'dashboard.html';
}

function loadDonors() { return JSON.parse(localStorage.getItem('donors') || '[]'); }
function saveDonors(donors) { localStorage.setItem('donors', JSON.stringify(donors)); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatFcfa(amount) {
  return Number(amount || 0).toLocaleString('en-US') + ' FCFA';
}

let sortField = 'date';
let sortDir = 'desc';
let currentPage = 1;
const PAGE_SIZE = 10;

function collectDonations() {
  const donors = loadDonors();
  const rows = [];

  donors.forEach(function (d, donorIdx) {
    (d.donations || []).forEach(function (don, donIdx) {
      rows.push({
        donorId: d.id,
        donorName: d.name,
        donorIdx: donorIdx,
        donIdx: donIdx,
        amount: Number(don.amount || 0),
        need: don.need,
        method: don.method,
        date: don.date,
        status: don.status,
      });
    });
  });

  return rows;
}

function getFilteredSorted() {
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;

  let rows = collectDonations().filter(function (r) {
    const matchesSearch = !search || (r.donorName || '').toLowerCase().includes(search);
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  rows.sort(function (a, b) {
    let cmp;
    if (sortField === 'amount') cmp = a.amount - b.amount;
    else cmp = new Date(a.date) - new Date(b.date);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return rows;
}

function render() {
  const rows = getFilteredSorted();
  const emptyState = document.getElementById('empty-state');
  const tableCard = document.getElementById('table-card');

  if (rows.length === 0) {
    emptyState.classList.remove('d-none');
    tableCard.classList.add('d-none');
    return;
  }

  emptyState.classList.add('d-none');
  tableCard.classList.remove('d-none');

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);

  document.getElementById('donations-tbody').innerHTML = pageRows.map(function (r) {
    const rowId = r.donorId + '::' + r.donIdx;
    return (
      '<tr>' +
        '<td>' + escapeHtml(r.donorName) + '</td>' +
        '<td>' + formatFcfa(r.amount) + '</td>' +
        '<td>' + escapeHtml(r.need || '&mdash;') + '</td>' +
        '<td>' + escapeHtml(r.method || '&mdash;') + '</td>' +
        '<td>' + escapeHtml(r.date || '&mdash;') + '</td>' +
        '<td><span class="tier-tag ' + (r.status === 'completed' ? 'tier-friend' : 'tier-champion') + '">' + escapeHtml((r.status || '').charAt(0).toUpperCase() + (r.status || '').slice(1)) + '</span></td>' +
        '<td class="text-end">' +
          '<button class="btn btn-admin-outline btn-sm me-1 view-btn" data-row="' + rowId + '">View</button>' +
          '<button class="btn btn-admin-danger btn-sm delete-btn" data-row="' + rowId + '">Delete</button>' +
        '</td>' +
      '</tr>'
    );
  }).join('');

  document.getElementById('pagination-info').textContent =
    'Showing ' + (start + 1) + '-' + Math.min(start + PAGE_SIZE, rows.length) + ' of ' + rows.length;
  document.getElementById('prev-page-btn').disabled = currentPage === 1;
  document.getElementById('next-page-btn').disabled = currentPage === totalPages;
}

function findDonationByRowId(rowId) {
  const parts = rowId.split('::');
  const donorId = parts[0];
  const donIdx = Number(parts[1]);
  const donors = loadDonors();
  const donor = donors.find(function (d) { return String(d.id) === donorId; });
  if (!donor) return null;
  return { donors: donors, donor: donor, donIdx: donIdx, donation: (donor.donations || [])[donIdx] };
}

const donationModal = new bootstrap.Modal(document.getElementById('donation-modal'));

document.getElementById('donations-tbody').addEventListener('click', function (e) {
  const rowId = e.target.dataset.row;
  if (!rowId) return;

  if (e.target.classList.contains('view-btn')) {
    const found = findDonationByRowId(rowId);
    if (!found) return;
    const d = found.donation;
    document.getElementById('donation-modal-body').innerHTML =
      '<dl class="row small mb-3">' +
        '<dt class="col-4">Donor</dt><dd class="col-8">' + escapeHtml(found.donor.name) + '</dd>' +
        '<dt class="col-4">Amount</dt><dd class="col-8">' + formatFcfa(d.amount) + '</dd>' +
        '<dt class="col-4">Need</dt><dd class="col-8">' + escapeHtml(d.need || '&mdash;') + '</dd>' +
        '<dt class="col-4">Method</dt><dd class="col-8">' + escapeHtml(d.method || '&mdash;') + '</dd>' +
        '<dt class="col-4">Date</dt><dd class="col-8">' + escapeHtml(d.date || '&mdash;') + '</dd>' +
      '</dl>' +
      '<label class="form-label small" for="edit-status-select">Status</label>' +
      '<select class="form-select mb-3" id="edit-status-select">' +
        '<option value="completed"' + (d.status === 'completed' ? ' selected' : '') + '>Completed</option>' +
        '<option value="refunded"' + (d.status === 'refunded' ? ' selected' : '') + '>Refunded</option>' +
      '</select>' +
      '<button type="button" class="btn btn-admin-primary btn-sm" id="save-status-btn" data-row="' + rowId + '">Save status</button> ' +
      '<a href="donor-profile.html?id=' + encodeURIComponent(found.donor.id) + '" class="small ms-2">View donor profile</a>';
    donationModal.show();
  }

  if (e.target.classList.contains('delete-btn')) {
    if (!confirm('Delete this donation record? This cannot be undone.')) return;
    const found = findDonationByRowId(rowId);
    if (!found) return;
    found.donor.donations.splice(found.donIdx, 1);
    saveDonors(found.donors);
    render();
  }
});

document.getElementById('donation-modal-body').addEventListener('click', function (e) {
  if (e.target.id !== 'save-status-btn') return;
  const found = findDonationByRowId(e.target.dataset.row);
  if (!found) return;
  found.donation.status = document.getElementById('edit-status-select').value;
  saveDonors(found.donors);
  donationModal.hide();
  render();
});

document.getElementById('sort-amount').addEventListener('click', function () {
  sortField = 'amount';
  sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  render();
});

document.getElementById('sort-date').addEventListener('click', function () {
  sortField = 'date';
  sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  render();
});

document.getElementById('search-input').addEventListener('input', function () { currentPage = 1; render(); });
document.getElementById('status-filter').addEventListener('change', function () { currentPage = 1; render(); });

document.getElementById('prev-page-btn').addEventListener('click', function () {
  if (currentPage > 1) { currentPage--; render(); }
});
document.getElementById('next-page-btn').addEventListener('click', function () {
  currentPage++;
  render();
});

function csvField(value) {
  const str = String(value === undefined || value === null ? '' : value);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

document.getElementById('export-csv-btn').addEventListener('click', function () {
  const rows = getFilteredSorted();
  const csvRows = [['Donor', 'Amount', 'Need', 'Method', 'Date', 'Status']];
  rows.forEach(function (r) {
    csvRows.push([r.donorName, r.amount, r.need || '', r.method || '', r.date || '', r.status || '']);
  });
  const csv = csvRows.map(function (row) { return row.map(csvField).join(','); }).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'donations.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

render();
