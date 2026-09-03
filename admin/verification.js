const COVER_CLASSES = ['p1', 'p2', 'p3', 'p4', 'p5'];
const CHECK_SVG = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.5 12L13 4.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function loadOrphanages() {
  return JSON.parse(localStorage.getItem('orphanages') || '[]');
}

function saveOrphanages(orphanages) {
  localStorage.setItem('orphanages', JSON.stringify(orphanages));
}

function loadNeeds() {
  return JSON.parse(localStorage.getItem('needs') || '[]');
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

function render() {
  const orphanages = loadOrphanages();
  const needs = loadNeeds();
  const grid = document.getElementById('profile-grid');
  const emptyState = document.getElementById('empty-state');

  grid.innerHTML = '';

  if (orphanages.length === 0) {
    grid.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  grid.classList.remove('d-none');
  emptyState.classList.add('d-none');

  orphanages.forEach(function (orphanage, index) {
    const orphanageNeeds = needs.filter(function (n) { return String(n.orphanageId) === String(orphanage.id); });
    const raised = orphanageNeeds.reduce(function (sum, n) { return sum + Number(n.raised || 0); }, 0);
    const coverClass = COVER_CLASSES[index % COVER_CLASSES.length];
    const isVerified = orphanage.status === 'verified';
    const isPending = orphanage.status === 'pending';

    const col = document.createElement('div');
    col.className = 'col-md-6 col-lg-4';
    col.dataset.id = orphanage.id;

    const actions = isPending
      ? '<button class="btn btn-admin-primary btn-sm approve-btn">Approve</button>' +
        '<button class="btn btn-admin-danger btn-sm reject-btn">Reject</button>'
      : '<button class="btn btn-admin-outline btn-sm view-btn">View full profile</button>';

    col.innerHTML =
      '<div class="profile-card">' +
        '<div class="profile-cover ' + coverClass + '">' +
          '<span class="profile-status-chip status-' + orphanage.status + '">' + orphanage.status + '</span>' +
        '</div>' +
        '<div class="profile-body">' +
          '<div class="avatar-wrap">' +
            '<div class="avatar">' + initials(orphanage.name) + '</div>' +
            (isVerified ? '<span class="verify-badge" title="Verified">' + CHECK_SVG + '</span>' : '') +
          '</div>' +
          '<h3 class="profile-name">' +
            '<span>' + escapeHtml(orphanage.name) + '</span>' +
            (isVerified ? '<span class="verify-check-inline" title="Verified">' + CHECK_SVG + '</span>' : '') +
          '</h3>' +
          '<p class="profile-location">' + escapeHtml(orphanage.location) + '</p>' +
          '<div class="profile-stats">' +
            '<div class="stat"><strong>' + (orphanage.childrenCount || 0) + '</strong><span>Children</span></div>' +
            '<div class="stat"><strong>' + orphanageNeeds.length + '</strong><span>Active needs</span></div>' +
            '<div class="stat"><strong>' + formatFcfa(raised) + '</strong><span>Raised</span></div>' +
          '</div>' +
          '<div class="profile-actions">' + actions + '</div>' +
        '</div>' +
      '</div>';

    grid.appendChild(col);
  });
}

document.getElementById('profile-grid').addEventListener('click', function (e) {
  const col = e.target.closest('[data-id]');
  if (!col) return;
  const id = Number(col.dataset.id);
  const orphanages = loadOrphanages();
  const orphanage = orphanages.find(function (o) { return o.id === id; });
  if (!orphanage) return;

  if (e.target.classList.contains('approve-btn')) {
    orphanage.status = 'verified';
    saveOrphanages(orphanages);
    render();
  }

  if (e.target.classList.contains('reject-btn')) {
    orphanage.status = 'rejected';
    saveOrphanages(orphanages);
    render();
  }

  if (e.target.classList.contains('view-btn')) {
    alert('Full profile view coming soon.');
  }
});

render();
