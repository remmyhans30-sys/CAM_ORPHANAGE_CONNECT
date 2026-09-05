function loadDonor() {
  return JSON.parse(localStorage.getItem('donor') || 'null');
}

function saveDonor(donor) {
  localStorage.setItem('donor', JSON.stringify(donor));
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

function monthsSince(dateStr) {
  const then = new Date(dateStr);
  const now = new Date();
  let months = (now.getFullYear() - then.getFullYear()) * 12 + (now.getMonth() - then.getMonth());
  if (now.getDate() < then.getDate()) months--;
  return Math.max(0, months);
}

function formatFcfa(amount) {
  return Number(amount || 0).toLocaleString('en-US') + ' FCFA';
}

function anniversaryText(joinDate) {
  const months = monthsSince(joinDate);
  if (months < 24) return months + ' month' + (months === 1 ? '' : 's') + ' as a donor';
  const years = Math.floor(months / 12);
  return years + ' year' + (years === 1 ? '' : 's') + ' as a donor';
}

function anniversaryMarker(joinDate) {
  return '\u{1F389} ' + anniversaryText(joinDate);
}

function renderHeaderCard(donor) {
  const card = document.getElementById('donor-header-card');

  card.innerHTML =
    '<div class="d-flex flex-wrap gap-4 align-items-start">' +
      '<div class="avatar donor-avatar' + (donor.photoUrl ? ' has-photo' : '') + '" style="width:96px;height:96px; flex-shrink:0;">' +
        (donor.photoUrl ? '<img src="' + encodeURI(donor.photoUrl) + '" alt="">' : initials(donor.name)) +
      '</div>' +
      '<div class="flex-grow-1">' +
        '<div class="d-flex align-items-center gap-2 flex-wrap mb-1">' +
          '<h2 class="h4 mb-0">' + escapeHtml(donor.name) + '</h2>' +
          (donor.vip ? '<span class="vip-tag">VIP</span>' : '') +
          '<span class="donor-status-badge status-' + donor.status + '">' + (donor.status === 'flagged' ? 'Flagged' : 'Active') + '</span>' +
        '</div>' +
        '<p class="text-muted small mb-3">' + escapeHtml(anniversaryMarker(donor.joinDate)) + '</p>' +
        '<dl class="row mb-0 small">' +
          '<dt class="col-sm-3">Email</dt><dd class="col-sm-9">' + escapeHtml(donor.email || '&mdash;') + '</dd>' +
          '<dt class="col-sm-3">Joined</dt><dd class="col-sm-9">' + escapeHtml(donor.joinDate || '&mdash;') + '</dd>' +
          '<dt class="col-sm-3">Location</dt><dd class="col-sm-9">' + escapeHtml(donor.location || '&mdash;') + '</dd>' +
          '<dt class="col-sm-3">Preferred payment</dt><dd class="col-sm-9">' + escapeHtml(donor.preferredPayment || '&mdash;') + ' (' + escapeHtml(donor.preferredCurrency || '&mdash;') + ')</dd>' +
          '<dt class="col-sm-3">Last active</dt><dd class="col-sm-9">' + escapeHtml(donor.lastActive || '&mdash;') + '</dd>' +
        '</dl>' +
      '</div>' +
    '</div>';
}

function renderStatsStrip(donor) {
  const strip = document.getElementById('donor-stats-strip');
  const stats = [
    { label: 'Total given', value: formatFcfa(donor.totalGiven) },
    { label: 'Donations made', value: donor.donationsCount || 0 },
    { label: 'Homes followed', value: donor.homesFollowedCount || 0 },
    { label: 'Active recurring gifts', value: donor.activeRecurringGifts || 0 },
    { label: 'Chargebacks/disputes', value: donor.chargebacksCount || 0 },
  ];

  strip.innerHTML = stats.map(function (stat) {
    return (
      '<div class="col-6 col-md-4 col-lg">' +
        '<div class="stat-tile">' +
          '<strong>' + escapeHtml(String(stat.value)) + '</strong>' +
          '<span>' + escapeHtml(stat.label) + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function renderDonationHistory(donor) {
  const tbody = document.getElementById('donation-history-tbody');
  const donations = donor.donations || [];

  if (donations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-muted small">No donations recorded yet.</td></tr>';
    return;
  }

  tbody.innerHTML = donations.map(function (d) {
    return (
      '<tr>' +
        '<td>' + escapeHtml(d.date) + '</td>' +
        '<td>' + escapeHtml(d.orphanage) + '</td>' +
        '<td>' + escapeHtml(d.need) + '</td>' +
        '<td>' + formatFcfa(d.amount) + '</td>' +
        '<td>' + escapeHtml(d.method) + '</td>' +
        '<td><span class="donor-status-badge status-' + (d.status === 'completed' ? 'active' : 'flagged') + '">' + escapeHtml(d.status.charAt(0).toUpperCase() + d.status.slice(1)) + '</span></td>' +
      '</tr>'
    );
  }).join('');
}

function render() {
  const donor = loadDonor();
  const emptyState = document.getElementById('empty-state');
  const content = document.getElementById('donor-content');

  if (!donor) {
    emptyState.classList.remove('d-none');
    content.classList.add('d-none');
    return;
  }

  emptyState.classList.add('d-none');
  content.classList.remove('d-none');
  renderHeaderCard(donor);
  renderStatsStrip(donor);
  renderDonationHistory(donor);
}

function seedSampleData() {
  const sampleDonor = {
    id: 1,
    name: 'Ngozi Adeyemi',
    email: 'ngozi.adeyemi@example.com',
    joinDate: '2026-02-14',
    location: 'Douala, Cameroon',
    preferredPayment: 'MTN Mobile Money',
    preferredCurrency: 'FCFA',
    lastActive: '2026-09-01',
    vip: true,
    status: 'active',
    totalGiven: 850000,
    donationsCount: 14,
    homesFollowedCount: 3,
    activeRecurringGifts: 2,
    chargebacksCount: 0,
    donations: [
      { date: '2026-08-15', orphanage: "Hope Children's Home", need: 'New dormitory beds', amount: 60000, method: 'MTN Mobile Money', status: 'completed' },
      { date: '2026-07-20', orphanage: 'Grace Orphanage', need: 'Kitchen renovation', amount: 100000, method: 'MTN Mobile Money', status: 'completed' },
      { date: '2026-06-10', orphanage: "Hope Children's Home", need: 'School fees for 10 children', amount: 45000, method: 'Bank transfer', status: 'refunded' },
      { date: '2026-05-02', orphanage: "Foyer de l'Espérance", need: 'Fournitures scolaires', amount: 30000, method: 'MTN Mobile Money', status: 'completed' },
    ],
  };

  saveDonor(sampleDonor);
  render();
}

function clearAllData() {
  if (!confirm('Clear donor data? This cannot be undone.')) return;
  localStorage.removeItem('donor');
  render();
}

document.getElementById('seed-btn').addEventListener('click', seedSampleData);
document.getElementById('clear-btn').addEventListener('click', clearAllData);

render();
