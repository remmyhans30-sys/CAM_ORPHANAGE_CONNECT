function loadOrphanages() {
  return JSON.parse(localStorage.getItem('orphanages') || '[]');
}

function saveOrphanages(orphanages) {
  localStorage.setItem('orphanages', JSON.stringify(orphanages));
}

function render() {
  const orphanages = loadOrphanages();
  const tbody = document.getElementById('orphanages-tbody');
  const table = document.getElementById('orphanages-table');
  const emptyState = document.getElementById('empty-state');

  tbody.innerHTML = '';

  if (orphanages.length === 0) {
    table.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  table.classList.remove('d-none');
  emptyState.classList.add('d-none');

  orphanages.forEach(function (orphanage) {
    const row = document.createElement('tr');
    row.dataset.id = orphanage.id;
    row.innerHTML =
      '<td>' + escapeHtml(orphanage.name) + '</td>' +
      '<td>' + escapeHtml(orphanage.location) + '</td>' +
      '<td><span class="status-badge status-' + orphanage.status + '">' + orphanage.status + '</span></td>' +
      '<td class="text-end">' +
        '<button class="btn btn-admin-outline btn-sm me-2 edit-btn">Edit</button>' +
        '<button class="btn btn-admin-danger btn-sm remove-btn">Remove</button>' +
      '</td>';
    tbody.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

document.getElementById('orphanages-tbody').addEventListener('click', function (e) {
  const row = e.target.closest('tr');
  if (!row) return;
  const id = Number(row.dataset.id);
  const orphanages = loadOrphanages();
  const orphanage = orphanages.find(function (o) { return o.id === id; });
  if (!orphanage) return;

  if (e.target.classList.contains('remove-btn')) {
    if (confirm('Remove "' + orphanage.name + '"? This cannot be undone.')) {
      saveOrphanages(orphanages.filter(function (o) { return o.id !== id; }));
      render();
    }
  }

  if (e.target.classList.contains('edit-btn')) {
    const newName = prompt('Orphanage name:', orphanage.name);
    if (newName === null) return;
    const newLocation = prompt('Location:', orphanage.location);
    if (newLocation === null) return;
    const newStatus = prompt('Status (pending / verified / rejected):', orphanage.status);
    if (newStatus === null) return;

    orphanage.name = newName.trim() || orphanage.name;
    orphanage.location = newLocation.trim() || orphanage.location;
    if (['pending', 'verified', 'rejected'].includes(newStatus.trim().toLowerCase())) {
      orphanage.status = newStatus.trim().toLowerCase();
    }

    saveOrphanages(orphanages);
    render();
  }
});

render();
