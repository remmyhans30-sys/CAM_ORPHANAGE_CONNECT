if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

function loadReports() {
  return JSON.parse(localStorage.getItem('reports') || '[]');
}

function saveReports(reports) {
  localStorage.setItem('reports', JSON.stringify(reports));
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

function accountTypeLabel(type) {
  if (type === 'donor') return 'Donor';
  if (type === 'orphanage') return 'Orphanage';
  if (type === 'partner') return 'Partner Org';
  return type;
}

function profileUrlFor(report) {
  if (report.reportedAccountType === 'donor') return 'donor-profile.html?id=' + encodeURIComponent(report.reportedAccountId);
  if (report.reportedAccountType === 'orphanage') return 'verification.html?id=' + encodeURIComponent(report.reportedAccountId);
  if (report.reportedAccountType === 'partner') return 'partner-profile.html?id=' + encodeURIComponent(report.reportedAccountId);
  return '#';
}

function currentAdmin() {
  return localStorage.getItem('currentAdminEmail') || 'Unknown admin';
}

const reportModalEl = document.getElementById('report-modal');
const reportModal = new bootstrap.Modal(reportModalEl);
let activeReportId = null;

function render() {
  const reports = loadReports().slice().sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  const list = document.getElementById('reports-list');
  const emptyState = document.getElementById('empty-state');

  list.innerHTML = '';

  if (reports.length === 0) {
    list.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  list.classList.remove('d-none');
  emptyState.classList.add('d-none');

  list.innerHTML = reports.map(function (r) {
    const when = new Date(r.timestamp);
    const whenText = isNaN(when.getTime()) ? r.timestamp : when.toLocaleString();
    const isOpen = r.status !== 'resolved';

    return (
      '<div class="account-row-link report-row" data-report-id="' + r.id + '" style="cursor:pointer;">' +
        '<div class="account-row d-flex align-items-center gap-3 flex-wrap' + (isOpen ? ' message-unread' : '') + '">' +
          '<div class="row-avatar g' + ((r.id % 5) + 1) + '">' + initials(r.reportedAccountName) + '</div>' +
          '<div class="flex-grow-1" style="min-width: 200px;">' +
            '<div class="d-flex align-items-center gap-2">' +
              '<strong>' + escapeHtml(r.reportedAccountName) + '</strong>' +
              '<span class="tier-tag tier-friend">' + escapeHtml(accountTypeLabel(r.reportedAccountType)) + '</span>' +
              '<span class="fail-tag">' + escapeHtml(r.reasonCategory) + '</span>' +
            '</div>' +
            '<div class="small text-muted">Reported by ' + escapeHtml(r.reporterName || 'Anonymous') + '</div>' +
          '</div>' +
          '<div class="text-end small text-muted" style="min-width: 140px;">' +
            whenText +
          '</div>' +
          '<span class="status-badge status-' + (isOpen ? 'pending' : 'verified') + '">' + (isOpen ? 'Open' : 'Resolved') + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function buildModalBody(report) {
  const when = new Date(report.timestamp);
  const whenText = isNaN(when.getTime()) ? report.timestamp : when.toLocaleString();

  return (
    '<dl class="row mb-3 small">' +
      '<dt class="col-4">Reported account</dt><dd class="col-8">' + escapeHtml(report.reportedAccountName) + ' (' + escapeHtml(accountTypeLabel(report.reportedAccountType)) + ')</dd>' +
      '<dt class="col-4">Reported by</dt><dd class="col-8">' + escapeHtml(report.reporterName || 'Anonymous') + (report.reporterAccountType ? ' (' + escapeHtml(accountTypeLabel(report.reporterAccountType)) + ')' : '') + '</dd>' +
      '<dt class="col-4">Reason</dt><dd class="col-8">' + escapeHtml(report.reasonCategory) + '</dd>' +
      '<dt class="col-4">Filed</dt><dd class="col-8">' + escapeHtml(whenText) + '</dd>' +
    '</dl>' +
    '<p class="small mb-3"><a href="' + profileUrlFor(report) + '">View reported account profile</a></p>' +
    '<div class="profile-info-note mb-3">' + escapeHtml(report.details) + '</div>' +
    (report.status === 'resolved'
      ? '<div class="profile-info-note profile-info-note-danger mb-0" style="background-color: rgba(95,167,154,0.15); color: var(--teal);">Resolved' + (report.resolution ? ': ' + escapeHtml(report.resolution) : '') + '</div>'
      : '<div class="d-flex flex-wrap gap-2">' +
          '<button type="button" class="btn btn-admin-danger btn-sm" id="flag-reported-account-btn">Flag reported account</button>' +
          '<button type="button" class="btn btn-admin-outline btn-sm" id="dismiss-report-btn">Dismiss report</button>' +
          '<button type="button" class="btn btn-admin-primary btn-sm" id="resolve-report-btn">Mark resolved</button>' +
        '</div>')
  );
}

function openReport(id) {
  const reports = loadReports();
  const report = reports.find(function (r) { return r.id === id; });
  if (!report) return;

  activeReportId = id;
  document.getElementById('report-modal-title').textContent = 'Report: ' + report.reportedAccountName;
  document.getElementById('report-modal-body').innerHTML = buildModalBody(report);
  reportModal.show();
}

function flagAccount(type, accountId, action) {
  const storageKey = type === 'donor' ? 'donors' : (type === 'orphanage' ? 'orphanages' : 'partners');
  const accounts = JSON.parse(localStorage.getItem(storageKey) || '[]');
  const account = accounts.find(function (a) { return String(a.id) === String(accountId); });
  if (!account) return;

  if (type === 'orphanage') {
    account.flagged = true;
    account.flagReason = 'Flagged from a user report.';
  } else {
    account.status = 'flagged';
    account.flagReason = 'Flagged from a user report.';
  }

  account.activityLog = account.activityLog || [];
  account.activityLog.push({ reviewer: currentAdmin(), action: action, timestamp: new Date().toISOString() });

  localStorage.setItem(storageKey, JSON.stringify(accounts));
}

document.getElementById('reports-list').addEventListener('click', function (e) {
  const row = e.target.closest('.report-row');
  if (!row) return;
  openReport(Number(row.dataset.reportId));
});

document.getElementById('report-modal-body').addEventListener('click', function (e) {
  if (activeReportId === null) return;
  const reports = loadReports();
  const report = reports.find(function (r) { return r.id === activeReportId; });
  if (!report) return;

  if (e.target.id === 'flag-reported-account-btn') {
    flagAccount(report.reportedAccountType, report.reportedAccountId, 'Flagged from a user report');
    report.status = 'resolved';
    report.resolution = 'Account flagged.';
    saveReports(reports);
    render();
    document.getElementById('report-modal-body').innerHTML = buildModalBody(report);
  }

  if (e.target.id === 'dismiss-report-btn') {
    report.status = 'resolved';
    report.resolution = 'Dismissed, no action taken.';
    saveReports(reports);
    render();
    document.getElementById('report-modal-body').innerHTML = buildModalBody(report);
  }

  if (e.target.id === 'resolve-report-btn') {
    const note = prompt('Resolution note (what did you do about this report)?');
    if (note === null) return;
    report.status = 'resolved';
    report.resolution = note.trim() || 'Resolved.';
    saveReports(reports);
    render();
    document.getElementById('report-modal-body').innerHTML = buildModalBody(report);
  }
});

function seedSampleData() {
  const sampleReports = [
    {
      id: 1,
      reporterName: 'Ngozi Adeyemi',
      reporterAccountType: 'donor',
      reportedAccountType: 'partner',
      reportedAccountId: 2,
      reportedAccountName: 'Douala Business Alliance',
      reasonCategory: 'Fraud',
      details: 'This organization contacted me directly asking to send donations to a personal mobile money number instead of through the platform.',
      timestamp: '2026-09-03T16:00:00.000Z',
      status: 'open',
    },
    {
      id: 2,
      reporterName: 'Anonymous',
      reporterAccountType: '',
      reportedAccountType: 'orphanage',
      reportedAccountId: 4,
      reportedAccountName: 'Orphelinat Bethel',
      reasonCategory: 'Safeguarding concern',
      details: 'A visitor noticed the published photos show children\'s faces and full names, which seems unsafe.',
      timestamp: '2026-08-15T10:30:00.000Z',
      status: 'resolved',
      resolution: 'Reviewed with orphanage; blur-faces setting enabled on their profile.',
    },
  ];

  saveReports(sampleReports);
  render();
}

function clearAllData() {
  if (!confirm('Clear all reports? This cannot be undone.')) return;
  localStorage.removeItem('reports');
  render();
}

document.getElementById('seed-btn').addEventListener('click', seedSampleData);
document.getElementById('clear-btn').addEventListener('click', clearAllData);

function formatFcfa(amount) {
  const currency = JSON.parse(localStorage.getItem('orgSettings') || '{}').currency || 'FCFA';
  const num = Number(amount || 0).toLocaleString('en-US');
  if (currency === 'USD') return '$' + num;
  if (currency === 'EUR') return '€' + num;
  return num + ' FCFA';
}

let generatedReportRows = [];

function generateDonationsReport() {
  const donors = JSON.parse(localStorage.getItem('donors') || '[]');
  const rows = [];

  donors.forEach(function (d) {
    (d.donations || []).forEach(function (don) {
      rows.push({ donor: d.name, amount: don.amount, need: don.need, method: don.method, date: don.date, status: don.status });
    });
  });

  const totalAmount = rows.reduce(function (sum, r) { return sum + Number(r.amount || 0); }, 0);
  const completed = rows.filter(function (r) { return r.status === 'completed'; }).length;
  const refunded = rows.filter(function (r) { return r.status === 'refunded'; }).length;

  generatedReportRows = [['Donor', 'Amount', 'Need', 'Method', 'Date', 'Status']].concat(
    rows.map(function (r) { return [r.donor, r.amount, r.need || '', r.method || '', r.date || '', r.status || '']; })
  );

  document.getElementById('generated-report-output').innerHTML =
    '<h3 class="h6">Donations Report</h3>' +
    '<p class="small text-muted">Generated ' + new Date().toLocaleString() + '</p>' +
    '<p class="mb-3"><strong>' + rows.length + '</strong> donations totaling <strong>' + formatFcfa(totalAmount) + '</strong> &mdash; ' + completed + ' completed, ' + refunded + ' refunded.</p>' +
    '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Donor</th><th>Amount</th><th>Need</th><th>Method</th><th>Date</th><th>Status</th></tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr><td>' + escapeHtml(r.donor) + '</td><td>' + formatFcfa(r.amount) + '</td><td>' + escapeHtml(r.need || '') + '</td><td>' + escapeHtml(r.method || '') + '</td><td>' + escapeHtml(r.date || '') + '</td><td>' + escapeHtml(r.status || '') + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

function generateProgramsReport() {
  const programs = JSON.parse(localStorage.getItem('programs') || '[]');
  const totalGoal = programs.reduce(function (sum, p) { return sum + Number(p.fundingGoal || 0); }, 0);
  const totalRaised = programs.reduce(function (sum, p) { return sum + Number(p.amountRaised || 0); }, 0);
  const active = programs.filter(function (p) { return p.status === 'active'; }).length;
  const completed = programs.filter(function (p) { return p.status === 'completed'; }).length;

  generatedReportRows = [['Program', 'Category', 'Status', 'Funding Goal', 'Amount Raised']].concat(
    programs.map(function (p) { return [p.name, p.category, p.status, p.fundingGoal || 0, p.amountRaised || 0]; })
  );

  document.getElementById('generated-report-output').innerHTML =
    '<h3 class="h6">Programs Report</h3>' +
    '<p class="small text-muted">Generated ' + new Date().toLocaleString() + '</p>' +
    '<p class="mb-3"><strong>' + programs.length + '</strong> programs (' + active + ' active, ' + completed + ' completed) &mdash; ' + formatFcfa(totalRaised) + ' raised of ' + formatFcfa(totalGoal) + ' goal.</p>' +
    '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Program</th><th>Category</th><th>Status</th><th>Funding Goal</th><th>Amount Raised</th></tr></thead><tbody>' +
    programs.map(function (p) {
      return '<tr><td>' + escapeHtml(p.name) + '</td><td>' + escapeHtml(p.category) + '</td><td>' + escapeHtml(p.status) + '</td><td>' + formatFcfa(p.fundingGoal) + '</td><td>' + formatFcfa(p.amountRaised) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

function generateNeedsReport() {
  const orphanages = JSON.parse(localStorage.getItem('orphanages') || '[]');
  const needs = JSON.parse(localStorage.getItem('needs') || '[]');

  const totalGoal = needs.reduce(function (sum, n) { return sum + Number(n.goal || 0); }, 0);
  const totalRaised = needs.reduce(function (sum, n) { return sum + Number(n.raised || 0); }, 0);
  const open = needs.filter(function (n) { return Number(n.raised || 0) < Number(n.goal || 0); }).length;
  const funded = needs.length - open;

  const rows = needs.map(function (n) {
    const orphanage = orphanages.find(function (o) { return String(o.id) === String(n.orphanageId); });
    const percent = n.goal > 0 ? Math.min(100, Math.round((n.raised / n.goal) * 100)) : 0;
    return { title: n.title, orphanage: orphanage ? orphanage.name : 'Unknown', raised: n.raised || 0, goal: n.goal || 0, percent: percent };
  });

  generatedReportRows = [['Need', 'Orphanage', 'Amount Raised', 'Goal', 'Percent Funded']].concat(
    rows.map(function (r) { return [r.title, r.orphanage, r.raised, r.goal, r.percent + '%']; })
  );

  document.getElementById('generated-report-output').innerHTML =
    '<h3 class="h6">Needs Report</h3>' +
    '<p class="small text-muted">Generated ' + new Date().toLocaleString() + '</p>' +
    '<p class="mb-3"><strong>' + needs.length + '</strong> needs (' + open + ' open, ' + funded + ' funded) &mdash; ' + formatFcfa(totalRaised) + ' raised of ' + formatFcfa(totalGoal) + ' goal.</p>' +
    '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Need</th><th>Orphanage</th><th>Amount Raised</th><th>Goal</th><th>Percent Funded</th></tr></thead><tbody>' +
    rows.map(function (r) {
      return '<tr><td>' + escapeHtml(r.title) + '</td><td>' + escapeHtml(r.orphanage) + '</td><td>' + formatFcfa(r.raised) + '</td><td>' + formatFcfa(r.goal) + '</td><td>' + r.percent + '%</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

document.getElementById('generate-report-btn').addEventListener('click', function () {
  const type = document.getElementById('report-type-select').value;
  if (type === 'donations') generateDonationsReport();
  else if (type === 'needs') generateNeedsReport();
  else generateProgramsReport();

  document.getElementById('print-report-btn').classList.remove('d-none');
  document.getElementById('export-report-btn').classList.remove('d-none');
});

document.getElementById('print-report-btn').addEventListener('click', function () {
  window.print();
});

function csvField(value) {
  const str = String(value === undefined || value === null ? '' : value);
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

document.getElementById('export-report-btn').addEventListener('click', function () {
  const csv = generatedReportRows.map(function (row) { return row.map(csvField).join(','); }).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = document.getElementById('report-type-select').value + '-report.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
});

render();
