/*
 * Manage Needs (admin): add / edit / delete each orphanage's funding needs.
 * Persists via localStorage as { [orphanageId]: need[] }, seeded from the
 * sample ORPHANAGES data in ../shared/data.js. Every need this page writes
 * keeps the exact shared shape: { title, raised, goal, percent }.
 */

(function () {
  const STORAGE_KEY = 'camoc_admin_needs_v1';

  const needsBody = document.getElementById('needsBody');
  const emptyState = document.getElementById('emptyState');
  const searchInput = document.getElementById('searchInput');
  const orphanageFilter = document.getElementById('orphanageFilter');
  const statusFilter = document.getElementById('statusFilter');
  const addNeedBtn = document.getElementById('addNeedBtn');

  const needModalEl = document.getElementById('needModal');
  const needModal = new bootstrap.Modal(needModalEl);
  const needModalLabel = document.getElementById('needModalLabel');
  const needForm = document.getElementById('needForm');
  const needSubmitBtn = document.getElementById('needSubmitBtn');
  const needOrphanageIdOriginal = document.getElementById('needOrphanageIdOriginal');
  const needIndexInput = document.getElementById('needIndex');
  const needOrphanage = document.getElementById('needOrphanage');
  const needTitle = document.getElementById('needTitle');
  const needRaised = document.getElementById('needRaised');
  const needGoal = document.getElementById('needGoal');

  let needsMap = {}; // { orphanageId: [ {title, raised, goal, percent}, ... ] }

  function loadNeedsMap() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        // fall through to reseed on corrupt data
      }
    }
    const seed = {};
    getOrphanages().forEach(function (o) {
      seed[o.id] = o.needs.map(function (n) { return Object.assign({}, n); });
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  function saveNeedsMap() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(needsMap));
  }

  function orphanageName(id) {
    const o = getOrphanageById(id);
    return o ? o.name : 'Unknown orphanage';
  }

  function populateOrphanageOptions() {
    getOrphanages().forEach(function (o) {
      const filterOpt = document.createElement('option');
      filterOpt.value = o.id;
      filterOpt.textContent = o.name;
      orphanageFilter.appendChild(filterOpt);

      const formOpt = document.createElement('option');
      formOpt.value = o.id;
      formOpt.textContent = o.name;
      needOrphanage.appendChild(formOpt);
    });
  }

  function formatXAF(amount) {
    return amount.toLocaleString('en-US') + ' XAF';
  }

  function flattenNeeds() {
    const rows = [];
    Object.keys(needsMap).forEach(function (orphanageId) {
      needsMap[orphanageId].forEach(function (need, index) {
        rows.push({ orphanageId: orphanageId, index: index, need: need });
      });
    });
    return rows;
  }

  function statusKey(pct) {
    if (pct >= 100) return 'funded';
    if (pct > 0) return 'in-progress';
    return 'not-started';
  }

  function matchesFilters(row) {
    const query = searchInput.value.trim().toLowerCase();
    if (query && !row.need.title.toLowerCase().includes(query)) return false;
    if (orphanageFilter.value && row.orphanageId !== orphanageFilter.value) return false;
    if (statusFilter.value && statusKey(row.need.percent) !== statusFilter.value) return false;
    return true;
  }

  function rowHtml(row) {
    const pct = Math.max(0, Math.min(100, row.need.percent));
    const funded = pct >= 100;
    return (
      '<tr>' +
        '<td><span class="row-name">' + row.need.title + '</span></td>' +
        '<td>' + orphanageName(row.orphanageId) + '</td>' +
        '<td>' + formatXAF(row.need.raised) + '</td>' +
        '<td>' + formatXAF(row.need.goal) + '</td>' +
        '<td>' +
          '<div class="mini-progress">' +
            '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
              '<div class="progress-bar' + (funded ? ' is-funded' : '') + '" style="width:' + pct + '%"></div>' +
            '</div>' +
            '<span class="mini-progress-pct">' + pct + '%</span>' +
          '</div>' +
        '</td>' +
        '<td>' +
          '<button type="button" class="btn-row-action btn-row-edit edit-btn" data-orphanage-id="' + row.orphanageId + '" data-index="' + row.index + '">Edit</button>' +
          '<button type="button" class="btn-row-action btn-row-delete delete-btn" data-orphanage-id="' + row.orphanageId + '" data-index="' + row.index + '">Delete</button>' +
        '</td>' +
      '</tr>'
    );
  }

  function render() {
    const visible = flattenNeeds().filter(matchesFilters);
    needsBody.innerHTML = visible.map(rowHtml).join('');
    emptyState.classList.toggle('d-none', visible.length > 0);
  }

  function openAddModal() {
    needForm.reset();
    needOrphanageIdOriginal.value = '';
    needIndexInput.value = '';
    needModalLabel.textContent = 'Add need';
    needSubmitBtn.textContent = 'Add need';
    needModal.show();
  }

  function openEditModal(orphanageId, index) {
    const need = needsMap[orphanageId] && needsMap[orphanageId][index];
    if (!need) return;

    needOrphanageIdOriginal.value = orphanageId;
    needIndexInput.value = index;
    needOrphanage.value = orphanageId;
    needTitle.value = need.title;
    needRaised.value = need.raised;
    needGoal.value = need.goal;

    needModalLabel.textContent = 'Edit need';
    needSubmitBtn.textContent = 'Save changes';
    needModal.show();
  }

  function handleSubmit(e) {
    e.preventDefault();

    const title = needTitle.value.trim();
    const raised = Number(needRaised.value);
    const goal = Number(needGoal.value);
    const targetOrphanageId = needOrphanage.value;

    if (!title || !targetOrphanageId || !goal) return;

    const need = {
      title: title,
      raised: raised,
      goal: goal,
      percent: Math.max(0, Math.min(100, Math.round((raised / goal) * 100)))
    };

    const originalOrphanageId = needOrphanageIdOriginal.value;
    const index = needIndexInput.value;

    if (originalOrphanageId !== '' && index !== '') {
      // Editing: remove from the old orphanage's list (in case it moved) then insert.
      needsMap[originalOrphanageId].splice(Number(index), 1);
      needsMap[targetOrphanageId] = needsMap[targetOrphanageId] || [];
      needsMap[targetOrphanageId].push(need);
    } else {
      needsMap[targetOrphanageId] = needsMap[targetOrphanageId] || [];
      needsMap[targetOrphanageId].push(need);
    }

    saveNeedsMap();
    render();
    needModal.hide();
  }

  function handleDelete(orphanageId, index) {
    const need = needsMap[orphanageId] && needsMap[orphanageId][index];
    if (!need) return;
    if (!window.confirm('Delete "' + need.title + '"? This cannot be undone.')) return;

    needsMap[orphanageId].splice(index, 1);
    saveNeedsMap();
    render();
  }

  needsBody.addEventListener('click', function (e) {
    const editBtn = e.target.closest('.edit-btn');
    if (editBtn) { openEditModal(editBtn.dataset.orphanageId, Number(editBtn.dataset.index)); return; }

    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) { handleDelete(deleteBtn.dataset.orphanageId, Number(deleteBtn.dataset.index)); }
  });

  addNeedBtn.addEventListener('click', openAddModal);
  needForm.addEventListener('submit', handleSubmit);
  searchInput.addEventListener('input', render);
  orphanageFilter.addEventListener('change', render);
  statusFilter.addEventListener('change', render);

  populateOrphanageOptions();
  needsMap = loadNeedsMap();
  render();
})();
