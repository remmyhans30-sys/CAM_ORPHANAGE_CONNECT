if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

const ROW_GRADIENTS = ['g1', 'g2', 'g3', 'g4', 'g5'];
const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

let activeTab = 'orphanages';

function loadOrphanages() {
  return JSON.parse(localStorage.getItem('orphanages') || '[]');
}

function loadNeeds() {
  return JSON.parse(localStorage.getItem('needs') || '[]');
}

function loadDonors() {
  return JSON.parse(localStorage.getItem('donors') || '[]');
}

function loadPartners() {
  return JSON.parse(localStorage.getItem('partners') || '[]');
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

function statusBadge(status) {
  const label = status === 'needs-info' ? 'Needs info' : status.charAt(0).toUpperCase() + status.slice(1);
  return '<span class="status-badge status-' + status + '">' + escapeHtml(label) + '</span>';
}

function buildRow(opts) {
  return (
    '<a href="' + opts.href + '" class="account-row-link">' +
      '<div class="account-row d-flex align-items-center gap-3 flex-wrap">' +
        '<div class="row-avatar ' + opts.gradientClass + '">' + escapeHtml(opts.initials) + '</div>' +
        '<div class="flex-grow-1" style="min-width: 160px;">' +
          '<div class="d-flex align-items-center gap-2">' +
            '<strong>' + escapeHtml(opts.name) + '</strong>' +
            (opts.verified ? '<span class="verify-check-inline" title="Verified">' + CHECK_SVG + '</span>' : '') +
            (opts.vip ? '<span class="row-vip-star" title="VIP donor">&#9733;</span>' : '') +
          '</div>' +
          '<div class="text-muted small">' + escapeHtml(opts.subtitle) + '</div>' +
        '</div>' +
        '<div class="text-end account-row-stat">' +
          '<div class="text-muted small">' + escapeHtml(opts.stat1Label) + '</div>' +
          '<strong>' + escapeHtml(opts.stat1Value) + '</strong>' +
        '</div>' +
        '<div class="text-end account-row-stat">' +
          '<div class="text-muted small">' + escapeHtml(opts.stat2Label) + '</div>' +
          '<strong>' + escapeHtml(opts.stat2Value) + '</strong>' +
        '</div>' +
        statusBadge(opts.status) +
      '</div>' +
    '</a>'
  );
}

function matchesStatusFilter(status, filter) {
  if (filter === 'all') return status !== 'rejected';
  return status === filter;
}

function getOrphanageRows(search, statusFilter) {
  const orphanages = loadOrphanages();
  const needs = loadNeeds();

  const filtered = orphanages.filter(function (o) {
    const nameMatch = (o.name || '').toLowerCase().includes(search);
    return nameMatch && matchesStatusFilter(o.status, statusFilter);
  });

  const rows = filtered.map(function (o, i) {
    const raised = needs
      .filter(function (n) { return String(n.orphanageId) === String(o.id); })
      .reduce(function (sum, n) { return sum + Number(n.raised || 0); }, 0);

    return buildRow({
      href: 'verification.html?id=' + encodeURIComponent(o.id),
      gradientClass: ROW_GRADIENTS[i % ROW_GRADIENTS.length],
      initials: initials(o.name),
      name: o.name,
      verified: o.status === 'verified',
      vip: false,
      subtitle: o.location || '',
      stat1Label: 'Children',
      stat1Value: String(o.childrenCount || 0),
      stat2Label: 'Raised',
      stat2Value: formatFcfa(raised),
      status: o.status,
    });
  });

  return { rows: rows, total: orphanages.length };
}

function getDonorRows(search, statusFilter) {
  const donors = loadDonors();

  const filtered = donors.filter(function (d) {
    const nameMatch = (d.name || '').toLowerCase().includes(search);
    return nameMatch && matchesStatusFilter(d.status, statusFilter);
  });

  const rows = filtered.map(function (d, i) {
    return buildRow({
      href: 'donor-profile.html?id=' + encodeURIComponent(d.id),
      gradientClass: ROW_GRADIENTS[i % ROW_GRADIENTS.length],
      initials: initials(d.name),
      name: d.name,
      verified: false,
      vip: Boolean(d.vip),
      subtitle: d.location || '',
      stat1Label: 'Total given',
      stat1Value: formatFcfa(d.totalGiven),
      stat2Label: 'Donations',
      stat2Value: String(d.donationsCount || 0),
      status: d.status,
    });
  });

  return { rows: rows, total: donors.length };
}

function getPartnerRows(search, statusFilter) {
  const partners = loadPartners();

  const filtered = partners.filter(function (p) {
    const nameMatch = (p.name || '').toLowerCase().includes(search);
    return nameMatch && matchesStatusFilter(p.verificationStatus, statusFilter);
  });

  const rows = filtered.map(function (p, i) {
    return buildRow({
      href: 'partner-profile.html?id=' + encodeURIComponent(p.id),
      gradientClass: ROW_GRADIENTS[i % ROW_GRADIENTS.length],
      initials: initials(p.name),
      name: p.name,
      verified: p.verificationStatus === 'verified',
      vip: false,
      subtitle: (p.orgType || '') + ' · ' + (p.country || ''),
      stat1Label: 'Sponsored',
      stat1Value: String((p.orphanagesSponsored || []).length),
      stat2Label: 'Contributed',
      stat2Value: formatFcfa(p.totalContributed),
      status: p.verificationStatus,
    });
  });

  return { rows: rows, total: partners.length };
}

function render() {
  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const statusFilter = document.getElementById('status-filter').value;

  const orphanageData = getOrphanageRows(activeTab === 'orphanages' ? search : '', activeTab === 'orphanages' ? statusFilter : 'all');
  const donorData = getDonorRows(activeTab === 'donors' ? search : '', activeTab === 'donors' ? statusFilter : 'all');
  const partnerData = getPartnerRows(activeTab === 'partners' ? search : '', activeTab === 'partners' ? statusFilter : 'all');

  document.getElementById('count-orphanages').textContent = activeTab === 'orphanages' ? orphanageData.rows.length : orphanageData.total;
  document.getElementById('count-donors').textContent = activeTab === 'donors' ? donorData.rows.length : donorData.total;
  document.getElementById('count-partners').textContent = activeTab === 'partners' ? partnerData.rows.length : partnerData.total;

  const activeData = activeTab === 'orphanages' ? orphanageData : (activeTab === 'donors' ? donorData : partnerData);

  const list = document.getElementById('accounts-list');
  const emptyState = document.getElementById('empty-state');

  if (activeData.rows.length === 0) {
    list.innerHTML = '';
    list.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  list.classList.remove('d-none');
  emptyState.classList.add('d-none');
  list.innerHTML = activeData.rows.join('');
}

document.getElementById('account-tabs').addEventListener('click', function (e) {
  const btn = e.target.closest('.filter-tab');
  if (!btn) return;
  activeTab = btn.dataset.tab;
  document.querySelectorAll('#account-tabs .filter-tab').forEach(function (b) {
    b.classList.toggle('active', b === btn);
  });
  render();
});

document.getElementById('search-input').addEventListener('input', render);
document.getElementById('status-filter').addEventListener('change', render);

render();
