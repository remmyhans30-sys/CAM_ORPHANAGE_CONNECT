if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }
if (localStorage.getItem('currentAdminRole') === 'Content Manager') {
  alert('Your role (Content Manager) does not have access to Finance.');
  window.location.href = 'dashboard.html';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatFcfa(amount) {
  const currency = JSON.parse(localStorage.getItem('orgSettings') || '{}').currency || 'FCFA';
  const num = Number(amount || 0).toLocaleString('en-US');
  if (currency === 'USD') return '$' + num;
  if (currency === 'EUR') return '€' + num;
  return num + ' FCFA';
}

const orphanages = JSON.parse(localStorage.getItem('orphanages') || '[]');
const needs = JSON.parse(localStorage.getItem('needs') || '[]');

const groupsEl = document.getElementById('finance-groups');
const emptyState = document.getElementById('empty-state');

if (needs.length === 0) {
  emptyState.classList.remove('d-none');
} else {
  orphanages.forEach(function (orphanage) {
    const orphanageNeeds = needs.filter(function (n) { return String(n.orphanageId) === String(orphanage.id); });
    if (orphanageNeeds.length === 0) return;

    const totalRaised = orphanageNeeds.reduce(function (sum, n) { return sum + Number(n.raised || 0); }, 0);
    const totalGoal = orphanageNeeds.reduce(function (sum, n) { return sum + Number(n.goal || 0); }, 0);

    const group = document.createElement('div');
    group.className = 'card card-admin p-4';

    const needRows = orphanageNeeds.map(function (need) {
      const percent = need.goal > 0 ? Math.min(100, Math.round((need.raised / need.goal) * 100)) : 0;
      return (
        '<div class="finance-need-row">' +
          '<div class="d-flex justify-content-between mb-1">' +
            '<span>' + escapeHtml(need.title) + '</span>' +
            '<span class="text-muted small">' + formatFcfa(need.raised) + ' / ' + formatFcfa(need.goal) + '</span>' +
          '</div>' +
          '<div class="progress finance-progress">' +
            '<div class="progress-bar" style="width: ' + percent + '%"></div>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    group.innerHTML =
      '<div class="d-flex justify-content-between align-items-start mb-2">' +
        '<h2 class="h5 mb-0">' + escapeHtml(orphanage.name) + '</h2>' +
        '<span class="text-muted small">' + formatFcfa(totalRaised) + ' raised of ' + formatFcfa(totalGoal) + '</span>' +
      '</div>' +
      needRows;

    groupsEl.appendChild(group);
  });

  if (groupsEl.children.length === 0) {
    emptyState.classList.remove('d-none');
  }
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
  const rows = [['Orphanage', 'Need', 'Raised', 'Goal', 'Percent']];

  needs.forEach(function (need) {
    const orphanage = orphanages.find(function (o) { return String(o.id) === String(need.orphanageId); });
    const percent = need.goal > 0 ? Math.round((need.raised / need.goal) * 100) : 0;
    rows.push([
      orphanage ? orphanage.name : 'Unknown',
      need.title,
      need.raised || 0,
      need.goal || 0,
      percent + '%',
    ]);
  });

  downloadCsv('donations-by-orphanage.csv', rows);
});
