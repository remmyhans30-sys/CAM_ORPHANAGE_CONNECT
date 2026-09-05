function loadDonors() {
  return JSON.parse(localStorage.getItem('donors') || '[]');
}

function saveDonors(donors) {
  localStorage.setItem('donors', JSON.stringify(donors));
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

function render() {
  const donors = loadDonors();
  const grid = document.getElementById('donors-grid');
  const emptyState = document.getElementById('empty-state');

  grid.innerHTML = '';

  if (donors.length === 0) {
    grid.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  grid.classList.remove('d-none');
  emptyState.classList.add('d-none');

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
            '<span class="donor-status-badge status-' + donor.status + '">' + (donor.status === 'flagged' ? 'Flagged' : 'Active') + '</span>' +
            (donor.vip ? ' <span class="vip-tag">&#9733; VIP</span>' : '') +
          '</div>' +
        '</div>' +
        '<p class="text-muted small mb-1">' + escapeHtml(donor.email || '') + '</p>' +
        '<p class="text-muted small mb-3">' + escapeHtml(donor.location || '') + '</p>' +
        '<a href="donor-profile.html?id=' + encodeURIComponent(donor.id) + '" class="btn btn-admin-primary btn-sm mt-auto">Review profile</a>' +
      '</div>';

    grid.appendChild(col);
  });
}

function seedSampleData() {
  const sampleDonors = [
    {
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
      passwordResets: [
        { date: '2026-07-02', method: 'Email link', status: 'completed' },
        { date: '2026-04-18', method: 'Email link', status: 'expired' },
      ],
      failedPayments: [
        { date: '2026-08-01', amount: 60000, method: 'MTN Mobile Money', reason: 'Insufficient funds' },
        { date: '2026-06-09', amount: 45000, method: 'Bank transfer', reason: 'Card declined' },
      ],
      supportTickets: [
        { date: '2026-08-16', issue: "Donation didn't show as completed", status: 'resolved' },
        { date: '2026-09-02', issue: 'Asking how to update payment method', status: 'open' },
      ],
      referredBy: 'Amina Njoya',
      referralsMade: [
        { name: 'Chidi Okafor', active: true },
        { name: 'Fatou Bello', active: false },
      ],
      homesFollowed: [
        { name: "Hope Children's Home", tier: 'Champion' },
        { name: 'Grace Orphanage', tier: 'Sustainer' },
        { name: "Foyer de l'Espérance", tier: 'Friend' },
      ],
      groupsJoined: ['Cameroon Diaspora Paris', 'Douala Alumni Giving Circle'],
    },
    {
      id: 2,
      name: 'Marc Dubois',
      email: 'marc.dubois@example.com',
      joinDate: '2026-05-10',
      location: 'Lyon, France',
      preferredPayment: 'Card',
      preferredCurrency: 'EUR',
      lastActive: '2026-08-20',
      vip: false,
      status: 'flagged',
      flagReason: 'Multiple failed payment attempts in a short period.',
      totalGiven: 40000,
      donationsCount: 2,
      homesFollowedCount: 1,
      activeRecurringGifts: 0,
      chargebacksCount: 1,
      donations: [
        { date: '2026-07-01', orphanage: 'Grace Orphanage', need: 'Kitchen renovation', amount: 20000, method: 'Card', status: 'completed' },
      ],
      passwordResets: [],
      failedPayments: [
        { date: '2026-08-05', amount: 20000, method: 'Card', reason: 'Card declined' },
        { date: '2026-08-06', amount: 20000, method: 'Card', reason: 'Card declined' },
        { date: '2026-08-07', amount: 20000, method: 'Card', reason: 'Card declined' },
      ],
      supportTickets: [],
      referredBy: '',
      referralsMade: [],
      homesFollowed: [{ name: 'Grace Orphanage', tier: 'Friend' }],
      groupsJoined: [],
    },
    {
      id: 3,
      name: 'Achu Peter',
      email: 'achu.peter@example.com',
      joinDate: '2026-08-01',
      location: 'Bamenda, Cameroon',
      preferredPayment: 'Orange Money',
      preferredCurrency: 'FCFA',
      lastActive: '2026-09-03',
      vip: false,
      status: 'active',
      totalGiven: 15000,
      donationsCount: 1,
      homesFollowedCount: 1,
      activeRecurringGifts: 0,
      chargebacksCount: 0,
      donations: [
        { date: '2026-08-10', orphanage: 'Grace Orphanage', need: 'Kitchen renovation', amount: 15000, method: 'Orange Money', status: 'completed' },
      ],
      passwordResets: [],
      failedPayments: [],
      supportTickets: [],
      referredBy: '',
      referralsMade: [],
      homesFollowed: [{ name: 'Grace Orphanage', tier: 'Friend' }],
      groupsJoined: [],
    },
  ];

  saveDonors(sampleDonors);
  render();
}

function clearAllData() {
  if (!confirm('Clear all donor data? This cannot be undone.')) return;
  localStorage.removeItem('donors');
  render();
}

document.getElementById('seed-btn').addEventListener('click', seedSampleData);
document.getElementById('clear-btn').addEventListener('click', clearAllData);

render();
