if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function statusLabel(status) {
  if (status === 'needs-info') return 'Needs info';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function accountTypeLabel(type) {
  if (type === 'donor') return 'Donor';
  if (type === 'orphanage') return 'Orphanage';
  if (type === 'partner') return 'Partner Org';
  return type;
}

function collectEntries() {
  const orphanages = JSON.parse(localStorage.getItem('orphanages') || '[]');
  const donors = JSON.parse(localStorage.getItem('donors') || '[]');
  const partners = JSON.parse(localStorage.getItem('partners') || '[]');

  const entries = [];

  orphanages.forEach(function (o) {
    (o.activityLog || []).forEach(function (e) {
      entries.push({
        accountName: o.name,
        accountType: 'orphanage',
        action: e.tier ? statusLabel(e.tier) : e.action,
        reviewer: e.reviewer,
        timestamp: e.timestamp,
      });
    });
  });

  donors.forEach(function (d) {
    (d.activityLog || []).forEach(function (e) {
      entries.push({
        accountName: d.name,
        accountType: 'donor',
        action: e.action,
        reviewer: e.reviewer,
        timestamp: e.timestamp,
      });
    });
  });

  partners.forEach(function (p) {
    (p.activityLog || []).forEach(function (e) {
      entries.push({
        accountName: p.name,
        accountType: 'partner',
        action: e.action,
        reviewer: e.reviewer,
        timestamp: e.timestamp,
      });
    });
  });

  return entries;
}

let currentEntries = [];

function render() {
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const typeFilter = document.getElementById('type-filter').value;

  let entries = collectEntries();

  entries = entries.filter(function (e) {
    const matchesType = typeFilter === 'all' || e.accountType === typeFilter;
    const matchesSearch = !search ||
      (e.accountName || '').toLowerCase().includes(search) ||
      (e.action || '').toLowerCase().includes(search);
    return matchesType && matchesSearch;
  });

  entries.sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  currentEntries = entries;

  const tbody = document.getElementById('log-tbody');
  const emptyState = document.getElementById('empty-state');
  const card = tbody.closest('.card');

  if (entries.length === 0) {
    card.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  card.classList.remove('d-none');
  emptyState.classList.add('d-none');

  tbody.innerHTML = entries.map(function (e) {
    const when = new Date(e.timestamp);
    const whenText = isNaN(when.getTime()) ? e.timestamp : when.toLocaleString();
    return (
      '<tr>' +
        '<td>' + escapeHtml(whenText) + '</td>' +
        '<td>' + escapeHtml(e.accountName) + '</td>' +
        '<td><span class="tier-tag tier-friend">' + escapeHtml(accountTypeLabel(e.accountType)) + '</span></td>' +
        '<td>' + escapeHtml(e.action) + '</td>' +
        '<td>' + escapeHtml(e.reviewer) + '</td>' +
      '</tr>'
    );
  }).join('');
}

document.getElementById('search-input').addEventListener('input', render);
document.getElementById('type-filter').addEventListener('change', render);

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
  const rows = [['Date/time', 'Account', 'Type', 'Action', 'By']];
  currentEntries.forEach(function (e) {
    rows.push([e.timestamp, e.accountName, accountTypeLabel(e.accountType), e.action, e.reviewer]);
  });
  downloadCsv('activity-log.csv', rows);
});

render();
