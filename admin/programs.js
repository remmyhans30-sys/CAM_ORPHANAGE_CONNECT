if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

function loadPrograms() { return JSON.parse(localStorage.getItem('programs') || '[]'); }
function savePrograms(programs) { localStorage.setItem('programs', JSON.stringify(programs)); }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatFcfa(amount) {
  return Number(amount || 0).toLocaleString('en-US') + ' FCFA';
}

function statusBadgeClass(status) {
  if (status === 'active') return 'status-verified';
  if (status === 'planned') return 'status-pending';
  return 'status-rejected';
}

function renderStats(programs) {
  const active = programs.filter(function (p) { return p.status === 'active'; }).length;
  const completed = programs.filter(function (p) { return p.status === 'completed'; }).length;
  const totalGoal = programs.reduce(function (sum, p) { return sum + Number(p.fundingGoal || 0); }, 0);

  const cards = [
    { label: 'Total Programs', value: String(programs.length) },
    { label: 'Active Programs', value: String(active) },
    { label: 'Completed Programs', value: String(completed) },
    { label: 'Total Funding Goal', value: formatFcfa(totalGoal) },
  ];

  document.getElementById('program-stats').innerHTML = cards.map(function (c) {
    return (
      '<div class="col-6 col-lg-3">' +
        '<div class="stat-tile">' +
          '<strong>' + escapeHtml(c.value) + '</strong>' +
          '<span>' + escapeHtml(c.label) + '</span>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function render() {
  const allPrograms = loadPrograms();
  const grid = document.getElementById('programs-grid');
  const emptyState = document.getElementById('empty-state');
  const filterEmptyState = document.getElementById('filter-empty-state');

  grid.innerHTML = '';
  renderStats(allPrograms);

  if (allPrograms.length === 0) {
    grid.classList.add('d-none');
    filterEmptyState.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  emptyState.classList.add('d-none');

  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const categoryFilter = document.getElementById('category-filter').value;
  const statusFilter = document.getElementById('status-filter').value;

  const programs = allPrograms.filter(function (p) {
    const matchesSearch = !search || (p.name || '').toLowerCase().includes(search);
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  if (programs.length === 0) {
    grid.classList.add('d-none');
    filterEmptyState.classList.remove('d-none');
    return;
  }

  grid.classList.remove('d-none');
  filterEmptyState.classList.add('d-none');

  grid.innerHTML = programs.map(function (p) {
    const goal = Number(p.fundingGoal || 0);
    const raised = Number(p.amountRaised || 0);
    const percent = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

    return (
      '<div class="col-md-6 col-lg-4">' +
        '<div class="card card-admin p-4 h-100">' +
          '<div class="d-flex justify-content-between align-items-start mb-2">' +
            '<h3 class="h6 mb-0">' + escapeHtml(p.name) + '</h3>' +
            '<span class="status-badge ' + statusBadgeClass(p.status) + '">' + escapeHtml(p.status.charAt(0).toUpperCase() + p.status.slice(1)) + '</span>' +
          '</div>' +
          '<span class="tier-tag tier-friend mb-2" style="width: fit-content;">' + escapeHtml(p.category) + '</span>' +
          '<p class="text-muted small mb-2 mt-2">' + escapeHtml(p.description || 'No description provided.') + '</p>' +
          (p.objectives ? '<p class="small mb-1"><strong>Objectives:</strong> ' + escapeHtml(p.objectives) + '</p>' : '') +
          (p.activities ? '<p class="small mb-2"><strong>Activities:</strong> ' + escapeHtml(p.activities) + '</p>' : '') +
          (goal > 0
            ? '<div class="progress finance-progress mb-1"><div class="progress-bar" style="width: ' + percent + '%"></div></div>' +
              '<p class="small text-muted mb-2">' + formatFcfa(raised) + ' of ' + formatFcfa(goal) + ' (' + percent + '%)</p>'
            : '') +
          (p.childrenBenefiting ? '<p class="small text-muted mb-0">' + p.childrenBenefiting + ' children benefiting</p>' : '') +
          '<div class="d-flex gap-2 mt-3">' +
            '<button type="button" class="btn btn-admin-outline btn-sm edit-program-btn" data-id="' + p.id + '">Edit</button>' +
            '<button type="button" class="btn btn-admin-danger btn-sm delete-program-btn" data-id="' + p.id + '">Delete</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function seedSampleData() {
  const samplePrograms = [
    { id: 1, name: 'Back to School Support', category: 'Education', status: 'active', description: 'Covers school fees, uniforms, and supplies for children across partner orphanages each new academic year.', fundingGoal: 2000000, amountRaised: 850000, childrenBenefiting: 120 },
    { id: 2, name: 'Community Health Checkups', category: 'Health', status: 'active', description: 'Quarterly visits from partner clinics to screen and treat common childhood illnesses.', fundingGoal: 800000, amountRaised: 800000, childrenBenefiting: 90 },
    { id: 3, name: 'Nutrition & Meal Program', category: 'Nutrition', status: 'planned', description: 'Proposed program to fund balanced daily meals at orphanages reporting food insecurity.', fundingGoal: 1200000, amountRaised: 0, childrenBenefiting: 60 },
  ];

  savePrograms(samplePrograms);
  render();
}

function clearAllData() {
  if (!confirm('Clear all programs? This cannot be undone.')) return;
  localStorage.removeItem('programs');
  render();
}

document.getElementById('seed-btn').addEventListener('click', seedSampleData);
document.getElementById('clear-btn').addEventListener('click', clearAllData);
document.getElementById('search-input').addEventListener('input', render);
document.getElementById('category-filter').addEventListener('change', render);
document.getElementById('status-filter').addEventListener('change', render);

const programModal = new bootstrap.Modal(document.getElementById('program-modal'));

document.getElementById('add-program-btn').addEventListener('click', function () {
  document.getElementById('program-form').reset();
  document.getElementById('program-id').value = '';
  document.getElementById('program-modal-title').textContent = 'Add Program';
  programModal.show();
});

document.getElementById('programs-grid').addEventListener('click', function (e) {
  const id = Number(e.target.dataset.id);
  if (!id) return;
  const programs = loadPrograms();

  if (e.target.classList.contains('edit-program-btn')) {
    const p = programs.find(function (x) { return x.id === id; });
    if (!p) return;
    document.getElementById('program-id').value = p.id;
    document.getElementById('program-name').value = p.name || '';
    document.getElementById('program-category').value = p.category || 'Education';
    document.getElementById('program-status').value = p.status || 'active';
    document.getElementById('program-description').value = p.description || '';
    document.getElementById('program-funding-goal').value = p.fundingGoal || '';
    document.getElementById('program-amount-raised').value = p.amountRaised || '';
    document.getElementById('program-children').value = p.childrenBenefiting || '';
    document.getElementById('program-objectives').value = p.objectives || '';
    document.getElementById('program-activities').value = p.activities || '';
    document.getElementById('program-modal-title').textContent = 'Edit Program';
    programModal.show();
  }

  if (e.target.classList.contains('delete-program-btn')) {
    if (!confirm('Delete this program? This cannot be undone.')) return;
    savePrograms(programs.filter(function (x) { return x.id !== id; }));
    render();
  }
});

document.getElementById('program-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const programs = loadPrograms();
  const editId = document.getElementById('program-id').value;

  const data = {
    name: document.getElementById('program-name').value.trim(),
    category: document.getElementById('program-category').value,
    status: document.getElementById('program-status').value,
    description: document.getElementById('program-description').value.trim(),
    fundingGoal: Number(document.getElementById('program-funding-goal').value) || 0,
    amountRaised: Number(document.getElementById('program-amount-raised').value) || 0,
    childrenBenefiting: Number(document.getElementById('program-children').value) || 0,
    objectives: document.getElementById('program-objectives').value.trim(),
    activities: document.getElementById('program-activities').value.trim(),
  };

  if (editId) {
    const p = programs.find(function (x) { return x.id === Number(editId); });
    if (p) Object.assign(p, data);
  } else {
    data.id = Date.now();
    programs.push(data);
  }

  savePrograms(programs);
  programModal.hide();
  render();
});

render();
