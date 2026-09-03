const STATUSES = ['pending', 'verified', 'rejected'];

function loadOrphanages() {
  return JSON.parse(localStorage.getItem('orphanages') || '[]');
}

function saveOrphanages(orphanages) {
  localStorage.setItem('orphanages', JSON.stringify(orphanages));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function render() {
  const orphanages = loadOrphanages();
  const columns = document.getElementById('queue-columns');
  const emptyState = document.getElementById('empty-state');

  if (orphanages.length === 0) {
    columns.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  columns.classList.remove('d-none');
  emptyState.classList.add('d-none');

  STATUSES.forEach(function (status) {
    const col = document.getElementById('col-' + status);
    col.innerHTML = '';

    const inColumn = orphanages.filter(function (o) { return o.status === status; });

    if (inColumn.length === 0) {
      col.innerHTML = '<p class="text-muted small">Nothing here.</p>';
      return;
    }

    inColumn.forEach(function (orphanage) {
      const card = document.createElement('div');
      card.className = 'queue-card';
      card.dataset.id = orphanage.id;

      const moveButtons = STATUSES
        .filter(function (s) { return s !== status; })
        .map(function (s) {
          return '<button class="btn btn-admin-outline btn-sm move-btn" data-target="' + s + '">Mark ' + statusLabel(s) + '</button>';
        })
        .join('');

      card.innerHTML =
        '<h3>' + escapeHtml(orphanage.name) + '</h3>' +
        '<p class="text-muted small mb-0">' + escapeHtml(orphanage.location) + '</p>' +
        '<div class="queue-actions">' + moveButtons + '</div>';

      col.appendChild(card);
    });
  });
}

document.getElementById('queue-columns').addEventListener('click', function (e) {
  if (!e.target.classList.contains('move-btn')) return;

  const card = e.target.closest('.queue-card');
  const id = Number(card.dataset.id);
  const targetStatus = e.target.dataset.target;

  const orphanages = loadOrphanages();
  const orphanage = orphanages.find(function (o) { return o.id === id; });
  if (!orphanage) return;

  orphanage.status = targetStatus;
  saveOrphanages(orphanages);
  render();
});

render();
