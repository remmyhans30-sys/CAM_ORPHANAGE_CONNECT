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

function anniversaryText(joinDate) {
  const months = monthsSince(joinDate);
  if (months < 24) return months + ' month' + (months === 1 ? '' : 's') + ' as a donor';
  const years = Math.floor(months / 12);
  return years + ' year' + (years === 1 ? '' : 's') + ' as a donor';
}

function renderHeaderCard(donor) {
  const card = document.getElementById('donor-header-card');

  card.innerHTML =
    '<div class="d-flex flex-wrap gap-4 align-items-start">' +
      '<div class="avatar' + (donor.photoUrl ? ' has-photo' : '') + '" style="width:96px;height:96px; flex-shrink:0;">' +
        (donor.photoUrl ? '<img src="' + encodeURI(donor.photoUrl) + '" alt="">' : initials(donor.name)) +
      '</div>' +
      '<div class="flex-grow-1">' +
        '<div class="d-flex align-items-center gap-2 flex-wrap mb-1">' +
          '<h2 class="h4 mb-0">' + escapeHtml(donor.name) + '</h2>' +
          (donor.vip ? '<span class="vip-tag">VIP</span>' : '') +
          '<span class="donor-status-badge status-' + donor.status + '">' + (donor.status === 'flagged' ? 'Flagged' : 'Active') + '</span>' +
        '</div>' +
        '<p class="text-muted small mb-3">' + escapeHtml(anniversaryText(donor.joinDate)) + '</p>' +
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
