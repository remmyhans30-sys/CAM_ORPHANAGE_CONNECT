if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

function loadOrphanages() { return JSON.parse(localStorage.getItem('orphanages') || '[]'); }
function loadDonors() { return JSON.parse(localStorage.getItem('donors') || '[]'); }
function loadPartners() { return JSON.parse(localStorage.getItem('partners') || '[]'); }
function loadMessages() { return JSON.parse(localStorage.getItem('messages') || '[]'); }
function loadReports() { return JSON.parse(localStorage.getItem('reports') || '[]'); }
function loadPrograms() { return JSON.parse(localStorage.getItem('programs') || '[]'); }
function loadNeeds() { return JSON.parse(localStorage.getItem('needs') || '[]'); }

function initials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
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

function statusLabel(status) {
  if (status === 'needs-info') return 'Needs info';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function renderTopbar() {
  const messages = loadMessages();
  const reports = loadReports();
  const notif = JSON.parse(localStorage.getItem('notifSettings') || '{}');
  const messageAlertsOn = notif.messages !== false;

  const unreadMessages = messageAlertsOn ? messages.filter(function (m) { return !m.read; }).length : 0;
  const openReports = reports.filter(function (r) { return r.status !== 'resolved'; }).length;

  document.getElementById('messages-badge').textContent = unreadMessages || '';
  document.getElementById('reports-badge').textContent = openReports || '';

  const bellTotal = unreadMessages + openReports;
  document.getElementById('bell-badge').textContent = bellTotal || '';

  const email = localStorage.getItem('currentAdminEmail');
  const displayName = localStorage.getItem('currentAdminDisplayName');
  document.getElementById('admin-email-label').textContent = displayName || email || 'Admin';
  document.getElementById('admin-avatar').textContent = initials(displayName || email || 'Admin');
}

function applyRolePermissions() {
  const role = localStorage.getItem('currentAdminRole') || 'Super Admin';
  if (role === 'Content Manager') {
    const financeLink = document.getElementById('finance-nav-link');
    if (financeLink) financeLink.style.display = 'none';
    const donationsLink = document.getElementById('donations-nav-link');
    if (donationsLink) donationsLink.style.display = 'none';
  }
  if (role !== 'Super Admin' && role !== 'Administrator') {
    const usersLink = document.getElementById('users-nav-link');
    if (usersLink) usersLink.style.display = 'none';
    const settingsLink = document.getElementById('settings-nav-link');
    if (settingsLink) settingsLink.style.display = 'none';
  }
}

function renderStatCards() {
  const orphanages = loadOrphanages();
  const donors = loadDonors();
  const partners = loadPartners();

  const totalChildren = orphanages.reduce(function (sum, o) { return sum + Number(o.childrenCount || 0); }, 0);
  const totalDonations = donors.reduce(function (sum, d) { return sum + Number(d.totalGiven || 0); }, 0);

  const cards = [
    { icon: 'bi-heart', color: 'teal', value: String(totalChildren), label: 'Children Served', link: 'verification.html', linkLabel: 'View all orphanages' },
    { icon: 'bi-cash-coin', color: 'coral', value: formatFcfa(totalDonations), label: 'Total Donations', link: 'finance.html', linkLabel: 'View all donations' },
    { icon: 'bi-people', color: 'purple', value: String(donors.length), label: 'Donors', link: 'donors.html', linkLabel: 'View all donors' },
    { icon: 'bi-building', color: 'gold', value: String(partners.length), label: 'Partner Orgs', link: 'partners.html', linkLabel: 'View all partners' },
  ];

  document.getElementById('stat-cards').innerHTML = cards.map(function (c) {
    return (
      '<div class="col-6 col-lg-3">' +
        '<div class="dashboard-stat-card">' +
          '<div class="dashboard-stat-icon ' + c.color + '"><i class="bi ' + c.icon + '"></i></div>' +
          '<div>' +
            '<div class="dashboard-stat-value">' + escapeHtml(c.value) + '</div>' +
            '<div class="dashboard-stat-label">' + escapeHtml(c.label) + '</div>' +
            '<a href="' + c.link + '" class="dashboard-stat-link">' + escapeHtml(c.linkLabel) + '</a>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function renderRecentDonations() {
  const donors = loadDonors();
  const list = document.getElementById('recent-donations-list');

  const all = [];
  donors.forEach(function (d) {
    (d.donations || []).forEach(function (donation) {
      all.push({ donorName: d.name, amount: donation.amount, date: donation.date });
    });
  });

  all.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
  const recent = all.slice(0, 5);

  if (recent.length === 0) {
    list.innerHTML = '<p class="text-muted small mb-0">No donations recorded yet.</p>';
    return;
  }

  list.innerHTML = recent.map(function (d) {
    return (
      '<div class="d-flex justify-content-between align-items-center py-2 border-bottom">' +
        '<span class="small">' + escapeHtml(d.donorName) + '</span>' +
        '<span class="small fw-bold">' + formatFcfa(d.amount) + '</span>' +
        '<span class="small text-muted">' + escapeHtml(d.date) + '</span>' +
      '</div>'
    );
  }).join('');
}

function lastActivityTimestamp(msg) {
  const replies = msg.replies || [];
  if (replies.length === 0) return msg.timestamp;
  const lastReply = replies[replies.length - 1];
  return new Date(lastReply.timestamp) > new Date(msg.timestamp) ? lastReply.timestamp : msg.timestamp;
}

function renderRecentMessages() {
  const messages = loadMessages().slice().sort(function (a, b) { return new Date(lastActivityTimestamp(b)) - new Date(lastActivityTimestamp(a)); });
  const list = document.getElementById('recent-messages-list');
  const recent = messages.slice(0, 4);

  if (recent.length === 0) {
    list.innerHTML = '<p class="text-muted small mb-0">No messages yet.</p>';
    return;
  }

  list.innerHTML = recent.map(function (m) {
    return (
      '<div class="d-flex justify-content-between align-items-center gap-2 py-2 border-bottom">' +
        '<div class="d-flex align-items-center gap-2">' +
          '<div class="row-avatar g' + ((m.id % 5) + 1) + '" style="width:32px;height:32px;font-size:0.7rem;">' + initials(m.senderName) + '</div>' +
          '<div>' +
            '<div><strong class="small">' + escapeHtml(m.senderName) + '</strong></div>' +
            '<div class="small text-muted">' + escapeHtml(m.subject) + '</div>' +
          '</div>' +
        '</div>' +
        (m.read ? '' : '<span class="tier-tag tier-sustainer flex-shrink-0">New</span>') +
      '</div>'
    );
  }).join('');
}

let donationsChartInstance = null;

function renderDonationsChart(range) {
  const donors = loadDonors();
  const now = new Date();
  const currentMonthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthKey = lastMonthDate.getFullYear() + '-' + String(lastMonthDate.getMonth() + 1).padStart(2, '0');
  const currentYearKey = String(now.getFullYear());
  const totals = {};

  donors.forEach(function (d) {
    (d.donations || []).forEach(function (donation) {
      const date = donation.date || '';
      if (!date) return;

      if (range === 'month') {
        if (date.slice(0, 7) !== currentMonthKey) return;
        const day = date.slice(0, 10);
        totals[day] = (totals[day] || 0) + Number(donation.amount || 0);
      } else if (range === 'lastMonth') {
        if (date.slice(0, 7) !== lastMonthKey) return;
        const day = date.slice(0, 10);
        totals[day] = (totals[day] || 0) + Number(donation.amount || 0);
      } else if (range === 'year') {
        if (date.slice(0, 4) !== currentYearKey) return;
        const month = date.slice(0, 7);
        totals[month] = (totals[month] || 0) + Number(donation.amount || 0);
      } else {
        const month = date.slice(0, 7);
        totals[month] = (totals[month] || 0) + Number(donation.amount || 0);
      }
    });
  });

  const labels = Object.keys(totals).sort();
  const values = labels.map(function (k) { return totals[k]; });

  if (donationsChartInstance) {
    donationsChartInstance.destroy();
    donationsChartInstance = null;
  }

  const canvas = document.getElementById('donations-chart');
  const card = canvas.closest('.card');
  let emptyMsg = card.querySelector('.donations-chart-empty');

  if (labels.length === 0) {
    canvas.classList.add('d-none');
    if (!emptyMsg) {
      emptyMsg = document.createElement('p');
      emptyMsg.className = 'text-muted small mb-0 donations-chart-empty';
      const emptyMessages = {
        month: 'No donations recorded this month.',
        lastMonth: 'No donations recorded last month.',
        year: 'No donations recorded this year.',
        all: 'No donation history yet.',
      };
      emptyMsg.textContent = emptyMessages[range] || emptyMessages.all;
      card.appendChild(emptyMsg);
    }
    emptyMsg.classList.remove('d-none');
    return;
  }

  canvas.classList.remove('d-none');
  if (emptyMsg) emptyMsg.classList.add('d-none');

  donationsChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        borderColor: '#5FA79A',
        backgroundColor: 'rgba(95, 167, 154, 0.15)',
        fill: true,
        tension: 0.35,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function renderStatusChart() {
  const orphanages = loadOrphanages();
  const counts = { verified: 0, pending: 0, rejected: 0, 'needs-info': 0 };

  orphanages.forEach(function (o) {
    if (counts[o.status] !== undefined) counts[o.status]++;
  });

  new Chart(document.getElementById('status-chart'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(counts).map(statusLabel),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: ['#5FA79A', '#E4C58B', '#D98C7F', '#544C7D'],
        borderWidth: 0,
      }],
    },
    options: {
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
    },
  });
}

function runGlobalSearch(query) {
  const q = query.trim().toLowerCase();
  const results = document.getElementById('global-search-results');

  if (q.length < 2) {
    results.classList.add('d-none');
    results.innerHTML = '';
    return;
  }

  const matches = [];

  loadOrphanages().forEach(function (o) {
    if ((o.name || '').toLowerCase().includes(q)) {
      matches.push({ icon: 'bi-house-heart', label: o.name, sub: 'Orphanage', href: 'verification.html?id=' + o.id });
    }
  });

  loadDonors().forEach(function (d) {
    if ((d.name || '').toLowerCase().includes(q)) {
      matches.push({ icon: 'bi-people', label: d.name, sub: 'Donor', href: 'donor-profile.html?id=' + d.id });
    }
  });

  loadPartners().forEach(function (p) {
    if ((p.name || '').toLowerCase().includes(q)) {
      matches.push({ icon: 'bi-building', label: p.name, sub: 'Partner Org', href: 'partner-profile.html?id=' + p.id });
    }
  });

  loadPrograms().forEach(function (p) {
    if ((p.name || '').toLowerCase().includes(q)) {
      matches.push({ icon: 'bi-clipboard2-pulse', label: p.name, sub: 'Program', href: 'programs.html' });
    }
  });

  loadMessages().forEach(function (m) {
    if ((m.senderName || '').toLowerCase().includes(q) || (m.subject || '').toLowerCase().includes(q)) {
      matches.push({ icon: 'bi-chat-dots', label: m.subject, sub: 'Message from ' + m.senderName, href: 'messages.html?id=' + m.id });
    }
  });

  const orphanages = loadOrphanages();
  loadNeeds().forEach(function (n) {
    if ((n.title || '').toLowerCase().includes(q)) {
      const orphanage = orphanages.find(function (o) { return String(o.id) === String(n.orphanageId); });
      matches.push({ icon: 'bi-clipboard-plus', label: n.title, sub: 'Need — ' + (orphanage ? orphanage.name : 'Unknown orphanage'), href: 'needs.html' });
    }
  });

  if (matches.length === 0) {
    results.innerHTML = '<p class="small text-muted mb-0 px-2 py-1">No results found.</p>';
  } else {
    results.innerHTML = matches.slice(0, 15).map(function (m) {
      return (
        '<a href="' + m.href + '" class="dashboard-search-result-item">' +
          '<i class="bi ' + m.icon + ' me-2"></i>' +
          '<strong class="small">' + escapeHtml(m.label) + '</strong>' +
          '<span class="small text-muted ms-2">' + escapeHtml(m.sub) + '</span>' +
        '</a>'
      );
    }).join('');
  }

  results.classList.remove('d-none');
}

document.getElementById('global-search-input').addEventListener('input', function (e) {
  runGlobalSearch(e.target.value);
});

document.addEventListener('click', function (e) {
  if (!e.target.closest('#global-search-input') && !e.target.closest('#global-search-results')) {
    document.getElementById('global-search-results').classList.add('d-none');
  }
});

document.querySelectorAll('.logout-link').forEach(function (link) {
  link.addEventListener('click', function () {
    localStorage.removeItem('currentAdminEmail');
    localStorage.removeItem('currentAdminRole');
    localStorage.removeItem('currentAdminDisplayName');
    localStorage.removeItem('adminToken');
  });
});

document.getElementById('sidebar-toggle-btn').addEventListener('click', function () {
  document.getElementById('dashboard-sidebar').classList.toggle('show');
});

document.getElementById('donations-range-select').addEventListener('change', function (e) {
  renderDonationsChart(e.target.value);
});

applyRolePermissions();
renderTopbar();
renderStatCards();
renderRecentDonations();
renderRecentMessages();
renderDonationsChart(document.getElementById('donations-range-select').value);
renderStatusChart();
