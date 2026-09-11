if (!localStorage.getItem('currentAdminEmail')) { window.location.href = 'index.html'; }

function loadNeeds() { return JSON.parse(localStorage.getItem('needs') || '[]'); }
function saveNeeds(needs) { localStorage.setItem('needs', JSON.stringify(needs)); }

let orphanagesCache = [];
function loadOrphanages() { return orphanagesCache; }
function fetchOrphanagesFromApi() {
  return apiRequest('/orphanages').then(function (data) {
    orphanagesCache = data.orphanages;
  });
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

function orphanageName(orphanageId) {
  const orphanages = loadOrphanages();
  const o = orphanages.find(function (x) { return String(x.id) === String(orphanageId); });
  return o ? o.name : 'Unknown orphanage';
}

function populateOrphanageDropdowns() {
  const orphanages = loadOrphanages();

  const filterSelect = document.getElementById('orphanage-filter');
  const modalSelect = document.getElementById('need-orphanage-select');
  const hint = document.getElementById('no-orphanages-hint');

  while (filterSelect.options.length > 1) filterSelect.remove(1);
  modalSelect.innerHTML = '<option value="" disabled selected>Select an orphanage&hellip;</option>';

  if (orphanages.length === 0) {
    hint.classList.remove('d-none');
  } else {
    hint.classList.add('d-none');
  }

  orphanages.forEach(function (o) {
    const filterOption = document.createElement('option');
    filterOption.value = o.id;
    filterOption.textContent = o.name;
    filterSelect.appendChild(filterOption);

    const modalOption = document.createElement('option');
    modalOption.value = o.id;
    modalOption.textContent = o.name;
    modalSelect.appendChild(modalOption);
  });
}

function renderStats(needs) {
  const open = needs.filter(function (n) { return Number(n.raised || 0) < Number(n.goal || 0); }).length;
  const funded = needs.length - open;
  const totalGoal = needs.reduce(function (sum, n) { return sum + Number(n.goal || 0); }, 0);
  const totalRaised = needs.reduce(function (sum, n) { return sum + Number(n.raised || 0); }, 0);

  const cards = [
    { label: 'Total Needs', value: String(needs.length) },
    { label: 'Open Needs', value: String(open) },
    { label: 'Funded Needs', value: String(funded) },
    { label: 'Total Raised', value: formatFcfa(totalRaised) + ' of ' + formatFcfa(totalGoal) },
  ];

  document.getElementById('need-stats').innerHTML = cards.map(function (c) {
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
  const allNeeds = loadNeeds();
  const grid = document.getElementById('needs-grid');
  const emptyState = document.getElementById('empty-state');
  const filterEmptyState = document.getElementById('filter-empty-state');

  grid.innerHTML = '';
  renderStats(allNeeds);

  if (allNeeds.length === 0) {
    grid.classList.add('d-none');
    filterEmptyState.classList.add('d-none');
    emptyState.classList.remove('d-none');
    return;
  }

  emptyState.classList.add('d-none');

  const search = document.getElementById('search-input').value.trim().toLowerCase();
  const orphanageFilter = document.getElementById('orphanage-filter').value;
  const statusFilter = document.getElementById('status-filter').value;

  const needs = allNeeds.filter(function (n) {
    const matchesSearch = !search || (n.title || '').toLowerCase().includes(search);
    const matchesOrphanage = orphanageFilter === 'all' || String(n.orphanageId) === String(orphanageFilter);
    const isFunded = Number(n.raised || 0) >= Number(n.goal || 0);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'funded' ? isFunded : !isFunded);
    return matchesSearch && matchesOrphanage && matchesStatus;
  });

  if (needs.length === 0) {
    grid.classList.add('d-none');
    filterEmptyState.classList.remove('d-none');
    return;
  }

  grid.classList.remove('d-none');
  filterEmptyState.classList.add('d-none');

  grid.innerHTML = needs.map(function (n) {
    const goal = Number(n.goal || 0);
    const raised = Number(n.raised || 0);
    const percent = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
    const isFunded = raised >= goal && goal > 0;

    return (
      '<div class="col-md-6 col-lg-4">' +
        '<div class="card card-admin p-4 h-100">' +
          '<div class="d-flex justify-content-between align-items-start mb-2">' +
            '<h3 class="h6 mb-0">' + escapeHtml(n.title) + '</h3>' +
            '<span class="status-badge ' + (isFunded ? 'status-verified' : 'status-pending') + '">' + (isFunded ? 'Funded' : 'Open') + '</span>' +
          '</div>' +
          '<span class="tier-tag tier-friend mb-2" style="width: fit-content;">' + escapeHtml(orphanageName(n.orphanageId)) + '</span>' +
          '<div class="progress finance-progress mb-1 mt-2"><div class="progress-bar" style="width: ' + percent + '%"></div></div>' +
          '<p class="small text-muted mb-2">' + formatFcfa(raised) + ' of ' + formatFcfa(goal) + ' (' + percent + '%)</p>' +
          '<div class="d-flex gap-2 mt-3">' +
            '<button type="button" class="btn btn-admin-outline btn-sm edit-need-btn" data-id="' + n.id + '">Edit</button>' +
            '<button type="button" class="btn btn-admin-danger btn-sm delete-need-btn" data-id="' + n.id + '">Delete</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function seedSampleData() {
  const orphanages = loadOrphanages();
  if (orphanages.length === 0) {
    alert('Load or add orphanages first, then load sample needs.');
    return;
  }
  const sampleNeeds = orphanages.slice(0, 3).map(function (o, i) {
    const goal = [500000, 900000, 300000][i] || 400000;
    const raised = [200000, 900000, 50000][i] || 0;
    return { id: Date.now() + i, title: ['New dormitory beds', 'Kitchen renovation', 'School supplies'][i] || 'General support', goal: goal, raised: raised, orphanageId: o.id, date: new Date().toISOString().slice(0, 10) };
  });

  saveNeeds(sampleNeeds);
  render();
}

function clearAllData() {
  if (!confirm('Clear all needs? This cannot be undone.')) return;
  localStorage.removeItem('needs');
  render();
}

document.getElementById('seed-btn').addEventListener('click', seedSampleData);
document.getElementById('clear-btn').addEventListener('click', clearAllData);
document.getElementById('search-input').addEventListener('input', render);
document.getElementById('orphanage-filter').addEventListener('change', render);
document.getElementById('status-filter').addEventListener('change', render);

const needModal = new bootstrap.Modal(document.getElementById('need-modal'));

document.getElementById('add-need-btn').addEventListener('click', function () {
  populateOrphanageDropdowns();
  document.getElementById('need-form').reset();
  document.getElementById('need-id').value = '';
  document.getElementById('need-modal-title').textContent = 'Add Need';
  needModal.show();
});

document.getElementById('needs-grid').addEventListener('click', function (e) {
  const id = Number(e.target.dataset.id);
  if (!id) return;
  const needs = loadNeeds();

  if (e.target.classList.contains('edit-need-btn')) {
    const n = needs.find(function (x) { return x.id === id; });
    if (!n) return;
    populateOrphanageDropdowns();
    document.getElementById('need-id').value = n.id;
    document.getElementById('need-title').value = n.title || '';
    document.getElementById('need-orphanage-select').value = n.orphanageId || '';
    document.getElementById('need-goal').value = n.goal || '';
    document.getElementById('need-raised').value = n.raised || '';
    document.getElementById('need-modal-title').textContent = 'Edit Need';
    needModal.show();
  }

  if (e.target.classList.contains('delete-need-btn')) {
    if (!confirm('Delete this need? This cannot be undone.')) return;
    saveNeeds(needs.filter(function (x) { return x.id !== id; }));
    render();
  }
});

document.getElementById('need-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const needs = loadNeeds();
  const editId = document.getElementById('need-id').value;
  const goal = Number(document.getElementById('need-goal').value) || 0;
  const raised = Number(document.getElementById('need-raised').value) || 0;

  const data = {
    title: document.getElementById('need-title').value.trim(),
    orphanageId: document.getElementById('need-orphanage-select').value,
    goal: goal,
    raised: raised,
    percent: goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0,
  };

  if (editId) {
    const n = needs.find(function (x) { return x.id === Number(editId); });
    if (n) Object.assign(n, data);
  } else {
    data.id = Date.now();
    data.date = new Date().toISOString().slice(0, 10);
    needs.push(data);
  }

  saveNeeds(needs);
  needModal.hide();
  render();
});

fetchOrphanagesFromApi()
  .then(function () {
    populateOrphanageDropdowns();
    render();
  })
  .catch(function (err) {
    populateOrphanageDropdowns();
    render();
    alert('Could not load orphanages from the server: ' + err.message + '. The orphanage dropdown will be empty until the backend is reachable.');
  });
