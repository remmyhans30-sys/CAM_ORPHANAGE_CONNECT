if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

let reportsCache = [];
function loadReports() { return reportsCache; }
function fetchReportsFromApi() {
  return apiRequest('/reports').then(function (data) {
    reportsCache = data.reports;
  });
}
function saveReport(report) {
  return apiRequest('/reports/' + report.id, { method: 'PUT', body: report })
    .then(function (data) {
      const idx = reportsCache.findIndex(function (r) { return r.id === report.id; });
      if (idx !== -1) reportsCache[idx] = data.report;
      return data.report;
    })
    .catch(function (err) {
      alert('Could not save changes to the server: ' + err.message);
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
  const allReports = loadReports().slice().sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
  const list = document.getElementById('reports-list');
  const emptyState = document.getElementById('empty-state');
  const filterEmptyState = document.getElementById('filter-empty-state');

  list.innerHTML = '';

  if (allReports.length === 0) {
    list.classList.add('d-none');
    filterEmptyState.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  emptyState.classList.add('d-none');

  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;

  const reports = allReports.filter(function (r) {
    const matchesSearch = !search ||
      (r.reportedAccountName || '').toLowerCase().includes(search) ||
      (r.reporterName || '').toLowerCase().includes(search);
    const isOpen = r.status !== 'resolved';
    const matchesStatus = statusFilter === 'all' || isOpen;
    return matchesSearch && matchesStatus;
  });

  if (reports.length === 0) {
    list.classList.add('d-none');
    filterEmptyState.classList.remove('d-none');
    return;
  }

  list.classList.remove('d-none');
  filterEmptyState.classList.add('d-none');

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
  const apiPath = type === 'orphanage' ? '/orphanages/' : (type === 'donor' ? '/donors/' : '/partners/');

  return apiRequest(apiPath + accountId).then(function (data) {
    const account = data.orphanage || data.donor || data.partner;
    if (type === 'orphanage') {
      account.flagged = true;
    } else {
      account.status = 'flagged';
    }
    account.flagReason = 'Flagged from a user report.';
    account.activityLog = account.activityLog || [];
    account.activityLog.push({ reviewer: currentAdmin(), action: action, timestamp: new Date().toISOString() });

    return apiRequest(apiPath + accountId, { method: 'PUT', body: account });
  });
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
    flagAccount(report.reportedAccountType, report.reportedAccountId, 'Flagged from a user report')
      .then(function () {
        report.status = 'resolved';
        report.resolution = 'Account flagged.';
        document.getElementById('report-modal-body').innerHTML = buildModalBody(report);
        return saveReport(report);
      })
      .then(render)
      .catch(function (err) {
        alert('Could not flag account: ' + err.message);
      });
  }

  if (e.target.id === 'dismiss-report-btn') {
    report.status = 'resolved';
    report.resolution = 'Dismissed, no action taken.';
    document.getElementById('report-modal-body').innerHTML = buildModalBody(report);
    saveReport(report).then(render);
  }

  if (e.target.id === 'resolve-report-btn') {
    const note = prompt('Resolution note (what did you do about this report)?');
    if (note === null) return;
    report.status = 'resolved';
    report.resolution = note.trim() || 'Resolved.';
    document.getElementById('report-modal-body').innerHTML = buildModalBody(report);
    saveReport(report).then(render);
  }
});

function seedSampleData() {
  Promise.all([apiRequest('/partners'), apiRequest('/orphanages')])
    .then(function (results) {
      const partner = results[0].partners[0];
      const orphanage = results[1].orphanages[0];

      const sampleReports = [];

      if (partner) {
        sampleReports.push({
          reporterName: 'Ngozi Adeyemi',
          reporterAccountType: 'donor',
          reportedAccountType: 'partner',
          reportedAccountId: partner.id,
          reportedAccountName: partner.name,
          reasonCategory: 'Fraud',
          details: 'This organization contacted me directly asking to send donations to a personal mobile money number instead of through the platform.',
          timestamp: '2026-09-03T16:00:00.000Z',
          status: 'open',
        });
      }

      if (orphanage) {
        sampleReports.push({
          reporterName: 'Anonymous',
          reporterAccountType: '',
          reportedAccountType: 'orphanage',
          reportedAccountId: orphanage.id,
          reportedAccountName: orphanage.name,
          reasonCategory: 'Safeguarding concern',
          details: 'A visitor noticed the published photos show children\'s faces and full names, which seems unsafe.',
          timestamp: '2026-08-15T10:30:00.000Z',
          status: 'resolved',
          resolution: 'Reviewed with orphanage; blur-faces setting enabled on their profile.',
        });
      }

      if (sampleReports.length === 0) {
        alert('Load sample data on Partner Orgs or Orphanages first, then load sample reports.');
        return Promise.resolve();
      }

      return Promise.all(sampleReports.map(function (r) {
        return apiRequest('/reports', { method: 'POST', body: r });
      }));
    })
    .then(fetchReportsFromApi)
    .then(render)
    .catch(function (err) {
      alert('Could not load sample data: ' + err.message);
    });
}

function clearAllData() {
  if (!confirm('Clear all reports? This cannot be undone.')) return;

  Promise.all(reportsCache.map(function (r) {
    return apiRequest('/reports/' + r.id, { method: 'DELETE' });
  }))
    .then(fetchReportsFromApi)
    .then(render)
    .catch(function (err) {
      alert('Could not clear data: ' + err.message);
    });
}

document.getElementById('seed-btn').addEventListener('click', seedSampleData);
document.getElementById('clear-btn').addEventListener('click', clearAllData);
document.getElementById('search-input').addEventListener('input', render);
document.getElementById('status-filter').addEventListener('change', render);

function formatFcfa(amount) {
  const currency = JSON.parse(localStorage.getItem('orgSettings') || '{}').currency || 'FCFA';
  const num = Number(amount || 0).toLocaleString('en-US');
  if (currency === 'USD') return '$' + num;
  if (currency === 'EUR') return '€' + num;
  return num + ' FCFA';
}

let generatedReportRows = [];

function generateDonationsReport() {
  return apiRequest('/donors').then(function (data) {
    buildDonationsReport(data.donors);
  });
}

function buildDonationsReport(donors) {
  const rows = [];

  donors.forEach(function (d) {
    (d.donations || []).forEach(function (don) {
      rows.push({
        donor: d.name,
        type: don.type || 'money',
        amount: don.amount,
        itemDescription: don.itemDescription,
        need: don.need,
        method: don.method || don.deliveryMethod,
        date: don.date,
        status: don.status,
      });
    });
  });

  const moneyRows = rows.filter(function (r) { return r.type !== 'item'; });
  const itemRows = rows.filter(function (r) { return r.type === 'item'; });
  const totalAmount = moneyRows.reduce(function (sum, r) { return sum + Number(r.amount || 0); }, 0);
  const completed = rows.filter(function (r) { return r.status === 'completed'; }).length;
  const refunded = rows.filter(function (r) { return r.status === 'refunded'; }).length;

  generatedReportRows = [['Donor', 'Type', 'Amount / Item', 'Need', 'Method', 'Date', 'Status']].concat(
    rows.map(function (r) {
      const detail = r.type === 'item' ? (r.itemDescription || '') : r.amount;
      return [r.donor, r.type === 'item' ? 'Item' : 'Money', detail, r.need || '', r.method || '', r.date || '', r.status || ''];
    })
  );

  document.getElementById('generated-report-output').innerHTML =
    '<h3 class="h6">Donations Report</h3>' +
    '<p class="small text-muted">Generated ' + new Date().toLocaleString() + '</p>' +
    '<p class="mb-3"><strong>' + rows.length + '</strong> donations (' + moneyRows.length + ' money totaling ' + formatFcfa(totalAmount) + ', ' + itemRows.length + ' item) &mdash; ' + completed + ' completed/delivered, ' + refunded + ' refunded/returned.</p>' +
    '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Donor</th><th>Type</th><th>Amount / Item</th><th>Need</th><th>Method</th><th>Date</th><th>Status</th></tr></thead><tbody>' +
    rows.map(function (r) {
      const detail = r.type === 'item' ? escapeHtml(r.itemDescription || '') : formatFcfa(r.amount);
      return '<tr><td>' + escapeHtml(r.donor) + '</td><td>' + (r.type === 'item' ? 'Item' : 'Money') + '</td><td>' + detail + '</td><td>' + escapeHtml(r.need || '') + '</td><td>' + escapeHtml(r.method || '') + '</td><td>' + escapeHtml(r.date || '') + '</td><td>' + escapeHtml(r.status || '') + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

function generateProgramsReport() {
  return apiRequest('/programs').then(function (data) {
    buildProgramsReport(data.programs);
  });
}

function buildProgramsReport(programs) {
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
  return Promise.all([apiRequest('/orphanages'), apiRequest('/needs')]).then(function (results) {
    buildNeedsReport(results[0].orphanages, results[1].needs);
  });
}

function buildNeedsReport(orphanages, needs) {
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

function generateDonorsReport() {
  return apiRequest('/donors').then(function (data) {
    buildDonorsReport(data.donors);
  });
}

function buildDonorsReport(donors) {
  const totalGiven = donors.reduce(function (sum, d) { return sum + Number(d.totalGiven || 0); }, 0);
  const active = donors.filter(function (d) { return d.status !== 'flagged'; }).length;
  const flagged = donors.filter(function (d) { return d.status === 'flagged'; }).length;

  generatedReportRows = [['Name', 'Email', 'Status', 'Join Date', 'Total Given', 'Donations Count']].concat(
    donors.map(function (d) { return [d.name, d.email || '', d.status, d.joinDate || '', d.totalGiven || 0, d.donationsCount || 0]; })
  );

  document.getElementById('generated-report-output').innerHTML =
    '<h3 class="h6">Donors Report</h3>' +
    '<p class="small text-muted">Generated ' + new Date().toLocaleString() + '</p>' +
    '<p class="mb-3"><strong>' + donors.length + '</strong> donors (' + active + ' active, ' + flagged + ' flagged) &mdash; ' + formatFcfa(totalGiven) + ' given in total.</p>' +
    '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Join Date</th><th>Total Given</th><th>Donations</th></tr></thead><tbody>' +
    donors.map(function (d) {
      return '<tr><td>' + escapeHtml(d.name) + '</td><td>' + escapeHtml(d.email || '') + '</td><td>' + escapeHtml(d.status) + '</td><td>' + escapeHtml(d.joinDate || '') + '</td><td>' + formatFcfa(d.totalGiven) + '</td><td>' + (d.donationsCount || 0) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

function generatePartnersReport() {
  return apiRequest('/partners').then(function (data) {
    buildPartnersReport(data.partners);
  });
}

function buildPartnersReport(partners) {
  const totalContributed = partners.reduce(function (sum, p) { return sum + Number(p.totalContributed || 0); }, 0);
  const verified = partners.filter(function (p) { return p.verificationStatus === 'verified'; }).length;
  const pending = partners.filter(function (p) { return p.verificationStatus === 'pending'; }).length;

  generatedReportRows = [['Name', 'Contact', 'Country', 'Org Type', 'Verification Status', 'Total Contributed']].concat(
    partners.map(function (p) { return [p.name, p.contactName || '', p.country || '', p.orgType || '', p.verificationStatus, p.totalContributed || 0]; })
  );

  document.getElementById('generated-report-output').innerHTML =
    '<h3 class="h6">Partner Organizations Report</h3>' +
    '<p class="small text-muted">Generated ' + new Date().toLocaleString() + '</p>' +
    '<p class="mb-3"><strong>' + partners.length + '</strong> partner organizations (' + verified + ' verified, ' + pending + ' pending) &mdash; ' + formatFcfa(totalContributed) + ' contributed in total.</p>' +
    '<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Name</th><th>Contact</th><th>Country</th><th>Org Type</th><th>Status</th><th>Total Contributed</th></tr></thead><tbody>' +
    partners.map(function (p) {
      return '<tr><td>' + escapeHtml(p.name) + '</td><td>' + escapeHtml(p.contactName || '') + '</td><td>' + escapeHtml(p.country || '') + '</td><td>' + escapeHtml(p.orgType || '') + '</td><td>' + escapeHtml(p.verificationStatus) + '</td><td>' + formatFcfa(p.totalContributed) + '</td></tr>';
    }).join('') +
    '</tbody></table></div>';
}

document.getElementById('generate-report-btn').addEventListener('click', function () {
  const type = document.getElementById('report-type-select').value;
  let result;
  if (type === 'donations') result = generateDonationsReport();
  else if (type === 'needs') result = generateNeedsReport();
  else if (type === 'donors') result = generateDonorsReport();
  else if (type === 'partners') result = generatePartnersReport();
  else result = generateProgramsReport();

  Promise.resolve(result)
    .then(function () {
      document.getElementById('print-report-btn').classList.remove('d-none');
      document.getElementById('export-report-btn').classList.remove('d-none');
    })
    .catch(function (err) {
      alert('Could not generate report: ' + err.message);
    });
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

fetchReportsFromApi()
  .then(render)
  .catch(function (err) {
    document.getElementById('empty-state').textContent = 'Could not load reports from the server: ' + err.message;
    document.getElementById('empty-state').classList.remove('d-none');
  });
